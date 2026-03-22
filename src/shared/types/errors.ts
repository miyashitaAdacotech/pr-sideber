export type GitHubApiErrorCode =
	| "unauthorized"
	| "forbidden"
	| "rate_limited"
	| "server_error"
	| "network_error"
	| "graphql_error"
	| "unknown";

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
