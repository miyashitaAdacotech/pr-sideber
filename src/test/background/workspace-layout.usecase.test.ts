import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	calculateLayout,
	createWorkspaceLayoutUseCase,
} from "../../background/workspace-layout.usecase";
import type {
	ScreenBounds,
	TabInfo,
	WindowManagerPort,
} from "../../domain/ports/window-manager.port";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

function createMockWindowManager(): {
	[K in keyof WindowManagerPort]: ReturnType<typeof vi.fn>;
} {
	return {
		getScreenWorkArea: vi.fn(),
		findTab: vi.fn(),
		createWindow: vi.fn(),
		moveWindowToBounds: vi.fn(),
		moveTabToNewWindow: vi.fn(),
	};
}

describe("calculateLayout", () => {
	it("should split screen into left-half, right-top, right-bottom", () => {
		const screen: ScreenBounds = { left: 0, top: 0, width: 1920, height: 1080 };
		const layout = calculateLayout(screen);
		expect(layout.claude).toEqual({ left: 0, top: 0, width: 960, height: 1080 });
		expect(layout.issue).toEqual({ left: 960, top: 0, width: 960, height: 540 });
		expect(layout.pr).toEqual({ left: 960, top: 540, width: 960, height: 540 });
	});

	it("should handle odd dimensions without rounding errors", () => {
		const screen: ScreenBounds = { left: 0, top: 0, width: 1921, height: 1081 };
		const layout = calculateLayout(screen);
		expect(layout.claude.width).toBe(960);
		expect(layout.issue.width).toBe(961);
		expect(layout.pr.width).toBe(961);
		expect(layout.issue.height).toBe(540);
		expect(layout.pr.height).toBe(541);
	});

	it("should respect screen offset (workArea with taskbar)", () => {
		const screen: ScreenBounds = { left: 0, top: 0, width: 1920, height: 1040 };
		const layout = calculateLayout(screen);
		expect(layout.claude.height).toBe(1040);
		expect(layout.issue.height).toBe(520);
		expect(layout.pr.top).toBe(520);
		expect(layout.pr.height).toBe(520);
	});
});

describe("createWorkspaceLayoutUseCase", () => {
	let wm: ReturnType<typeof createMockWindowManager>;
	const SCREEN: ScreenBounds = { left: 0, top: 0, width: 1920, height: 1080 };

	beforeEach(() => {
		setupChromeMock();
		wm = createMockWindowManager();
		wm.getScreenWorkArea.mockResolvedValue(SCREEN);
		wm.createWindow.mockResolvedValue(undefined);
		wm.moveWindowToBounds.mockResolvedValue(undefined);
		wm.moveTabToNewWindow.mockResolvedValue(undefined);
	});

	afterEach(() => {
		resetChromeMock();
	});

	it("should create 3 new windows when no existing tabs found", async () => {
		wm.findTab.mockResolvedValue(null);
		const usecase = createWorkspaceLayoutUseCase(wm);
		await usecase.openWorkspace({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: "https://github.com/owner/repo/pull/123",
			sessionUrl: "https://claude.ai/code/session-1",
		});
		expect(wm.createWindow).toHaveBeenCalledTimes(3);
		expect(wm.createWindow).toHaveBeenCalledWith("https://claude.ai/code/session-1", {
			left: 0,
			top: 0,
			width: 960,
			height: 1080,
		});
		expect(wm.createWindow).toHaveBeenCalledWith("https://github.com/owner/repo/issues/42", {
			left: 960,
			top: 0,
			width: 960,
			height: 540,
		});
		expect(wm.createWindow).toHaveBeenCalledWith("https://github.com/owner/repo/pull/123", {
			left: 960,
			top: 540,
			width: 960,
			height: 540,
		});
	});

	it("should reuse existing single-tab window by moving it", async () => {
		const existingTab: TabInfo = { tabId: 10, windowId: 1, windowTabCount: 1 };
		wm.findTab
			.mockResolvedValueOnce(existingTab)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null);
		const usecase = createWorkspaceLayoutUseCase(wm);
		await usecase.openWorkspace({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: "https://github.com/owner/repo/pull/123",
			sessionUrl: "https://claude.ai/code/session-1",
		});
		expect(wm.moveWindowToBounds).toHaveBeenCalledWith(1, {
			left: 0,
			top: 0,
			width: 960,
			height: 1080,
		});
		expect(wm.createWindow).toHaveBeenCalledTimes(2);
	});

	it("should split tab from multi-tab window into new window", async () => {
		const sharedTab: TabInfo = { tabId: 10, windowId: 1, windowTabCount: 3 };
		wm.findTab
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(sharedTab)
			.mockResolvedValueOnce(null);
		const usecase = createWorkspaceLayoutUseCase(wm);
		await usecase.openWorkspace({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: "https://github.com/owner/repo/pull/123",
			sessionUrl: null,
		});
		expect(wm.moveTabToNewWindow).toHaveBeenCalledWith(10, {
			left: 960,
			top: 0,
			width: 960,
			height: 540,
		});
	});

	it("should use placeholder URL when sessionUrl is null", async () => {
		wm.findTab.mockResolvedValue(null);
		const usecase = createWorkspaceLayoutUseCase(wm);
		await usecase.openWorkspace({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: "https://github.com/owner/repo/pull/123",
			sessionUrl: null,
		});
		const claudeCall = (wm.createWindow.mock.calls as [string, ScreenBounds][]).find(
			(call) => call[1].left === 0 && call[1].width === 960,
		);
		expect(claudeCall).toBeDefined();
		expect(claudeCall?.[0]).toContain("placeholder.html");
		expect(claudeCall?.[0]).toContain("type=session");
		expect(claudeCall?.[0]).toContain("issue=42");
	});

	it("should use placeholder URL when prUrl is null", async () => {
		wm.findTab.mockResolvedValue(null);
		const usecase = createWorkspaceLayoutUseCase(wm);
		await usecase.openWorkspace({
			issueNumber: 42,
			issueUrl: "https://github.com/owner/repo/issues/42",
			prUrl: null,
			sessionUrl: "https://claude.ai/code/session-1",
		});
		const prCall = (wm.createWindow.mock.calls as [string, ScreenBounds][]).find(
			(call) => call[1].top === 540,
		);
		expect(prCall).toBeDefined();
		expect(prCall?.[0]).toContain("placeholder.html");
		expect(prCall?.[0]).toContain("type=pr");
		expect(prCall?.[0]).toContain("issue=42");
	});
});
