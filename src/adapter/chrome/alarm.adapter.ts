import type { AlarmPort } from "../../domain/ports/alarm.port";

export class ChromeAlarmAdapter implements AlarmPort {
	async create(name: string, periodInMinutes: number): Promise<void> {
		await chrome.alarms.create(name, { periodInMinutes });
	}

	clear(name: string): Promise<boolean> {
		return chrome.alarms.clear(name);
	}

	onAlarm(callback: (name: string) => void): () => void {
		const listener = (alarm: chrome.alarms.Alarm) => {
			callback(alarm.name);
		};
		chrome.alarms.onAlarm.addListener(listener);
		return () => {
			chrome.alarms.onAlarm.removeListener(listener);
		};
	}
}
