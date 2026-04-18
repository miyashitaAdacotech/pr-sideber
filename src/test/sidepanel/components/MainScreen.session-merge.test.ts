import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EpicTreeDto } from "../../../domain/ports/epic-processor.port";
import type { ClaudeSessionStorage } from "../../../shared/types/claude-session";
import MainScreen from "../../../sidepanel/components/MainScreen.svelte";
import { resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

/**
 * Phase 4 レビュー HIGH-3 回帰テスト:
 * `mergeSessionsIntoTree` が「session 未マージ」のツリーを常に source にしていることを
 * 保証する。過去のバグでは、既にセッションノードが append 済みの epicData を再マージに
 * 渡していたため、mapping 変更イベントが発火するたびにセッションノードが累積していた。
 *
 * 本テストでは `subscribeToMappingChanges` の callback を複数回発火させ、
 * issue ノードの children に含まれる session ノードが常に 1 件のみであることを検証する。
 */

function createTreeWithIssue(issueNumber: number): EpicTreeDto {
	return {
		roots: [
			{
				kind: {
					type: "issue",
					number: issueNumber,
					title: `Issue ${issueNumber}`,
					url: `https://github.com/o/r/issues/${issueNumber}`,
					state: "OPEN",
					labels: [],
				},
				children: [],
				depth: 0,
			},
		],
	};
}

function createSessionsForIssue(issueNumber: number): ClaudeSessionStorage {
	return {
		[String(issueNumber)]: [
			{
				title: `Work on #${issueNumber}`,
				sessionUrl: "https://claude.ai/chat/01234567-89ab-cdef-0123-456789abcdef",
				detectedAt: "2026-04-18T10:00:00.000Z",
				issueNumber,
				isLive: true,
			},
		],
	};
}

describe("MainScreen session merge (HIGH-3 regression)", () => {
	let component: ReturnType<typeof mount> | null = null;

	beforeEach(() => {
		setupChromeMock();
	});

	afterEach(() => {
		if (component) {
			unmount(component);
			component = null;
		}
		document.body.innerHTML = "";
		resetChromeMock();
	});

	it("mapping change callback を複数回発火しても session ノードは重複しない", async () => {
		const issueNumber = 555;
		const tree = createTreeWithIssue(issueNumber);
		const sessions = createSessionsForIssue(issueNumber);

		const captured: { callback: (() => void) | null } = { callback: null };
		const subscribeToMappingChanges = vi.fn((cb: () => void) => {
			captured.callback = cb;
			return vi.fn();
		});

		component = mount(MainScreen, {
			target: document.body,
			props: {
				onLogout: vi.fn(async () => {}),
				fetchPrs: vi.fn(async () => ({
					myPrs: { items: [], totalCount: 0 },
					reviewRequests: { items: [], totalCount: 0 },
					reviewRequestBadgeCount: 0,
					hasMore: false,
				})),
				fetchEpicTree: vi.fn(async () => ({ tree, prsRawJson: '{"data":{"myPrs":{"edges":[]}}}' })),
				getClaudeSessions: vi.fn(async () => sessions),
				getSessionIssueMappings: vi.fn(async () => ({})),
				getCachedPrs: vi.fn(async () => ({
					data: {
						myPrs: { items: [], totalCount: 0 },
						reviewRequests: { items: [], totalCount: 0 },
						reviewRequestBadgeCount: 0,
						hasMore: false,
					},
					lastUpdatedAt: "2026-04-18T10:00:00.000Z",
				})),
				loadPrsWithCache: vi.fn(async () => null),
				subscribeToMessages: vi.fn((_cb: (message: unknown) => void) => vi.fn()),
				subscribeToMappingChanges,
				pinnedTabsStore: {
					pinned: [],
					activeKey: null,
					loaded: true,
					load: vi.fn(async () => {}),
					pin: vi.fn(async () => {}),
					unpin: vi.fn(async () => {}),
					activate: vi.fn(async () => {}),
				},
				onNavigate: vi.fn(),
				getCurrentTabUrl: vi.fn(async () => null),
			},
		});

		// 初期マージ完了 (epicData が session 付きで埋まる) を待つ
		// data-node-key のフォーマットは TreeNode.svelte / nodeKeyFor と揃える:
		//   issue → `issue-${number}`
		//   session → `session-${issueNumber}-${url}`
		await vi.waitFor(() => {
			expect(document.querySelectorAll(`[data-node-key="issue-${issueNumber}"]`).length).toBe(1);
		});
		await tick();

		// 初期状態: session ノードが 1 件存在する
		await vi.waitFor(() => {
			expect(document.querySelectorAll('[data-node-key^="session-"]').length).toBe(1);
		});

		// subscribeToMappingChanges の callback を複数回発火
		expect(captured.callback).not.toBeNull();
		captured.callback?.();
		captured.callback?.();
		captured.callback?.();

		// 再マージ後も session ノードは 1 件のまま (累積しない)
		await vi.waitFor(() => {
			const sessionNodes = document.querySelectorAll('[data-node-key^="session-"]');
			expect(sessionNodes.length).toBe(1);
		});
	});
});
