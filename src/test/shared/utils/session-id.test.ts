import { describe, expect, it } from "vitest";
import {
	SESSION_ID_PATTERN,
	extractSessionIdFromUrl,
	isValidSessionId,
} from "../../../shared/utils/session-id";

describe("SESSION_ID_PATTERN", () => {
	it("session_ + 英数字のみのIDにマッチする", () => {
		expect(SESSION_ID_PATTERN.test("session_01T7hN9fW6KuKZxn52isYdyR")).toBe(true);
	});

	it("session_ + ハイフン入りのIDにマッチする", () => {
		expect(SESSION_ID_PATTERN.test("session_09baa7d1-8aaf-4a38-8a2d-e56c3256a0c0")).toBe(true);
	});

	it("session_ + アンダースコア入りのIDにマッチする", () => {
		expect(SESSION_ID_PATTERN.test("session_foo_bar_baz")).toBe(true);
	});

	it("prefix が異なるIDにはマッチしない", () => {
		expect(SESSION_ID_PATTERN.test("draft_09baa7d1")).toBe(false);
		expect(SESSION_ID_PATTERN.test("session-01T7hN9fW6")).toBe(false);
		expect(SESSION_ID_PATTERN.test("Session_abc123")).toBe(false);
	});

	it("prefix なしの文字列にはマッチしない", () => {
		expect(SESSION_ID_PATTERN.test("abc123")).toBe(false);
	});

	it("空文字列にはマッチしない", () => {
		expect(SESSION_ID_PATTERN.test("")).toBe(false);
	});

	it("session_ だけ (suffix 空) にはマッチしない", () => {
		expect(SESSION_ID_PATTERN.test("session_")).toBe(false);
	});

	it("特殊文字を含むIDにはマッチしない", () => {
		expect(SESSION_ID_PATTERN.test("session_abc/../etc")).toBe(false);
		expect(SESSION_ID_PATTERN.test("session_abc?query=1")).toBe(false);
		expect(SESSION_ID_PATTERN.test("session_abc#frag")).toBe(false);
		expect(SESSION_ID_PATTERN.test("session_abc def")).toBe(false);
		expect(SESSION_ID_PATTERN.test("session_abc\n")).toBe(false);
	});

	it("suffix が 128 文字を超える場合はマッチしない", () => {
		const suffix129 = "a".repeat(129);
		expect(SESSION_ID_PATTERN.test(`session_${suffix129}`)).toBe(false);
	});

	it("suffix が 128 文字ちょうどはマッチする (境界値)", () => {
		const suffix128 = "a".repeat(128);
		expect(SESSION_ID_PATTERN.test(`session_${suffix128}`)).toBe(true);
	});
});

describe("isValidSessionId", () => {
	it("有効な sessionId に対して true を返す", () => {
		expect(isValidSessionId("session_01T7hN9fW6KuKZxn52isYdyR")).toBe(true);
		expect(isValidSessionId("session_abc-def_123")).toBe(true);
	});

	it("無効な文字列に対して false を返す", () => {
		expect(isValidSessionId("draft_09baa7d1")).toBe(false);
		expect(isValidSessionId("")).toBe(false);
		expect(isValidSessionId("not-a-session")).toBe(false);
	});

	it("文字列以外の値に対して false を返す (型ガード)", () => {
		expect(isValidSessionId(null)).toBe(false);
		expect(isValidSessionId(undefined)).toBe(false);
		expect(isValidSessionId(123)).toBe(false);
		expect(isValidSessionId({})).toBe(false);
		expect(isValidSessionId([])).toBe(false);
		expect(isValidSessionId(true)).toBe(false);
	});

	it("129 文字以上の suffix に対して false を返す", () => {
		const suffix129 = "a".repeat(129);
		expect(isValidSessionId(`session_${suffix129}`)).toBe(false);
	});
});

describe("extractSessionIdFromUrl", () => {
	it("claude.ai/code のセッション URL から sessionId を抽出する", () => {
		expect(extractSessionIdFromUrl("https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR")).toBe(
			"session_01T7hN9fW6KuKZxn52isYdyR",
		);
	});

	it("ハイフン・アンダースコア入りの sessionId も抽出する", () => {
		expect(
			extractSessionIdFromUrl(
				"https://claude.ai/code/session_09baa7d1-8aaf-4a38-8a2d-e56c3256a0c0",
			),
		).toBe("session_09baa7d1-8aaf-4a38-8a2d-e56c3256a0c0");
	});

	it("末尾スラッシュ付き URL からも抽出する", () => {
		expect(extractSessionIdFromUrl("https://claude.ai/code/session_abc123/")).toBe(
			"session_abc123",
		);
	});

	it("クエリ・フラグメントが付いていても末尾セグメントのみ評価する", () => {
		expect(extractSessionIdFromUrl("https://claude.ai/code/session_abc123?foo=bar")).toBe(
			"session_abc123",
		);
		expect(extractSessionIdFromUrl("https://claude.ai/code/session_abc123#frag")).toBe(
			"session_abc123",
		);
	});

	it("末尾セグメントが SESSION_ID_PATTERN に合致しない場合は null を返す", () => {
		expect(extractSessionIdFromUrl("https://claude.ai/code/")).toBeNull();
		expect(extractSessionIdFromUrl("https://claude.ai/code/new")).toBeNull();
		expect(extractSessionIdFromUrl("https://claude.ai/code/draft_abc")).toBeNull();
	});

	it("無効な URL 文字列に対しては null を返す", () => {
		expect(extractSessionIdFromUrl("not-a-url")).toBeNull();
		expect(extractSessionIdFromUrl("")).toBeNull();
	});

	it("https://claude.ai 以外のオリジンは拒否する (scheme/host 検証)", () => {
		// javascript:/data: 等のスキーム混入や、フィッシングドメインが mapping lookup に侵入するのを防ぐ。
		expect(extractSessionIdFromUrl("http://claude.ai/code/session_abc")).toBeNull();
		expect(extractSessionIdFromUrl("https://evil.example.com/code/session_abc")).toBeNull();
		expect(extractSessionIdFromUrl("javascript:session_abc")).toBeNull();
		expect(extractSessionIdFromUrl("data:text/plain,session_abc")).toBeNull();
	});
});
