import type { AuthMessage, AuthResponse } from "../../shared/types/messages";

export type SendMessage = (
	message: AuthMessage,
) => Promise<AuthResponse | undefined>;
