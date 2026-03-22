import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeviceCodeResponse, PollResult } from "../../../domain/types/auth";
import type { DeviceFlowState } from "../../../shared/usecase/auth.usecase";
import { createDeviceFlowController } from "../../../shared/usecase/device-flow.controller";

describe("device-flow controller", () => {
	let mockRequestDeviceCode: ReturnType<typeof vi.fn>;
	let mockWaitForAuthorization: ReturnType<typeof vi.fn>;

	function buildController() {
		return createDeviceFlowController({
			requestDeviceCode: mockRequestDeviceCode,
			waitForAuthorization: mockWaitForAuthorization,
		});
	}

	const deviceCodeResponse: DeviceCodeResponse = {
		deviceCode: "dc-abc123",
		userCode: "ABCD-1234",
		verificationUri: "https://github.com/login/device",
		expiresIn: 900,
		interval: 5,
	};

	beforeEach(() => {
		mockRequestDeviceCode = vi.fn();
		mockWaitForAuthorization = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("startFlow() が requestDeviceCode を呼び、state を awaiting_user に遷移させること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		// waitForAuthorization は startFlow 内では呼ばれない想定だが、
		// 実装によっては呼ばれうるので pending な Promise を返す
		mockWaitForAuthorization.mockReturnValue(new Promise(() => {}));

		const controller = buildController();

		expect(controller.getState()).toEqual({ phase: "idle" });

		await controller.startFlow();

		expect(mockRequestDeviceCode).toHaveBeenCalledOnce();
		expect(mockWaitForAuthorization).not.toHaveBeenCalled();
		const state = controller.getState();
		expect(state.phase).toBe("awaiting_user");
		if (state.phase === "awaiting_user") {
			expect(state.userCode).toBe("ABCD-1234");
			expect(state.verificationUri).toBe("https://github.com/login/device");
		}
	});

	it("startFlow() 失敗時に state が error になること", async () => {
		mockRequestDeviceCode.mockRejectedValue(new Error("Network failure"));

		const controller = buildController();

		await controller.startFlow();

		const state = controller.getState();
		expect(state.phase).toBe("error");
		if (state.phase === "error") {
			expect(state.message).toBe("Network failure");
		}
	});

	it("waitForAuthorization() が保持された deviceCode で authUseCase.waitForAuthorization を呼ぶこと", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockResolvedValue(undefined);

		const controller = buildController();
		await controller.startFlow();
		await controller.waitForAuthorization();

		expect(mockWaitForAuthorization).toHaveBeenCalledOnce();
		expect(mockWaitForAuthorization).toHaveBeenCalledWith(
			"dc-abc123",
			5,
			900,
			expect.any(Function),
		);
	});

	it("waitForAuthorization() 成功時に state が success になること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		// waitForAuthorization 内で onStateChange コールバックを呼ぶことをシミュレート
		mockWaitForAuthorization.mockImplementation(
			async (
				_deviceCode: string,
				_interval: number,
				_expiresIn: number,
				onStateChange?: (state: DeviceFlowState) => void,
			) => {
				onStateChange?.({ phase: "polling" });
				onStateChange?.({ phase: "success" });
			},
		);

		const controller = buildController();
		await controller.startFlow();
		await controller.waitForAuthorization();

		expect(controller.getState()).toEqual({ phase: "success" });
	});

	it("waitForAuthorization() で expired が来た場合、state が expired のまま resolve すること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockImplementation(
			async (
				_deviceCode: string,
				_interval: number,
				_expiresIn: number,
				onStateChange?: (state: DeviceFlowState) => void,
			) => {
				onStateChange?.({ phase: "polling" });
				onStateChange?.({ phase: "expired" });
			},
		);

		const controller = buildController();
		await controller.startFlow();

		// expired 時は reject せず resolve する（エラーは内部で処理し state で表現）
		await expect(controller.waitForAuthorization()).resolves.toBeUndefined();
		expect(controller.getState()).toEqual({ phase: "expired" });
	});

	it("waitForAuthorization() で denied が来た場合、state が denied のまま resolve すること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockImplementation(
			async (
				_deviceCode: string,
				_interval: number,
				_expiresIn: number,
				onStateChange?: (state: DeviceFlowState) => void,
			) => {
				onStateChange?.({ phase: "polling" });
				onStateChange?.({ phase: "denied" });
			},
		);

		const controller = buildController();
		await controller.startFlow();

		// denied 時も reject せず resolve する（エラーは内部で処理し state で表現）
		await expect(controller.waitForAuthorization()).resolves.toBeUndefined();
		expect(controller.getState()).toEqual({ phase: "denied" });
	});

	it("startFlow() 未実行で waitForAuthorization() を呼ぶとエラーになること", async () => {
		const controller = buildController();

		await expect(controller.waitForAuthorization()).rejects.toThrow("Device code not available");
	});

	it("subscribe でリスナーが state 変更を受け取ること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockReturnValue(new Promise(() => {}));

		const controller = buildController();
		const listener = vi.fn();

		controller.subscribe(listener);
		await controller.startFlow();

		// awaiting_user への遷移を listener が受け取っている
		expect(listener).toHaveBeenCalled();
		const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as DeviceFlowState;
		expect(lastCall.phase).toBe("awaiting_user");
	});

	it("subscribe の戻り値で unsubscribe できること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockReturnValue(new Promise(() => {}));

		const controller = buildController();
		const listener = vi.fn();

		const unsubscribe = controller.subscribe(listener);
		unsubscribe();

		await controller.startFlow();

		// unsubscribe 後は listener が呼ばれない
		expect(listener).not.toHaveBeenCalled();
	});

	it("startFlow() を2回呼んだ場合、状態がリセットされ新しい device code に更新されること", async () => {
		const secondDeviceCodeResponse: DeviceCodeResponse = {
			deviceCode: "dc-xyz789",
			userCode: "WXYZ-5678",
			verificationUri: "https://github.com/login/device",
			expiresIn: 600,
			interval: 10,
		};

		mockRequestDeviceCode
			.mockResolvedValueOnce(deviceCodeResponse)
			.mockResolvedValueOnce(secondDeviceCodeResponse);
		mockWaitForAuthorization.mockReturnValue(new Promise(() => {}));

		const controller = buildController();

		await controller.startFlow();
		expect(controller.getState()).toEqual({
			phase: "awaiting_user",
			userCode: "ABCD-1234",
			verificationUri: "https://github.com/login/device",
		});

		await controller.startFlow();
		expect(controller.getState()).toEqual({
			phase: "awaiting_user",
			userCode: "WXYZ-5678",
			verificationUri: "https://github.com/login/device",
		});

		expect(mockRequestDeviceCode).toHaveBeenCalledTimes(2);
	});

	it("startAndWait() が startFlow → waitForAuthorization を順次実行すること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockImplementation(
			async (
				_deviceCode: string,
				_interval: number,
				_expiresIn: number,
				onStateChange?: (state: DeviceFlowState) => void,
			) => {
				onStateChange?.({ phase: "polling" });
				onStateChange?.({ phase: "success" });
			},
		);

		const controller = buildController();
		const listener = vi.fn();
		controller.subscribe(listener);

		await controller.startAndWait();

		// requestDeviceCode と waitForAuthorization が両方呼ばれている
		expect(mockRequestDeviceCode).toHaveBeenCalledOnce();
		expect(mockWaitForAuthorization).toHaveBeenCalledOnce();
		expect(controller.getState()).toEqual({ phase: "success" });

		// state 遷移の順序: awaiting_user → polling → success
		const phases = listener.mock.calls.map((call) => (call[0] as DeviceFlowState).phase);
		expect(phases).toEqual(["awaiting_user", "polling", "success"]);
	});

	it("startAndWait() で startFlow が失敗した場合、waitForAuthorization は呼ばれないこと", async () => {
		mockRequestDeviceCode.mockRejectedValue(new Error("Network failure"));

		const controller = buildController();

		await controller.startAndWait();

		expect(mockRequestDeviceCode).toHaveBeenCalledOnce();
		expect(mockWaitForAuthorization).not.toHaveBeenCalled();
		expect(controller.getState().phase).toBe("error");
	});

	it("catch 防御: onStateChange 未呼び出しで throw された場合に error state に遷移すること", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		// onStateChange を呼ばずに直接 throw する
		mockWaitForAuthorization.mockRejectedValue(new Error("Unexpected crash"));

		const controller = buildController();
		await controller.startFlow();

		// startFlow 後は awaiting_user のはず
		expect(controller.getState().phase).toBe("awaiting_user");

		await controller.waitForAuthorization();

		// catch 防御により error state に遷移している
		const state = controller.getState();
		expect(state.phase).toBe("error");
		if (state.phase === "error") {
			expect(state.message).toBe("Unexpected crash");
		}
	});

	it("catch 防御: onStateChange で expired に遷移済みの場合、error に上書きしないこと", async () => {
		mockRequestDeviceCode.mockResolvedValue(deviceCodeResponse);
		mockWaitForAuthorization.mockImplementation(
			async (
				_deviceCode: string,
				_interval: number,
				_expiresIn: number,
				onStateChange?: (state: DeviceFlowState) => void,
			) => {
				onStateChange?.({ phase: "expired" });
				throw new Error("Device flow expired");
			},
		);

		const controller = buildController();
		await controller.startFlow();
		await controller.waitForAuthorization();

		// expired のまま、error に上書きされていない
		expect(controller.getState()).toEqual({ phase: "expired" });
	});
});
