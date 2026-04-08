import { describe, expect, it } from "vitest";
import {
	isCacheUpdatedEvent,
	isClaudeSessionsUpdatedEvent,
	isTabUrlChangedEvent,
} from "../../../shared/types/events";

describe("isCacheUpdatedEvent", () => {
	it("should return true for a valid CacheUpdatedEvent", () => {
		const event = {
			type: "CACHE_UPDATED",
			lastUpdatedAt: "2026-03-22T12:00:00.000Z",
		};
		expect(isCacheUpdatedEvent(event)).toBe(true);
	});

	it("should return false when type is not CACHE_UPDATED", () => {
		const event = {
			type: "SOME_OTHER_EVENT",
			lastUpdatedAt: "2026-03-22T12:00:00.000Z",
		};
		expect(isCacheUpdatedEvent(event)).toBe(false);
	});

	it("should return false when lastUpdatedAt is missing", () => {
		const event = { type: "CACHE_UPDATED" };
		expect(isCacheUpdatedEvent(event)).toBe(false);
	});

	it("should return false when lastUpdatedAt is not a string", () => {
		const event = { type: "CACHE_UPDATED", lastUpdatedAt: 12345 };
		expect(isCacheUpdatedEvent(event)).toBe(false);
	});

	it("should return false for null", () => {
		expect(isCacheUpdatedEvent(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isCacheUpdatedEvent(undefined)).toBe(false);
	});

	it("should return false for non-object values", () => {
		expect(isCacheUpdatedEvent("string")).toBe(false);
		expect(isCacheUpdatedEvent(42)).toBe(false);
		expect(isCacheUpdatedEvent(true)).toBe(false);
	});

	it("should return true when extra properties are present", () => {
		const event = {
			type: "CACHE_UPDATED",
			lastUpdatedAt: "2026-03-22T12:00:00.000Z",
			extraField: "should be ignored",
			anotherExtra: 42,
		};
		expect(isCacheUpdatedEvent(event)).toBe(true);
	});

	it("should return false when lastUpdatedAt is not a valid ISO 8601 date", () => {
		const event = {
			type: "CACHE_UPDATED",
			lastUpdatedAt: "not-a-date",
		};
		expect(isCacheUpdatedEvent(event)).toBe(false);
	});

	it("should return false when lastUpdatedAt is an empty string", () => {
		const event = {
			type: "CACHE_UPDATED",
			lastUpdatedAt: "",
		};
		expect(isCacheUpdatedEvent(event)).toBe(false);
	});
});

describe("isTabUrlChangedEvent", () => {
	it("should return true for a valid TAB_URL_CHANGED event", () => {
		const event = {
			type: "TAB_URL_CHANGED",
			url: "https://github.com/owner/repo/pull/1",
		};
		expect(isTabUrlChangedEvent(event)).toBe(true);
	});

	it("should return false when type is not TAB_URL_CHANGED", () => {
		const event = {
			type: "CACHE_UPDATED",
			url: "https://github.com/owner/repo/pull/1",
		};
		expect(isTabUrlChangedEvent(event)).toBe(false);
	});

	it("should return false when url is missing", () => {
		const event = { type: "TAB_URL_CHANGED" };
		expect(isTabUrlChangedEvent(event)).toBe(false);
	});

	it("should return false when url is not a string", () => {
		const event = { type: "TAB_URL_CHANGED", url: 12345 };
		expect(isTabUrlChangedEvent(event)).toBe(false);
	});

	it("should return false for null", () => {
		expect(isTabUrlChangedEvent(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isTabUrlChangedEvent(undefined)).toBe(false);
	});

	it("should return false for non-object values", () => {
		expect(isTabUrlChangedEvent("string")).toBe(false);
		expect(isTabUrlChangedEvent(42)).toBe(false);
		expect(isTabUrlChangedEvent(true)).toBe(false);
	});

	it("should return false when url is an empty string", () => {
		const event = { type: "TAB_URL_CHANGED", url: "" };
		expect(isTabUrlChangedEvent(event)).toBe(false);
	});
});

describe("isClaudeSessionsUpdatedEvent", () => {
	it("should return true for a valid CLAUDE_SESSIONS_UPDATED event", () => {
		expect(isClaudeSessionsUpdatedEvent({ type: "CLAUDE_SESSIONS_UPDATED" })).toBe(true);
	});

	it("should return false when type is different", () => {
		expect(isClaudeSessionsUpdatedEvent({ type: "CACHE_UPDATED" })).toBe(false);
	});

	it("should return false for null/undefined/non-object", () => {
		expect(isClaudeSessionsUpdatedEvent(null)).toBe(false);
		expect(isClaudeSessionsUpdatedEvent(undefined)).toBe(false);
		expect(isClaudeSessionsUpdatedEvent("string")).toBe(false);
		expect(isClaudeSessionsUpdatedEvent(42)).toBe(false);
	});

	it("should return true even with extra properties", () => {
		expect(isClaudeSessionsUpdatedEvent({ type: "CLAUDE_SESSIONS_UPDATED", extra: 1 })).toBe(true);
	});
});
