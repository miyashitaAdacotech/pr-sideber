/**
 * URL が https:// で始まる場合のみそのまま返す。
 * それ以外（javascript:, data:, http:// 等）は "#" にフォールバックする。
 */
export function safeUrl(url: string): string {
	return url.startsWith("https://") ? url : "#";
}
