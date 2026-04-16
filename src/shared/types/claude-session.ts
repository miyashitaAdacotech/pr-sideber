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

/**
 * Claude セッションと Issue 番号の手動マッピング。
 * regex タイトル抽出では拾えないセッションをユーザーが手動で紐付けるために使用する (Epic #43)。
 * key: sessionId (SESSION_ID_PATTERN 準拠) / value: Issue 番号
 */
export type SessionIssueMapping = { readonly [sessionId: string]: number };
