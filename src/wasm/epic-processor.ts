import { processEpicTree as wasmProcessEpicTree } from "../../rust-core/crates/adapter-wasm/pkg/adapter_wasm.js";
import type {
	EpicProcessorPort,
	EpicTreeDto,
	TreeNodeDto,
} from "../domain/ports/epic-processor.port";
import { initializeWasm } from "./index";

function isTreeNodeDto(value: unknown): value is TreeNodeDto {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		"children" in value &&
		"depth" in value
	);
}

function isEpicTreeDto(value: unknown): value is EpicTreeDto {
	if (typeof value !== "object" || value === null || !("roots" in value)) {
		return false;
	}
	const obj = value as { roots: unknown };
	if (!Array.isArray(obj.roots)) {
		return false;
	}
	return obj.roots.every(isTreeNodeDto);
}

export class WasmEpicProcessor implements EpicProcessorPort {
	async processEpicTree(issuesJson: string, prsJson: string): Promise<EpicTreeDto> {
		await initializeWasm();
		const result: unknown = wasmProcessEpicTree(issuesJson, prsJson);
		if (!isEpicTreeDto(result)) {
			throw new Error("WASM processEpicTree returned unexpected structure");
		}
		return result;
	}
}
