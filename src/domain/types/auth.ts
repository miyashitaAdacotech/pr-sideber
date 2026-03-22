export type AuthToken = {
	readonly accessToken: string;
	readonly tokenType: string;
	readonly scope: string;
	readonly expiresAt?: number;
	readonly refreshToken?: string;
};
