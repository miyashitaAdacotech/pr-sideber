import { describe, expect, it } from "vitest";
import { extractRateLimitInfo } from "../../../adapter/github/rate-limit";

describe("extractRateLimitInfo", () => {
	it("should return RateLimitInfo when all headers are present", () => {
		const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
		const headers = new Headers({
			"X-RateLimit-Remaining": "4500",
			"X-RateLimit-Reset": String(resetTimestamp),
			"X-RateLimit-Limit": "5000",
		});

		const result = extractRateLimitInfo(headers);

		expect(result).not.toBeNull();
		expect(result?.remaining).toBe(4500);
		expect(result?.reset).toEqual(new Date(resetTimestamp * 1000));
		expect(result?.limit).toBe(5000);
	});

	it("should return null when X-RateLimit-Remaining is missing", () => {
		const headers = new Headers({
			"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
			"X-RateLimit-Limit": "5000",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when X-RateLimit-Reset is missing", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "4500",
			"X-RateLimit-Limit": "5000",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when X-RateLimit-Limit is missing", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "4500",
			"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when header value is not a valid number", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "abc",
			"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
			"X-RateLimit-Limit": "5000",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when no headers are present", () => {
		const headers = new Headers();

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when X-RateLimit-Reset is non-numeric", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "4500",
			"X-RateLimit-Reset": "abc",
			"X-RateLimit-Limit": "5000",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should return null when X-RateLimit-Limit is non-numeric", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "4500",
			"X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 3600),
			"X-RateLimit-Limit": "abc",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should parse X-RateLimit-Remaining of '0' as zero", () => {
		const resetTimestamp = Math.floor(Date.now() / 1000) + 3600;
		const headers = new Headers({
			"X-RateLimit-Remaining": "0",
			"X-RateLimit-Reset": String(resetTimestamp),
			"X-RateLimit-Limit": "5000",
		});

		const result = extractRateLimitInfo(headers);

		expect(result).not.toBeNull();
		expect(result?.remaining).toBe(0);
	});

	it("should return null when header values are empty strings", () => {
		const headers = new Headers({
			"X-RateLimit-Remaining": "",
			"X-RateLimit-Reset": "",
			"X-RateLimit-Limit": "",
		});

		expect(extractRateLimitInfo(headers)).toBeNull();
	});

	it("should convert X-RateLimit-Reset UNIX timestamp (seconds) to Date correctly", () => {
		const resetTimestamp = 1700000000;
		const headers = new Headers({
			"X-RateLimit-Remaining": "100",
			"X-RateLimit-Reset": String(resetTimestamp),
			"X-RateLimit-Limit": "5000",
		});

		const result = extractRateLimitInfo(headers);

		expect(result).not.toBeNull();
		expect(result?.reset).toEqual(new Date(resetTimestamp * 1000));
		expect(result?.reset.getTime()).toBe(1700000000000);
	});
});
