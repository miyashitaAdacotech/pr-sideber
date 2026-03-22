/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly GITHUB_CLIENT_ID: string;
}

declare module "*.svelte" {
	import type { Component } from "svelte";
	const component: Component;
	export default component;
}
