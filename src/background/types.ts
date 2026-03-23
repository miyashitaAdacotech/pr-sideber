import type { AuthPort } from "../domain/ports/auth.port";
import type { GitHubApiPort } from "../domain/ports/github-api.port";
import type { PrProcessorPort } from "../domain/ports/pr-processor.port";

export type BadgeService = {
	readonly updateBadge: (reviewRequestCount: number) => Promise<void>;
};

export type AppServices = {
	readonly auth: AuthPort;
	readonly githubApi: GitHubApiPort;
	readonly prProcessor: PrProcessorPort;
	readonly badge: BadgeService;
	readonly dispose: () => void;
};
