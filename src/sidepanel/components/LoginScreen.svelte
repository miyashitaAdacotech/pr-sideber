<script lang="ts">
	type Props = {
		onLogin: () => Promise<void>;
	};

	const { onLogin }: Props = $props();

	let loading = $state(false);
	let error = $state<string | null>(null);

	async function handleLogin() {
		loading = true;
		error = null;
		try {
			await onLogin();
		} catch (e: unknown) {
			error = e instanceof Error ? e.message : "Unknown error";
		} finally {
			loading = false;
		}
	}
</script>

<div class="login-screen">
	<h2>GitHub OAuth Login</h2>
	<p>PR Sidebar を利用するには GitHub アカウントでログインしてください。</p>

	<button onclick={handleLogin} disabled={loading}>
		{loading ? "Logging in..." : "Login with GitHub"}
	</button>

	{#if error}
		<p class="error">{error}</p>
	{/if}
</div>

<style>
	.login-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
		gap: 1rem;
	}

	button {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #24292e;
		color: #fff;
	}

	button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error {
		color: #d73a49;
	}
</style>
