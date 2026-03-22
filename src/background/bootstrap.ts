import { ChromeIdentityAdapter } from "../adapter/chrome/identity.adapter";
import { createOAuthConfig } from "../adapter/chrome/oauth.config";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { GitHubGraphQLClient } from "../adapter/github/graphql-client";
import { GitHubApiError } from "../shared/types/errors";
import { createMessageHandler } from "./message-handler";
import type { AppServices } from "./types";

export type { AppServices };

/**
 * Composition Root: Adapter を Port に注入してアプリケーションを構成する
 */
export function initializeApp(): AppServices {
	const config = createOAuthConfig();
	const storage = new ChromeStorageAdapter();
	const auth = new ChromeIdentityAdapter(storage, config);
	const githubApi = new GitHubGraphQLClient(async () => {
		const token = await auth.getToken();
		if (!token) {
			throw new GitHubApiError("unauthorized", "Not authenticated. Token may have expired.");
		}
		return token.accessToken;
	});
	const handler = createMessageHandler({ auth, githubApi });
	chrome.runtime.onMessage.addListener(handler);

	let disposed = false;
	const dispose = (): void => {
		if (disposed) return;
		disposed = true;
		try {
			auth.dispose();
		} finally {
			chrome.runtime.onMessage.removeListener(handler);
		}
	};

	return { auth, githubApi, dispose };
}
