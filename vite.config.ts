import { crx } from "@crxjs/vite-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import manifest from "./manifest.config";
import { assertNoClientSecret } from "./src/build-config/build-guards";

const isViteBuild = process.argv.includes("build");

export default defineConfig(() => {
	assertNoClientSecret();
	const clientId = process.env.GITHUB_CLIENT_ID ?? "";
	if (isViteBuild && !clientId) {
		throw new Error("GITHUB_CLIENT_ID must be set for production builds");
	}

	return {
		plugins: [svelte(), crx({ manifest })],
		define: {
			"import.meta.env.GITHUB_CLIENT_ID": JSON.stringify(clientId),
		},
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
	};
});
