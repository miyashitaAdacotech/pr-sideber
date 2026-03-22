import type { AlarmPort } from "../../domain/ports/alarm.port";
import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import { type CachedPrData, PR_CACHE_KEY, isCachedPrData } from "../types/cache";

type AutoRefreshDeps = {
	readonly alarm: AlarmPort;
	readonly storage: StoragePort;
	readonly fetchAndProcessPrs: () => Promise<ProcessedPrsResult & { hasMore: boolean }>;
};

export function createAutoRefreshUseCase(deps: AutoRefreshDeps) {
	const ALARM_NAME = "pr-refresh";
	const INTERVAL_MINUTES = 5;

	let started = false;
	let unsubscribe: (() => void) | null = null;

	function start(): void {
		if (started) {
			return;
		}
		started = true;
		deps.alarm.create(ALARM_NAME, INTERVAL_MINUTES);
		unsubscribe = deps.alarm.onAlarm((name: string) => {
			if (name === ALARM_NAME) {
				refresh();
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
		await deps.storage.set(PR_CACHE_KEY, {
			data,
			lastUpdatedAt: new Date().toISOString(),
		});
	}

	async function getCachedPrs(): Promise<CachedPrData | null> {
		return deps.storage.get(PR_CACHE_KEY, isCachedPrData);
	}

	return { start, stop, refresh, getCachedPrs };
}
