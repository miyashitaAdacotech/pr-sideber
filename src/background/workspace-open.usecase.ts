import type { ScreenBounds, WindowManagerPort } from "../domain/ports/window-manager.port";

/** 配置済み判定の許容誤差 (px) */
const POSITION_TOLERANCE = 20;

export interface WorkspaceOpenRequest {
	readonly issueNumber: number;
	readonly issueUrl: string;
	readonly prUrl: string | null;
	readonly sessionUrl: string | null;
	readonly senderWindowId: number;
}

export interface WorkspaceOpenSettings {
	readonly getArrangeEnabled: () => Promise<boolean>;
}

interface ThreePanelLayout {
	readonly left: ScreenBounds;
	readonly topRight: ScreenBounds;
	readonly bottomRight: ScreenBounds;
}

/** 3パネルレイアウトの座標を純粋計算する */
export function calculateThreePanelLayout(workArea: ScreenBounds): ThreePanelLayout {
	const halfWidth = Math.round(workArea.width / 2);
	const halfHeight = Math.round(workArea.height / 2);

	return {
		left: {
			left: workArea.left,
			top: workArea.top,
			width: halfWidth,
			height: workArea.height,
		},
		topRight: {
			left: workArea.left + halfWidth,
			top: workArea.top,
			width: halfWidth,
			height: halfHeight,
		},
		bottomRight: {
			left: workArea.left + halfWidth,
			top: workArea.top + halfHeight,
			width: halfWidth,
			height: halfHeight,
		},
	};
}

/** ウィンドウが目標位置に十分近いか判定する */
function isWithinTolerance(current: ScreenBounds, target: ScreenBounds): boolean {
	return (
		Math.abs(current.left - target.left) <= POSITION_TOLERANCE &&
		Math.abs(current.top - target.top) <= POSITION_TOLERANCE &&
		Math.abs(current.width - target.width) <= POSITION_TOLERANCE &&
		Math.abs(current.height - target.height) <= POSITION_TOLERANCE
	);
}

interface ResourceEntry {
	readonly url: string | null;
	readonly queryPattern: string;
	readonly bounds: ScreenBounds;
}

/** arrange ON: 単一リソースをウィンドウ配置する */
async function placeResourceArranged(
	resource: ResourceEntry,
	windowManager: WindowManagerPort,
): Promise<void> {
	if (resource.url === null) return;

	const tabInfo = await windowManager.findTab(resource.queryPattern, resource.url);

	if (tabInfo === null) {
		await windowManager.createWindow(resource.url, resource.bounds);
		return;
	}

	if (tabInfo.windowTabCount > 1) {
		await windowManager.moveTabToNewWindow(tabInfo.tabId, resource.bounds);
		return;
	}

	// 単独タブウィンドウ: 配置済みチェック後に移動
	const currentBounds = await windowManager.getWindowBounds(tabInfo.windowId);
	if (isWithinTolerance(currentBounds, resource.bounds)) return;

	await windowManager.moveWindowToBounds(tabInfo.windowId, resource.bounds);
}

interface SimpleResourceEntry {
	readonly url: string | null;
	readonly queryPattern: string;
}

/** arrange OFF: 既存タブをフォーカスするか、senderWindowId にタブを作成する */
async function placeResourceSimple(
	resource: SimpleResourceEntry,
	senderWindowId: number,
	windowManager: WindowManagerPort,
): Promise<void> {
	if (resource.url === null) return;

	const tabInfo = await windowManager.findTab(resource.queryPattern, resource.url);

	if (tabInfo !== null) {
		await windowManager.activateTab(tabInfo.tabId);
		return;
	}

	await windowManager.createTabInWindow(resource.url, senderWindowId);
}

export function createWorkspaceOpenUseCase(
	windowManager: WindowManagerPort,
	settings: WorkspaceOpenSettings,
) {
	return {
		openWorkspace: async (request: WorkspaceOpenRequest): Promise<void> => {
			const resources = [
				{
					url: request.sessionUrl,
					queryPattern: "*://claude.ai/code/*",
				},
				{
					url: request.issueUrl,
					queryPattern: "https://github.com/*/*/issues/*",
				},
				{
					url: request.prUrl,
					queryPattern: "https://github.com/*/*/pull/*",
				},
			] as const;

			// Step 1: 常にタブを開く/フォーカスする（同じウィンドウ）
			for (const resource of resources) {
				await placeResourceSimple(resource, request.senderWindowId, windowManager);
			}

			// Step 2: 設定が ON ならウィンドウを3分割配置する
			const arrangeEnabled = await settings.getArrangeEnabled();
			if (!arrangeEnabled) return;

			const workArea = await windowManager.getScreenWorkArea();
			const layout = calculateThreePanelLayout(workArea);
			const boundsMap = [layout.left, layout.topRight, layout.bottomRight] as const;

			for (let i = 0; i < resources.length; i++) {
				await placeResourceArranged({ ...resources[i], bounds: boundsMap[i] }, windowManager);
			}
		},
	};
}
