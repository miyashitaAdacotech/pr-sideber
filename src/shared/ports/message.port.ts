import type { AuthMessage, AuthResponse } from "../types/messages";

export type SendMessage = (
	message: AuthMessage,
) => Promise<AuthResponse | undefined>;
