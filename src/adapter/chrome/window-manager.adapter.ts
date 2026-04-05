import type {
	ScreenBounds,
	TabInfo,
	WindowManagerPort,
} from "../../domain/ports/window-manager.port";

export class WindowManagerAdapter implements WindowManagerPort {
	async getScreenWorkArea(): Promise<ScreenBounds> {
		return new Promise<ScreenBounds>((resolve, reject) => {
			chrome.system.display.getInfo((displays) => {
				const workArea = displays[0]?.workArea;
				if (!workArea) {
					reject(new Error("No display found"));
					return;
				}
				resolve({
					left: workArea.left,
					top: workArea.top,
					width: workArea.width,
					height: workArea.height,
				});
			});
		});
	}

	async findTab(queryPattern: string, matchUrl: string): Promise<TabInfo | null> {
		const tabs = await chrome.tabs.query({ url: queryPattern });
		for (const tab of tabs) {
			if (tab.id == null || tab.windowId == null || !tab.url) continue;
			if (!tab.url.startsWith(matchUrl)) continue;

			const windowTabs = await chrome.tabs.query({ windowId: tab.windowId });
			return {
				tabId: tab.id,
				windowId: tab.windowId,
				windowTabCount: windowTabs.length,
			};
		}
		return null;
	}

	async getWindowBounds(windowId: number): Promise<ScreenBounds> {
		const win = await chrome.windows.get(windowId);
		return {
			left: win.left ?? 0,
			top: win.top ?? 0,
			width: win.width ?? 0,
			height: win.height ?? 0,
		};
	}

	async createWindow(
		url: string,
		bounds: ScreenBounds,
	): Promise<{ windowId: number; tabId: number }> {
		const win = await chrome.windows.create({
			url,
			left: bounds.left,
			top: bounds.top,
			width: bounds.width,
			height: bounds.height,
			focused: false,
		});
		return { windowId: win?.id ?? 0, tabId: win?.tabs?.[0]?.id ?? 0 };
	}

	async moveWindowToBounds(windowId: number, bounds: ScreenBounds): Promise<void> {
		// Chrome API では state と bounds の同時指定で bounds が無視される場合がある
		await chrome.windows.update(windowId, { state: "normal" });
		await chrome.windows.update(windowId, {
			left: bounds.left,
			top: bounds.top,
			width: bounds.width,
			height: bounds.height,
		});
	}

	async moveTabToNewWindow(tabId: number, bounds: ScreenBounds): Promise<void> {
		await chrome.windows.create({
			tabId,
			left: bounds.left,
			top: bounds.top,
			width: bounds.width,
			height: bounds.height,
			focused: false,
		});
	}

	async navigateTab(tabId: number, url: string): Promise<void> {
		await chrome.tabs.update(tabId, { url, active: true });
	}

	async windowExists(windowId: number): Promise<boolean> {
		try {
			await chrome.windows.get(windowId);
			return true;
		} catch {
			return false;
		}
	}

	async activateTab(tabId: number): Promise<void> {
		const tab = await chrome.tabs.update(tabId, { active: true });
		if (tab?.windowId != null) {
			await chrome.windows.update(tab.windowId, { focused: true });
		}
	}

	async createTabInWindow(url: string, windowId: number): Promise<{ tabId: number }> {
		const tab = await chrome.tabs.create({ url, windowId, active: false });
		return { tabId: tab.id ?? 0 };
	}
}
