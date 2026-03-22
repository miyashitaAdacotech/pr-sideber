import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";

export const PR_CACHE_KEY = "pr_cache";

export type CachedPrData = {
	readonly data: ProcessedPrsResult & { readonly hasMore: boolean };
	readonly lastUpdatedAt: string;
};

export function isCachedPrData(value: unknown): value is CachedPrData {
	if (value === null || value === undefined || typeof value !== "object") {
		return false;
	}
	const obj = value as Record<string, unknown>;
	if (typeof obj.lastUpdatedAt !== "string") {
		return false;
	}
	if (obj.data === null || obj.data === undefined || typeof obj.data !== "object") {
		return false;
	}
	const data = obj.data as Record<string, unknown>;
	if (typeof data.hasMore !== "boolean") {
		return false;
	}
	if (data.myPrs === null || data.myPrs === undefined || typeof data.myPrs !== "object") {
		return false;
	}
	const myPrs = data.myPrs as Record<string, unknown>;
	if (!Array.isArray(myPrs.items)) {
		return false;
	}
	if (
		data.reviewRequests === null ||
		data.reviewRequests === undefined ||
		typeof data.reviewRequests !== "object"
	) {
		return false;
	}
	const reviewRequests = data.reviewRequests as Record<string, unknown>;
	if (!Array.isArray(reviewRequests.items)) {
		return false;
	}
	return true;
}
