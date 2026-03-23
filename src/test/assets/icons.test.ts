// @vitest-environment node
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

describe("アイコンアセット", () => {
	describe("PNG アイコンファイル", () => {
		const pngFiles = [
			{ name: "icon-16.png", size: 16 },
			{ name: "icon-48.png", size: 48 },
			{ name: "icon-128.png", size: 128 },
		] as const;

		for (const { name: fileName, size: expectedSize } of pngFiles) {
			it(`public/icons/${fileName} が存在し、${expectedSize}x${expectedSize} であること`, () => {
				const filePath = resolve(PROJECT_ROOT, "public/icons", fileName);
				expect(existsSync(filePath), `${fileName} が見つかりません`).toBe(true);

				const stat = statSync(filePath);
				expect(stat.size, `${fileName} のファイルサイズが 0 です`).toBeGreaterThan(0);

				const buf = readFileSync(filePath);
				const width = buf.readUInt32BE(16);
				const height = buf.readUInt32BE(20);
				expect(width, `${fileName} の幅が ${expectedSize} ではありません`).toBe(expectedSize);
				expect(height, `${fileName} の高さが ${expectedSize} ではありません`).toBe(expectedSize);
			});
		}
	});

	describe("マスター SVG", () => {
		it("public/icons/icon.svg が存在すること", () => {
			const svgPath = resolve(PROJECT_ROOT, "public/icons/icon.svg");
			expect(existsSync(svgPath), "マスター SVG (icon.svg) が見つかりません").toBe(true);
		});
	});

	describe("manifest.config.ts のアイコンパス整合性", () => {
		/**
		 * manifest.config.ts からアイコンパスを抽出する。
		 * defineManifest の返り値型 (ManifestV3Export) は関数・Promise の可能性があり
		 * テスト環境で安全に解決できないため、テキストベースで抽出する。
		 */
		function extractIconPathsFromManifest(): string[] {
			const manifestSource = readFileSync(resolve(PROJECT_ROOT, "manifest.config.ts"), "utf-8");
			const pathPattern = /"icons\/[^"]+"/g;
			const matches = manifestSource.match(pathPattern);
			expect(matches, "manifest.config.ts からアイコンパスを抽出できませんでした").not.toBeNull();
			return [...new Set(matches)].map((m) => m.replace(/"/g, ""));
		}

		it("icons で参照しているパスのファイルが全て public/ 配下に存在すること", () => {
			const iconPaths = extractIconPathsFromManifest();
			expect(iconPaths.length, "アイコンパスが 1 つも見つかりませんでした").toBeGreaterThan(0);

			for (const iconPath of iconPaths) {
				const fullPath = resolve(PROJECT_ROOT, "public", iconPath);
				expect(
					existsSync(fullPath),
					`manifest で参照されている ${iconPath} が public/ 配下に存在しません`,
				).toBe(true);
			}
		});

		it("action.default_icon と icons の両方でアイコンが定義されていること", () => {
			const manifestSource = readFileSync(resolve(PROJECT_ROOT, "manifest.config.ts"), "utf-8");
			expect(manifestSource, "manifest に action.default_icon セクションがありません").toContain(
				"default_icon",
			);
			expect(manifestSource, "manifest に icons セクションがありません").toMatch(/\bicons\s*:/);
		});
	});
});
