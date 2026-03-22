import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("assertNoClientSecret", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should throw when GITHUB_CLIENT_SECRET is set", async () => {
		vi.stubEnv("GITHUB_CLIENT_SECRET", "super-secret");

		const { assertNoClientSecret } = await import("../../build-config/build-guards");
		expect(() => assertNoClientSecret()).toThrow(/GITHUB_CLIENT_SECRET/);
	});

	it("should throw when VITE_GITHUB_CLIENT_SECRET is set", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "super-secret");

		const { assertNoClientSecret } = await import("../../build-config/build-guards");
		expect(() => assertNoClientSecret()).toThrow(/GITHUB_CLIENT_SECRET/);
	});

	it("should not throw when neither secret env var is set", async () => {
		const { assertNoClientSecret } = await import("../../build-config/build-guards");
		expect(() => assertNoClientSecret()).not.toThrow();
	});

	it("should not throw when GITHUB_CLIENT_SECRET is empty string", async () => {
		vi.stubEnv("GITHUB_CLIENT_SECRET", "");

		const { assertNoClientSecret } = await import("../../build-config/build-guards");
		expect(() => assertNoClientSecret()).not.toThrow();
	});
});
