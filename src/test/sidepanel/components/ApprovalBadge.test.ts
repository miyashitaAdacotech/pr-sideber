import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import ApprovalBadge from "../../../sidepanel/components/ApprovalBadge.svelte";

describe("ApprovalBadge", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should render APPROVED badge with green class when status is Approved", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "Approved" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("APPROVED");
		expect(badge?.classList.contains("badge-green")).toBe(true);
	});

	it("should render CHANGES REQUESTED badge with red class when status is ChangesRequested", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "ChangesRequested" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("CHANGES REQUESTED");
		expect(badge?.classList.contains("badge-red")).toBe(true);
	});

	it("should render REVIEW REQUIRED badge with yellow class when status is ReviewRequired", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "ReviewRequired" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("REVIEW REQUIRED");
		expect(badge?.classList.contains("badge-yellow")).toBe(true);
	});

	it("should render nothing when status is Pending", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "Pending" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when status is an empty string", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when status is an unknown value", () => {
		component = mount(ApprovalBadge, {
			target: document.body,
			props: { approvalStatus: "InvalidValue" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});
});
