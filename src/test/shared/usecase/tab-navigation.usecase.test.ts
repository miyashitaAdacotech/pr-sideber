import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendMessage } from "../../../shared/ports/message.port";
import { createTabNavigationUseCase } from "../../../shared/usecase/tab-navigation.usecase";

describe("tab-navigation usecase", () => {
	let mockSendMessage: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockSendMessage = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("navigateToPr", () => {
		it("should send NAVIGATE_TO_PR message with the url", async () => {
			mockSendMessage.mockResolvedValue({ ok: true, data: undefined });

			const useCase = createTabNavigationUseCase(mockSendMessage as SendMessage);
			await useCase.navigateToPr("https://github.com/owner/repo/pull/42");

			expect(mockSendMessage).toHaveBeenCalledWith("NAVIGATE_TO_PR", {
				url: "https://github.com/owner/repo/pull/42",
			});
		});

		it("should throw when response is not ok", async () => {
			mockSendMessage.mockResolvedValue({
				ok: false,
				error: { code: "NAVIGATE_TO_PR_ERROR", message: "Navigation failed" },
			});

			const useCase = createTabNavigationUseCase(mockSendMessage as SendMessage);

			await expect(useCase.navigateToPr("https://github.com/owner/repo/pull/42")).rejects.toThrow(
				"Navigation failed",
			);
		});

		it("should propagate network error when sendMessage rejects", async () => {
			mockSendMessage.mockRejectedValue(new Error("Extension context invalidated"));

			const useCase = createTabNavigationUseCase(mockSendMessage as SendMessage);

			await expect(useCase.navigateToPr("https://github.com/owner/repo/pull/42")).rejects.toThrow(
				"Extension context invalidated",
			);
		});
	});
});
