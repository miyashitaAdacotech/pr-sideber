import type { AuthPort } from "../domain/ports/auth.port";
import type { AuthMessage, AuthResponse } from "../shared/types/messages";

function isAuthMessage(message: unknown): message is AuthMessage {
	if (typeof message !== "object" || message === null) return false;
	const msg = message as { type?: unknown };
	return msg.type === "AUTH_LOGIN" || msg.type === "AUTH_LOGOUT" || msg.type === "AUTH_CHECK";
}

async function handleAuthMessage(auth: AuthPort, message: AuthMessage): Promise<AuthResponse> {
	switch (message.type) {
		case "AUTH_LOGIN": {
			try {
				await auth.authorize();
				return { type: "AUTH_SUCCESS", authenticated: true };
			} catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				return { type: "AUTH_FAILURE", error: errorMessage };
			}
		}
		case "AUTH_LOGOUT": {
			await auth.clearToken();
			return { type: "AUTH_SUCCESS", authenticated: true };
		}
		case "AUTH_CHECK": {
			const authenticated = await auth.isAuthenticated();
			return { type: "AUTH_STATUS", authenticated };
		}
	}
}

export function createMessageHandler(auth: AuthPort): void {
	chrome.runtime.onMessage.addListener(
		(
			message: unknown,
			_sender: chrome.runtime.MessageSender,
			sendResponse: (response: AuthResponse) => void,
		): true | undefined => {
			if (!isAuthMessage(message)) {
				return undefined;
			}

			handleAuthMessage(auth, message).then(sendResponse);
			return true;
		},
	);
}
