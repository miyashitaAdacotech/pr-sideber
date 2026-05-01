import type { EpicTreeDto } from "../../domain/ports/epic-processor.port";
import type { IssueListDto } from "../../domain/ports/issue-processor.port";
import type { ProcessedPrsResult } from "../../domain/ports/pr-processor.port";
import type { DeviceCodeResponse, PollResult } from "../../domain/types/auth";
import type { DebugLogEntry } from "../utils/debug-logger";
import type { ClaudeSessionStorage } from "./claude-session";
import type { WorkspaceOpenRequest } from "./workspace";

export interface DebugState {
	readonly claudeSessions: ClaudeSessionStorage;
	readonly watcherTabCount: number;
	readonly logs: readonly DebugLogEntry[];
}

export const MESSAGE_TYPES = [
	"AUTH_LOGOUT",
	"AUTH_STATUS",
	"AUTH_DEVICE_CODE",
	"AUTH_DEVICE_POLL",
	"FETCH_EPIC_TREE",
	"FETCH_ISSUES",
	"FETCH_PRS",
	"UPDATE_BADGE",
	"NAVIGATE_TO_PR",
	"GET_CLAUDE_SESSIONS",
	"GET_DEBUG_STATE",
	"OPEN_WORKSPACE",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

/** メッセージタイプ → リクエストペイロードのマッピング */
export type RequestMap = {
	AUTH_LOGOUT: undefined;
	AUTH_STATUS: undefined;
	AUTH_DEVICE_CODE: undefined;
	AUTH_DEVICE_POLL: { deviceCode: string };
	FETCH_EPIC_TREE: undefined;
	FETCH_ISSUES: undefined;
	FETCH_PRS: undefined;
	UPDATE_BADGE: { reviewRequestCount: number };
	NAVIGATE_TO_PR: { url: string };
	GET_CLAUDE_SESSIONS: undefined;
	GET_DEBUG_STATE: undefined;
	OPEN_WORKSPACE: WorkspaceOpenRequest;
};

/** メッセージタイプ → レスポンスデータのマッピング */
export type ResponseDataMap = {
	AUTH_LOGOUT: undefined;
	AUTH_STATUS: { isAuthenticated: boolean };
	AUTH_DEVICE_CODE: DeviceCodeResponse;
	AUTH_DEVICE_POLL: PollResult;
	FETCH_EPIC_TREE: { tree: EpicTreeDto; prsRawJson: string };
	FETCH_ISSUES: IssueListDto;
	FETCH_PRS: ProcessedPrsResult & { hasMore: boolean };
	UPDATE_BADGE: undefined;
	NAVIGATE_TO_PR: undefined;
	GET_CLAUDE_SESSIONS: ClaudeSessionStorage;
	GET_DEBUG_STATE: DebugState;
	OPEN_WORKSPACE: undefined;
};

export type MessageError = {
	readonly code: string;
	readonly message: string;
};

/** リクエストメッセージ: payload が undefined なら省略 */
export type RequestMessage<T extends MessageType> = RequestMap[T] extends undefined
	? { readonly type: T }
	: { readonly type: T; readonly payload: RequestMap[T] };

/** レスポンスメッセージ: 成功 or 失敗 */
export type ResponseMessage<T extends MessageType> =
	| { readonly ok: true; readonly data: ResponseDataMap[T] }
	| { readonly ok: false; readonly error: MessageError };

/** 型ガード: unknown が有効な RequestMessage か判定する */
export function isRequestMessage(value: unknown): value is RequestMessage<MessageType> {
	if (value === null || value === undefined || typeof value !== "object") {
		return false;
	}
	const obj = value as Record<string, unknown>;
	return typeof obj.type === "string" && MESSAGE_TYPES.includes(obj.type as MessageType);
}
