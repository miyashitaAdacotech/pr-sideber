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
});
