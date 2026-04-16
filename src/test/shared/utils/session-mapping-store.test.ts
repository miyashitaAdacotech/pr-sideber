import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	deleteMapping,
	getAllMappings,
	getMapping,
	setMapping,
} from "../../../shared/utils/session-mapping-store";
import { resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

const STORAGE_KEY = "sessionIssueMapping";
const VALID_SESSION_A = "session_01T7hN9fW6KuKZxn52isYdyR";
const VALID_SESSION_B = "session_abc123def456";
const VALID_SESSION_C = "session_xyz789";
const INVALID_SESSION = "draft_09baa7d1";

/**
 * 内部ストレージを 1 つのオブジェクトで保持し、get/set/remove mock が
 * 実ストレージのように振る舞うようにする。
 * これによって race condition テスト(複数 setMapping 並行実行後に全エントリ残存)が
 * 実質的に意味のある検証になる。
 */
function installInMemoryStorage(): { getState: () => Record<string, unknown> } {
	const mock = setupChromeMock();
	const state: Record<string, unknown> = {};

	mock.storage.local.get.mockImplementation(async (key: string | string[] | null) => {
		if (key === null || key === undefined) return { ...state };
		const keys = Array.isArray(key) ? key : [key];
		const result: Record<string, unknown> = {};
		for (const k of keys) {
			if (k in state) result[k] = state[k];
		}
		return result;
	});

	mock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
		for (const [k, v] of Object.entries(items)) {
			state[k] = v;
		}
	});

	mock.storage.local.remove.mockImplementation(async (key: string | string[]) => {
		const keys = Array.isArray(key) ? key : [key];
		for (const k of keys) {
			delete state[k];
		}
	});

	return { getState: () => state };
}

describe("session-mapping-store", () => {
	let storage: { getState: () => Record<string, unknown> };

	beforeEach(() => {
		storage = installInMemoryStorage();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("getMapping", () => {
		it("登録済 sessionId に対して issueNumber を返す", async () => {
			storage.getState()[STORAGE_KEY] = { [VALID_SESSION_A]: 45 };
			await expect(getMapping(VALID_SESSION_A)).resolves.toBe(45);
		});

		it("未登録 sessionId に対して undefined を返す", async () => {
			storage.getState()[STORAGE_KEY] = { [VALID_SESSION_A]: 45 };
			await expect(getMapping(VALID_SESSION_B)).resolves.toBeUndefined();
		});

		it("ストレージが空 ({}) のときに undefined を返す", async () => {
			await expect(getMapping(VALID_SESSION_A)).resolves.toBeUndefined();
		});

		it("無効な sessionId に対して reject する", async () => {
			await expect(getMapping(INVALID_SESSION)).rejects.toThrow(/Invalid sessionId/);
		});
	});

	describe("setMapping", () => {
		it("新規 sessionId をストレージに保存する", async () => {
			await setMapping(VALID_SESSION_A, 45);
			expect(storage.getState()[STORAGE_KEY]).toEqual({ [VALID_SESSION_A]: 45 });
		});

		it("既存 sessionId を上書きする", async () => {
			await setMapping(VALID_SESSION_A, 45);
			await setMapping(VALID_SESSION_A, 99);
			expect(storage.getState()[STORAGE_KEY]).toEqual({ [VALID_SESSION_A]: 99 });
		});

		it("他の sessionId エントリに影響しない (不変性)", async () => {
			await setMapping(VALID_SESSION_A, 1);
			await setMapping(VALID_SESSION_B, 2);
			expect(storage.getState()[STORAGE_KEY]).toEqual({
				[VALID_SESSION_A]: 1,
				[VALID_SESSION_B]: 2,
			});
		});

		it("無効な sessionId に対して reject する", async () => {
			await expect(setMapping(INVALID_SESSION, 45)).rejects.toThrow(/Invalid sessionId/);
		});

		it("無効な issueNumber (負数) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, -1)).rejects.toThrow(/Invalid issueNumber/);
		});

		it("無効な issueNumber (0) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, 0)).rejects.toThrow(/Invalid issueNumber/);
		});

		it("無効な issueNumber (非整数) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, 1.5)).rejects.toThrow(/Invalid issueNumber/);
		});

		it("無効な issueNumber (NaN) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, Number.NaN)).rejects.toThrow(/Invalid issueNumber/);
		});

		it("無効な issueNumber (Infinity) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, Number.POSITIVE_INFINITY)).rejects.toThrow(
				/Invalid issueNumber/,
			);
		});

		it("無効な issueNumber (-Infinity) に対して reject する", async () => {
			await expect(setMapping(VALID_SESSION_A, Number.NEGATIVE_INFINITY)).rejects.toThrow(
				/Invalid issueNumber/,
			);
		});

		it("最小有効値 issueNumber=1 を受け付ける (境界値)", async () => {
			await expect(setMapping(VALID_SESSION_A, 1)).resolves.toBeUndefined();
			expect(storage.getState()[STORAGE_KEY]).toEqual({ [VALID_SESSION_A]: 1 });
		});

		it("大きな正の整数を受け付ける", async () => {
			await expect(setMapping(VALID_SESSION_A, 999999)).resolves.toBeUndefined();
			expect(storage.getState()[STORAGE_KEY]).toEqual({ [VALID_SESSION_A]: 999999 });
		});
	});

	describe("deleteMapping", () => {
		it("既存 sessionId をストレージから削除する", async () => {
			await setMapping(VALID_SESSION_A, 45);
			await deleteMapping(VALID_SESSION_A);
			const current = (storage.getState()[STORAGE_KEY] as Record<string, number>) ?? {};
			expect(current[VALID_SESSION_A]).toBeUndefined();
		});

		it("未登録 sessionId でも throw しない (冪等性)", async () => {
			await expect(deleteMapping(VALID_SESSION_A)).resolves.toBeUndefined();
		});

		it("他の sessionId エントリに影響しない", async () => {
			await setMapping(VALID_SESSION_A, 1);
			await setMapping(VALID_SESSION_B, 2);
			await deleteMapping(VALID_SESSION_A);
			expect(storage.getState()[STORAGE_KEY]).toEqual({ [VALID_SESSION_B]: 2 });
		});

		it("無効な sessionId に対して reject する", async () => {
			await expect(deleteMapping(INVALID_SESSION)).rejects.toThrow(/Invalid sessionId/);
		});
	});

	describe("getAllMappings", () => {
		it("全エントリを返す", async () => {
			await setMapping(VALID_SESSION_A, 1);
			await setMapping(VALID_SESSION_B, 2);
			await expect(getAllMappings()).resolves.toEqual({
				[VALID_SESSION_A]: 1,
				[VALID_SESSION_B]: 2,
			});
		});

		it("空ストレージでは {} を返す", async () => {
			await expect(getAllMappings()).resolves.toEqual({});
		});
	});

	describe("race condition", () => {
		/**
		 * 複数の setMapping を並行発火して、すべての書き込みが反映されることを検証する。
		 * シリアライズしないと read-modify-write が互いを上書きして一部のエントリが失われる。
		 */
		it("3 つの setMapping を並行発火しても全エントリが残る", async () => {
			await Promise.all([
				setMapping(VALID_SESSION_A, 1),
				setMapping(VALID_SESSION_B, 2),
				setMapping(VALID_SESSION_C, 3),
			]);

			expect(storage.getState()[STORAGE_KEY]).toEqual({
				[VALID_SESSION_A]: 1,
				[VALID_SESSION_B]: 2,
				[VALID_SESSION_C]: 3,
			});
		});

		it("set と delete の並行発火でも整合性が保たれる", async () => {
			await setMapping(VALID_SESSION_A, 1);

			await Promise.all([
				setMapping(VALID_SESSION_B, 2),
				deleteMapping(VALID_SESSION_A),
				setMapping(VALID_SESSION_C, 3),
			]);

			const current = (storage.getState()[STORAGE_KEY] as Record<string, number>) ?? {};
			expect(current[VALID_SESSION_A]).toBeUndefined();
			expect(current[VALID_SESSION_B]).toBe(2);
			expect(current[VALID_SESSION_C]).toBe(3);
		});

		it("同一 sessionId への連続 setMapping では最後の値が残る", async () => {
			await Promise.all([
				setMapping(VALID_SESSION_A, 1),
				setMapping(VALID_SESSION_A, 2),
				setMapping(VALID_SESSION_A, 3),
			]);

			const current = storage.getState()[STORAGE_KEY] as Record<string, number>;
			expect(current[VALID_SESSION_A]).toBe(3);
		});
	});
});
