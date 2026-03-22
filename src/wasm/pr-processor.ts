import { processPullRequests as wasmProcessPullRequests } from "../../rust-core/crates/adapter-wasm/pkg/adapter_wasm.js";
import type { PrProcessorPort, ProcessedPrsResult } from "../domain/ports/pr-processor.port";

function isProcessedPrsResult(value: unknown): value is ProcessedPrsResult {
	return (
		typeof value === "object" && value !== null && "myPrs" in value && "reviewRequests" in value
	);
}

export class WasmPrProcessor implements PrProcessorPort {
	processPullRequests(rawJson: string, login: string): ProcessedPrsResult {
		const result: unknown = wasmProcessPullRequests(rawJson, login);
		if (!isProcessedPrsResult(result)) {
			throw new Error("WASM processPullRequests returned unexpected structure");
		}
		return result;
	}
}
