import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import type { TreeNodeDto } from "../../../domain/ports/epic-processor.port";
import TreeNode from "../../../sidepanel/components/TreeNode.svelte";

/**
 * TreeNode の session 分岐に特化したテスト (Phase 3 / Issue #47)。
 * 対象仕様:
 *   - sessionId が抽出できるセッションには 🔗 Link ボタンが出る
 *   - sessionId が null の場合は 🔗 ボタンが描画されない (壊れた URL への保護)
 *   - 手動マッピング済みセッションには manual バッジが出る
 *   - 🔗 ボタンクリックで LinkSessionDialog が DOM にマウントされる
 *
 * プロダクションコードはまだ上記を実装していないため、このテストは全て RED になる。
 */

function makeSessionNode(overrides: {
	sessionId?: string | null;
	isManuallyMapped?: boolean;
	title?: string;
	url?: string;
}): TreeNodeDto {
	// sessionId は `null` を意図的に渡せるようプロパティ存在チェックで分岐する。
	// `overrides.sessionId ?? default` だと null でもデフォルトに置換されてしまい、
	// 「sessionId: null のとき Link ボタン非表示」テストを正しく表現できない。
	const sessionId = "sessionId" in overrides ? overrides.sessionId : "session_abcdef123456";
	return {
		kind: {
			type: "session",
			title: overrides.title ?? "Inv #123 session",
			url: overrides.url ?? "https://claude.ai/code/session_abcdef123456",
			issueNumber: 123,
			isManuallyMapped: overrides.isManuallyMapped ?? false,
			sessionId: sessionId ?? null,
		} as TreeNodeDto["kind"],
		children: [],
		depth: 2,
	};
}

describe("TreeNode (session 分岐)", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("sessionId が存在する session ノードには 🔗 Link ボタンが描画される", () => {
		component = mount(TreeNode, {
			target: document.body,
			props: { node: makeSessionNode({ sessionId: "session_abcdef123456" }) },
		});
		const linkBtn = document.querySelector(".link-session-btn");
		expect(linkBtn).not.toBeNull();
	});

	it("sessionId が null の session ノードには 🔗 Link ボタンが描画されない", () => {
		component = mount(TreeNode, {
			target: document.body,
			props: {
				node: makeSessionNode({
					sessionId: null,
					url: "https://claude.ai/code/malformed",
				}),
			},
		});
		const linkBtn = document.querySelector(".link-session-btn");
		expect(linkBtn).toBeNull();
	});

	it("isManuallyMapped が true のとき manual バッジが描画される", () => {
		component = mount(TreeNode, {
			target: document.body,
			props: { node: makeSessionNode({ isManuallyMapped: true }) },
		});
		const badge = document.querySelector(".manual-mapping-badge");
		expect(badge).not.toBeNull();
		// title 属性でマウスオーバー時にユーザーに意味を伝える
		expect(badge?.getAttribute("title") ?? "").toContain("手動マッピング");
	});

	it("isManuallyMapped が false のとき manual バッジは描画されない", () => {
		component = mount(TreeNode, {
			target: document.body,
			props: { node: makeSessionNode({ isManuallyMapped: false }) },
		});
		const badge = document.querySelector(".manual-mapping-badge");
		expect(badge).toBeNull();
	});

	it("🔗 ボタンクリックで LinkSessionDialog が DOM に出現する", () => {
		component = mount(TreeNode, {
			target: document.body,
			props: { node: makeSessionNode({ sessionId: "session_abcdef123456" }) },
		});
		// 初期状態ではダイアログは描画されていない
		expect(document.querySelector(".link-session-dialog")).toBeNull();
		const linkBtn = document.querySelector(".link-session-btn") as HTMLElement | null;
		expect(linkBtn).not.toBeNull();
		linkBtn?.click();
		const dialog = document.querySelector(".link-session-dialog");
		expect(dialog).not.toBeNull();
	});
});
