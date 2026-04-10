/**
 * Claude Code Web (claude.ai/code) のセッションリンクを DOM からスクレイプする。
 * Content Script として注入され、セッション一覧を Background に送信する。
 *
 * React の内部 fiber ツリー (__reactFiber$<hash>) を走査して session 情報を取得する。
 * claude.ai は React SPA であり、DOM 属性にセッション ID が露出しないため、
 * fiber の memoizedProps.session から直接読み取る方式を採用している。
 */

const SESSION_CONTAINER_SELECTOR = "div.cursor-pointer";
const FIBER_KEY_PREFIX = "__reactFiber$";
const MAX_FIBER_DEPTH = 10;
const CLAUDE_CODE_BASE_URL = "https://claude.ai/code/";
/** session.id は session_ + 英数字/ハイフン/アンダースコアのみ許可 (path traversal / query 混入防止) */
const SESSION_ID_PATTERN = /^session_[a-zA-Z0-9_-]{1,128}$/;

interface SessionLink {
	readonly url: string;
	readonly title: string;
}

/** Content Script から Background へ送信するメッセージ型 */
interface ContentClaudeSessionsMessage {
	readonly type: "CONTENT_CLAUDE_SESSIONS";
	readonly sessions: readonly SessionLink[];
}

/**
 * DOM 要素から React fiber のキー名を探す。
 * React は __reactFiber$<ランダムハッシュ> というプロパティ名で fiber を格納する。
 * ハッシュ値はページロードごとに固定なので、最初の発見をキャッシュして再利用する。
 */
let cachedFiberKey: string | null | undefined;

function findFiberKey(element: Element): string | null {
	if (cachedFiberKey !== undefined) return cachedFiberKey;
	const key = Object.keys(element).find((k) => k.startsWith(FIBER_KEY_PREFIX)) ?? null;
	cachedFiberKey = key;
	return key;
}

/**
 * 要素の fiber ツリーを親方向に走査し、memoizedProps.session を探す。
 * React fiber は return プロパティで親ノードを辿れる。
 */
function extractSessionFromFiber(element: Element): SessionLink | null {
	// React fiber は外部非公開 API のため型定義が存在しない
	// biome-ignore lint/suspicious/noExplicitAny: React internal fiber has no public type definitions
	try {
		const fiberKey = findFiberKey(element);
		if (!fiberKey) return null;

		// biome-ignore lint/suspicious/noExplicitAny: React internal fiber has no public type definitions
		let node = (element as any)[fiberKey];
		for (let i = 0; i < MAX_FIBER_DEPTH && node; i++) {
			const session = node.memoizedProps?.session;
			if (session && typeof session.id === "string" && SESSION_ID_PATTERN.test(session.id)) {
				return {
					url: `${CLAUDE_CODE_BASE_URL}${session.id}`,
					title: typeof session.title === "string" ? session.title.slice(0, 500) : "",
				};
			}
			node = node.return;
		}
	} catch (e) {
		// fiber プロパティへのアクセスが Proxy 等で例外を投げる可能性がある
		console.error("[claude-session-scraper] fiber extraction failed:", e);
	}
	return null;
}

/**
 * Document 内の React fiber からセッション情報を抽出する。
 * 同一 URL の重複は最初の出現のみ保持する。
 */
export function scrapeSessionLinks(doc: Document): readonly SessionLink[] {
	// ページロードごとにハッシュが変わるためキャッシュをリセット
	cachedFiberKey = undefined;

	const rows = doc.querySelectorAll(SESSION_CONTAINER_SELECTOR);
	const seen = new Set<string>();
	const results: SessionLink[] = [];

	for (const row of rows) {
		const session = extractSessionFromFiber(row);
		if (!session) continue;
		if (seen.has(session.url)) continue;
		seen.add(session.url);
		results.push(session);
	}

	if (results.length === 0 && doc.location?.href?.includes("claude.ai/code")) {
		// セレクタや fiber 構造が変更された可能性がある（将来の DOM 改修検知用）
		console.warn(
			"[claude-session-scraper] 0 sessions found on claude.ai/code. Selector or fiber structure may have changed.",
		);
	}

	return results;
}

// --- Content Script 自動実行 ---

function sendSessionsToBackground(): void {
	const sessions = scrapeSessionLinks(document);
	if (sessions.length === 0) return;

	const message: ContentClaudeSessionsMessage = {
		type: "CONTENT_CLAUDE_SESSIONS",
		sessions,
	};
	// fire-and-forget: Background 側で受信処理する
	chrome.runtime.sendMessage(message).catch((err: unknown) => {
		console.error("[claude-session-scraper] sendMessage failed:", err);
	});
}

// MutationObserver の高頻度発火を抑制するデバウンス
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 1000;

function debouncedSend(): void {
	if (debounceTimer !== null) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		sendSessionsToBackground();
		debounceTimer = null;
	}, DEBOUNCE_MS);
}

// 初回実行 (document_idle で注入されるため DOM は準備済み)
sendSessionsToBackground();

// DOM 変更監視 (SPA でセッション一覧が動的に更新される)
const observer = new MutationObserver(debouncedSend);
observer.observe(document.body, { childList: true, subtree: true });
