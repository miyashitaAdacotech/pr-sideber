<script lang="ts">
	import type { DeviceFlowState } from "../../shared/usecase/auth.usecase";
	import type { DeviceFlowController } from "../../shared/usecase/device-flow.controller";

	type Props = {
		controller: DeviceFlowController;
	};

	const { controller }: Props = $props();

	let flowState = $state<DeviceFlowState>(controller.getState());
	let inProgress = $state(false);
	let lastUserCode = $state<string | null>(null);

	$effect(() => {
		return controller.subscribe((state) => {
			flowState = state;
			if (state.phase === "awaiting_user") {
				lastUserCode = state.userCode;
			}
		});
	});

	async function handleStartFlow() {
		if (inProgress) return;
		inProgress = true;

		try {
			await controller.startAndWait();
		} finally {
			inProgress = false;
		}
	}

	function handleCopyCode() {
		if (lastUserCode !== null) {
			navigator.clipboard.writeText(lastUserCode);
		}
	}

	function openVerificationUri() {
		if (flowState.phase === "awaiting_user" && flowState.verificationUri.startsWith("https://")) {
			window.open(flowState.verificationUri, "_blank");
		}
	}
</script>

<div class="login-screen">
	<h2>GitHub OAuth Login</h2>

	{#if flowState.phase === "idle" || flowState.phase === "error" || flowState.phase === "expired" || flowState.phase === "denied"}
		<p>PR Sidebar を利用するには GitHub アカウントでログインしてください。</p>

		<button class="login-btn" disabled={inProgress} onclick={handleStartFlow}>
			Login with GitHub
		</button>

		{#if flowState.phase === "error"}
			<p class="error">{flowState.message}</p>
		{/if}
	{/if}

	{#if flowState.phase === "awaiting_user" || flowState.phase === "polling"}
		<div class="device-flow">
			<p class="instruction">以下のコードを GitHub に入力してください:</p>

			<div class="user-code-container">
				<code class="user-code">{flowState.phase === "awaiting_user" ? flowState.userCode : lastUserCode ?? ""}</code>
				<button class="copy-btn" onclick={handleCopyCode}>Copy</button>
			</div>

			{#if flowState.phase === "awaiting_user"}
				<a
					class="verification-link"
					href={flowState.verificationUri}
					onclick={(e) => { e.preventDefault(); openVerificationUri(); }}
				>
					{flowState.verificationUri} を開く
				</a>
			{/if}

			<p class="polling-status">認証待ち...</p>
		</div>
	{/if}

	{#if flowState.phase === "success"}
		<p class="success">認証成功!</p>
	{/if}
</div>

<style>
	.login-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1rem;
		gap: 1rem;
		min-height: 100vh;
		background: var(--color-bg-primary);
	}

	h2 {
		color: var(--color-text-primary);
		font-size: 1rem;
	}

	p {
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		text-align: center;
	}

	.login-btn {
		padding: 0.625rem 1.25rem;
		font-size: 0.875rem;
		cursor: pointer;
		border: 1px solid var(--color-border-primary);
		border-radius: 6px;
		background: var(--color-accent-primary);
		color: var(--color-bg-primary);
		font-weight: 600;
		transition: opacity 0.15s;
	}

	.login-btn:hover {
		opacity: 0.85;
	}

	.login-btn:active {
		opacity: 0.7;
	}

	.login-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.device-flow {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid var(--color-border-primary);
		border-radius: 8px;
		background: var(--color-bg-secondary);
		width: 100%;
		max-width: 320px;
	}

	.instruction {
		font-weight: 600;
		color: var(--color-text-primary);
	}

	.user-code-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-code {
		font-size: 1.25rem;
		font-weight: bold;
		letter-spacing: 0.15em;
		padding: 0.375rem 0.75rem;
		background: var(--color-bg-primary);
		border: 2px solid var(--color-accent-primary);
		border-radius: 6px;
		color: var(--color-accent-primary);
	}

	.copy-btn {
		padding: 0.375rem 0.625rem;
		cursor: pointer;
		border: 1px solid var(--color-border-primary);
		border-radius: 4px;
		background: var(--color-bg-hover);
		color: var(--color-text-primary);
		font-size: 0.8125rem;
		transition: background 0.15s;
	}

	.copy-btn:hover {
		background: var(--color-bg-secondary);
	}

	.copy-btn:active {
		background: var(--color-border-primary);
	}

	.verification-link {
		color: var(--color-accent-primary);
		text-decoration: underline;
		cursor: pointer;
		font-size: 0.8125rem;
	}

	.polling-status {
		color: var(--color-text-secondary);
		font-style: italic;
		font-size: 0.8125rem;
	}

	.error {
		color: var(--color-badge-red);
		font-size: 0.8125rem;
	}

	.success {
		color: var(--color-badge-green);
		font-weight: 600;
		font-size: 0.875rem;
	}
</style>
