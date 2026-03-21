import { initializeApp } from "./bootstrap";

initializeApp();

chrome.sidePanel
	.setPanelBehavior({ openPanelOnActionClick: true })
	// TODO: 本番ではエラーレポーティングサービスへの送信を検討する
	.catch((err: unknown) => console.error("sidePanel setup failed:", err));

chrome.runtime.onInstalled.addListener((_details) => {
	// インストール/アップデート時の初期化処理をここに追加する
	// 例: ストレージのマイグレーション、デフォルト設定の書き込みなど
});
