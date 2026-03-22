export type RetryConfig = {
	/** 初回試行を除いたリトライ回数。maxRetries: 3 の場合、fn は最大 4 回実行される */
	readonly maxRetries: number;
	readonly baseDelayMs: number;
	readonly maxDelayMs: number;
};

export type DelayFn = (ms: number) => Promise<void>;

const defaultDelay: DelayFn = (ms: number) =>
	new Promise((resolve) => {
		const jitter = ms * Math.random() * 0.5;
		setTimeout(resolve, ms + jitter);
	});

export async function withRetry<T>(
	fn: () => Promise<T>,
	config: RetryConfig,
	shouldRetry: (error: unknown) => boolean,
	delay: DelayFn = defaultDelay,
): Promise<T> {
	let attempt = 0;

	for (;;) {
		try {
			return await fn();
		} catch (error: unknown) {
			if (!shouldRetry(error) || attempt >= config.maxRetries) {
				throw error;
			}

			const delayMs = Math.min(config.baseDelayMs * 2 ** attempt, config.maxDelayMs);
			await delay(delayMs);
			attempt++;
		}
	}
}
