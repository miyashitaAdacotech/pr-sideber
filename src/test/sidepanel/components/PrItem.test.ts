import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrItemDto } from "../../../domain/ports/pr-processor.port";
import PrItem from "../../../sidepanel/components/PrItem.svelte";

function createPrItemDto(overrides: Partial<PrItemDto> = {}): PrItemDto {
	return {
		id: "PR_123",
		number: 42,
		title: "Add feature X",
		author: "octocat",
		url: "https://github.com/owner/repo/pull/42",
		repository: "owner/repo",
		isDraft: false,
		approvalStatus: "ReviewRequired",
		ciStatus: "Passed",
		mergeableStatus: "Unknown",
		additions: 10,
		deletions: 3,
		createdAt: "2026-03-20T10:00:00Z",
		updatedAt: "2026-03-23T10:00:00Z",
		sizeLabel: "S",
		...overrides,
	};
}

describe("PrItem", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should display the author name in a .pr-author element", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ author: "testuser" }) },
		});
		const authorEl = document.querySelector(".pr-author");
		expect(authorEl).not.toBeNull();
		expect(authorEl?.textContent?.trim()).toBe("testuser");
	});

	it("should display the PR title followed by the PR number", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ number: 99, title: "Fix bug Y" }) },
		});
		const titleEl = document.querySelector(".pr-title");
		expect(titleEl).not.toBeNull();
		// タイトルテキストが先に表示され、番号が後に続く (完全一致で検証)
		const textContent = titleEl?.textContent?.trim() ?? "";
		expect(textContent).toMatch(/^Fix bug Y\s*#99$/);
	});

	it("should render the PR number in a dedicated .pr-number element", () => {
		// NOTE: 薄い色の表示は .pr-number クラスの CSS (color: var(--color-text-secondary)) で実現。DOM 構造テストで担保。
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ number: 99, title: "Fix bug Y" }) },
		});
		const numberEl = document.querySelector(".pr-number");
		expect(numberEl).not.toBeNull();
		expect(numberEl?.textContent?.trim()).toBe("#99");
	});

	it("should place .pr-number element after the title text within .pr-title", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ number: 99, title: "Fix bug Y" }) },
		});
		const titleEl = document.querySelector(".pr-title");
		const numberEl = titleEl?.querySelector(".pr-number");
		expect(numberEl).not.toBeNull();
		// .pr-number は .pr-title の子要素として末尾に存在する
		expect(titleEl?.lastElementChild).toBe(numberEl);
	});

	it("should display the repository name", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ repository: "myorg/myrepo" }) },
		});
		const repoEl = document.querySelector(".pr-repo");
		expect(repoEl).not.toBeNull();
		expect(repoEl?.textContent?.trim()).toBe("myorg/myrepo");
	});

	it("should render long author name inside .pr-author element for CSS truncation", () => {
		const longName = "a-very-long-github-username-that-might-overflow";
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ author: longName }) },
		});
		const authorEl = document.querySelector(".pr-author");
		expect(authorEl).not.toBeNull();
		expect(authorEl?.textContent?.trim()).toBe(longName);
	});

	it("should call onNavigate when clicked normally", () => {
		const onNavigate = vi.fn();
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), onNavigate, isActive: false },
		});
		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		prItem.click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/42");
	});

	it("should not call onNavigate on Ctrl+click", () => {
		const onNavigate = vi.fn();
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), onNavigate, isActive: false },
		});
		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		const ctrlClickEvent = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			ctrlKey: true,
		});
		prItem.dispatchEvent(ctrlClickEvent);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("should have .active class when isActive is true", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), isActive: true },
		});
		const prItem = document.querySelector(".pr-item");
		expect(prItem).not.toBeNull();
		expect(prItem?.classList.contains("active")).toBe(true);
	});

	it("should not have .active class when isActive is false", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), isActive: false },
		});
		const prItem = document.querySelector(".pr-item");
		expect(prItem).not.toBeNull();
		expect(prItem?.classList.contains("active")).toBe(false);
	});

	it("should call onNavigate when clicking an already active PR", () => {
		const onNavigate = vi.fn();
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), onNavigate, isActive: true },
		});
		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		prItem.click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/42");
	});

	it("should not call onNavigate on Meta+click", () => {
		const onNavigate = vi.fn();
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), onNavigate, isActive: false },
		});
		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		const metaClickEvent = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			metaKey: true,
		});
		prItem.dispatchEvent(metaClickEvent);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("should not call onNavigate on middle-click (auxclick)", () => {
		const onNavigate = vi.fn();
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto(), onNavigate, isActive: false },
		});
		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		const middleClickEvent = new MouseEvent("auxclick", {
			bubbles: true,
			cancelable: true,
			button: 1,
		});
		prItem.dispatchEvent(middleClickEvent);
		expect(onNavigate).not.toHaveBeenCalled();
	});
});
