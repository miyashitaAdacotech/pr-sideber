/**
 * Claude Code Web (claude.ai/code) のセッションリンクを DOM からスクレイプする。
 * Content Script として注入され、セッション一覧を Background に送信する。
 */

const SESSION_LINK_SELECTOR = 'a[href*="/code/session_"]';
const SESSION_PATH_PATTERN = /\/code\/session_/;

interface SessionLink {
	readonly url: string;
	readonly title: string;
}

/**
 * Document 内のセッションリンク要素から URL とタイトルを抽出する。
 * href が `/code/session_` パターンに一致するリンクのみ対象。
 * 同一 URL の重複は最初の出現のみ保持する。
 */
/** Content Script から Background へ送信するメッセージ型 */
interface ContentClaudeSessionsMessage {
	readonly type: "CONTENT_CLAUDE_SESSIONS";
	readonly sessions: readonly SessionLink[];
}

export function scrapeSessionLinks(doc: Document): readonly SessionLink[] {
	const anchors = doc.querySelectorAll<HTMLAnchorElement>(SESSION_LINK_SELECTOR);
	const seen = new Set<string>();
	const results: SessionLink[] = [];

	for (const anchor of anchors) {
		const href = anchor.getAttribute("href") ?? "";
		if (!SESSION_PATH_PATTERN.test(href)) continue;

		// href 属性の生値を使う（相対パスの場合は anchor.href で絶対化される場合がある）
		const url = anchor.href || href;
		if (seen.has(url)) continue;
		seen.add(url);

		results.push({
			url,
			title: anchor.textContent?.trim() ?? "",
		});
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
