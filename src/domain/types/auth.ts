export type AuthToken = {
	readonly accessToken: string;
	readonly tokenType: string;
	readonly scope: string;
	readonly expiresAt?: number;
	readonly refreshToken?: string;
};

export type DeviceCodeResponse = {
	readonly deviceCode: string;
	readonly userCode: string;
	readonly verificationUri: string;
	readonly expiresIn: number;
	readonly interval: number;
};

/** Device Flow 1回分のポーリング結果 */
export type PollResult =
	| { readonly status: "success"; readonly token: AuthToken }
	| { readonly status: "pending" }
	| { readonly status: "slow_down"; readonly interval: number }
	| { readonly status: "expired" }
	| { readonly status: "denied" };
