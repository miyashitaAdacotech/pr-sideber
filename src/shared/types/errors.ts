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

	constructor(code: GitHubApiErrorCode, message: string, statusCode?: number, details?: string) {
		super(message);
		this.name = "GitHubApiError";
		this.code = code;
		this.statusCode = statusCode;
		this.details = details;
		Object.setPrototypeOf(this, GitHubApiError.prototype);
	}
}
