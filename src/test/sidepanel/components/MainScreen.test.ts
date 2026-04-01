import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EpicTreeDto } from "../../../domain/ports/epic-processor.port";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import MainScreen from "../../../sidepanel/components/MainScreen.svelte";
import { resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

function createMockFetchPrs(): () => Promise<ProcessedPrsResult & { hasMore: boolean }> {
	return vi.fn(async () => ({
		myPrs: { items: [], totalCount: 0 },
		reviewRequests: { items: [], totalCount: 0 },
		reviewRequestBadgeCount: 0,
		hasMore: false,
	}));
}

function createMockGetCachedPrs(): () => Promise<null> {
	return vi.fn(async () => null);
}

function createMockLoadPrsWithCache(): () => Promise<null> {
	return vi.fn(async () => null);
}

function createMockSubscribeToMessages(): (callback: (message: unknown) => void) => () => void {
	const unsubscribe = vi.fn();
	return vi.fn((_callback: (message: unknown) => void) => unsubscribe);
}

function createMockFetchEpicTree(): () => Promise<EpicTreeDto> {
	return vi.fn(async () => ({
		roots: [],
	}));
}

function createMockGetClaudeSessions(): () => Promise<Record<string, never>> {
	return vi.fn(async () => ({}));
}

function createDefaultProps() {
	return {
		onLogout: vi.fn(async () => {}),
		fetchPrs: createMockFetchPrs(),
		fetchEpicTree: createMockFetchEpicTree(),
		getClaudeSessions: createMockGetClaudeSessions(),
		getCachedPrs: createMockGetCachedPrs(),
		loadPrsWithCache: createMockLoadPrsWithCache(),
		subscribeToMessages: createMockSubscribeToMessages(),
		onNavigate: vi.fn(),
	};
}

describe("MainScreen", () => {
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

	it("should mount successfully", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: createDefaultProps(),
		});
		expect(document.body.innerHTML).not.toBe("");
	});

	it("should display header with PR Sidebar title", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: createDefaultProps(),
		});
		const heading = document.querySelector("h1");
		expect(heading).not.toBeNull();
		expect(heading?.textContent).toContain("PR Sidebar");
	});

	it("should show loading state initially", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: createDefaultProps(),
		});
		expect(document.body.textContent).toContain("Loading");
	});

	it("should call subscribeToMessages on mount", async () => {
		const mockSubscribe = createMockSubscribeToMessages();

		component = mount(MainScreen, {
			target: document.body,
			props: {
				...createDefaultProps(),
				subscribeToMessages: mockSubscribe,
			},
		});
		await tick();

		expect(mockSubscribe).toHaveBeenCalled();
	});

	it("should reload cached data when CACHE_UPDATED event is received", async () => {
		const mockGetCachedPrs = vi.fn(async () => null);
		const captured: { callback: ((message: unknown) => void) | null } = { callback: null };
		const mockSubscribe = vi.fn((cb: (message: unknown) => void) => {
			captured.callback = cb;
			return vi.fn();
		});

		component = mount(MainScreen, {
			target: document.body,
			props: {
				...createDefaultProps(),
				getCachedPrs: mockGetCachedPrs,
				subscribeToMessages: mockSubscribe,
			},
		});
		await tick();

		expect(captured.callback).not.toBeNull();
		captured.callback?.({ type: "CACHE_UPDATED", lastUpdatedAt: "2026-03-22T12:05:00.000Z" });

		await vi.waitFor(() => {
			// 初期ロードの getCachedPrs + CACHE_UPDATED 時の getCachedPrs
			expect(mockGetCachedPrs).toHaveBeenCalledTimes(2);
		});
	});

	it("should update formatRelativeTime display every 60 seconds via setInterval", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));

		const mockGetCachedPrs = vi.fn(async () => ({
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: { items: [], totalCount: 0 },
				reviewRequestBadgeCount: 0,
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-22T12:00:00.000Z",
		}));

		component = mount(MainScreen, {
			target: document.body,
			props: {
				...createDefaultProps(),
				getCachedPrs: mockGetCachedPrs,
			},
		});

		// キャッシュ読み込みを待つ
		await vi.waitFor(() => {
			expect(document.querySelector(".last-updated")).not.toBeNull();
		});

		const lastUpdatedEl = document.querySelector(".last-updated");
		const initialText = lastUpdatedEl?.textContent;

		// 60秒進める
		vi.advanceTimersByTime(60_000);

		// 表示が更新される（相対時間が変わる）
		await vi.waitFor(() => {
			expect(lastUpdatedEl?.textContent).not.toBe(initialText);
		});

		vi.useRealTimers();
	});

	it("should call onNavigate when a PR item is clicked in the loaded state", async () => {
		const onNavigate = vi.fn();
		const mockGetCachedPrs = vi.fn(async () => ({
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: {
					items: [
						{
							id: "PR_100",
							number: 100,
							title: "Test PR for navigation",
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
		}));

		component = mount(MainScreen, {
			target: document.body,
			props: {
				...createDefaultProps(),
				getCachedPrs: mockGetCachedPrs,
				onNavigate,
			},
		});

		// キャッシュからデータが読み込まれるのを待つ
		await vi.waitFor(() => {
			expect(document.querySelector(".pr-item")).not.toBeNull();
		});

		const prItem = document.querySelector(".pr-item") as HTMLElement;
		prItem.click();

		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/100");
	});

	it("should call unsubscribe when unmounted", async () => {
		const mockUnsubscribe = vi.fn();
		const mockSubscribe = vi.fn((_callback: (message: unknown) => void) => mockUnsubscribe);

		component = mount(MainScreen, {
			target: document.body,
			props: {
				...createDefaultProps(),
				subscribeToMessages: mockSubscribe,
			},
		});
		await tick();

		expect(mockSubscribe).toHaveBeenCalled();

		unmount(component);
		component = undefined as unknown as ReturnType<typeof mount>;

		expect(mockUnsubscribe).toHaveBeenCalled();
	});
});
