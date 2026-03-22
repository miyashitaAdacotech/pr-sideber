export type RetryConfig = {
	/** 初回試行を除いたリトライ回数。maxRetries: 3 の場合、fn は最大 4 回実行される */
	readonly maxRetries: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
};

export type DelayFn = (ms: number) => Promise<void>;

export const defaultDelay: DelayFn = (ms: number) =>
	new Promise((resolve) => {
		const jitter = ms * Math.random() * 0.5;
		setTimeout(resolve, ms + jitter);
	});

export type WithRetryOptions = {
	readonly getDelayOverride?: (error: unknown) => number | undefined;
};

export async function withRetry<T>(
	fn: () => Promise<T>,
	config: RetryConfig,
	shouldRetry: (error: unknown, attempt: number) => boolean,
	delay: DelayFn = defaultDelay,
	options?: WithRetryOptions,
): Promise<T> {
	let attempt = 0;

	for (;;) {
		try {
			return await fn();
		} catch (error: unknown) {
			if (!shouldRetry(error, attempt) || attempt >= config.maxRetries) {
				throw error;
			}

			const overrideMs = options?.getDelayOverride?.(error);
			const delayMs =
				overrideMs !== undefined
					? Math.max(0, overrideMs)
					: Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
			await delay(delayMs);
			attempt++;
		}
	}
}
