import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueItemDto } from "../../../domain/ports/issue-processor.port";
import IssueSection from "../../../sidepanel/components/IssueSection.svelte";

function createIssueItemDto(overrides: Partial<IssueItemDto> = {}): IssueItemDto {
	return {
		id: "ISSUE_123",
		number: 42,
		title: "Add feature X",
		url: "https://github.com/owner/repo/issues/42",
		state: "OPEN",
		labels: [],
		assignees: ["octocat"],
		updatedAt: "2026-03-23T10:00:00Z",
		parentNumber: null,
		parentTitle: null,
		...overrides,
	};
}

describe("IssueSection", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should display the section title and item count", () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [
					createIssueItemDto(),
					createIssueItemDto({
						id: "ISSUE_2",
						number: 43,
						url: "https://github.com/owner/repo/issues/43",
					}),
				],
			},
		});
		const titleEl = document.querySelector(".section-title");
		expect(titleEl).not.toBeNull();
		expect(titleEl?.textContent?.trim()).toBe("My Issues");

		const countEl = document.querySelector(".section-count");
		expect(countEl).not.toBeNull();
		expect(countEl?.textContent?.trim()).toBe("2");
	});

	it("should display empty message when items array is empty", () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [],
			},
		});
		const emptyMessage = document.querySelector(".empty-message");
		expect(emptyMessage).not.toBeNull();
		expect(emptyMessage?.textContent?.trim()).toBe("Issue がありません");
	});

	it("should call onNavigate with the issue url when an issue item is clicked", () => {
		const onNavigate = vi.fn();
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [createIssueItemDto()],
				onNavigate,
			},
		});

		const issueItem = document.querySelector(".issue-item") as HTMLElement;
		expect(issueItem).not.toBeNull();
		issueItem.click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/issues/42");
	});

	it("should not throw when clicked without onNavigate prop", () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [createIssueItemDto()],
			},
		});

		const issueItem = document.querySelector(".issue-item") as HTMLElement;
		expect(issueItem).not.toBeNull();
		expect(() => issueItem.click()).not.toThrow();
	});

	it("should not render issue items when the section is closed", () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [createIssueItemDto()],
				isOpen: false,
			},
		});

		const issueItem = document.querySelector(".issue-item");
		expect(issueItem).toBeNull();
	});

	it("should toggle section open/closed when header is clicked", async () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [createIssueItemDto()],
			},
		});

		// Initially open
		expect(document.querySelector(".issue-item")).not.toBeNull();

		// Click header to close
		const header = document.querySelector(".section-header") as HTMLElement;
		header.click();
		await new Promise((r) => setTimeout(r, 0));
		expect(document.querySelector(".issue-item")).toBeNull();

		// Click header to open again
		header.click();
		await new Promise((r) => setTimeout(r, 0));
		expect(document.querySelector(".issue-item")).not.toBeNull();
	});

	it("should highlight the active issue based on activeTabUrl", () => {
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [
					createIssueItemDto({ number: 10, url: "https://github.com/owner/repo/issues/10" }),
					createIssueItemDto({
						id: "ISSUE_2",
						number: 20,
						url: "https://github.com/owner/repo/issues/20",
					}),
				],
				activeTabUrl: "https://github.com/owner/repo/issues/10",
			},
		});

		const items = document.querySelectorAll(".issue-item");
		expect(items).toHaveLength(2);
		expect(items[0]?.classList.contains("active")).toBe(true);
		expect(items[1]?.classList.contains("active")).toBe(false);
	});

	it("should render multiple issue items correctly", () => {
		const onNavigate = vi.fn();
		component = mount(IssueSection, {
			target: document.body,
			props: {
				title: "My Issues",
				items: [
					createIssueItemDto({
						id: "I_1",
						number: 1,
						url: "https://github.com/owner/repo/issues/1",
					}),
					createIssueItemDto({
						id: "I_2",
						number: 2,
						url: "https://github.com/owner/repo/issues/2",
					}),
					createIssueItemDto({
						id: "I_3",
						number: 3,
						url: "https://github.com/owner/repo/issues/3",
					}),
				],
				onNavigate,
			},
		});

		const issueItems = document.querySelectorAll(".issue-item");
		expect(issueItems).toHaveLength(3);

		(issueItems[0] as HTMLElement).click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/issues/1");

		(issueItems[2] as HTMLElement).click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/issues/3");
	});
});
