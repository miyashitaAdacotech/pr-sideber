import { describe, expect, it } from "vitest";
import type {
	PrItemDto,
	PrProcessorPort,
	ProcessedPrsResult,
} from "../domain/ports/pr-processor.port";

describe("PrProcessorPort", () => {
	it("interface is implementable with correct shape", async () => {
		// 型レベルテスト: PrProcessorPort を満たすオブジェクトが作成可能であること
		// TODO: 実際の WasmPrProcessor との型互換は WASM ビルド後に結合テストで検証する
		const mockProcessor: PrProcessorPort = {
			processPullRequests(_rawJson: string): ProcessedPrsResult {
				return {
					myPrs: { items: [], totalCount: 0 },
					reviewRequests: { items: [], totalCount: 0 },
				};
			},
		};

		const result = await mockProcessor.processPullRequests("{}");
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

	it("PrItemDto should include sizeLabel field", () => {
		const item: PrItemDto = {
			id: "PR_1",
			number: 1,
			title: "test",
			author: "testuser",
			url: "https://github.com/owner/repo/pull/1",
			repository: "owner/repo",
			isDraft: false,
			approvalStatus: "Approved",
			ciStatus: "Passed",
			additions: 10,
			deletions: 5,
			createdAt: "2026-03-20T00:00:00Z",
			updatedAt: "2026-03-21T00:00:00Z",
			sizeLabel: "S",
		};

		expect(item.sizeLabel).toBe("S");
		expect(item).toHaveProperty("sizeLabel");
	});
});
