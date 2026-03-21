import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";

export default [
	...svelte.configs["flat/recommended"],
	{
		files: ["**/*.svelte"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser,
			},
		},
	},
	{
		ignores: ["dist/", "node_modules/", "pkg/", "target/"],
	},
];
