import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeIdentityAdapter } from "../../../adapter/chrome/identity.adapter";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { AuthToken, OAuthConfig } from "../../../shared/types/auth";
import { AuthError, isAuthToken } from "../../../shared/types/auth";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

function createMockStorage(): StoragePort & {
	get: ReturnType<typeof vi.fn>;
	set: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
} {
	return {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn(),
	};
}

const TEST_CONFIG: OAuthConfig = {
	clientId: "test-client-id",
	clientSecret: "test-client-secret",
	authorizationEndpoint: "https://github.com/login/oauth/authorize",
	tokenEndpoint: "https://github.com/login/oauth/access_token",
	redirectUri: "https://mock-redirect.chromiumapp.org/",
	scopes: ["repo"],
};

const MOCK_TOKEN: AuthToken = {
	accessToken: "gho_test_access_token",
	tokenType: "bearer",
	scope: "repo",
};

describe("ChromeIdentityAdapter", () => {
	let adapter: ChromeIdentityAdapter;
	let mockStorage: ReturnType<typeof createMockStorage>;
	let originalFetch: typeof globalThis.fetch;

	beforeEach(() => {
		setupChromeMock();
		mockStorage = createMockStorage();
		mockStorage.set.mockResolvedValue(undefined);
		mockStorage.remove.mockResolvedValue(undefined);
		adapter = new ChromeIdentityAdapter(mockStorage, TEST_CONFIG);
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		vi.useRealTimers();
		resetChromeMock();
		globalThis.fetch = originalFetch;
	});

	describe("authorize", () => {
		function setupSuccessfulFlow(): void {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-auth-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});
		}

		it("should call chrome.identity.launchWebAuthFlow with interactive: true", async () => {
			setupSuccessfulFlow();
			const chromeMock = getChromeMock();

			await adapter.authorize();

			expect(chromeMock.identity.launchWebAuthFlow).toHaveBeenCalledWith(
				expect.objectContaining({ interactive: true }),
			);
		});

		it("should extract authorization code from redirect URL", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			expect(fetchMock).toHaveBeenCalled();
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = options.body as string;
			expect(body).toContain("code=test-auth-code");
		});

		it("should throw AuthError with csrf_mismatch when state does not match", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockResolvedValue(
				`${TEST_CONFIG.redirectUri}?code=test-code&state=wrong-state`,
			);

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("csrf_mismatch");
		});

		it("should POST to token endpoint for token exchange", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			expect(fetchMock).toHaveBeenCalledWith(
				TEST_CONFIG.tokenEndpoint,
				expect.objectContaining({ method: "POST" }),
			);
		});

		it("should include client_secret in POST body, not URL params", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			expect(url).not.toContain("client_secret");
			const body = options.body as string;
			expect(body).toContain("client_secret=test-client-secret");
		});

		it("should save the token via StoragePort", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			expect(mockStorage.set).toHaveBeenCalledWith("github_auth_token", MOCK_TOKEN);
		});

		it("should throw AuthError with token_exchange_failed when token endpoint returns HTTP error", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
		});

		it("should throw AuthError when GitHub returns 200 with error body", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					error: "bad_verification_code",
					error_description: "The code passed is incorrect or expired.",
				}),
			});

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
			expect((error as AuthError).message).toContain("The code passed is incorrect or expired.");
		});

		it("should throw AuthError when access_token is missing from response", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					token_type: "bearer",
					scope: "repo",
				}),
			});

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
			expect((error as AuthError).message).toContain("missing access_token");
		});

		it("should throw AuthError when fetch rejects with network error", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
			expect((error as AuthError).message).toContain("Failed to fetch");
		});

		it("should throw AuthError with user_cancelled when launchWebAuthFlow returns undefined", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockResolvedValue(undefined);

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("user_cancelled");
		});

		it("should throw AuthError with user_cancelled when launchWebAuthFlow throws", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockRejectedValue(
				new Error("The user did not approve access."),
			);

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("user_cancelled");
		});

		it("should sanitize error cause to message-only when launchWebAuthFlow throws", async () => {
			const chromeMock = getChromeMock();
			const originalError = new Error("The user did not approve access.");
			chromeMock.identity.launchWebAuthFlow.mockRejectedValue(originalError);

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			const cause = (error as AuthError).cause;
			expect(cause).toBeInstanceOf(Error);
			// cause は元のエラーオブジェクトではなく、message のみ引き継いだ新しい Error
			expect(cause).not.toBe(originalError);
			expect((cause as Error).message).toBe("The user did not approve access.");
		});

		it("should return the same promise for concurrent authorize calls", async () => {
			setupSuccessfulFlow();

			const promise1 = adapter.authorize();
			const promise2 = adapter.authorize();

			// 同じ Promise が返される
			expect(promise2).toBe(promise1);

			const [result1, result2] = await Promise.all([promise1, promise2]);
			expect(result1).toEqual(result2);
		});

		it("should allow a new authorize call after the previous one completes", async () => {
			setupSuccessfulFlow();

			const result1 = await adapter.authorize();
			const result2 = await adapter.authorize();

			// どちらも成功する（別々の呼び出し）
			expect(result1).toEqual(MOCK_TOKEN);
			expect(result2).toEqual(MOCK_TOKEN);
		});

		it("should use default tokenType 'bearer' when token_type is missing from response", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_token",
					scope: "repo",
					// token_type is intentionally omitted
				}),
			});

			const result = await adapter.authorize();
			expect(result.tokenType).toBe("bearer");
		});

		it("should use default empty string scope when scope is missing from response", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_token",
					token_type: "bearer",
					// scope is intentionally omitted
				}),
			});

			const result = await adapter.authorize();
			expect(result.scope).toBe("");
		});

		it("should throw AuthError when response body is invalid JSON", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => {
					throw new SyntaxError("Unexpected token < in JSON");
				},
			});

			const error = await adapter.authorize().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
			expect((error as AuthError).message).toContain("invalid response body");
		});

		it("should reset pending state after authorize fails", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockResolvedValueOnce(undefined);

			await adapter.authorize().catch(() => {});

			// 失敗後に再度呼び出せる
			setupSuccessfulFlow();
			const result = await adapter.authorize();
			expect(result).toEqual(MOCK_TOKEN);
		});

		it("should set expiresAt when expires_in is present in response", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-auth-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_access_token",
					token_type: "bearer",
					scope: "repo",
					expires_in: 3600,
				}),
			});

			await adapter.authorize();

			const savedToken = mockStorage.set.mock.calls[0][1] as AuthToken;
			const expectedExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() + 3600 * 1000;
			expect(savedToken.expiresAt).toBe(expectedExpiresAt);

			vi.useRealTimers();
		});

		it("should set refreshToken when refresh_token is present in response", async () => {
			const chromeMock = getChromeMock();
			chromeMock.identity.launchWebAuthFlow.mockImplementation(async (details: { url: string }) => {
				const url = new URL(details.url);
				const state = url.searchParams.get("state");
				return `${TEST_CONFIG.redirectUri}?code=test-auth-code&state=${state}`;
			});

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_access_token",
					token_type: "bearer",
					scope: "repo",
					refresh_token: "ghr_xxx",
				}),
			});

			await adapter.authorize();

			const savedToken = mockStorage.set.mock.calls[0][1] as AuthToken;
			expect(savedToken.refreshToken).toBe("ghr_xxx");
		});

		it("should omit expiresAt when expires_in is not present", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			const savedToken = mockStorage.set.mock.calls[0][1] as Record<string, unknown>;
			expect(savedToken.expiresAt).toBeUndefined();
		});

		it("should omit refreshToken when refresh_token is not present", async () => {
			setupSuccessfulFlow();

			await adapter.authorize();

			const savedToken = mockStorage.set.mock.calls[0][1] as Record<string, unknown>;
			expect(savedToken.refreshToken).toBeUndefined();
		});
	});

	describe("getToken", () => {
		it("should retrieve saved token from StoragePort", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			const result = await adapter.getToken();

			expect(mockStorage.get).toHaveBeenCalledWith("github_auth_token", isAuthToken);
			expect(result).toEqual(MOCK_TOKEN);
		});

		it("should return null when no token is saved", async () => {
			mockStorage.get.mockResolvedValue(null);

			const result = await adapter.getToken();

			expect(result).toBeNull();
		});
	});

	describe("clearToken", () => {
		it("should remove token from StoragePort", async () => {
			await adapter.clearToken();

			expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
		});
	});

	describe("isAuthenticated", () => {
		it("should return true when token exists", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
		});

		it("should return false when no token exists", async () => {
			mockStorage.get.mockResolvedValue(null);

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
		});

		it("should return true when token exists without expiresAt (non-expiring)", async () => {
			// expiresAt がないトークンは期限なしとして true を返すべき
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
		});

		it("should return true when token exists and expiresAt is in the future", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const futureExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() + 3600 * 1000;
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: futureExpiresAt,
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);

			vi.useRealTimers();
		});

		it("should return false when token expiresAt equals current time (boundary)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const exactNow = new Date("2026-01-01T00:00:00Z").getTime();
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: exactNow,
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
		});

		it("should return false when token exists but expiresAt is in the past", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const pastExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() - 1000;
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: pastExpiresAt,
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);

			vi.useRealTimers();
		});
	});
});
