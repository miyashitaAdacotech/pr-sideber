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

export type TabUrlChangedEvent = {
	readonly type: "TAB_URL_CHANGED";
	readonly url: string;
};

export function isTabUrlChangedEvent(value: unknown): value is TabUrlChangedEvent {
	if (value === null || value === undefined || typeof value !== "object") {
		return false;
	}
	const obj = value as Record<string, unknown>;
	if (obj.type !== "TAB_URL_CHANGED" || typeof obj.url !== "string") {
		return false;
	}
	return obj.url.length > 0;
}

/**
 * Background → Side Panel: Claude Code Web セッションの保存内容が更新されたことを通知する。
 * Side Panel はこれを受信したら getClaudeSessions() を再実行して UI を更新する。
 */
export type ClaudeSessionsUpdatedEvent = {
	readonly type: "CLAUDE_SESSIONS_UPDATED";
};

export function isClaudeSessionsUpdatedEvent(value: unknown): value is ClaudeSessionsUpdatedEvent {
	if (value === null || value === undefined || typeof value !== "object") {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return obj.type === "CLAUDE_SESSIONS_UPDATED";
}
