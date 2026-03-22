import { mount } from "svelte";
import { chromeSendMessage } from "../adapter/chrome/message.adapter";
import { createAuthUseCase } from "../shared/usecase/auth.usecase";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) {
	throw new Error("Mount target #app not found");
}

const authUseCase = createAuthUseCase(chromeSendMessage);

const app = mount(App, { target, props: { authUseCase } });

export default app;
