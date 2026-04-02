export type IssueState = "OPEN" | "CLOSED";

export interface LabelDto {
	readonly name: string;
	readonly color: string;
}

export interface IssueItemDto {
	readonly id: string;
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly state: IssueState;
	readonly labels: readonly LabelDto[];
	readonly assignees: readonly string[];
	readonly updatedAt: string;
	readonly parentNumber: number | null;
	readonly parentTitle: string | null;
}

export interface IssueListDto {
	readonly items: readonly IssueItemDto[];
	readonly totalCount: number;
}

export interface IssueProcessorPort {
	processIssues(rawJson: string): IssueListDto | Promise<IssueListDto>;
}
