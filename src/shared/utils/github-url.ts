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

/**
 * Issue URL からベース URL (Issue TOP ページ) を抽出する。
 * Issue URL でない場合は null を返す。
 *
 * 例: "https://github.com/owner/repo/issues/42#comment-123" → "https://github.com/owner/repo/issues/42"
 */
export function extractIssueBaseUrl(url: string): string | null {
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

	const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
	if (!match) {
		return null;
	}

	return `https://github.com/${match[1]}/${match[2]}/issues/${match[3]}`;
}

/**
 * URL が PR のサブページ (/files, /commits, /checks など) かどうかを判定する。
 * PR トップページ自体は false を返す。
 */
export function isPrSubPage(url: string): boolean {
	if (url.length > MAX_URL_LENGTH) return false;

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}

	if (parsed.hostname !== "github.com") {
		return false;
	}

	// /owner/repo/pull/123/files のように、pull/数字 の後にさらにパスセグメントがあるか
	const match = parsed.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+\/(.+)/);
	return match !== null;
}
