import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WindowManagerAdapter } from "../../../adapter/chrome/window-manager.adapter";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("WindowManagerAdapter", () => {
	let adapter: WindowManagerAdapter;

	beforeEach(() => {
		setupChromeMock();
		adapter = new WindowManagerAdapter();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("getScreenWorkArea", () => {
		it("should return workArea of the first display", async () => {
			const mock = getChromeMock();
			mock.system.display.getInfo.mockImplementation((cb: (info: unknown[]) => void) => {
				cb([{ workArea: { left: 0, top: 0, width: 1920, height: 1040 } }]);
			});

			const result = await adapter.getScreenWorkArea();

			expect(result).toEqual({ left: 0, top: 0, width: 1920, height: 1040 });
		});
	});

	describe("findTab", () => {
		it("should return TabInfo when matching tab is found in a single-tab window", async () => {
			const mock = getChromeMock();
			mock.tabs.query
				.mockResolvedValueOnce([
					{ id: 10, url: "https://github.com/owner/repo/issues/42", windowId: 1 },
				])
				.mockResolvedValueOnce([{ id: 10 }]);

			const result = await adapter.findTab(
				"https://github.com/*/*/issues/*",
				"https://github.com/owner/repo/issues/42",
			);

			expect(result).toEqual({ tabId: 10, windowId: 1, windowTabCount: 1 });
		});

		it("should return null when no matching tab exists", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([]);

			const result = await adapter.findTab(
				"https://github.com/*/*/issues/*",
				"https://github.com/owner/repo/issues/99",
			);

			expect(result).toBeNull();
		});

		it("should match tabs whose URL starts with matchUrl (fragment tolerance)", async () => {
			const mock = getChromeMock();
			mock.tabs.query
				.mockResolvedValueOnce([
					{ id: 10, url: "https://github.com/owner/repo/issues/42#comment-1", windowId: 1 },
				])
				.mockResolvedValueOnce([{ id: 10 }]);

			const result = await adapter.findTab(
				"https://github.com/*/*/issues/*",
				"https://github.com/owner/repo/issues/42",
			);

			expect(result).toEqual({ tabId: 10, windowId: 1, windowTabCount: 1 });
		});

		it("should report correct windowTabCount for multi-tab window", async () => {
			const mock = getChromeMock();
			mock.tabs.query
				.mockResolvedValueOnce([
					{ id: 10, url: "https://github.com/owner/repo/issues/42", windowId: 1 },
				])
				.mockResolvedValueOnce([{ id: 10 }, { id: 11 }, { id: 12 }]);

			const result = await adapter.findTab(
				"https://github.com/*/*/issues/*",
				"https://github.com/owner/repo/issues/42",
			);

			expect(result).toEqual({ tabId: 10, windowId: 1, windowTabCount: 3 });
		});
	});

	describe("createWindow", () => {
		it("should call chrome.windows.create with url and bounds", async () => {
			const mock = getChromeMock();
			mock.windows.create.mockResolvedValue({ id: 5 });

			await adapter.createWindow("https://github.com/owner/repo/issues/42", {
				left: 0,
				top: 0,
				width: 960,
				height: 1040,
			});

			expect(mock.windows.create).toHaveBeenCalledWith({
				url: "https://github.com/owner/repo/issues/42",
				left: 0,
				top: 0,
				width: 960,
				height: 1040,
				focused: false,
			});
		});
	});

	describe("moveWindowToBounds", () => {
		it("should update bounds directly when window is normal", async () => {
			const mock = getChromeMock();
			mock.windows.get.mockResolvedValue({ state: "normal" });
			mock.windows.update.mockResolvedValue({});

			await adapter.moveWindowToBounds(1, { left: 960, top: 0, width: 960, height: 520 });

			expect(mock.windows.update).toHaveBeenCalledTimes(1);
			expect(mock.windows.update).toHaveBeenCalledWith(1, {
				left: 960,
				top: 0,
				width: 960,
				height: 520,
			});
		});

		it("should unmaximize first then update bounds when maximized", async () => {
			const mock = getChromeMock();
			mock.windows.get.mockResolvedValue({ state: "maximized" });
			mock.windows.update.mockResolvedValue({});

			await adapter.moveWindowToBounds(1, { left: 0, top: 0, width: 960, height: 1040 });

			expect(mock.windows.update).toHaveBeenCalledTimes(2);
			expect(mock.windows.update).toHaveBeenNthCalledWith(1, 1, { state: "normal" });
			expect(mock.windows.update).toHaveBeenNthCalledWith(2, 1, {
				left: 0,
				top: 0,
				width: 960,
				height: 1040,
			});
		});
	});

	describe("moveTabToNewWindow", () => {
		it("should call chrome.windows.create with tabId and bounds", async () => {
			const mock = getChromeMock();
			mock.windows.create.mockResolvedValue({ id: 6 });

			await adapter.moveTabToNewWindow(10, { left: 960, top: 520, width: 960, height: 520 });

			expect(mock.windows.create).toHaveBeenCalledWith({
				tabId: 10,
				left: 960,
				top: 520,
				width: 960,
				height: 520,
				focused: false,
			});
		});
	});
});
