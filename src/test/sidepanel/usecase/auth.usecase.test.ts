import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { login, logout, checkAuth } from "../../../sidepanel/usecase/auth.usecase";
import type { AuthResponse } from "../../../shared/types/messages";
import { setupChromeMock, resetChromeMock, getChromeMock } from "../../mocks/chrome.mock";

describe("auth usecase", () => {
	beforeEach(() => {
		setupChromeMock();
	});

	afterEach(() => {
		resetChromeMock();
	});

	describe("login", () => {
		it("should send AUTH_LOGIN message and resolve on AUTH_SUCCESS", async () => {
			const mock = getChromeMock();
			const response: AuthResponse = { type: "AUTH_SUCCESS", authenticated: true };
			mock.runtime.sendMessage.mockResolvedValue(response);

			await login();

			expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: "AUTH_LOGIN" });
		});

		it("should throw when AUTH_FAILURE is returned", async () => {
			const mock = getChromeMock();
			const response: AuthResponse = { type: "AUTH_FAILURE", error: "User denied" };
			mock.runtime.sendMessage.mockResolvedValue(response);

			await expect(login()).rejects.toThrow("User denied");
		});
	});

	describe("logout", () => {
		it("should send AUTH_LOGOUT message and resolve", async () => {
			const mock = getChromeMock();
			const response: AuthResponse = { type: "AUTH_SUCCESS", authenticated: true };
			mock.runtime.sendMessage.mockResolvedValue(response);

			await logout();

			expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: "AUTH_LOGOUT" });
		});
	});

	describe("checkAuth", () => {
		it("should return true when authenticated", async () => {
			const mock = getChromeMock();
			const response: AuthResponse = { type: "AUTH_STATUS", authenticated: true };
			mock.runtime.sendMessage.mockResolvedValue(response);

			const result = await checkAuth();

			expect(result).toBe(true);
			expect(mock.runtime.sendMessage).toHaveBeenCalledWith({ type: "AUTH_CHECK" });
		});

		it("should return false when not authenticated", async () => {
			const mock = getChromeMock();
			const response: AuthResponse = { type: "AUTH_STATUS", authenticated: false };
			mock.runtime.sendMessage.mockResolvedValue(response);

			const result = await checkAuth();

			expect(result).toBe(false);
		});
	});
});
