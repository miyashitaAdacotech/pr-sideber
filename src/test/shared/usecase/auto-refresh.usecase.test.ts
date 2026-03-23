import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlarmPort } from "../../../domain/ports/alarm.port";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../../domain/ports/storage.port";
import { PR_CACHE_KEY } from "../../../shared/types/cache";
import { createAutoRefreshUseCase } from "../../../shared/usecase/auto-refresh.usecase";

describe("auto-refresh usecase", () => {
	let mockAlarm: AlarmPort & {
		create: ReturnType<typeof vi.fn>;
		clear: ReturnType<typeof vi.fn>;
		onAlarm: ReturnType<typeof vi.fn>;
	};
	let mockStorage: StoragePort & {
		get: ReturnType<typeof vi.fn>;
		set: ReturnType<typeof vi.fn>;
		remove: ReturnType<typeof vi.fn>;
	};
	let mockFetchAndProcessPrs: ReturnType<typeof vi.fn>;
	let mockNotifyCacheUpdated: ReturnType<typeof vi.fn>;
	let capturedAlarmCallback: ((name: string) => void) | undefined;
	const mockUnsubscribe = vi.fn();

	const mockProcessedResult: ProcessedPrsResult & { hasMore: boolean } = {
		myPrs: {
			items: [
				{
					id: "PR_1",
					number: 1,
					title: "feat: test",
					author: "testuser",
					url: "https://github.com/owner/repo/pull/1",
					repository: "owner/repo",
					isDraft: false,
					approvalStatus: "Approved",
					ciStatus: "Passed",
					additions: 10,
					deletions: 5,
					createdAt: "2026-03-20T00:00:00Z",
					updatedAt: "2026-03-21T00:00:00Z",
				},
			],
			totalCount: 1,
		},
		reviewRequests: { items: [], totalCount: 0 },
		hasMore: false,
	};

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));

		capturedAlarmCallback = undefined;
		mockAlarm = {
			create: vi.fn().mockResolvedValue(undefined),
			clear: vi.fn().mockResolvedValue(true),
			onAlarm: vi.fn((callback: (name: string) => void) => {
				capturedAlarmCallback = callback;
				return mockUnsubscribe;
			}),
		};

		mockStorage = {
			get: vi.fn().mockResolvedValue(null),
			set: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		};

		mockFetchAndProcessPrs = vi.fn().mockResolvedValue(mockProcessedResult);
		mockNotifyCacheUpdated = vi.fn().mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function createUseCase() {
		return createAutoRefreshUseCase({
			alarm: mockAlarm,
			storage: mockStorage,
			fetchAndProcessPrs: mockFetchAndProcessPrs,
			notifyCacheUpdated: mockNotifyCacheUpdated,
		});
	}

	describe("start", () => {
		it("should create an alarm named 'pr-refresh' with 30-second interval", async () => {
			const useCase = createUseCase();
			await useCase.start();

			expect(mockAlarm.create).toHaveBeenCalledWith("pr-refresh", 0.5);
		});

		it("should register an onAlarm listener", async () => {
			const useCase = createUseCase();
			await useCase.start();

			expect(mockAlarm.onAlarm).toHaveBeenCalledTimes(1);
		});

		it("should not create duplicate alarms when start is called twice", async () => {
			const useCase = createUseCase();
			await useCase.start();
			await useCase.start();
			expect(mockAlarm.create).toHaveBeenCalledTimes(1);
		});
	});

	describe("stop", () => {
		it("should clear the alarm", async () => {
			const useCase = createUseCase();
			await useCase.start();
			await useCase.stop();

			expect(mockAlarm.clear).toHaveBeenCalledWith("pr-refresh");
		});

		it("should unsubscribe the alarm listener", async () => {
			const useCase = createUseCase();
			await useCase.start();
			await useCase.stop();

			expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
		});

		it("should not throw when stop is called without start", async () => {
			const useCase = createUseCase();
			await expect(useCase.stop()).resolves.not.toThrow();
		});
	});

	describe("refresh", () => {
		it("should fetch PRs and save to cache via StoragePort", async () => {
			const useCase = createUseCase();
			await useCase.refresh();

			expect(mockFetchAndProcessPrs).toHaveBeenCalledTimes(1);
			expect(mockStorage.set).toHaveBeenCalledWith(PR_CACHE_KEY, {
				data: mockProcessedResult,
				lastUpdatedAt: "2026-03-22T12:00:00.000Z",
			});
		});

		it("should include lastUpdatedAt as ISO 8601 string in saved data", async () => {
			const useCase = createUseCase();
			await useCase.refresh();

			const savedData = mockStorage.set.mock.calls[0][1] as { lastUpdatedAt: string };
			expect(savedData.lastUpdatedAt).toBe("2026-03-22T12:00:00.000Z");
			// ISO 8601 形式であることを確認
			expect(new Date(savedData.lastUpdatedAt).toISOString()).toBe(savedData.lastUpdatedAt);
		});

		it("should call notifyCacheUpdated with lastUpdatedAt after successful refresh", async () => {
			const useCase = createUseCase();
			await useCase.refresh();

			expect(mockNotifyCacheUpdated).toHaveBeenCalledWith("2026-03-22T12:00:00.000Z");
		});

		it("should still succeed when notifyCacheUpdated throws", async () => {
			mockNotifyCacheUpdated.mockRejectedValue(new Error("Notification failed"));

			const useCase = createUseCase();
			await expect(useCase.refresh()).resolves.not.toThrow();

			expect(mockFetchAndProcessPrs).toHaveBeenCalledTimes(1);
			expect(mockStorage.set).toHaveBeenCalledTimes(1);
		});

		it("should not update cache when fetch fails, and propagate the error", async () => {
			mockFetchAndProcessPrs.mockRejectedValue(new Error("API error"));

			const useCase = createUseCase();

			await expect(useCase.refresh()).rejects.toThrow("API error");
			expect(mockStorage.set).not.toHaveBeenCalled();
		});
	});

	describe("getCachedPrs", () => {
		it("should read cache from StoragePort.get", async () => {
			const cachedData = {
				data: mockProcessedResult,
				lastUpdatedAt: "2026-03-22T10:00:00.000Z",
			};
			mockStorage.get.mockResolvedValue(cachedData);

			const useCase = createUseCase();
			const result = await useCase.getCachedPrs();

			expect(mockStorage.get).toHaveBeenCalledWith(PR_CACHE_KEY, expect.any(Function));
			expect(result).toEqual(cachedData);
		});

		it("should return null when no cache exists", async () => {
			mockStorage.get.mockResolvedValue(null);

			const useCase = createUseCase();
			const result = await useCase.getCachedPrs();

			expect(result).toBeNull();
		});
	});

	describe("onRefreshComplete callback", () => {
		function createUseCaseWithCallback(
			onRefreshComplete: (data: ProcessedPrsResult & { hasMore: boolean }) => void,
		) {
			return createAutoRefreshUseCase({
				alarm: mockAlarm,
				storage: mockStorage,
				fetchAndProcessPrs: mockFetchAndProcessPrs,
				notifyCacheUpdated: mockNotifyCacheUpdated,
				onRefreshComplete,
			});
		}

		it("should call onRefreshComplete with fetched data after successful refresh", async () => {
			const onRefreshComplete = vi.fn();
			const useCase = createUseCaseWithCallback(onRefreshComplete);
			await useCase.refresh();

			expect(onRefreshComplete).toHaveBeenCalledWith(mockProcessedResult);
		});

		it("should not call onRefreshComplete when fetch fails", async () => {
			mockFetchAndProcessPrs.mockRejectedValue(new Error("API error"));
			const onRefreshComplete = vi.fn();
			const useCase = createUseCaseWithCallback(onRefreshComplete);

			await expect(useCase.refresh()).rejects.toThrow("API error");
			expect(onRefreshComplete).not.toHaveBeenCalled();
		});

		it("should not throw when onRefreshComplete is not provided", async () => {
			const useCase = createUseCase();
			await expect(useCase.refresh()).resolves.not.toThrow();
		});

		it("should not propagate error when onRefreshComplete throws", async () => {
			const onRefreshComplete = vi.fn().mockImplementation(() => {
				throw new Error("Callback explosion");
			});
			const useCase = createUseCaseWithCallback(onRefreshComplete);

			await expect(useCase.refresh()).resolves.not.toThrow();
			expect(onRefreshComplete).toHaveBeenCalledWith(mockProcessedResult);
		});
	});

	describe("alarm trigger", () => {
		it("should call refresh when the pr-refresh alarm fires", async () => {
			const useCase = createUseCase();
			await useCase.start();

			expect(capturedAlarmCallback).toBeDefined();
			// アラーム発火をシミュレート
			capturedAlarmCallback?.("pr-refresh");
			// refresh() は catch 内で処理されるため、Promise の解決を待つ
			await vi.waitFor(() => {
				expect(mockFetchAndProcessPrs).toHaveBeenCalledTimes(1);
			});
			expect(mockStorage.set).toHaveBeenCalledTimes(1);
		});

		it("should NOT call refresh when a different alarm fires", async () => {
			const useCase = createUseCase();
			await useCase.start();
			capturedAlarmCallback?.("some-other-alarm");
			expect(mockFetchAndProcessPrs).not.toHaveBeenCalled();
		});
	});
});
