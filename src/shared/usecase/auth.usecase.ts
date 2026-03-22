import type { DeviceCodeResponse, PollResult } from "../../domain/types/auth";
import type { SendMessage } from "../ports/message.port";
import { AuthError, isAuthErrorCode } from "../types/auth";
import type { ResponseMessage } from "../types/messages";

/** Side Panel 側のポーリング間隔下限 (秒) */
const MIN_POLL_INTERVAL_SEC = 5;

/** ネットワークエラー等の一時障害に対するリトライ上限 */
const MAX_POLL_RETRIES = 3;

/** slow_down 応答時のポーリング間隔上限 (秒) */
const MAX_POLL_INTERVAL_SEC = 60;

/** リトライ可能なエラーレスポンスの code 一覧 */
const RETRYABLE_ERROR_CODES = new Set(["RUNTIME_ERROR", "NO_RESPONSE"]);

export type DeviceFlowState =
	| { readonly phase: "idle" }
	| { readonly phase: "awaiting_user"; readonly userCode: string; readonly verificationUri: string }
	| { readonly phase: "polling" }
	| { readonly phase: "success" }
	| { readonly phase: "expired" }
	| { readonly phase: "denied" }
	| { readonly phase: "error"; readonly message: string };

export function createAuthUseCase(sendMessage: SendMessage) {
	async function logout(): Promise<void> {
		const response = await sendMessage("AUTH_LOGOUT");
		if (!response.ok) {
			throw new Error("Logout failed. Please try again.");
		}
	}

	async function checkAuth(): Promise<boolean> {
		try {
			const response = await sendMessage("AUTH_STATUS");
			if (!response.ok) {
				return false;
			}
			return response.data.isAuthenticated;
		} catch (error) {
			if (import.meta.env.DEV) {
				console.error("[auth.usecase] checkAuth failed:", error);
			}
			return false;
		}
	}

	async function requestDeviceCode(): Promise<DeviceCodeResponse> {
		const response = await sendMessage("AUTH_DEVICE_CODE");
		if (!response.ok) {
			if (isAuthErrorCode(response.error.code)) {
				throw new AuthError(response.error.code, response.error.message);
			}
			throw new Error(response.error.message);
		}
		return response.data;
	}

	/**
	 * Side Panel 側でポーリングループを制御する。
	 * Background の pollForToken は 1回分の試行のみ行い即座に結果を返す。
	 * Service Worker の30秒キル問題を回避するための設計。
	 */
	async function waitForAuthorization(
		deviceCode: string,
		interval: number,
		expiresIn: number,
		onStateChange?: (state: DeviceFlowState) => void,
	): Promise<void> {
		let currentInterval = Math.max(interval, MIN_POLL_INTERVAL_SEC);
		const deadline = Date.now() + expiresIn * 1000;

		onStateChange?.({ phase: "polling" });

		/**
		 * 1回分のポーリングをリトライ付きで実行する。
		 * sendMessage の throw や RUNTIME_ERROR/NO_RESPONSE は一時障害として
		 * 最大 MAX_POLL_RETRIES 回までリトライする。
		 * それ以外のエラーレスポンスは即座に上位へ伝播する。
		 */
		async function pollWithRetry(): Promise<PollResult> {
			let lastError: Error | undefined;

			for (let attempt = 0; attempt < MAX_POLL_RETRIES; attempt++) {
				if (attempt > 0) {
					await wait(attempt * 500);
					if (Date.now() >= deadline) {
						onStateChange?.({ phase: "expired" });
						throw new Error("Device flow expired. Please try again.");
					}
				}
				let response: ResponseMessage<"AUTH_DEVICE_POLL">;
				try {
					response = await sendMessage("AUTH_DEVICE_POLL", { deviceCode });
				} catch (error) {
					// sendMessage が throw した場合 (ネットワーク断等): リトライ可能
					lastError = error instanceof Error ? error : new Error(String(error));
					continue;
				}

				if (!response.ok) {
					if (RETRYABLE_ERROR_CODES.has(response.error.code)) {
						lastError = new Error(response.error.message);
						continue;
					}
					// リトライ不可のエラーは即 throw (controller の catch で toUserFacingMessage が適用される)
					if (isAuthErrorCode(response.error.code)) {
						throw new AuthError(response.error.code, response.error.message);
					}
					throw new Error(response.error.message);
				}

				return response.data;
			}

			// リトライ上限超過 (controller の catch で toUserFacingMessage が適用される)
			throw lastError ?? new Error("Unknown polling error");
		}

		while (Date.now() < deadline) {
			await wait(currentInterval * 1000);

			if (Date.now() >= deadline) {
				onStateChange?.({ phase: "expired" });
				throw new Error("Device flow expired. Please try again.");
			}

			const result = await pollWithRetry();

			switch (result.status) {
				case "success":
					onStateChange?.({ phase: "success" });
					return;
				case "pending":
					continue;
				case "slow_down":
					currentInterval = Math.min(
						Math.max(result.interval, currentInterval + 5),
						MAX_POLL_INTERVAL_SEC,
					);
					continue;
				case "expired":
					onStateChange?.({ phase: "expired" });
					throw new Error("Device flow expired. Please try again.");
				case "denied":
					onStateChange?.({ phase: "denied" });
					throw new Error("Authorization denied by user.");
			}
		}

		onStateChange?.({ phase: "expired" });
		throw new Error("Device flow expired. Please try again.");
	}

	return { logout, checkAuth, requestDeviceCode, waitForAuthorization };
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
