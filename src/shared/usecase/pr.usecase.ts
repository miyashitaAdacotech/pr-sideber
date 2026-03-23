import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import type { SendMessage } from "../../shared/ports/message.port";
import type { CachedPrData } from "../types/cache";
import { PR_CACHE_KEY, isCachedPrData } from "../types/cache";

export function createPrUseCase(sendMessage: SendMessage, storage?: StoragePort) {
	async function fetchPrs(): Promise<ProcessedPrsResult & { hasMore: boolean }> {
		const response = await sendMessage("FETCH_PRS");
		if (!response.ok) {
			throw new Error(response.error.message);
		}
		const result = response.data;

		if (storage) {
			try {
				await storage.set(PR_CACHE_KEY, {
					data: result,
					lastUpdatedAt: new Date().toISOString(),
				});
			} catch (err: unknown) {
				if (import.meta.env.DEV) {
					console.warn("[pr.usecase] cache write failed:", err);
				}
			}
		}

		return result;
	}

	async function loadPrsWithCache(
		freshMinutes: number,
	): Promise<(ProcessedPrsResult & { hasMore: boolean }) | null> {
		if (!storage) {
			return fetchPrs();
		}

		const cached = await storage.get(PR_CACHE_KEY, isCachedPrData);
		if (!cached) {
			return fetchPrs();
		}

		const ageMs = Date.now() - new Date(cached.lastUpdatedAt).getTime();
		if (!Number.isFinite(ageMs) || ageMs < 0) {
			// lastUpdatedAt が不正 → キャッシュ無効として fetch
			return fetchPrs();
		}
		const freshMs = freshMinutes * 60 * 1000;

		if (ageMs < freshMs) {
			// キャッシュが新鮮: そのまま返す
			return cached.data;
		}

		// キャッシュが古い: stale データを返しつつバックグラウンドで更新
		fetchPrs().catch((err: unknown) => {
			if (import.meta.env.DEV) {
				console.warn("[pr.usecase] background fetch failed:", err);
			}
		});

		return cached.data;
	}

	async function getCachedPrs(): Promise<CachedPrData | null> {
		if (!storage) {
			return null;
		}
		return storage.get(PR_CACHE_KEY, isCachedPrData);
	}

	return { fetchPrs, loadPrsWithCache, getCachedPrs };
}
