export interface AlarmPort {
	create(name: string, periodInMinutes: number): Promise<void>;
	clear(name: string): Promise<boolean>;
	onAlarm(callback: (name: string) => void): () => void;
}
