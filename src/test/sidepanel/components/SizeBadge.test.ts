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

	it("should render additions and deletions as text", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 3, deletions: 2 },
		});
		const additions = document.querySelector(".size-additions");
		const deletions = document.querySelector(".size-deletions");
		expect(additions).not.toBeNull();
		expect(additions?.textContent?.trim()).toBe("+3");
		expect(deletions).not.toBeNull();
		expect(deletions?.textContent?.trim()).toBe("-2");
	});

	it("should render +0 when additions is 0", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 0, deletions: 5 },
		});
		const additions = document.querySelector(".size-additions");
		expect(additions).not.toBeNull();
		expect(additions?.textContent?.trim()).toBe("+0");
	});

	it("should render -0 when deletions is 0", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 8, deletions: 0 },
		});
		const deletions = document.querySelector(".size-deletions");
		expect(deletions).not.toBeNull();
		expect(deletions?.textContent?.trim()).toBe("-0");
	});

	it("should render large values correctly", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 800, deletions: 200 },
		});
		const additions = document.querySelector(".size-additions");
		const deletions = document.querySelector(".size-deletions");
		expect(additions).not.toBeNull();
		expect(additions?.textContent?.trim()).toBe("+800");
		expect(deletions).not.toBeNull();
		expect(deletions?.textContent?.trim()).toBe("-200");
	});

	it("should render with zero values", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { additions: 0, deletions: 0 },
		});
		const additions = document.querySelector(".size-additions");
		const deletions = document.querySelector(".size-deletions");
		expect(additions).not.toBeNull();
		expect(deletions).not.toBeNull();
	});
});
