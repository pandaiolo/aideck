import { vi } from "vitest";

export function createMockStreamDeck() {
	return {
		default: {
			logger: {
				info: vi.fn(),
				error: vi.fn(),
				warn: vi.fn(),
				debug: vi.fn(),
				trace: vi.fn(),
			},
			settings: {
				getGlobalSettings: vi.fn().mockResolvedValue({}),
				onDidReceiveGlobalSettings: vi.fn(),
			},
			profiles: {
				switchToProfile: vi.fn().mockResolvedValue(undefined),
			},
			actions: {
				registerAction: vi.fn(),
			},
			connect: vi.fn().mockResolvedValue(undefined),
		},
		action: () => (target: unknown) => target,
		SingletonAction: class {},
		KeyDownEvent: class {},
		WillAppearEvent: class {},
		WillDisappearEvent: class {},
	};
}
