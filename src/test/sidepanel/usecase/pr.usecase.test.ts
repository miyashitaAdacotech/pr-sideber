import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FetchPullRequestsResult } from "../../../domain/types/github";
import type { SendMessage } from "../../../shared/ports/message.port";
import { createPrUseCase } from "../../../sidepanel/usecase/pr.usecase";

describe("pr usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockSendMessage = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("fetchPrs", () => {
		it("should send FETCH_PRS message and return FetchPullRequestsResult on success", async () => {
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
				reviewRequested: [
					{
						title: "fix: resolve login bug",
						url: "https://github.com/owner/repo/pull/2",
						number: 2,
						isDraft: false,
						reviewDecision: "REVIEW_REQUIRED",
						commitStatusState: "PENDING",
						repository: { nameWithOwner: "owner/repo" },
						createdAt: "2026-03-19T00:00:00Z",
						updatedAt: "2026-03-20T00:00:00Z",
					},
				],
				hasMore: false,
			};
			const response = { ok: true as const, data: fetchResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage);
			const result = await useCase.fetchPrs();

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			expect(result).toEqual(fetchResult);
		});

		it("should throw when sendMessage returns error response", async () => {
			const response = {
				ok: false as const,
				error: { code: "FETCH_PRS_ERROR", message: "Failed to fetch pull requests" },
			};
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage);

			await expect(useCase.fetchPrs()).rejects.toThrow("Failed to fetch pull requests");
		});

		it("should propagate error when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage);

			await expect(useCase.fetchPrs()).rejects.toThrow("Network error");
		});

		it("should return empty arrays when no PRs exist", async () => {
			const emptyResult: FetchPullRequestsResult = {
				myPrs: [],
				reviewRequested: [],
				hasMore: false,
			};
			const response = { ok: true as const, data: emptyResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage);
			const result = await useCase.fetchPrs();

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			expect(result).toEqual(emptyResult);
			expect(result.myPrs).toHaveLength(0);
			expect(result.reviewRequested).toHaveLength(0);
		});
	});
});
