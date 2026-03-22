import { mount } from "svelte";
import { chromeSendMessage } from "../adapter/chrome/message.adapter";
import App from "./App.svelte";
import { createAuthUseCase } from "./usecase/auth.usecase";
import { createPrUseCase } from "./usecase/pr.usecase";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);
const prUseCase = createPrUseCase(chromeSendMessage);

const app = mount(App, { target, props: { authUseCase, prUseCase } });

export default app;
