import type { TabNavigationPort } from "../../domain/ports/tab-navigation.port";

export class TabNavigationAdapter implements TabNavigationPort {
	async navigateCurrentTab(url: string): Promise<void> {
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
}
