import { describe, expect, it } from "vitest";
import type { PrProcessorPort, ProcessedPrsResult } from "../domain/ports/pr-processor.port";

describe("PrProcessorPort", () => {
	it("interface is implementable with correct shape", () => {
		// 型レベルテスト: PrProcessorPort を満たすオブジェクトが作成可能であること
		// TODO: 実際の WasmPrProcessor との型互換は WASM ビルド後に結合テストで検証する
		const mockProcessor: PrProcessorPort = {
			processPullRequests(_rawJson: string, _login: string): ProcessedPrsResult {
				return {
					myPrs: { items: [], totalCount: 0 },
					reviewRequests: { items: [], totalCount: 0 },
				};
			},
		};

		const result = mockProcessor.processPullRequests("{}", "testuser");
		expect(result.myPrs).toBeDefined();
		expect(result.reviewRequests).toBeDefined();
		expect(result.myPrs.items).toEqual([]);
		expect(result.myPrs.totalCount).toBe(0);
	});

	it("ProcessedPrsResult has correct structure", () => {
		const result: ProcessedPrsResult = {
			myPrs: { items: [], totalCount: 0 },
			reviewRequests: { items: [], totalCount: 0 },
		};

		expect(result).toHaveProperty("myPrs");
		expect(result).toHaveProperty("reviewRequests");
		expect(result.myPrs).toHaveProperty("items");
		expect(result.myPrs).toHaveProperty("totalCount");
	});
});
