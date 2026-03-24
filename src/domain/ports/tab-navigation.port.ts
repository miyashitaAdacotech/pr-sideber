/**
 * タブナビゲーションのポートインターフェース。
 * Chrome tabs API への依存を抽象化する。
 */
export interface TabNavigationPort {
	navigateCurrentTab(url: string): Promise<void>;
	getCurrentTabUrl(): Promise<string | null>;
	findExistingPrTab(prBaseUrl: string): Promise<number | null>;
	activateTab(tabId: number): Promise<void>;
	openNewTab(url: string): Promise<void>;
}
