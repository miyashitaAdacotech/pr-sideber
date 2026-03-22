/**
 * ISO 8601 日付文字列を相対時間表示に変換する。
 * 不正な入力や未来の日付にも安全に対応する。
 */
export function formatRelativeTime(dateStr: string): string {
	const then = new Date(dateStr).getTime();
	if (Number.isNaN(then)) return "—";

	const diffMs = Date.now() - then;
	if (diffMs < 0) return "just now";

	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHours = Math.floor(diffMin / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	const diffDays = Math.floor(diffHours / 24);
	return `${diffDays}d ago`;
}
