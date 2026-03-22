import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../../../shared/utils/time";

describe("formatRelativeTime", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	function setNow(date: Date): void {
		vi.useFakeTimers();
		vi.setSystemTime(date);
	}

	const BASE = new Date("2026-03-22T12:00:00Z");

	it("returns 'just now' for 30 seconds ago", () => {
		setNow(BASE);
		const thirtySecsAgo = new Date(BASE.getTime() - 30_000).toISOString();
		expect(formatRelativeTime(thirtySecsAgo)).toBe("just now");
	});

	it("returns '5m ago' for 5 minutes ago", () => {
		setNow(BASE);
		const fiveMinAgo = new Date(BASE.getTime() - 5 * 60_000).toISOString();
		expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
	});

	it("returns '3h ago' for 3 hours ago", () => {
		setNow(BASE);
		const threeHrsAgo = new Date(BASE.getTime() - 3 * 60 * 60_000).toISOString();
		expect(formatRelativeTime(threeHrsAgo)).toBe("3h ago");
	});

	it("returns '2d ago' for 2 days ago", () => {
		setNow(BASE);
		const twoDaysAgo = new Date(BASE.getTime() - 2 * 24 * 60 * 60_000).toISOString();
		expect(formatRelativeTime(twoDaysAgo)).toBe("2d ago");
	});

	it("returns '59m ago' at the 59-minute boundary", () => {
		setNow(BASE);
		const fiftyNineMin = new Date(BASE.getTime() - 59 * 60_000).toISOString();
		expect(formatRelativeTime(fiftyNineMin)).toBe("59m ago");
	});

	it("returns '23h ago' at the 23-hour boundary", () => {
		setNow(BASE);
		const twentyThreeHrs = new Date(BASE.getTime() - 23 * 60 * 60_000).toISOString();
		expect(formatRelativeTime(twentyThreeHrs)).toBe("23h ago");
	});

	it("returns '—' for an invalid date string", () => {
		expect(formatRelativeTime("not-a-date")).toBe("—");
	});

	it("returns '—' for an empty string", () => {
		expect(formatRelativeTime("")).toBe("—");
	});

	it("returns 'just now' for a future date", () => {
		setNow(BASE);
		const future = new Date(BASE.getTime() + 60_000).toISOString();
		expect(formatRelativeTime(future)).toBe("just now");
	});
});
