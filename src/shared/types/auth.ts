import type { AuthToken } from "../../domain/types/auth";

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

const AUTH_ERROR_CODES: ReadonlySet<string> = new Set<string>([
	"authorization_failed",
	"token_exchange_failed",
	"device_code_request_failed",
	"device_code_validation_failed",
	"device_flow_expired",
	"device_flow_denied",
]);

export function isAuthErrorCode(code: string): code is AuthErrorCode {
	return AUTH_ERROR_CODES.has(code);
}

export class AuthError extends Error {
	readonly code: AuthErrorCode;
	constructor(code: AuthErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "AuthError";
		this.code = code;
	}
}
