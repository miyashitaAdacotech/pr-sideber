import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessedPrsResult } from "../../../domain/ports/pr-processor.port";
import MainScreen from "../../../sidepanel/components/MainScreen.svelte";

function createMockFetchPrs(): () => Promise<ProcessedPrsResult & { hasMore: boolean }> {
	return vi.fn(async () => ({
		myPrs: { items: [], totalCount: 0 },
		reviewRequests: { items: [], totalCount: 0 },
		hasMore: false,
	}));
}

describe("MainScreen", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should mount successfully", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: {
				onLogout: vi.fn(async () => {}),
				fetchPrs: createMockFetchPrs(),
			},
		});
		expect(document.body.innerHTML).not.toBe("");
	});

	it("should display header with PR Sidebar title", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: {
				onLogout: vi.fn(async () => {}),
				fetchPrs: createMockFetchPrs(),
			},
		});
		const heading = document.querySelector("h1");
		expect(heading).not.toBeNull();
		expect(heading?.textContent).toContain("PR Sidebar");
	});

	it("should show loading state initially", () => {
		component = mount(MainScreen, {
			target: document.body,
			props: {
				onLogout: vi.fn(async () => {}),
				fetchPrs: createMockFetchPrs(),
			},
		});
		expect(document.body.textContent).toContain("Loading");
	});
});
