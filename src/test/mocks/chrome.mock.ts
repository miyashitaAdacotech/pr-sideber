import { vi } from "vitest";

type ChromeMock = {
	identity: {
		launchWebAuthFlow: ReturnType<typeof vi.fn>;
		getRedirectURL: ReturnType<typeof vi.fn>;
	};
	storage: {
		local: {
			get: ReturnType<typeof vi.fn>;
			set: ReturnType<typeof vi.fn>;
			remove: ReturnType<typeof vi.fn>;
		};
		onChanged: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
	};
	runtime: {
		id: string;
		sendMessage: ReturnType<typeof vi.fn>;
		onMessage: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
		onSuspend: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
		lastError: chrome.runtime.LastError | undefined;
	};
	alarms: {
		create: ReturnType<typeof vi.fn>;
		clear: ReturnType<typeof vi.fn>;
		onAlarm: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
	};
	action: {
		setBadgeText: ReturnType<typeof vi.fn>;
		setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
	};
	tabs: {
		get: ReturnType<typeof vi.fn>;
		query: ReturnType<typeof vi.fn>;
		update: ReturnType<typeof vi.fn>;
		create: ReturnType<typeof vi.fn>;
		onActivated: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
		onUpdated: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
		onRemoved: {
			addListener: ReturnType<typeof vi.fn>;
			removeListener: ReturnType<typeof vi.fn>;
		};
	};
	windows: {
		update: ReturnType<typeof vi.fn>;
	};
};

let chromeMock: ChromeMock;

function createChromeMock(): ChromeMock {
	return {
		identity: {
			launchWebAuthFlow: vi.fn(),
			getRedirectURL: vi.fn(() => "https://mock-redirect.chromiumapp.org/"),
		},
		storage: {
			local: {
				get: vi.fn(),
				set: vi.fn(),
				remove: vi.fn(),
			},
			onChanged: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
		},
		runtime: {
			id: "test-extension-id",
			sendMessage: vi.fn(),
			onMessage: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
			onSuspend: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
			lastError: undefined,
		},
		alarms: {
			create: vi.fn(),
			clear: vi.fn(),
			onAlarm: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
		},
		action: {
			setBadgeText: vi.fn(),
			setBadgeBackgroundColor: vi.fn(),
		},
		tabs: {
			get: vi.fn(),
			query: vi.fn(),
			update: vi.fn(),
			create: vi.fn(),
			onActivated: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
			onUpdated: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
			onRemoved: {
				addListener: vi.fn(),
				removeListener: vi.fn(),
			},
		},
		windows: {
			update: vi.fn(),
		},
	};
}

export function setupChromeMock(): ChromeMock {
	chromeMock = createChromeMock();
	// globalThis に chrome をセット (型安全性より実用性を優先)
	(globalThis as Record<string, unknown>).chrome = chromeMock;
	return chromeMock;
}

export function resetChromeMock(): void {
	(globalThis as Record<string, unknown>).chrome = undefined;
}

export function getChromeMock(): ChromeMock {
	return chromeMock;
}
