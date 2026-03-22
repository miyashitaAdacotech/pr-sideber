import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

describe("bootstrap with auth", () => {
	beforeEach(() => {
		setupChromeMock();
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");
	});

	afterEach(() => {
		resetChromeMock();
		vi.unstubAllEnvs();
	});

	it("should return an object with auth property", async () => {
		const { initializeApp } = await import("../../background/bootstrap");
		const app = initializeApp();

		expect(app).toHaveProperty("auth");
	});

	it("should return auth with required methods", async () => {
		const { initializeApp } = await import("../../background/bootstrap");
		const app = initializeApp();

		expect(typeof app.auth.requestDeviceCode).toBe("function");
		expect(typeof app.auth.pollForToken).toBe("function");
		expect(typeof app.auth.getToken).toBe("function");
		expect(typeof app.auth.clearToken).toBe("function");
		expect(typeof app.auth.isAuthenticated).toBe("function");
	});
});
