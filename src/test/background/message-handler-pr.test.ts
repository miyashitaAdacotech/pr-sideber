import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../background/bootstrap";
import { createMessageHandler } from "../../background/message-handler";
import type { AuthPort } from "../../domain/ports/auth.port";
import type { GitHubApiPort } from "../../domain/ports/github-api.port";
import type { FetchPullRequestsResult } from "../../domain/types/github";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

function createMockAuth(): {
	[K in keyof AuthPort]: ReturnType<typeof vi.fn>;
} {
	return {
		getToken: vi.fn(),
		clearToken: vi.fn(),
		isAuthenticated: vi.fn(),
		requestDeviceCode: vi.fn(),
		pollForToken: vi.fn(),
		refreshAccessToken: vi.fn(),
	};
}

function createMockGitHubApi(): {
	[K in keyof GitHubApiPort]: ReturnType<typeof vi.fn>;
} {
	return {
		fetchPullRequests: vi.fn(),
	};
}

const TRUSTED_EXTENSION_ID = "test-extension-id";

function createTrustedSender(): chrome.runtime.MessageSender {
	return { id: TRUSTED_EXTENSION_ID } as chrome.runtime.MessageSender;
}

// RED phase failure modes:
// 1. FETCH_PRS is not in MESSAGE_TYPES → isRequestMessage() returns false → sendResponse never called
// 2. message-handler has no "FETCH_PRS" case in switch → handler does nothing
// GREEN phase will: add FETCH_PRS to MESSAGE_TYPES/RequestMap/ResponseDataMap, add switch case in message-handler
describe("message-handler FETCH_PRS", () => {
	let mockAuth: ReturnType<typeof createMockAuth>;
	let mockGitHubApi: ReturnType<typeof createMockGitHubApi>;
	let services: AppServices;
	let handler: ReturnType<typeof createMessageHandler>;

	beforeEach(() => {
		setupChromeMock();
		mockAuth = createMockAuth();
		mockGitHubApi = createMockGitHubApi();
		services = {
			auth: mockAuth,
			githubApi: mockGitHubApi,
		} as unknown as AppServices;
		handler = createMessageHandler(services);
	});

	afterEach(() => {
		resetChromeMock();
		vi.restoreAllMocks();
	});

	it("should call services.githubApi.fetchPullRequests() and respond with FetchPullRequestsResult on success", async () => {
		const fetchResult: FetchPullRequestsResult = {
			myPrs: [
				{
					title: "feat: add PR list",
					url: "https://github.com/owner/repo/pull/1",
					number: 1,
					isDraft: false,
					reviewDecision: "APPROVED",
					commitStatusState: "SUCCESS",
					repository: { nameWithOwner: "owner/repo" },
					createdAt: "2026-03-20T00:00:00Z",
					updatedAt: "2026-03-21T00:00:00Z",
				},
			],
			reviewRequested: [],
			hasMore: false,
		};
		mockGitHubApi.fetchPullRequests.mockResolvedValue(fetchResult);

		const sendResponse = vi.fn();
		handler({ type: "FETCH_PRS" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		expect(mockGitHubApi.fetchPullRequests).toHaveBeenCalled();
		const response = sendResponse.mock.calls[0][0];
		expect(response.ok).toBe(true);
		expect(response.data).toEqual(fetchResult);
	});

	it("should respond with error when fetchPullRequests throws", async () => {
		mockGitHubApi.fetchPullRequests.mockRejectedValue(new Error("GitHub API rate limit"));

		const sendResponse = vi.fn();
		handler({ type: "FETCH_PRS" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0];
		expect(response.ok).toBe(false);
		expect(response.error.code).toBe("FETCH_PRS_ERROR");
		expect(response.error.message).toBe("Failed to fetch pull requests");
	});
});
