import { describe, expect, it, vi } from "vitest";
import { withRetry } from "../../../adapter/github/retry";
import type { RetryConfig } from "../../../adapter/github/retry";

describe("withRetry", () => {
	const defaultConfig: RetryConfig = {
		maxRetries: 3,
		baseDelayMs: 1000,
		maxDelayMs: 10000,
	};

	it("should return result without retry when first attempt succeeds", async () => {
		const fn = vi.fn().mockResolvedValue("success");
		const shouldRetry = vi.fn();
		const delay = vi.fn().mockResolvedValue(undefined);

		const result = await withRetry(fn, defaultConfig, shouldRetry, delay);

		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(shouldRetry).not.toHaveBeenCalled();
		expect(delay).not.toHaveBeenCalled();
	});

	it("should retry once and return result when second attempt succeeds", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("temporary failure"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		const result = await withRetry(fn, defaultConfig, shouldRetry, delay);

		expect(result).toBe("success");
		expect(fn).toHaveBeenCalledTimes(2);
		expect(delay).toHaveBeenCalledTimes(1);
	});

	it("should throw last error after all retries exhausted", async () => {
		const lastError = new Error("final failure");
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("failure 1"))
			.mockRejectedValueOnce(new Error("failure 2"))
			.mockRejectedValueOnce(new Error("failure 3"))
			.mockRejectedValueOnce(lastError);
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		const error = await withRetry(fn, defaultConfig, shouldRetry, delay).catch((e: unknown) => e);

		expect(error).toBe(lastError);
		expect(fn).toHaveBeenCalledTimes(4);
		expect(delay).toHaveBeenCalledTimes(3);
	});

	it("should throw immediately without retry when shouldRetry returns false", async () => {
		const originalError = new Error("non-retryable");
		const fn = vi.fn().mockRejectedValue(originalError);
		const shouldRetry = vi.fn().mockReturnValue(false);
		const delay = vi.fn().mockResolvedValue(undefined);

		const error = await withRetry(fn, defaultConfig, shouldRetry, delay).catch((e: unknown) => e);

		expect(error).toBe(originalError);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(shouldRetry).toHaveBeenCalledWith(originalError);
		expect(delay).not.toHaveBeenCalled();
	});

	it("should apply exponential backoff delays", async () => {
		const config: RetryConfig = {
			maxRetries: 3,
			baseDelayMs: 1000,
			maxDelayMs: 100000,
		};
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockRejectedValueOnce(new Error("fail 3"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		await withRetry(fn, config, shouldRetry, delay);

		// exponential backoff: min(baseDelayMs * 2^attempt, maxDelayMs)
		// attempt 0: min(1000 * 2^0, 100000) = 1000
		// attempt 1: min(1000 * 2^1, 100000) = 2000
		// attempt 2: min(1000 * 2^2, 100000) = 4000
		expect(delay).toHaveBeenCalledTimes(3);
		expect(delay).toHaveBeenNthCalledWith(1, 1000);
		expect(delay).toHaveBeenNthCalledWith(2, 2000);
		expect(delay).toHaveBeenNthCalledWith(3, 4000);
	});

	it("should cap delay at maxDelayMs", async () => {
		const config: RetryConfig = {
			maxRetries: 3,
			baseDelayMs: 1000,
			maxDelayMs: 1500,
		};
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockRejectedValueOnce(new Error("fail 3"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		await withRetry(fn, config, shouldRetry, delay);

		expect(delay).toHaveBeenCalledTimes(3);
		expect(delay).toHaveBeenNthCalledWith(1, 1000);
		expect(delay).toHaveBeenNthCalledWith(2, 1500);
		expect(delay).toHaveBeenNthCalledWith(3, 1500);
	});

	it("should not retry when maxRetries is 0", async () => {
		const config: RetryConfig = {
			maxRetries: 0,
			baseDelayMs: 1000,
			maxDelayMs: 10000,
		};
		const fn = vi.fn().mockResolvedValue("immediate");
		const shouldRetry = vi.fn();
		const delay = vi.fn().mockResolvedValue(undefined);

		const result = await withRetry(fn, config, shouldRetry, delay);

		expect(result).toBe("immediate");
		expect(fn).toHaveBeenCalledTimes(1);
		expect(delay).not.toHaveBeenCalled();
	});

	it("should throw on first failure when maxRetries is 0", async () => {
		const config: RetryConfig = {
			maxRetries: 0,
			baseDelayMs: 1000,
			maxDelayMs: 10000,
		};
		const originalError = new Error("single failure");
		const fn = vi.fn().mockRejectedValue(originalError);
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		const error = await withRetry(fn, config, shouldRetry, delay).catch((e: unknown) => e);

		expect(error).toBe(originalError);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(delay).not.toHaveBeenCalled();
	});
});
