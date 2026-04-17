/**
 * Claude セッション ID の形式検証ユーティリティ。
 *
 * claude.ai/code のセッション ID は内部的に `session_` プレフィックスを持つが、
 * 信頼できない経路 (scraper の React fiber 経由、UI の手入力) から取得されるため、
 * ストレージ保存前とクリック遷移前に必ず検証する必要がある。
 *
 * suffix の最大長 (128) は claude.ai の ULID/UUID 表現 + 安全マージンから決定。
 * path traversal (`../`)、クエリ混入 (`?`)、フラグメント (`#`) を弾く目的で
 * 英数字・ハイフン・アンダースコアのみ許可する。
 */
export const SESSION_ID_PATTERN: RegExp = /^session_[a-zA-Z0-9_-]{1,128}$/;

export function isValidSessionId(value: unknown): value is string {
	return typeof value === "string" && SESSION_ID_PATTERN.test(value);
}

/**
 * claude.ai/code のセッション URL から sessionId を抽出する。
 * URL 末尾セグメントが `session_...` パターンに合致しない場合は null を返す。
 * クエリ・フラグメントは許容して落とす (SESSION_ID_PATTERN 自体は弾くため)。
 */
export function extractSessionIdFromUrl(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const segments = parsed.pathname.split("/").filter((s) => s.length > 0);
	const last = segments[segments.length - 1];
	if (last === undefined) return null;
	return isValidSessionId(last) ? last : null;
}
