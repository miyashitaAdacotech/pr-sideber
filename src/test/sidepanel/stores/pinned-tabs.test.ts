import { describe, expect, it, vi } from "vitest";
import type { StoragePort } from "../../../domain/ports/storage.port";
import {
	PINNED_TABS_STORAGE_KEY,
	createPinnedTabsStore,
	tabKey,
} from "../../../sidepanel/stores/pinned-tabs.svelte";

type FakeStorage = StoragePort & { store: Record<string, unknown> };

function makeStorage(initial: Record<string, unknown> = {}): FakeStorage {
	const store: Record<string, unknown> = { ...initial };
	const impl: StoragePort = {
		async get<T>(key: string, validate: (value: unknown) => value is T): Promise<T | null> {
			const v = store[key];
			return v !== undefined && validate(v) ? v : null;
		},
		async set<T>(key: string, value: T): Promise<void> {
			store[key] = value;
		},
		async remove(key: string): Promise<void> {
			delete store[key];
		},
	};
	return {
		store,
		get: vi.fn(impl.get) as StoragePort["get"],
		set: vi.fn(impl.set) as StoragePort["set"],
		remove: vi.fn(impl.remove),
	};
}

describe("pinned-tabs store", () => {
	it("初期状態は空 + activeKey は null", () => {
		const store = createPinnedTabsStore(makeStorage());
		expect(store.pinned).toEqual([]);
		expect(store.activeKey).toBeNull();
	});

	it("load() でストレージから復元する", async () => {
		const storage = makeStorage({
			[PINNED_TABS_STORAGE_KEY]: {
				pinned: [{ type: "epic", number: 1, title: "Epic #1" }],
				activeKey: "epic-1",
			},
		});
		const store = createPinnedTabsStore(storage);
		await store.load();
		expect(store.pinned).toHaveLength(1);
		expect(store.activeKey).toBe("epic-1");
	});

	it("pin() で追加され永続化される", async () => {
		const storage = makeStorage();
		const store = createPinnedTabsStore(storage);
		await store.pin({ type: "epic", number: 5, title: "Epic #5" });
		expect(store.pinned).toHaveLength(1);
		expect(storage.set).toHaveBeenCalledWith(
			PINNED_TABS_STORAGE_KEY,
			expect.objectContaining({ pinned: expect.any(Array) }),
		);
	});

	it("同じ Pin を二重に追加しない", async () => {
		const store = createPinnedTabsStore(makeStorage());
		await store.pin({ type: "epic", number: 5, title: "Epic #5" });
		await store.pin({ type: "epic", number: 5, title: "Epic #5 (renamed)" });
		expect(store.pinned).toHaveLength(1);
	});

	it("unpin() で削除され activeKey も解除される", async () => {
		const store = createPinnedTabsStore(makeStorage());
		await store.pin({ type: "issue", number: 10, title: "Issue #10" });
		await store.activate(tabKey({ type: "issue", number: 10 }));
		expect(store.activeKey).toBe("issue-10");
		await store.unpin("issue-10");
		expect(store.pinned).toHaveLength(0);
		expect(store.activeKey).toBeNull();
	});

	it("activate(null) で [All] に戻せる", async () => {
		const store = createPinnedTabsStore(makeStorage());
		await store.pin({ type: "epic", number: 1, title: "Epic #1" });
		await store.activate("epic-1");
		await store.activate(null);
		expect(store.activeKey).toBeNull();
	});

	it("不正な保存値はバリデーションで弾かれる", async () => {
		const storage = makeStorage({
			[PINNED_TABS_STORAGE_KEY]: { pinned: "not-array", activeKey: 123 },
		});
		const store = createPinnedTabsStore(storage);
		await store.load();
		expect(store.pinned).toEqual([]);
		expect(store.activeKey).toBeNull();
	});
});
