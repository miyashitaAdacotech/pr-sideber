import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp } from "../../background/bootstrap";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

describe("bootstrap", () => {
	beforeEach(() => {
		setupChromeMock();
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
	});

	afterEach(() => {
		resetChromeMock();
		vi.unstubAllEnvs();
	});

	describe("initializeApp", () => {
		it("should complete without throwing", () => {
			expect(() => initializeApp()).not.toThrow();
		});

		it("should return AppServices with auth and githubApi", () => {
			const services = initializeApp();
			expect(services).toHaveProperty("auth");
			expect(services).toHaveProperty("githubApi");
		});

		it("should register message handler via chrome.runtime.onMessage.addListener", () => {
			initializeApp();
			expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
		});
	});

	describe("dispose (Issue #115)", () => {
		it("should return AppServices with dispose function", () => {
			const services = initializeApp();
			expect(services).toHaveProperty("dispose");
			expect(typeof services.dispose).toBe("function");
		});

		it("should call chrome.storage.onChanged.removeListener with the registered listener on dispose", () => {
			const services = initializeApp();
			const addedListener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
			expect(addedListener).toBeDefined();
			services.dispose();
			expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(addedListener);
		});

		it("should call chrome.runtime.onMessage.removeListener with the registered handler on dispose", () => {
			const services = initializeApp();
			const registeredHandler = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls[0]?.[0];
			expect(registeredHandler).toBeDefined();
			services.dispose();
			expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(registeredHandler);
		});

		it("should not throw when dispose is called twice (idempotent)", () => {
			const services = initializeApp();
			services.dispose();
			expect(() => services.dispose()).not.toThrow();
			expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
			expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledTimes(1);
		});
	});
});
