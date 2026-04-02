<script lang="ts">
	import type { IssueItemDto } from "../../domain/ports/issue-processor.port";

	type Props = {
		issue: IssueItemDto;
		isActive?: boolean;
		onNavigate?: (url: string) => void;
	};

	const { issue, isActive = false, onNavigate }: Props = $props();

	function handleClick(event: MouseEvent): void {
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
			return;
		}
		if (onNavigate) {
			event.preventDefault();
			onNavigate(issue.url);
		}
	}
</script>

<a
	href={issue.url}
	class="issue-item"
	class:active={isActive}
	onclick={handleClick}
>
	<div class="issue-title">
		<span class="title-text">{issue.title}</span>
		<span class="issue-number">#{issue.number}</span>
	</div>
	{#if issue.labels.length > 0}
		<div class="issue-meta">
			{#each issue.labels as label}
				<span
					class="label-badge"
					style="background-color: #{label.color};"
				>{label.name}</span>
			{/each}
		</div>
	{/if}
</a>

<style>
	.issue-item {
		display: block;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--color-border-primary);
		transition: background 0.15s;
		text-decoration: none;
		color: inherit;
	}

	.issue-item:hover {
		background: var(--color-bg-hover);
	}

	.issue-item.active {
		background: var(--color-bg-secondary);
		border-left: 2px solid var(--color-accent-primary);
	}

	.issue-title {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--color-accent-primary);
	}

	.issue-number {
		color: var(--color-text-secondary);
		margin-left: 0.25rem;
	}

	.issue-meta {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.125rem;
		flex-wrap: wrap;
	}

	.label-badge {
		font-size: 0.625rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
		color: #fff;
		line-height: 1.4;
	}
</style>
