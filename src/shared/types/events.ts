/**
 * Background → Side Panel 通知用イベント型。
 */

export type CacheUpdatedEvent = {
	readonly type: "CACHE_UPDATED";
	readonly lastUpdatedAt: string;
};

export function isCacheUpdatedEvent(value: unknown): value is CacheUpdatedEvent {
	if (value === null || value === undefined || typeof value !== "object") {
		return false;
	}
	const obj = value as Record<string, unknown>;
	if (obj.type !== "CACHE_UPDATED" || typeof obj.lastUpdatedAt !== "string") {
		return false;
	}
	return Number.isFinite(new Date(obj.lastUpdatedAt as string).getTime());
}
