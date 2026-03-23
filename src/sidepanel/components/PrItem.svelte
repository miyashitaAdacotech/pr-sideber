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
		<span class="pr-author">{pr.author}</span>
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
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--color-border-primary);
		transition: background 0.15s;
	}

	.pr-item:hover {
		background: var(--color-bg-hover);
	}

	.pr-title {
		color: var(--color-accent-primary);
		text-decoration: none;
		font-size: 0.8125rem;
		line-height: 1.4;
		display: block;
	}

	.pr-title:hover {
		text-decoration: underline;
	}

	.pr-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		margin-top: 0.125rem;
	}

	.pr-author {
		max-width: 7rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.pr-badges {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.125rem;
		flex-wrap: wrap;
	}
</style>
