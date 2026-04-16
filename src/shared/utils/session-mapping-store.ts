/**
 * Claude セッションと Issue 番号の手動マッピングを CRUD するストア。
 *
 * 保存先は `chrome.storage.local` の `sessionIssueMapping` キー。
 * Service Worker (background) と Sidepanel の両方から呼ばれうるため shared/utils に配置する。
 *
 * 書き込みは `writeQueue` で直列化する。
 * chrome.storage.local.set は atomic だが read-modify-write 全体は atomic ではないため、
 * 並行実行すると古い値を読んで上書きする lost update が発生する。
 * モジュールレベルの Promise chain で後続タスクを前のタスクに連結してこれを防ぐ。
 */
import type { SessionIssueMapping } from "../types/claude-session";
import { isValidSessionId } from "./session-id";

const STORAGE_KEY = "sessionIssueMapping";

/**
 * 書き込みを直列化するための Promise chain。
 * 各 write 操作はこのチェーンの末尾に append される。
 * エラーは個別 Promise に伝播させるが、キュー自体は止めないため
 * 失敗時も `writeQueue` は解決済みにして後続をブロックしない。
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
	const next = writeQueue.then(fn);
	// 次のタスクが前のタスクの失敗でスキップされないようにキューは常に解決状態に戻す。
	writeQueue = next.then(
		() => undefined,
		() => undefined,
	);
	return next;
}

function assertValidSessionId(sessionId: string): void {
	if (!isValidSessionId(sessionId)) {
		throw new Error(`Invalid sessionId: ${String(sessionId)}`);
	}
}

function assertValidIssueNumber(issueNumber: number): void {
	// Number.isInteger は NaN / Infinity / 非整数 をすべて false にする。
	// 追加で issueNumber <= 0 を弾いて 0 と負数を禁止する。
	if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
		throw new Error(`Invalid issueNumber: ${String(issueNumber)}`);
	}
}

async function readAll(): Promise<SessionIssueMapping> {
	const result = await chrome.storage.local.get(STORAGE_KEY);
	return (result[STORAGE_KEY] as SessionIssueMapping | undefined) ?? {};
}

export async function getMapping(sessionId: string): Promise<number | undefined> {
	assertValidSessionId(sessionId);
	const all = await readAll();
	return all[sessionId];
}

export async function getAllMappings(): Promise<SessionIssueMapping> {
	return readAll();
}

export async function setMapping(sessionId: string, issueNumber: number): Promise<void> {
	// async 関数にすることで assertXxx の同期 throw が自動的に rejected Promise になる。
	// 呼び出し側が await/.catch で受け取れる一貫したエラー伝播を保証する。
	assertValidSessionId(sessionId);
	assertValidIssueNumber(issueNumber);
	return enqueueWrite(async () => {
		const current = await readAll();
		// 不変性を保つため spread で新オブジェクトを作る。
		const updated: SessionIssueMapping = { ...current, [sessionId]: issueNumber };
		await chrome.storage.local.set({ [STORAGE_KEY]: updated });
	});
}

export async function deleteMapping(sessionId: string): Promise<void> {
	assertValidSessionId(sessionId);
	return enqueueWrite(async () => {
		const current = await readAll();
		if (!(sessionId in current)) {
			// 冪等性: 未登録 sessionId を削除してもエラーにしない。
			return;
		}
		const { [sessionId]: _removed, ...rest } = current;
		await chrome.storage.local.set({ [STORAGE_KEY]: rest });
	});
}
