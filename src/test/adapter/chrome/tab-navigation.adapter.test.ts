import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabNavigationAdapter } from "../../../adapter/chrome/tab-navigation.adapter";
import type { TabNavigationPort } from "../../../domain/ports/tab-navigation.port";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("TabNavigationAdapter", () => {
	let adapter: TabNavigationPort;

	beforeEach(() => {
		setupChromeMock();
		adapter = new TabNavigationAdapter();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("navigateCurrentTab", () => {
		it("should call chrome.tabs.update with the active tab id and url", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 42, url: "https://github.com/old" }]);
			mock.tabs.update.mockResolvedValue(undefined);

			await adapter.navigateCurrentTab("https://github.com/owner/repo/pull/1");

			expect(mock.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
			expect(mock.tabs.update).toHaveBeenCalledWith(42, {
				url: "https://github.com/owner/repo/pull/1",
			});
		});

		it("should throw when no active tab exists", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([]);

			await expect(
				adapter.navigateCurrentTab("https://github.com/owner/repo/pull/1"),
			).rejects.toThrow();
		});

		it("should throw when active tab has no id", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ url: "https://github.com" }]);

			await expect(
				adapter.navigateCurrentTab("https://github.com/owner/repo/pull/1"),
			).rejects.toThrow();
		});

		it("should throw when url does not start with https://github.com/", async () => {
			await expect(adapter.navigateCurrentTab("javascript:alert(1)")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});

		it("should throw for http://github.com/ (non-https)", async () => {
			await expect(adapter.navigateCurrentTab("http://github.com/owner/repo")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});

		it("should propagate error when chrome.tabs.update rejects", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 42, url: "https://github.com/old" }]);
			mock.tabs.update.mockRejectedValue(new Error("Tab update failed"));

			await expect(
				adapter.navigateCurrentTab("https://github.com/owner/repo/pull/1"),
			).rejects.toThrow("Tab update failed");
		});
	});

	describe("findExistingPrTab", () => {
		it("should return tab id when a tab with the same PR base URL exists", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://github.com/owner/repo/pull/42" },
				{ id: 20, url: "https://github.com/other/repo/pull/1" },
			]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/42");

			expect(tabId).toBe(10);
			expect(mock.tabs.query).toHaveBeenCalledWith({ url: "https://github.com/*/*/pull/*" });
		});

		it("should match a tab with a sub-path like /files", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([
				{ id: 15, url: "https://github.com/owner/repo/pull/42/files#diff-abc" },
			]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/42");

			expect(tabId).toBe(15);
		});

		it("should return null when no matching PR tab exists", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 10, url: "https://github.com/owner/repo/pull/99" }]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/42");

			expect(tabId).toBeNull();
		});

		it("should ignore tabs for a different PR number", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([
				{ id: 10, url: "https://github.com/owner/repo/pull/1" },
				{ id: 20, url: "https://github.com/owner/repo/pull/2" },
			]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/42");

			expect(tabId).toBeNull();
		});

		it("should not match pull/42 when searching for pull/4 (no partial number match)", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 10, url: "https://github.com/owner/repo/pull/42" }]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/4");

			expect(tabId).toBeNull();
		});

		it("should skip tabs without a url property", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([
				{ id: 5 },
				{ id: 10, url: "https://github.com/owner/repo/pull/42" },
			]);

			const tabId = await adapter.findExistingPrTab("https://github.com/owner/repo/pull/42");

			expect(tabId).toBe(10);
		});
	});

	describe("activateTab", () => {
		it("should call chrome.tabs.update and chrome.windows.update to focus the tab", async () => {
			const mock = getChromeMock();
			mock.tabs.update.mockResolvedValue({ id: 10, windowId: 5 });
			mock.windows.update.mockResolvedValue(undefined);

			await adapter.activateTab(10);

			expect(mock.tabs.update).toHaveBeenCalledWith(10, { active: true });
			expect(mock.windows.update).toHaveBeenCalledWith(5, { focused: true });
		});

		it("should not call chrome.windows.update when tab has no windowId", async () => {
			const mock = getChromeMock();
			mock.tabs.update.mockResolvedValue({ id: 10 });

			await adapter.activateTab(10);

			expect(mock.tabs.update).toHaveBeenCalledWith(10, { active: true });
			expect(mock.windows.update).not.toHaveBeenCalled();
		});
	});

	describe("openNewTab", () => {
		it("should call chrome.tabs.create with the url", async () => {
			const mock = getChromeMock();
			mock.tabs.create.mockResolvedValue({ id: 99 });

			await adapter.openNewTab("https://github.com/owner/repo/pull/42");

			expect(mock.tabs.create).toHaveBeenCalledWith({
				url: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should throw when url does not start with https://github.com/", async () => {
			await expect(adapter.openNewTab("javascript:alert(1)")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});

		it("should throw for http://github.com/ (non-https)", async () => {
			await expect(adapter.openNewTab("http://github.com/owner/repo")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});
	});

	describe("getTabUrl", () => {
		it("should return the URL of the specified tab", async () => {
			const mock = getChromeMock();
			mock.tabs.get.mockResolvedValue({
				id: 42,
				url: "https://github.com/owner/repo/pull/10/files",
			});

			const url = await adapter.getTabUrl(42);

			expect(url).toBe("https://github.com/owner/repo/pull/10/files");
			expect(mock.tabs.get).toHaveBeenCalledWith(42);
		});

		it("should return null when tab does not exist", async () => {
			const mock = getChromeMock();
			mock.tabs.get.mockRejectedValue(new Error("No tab with id: 999"));

			const url = await adapter.getTabUrl(999);

			expect(url).toBeNull();
		});

		it("should return null when tab has no URL", async () => {
			const mock = getChromeMock();
			mock.tabs.get.mockResolvedValue({ id: 42 });

			const url = await adapter.getTabUrl(42);

			expect(url).toBeNull();
		});
	});

	describe("navigateTabToUrl", () => {
		it("should call chrome.tabs.update with the tab id and url", async () => {
			const mock = getChromeMock();
			mock.tabs.update.mockResolvedValue(undefined);

			await adapter.navigateTabToUrl(42, "https://github.com/owner/repo/pull/10");

			expect(mock.tabs.update).toHaveBeenCalledWith(42, {
				url: "https://github.com/owner/repo/pull/10",
			});
		});

		it("should propagate error when chrome.tabs.update rejects", async () => {
			const mock = getChromeMock();
			mock.tabs.update.mockRejectedValue(new Error("No tab with id: 42"));

			await expect(
				adapter.navigateTabToUrl(42, "https://github.com/owner/repo/pull/10"),
			).rejects.toThrow("No tab with id: 42");
		});

		it("should throw when url does not start with https://github.com/", async () => {
			await expect(adapter.navigateTabToUrl(42, "javascript:alert(1)")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});

		it("should throw for http://github.com/ (non-https)", async () => {
			await expect(adapter.navigateTabToUrl(42, "http://github.com/owner/repo")).rejects.toThrow(
				"URL must start with https://github.com/",
			);
		});
	});

	describe("getCurrentTabUrl", () => {
		it("should return the URL of the active tab", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 1, url: "https://github.com/owner/repo/pull/5" }]);

			const url = await adapter.getCurrentTabUrl();

			expect(url).toBe("https://github.com/owner/repo/pull/5");
		});

		it("should return null when no active tab exists", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([]);

			const url = await adapter.getCurrentTabUrl();

			expect(url).toBeNull();
		});

		it("should return null when active tab has no URL", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 1 }]);

			const url = await adapter.getCurrentTabUrl();

			expect(url).toBeNull();
		});
	});
});
