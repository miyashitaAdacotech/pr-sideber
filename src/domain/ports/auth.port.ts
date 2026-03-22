import type { AuthToken, DeviceCodeResponse, PollResult } from "../types/auth";

export interface AuthPort {
	getToken(): Promise<AuthToken | null>;
	clearToken(): Promise<void>;
	isAuthenticated(): Promise<boolean>;
	requestDeviceCode(): Promise<DeviceCodeResponse>;
	/** 1回分のトークン取得試行。Service Worker 30秒制限のためループせず即座に結果を返す */
	pollForToken(deviceCode: string): Promise<PollResult>;
}
