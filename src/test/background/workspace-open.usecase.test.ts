import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type WorkspaceOpenSettings,
	calculateThreePanelLayout,
	createWorkspaceOpenUseCase,
} from "../../background/workspace-open.usecase";
import type {
	ScreenBounds,
	TabInfo,
	WindowManagerPort,
} from "../../domain/ports/window-manager.port";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

// --- helpers ---

function createMockWindowManager(): {
	[K in keyof WindowManagerPort]: ReturnType<typeof vi.fn>;
} {
	return {
		getScreenWorkArea: vi.fn(),
		findTab: vi.fn(),
		getWindowBounds: vi.fn(),
		createWindow: vi.fn(),
		navigateTab: vi.fn(),
		windowExists: vi.fn(),
		moveWindowToBounds: vi.fn(),
		moveTabToNewWindow: vi.fn(),
		activateTab: vi.fn(),
		createTabInWindow: vi.fn(),
	};
}

function createMockSettings(arrangeEnabled = true): WorkspaceOpenSettings {
	return { getArrangeEnabled: vi.fn().mockResolvedValue(arrangeEnabled) };
}

/** 1920x1080 フル HD ワークエリア (タスクバー 40px 下) */
const FULL_HD_WORK_AREA: ScreenBounds = {
	left: 0,
	top: 0,
	width: 1920,
	height: 1040,
};

const SAMPLE_REQUEST = {
	issueNumber: 42,
	issueUrl: "https://github.com/owner/repo/issues/42",
	prUrl: "https://github.com/owner/repo/pull/123",
	sessionUrl: "https://claude.ai/code/session-1",
	senderWindowId: 100,
} as const;

// --- calculateThreePanelLayout ---

describe("calculateThreePanelLayout", () => {
	it("should calculate correct 3-panel bounds for a standard monitor", () => {
		const layout = calculateThreePanelLayout(FULL_HD_WORK_AREA);

		expect(layout.left).toEqual({ left: 0, top: 0, width: 960, height: 1040 });
		expect(layout.topRight).toEqual({ left: 960, top: 0, width: 960, height: 520 });
		expect(layout.bottomRight).toEqual({ left: 960, top: 520, width: 960, height: 520 });
	});

	it("should handle odd pixel dimensions with Math.round", () => {
		const oddWorkArea: ScreenBounds = { left: 0, top: 0, width: 1921, height: 1041 };
		const layout = calculateThreePanelLayout(oddWorkArea);

		expect(layout.left.width).toBe(961);
		expect(layout.topRight.left).toBe(961);
		expect(layout.topRight.height).toBe(521);
		expect(layout.bottomRight.top).toBe(521);
	});
});

// --- createWorkspaceOpenUseCase ---

describe("createWorkspaceOpenUseCase", () => {
	let wm: ReturnType<typeof createMockWindowManager>;

	beforeEach(() => {
		setupChromeMock();
		wm = createMockWindowManager();
		wm.getScreenWorkArea.mockResolvedValue(FULL_HD_WORK_AREA);
		wm.createWindow.mockResolvedValue({ windowId: 200, tabId: 201 });
		wm.moveWindowToBounds.mockResolvedValue(undefined);
		wm.moveTabToNewWindow.mockResolvedValue(undefined);
		wm.activateTab.mockResolvedValue(undefined);
		wm.createTabInWindow.mockResolvedValue({ tabId: 50 });
		wm.navigateTab.mockResolvedValue(undefined);
		wm.windowExists.mockResolvedValue(false);
		// デフォルト: ウィンドウは遠い位置にある（配置済み判定に引っかからない）
		wm.getWindowBounds.mockResolvedValue({ left: 9999, top: 9999, width: 100, height: 100 });
	});

	afterEach(() => {
		resetChromeMock();
	});

	// --- arrange ON: 初回（パネル新規作成） ---

	it("arrange ON: 初回は createWindow で issue/PR パネルを作成する", async () => {
		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Session: sender に新規作成
		expect(wm.createTabInWindow).toHaveBeenCalledWith("https://claude.ai/code/session-1", 100);
		// Issue: createWindow (topRight)
		expect(wm.createWindow).toHaveBeenCalledWith("https://github.com/owner/repo/issues/42", {
			left: 960,
			top: 0,
			width: 960,
			height: 520,
		});
		// PR: createWindow (bottomRight)
		expect(wm.createWindow).toHaveBeenCalledWith("https://github.com/owner/repo/pull/123", {
			left: 960,
			top: 520,
			width: 960,
			height: 520,
		});
		// Sender → left にリサイズ
		expect(wm.moveWindowToBounds).toHaveBeenCalledWith(100, {
			left: 0,
			top: 0,
			width: 960,
			height: 1040,
		});
	});

	// --- arrange ON: 2回目（パネル再利用） ---

	it("arrange ON: 2回目はウィンドウを再利用して navigateTab で URL を差し替える", async () => {
		wm.findTab.mockResolvedValue(null);
		wm.createWindow
			.mockResolvedValueOnce({ windowId: 300, tabId: 301 }) // 1回目 issue
			.mockResolvedValueOnce({ windowId: 400, tabId: 401 }) // 1回目 pr
			.mockResolvedValue({ windowId: 500, tabId: 501 }); // fallback

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));

		// 1回目: パネル作成
		await usecase.openWorkspace(SAMPLE_REQUEST);
		expect(wm.createWindow).toHaveBeenCalledTimes(2);

		// 2回目: 別 Issue で再利用
		wm.windowExists.mockResolvedValue(true);
		const secondRequest = {
			...SAMPLE_REQUEST,
			issueNumber: 99,
			issueUrl: "https://github.com/owner/repo/issues/99",
			prUrl: "https://github.com/owner/repo/pull/456",
		};
		await usecase.openWorkspace(secondRequest);

		// createWindow は追加で呼ばれない（2回目は再利用）
		expect(wm.createWindow).toHaveBeenCalledTimes(2);
		// navigateTab で URL 差し替え
		expect(wm.navigateTab).toHaveBeenCalledWith(301, "https://github.com/owner/repo/issues/99");
		expect(wm.navigateTab).toHaveBeenCalledWith(401, "https://github.com/owner/repo/pull/456");
	});

	// --- arrange ON: パネルが閉じられた場合のフォールバック ---

	it("arrange ON: ウィンドウが閉じられていた場合は新規作成にフォールバックする", async () => {
		wm.findTab.mockResolvedValue(null);
		wm.createWindow
			.mockResolvedValueOnce({ windowId: 300, tabId: 301 }) // 1回目 issue
			.mockResolvedValueOnce({ windowId: 400, tabId: 401 }) // 1回目 pr
			.mockResolvedValueOnce({ windowId: 500, tabId: 501 }) // 2回目 issue (再作成)
			.mockResolvedValueOnce({ windowId: 600, tabId: 601 }); // 2回目 pr (再作成)

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));

		// 1回目
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// ウィンドウが閉じられた
		wm.windowExists.mockResolvedValue(false);
		const secondRequest = {
			...SAMPLE_REQUEST,
			issueNumber: 99,
			issueUrl: "https://github.com/owner/repo/issues/99",
		};
		await usecase.openWorkspace(secondRequest);

		// 新規作成が追加で呼ばれる（合計4回）
		expect(wm.createWindow).toHaveBeenCalledTimes(4);
		expect(wm.navigateTab).not.toHaveBeenCalled();
	});

	// --- arrange ON: tolerance skip ---

	it("arrange ON: 再利用時にウィンドウが既に正しい位置なら moveWindowToBounds をスキップ", async () => {
		wm.findTab.mockResolvedValue(null);
		wm.createWindow
			.mockResolvedValueOnce({ windowId: 300, tabId: 301 })
			.mockResolvedValueOnce({ windowId: 400, tabId: 401 });

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// 1回目のモック呼び出しをリセット
		wm.moveWindowToBounds.mockClear();

		// 2回目: ウィンドウが正しい位置にある
		wm.windowExists.mockResolvedValue(true);
		wm.getWindowBounds
			.mockResolvedValueOnce({ left: 965, top: 5, width: 955, height: 515 }) // topRight within tolerance
			.mockResolvedValueOnce({ left: 965, top: 525, width: 955, height: 515 }) // bottomRight within tolerance
			.mockResolvedValueOnce({ left: 5, top: 3, width: 955, height: 1035 }); // sender within tolerance

		await usecase.openWorkspace({
			...SAMPLE_REQUEST,
			issueUrl: "https://github.com/owner/repo/issues/99",
		});

		// navigateTab は呼ばれる（URL 差し替え）
		expect(wm.navigateTab).toHaveBeenCalledTimes(2);
		// moveWindowToBounds はスキップ（sender 含めて全部 tolerance 内）
		expect(wm.moveWindowToBounds).not.toHaveBeenCalled();
	});

	// --- arrange ON: null URL ---

	it("arrange ON: prUrl が null なら bottomRight パネルをスキップ", async () => {
		const requestNoPr = { ...SAMPLE_REQUEST, prUrl: null };
		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(requestNoPr);

		// Issue のみ createWindow
		expect(wm.createWindow).toHaveBeenCalledTimes(1);
		expect(wm.createWindow).toHaveBeenCalledWith("https://github.com/owner/repo/issues/42", {
			left: 960,
			top: 0,
			width: 960,
			height: 520,
		});
	});

	it("arrange ON: sessionUrl が null ならセッションタブをスキップ", async () => {
		const requestNoSession = { ...SAMPLE_REQUEST, sessionUrl: null };
		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(requestNoSession);

		expect(wm.createTabInWindow).not.toHaveBeenCalled();
		expect(wm.createWindow).toHaveBeenCalledTimes(2);
	});

	// --- arrange OFF ---

	it("arrange OFF: 全タブを sender ウィンドウ内に開くだけ", async () => {
		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(false));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		expect(wm.createTabInWindow).toHaveBeenCalledTimes(3);
		expect(wm.createTabInWindow).toHaveBeenNthCalledWith(
			1,
			"https://claude.ai/code/session-1",
			100,
		);
		expect(wm.createTabInWindow).toHaveBeenNthCalledWith(
			2,
			"https://github.com/owner/repo/issues/42",
			100,
		);
		expect(wm.createTabInWindow).toHaveBeenNthCalledWith(
			3,
			"https://github.com/owner/repo/pull/123",
			100,
		);

		expect(wm.createWindow).not.toHaveBeenCalled();
		expect(wm.moveWindowToBounds).not.toHaveBeenCalled();
		expect(wm.getScreenWorkArea).not.toHaveBeenCalled();
	});

	it("arrange OFF: 既存 session タブがあれば activateTab する", async () => {
		wm.findTab.mockResolvedValueOnce({
			tabId: 1,
			windowId: 10,
			windowTabCount: 1,
		} satisfies TabInfo);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(false));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		expect(wm.activateTab).toHaveBeenCalledWith(1);
		expect(wm.createTabInWindow).toHaveBeenCalledTimes(2); // issue + pr
	});

	it("arrange OFF: null URL はスキップ", async () => {
		const requestWithNulls = { ...SAMPLE_REQUEST, prUrl: null, sessionUrl: null };
		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(false));
		await usecase.openWorkspace(requestWithNulls);

		expect(wm.createTabInWindow).toHaveBeenCalledTimes(1);
		expect(wm.createTabInWindow).toHaveBeenCalledWith(
			"https://github.com/owner/repo/issues/42",
			100,
		);
	});
});
