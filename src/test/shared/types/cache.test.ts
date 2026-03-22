import { describe, expect, it } from "vitest";
import { PR_CACHE_KEY, isCachedPrData } from "../../../shared/types/cache";

const validCachedPrData = {
	data: {
		myPrs: { items: [], totalCount: 0 },
		reviewRequests: { items: [], totalCount: 0 },
		hasMore: false,
	},
	lastUpdatedAt: "2026-03-22T00:00:00Z",
};

describe("isCachedPrData", () => {
	it("should accept a valid CachedPrData structure", () => {
		expect(isCachedPrData(validCachedPrData)).toBe(true);
	});

	it("should reject when data is missing", () => {
		const invalid = { lastUpdatedAt: "2026-03-22T00:00:00Z" };
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when lastUpdatedAt is missing", () => {
		const invalid = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: { items: [], totalCount: 0 },
				hasMore: false,
			},
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when lastUpdatedAt is not a string", () => {
		const invalid = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: { items: [], totalCount: 0 },
				hasMore: false,
			},
			lastUpdatedAt: 12345,
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when data is null", () => {
		const invalid = { data: null, lastUpdatedAt: "2026-03-22T00:00:00Z" };
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject null", () => {
		expect(isCachedPrData(null)).toBe(false);
	});

	it("should reject undefined", () => {
		expect(isCachedPrData(undefined)).toBe(false);
	});

	it("should reject non-object values", () => {
		expect(isCachedPrData("string")).toBe(false);
		expect(isCachedPrData(42)).toBe(false);
		expect(isCachedPrData(true)).toBe(false);
	});

	it("should reject when data.myPrs is missing", () => {
		const invalid = {
			data: {
				reviewRequests: { items: [], totalCount: 0 },
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-22T00:00:00Z",
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when data.reviewRequests is missing", () => {
		const invalid = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-22T00:00:00Z",
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when data.myPrs.items is not an array", () => {
		const invalid = {
			data: {
				myPrs: { items: "not-array", totalCount: 0 },
				reviewRequests: { items: [], totalCount: 0 },
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-22T00:00:00Z",
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when data.reviewRequests.items is not an array", () => {
		const invalid = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: { items: "not-array", totalCount: 0 },
				hasMore: false,
			},
			lastUpdatedAt: "2026-03-22T00:00:00Z",
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});

	it("should reject when data.hasMore is missing", () => {
		const invalid = {
			data: {
				myPrs: { items: [], totalCount: 0 },
				reviewRequests: { items: [], totalCount: 0 },
			},
			lastUpdatedAt: "2026-03-22T00:00:00Z",
		};
		expect(isCachedPrData(invalid)).toBe(false);
	});
});

describe("PR_CACHE_KEY", () => {
	it("should equal 'pr_cache'", () => {
		expect(PR_CACHE_KEY).toBe("pr_cache");
	});
});
