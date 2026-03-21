import { describe, expect, it } from "vitest";
import { generateCodeChallenge, generateCodeVerifier, generateState } from "../../shared/crypto";

describe("crypto", () => {
	describe("generateState", () => {
		it("should return a string of at least 32 characters", () => {
			const state = generateState();
			expect(state.length).toBeGreaterThanOrEqual(32);
		});

		it("should return different values on consecutive calls", () => {
			const state1 = generateState();
			const state2 = generateState();
			expect(state1).not.toBe(state2);
		});
	});

	describe("generateCodeVerifier", () => {
		it("should return a string between 43 and 128 characters", () => {
			const verifier = generateCodeVerifier();
			expect(verifier.length).toBeGreaterThanOrEqual(43);
			expect(verifier.length).toBeLessThanOrEqual(128);
		});

		it("should contain only unreserved characters per RFC 7636", () => {
			const verifier = generateCodeVerifier();
			// RFC 7636: ALPHA / DIGIT / "-" / "." / "_" / "~"
			expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
		});
	});

	describe("generateCodeChallenge", () => {
		it("should return a Base64URL encoded string without padding", async () => {
			const verifier = generateCodeVerifier();
			const challenge = await generateCodeChallenge(verifier);

			// Base64URL: A-Z, a-z, 0-9, -, _ のみ。+ / = は含まない
			expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
			expect(challenge).not.toContain("=");
			expect(challenge).not.toContain("+");
			expect(challenge).not.toContain("/");
		});
	});
});
