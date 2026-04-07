import type { ClaudeSession, ClaudeSessionStorage } from "../shared/types/claude-session";

const CLAUDE_CODE_URL_PATTERN = "claude.ai/code/";
const STORAGE_KEY = "claudeSessions";

/**
 * Claude Code Web のセッションタイトルから Issue 番号を抽出する。
 *
 * パターン:
 * - "Inv #1882 [#1613] CI/CD App統一" -> 1882
 * - "Investigate issue 2185" -> 2185
 * - "[close] issue 1966" -> 1966
 * - "Inv #2013 -> #2065 [#1671]..." -> 2013
 */
export function extractIssueNumberFromTitle(title: string): number | null {
	// "#数字" パターン (例: "Inv #1882", "#2013 -> #2065")
	const hashMatch = /#(\d+)/.exec(title);
	if (hashMatch) {
		return Number(hashMatch[1]);
	}

	// "issue 数字" パターン — 大文字小文字不問 (例: "Investigate issue 2185")
	const issueMatch = /issue\s+(\d+)/i.exec(title);
	if (issueMatch) {
		return Number(issueMatch[1]);
	}

	return null;
}

/** Content Script から送信されるセッション情報メッセージの型ガード */
function isContentSessionsMessage(msg: unknown): msg is {
	type: "CONTENT_CLAUDE_SESSIONS";
	sessions: ReadonlyArray<{ url: string; title: string }>;
} {
	if (typeof msg !== "object" || msg === null) return false;
	if (!("type" in msg) || (msg as { type: unknown }).type !== "CONTENT_CLAUDE_SESSIONS")
		return false;
	if (!("sessions" in msg) || !Array.isArray((msg as { sessions: unknown }).sessions)) return false;
	return true;
}

export class ClaudeSessionWatcher {
	/** タブ監視を開始し、既存の Claude Code Web タブをスキャンする */
	startWatching(): void {
		chrome.tabs.onUpdated.addListener(this.onTabUpdated.bind(this));
		chrome.tabs.onRemoved.addListener(this.onTabRemoved.bind(this));

		// Content Script からのセッション情報を受信
		chrome.runtime.onMessage.addListener(
			(message: unknown, sender: chrome.runtime.MessageSender) => {
				// 自拡張からのメッセージのみ受け付ける
				if (sender.id !== chrome.runtime.id) return;
				// Content Script は claude.ai/code/ 上でのみ動作するため、sender.url で起源を検証する
				if (!sender.url?.startsWith("https://claude.ai/code/")) return;
				if (!isContentSessionsMessage(message)) return;
				this.handleContentScriptSessions(message.sessions).catch((err: unknown) => {
					console.error("[DEBUG:watcher] handleContentScriptSessions failed:", err);
				});
			},
		);

		// 起動時に既に開いている Claude Code Web タブを検出
		this.scanExistingTabs().catch(() => {
			// スキャン失敗は非致命的（次の onUpdated で拾える）
		});
	}

	/** 既存の Claude Code Web タブをスキャンしてセッションを保存する */
	private async scanExistingTabs(): Promise<void> {
		const tabs = await chrome.tabs.query({ url: "*://claude.ai/code/*" });
		if (import.meta.env.DEV) {
			console.log(`[DEBUG:watcher] scanExistingTabs: ${tabs.length} tabs found`);
		}
		for (const tab of tabs) {
			if (!tab.url?.includes(CLAUDE_CODE_URL_PATTERN)) continue;
			const title = tab.title ?? "";
			const issueNumber = extractIssueNumberFromTitle(title);
			if (import.meta.env.DEV) {
				console.log(`[DEBUG:watcher] tab="${title}" url=${tab.url} → issueNumber=${issueNumber}`);
			}
			if (issueNumber === null) continue;

			const session: ClaudeSession = {
				sessionUrl: tab.url,
				title,
				issueNumber,
				detectedAt: new Date().toISOString(),
				isLive: true,
			};
			await this.saveSession(session);
		}
	}

	private async onTabUpdated(
		_tabId: number,
		changeInfo: { url?: string; title?: string },
		tab: chrome.tabs.Tab,
	): Promise<void> {
		if (!changeInfo.url && !changeInfo.title) return;
		if (!tab.url?.includes(CLAUDE_CODE_URL_PATTERN)) return;

		const title = tab.title ?? "";
		const issueNumber = extractIssueNumberFromTitle(title);
		if (import.meta.env.DEV) {
			console.log(`[DEBUG:watcher] onTabUpdated: title="${title}" → issueNumber=${issueNumber}`);
		}
		if (issueNumber === null) return;

		const session: ClaudeSession = {
			sessionUrl: tab.url,
			title,
			issueNumber,
			detectedAt: new Date().toISOString(),
			isLive: true,
		};

		await this.saveSession(session);
	}

	private async onTabRemoved(_tabId: number): Promise<void> {
		await this.refreshLiveStatus();
	}

	/** 全セッションを取得 */
	async getSessions(): Promise<ClaudeSessionStorage> {
		const result = await chrome.storage.local.get(STORAGE_KEY);
		return (result[STORAGE_KEY] as ClaudeSessionStorage) ?? {};
	}

	/** CLOSE された Issue のセッション履歴を削除 */
	async cleanupClosedIssues(openIssueNumbers: ReadonlySet<number>): Promise<void> {
		const storage = await this.getSessions();
		const updated: Record<string, ClaudeSession[]> = {};
		const deleted: string[] = [];

		for (const [key, sessions] of Object.entries(storage)) {
			const issueNum = Number(key);
			if (openIssueNumbers.has(issueNum)) {
				updated[key] = [...sessions];
			} else {
				deleted.push(key);
			}
		}

		if (import.meta.env.DEV) {
			console.log(
				`[DEBUG:watcher] cleanupClosedIssues: openNumbers=${openIssueNumbers.size}, kept=${Object.keys(updated).length}, deleted=[${deleted.join(",")}]`,
			);
		}
		await chrome.storage.local.set({ [STORAGE_KEY]: updated });
	}

	/**
	 * Content Script から受信したセッション情報を処理し、ストレージに保存する。
	 * Issue 番号が抽出できないセッションはスキップされる。
	 * 複数セッションを一括読み込み→マージ→一括書き込みで処理する。
	 */
	async handleContentScriptSessions(
		sessions: ReadonlyArray<{ readonly url: string; readonly title: string }>,
	): Promise<void> {
		const validSessions: ClaudeSession[] = [];
		for (const { url, title } of sessions) {
			const issueNumber = extractIssueNumberFromTitle(title);
			if (issueNumber === null) continue;
			validSessions.push({
				sessionUrl: url,
				title,
				issueNumber,
				detectedAt: new Date().toISOString(),
				isLive: false,
			});
		}

		if (validSessions.length === 0) return;

		const storage = await this.getSessions();
		let merged: Record<string, readonly ClaudeSession[]> = { ...storage };

		for (const session of validSessions) {
			const key = String(session.issueNumber);
			const existing = merged[key] ?? [];
			const idx = existing.findIndex((s) => s.sessionUrl === session.sessionUrl);
			const updatedSessions =
				idx >= 0 ? existing.map((s, i) => (i === idx ? session : s)) : [...existing, session];
			merged = { ...merged, [key]: updatedSessions };
		}

		await chrome.storage.local.set({ [STORAGE_KEY]: merged });
	}

	private async saveSession(session: ClaudeSession): Promise<void> {
		const storage = await this.getSessions();
		const key = String(session.issueNumber);
		const existing = storage[key] ?? [];

		// 同じ URL のセッションは更新、なければ追加
		const idx = existing.findIndex((s) => s.sessionUrl === session.sessionUrl);
		const updatedSessions =
			idx >= 0 ? existing.map((s, i) => (i === idx ? session : s)) : [...existing, session];

		await chrome.storage.local.set({
			[STORAGE_KEY]: { ...storage, [key]: updatedSessions },
		});
	}

	private async refreshLiveStatus(): Promise<void> {
		const tabs = await chrome.tabs.query({ url: "*://claude.ai/code/*" });
		const liveUrls = new Set(tabs.map((t) => t.url).filter(Boolean));

		const storage = await this.getSessions();
		const updated: Record<string, ClaudeSession[]> = {};

		for (const [key, sessions] of Object.entries(storage)) {
			updated[key] = sessions.map((s) => ({
				...s,
				isLive: liveUrls.has(s.sessionUrl),
			}));
		}

		await chrome.storage.local.set({ [STORAGE_KEY]: updated });
	}
}
