import { describe, expect, it } from "vitest";
import type { AuthToken } from "../../../shared/types/auth";
import { isAuthToken } from "../../../shared/types/auth";

describe("isAuthToken", () => {
	const validToken: AuthToken = {
		accessToken: "gho_abc123",
		tokenType: "bearer",
		scope: "repo",
	};

	it("should return true for a valid AuthToken object", () => {
		expect(isAuthToken(validToken)).toBe(true);
	});

	it("should return false when accessToken is empty string", () => {
		expect(isAuthToken({ ...validToken, accessToken: "" })).toBe(false);
	});

	it("should return false when accessToken is missing", () => {
		const { accessToken: _, ...rest } = validToken;
		expect(isAuthToken(rest)).toBe(false);
	});

	it("should return false when tokenType is missing", () => {
		const { tokenType: _, ...rest } = validToken;
		expect(isAuthToken(rest)).toBe(false);
	});

	it("should return false when scope is missing", () => {
		const { scope: _, ...rest } = validToken;
		expect(isAuthToken(rest)).toBe(false);
	});

	it("should return false for null", () => {
		expect(isAuthToken(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isAuthToken(undefined)).toBe(false);
	});

	it("should return false for a string", () => {
		expect(isAuthToken("some-token")).toBe(false);
	});

	it("should return false for a number", () => {
		expect(isAuthToken(42)).toBe(false);
	});

	it("should return true when extra properties exist (structural typing)", () => {
		expect(isAuthToken({ ...validToken, extra: "field" })).toBe(true);
	});

	it("should return true when scope is empty string", () => {
		expect(isAuthToken({ ...validToken, scope: "" })).toBe(true);
	});

	it("should return false when tokenType is empty string", () => {
		expect(isAuthToken({ ...validToken, tokenType: "" })).toBe(false);
	});

	it("should return false when accessToken is a number instead of string", () => {
		expect(isAuthToken({ accessToken: 123, tokenType: "bearer", scope: "repo" })).toBe(false);
	});

	it("should return false when tokenType is a boolean instead of string", () => {
		expect(isAuthToken({ accessToken: "token", tokenType: true, scope: "repo" })).toBe(false);
	});

	it("should return false when scope is null instead of string", () => {
		expect(isAuthToken({ accessToken: "token", tokenType: "bearer", scope: null })).toBe(false);
	});

	it("should validate all AuthToken fields (guard against type drift)", () => {
		const token: AuthToken = { accessToken: "x", tokenType: "bearer", scope: "" };
		const keys = Object.keys(token);
		expect(keys).toHaveLength(3);
	});
});
