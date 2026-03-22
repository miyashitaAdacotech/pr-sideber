export type OAuthConfig = {
	readonly clientId: string;
	readonly deviceCodeEndpoint: string;
	readonly tokenEndpoint: string;
	readonly scopes: readonly string[];
};

export type AuthToken = {
	readonly accessToken: string;
	readonly tokenType: string;
	readonly scope: string;
	readonly expiresAt?: number;
	readonly refreshToken?: string;
};

export function isAuthToken(value: unknown): value is AuthToken {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.accessToken === "string" &&
		obj.accessToken !== "" &&
		typeof obj.tokenType === "string" &&
		obj.tokenType !== "" &&
		typeof obj.scope === "string"
	);
}

export type DeviceCodeResponse = {
	readonly deviceCode: string;
	readonly userCode: string;
	readonly verificationUri: string;
	readonly expiresIn: number;
	readonly interval: number;
};

/** Device Flow 1回分のポーリング結果 */
export type PollResult =
	| { readonly status: "success"; readonly token: AuthToken }
	| { readonly status: "pending" }
	| { readonly status: "slow_down"; readonly interval: number }
	| { readonly status: "expired" }
	| { readonly status: "denied" };

export type AuthErrorCode =
	| "authorization_failed"
	| "token_exchange_failed"
	| "device_code_request_failed"
	| "device_code_validation_failed"
	| "device_flow_expired"
	| "device_flow_denied";

export class AuthError extends Error {
	readonly code: AuthErrorCode;
	constructor(code: AuthErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "AuthError";
		this.code = code;
	}
}
