/**
 * OAuth PKCE / CSRF 用の暗号ユーティリティ
 */

function toBase64Url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** CSRF 対策用のランダム state 文字列を生成 */
export function generateState(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes.buffer);
}

/** PKCE code_verifier を生成 (RFC 7636 準拠の unreserved characters) */
export function generateCodeVerifier(): string {
	const unreserved = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
	// rejection sampling で modulo bias を排除
	// Math.floor(256 / 66) * 66 = 198
	const maxUnbiased = Math.floor(256 / unreserved.length) * unreserved.length;
	const result: string[] = [];
	while (result.length < 64) {
		const bytes = new Uint8Array(128);
		crypto.getRandomValues(bytes);
		for (const byte of bytes) {
			if (result.length >= 64) break;
			if (byte < maxUnbiased) {
				result.push(unreserved[byte % unreserved.length]);
			}
		}
	}
	return result.join("");
}

/** PKCE code_challenge を生成 (S256) */
export async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return toBase64Url(digest);
}
