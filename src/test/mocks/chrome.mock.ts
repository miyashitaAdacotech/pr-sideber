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
		lastError: chrome.runtime.LastError | undefined;
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
			lastError: undefined,
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
