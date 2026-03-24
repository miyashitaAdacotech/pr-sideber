import type { TabNavigationPort } from "../../domain/ports/tab-navigation.port";
import { extractPrBaseUrl } from "../../shared/utils/github-url";

const ALLOWED_URL_PREFIX = "https://github.com/";

function assertGitHubUrl(url: string): void {
	if (!url.startsWith(ALLOWED_URL_PREFIX)) {
		throw new Error(`URL must start with ${ALLOWED_URL_PREFIX}, got: ${url}`);
	}
}

export class TabNavigationAdapter implements TabNavigationPort {
	async navigateCurrentTab(url: string): Promise<void> {
		assertGitHubUrl(url);
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		const activeTab = tabs[0];
		if (!activeTab?.id) {
			throw new Error("No active tab found");
		}
		await chrome.tabs.update(activeTab.id, { url });
	}

	async getCurrentTabUrl(): Promise<string | null> {
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		const activeTab = tabs[0];
		return activeTab?.url ?? null;
	}

	async findExistingPrTab(prBaseUrl: string): Promise<number | null> {
		const tabs = await chrome.tabs.query({ url: "https://github.com/*/*/pull/*" });
		for (const tab of tabs) {
			if (!tab.url) continue;
			const baseUrl = extractPrBaseUrl(tab.url);
			if (baseUrl === prBaseUrl) {
				return tab.id ?? null;
			}
		}
		return null;
	}

	async activateTab(tabId: number): Promise<void> {
		const tab = await chrome.tabs.update(tabId, { active: true });
		if (tab?.windowId) {
			await chrome.windows.update(tab.windowId, { focused: true });
		}
	}

	async openNewTab(url: string): Promise<void> {
		assertGitHubUrl(url);
		await chrome.tabs.create({ url });
	}

	async getTabUrl(tabId: number): Promise<string | null> {
		try {
			const tab = await chrome.tabs.get(tabId);
			return tab?.url ?? null;
		} catch {
			return null;
		}
	}

	async navigateTabToUrl(tabId: number, url: string): Promise<void> {
		assertGitHubUrl(url);
		await chrome.tabs.update(tabId, { url });
	}
}
