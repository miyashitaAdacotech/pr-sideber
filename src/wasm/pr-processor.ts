import { processPullRequests as wasmProcessPullRequests } from "../../rust-core/crates/adapter-wasm/pkg/adapter_wasm.js";
import type { PrProcessorPort, ProcessedPrsResult } from "../domain/ports/pr-processor.port";
import { initializeWasm } from "./index";

function isProcessedPrsResult(value: unknown): value is ProcessedPrsResult {
	return (
		typeof value === "object" && value !== null && "myPrs" in value && "reviewRequests" in value
	);
}

export class WasmPrProcessor implements PrProcessorPort {
	async processPullRequests(rawJson: string, login: string): Promise<ProcessedPrsResult> {
		await initializeWasm();
		const result: unknown = wasmProcessPullRequests(rawJson, login);
		if (!isProcessedPrsResult(result)) {
			throw new Error("WASM processPullRequests returned unexpected structure");
		}
		return result;
	}
}
