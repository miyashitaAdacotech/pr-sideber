import { describe, expect, it } from "vitest";
import { extractIssueNumberFromTitle } from "../../background/claude-session-watcher";

describe("extractIssueNumberFromTitle", () => {
	it("extracts from 'Inv #1882 [#1613] CI/CD App統一'", () => {
		expect(extractIssueNumberFromTitle("Inv #1882 [#1613] CI/CD App統一")).toBe(1882);
	});

	it("extracts from 'Investigate issue 2185'", () => {
		expect(extractIssueNumberFromTitle("Investigate issue 2185")).toBe(2185);
	});

	it("extracts from 'Investigate Issue 1325'", () => {
		expect(extractIssueNumberFromTitle("Investigate Issue 1325")).toBe(1325);
	});

	it("extracts from '[close] issue 1966'", () => {
		expect(extractIssueNumberFromTitle("[close] issue 1966")).toBe(1966);
	});

	it("extracts from 'Inv #2013 -> #2065 [#1671]...'", () => {
		expect(extractIssueNumberFromTitle("Inv #2013 -> #2065 [#1671]...")).toBe(2013);
	});

	it("returns null for 'Plan model optimization algorithm ...'", () => {
		expect(extractIssueNumberFromTitle("Plan model optimization algorithm ...")).toBeNull();
	});

	it("returns null for empty string", () => {
		expect(extractIssueNumberFromTitle("")).toBeNull();
	});

	it("returns null for 'Claude Code'", () => {
		expect(extractIssueNumberFromTitle("Claude Code")).toBeNull();
	});
});
