/**
 * タブナビゲーションのポートインターフェース。
 * Chrome tabs API への依存を抽象化する。
 */
export interface TabNavigationPort {
	navigateCurrentTab(url: string): Promise<void>;
	getCurrentTabUrl(): Promise<string | null>;
}
