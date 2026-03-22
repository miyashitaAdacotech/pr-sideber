import type { GitHubApiPort } from "../../domain/ports/github-api.port";
import type { FetchRawPullRequestsResult } from "../../domain/types/github";
import { GitHubApiError } from "../../shared/types/errors";
import { extractRateLimitInfo } from "./rate-limit";
import type { DelayFn, RetryConfig } from "./retry";
import { defaultDelay, withRetry } from "./retry";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

// --- Adapter 内部型 (export しない) ---

type SearchResultConnection = {
	readonly pageInfo: {
		readonly hasNextPage: boolean;
	};
};

type GraphQLResponse = {
	readonly data?: {
		readonly myPrs: SearchResultConnection | null;
		readonly reviewRequested: SearchResultConnection | null;
	};
	readonly errors?: ReadonlyArray<{
		readonly message: string;
	}>;
};

// --- GraphQL クエリ (Fragment 化) ---

const PR_FIELDS_FRAGMENT = `
fragment PrFields on PullRequest {
  id
  title
  url
  number
  isDraft
  reviewDecision
  author {
    login
  }
  additions
  deletions
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          state
        }
      }
    }
  }
  repository {
    nameWithOwner
  }
  createdAt
  updatedAt
}`;

const PULL_REQUESTS_QUERY = `
${PR_FIELDS_FRAGMENT}
query {
  myPrs: search(query: "author:@me is:open is:pr", type: ISSUE, first: 50) {
    edges {
      node {
        ...PrFields
      }
    }
    pageInfo {
      hasNextPage
    }
  }
  reviewRequested: search(query: "review-requested:@me is:open is:pr", type: ISSUE, first: 50) {
    edges {
      node {
        ...PrFields
      }
    }
    pageInfo {
      hasNextPage
    }
  }
}
`;

const DEFAULT_RETRY_CONFIG: RetryConfig = {
	maxRetries: 3,
	baseDelayMs: 1000,
	maxDelayMs: 10000,
};

const MAX_RATE_LIMIT_RETRIES = 1;

/** Chrome Service Worker の 5分タイムアウトを考慮した Retry-After 上限 */
const MAX_RETRY_AFTER_MS = 120_000;

type GitHubApiErrorWithRetryAfter = GitHubApiError & { readonly retryAfter: number };

function hasValidRetryAfter(error: unknown): error is GitHubApiErrorWithRetryAfter {
	return error instanceof GitHubApiError && error.retryAfter != null && error.retryAfter > 0;
}

function shouldRetryError(error: unknown, attempt: number): boolean {
	if (error instanceof GitHubApiError) {
		if (error.code === "server_error" || error.code === "network_error") return true;
		if (error.code === "rate_limited" && hasValidRetryAfter(error)) {
			return attempt < MAX_RATE_LIMIT_RETRIES;
		}
	}
	return false;
}

function getRateLimitDelay(error: unknown): number | undefined {
	if (hasValidRetryAfter(error)) {
		return Math.min(error.retryAfter * 1000, MAX_RETRY_AFTER_MS);
	}
	return undefined;
}

export class GitHubGraphQLClient implements GitHubApiPort {
	private readonly retryConfig: RetryConfig;
	private readonly delayFn: DelayFn;

	constructor(
		private readonly getAccessToken: () => Promise<string>,
		retryConfig?: Partial<RetryConfig>,
		delayFn?: DelayFn,
	) {
		this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
		this.delayFn = delayFn ?? defaultDelay;
	}

	async fetchPullRequests(): Promise<FetchRawPullRequestsResult> {
		const token = await this.getAccessToken();
		const response = await withRetry(
			() => this.executeQuery(token),
			this.retryConfig,
			shouldRetryError,
			this.delayFn,
			{ getDelayOverride: getRateLimitDelay },
		);
		const rawJson = await this.parseResponseBody(response);

		let body: GraphQLResponse;
		try {
			body = JSON.parse(rawJson) as GraphQLResponse;
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : undefined;
			throw new GitHubApiError("unknown", "Failed to parse API response", undefined, details);
		}

		this.checkGraphQLErrors(body);

		if (!body.data) {
			throw new GitHubApiError("unknown", "GraphQL response missing data field");
		}

		const hasMore =
			(body.data.myPrs?.pageInfo.hasNextPage ?? false) ||
			(body.data.reviewRequested?.pageInfo.hasNextPage ?? false);

		return { rawJson, hasMore };
	}

	private async executeQuery(token: string): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(GRAPHQL_ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({ query: PULL_REQUESTS_QUERY }),
			});
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : undefined;
			throw new GitHubApiError("network_error", "Network request failed", undefined, details);
		}

		if (!response.ok) {
			const errorCode = mapHttpStatusToErrorCode(response.status);
			const message = `GitHub API error: ${response.status} ${response.statusText}`;

			if (response.status === 403) {
				const rateLimitInfo = extractRateLimitInfo(response.headers);
				if (rateLimitInfo && rateLimitInfo.remaining === 0) {
					const retryAfterStr = response.headers.get("Retry-After");
					const retryAfter =
						retryAfterStr !== null && Number.isFinite(Number(retryAfterStr))
							? Number(retryAfterStr)
							: undefined;
					throw new GitHubApiError("rate_limited", message, response.status, undefined, {
						retryAfter,
						rateLimitRemaining: rateLimitInfo.remaining,
					});
				}
			}

			if (response.status === 429) {
				const retryAfterStr = response.headers.get("Retry-After");
				const retryAfter =
					retryAfterStr !== null && Number.isFinite(Number(retryAfterStr))
						? Number(retryAfterStr)
						: undefined;
				const rateLimitInfo = extractRateLimitInfo(response.headers);
				throw new GitHubApiError(errorCode, message, response.status, undefined, {
					retryAfter,
					rateLimitRemaining: rateLimitInfo?.remaining,
				});
			}

			throw new GitHubApiError(errorCode, message, response.status);
		}

		return response;
	}

	private async parseResponseBody(response: Response): Promise<string> {
		try {
			return await response.text();
		} catch (error: unknown) {
			const details = error instanceof Error ? error.message : undefined;
			throw new GitHubApiError("unknown", "Failed to parse API response", undefined, details);
		}
	}

	// Partial error (data + errors 同時) も安全側に倒して reject する。
	// 部分的に有効なデータがあっても、整合性が保証できないため一律エラー扱い。
	private checkGraphQLErrors(body: GraphQLResponse): void {
		if (body.errors && body.errors.length > 0) {
			const details = body.errors.map((e) => e.message).join("; ");
			throw new GitHubApiError(
				"graphql_error",
				"GitHub API returned GraphQL errors",
				undefined,
				details,
			);
		}
	}
}

function mapHttpStatusToErrorCode(status: number): GitHubApiError["code"] {
	if (status === 401) return "unauthorized";
	if (status === 403) return "forbidden";
	if (status === 429) return "rate_limited";
	if (status >= 500) return "server_error";
	return "unknown";
}
