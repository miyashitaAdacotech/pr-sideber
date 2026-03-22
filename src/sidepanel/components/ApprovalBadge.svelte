<script lang="ts">
	import "../styles/badge.css";

	type Props = {
		approvalStatus: string;
	};

	const { approvalStatus }: Props = $props();

	// 表示ポリシー: "Pending" (レビュー依頼なし) は非表示。まだ誰にもレビュー依頼していない状態のため、
	// バッジで表示するまでもない。CiBadge の "Pending" は CI がキュー待ちの意味で表示する。
	// "Pending" と不正値は意図的に非表示。
	// config に存在しないキーは $derived で undefined → {#if resolved} で非表示になる。
	const config: Record<string, { label: string; colorClass: string }> = {
		Approved: { label: "APPROVED", colorClass: "badge-green" },
		ChangesRequested: { label: "CHANGES REQUESTED", colorClass: "badge-red" },
		ReviewRequired: { label: "REVIEW REQUIRED", colorClass: "badge-yellow" },
	};

	const resolved = $derived(config[approvalStatus]);
</script>

{#if resolved}
	<span class="badge {resolved.colorClass}">{resolved.label}</span>
{/if}
