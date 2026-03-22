import { describe, expect, it } from "vitest";

describe("domain 層の依存方向", () => {
	it("domain/ 配下のファイルが shared/ を import していないこと", () => {
		// import.meta.glob で domain 配下の全 .ts ファイルの内容を文字列として取得
		const domainFiles = import.meta.glob("../../../domain/**/*.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const filePaths = Object.keys(domainFiles);
		expect(filePaths.length).toBeGreaterThan(0);

		const violations: { file: string; line: string }[] = [];

		for (const [filePath, mod] of Object.entries(domainFiles)) {
			const content = mod.default;
			const lines = content.split("\n");
			for (const line of lines) {
				if (/^\s*(?:import|export)\s+.*from\s+["'].*shared\//.test(line)) {
					violations.push({ file: filePath, line: line.trim() });
				}
			}
		}

		expect(violations).toEqual([]);
	});
});

describe("AuthToken の型定義配置", () => {
	it("domain/types/auth.ts が存在し AuthToken を export していること", () => {
		// import.meta.glob はビルド時にファイルを解決するため、存在しなければ空オブジェクトになる
		const domainAuthFiles = import.meta.glob("../../../domain/types/auth.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		const matchedPaths = Object.keys(domainAuthFiles);
		expect(matchedPaths).toHaveLength(1);

		const content = Object.values(domainAuthFiles)[0]?.default;
		expect(content).toBeDefined();
		// AuthToken が export されていることを正規表現で検証
		expect(content).toMatch(/export\s+type\s+AuthToken\b/);
	});

	it("shared/types/auth が domain/types/auth から AuthToken を re-export していること", () => {
		const sharedAuthFiles = import.meta.glob("../../../shared/types/auth.ts", {
			query: "?raw",
			eager: true,
		}) as Record<string, { default: string }>;

		expect(Object.keys(sharedAuthFiles), "shared/types/auth.ts が見つかりません").toHaveLength(1);

		const content = Object.values(sharedAuthFiles)[0]?.default;
		expect(content).toBeDefined();

		// shared/types/auth.ts が domain/types/auth から re-export していることを検証
		// パターン: `export type { AuthToken } from "...domain/types/auth"`
		expect(content).toMatch(
			/export\s+type\s*\{[^}]*AuthToken[^}]*\}\s*from\s+["'].*domain\/types\/auth["']/,
		);
	});
});
