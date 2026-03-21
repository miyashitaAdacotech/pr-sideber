import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ChromeStorageAdapter } from "../../../adapter/chrome/storage.adapter";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("ChromeStorageAdapter", () => {
	let adapter: ChromeStorageAdapter;

	beforeEach(() => {
		setupChromeMock();
		adapter = new ChromeStorageAdapter();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("get", () => {
		it("should call chrome.storage.local.get with the correct key", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({ myKey: "myValue" });

			await adapter.get("myKey");

			expect(mock.storage.local.get).toHaveBeenCalledWith("myKey");
		});

		it("should return the value for the given key", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({
				myKey: { data: "test" },
			});

			const result = await adapter.get("myKey");

			expect(result).toEqual({ data: "test" });
		});

		it("should return null when the key does not exist", async () => {
			const mock = getChromeMock();
			mock.storage.local.get.mockResolvedValue({});

			const result = await adapter.get("nonExistent");

			expect(result).toBeNull();
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
