import init, {
	initWasm,
	greet as wasmGreet,
} from "../../rust-core/crates/adapter-wasm/pkg/adapter_wasm.js";
import { isGreeting } from "./greeting.js";

export type { Greeting } from "./greeting.js";
export { isGreeting } from "./greeting.js";

let initPromise: Promise<void> | null = null;

/**
 * WASM モジュールを初期化する。
 * Promise キャッシュにより並行呼び出しでも二重初期化しない。
 */
export function initializeWasm(): Promise<void> {
	if (!initPromise) {
		initPromise = (async () => {
			await init();
			initWasm();
		})();
	}
	return initPromise;
}

/**
 * WASM を初期化し、greet を呼んで結果を返す。
 * Svelte コンポーネントはこの関数を呼ぶだけでよい。
 */
export async function loadGreeting(name: string): Promise<string> {
	await initializeWasm();
	const result: unknown = wasmGreet(name);
	if (!isGreeting(result)) {
		return "WASM loaded (no message)";
	}
	return result.message;
}
