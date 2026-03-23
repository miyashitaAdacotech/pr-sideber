let tick = $state(0);
let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | undefined;

function startTimer(): void {
	if (intervalId === undefined) {
		intervalId = setInterval(() => {
			tick += 1;
		}, 30_000);
	}
}

function stopTimer(): void {
	if (intervalId !== undefined) {
		clearInterval(intervalId);
		intervalId = undefined;
	}
}

export function subscribe(): { get tick(): number; unsubscribe: () => void } {
	subscriberCount += 1;
	startTimer();
	return {
		get tick() {
			return tick;
		},
		unsubscribe() {
			subscriberCount -= 1;
			if (subscriberCount === 0) {
				stopTimer();
			}
		},
	};
}
