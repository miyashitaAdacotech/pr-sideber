import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceFlowState } from "../../../shared/usecase/auth.usecase";
import type { DeviceFlowController } from "../../../shared/usecase/device-flow.controller";
import LoginScreen from "../../../sidepanel/components/LoginScreen.svelte";

function createMockController(): DeviceFlowController {
	return {
		getState: vi.fn(() => ({ phase: "idle" as const })),
		startFlow: vi.fn(async () => {}),
		waitForAuthorization: vi.fn(async () => {}),
		startAndWait: vi.fn(async () => {}),
		subscribe: vi.fn(() => () => {}),
		openVerificationUri: vi.fn(),
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

	describe("verification link", () => {
		const verificationUri = "https://github.com/login/device";
		const userCode = "ABCD-1234";

		let subscribeCallback: ((state: DeviceFlowState) => void) | undefined;

		beforeEach(() => {
			subscribeCallback = undefined;

			mockController = {
				...createMockController(),
				getState: vi.fn(() => ({
					phase: "awaiting_user" as const,
					userCode,
					verificationUri,
				})),
				subscribe: vi.fn((listener: (state: DeviceFlowState) => void) => {
					subscribeCallback = listener;
					return () => {
						subscribeCallback = undefined;
					};
				}),
			};
		});

		it("should display user code in awaiting_user state", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			const codeEl = document.querySelector(".user-code");
			expect(codeEl?.textContent).toBe(userCode);
		});

		it("should display verification link in awaiting_user state", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			const link = document.querySelector("a.verification-link");
			expect(link).not.toBeNull();
		});

		it("should display verification URI text in the link", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			const link = document.querySelector("a.verification-link");
			expect(link).not.toBeNull();
			expect(link?.textContent).toContain(verificationUri);
		});

		it("should have rel='noopener noreferrer' on verification link", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			const link = document.querySelector("a.verification-link") as HTMLAnchorElement;
			expect(link).not.toBeNull();
			expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		});

		it("should call controller.openVerificationUri when verification link is clicked", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			const link = document.querySelector("a.verification-link") as HTMLAnchorElement;
			expect(link).not.toBeNull();
			link.click();
			await tick();

			expect(mockController.openVerificationUri).toHaveBeenCalledWith(verificationUri);
		});

		it("should keep verification link visible after transitioning to polling state", async () => {
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: mockController },
			});
			await tick();

			expect(subscribeCallback).toBeDefined();
			subscribeCallback?.({ phase: "polling" });
			await tick();

			const link = document.querySelector("a.verification-link");
			expect(link).not.toBeNull();
		});

		it("should not call controller.openVerificationUri when verificationUri is not https://github.com/", async () => {
			const httpController: DeviceFlowController = {
				...createMockController(),
				getState: vi.fn(() => ({
					phase: "awaiting_user" as const,
					userCode,
					verificationUri: "http://evil.com",
				})),
				subscribe: vi.fn((listener: (state: DeviceFlowState) => void) => {
					subscribeCallback = listener;
					return () => {
						subscribeCallback = undefined;
					};
				}),
			};
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: httpController },
			});
			await tick();

			const link = document.querySelector("a.verification-link") as HTMLAnchorElement;
			expect(link).not.toBeNull();
			link.click();
			await tick();

			expect(httpController.openVerificationUri).not.toHaveBeenCalled();
		});

		it("should not display verification link in idle state", async () => {
			const idleController: DeviceFlowController = {
				...createMockController(),
				getState: vi.fn(() => ({ phase: "idle" as const })),
			};
			component = mount(LoginScreen, {
				target: document.body,
				props: { controller: idleController },
			});
			await tick();

			const link = document.querySelector("a.verification-link");
			expect(link).toBeNull();
		});
	});
});
