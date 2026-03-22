import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeIdentityAdapter } from "../../../adapter/chrome/identity.adapter";
import type { OAuthConfig } from "../../../adapter/chrome/oauth.config";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { AuthToken, DeviceCodeResponse } from "../../../domain/types/auth";
import { AuthError, isAuthToken } from "../../../shared/types/auth";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../../mocks/chrome.mock";

describe("identity.adapter の依存方向", () => {
	it("AuthToken, DeviceCodeResponse, PollResult を domain/types/auth から直接 import していること", () => {
		const files = import.meta.glob("../../../adapter/chrome/identity.adapter.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const matchedPaths = Object.keys(files);
		expect(matchedPaths, "adapter/chrome/identity.adapter.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		// domain/types/auth から import していることを確認 (multiline import 対応)
		expect(content).toMatch(
			/import\s+[\s\S]*?\bAuthToken\b[\s\S]*?from\s+["'].*domain\/types\/auth["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bDeviceCodeResponse\b[\s\S]*?from\s+["'].*domain\/types\/auth["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bPollResult\b[\s\S]*?from\s+["'].*domain\/types\/auth["']/,
		);
	});

	it("OAuthConfig を shared/types/auth から import していないこと", () => {
		const files = import.meta.glob("../../../adapter/chrome/identity.adapter.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(files), "adapter/chrome/identity.adapter.ts が見つかりません").toHaveLength(
			1,
		);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		// shared/types/auth からの import に OAuthConfig が含まれていないことを検証
		const sharedAuthImportPattern =
			/import\s+(?:type\s+)?{([^}]*)}\s+from\s+["'].*shared\/types\/auth["']/g;
		const matches = [...(content?.matchAll(sharedAuthImportPattern) ?? [])];

		for (const match of matches) {
			const importedSymbols = match[1];
			expect(importedSymbols).not.toMatch(/\bOAuthConfig\b/);
		}
	});

	it("shared/types/auth から AuthToken, DeviceCodeResponse, PollResult を import していないこと", () => {
		const files = import.meta.glob("../../../adapter/chrome/identity.adapter.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(files), "adapter/chrome/identity.adapter.ts が見つかりません").toHaveLength(
			1,
		);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		// multiline import 文を抽出して禁止シンボルを検証
		const sharedAuthImportPattern =
			/import\s+(?:type\s+)?{([^}]*)}\s+from\s+["'].*shared\/types\/auth["']/g;
		const matches = [...(content?.matchAll(sharedAuthImportPattern) ?? [])];

		for (const match of matches) {
			const importedSymbols = match[1];
			expect(importedSymbols).not.toMatch(/\bAuthToken\b/);
			expect(importedSymbols).not.toMatch(/\bDeviceCodeResponse\b/);
			expect(importedSymbols).not.toMatch(/\bPollResult\b/);
		}
	});
});

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

		describe("error_description のサニタイズ", () => {
			/** エラーメッセージから "Token exchange failed: " プレフィックスを除いた description 部分を取得する */
			function extractDescription(authError: AuthError): string {
				return authError.message.replace("Token exchange failed: ", "");
			}

			it("長すぎる error_description を切り詰める (600文字 → 500文字)", async () => {
				const longDescription = "a".repeat(600);
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: longDescription,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const description = extractDescription(error as AuthError);
				expect(description).toHaveLength(500);
			});

			it("501文字の error_description を500文字に切り詰める", async () => {
				const description501 = "b".repeat(501);
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: description501,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const description = extractDescription(error as AuthError);
				expect(description).toHaveLength(500);
			});

			it("500文字ちょうどの error_description は切り詰められない", async () => {
				const description500 = "c".repeat(500);
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: description500,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const description = extractDescription(error as AuthError);
				expect(description).toHaveLength(500);
			});

			it("HTML タグを除去する (<script>)", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: "<script>alert('xss')</script>",
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).not.toContain("<script>");
				expect(authError.message).not.toContain("</script>");
				expect(authError.message).toContain("alert('xss')");
			});

			it("HTML タグを除去する (<img onerror>)", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: '<img onerror="alert(1)">payload',
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).not.toContain("<img");
				expect(authError.message).not.toContain("onerror");
				expect(authError.message).toContain("payload");
			});

			it("制御文字を除去する (タブ・LF は許容、CR は除去)", async () => {
				const descriptionWithControlChars = `error${String.fromCharCode(0)}${String.fromCharCode(1)}msg`;
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: descriptionWithControlChars,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("errormsg");
				// 制御文字 (U+0000 ~ U+001F) のうち、タブ(0x09)・LF(0x0A) のみ許容する
				const hasProhibitedControlChars = [...authError.message].some((ch) => {
					const code = ch.charCodeAt(0);
					return code <= 0x1f && code !== 0x09 && code !== 0x0a;
				});
				expect(hasProhibitedControlChars).toBe(false);
			});

			it("タブ・LF は保持される", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: "line1\tvalue\nline2",
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const description = extractDescription(error as AuthError);
				expect(description).toContain("\t");
				expect(description).toContain("\n");
				expect(description).toBe("line1\tvalue\nline2");
			});

			it("error_description なしで error フォールバック", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "custom_err",
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("custom_err");
			});

			it("error_description が空文字の場合は error フィールドにフォールバック", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "fallback_error",
						error_description: "",
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("fallback_error");
			});

			it("error_description が null の場合は error フィールドにフォールバック", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "null_desc_error",
						error_description: null,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("null_desc_error");
			});

			it("error_description が数値の場合は error フィールドにフォールバック", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "numeric_desc_error",
						error_description: 12345,
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("numeric_desc_error");
			});

			it("正常な description はそのまま通る", async () => {
				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: true,
					json: async () => ({
						error: "unknown_error",
						error_description: "Something went wrong",
					}),
				});

				const error = await adapter
					.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
					.catch((e: unknown) => e);

				expect(error).toBeInstanceOf(AuthError);
				const authError = error as AuthError;
				expect(authError.message).toContain("Something went wrong");
			});
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

		it("should use cached result on second call without hitting storage again", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			await adapter.isAuthenticated();
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should return true from cache after successful pollForToken without hitting storage", async () => {
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: MOCK_TOKEN.accessToken,
					token_type: MOCK_TOKEN.tokenType,
					scope: MOCK_TOKEN.scope,
				}),
			});

			await adapter.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode);
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should return false from cache after clearToken without hitting storage", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);
			await adapter.isAuthenticated();

			await adapter.clearToken();
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should update cache to false when storage.onChanged fires with token key removed", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);
			await adapter.isAuthenticated();

			const chromeMock = getChromeMock();
			expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;

			listener({ github_auth_token: { oldValue: MOCK_TOKEN } }, "local");
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should update cache to true when storage.onChanged fires with token key set", async () => {
			mockStorage.get.mockResolvedValue(null);
			await adapter.isAuthenticated();

			const chromeMock = getChromeMock();
			expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;

			listener({ github_auth_token: { newValue: MOCK_TOKEN } }, "local");
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should not update cache when storage.onChanged fires for non-local area", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);
			await adapter.isAuthenticated();

			const chromeMock = getChromeMock();
			expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;

			// "sync" area で token 削除の変更を発火 — キャッシュは変わらないはず
			listener({ github_auth_token: { oldValue: MOCK_TOKEN } }, "sync");
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should not update cache when unrelated key changes in storage.onChanged", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);
			await adapter.isAuthenticated();

			const chromeMock = getChromeMock();
			expect(chromeMock.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;

			// 無関係なキーの変更 — キャッシュは変わらないはず
			listener({ some_other_key: { newValue: "something" } }, "local");
			mockStorage.get.mockClear();
			mockStorage.get.mockImplementation(() => {
				throw new Error("storage.get should not be called when cache is populated");
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).not.toHaveBeenCalled();
		});

		it("should call storage.get on first invocation when cache is uninitialized", async () => {
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			await adapter.isAuthenticated();

			expect(mockStorage.get).toHaveBeenCalledWith("github_auth_token", isAuthToken);
		});
	});
});
