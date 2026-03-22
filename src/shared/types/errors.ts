export type GitHubApiErrorCode =
	| "unauthorized"
	| "forbidden"
	| "rate_limited"
	| "server_error"
	| "network_error"
	| "graphql_error"
	| "unknown";

/** 一時的なネットワーク障害を表すエラー。リトライ可能な失敗に使用する */
export class NetworkError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "NetworkError";
		Object.setPrototypeOf(this, NetworkError.prototype);
	}
}

/** Rate Limit (HTTP 429) を表すエラー。NetworkError のサブクラス */
export class RateLimitError extends NetworkError {
	readonly retryAfterMs: number;

	constructor(message: string, retryAfterMs: number, options?: ErrorOptions) {
		super(message, options);
		this.name = "RateLimitError";
		this.retryAfterMs = retryAfterMs;
		Object.setPrototypeOf(this, RateLimitError.prototype);
	}
}

export class GitHubApiError extends Error {
	readonly code: GitHubApiErrorCode;
	readonly statusCode?: number;
	readonly details?: string;
	readonly retryAfter?: number;
	readonly rateLimitRemaining?: number;

	constructor(
		code: GitHubApiErrorCode,
		message: string,
		statusCode?: number,
		details?: string,
		options?: { retryAfter?: number; rateLimitRemaining?: number },
	) {
		super(message);
		this.name = "GitHubApiError";
		this.code = code;
		this.statusCode = statusCode;
		this.details = details;
		this.retryAfter = options?.retryAfter;
		this.rateLimitRemaining = options?.rateLimitRemaining;
		Object.setPrototypeOf(this, GitHubApiError.prototype);
	}
}
