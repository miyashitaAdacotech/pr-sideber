import { ChromeIdentityAdapter } from "../adapter/chrome/identity.adapter";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { GitHubGraphQLClient } from "../adapter/github/graphql-client";
import type { AuthPort } from "../domain/ports/auth.port";
import type { GitHubApiPort } from "../domain/ports/github-api.port";
import { createOAuthConfig } from "../shared/config/oauth.config";
import { GitHubApiError } from "../shared/types/errors";
import { createMessageHandler } from "./message-handler";

export type AppServices = {
	readonly auth: AuthPort;
	readonly githubApi: GitHubApiPort;
};

/**
 * Composition Root: Adapter を Port に注入してアプリケーションを構成する
 */
export function initializeApp(): AppServices {
	const config = createOAuthConfig(chrome.identity.getRedirectURL());
	const storage = new ChromeStorageAdapter();
	const auth = new ChromeIdentityAdapter(storage, config);
	const githubApi = new GitHubGraphQLClient(async () => {
		const token = await auth.getToken();
		if (!token) {
			throw new GitHubApiError("unauthorized", "Not authenticated");
		}
		return token.accessToken;
	});
	const handler = createMessageHandler({ auth, githubApi });
	chrome.runtime.onMessage.addListener(handler);

	return { auth, githubApi };
}
