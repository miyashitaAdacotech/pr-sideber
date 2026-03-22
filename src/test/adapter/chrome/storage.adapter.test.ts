import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeStorageAdapter } from "../../../adapter/chrome/storage.adapter";
import type { StoragePort } from "../../../domain/ports/storage.port";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("ChromeStorageAdapter", () => {
	let adapter: StoragePort;

	beforeEach(() => {
		setupChromeMock();
		adapter = new ChromeStorageAdapter();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("get", () => {
		const alwaysTrue = (_v: unknown): _v is unknown => true;

		it("should call chrome.storage.local.get with the correct key", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({ myKey: "myValue" });

			await adapter.get("myKey", alwaysTrue);

			expect(mock.storage.local.get).toHaveBeenCalledWith("myKey");
		});

		it("should return the value when validation succeeds", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({
				myKey: { data: "test" },
			});
			const validate = (_v: unknown): _v is { data: string } => true;

			const result = await adapter.get("myKey", validate);

			expect(result).toEqual({ data: "test" });
		});

		it("should return null when validation fails", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({
				myKey: { data: "test" },
			});
			const validate = (_v: unknown): _v is never => false;
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const result = await adapter.get("myKey", validate);

			expect(result).toBeNull();
			expect(warnSpy).toHaveBeenCalledWith('[storage] validation failed for key "myKey"');
			warnSpy.mockRestore();
		});

		it("should return null when the key does not exist without calling validate", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({});
			let validateCalled = false;
			const validate = (_v: unknown): _v is unknown => {
				validateCalled = true;
				return true;
			};

			const result = await adapter.get("nonExistent", validate);

			expect(result).toBeNull();
			expect(validateCalled).toBe(false);
		});
	});

	describe("set", () => {
		it("should call chrome.storage.local.set with the correct arguments", async () => {
			const mock = getChromeMock();
			mock.storage.local.set.mockResolvedValue(undefined);

			await adapter.set("myKey", { data: "test" });

			expect(mock.storage.local.set).toHaveBeenCalledWith({
				myKey: { data: "test" },
			});
		});
	});

	describe("remove", () => {
		it("should call chrome.storage.local.remove with the correct key", async () => {
			const mock = getChromeMock();
			mock.storage.local.remove.mockResolvedValue(undefined);

			await adapter.remove("myKey");

			expect(mock.storage.local.remove).toHaveBeenCalledWith("myKey");
		});
	});
});
