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
		authorize: vi.fn(),
		getToken: vi.fn(),
		clearToken: vi.fn(),
		isAuthenticated: vi.fn(),
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
		const result = handler({ type: "AUTH_LOGIN" }, createTrustedSender(), sendResponse);
		expect(result).toBe(true);
	});

	it("should return false and FORBIDDEN for untrusted sender", () => {
		const sendResponse = vi.fn();
		const result = handler({ type: "AUTH_LOGIN" }, createUntrustedSender(), sendResponse);
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

	it("AUTH_LOGIN: should call auth.authorize() and respond without token", async () => {
		const mockToken = { accessToken: "test-token", tokenType: "bearer", scope: "repo" };
		mockAuth.authorize.mockResolvedValue(mockToken);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGIN" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		expect(mockAuth.authorize).toHaveBeenCalled();
		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_LOGIN">;
		expect(response).toEqual({ ok: true, data: undefined });
	});

	it("AUTH_LOGIN: response should not contain token", async () => {
		const mockToken = { accessToken: "secret-token", tokenType: "bearer", scope: "repo" };
		mockAuth.authorize.mockResolvedValue(mockToken);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGIN" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0];
		expect(response).not.toHaveProperty("data.token");
		expect(JSON.stringify(response)).not.toContain("secret-token");
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

	it("should respond with type-specific error code when auth.authorize() throws", async () => {
		mockAuth.authorize.mockRejectedValue(new Error("Authorization failed"));
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGIN" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_LOGIN">;
		expect(response).toEqual({
			ok: false,
			error: { code: "AUTH_LOGIN_ERROR", message: "Login failed" },
		});
	});

	it("should not leak internal error details in error response", async () => {
		mockAuth.authorize.mockRejectedValue(
			new Error(
				"OAuth token exchange failed: invalid_grant at https://github.com/login/oauth/access_token",
			),
		);
		const sendResponse = vi.fn();

		handler({ type: "AUTH_LOGIN" }, createTrustedSender(), sendResponse);

		await vi.waitFor(() => {
			expect(sendResponse).toHaveBeenCalled();
		});

		const response = sendResponse.mock.calls[0][0] as ResponseMessage<"AUTH_LOGIN">;
		expect(response.ok).toBe(false);
		if (!response.ok) {
			expect(response.error.message).toBe("Login failed");
			expect(response.error.message).not.toContain("OAuth");
			expect(response.error.message).not.toContain("github.com");
		}
	});

	it("should use AUTH_LOGOUT_ERROR code for logout failures", async () => {
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
});
