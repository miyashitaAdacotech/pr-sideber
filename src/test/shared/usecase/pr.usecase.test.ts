import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrProcessorPort, ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { SendMessage } from "../../../shared/ports/message.port";
import { PR_CACHE_KEY } from "../../../shared/types/cache";
import { createPrUseCase } from "../../../shared/usecase/pr.usecase";

describe("pr usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn>;
	let mockPrProcessor: PrProcessorPort;
	let mockStorage: StoragePort & {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		remove: ReturnType<typeof vi.fn>;
	};
	const mockProcessedResult: ProcessedPrsResult = {
		myPrs: {
			items: [
				{
					id: "PR_1",
					number: 1,
					title: "feat: add PR list",
					author: "testuser",
					url: "https://github.com/owner/repo/pull/1",
					repository: "owner/repo",
					isDraft: false,
					approvalStatus: "approved",
					ciStatus: "passed",
					additions: 10,
					deletions: 5,
					createdAt: "2026-03-20T00:00:00Z",
					updatedAt: "2026-03-21T00:00:00Z",
				},
			],
			totalCount: 1,
		},
		reviewRequests: {
			items: [],
			totalCount: 0,
		},
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
		mockSendMessage = vi.fn();
		mockPrProcessor = {
			processPullRequests: vi.fn().mockReturnValue(mockProcessedResult),
		};
		mockStorage = {
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		};
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("fetchPrs", () => {
		it("should send FETCH_PRS message, process via WASM, and return ProcessedPrsResult", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: false };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			const result = await useCase.fetchPrs("testuser");

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			expect(mockPrProcessor.processPullRequests).toHaveBeenCalledWith('{"data":{}}', "testuser");
			expect(result.myPrs).toEqual(mockProcessedResult.myPrs);
			expect(result.reviewRequests).toEqual(mockProcessedResult.reviewRequests);
			expect(result.hasMore).toBe(false);
		});

		it("should throw when sendMessage returns error response", async () => {
			const response = {
				ok: false as const,
				error: { code: "FETCH_PRS_ERROR", message: "Failed to fetch pull requests" },
			};
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);

			await expect(useCase.fetchPrs("testuser")).rejects.toThrow("Failed to fetch pull requests");
		});

		it("should propagate error when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);

			await expect(useCase.fetchPrs("testuser")).rejects.toThrow("Network error");
		});

		it("should return hasMore: true when API indicates more results", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: true };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			const result = await useCase.fetchPrs("testuser");

			expect(result.hasMore).toBe(true);
		});

		it("should save cache via StoragePort.set after successful fetch", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: false };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			await useCase.fetchPrs("testuser");

			expect(mockStorage.set).toHaveBeenCalledWith(PR_CACHE_KEY, {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T12:00:00.000Z",
			});
		});

		it("should include lastUpdatedAt as ISO 8601 string in cached data", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: false };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			await useCase.fetchPrs("testuser");

			const savedData = mockStorage.set.mock.calls[0][1] as { lastUpdatedAt: string };
			expect(savedData.lastUpdatedAt).toBe("2026-03-22T12:00:00.000Z");
			expect(new Date(savedData.lastUpdatedAt).toISOString()).toBe(savedData.lastUpdatedAt);
		});

		it("should not update cache when fetchPrs throws an error", async () => {
			const response = {
				ok: false as const,
				error: { code: "FETCH_PRS_ERROR", message: "Failed" },
			};
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);

			await expect(useCase.fetchPrs("testuser")).rejects.toThrow("Failed");
			expect(mockStorage.set).not.toHaveBeenCalled();
		});

		it("should work without storage (backward compatibility)", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: false };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor);
			const result = await useCase.fetchPrs("testuser");

			expect(result.myPrs).toEqual(mockProcessedResult.myPrs);
			expect(result.hasMore).toBe(false);
		});

		it("should still return result when storage.set fails", async () => {
			const rawResult = { rawJson: '{"data":{}}', hasMore: false };
			const response = { ok: true as const, data: rawResult };
			mockSendMessage.mockResolvedValue(response);
			mockStorage.set.mockRejectedValue(new Error("Storage full"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			const result = await useCase.fetchPrs("testuser");

			expect(result.myPrs).toEqual(mockProcessedResult.myPrs);
		});
	});

	describe("getCachedPrs", () => {
		it("should return cached data from StoragePort.get", async () => {
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T10:00:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			const result = await useCase.getCachedPrs();

			expect(mockStorage.get).toHaveBeenCalledWith(PR_CACHE_KEY, expect.any(Function));
			expect(result).toEqual(cachedData);
		});

		it("should return null when no cache exists", async () => {
			mockStorage.get.mockResolvedValue(null);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockPrProcessor, mockStorage);
			const result = await useCase.getCachedPrs();

			expect(result).toBeNull();
		});
	});
});
