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

		// 左半分: Claude Code Web (session)
		expect(layout.left).toEqual({
			left: 0,
			top: 0,
			width: 960,
			height: 1040,
		});

		// 右上: Issue
		expect(layout.topRight).toEqual({
			left: 960,
			top: 0,
			width: 960,
			height: 520,
		});

		// 右下: PR
		expect(layout.bottomRight).toEqual({
			left: 960,
			top: 520,
			width: 960,
			height: 520,
		});
	});

	it("should handle odd pixel dimensions with Math.round", () => {
		const oddWorkArea: ScreenBounds = {
			left: 0,
			top: 0,
			width: 1921,
			height: 1041,
		};
		const layout = calculateThreePanelLayout(oddWorkArea);

		// 幅 1921 / 2 = 960.5 -> Math.round -> 961
		expect(layout.left.width).toBe(961);
		expect(layout.topRight.left).toBe(961);
		expect(layout.topRight.width).toBe(961);

		// 高さ 1041 / 2 = 520.5 -> Math.round -> 521
		expect(layout.topRight.height).toBe(521);
		expect(layout.bottomRight.top).toBe(521);
		expect(layout.bottomRight.height).toBe(521);
	});
});

// --- createWorkspaceOpenUseCase ---

describe("createWorkspaceOpenUseCase", () => {
	let wm: ReturnType<typeof createMockWindowManager>;

	beforeEach(() => {
		setupChromeMock();
		wm = createMockWindowManager();
		wm.getScreenWorkArea.mockResolvedValue(FULL_HD_WORK_AREA);
		wm.createWindow.mockResolvedValue(undefined);
		wm.moveWindowToBounds.mockResolvedValue(undefined);
		wm.moveTabToNewWindow.mockResolvedValue(undefined);
		wm.activateTab.mockResolvedValue(undefined);
		wm.createTabInWindow.mockResolvedValue(undefined);
		// デフォルト: ウィンドウは遠い位置にある（配置済み判定に引っかからない）
		wm.getWindowBounds.mockResolvedValue({ left: 9999, top: 9999, width: 100, height: 100 });
	});

	afterEach(() => {
		resetChromeMock();
	});

	// --- arrange ON テスト (Step 1: タブ開く + Step 2: 配置) ---

	it("arrange ON: should activate tabs first, then move windows", async () => {
		const sessionTab = { tabId: 1, windowId: 10, windowTabCount: 1 } satisfies TabInfo;
		const issueTab = { tabId: 2, windowId: 20, windowTabCount: 1 } satisfies TabInfo;
		const prTab = { tabId: 3, windowId: 30, windowTabCount: 1 } satisfies TabInfo;

		wm.findTab
			// Step 1 (placeResourceSimple)
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab)
			// Step 2 (placeResourceArranged)
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Step 1: タブをアクティベート
		expect(wm.activateTab).toHaveBeenCalledTimes(3);
		// Step 2: ウィンドウを配置
		expect(wm.moveWindowToBounds).toHaveBeenCalledTimes(3);
		expect(wm.moveWindowToBounds).toHaveBeenNthCalledWith(1, 10, {
			left: 0,
			top: 0,
			width: 960,
			height: 1040,
		});
		expect(wm.moveWindowToBounds).toHaveBeenNthCalledWith(2, 20, {
			left: 960,
			top: 0,
			width: 960,
			height: 520,
		});
		expect(wm.moveWindowToBounds).toHaveBeenNthCalledWith(3, 30, {
			left: 960,
			top: 520,
			width: 960,
			height: 520,
		});
	});

	it("arrange ON: should create tabs first, then create positioned windows when not found", async () => {
		// Step 1: タブなし → senderWindowId にタブ作成
		// Step 2: 作成済みタブが senderWindowId にある（複数タブウィンドウ）→ moveTabToNewWindow
		const createdSession = { tabId: 11, windowId: 100, windowTabCount: 4 } satisfies TabInfo;
		const createdIssue = { tabId: 12, windowId: 100, windowTabCount: 5 } satisfies TabInfo;
		const createdPr = { tabId: 13, windowId: 100, windowTabCount: 6 } satisfies TabInfo;

		wm.findTab
			// Step 1: タブが見つからない
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			// Step 2: Step 1 で作成済みタブが見つかる
			.mockResolvedValueOnce(createdSession)
			.mockResolvedValueOnce(createdIssue)
			.mockResolvedValueOnce(createdPr);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Step 1: senderWindowId にタブ作成
		expect(wm.createTabInWindow).toHaveBeenCalledTimes(3);
		// Step 2: 複数タブウィンドウから分離して配置
		expect(wm.moveTabToNewWindow).toHaveBeenCalledTimes(3);
		expect(wm.moveTabToNewWindow).toHaveBeenNthCalledWith(1, 11, {
			left: 0,
			top: 0,
			width: 960,
			height: 1040,
		});
	});

	it("arrange ON: should separate tab to new window when in multi-tab window", async () => {
		const sessionTab = { tabId: 1, windowId: 10, windowTabCount: 5 } satisfies TabInfo;
		const issueTab = { tabId: 2, windowId: 20, windowTabCount: 3 } satisfies TabInfo;
		const prTab = { tabId: 3, windowId: 30, windowTabCount: 2 } satisfies TabInfo;

		wm.findTab
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab)
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Step 1: アクティベート
		expect(wm.activateTab).toHaveBeenCalledTimes(3);
		// Step 2: 分離して配置
		expect(wm.moveTabToNewWindow).toHaveBeenCalledTimes(3);
		expect(wm.moveTabToNewWindow).toHaveBeenNthCalledWith(1, 1, {
			left: 0,
			top: 0,
			width: 960,
			height: 1040,
		});
	});

	it("arrange ON: should handle mixed scenarios (move + separate + create)", async () => {
		const sessionTab = { tabId: 1, windowId: 10, windowTabCount: 1 } satisfies TabInfo;
		const issueTab = { tabId: 2, windowId: 20, windowTabCount: 5 } satisfies TabInfo;
		const createdPr = { tabId: 13, windowId: 100, windowTabCount: 4 } satisfies TabInfo;

		wm.findTab
			// Step 1
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(null)
			// Step 2
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(createdPr);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Step 1
		expect(wm.activateTab).toHaveBeenCalledTimes(2);
		expect(wm.createTabInWindow).toHaveBeenCalledTimes(1);
		// Step 2
		expect(wm.moveWindowToBounds).toHaveBeenCalledTimes(1);
		expect(wm.moveTabToNewWindow).toHaveBeenCalledTimes(2); // issue + pr
	});

	it("arrange ON: should skip moving when within tolerance (+-20px)", async () => {
		const sessionTab = { tabId: 1, windowId: 10, windowTabCount: 1 } satisfies TabInfo;
		const issueTab = { tabId: 2, windowId: 20, windowTabCount: 1 } satisfies TabInfo;
		const prTab = { tabId: 3, windowId: 30, windowTabCount: 1 } satisfies TabInfo;

		wm.findTab
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab)
			.mockResolvedValueOnce(sessionTab)
			.mockResolvedValueOnce(issueTab)
			.mockResolvedValueOnce(prTab);

		wm.getWindowBounds
			.mockResolvedValueOnce({ left: 5, top: 3, width: 955, height: 1035 })
			.mockResolvedValueOnce({ left: 965, top: 5, width: 955, height: 515 })
			.mockResolvedValueOnce({ left: 965, top: 525, width: 955, height: 515 });

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		// Step 1: アクティベート
		expect(wm.activateTab).toHaveBeenCalledTimes(3);
		// Step 2: 許容範囲内なので移動しない
		expect(wm.moveWindowToBounds).not.toHaveBeenCalled();
	});

	it("arrange ON: should skip resources with null URL in both steps", async () => {
		const requestWithNulls = {
			...SAMPLE_REQUEST,
			prUrl: null,
			sessionUrl: null,
		};

		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(true));
		await usecase.openWorkspace(requestWithNulls);

		// Step 1 + Step 2 で issue のみ処理 = findTab 2回
		expect(wm.findTab).toHaveBeenCalledTimes(2);
		// Step 1: senderWindowId にタブ作成
		expect(wm.createTabInWindow).toHaveBeenCalledTimes(1);
	});

	// --- arrange OFF テスト (新規) ---

	it("arrange OFF: should activateTab for existing tabs", async () => {
		wm.findTab
			.mockResolvedValueOnce({ tabId: 1, windowId: 10, windowTabCount: 1 } satisfies TabInfo)
			.mockResolvedValueOnce({ tabId: 2, windowId: 20, windowTabCount: 3 } satisfies TabInfo)
			.mockResolvedValueOnce({ tabId: 3, windowId: 30, windowTabCount: 1 } satisfies TabInfo);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(false));
		await usecase.openWorkspace(SAMPLE_REQUEST);

		expect(wm.activateTab).toHaveBeenCalledTimes(3);
		expect(wm.activateTab).toHaveBeenNthCalledWith(1, 1);
		expect(wm.activateTab).toHaveBeenNthCalledWith(2, 2);
		expect(wm.activateTab).toHaveBeenNthCalledWith(3, 3);

		// ウィンドウ操作は一切しない
		expect(wm.createWindow).not.toHaveBeenCalled();
		expect(wm.moveWindowToBounds).not.toHaveBeenCalled();
		expect(wm.moveTabToNewWindow).not.toHaveBeenCalled();
		expect(wm.getScreenWorkArea).not.toHaveBeenCalled();
	});

	it("arrange OFF: should createTabInWindow with senderWindowId for missing tabs", async () => {
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

		// ウィンドウ操作は一切しない
		expect(wm.createWindow).not.toHaveBeenCalled();
		expect(wm.moveWindowToBounds).not.toHaveBeenCalled();
		expect(wm.moveTabToNewWindow).not.toHaveBeenCalled();
		expect(wm.getScreenWorkArea).not.toHaveBeenCalled();
	});

	it("arrange OFF: should skip resources with null URL", async () => {
		const requestWithNulls = {
			...SAMPLE_REQUEST,
			prUrl: null,
			sessionUrl: null,
		};

		wm.findTab.mockResolvedValue(null);

		const usecase = createWorkspaceOpenUseCase(wm, createMockSettings(false));
		await usecase.openWorkspace(requestWithNulls);

		// session と pr は null なのでスキップ。issue のみ
		expect(wm.createTabInWindow).toHaveBeenCalledTimes(1);
		expect(wm.createTabInWindow).toHaveBeenCalledWith(
			"https://github.com/owner/repo/issues/42",
			100,
		);
	});
});
