import type { StoragePort } from "../../domain/ports/storage.port";

export const PINNED_TABS_STORAGE_KEY = "epicTabs.v1";

export type PinnedTab = {
	readonly type: "epic" | "issue";
	readonly number: number;
	readonly title: string;
};

export type PinnedTabsState = {
	readonly pinned: readonly PinnedTab[];
	readonly activeKey: string | null;
};

export function tabKey(ref: { readonly type: "epic" | "issue"; readonly number: number }): string {
	return `${ref.type}-${ref.number}`;
}

function isPinnedTab(value: unknown): value is PinnedTab {
	if (typeof value !== "object" || value === null) return false;
	const o = value as Record<string, unknown>;
	return (
		(o.type === "epic" || o.type === "issue") &&
		typeof o.number === "number" &&
		typeof o.title === "string"
	);
}

function isPinnedTabsState(value: unknown): value is PinnedTabsState {
	if (typeof value !== "object" || value === null) return false;
	const o = value as Record<string, unknown>;
	if (!Array.isArray(o.pinned)) return false;
	if (!o.pinned.every(isPinnedTab)) return false;
	if (o.activeKey !== null && typeof o.activeKey !== "string") return false;
	return true;
}

export type PinnedTabsStore = {
	readonly pinned: readonly PinnedTab[];
	readonly activeKey: string | null;
	readonly loaded: boolean;
	load(): Promise<void>;
	pin(tab: PinnedTab): Promise<void>;
	unpin(key: string): Promise<void>;
	activate(key: string | null): Promise<void>;
};

export function createPinnedTabsStore(storage: StoragePort): PinnedTabsStore {
	let pinned = $state<readonly PinnedTab[]>([]);
	let activeKey = $state<string | null>(null);
	let loaded = $state(false);

	async function persist(): Promise<void> {
		const snapshot: PinnedTabsState = { pinned, activeKey };
		await storage.set(PINNED_TABS_STORAGE_KEY, snapshot);
	}

	return {
		get pinned() {
			return pinned;
		},
		get activeKey() {
			return activeKey;
		},
		get loaded() {
			return loaded;
		},

		async load() {
			const value = await storage.get(PINNED_TABS_STORAGE_KEY, isPinnedTabsState);
			if (value) {
				pinned = value.pinned;
				activeKey = value.activeKey;
			}
			loaded = true;
		},

		async pin(tab: PinnedTab) {
			const key = tabKey(tab);
			if (pinned.some((p) => tabKey(p) === key)) return;
			pinned = [...pinned, tab];
			await persist();
		},

		async unpin(key: string) {
			pinned = pinned.filter((p) => tabKey(p) !== key);
			if (activeKey === key) activeKey = null;
			await persist();
		},

		async activate(key: string | null) {
			activeKey = key;
			await persist();
		},
	};
}
