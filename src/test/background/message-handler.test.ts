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
		expect(response.ok).toBe(false);
		if (!response.ok) {
			expect(response.error.code).toBe("AUTH_LOGOUT_ERROR");
			expect(response.error.message).toContain("Logout failed");
			expect(response.error.message).toContain("Storage error");
		}
	});

	it("should include error details in error response for debugging", async () => {
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
			expect(response.error.message).toContain("Device code request failed");
			expect(response.error.message).toContain("GitHub API internal error");
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

	describe("UPDATE_BADGE", () => {
		let mockBadge: { updateBadge: ReturnType<typeof vi.fn> };

		beforeEach(() => {
			mockBadge = { updateBadge: vi.fn().mockResolvedValue(undefined) };
			// badge は未実装のフィールド。RED フェーズでは型定義を変更しないため cast で追加する
			services = { auth: mockAuth, badge: mockBadge } as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		// NOTE: RED フェーズでは MESSAGE_TYPES に UPDATE_BADGE がないため isRequestMessage で弾かれタイムアウトで失敗する。GREEN フェーズで MESSAGE_TYPES 拡張後に正しい理由で失敗→通過する
		it("should call badge.updateBadge with reviewRequestCount", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "UPDATE_BADGE", payload: { reviewRequestCount: 3 } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockBadge.updateBadge).toHaveBeenCalledWith(3);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		// NOTE: RED フェーズでは MESSAGE_TYPES に UPDATE_BADGE がないため isRequestMessage で弾かれタイムアウトで失敗する。GREEN フェーズで MESSAGE_TYPES 拡張後に正しい理由で失敗→通過する
		it("should respond with error when badge.updateBadge throws", async () => {
			mockBadge.updateBadge.mockRejectedValue(new Error("Badge update failed"));
			const sendResponse = vi.fn();

			handler(
				{ type: "UPDATE_BADGE", payload: { reviewRequestCount: 5 } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("UPDATE_BADGE_ERROR");
		});

		// NOTE: RED フェーズでは MESSAGE_TYPES に UPDATE_BADGE がないため isRequestMessage で弾かれタイムアウトで失敗する。GREEN フェーズで MESSAGE_TYPES 拡張後に正しい理由で失敗→通過する
		it("should respond with error when reviewRequestCount is negative", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "UPDATE_BADGE", payload: { reviewRequestCount: -1 } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
		});

		// NOTE: RED フェーズでは MESSAGE_TYPES に UPDATE_BADGE がないため isRequestMessage で弾かれタイムアウトで失敗する。GREEN フェーズで MESSAGE_TYPES 拡張後に正しい理由で失敗→通過する
		it("should respond with error when payload is missing", async () => {
			const sendResponse = vi.fn();

			handler({ type: "UPDATE_BADGE" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
		});
	});

	describe("NAVIGATE_TO_PR", () => {
		let mockTabNavigation: {
			navigateCurrentTab: ReturnType<typeof vi.fn>;
			findExistingPrTab: ReturnType<typeof vi.fn>;
			activateTab: ReturnType<typeof vi.fn>;
			openNewTab: ReturnType<typeof vi.fn>;
			getCurrentTabUrl: ReturnType<typeof vi.fn>;
			getTabUrl: ReturnType<typeof vi.fn>;
			navigateTabToUrl: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockTabNavigation = {
				navigateCurrentTab: vi.fn().mockResolvedValue(undefined),
				findExistingPrTab: vi.fn().mockResolvedValue(null),
				activateTab: vi.fn().mockResolvedValue(undefined),
				openNewTab: vi.fn().mockResolvedValue(undefined),
				getCurrentTabUrl: vi.fn().mockResolvedValue(null),
				getTabUrl: vi.fn().mockResolvedValue(null),
				navigateTabToUrl: vi.fn().mockResolvedValue(undefined),
			};
			services = {
				auth: mockAuth,
				tabNavigation: mockTabNavigation,
			} as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		it("should open new tab via tab reuse flow for PR URL", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/42" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.findExistingPrTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/42",
			);
			expect(mockTabNavigation.openNewTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/42",
			);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should respond with success when navigation succeeds", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/1" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(true);
		});

		it("should respond with error when openNewTab throws", async () => {
			mockTabNavigation.openNewTab.mockRejectedValue(new Error("Tab creation failed"));
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/42" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("NAVIGATE_TO_PR_ERROR");
		});

		it("should respond with error when payload is missing", async () => {
			const sendResponse = vi.fn();

			handler({ type: "NAVIGATE_TO_PR" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
		});

		it("should respond with error when url does not start with https://github.com/", async () => {
			const sendResponse = vi.fn();
			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "javascript:alert(1)" } },
				createTrustedSender(),
				sendResponse,
			);
			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});
			const response = sendResponse.mock.calls[0][0];
			expect(response.ok).toBe(false);
			expect(response.error.code).toBe("NAVIGATE_TO_PR_ERROR");
		});
	});

	describe("NAVIGATE_TO_PR (tab reuse)", () => {
		let mockTabNavigation: {
			navigateCurrentTab: ReturnType<typeof vi.fn>;
			findExistingPrTab: ReturnType<typeof vi.fn>;
			activateTab: ReturnType<typeof vi.fn>;
			openNewTab: ReturnType<typeof vi.fn>;
			getCurrentTabUrl: ReturnType<typeof vi.fn>;
			getTabUrl: ReturnType<typeof vi.fn>;
			navigateTabToUrl: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockTabNavigation = {
				navigateCurrentTab: vi.fn().mockResolvedValue(undefined),
				findExistingPrTab: vi.fn().mockResolvedValue(null),
				activateTab: vi.fn().mockResolvedValue(undefined),
				openNewTab: vi.fn().mockResolvedValue(undefined),
				getCurrentTabUrl: vi.fn().mockResolvedValue(null),
				getTabUrl: vi.fn().mockResolvedValue(null),
				navigateTabToUrl: vi.fn().mockResolvedValue(undefined),
			};
			services = {
				auth: mockAuth,
				tabNavigation: mockTabNavigation,
			} as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		it("should activate existing tab when a matching PR tab is found", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			// PR TOP にいるので navigate しない
			mockTabNavigation.getTabUrl.mockResolvedValue("https://github.com/owner/repo/pull/10");
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.findExistingPrTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/10",
			);
			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).not.toHaveBeenCalled();
			expect(mockTabNavigation.openNewTab).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should open new tab when no matching PR tab exists", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(null);
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.findExistingPrTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/10",
			);
			expect(mockTabNavigation.openNewTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/10",
			);
			expect(mockTabNavigation.activateTab).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should fallback to openNewTab when activateTab fails (TOCTOU)", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.activateTab.mockRejectedValue(new Error("Tab not found"));
			const sendResponse = vi.fn();
			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);
			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});
			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.openNewTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/pull/10",
			);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should open new tab directly when URL is not a PR URL", async () => {
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/issues/5" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.findExistingPrTab).not.toHaveBeenCalled();
			expect(mockTabNavigation.openNewTab).toHaveBeenCalledWith(
				"https://github.com/owner/repo/issues/5",
			);
		});
	});

	describe("NAVIGATE_TO_PR (smart navigation to PR top)", () => {
		let mockTabNavigation: {
			navigateCurrentTab: ReturnType<typeof vi.fn>;
			findExistingPrTab: ReturnType<typeof vi.fn>;
			activateTab: ReturnType<typeof vi.fn>;
			openNewTab: ReturnType<typeof vi.fn>;
			getCurrentTabUrl: ReturnType<typeof vi.fn>;
			getTabUrl: ReturnType<typeof vi.fn>;
			navigateTabToUrl: ReturnType<typeof vi.fn>;
		};

		beforeEach(() => {
			mockTabNavigation = {
				navigateCurrentTab: vi.fn().mockResolvedValue(undefined),
				findExistingPrTab: vi.fn().mockResolvedValue(null),
				activateTab: vi.fn().mockResolvedValue(undefined),
				openNewTab: vi.fn().mockResolvedValue(undefined),
				getCurrentTabUrl: vi.fn().mockResolvedValue(null),
				getTabUrl: vi.fn().mockResolvedValue(null),
				navigateTabToUrl: vi.fn().mockResolvedValue(undefined),
			};
			services = {
				auth: mockAuth,
				tabNavigation: mockTabNavigation,
			} as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		it("should activate tab and navigate to PR top when existing tab is on a sub-page", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.getTabUrl.mockResolvedValue("https://github.com/owner/repo/pull/10/files");
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).toHaveBeenCalledWith(
				42,
				"https://github.com/owner/repo/pull/10",
			);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should activate tab without navigating when existing tab is already on PR top", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.getTabUrl.mockResolvedValue("https://github.com/owner/repo/pull/10");
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should activate tab without navigating when getTabUrl returns null (fallback)", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.getTabUrl.mockResolvedValue(null);
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should not open new tab when navigateTabToUrl fails after activateTab succeeds", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.getTabUrl.mockResolvedValue("https://github.com/owner/repo/pull/10/files");
			mockTabNavigation.navigateTabToUrl.mockRejectedValue(new Error("Tab update failed"));
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).toHaveBeenCalled();
			expect(mockTabNavigation.openNewTab).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});

		it("should activate tab without navigating when getTabUrl rejects", async () => {
			mockTabNavigation.findExistingPrTab.mockResolvedValue(42);
			mockTabNavigation.getTabUrl.mockRejectedValue(new Error("Tab disappeared"));
			const sendResponse = vi.fn();

			handler(
				{ type: "NAVIGATE_TO_PR", payload: { url: "https://github.com/owner/repo/pull/10" } },
				createTrustedSender(),
				sendResponse,
			);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockTabNavigation.activateTab).toHaveBeenCalledWith(42);
			expect(mockTabNavigation.navigateTabToUrl).not.toHaveBeenCalled();
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});
	});

	describe("FETCH_EPIC_TREE (cleanupClosedIssues セッション保持)", () => {
		let mockIssueApi: { fetchIssues: ReturnType<typeof vi.fn> };
		let mockGithubApi: { fetchPullRequests: ReturnType<typeof vi.fn> };
		let mockEpicProcessor: { processEpicTree: ReturnType<typeof vi.fn> };
		let mockClaudeSessionWatcher: {
			cleanupClosedIssues: ReturnType<typeof vi.fn>;
			getSessions: ReturnType<typeof vi.fn>;
		};

		/** GraphQL レスポンスの Issue edges を生成するヘルパー */
		function makeIssuesJson(issueNumbers: readonly number[]): string {
			return JSON.stringify({
				data: {
					issues: {
						edges: issueNumbers.map((n) => ({ node: { number: n } })),
					},
				},
			});
		}

		beforeEach(() => {
			mockIssueApi = { fetchIssues: vi.fn() };
			mockGithubApi = {
				fetchPullRequests: vi.fn().mockResolvedValue({ rawJson: "{}", hasMore: false }),
			};
			mockEpicProcessor = {
				processEpicTree: vi.fn().mockResolvedValue("mock-tree"),
			};
			mockClaudeSessionWatcher = {
				cleanupClosedIssues: vi.fn().mockResolvedValue(undefined),
				getSessions: vi.fn().mockResolvedValue({}),
			};
			services = {
				auth: mockAuth,
				issueApi: mockIssueApi,
				githubApi: mockGithubApi,
				epicProcessor: mockEpicProcessor,
				claudeSessionWatcher: mockClaudeSessionWatcher,
			} as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		it("cleanupClosedIssues にセッション保持済み Issue 番号が含まれた openNumbers が渡される", async () => {
			// GraphQL 結果には Issue 10, 20 のみ含まれる
			mockIssueApi.fetchIssues.mockResolvedValue(makeIssuesJson([10, 20]));
			// ストレージにはセッションが Issue 2375 に紐付いている
			mockClaudeSessionWatcher.getSessions.mockResolvedValue({
				"2375": [
					{
						sessionUrl: "https://claude.ai/code/session_abc",
						title: "Investigate issue 2375",
						issueNumber: 2375,
						detectedAt: "2026-04-06T00:00:00Z",
						isLive: false,
					},
				],
			});

			const sendResponse = vi.fn();
			handler({ type: "FETCH_EPIC_TREE" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockClaudeSessionWatcher.cleanupClosedIssues).toHaveBeenCalled();
			const openNumbers: Set<number> =
				mockClaudeSessionWatcher.cleanupClosedIssues.mock.calls[0][0];
			// GraphQL の 10, 20 に加えて、セッション保持中の 2375 も含まれている
			expect(openNumbers.has(10)).toBe(true);
			expect(openNumbers.has(20)).toBe(true);
			expect(openNumbers.has(2375)).toBe(true);
		});

		it("セッション保持済みの Issue が GraphQL 結果に含まれなくても削除されない", async () => {
			// GraphQL 結果には Issue 10 のみ
			mockIssueApi.fetchIssues.mockResolvedValue(makeIssuesJson([10]));
			// ストレージには Issue 500 のセッションがある
			mockClaudeSessionWatcher.getSessions.mockResolvedValue({
				"500": [
					{
						sessionUrl: "https://claude.ai/code/session_xyz",
						title: "Inv #500 debug",
						issueNumber: 500,
						detectedAt: "2026-04-06T00:00:00Z",
						isLive: true,
					},
				],
			});

			const sendResponse = vi.fn();
			handler({ type: "FETCH_EPIC_TREE" }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockClaudeSessionWatcher.cleanupClosedIssues).toHaveBeenCalled();
			const openNumbers: Set<number> =
				mockClaudeSessionWatcher.cleanupClosedIssues.mock.calls[0][0];
			// セッション保持中の Issue 500 が openNumbers に含まれるため削除されない
			expect(openNumbers.has(500)).toBe(true);
			expect(openNumbers.has(10)).toBe(true);
		});
	});

	describe("OPEN_WORKSPACE", () => {
		let mockWorkspaceOpen: { openWorkspace: ReturnType<typeof vi.fn> };

		beforeEach(() => {
			mockWorkspaceOpen = { openWorkspace: vi.fn().mockResolvedValue(undefined) };
			services = {
				auth: mockAuth,
				workspaceOpen: mockWorkspaceOpen,
			} as unknown as AppServices;
			handler = createMessageHandler(services);
		});

		it("should call workspaceOpen.openWorkspace with payload", async () => {
			const sendResponse = vi.fn();
			const payload = {
				issueNumber: 42,
				issueUrl: "https://github.com/owner/repo/issues/42",
				prUrl: "https://github.com/owner/repo/pull/123",
				sessionUrl: "https://claude.ai/code/session-1",
				senderWindowId: 100,
			};

			handler({ type: "OPEN_WORKSPACE", payload }, createTrustedSender(), sendResponse);

			await vi.waitFor(() => {
				expect(sendResponse).toHaveBeenCalled();
			});

			expect(mockWorkspaceOpen.openWorkspace).toHaveBeenCalledWith(payload);
			const response = sendResponse.mock.calls[0][0];
			expect(response).toEqual({ ok: true, data: undefined });
		});
	});
});
