import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogoutButton from "../../../sidepanel/components/LogoutButton.svelte";

describe("LogoutButton", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should mount successfully", () => {
		component = mount(LogoutButton, {
			target: document.body,
			props: { onLogout: vi.fn(async () => {}) },
		});
		expect(document.body.innerHTML).not.toBe("");
	});

	it("should render a logout button", () => {
		component = mount(LogoutButton, {
			target: document.body,
			props: { onLogout: vi.fn(async () => {}) },
		});
		const button = document.querySelector("button");
		expect(button).not.toBeNull();
		expect(button?.textContent).toContain("Logout");
	});
});
