import type { DeviceCodeResponse, PollResult } from "../../domain/types/auth";
import type { FetchPullRequestsResult } from "../../domain/types/github";

export const MESSAGE_TYPES = [
	"AUTH_LOGOUT",
	"AUTH_STATUS",
	"AUTH_DEVICE_CODE",
	"AUTH_DEVICE_POLL",
	"FETCH_PRS",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

/** メッセージタイプ → リクエストペイロードのマッピング */
export type RequestMap = {
	AUTH_LOGOUT: undefined;
	AUTH_STATUS: undefined;
	AUTH_DEVICE_CODE: undefined;
	AUTH_DEVICE_POLL: { deviceCode: string };
	FETCH_PRS: undefined;
};

/** メッセージタイプ → レスポンスデータのマッピング */
export type ResponseDataMap = {
	AUTH_LOGOUT: undefined;
	AUTH_STATUS: { isAuthenticated: boolean };
	AUTH_DEVICE_CODE: DeviceCodeResponse;
	AUTH_DEVICE_POLL: PollResult;
	FETCH_PRS: FetchPullRequestsResult;
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
