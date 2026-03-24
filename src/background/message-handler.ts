import type { MessageType, RequestMessage, ResponseMessage } from "../shared/types/messages";
import { isRequestMessage } from "../shared/types/messages";
import { extractPrBaseUrl } from "../shared/utils/github-url";
import type { AppServices } from "./types";

/** メッセージタイプごとの汎用エラーメッセージ */
const ERROR_MESSAGES: Record<MessageType, string> = {
	AUTH_LOGOUT: "Logout failed",
	AUTH_STATUS: "Failed to check authentication status",
	AUTH_DEVICE_CODE: "Device code request failed",
	AUTH_DEVICE_POLL: "Device polling failed",
	FETCH_PRS: "Failed to fetch pull requests",
	UPDATE_BADGE: "Failed to update badge",
	NAVIGATE_TO_PR: "Navigation failed",
};

/** deviceCode の長さ制限 */
const DEVICE_CODE_MIN_LENGTH = 8;
const DEVICE_CODE_MAX_LENGTH = 256;

export function createMessageHandler(
	services: Pick<AppServices, "auth" | "githubApi" | "prProcessor" | "badge" | "tabNavigation">,
) {
	return (
		message: unknown,
		sender: chrome.runtime.MessageSender,
		sendResponse: (response: ResponseMessage<MessageType>) => void,
	): boolean => {
		if (sender.id !== chrome.runtime.id) {
			sendResponse({ ok: false, error: { code: "FORBIDDEN", message: "Untrusted sender" } });
			return false;
		}

		if (!isRequestMessage(message)) {
			return false;
		}

		handleMessage(services, message, sendResponse);
		return true;
	};
}

async function handleMessage(
	services: Pick<AppServices, "auth" | "githubApi" | "prProcessor" | "badge" | "tabNavigation">,
	message: RequestMessage<MessageType>,
	sendResponse: (response: ResponseMessage<MessageType>) => void,
): Promise<void> {
	try {
		switch (message.type) {
			case "AUTH_LOGOUT": {
				await services.auth.clearToken();
				sendResponse({ ok: true, data: undefined });
				break;
			}
			case "AUTH_STATUS": {
				const isAuthenticated = await services.auth.isAuthenticated();
				sendResponse({ ok: true, data: { isAuthenticated } });
				break;
			}
			case "AUTH_DEVICE_CODE": {
				const deviceCodeResponse = await services.auth.requestDeviceCode();
				sendResponse({ ok: true, data: deviceCodeResponse });
				break;
			}
			case "AUTH_DEVICE_POLL": {
				const msg = message as RequestMessage<"AUTH_DEVICE_POLL">;
				const deviceCode = msg.payload.deviceCode;

				if (
					typeof deviceCode !== "string" ||
					deviceCode.length < DEVICE_CODE_MIN_LENGTH ||
					deviceCode.length > DEVICE_CODE_MAX_LENGTH
				) {
					sendResponse({
						ok: false,
						error: { code: "AUTH_DEVICE_POLL_ERROR", message: "Invalid device code" },
					});
					break;
				}

				const pollResult = await services.auth.pollForToken(deviceCode);
				sendResponse({ ok: true, data: pollResult });
				break;
			}
			case "FETCH_PRS": {
				const raw = await services.githubApi.fetchPullRequests();
				const processed = await services.prProcessor.processPullRequests(raw.rawJson);
				sendResponse({ ok: true, data: { ...processed, hasMore: raw.hasMore } });
				break;
			}
			case "UPDATE_BADGE": {
				const msg = message as RequestMessage<"UPDATE_BADGE">;
				const { reviewRequestCount } = msg.payload;

				if (!Number.isInteger(reviewRequestCount) || reviewRequestCount < 0) {
					sendResponse({
						ok: false,
						error: { code: "UPDATE_BADGE_ERROR", message: "Invalid review request count" },
					});
					break;
				}

				await services.badge.updateBadge(reviewRequestCount);
				sendResponse({ ok: true, data: undefined });
				break;
			}
			case "NAVIGATE_TO_PR": {
				const msg = message as RequestMessage<"NAVIGATE_TO_PR">;
				const { url } = msg.payload;
				if (typeof url !== "string" || !url.startsWith("https://github.com/")) {
					sendResponse({
						ok: false,
						error: { code: "NAVIGATE_TO_PR_ERROR", message: "Invalid URL" },
					});
					break;
				}
				const prBaseUrl = extractPrBaseUrl(url);

				if (prBaseUrl) {
					const existingTabId = await services.tabNavigation.findExistingPrTab(prBaseUrl);
					if (existingTabId !== null) {
						try {
							await services.tabNavigation.activateTab(existingTabId);
						} catch {
							await services.tabNavigation.openNewTab(url);
						}
					} else {
						await services.tabNavigation.openNewTab(url);
					}
				} else {
					await services.tabNavigation.openNewTab(url);
				}

				sendResponse({ ok: true, data: undefined });
				break;
			}
			default: {
				const _exhaustive: never = message.type;
				sendResponse({
					ok: false,
					error: { code: "UNHANDLED_MESSAGE", message: "Unhandled message type" },
				});
				break;
			}
		}
	} catch (err: unknown) {
		if (import.meta.env.DEV) {
			console.error(`[message-handler] ${message.type} error:`, err);
		}
		sendResponse({
			ok: false,
			error: {
				code: `${message.type}_ERROR`,
				message: ERROR_MESSAGES[message.type],
			},
		});
	}
}
