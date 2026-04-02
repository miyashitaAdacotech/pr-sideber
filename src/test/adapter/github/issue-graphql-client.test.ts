import { beforeEach, describe, expect, it, vi } from "vitest";
import { IssueGraphQLClient } from "../../../adapter/github/issue-graphql-client";

const TEST_TOKEN = "gho_test_token";

function createMockResponse(data: unknown): Response {
	const jsonStr = JSON.stringify(data);
	return {
		ok: true,
		status: 200,
		json: () => Promise.resolve(data),
		text: () => Promise.resolve(jsonStr),
		headers: new Headers(),
	} as Response;
}

describe("IssueGraphQLClient", () => {
	let client: IssueGraphQLClient;
	let mockGetAccessToken: () => Promise<string>;

	beforeEach(() => {
		mockGetAccessToken = vi.fn().mockResolvedValue(TEST_TOKEN);
		client = new IssueGraphQLClient(mockGetAccessToken);
	});

	it("should send GraphQL query with assignee:@me filter", async () => {
		const mockData = { data: { issues: { edges: [] } } };
		globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData));

		await client.fetchIssues();

		const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		const body = JSON.parse(options.body as string);
		expect(body.query).toContain("assignee:@me");
		expect(body.query).toContain("is:issue");
		expect(body.query).toContain("is:open");
	});

	it("should include Authorization header with Bearer token", async () => {
		const mockData = { data: { issues: { edges: [] } } };
		globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData));

		await client.fetchIssues();

		const [, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(options.headers).toEqual(
			expect.objectContaining({ Authorization: `Bearer ${TEST_TOKEN}` }),
		);
	});

	it("should return raw JSON string for WASM processing", async () => {
		const mockData = {
			data: {
				issues: {
					edges: [
						{
							node: {
								id: "I_1",
								number: 42,
								title: "Bug",
								url: "https://github.com/o/r/issues/42",
								state: "OPEN",
								labels: { nodes: [] },
								assignees: { nodes: [{ login: "alice" }] },
								updatedAt: "2026-03-01T00:00:00Z",
								parent: null,
							},
						},
					],
				},
			},
		};
		globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData));

		const rawJson = await client.fetchIssues();
		const parsed = JSON.parse(rawJson);
		expect(parsed.data.issues.edges).toHaveLength(1);
	});

	it("should throw on HTTP error", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			statusText: "Unauthorized",
			headers: new Headers(),
		} as Response);

		await expect(client.fetchIssues()).rejects.toThrow();
	});

	it("should throw on GraphQL error without data", async () => {
		const mockData = {
			errors: [{ message: "Bad query" }],
		};
		globalThis.fetch = vi.fn().mockResolvedValue(createMockResponse(mockData));

		await expect(client.fetchIssues()).rejects.toThrow();
	});
});
