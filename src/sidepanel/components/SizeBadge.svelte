<script lang="ts">
	import "../styles/badge.css";

	type Props = {
		sizeLabel: string;
	};

	const { sizeLabel }: Props = $props();

	const config: Record<string, { cssClass: string; label: string }> = {
		XS: { cssClass: "size-xs", label: "XS" },
		S: { cssClass: "size-s", label: "S" },
		M: { cssClass: "size-m", label: "M" },
		L: { cssClass: "size-l", label: "L" },
		XL: { cssClass: "size-xl", label: "XL" },
	};

	const resolved = $derived(sizeLabel ? config[sizeLabel] : undefined);
</script>

{#if resolved}
	<span class="size-badge {resolved.cssClass}">{resolved.label}</span>
{/if}

<style>
	.size-badge {
		display: inline-block;
		padding: 0.125rem 0.375rem;
		border-radius: 9999px;
		font-size: 0.625rem;
		font-weight: 600;
		color: var(--color-badge-text, #fff);
		line-height: 1.4;
	}

	.size-xs {
		background-color: var(--color-size-xs, #3fb950);
	}

	.size-s {
		background-color: var(--color-size-s, #56d364);
	}

	.size-m {
		background-color: var(--color-size-m, #d29922);
	}

	.size-l {
		background-color: var(--color-size-l, #f85149);
	}

	.size-xl {
		background-color: var(--color-size-xl, #da3633);
	}
</style>
