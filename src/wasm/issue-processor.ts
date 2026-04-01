import { processIssues as wasmProcessIssues } from "../../rust-core/crates/adapter-wasm/pkg/adapter_wasm.js";
import type { IssueListDto, IssueProcessorPort } from "../domain/ports/issue-processor.port";
import { initializeWasm } from "./index";

function isIssueListDto(value: unknown): value is IssueListDto {
	return typeof value === "object" && value !== null && "items" in value && "totalCount" in value;
}

export class WasmIssueProcessor implements IssueProcessorPort {
	async processIssues(rawJson: string): Promise<IssueListDto> {
		await initializeWasm();
		const result: unknown = wasmProcessIssues(rawJson);
		if (!isIssueListDto(result)) {
			throw new Error("WASM processIssues returned unexpected structure");
		}
		return result;
	}
}
