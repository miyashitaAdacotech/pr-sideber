import type { DeviceFlowState, createAuthUseCase } from "./auth.usecase";

export type DeviceFlowController = {
	readonly getState: () => DeviceFlowState;
	readonly startFlow: () => Promise<void>;
	readonly waitForAuthorization: () => Promise<void>;
	readonly startAndWait: () => Promise<void>;
	readonly subscribe: (listener: (state: DeviceFlowState) => void) => () => void;
};

type PendingRequest = {
	readonly deviceCode: string;
	readonly interval: number;
	readonly expiresIn: number;
};

export function createDeviceFlowController(
	authUseCase: Pick<
		ReturnType<typeof createAuthUseCase>,
		"requestDeviceCode" | "waitForAuthorization"
	>,
): DeviceFlowController {
	let state: DeviceFlowState = { phase: "idle" };
	let pendingRequest: PendingRequest | undefined;
	const listeners = new Set<(state: DeviceFlowState) => void>();

	function setState(newState: DeviceFlowState): void {
		state = newState;
		for (const listener of listeners) {
			listener(state);
		}
	}

	async function startFlow(): Promise<void> {
		try {
			const result = await authUseCase.requestDeviceCode();
			pendingRequest = {
				deviceCode: result.deviceCode,
				interval: result.interval,
				expiresIn: result.expiresIn,
			};
			setState({
				phase: "awaiting_user",
				userCode: result.userCode,
				verificationUri: result.verificationUri,
			});
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			setState({ phase: "error", message });
		}
	}

	async function waitForAuthorization(): Promise<void> {
		if (pendingRequest === undefined) {
			throw new Error("Device code not available");
		}

		try {
			await authUseCase.waitForAuthorization(
				pendingRequest.deviceCode,
				pendingRequest.interval,
				pendingRequest.expiresIn,
				(newState) => {
					setState(newState);
				},
			);
		} catch (error: unknown) {
			const current = state;
			if (current.phase !== "error" && current.phase !== "expired" && current.phase !== "denied") {
				const message = error instanceof Error ? error.message : String(error);
				setState({ phase: "error", message });
			}
		}
	}

	async function startAndWait(): Promise<void> {
		await startFlow();

		if (state.phase !== "awaiting_user") {
			return;
		}

		await waitForAuthorization();
	}

	function subscribe(listener: (state: DeviceFlowState) => void): () => void {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	}

	return {
		getState: () => state,
		startFlow,
		waitForAuthorization,
		startAndWait,
		subscribe,
	};
}
