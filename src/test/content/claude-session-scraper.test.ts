import { beforeEach, describe, expect, it, vi } from "vitest";
import { scrapeSessionLinks } from "../../content/claude-session-scraper";

describe("scrapeSessionLinks", () => {
	let doc: Document;

	beforeEach(() => {
		doc = document.implementation.createHTMLDocument("Claude Code");
	});

	/**
	 * React fiber ノードを持つ DOM 要素を生成する。
	 * claude.ai/code ではセッション一覧の各行が React コンポーネントとして
	 * レンダリングされ、__reactFiber$<hash> プロパティに fiber ツリーが格納される。
	 * memoizedProps.session にセッション情報が入っている。
	 */
	function createFiberElement(
		session: { id: string; title: string },
		hash = "abc123",
	): HTMLDivElement {
		const div = doc.createElement("div");
		div.className = "cursor-pointer";
		(div as unknown as Record<string, unknown>)[`__reactFiber$${hash}`] = {
			memoizedProps: { session },
			return: null,
		};
		return div;
	}

	/**
	 * fiber ツリーが深い階層にある場合をシミュレートする。
	 * depth=2 なら要素直結の fiber → return → session を持つ fiber の 2 階層。
	 */
	function createFiberElementDeep(
		session: { id: string; title: string },
		hash = "abc123",
		depth = 2,
	): HTMLDivElement {
		const div = doc.createElement("div");
		div.className = "cursor-pointer";
		// 最深部に session を持つ fiber ノードを配置
		let node: Record<string, unknown> = {
			memoizedProps: { session },
			return: null,
		};
		// depth-1 回ラップして親方向の階層を作る
		for (let i = 1; i < depth; i++) {
			node = { memoizedProps: {}, return: node };
		}
		(div as unknown as Record<string, unknown>)[`__reactFiber$${hash}`] = node;
		return div;
	}

	it("React fiber の memoizedProps.session から URL とタイトルを正しく抽出する", () => {
		doc.body.appendChild(
			createFiberElement({
				id: "session_01T7hN9fW6KuKZxn52isYdyR",
				title: "Investigate issue 2375",
			}),
		);
		doc.body.appendChild(
			createFiberElement({
				id: "session_abc123def456",
				title: "CI/CD App統一",
			}),
		);

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(2);
		expect(result[0]).toEqual({
			url: "https://claude.ai/code/session_01T7hN9fW6KuKZxn52isYdyR",
			title: "Investigate issue 2375",
		});
		expect(result[1]).toEqual({
			url: "https://claude.ai/code/session_abc123def456",
			title: "CI/CD App統一",
		});
	});

	it("fiber が親方向 2 階層目にある場合も抽出できる", () => {
		doc.body.appendChild(
			createFiberElementDeep({ id: "session_deep01", title: "Deep session" }, "abc123", 2),
		);

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({
			url: "https://claude.ai/code/session_deep01",
			title: "Deep session",
		});
	});

	it("fiber が親方向 MAX_FIBER_DEPTH を超える場合は抽出しない", () => {
		// MAX_FIBER_DEPTH=10 を超える 11 階層
		doc.body.appendChild(
			createFiberElementDeep({ id: "session_tooDeep", title: "Too deep" }, "abc123", 11),
		);

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("__reactFiber$ プロパティがない要素はスキップする", () => {
		const div = doc.createElement("div");
		div.className = "cursor-pointer";
		doc.body.appendChild(div);

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("session.id が session_ で始まらない場合はスキップする", () => {
		doc.body.appendChild(createFiberElement({ id: "draft_09baa7d1", title: "Draft" }));

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("session プロパティが存在しない fiber はスキップする", () => {
		const div = doc.createElement("div");
		div.className = "cursor-pointer";
		// biome-ignore lint/complexity/useLiteralKeys: fiber キーはテンプレートリテラル形式と統一するためブラケットで記述
		(div as unknown as Record<string, unknown>)["__reactFiber$abc123"] = {
			memoizedProps: { onClick: () => {} },
			return: null,
		};
		doc.body.appendChild(div);

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("DOM にマッチする要素がない場合は空配列を返す", () => {
		const p = doc.createElement("p");
		p.textContent = "No sessions here";
		doc.body.appendChild(p);

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
	});

	it("同一 session.id の重複は除去する", () => {
		for (let i = 0; i < 3; i++) {
			doc.body.appendChild(
				createFiberElement({
					id: "session_duplicate123",
					title: `Copy ${i}`,
				}),
			);
		}

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(1);
		expect(result[0].url).toBe("https://claude.ai/code/session_duplicate123");
	});

	it("session.title が undefined の場合は空文字列にフォールバックする", () => {
		doc.body.appendChild(
			createFiberElement({ id: "session_noTitle", title: undefined as unknown as string }),
		);

		const result = scrapeSessionLinks(doc);

		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("");
		expect(result[0].url).toBe("https://claude.ai/code/session_noTitle");
	});

	it("fiber アクセスで例外が発生しても throw せず空配列を返す", () => {
		const div = doc.createElement("div");
		div.className = "cursor-pointer";
		Object.defineProperty(div, "__reactFiber$abc123", {
			get() {
				throw new Error("Simulated fiber access error");
			},
			enumerable: true,
			configurable: true,
		});
		doc.body.appendChild(div);

		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

		const result = scrapeSessionLinks(doc);

		expect(result).toEqual([]);
		expect(errorSpy).toHaveBeenCalled();

		errorSpy.mockRestore();
	});
});
