/**
 * ビルド時にシークレットがバンドルに混入しないことを保証するガード関数。
 * vite.config.ts から呼び出す。
 */

// vite.config.ts (Node.js) 環境で使用するため、process の型を宣言
declare const process: { env: Record<string, string | undefined> };

/** GITHUB_CLIENT_SECRET が環境変数に設定されていたらビルドを中断する */
export function assertNoClientSecret(): void {
	if (process.env.GITHUB_CLIENT_SECRET) {
		throw new Error(
			"GITHUB_CLIENT_SECRET is set in environment variables. " +
				"Device Flow does not require client_secret. " +
				"Remove it to prevent accidental bundling.",
		);
	}

	if (process.env.VITE_GITHUB_CLIENT_SECRET) {
		throw new Error(
			"VITE_GITHUB_CLIENT_SECRET is set in environment variables. " +
				"VITE_ prefixed variables are exposed to client code. " +
				"Remove VITE_GITHUB_CLIENT_SECRET from environment.",
		);
	}
}
