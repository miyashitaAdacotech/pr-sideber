<script lang="ts">
	import "../styles/badge.css";

	type Props = Readonly<{
		sizeLabel: string;
		additions: number;
		deletions: number;
	}>;

	const { sizeLabel, additions, deletions }: Props = $props();

	const cssClassMap: Record<string, string> = {
		XS: "size-xs",
		S: "size-s",
		M: "size-m",
		L: "size-l",
		XL: "size-xl",
	};

	const cssClass = $derived(sizeLabel ? cssClassMap[sizeLabel] : undefined);
</script>

{#if cssClass}
	<span class="size-badge {cssClass}">+{additions} -{deletions}</span>
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
