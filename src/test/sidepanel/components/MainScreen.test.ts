import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import MainScreen from "../../../sidepanel/components/MainScreen.svelte";
import { resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

function createMockFetchPrs(): () => Promise<ProcessedPrsResult & { hasMore: boolean }> {
	return vi.fn(async () => ({
		myPrs: { items: [], totalCount: 0 },
		reviewRequests: { items: [], totalCount: 0 },
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

function createDefaultProps() {
	return {
		onLogout: vi.fn(async () => {}),
		fetchPrs: createMockFetchPrs(),
		getCachedPrs: createMockGetCachedPrs(),
		loadPrsWithCache: createMockLoadPrsWithCache(),
		subscribeToMessages: createMockSubscribeToMessages(),
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
