import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

describe("Design Tokens (global.css)", () => {
	const cssPath = resolve(__dirname, "../../../sidepanel/styles/global.css");
	let css: string;

	function expectCssVariable(content: string, variableName: string): void {
		const pattern = new RegExp(`${variableName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*:`);
		expect(content).toMatch(pattern);
	}

	it("should have global.css file", () => {
		expect(existsSync(cssPath)).toBe(true);
	});

	beforeAll(() => {
		try {
			css = readFileSync(cssPath, "utf-8");
		} catch {
			// File does not exist yet (RED phase). Set empty string so
			// individual tests produce clear assertion failures instead of
			// runtime errors on the undefined `css` variable.
			css = "";
		}
	});

	describe("dark theme as default", () => {
		it("should have --color-bg-primary set to a dark color", () => {
			const match = css.match(/--color-bg-primary\s*:\s*(#[0-9a-fA-F]{6})/);
			expect(match).not.toBeNull();
			if (match) {
				const hex = match[1];
				const r = Number.parseInt(hex.slice(1, 3), 16);
				const g = Number.parseInt(hex.slice(3, 5), 16);
				const b = Number.parseInt(hex.slice(5, 7), 16);
				// Each RGB channel should be below 0x80 (128) for a dark color
				expect(r).toBeLessThan(0x80);
				expect(g).toBeLessThan(0x80);
				expect(b).toBeLessThan(0x80);
			}
		});
	});

	describe("background color tokens", () => {
		it("should define --color-bg-primary", () => {
			expectCssVariable(css, "--color-bg-primary");
		});

		it("should define --color-bg-secondary", () => {
			expectCssVariable(css, "--color-bg-secondary");
		});

		it("should define --color-bg-hover", () => {
			expectCssVariable(css, "--color-bg-hover");
		});
	});

	describe("text color tokens", () => {
		it("should define --color-text-primary", () => {
			expectCssVariable(css, "--color-text-primary");
		});

		it("should define --color-text-secondary", () => {
			expectCssVariable(css, "--color-text-secondary");
		});
	});

	describe("border color tokens", () => {
		it("should define --color-border-primary", () => {
			expectCssVariable(css, "--color-border-primary");
		});
	});

	describe("accent color tokens", () => {
		it("should define --color-accent-primary", () => {
			expectCssVariable(css, "--color-accent-primary");
		});
	});

	describe("badge color tokens", () => {
		it("should define --color-badge-text", () => {
			expectCssVariable(css, "--color-badge-text");
		});

		it("should define --color-badge-green", () => {
			expectCssVariable(css, "--color-badge-green");
		});

		it("should define --color-badge-red", () => {
			expectCssVariable(css, "--color-badge-red");
		});

		it("should define --color-badge-yellow", () => {
			expectCssVariable(css, "--color-badge-yellow");
		});

		it("should define --color-badge-gray", () => {
			expectCssVariable(css, "--color-badge-gray");
		});
	});

	it("should define all 12 tokens inside :root selector", () => {
		const rootMatch = css.match(/:root\s*\{([^}]*)\}/s);
		expect(rootMatch).not.toBeNull();
		if (rootMatch) {
			const rootContent = rootMatch[1];
			const allTokens = [
				"--color-bg-primary",
				"--color-bg-secondary",
				"--color-bg-hover",
				"--color-text-primary",
				"--color-text-secondary",
				"--color-border-primary",
				"--color-accent-primary",
				"--color-badge-text",
				"--color-badge-green",
				"--color-badge-red",
				"--color-badge-yellow",
				"--color-badge-gray",
			];
			for (const token of allTokens) {
				expect(rootContent).toContain(token);
			}
		}
	});
});
