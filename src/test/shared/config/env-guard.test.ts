import { describe, expect, it } from "vitest";
import { validateBuildEnv } from "../../../shared/config/env-guard";

describe("validateBuildEnv", () => {
	it("should not throw when all forbidden keys are absent", () => {
		const env: Record<string, string | undefined> = {};
		expect(() => validateBuildEnv(env)).not.toThrow();
	});

	it("should throw when GITHUB_CLIENT_SECRET is set", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_CLIENT_SECRET: "super-secret",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_CLIENT_SECRET");
	});

	it("should throw when GITHUB_OAUTH_SECRET is set", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_OAUTH_SECRET: "oauth-secret-value",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_OAUTH_SECRET");
	});

	it("should throw when GITHUB_TOKEN is set", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_TOKEN: "ghp_xxxxxxxxxxxx",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_TOKEN");
	});

	it("should throw when GH_TOKEN is set", () => {
		const env: Record<string, string | undefined> = {
			GH_TOKEN: "ghp_yyyyyyyyyyyy",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow(/\bGH_TOKEN\b/);
	});

	it("should throw when GITHUB_PAT is set", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_PAT: "ghp_patvalue",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_PAT");
	});

	it("should throw when GITHUB_ACCESS_TOKEN is set", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_ACCESS_TOKEN: "gho_accesstoken",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_ACCESS_TOKEN");
	});

	it("should not throw when forbidden keys are explicitly undefined", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_TOKEN: undefined,
			GH_TOKEN: undefined,
		};
		expect(() => validateBuildEnv(env)).not.toThrow();
	});

	it("should throw when multiple forbidden keys are set at once", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_CLIENT_SECRET: "secret",
			GITHUB_TOKEN: "token",
		};
		expect(() => validateBuildEnv(env)).toThrow("SECURITY:");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_CLIENT_SECRET");
		expect(() => validateBuildEnv(env)).toThrow("GITHUB_TOKEN");
	});

	it("should not throw when forbidden keys are empty strings", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_CLIENT_SECRET: "",
			GITHUB_OAUTH_SECRET: "",
			GITHUB_TOKEN: "",
			GH_TOKEN: "",
			GITHUB_PAT: "",
			GITHUB_ACCESS_TOKEN: "",
		};
		expect(() => validateBuildEnv(env)).not.toThrow();
	});

	it("should not throw when only non-forbidden keys like GITHUB_CLIENT_ID are present", () => {
		const env: Record<string, string | undefined> = {
			GITHUB_CLIENT_ID: "my-client-id",
			SOME_OTHER_VAR: "some-value",
		};
		expect(() => validateBuildEnv(env)).not.toThrow();
	});
});
