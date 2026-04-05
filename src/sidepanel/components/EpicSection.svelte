<script lang="ts">
	import type { EpicTreeDto } from "../../domain/ports/epic-processor.port";
	import type { WorkspaceResources } from "../../shared/utils/workspace-resources";
	import TreeNode from "./TreeNode.svelte";

	type Props = {
		tree: EpicTreeDto | null;
		activeTabUrl?: string | null;
		activeWorkspaceIssueNumber?: number | null;
		onNavigate?: (url: string) => void;
		onOpenWorkspace?: (resources: WorkspaceResources) => void;
	};

	const { tree, activeTabUrl, activeWorkspaceIssueNumber, onNavigate, onOpenWorkspace }: Props = $props();
</script>

{#if tree}
	<section class="epic-section">
		{#if tree.roots.length === 0}
			<p class="empty-message">Epic がありません</p>
		{:else}
			{#each tree.roots as root (root.kind.type === "epic" ? `epic-${root.kind.number}` : root.kind.type === "issue" ? `issue-${root.kind.number}` : root.kind.type === "pullRequest" ? `pr-${root.kind.number}` : `session-${root.depth}`)}
				<TreeNode node={root} {activeTabUrl} {activeWorkspaceIssueNumber} {onNavigate} {onOpenWorkspace} />
			{/each}
		{/if}
	</section>
{/if}

<style>
	.epic-section {
		margin-bottom: 0.75rem;
	}

	.empty-message {
		color: var(--color-text-secondary);
		font-size: 0.8125rem;
		font-style: italic;
		padding: 0.375rem 0.5rem;
	}
</style>
