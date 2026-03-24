import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PrItemDto } from "../../../domain/ports/pr-processor.port";
import PrSection from "../../../sidepanel/components/PrSection.svelte";

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
		unresolvedCommentCount: 0,
		...overrides,
	};
}

describe("PrSection", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should call onNavigate with the PR url when a PR item is clicked", () => {
		const onNavigate = vi.fn();
		const pr = createPrItemDto();
		component = mount(PrSection, {
			target: document.body,
			props: {
				title: "My PRs",
				items: [pr],
				onNavigate,
			},
		});

		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		prItem.click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/42");
	});

	it("should not throw when clicked without onNavigate prop", () => {
		const pr = createPrItemDto();
		component = mount(PrSection, {
			target: document.body,
			props: {
				title: "My PRs",
				items: [pr],
			},
		});

		const prItem = document.querySelector(".pr-item") as HTMLElement;
		expect(prItem).not.toBeNull();
		// クリックしてもエラーにならないことを確認
		expect(() => prItem.click()).not.toThrow();
	});

	it("should not render PR items when the section is closed", () => {
		const pr = createPrItemDto();
		component = mount(PrSection, {
			target: document.body,
			props: {
				title: "My PRs",
				items: [pr],
				isOpen: false,
			},
		});

		const prItem = document.querySelector(".pr-item");
		expect(prItem).toBeNull();
	});

	it("should call onNavigate with the correct URL for each PR when multiple items are clicked", () => {
		const onNavigate = vi.fn();
		const pr1 = createPrItemDto({
			id: "PR_1",
			number: 1,
			title: "First PR",
			url: "https://github.com/owner/repo/pull/1",
		});
		const pr2 = createPrItemDto({
			id: "PR_2",
			number: 2,
			title: "Second PR",
			url: "https://github.com/owner/repo/pull/2",
		});
		const pr3 = createPrItemDto({
			id: "PR_3",
			number: 3,
			title: "Third PR",
			url: "https://github.com/owner/repo/pull/3",
		});

		component = mount(PrSection, {
			target: document.body,
			props: {
				title: "My PRs",
				items: [pr1, pr2, pr3],
				onNavigate,
			},
		});

		const prItems = document.querySelectorAll(".pr-item");
		expect(prItems).toHaveLength(3);

		// 各 PR をクリックして、対応する URL で onNavigate が呼ばれることを検証
		(prItems[0] as HTMLElement).click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/1");

		(prItems[1] as HTMLElement).click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/2");

		(prItems[2] as HTMLElement).click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/pull/3");

		expect(onNavigate).toHaveBeenCalledTimes(3);
	});

	it("should display empty message when items array is empty", () => {
		component = mount(PrSection, {
			target: document.body,
			props: {
				title: "My PRs",
				items: [],
			},
		});

		const emptyMessage = document.querySelector(".empty-message");
		expect(emptyMessage).not.toBeNull();
		expect(emptyMessage?.textContent?.trim()).toBe("PR がありません");
	});
});
