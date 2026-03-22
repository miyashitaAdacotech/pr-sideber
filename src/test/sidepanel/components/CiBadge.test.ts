import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import CiBadge from "../../../sidepanel/components/CiBadge.svelte";

describe("CiBadge", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should render CI PASSED badge with green class when status is Passed", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "Passed" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("CI PASSED");
		expect(badge?.classList.contains("badge-green")).toBe(true);
		expect(badge?.classList.contains("badge-animate")).toBe(false);
	});

	it("should render CI FAILED badge with red class when status is Failed", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "Failed" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("CI FAILED");
		expect(badge?.classList.contains("badge-red")).toBe(true);
	});

	it("should render CI RUNNING badge with yellow class and animation when status is Running", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "Running" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("CI RUNNING");
		expect(badge?.classList.contains("badge-yellow")).toBe(true);
		expect(badge?.classList.contains("badge-animate")).toBe(true);
	});

	it("should render CI PENDING badge with gray class when status is Pending", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "Pending" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("CI PENDING");
		expect(badge?.classList.contains("badge-gray")).toBe(true);
	});

	it("should render nothing when status is None", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "None" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when status is an empty string", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when status is an unknown value", () => {
		component = mount(CiBadge, {
			target: document.body,
			props: { ciStatus: "UnknownStatus" },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});
});
