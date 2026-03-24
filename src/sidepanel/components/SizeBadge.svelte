<script lang="ts">
	import "../styles/badge.css";

	type Props = Readonly<{
		additions: number;
		deletions: number;
	}>;

	const { additions, deletions }: Props = $props();
</script>

<span class="badge badge-green">+{additions}</span>
<span class="badge badge-red">-{deletions}</span>
