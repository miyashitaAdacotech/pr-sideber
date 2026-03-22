<script lang="ts">
	import type { PrItemDto } from "../../domain/ports/pr-processor.port";
	import { formatRelativeTime } from "../../shared/utils/time";
	import { safeUrl } from "../../shared/utils/url";
	import ApprovalBadge from "./ApprovalBadge.svelte";
	import CiBadge from "./CiBadge.svelte";
	import DraftBadge from "./DraftBadge.svelte";

	type Props = {
		pr: PrItemDto;
	};

	const { pr }: Props = $props();
</script>

<div class="pr-item">
	<a class="pr-title" href={safeUrl(pr.url)} target="_blank" rel="noopener noreferrer">
		#{pr.number} {pr.title}
	</a>
	<div class="pr-meta">
		<span class="pr-repo">{pr.repository}</span>
		<span class="pr-updated">{formatRelativeTime(pr.updatedAt)}</span>
	</div>
	<div class="pr-badges">
		<DraftBadge isDraft={pr.isDraft} />
		{#if !pr.isDraft}
			<ApprovalBadge approvalStatus={pr.approvalStatus} />
			<CiBadge ciStatus={pr.ciStatus} />
		{/if}
	</div>
</div>

<style>
	.pr-item {
		padding: 0.5rem 0;
		border-bottom: 1px solid #e1e4e8;
	}

	.pr-title {
		color: #0366d6;
		text-decoration: none;
		font-size: 0.875rem;
		line-height: 1.4;
		display: block;
	}

	.pr-title:hover {
		text-decoration: underline;
	}

	.pr-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #586069;
		margin-top: 0.25rem;
	}

	.pr-badges {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}
</style>
