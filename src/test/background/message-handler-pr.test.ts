import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageHandler } from "../../background/message-handler";
import type { AppServices } from "../../background/types";
import type { AuthPort } from "../../domain/ports/auth.port";
import type { GitHubApiPort } from "../../domain/ports/github-api.port";
import type { PrProcessorPort } from "../../domain/ports/pr-processor.port";
import type { FetchRawPullRequestsResult } from "../../domain/types/github";
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

function createMockPrProcessor(): {
	[K in keyof PrProcessorPort]: ReturnType<typeof vi.fn>;
} {
	return {
		processPullRequests: vi.fn().mockReturnValue({
			myPrs: { items: [], totalCount: 0 },
			reviewRequests: { items: [], totalCount: 0 },
		}),
	};
}

function createMockBadge() {
	return {
		updateBadge: vi.fn().mockResolvedValue(undefined),
	};
}

describe("message-handler FETCH_PRS", () => {
	let mockAuth: ReturnType<typeof createMockAuth>;
	let mockGitHubApi: ReturnType<typeof createMockGitHubApi>;
	let mockPrProcessor: ReturnType<typeof createMockPrProcessor>;
	let mockBadge: ReturnType<typeof createMockBadge>;
	let handler: ReturnType<typeof createMessageHandler>;

	beforeEach(() => {
		setupChromeMock();
		mockAuth = createMockAuth();
		mockGitHubApi = createMockGitHubApi();
		mockPrProcessor = createMockPrProcessor();
		mockBadge = createMockBadge();
		handler = createMessageHandler({
			auth: mockAuth,
			githubApi: mockGitHubApi,
			prProcessor: mockPrProcessor,
			badge: mockBadge,
			tabNavigation: {
				navigateCurrentTab: vi.fn(),
				getCurrentTabUrl: vi.fn(),
				findExistingPrTab: vi.fn().mockResolvedValue(null),
				activateTab: vi.fn().mockResolvedValue(undefined),
				openNewTab: vi.fn().mockResolvedValue(undefined),
			},
		});
	});

	afterEach(() => {
		resetChromeMock();
		vi.restoreAllMocks();
	});

	it("should call services.githubApi.fetchPullRequests() and respond with FetchRawPullRequestsResult on success", async () => {
		const fetchResult: FetchRawPullRequestsResult = {
			rawJson: '{"data":{"myPrs":{"edges":[]},"reviewRequested":{"edges":[]}}}',
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
		// message-handler は prProcessor で処理した結果に hasMore を付与して返す
		expect(response.data).toHaveProperty("myPrs");
		expect(response.data).toHaveProperty("reviewRequests");
		expect(response.data).toHaveProperty("hasMore", false);
	});

	it("should respond with ProcessedPrsResult (not raw) after processing via prProcessor", async () => {
		const fetchResult: FetchRawPullRequestsResult = {
			rawJson: '{"data":{"myPrs":{"edges":[]},"reviewRequested":{"edges":[]}}}',
			hasMore: false,
		};
		mockGitHubApi.fetchPullRequests.mockResolvedValue(fetchResult);

		const sendResponse = vi.fn();
		handler({ type: "FETCH_PRS" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		// prProcessor.processPullRequests が呼ばれたことを検証
		expect(mockPrProcessor.processPullRequests).toHaveBeenCalledWith(fetchResult.rawJson);

		const response = sendResponse.mock.calls[0][0];
		expect(response.ok).toBe(true);
		// 改善後: レスポンスに myPrs, reviewRequests, hasMore が含まれる
		expect(response.data).toHaveProperty("myPrs");
		expect(response.data).toHaveProperty("reviewRequests");
		expect(response.data).toHaveProperty("hasMore");
		// rawJson は含まれない
		expect(response.data).not.toHaveProperty("rawJson");
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
