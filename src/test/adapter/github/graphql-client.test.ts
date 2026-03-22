import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubGraphQLClient } from "../../../adapter/github/graphql-client";
import type { DelayFn } from "../../../adapter/github/retry";
import type { GitHubApiPort } from "../../../domain/ports/github-api.port";
import { GitHubApiError } from "../../../shared/types/errors";

const noDelay: DelayFn = () => Promise.resolve();

const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";
const TEST_TOKEN = "gho_test_access_token_12345";

/**
 * テスト用の GraphQL レスポンス JSON 文字列を生成する。
 * プロダクションコードが response.text() で raw JSON を取得する想定。
 */
function createRawResponse(
	overrides: {
		myPrsEdges?: ReadonlyArray<Record<string, unknown>>;
		reviewRequestedEdges?: ReadonlyArray<Record<string, unknown>>;
		myPrsHasNextPage?: boolean;
		reviewRequestedHasNextPage?: boolean;
		myPrsNull?: boolean;
		reviewRequestedNull?: boolean;
	} = {},
): string {
	const data: Record<string, unknown> = {};

	if (overrides.myPrsNull) {
		data.myPrs = null;
	} else {
		data.myPrs = {
			edges: overrides.myPrsEdges ?? [],
			pageInfo: { hasNextPage: overrides.myPrsHasNextPage ?? false },
		};
	}

	if (overrides.reviewRequestedNull) {
		data.reviewRequested = null;
	} else {
		data.reviewRequested = {
			edges: overrides.reviewRequestedEdges ?? [],
			pageInfo: { hasNextPage: overrides.reviewRequestedHasNextPage ?? false },
		};
	}

	return JSON.stringify({ data });
}

function createMockFetchResponse(rawJson: string) {
	return {
		ok: true,
		status: 200,
		headers: new Headers(),
		text: async () => rawJson,
		json: async () => JSON.parse(rawJson),
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
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

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
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).toBe(GRAPHQL_ENDPOINT);
			expect(options.method).toBe("POST");
		});

		it("should return rawJson containing the GraphQL response JSON string", async () => {
			const rawJson = createRawResponse({
				myPrsEdges: [
					{
						node: {
							id: "PR_1",
							title: "My PR",
							url: "https://github.com/owner/repo/pull/1",
							number: 10,
							isDraft: false,
							reviewDecision: null,
							author: { login: "me" },
							additions: 10,
							deletions: 5,
							commits: { nodes: [] },
							repository: { nameWithOwner: "me/my-repo" },
							createdAt: "2026-01-01T00:00:00Z",
							updatedAt: "2026-01-02T00:00:00Z",
						},
					},
				],
			});

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
		});

		it("should set hasMore to false when both hasNextPage are false", async () => {
			const rawJson = createRawResponse({
				myPrsHasNextPage: false,
				reviewRequestedHasNextPage: false,
			});

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(false);
		});

		it("should set hasMore to true when myPrs has next page", async () => {
			const rawJson = createRawResponse({ myPrsHasNextPage: true });

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(true);
		});

		it("should set hasMore to true when reviewRequested has next page", async () => {
			const rawJson = createRawResponse({ reviewRequestedHasNextPage: true });

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.hasMore).toBe(true);
		});

		it("should return rawJson and hasMore=false when myPrs is null", async () => {
			const rawJson = createRawResponse({ myPrsNull: true });

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
			expect(result.hasMore).toBe(false);
		});

		it("should return rawJson and hasMore=false when reviewRequested is null", async () => {
			const rawJson = createRawResponse({ reviewRequestedNull: true });

			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await client.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
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
				headers: new Headers(),
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
			const errorJson = JSON.stringify({
				errors: [{ message: "Field 'foo' doesn't exist" }],
			});
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => errorJson,
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("graphql_error");
			expect((error as GitHubApiError).message).toBe("GitHub API returned GraphQL errors");
			expect((error as GitHubApiError).details).toContain("Field 'foo' doesn't exist");
		});

		it("should throw GitHubApiError with 'unknown' and generic message on invalid JSON response", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => "<html>Not JSON</html>",
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("unknown");
			expect((error as GitHubApiError).message).toBe("Failed to parse API response");
		});

		it("should propagate error when getAccessToken rejects", async () => {
			mockGetAccessToken.mockRejectedValue(new Error("Not authenticated"));
			client = new GitHubGraphQLClient(mockGetAccessToken);

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Not authenticated");
		});

		it("should throw GraphQL error when response has both data and errors", async () => {
			const partialErrorJson = JSON.stringify({
				data: {
					myPrs: { edges: [], pageInfo: { hasNextPage: false } },
					reviewRequested: { edges: [], pageInfo: { hasNextPage: false } },
				},
				errors: [{ message: "Partial error occurred" }],
			});
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				text: async () => partialErrorJson,
			});

			const error = await client.fetchPullRequests().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("graphql_error");
			expect((error as GitHubApiError).details).toContain("Partial error occurred");
		});
	});

	describe("fetchPullRequests - 設計確認", () => {
		it("should not include token in URL parameters", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [url] = fetchMock.mock.calls[0] as [string];
			expect(url).not.toContain(TEST_TOKEN);
			expect(url).not.toContain("access_token");
		});

		it("should set Content-Type to application/json", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

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
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toContain("fragment PrFields on PullRequest");
			expect(body.query).toContain("...PrFields");
		});

		it("should request pageInfo in query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toContain("pageInfo");
			expect(body.query).toContain("hasNextPage");
		});

		it("should include 'id' field in GraphQL query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toMatch(/fragment PrFields[\s\S]*?\bid\b/);
		});

		it("should include 'author' field in GraphQL query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toMatch(/fragment PrFields[\s\S]*?\bauthor\b/);
			expect(body.query).toContain("login");
		});

		it("should include 'additions' field in GraphQL query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toMatch(/fragment PrFields[\s\S]*?\badditions\b/);
		});

		it("should include 'deletions' field in GraphQL query", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(createRawResponse()));

			await client.fetchPullRequests();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = JSON.parse(options.body as string) as { query: string };
			expect(body.query).toMatch(/fragment PrFields[\s\S]*?\bdeletions\b/);
		});
	});

	describe("fetchPullRequests - リトライ・レート制限", () => {
		let retryClient: GitHubApiPort;

		beforeEach(() => {
			retryClient = new GitHubGraphQLClient(
				mockGetAccessToken,
				{ baseDelayMs: 1, maxDelayMs: 1 },
				noDelay,
			);
		});

		it("should retry on 5xx and succeed on 4th attempt", async () => {
			const rawJson = createRawResponse();
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
				.mockResolvedValueOnce(createMockFetchResponse(rawJson));
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
			expect(result.hasMore).toBe(false);
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
			const rawJson = createRawResponse();
			const fetchMock = vi
				.fn()
				.mockRejectedValueOnce(new TypeError("Failed to fetch"))
				.mockResolvedValueOnce(createMockFetchResponse(rawJson));
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
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

		it("should not retry on 429 without Retry-After", async () => {
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
			expect(apiError).toHaveProperty("retryAfter", 60);
			expect(apiError).toHaveProperty("rateLimitRemaining", 0);
		});

		it("should work normally when rate limit headers are absent", async () => {
			const rawJson = createRawResponse();
			const noRetryClient = new GitHubGraphQLClient(mockGetAccessToken, { maxRetries: 0 });
			globalThis.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(rawJson));

			const result = await noRetryClient.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
			expect(result.hasMore).toBe(false);
		});

		it("should retry once on 429 with Retry-After and succeed", async () => {
			const rawJson = createRawResponse();
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					statusText: "Too Many Requests",
					headers: new Headers({
						"Retry-After": "30",
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 30),
						"X-RateLimit-Limit": "5000",
					}),
				})
				.mockResolvedValueOnce(createMockFetchResponse(rawJson));
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("should not retry on 429 when Retry-After is absent", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers({
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
					"X-RateLimit-Limit": "5000",
				}),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("rate_limited");
			expect(fetchMock).toHaveBeenCalledTimes(1);
		});

		it("should limit rate_limited retry to 1 attempt even with multiple 429 responses", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers({
					"Retry-After": "10",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 10),
					"X-RateLimit-Limit": "5000",
				}),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("rate_limited");
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});

		it("should treat 403 with X-RateLimit-Remaining: 0 as rate_limited", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				headers: new Headers({
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
					"X-RateLimit-Limit": "5000",
				}),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			const apiError = error as GitHubApiError;
			expect(apiError.code).toBe("rate_limited");
			expect(apiError.statusCode).toBe(403);
			expect(apiError.rateLimitRemaining).toBe(0);
		});

		it("should treat 403 with X-RateLimit-Remaining > 0 as forbidden", async () => {
			const fetchMock = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				statusText: "Forbidden",
				headers: new Headers({
					"X-RateLimit-Remaining": "100",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
					"X-RateLimit-Limit": "5000",
				}),
			});
			globalThis.fetch = fetchMock;

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			expect((error as GitHubApiError).code).toBe("forbidden");
		});

		it("should retry on 429 with Retry-After: 5 and return success response on 2nd attempt", async () => {
			const rawJson = createRawResponse({
				myPrsEdges: [
					{
						node: {
							id: "PR_42",
							title: "Recovered PR",
							url: "https://github.com/owner/repo/pull/42",
							number: 42,
							isDraft: false,
							reviewDecision: null,
							author: { login: "me" },
							additions: 1,
							deletions: 0,
							commits: { nodes: [] },
							repository: { nameWithOwner: "owner/repo" },
							createdAt: "2026-01-01T00:00:00Z",
							updatedAt: "2026-01-02T00:00:00Z",
						},
					},
				],
			});
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
					statusText: "Too Many Requests",
					headers: new Headers({
						"Retry-After": "5",
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 5),
						"X-RateLimit-Limit": "5000",
					}),
				})
				.mockResolvedValueOnce(createMockFetchResponse(rawJson));
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(fetchMock).toHaveBeenCalledTimes(2);
			expect(result.rawJson).toBe(rawJson);
			expect(result.hasMore).toBe(false);
		});

		it("should set retryAfter to undefined when Retry-After header is HTTP-date format", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				headers: new Headers({
					"Retry-After": "Thu, 01 Jan 2026 00:00:00 GMT",
					"X-RateLimit-Remaining": "0",
					"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 60),
					"X-RateLimit-Limit": "5000",
				}),
			});

			const error = await retryClient.fetchPullRequests().catch((e: unknown) => e);

			expect(error).toBeInstanceOf(GitHubApiError);
			const apiError = error as GitHubApiError;
			expect(apiError.code).toBe("rate_limited");
			expect(apiError.retryAfter).toBeUndefined();
		});

		it("should retry on 403 with X-RateLimit-Remaining: 0 and Retry-After", async () => {
			const rawJson = createRawResponse();
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
					statusText: "Forbidden",
					headers: new Headers({
						"Retry-After": "45",
						"X-RateLimit-Remaining": "0",
						"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 45),
						"X-RateLimit-Limit": "5000",
					}),
				})
				.mockResolvedValueOnce(createMockFetchResponse(rawJson));
			globalThis.fetch = fetchMock;

			const result = await retryClient.fetchPullRequests();

			expect(result.rawJson).toBe(rawJson);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		});
	});
});

describe("graphql-client の依存方向", () => {
	it("FetchRawPullRequestsResult を domain/types/github から直接 import していること", () => {
		const files = import.meta.glob("../../../adapter/github/graphql-client.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const matchedPaths = Object.keys(files);
		expect(matchedPaths, "adapter/github/graphql-client.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		expect(content).toMatch(
			/import\s+[\s\S]*?\bFetchRawPullRequestsResult\b[\s\S]*?from\s+["'].*domain\/types\/github["']/,
		);
	});

	it("shared/types/github から FetchRawPullRequestsResult を import していないこと", () => {
		const files = import.meta.glob("../../../adapter/github/graphql-client.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(files), "adapter/github/graphql-client.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		const sharedGithubImportPattern =
			/import\s+(?:type\s+)?{([^}]*)}\s+from\s+["'].*shared\/types\/github["']/g;
		const matches = [...(content?.matchAll(sharedGithubImportPattern) ?? [])];

		for (const match of matches) {
			const importedSymbols = match[1];
			expect(importedSymbols).not.toMatch(/\bFetchRawPullRequestsResult\b/);
		}
	});
});
