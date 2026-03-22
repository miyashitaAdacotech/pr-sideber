import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createAuthUseCase,
} from "../../../sidepanel/usecase/auth.usecase";
import type { SendMessage } from "../../../domain/ports/message.port";
import type { AuthResponse } from "../../../shared/types/messages";

describe("auth usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn<SendMessage>>;

	beforeEach(() => {
		mockSendMessage = vi.fn<SendMessage>();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("login", () => {
		it("should send AUTH_LOGIN message and resolve on AUTH_SUCCESS", async () => {
			const response: AuthResponse = { type: "AUTH_SUCCESS", authenticated: true };
			mockSendMessage.mockResolvedValue(response);

			const { login } = createAuthUseCase(mockSendMessage);
			await login();

			expect(mockSendMessage).toHaveBeenCalledWith({ type: "AUTH_LOGIN" });
		});

		it("should throw when AUTH_FAILURE is returned", async () => {
			const response: AuthResponse = { type: "AUTH_FAILURE", error: "User denied" };
			mockSendMessage.mockResolvedValue(response);

			const { login } = createAuthUseCase(mockSendMessage);
			await expect(login()).rejects.toThrow("User denied");
		});

		it("should throw when sendMessage returns undefined", async () => {
			mockSendMessage.mockResolvedValue(undefined);

			const { login } = createAuthUseCase(mockSendMessage);
			await expect(login()).rejects.toThrow("No response from background");
		});

		it("should throw when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Extension context invalidated"));

			const { login } = createAuthUseCase(mockSendMessage);
			await expect(login()).rejects.toThrow("Extension context invalidated");
		});
	});

	describe("logout", () => {
		it("should send AUTH_LOGOUT message and resolve", async () => {
			const response: AuthResponse = { type: "AUTH_SUCCESS", authenticated: false };
			mockSendMessage.mockResolvedValue(response);

			const { logout } = createAuthUseCase(mockSendMessage);
			await logout();

			expect(mockSendMessage).toHaveBeenCalledWith({ type: "AUTH_LOGOUT" });
		});

		it("should throw when sendMessage returns undefined", async () => {
			mockSendMessage.mockResolvedValue(undefined);

			const { logout } = createAuthUseCase(mockSendMessage);
			await expect(logout()).rejects.toThrow("No response from background");
		});
	});

	describe("checkAuth", () => {
		it("should return true when authenticated", async () => {
			const response: AuthResponse = { type: "AUTH_STATUS", authenticated: true };
			mockSendMessage.mockResolvedValue(response);

			const { checkAuth } = createAuthUseCase(mockSendMessage);
			const result = await checkAuth();

			expect(result).toBe(true);
			expect(mockSendMessage).toHaveBeenCalledWith({ type: "AUTH_CHECK" });
		});

		it("should return false when not authenticated", async () => {
			const response: AuthResponse = { type: "AUTH_STATUS", authenticated: false };
			mockSendMessage.mockResolvedValue(response);

			const { checkAuth } = createAuthUseCase(mockSendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});

		it("should return false when sendMessage returns undefined", async () => {
			mockSendMessage.mockResolvedValue(undefined);

			const { checkAuth } = createAuthUseCase(mockSendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});

		it("should return false when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Extension context invalidated"));

			const { checkAuth } = createAuthUseCase(mockSendMessage);
			const result = await checkAuth();

			expect(result).toBe(false);
		});
	});
});
