/**
 * `sessionIssueMapping` (chrome.storage.local) の変更を購読するユーティリティ。
 *
 * 背景:
 *   Sidepanel から setMapping で書き込まれた内容を、同じ Sidepanel 側の UI ツリーに
 *   即座に反映するため、storage 変更イベントを subscribe する必要がある。
 *   chrome.* API 呼び出しは `src/shared/` または `src/background/` に集約する規約に従い、
 *   Svelte コンポーネントから直接 chrome API を触らずこのモジュール経由で購読する。
 *
 * 仕様:
 *   - `area === "local"` かつ `STORAGE_KEY` が changes に含まれるときのみ callback を呼ぶ
 *   - 他キーや他 area の変更ではコールバックを呼ばない (無駄な再描画を防ぐ)
 *   - 戻り値は unsubscribe 関数 (Svelte `$effect` の cleanup に渡す想定)
 */

const STORAGE_KEY = "sessionIssueMapping";

export function subscribeToMappingChanges(callback: () => void): () => void {
	const listener = (
		changes: { [key: string]: chrome.storage.StorageChange },
		area: chrome.storage.AreaName,
	): void => {
		if (area !== "local") return;
		if (!(STORAGE_KEY in changes)) return;
		callback();
	};
	chrome.storage.onChanged.addListener(listener);
	return () => {
		chrome.storage.onChanged.removeListener(listener);
	};
}
