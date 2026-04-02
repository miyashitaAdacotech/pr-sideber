export interface ClaudeSession {
	readonly sessionUrl: string;
	readonly title: string;
	readonly issueNumber: number;
	readonly detectedAt: string;
	readonly isLive: boolean;
}

export type ClaudeSessionStorage = {
	readonly [issueNumber: string]: readonly ClaudeSession[];
};
