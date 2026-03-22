import type { AuthPort } from "../../domain/ports/auth.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "../../shared/crypto";
import type { AuthToken, OAuthConfig } from "../../shared/types/auth";
import { AuthError, isAuthToken } from "../../shared/types/auth";

const TOKEN_STORAGE_KEY = "github_auth_token";

export class ChromeIdentityAdapter implements AuthPort {
	private pendingAuth: Promise<AuthToken> | null = null;
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

	authorize(): Promise<AuthToken> {
		if (this.pendingAuth) {
			return this.pendingAuth;
		}
		this.pendingAuth = this.executeAuthFlow().finally(() => {
			this.pendingAuth = null;
		});
		return this.pendingAuth;
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

	private async executeAuthFlow(): Promise<AuthToken> {
		const state = generateState();
		const codeVerifier = generateCodeVerifier();
		const codeChallenge = await generateCodeChallenge(codeVerifier);

		const redirectUrl = await this.launchAuthFlow(state, codeChallenge);
		const { code, returnedState } = this.parseRedirectUrl(redirectUrl);

		this.verifyState(state, returnedState);

		const token = await this.exchangeCodeForToken(code, codeVerifier);
		await this.storage.set(TOKEN_STORAGE_KEY, token);
		this.cachedAuthenticated = true;
		return token;
	}

	private async launchAuthFlow(state: string, codeChallenge: string): Promise<string> {
		const authUrl = this.buildAuthorizationUrl(state, codeChallenge);

		let responseUrl: string | undefined;
		try {
			responseUrl = await chrome.identity.launchWebAuthFlow({
				url: authUrl,
				interactive: true,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new AuthError("user_cancelled", "User cancelled the authentication flow", {
				cause: new Error(message),
			});
		}

		if (!responseUrl) {
			throw new AuthError("user_cancelled", "Authentication flow returned no response");
		}

		return responseUrl;
	}

	private buildAuthorizationUrl(state: string, codeChallenge: string): string {
		const params = new URLSearchParams({
			client_id: this.config.clientId,
			redirect_uri: this.config.redirectUri,
			scope: this.config.scopes.join(" "),
			state,
			code_challenge: codeChallenge,
			code_challenge_method: "S256",
		});
		return `${this.config.authorizationEndpoint}?${params.toString()}`;
	}

	private parseRedirectUrl(redirectUrl: string): {
		code: string;
		returnedState: string;
	} {
		const url = new URL(redirectUrl);
		const code = url.searchParams.get("code");
		const returnedState = url.searchParams.get("state");

		if (!code || !returnedState) {
			throw new AuthError("authorization_failed", "Missing code or state in redirect URL");
		}

		return { code, returnedState };
	}

	private verifyState(expected: string, actual: string): void {
		if (expected !== actual) {
			throw new AuthError("csrf_mismatch", "State parameter mismatch: possible CSRF attack");
		}
	}

	private async exchangeCodeForToken(code: string, codeVerifier: string): Promise<AuthToken> {
		const body = new URLSearchParams({
			client_id: this.config.clientId,
			client_secret: this.config.clientSecret,
			code,
			redirect_uri: this.config.redirectUri,
			code_verifier: codeVerifier,
		});

		let response: Response;
		try {
			response = await fetch(this.config.tokenEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: body.toString(),
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new AuthError("token_exchange_failed", `Token exchange failed: ${message}`);
		}

		if (!response.ok) {
			throw new AuthError(
				"token_exchange_failed",
				`Token exchange failed: ${response.status} ${response.statusText}`,
			);
		}

		const data = await this.parseResponseBody(response);
		return this.validateTokenData(data);
	}

	private async parseResponseBody(response: Response): Promise<Record<string, unknown>> {
		try {
			return (await response.json()) as Record<string, unknown>;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new AuthError(
				"token_exchange_failed",
				`Token exchange failed: invalid response body: ${message}`,
			);
		}
	}

	private validateTokenData(data: Record<string, unknown>): AuthToken {
		if (typeof data.error === "string") {
			const description =
				typeof data.error_description === "string" ? data.error_description : data.error;
			throw new AuthError("token_exchange_failed", `Token exchange failed: ${description}`);
		}

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
