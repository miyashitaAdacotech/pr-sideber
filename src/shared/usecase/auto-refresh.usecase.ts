import type { AlarmPort } from "../../domain/ports/alarm.port";
import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import { type CachedPrData, PR_CACHE_KEY, isCachedPrData } from "../types/cache";

type AutoRefreshDeps = {
	readonly alarm: AlarmPort;
	readonly storage: StoragePort;
	readonly fetchAndProcessPrs: () => Promise<ProcessedPrsResult & { hasMore: boolean }>;
	readonly notifyCacheUpdated: (lastUpdatedAt: string) => Promise<void>;
	/** 非同期処理が必要な場合は呼び出し側で .catch() すること（同期例外のみ捕捉される） */
	readonly onRefreshComplete?: (data: ProcessedPrsResult & { hasMore: boolean }) => void;
};

export function createAutoRefreshUseCase(deps: AutoRefreshDeps) {
	const ALARM_NAME = "pr-refresh";
	const INTERVAL_MINUTES = 0.5; // 30秒 (chrome.alarms の最小値)

	let started = false;
	let unsubscribe: (() => void) | null = null;

	async function start(): Promise<void> {
		if (started) {
			return;
		}
		started = true;
		await deps.alarm.create(ALARM_NAME, INTERVAL_MINUTES);
		unsubscribe = deps.alarm.onAlarm((name: string) => {
			if (name === ALARM_NAME) {
				refresh().catch((err: unknown) => {
					if (import.meta.env.DEV) {
						console.error("[auto-refresh] refresh failed:", err);
					}
				});
			}
		});
	}

	async function stop(): Promise<void> {
		if (!started) {
			return;
		}
		await deps.alarm.clear(ALARM_NAME);
		if (unsubscribe) {
			unsubscribe();
			unsubscribe = null;
		}
		started = false;
	}

	async function refresh(): Promise<void> {
		const data = await deps.fetchAndProcessPrs();
		const lastUpdatedAt = new Date().toISOString();
		await deps.storage.set(PR_CACHE_KEY, {
			data,
			lastUpdatedAt,
		});
		try {
			await deps.notifyCacheUpdated(lastUpdatedAt);
		} catch (err: unknown) {
			if (import.meta.env.DEV) {
				console.error("[auto-refresh] notifyCacheUpdated failed:", err);
			}
		}
		if (deps.onRefreshComplete) {
			try {
				deps.onRefreshComplete(data);
			} catch (err: unknown) {
				if (import.meta.env.DEV) {
					console.error("[auto-refresh] onRefreshComplete callback error:", err);
				}
			}
		}
	}

	async function getCachedPrs(): Promise<CachedPrData | null> {
		return deps.storage.get(PR_CACHE_KEY, isCachedPrData);
	}

	return { start, stop, refresh, getCachedPrs };
}
