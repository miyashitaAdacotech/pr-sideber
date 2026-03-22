import type { AuthPort } from "../../domain/ports/auth.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import type { AuthToken, DeviceCodeResponse, PollResult } from "../../domain/types/auth";
import { AuthError, isAuthToken } from "../../shared/types/auth";
import { NetworkError, RateLimitError } from "../../shared/types/errors";
import type { OAuthConfig } from "./oauth.config";

const TOKEN_STORAGE_KEY = "github_auth_token";

/** 有効期限の5分前にトークンを期限切れと見なし、早期リフレッシュを促す */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** device_code の最小長。GitHub は40文字 hex を返す */
const DEVICE_CODE_MIN_LENGTH = 8;
const DEVICE_CODE_MAX_LENGTH = 256;

/** error_description の最大長。過剰な文字列の注入を防ぐ */
const ERROR_DESCRIPTION_MAX_LENGTH = 500;

/** リフレッシュの最大試行回数 (一時的エラー時のリトライ) */
const REFRESH_MAX_ATTEMPTS = 3;

/** リトライ時の基本待機時間 (ms)。指数バックオフで 1s → 2s と増加する */
const REFRESH_BASE_DELAY_MS = 1000;

/** Retry-After の上限 (24時間)。悪意あるサーバーの巨大値を防ぐ */
const RETRY_AFTER_MAX_MS = 24 * 60 * 60 * 1000;

export class ChromeIdentityAdapter implements AuthPort {
	private cachedAuthenticated: boolean | null = null;
	private cachedExpiresAt: number | undefined = undefined;
	private refreshPromise: Promise<AuthToken | null> | null = null;
	private disposed = false;

	private readonly storageChangeListener: (
		changes: Record<string, chrome.storage.StorageChange>,
		areaName: string,
	) => void;

	constructor(
		private readonly storage: StoragePort,
		private readonly config: OAuthConfig,
	) {
		this.storageChangeListener = (changes, areaName) => {
			if (this.disposed) return;
			if (areaName !== "local") return;
			if (TOKEN_STORAGE_KEY in changes) {
				const change = changes[TOKEN_STORAGE_KEY];
				if (change.newValue !== undefined) {
					this.cachedAuthenticated = null;
					this.cachedExpiresAt = undefined; // 次回 isAuthenticated() で再取得
				} else {
					this.cachedAuthenticated = false;
					this.cachedExpiresAt = undefined;
				}
			}
		};
		chrome.storage.onChanged.addListener(this.storageChangeListener);
	}

	/** リスナーを解除しリソースを解放する。冪等であり複数回呼んでも安全 */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		chrome.storage.onChanged.removeListener(this.storageChangeListener);
	}

	async requestDeviceCode(): Promise<DeviceCodeResponse> {
		const body = new URLSearchParams({
			client_id: this.config.clientId,
			scope: this.config.scopes.join(" "),
		});

		let response: Response;
		try {
			response = await fetch(this.config.deviceCodeEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: body.toString(),
				redirect: "error",
			});
		} catch (error: unknown) {
			if (import.meta.env.DEV) {
				console.error("[identity.adapter] Device code request failed:", error);
			}
			throw new AuthError("device_code_request_failed", "Device code request failed", {
				cause: error instanceof Error ? new Error(error.message) : new Error(String(error)),
			});
		}

		if (!response.ok) {
			if (import.meta.env.DEV) {
				console.error(
					`[identity.adapter] Device code request failed: ${response.status} ${response.statusText}`,
				);
			}
			throw new AuthError("device_code_request_failed", "Device code request failed");
		}

		const data = (await response.json()) as Record<string, unknown>;
		return this.validateDeviceCodeData(data);
	}

	/**
	 * 1回分のトークン取得試行。
	 * Service Worker の30秒制限に対応するため、ループせず即座に結果を返す。
	 * ポーリングの繰り返し制御は Side Panel 側 (auth.usecase.ts) が担う。
	 */
	async pollForToken(deviceCode: string): Promise<PollResult> {
		let response: Response;
		try {
			response = await fetch(this.config.tokenEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: new URLSearchParams({
					client_id: this.config.clientId,
					device_code: deviceCode,
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				}).toString(),
				redirect: "error",
			});
		} catch (error: unknown) {
			if (import.meta.env.DEV) {
				console.error("[identity.adapter] Token polling failed:", error);
			}
			throw new AuthError("token_exchange_failed", "Token polling failed", {
				cause: error instanceof Error ? new Error(error.message) : new Error(String(error)),
			});
		}

		if (!response.ok) {
			if (import.meta.env.DEV) {
				console.error(`[identity.adapter] Token polling failed: ${response.status}`);
			}
			throw new AuthError("token_exchange_failed", "Token polling failed");
		}

		const data = (await response.json()) as Record<string, unknown>;

		if (typeof data.error === "string") {
			switch (data.error) {
				case "authorization_pending":
					return { status: "pending" };
				case "slow_down": {
					const interval = typeof data.interval === "number" ? data.interval : 10;
					return { status: "slow_down", interval };
				}
				case "expired_token":
					return { status: "expired" };
				case "access_denied":
					return { status: "denied" };
				default: {
					const raw =
						typeof data.error_description === "string" && data.error_description.length > 0
							? data.error_description
							: data.error;
					const description = this.sanitizeOAuthErrorMessage(
						typeof raw === "string" ? raw : String(raw),
					);
					if (import.meta.env.DEV) {
						console.warn("[identity.adapter] OAuth error_description:", description);
					}
					throw new AuthError("token_exchange_failed", "Token exchange failed");
				}
			}
		}

		const token = this.validateTokenData(data);
		await this.storage.set(TOKEN_STORAGE_KEY, token);
		this.cachedAuthenticated = null;
		this.cachedExpiresAt = undefined;
		return { status: "success", token };
	}

	async getToken(): Promise<AuthToken | null> {
		const token = await this.storage.get<AuthToken>(TOKEN_STORAGE_KEY, isAuthToken);
		if (token === null) return null;

		if (this.isTokenExpiredWithBuffer(token.expiresAt)) {
			// refreshToken がなければリフレッシュ不可。まだ有効期限内ならトークンを返す
			if (!token.refreshToken) {
				if (this.isTokenStillValid(token.expiresAt)) {
					return token;
				}
				await this.clearToken();
				return null;
			}

			if (!this.refreshPromise) {
				this.refreshPromise = this.performRefresh(token).finally(() => {
					this.refreshPromise = null;
				});
			}

			try {
				const refreshed = await this.refreshPromise;
				if (refreshed !== null) return refreshed;
				// 回復不能エラー (HTTP 4xx など) で null が返った場合
				if (import.meta.env.DEV) {
					console.error(
						"[identity.adapter] Refresh returned null (unrecoverable). Clearing token.",
					);
				}
				await this.clearToken();
				return null;
			} catch (error: unknown) {
				// RateLimitError は NetworkError のサブクラスなので先にチェックする
				if (error instanceof RateLimitError) {
					// 429: clearToken せずトークンを保護。再認証ループを防ぐ
					if (import.meta.env.DEV) {
						console.error("[identity.adapter] Rate limited. Not clearing token.");
					}
					if (this.isTokenStillValid(token.expiresAt)) {
						return token;
					}
					// 期限切れでも clearToken しない
					return null;
				}
				if (error instanceof NetworkError) {
					// 一時的なネットワーク障害: トークンがまだ有効期限内ならそのまま返す
					if (this.isTokenStillValid(token.expiresAt)) {
						return token;
					}
					await this.clearToken();
					return null;
				}
				throw error;
			}
		}

		return token;
	}

	async clearToken(): Promise<void> {
		await this.storage.remove(TOKEN_STORAGE_KEY);
		this.cachedAuthenticated = false;
		this.cachedExpiresAt = undefined;
	}

	async isAuthenticated(): Promise<boolean> {
		// バッファ圏内に入ったキャッシュ済みトークンは期限切れと見なす
		if (this.cachedAuthenticated === true && this.cachedExpiresAt !== undefined) {
			if (Date.now() >= this.cachedExpiresAt - TOKEN_EXPIRY_BUFFER_MS) {
				return false; // cachedAuthenticated は変更しない — 次回呼び出しでも再判定
			}
			return true;
		}

		if (this.cachedAuthenticated !== null) {
			return this.cachedAuthenticated;
		}

		const token = await this.storage.get<AuthToken>(TOKEN_STORAGE_KEY, isAuthToken);
		if (token === null) {
			this.cachedAuthenticated = false;
			return false;
		}
		if (this.isTokenExpiredWithBuffer(token.expiresAt)) {
			this.cachedAuthenticated = false;
			return false;
		}
		this.cachedAuthenticated = true;
		this.cachedExpiresAt = token.expiresAt;
		return true;
	}

	async refreshAccessToken(): Promise<AuthToken | null> {
		const token = await this.storage.get<AuthToken>(TOKEN_STORAGE_KEY, isAuthToken);
		if (!token?.refreshToken) return null;
		if (!this.refreshPromise) {
			this.refreshPromise = this.performRefresh(token).finally(() => {
				this.refreshPromise = null;
			});
		}
		return this.refreshPromise;
	}

	/**
	 * トークンリフレッシュを試行する。一時的エラー時はリトライする。
	 * - 成功: 新しい AuthToken を返す
	 * - 回復不能エラー (HTTP 4xx, バリデーション失敗): null を返す
	 * - 一時的エラーが全リトライ失敗: NetworkError を throw
	 */
	private async performRefresh(token: AuthToken): Promise<AuthToken | null> {
		if (!token.refreshToken) return null;

		let lastError: unknown;
		for (let attempt = 0; attempt < REFRESH_MAX_ATTEMPTS; attempt++) {
			if (attempt > 0) {
				const delayMs = REFRESH_BASE_DELAY_MS * 2 ** (attempt - 1);
				await this.delay(delayMs);
			}
			try {
				return await this.attemptRefreshRequest(token.refreshToken);
			} catch (error: unknown) {
				// RateLimitError は即座に投げる (リトライで Rate Limit を悪化させない)
				if (error instanceof RateLimitError) throw error;
				if (!this.isTransientError(error)) {
					if (import.meta.env.DEV) {
						console.error("[identity.adapter] Unrecoverable refresh error, not retrying:", error);
					}
					return null;
				}
				lastError = error;
			}
		}

		// 429 (RateLimitError) が原因なら RateLimitError をそのまま throw
		if (lastError instanceof RateLimitError) {
			throw lastError;
		}
		throw new NetworkError("Token refresh failed after retries", {
			cause: lastError,
		});
	}

	/** 待機関数。テスト時は vi.useFakeTimers で制御する */
	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * 1回分のリフレッシュリクエスト。
	 * - 成功: AuthToken を返す
	 * - HTTP 4xx: null を返す (回復不能)
	 * - HTTP 5xx/429: NetworkError を throw (リトライ対象)
	 * - fetch TypeError: そのまま throw (リトライ対象)
	 */
	private async attemptRefreshRequest(refreshToken: string): Promise<AuthToken | null> {
		const body = new URLSearchParams({
			grant_type: "refresh_token",
			client_id: this.config.clientId,
			refresh_token: refreshToken,
		});

		const response = await fetch(this.config.tokenEndpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: body.toString(),
			redirect: "error",
		});

		if (!response.ok) {
			if (response.status === 429) {
				const retryAfter = response.headers.get("Retry-After");
				const parsedRetryAfter = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
				const retryAfterMs =
					Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
						? Math.min(parsedRetryAfter * 1000, RETRY_AFTER_MAX_MS)
						: 60_000;
				if (import.meta.env.DEV) {
					console.error(
						`[identity.adapter] Rate limited during token refresh (429). Retry after ${retryAfterMs}ms`,
					);
				}
				throw new RateLimitError("Rate limited during token refresh", retryAfterMs);
			}
			if (response.status >= 500) {
				if (import.meta.env.DEV) {
					console.error(`[identity.adapter] Server error during token refresh: ${response.status}`);
				}
				throw new NetworkError("Server error during token refresh");
			}
			// HTTP 4xx: refresh_token が無効などの回復不能エラー
			if (import.meta.env.DEV) {
				console.error(`[identity.adapter] Unrecoverable refresh error: ${response.status}`);
			}
			return null;
		}

		const data = (await response.json()) as Record<string, unknown>;
		const newToken = this.validateTokenData(data);
		await this.storage.set(TOKEN_STORAGE_KEY, newToken);
		this.cachedAuthenticated = null;
		this.cachedExpiresAt = undefined;
		return newToken;
	}

	/** 一時的 (リトライ可能) なエラーかどうかを判定する */
	private isTransientError(error: unknown): boolean {
		// fetch の TypeError (DNS 解決失敗、接続拒否など)
		if (error instanceof TypeError) return true;
		// performRefresh 内で throw した NetworkError (5xx/429)
		if (error instanceof NetworkError) return true;
		// CDN/プロキシがHTMLエラーページを返した場合の JSON パースエラー
		if (error instanceof SyntaxError) return true;
		return false;
	}

	/** expiresAt がありバッファ圏内なら期限切れと判定する */
	private isTokenExpiredWithBuffer(expiresAt: number | undefined): boolean {
		if (expiresAt === undefined) return false;
		return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS;
	}

	/** バッファなしで有効期限内かどうかを判定する */
	private isTokenStillValid(expiresAt: number | undefined): boolean {
		if (expiresAt === undefined) return true;
		return Date.now() < expiresAt;
	}

	private validateDeviceCodeData(data: Record<string, unknown>): DeviceCodeResponse {
		if (typeof data.device_code !== "string" || !data.device_code) {
			throw new AuthError("device_code_validation_failed", "Missing device_code in response");
		}
		if (typeof data.user_code !== "string" || !data.user_code) {
			throw new AuthError("device_code_validation_failed", "Missing user_code in response");
		}
		if (typeof data.verification_uri !== "string" || !data.verification_uri) {
			throw new AuthError("device_code_validation_failed", "Missing verification_uri in response");
		}
		if (!data.verification_uri.startsWith("https://github.com/")) {
			throw new AuthError(
				"device_code_validation_failed",
				"Invalid verification_uri: must be a GitHub URL",
			);
		}
		if (typeof data.expires_in !== "number" || data.expires_in <= 0) {
			throw new AuthError("device_code_validation_failed", "Invalid expires_in in response");
		}
		if (typeof data.interval !== "number" || data.interval <= 0) {
			throw new AuthError("device_code_validation_failed", "Invalid interval in response");
		}

		if (
			data.device_code.length < DEVICE_CODE_MIN_LENGTH ||
			data.device_code.length > DEVICE_CODE_MAX_LENGTH
		) {
			throw new AuthError("device_code_validation_failed", "Invalid device_code length");
		}

		return {
			deviceCode: data.device_code,
			userCode: data.user_code,
			verificationUri: data.verification_uri,
			expiresIn: data.expires_in,
			interval: data.interval,
		};
	}

	private validateTokenData(data: Record<string, unknown>): AuthToken {
		if (typeof data.access_token !== "string" || !data.access_token) {
			throw new AuthError("token_exchange_failed", "Invalid token response: missing access_token");
		}

		const token: AuthToken = {
			accessToken: data.access_token,
			tokenType: typeof data.token_type === "string" ? data.token_type : "bearer",
			scope: typeof data.scope === "string" ? data.scope : "",
			// expires_in が 0 以下や Infinity の場合は「期限なし」として expiresAt を設定しない
			...(typeof data.expires_in === "number" &&
			Number.isFinite(data.expires_in) &&
			data.expires_in > 0
				? { expiresAt: Date.now() + data.expires_in * 1000 }
				: {}),
			...(typeof data.refresh_token === "string" ? { refreshToken: data.refresh_token } : {}),
		};
		return token;
	}

	/** HTML タグ・制御文字を除去し、長さを制限する */
	private sanitizeOAuthErrorMessage(raw: string): string {
		const noHtml = raw.replace(/<[^>]*>/g, "");
		// 制御文字のうち タブ(0x09)・LF(0x0A) のみ許容する
		// biome-ignore lint/suspicious/noControlCharactersInRegex: 制御文字除去が目的のため意図的に使用
		const noControl = noHtml.replace(/[\x00-\x08\x0B-\x1F]/g, "");
		const trimmed = noControl.trim();
		return trimmed.length > ERROR_DESCRIPTION_MAX_LENGTH
			? trimmed.slice(0, ERROR_DESCRIPTION_MAX_LENGTH)
			: trimmed;
	}
}
