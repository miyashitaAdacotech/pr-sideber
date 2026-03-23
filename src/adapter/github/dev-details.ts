/**
 * 本番ビルドで内部エラー情報が details に漏洩しないように、
 * DEV モードでのみ details を返すヘルパー。
 * Vite が import.meta.env.DEV をビルド時に静的置換するため、
 * 本番バンドルではデッドコード除去される。
 */
export function devOnlyDetails(error: unknown): string | undefined {
	if (!import.meta.env.DEV) return undefined;
	return error instanceof Error ? error.message : undefined;
}

export function devOnlyMessage(message: string): string | undefined {
	return import.meta.env.DEV ? message : undefined;
}
