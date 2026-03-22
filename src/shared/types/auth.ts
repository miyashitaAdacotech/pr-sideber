export type OAuthConfig = {
	readonly clientId: string;
	readonly deviceCodeEndpoint: string;
	readonly tokenEndpoint: string;
	readonly scopes: readonly string[];
};

import type { AuthToken } from "../../domain/types/auth";
export type { AuthToken, DeviceCodeResponse, PollResult } from "../../domain/types/auth";

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
