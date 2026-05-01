/**
 * Workspace 操作のリクエスト型。
 *
 * messages.ts の RequestMap["OPEN_WORKSPACE"] と
 * background/workspace-open.usecase.ts の WorkspaceOpenRequest は
 * 同一フィールド群を別の型として二重保守していたため、本ファイルに統合する。
 */
export interface WorkspaceOpenRequest {
	readonly issueNumber: number;
	readonly issueUrl: string;
	readonly prUrl: string | null;
	readonly sessionUrl: string | null;
	readonly senderWindowId: number;
}
