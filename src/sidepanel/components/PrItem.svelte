<script lang="ts">
	import type { PullRequest } from "../../domain/types/github";
	import { formatRelativeTime } from "../../shared/utils/time";
	import { safeUrl } from "../../shared/utils/url";

	type Props = {
		pr: PullRequest;
	};

	const { pr }: Props = $props();
</script>

<div class="pr-item">
	<a class="pr-title" href={safeUrl(pr.url)} target="_blank" rel="noopener noreferrer">
		#{pr.number} {pr.title}
	</a>
	<div class="pr-meta">
		<span class="pr-repo">{pr.repository.nameWithOwner}</span>
		<span class="pr-updated">{formatRelativeTime(pr.updatedAt)}</span>
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
</style>
