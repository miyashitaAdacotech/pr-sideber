import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

/**
 * initializeApp() にタブリスナーが追加される想定のテスト。
 * 現時点では initializeApp() にタブリスナー登録が未実装のため RED。
 */

describe("tab-listener (bootstrap)", () => {
	beforeEach(() => {
		vi.resetModules();
		setupChromeMock();
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		// onActivated が chrome mock に未定義の場合に備えて追加
		if (!chrome.tabs.onActivated) {
			(chrome.tabs as Record<string, unknown>).onActivated = {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			};
		}
	});

	afterEach(() => {
		resetChromeMock();
		vi.unstubAllEnvs();
	});

	async function loadInitializeApp() {
		const mod = await import("../../background/bootstrap");
		return mod.initializeApp;
	}

	describe("listener registration", () => {
		it("should register chrome.tabs.onActivated listener on initializeApp()", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();
			expect(chrome.tabs.onActivated.addListener).toHaveBeenCalledWith(expect.any(Function));
		});

		it("should register chrome.tabs.onUpdated listener on initializeApp()", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();
			expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
		});
	});

	describe("onActivated (tab switch)", () => {
		it("should send TAB_URL_CHANGED message when tab is activated", async () => {
			// tabs.get で指定タブの情報を返す
			vi.mocked(chrome.tabs.get).mockResolvedValue({
				id: 1,
				url: "https://github.com/owner/repo/pull/42",
			} as chrome.tabs.Tab);

			const initializeApp = await loadInitializeApp();
			initializeApp();

			// onActivated リスナーを取得して発火
			const onActivatedListener = vi.mocked(chrome.tabs.onActivated.addListener).mock
				.calls[0]?.[0] as (activeInfo: { tabId: number; windowId: number }) => void;
			expect(onActivatedListener).toBeDefined();

			await onActivatedListener({ tabId: 1, windowId: 1 });

			expect(chrome.tabs.get).toHaveBeenCalledWith(1);
			expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
				type: "TAB_URL_CHANGED",
				url: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should not crash when chrome.tabs.get rejects", async () => {
			vi.mocked(chrome.tabs.get).mockRejectedValue(new Error("tab not found"));

			const initializeApp = await loadInitializeApp();
			initializeApp();

			const onActivatedListener = vi.mocked(chrome.tabs.onActivated.addListener).mock
				.calls[0]?.[0] as (activeInfo: { tabId: number; windowId: number }) => void;
			expect(onActivatedListener).toBeDefined();

			// reject しても例外が飛ばないことを検証
			await expect(onActivatedListener({ tabId: 1, windowId: 1 })).resolves.toBeUndefined();

			expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
		});
	});

	describe("onUpdated (URL change in current tab)", () => {
		it("should send TAB_URL_CHANGED when changeInfo.url is present", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();

			const onUpdatedListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0]?.[0] as (
				tabId: number,
				changeInfo: { url?: string; status?: string },
				tab: chrome.tabs.Tab,
			) => void;
			expect(onUpdatedListener).toBeDefined();

			await onUpdatedListener(1, { url: "https://github.com/owner/repo/pull/99" }, {
				id: 1,
				url: "https://github.com/owner/repo/pull/99",
				active: true,
			} as chrome.tabs.Tab);

			expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
				type: "TAB_URL_CHANGED",
				url: "https://github.com/owner/repo/pull/99",
			});
		});

		it("should NOT send TAB_URL_CHANGED when tab is not active", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();

			const onUpdatedListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0]?.[0] as (
				tabId: number,
				changeInfo: { url?: string; status?: string },
				tab: chrome.tabs.Tab,
			) => void;
			expect(onUpdatedListener).toBeDefined();

			await onUpdatedListener(1, { url: "https://github.com/owner/repo/pull/50" }, {
				id: 1,
				url: "https://github.com/owner/repo/pull/50",
				active: false,
			} as chrome.tabs.Tab);

			expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({ type: "TAB_URL_CHANGED" }),
			);
		});

		it("should NOT send TAB_URL_CHANGED when changeInfo.url is absent", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();

			const onUpdatedListener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0]?.[0] as (
				tabId: number,
				changeInfo: { url?: string; status?: string },
				tab: chrome.tabs.Tab,
			) => void;
			expect(onUpdatedListener).toBeDefined();

			// changeInfo に url がない場合（例: loading ステータス変更）
			await onUpdatedListener(1, { status: "complete" }, {
				id: 1,
				url: "https://github.com/owner/repo/pull/99",
				active: true,
			} as chrome.tabs.Tab);

			expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({ type: "TAB_URL_CHANGED" }),
			);
		});
	});

	describe("dispose", () => {
		it("should remove tab listeners on dispose()", async () => {
			const initializeApp = await loadInitializeApp();
			const services = initializeApp();

			const onActivatedHandler = vi.mocked(chrome.tabs.onActivated.addListener).mock.calls[0]?.[0];
			const onUpdatedHandler = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls[0]?.[0];

			services.dispose();

			expect(chrome.tabs.onActivated.removeListener).toHaveBeenCalledWith(onActivatedHandler);
			expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(onUpdatedHandler);
		});
	});
});
