<script lang="ts">
	import { formatRelativeTime } from "../../shared/utils/time";
	import { subscribe } from "../../shared/stores/relative-time-tick.svelte";

	type Props = {
		dateStr: string;
	};

	const { dateStr }: Props = $props();

	const timer = subscribe();

	const display = $derived.by(() => {
		void timer.tick;
		return formatRelativeTime(dateStr);
	});

	$effect.pre(() => {
		return () => timer.unsubscribe();
	});
</script>

<span>{display}</span>
