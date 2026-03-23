import "./styles/global.css";
import { mount } from "svelte";
import { chromeSendMessage } from "../adapter/chrome/message.adapter";
import { ChromeStorageAdapter } from "../adapter/chrome/storage.adapter";
import { createAuthUseCase } from "../shared/usecase/auth.usecase";
import { createDeviceFlowController } from "../shared/usecase/device-flow.controller";
import { createPrUseCase } from "../shared/usecase/pr.usecase";
import { WasmPrProcessor } from "../wasm/pr-processor";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);
const deviceFlowController = createDeviceFlowController(authUseCase);
const prProcessor = new WasmPrProcessor();
const storage = new ChromeStorageAdapter();
const prUseCase = createPrUseCase(chromeSendMessage, prProcessor, storage);

const app = mount(App, { target, props: { authUseCase, prUseCase, deviceFlowController } });

export default app;
