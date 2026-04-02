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
		getCurrentTabUrl: () => tabNavigationAdapter.getCurrentTabUrl(),
	},
});

export default app;
