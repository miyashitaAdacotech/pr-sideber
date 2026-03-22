export type RateLimitInfo = {
	readonly remaining: number;
	readonly reset: Date;
	readonly limit: number;
};

export function extractRateLimitInfo(headers: Headers): RateLimitInfo | null {
	const remainingStr = headers.get("X-RateLimit-Remaining");
	const resetStr = headers.get("X-RateLimit-Reset");
	const limitStr = headers.get("X-RateLimit-Limit");

	if (!remainingStr || !resetStr || !limitStr) {
		return null;
	}

	const remaining = Number(remainingStr);
	const reset = Number(resetStr);
	const limit = Number(limitStr);

	if (!Number.isFinite(remaining) || !Number.isFinite(reset) || !Number.isFinite(limit)) {
		return null;
	}

	return {
		remaining,
		reset: new Date(reset * 1000),
		limit,
	};
}
