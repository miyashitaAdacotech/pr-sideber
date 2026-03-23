import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RelativeTime from "../../../sidepanel/components/RelativeTime.svelte";

describe("RelativeTime", () => {
	let component: ReturnType<typeof mount> | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		// 2026-03-23T12:00:00Z を現在時刻として固定
		vi.setSystemTime(new Date("2026-03-23T12:00:00Z"));
	});

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		component = undefined;
		document.body.innerHTML = "";
		vi.useRealTimers();
	});

	it("should render formatRelativeTime result on initial mount", () => {
		// 5分前の日付を渡す → "5m ago" と表示されるはず
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:55:00Z" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("5m ago");
	});

	it("should render 'just now' for a date 10 seconds ago", () => {
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:59:50Z" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("just now");
	});

	it("should render 'just now' for a future date (5 minutes ahead)", () => {
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T12:05:00Z" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("just now");
	});

	it("should render 'Xd ago' for a date 3 days ago", () => {
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-20T12:00:00Z" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("3d ago");
	});

	it("should update display after 30 seconds elapse", () => {
		// 59分30秒前 → 初回は "59m ago"、30秒後に60分経過で "1h ago" になるはず
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:00:30Z" },
		});
		const span = document.querySelector("span");
		expect(span?.textContent).toBe("59m ago");

		// 30秒進める → 60分経過 → "1h ago"
		vi.advanceTimersByTime(30_000);
		flushSync();
		expect(span?.textContent).toBe("1h ago");
	});

	it("should not update DOM before 30 seconds but should update at 30 seconds", () => {
		// 59秒前 → "just now" のはず。29秒後(=88秒前)もまだ "1m ago" にならない
		// → 30秒後(=89秒前)で "1m ago" に変化
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:59:01Z" },
		});
		const span = document.querySelector("span");
		expect(span?.textContent).toBe("just now");

		// 29秒では interval がまだ発火していないので変化なし
		vi.advanceTimersByTime(29_000);
		flushSync();
		expect(span?.textContent).toBe("just now");

		// さらに1秒(計30秒)で interval 発火 → 89秒経過 = "1m ago"
		vi.advanceTimersByTime(1_000);
		flushSync();
		expect(span?.textContent).toBe("1m ago");
	});

	it("should progress through multiple interval cycles: just now → 1m → 1m → 2m", () => {
		// 20秒前 → "just now"
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:59:40Z" },
		});
		const span = document.querySelector("span");
		expect(span?.textContent).toBe("just now");

		// 30秒後 → 50秒経過 → "just now" のまま (まだ1分未満)
		vi.advanceTimersByTime(30_000);
		flushSync();
		expect(span?.textContent).toBe("just now");

		// さらに30秒後 → 80秒経過 → "1m ago"
		vi.advanceTimersByTime(30_000);
		flushSync();
		expect(span?.textContent).toBe("1m ago");

		// さらに30秒後 → 110秒経過 → まだ2分未満なので "1m ago"
		vi.advanceTimersByTime(30_000);
		flushSync();
		expect(span?.textContent).toBe("1m ago");

		// さらに30秒後 → 140秒経過 → 2分超えたので "2m ago"
		vi.advanceTimersByTime(30_000);
		flushSync();
		expect(span?.textContent).toBe("2m ago");
	});

	it("should render correct value for different dateStr props", () => {
		// 最初は5分前
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:55:00Z" },
		});
		const span = document.querySelector("span");
		expect(span?.textContent).toBe("5m ago");

		// アンマウントして新しい props で再マウント
		unmount(component);
		document.body.innerHTML = "";

		// 2時間前の日付で再マウント
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T10:00:00Z" },
		});
		const newSpan = document.querySelector("span");
		expect(newSpan?.textContent).toBe("2h ago");
	});

	it("should stop shared timer when last subscriber unmounts", () => {
		const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "2026-03-23T11:55:00Z" },
		});

		unmount(component);
		component = undefined;

		expect(clearIntervalSpy).toHaveBeenCalled();
		clearIntervalSpy.mockRestore();
	});

	it("should safely render a dash for invalid date strings", () => {
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "not-a-date" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("\u2014");
	});

	it("should safely render a dash for empty string", () => {
		component = mount(RelativeTime, {
			target: document.body,
			props: { dateStr: "" },
		});
		const span = document.querySelector("span");
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe("\u2014");
	});
});
