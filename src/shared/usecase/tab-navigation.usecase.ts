import type { SendMessage } from "../ports/message.port";

export function createTabNavigationUseCase(sendMessage: SendMessage) {
	return {
		navigateToPr: async (url: string): Promise<void> => {
			const response = await sendMessage("NAVIGATE_TO_PR", { url });
			if (!response.ok) {
				throw new Error(response.error.message);
			}
		},
	};
}
