import type { Greeting } from "../shared/types/wasm.js";

export type { Greeting };

/** Greeting 型のランタイム型ガード */
export function isGreeting(v: unknown): v is Greeting {
	return (
		typeof v === "object" &&
		v !== null &&
		"message" in v &&
		typeof (v as Greeting).message === "string"
	);
}
