import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
	manifest_version: 3,
	name: "PR Sidebar",
	version: "0.0.1",
	description: "GitHub PR Dashboard in Chrome Side Panel",
	permissions: ["sidePanel", "storage", "alarms", "tabs", "system.display"],
	host_permissions: ["https://github.com/*", "https://api.github.com/*", "https://claude.ai/*"],
	content_security_policy: {
		extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
	},
	side_panel: {
		default_path: "src/sidepanel/index.html",
	},
	background: {
		service_worker: "src/background/index.ts",
	},
	content_scripts: [
		{
			matches: ["https://claude.ai/code/*"],
			js: ["src/content/claude-session-scraper.ts"],
			run_at: "document_idle",
		},
	],
	action: {
		default_icon: {
			"16": "icons/icon-16.png",
			"48": "icons/icon-48.png",
			"128": "icons/icon-128.png",
		},
	},
	icons: {
		"16": "icons/icon-16.png",
		"48": "icons/icon-48.png",
		"128": "icons/icon-128.png",
	},
});
