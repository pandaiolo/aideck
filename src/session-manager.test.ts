import { describe, expect, it, vi } from "vitest";
import type { Session } from "./sessions";

// Mock all external dependencies
vi.mock("@elgato/streamdeck", () => ({
	default: {
		logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
		settings: {
			getGlobalSettings: vi.fn().mockResolvedValue({}),
			onDidReceiveGlobalSettings: vi.fn(),
		},
		profiles: { switchToProfile: vi.fn().mockResolvedValue(undefined) },
	},
}));

vi.mock("./sessions", () => ({
	sortSessions: vi.fn((s: Session[]) => s),
}));

vi.mock("./renderer", () => ({
	renderSessionKey: vi.fn().mockReturnValue("data:session"),
	renderNavKey: vi.fn().mockReturnValue("data:nav"),
	renderEmptyKey: vi.fn().mockReturnValue("data:empty"),
	renderOpenPanelKey: vi.fn().mockReturnValue("data:panel"),
	DEFAULT_COLORS: {
		awaiting: "#4CAF50",
		working: "#FFA726",
		inactive: "#555555",
	},
}));

vi.mock("./ntfy", () => ({
	ntfySubscriber: {
		start: vi.fn(),
		stop: vi.fn(),
		getRemoteSessions: vi.fn().mockReturnValue(new Map()),
		getSortedSessions: vi.fn().mockReturnValue([]),
		reconfigure: vi.fn(),
	},
}));

vi.mock("./hook-installer", () => ({
	generateTopic: vi.fn().mockReturnValue("aideck-mocktopic12345678"),
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
	default: {
		existsSync: vi.fn().mockReturnValue(false),
		writeFileSync: vi.fn(),
		mkdirSync: vi.fn(),
	},
}));

vi.mock("node:path", async () => {
	const actual = await vi.importActual<typeof import("node:path")>("node:path");
	return { default: actual, ...actual };
});

vi.mock("node:os", () => ({
	default: { homedir: () => "/mock/home" },
}));

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		sessionId: "s1",
		summary: "test summary",
		firstPrompt: "hello",
		projectPath: "/proj",
		projectName: "myproj",
		created: "2026-03-30T10:00:00Z",
		modified: "2026-03-30T12:00:00Z",
		messageCount: 5,
		gitBranch: "main",
		status: "working",
		hostname: "Mac",
		remoteUrl: "",
		...overrides,
	};
}

function makeAction(id = "action-1") {
	return { id, setImage: vi.fn().mockResolvedValue(undefined) };
}

// We need to get a fresh sessionManager for each test
async function getSessionManager() {
	vi.resetModules();

	// Re-apply all mocks after resetModules
	vi.doMock("@elgato/streamdeck", () => ({
		default: {
			logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
			settings: {
				getGlobalSettings: vi.fn().mockResolvedValue({}),
				onDidReceiveGlobalSettings: vi.fn(),
			},
			profiles: { switchToProfile: vi.fn().mockResolvedValue(undefined) },
		},
	}));
	vi.doMock("./sessions", () => ({
		sortSessions: vi.fn((s: Session[]) => s),
	}));
	vi.doMock("./renderer", () => ({
		renderSessionKey: vi.fn().mockReturnValue("data:session"),
		renderNavKey: vi.fn().mockReturnValue("data:nav"),
		renderEmptyKey: vi.fn().mockReturnValue("data:empty"),
		renderOpenPanelKey: vi.fn().mockReturnValue("data:panel"),
		DEFAULT_COLORS: {
			awaiting: "#4CAF50",
			working: "#FFA726",
			inactive: "#555555",
		},
	}));
	vi.doMock("./ntfy", () => ({
		ntfySubscriber: {
			start: vi.fn(),
			stop: vi.fn(),
			getRemoteSessions: vi.fn().mockReturnValue(new Map()),
			getSortedSessions: vi.fn().mockReturnValue([]),
			reconfigure: vi.fn(),
		},
	}));
	vi.doMock("./hook-installer", () => ({
		generateTopic: vi.fn().mockReturnValue("aideck-mocktopic12345678"),
	}));
	vi.doMock("node:child_process", () => ({
		execFile: vi.fn(),
	}));
	vi.doMock("node:fs", () => ({
		default: {
			existsSync: vi.fn().mockReturnValue(false),
			writeFileSync: vi.fn(),
			mkdirSync: vi.fn(),
		},
	}));
	vi.doMock("node:os", () => ({
		default: { homedir: () => "/mock/home" },
	}));

	const mod = await import("./session-manager");
	const ntfyMod = await import("./ntfy");
	const cpMod = await import("node:child_process");

	return {
		sessionManager: mod.sessionManager,
		ntfySubscriber: ntfyMod.ntfySubscriber as unknown as {
			getSortedSessions: ReturnType<typeof vi.fn>;
			start: ReturnType<typeof vi.fn>;
			stop: ReturnType<typeof vi.fn>;
		},
		execFile: cpMod.execFile as unknown as ReturnType<typeof vi.fn>,
	};
}

// ── Pagination ────────────────────────────────────────────

describe("pagination", () => {
	it("getSessionForSlot returns undefined with no sessions", async () => {
		const { sessionManager } = await getSessionManager();
		expect(sessionManager.getSessionForSlot(0)).toBeUndefined();
	});

	it("getSessionForSlot returns session at index", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		const sessions = [
			makeSession({ sessionId: "s1" }),
			makeSession({ sessionId: "s2" }),
		];
		ntfySubscriber.getSortedSessions.mockReturnValue(sessions);
		sessionManager.refresh();
		expect(sessionManager.getSessionForSlot(0)?.sessionId).toBe("s1");
		expect(sessionManager.getSessionForSlot(1)?.sessionId).toBe("s2");
	});

	it("totalPages returns 1 with no sessions", async () => {
		const { sessionManager } = await getSessionManager();
		expect(sessionManager.totalPages).toBe(1);
	});

	it("totalPages returns 1 with 12 sessions", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 12 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		expect(sessionManager.totalPages).toBe(1);
	});

	it("totalPages returns 2 with 13 sessions", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 13 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		expect(sessionManager.totalPages).toBe(2);
	});

	it("nextPage advances from page 0", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 25 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		sessionManager.nextPage();
		expect(sessionManager.getSessionForSlot(0)?.sessionId).toBe("s12");
	});

	it("nextPage does not go past last page", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 13 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		sessionManager.nextPage();
		sessionManager.nextPage(); // should not advance
		expect(sessionManager.getSessionForSlot(0)?.sessionId).toBe("s12");
	});

	it("prevPage goes back from page 1", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 25 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		sessionManager.nextPage();
		sessionManager.prevPage();
		expect(sessionManager.getSessionForSlot(0)?.sessionId).toBe("s0");
	});

	it("prevPage does not go below page 0", async () => {
		const { sessionManager } = await getSessionManager();
		sessionManager.prevPage();
		expect(sessionManager.getSessionForSlot(0)).toBeUndefined();
	});

	it("clamps page when sessions shrink", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue(
			Array.from({ length: 25 }, (_, i) => makeSession({ sessionId: `s${i}` })),
		);
		sessionManager.refresh();
		sessionManager.nextPage(); // page 1

		ntfySubscriber.getSortedSessions.mockReturnValue([
			makeSession({ sessionId: "s0" }),
		]);
		sessionManager.refresh();
		expect(sessionManager.getSessionForSlot(0)?.sessionId).toBe("s0");
	});
});

// ── openSession ───────────────────────────────────────────

describe("openSession", () => {
	it("opens remote session with Claude Desktop when installed", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = true;

		const session = makeSession({
			remoteUrl: "https://claude.ai/code/session_abc123",
		});
		sessionManager.openSession(session);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			["claude://claude.ai/claude-code-desktop/session_abc123"],
			expect.any(Function),
		);
	});

	it("opens remote URL directly when Claude not installed", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = false;

		const session = makeSession({
			remoteUrl: "https://claude.ai/code/session_abc123",
		});
		sessionManager.openSession(session);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			["https://claude.ai/code/session_abc123"],
			expect.any(Function),
		);
	});

	it("opens remote URL directly when openInDesktop is false", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = true;
		(sessionManager as unknown as { openInDesktop: boolean }).openInDesktop =
			false;

		const session = makeSession({
			remoteUrl: "https://claude.ai/code/session_abc123",
		});
		sessionManager.openSession(session);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			["https://claude.ai/code/session_abc123"],
			expect.any(Function),
		);
	});

	it("opens local session with claude:// protocol", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = true;

		const session = makeSession({ remoteUrl: "", projectPath: "/my/project" });
		sessionManager.openSession(session);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			[expect.stringContaining("claude://resume?session=s1")],
			expect.any(Function),
		);
	});

	it("does nothing for local session when Claude not installed", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = false;

		const session = makeSession({ remoteUrl: "" });
		sessionManager.openSession(session);
		expect(execFile).not.toHaveBeenCalled();
	});

	it("URL-encodes projectPath", async () => {
		const { sessionManager, execFile } = await getSessionManager();
		(
			sessionManager as unknown as { claudeInstalled: boolean }
		).claudeInstalled = true;

		const session = makeSession({
			remoteUrl: "",
			projectPath: "/my project/path",
		});
		sessionManager.openSession(session);
		expect(execFile).toHaveBeenCalledWith(
			"open",
			[expect.stringContaining(encodeURIComponent("/my project/path"))],
			expect.any(Function),
		);
	});
});

// ── applySettings ─────────────────────────────────────────

describe("applySettings", () => {
	it("applies default settings", async () => {
		const { sessionManager } = await getSessionManager();
		const sm = sessionManager as unknown as {
			applySettings: (s: Record<string, unknown>) => void;
			openInDesktop: boolean;
			singlePanel: boolean;
			fontSize: string;
		};
		sm.applySettings({});
		expect(sm.openInDesktop).toBe(true);
		expect(sm.singlePanel).toBe(false);
		expect(sm.fontSize).toBe("small");
	});

	it("sets openInDesktop to false", async () => {
		const { sessionManager } = await getSessionManager();
		const sm = sessionManager as unknown as {
			applySettings: (s: Record<string, unknown>) => void;
			openInDesktop: boolean;
		};
		sm.applySettings({ openInDesktop: false });
		expect(sm.openInDesktop).toBe(false);
	});

	it("applies custom colors", async () => {
		const { sessionManager } = await getSessionManager();
		const sm = sessionManager as unknown as {
			applySettings: (s: Record<string, unknown>) => void;
			colors: { awaiting: string; working: string; inactive: string };
		};
		sm.applySettings({
			colorAwaiting: "#ff0000",
			colorWorking: "#00ff00",
			colorInactive: "#0000ff",
		});
		expect(sm.colors.awaiting).toBe("#ff0000");
		expect(sm.colors.working).toBe("#00ff00");
		expect(sm.colors.inactive).toBe("#0000ff");
	});

	it("falls back to defaults for missing colors", async () => {
		const { sessionManager } = await getSessionManager();
		const sm = sessionManager as unknown as {
			applySettings: (s: Record<string, unknown>) => void;
			colors: { awaiting: string; working: string; inactive: string };
		};
		sm.applySettings({});
		expect(sm.colors.awaiting).toBe("#4CAF50");
	});

	it("applies fontSize", async () => {
		const { sessionManager } = await getSessionManager();
		const sm = sessionManager as unknown as {
			applySettings: (s: Record<string, unknown>) => void;
			fontSize: string;
		};
		sm.applySettings({ fontSize: "large" });
		expect(sm.fontSize).toBe("large");
	});
});

// ── refresh ───────────────────────────────────────────────

describe("refresh", () => {
	it("calls ntfySubscriber.getSortedSessions", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		sessionManager.refresh();
		expect(ntfySubscriber.getSortedSessions).toHaveBeenCalled();
	});

	it("updates registered slot with session image", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue([makeSession()]);
		const action = makeAction();
		sessionManager.registerSlot(action, 0);
		sessionManager.refresh();
		expect(action.setImage).toHaveBeenCalledWith("data:session");
	});

	it("updates registered slot with empty image when no session", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue([]);
		const action = makeAction();
		sessionManager.registerSlot(action, 0);
		sessionManager.refresh();
		expect(action.setImage).toHaveBeenCalledWith("data:empty");
	});

	it("updates panel with counts", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue([
			makeSession({ status: "working" }),
			makeSession({ sessionId: "s2", status: "awaiting_input" }),
		]);
		const panelAction = makeAction("panel");
		sessionManager.registerPanel(panelAction);
		expect(panelAction.setImage).toHaveBeenCalledWith("data:panel");
	});
});

// ── Registration lifecycle ────────────────────────────────

describe("registration lifecycle", () => {
	it("registerSlot stores and immediately updates slot", async () => {
		const { sessionManager } = await getSessionManager();
		const action = makeAction();
		sessionManager.registerSlot(action, 0);
		expect(action.setImage).toHaveBeenCalled();
	});

	it("unregisterSlot removes slot", async () => {
		const { sessionManager, ntfySubscriber } = await getSessionManager();
		ntfySubscriber.getSortedSessions.mockReturnValue([makeSession()]);
		const action = makeAction();
		sessionManager.registerSlot(action, 0);
		sessionManager.unregisterSlot("action-1");
		// After unregister, refresh should not call setImage on the removed action
		action.setImage.mockClear();
		sessionManager.refresh();
		expect(action.setImage).not.toHaveBeenCalled();
	});

	it("getSessionForNavSlot returns undefined in normal mode", async () => {
		const { sessionManager } = await getSessionManager();
		expect(sessionManager.getSessionForNavSlot("prev")).toBeUndefined();
	});
});

// ── Auto-topic generation ────────────────────────────────

describe("auto-topic generation", () => {
	it("generates topic when none configured", async () => {
		vi.resetModules();
		const mockSetGlobalSettings = vi.fn().mockResolvedValue(undefined);
		vi.doMock("@elgato/streamdeck", () => ({
			default: {
				logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
				settings: {
					getGlobalSettings: vi.fn().mockResolvedValue({}),
					onDidReceiveGlobalSettings: vi.fn(),
					setGlobalSettings: mockSetGlobalSettings,
				},
				profiles: { switchToProfile: vi.fn().mockResolvedValue(undefined) },
			},
		}));
		vi.doMock("./sessions", () => ({
			sortSessions: vi.fn((s: Session[]) => s),
		}));
		vi.doMock("./renderer", () => ({
			renderSessionKey: vi.fn().mockReturnValue("data:session"),
			renderNavKey: vi.fn().mockReturnValue("data:nav"),
			renderEmptyKey: vi.fn().mockReturnValue("data:empty"),
			renderOpenPanelKey: vi.fn().mockReturnValue("data:panel"),
			DEFAULT_COLORS: {
				awaiting: "#4CAF50",
				working: "#FFA726",
				inactive: "#555555",
			},
		}));
		vi.doMock("./ntfy", () => ({
			ntfySubscriber: {
				start: vi.fn(),
				stop: vi.fn(),
				getRemoteSessions: vi.fn().mockReturnValue(new Map()),
				getSortedSessions: vi.fn().mockReturnValue([]),
				reconfigure: vi.fn(),
			},
		}));
		vi.doMock("./hook-installer", () => ({
			generateTopic: vi.fn().mockReturnValue("aideck-mocktopic12345678"),
		}));
		vi.doMock("node:child_process", () => ({ execFile: vi.fn() }));
		vi.doMock("node:fs", () => ({
			default: {
				existsSync: vi.fn().mockReturnValue(false),
				writeFileSync: vi.fn(),
				mkdirSync: vi.fn(),
				readFileSync: vi.fn().mockImplementation(() => {
					throw new Error("ENOENT");
				}),
			},
		}));
		vi.doMock("node:os", () => ({
			default: { homedir: () => "/mock/home" },
		}));

		const mod = await import("./session-manager");
		mod.sessionManager.start();
		await vi.waitFor(() => {
			expect(mockSetGlobalSettings).toHaveBeenCalledWith(
				expect.objectContaining({ ntfyTopic: "aideck-mocktopic12345678" }),
			);
		});
	});

	it("does not overwrite existing topic", async () => {
		vi.resetModules();
		const mockSetGlobalSettings = vi.fn().mockResolvedValue(undefined);
		vi.doMock("@elgato/streamdeck", () => ({
			default: {
				logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
				settings: {
					getGlobalSettings: vi
						.fn()
						.mockResolvedValue({ ntfyTopic: "my-custom-topic" }),
					onDidReceiveGlobalSettings: vi.fn(),
					setGlobalSettings: mockSetGlobalSettings,
				},
				profiles: { switchToProfile: vi.fn().mockResolvedValue(undefined) },
			},
		}));
		vi.doMock("./sessions", () => ({
			sortSessions: vi.fn((s: Session[]) => s),
		}));
		vi.doMock("./renderer", () => ({
			renderSessionKey: vi.fn().mockReturnValue("data:session"),
			renderNavKey: vi.fn().mockReturnValue("data:nav"),
			renderEmptyKey: vi.fn().mockReturnValue("data:empty"),
			renderOpenPanelKey: vi.fn().mockReturnValue("data:panel"),
			DEFAULT_COLORS: {
				awaiting: "#4CAF50",
				working: "#FFA726",
				inactive: "#555555",
			},
		}));
		vi.doMock("./ntfy", () => ({
			ntfySubscriber: {
				start: vi.fn(),
				stop: vi.fn(),
				getRemoteSessions: vi.fn().mockReturnValue(new Map()),
				getSortedSessions: vi.fn().mockReturnValue([]),
				reconfigure: vi.fn(),
			},
		}));
		vi.doMock("./hook-installer", () => ({
			generateTopic: vi.fn().mockReturnValue("aideck-shouldnotbeused"),
		}));
		vi.doMock("node:child_process", () => ({ execFile: vi.fn() }));
		vi.doMock("node:fs", () => ({
			default: {
				existsSync: vi.fn().mockReturnValue(false),
				writeFileSync: vi.fn(),
				mkdirSync: vi.fn(),
				readFileSync: vi.fn().mockImplementation(() => {
					throw new Error("ENOENT");
				}),
			},
		}));
		vi.doMock("node:os", () => ({
			default: { homedir: () => "/mock/home" },
		}));

		const mod = await import("./session-manager");
		mod.sessionManager.start();
		// setGlobalSettings should NOT be called since topic already exists
		await new Promise((r) => setTimeout(r, 10));
		expect(mockSetGlobalSettings).not.toHaveBeenCalled();
	});
});
