import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMessageHandler } from "../../background/message-handler";
import type { AuthPort } from "../../domain/ports/auth.port";
import type { AuthToken } from "../../shared/types/auth";
import { AuthError } from "../../shared/types/auth";
import type { AuthMessage, AuthResponse } from "../../shared/types/messages";
import { setupChromeMock, resetChromeMock, getChromeMock } from "../mocks/chrome.mock";

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

describe("createMessageHandler", () => {
	let mockAuth: ReturnType<typeof createMockAuth>;

	beforeEach(() => {
		setupChromeMock();
		mockAuth = createMockAuth();
	});

	afterEach(() => {
		resetChromeMock();
	});

	it("should register a listener on chrome.runtime.onMessage", () => {
		createMessageHandler(mockAuth);

		const mock = getChromeMock();
		expect(mock.runtime.onMessage.addListener).toHaveBeenCalledOnce();
		expect(mock.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
	});

	describe("AUTH_LOGIN", () => {
		it("should return AUTH_SUCCESS when authorize succeeds", async () => {
			const token: AuthToken = { accessToken: "tok_123", tokenType: "bearer", scope: "repo" };
			mockAuth.authorize.mockResolvedValue(token);

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_LOGIN" };
			const result = listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			expect(result).toBe(true);
			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_SUCCESS", authenticated: true });
		});

		it("should return AUTH_FAILURE when authorize throws", async () => {
			mockAuth.authorize.mockRejectedValue(
				new AuthError("authorization_failed", "User denied access"),
			);

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_LOGIN" };
			listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_FAILURE", error: "User denied access" });
		});
	});

	describe("AUTH_LOGOUT", () => {
		it("should call clearToken and return AUTH_SUCCESS with authenticated: false", async () => {
			mockAuth.clearToken.mockResolvedValue(undefined);

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_LOGOUT" };
			listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			expect(mockAuth.clearToken).toHaveBeenCalledOnce();
			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_SUCCESS", authenticated: false });
		});

		it("should return AUTH_FAILURE when clearToken throws", async () => {
			mockAuth.clearToken.mockRejectedValue(new Error("Storage error"));

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_LOGOUT" };
			listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_FAILURE", error: "Storage error" });
		});
	});

	describe("AUTH_CHECK", () => {
		it("should return AUTH_STATUS with authenticated: true when authenticated", async () => {
			mockAuth.isAuthenticated.mockResolvedValue(true);

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_CHECK" };
			listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_STATUS", authenticated: true });
		});

		it("should return AUTH_STATUS with authenticated: false when not authenticated", async () => {
			mockAuth.isAuthenticated.mockResolvedValue(false);

			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_CHECK" };
			listener(message, { id: getChromeMock().runtime.id }, sendResponse);

			await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

			const response: AuthResponse = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ type: "AUTH_STATUS", authenticated: false });
		});
	});

	describe("sender validation", () => {
		it("should return undefined when sender.id does not match chrome.runtime.id", () => {
			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const message: AuthMessage = { type: "AUTH_LOGIN" };
			const result = listener(message, { id: "malicious-extension-id" }, sendResponse);

			expect(result).toBeUndefined();
			expect(sendResponse).not.toHaveBeenCalled();
		});
	});

	describe("unknown message", () => {
		it("should return undefined for unknown message types", () => {
			createMessageHandler(mockAuth);
			const listener = getChromeMock().runtime.onMessage.addListener.mock.calls[0][0];

			const sendResponse = vi.fn();
			const result = listener({ type: "UNKNOWN_TYPE" }, { id: getChromeMock().runtime.id }, sendResponse);

			expect(result).toBeUndefined();
			expect(sendResponse).not.toHaveBeenCalled();
		});
	});
});
