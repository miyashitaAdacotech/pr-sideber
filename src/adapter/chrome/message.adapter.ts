import type { SendMessage } from "../../shared/ports/message.port";
import type { MessageType, RequestMap, ResponseMessage } from "../../shared/types/messages";

export function subscribeToMessages(callback: (message: unknown) => void): () => void {
	chrome.runtime.onMessage.addListener(callback);
	return () => {
		chrome.runtime.onMessage.removeListener(callback);
	};
}

export const chromeSendMessage: SendMessage = async <T extends MessageType>(
	...args: RequestMap[T] extends undefined ? [type: T] : [type: T, payload: RequestMap[T]]
): Promise<ResponseMessage<T>> => {
	const [type, payload] = args;
	const message = payload !== undefined ? { type, payload } : { type };

	return new Promise((resolve) => {
		chrome.runtime.sendMessage(message, (response: ResponseMessage<T>) => {
			if (chrome.runtime.lastError) {
				resolve({
					ok: false,
					error: {
						code: "RUNTIME_ERROR",
						message: chrome.runtime.lastError.message ?? "Unknown runtime error",
					},
				} as ResponseMessage<T>);
				return;
			}
			if (!response) {
				resolve({
					ok: false,
					error: {
						code: "NO_RESPONSE",
						message: "No response from background",
					},
				} as ResponseMessage<T>);
				return;
			}
			resolve(response);
		});
	});
};
