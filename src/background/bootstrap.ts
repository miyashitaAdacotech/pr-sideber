import { ChromeAlarmAdapter } from "../adapter/chrome/alarm.adapter";
import { createChromeBadgeAdapter } from "../adapter/chrome/badge.adapter";
import { ChromeIdentityAdapter } from "../adapter/chrome/identity.adapter";
import { createOAuthConfig } from "../adapter/chrome/oauth.config";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { TabNavigationAdapter } from "../adapter/chrome/tab-navigation.adapter";
import { GitHubGraphQLClient } from "../adapter/github/graphql-client";
import { GitHubApiError } from "../shared/types/errors";
import { createAutoRefreshUseCase } from "../shared/usecase/auto-refresh.usecase";
import { createBadgeUseCase } from "../shared/usecase/badge.usecase";
import { WasmPrProcessor } from "../wasm/pr-processor";
import { createMessageHandler } from "./message-handler";
import type { AppServices } from "./types";

export type { AppServices };

// biome-ignore lint/style/useConst: initializeApp 内で再代入されるため let が必要
let services: AppServices | null = null;

/**
 * Composition Root: Adapter を Port に注入してアプリケーションを構成する
 */
export function initializeApp(): AppServices {
	if (services !== null) return services;

	const config = createOAuthConfig();
	const storage = new ChromeStorageAdapter();
	const auth = new ChromeIdentityAdapter(storage, config);
	const githubApi = new GitHubGraphQLClient(async () => {
		const token = await auth.getToken();
		if (!token) {
			throw new GitHubApiError("unauthorized", "Not authenticated. Token may have expired.");
		}
		return token.accessToken;
	});
	const prProcessor = new WasmPrProcessor();

	const badgeAdapter = createChromeBadgeAdapter();
	const badge = createBadgeUseCase(badgeAdapter);
	const tabNavigation = new TabNavigationAdapter();

	const handler = createMessageHandler({ auth, githubApi, prProcessor, badge, tabNavigation });
	chrome.runtime.onMessage.addListener(handler);

	// タブ変更リスナー: アクティブタブの URL 変更を Side Panel に通知
	async function onTabActivated(activeInfo: { tabId: number; windowId: number }): Promise<void> {
		try {
			const tab = await chrome.tabs.get(activeInfo.tabId);
			const url = tab?.url;
			if (url) {
				await chrome.runtime.sendMessage({ type: "TAB_URL_CHANGED", url });
			}
		} catch {
			// Side Panel が閉じている場合の "Receiving end does not exist" は正常系
		}
	}

	async function onTabUpdated(
		_tabId: number,
		changeInfo: { url?: string; status?: string },
		tab: chrome.tabs.Tab,
	): Promise<void> {
		if (!changeInfo.url || !tab.active) return;
		try {
			await chrome.runtime.sendMessage({ type: "TAB_URL_CHANGED", url: changeInfo.url });
		} catch {
			// Side Panel が閉じている場合の "Receiving end does not exist" は正常系
		}
	}

	chrome.tabs.onActivated.addListener(onTabActivated);
	chrome.tabs.onUpdated.addListener(onTabUpdated);

	const alarm = new ChromeAlarmAdapter();
	const autoRefresh = createAutoRefreshUseCase({
		alarm,
		storage,
		fetchAndProcessPrs: async () => {
			const raw = await githubApi.fetchPullRequests();
			const processed = await prProcessor.processPullRequests(raw.rawJson);
			return { ...processed, hasMore: raw.hasMore };
		},
		notifyCacheUpdated: async (lastUpdatedAt: string) => {
			try {
				await chrome.runtime.sendMessage({
					type: "CACHE_UPDATED",
					lastUpdatedAt,
				});
			} catch {
				// Side Panel が閉じている場合の "Receiving end does not exist" は正常系
			}
		},
		onRefreshComplete: (data) => {
			badge.updateBadge(data.reviewRequests.totalCount).catch((err: unknown) => {
				if (import.meta.env.DEV) {
					console.error("[bootstrap] Failed to update badge:", err);
				}
			});
		},
	});
	autoRefresh.start().catch((err: unknown) => {
		if (import.meta.env.DEV) {
			console.error("[bootstrap] Failed to start auto-refresh:", err);
		}
	});

	let disposed = false;
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		autoRefresh.stop().catch((err: unknown) => {
			if (import.meta.env.DEV) {
				console.error("[bootstrap] Failed to stop auto-refresh:", err);
			}
		});
		try {
			auth.dispose();
		} finally {
			chrome.runtime.onMessage.removeListener(handler);
			chrome.tabs.onActivated.removeListener(onTabActivated);
			chrome.tabs.onUpdated.removeListener(onTabUpdated);
			services = null; // dispose 後は再初期化を許可する
		}
	};

	services = { auth, githubApi, prProcessor, badge, tabNavigation, dispose };
	return services;
}
