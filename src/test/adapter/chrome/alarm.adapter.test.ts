import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChromeAlarmAdapter } from "../../../adapter/chrome/alarm.adapter";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("ChromeAlarmAdapter", () => {
	let adapter: ChromeAlarmAdapter;

	beforeEach(() => {
		setupChromeMock();
		adapter = new ChromeAlarmAdapter();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("create", () => {
		it("should call chrome.alarms.create with correct arguments and resolve", async () => {
			await expect(adapter.create("pr-refresh", 5)).resolves.toBeUndefined();

			const mock = getChromeMock();
			expect(mock.alarms.create).toHaveBeenCalledWith("pr-refresh", { periodInMinutes: 5 });
		});
	});

	describe("clear", () => {
		it("should call chrome.alarms.clear and return the result", async () => {
			const mock = getChromeMock();
			mock.alarms.clear.mockResolvedValue(true);

			const result = await adapter.clear("pr-refresh");

			expect(mock.alarms.clear).toHaveBeenCalledWith("pr-refresh");
			expect(result).toBe(true);
		});

		it("should return false when alarm does not exist", async () => {
			const mock = getChromeMock();
			mock.alarms.clear.mockResolvedValue(false);
			const result = await adapter.clear("nonexistent");
			expect(result).toBe(false);
		});
	});

	describe("onAlarm", () => {
		it("should register a listener via chrome.alarms.onAlarm.addListener", () => {
			const callback = () => {};
			adapter.onAlarm(callback);

			const mock = getChromeMock();
			expect(mock.alarms.onAlarm.addListener).toHaveBeenCalledTimes(1);
		});

		it("should return an unsubscribe function that calls removeListener", () => {
			const callback = () => {};
			const unsubscribe = adapter.onAlarm(callback);

			const mock = getChromeMock();
			unsubscribe();

			expect(mock.alarms.onAlarm.removeListener).toHaveBeenCalledTimes(1);
		});

		it("should pass the alarm name to the callback", () => {
			const mock = getChromeMock();
			let capturedListener: ((alarm: { name: string }) => void) | undefined;
			mock.alarms.onAlarm.addListener.mockImplementation(
				(listener: (alarm: { name: string }) => void) => {
					capturedListener = listener;
				},
			);

			const names: string[] = [];
			adapter.onAlarm((name) => names.push(name));

			expect(capturedListener).toBeDefined();
			capturedListener?.({ name: "pr-refresh" });

			expect(names).toEqual(["pr-refresh"]);
		});
	});
});
