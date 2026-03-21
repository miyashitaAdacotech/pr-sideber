import { afterEach, describe, expect, it, vi } from "vitest";

describe("createOAuthConfig", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should throw when VITE_GITHUB_CLIENT_ID is not set", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "test-secret");

		const mod = await import("../../../shared/config/oauth.config");

		expect(() => mod.createOAuthConfig("https://example.com/redirect")).toThrow(
			"VITE_GITHUB_CLIENT_ID is not configured",
		);
	});

	it("should throw when VITE_GITHUB_CLIENT_SECRET is not set", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "test-id");
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "");

		const mod = await import("../../../shared/config/oauth.config");

		expect(() => mod.createOAuthConfig("https://example.com/redirect")).toThrow(
			"VITE_GITHUB_CLIENT_SECRET is not configured",
		);
	});

	it("should return OAuthConfig when credentials are set", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "test-client-id");
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "test-client-secret");

		const mod = await import("../../../shared/config/oauth.config");
		const config = mod.createOAuthConfig("https://mock-redirect.chromiumapp.org/");

		expect(config).toEqual({
			clientId: "test-client-id",
			clientSecret: "test-client-secret",
			authorizationEndpoint: "https://github.com/login/oauth/authorize",
			tokenEndpoint: "https://github.com/login/oauth/access_token",
			redirectUri: "https://mock-redirect.chromiumapp.org/",
			scopes: ["repo"],
		});
	});

	it("should use the provided redirectUri", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "test-id");
		vi.stubEnv("VITE_GITHUB_CLIENT_SECRET", "test-secret");

		const mod = await import("../../../shared/config/oauth.config");
		const config = mod.createOAuthConfig("https://custom-redirect.example.com/");

		expect(config.redirectUri).toBe("https://custom-redirect.example.com/");
	});
});
