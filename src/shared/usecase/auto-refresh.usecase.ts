import type { AlarmPort } from "../../domain/ports/alarm.port";
import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import type { CachedPrData } from "../types/cache";

type AutoRefreshDeps = {
	readonly alarm: AlarmPort;
	readonly storage: StoragePort;
	readonly fetchAndProcessPrs: () => Promise<ProcessedPrsResult & { hasMore: boolean }>;
};

export function createAutoRefreshUseCase(_deps: AutoRefreshDeps) {
	function start(): void {
		throw new Error("Not implemented");
	}

	async function stop(): Promise<void> {
		throw new Error("Not implemented");
	}

	async function refresh(): Promise<void> {
		throw new Error("Not implemented");
	}

	async function getCachedPrs(): Promise<CachedPrData | null> {
		throw new Error("Not implemented");
	}

	return { start, stop, refresh, getCachedPrs };
}
