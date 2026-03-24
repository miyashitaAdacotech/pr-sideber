import { describe, expect, it } from "vitest";
import { MESSAGE_TYPES, isRequestMessage } from "../../../shared/types/messages";

describe("messages", () => {
	describe("MESSAGE_TYPES", () => {
		it("should contain all message types", () => {
			expect(MESSAGE_TYPES).toContain("AUTH_LOGOUT");
			expect(MESSAGE_TYPES).toContain("AUTH_STATUS");
			expect(MESSAGE_TYPES).toContain("AUTH_DEVICE_CODE");
			expect(MESSAGE_TYPES).toContain("AUTH_DEVICE_POLL");
			expect(MESSAGE_TYPES).toContain("FETCH_PRS");
			expect(MESSAGE_TYPES).toContain("UPDATE_BADGE");
			expect(MESSAGE_TYPES).toContain("NAVIGATE_TO_PR");
			expect(MESSAGE_TYPES).toHaveLength(7);
		});
	});

	describe("isRequestMessage", () => {
		it("should return true for valid AUTH_LOGOUT message", () => {
			expect(isRequestMessage({ type: "AUTH_LOGOUT" })).toBe(true);
		});

		it("should return true for valid AUTH_STATUS message", () => {
			expect(isRequestMessage({ type: "AUTH_STATUS" })).toBe(true);
		});

		it("should return true for valid AUTH_DEVICE_CODE message", () => {
			expect(isRequestMessage({ type: "AUTH_DEVICE_CODE" })).toBe(true);
		});

		it("should return true for valid AUTH_DEVICE_POLL message", () => {
			expect(
				isRequestMessage({ type: "AUTH_DEVICE_POLL", payload: { deviceCode: "abc12345" } }),
			).toBe(true);
		});

		it("should return false for null", () => {
			expect(isRequestMessage(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isRequestMessage(undefined)).toBe(false);
		});

		it("should return false for empty object", () => {
			expect(isRequestMessage({})).toBe(false);
		});

		it("should return false for object without type", () => {
			expect(isRequestMessage({ payload: "data" })).toBe(false);
		});

		it("should return false for unknown type", () => {
			expect(isRequestMessage({ type: "UNKNOWN_TYPE" })).toBe(false);
		});

		it("should return false for non-string type", () => {
			expect(isRequestMessage({ type: 123 })).toBe(false);
		});

		it("should return false for primitive values", () => {
			expect(isRequestMessage("AUTH_LOGOUT")).toBe(false);
			expect(isRequestMessage(42)).toBe(false);
			expect(isRequestMessage(true)).toBe(false);
		});
	});
});
