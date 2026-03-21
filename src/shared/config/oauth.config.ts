import type { OAuthConfig } from "../types/auth";

export function createOAuthConfig(redirectUri: string): OAuthConfig {
	const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
	const clientSecret = import.meta.env.VITE_GITHUB_CLIENT_SECRET;

	if (!clientId) {
		throw new Error("VITE_GITHUB_CLIENT_ID is not configured");
	}
	if (!clientSecret) {
		throw new Error("VITE_GITHUB_CLIENT_SECRET is not configured");
	}

	return {
		clientId,
		clientSecret,
		authorizationEndpoint: "https://github.com/login/oauth/authorize",
		tokenEndpoint: "https://github.com/login/oauth/access_token",
		redirectUri,
		// GitHub API で private repo の PR を読むには "repo" スコープが必須
		// (read-only の個別スコープは GitHub が提供していない)
		scopes: ["repo"],
	};
}
