import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp } from "../../background/bootstrap";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

describe("bootstrap", () => {
	beforeEach(() => {
		setupChromeMock();
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "test-client-id");
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "test-client-secret");
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

		it("should pass chrome.identity.getRedirectURL() as redirectUri", () => {
			const services = initializeApp();
			expect(services).toHaveProperty("auth");
			// chrome.identity.getRedirectURL が呼ばれていることを確認
			expect(chrome.identity.getRedirectURL).toHaveBeenCalled();
		});

		it("should register message handler via chrome.runtime.onMessage.addListener", () => {
			initializeApp();
			expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
		});
	});
});
