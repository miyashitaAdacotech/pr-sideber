import { describe, expect, it } from "vitest";
import { safeUrl } from "../../../shared/utils/url";

describe("safeUrl", () => {
	it("returns https:// URL as-is", () => {
		expect(safeUrl("https://github.com/foo/bar/pull/1")).toBe("https://github.com/foo/bar/pull/1");
	});

	it("blocks http:// URL", () => {
		expect(safeUrl("http://example.com")).toBe("#");
	});

	it("blocks javascript: URL", () => {
		expect(safeUrl("javascript:alert(1)")).toBe("#");
	});

	it("blocks empty string", () => {
		expect(safeUrl("")).toBe("#");
	});

	it("blocks data: URL", () => {
		expect(safeUrl("data:text/html,<h1>hi</h1>")).toBe("#");
	});
});
