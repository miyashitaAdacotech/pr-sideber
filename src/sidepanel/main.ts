import "./styles/global.css";
import { mount } from "svelte";
import { chromeSendMessage, subscribeToMessages } from "../adapter/chrome/message.adapter";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { TabNavigationAdapter } from "../adapter/chrome/tab-navigation.adapter";
import type { EpicTreeDto } from "../domain/ports/epic-processor.port";
import type { ClaudeSessionStorage } from "../shared/types/claude-session";
import { createAuthUseCase } from "../shared/usecase/auth.usecase";
import { createDeviceFlowController } from "../shared/usecase/device-flow.controller";
import { createPrUseCase } from "../shared/usecase/pr.usecase";
import { createTabNavigationUseCase } from "../shared/usecase/tab-navigation.usecase";
import type { WorkspaceResources } from "../shared/utils/workspace-resources";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);
const deviceFlowController = createDeviceFlowController(authUseCase);
const storage = new ChromeStorageAdapter();
const prUseCase = createPrUseCase(chromeSendMessage, storage);
const tabNavigationUseCase = createTabNavigationUseCase(chromeSendMessage);
const tabNavigationAdapter = new TabNavigationAdapter();

async function fetchEpicTree(): Promise<{ tree: EpicTreeDto; prsRawJson: string }> {
	const response = await chromeSendMessage("FETCH_EPIC_TREE");
	if (!response.ok) {
		throw new Error(response.error.message);
	}
	return response.data;
}

async function getClaudeSessions(): Promise<ClaudeSessionStorage> {
	const response = await chromeSendMessage("GET_CLAUDE_SESSIONS");
	if (!response.ok) {
		throw new Error(response.error.message);
	}
	if (import.meta.env.DEV) {
		const keys = Object.keys(response.data);
		console.log(`[DEBUG:sessions] 取得件数=${keys.length}, Issue番号=${keys.join(",") || "なし"}`);
		for (const [issueNum, sessions] of Object.entries(response.data)) {
			for (const s of sessions) {
				console.log(
					`[DEBUG:sessions]   #${issueNum}: "${s.title}" (live=${s.isLive}) url=${s.sessionUrl}`,
				);
			}
		}
	}
	return response.data;
}

const app = mount(App, {
	target,
	props: {
		authUseCase,
		prUseCase,
		fetchEpicTree,
		getClaudeSessions,
		deviceFlowController,
		subscribeToMessages,
		onNavigate: (url: string) => tabNavigationUseCase.navigateToPr(url),
		onOpenWorkspace: async (resources: WorkspaceResources) => {
			const currentWindow = await chrome.windows.getCurrent();
			const response = await chromeSendMessage("OPEN_WORKSPACE", {
				issueNumber: resources.issueNumber,
				issueUrl: resources.issueUrl,
				prUrl: resources.prUrl,
				sessionUrl: resources.sessionUrl,
				senderWindowId: currentWindow.id ?? 0,
			});
			if (!response.ok) {
				console.error("Failed to open workspace:", response.error.message);
			}
		},
		getCurrentTabUrl: () => tabNavigationAdapter.getCurrentTabUrl(),
	},
});

export default app;
