import type { AuthPort } from "../domain/ports/auth.port";
import type { EpicProcessorPort } from "../domain/ports/epic-processor.port";
import type { GitHubApiPort } from "../domain/ports/github-api.port";
import type { IssueApiPort } from "../domain/ports/issue-api.port";
import type { IssueProcessorPort } from "../domain/ports/issue-processor.port";
import type { PrProcessorPort } from "../domain/ports/pr-processor.port";
import type { TabNavigationPort } from "../domain/ports/tab-navigation.port";
import type { ClaudeSessionWatcher } from "./claude-session-watcher";

export type BadgeService = {
	readonly updateBadge: (reviewRequestCount: number) => Promise<void>;
};

export type AppServices = {
	readonly auth: AuthPort;
	readonly epicProcessor: EpicProcessorPort;
	readonly githubApi: GitHubApiPort;
	readonly issueApi: IssueApiPort;
	readonly prProcessor: PrProcessorPort;
	readonly issueProcessor: IssueProcessorPort;
	readonly badge: BadgeService;
	readonly tabNavigation: TabNavigationPort;
	readonly claudeSessionWatcher: ClaudeSessionWatcher;
	readonly dispose: () => void;
};
