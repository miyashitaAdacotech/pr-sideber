import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceFlowController } from "../../../shared/usecase/device-flow.controller";
import LoginScreen from "../../../sidepanel/components/LoginScreen.svelte";

function createMockController(): DeviceFlowController {
	return {
		getState: vi.fn(() => ({ phase: "idle" as const })),
		startFlow: vi.fn(async () => {}),
		waitForAuthorization: vi.fn(async () => {}),
		startAndWait: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
	};
}

describe("LoginScreen", () => {
	let component: ReturnType<typeof mount>;
	let mockController: DeviceFlowController;

	beforeEach(() => {
		mockController = createMockController();
	});

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should mount successfully", () => {
		component = mount(LoginScreen, {
			target: document.body,
			props: { controller: mockController },
		});
		expect(document.body.innerHTML).not.toBe("");
	});

	it("should display login heading", () => {
		component = mount(LoginScreen, {
			target: document.body,
			props: { controller: mockController },
		});
		const heading = document.querySelector("h2");
		expect(heading).not.toBeNull();
		expect(heading?.textContent).toContain("GitHub");
	});

	it("should display login button in idle state", () => {
		component = mount(LoginScreen, {
			target: document.body,
			props: { controller: mockController },
		});
		const buttons = document.querySelectorAll("button");
		const loginButton = Array.from(buttons).find((btn) => btn.textContent?.includes("Login"));
		expect(loginButton).not.toBeUndefined();
	});
});
