<script lang="ts">
	import "../styles/badge.css";

	type Props = {
		ciStatus: string;
	};

	const { ciStatus }: Props = $props();

	// "None" (CI 未設定) と不正値は意図的に非表示。
	// config に存在しないキーは $derived で undefined → {#if resolved} で非表示になる。
	const config: Record<string, { label: string; colorClass: string; animate: boolean }> = {
		Passed: { label: "CI PASSED", colorClass: "badge-green", animate: false },
		Failed: { label: "CI FAILED", colorClass: "badge-red", animate: false },
		Running: { label: "CI RUNNING", colorClass: "badge-yellow", animate: true },
		Pending: { label: "CI PENDING", colorClass: "badge-gray", animate: false },
	};

	const resolved = $derived(config[ciStatus]);
</script>

{#if resolved}
	<span class="badge {resolved.colorClass}" class:badge-animate={resolved.animate}
		>{resolved.label}</span
	>
{/if}

<style>
	.badge-animate {
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
