import type { SendMessage } from "../../shared/ports/message.port";

export const chromeSendMessage: SendMessage = (message) =>
	chrome.runtime.sendMessage(message);
