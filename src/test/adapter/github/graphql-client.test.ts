import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubGraphQLClient } from "../../../adapter/github/graphql-client";
import type { GitHubApiPort } from "../../../domain/ports/github-api.port";
import type { ReviewDecision, StatusState } from "../../../domain/types/github";
import { GitHubApiError } from "../../../shared/types/errors";

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const TEST_TOKEN = "gho_test_access_token_12345";

type TestEdge = {
	node: {
		title: string;
		url: string;
		number: number;
		isDraft: boolean;
		reviewDecision: ReviewDecision;
		commits: {
			nodes: Array<{
				commit: {
					statusCheckRollup: { state: StatusState } | null;
				};
			}>;
		};
		repository: { nameWithOwner: string };
		createdAt: string;
		updatedAt: string;
	} | null;
};

type TestResponse = {
	data?: {
		myPrs: {
			edges: TestEdge[];
			pageInfo: { hasNextPage: boolean };
		} | null;
		reviewRequested: {
			edges: TestEdge[];
			pageInfo: { hasNextPage: boolean };
		} | null;
	};
	errors?: Array<{ message: string }>;
};

function createSuccessResponse(
	myPrsNodes: TestEdge[] = [],
	reviewRequestedNodes: TestEdge[] = [],
	options: { myPrsHasNextPage?: boolean; reviewRequestedHasNextPage?: boolean } = {},
): TestResponse {
	return {
		data: {
			myPrs: {
				edges: myPrsNodes,
				pageInfo: { hasNextPage: options.myPrsHasNextPage ?? false },
			},
			reviewRequested: {
				edges: reviewRequestedNodes,
				pageInfo: { hasNextPage: options.reviewRequestedHasNextPage ?? false },
			},
		},
	};
}

function createPrEdge(
	overrides: {
		title?: string;
		url?: string;
		number?: number;
		isDraft?: boolean;
		reviewDecision?: ReviewDecision;
		statusState?: StatusState | null;
		nameWithOwner?: string;
		createdAt?: string;
		updatedAt?: string;
	} = {},
): TestEdge {
	return {
		node: {
			title: overrides.title ?? "Test PR",
			url: overrides.url ?? "https://github.com/owner/repo/pull/1",
			number: overrides.number ?? 1,
			isDraft: overrides.isDraft ?? false,
			reviewDecision: overrides.reviewDecision ?? null,
			commits: {
				nodes:
					overrides.statusState === undefined
						? []
						: [
								{
									commit: {
										statusCheckRollup:
											overrides.statusState === null ? null : { state: overrides.statusState },
									},
								},
							],
			},
			repository: {
				nameWithOwner: overrides.nameWithOwner ?? "owner/repo",
			},
			createdAt: overrides.createdAt ?? "2026-01-01T00:00:00Z",
			updatedAt: overrides.updatedAt ?? "2026-01-02T00:00:00Z",
		},
	};
}

describe("GitHubGraphQLClient", () => {
	let client: GitHubApiPort;
	let mockGetAccessToken: ReturnType<typeof vi.fn>;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
		mockGetAccessToken = vi.fn().mockResolvedValue(TEST_TOKEN);
		client = new GitHubGraphQLClient(mockGetAccessToken);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("fetchPullRequests - 正常系", () => {
		it("should include Authorization header with Bearer token", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(options.headers).toEqual(
				expect.objectContaining({
					Authorization: `Bearer ${TEST_TOKEN}`,
				}),
			);
		});

		it("should POST to GitHub GraphQL endpoint", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toBe(GRAPHQL_ENDPOINT);
			expect(options.method).toBe("POST");
		});

		it("should parse myPrs and reviewRequested from response", async () => {
			const myPrEdge = createPrEdge({
				title: "My PR",
				number: 10,
				nameWithOwner: "me/my-repo",
			});
			const reviewEdge = createPrEdge({
				title: "Review PR",
				number: 20,
				nameWithOwner: "other/other-repo",
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([myPrEdge], [reviewEdge]),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs).toHaveLength(1);
			expect(result.myPrs[0].title).toBe("My PR");
			expect(result.myPrs[0].number).toBe(10);
			expect(result.myPrs[0].repository.nameWithOwner).toBe("me/my-repo");

			expect(result.reviewRequested).toHaveLength(1);
			expect(result.reviewRequested[0].title).toBe("Review PR");
			expect(result.reviewRequested[0].number).toBe(20);
		});

		it("should correctly map reviewDecision, isDraft, and commit status", async () => {
			const edge = createPrEdge({
				isDraft: true,
				reviewDecision: "APPROVED",
				statusState: "SUCCESS",
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([edge]),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs[0].isDraft).toBe(true);
			expect(result.myPrs[0].reviewDecision).toBe("APPROVED");
			expect(result.myPrs[0].commitStatusState).toBe("SUCCESS");
		});

		it("should return empty arrays when no results", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs).toEqual([]);
			expect(result.reviewRequested).toEqual([]);
			expect(result.hasMore).toBe(false);
		});

		it("should handle PR with no CI status (statusCheckRollup is null)", async () => {
			const edge = createPrEdge({ statusState: null });

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([edge]),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs[0].commitStatusState).toBeNull();
		});

		it("should handle PR with no commits nodes (empty array)", async () => {
			const edge = createPrEdge();

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([edge]),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs[0].commitStatusState).toBeNull();
		});

		it("should filter out edges with null node", async () => {
			const validEdge = createPrEdge({ title: "Valid PR" });
			const nullNodeEdge: TestEdge = { node: null };

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([validEdge, nullNodeEdge]),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs).toHaveLength(1);
			expect(result.myPrs[0].title).toBe("Valid PR");
		});

		it("should treat null myPrs/reviewRequested as empty arrays", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: {
						myPrs: null,
						reviewRequested: null,
					},
				}),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs).toEqual([]);
			expect(result.reviewRequested).toEqual([]);
		});

		it("should set hasMore to true when myPrs has next page", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([], [], { myPrsHasNextPage: true }),
			});

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(true);
		});

		it("should set hasMore to true when reviewRequested has next page", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse([], [], { reviewRequestedHasNextPage: true }),
			});

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(true);
		});

		it("should set hasMore to false when neither has next page", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(false);
		});
	});

	describe("fetchPullRequests - エラー系", () => {
		it("should throw GitHubApiError with 'unauthorized' on HTTP 401", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("unauthorized");
			expect((error as GitHubApiError).statusCode).toBe(401);
		});

		it("should throw GitHubApiError with 'forbidden' on HTTP 403", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				statusText: "Forbidden",
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("forbidden");
			expect((error as GitHubApiError).statusCode).toBe(403);
		});

		it("should throw GitHubApiError with 'rate_limited' on HTTP 429", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers(),
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("rate_limited");
			expect((error as GitHubApiError).statusCode).toBe(429);
		});

		it("should throw GitHubApiError with 'server_error' on HTTP 500", async () => {
			const noRetryClient = new GitHubGraphQLClient(mockGetAccessToken, { maxRetries: 0 });
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: new Headers(),
			});

			const error = await noRetryClient.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("server_error");
			expect((error as GitHubApiError).statusCode).toBe(500);
		});

		it("should throw GitHubApiError with 'network_error' and generic message on fetch rejection", async () => {
			const noRetryClient = new GitHubGraphQLClient(mockGetAccessToken, { maxRetries: 0 });
			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const error = await noRetryClient.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("network_error");
			expect((error as GitHubApiError).message).toBe("Network request failed");
			expect((error as GitHubApiError).details).toBe("Failed to fetch");
		});

		it("should throw GitHubApiError with 'graphql_error' and generic message when response has errors field", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					errors: [{ message: "Field 'foo' doesn't exist" }],
				}),
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("graphql_error");
			// message は汎用文言で、詳細は details に格納
			expect((error as GitHubApiError).message).toBe("GitHub API returned GraphQL errors");
			expect((error as GitHubApiError).details).toContain("Field 'foo' doesn't exist");
		});

		it("should throw GitHubApiError with 'unknown' and generic message on invalid JSON response", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => {
					throw new SyntaxError("Unexpected token < in JSON");
				},
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("unknown");
			expect((error as GitHubApiError).message).toBe("Failed to parse API response");
			expect((error as GitHubApiError).details).toBe("Unexpected token < in JSON");
		});

		it("should propagate error when getAccessToken rejects", async () => {
			mockGetAccessToken.mockRejectedValue(new Error("Not authenticated"));
			client = new GitHubGraphQLClient(mockGetAccessToken);

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Not authenticated");
		});

		it("should throw GraphQL error when response has both data and errors", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: {
						myPrs: { edges: [], pageInfo: { hasNextPage: false } },
						reviewRequested: { edges: [], pageInfo: { hasNextPage: false } },
					},
					errors: [{ message: "Partial error occurred" }],
				}),
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("graphql_error");
			expect((error as GitHubApiError).details).toContain("Partial error occurred");
		});
	});

	describe("fetchPullRequests - 設計確認", () => {
		it("should not include token in URL parameters", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [url] = fetchMock.mock.calls[0] as [string];
			expect(url).not.toContain(TEST_TOKEN);
			expect(url).not.toContain("access_token");
		});

		it("should set Content-Type to application/json", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(options.headers).toEqual(
				expect.objectContaining({
					"Content-Type": "application/json",
				}),
			);
		});

		it("should use GraphQL fragment in query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toContain("fragment PrFields on PullRequest");
			expect(body.query).toContain("...PrFields");
		});

		it("should request pageInfo in query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toContain("pageInfo");
			expect(body.query).toContain("hasNextPage");
		});
	});

	describe("fetchPullRequests - リトライ・レート制限", () => {
		let retryClient: GitHubApiPort;

		beforeEach(() => {
			retryClient = new GitHubGraphQLClient(mockGetAccessToken, { baseDelayMs: 1, maxDelayMs: 1 });
		});

		it("should retry on 5xx and succeed on 4th attempt", async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					statusText: "Internal Server Error",
					headers: new Headers(),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 502,
					statusText: "Bad Gateway",
					headers: new Headers(),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 503,
					statusText: "Service Unavailable",
					headers: new Headers(),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: async () => createSuccessResponse(),
				});
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.myPrs).toEqual([]);
			expect(result.reviewRequested).toEqual([]);
			expect(fetchMock).toHaveBeenCalledTimes(4);
		});

		it("should throw last error after all 5xx retries exhausted", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				headers: new Headers(),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("server_error");
			expect(fetchMock).toHaveBeenCalledTimes(4);
		});

		it("should retry on network_error and succeed on 2nd attempt", async () => {
			const fetchMock = vi
				.fn()
				.mockRejectedValueOnce(new TypeError("Failed to fetch"))
				.mockResolvedValueOnce({
					ok: true,
					json: async () => createSuccessResponse(),
				});
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.myPrs).toEqual([]);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("should not retry on 401", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
				headers: new Headers(),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("unauthorized");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("should not retry on 403", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				headers: new Headers(),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("forbidden");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("should not retry on 429", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers(),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("rate_limited");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("should include retryAfter in GitHubApiError when 429 response has rate limit headers", async () => {
			const resetTimestamp = Math.floor(Date.now() / 1000) + 60;
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers({
					"Retry-After": "60",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(resetTimestamp),
					"X-RateLimit-Limit": "5000",
				}),
			});

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			const apiError = error as GitHubApiError;
			expect(apiError.code).toBe("rate_limited");
			// GREEN フェーズで GitHubApiError に retryAfter, rateLimitRemaining を追加予定
			expect(apiError).toHaveProperty("retryAfter", 60);
			expect(apiError).toHaveProperty("rateLimitRemaining", 0);
		});

		it("should work normally when rate limit headers are absent", async () => {
			const client = new GitHubGraphQLClient(mockGetAccessToken, { maxRetries: 0 });
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => createSuccessResponse(),
			});

			const result = await client.fetchPullRequests();

			expect(result.myPrs).toEqual([]);
			expect(result.reviewRequested).toEqual([]);
			expect(result.hasMore).toBe(false);
		});
	});
});

describe("graphql-client の依存方向", () => {
	it("FetchPullRequestsResult, PullRequest, ReviewDecision, StatusState を domain/types/github から直接 import していること", () => {
		const files = import.meta.glob("../../../adapter/github/graphql-client.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const matchedPaths = Object.keys(files);
		expect(matchedPaths, "adapter/github/graphql-client.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		expect(content).toMatch(
			/import\s+[\s\S]*?\bFetchPullRequestsResult\b[\s\S]*?from\s+["'].*domain\/types\/github["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bPullRequest\b[\s\S]*?from\s+["'].*domain\/types\/github["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bReviewDecision\b[\s\S]*?from\s+["'].*domain\/types\/github["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bStatusState\b[\s\S]*?from\s+["'].*domain\/types\/github["']/,
		);
	});

	it("shared/types/github から FetchPullRequestsResult, PullRequest, ReviewDecision, StatusState を import していないこと", () => {
		const files = import.meta.glob("../../../adapter/github/graphql-client.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(files), "adapter/github/graphql-client.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		// multiline import 文を抽出して禁止シンボルを検証
		const sharedGithubImportPattern =
			/import\s+(?:type\s+)?{([^}]*)}\s+from\s+["'].*shared\/types\/github["']/g;
		const matches = [...(content?.matchAll(sharedGithubImportPattern) ?? [])];

		for (const match of matches) {
			const importedSymbols = match[1];
			expect(importedSymbols).not.toMatch(/\bFetchPullRequestsResult\b/);
			expect(importedSymbols).not.toMatch(/\bPullRequest\b/);
			expect(importedSymbols).not.toMatch(/\bReviewDecision\b/);
			expect(importedSymbols).not.toMatch(/\bStatusState\b/);
		}
	});
});
