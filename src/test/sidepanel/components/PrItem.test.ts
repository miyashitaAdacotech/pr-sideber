import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
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
		additions: 10,
		deletions: 3,
		createdAt: "2026-03-20T10:00:00Z",
		updatedAt: "2026-03-23T10:00:00Z",
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

	it("should display the PR number and title", () => {
		component = mount(PrItem, {
			target: document.body,
			props: { pr: createPrItemDto({ number: 99, title: "Fix bug Y" }) },
		});
		const titleEl = document.querySelector(".pr-title");
		expect(titleEl).not.toBeNull();
		expect(titleEl?.textContent?.trim()).toBe("#99 Fix bug Y");
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
});
