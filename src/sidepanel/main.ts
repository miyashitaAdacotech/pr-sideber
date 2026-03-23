import "./styles/global.css";
import { mount } from "svelte";
import { chromeSendMessage, subscribeToMessages } from "../adapter/chrome/message.adapter";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { createAuthUseCase } from "../shared/usecase/auth.usecase";
import { createDeviceFlowController } from "../shared/usecase/device-flow.controller";
import { createPrUseCase } from "../shared/usecase/pr.usecase";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);
const deviceFlowController = createDeviceFlowController(authUseCase);
const storage = new ChromeStorageAdapter();
const prUseCase = createPrUseCase(chromeSendMessage, storage);

const app = mount(App, {
	target,
	props: { authUseCase, prUseCase, deviceFlowController, subscribeToMessages },
});

export default app;
