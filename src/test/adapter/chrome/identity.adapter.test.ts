import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeIdentityAdapter } from "../../../adapter/chrome/identity.adapter";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { AuthToken, DeviceCodeResponse, OAuthConfig } from "../../../shared/types/auth";
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
	deviceCodeEndpoint: "https://github.com/login/device/code",
	tokenEndpoint: "https://github.com/login/oauth/access_token",
	scopes: ["repo"],
};

const MOCK_TOKEN: AuthToken = {
	accessToken: "gho_test_access_token",
	tokenType: "bearer",
	scope: "repo",
};

const MOCK_DEVICE_CODE_RESPONSE: DeviceCodeResponse = {
	deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5",
	userCode: "WDJB-MJHT",
	verificationUri: "https://github.com/login/device",
	expiresIn: 900,
	interval: 5,
};

describe("ChromeIdentityAdapter — Device Flow", () => {
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

	describe("requestDeviceCode", () => {
		it("should POST to deviceCodeEndpoint with client_id and scope, and return DeviceCodeResponse with camelCase fields", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
					user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
					verification_uri: MOCK_DEVICE_CODE_RESPONSE.verificationUri,
					expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
					interval: MOCK_DEVICE_CODE_RESPONSE.interval,
				}),
			});

			const result: DeviceCodeResponse = await adapter.requestDeviceCode();

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			expect(fetchMock).toHaveBeenCalledWith(
				TEST_CONFIG.deviceCodeEndpoint,
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Accept: "application/json",
					}),
				}),
			);

			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = options.body as string;
			expect(body).toContain("client_id=test-client-id");
			expect(body).toContain("scope=repo");

			expect(result).toEqual(MOCK_DEVICE_CODE_RESPONSE);
		});

		it("should throw AuthError when API returns HTTP error", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			});

			const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("device_code_request_failed");
		});

		it("should throw AuthError when fetch rejects with network error", async () => {
			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("device_code_request_failed");
			expect((error as AuthError).message).toBe("Device code request failed");
		});
	});

	describe("pollForToken", () => {
		it("should return PollResult with success status when token is returned", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			const result = await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(result).toEqual({ status: "success", token: MOCK_TOKEN });
		});

		it("should save the token via StoragePort on success", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(mockStorage.set).toHaveBeenCalledWith("github_auth_token", MOCK_TOKEN);
		});

		it("should return pending status when authorization_pending", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ error: "authorization_pending" }),
			});

			const result = await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(result).toEqual({ status: "pending" });
		});

		it("should return slow_down status with new interval", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ error: "slow_down", interval: 10 }),
			});

			const result = await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(result).toEqual({ status: "slow_down", interval: 10 });
		});

		it("should return expired status when expired_token", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ error: "expired_token" }),
			});

			const result = await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(result).toEqual({ status: "expired" });
		});

		it("should return denied status when access_denied", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ error: "access_denied" }),
			});

			const result = await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			expect(result).toEqual({ status: "denied" });
		});

		it("should throw AuthError when fetch rejects with network error", async () => {
			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Network error"));

			const error = await adapter
				.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
				.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
		});

		it("should throw AuthError when HTTP response is not ok", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
			});

			const error = await adapter
				.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
				.catch((e: unknown) => e);

			expect(error).toBeInstanceOf(AuthError);
			expect((error as AuthError).code).toBe("token_exchange_failed");
		});

		it("should POST to tokenEndpoint with correct grant_type and device_code", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
			expect(fetchMock).toHaveBeenCalledWith(
				TEST_CONFIG.tokenEndpoint,
				expect.objectContaining({ method: "POST" }),
			);
			const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
			const body = options.body as string;
			expect(body).toContain("client_id=test-client-id");
			expect(body).toContain("device_code=");
			expect(body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code");
		});

		it("should set expiresAt when expires_in is present in response", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_access_token",
					token_type: "bearer",
					scope: "repo",
					expires_in: 3600,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			const savedToken = mockStorage.set.mock.calls[0][1] as AuthToken;
			const expectedExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() + 3600 * 1000;
			expect(savedToken.expiresAt).toBe(expectedExpiresAt);

			vi.useRealTimers();
		});

		it("should set refreshToken when refresh_token is present in response", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_test_access_token",
					token_type: "bearer",
					scope: "repo",
					refresh_token: "ghr_xxx",
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			const savedToken = mockStorage.set.mock.calls[0][1] as AuthToken;
			expect(savedToken.refreshToken).toBe("ghr_xxx");
		});

		it("should omit expiresAt when expires_in is not present", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

			const savedToken = mockStorage.set.mock.calls[0][1] as Record<string, unknown>;
			expect(savedToken.expiresAt).toBeUndefined();
		});

		it("should omit refreshToken when refresh_token is not present", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);

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
