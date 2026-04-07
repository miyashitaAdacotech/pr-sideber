<script lang="ts">
	import type { TreeNodeDto } from "../../domain/ports/epic-processor.port";
	import { safeUrl } from "../../shared/utils/url";
	import type { WorkspaceResources } from "../../shared/utils/workspace-resources";
	import { resolveWorkspaceResources } from "../../shared/utils/workspace-resources";
	import TreeNode from "./TreeNode.svelte";

	type Props = {
		node: TreeNodeDto;
		activeTabUrl?: string | null;
		activeWorkspaceIssueNumber?: number | null;
		parentIsActiveWorkspace?: boolean;
		onNavigate?: (url: string) => void;
		onOpenWorkspace?: (resources: WorkspaceResources) => void;
	};

	const { node, activeTabUrl, activeWorkspaceIssueNumber, parentIsActiveWorkspace = false, onNavigate, onOpenWorkspace }: Props = $props();

	let open = $state(true);
	let hovered = $state(false);
	const hasChildren = $derived(node.children.length > 0);
	const MAX_INDENT_DEPTH = 3;
	const displayDepth = $derived(Math.min(node.depth, MAX_INDENT_DEPTH));
	const isDeepNested = $derived(node.depth > MAX_INDENT_DEPTH);

	const nodeUrl = $derived(
		node.kind.type === "issue" || node.kind.type === "pullRequest" || node.kind.type === "session"
			? node.kind.url
			: null,
	);

	const isActive = $derived(
		activeTabUrl != null && nodeUrl != null && activeTabUrl.includes(nodeUrl),
	);

	const isWorkspaceActive = $derived(
		parentIsActiveWorkspace ||
		(node.kind.type === "issue" && activeWorkspaceIssueNumber === node.kind.number),
	);

	function toggle(): void {
		open = !open;
	}

	function handleNavigate(event: MouseEvent, url: string): void {
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		onNavigate?.(url);
	}

	function handleOpenWorkspace(event: MouseEvent): void {
		event.stopPropagation();
		event.preventDefault();
		if (node.kind.type !== "issue" || !onOpenWorkspace) return;
		const resources = resolveWorkspaceResources(node);
		onOpenWorkspace(resources);
	}
</script>

<div
	class="tree-node"
	class:active={isActive}
	class:workspace-active={isWorkspaceActive}
	style="padding-left: calc({displayDepth} * 1.2rem)"
>
	{#if node.kind.type === "epic"}
		<button class="node-header" onclick={toggle}>
			{#if isDeepNested}<span class="deep-indicator">&#8627;</span>{/if}
			<span class="node-icon">&#128193;</span>
			<span class="node-number">#{node.kind.number}</span>
			<span class="node-title truncate">{node.kind.title}</span>
			{#if hasChildren}
				<span class="child-count">{node.children.length}</span>
			{/if}
		</button>
	{:else if node.kind.type === "issue"}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="node-content"
			onclick={(e) => handleNavigate(e, node.kind.type === "issue" ? node.kind.url : "")}
			onmouseenter={() => hovered = true}
			onmouseleave={() => hovered = false}
		>
			{#if isDeepNested}<span class="deep-indicator">&#8627;</span>{/if}
			{#if hasChildren}
				<button class="inline-toggle" onclick={(e) => { e.stopPropagation(); toggle(); }}>
				</button>
			{/if}
			<span class="node-icon">&#128203;</span>
			<span class="node-number">#{node.kind.number}</span>
			<a class="node-title clickable truncate" href={safeUrl(node.kind.url)} target="_blank" rel="noopener noreferrer">
				{node.kind.title}
			</a>
			{#if node.kind.state === "CLOSED"}
				<span class="state-badge closed">Closed</span>
			{/if}
			{#if hovered && onOpenWorkspace}
				<button
					class="workspace-btn"
					title="ワークスペースを開く"
					onclick={handleOpenWorkspace}
				>&#10697;</button>
			{/if}
		</div>
	{:else if node.kind.type === "pullRequest"}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="node-content" onclick={(e) => handleNavigate(e, node.kind.type === "pullRequest" ? node.kind.url : "")}>
			{#if isDeepNested}<span class="deep-indicator">&#8627;</span>{/if}
			<span class="node-icon">&#128256;</span>
			<span class="node-number">#{node.kind.number}</span>
			<a class="node-title clickable truncate" href={safeUrl(node.kind.type === "pullRequest" ? node.kind.url : "")} target="_blank" rel="noopener noreferrer">
				{node.kind.title}
			</a>
			<span class="size-text">
				<span class="additions">+{node.kind.prData.additions}</span>
				<span class="deletions">-{node.kind.prData.deletions}</span>
			</span>
			{#if node.kind.prData.isDraft}
				<span class="state-badge draft">Draft</span>
			{/if}
			{#if !node.kind.prData.isDraft}
				{#if node.kind.prData.approvalStatus === "Approved"}
					<span class="state-badge approved">Approved</span>
				{:else if node.kind.prData.approvalStatus === "ChangesRequested"}
					<span class="state-badge changes-requested">Changes</span>
				{/if}
				{#if node.kind.prData.ciStatus === "Passed"}
					<span class="ci-badge passed">CI</span>
				{:else if node.kind.prData.ciStatus === "Failed"}
					<span class="ci-badge failed">CI</span>
				{:else if node.kind.prData.ciStatus === "Pending"}
					<span class="ci-badge pending">CI</span>
				{/if}
			{/if}
		</div>
	{:else if node.kind.type === "session"}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="node-content" onclick={(e) => handleNavigate(e, node.kind.type === "session" ? node.kind.url : "")}>
			{#if isDeepNested}<span class="deep-indicator">&#8627;</span>{/if}
			<span class="node-icon">&#129302;</span>
			<a class="node-title clickable" href={safeUrl(node.kind.type === "session" ? node.kind.url : "")} target="_blank" rel="noopener noreferrer">
				{node.kind.title}
			</a>
		</div>
	{/if}

	{#if open && hasChildren}
		<div class="children">
			{#each node.children as child (child.kind.type === "epic" ? `epic-${child.kind.number}` : child.kind.type === "issue" ? `issue-${child.kind.number}` : child.kind.type === "pullRequest" ? `pr-${child.kind.number}` : `session-${child.kind.url}`)}
				<TreeNode node={child} {activeTabUrl} {activeWorkspaceIssueNumber} parentIsActiveWorkspace={isWorkspaceActive} {onNavigate} {onOpenWorkspace} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.tree-node {
		border-bottom: 1px solid var(--color-border-primary);
	}

	.tree-node.active {
		background: var(--color-bg-secondary);
		border-left: 2px solid var(--color-accent-primary);
	}

	.tree-node.workspace-active {
		background: rgba(163, 113, 247, 0.15);
		border-left: 3px solid #a371f7;
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		width: 100%;
		min-width: 0;
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		border-radius: 4px;
		transition: background 0.15s;
		color: var(--color-text-primary);
	}

	.node-header:hover {
		background: var(--color-bg-hover);
	}

	.node-content {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
		padding: 0.375rem 0.5rem;
		cursor: pointer;
		transition: background 0.15s;
		flex-wrap: wrap;
	}

	.node-content:hover {
		background: var(--color-bg-hover);
	}

	.node-icon {
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.toggle-icon {
		font-size: 0.5rem;
		color: var(--color-text-secondary);
		flex-shrink: 0;
	}

	.inline-toggle {
		display: flex;
		align-items: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: var(--color-text-secondary);
	}

	.node-title {
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--color-text-primary);
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-title.clickable {
		color: var(--color-accent-primary);
		text-decoration: none;
		font-weight: normal;
	}

	.node-title.clickable:hover {
		text-decoration: underline;
	}

	.node-title.truncate {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.node-number {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.child-count {
		font-size: 0.6875rem;
		color: var(--color-text-secondary);
		background: var(--color-bg-secondary);
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
	}

	.deep-indicator {
		color: var(--color-text-secondary);
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.state-badge {
		font-size: 0.625rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.state-badge.closed {
		background: var(--color-badge-red);
		color: #fff;
	}

	.state-badge.draft {
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
	}

	.state-badge.approved {
		background: var(--color-badge-green);
		color: #fff;
	}

	.state-badge.changes-requested {
		background: var(--color-badge-red);
		color: #fff;
	}

	.ci-badge {
		font-size: 0.625rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
		flex-shrink: 0;
	}

	.ci-badge.passed {
		background: var(--color-badge-green);
		color: #fff;
	}

	.ci-badge.failed {
		background: var(--color-badge-red);
		color: #fff;
	}

	.ci-badge.pending {
		background: var(--color-badge-yellow);
		color: #856404;
	}

	.size-text {
		font-size: 0.6875rem;
		flex-shrink: 0;
	}

	.additions {
		color: var(--color-badge-green);
	}

	.deletions {
		color: var(--color-badge-red);
	}

	.labels {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
	}

	.label-badge {
		font-size: 0.625rem;
		padding: 0.0625rem 0.375rem;
		border-radius: 10px;
		color: #fff;
		line-height: 1.4;
	}

	.workspace-btn {
		background: #30363d;
		border: 1px solid #484f58;
		border-radius: 4px;
		padding: 0.0625rem 0.375rem;
		color: #8b949e;
		cursor: pointer;
		font-size: 0.75rem;
		flex-shrink: 0;
		line-height: 1;
		transition: background 0.15s, color 0.15s;
	}

	.workspace-btn:hover {
		background: #484f58;
		color: #e6edf3;
	}

</style>
