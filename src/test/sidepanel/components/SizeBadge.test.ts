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

	it("should render XS badge with size-xs class", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XS" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("XS");
		expect(badge?.classList.contains("size-xs")).toBe(true);
	});

	it("should render S badge with size-s class", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "S" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("S");
		expect(badge?.classList.contains("size-s")).toBe(true);
	});

	it("should render M badge with size-m class", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "M" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("M");
		expect(badge?.classList.contains("size-m")).toBe(true);
	});

	it("should render L badge with size-l class", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "L" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("L");
		expect(badge?.classList.contains("size-l")).toBe(true);
	});

	it("should render XL badge with size-xl class", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "XL" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).not.toBeNull();
		expect(badge?.textContent?.trim()).toBe("XL");
		expect(badge?.classList.contains("size-xl")).toBe(true);
	});

	it("should render nothing when sizeLabel is an empty string", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: "" },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when sizeLabel is an unknown value", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: unsafeCast<string>("INVALID") },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});

	it("should render nothing when sizeLabel is undefined", () => {
		component = mount(SizeBadge, {
			target: document.body,
			props: { sizeLabel: unsafeCast<string>(undefined) },
		});
		const badge = document.querySelector(".size-badge");
		expect(badge).toBeNull();
	});
});
