import type { PrProcessorPort, ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { StoragePort } from "../../domain/ports/storage.port";
import type { FetchRawPullRequestsResult } from "../../domain/types/github";
import type { SendMessage } from "../../shared/ports/message.port";
import type { CachedPrData } from "../types/cache";
import { PR_CACHE_KEY, isCachedPrData } from "../types/cache";

export function createPrUseCase(
	sendMessage: SendMessage,
	prProcessor: PrProcessorPort,
	_storage?: StoragePort,
) {
	async function fetchPrs(login: string): Promise<ProcessedPrsResult & { hasMore: boolean }> {
		const response = await sendMessage("FETCH_PRS");
		if (!response.ok) {
			throw new Error(response.error.message);
		}
		const raw: FetchRawPullRequestsResult = response.data;
		const processed = prProcessor.processPullRequests(raw.rawJson, login);
		return { ...processed, hasMore: raw.hasMore };
	}

	async function getCachedPrs(): Promise<CachedPrData | null> {
		throw new Error("Not implemented");
	}

	return { fetchPrs, getCachedPrs };
}
