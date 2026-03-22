import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import DraftBadge from "../../../sidepanel/components/DraftBadge.svelte";

describe("DraftBadge", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should render DRAFT badge with gray class when isDraft is true", () => {
		component = mount(DraftBadge, {
			target: document.body,
			props: { isDraft: true },
		});
		const badge = document.querySelector(".badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("DRAFT");
		expect(badge?.classList.contains("badge-gray")).toBe(true);
	});

	it("should render nothing when isDraft is false", () => {
		component = mount(DraftBadge, {
			target: document.body,
			props: { isDraft: false },
		});
		const badge = document.querySelector(".badge");
		expect(badge).toBeNull();
	});
});
