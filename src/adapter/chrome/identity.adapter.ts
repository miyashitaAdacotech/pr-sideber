import type { AuthPort } from "../../domain/ports/auth.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import type { AuthToken, DeviceCodeResponse, PollResult } from "../../domain/types/auth";
import { AuthError, isAuthToken } from "../../shared/types/auth";
import type { OAuthConfig } from "./oauth.config";

const TOKEN_STORAGE_KEY = "github_auth_token";

/** device_code の最小長。GitHub は40文字 hex を返す */
const DEVICE_CODE_MIN_LENGTH = 8;
const DEVICE_CODE_MAX_LENGTH = 256;

/** error_description の最大長。過剰な文字列の注入を防ぐ */
const ERROR_DESCRIPTION_MAX_LENGTH = 500;

export class ChromeIdentityAdapter implements AuthPort {
	private cachedAuthenticated: boolean | null = null;

	constructor(
		private readonly storage: StoragePort,
		private readonly config: OAuthConfig,
	) {
		chrome.storage.onChanged.addListener((changes, areaName) => {
			if (areaName !== "local") return;
			if (TOKEN_STORAGE_KEY in changes) {
				const change = changes[TOKEN_STORAGE_KEY];
				this.cachedAuthenticated = change.newValue !== undefined;
			}
		});
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
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new AuthError("device_code_request_failed", "Device code request failed");
		}

		if (!response.ok) {
			throw new AuthError(
				"device_code_request_failed",
				`Device code request failed: ${response.status} ${response.statusText}`,
			);
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
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new AuthError("token_exchange_failed", "Token polling failed");
		}

		if (!response.ok) {
			throw new AuthError("token_exchange_failed", `Token polling failed: ${response.status}`);
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
						typeof data.error_description === "string" ? data.error_description : data.error;
					const description =
						typeof raw === "string" && raw.length > ERROR_DESCRIPTION_MAX_LENGTH
							? raw.slice(0, ERROR_DESCRIPTION_MAX_LENGTH)
							: raw;
					throw new AuthError("token_exchange_failed", `Token exchange failed: ${description}`);
				}
			}
		}

		const token = this.validateTokenData(data);
		await this.storage.set(TOKEN_STORAGE_KEY, token);
		this.cachedAuthenticated = true;
		return { status: "success", token };
	}

	async getToken(): Promise<AuthToken | null> {
		return this.storage.get<AuthToken>(TOKEN_STORAGE_KEY, isAuthToken);
	}

	async clearToken(): Promise<void> {
		await this.storage.remove(TOKEN_STORAGE_KEY);
		this.cachedAuthenticated = false;
	}

	async isAuthenticated(): Promise<boolean> {
		if (this.cachedAuthenticated !== null) {
			return this.cachedAuthenticated;
		}
		const token = await this.getToken();
		if (token === null) {
			this.cachedAuthenticated = false;
			return false;
		}
		if (token.expiresAt !== undefined && Date.now() >= token.expiresAt) {
			this.cachedAuthenticated = false;
			return false;
		}
		this.cachedAuthenticated = true;
		return true;
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
}
