import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

describe("bootstrap", () => {
	beforeEach(() => {
		vi.resetModules();
		setupChromeMock();
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
	});

	afterEach(() => {
		resetChromeMock();
		vi.unstubAllEnvs();
	});

	async function loadInitializeApp() {
		const mod = await import("../../background/bootstrap");
		return mod.initializeApp;
	}

	describe("initializeApp", () => {
		it("should complete without throwing", async () => {
			const initializeApp = await loadInitializeApp();
			expect(() => initializeApp()).not.toThrow();
		});

		it("should return AppServices with auth and githubApi", async () => {
			const initializeApp = await loadInitializeApp();
			const services = initializeApp();
			expect(services).toHaveProperty("auth");
			expect(services).toHaveProperty("githubApi");
		});

		it("should register message handler via chrome.runtime.onMessage.addListener", async () => {
			const initializeApp = await loadInitializeApp();
			initializeApp();
			expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
		});

		describe("idempotency guard", () => {
			it("should return the same AppServices instance on second call", async () => {
				const initializeApp = await loadInitializeApp();
				const first = initializeApp();
				const second = initializeApp();
				expect(second).toBe(first);
			});

			it("should register onMessage listener only once even if called twice", async () => {
				const initializeApp = await loadInitializeApp();
				initializeApp();
				const countAfterFirst = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.length;
				initializeApp();
				// 2回目の initializeApp では addListener が追加で呼ばれない
				expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(countAfterFirst);
			});

			it("should create ChromeIdentityAdapter only once (verified via storage.onChanged.addListener count)", async () => {
				const initializeApp = await loadInitializeApp();
				initializeApp();
				initializeApp();
				expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			});

			it("should remain idempotent across multiple calls", async () => {
				const initializeApp = await loadInitializeApp();
				const first = initializeApp();
				const countAfterFirst = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.length;
				initializeApp();
				const third = initializeApp();
				expect(third).toBe(first);
				// 2回目以降の initializeApp では addListener が追加で呼ばれない
				expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(countAfterFirst);
				expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			});
		});
	});

	describe("dispose (Issue #115)", () => {
		it("should return AppServices with dispose function", async () => {
			const initializeApp = await loadInitializeApp();
			const services = initializeApp();
			expect(services).toHaveProperty("dispose");
			expect(typeof services.dispose).toBe("function");
		});

		it("should call chrome.runtime.onMessage.removeListener with the registered handler on dispose", async () => {
			const initializeApp = await loadInitializeApp();
			const services = initializeApp();
			// startWatching() が calls[0] にリスナーを登録し、
			// createMessageHandler の handler が calls[1] に登録される
			const calls = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls;
			const messageHandler = calls[calls.length - 1]?.[0];
			expect(messageHandler).toBeDefined();
			services.dispose();
			expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(messageHandler);
		});

		it("should not throw when dispose is called twice (idempotent)", async () => {
			const initializeApp = await loadInitializeApp();
			const services = initializeApp();
			services.dispose();
			expect(() => services.dispose()).not.toThrow();
			expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
		});
	});
});
