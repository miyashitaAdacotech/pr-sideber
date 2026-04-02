import type { EpicTreeDto } from "./epic-processor.port";

export interface EpicApiPort {
	fetchEpicTree(): Promise<EpicTreeDto>;
}
