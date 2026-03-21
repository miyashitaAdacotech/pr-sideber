import { ChromeIdentityAdapter } from "../adapter/chrome/identity.adapter";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import type { AuthPort } from "../domain/ports/auth.port";
import { createOAuthConfig } from "../shared/config/oauth.config";

type AppServices = {
	readonly auth: AuthPort;
};

/**
 * Composition Root: Adapter を Port に注入してアプリケーションを構成する
 */
export function initializeApp(): AppServices {
	const config = createOAuthConfig(chrome.identity.getRedirectURL());
	const storage = new ChromeStorageAdapter();
	const auth = new ChromeIdentityAdapter(storage, config);
	return { auth };
}
