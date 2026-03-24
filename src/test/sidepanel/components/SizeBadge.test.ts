import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import SizeBadge from "../../../sidepanel/components/SizeBadge.svelte";

describe("SizeBadge", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should render additions in .badge-green and deletions in .badge-red", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 3, deletions: 2 },
		});
		const green = document.querySelector(".badge-green");
		const red = document.querySelector(".badge-red");
		expect(green).not.toBeNull();
		expect(green?.textContent?.trim()).toBe("+3");
		expect(red).not.toBeNull();
		expect(red?.textContent?.trim()).toBe("-2");
	});

	it("should render +0 in .badge-green when additions is 0", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 0, deletions: 5 },
		});
		const green = document.querySelector(".badge-green");
		expect(green).not.toBeNull();
		expect(green?.textContent?.trim()).toBe("+0");
	});

	it("should render -0 in .badge-red when deletions is 0", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 8, deletions: 0 },
		});
		const red = document.querySelector(".badge-red");
		expect(red).not.toBeNull();
		expect(red?.textContent?.trim()).toBe("-0");
	});

	it("should render large values correctly", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 800, deletions: 200 },
		});
		const green = document.querySelector(".badge-green");
		const red = document.querySelector(".badge-red");
		expect(green).not.toBeNull();
		expect(green?.textContent?.trim()).toBe("+800");
		expect(red).not.toBeNull();
		expect(red?.textContent?.trim()).toBe("-200");
	});

	it("should render .badge-green and .badge-red with zero values", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 0, deletions: 0 },
		});
		const green = document.querySelector(".badge-green");
		const red = document.querySelector(".badge-red");
		expect(green).not.toBeNull();
		expect(red).not.toBeNull();
	});

	it("should not have any size-xs through size-xl classes in the DOM", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 10, deletions: 5 },
		});
		expect(document.querySelector(".size-xs")).toBeNull();
		expect(document.querySelector(".size-s")).toBeNull();
		expect(document.querySelector(".size-m")).toBeNull();
		expect(document.querySelector(".size-l")).toBeNull();
		expect(document.querySelector(".size-xl")).toBeNull();
	});
});
