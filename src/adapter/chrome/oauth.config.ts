export type OAuthConfig = {
	readonly clientId: string;
	readonly deviceCodeEndpoint: string;
	readonly tokenEndpoint: string;
	readonly scopes: readonly string[];
};

export function createOAuthConfig(): OAuthConfig {
	const clientId = import.meta.env.GITHUB_CLIENT_ID;

	if (!clientId) {
		throw new Error("GITHUB_CLIENT_ID is not configured");
	}

	return {
		clientId,
		deviceCodeEndpoint: "https://github.com/login/device/code",
		tokenEndpoint: "https://github.com/login/oauth/access_token",
		// GitHub API で private repo の PR を読むには "repo" スコープが必須
		// (read-only の個別スコープは GitHub が提供していない)
		scopes: ["repo"],
	};
}
