import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createOAuthConfig", () => {
	beforeEach(() => {
		// dynamic import のモジュールキャッシュを破棄し、各テストで再評価させる
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("should throw when GITHUB_CLIENT_ID is empty string", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		expect(() => createConfig()).toThrow("GITHUB_CLIENT_ID is not configured");
	});

	it("should throw when GITHUB_CLIENT_ID is undefined (not set at all)", async () => {
		// vi.stubEnv で設定しない = undefined

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		expect(() => createConfig()).toThrow("GITHUB_CLIENT_ID is not configured");
	});

	it("should not use VITE_ prefixed environment variable", async () => {
		vi.stubEnv("VITE_GITHUB_CLIENT_ID", "should-not-work");
		// GITHUB_CLIENT_ID is not set, so it should throw even if VITE_ version exists

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		expect(() => createConfig()).toThrow("GITHUB_CLIENT_ID is not configured");
	});

	it("should return OAuthConfig with deviceCodeEndpoint when client ID is set", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		const config = createConfig();

		expect(config).toEqual({
			clientId: "test-client-id",
			deviceCodeEndpoint: "https://github.com/login/device/code",
			tokenEndpoint: "https://github.com/login/oauth/access_token",
			scopes: ["repo"],
		});
	});

	// 以下の not.toHaveProperty テストは toEqual で構造的に保証されているが、
	// Device Flow 移行で「旧プロパティが存在しないこと」を意図として明示するために残す。
	// Issue #60: OAuth シークレットのフロントエンドバンドル混入リスク解消の一環として、
	// OAuthConfig 型に clientSecret が含まれないことを保証する。
	it("should not have clientSecret property", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		const config = createConfig();

		expect(config).not.toHaveProperty("clientSecret");
	});

	it("should not have authorizationEndpoint property", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		const config = createConfig();

		expect(config).not.toHaveProperty("authorizationEndpoint");
	});

	it("should not have redirectUri property", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		const config = createConfig();

		expect(config).not.toHaveProperty("redirectUri");
	});

	it("should have deviceCodeEndpoint pointing to GitHub device code URL", async () => {
		vi.stubEnv("GITHUB_CLIENT_ID", "test-client-id");

		const mod = await import("../../../adapter/chrome/oauth.config");
		const createConfig = mod.createOAuthConfig;
		const config = createConfig();

		expect(config.deviceCodeEndpoint).toBe("https://github.com/login/device/code");
	});
});
