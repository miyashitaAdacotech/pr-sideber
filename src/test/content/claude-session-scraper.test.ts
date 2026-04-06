import { beforeEach, describe, expect, it } from "vitest";
import { scrapeSessionLinks } from "../../content/claude-session-scraper";

describe("scrapeSessionLinks", () => {
	let doc: Document;

	beforeEach(() => {
		doc = document.implementation.createHTMLDocument("Claude Code");
	});

	/**
	 * DOM ヘルパー: セッションリンク一覧を含むページを構築する。
	 * claude.ai/code のセッション一覧ページでは、各セッションが
	 * <a href="/code/session_xxxxx">タイトル</a> 形式で並ぶ想定。
	 */
	function addSessionLink(href: string, text: string): void {
		const a = doc.createElement("a");
		a.href = href;
		a.textContent = text;
		doc.body.appendChild(a);
	}

	it("セッションリンク要素から URL とタイトルを正しく抽出する", () => {
		addSessionLink("/code/session_01T7hN9fW6KuKZxn52isYdyR", "Investigate issue 2375");
		addSessionLink("/code/session_abc123def456", "Inv #1882 [#1613] CI/CD App統一");

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			url: expect.stringContaining("/code/session_01T7hN9fW6KuKZxn52isYdyR"),
			title: "Investigate issue 2375",
		});
		expect(result[1]).toEqual({
			url: expect.stringContaining("/code/session_abc123def456"),
			title: "Inv #1882 [#1613] CI/CD App統一",
		});
	});

	it("href が /code/session_ パターンに一致しないリンクは除外する", () => {
		// セッションリンク
		addSessionLink("/code/session_valid123", "Investigate issue 100");
		// 除外されるべきリンク
		addSessionLink("/code/scheduled", "Scheduled tasks");
		addSessionLink("/code", "Claude Code home");
		addSessionLink("/chat/abc123", "Some chat");
		addSessionLink("/code/draft_09baa7d1", "Draft session");

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Investigate issue 100");
	});

	it("DOM にセッションリンクがない場合は空配列を返す", () => {
		// リンクなし
		const p = doc.createElement("p");
		p.textContent = "No sessions here";
		doc.body.appendChild(p);

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("同じ URL のリンクが複数ある場合は重複除去する", () => {
		const href = "/code/session_duplicate123";
		addSessionLink(href, "Investigate issue 500");
		addSessionLink(href, "Investigate issue 500");
		addSessionLink(href, "Investigate issue 500 (copy)");

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(1);
		expect(result[0].url).toContain("/code/session_duplicate123");
	});
});
