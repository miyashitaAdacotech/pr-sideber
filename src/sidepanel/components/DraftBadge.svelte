<script lang="ts">
	import "../styles/badge.css";

	type Props = {
		isDraft: boolean;
	};

	const { isDraft }: Props = $props();
</script>

{#if isDraft}
	<span class="badge badge-gray">DRAFT</span>
{/if}
