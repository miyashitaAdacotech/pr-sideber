import type { StoragePort } from "../../domain/ports/storage.port";

export class ChromeStorageAdapter implements StoragePort {
	async get<T>(key: string, validate: (value: unknown) => value is T): Promise<T | null> {
		const result = await chrome.storage.local.get(key);
		if (!(key in result)) {
			return null;
		}
		const value: unknown = result[key];
		if (validate(value)) {
			return value;
		}
		if (import.meta.env.DEV) {
			console.warn(`[storage] validation failed for key "${key}"`);
		}
		return null;
	}

	async set<T>(key: string, value: T): Promise<void> {
		await chrome.storage.local.set({ [key]: value });
	}

	async remove(key: string): Promise<void> {
		await chrome.storage.local.remove(key);
	}
}
