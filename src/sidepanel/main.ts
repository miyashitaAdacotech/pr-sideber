import { mount } from "svelte";
import App from "./App.svelte";
import { chromeSendMessage } from "../adapter/chrome/message.adapter";
import { createAuthUseCase } from "./usecase/auth.usecase";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);

const app = mount(App, { target, props: { authUseCase } });

export default app;
