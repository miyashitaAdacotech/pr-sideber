import { describe, expect, it } from "vitest";
import { extractPrBaseUrl } from "../../../shared/utils/github-url";

describe("extractPrBaseUrl", () => {
	it("should return PR TOP URL as-is", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});

	it("should extract TOP URL from files (diff) page", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123/files")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});

	it("should extract TOP URL from commits page", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123/commits")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});

	it("should extract TOP URL from URL with anchor fragment", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123/files#diff-abc123")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});

	it("should extract TOP URL from URL with query parameters", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123?diff=unified")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});

	it("should return null for non-GitHub URL", () => {
		expect(extractPrBaseUrl("https://gitlab.com/owner/repo/merge_requests/1")).toBeNull();
	});

	it("should return null for GitHub URL that is not a PR", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/issues/42")).toBeNull();
	});

	it("should return null for GitHub repository URL", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo")).toBeNull();
	});

	it("should return null for invalid URL", () => {
		expect(extractPrBaseUrl("not-a-url")).toBeNull();
	});

	it("should return null for empty string", () => {
		expect(extractPrBaseUrl("")).toBeNull();
	});

	it("should handle PR number with large numbers", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/99999")).toBe(
			"https://github.com/owner/repo/pull/99999",
		);
	});

	it("should handle repo with hyphens and dots in owner/repo", () => {
		expect(extractPrBaseUrl("https://github.com/my-org/my.repo/pull/1")).toBe(
			"https://github.com/my-org/my.repo/pull/1",
		);
	});

	it("should extract TOP URL from checks sub-page", () => {
		expect(extractPrBaseUrl("https://github.com/owner/repo/pull/123/checks")).toBe(
			"https://github.com/owner/repo/pull/123",
		);
	});
});
