import { describe, expect, it } from "vitest";
import { initializeApp } from "../../background/bootstrap";

describe("bootstrap", () => {
	describe("initializeApp", () => {
		it("should complete without throwing", () => {
			expect(() => initializeApp()).not.toThrow();
		});
	});
});
