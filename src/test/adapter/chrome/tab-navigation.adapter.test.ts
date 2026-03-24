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

		it("should propagate error when chrome.tabs.update rejects", async () => {
			const mock = getChromeMock();
			mock.tabs.query.mockResolvedValue([{ id: 42, url: "https://github.com/old" }]);
			mock.tabs.update.mockRejectedValue(new Error("Tab update failed"));

			await expect(
				adapter.navigateCurrentTab("https://github.com/owner/repo/pull/1"),
			).rejects.toThrow("Tab update failed");
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
