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
		expect(shouldRetry).toHaveBeenCalledWith(originalError, 0);
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

	it("should use getDelayOverride value when it returns a number", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("rate limited"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);
		const getDelayOverride = vi.fn().mockReturnValue(5000);

		const result = await withRetry(fn, defaultConfig, shouldRetry, delay, {
			getDelayOverride,
		});

		expect(result).toBe("success");
		expect(delay).toHaveBeenCalledTimes(1);
		// getDelayOverride が 5000 を返したので、exponential backoff (1000) ではなく 5000 が使われる
		expect(delay).toHaveBeenCalledWith(5000);
		expect(getDelayOverride).toHaveBeenCalledWith(expect.any(Error));
	});

	it("should fall back to exponential backoff when getDelayOverride returns undefined", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("server error"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);
		const getDelayOverride = vi.fn().mockReturnValue(undefined);

		const result = await withRetry(fn, defaultConfig, shouldRetry, delay, {
			getDelayOverride,
		});

		expect(result).toBe("success");
		expect(delay).toHaveBeenCalledTimes(1);
		// getDelayOverride が undefined を返したので exponential backoff: 1000 * 2^0 = 1000
		expect(delay).toHaveBeenCalledWith(1000);
	});

	it("should use getDelayOverride value of 0 when it returns 0", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("rate limited"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);
		const getDelayOverride = vi.fn().mockReturnValue(0);

		const result = await withRetry(fn, defaultConfig, shouldRetry, delay, {
			getDelayOverride,
		});

		expect(result).toBe("success");
		expect(delay).toHaveBeenCalledTimes(1);
		// getDelayOverride が 0 を返した場合、delay(0) で即座にリトライ
		expect(delay).toHaveBeenCalledWith(0);
		expect(getDelayOverride).toHaveBeenCalledWith(expect.any(Error));
	});

	it("should not cap getDelayOverride value at maxDelayMs", async () => {
		const config: RetryConfig = {
			maxRetries: 3,
			baseDelayMs: 1000,
			maxDelayMs: 5000,
		};
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("rate limited"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);
		// Retry-After が maxDelayMs (5000) を大きく超える 30000ms を返す
		const getDelayOverride = vi.fn().mockReturnValue(30000);

		const result = await withRetry(fn, config, shouldRetry, delay, {
			getDelayOverride,
		});

		expect(result).toBe("success");
		expect(delay).toHaveBeenCalledTimes(1);
		// レート制限の Retry-After は API 側の指定値を尊重 → maxDelayMs でキャップしない
		expect(delay).toHaveBeenCalledWith(30000);
	});

	it("should pass attempt number to shouldRetry", async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error("fail 1"))
			.mockRejectedValueOnce(new Error("fail 2"))
			.mockResolvedValue("success");
		const shouldRetry = vi.fn().mockReturnValue(true);
		const delay = vi.fn().mockResolvedValue(undefined);

		await withRetry(fn, defaultConfig, shouldRetry, delay);

		// shouldRetry は (error, attempt) で呼ばれる。attempt は 0-indexed
		expect(shouldRetry).toHaveBeenCalledTimes(2);
		expect(shouldRetry).toHaveBeenNthCalledWith(1, expect.any(Error), 0);
		expect(shouldRetry).toHaveBeenNthCalledWith(2, expect.any(Error), 1);
	});
});
