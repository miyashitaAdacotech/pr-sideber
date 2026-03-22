import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppServices } from "../../background/bootstrap";
import { createMessageHandler } from "../../background/message-handler";
import type { AuthPort } from "../../domain/ports/auth.port";
import type { MessageType, ResponseMessage } from "../../shared/types/messages";
import { getChromeMock, resetChromeMock, setupChromeMock } from "../mocks/chrome.mock";

function createMockAuth(): {
	[K in keyof AuthPort]: ReturnType<typeof vi.fn>;
} {
	return {
		getToken: vi.fn(),
		clearToken: vi.fn(),
		isAuthenticated: vi.fn(),
		requestDeviceCode: vi.fn(),
		pollForToken: vi.fn(),
		refreshAccessToken: vi.fn(),
	};
}

const TRUSTED_EXTENSION_ID = "test-extension-id";

function createTrustedSender(): chrome.runtime.MessageSender {
	return { id: TRUSTED_EXTENSION_ID } as chrome.runtime.MessageSender;
}

function createUntrustedSender(): chrome.runtime.MessageSender {
	return { id: "malicious-extension-id" } as chrome.runtime.MessageSender;
}

describe("createMessageHandler", () => {
	let mockAuth: ReturnType<typeof createMockAuth>;
	let services: AppServices;
	let handler: ReturnType<typeof createMessageHandler>;

	beforeEach(() => {
		setupChromeMock();
		mockAuth = createMockAuth();
		services = { auth: mockAuth } as unknown as AppServices;
		handler = createMessageHandler(services);
	});

	afterEach(() => {
		resetChromeMock();
		vi.restoreAllMocks();
	});

	it("should return true for valid async message from trusted sender", () => {
		const sendResponse = vi.fn();
		const result = handler({ type: "AUTH_LOGOUT" }, createTrustedSender(), sendResponse);
		expect(result).toBe(true);
	});

	it("should return false and FORBIDDEN for untrusted sender", () => {
		const sendResponse = vi.fn();
		const result = handler({ type: "AUTH_LOGOUT" }, createUntrustedSender(), sendResponse);
		expect(result).toBe(false);
		expect(sendResponse).toHaveBeenCalledWith({
			ok: false,
			error: { code: "FORBIDDEN", message: "Untrusted sender" },
		});
	});

	it("should return false for unknown message type without calling sendResponse", () => {
		const sendResponse = vi.fn();
		const result = handler({ type: "INVALID_TYPE" }, createTrustedSender(), sendResponse);
		expect(result).toBe(false);
		expect(sendResponse).not.toHaveBeenCalled();
	});

	it("should return false for non-object message without calling sendResponse", () => {
		const sendResponse = vi.fn();
		const result = handler("not-an-object", createTrustedSender(), sendResponse);
		expect(result).toBe(false);
		expect(sendResponse).not.toHaveBeenCalled();
	});

	it("AUTH_LOGOUT: should call auth.clearToken() and respond with success", async () => {
		mockAuth.clearToken.mockResolvedValue(undefined);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGOUT" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		expect(mockAuth.clearToken).toHaveBeenCalled();
		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_LOGOUT">;
		expect(response).toEqual({ ok: true, data: undefined });
	});

	it("AUTH_STATUS: should call auth.isAuthenticated() and respond with status", async () => {
		mockAuth.isAuthenticated.mockResolvedValue(true);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_STATUS" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		expect(mockAuth.isAuthenticated).toHaveBeenCalled();
		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_STATUS">;
		expect(response).toEqual({ ok: true, data: { isAuthenticated: true } });
	});

	it("should respond with type-specific error code when auth throws", async () => {
		mockAuth.clearToken.mockRejectedValue(new Error("Storage error"));
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGOUT" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_LOGOUT">;
		expect(response).toEqual({
			ok: false,
			error: { code: "AUTH_LOGOUT_ERROR", message: "Logout failed" },
		});
	});

	it("should not leak internal error details in error response", async () => {
		mockAuth.requestDeviceCode.mockRejectedValue(
			new Error("GitHub API internal error at https://github.com/login/device/code"),
		);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_DEVICE_CODE" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_DEVICE_CODE">;
		expect(response.ok).toBe(false);
		if (!response.ok) {
			expect(response.error.message).toBe("Device code request failed");
			expect(response.error.message).not.toContain("github.com");
		}
	});

	describe("AUTH_DEVICE_CODE", () => {
		const MOCK_DEVICE_CODE_RESPONSE = {
			deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5",
			userCode: "WDJB-MJHT",
			verificationUri: "https://github.com/login/device",
			expiresIn: 900,
			interval: 5,
		};

		it("should call auth.requestDeviceCode() and respond with device code data", async () => {
			mockAuth.requestDeviceCode.mockResolvedValue(MOCK_DEVICE_CODE_RESPONSE);
			const sendResponse = vi.fn();

			handler({ type: "AUTH_DEVICE_CODE" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockAuth.requestDeviceCode).toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: MOCK_DEVICE_CODE_RESPONSE });
		});

		it("should respond with error when requestDeviceCode throws", async () => {
			mockAuth.requestDeviceCode.mockRejectedValue(new Error("Device code request failed"));
			const sendResponse = vi.fn();

			handler({ type: "AUTH_DEVICE_CODE" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("AUTH_DEVICE_CODE_ERROR");
		});
	});

	describe("AUTH_DEVICE_POLL", () => {
		it("should call auth.pollForToken() with deviceCode and respond with PollResult", async () => {
			const successResult = {
				status: "success",
				token: { accessToken: "test-token-value", tokenType: "bearer", scope: "repo" },
			};
			mockAuth.pollForToken.mockResolvedValue(successResult);
			const sendResponse = vi.fn();

			handler(
				{
					type: "AUTH_DEVICE_POLL",
					payload: { deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5" },
				},
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockAuth.pollForToken).toHaveBeenCalledWith(
				"3584d83530557fdd1f46af8289938c8ef79f9dc5",
			);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: successResult });
		});

		it("should respond with error when pollForToken throws", async () => {
			mockAuth.pollForToken.mockRejectedValue(new Error("Device flow expired"));
			const sendResponse = vi.fn();

			handler(
				{
					type: "AUTH_DEVICE_POLL",
					payload: { deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5" },
				},
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("AUTH_DEVICE_POLL_ERROR");
		});

		it("should respond with error when deviceCode is too short", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "AUTH_DEVICE_POLL", payload: { deviceCode: "abc" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("AUTH_DEVICE_POLL_ERROR");
			expect(response.error.message).toBe("Invalid device code");
		});

		it("AUTH_DEVICE_POLL response should not contain raw access token in top level", async () => {
			const successResult = {
				status: "success",
				token: { accessToken: "secret-token-value", tokenType: "bearer", scope: "repo" },
			};
			mockAuth.pollForToken.mockResolvedValue(successResult);
			const sendResponse = vi.fn();

			handler(
				{
					type: "AUTH_DEVICE_POLL",
					payload: { deviceCode: "3584d83530557fdd1f46af8289938c8ef79f9dc5" },
				},
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response).not.toHaveProperty("data.accessToken");
		});
	});
});
