import type { AuthResponse } from "../../shared/types/messages";

export async function login(): Promise<void> {
	const response: AuthResponse = await chrome.runtime.sendMessage({ type: "AUTH_LOGIN" });
	if (response.type === "AUTH_FAILURE") {
		throw new Error(response.error);
	}
}

export async function logout(): Promise<void> {
	await chrome.runtime.sendMessage({ type: "AUTH_LOGOUT" });
}

export async function checkAuth(): Promise<boolean> {
	const response: AuthResponse = await chrome.runtime.sendMessage({ type: "AUTH_CHECK" });
	if (response.type === "AUTH_STATUS") {
		return response.authenticated;
	}
	return false;
}
