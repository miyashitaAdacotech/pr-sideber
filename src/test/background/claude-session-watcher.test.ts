import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ClaudeSessionWatcher,
	extractIssueNumberFromTitle,
} from "../../background/claude-session-watcher";
import { type getChromeMock, resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

describe("extractIssueNumberFromTitle", () => {
	it("extracts from 'Inv #1882 [#1613] CI/CD App統一'", () => {
		expect(extractIssueNumberFromTitle("Inv #1882 [#1613] CI/CD App統一")).toBe(1882);
	});

	it("extracts from 'Investigate issue 2185'", () => {
		expect(extractIssueNumberFromTitle("Investigate issue 2185")).toBe(2185);
	});

	it("extracts from 'Investigate Issue 1325'", () => {
		expect(extractIssueNumberFromTitle("Investigate Issue 1325")).toBe(1325);
	});

	it("extracts from '[close] issue 1966'", () => {
		expect(extractIssueNumberFromTitle("[close] issue 1966")).toBe(1966);
	});

	it("extracts from 'Inv #2013 -> #2065 [#1671]...'", () => {
		expect(extractIssueNumberFromTitle("Inv #2013 -> #2065 [#1671]...")).toBe(2013);
	});

	it("returns null for 'Plan model optimization algorithm ...'", () => {
		expect(extractIssueNumberFromTitle("Plan model optimization algorithm ...")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractIssueNumberFromTitle("")).toBeNull();
	});

	it("returns null for 'Claude Code'", () => {
		expect(extractIssueNumberFromTitle("Claude Code")).toBeNull();
	});

	// Issue #19: Claude Code Web の個別セッションタブでは " | Claude Code" サフィックス付きタイトルになる
	it("extracts from 'Investigate issue 2375 | Claude Code'", () => {
		expect(extractIssueNumberFromTitle("Investigate issue 2375 | Claude Code")).toBe(2375);
	});

	it("extracts from 'Inv #1882 fix tests | Claude Code'", () => {
		expect(extractIssueNumberFromTitle("Inv #1882 fix tests | Claude Code")).toBe(1882);
	});

	// Issue #40: "Epic N" 形式のタイトル (# や 'issue' キーワードを含まない) にも対応する
	it("extracts from 'playwright codegenみたいなのEpic 2576'", () => {
		expect(extractIssueNumberFromTitle("playwright codegenみたいなのEpic 2576")).toBe(2576);
	});

	it("extracts from 'epic 42' (lowercase)", () => {
		expect(extractIssueNumberFromTitle("epic 42")).toBe(42);
	});

	it("extracts from 'Epic 2576 | Claude Code' with suffix", () => {
		expect(extractIssueNumberFromTitle("Epic 2576 | Claude Code")).toBe(2576);
	});

	// `#` パターンが Epic より優先されることを保証する (混在ケース)
	it("prioritizes '#N' over 'Epic N' when both appear", () => {
		expect(extractIssueNumberFromTitle("Inv #1000 Epic 2576")).toBe(1000);
	});

	// Issue #3268 (PR feature/fix-bug-3268): 末尾数字フォールバックを廃止し、明示 prefix
	// (#NNN / issue NNN / epic NNN) のみで自動抽出する方針に転換した。
	// 業界標準 (GitHub Autolink, Jira Smart Commits, Linear Magic Links) は prefix 必須型を採用しており、
	// 自由形式タイトルから自然言語的に数字を抽出する設計は誤検出が多くデグレを繰り返したため。
	// 詳細: docs/adr/002-session-issue-mapping-prefix-only.md
	it("returns null for 'Context Rot対策 2598' (trailing digit without prefix is no longer extracted)", () => {
		expect(extractIssueNumberFromTitle("Context Rot対策 2598")).toBeNull();
	});

	it("returns null for 'Context Rot対策 2598 | Claude Code' (trailing digit without prefix)", () => {
		expect(extractIssueNumberFromTitle("Context Rot対策 2598 | Claude Code")).toBeNull();
	});

	it("returns null for '2026 roadmap'", () => {
		expect(extractIssueNumberFromTitle("2026 roadmap")).toBeNull();
	});

	it("returns null for 'Plan for 2026 migration'", () => {
		expect(extractIssueNumberFromTitle("Plan for 2026 migration")).toBeNull();
	});

	it("returns null for 'V2598' (no prefix)", () => {
		expect(extractIssueNumberFromTitle("V2598")).toBeNull();
	});

	it("returns null for 'some title 42' (no prefix)", () => {
		expect(extractIssueNumberFromTitle("some title 42")).toBeNull();
	});

	// Issue #3268 デグレード再発防止 fixture: 日本語境界 + 丸付き数字 suffix のセッションタイトル。
	// `#` prefix なしのタイトルは null となり、UI 側で「未紐付け」セクションに出して手動紐付けに誘導する想定。
	it("returns null for '[sdk] libclang のBlackSmith検証3268①' (Japanese boundary + circled digit suffix without #)", () => {
		expect(extractIssueNumberFromTitle("[sdk] libclang のBlackSmith検証3268①")).toBeNull();
	});

	// 同タイトルでも `#` を含めれば自動抽出される (運用で `#NNN` を含める方針)
	it("extracts from '[sdk] libclang のBlackSmith検証#3268⓪' (with #, even with circled digit suffix)", () => {
		expect(extractIssueNumberFromTitle("[sdk] libclang のBlackSmith検証#3268⓪")).toBe(3268);
	});

	it("extracts from '[codegen]P5 総合#2576⑤' (with #)", () => {
		expect(extractIssueNumberFromTitle("[codegen]P5 総合#2576⑤")).toBe(2576);
	});

	it("extracts from '[ZodError] issue #3065①' (with #, prefers # over 'issue' keyword)", () => {
		expect(extractIssueNumberFromTitle("[ZodError] issue #3065①")).toBe(3065);
	});

	// 優先順確認: 末尾数字より # が優先 (旧 fallback が発火していた場合のリグレッション fixture)
	it("prioritizes '#N' when trailing digit also exists", () => {
		expect(extractIssueNumberFromTitle("something #100 context 2598")).toBe(100);
	});
});

describe("ClaudeSessionWatcher", () => {
	let watcher: ClaudeSessionWatcher;
	let chromeMock: ReturnType<typeof getChromeMock>;

	beforeEach(() => {
		chromeMock = setupChromeMock();
		chromeMock.storage.local.get.mockResolvedValue({});
		chromeMock.storage.local.set.mockResolvedValue(undefined);
		chromeMock.tabs.query.mockResolvedValue([]);
		// notifySidePanel から呼ばれる runtime.sendMessage のデフォルトモック (resolve)
		chromeMock.runtime.sendMessage.mockResolvedValue(undefined);
		watcher = new ClaudeSessionWatcher();
	});

	afterEach(() => {
		resetChromeMock();
		vi.restoreAllMocks();
	});

	describe("scanExistingTabs — Issue #19 再現", () => {
		it("ダッシュボードタブ (タイトル 'Claude Code') ではセッションが保存されない", async () => {
			chromeMock.tabs.query.mockResolvedValue([
				{
					id: 1,
					url: "https://claude.ai/code/draft_09baa7d1-8aaf-4a38-8a2d-e56c3256a0c0",
					title: "Claude Code",
				},
			]);

			watcher.startWatching();
			await vi.waitFor(() => {
				expect(chromeMock.tabs.query).toHaveBeenCalled();
			});

			// storage.local.set が呼ばれていない = セッション未保存
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("個別セッションタブ (タイトルに Issue 番号あり) ならセッションが保存される", async () => {
			chromeMock.tabs.query.mockResolvedValue([
				{
					id: 2,
					url: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
					title: "Investigate issue 2375 | Claude Code",
				},
			]);

			watcher.startWatching();
			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(setCall.claudeSessions["2375"]).toBeDefined();
			expect(setCall.claudeSessions["2375"][0].issueNumber).toBe(2375);
		});
	});

	describe("cleanupClosedIssues — Issue #19 副次的バグ再現", () => {
		it("openNumbers に含まれない Issue のセッションが削除される", async () => {
			// storage に issue 2375 のセッションが保存されている
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"2375": [
						{
							sessionUrl: "https://claude.ai/code/session_abc",
							title: "Investigate issue 2375",
							issueNumber: 2375,
							detectedAt: "2026-04-06T00:00:00Z",
							isLive: false,
						},
					],
					"10": [
						{
							sessionUrl: "https://claude.ai/code/session_def",
							title: "Inv #10 fix",
							issueNumber: 10,
							detectedAt: "2026-04-06T00:00:00Z",
							isLive: true,
						},
					],
				},
			});

			// openNumbers には 10 だけ含まれ、2375 は含まれない
			// (GraphQL first:50 で取得できなかったシナリオ)
			const openNumbers = new Set([10]);
			await watcher.cleanupClosedIssues(openNumbers);

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			// issue 10 のセッションは残る
			expect(setCall.claudeSessions["10"]).toBeDefined();
			// issue 2375 のセッションは消される — これがバグ！
			expect(setCall.claudeSessions["2375"]).toBeUndefined();
		});

		it("openNumbers が空なら全セッションが削除される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"100": [
						{
							sessionUrl: "https://claude.ai/code/s1",
							title: "#100 session",
							issueNumber: 100,
							detectedAt: "2026-04-06T00:00:00Z",
							isLive: false,
						},
					],
				},
			});

			await watcher.cleanupClosedIssues(new Set());

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(Object.keys(setCall.claudeSessions)).toHaveLength(0);
		});
	});

	describe("handleContentScriptSessions — Content Script 連携", () => {
		it("Content Script から受信したセッション情報がストレージに保存される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({});

			await watcher.handleContentScriptSessions([
				{
					url: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
					title: "Investigate issue 2375",
				},
			]);

			expect(chromeMock.storage.local.set).toHaveBeenCalled();
			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(setCall.claudeSessions["2375"]).toBeDefined();
			expect(setCall.claudeSessions["2375"][0]).toMatchObject({
				sessionUrl: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
				title: "Investigate issue 2375",
				issueNumber: 2375,
			});
		});

		it("Issue 番号が抽出できないセッション (タイトルに番号なし) はスキップされる", async () => {
			chromeMock.storage.local.get.mockResolvedValue({});

			await watcher.handleContentScriptSessions([
				{
					url: "https://claude.ai/code/session_noIssue123",
					title: "Plan model optimization algorithm",
				},
			]);

			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("複数セッションが一括で保存される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({});

			await watcher.handleContentScriptSessions([
				{
					url: "https://claude.ai/code/session_aaa",
					title: "Investigate issue 100",
				},
				{
					url: "https://claude.ai/code/session_bbb",
					title: "Inv #200 fix tests",
				},
				{
					url: "https://claude.ai/code/session_ccc",
					title: "[close] issue 300",
				},
			]);

			// 3つの Issue 番号分のセッションが保存される
			const lastSetCall =
				chromeMock.storage.local.set.mock.calls[
					chromeMock.storage.local.set.mock.calls.length - 1
				][0];
			expect(lastSetCall.claudeSessions["100"]).toBeDefined();
			expect(lastSetCall.claudeSessions["200"]).toBeDefined();
			expect(lastSetCall.claudeSessions["300"]).toBeDefined();
		});

		it("既存セッションとの重複は URL ベースで更新される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"2375": [
						{
							sessionUrl: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
							title: "Investigate issue 2375 (old)",
							issueNumber: 2375,
							detectedAt: "2026-04-01T00:00:00Z",
							isLive: true,
						},
					],
				},
			});

			await watcher.handleContentScriptSessions([
				{
					url: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
					title: "Investigate issue 2375",
				},
			]);

			expect(chromeMock.storage.local.set).toHaveBeenCalled();
			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			// 重複が追加されず、1件のままで更新されている
			expect(setCall.claudeSessions["2375"]).toHaveLength(1);
			expect(setCall.claudeSessions["2375"][0].title).toBe("Investigate issue 2375");
		});
	});

	describe("startWatching — メッセージリスナー登録", () => {
		it("chrome.runtime.onMessage.addListener が呼ばれる", () => {
			watcher.startWatching();

			expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
			expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
		});

		it("Content Script メッセージを受信して handleContentScriptSessions が呼ばれる", async () => {
			watcher.startWatching();

			const onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

			// CONTENT_CLAUDE_SESSIONS メッセージを模擬
			onMessageCallback(
				{
					type: "CONTENT_CLAUDE_SESSIONS",
					sessions: [
						{
							url: "https://claude.ai/code/session_abc",
							title: "Investigate issue 999",
						},
					],
				},
				{ id: "test-extension-id", url: "https://claude.ai/code/session_abc" },
			);

			// handleContentScriptSessions が非同期で実行されるため待機
			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(setCall.claudeSessions["999"]).toBeDefined();
			expect(setCall.claudeSessions["999"][0].issueNumber).toBe(999);
		});

		it("sender.url が https://claude.ai/code/ で始まらないメッセージは無視される", async () => {
			watcher.startWatching();

			const onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

			onMessageCallback(
				{
					type: "CONTENT_CLAUDE_SESSIONS",
					sessions: [
						{
							url: "https://claude.ai/code/session_abc",
							title: "Investigate issue 888",
						},
					],
				},
				{ id: "test-extension-id", url: "https://malicious-site.com/fake" },
			);

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("sender.url が undefined のメッセージは無視される", async () => {
			watcher.startWatching();

			const onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

			onMessageCallback(
				{
					type: "CONTENT_CLAUDE_SESSIONS",
					sessions: [
						{
							url: "https://claude.ai/code/session_xyz",
							title: "Investigate issue 777",
						},
					],
				},
				{ id: "test-extension-id" }, // url なし
			);

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("sender.id が自拡張と異なるメッセージは無視される", async () => {
			watcher.startWatching();

			const onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

			onMessageCallback(
				{
					type: "CONTENT_CLAUDE_SESSIONS",
					sessions: [
						{
							url: "https://claude.ai/code/session_xyz",
							title: "Investigate issue 777",
						},
					],
				},
				{ id: "malicious-extension-id", url: "https://claude.ai/code/session_xyz" },
			);

			// 少し待って storage.local.set が呼ばれていないことを確認
			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("type が CONTENT_CLAUDE_SESSIONS 以外のメッセージは無視される", async () => {
			watcher.startWatching();

			const onMessageCallback = chromeMock.runtime.onMessage.addListener.mock.calls[0][0];

			onMessageCallback(
				{ type: "SOME_OTHER_MESSAGE", data: {} },
				{ id: "test-extension-id", url: "https://claude.ai/code/session_abc" },
			);

			await new Promise((resolve) => setTimeout(resolve, 50));
			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});
	});

	describe("onTabUpdated — ダッシュボードから個別セッション遷移", () => {
		it("URL が claude.ai/code/ でもタイトルが 'Claude Code' ならセッション未保存", async () => {
			watcher.startWatching();

			// onTabUpdated リスナーを取得
			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			// ダッシュボードページのタブ更新イベント
			await onUpdatedCallback(
				1,
				{ url: "https://claude.ai/code/" },
				{ url: "https://claude.ai/code/", title: "Claude Code" },
			);

			expect(chromeMock.storage.local.set).not.toHaveBeenCalled();
		});

		it("個別セッションに遷移してタイトルが更新されたらセッション保存", async () => {
			watcher.startWatching();

			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			// 個別セッションに遷移後のタイトル更新イベント
			await onUpdatedCallback(
				1,
				{ title: "Investigate issue 2375 | Claude Code" },
				{
					url: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
					title: "Investigate issue 2375 | Claude Code",
				},
			);

			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(setCall.claudeSessions["2375"]).toBeDefined();
		});
	});

	// Issue #34: 同一 sessionUrl が別 Issue key に存在する場合、古い方を削除する
	describe("Issue #34 — cross-issue sessionUrl 重複排除", () => {
		it("saveSession: セッションタイトル変更で Issue 番号が変わった場合、旧 key から削除される", async () => {
			// 既存: session_X が Issue #1592 に紐付いている
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"1592": [
						{
							sessionUrl: "https://claude.ai/code/session_012Ke5HvnrbFoCD8bNmAtZV4",
							title: "[close]Inv #1592 -> #2108",
							issueNumber: 1592,
							detectedAt: "2026-04-01T00:00:00Z",
							isLive: true,
						},
					],
				},
			});

			watcher.startWatching();
			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			// 同じ sessionUrl だがタイトルが変わり Issue #2571 として検出される
			await onUpdatedCallback(
				1,
				{ title: "Investigate issue 2571 | Claude Code" },
				{
					url: "https://claude.ai/code/session_012Ke5HvnrbFoCD8bNmAtZV4",
					title: "Investigate issue 2571 | Claude Code",
				},
			);

			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			// 新しい Issue key に保存されている
			expect(setCall.claudeSessions["2571"]).toHaveLength(1);
			expect(setCall.claudeSessions["2571"][0].sessionUrl).toBe(
				"https://claude.ai/code/session_012Ke5HvnrbFoCD8bNmAtZV4",
			);
			// 旧 Issue key から削除されている
			expect(setCall.claudeSessions["1592"]).toHaveLength(0);
		});

		it("saveSession: 旧 key に他セッションがある場合、該当 URL のみ削除される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"1592": [
						{
							sessionUrl: "https://claude.ai/code/session_DUPLICATE",
							title: "[close]Inv #1592",
							issueNumber: 1592,
							detectedAt: "2026-04-01T00:00:00Z",
							isLive: true,
						},
						{
							sessionUrl: "https://claude.ai/code/session_OTHER",
							title: "Inv #1592 別セッション",
							issueNumber: 1592,
							detectedAt: "2026-04-02T00:00:00Z",
							isLive: false,
						},
					],
				},
			});

			watcher.startWatching();
			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			await onUpdatedCallback(
				1,
				{ title: "Investigate issue 2571 | Claude Code" },
				{
					url: "https://claude.ai/code/session_DUPLICATE",
					title: "Investigate issue 2571 | Claude Code",
				},
			);

			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			// 新 key に移動
			expect(setCall.claudeSessions["2571"]).toHaveLength(1);
			// 旧 key には別セッションだけ残る
			expect(setCall.claudeSessions["1592"]).toHaveLength(1);
			expect(setCall.claudeSessions["1592"][0].sessionUrl).toBe(
				"https://claude.ai/code/session_OTHER",
			);
		});

		it("handleContentScriptSessions: 同一 URL が別 Issue に移動する場合、旧 key から削除される", async () => {
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"1592": [
						{
							sessionUrl: "https://claude.ai/code/session_CROSS",
							title: "Inv #1592",
							issueNumber: 1592,
							detectedAt: "2026-04-01T00:00:00Z",
							isLive: false,
						},
					],
				},
			});

			await watcher.handleContentScriptSessions([
				{
					url: "https://claude.ai/code/session_CROSS",
					title: "Investigate issue 2571",
				},
			]);

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			expect(setCall.claudeSessions["2571"]).toHaveLength(1);
			expect(setCall.claudeSessions["1592"]).toHaveLength(0);
		});

		it("saveSession: 同一 key 内での URL 重複は従来通り更新される (cross-issue ではない)", async () => {
			chromeMock.storage.local.get.mockResolvedValue({
				claudeSessions: {
					"2571": [
						{
							sessionUrl: "https://claude.ai/code/session_SAME",
							title: "Investigate issue 2571 (old)",
							issueNumber: 2571,
							detectedAt: "2026-04-01T00:00:00Z",
							isLive: false,
						},
					],
				},
			});

			watcher.startWatching();
			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			await onUpdatedCallback(
				1,
				{ title: "Investigate issue 2571 | Claude Code" },
				{
					url: "https://claude.ai/code/session_SAME",
					title: "Investigate issue 2571 | Claude Code",
				},
			);

			await vi.waitFor(() => {
				expect(chromeMock.storage.local.set).toHaveBeenCalled();
			});

			const setCall = chromeMock.storage.local.set.mock.calls[0][0];
			// 同一 key 内で更新、1件のまま
			expect(setCall.claudeSessions["2571"]).toHaveLength(1);
			expect(setCall.claudeSessions["2571"][0].title).toBe("Investigate issue 2571 | Claude Code");
		});
	});

	// Issue #27: ストレージ更新後に Side Panel へ broadcast しないと、後から検知された
	// セッションが UI に反映されない (Side Panel は購読しても通知が来ないため再取得しない)
	describe("Issue #27 — Side Panel への broadcast", () => {
		it("onTabUpdated でセッション保存後に CLAUDE_SESSIONS_UPDATED が broadcast される", async () => {
			watcher.startWatching();
			const onUpdatedCallback = chromeMock.tabs.onUpdated.addListener.mock.calls[0][0];

			await onUpdatedCallback(
				1,
				{ title: "Investigate issue 27 | Claude Code" },
				{
					url: "https://claude.ai/code/session_issue27",
					title: "Investigate issue 27 | Claude Code",
				},
			);

			await vi.waitFor(() => {
				expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
					type: "CLAUDE_SESSIONS_UPDATED",
				});
			});
		});

		it("handleContentScriptSessions の保存後に CLAUDE_SESSIONS_UPDATED が broadcast される", async () => {
			await watcher.handleContentScriptSessions([
				{ url: "https://claude.ai/code/session_x", title: "Investigate issue 27" },
			]);

			expect(chromeMock.runtime.sendMessage).toHaveBeenCalledWith({
				type: "CLAUDE_SESSIONS_UPDATED",
			});
		});

		it("Issue 番号抽出に失敗 (保存スキップ) した場合は broadcast されない", async () => {
			await watcher.handleContentScriptSessions([
				{ url: "https://claude.ai/code/session_y", title: "no issue number here" },
			]);

			expect(chromeMock.runtime.sendMessage).not.toHaveBeenCalled();
		});

		it("Side Panel 未起動で sendMessage が reject しても例外が伝播しない", async () => {
			chromeMock.runtime.sendMessage.mockRejectedValue(
				new Error("Could not establish connection. Receiving end does not exist."),
			);

			await expect(
				watcher.handleContentScriptSessions([
					{ url: "https://claude.ai/code/session_z", title: "Investigate issue 27" },
				]),
			).resolves.not.toThrow();
		});
	});
});
