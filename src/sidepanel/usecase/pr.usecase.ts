import type { FetchPullRequestsResult } from "../../domain/types/github";
import type { SendMessage } from "../../shared/ports/message.port";

export function createPrUseCase(sendMessage: SendMessage) {
	async function fetchPrs(): Promise<FetchPullRequestsResult> {
		const response = await sendMessage("FETCH_PRS");
		if (!response.ok) {
			throw new Error(response.error.message);
		}
		return response.data;
	}

	return { fetchPrs };
}
