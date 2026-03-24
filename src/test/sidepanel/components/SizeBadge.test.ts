import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import SizeBadge from "../../../sidepanel/components/SizeBadge.svelte";

/** テスト専用: 型チェックを迂回して不正値を注入する */
function unsafeCast<T>(value: unknown): T {
	return value as T;
}

describe("SizeBadge", () => {
	let component: ReturnType<typeof mount>;

	afterEach(() => {
		if (component) {
			unmount(component);
		}
		document.body.innerHTML = "";
	});

	it("should render additions and deletions with size-xs class for XS", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XS", additions: 3, deletions: 2 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("+3 -2");
		expect(badge?.classList.contains("size-xs")).toBe(true);
	});

	it("should render additions and deletions with size-s class for S", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "S", additions: 20, deletions: 5 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("+20 -5");
		expect(badge?.classList.contains("size-s")).toBe(true);
	});

	it("should render additions and deletions with size-m class for M", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "M", additions: 100, deletions: 50 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("+100 -50");
		expect(badge?.classList.contains("size-m")).toBe(true);
	});

	it("should render additions and deletions with size-l class for L", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "L", additions: 300, deletions: 100 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("+300 -100");
		expect(badge?.classList.contains("size-l")).toBe(true);
	});

	it("should render additions and deletions with size-xl class for XL", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XL", additions: 800, deletions: 200 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("+800 -200");
		expect(badge?.classList.contains("size-xl")).toBe(true);
	});

	it("should render nothing when sizeLabel is an empty string", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "", additions: 0, deletions: 0 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when sizeLabel is an unknown value", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: unsafeCast<string>("INVALID"), additions: 10, deletions: 5 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when sizeLabel is undefined", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: unsafeCast<string>(undefined), additions: 0, deletions: 0 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});

	it("should handle zero additions", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XS", additions: 0, deletions: 5 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge?.textContent?.trim()).toBe("+0 -5");
	});

	it("should handle zero deletions", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XS", additions: 8, deletions: 0 },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge?.textContent?.trim()).toBe("+8 -0");
	});
});
