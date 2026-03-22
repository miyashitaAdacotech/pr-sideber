import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMessage } from "../../../shared/ports/message.port";
import type { DeviceCodeResponse, PollResult } from "../../../shared/types/auth";
import type { ResponseMessage } from "../../../shared/types/messages";
import { createAuthUseCase } from "../../../sidepanel/usecase/auth.usecase";

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

		it("should throw when sendMessage rejects during poll", async () => {
			mockSendMessage.mockRejectedValue(new Error("Network error"));

			const useCase = createAuthUseCase(mockSendMessage as SendMessage);
			const promise = useCase
				.waitForAuthorization("device-code-123", 5, 900)
				.catch((e: unknown) => e);

			await vi.advanceTimersByTimeAsync(5000);

			const error = await promise;
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe("Network error");
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
