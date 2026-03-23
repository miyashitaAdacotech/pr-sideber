import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribe } from "../../../shared/stores/relative-time-tick.svelte";

describe("relative-time-tick shared timer", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should start timer on first subscribe and return a numeric tick", () => {
		const sub = subscribe();
		expect(typeof sub.tick).toBe("number");
		sub.unsubscribe();
	});

	it("should increment tick after 30 seconds", () => {
		const sub = subscribe();
		const initialTick = sub.tick;

		vi.advanceTimersByTime(30_000);
		expect(sub.tick).toBe(initialTick + 1);

		vi.advanceTimersByTime(30_000);
		expect(sub.tick).toBe(initialTick + 2);

		sub.unsubscribe();
	});

	it("should stop timer when all subscribers unsubscribe", () => {
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		const sub1 = subscribe();
		const sub2 = subscribe();

		// 1人目が解除しても、まだ2人目がいるので止まらない
		sub1.unsubscribe();
		expect(clearIntervalSpy).not.toHaveBeenCalled();

		// 2人目が解除 → subscriber 0 → タイマー停止
		sub2.unsubscribe();
		expect(clearIntervalSpy).toHaveBeenCalled();

		clearIntervalSpy.mockRestore();
	});

	it("should share the same tick across multiple subscribers", () => {
		const sub1 = subscribe();
		const sub2 = subscribe();

		vi.advanceTimersByTime(30_000);
		expect(sub1.tick).toBe(sub2.tick);

		sub1.unsubscribe();
		sub2.unsubscribe();
	});

	it("should restart timer after all unsubscribe and new subscribe", () => {
		const sub1 = subscribe();
		const initialTick = sub1.tick;
		vi.advanceTimersByTime(30_000);
		expect(sub1.tick).toBe(initialTick + 1);
		sub1.unsubscribe();

		// 再 subscribe → tick はリセットされないがタイマーは再開される
		const sub2 = subscribe();
		const tickAfterResubscribe = sub2.tick;
		vi.advanceTimersByTime(30_000);
		// tick は前回の続きからインクリメントされる
		expect(sub2.tick).toBe(tickAfterResubscribe + 1);

		sub2.unsubscribe();
	});
});
