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
		padding: 2rem;
		gap: 1rem;
	}

	.login-btn {
		padding: 0.75rem 1.5rem;
		font-size: 1rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 6px;
		background: #24292e;
		color: #fff;
	}

	.login-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.device-flow {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		border: 1px solid #e1e4e8;
		border-radius: 8px;
		background: #f6f8fa;
	}

	.instruction {
		font-weight: 600;
	}

	.user-code-container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-code {
		font-size: 1.5rem;
		font-weight: bold;
		letter-spacing: 0.15em;
		padding: 0.5rem 1rem;
		background: #fff;
		border: 2px solid #0366d6;
		border-radius: 6px;
	}

	.copy-btn {
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #fff;
		font-size: 0.85rem;
	}

	.verification-link {
		color: #0366d6;
		text-decoration: underline;
		cursor: pointer;
	}

	.polling-status {
		color: #586069;
		font-style: italic;
	}

	.error {
		color: #d73a49;
	}

	.success {
		color: #28a745;
		font-weight: 600;
	}
</style>
