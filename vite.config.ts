import { crx } from "@crxjs/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import manifest from "./manifest.config";

export default defineConfig({
	plugins: [svelte(), crx({ manifest })],
	build: {
		target: "esnext",
	},
	optimizeDeps: {
		exclude: ["adapter-wasm"],
	},
	server: {
		fs: {
			allow: ["src", "rust-core/crates/adapter-wasm/pkg"],
		},
	},
});
