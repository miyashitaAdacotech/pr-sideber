// 新しいシークレット系環境変数を導入したらここに追加すること
const FORBIDDEN_KEYS = [
	"GITHUB_CLIENT_SECRET",
	"GITHUB_OAUTH_SECRET",
	"GITHUB_TOKEN",
	"GH_TOKEN",
	"GITHUB_PAT",
	"GITHUB_ACCESS_TOKEN",
] as const;

/**
 * ビルド環境にシークレットが混入していないことを検証する。
 * vite.config.ts から呼び出し、ビルド時にガードする。
 */
export function validateBuildEnv(env: Record<string, string | undefined>): void {
	// 空文字は falsy なのでここで除外される。空文字はバンドルに混入しても実害がないため意図的に許容している
	const found = FORBIDDEN_KEYS.filter((key) => env[key]);

	if (found.length > 0) {
		throw new Error(
			`SECURITY: ${found.join(", ")} is set in environment. These secrets must not be present during build to prevent bundle contamination.`,
		);
	}
}
