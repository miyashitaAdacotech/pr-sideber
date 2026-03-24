import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { SendMessage } from "../../../shared/ports/message.port";
import { PR_CACHE_KEY } from "../../../shared/types/cache";
import { createPrUseCase } from "../../../shared/usecase/pr.usecase";

describe("pr usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn>;
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
					approvalStatus: "Approved",
					ciStatus: "Passed",
					mergeableStatus: "Unknown",
					additions: 10,
					deletions: 5,
					createdAt: "2026-03-20T00:00:00Z",
					updatedAt: "2026-03-21T00:00:00Z",
					sizeLabel: "S",
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
			const processedData = { ...mockProcessedResult, hasMore: false };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.fetchPrs();

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
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

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);

			await expect(useCase.fetchPrs()).rejects.toThrow("Failed to fetch pull requests");
		});

		it("should propagate error when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);

			await expect(useCase.fetchPrs()).rejects.toThrow("Network error");
		});

		it("should return hasMore: true when API indicates more results", async () => {
			const processedData = { ...mockProcessedResult, hasMore: true };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.fetchPrs();

			expect(result.hasMore).toBe(true);
		});

		it("should save cache via StoragePort.set after successful fetch", async () => {
			const processedData = { ...mockProcessedResult, hasMore: false };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			await useCase.fetchPrs();

			expect(mockStorage.set).toHaveBeenCalledWith(PR_CACHE_KEY, {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T12:00:00.000Z",
			});
		});

		it("should include lastUpdatedAt as ISO 8601 string in cached data", async () => {
			const processedData = { ...mockProcessedResult, hasMore: false };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			await useCase.fetchPrs();

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

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);

			await expect(useCase.fetchPrs()).rejects.toThrow("Failed");
			expect(mockStorage.set).not.toHaveBeenCalled();
		});

		it("should work without storage (backward compatibility)", async () => {
			const processedData = { ...mockProcessedResult, hasMore: false };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createPrUseCase(mockSendMessage as SendMessage);
			const result = await useCase.fetchPrs();

			expect(result.myPrs).toEqual(mockProcessedResult.myPrs);
			expect(result.hasMore).toBe(false);
		});

		it("should still return result when storage.set fails", async () => {
			const processedData = { ...mockProcessedResult, hasMore: false };
			const response = { ok: true as const, data: processedData };
			mockSendMessage.mockResolvedValue(response);
			mockStorage.set.mockRejectedValue(new Error("Storage full"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.fetchPrs();

			expect(result.myPrs).toEqual(mockProcessedResult.myPrs);
		});
	});

	describe("loadPrsWithCache", () => {
		it("should return cache and skip fetchPrs when cache is fresh (within N minutes)", async () => {
			// キャッシュが2分前 → freshMinutes=5 なので新鮮
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T11:58:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			expect(result).toEqual(cachedData.data);
			expect(mockSendMessage).not.toHaveBeenCalled();
		});

		it("should return cache and trigger fetchPrs in background when cache is stale (older than N minutes)", async () => {
			// キャッシュが10分前 → freshMinutes=5 なので古い
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T11:50:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const processedData = { ...mockProcessedResult, hasMore: false };
			mockSendMessage.mockResolvedValue({ ok: true as const, data: processedData });

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			// stale cache を即座に返す
			expect(result).toEqual(cachedData.data);
			// バックグラウンドで fetchPrs が呼ばれる
			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");

			// バックグラウンド更新でキャッシュが書き込まれることを検証
			await vi.waitFor(() => expect(mockStorage.set).toHaveBeenCalled());
		});

		it("should maintain stale cache when background fetch fails", async () => {
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T11:50:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			// fetch が失敗する
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			// stale cache を返す
			expect(result).toEqual(cachedData.data);
			// fetch は試みられたが失敗
			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			// storage.set は呼ばれない（キャッシュ上書きされない）
			// Promise が解決するのを少し待つ
			await vi.advanceTimersByTimeAsync(0);
			expect(mockStorage.set).not.toHaveBeenCalled();
		});

		it("should return cache when cache age is exactly N minutes (boundary)", async () => {
			// ちょうど5分前 → 境界ぴったりのテスト
			// 12:00:00 - 5分 = 11:55:00
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T11:55:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			// 境界ぴったりは stale として扱い、cache を返しつつバックグラウンド fetch する
			expect(result).toEqual(cachedData.data);
			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
		});

		it("should call fetchPrs when cached lastUpdatedAt is invalid (NaN ageMs)", async () => {
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "not-a-valid-date",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const processedData = { ...mockProcessedResult, hasMore: false };
			mockSendMessage.mockResolvedValue({ ok: true as const, data: processedData });

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			expect(result).toEqual({ ...mockProcessedResult, hasMore: false });
		});

		it("should call fetchPrs when cached lastUpdatedAt is in the future (negative ageMs)", async () => {
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2099-01-01T00:00:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const processedData = { ...mockProcessedResult, hasMore: false };
			mockSendMessage.mockResolvedValue({ ok: true as const, data: processedData });

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			expect(result).toEqual({ ...mockProcessedResult, hasMore: false });
		});

		it("should call fetchPrs when no cache exists", async () => {
			mockStorage.get.mockResolvedValue(null);

			const processedData = { ...mockProcessedResult, hasMore: false };
			mockSendMessage.mockResolvedValue({ ok: true as const, data: processedData });

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.loadPrsWithCache(5);

			expect(mockSendMessage).toHaveBeenCalledWith("FETCH_PRS");
			// キャッシュなし時は fetch 結果を返す
			expect(result).toEqual({ ...mockProcessedResult, hasMore: false });
		});
	});

	describe("getCachedPrs", () => {
		it("should return cached data from StoragePort.get", async () => {
			const cachedData = {
				data: { ...mockProcessedResult, hasMore: false },
				lastUpdatedAt: "2026-03-22T10:00:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.getCachedPrs();

			expect(mockStorage.get).toHaveBeenCalledWith(PR_CACHE_KEY, expect.any(Function));
			expect(result).toEqual(cachedData);
		});

		it("should return null when no cache exists", async () => {
			mockStorage.get.mockResolvedValue(null);

			const useCase = createPrUseCase(mockSendMessage as SendMessage, mockStorage);
			const result = await useCase.getCachedPrs();

			expect(result).toBeNull();
		});
	});
});
