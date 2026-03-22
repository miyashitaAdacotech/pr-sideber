import type { SendMessage } from "../../shared/ports/message.port";
import type { AuthResponse } from "../../shared/types/messages";

function assertResponse(response: AuthResponse | undefined): asserts response is AuthResponse {
	if (response === undefined || response === null) {
		throw new Error("No response from background");
	}
}

export function createAuthUseCase(sendMessage: SendMessage) {
	async function login(): Promise<void> {
		const response = await sendMessage({ type: "AUTH_LOGIN" });
		assertResponse(response);
		if (response.type === "AUTH_FAILURE") {
			throw new Error("Authentication failed. Please try again.");
		}
	}

	async function logout(): Promise<void> {
		const response = await sendMessage({ type: "AUTH_LOGOUT" });
		assertResponse(response);
		if (response.type === "AUTH_FAILURE") {
			throw new Error("Logout failed. Please try again.");
		}
	}

	async function checkAuth(): Promise<boolean> {
		try {
			const response = await sendMessage({ type: "AUTH_CHECK" });
			if (response === undefined || response === null) {
				return false;
			}
			if (response.type === "AUTH_STATUS") {
				return response.authenticated;
			}
			return false;
		} catch {
			return false;
		}
	}

	return { login, logout, checkAuth };
}
