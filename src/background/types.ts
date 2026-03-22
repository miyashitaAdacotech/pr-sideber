import type { AuthPort } from "../domain/ports/auth.port";
import type { GitHubApiPort } from "../domain/ports/github-api.port";

export type AppServices = {
	readonly auth: AuthPort;
	readonly githubApi: GitHubApiPort;
};
