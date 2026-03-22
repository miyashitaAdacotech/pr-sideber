/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		// domain 層: 外部レイヤーへの依存を一切禁止
		// domain はピュアなドメインモデルのみを含み、他レイヤーに依存しない
		{
			name: "domain-layer-boundary",
			severity: "error",
			from: { path: "^src/domain/" },
			to: { path: "^src/(shared|adapter|background|sidepanel|wasm)/" },
		},
		// shared 層: adapter 以降のレイヤーへの依存を禁止
		// shared は domain にのみ依存できる
		{
			name: "shared-layer-boundary",
			severity: "error",
			from: { path: "^src/shared/" },
			to: { path: "^src/(adapter|background|sidepanel|wasm)/" },
		},
		// adapter 層: background/sidepanel への依存を禁止
		// adapter は domain と shared にのみ依存できる
		{
			name: "adapter-layer-boundary",
			severity: "error",
			from: { path: "^src/adapter/" },
			to: { path: "^src/(background|sidepanel)/" },
		},
		// sidepanel/components: adapter/background への直接依存を禁止
		{
			name: "sidepanel-components-boundary",
			severity: "error",
			from: { path: "^src/sidepanel/components/" },
			to: { path: "^src/(adapter|background)/" },
		},
		// sidepanel/usecase 層: adapter や background への直接依存を禁止
		// ただし adapter/chrome/message.adapter は正規の通信経路として許可
		{
			name: "sidepanel-usecase-boundary",
			severity: "error",
			from: { path: "^src/sidepanel/usecase/" },
			to: {
				path: "^src/(adapter|background)/",
				pathNot: "^src/adapter/chrome/message\\.adapter",
			},
		},
		// 循環依存の禁止 (type-only import は実行時に影響しないため除外)
		{
			name: "no-circular",
			severity: "error",
			from: {},
			to: { circular: true, dependencyTypesNot: ["type-only"] },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.json" },
		exclude: { path: "^src/(test|.*__test_violation__)" },
	},
};
