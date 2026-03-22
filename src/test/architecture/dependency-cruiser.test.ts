// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * dependency-cruiser によるアーキテクチャガードの検証。
 *
 * RED フェーズ: dependency-cruiser 未導入のため全テスト FAIL を期待。
 * GREEN フェーズで以下を実施:
 *   1. dependency-cruiser のインストール
 *   2. .dependency-cruiser.cjs の作成
 *   3. レイヤー境界ルールの定義
 *   4. package.json に depcruise スクリプトを追加
 */

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");

describe("dependency-cruiser アーキテクチャガード", () => {
	describe("設定ファイル", () => {
		it(".dependency-cruiser.cjs がプロジェクトルートに存在すること", () => {
			const configPath = resolve(PROJECT_ROOT, ".dependency-cruiser.cjs");
			expect(existsSync(configPath), ".dependency-cruiser.cjs が見つかりません").toBe(true);
		});
	});

	describe("depcruise コマンド実行", () => {
		it("pnpm depcruise が正常終了 (exit code 0) すること", () => {
			const result = spawnSync("npx", ["depcruise", "src", "--config", ".dependency-cruiser.cjs"], {
				cwd: PROJECT_ROOT,
				encoding: "utf-8",
				timeout: 30_000,
			});

			expect(result.status, `depcruise が失敗しました: ${result.stderr}`).toBe(0);
		});
	});

	describe("違反検出", () => {
		const DOMAIN_VIOLATION_DIR = resolve(PROJECT_ROOT, "src/domain/__test_violation__");
		const DOMAIN_VIOLATION_FILE = resolve(DOMAIN_VIOLATION_DIR, "temp_violation.ts");

		const SHARED_VIOLATION_DIR = resolve(PROJECT_ROOT, "src/shared/__test_violation__");
		const SHARED_VIOLATION_FILE = resolve(SHARED_VIOLATION_DIR, "temp_violation.ts");

		const ADAPTER_VIOLATION_DIR = resolve(PROJECT_ROOT, "src/adapter/__test_violation__");
		const ADAPTER_VIOLATION_FILE = resolve(ADAPTER_VIOLATION_DIR, "temp_violation.ts");

		const USECASE_VIOLATION_DIR = resolve(PROJECT_ROOT, "src/sidepanel/usecase/__test_violation__");
		const USECASE_VIOLATION_FILE = resolve(USECASE_VIOLATION_DIR, "temp_violation.ts");

		function cleanupViolationDirs(): void {
			rmSync(DOMAIN_VIOLATION_DIR, { recursive: true, force: true });
			rmSync(SHARED_VIOLATION_DIR, { recursive: true, force: true });
			rmSync(ADAPTER_VIOLATION_DIR, { recursive: true, force: true });
			rmSync(USECASE_VIOLATION_DIR, { recursive: true, force: true });
		}

		let depcruiseAvailable = false;

		beforeAll(() => {
			// 前回テスト実行時の残留ファイルを掃除
			cleanupViolationDirs();

			// dependency-cruiser が実行可能か1回だけ確認
			const versionCheck = spawnSync("npx", ["depcruise", "--version"], {
				cwd: PROJECT_ROOT,
				encoding: "utf-8",
				timeout: 10_000,
			});
			depcruiseAvailable = versionCheck.status === 0;

			// domain → adapter への不正な import
			mkdirSync(DOMAIN_VIOLATION_DIR, { recursive: true });
			writeFileSync(
				DOMAIN_VIOLATION_FILE,
				'import { chromeStorageAdapter } from "../../adapter/chrome/storage.adapter";\n',
				"utf-8",
			);

			// shared → adapter への不正な import
			mkdirSync(SHARED_VIOLATION_DIR, { recursive: true });
			writeFileSync(
				SHARED_VIOLATION_FILE,
				'import { chromeStorageAdapter } from "../../adapter/chrome/storage.adapter";\n',
				"utf-8",
			);

			// adapter → background への不正な import
			mkdirSync(ADAPTER_VIOLATION_DIR, { recursive: true });
			writeFileSync(
				ADAPTER_VIOLATION_FILE,
				'import { handleMessage } from "../../background/message-handler";\n',
				"utf-8",
			);

			// sidepanel/usecase → adapter/github への不正な import
			mkdirSync(USECASE_VIOLATION_DIR, { recursive: true });
			writeFileSync(
				USECASE_VIOLATION_FILE,
				'import { GitHubGraphQLClient } from "../../../adapter/github/graphql-client";\n',
				"utf-8",
			);
		});

		afterAll(() => {
			cleanupViolationDirs();
		});

		/**
		 * 指定ディレクトリに対して depcruise を実行し、違反を検出できるか検証するヘルパー。
		 * dependency-cruiser が未インストールならテストを失敗させる。
		 */
		function assertViolationDetected(targetDir: string, description: string): void {
			if (!depcruiseAvailable) {
				expect.fail("dependency-cruiser が未インストールのため違反検出テストを実行できません");
			}

			// --exclude で設定ファイルの exclude を上書きし、__test_violation__ ディレクトリも解析対象に含める
			const result = spawnSync(
				"npx",
				["depcruise", targetDir, "--config", ".dependency-cruiser.cjs", "--exclude", "^$"],
				{
					cwd: PROJECT_ROOT,
					encoding: "utf-8",
					timeout: 30_000,
				},
			);

			expect(
				result.status !== 0,
				`dependency-cruiser が ${description} の違反を検出できませんでした。出力: ${result.stdout}`,
			).toBe(true);
		}

		it("domain → adapter の違反を検出すること", () => {
			assertViolationDetected("src/domain/__test_violation__", "domain→adapter");
		});

		it("shared → adapter の違反を検出すること", () => {
			assertViolationDetected("src/shared/__test_violation__", "shared→adapter");
		});

		it("adapter → background の違反を検出すること", () => {
			assertViolationDetected("src/adapter/__test_violation__", "adapter→background");
		});

		it("sidepanel/usecase → adapter/github の違反を検出すること", () => {
			assertViolationDetected(
				"src/sidepanel/usecase/__test_violation__",
				"sidepanel/usecase→adapter/github",
			);
		});
	});

	describe("ルール定義", () => {
		function loadConfig(): { forbidden: Array<{ name: string }> } {
			const configPath = resolve(PROJECT_ROOT, ".dependency-cruiser.cjs");
			expect(existsSync(configPath), ".dependency-cruiser.cjs が存在しません").toBe(true);
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			return require(configPath);
		}

		function getRuleNames(): string[] {
			const config = loadConfig();
			expect(config.forbidden, "forbidden ルールが未定義です").toBeDefined();
			return config.forbidden.map((rule) => rule.name);
		}

		it("domain 層の依存制限ルールが定義されていること", () => {
			expect(getRuleNames()).toContain("domain-layer-boundary");
		});

		it("shared 層の依存制限ルールが定義されていること", () => {
			expect(getRuleNames()).toContain("shared-layer-boundary");
		});

		it("adapter 層の依存制限ルールが定義されていること", () => {
			expect(getRuleNames()).toContain("adapter-layer-boundary");
		});

		it("循環依存の禁止ルールが定義されていること", () => {
			expect(getRuleNames()).toContain("no-circular");
		});

		it("sidepanel/usecase 層の依存制限ルールが定義されていること", () => {
			expect(getRuleNames()).toContain("sidepanel-usecase-boundary");
		});
	});
});
