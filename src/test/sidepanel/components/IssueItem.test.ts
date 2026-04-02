import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IssueItemDto } from "../../../domain/ports/issue-processor.port";
import IssueItem from "../../../sidepanel/components/IssueItem.svelte";

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

describe("IssueItem", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should display the issue title followed by the issue number", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto({ number: 99, title: "Fix bug Y" }) },
		});
		const titleEl = document.querySelector(".issue-title");
		expect(titleEl).not.toBeNull();
		const textContent = titleEl?.textContent?.trim() ?? "";
		expect(textContent).toMatch(/^Fix bug Y\s*#99$/);
	});

	it("should render the issue number in a dedicated .issue-number element", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto({ number: 99 }) },
		});
		const numberEl = document.querySelector(".issue-number");
		expect(numberEl).not.toBeNull();
		expect(numberEl?.textContent?.trim()).toBe("#99");
	});

	it("should render labels with correct name and background color", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: {
				issue: createIssueItemDto({
					labels: [
						{ name: "bug", color: "d73a4a" },
						{ name: "enhancement", color: "a2eeef" },
					],
				}),
			},
		});
		const badges = document.querySelectorAll(".label-badge");
		expect(badges).toHaveLength(2);
		expect(badges[0]?.textContent?.trim()).toBe("bug");
		expect((badges[0] as HTMLElement).style.backgroundColor).toBe("rgb(215, 58, 74)");
		expect(badges[1]?.textContent?.trim()).toBe("enhancement");
	});

	it("should render no label badges when labels array is empty", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto({ labels: [] }) },
		});
		const badges = document.querySelectorAll(".label-badge");
		expect(badges).toHaveLength(0);
	});

	it("should call onNavigate when clicked normally", () => {
		const onNavigate = vi.fn();
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto(), onNavigate },
		});
		const link = document.querySelector(".issue-item") as HTMLElement;
		expect(link).not.toBeNull();
		link.click();
		expect(onNavigate).toHaveBeenCalledWith("https://github.com/owner/repo/issues/42");
	});

	it("should not call onNavigate on Ctrl+click", () => {
		const onNavigate = vi.fn();
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto(), onNavigate },
		});
		const link = document.querySelector(".issue-item") as HTMLElement;
		expect(link).not.toBeNull();
		const ctrlClickEvent = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			ctrlKey: true,
		});
		link.dispatchEvent(ctrlClickEvent);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("should not call onNavigate on Meta+click", () => {
		const onNavigate = vi.fn();
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto(), onNavigate },
		});
		const link = document.querySelector(".issue-item") as HTMLElement;
		expect(link).not.toBeNull();
		const metaClickEvent = new MouseEvent("click", {
			bubbles: true,
			cancelable: true,
			metaKey: true,
		});
		link.dispatchEvent(metaClickEvent);
		expect(onNavigate).not.toHaveBeenCalled();
	});

	it("should have .active class when isActive is true", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto(), isActive: true },
		});
		const item = document.querySelector(".issue-item");
		expect(item).not.toBeNull();
		expect(item?.classList.contains("active")).toBe(true);
	});

	it("should not have .active class when isActive is false", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto(), isActive: false },
		});
		const item = document.querySelector(".issue-item");
		expect(item).not.toBeNull();
		expect(item?.classList.contains("active")).toBe(false);
	});

	it("should render as an anchor tag with correct href", () => {
		component = mount(IssueItem, {
			target: document.body,
			props: { issue: createIssueItemDto() },
		});
		const link = document.querySelector("a.issue-item") as HTMLAnchorElement;
		expect(link).not.toBeNull();
		expect(link.href).toBe("https://github.com/owner/repo/issues/42");
	});
});
