import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceCodeResponse, PollResult } from "../../../domain/types/auth";
import type { SendMessage } from "../../../shared/ports/message.port";
import type { ResponseMessage } from "../../../shared/types/messages";
import { createAuthUseCase } from "../../../shared/usecase/auth.usecase";

describe("auth usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockSendMessage = vi.fn();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("requestDeviceCode", () => {
		it("should send AUTH_DEVICE_CODE message and return DeviceCodeResponse on success", async () => {
			const deviceCodeData: DeviceCodeResponse = {
				deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5",
				userCode: "WDJB-MJHT",
				verificationUri: "https://github.com/login/device",
				expiresIn: 900,
				interval: 5,
			};
			const response = { ok: true as const, data: deviceCodeData };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const result = await useCase.requestDeviceCode();

			expect(mockSendMessage).toHaveBeenCalledWith("AUTH_DEVICE_CODE");
			expect(result).toEqual(deviceCodeData);
		});

		it("should throw with server error message when AUTH_DEVICE_CODE response is not ok", async () => {
			const response = {
				ok: false as const,
				error: { code: "AUTH_DEVICE_CODE_ERROR", message: "Device code request failed" },
			};
			mockSendMessage.mockResolvedValue(response);

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			await expect(useCase.requestDeviceCode()).rejects.toThrow("Device code request failed");
		});

		it("should propagate network error message when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Extension context invalidated"));

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			await expect(useCase.requestDeviceCode()).rejects.toThrow("Extension context invalidated");
		});
	});

	describe("waitForAuthorization", () => {
		it("should send AUTH_DEVICE_POLL message with deviceCode and resolve on success", async () => {
			const successResult: PollResult = {
				status: "success",
				token: { accessToken: "test-token", tokenType: "bearer", scope: "repo" },
			};
			const response = { ok: true as const, data: successResult };
			mockSendMessage.mockResolvedValue(response);

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase.waitForAuthorization("device-code-123", 5, 900);

			// interval (5秒) 分進める
			await vi.advanceTimersByTimeAsync(5000);

			await promise;

			expect(mockSendMessage).toHaveBeenCalledWith("AUTH_DEVICE_POLL", {
				deviceCode: "device-code-123",
			});
		});

		it("should throw with server error message when AUTH_DEVICE_POLL response is not ok", async () => {
			const response = {
				ok: false as const,
				error: { code: "AUTH_DEVICE_POLL_ERROR", message: "Device flow expired" },
			};
			mockSendMessage.mockResolvedValue(response);

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900)
				.catch((e: unknown) => e);

			await vi.advanceTimersByTimeAsync(5000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Device flow expired");
		});

		it("should reject after exhausting retries even without onStateChange callback", async () => {
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900)
				.catch((e: unknown) => e);

			// interval (5秒) + リトライバックオフ (500ms + 1000ms) で全部失敗
			await vi.advanceTimersByTimeAsync(6500);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Network error");
			// 3回呼ばれる (リトライ上限)
			expect(mockSendMessage).toHaveBeenCalledTimes(3);
		});

		it("should retry once on transient network error then succeed", async () => {
			// リトライ中は polling 状態を維持し、追加の中間状態通知は行わない
			const successResult: PollResult = {
				status: "success",
				token: { accessToken: "test-token", tokenType: "bearer", scope: "repo" },
			};
			mockSendMessage
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({ ok: true as const, data: successResult });

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase.waitForAuthorization("device-code-123", 5, 900, onStateChange);

			// interval (5秒) + リトライバックオフ (500ms)
			await vi.advanceTimersByTimeAsync(5500);

			await promise;

			expect(mockSendMessage).toHaveBeenCalledTimes(2);
			expect(onStateChange).toHaveBeenCalledWith({ phase: "success" });
		});

		it("should retry twice on transient network errors then succeed", async () => {
			// リトライ中は polling 状態を維持し、追加の中間状態通知は行わない
			const successResult: PollResult = {
				status: "success",
				token: { accessToken: "test-token", tokenType: "bearer", scope: "repo" },
			};
			mockSendMessage
				.mockRejectedValueOnce(new Error("Network error"))
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({ ok: true as const, data: successResult });

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase.waitForAuthorization("device-code-123", 5, 900, onStateChange);

			// interval (5秒) + リトライバックオフ (500ms + 1000ms)
			await vi.advanceTimersByTimeAsync(6500);

			await promise;

			expect(mockSendMessage).toHaveBeenCalledTimes(3);
			expect(onStateChange).toHaveBeenCalledWith({ phase: "success" });
		});

		it("should fail after 3 consecutive network errors (retry limit exceeded)", async () => {
			mockSendMessage
				.mockRejectedValueOnce(new Error("fetch failed"))
				.mockRejectedValueOnce(new Error("fetch failed"))
				.mockRejectedValueOnce(new Error("fetch failed"));

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900, onStateChange)
				.catch((e: unknown) => e);

			// interval (5秒) + リトライバックオフ (500ms + 1000ms) を段階的に進める
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(500);
			await vi.advanceTimersByTimeAsync(1000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("fetch failed");
			expect(mockSendMessage).toHaveBeenCalledTimes(3);
		});

		it("should retry on RUNTIME_ERROR response then succeed", async () => {
			const successResult: PollResult = {
				status: "success",
				token: { accessToken: "test-token", tokenType: "bearer", scope: "repo" },
			};
			mockSendMessage
				.mockResolvedValueOnce({
					ok: false as const,
					error: { code: "RUNTIME_ERROR", message: "Service worker restarted" },
				})
				.mockResolvedValueOnce({ ok: true as const, data: successResult });

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase.waitForAuthorization("device-code-123", 5, 900, onStateChange);

			// interval (5秒) + リトライバックオフ (500ms)
			await vi.advanceTimersByTimeAsync(5500);

			await promise;

			expect(mockSendMessage).toHaveBeenCalledTimes(2);
			expect(onStateChange).toHaveBeenCalledWith({ phase: "success" });
		});

		it("should retry on NO_RESPONSE response then succeed", async () => {
			const successResult: PollResult = {
				status: "success",
				token: { accessToken: "test-token", tokenType: "bearer", scope: "repo" },
			};
			mockSendMessage
				.mockResolvedValueOnce({
					ok: false as const,
					error: { code: "NO_RESPONSE", message: "No response from background" },
				})
				.mockResolvedValueOnce({ ok: true as const, data: successResult });

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase.waitForAuthorization("device-code-123", 5, 900, onStateChange);

			// interval (5秒) + リトライバックオフ (500ms)
			await vi.advanceTimersByTimeAsync(5500);

			await promise;

			expect(mockSendMessage).toHaveBeenCalledTimes(2);
			expect(onStateChange).toHaveBeenCalledWith({ phase: "success" });
		});

		it("should fail immediately on non-retryable error response", async () => {
			mockSendMessage.mockResolvedValueOnce({
				ok: false as const,
				error: { code: "AUTH_DEVICE_POLL_ERROR", message: "Invalid device code" },
			});

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900, onStateChange)
				.catch((e: unknown) => e);

			await vi.advanceTimersByTimeAsync(5000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Invalid device code");
			// リトライなし: 1回だけ呼ばれる
			expect(mockSendMessage).toHaveBeenCalledTimes(1);
		});

		it("should expire when deadline is exceeded during retry wait", async () => {
			// expiresIn=2秒, interval=5秒 (実質5秒下限)
			// sendMessage が1回 reject → リトライの wait (interval=5秒) 中に deadline(2秒) を超過 → expired
			mockSendMessage.mockRejectedValueOnce(new Error("Network error"));

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 2, onStateChange)
				.catch((e: unknown) => e);

			// interval (5秒) 経過でポーリング開始 → reject → リトライ wait 中に deadline 超過
			await vi.advanceTimersByTimeAsync(10_000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect(onStateChange).toHaveBeenCalledWith({ phase: "expired" });
		});

		it("should fail after 3 consecutive RUNTIME_ERROR responses (retry limit exceeded)", async () => {
			mockSendMessage
				.mockResolvedValueOnce({
					ok: false as const,
					error: { code: "RUNTIME_ERROR", message: "Service worker restarted" },
				})
				.mockResolvedValueOnce({
					ok: false as const,
					error: { code: "RUNTIME_ERROR", message: "Service worker restarted" },
				})
				.mockResolvedValueOnce({
					ok: false as const,
					error: { code: "RUNTIME_ERROR", message: "Service worker restarted" },
				});

			const onStateChange = vi.fn();
			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900, onStateChange)
				.catch((e: unknown) => e);

			// interval (5秒) + リトライバックオフ (500ms + 1000ms) を段階的に進める
			await vi.advanceTimersByTimeAsync(5000);
			await vi.advanceTimersByTimeAsync(500);
			await vi.advanceTimersByTimeAsync(1000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Service worker restarted");
			expect(mockSendMessage).toHaveBeenCalledTimes(3);
		});
	});

	describe("logout", () => {
		it("should send AUTH_LOGOUT message and resolve on success", async () => {
			const response: ResponseMessage<"AUTH_LOGOUT"> = { ok: true, data: undefined };
			mockSendMessage.mockResolvedValue(response);

			const { logout } = createAuthUseCase(mockSendMessage as SendMessage);
			await logout();

			expect(mockSendMessage).toHaveBeenCalledWith("AUTH_LOGOUT");
		});

		it("should throw when response is not ok", async () => {
			const response: ResponseMessage<"AUTH_LOGOUT"> = {
				ok: false,
				error: { code: "AUTH_LOGOUT_ERROR", message: "Logout failed" },
			};
			mockSendMessage.mockResolvedValue(response);

			const { logout } = createAuthUseCase(mockSendMessage as SendMessage);
			await expect(logout()).rejects.toThrow("Logout failed. Please try again.");
		});
	});

	describe("checkAuth", () => {
		it("should return true when authenticated", async () => {
			const response: ResponseMessage<"AUTH_STATUS"> = {
				ok: true,
				data: { isAuthenticated: true },
			};
			mockSendMessage.mockResolvedValue(response);

			const { checkAuth } = createAuthUseCase(mockSendMessage as SendMessage);
			const result = await checkAuth();

			expect(result).toBe(true);
			expect(mockSendMessage).toHaveBeenCalledWith("AUTH_STATUS");
		});

		it("should return false when not authenticated", async () => {
			const response: ResponseMessage<"AUTH_STATUS"> = {
				ok: true,
				data: { isAuthenticated: false },
			};
			mockSendMessage.mockResolvedValue(response);

			const { checkAuth } = createAuthUseCase(mockSendMessage as SendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});

		it("should return false when response is not ok", async () => {
			const response: ResponseMessage<"AUTH_STATUS"> = {
				ok: false,
				error: {
					code: "AUTH_STATUS_ERROR",
					message: "Failed to check authentication status",
				},
			};
			mockSendMessage.mockResolvedValue(response);

			const { checkAuth } = createAuthUseCase(mockSendMessage as SendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});

		it("should return false when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Extension context invalidated"));

			const { checkAuth } = createAuthUseCase(mockSendMessage as SendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});
	});
});

describe("auth.usecase の依存方向", () => {
	it("DeviceCodeResponse, PollResult を domain/types/auth から直接 import していること", () => {
		const files = import.meta.glob("../../../shared/usecase/auth.usecase.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const matchedPaths = Object.keys(files);
		expect(matchedPaths, "shared/usecase/auth.usecase.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		expect(content).toMatch(
			/import\s+[\s\S]*?\bDeviceCodeResponse\b[\s\S]*?from\s+["'].*domain\/types\/auth["']/,
		);
		expect(content).toMatch(
			/import\s+[\s\S]*?\bPollResult\b[\s\S]*?from\s+["'].*domain\/types\/auth["']/,
		);
	});

	it("shared/types/auth から DeviceCodeResponse, PollResult を import していないこと", () => {
		const files = import.meta.glob("../../../shared/usecase/auth.usecase.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(files), "shared/usecase/auth.usecase.ts が見つかりません").toHaveLength(1);

		const content = Object.values(files)[0]?.default;
		expect(content).toBeDefined();

		// multiline import 文を抽出して禁止シンボルを検証
		const sharedAuthImportPattern =
			/import\s+(?:type\s+)?{([^}]*)}\s+from\s+["'].*shared\/types\/auth["']/g;
		const matches = [...(content?.matchAll(sharedAuthImportPattern) ?? [])];

		for (const match of matches) {
			const importedSymbols = match[1];
			expect(importedSymbols).not.toMatch(/\bDeviceCodeResponse\b/);
			expect(importedSymbols).not.toMatch(/\bPollResult\b/);
		}
	});
});
