/**
 * PR URL からベース URL (PR TOP ページ) を抽出する。
 * PR URL でない場合は null を返す。
 *
 * 例: "https://github.com/owner/repo/pull/123/files#diff-abc" → "https://github.com/owner/repo/pull/123"
 */
const MAX_URL_LENGTH = 2048;

export function extractPrBaseUrl(url: string): string | null {
	if (url.length > MAX_URL_LENGTH) return null;

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}

	if (parsed.hostname !== "github.com") {
		return null;
	}

	const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
	if (!match) {
		return null;
	}

	return `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
}
