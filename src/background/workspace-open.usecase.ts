import type { ScreenBounds, WindowManagerPort } from "../domain/ports/window-manager.port";
import type { WorkspaceOpenRequest } from "../shared/types/workspace";

// WorkspaceOpenRequest は shared/types/workspace に統合 (Issue #13)。
// 下流で本モジュール経由の型参照を維持するため re-export する。
export type { WorkspaceOpenRequest };

/** 配置済み判定の許容誤差 (px) */
const POSITION_TOLERANCE = 20;

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

/** 前回作成したパネルの状態 */
interface PanelState {
	readonly tabId: number;
	readonly windowId: number;
}

export function createWorkspaceOpenUseCase(
	windowManager: WindowManagerPort,
	settings: WorkspaceOpenSettings,
) {
	// クロージャ内でパネル状態を保持（SW 再起動時はリセットされる）
	let topRightPanel: PanelState | null = null;
	let bottomRightPanel: PanelState | null = null;

	/** 既存パネルを再利用するか、新規作成する */
	async function openOrReusePanel(
		url: string,
		bounds: ScreenBounds,
		panel: PanelState | null,
	): Promise<PanelState> {
		// 前回のパネルがあれば再利用を試みる
		if (panel !== null) {
			const exists = await windowManager.windowExists(panel.windowId);
			if (exists) {
				console.log("[workspace]   reuse panel:", JSON.stringify(panel));
				await windowManager.navigateTab(panel.tabId, url);
				const currentBounds = await windowManager.getWindowBounds(panel.windowId);
				if (!isWithinTolerance(currentBounds, bounds)) {
					await windowManager.moveWindowToBounds(panel.windowId, bounds);
				}
				return panel;
			}
			console.log("[workspace]   panel gone, creating new");
		}

		// 新規作成
		console.log("[workspace]   createWindow (new)");
		const created = await windowManager.createWindow(url, bounds);
		return { tabId: created.tabId, windowId: created.windowId };
	}

	return {
		openWorkspace: async (request: WorkspaceOpenRequest): Promise<void> => {
			console.log("[workspace] === openWorkspace ===");
			console.log("[workspace] senderWindowId:", request.senderWindowId);

			// Session タブを sender ウィンドウ内に開く
			if (request.sessionUrl !== null) {
				console.log("[workspace] session: opening in sender window");
				const existing = await windowManager.findTab("*://claude.ai/code/*", request.sessionUrl);
				if (existing !== null) {
					console.log("[workspace] session: found existing tab:", existing.tabId);
					await windowManager.activateTab(existing.tabId);
				} else {
					console.log("[workspace] session: creating new tab in sender");
					await windowManager.createTabInWindow(request.sessionUrl, request.senderWindowId);
				}
			}

			// 配置が無効なら、タブを開くだけで終了
			const arrangeEnabled = await settings.getArrangeEnabled();
			console.log("[workspace] arrangeEnabled:", arrangeEnabled);

			if (!arrangeEnabled) {
				const tabUrls = [request.issueUrl, request.prUrl];
				for (const url of tabUrls) {
					if (url === null) continue;
					await windowManager.createTabInWindow(url, request.senderWindowId);
				}
				return;
			}

			const workArea = await windowManager.getScreenWorkArea();
			const layout = calculateThreePanelLayout(workArea);
			console.log("[workspace] workArea:", JSON.stringify(workArea));
			console.log("[workspace] layout:", JSON.stringify(layout));

			// Issue → topRight（再利用 or 新規）
			console.log("[workspace] issue: target topRight");
			topRightPanel = await openOrReusePanel(request.issueUrl, layout.topRight, topRightPanel);

			// PR → bottomRight（再利用 or 新規）
			if (request.prUrl !== null) {
				console.log("[workspace] pr: target bottomRight");
				bottomRightPanel = await openOrReusePanel(
					request.prUrl,
					layout.bottomRight,
					bottomRightPanel,
				);
			}

			// Sender ウィンドウ (PR Sidebar 付き) → left にリサイズ
			console.log("[workspace] sender: resizing to left");
			const senderBounds = await windowManager.getWindowBounds(request.senderWindowId);
			if (!isWithinTolerance(senderBounds, layout.left)) {
				await windowManager.moveWindowToBounds(request.senderWindowId, layout.left);
				console.log("[workspace] sender: moved to left");
			} else {
				console.log("[workspace] sender: already in position");
			}

			console.log("[workspace] === done ===");
		},
	};
}
