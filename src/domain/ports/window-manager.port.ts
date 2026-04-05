export interface ScreenBounds {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

export interface TabInfo {
	readonly tabId: number;
	readonly windowId: number;
	readonly windowTabCount: number;
}

export interface WindowManagerPort {
	/** プライマリモニタの workArea (タスクバー除外) を取得する */
	getScreenWorkArea(): Promise<ScreenBounds>;

	/**
	 * URL が一致するタブを検索する。
	 * @param queryPattern - chrome.tabs.query に渡す URL パターン
	 * @param matchUrl - tab.url が matchUrl で始まるか比較する
	 */
	findTab(queryPattern: string, matchUrl: string): Promise<TabInfo | null>;

	/** 指定 URL と位置で新しいウィンドウを作成し、作成された windowId と tabId を返す */
	createWindow(url: string, bounds: ScreenBounds): Promise<{ windowId: number; tabId: number }>;

	/** 既存タブを指定 URL にナビゲートする */
	navigateTab(tabId: number, url: string): Promise<void>;

	/** 指定ウィンドウがまだ存在するか確認する */
	windowExists(windowId: number): Promise<boolean>;

	/** 指定ウィンドウの現在位置・サイズを取得する */
	getWindowBounds(windowId: number): Promise<ScreenBounds>;

	/** 既存ウィンドウを指定位置に移動・リサイズする */
	moveWindowToBounds(windowId: number, bounds: ScreenBounds): Promise<void>;

	/** タブを新しいウィンドウに分離し、指定位置に配置する */
	moveTabToNewWindow(tabId: number, bounds: ScreenBounds): Promise<void>;

	/** 既存タブをアクティブにし、そのウィンドウにフォーカスする */
	activateTab(tabId: number): Promise<void>;

	/** 指定ウィンドウに新しいタブを作成する (バックグラウンドで開く) */
	createTabInWindow(url: string, windowId: number): Promise<{ tabId: number }>;
}
