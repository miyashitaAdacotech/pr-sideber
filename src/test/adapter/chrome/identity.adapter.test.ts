import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChromeIdentityAdapter } from "../../../adapter/chrome/identity.adapter";
import type { OAuthConfig } from "../../../adapter/chrome/oauth.config";
import type { StoragePort } from "../../../domain/ports/storage.port";
import type { AuthToken, DeviceCodeResponse } from "../../../domain/types/auth";
import { AuthError, isAuthToken } from "../../../shared/types/auth";
import { NetworkError, RateLimitError } from "../../../shared/types/errors";
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
			expect((error as AuthError).message).toBe("Device code request failed");
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
			expect((error as AuthError).message).toBe("Token polling failed");
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
			expect((error as AuthError).message).toBe("Token polling failed");
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

			try {
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
			} finally {
				vi.useRealTimers();
			}
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

		describe("未知の OAuth エラー", () => {
			it("未知のエラーでは固定メッセージの AuthError を throw する", async () => {
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
				expect(authError.code).toBe("token_exchange_failed");
				expect(authError.message).toBe("Token exchange failed");
			});

			it("error_description の内容がユーザー向けメッセージに漏れない", async () => {
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
				expect(authError.message).toBe("Token exchange failed");
				expect(authError.message).not.toContain("script");
				expect(authError.message).not.toContain("xss");
			});

			it("error_description なしでも固定メッセージで throw する", async () => {
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
				expect(authError.code).toBe("token_exchange_failed");
				expect(authError.message).toBe("Token exchange failed");
			});

			it("error_description が空文字の場合も固定メッセージで throw する", async () => {
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
				expect(authError.message).toBe("Token exchange failed");
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

			try {
				const futureExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() + 3600 * 1000;
				mockStorage.get.mockResolvedValue({
					...MOCK_TOKEN,
					expiresAt: futureExpiresAt,
				});

				const result = await adapter.isAuthenticated();

				expect(result).toBe(true);
			} finally {
				vi.useRealTimers();
			}
		});

		it("should return false when token expiresAt equals current time (boundary)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			try {
				const exactNow = new Date("2026-01-01T00:00:00Z").getTime();
				mockStorage.get.mockResolvedValue({
					...MOCK_TOKEN,
					expiresAt: exactNow,
				});

				const result = await adapter.isAuthenticated();

				expect(result).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});

		it("should return false when token exists but expiresAt is in the past", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			try {
				const pastExpiresAt = new Date("2026-01-01T00:00:00Z").getTime() - 1000;
				mockStorage.get.mockResolvedValue({
					...MOCK_TOKEN,
					expiresAt: pastExpiresAt,
				});

				const result = await adapter.isAuthenticated();

				expect(result).toBe(false);
			} finally {
				vi.useRealTimers();
			}
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

		it("should re-validate from storage after successful pollForToken (cache is invalidated)", async () => {
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
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).toHaveBeenCalledTimes(1);
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

		it("should invalidate cache when storage.onChanged fires with token key set, so next isAuthenticated re-reads storage", async () => {
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
			mockStorage.get.mockResolvedValue(MOCK_TOKEN);

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			expect(mockStorage.get).toHaveBeenCalledTimes(1);
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

		// Issue #117: storageChangeListener 後の isAuthenticated() で expiresAt が未検証になるバグ
		//
		// 現在の実装では listener が cachedAuthenticated=true, cachedExpiresAt=undefined をセットするため、
		// isAuthenticated() の行235で cachedAuthenticated !== null が true となり、
		// ストレージ再読み込みパスに入らず true が返されてしまう。
		// 修正後は listener が cachedAuthenticated=null をセットし、ストレージ再読み込みパスに入って
		// expiresAt を検証した結果 false を返すようになる。
		it("should return false after storageChangeListener fires when stored token is expired", async () => {
			// 初期状態: キャッシュ未初期化 → storage から null を返して false にする
			mockStorage.get.mockResolvedValue(null);
			await adapter.isAuthenticated();

			// storageChangeListener を発火させる（トークンがセットされた通知）
			// listener は newValue の存在のみチェックし中身は見ない。
			// 実際の expiresAt 検証は isAuthenticated() 内のストレージ再読み込みで行われる。
			const chromeMock = getChromeMock();
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;
			listener({ github_auth_token: { newValue: MOCK_TOKEN } }, "local");

			// ストレージには期限切れトークンが入っている状態をセットアップ
			const expiredToken: AuthToken = {
				accessToken: "gho_expired",
				tokenType: "bearer",
				scope: "repo",
				expiresAt: Date.now() - 1000, // 1秒前に期限切れ
			};
			mockStorage.get.mockClear();
			mockStorage.get.mockResolvedValue(expiredToken);

			// storageChangeListener 後の isAuthenticated() はストレージを再読み込みし、
			// expiresAt を検証して false を返すべき
			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
		});

		// 現在の実装では listener が cachedAuthenticated=true, cachedExpiresAt=undefined をセットするため、
		// isAuthenticated() の行235で cachedAuthenticated !== null が true となり、
		// ストレージ再読み込みせずに true をキャッシュから返してしまう。
		// テスト自体は true を期待しているので一見 pass しそうだが、storage.get が呼ばれないため
		// 最終行の toHaveBeenCalledWith アサーションで fail する。
		// 修正後は listener が cachedAuthenticated=null をセットし、ストレージ再読み込みパスに入る。
		it("should re-read storage after storageChangeListener fires and validate expiresAt for valid token", async () => {
			// 初期状態: キャッシュ未初期化 → storage から null を返して false にする
			mockStorage.get.mockResolvedValue(null);
			await adapter.isAuthenticated();

			// storageChangeListener を発火させる（トークンがセットされた通知）
			// listener は newValue の存在のみチェックし中身は見ない。
			// 実際の expiresAt 検証は isAuthenticated() 内のストレージ再読み込みで行われる。
			const chromeMock = getChromeMock();
			const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
				changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
				areaName: string,
			) => void;
			listener({ github_auth_token: { newValue: MOCK_TOKEN } }, "local");

			// ストレージには有効期限が十分先のトークンが入っている
			const validToken: AuthToken = {
				accessToken: "gho_valid",
				tokenType: "bearer",
				scope: "repo",
				expiresAt: Date.now() + 3600 * 1000, // 1時間後
			};
			mockStorage.get.mockClear();
			mockStorage.get.mockResolvedValue(validToken);

			// storageChangeListener 後の isAuthenticated() はストレージを再読み込みすべき
			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
			// ストレージから再読み込みが行われたことを検証（キャッシュで済ませていないこと）
			expect(mockStorage.get).toHaveBeenCalledWith("github_auth_token", isAuthToken);
		});

		// バッファ境界値テスト: expiresAt が TOKEN_EXPIRY_BUFFER_MS - 1 (バッファ圏内ギリギリ)
		// この値は isTokenExpiredWithBuffer で Date.now() >= expiresAt - buffer と判定され、
		// expiresAt = now + buffer - 1 → now >= (now + buffer - 1) - buffer → now >= now - 1 → true
		// つまり期限切れ扱いとなり false が返る。
		// このテストは有効トークンテストの「expiresAt 検証の証拠」も兼ねる:
		// ストレージ再読み込みが行われなければ expiresAt は検証されず true が返されてしまうため。
		it("should return false after storageChangeListener fires when token is just inside buffer boundary", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			try {
				// 初期状態: キャッシュ未初期化 → storage から null を返して false にする
				mockStorage.get.mockResolvedValue(null);
				await adapter.isAuthenticated();

				// storageChangeListener を発火させる
				const chromeMock = getChromeMock();
				const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
					changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
					areaName: string,
				) => void;
				listener({ github_auth_token: { newValue: MOCK_TOKEN } }, "local");

				// ストレージにはバッファ境界ギリギリ (buffer - 1ms) のトークンが入っている
				const now = Date.now();
				const borderlineToken: AuthToken = {
					accessToken: "gho_borderline",
					tokenType: "bearer",
					scope: "repo",
					expiresAt: now + TOKEN_EXPIRY_BUFFER_MS - 1, // バッファ圏内ギリギリ → false
				};
				mockStorage.get.mockClear();
				mockStorage.get.mockResolvedValue(borderlineToken);

				const result = await adapter.isAuthenticated();

				expect(result).toBe(false);
			} finally {
				vi.useRealTimers();
			}
		});
	});
});

// ============================================================
// Issue #57: トークン有効期限バッファ & リフレッシュフロー
// ============================================================

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

const MOCK_TOKEN_WITH_REFRESH: AuthToken = {
	accessToken: "gho_test_access_token",
	tokenType: "bearer",
	scope: "repo",
	refreshToken: "ghr_test_refresh_token",
};

describe("ChromeIdentityAdapter — Expiry Buffer (Issue #57)", () => {
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

	describe("isAuthenticated with buffer", () => {
		it("should return false when expiresAt is within buffer (now + 4min)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: now + 4 * 60 * 1000, // 4 minutes from now — within 5min buffer
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
		});

		it("should return true when expiresAt is outside buffer (now + 6min)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: now + 6 * 60 * 1000, // 6 minutes from now — outside 5min buffer
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
		});

		it("should return false when expiresAt is exactly at buffer boundary (now + 5min)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt: now + TOKEN_EXPIRY_BUFFER_MS, // exactly 5 minutes — boundary => false (>= means expired)
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(false);
		});

		it("should return true for non-expiring token (no expiresAt) regardless of buffer", async () => {
			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				// expiresAt is undefined
			});

			const result = await adapter.isAuthenticated();

			expect(result).toBe(true);
		});
	});

	describe("cache with buffer — time progression", () => {
		it("should return false when cached token enters buffer zone after time passes", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			const expiresAt = now + 6 * 60 * 1000; // 6 minutes — outside buffer initially

			mockStorage.get.mockResolvedValue({
				...MOCK_TOKEN,
				expiresAt,
			});

			// First call: outside buffer → true
			const first = await adapter.isAuthenticated();
			expect(first).toBe(true);

			// Advance time by 2 minutes → expiresAt is now 4min away → inside buffer
			vi.advanceTimersByTime(2 * 60 * 1000);

			// Same adapter instance — cache should re-evaluate based on time
			const second = await adapter.isAuthenticated();
			expect(second).toBe(false);
		});
	});
});

describe("ChromeIdentityAdapter — getToken with expiry check (Issue #57)", () => {
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

	it("should refresh and return new token when token is expired and refreshToken exists", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const expiredToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now - 1000, // expired
		};
		mockStorage.get.mockResolvedValue(expiredToken);

		// Mock successful refresh
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "gho_new_access_token",
				token_type: "bearer",
				scope: "repo",
				expires_in: 3600,
				refresh_token: "ghr_new_refresh_token",
			}),
		});

		const result = await adapter.getToken();

		expect(result).not.toBeNull();
		expect(result?.accessToken).toBe("gho_new_access_token");
		expect(result?.refreshToken).toBe("ghr_new_refresh_token");
	});

	it("should return null and clear token when expired and refresh fails", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const expiredToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now - 1000,
		};
		mockStorage.get.mockResolvedValue(expiredToken);

		// Mock failed refresh
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 400,
		});

		const result = await adapter.getToken();

		expect(result).toBeNull();
		expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
	});

	it("should return null and clear token when expired and no refreshToken", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const expiredTokenNoRefresh: AuthToken = {
			accessToken: "gho_test_access_token",
			tokenType: "bearer",
			scope: "repo",
			expiresAt: now - 1000,
			// no refreshToken
		};
		mockStorage.get.mockResolvedValue(expiredTokenNoRefresh);

		const result = await adapter.getToken();

		expect(result).toBeNull();
		expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
	});

	it("should return token as-is when not expired", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const validToken: AuthToken = {
			...MOCK_TOKEN,
			expiresAt: now + 3600 * 1000, // 1 hour from now
		};
		mockStorage.get.mockResolvedValue(validToken);

		const result = await adapter.getToken();

		expect(result).toEqual(validToken);
	});

	it("should refresh when token is within buffer zone (expiresAt = now + 4min)", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const bufferZoneToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now + 4 * 60 * 1000, // 4 min from now — within 5min buffer
		};
		mockStorage.get.mockResolvedValue(bufferZoneToken);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "gho_refreshed_buffer",
				token_type: "bearer",
				scope: "repo",
				expires_in: 3600,
				refresh_token: "ghr_new_buffer",
			}),
		});

		const result = await adapter.getToken();

		expect(result).not.toBeNull();
		expect(result?.accessToken).toBe("gho_refreshed_buffer");
	});

	it("should return token as-is when expiresAt is undefined", async () => {
		mockStorage.get.mockResolvedValue(MOCK_TOKEN); // no expiresAt

		const result = await adapter.getToken();

		expect(result).toEqual(MOCK_TOKEN);
	});
});

describe("ChromeIdentityAdapter — refreshAccessToken (Issue #57)", () => {
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

	it("should POST to tokenEndpoint with grant_type=refresh_token and correct parameters", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "gho_refreshed",
				token_type: "bearer",
				scope: "repo",
				expires_in: 3600,
				refresh_token: "ghr_new",
			}),
		});

		// Store a token with refreshToken so the adapter has it
		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		await adapter.refreshAccessToken();

		const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
		expect(fetchMock).toHaveBeenCalledWith(
			TEST_CONFIG.tokenEndpoint,
			expect.objectContaining({ method: "POST" }),
		);
		const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
		const body = options.body as string;
		expect(body).toContain("grant_type=refresh_token");
		expect(body).toContain("client_id=test-client-id");
		expect(body).toContain(
			`refresh_token=${encodeURIComponent(MOCK_TOKEN_WITH_REFRESH.refreshToken as string)}`,
		);
	});

	it("should save new token to storage and return it on success", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				access_token: "gho_refreshed",
				token_type: "bearer",
				scope: "repo",
				expires_in: 7200,
				refresh_token: "ghr_new",
			}),
		});

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		const result = await adapter.refreshAccessToken();

		expect(result).not.toBeNull();
		expect(result?.accessToken).toBe("gho_refreshed");
		expect(result?.refreshToken).toBe("ghr_new");
		expect(mockStorage.set).toHaveBeenCalledWith(
			"github_auth_token",
			expect.objectContaining({
				accessToken: "gho_refreshed",
				expiresAt: Date.now() + 7200 * 1000,
			}),
		);
	});

	it("should return null when refresh HTTP response is not ok", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
		});

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		const result = await adapter.refreshAccessToken();

		expect(result).toBeNull();
	});

	it("should throw NetworkError when fetch rejects with network error", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Network error"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
		// リトライのバックオフ delay を進める (1s + 2s)
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(NetworkError);
	});

	it("should return null when no refreshToken exists on stored token", async () => {
		const fetchMock = vi.fn();
		globalThis.fetch = fetchMock;

		mockStorage.get.mockResolvedValue(MOCK_TOKEN); // no refreshToken

		const result = await adapter.refreshAccessToken();

		expect(result).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

// ============================================================
// Issue #107: ネットワークエラー時のトークン保護
// ============================================================

describe("ChromeIdentityAdapter — ネットワークエラー時のトークン保護 (Issue #107)", () => {
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

	describe("getToken — ネットワークエラー時のトークン保護", () => {
		it("ネットワークエラー(fetch TypeError)時、バッファ圏内だが有効期限内のトークンはそのまま返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			// 残り2分: バッファ(5分)圏内だが、実際にはまだ有効
			const bufferButValidToken: AuthToken = {
				...MOCK_TOKEN_WITH_REFRESH,
				expiresAt: now + 2 * 60 * 1000,
			};
			mockStorage.get.mockResolvedValue(bufferButValidToken);

			// fetch が TypeError で reject → ネットワーク障害
			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const resultPromise = adapter.getToken();
			// リトライのバックオフ delay を進める (1s + 2s)
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			const result = await resultPromise;

			// トークンはまだ有効なので、そのまま返すべき
			expect(result).not.toBeNull();
			expect(result?.accessToken).toBe(bufferButValidToken.accessToken);
			// clearToken が呼ばれないことを検証
			expect(mockStorage.remove).not.toHaveBeenCalled();
		});

		it("ネットワークエラー時、実際に期限切れのトークンは clearToken して null を返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			// 完全に期限切れ（過去の時間）
			const expiredToken: AuthToken = {
				...MOCK_TOKEN_WITH_REFRESH,
				expiresAt: now - 1000,
			};
			mockStorage.get.mockResolvedValue(expiredToken);

			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const resultPromise = adapter.getToken();
			// リトライのバックオフ delay を進める (1s + 2s)
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			const result = await resultPromise;

			expect(result).toBeNull();
			expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
		});

		it.each([{ status: 500, label: "HTTP 5xx" }])(
			"$label 時、バッファ圏内だが有効期限内のトークンはそのまま返す",
			async ({ status }) => {
				vi.useFakeTimers();
				vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

				const now = Date.now();
				const bufferButValidToken: AuthToken = {
					...MOCK_TOKEN_WITH_REFRESH,
					expiresAt: now + 2 * 60 * 1000,
				};
				mockStorage.get.mockResolvedValue(bufferButValidToken);

				globalThis.fetch = vi.fn().mockResolvedValue({
					ok: false,
					status,
				});

				const resultPromise = adapter.getToken();
				// リトライのバックオフ delay を進める (1s + 2s)
				await vi.advanceTimersByTimeAsync(1000);
				await vi.advanceTimersByTimeAsync(2000);

				const result = await resultPromise;

				expect(result).not.toBeNull();
				expect(result?.accessToken).toBe(bufferButValidToken.accessToken);
			},
		);

		it("HTTP 400 時 (refresh_token 無効)、clearToken して null を返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			const bufferZoneToken: AuthToken = {
				...MOCK_TOKEN_WITH_REFRESH,
				expiresAt: now + 2 * 60 * 1000,
			};
			mockStorage.get.mockResolvedValue(bufferZoneToken);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
			});

			const result = await adapter.getToken();

			expect(result).toBeNull();
			expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
		});

		it("refreshToken なし + バッファ圏内 + 有効期限内 → トークンを返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			// refreshToken なしでバッファ圏内だが実際はまだ有効
			const noRefreshBufferToken: AuthToken = {
				accessToken: "gho_no_refresh",
				tokenType: "bearer",
				scope: "repo",
				expiresAt: now + 2 * 60 * 1000,
				// refreshToken なし
			};
			mockStorage.get.mockResolvedValue(noRefreshBufferToken);

			const result = await adapter.getToken();

			// refreshToken がないので refresh できないが、まだ有効なのでトークンを返すべき
			expect(result).not.toBeNull();
			expect(result?.accessToken).toBe("gho_no_refresh");
		});
	});

	describe("performRefresh — リトライ", () => {
		it("1回目ネットワークエラー、2回目成功 → トークンを返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			const fetchMock = vi
				.fn()
				// 1回目: ネットワークエラー
				.mockRejectedValueOnce(new TypeError("Failed to fetch"))
				// 2回目: 成功
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						access_token: "gho_retry_success",
						token_type: "bearer",
						scope: "repo",
						expires_in: 3600,
						refresh_token: "ghr_retry_new",
					}),
				});
			globalThis.fetch = fetchMock;

			const resultPromise = adapter.refreshAccessToken();
			// 1回目失敗後のバックオフ (1s) を進める
			await vi.advanceTimersByTimeAsync(1000);

			const result = await resultPromise;

			expect(result).not.toBeNull();
			expect(result?.accessToken).toBe("gho_retry_success");
		});

		it("3回全失敗 → NetworkError を throw", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
			// リトライのバックオフ delay を進める (1s + 2s)
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			const error = await errorPromise;

			expect(error).toBeInstanceOf(NetworkError);
		});

		it("429 レスポンスに対してリトライせず即座に RateLimitError を throw する", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 429,
				headers: { get: vi.fn().mockReturnValue(null) },
			});

			const error = await adapter.refreshAccessToken().catch((e: unknown) => e);

			// 429 は即 throw でリトライしない (Rate Limit 悪化防止)
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			expect(error).toBeInstanceOf(RateLimitError);
		});

		it("リトライ間に指数バックオフが適用される (1s → 2s)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

			const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);

			// 初回リトライ前: fetch は1回呼ばれている
			await vi.advanceTimersByTimeAsync(0);
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);

			// 1秒経過: 2回目の試行が実行される
			await vi.advanceTimersByTimeAsync(1000);
			expect(globalThis.fetch).toHaveBeenCalledTimes(2);

			// さらに2秒経過: 3回目の試行が実行される
			await vi.advanceTimersByTimeAsync(2000);
			expect(globalThis.fetch).toHaveBeenCalledTimes(3);

			await errorPromise;
		});

		it("1回目 SyntaxError (JSON パースエラー)、2回目成功 → トークンを返す", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			const fetchMock = vi
				.fn()
				// 1回目: CDN がHTMLを返し JSON パースに失敗
				.mockResolvedValueOnce({
					ok: true,
					json: async () => {
						throw new SyntaxError("Unexpected token '<' at position 0");
					},
				})
				// 2回目: 成功
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						access_token: "gho_syntax_retry_success",
						token_type: "bearer",
						scope: "repo",
						expires_in: 3600,
						refresh_token: "ghr_syntax_retry_new",
					}),
				});
			globalThis.fetch = fetchMock;

			const resultPromise = adapter.refreshAccessToken();
			// 1回目失敗後のバックオフ (1s) を進める
			await vi.advanceTimersByTimeAsync(1000);

			const result = await resultPromise;

			expect(result).not.toBeNull();
			expect(result?.accessToken).toBe("gho_syntax_retry_success");
			expect(globalThis.fetch).toHaveBeenCalledTimes(2);
		});

		it("3回全て SyntaxError → NetworkError を throw", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => {
					throw new SyntaxError("Unexpected token '<' at position 0");
				},
			});

			const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
			// リトライのバックオフ delay を進める (1s + 2s)
			await vi.advanceTimersByTimeAsync(1000);
			await vi.advanceTimersByTimeAsync(2000);

			const error = await errorPromise;

			expect(error).toBeInstanceOf(NetworkError);
			expect(globalThis.fetch).toHaveBeenCalledTimes(3);
		});
	});

	describe("getToken — 並行呼び出し排他制御", () => {
		it("getToken を同時に2回呼んだとき、fetch が1回しか呼ばれない", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			const bufferZoneToken: AuthToken = {
				...MOCK_TOKEN_WITH_REFRESH,
				expiresAt: now + 2 * 60 * 1000, // バッファ圏内 → リフレッシュ発動
			};
			mockStorage.get.mockResolvedValue(bufferZoneToken);

			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "gho_concurrent_result",
					token_type: "bearer",
					scope: "repo",
					expires_in: 3600,
					refresh_token: "ghr_concurrent_new",
				}),
			});

			// 同時に2回呼ぶ
			const promise1 = adapter.getToken();
			const promise2 = adapter.getToken();

			const [result1, result2] = await Promise.all([promise1, promise2]);

			// fetch は1回しか呼ばれない (排他制御: refreshPromise の共有)
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			// 両方同じ結果を返す
			expect(result1?.accessToken).toBe("gho_concurrent_result");
			expect(result2?.accessToken).toBe("gho_concurrent_result");
		});
	});

	describe("performRefresh — バリデーション失敗", () => {
		it("refresh レスポンスの access_token が空の場合、null を返す (リトライされない)", async () => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

			const now = Date.now();
			const bufferZoneToken: AuthToken = {
				...MOCK_TOKEN_WITH_REFRESH,
				expiresAt: now + 2 * 60 * 1000,
			};
			mockStorage.get.mockResolvedValue(bufferZoneToken);

			// access_token が空文字 → validateTokenData で AuthError throw → 回復不能
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "",
					token_type: "bearer",
					scope: "repo",
				}),
			});

			const result = await adapter.getToken();

			// バリデーション失敗は回復不能エラーとして null → clearToken
			expect(result).toBeNull();
			// リトライされない: fetch は1回のみ
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			expect(mockStorage.remove).toHaveBeenCalledWith("github_auth_token");
		});
	});
});

// ============================================================
// Issue #108: verification_uri 検証、cause 保持、dispose()
// ============================================================

describe("ChromeIdentityAdapter — verification_uri validation (Issue #108)", () => {
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
		resetChromeMock();
		globalThis.fetch = originalFetch;
	});

	it("should accept valid verification_uri (https://github.com/login/device)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
				user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
				verification_uri: "https://github.com/login/device",
				expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
				interval: MOCK_DEVICE_CODE_RESPONSE.interval,
			}),
		});

		const result = await adapter.requestDeviceCode();
		expect(result.verificationUri).toBe("https://github.com/login/device");
	});

	it("should reject verification_uri with userinfo-based URL bypass (github.com@evil.com)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
				user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
				verification_uri: "https://github.com@evil.com/",
				expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
				interval: MOCK_DEVICE_CODE_RESPONSE.interval,
			}),
		});

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("device_code_validation_failed");
	});

	it("should reject verification_uri pointing to a non-GitHub domain", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
				user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
				verification_uri: "https://evil.com/phish",
				expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
				interval: MOCK_DEVICE_CODE_RESPONSE.interval,
			}),
		});

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("device_code_validation_failed");
	});

	it("should reject verification_uri using HTTP instead of HTTPS", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
				user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
				verification_uri: "http://github.com/login/device",
				expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
				interval: MOCK_DEVICE_CODE_RESPONSE.interval,
			}),
		});

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("device_code_validation_failed");
	});

	it("should reject verification_uri with a spoofed subdomain (github.com.evil.com)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				device_code: MOCK_DEVICE_CODE_RESPONSE.deviceCode,
				user_code: MOCK_DEVICE_CODE_RESPONSE.userCode,
				verification_uri: "https://github.com.evil.com/",
				expires_in: MOCK_DEVICE_CODE_RESPONSE.expiresIn,
				interval: MOCK_DEVICE_CODE_RESPONSE.interval,
			}),
		});

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("device_code_validation_failed");
	});
});

describe("ChromeIdentityAdapter — AuthError cause preservation (Issue #108)", () => {
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
		resetChromeMock();
		globalThis.fetch = originalFetch;
	});

	it("should preserve original error as cause when requestDeviceCode fetch rejects", async () => {
		const originalError = new TypeError("Failed to fetch");
		globalThis.fetch = vi.fn().mockRejectedValue(originalError);

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).cause).toBeInstanceOf(Error);
		expect(((error as AuthError).cause as Error).message).toBe(originalError.message);
	});

	it("should preserve original error as cause when pollForToken fetch rejects", async () => {
		const originalError = new TypeError("Network error");
		globalThis.fetch = vi.fn().mockRejectedValue(originalError);

		const error = await adapter
			.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).cause).toBeInstanceOf(Error);
		expect(((error as AuthError).cause as Error).message).toBe(originalError.message);
	});

	it("should NOT include cause when requestDeviceCode gets HTTP error response (ok: false)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		const error = await adapter.requestDeviceCode().catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("device_code_request_failed");
		expect((error as AuthError).cause).toBeUndefined();
	});

	it("should NOT include cause when pollForToken gets HTTP error response (ok: false)", async () => {
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
		});

		const error = await adapter
			.pollForToken(MOCK_DEVICE_CODE_RESPONSE.deviceCode)
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AuthError);
		expect((error as AuthError).code).toBe("token_exchange_failed");
		expect((error as AuthError).cause).toBeUndefined();
	});
});

describe("ChromeIdentityAdapter — dispose() (Issue #108)", () => {
	let adapter: ChromeIdentityAdapter;
	let mockStorage: ReturnType<typeof createMockStorage>;

	beforeEach(() => {
		setupChromeMock();
		mockStorage = createMockStorage();
		mockStorage.set.mockResolvedValue(undefined);
		mockStorage.remove.mockResolvedValue(undefined);
		adapter = new ChromeIdentityAdapter(mockStorage, TEST_CONFIG);
	});

	afterEach(() => {
		resetChromeMock();
	});

	it("should call chrome.storage.onChanged.removeListener on dispose()", () => {
		const chromeMock = getChromeMock();

		adapter.dispose();

		expect(chromeMock.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);
	});

	it("should be idempotent — calling dispose() twice does not throw", () => {
		adapter.dispose();
		expect(() => adapter.dispose()).not.toThrow();
	});

	it("should not update cache after dispose() when storage change fires", async () => {
		// まずキャッシュを初期化（authenticated = true にする）
		mockStorage.get.mockResolvedValue(MOCK_TOKEN);
		await adapter.isAuthenticated();

		const chromeMock = getChromeMock();
		const listener = chromeMock.storage.onChanged.addListener.mock.calls[0][0] as (
			changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
			areaName: string,
		) => void;

		// dispose 呼び出し
		adapter.dispose();

		// dispose 後にストレージ変更を発火（トークン削除）
		listener({ github_auth_token: { oldValue: MOCK_TOKEN } }, "local");

		// キャッシュが更新されていないことを確認（true のまま）
		mockStorage.get.mockClear();
		mockStorage.get.mockImplementation(() => {
			throw new Error("storage.get should not be called when cache is populated");
		});

		const result = await adapter.isAuthenticated();
		expect(result).toBe(true);
		expect(mockStorage.get).not.toHaveBeenCalled();
	});
});

// ============================================================
// Issue #116: performRefresh サイレントフォールバック改善
// ============================================================

describe("Issue #116: performRefresh サイレントフォールバック改善", () => {
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
		vi.unstubAllEnvs();
		resetChromeMock();
		globalThis.fetch = originalFetch;
	});

	it("429 が返った場合、リトライせず即座に RateLimitError が throw される", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const error = await adapter.refreshAccessToken().catch((e: unknown) => e);

		// 429 は即 throw。リトライしない (Rate Limit 悪化防止)
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(error).toBeInstanceOf(RateLimitError);
		// NetworkError のサブクラスだが、instanceof RateLimitError で区別できること
		expect(error).toBeInstanceOf(NetworkError);
	});

	it("429 + Retry-After: 120 → retryAfterMs が 120000 になる", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue("120") },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(RateLimitError);
		expect((error as RateLimitError).retryAfterMs).toBe(120000);
	});

	it("429 + Retry-After なし → retryAfterMs がデフォルト 60000", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(RateLimitError);
		expect((error as RateLimitError).retryAfterMs).toBe(60000);
	});

	it("429 全リトライ失敗 + 有効期限内 → clearToken されずトークン返却", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		// バッファ圏内 (5分前) だが実期限 (2分後) はまだ有効 → リフレッシュ発動するが isTokenStillValid は true
		const validToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now + 2 * 60 * 1000,
		};
		mockStorage.get.mockResolvedValue(validToken);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const resultPromise = adapter.getToken();
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const result = await resultPromise;

		expect(result).not.toBeNull();
		expect(result?.accessToken).toBe(validToken.accessToken);
		// clearToken が呼ばれないことを検証
		expect(mockStorage.remove).not.toHaveBeenCalled();
	});

	it("RateLimitError + 期限切れ → null を返すが clearToken しない (再認証ループ防止)", async () => {
		// NetworkError + 期限切れ は clearToken するが、
		// RateLimitError + 期限切れ は clearToken しない。
		// この対比が RateLimitError 固有のハンドリングの根拠。
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const expiredToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now - 1000,
		};
		mockStorage.get.mockResolvedValue(expiredToken);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const resultPromise = adapter.getToken();
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const result = await resultPromise;

		expect(result).toBeNull();
		// RateLimitError の場合は clearToken しない (再認証ループ防止)
		expect(mockStorage.remove).not.toHaveBeenCalled();
	});

	it("NetworkError + 期限切れ → clearToken する (RateLimitError との対比)", async () => {
		// RateLimitError は一時的な制限なので clearToken しないが、
		// 通常の NetworkError (非429) + 期限切れ は clearToken する。
		// この対比テストで RateLimitError 固有のハンドリングを検証する。
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		const now = Date.now();
		const expiredToken: AuthToken = {
			...MOCK_TOKEN_WITH_REFRESH,
			expiresAt: now - 1000,
		};
		mockStorage.get.mockResolvedValue(expiredToken);

		// 5xx エラーは NetworkError として扱われる (429 とは異なる)
		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 503,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const resultPromise = adapter.getToken();
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const result = await resultPromise;

		expect(result).toBeNull();
		// NetworkError (非429) + 期限切れ → clearToken が呼ばれる
		expect(mockStorage.remove).toHaveBeenCalled();
	});

	it("4xx 回復不能エラー時 (HTTP 401) に DEV ログが出力される", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		vi.stubEnv("DEV", true);

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 401,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		// refreshAccessToken は 4xx で null を返す (回復不能)
		const result = await adapter.refreshAccessToken();

		expect(result).toBeNull();
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("401"));

		consoleSpy.mockRestore();
	});

	it("5xx エラー時 (HTTP 500) に DEV ログが出力される", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		vi.stubEnv("DEV", true);

		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 500,
			headers: { get: vi.fn().mockReturnValue(null) },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		await errorPromise;

		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("500"));

		consoleSpy.mockRestore();
	});

	it("429 + Retry-After: 'abc' (非数値) → retryAfterMs がデフォルト 60000 にフォールバック", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue("abc") },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(1000);
		await vi.advanceTimersByTimeAsync(2000);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(RateLimitError);
		// 非数値の Retry-After はパースに失敗し、デフォルト 60000ms にフォールバックする
		expect((error as RateLimitError).retryAfterMs).toBe(60000);
	});

	it("429 + Retry-After: '0' → retryAfterMs がデフォルト 60000 にフォールバック", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue("0") },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(RateLimitError);
		// Retry-After: 0 は parsedRetryAfter > 0 が false → デフォルト 60000
		expect((error as RateLimitError).retryAfterMs).toBe(60000);
	});

	it("429 + Retry-After: '999999999' (超大値) → retryAfterMs が 86400000 (24h) にクランプされる", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

		mockStorage.get.mockResolvedValue(MOCK_TOKEN_WITH_REFRESH);

		globalThis.fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 429,
			headers: { get: vi.fn().mockReturnValue("999999999") },
		});

		const errorPromise = adapter.refreshAccessToken().catch((e: unknown) => e);

		const error = await errorPromise;

		expect(error).toBeInstanceOf(RateLimitError);
		// 超大値は RETRY_AFTER_MAX_MS (24時間 = 86400000ms) にクランプされる
		expect((error as RateLimitError).retryAfterMs).toBe(86400000);
	});
});
