import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EpicTreeDto } from "../../../domain/ports/epic-processor.port";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import type { CachedPrData } from "../../../shared/types/cache";
import MainScreen from "../../../sidepanel/components/MainScreen.svelte";
import { resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

function createPrData(): CachedPrData {
	return {
		data: {
			myPrs: { items: [], totalCount: 0 },
			reviewRequests: {
				items: [
					{
						id: "PR_100",
						number: 100,
						title: "Test PR",
						author: "testuser",
						url: "https://github.com/owner/repo/pull/100",
						repository: "owner/repo",
						isDraft: false,
						approvalStatus: "ReviewRequired" as const,
						ciStatus: "Passed" as const,
						mergeableStatus: "Unknown" as const,
						additions: 5,
						deletions: 2,
						createdAt: "2026-03-20T10:00:00Z",
						updatedAt: "2026-03-23T10:00:00Z",
						sizeLabel: "S",
						unresolvedCommentCount: 0,
					},
				],
				totalCount: 1,
			},
			reviewRequestBadgeCount: 1,
			hasMore: false,
		},
		lastUpdatedAt: "2026-03-23T10:00:00.000Z",
	};
}

function createMockFetchEpicTree(): () => Promise<{ tree: EpicTreeDto; prsRawJson: string }> {
	return vi.fn(async () => ({
		tree: { roots: [] },
		prsRawJson: '{"data":{"myPrs":{"edges":[]}}}',
	}));
}

/**
 * MainScreen に渡す props を構築するヘルパー。
 * getCurrentTabUrl は RED フェーズでは MainScreen.svelte の Props 型に未定義のため、
 * mount の props 型チェックを回避する必要がある。
 * GREEN フェーズで Props に getCurrentTabUrl が追加されたら型キャストを除去する。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mountMainScreen(propsOverrides: Record<string, unknown> = {}): ReturnType<typeof mount> {
	const baseProps = {
		onLogout: vi.fn(async () => {}),
		fetchPrs: vi.fn(async () => ({
			myPrs: { items: [], totalCount: 0 },
			reviewRequests: { items: [], totalCount: 0 },
			hasMore: false,
		})),
		fetchEpicTree: createMockFetchEpicTree(),
		getCachedPrs: vi.fn(async () => null),
		loadPrsWithCache: vi.fn(async () => null),
		subscribeToMessages: vi.fn((_callback: (message: unknown) => void) => vi.fn()),
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
		...propsOverrides,
	};

	// RED フェーズ: getCurrentTabUrl が Props に未定義のため型キャストで回避
	// biome-ignore lint/suspicious/noExplicitAny: GREEN フェーズで Props に getCurrentTabUrl が追加されたら除去する
	return mount(MainScreen, { target: document.body, props: baseProps as any });
}

describe("MainScreen active tab highlight", () => {
	let component: ReturnType<typeof mount>;

	beforeEach(() => {
		setupChromeMock();
	});

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
		resetChromeMock();
	});

	it("should call getCurrentTabUrl on mount and highlight the matching PR", async () => {
		const mockGetCurrentTabUrl = vi.fn(async () => "https://github.com/owner/repo/pull/100");

		component = mountMainScreen({
			getCachedPrs: vi.fn(async () => createPrData()),
			getCurrentTabUrl: mockGetCurrentTabUrl,
		});

		await vi.waitFor(() => {
			expect(document.querySelector(".pr-item")).not.toBeNull();
		});

		expect(mockGetCurrentTabUrl).toHaveBeenCalled();

		await vi.waitFor(() => {
			const prItem = document.querySelector(".pr-item");
			expect(prItem?.classList.contains("active")).toBe(true);
		});
	});

	it("should update highlight when TAB_URL_CHANGED event is received", async () => {
		const captured: { callback: ((message: unknown) => void) | null } = { callback: null };
		const mockSubscribe = vi.fn((cb: (message: unknown) => void) => {
			captured.callback = cb;
			return vi.fn();
		});

		component = mountMainScreen({
			getCachedPrs: vi.fn(async () => createPrData()),
			subscribeToMessages: mockSubscribe,
			getCurrentTabUrl: vi.fn(async () => null),
		});

		await vi.waitFor(() => {
			expect(document.querySelector(".pr-item")).not.toBeNull();
		});

		// 初期状態ではハイライトなし
		const prItem = document.querySelector(".pr-item");
		expect(prItem?.classList.contains("active")).toBe(false);

		// TAB_URL_CHANGED イベント送信
		expect(captured.callback).not.toBeNull();
		captured.callback?.({ type: "TAB_URL_CHANGED", url: "https://github.com/owner/repo/pull/100" });

		await vi.waitFor(() => {
			expect(document.querySelector(".pr-item")?.classList.contains("active")).toBe(true);
		});
	});

	it("should switch highlight from PR-A to PR-B when TAB_URL_CHANGED fires with PR-B URL", async () => {
		const twoPrData: CachedPrData = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: {
					items: [
						{
							id: "PR_100",
							number: 100,
							title: "PR A",
							author: "testuser",
							url: "https://github.com/owner/repo/pull/100",
							repository: "owner/repo",
							isDraft: false,
							approvalStatus: "ReviewRequired" as const,
							ciStatus: "Passed" as const,
							mergeableStatus: "Unknown" as const,
							additions: 5,
							deletions: 2,
							createdAt: "2026-03-20T10:00:00Z",
							updatedAt: "2026-03-23T10:00:00Z",
							sizeLabel: "S",
							unresolvedCommentCount: 0,
						},
						{
							id: "PR_200",
							number: 200,
							title: "PR B",
							author: "testuser",
							url: "https://github.com/owner/repo/pull/200",
							repository: "owner/repo",
							isDraft: false,
							approvalStatus: "Approved" as const,
							ciStatus: "Passed" as const,
							mergeableStatus: "Unknown" as const,
							additions: 10,
							deletions: 3,
							createdAt: "2026-03-21T10:00:00Z",
							updatedAt: "2026-03-23T12:00:00Z",
							sizeLabel: "M",
							unresolvedCommentCount: 0,
						},
					],
					totalCount: 2,
				},
				reviewRequestBadgeCount: 2,
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-23T12:00:00.000Z",
		};

		const captured: { callback: ((message: unknown) => void) | null } = { callback: null };
		const mockSubscribe = vi.fn((cb: (message: unknown) => void) => {
			captured.callback = cb;
			return vi.fn();
		});

		component = mountMainScreen({
			getCachedPrs: vi.fn(async () => twoPrData),
			subscribeToMessages: mockSubscribe,
			getCurrentTabUrl: vi.fn(async () => "https://github.com/owner/repo/pull/100"),
		});

		await vi.waitFor(() => {
			const items = document.querySelectorAll(".pr-item");
			expect(items.length).toBe(2);
		});

		// 初期状態: PR-A がアクティブ、PR-B は非アクティブ
		await vi.waitFor(() => {
			const items = document.querySelectorAll(".pr-item");
			expect(items[0]?.classList.contains("active")).toBe(true);
			expect(items[1]?.classList.contains("active")).toBe(false);
		});

		// TAB_URL_CHANGED で PR-B の URL に切り替え
		expect(captured.callback).not.toBeNull();
		captured.callback?.({ type: "TAB_URL_CHANGED", url: "https://github.com/owner/repo/pull/200" });

		await vi.waitFor(() => {
			const items = document.querySelectorAll(".pr-item");
			expect(items[0]?.classList.contains("active")).toBe(false);
			expect(items[1]?.classList.contains("active")).toBe(true);
		});
	});

	it("should not highlight any PR item when tab URL is a non-PR URL", async () => {
		component = mountMainScreen({
			getCachedPrs: vi.fn(async () => createPrData()),
			getCurrentTabUrl: vi.fn(async () => "https://github.com/owner/repo/issues/1"),
		});

		await vi.waitFor(() => {
			expect(document.querySelector(".pr-item")).not.toBeNull();
		});

		const prItem = document.querySelector(".pr-item");
		expect(prItem?.classList.contains("active")).toBe(false);
	});
});
