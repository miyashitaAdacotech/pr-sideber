import { describe, expect, it } from "vitest";
import { isGreeting } from "./greeting.js";

describe("isGreeting", () => {
	it("should return true for valid Greeting", () => {
		expect(isGreeting({ message: "Hello" })).toBe(true);
	});

	it("should return false for null", () => {
		expect(isGreeting(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isGreeting(undefined)).toBe(false);
	});

	it("should return false for non-object", () => {
		expect(isGreeting("string")).toBe(false);
		expect(isGreeting(42)).toBe(false);
	});

	it("should return false for object without message", () => {
		expect(isGreeting({ name: "test" })).toBe(false);
	});

	it("should return false for object with non-string message", () => {
		expect(isGreeting({ message: 123 })).toBe(false);
	});
});
