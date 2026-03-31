import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
	default: {
		logger: {
			info: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			debug: vi.fn(),
			trace: vi.fn(),
		},
	},
}));

vi.mock("node:https", () => ({
	default: { get: vi.fn().mockReturnValue({ on: vi.fn(), destroy: vi.fn() }) },
}));

vi.mock("node:http", () => ({
	default: { get: vi.fn().mockReturnValue({ on: vi.fn(), destroy: vi.fn() }) },
}));

import { type NtfyDeps, NtfySubscriber } from "./ntfy";

function makeDeps(cacheContent?: string): NtfyDeps {
	const cachePath = "/mock/cache.json";
	vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
		const str = p as string;
		if (str === cachePath && cacheContent !== undefined) return cacheContent;
		throw new Error("ENOENT");
	});
	vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
	vi.spyOn(fs, "renameSync").mockImplementation(() => {});
	vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as never);
	return {
		cachePath,
		logger: { info: vi.fn(), error: vi.fn() },
	};
}

function makeMessage(state: Record<string, unknown>): string {
	return JSON.stringify({ event: "message", message: JSON.stringify(state) });
}

const baseState = {
	sessionId: "s1",
	status: "working",
	projectPath: "/proj",
	projectName: "myproj",
	gitBranch: "main",
	sessionName: "test-session",
	remoteUrl: "https://claude.ai/code/session_abc",
	startedAt: "2026-03-30T10:00:00Z",
	updatedAt: "2026-03-30T10:05:00Z",
	hostname: "remote-box",
};

// ── loadCache ────────────────────────────────────────────

describe("loadCache", () => {
	it("loads sessions from valid cache file", () => {
		const cache = {
			sessions: {
				s1: {
					sessionId: "s1",
					summary: "cached",
					firstPrompt: "",
					projectPath: "/proj",
					projectName: "myproj",
					created: "2026-03-30T10:00:00Z",
					modified: "2026-03-30T10:05:00Z",
					messageCount: 0,
					gitBranch: "main",
					status: "working",
					hostname: "Mac",
					remoteUrl: "",
				},
			},
			lastSeen: { s1: Date.now() },
			lastUpdated: Date.now(),
		};
		const deps = makeDeps(JSON.stringify(cache));
		const sub = new NtfySubscriber(deps);
		expect(sub.getRemoteSessions().size).toBe(1);
		expect(sub.getRemoteSessions().get("s1")?.summary).toBe("cached");
	});

	it("starts empty when cache file does not exist", () => {
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("starts empty when cache file is corrupted", () => {
		const deps = makeDeps("not json{");
		const sub = new NtfySubscriber(deps);
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("filters stale sessions from cache on access", () => {
		vi.useFakeTimers();
		const staleTime = Date.now() - 6 * 60 * 1000; // 6 minutes ago
		const cache = {
			sessions: {
				stale: {
					sessionId: "stale",
					summary: "old",
					firstPrompt: "",
					projectPath: "/p",
					projectName: "p",
					created: "",
					modified: "",
					messageCount: 0,
					gitBranch: "",
					status: "working",
					hostname: "",
					remoteUrl: "",
				},
			},
			lastSeen: { stale: staleTime },
			lastUpdated: staleTime,
		};
		const deps = makeDeps(JSON.stringify(cache));
		const sub = new NtfySubscriber(deps);
		expect(sub.getRemoteSessions().size).toBe(0);
		vi.useRealTimers();
	});
});

// ── handleMessage ─────────────────────────────────────────

describe("handleMessage", () => {
	let sub: NtfySubscriber;
	let onUpdate: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		const deps = makeDeps();
		sub = new NtfySubscriber(deps);
		onUpdate = vi.fn();
		(sub as unknown as { onUpdate: () => void }).onUpdate = onUpdate;
	});

	it("adds a valid session to remoteSessions", () => {
		sub.handleMessage(makeMessage(baseState));
		const sessions = sub.getRemoteSessions();
		expect(sessions.size).toBe(1);
		expect(sessions.get("s1")?.projectName).toBe("myproj");
	});

	it("maps all Session fields correctly", () => {
		sub.handleMessage(makeMessage(baseState));
		const s = sub.getRemoteSessions().get("s1")!;
		expect(s.sessionId).toBe("s1");
		expect(s.summary).toBe("test-session");
		expect(s.firstPrompt).toBe("");
		expect(s.projectPath).toBe("/proj");
		expect(s.projectName).toBe("myproj");
		expect(s.created).toBe("2026-03-30T10:00:00Z");
		expect(s.modified).toBe("2026-03-30T10:05:00Z");
		expect(s.messageCount).toBe(0);
		expect(s.gitBranch).toBe("main");
		expect(s.status).toBe("working");
		expect(s.hostname).toBe("remote-box");
		expect(s.remoteUrl).toBe("https://claude.ai/code/session_abc");
	});

	it("skips non-message events", () => {
		sub.handleMessage(JSON.stringify({ event: "open" }));
		expect(sub.getRemoteSessions().size).toBe(0);
		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("skips message without message field", () => {
		sub.handleMessage(JSON.stringify({ event: "message" }));
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("skips invalid outer JSON", () => {
		sub.handleMessage("not json");
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("skips invalid inner JSON", () => {
		sub.handleMessage(
			JSON.stringify({ event: "message", message: "not json" }),
		);
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("marks session inactive on SessionEnd", () => {
		sub.handleMessage(makeMessage(baseState));
		expect(sub.getRemoteSessions().get("s1")?.status).toBe("working");

		sub.handleMessage(makeMessage({ ...baseState, event: "SessionEnd" }));
		expect(sub.getRemoteSessions().size).toBe(1);
		expect(sub.getRemoteSessions().get("s1")?.status).toBe("inactive");
	});

	it("ignores SessionEnd for unknown session", () => {
		sub.handleMessage(
			makeMessage({ sessionId: "unknown", event: "SessionEnd" }),
		);
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("normalizes working status", () => {
		sub.handleMessage(makeMessage({ ...baseState, status: "working" }));
		expect(sub.getRemoteSessions().get("s1")?.status).toBe("working");
	});

	it("normalizes awaiting_input status", () => {
		sub.handleMessage(makeMessage({ ...baseState, status: "awaiting_input" }));
		expect(sub.getRemoteSessions().get("s1")?.status).toBe("awaiting_input");
	});

	it("normalizes unknown status to inactive", () => {
		sub.handleMessage(makeMessage({ ...baseState, status: "unknown_status" }));
		expect(sub.getRemoteSessions().get("s1")?.status).toBe("inactive");
	});

	it("skips message without sessionId", () => {
		sub.handleMessage(makeMessage({ ...baseState, sessionId: "" }));
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("calls onUpdate on success", () => {
		sub.handleMessage(makeMessage(baseState));
		expect(onUpdate).toHaveBeenCalledOnce();
	});

	it("does not call onUpdate on skipped message", () => {
		sub.handleMessage(JSON.stringify({ event: "open" }));
		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("defaults hostname to 'remote' when empty", () => {
		sub.handleMessage(makeMessage({ ...baseState, hostname: "" }));
		expect(sub.getRemoteSessions().get("s1")?.hostname).toBe("remote");
	});
});

// ── saveCache ────────────────────────────────────────────

describe("saveCache", () => {
	it("writes cache after successful handleMessage", () => {
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));
		expect(fs.writeFileSync).toHaveBeenCalled();
		expect(fs.renameSync).toHaveBeenCalled();
	});

	it("does not write cache on skipped message", () => {
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(JSON.stringify({ event: "open" }));
		expect(fs.writeFileSync).not.toHaveBeenCalled();
	});

	it("does not break on write failure", () => {
		const deps = makeDeps();
		vi.spyOn(fs, "writeFileSync").mockImplementation(() => {
			throw new Error("disk full");
		});
		const sub = new NtfySubscriber(deps);
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));
		expect(sub.getRemoteSessions().size).toBe(1);
	});
});

// ── getSortedSessions ────────────────────────────────────

describe("getSortedSessions", () => {
	it("returns empty array with no sessions", () => {
		const sub = new NtfySubscriber(makeDeps());
		expect(sub.getSortedSessions()).toEqual([]);
	});

	it("returns sessions sorted by status and date", () => {
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(
			makeMessage({
				...baseState,
				sessionId: "inactive",
				status: "unknown",
				startedAt: "2026-03-31T00:00:00Z",
			}),
		);
		sub.handleMessage(
			makeMessage({
				...baseState,
				sessionId: "active",
				status: "working",
				startedAt: "2026-03-30T00:00:00Z",
			}),
		);
		const sorted = sub.getSortedSessions();
		expect(sorted[0].sessionId).toBe("active");
	});

	it("excludes stale sessions", () => {
		vi.useFakeTimers();
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));
		expect(sub.getSortedSessions()).toHaveLength(1);

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		expect(sub.getSortedSessions()).toHaveLength(0);
		vi.useRealTimers();
	});
});

// ── getRemoteSessions (stale filtering) ───────────────────

describe("getRemoteSessions", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns empty map when no sessions", () => {
		const sub = new NtfySubscriber(makeDeps());
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("returns fresh sessions", () => {
		const sub = new NtfySubscriber(makeDeps());
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));
		expect(sub.getRemoteSessions().size).toBe(1);
	});

	it("removes stale sessions (>5 minutes)", () => {
		const sub = new NtfySubscriber(makeDeps());
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));
		expect(sub.getRemoteSessions().size).toBe(1);

		vi.advanceTimersByTime(5 * 60 * 1000 + 1);
		expect(sub.getRemoteSessions().size).toBe(0);
	});

	it("keeps sessions that are not yet stale", () => {
		const sub = new NtfySubscriber(makeDeps());
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();
		sub.handleMessage(makeMessage(baseState));

		vi.advanceTimersByTime(4 * 60 * 1000);
		expect(sub.getRemoteSessions().size).toBe(1);
	});

	it("handles mix of fresh and stale sessions", () => {
		const sub = new NtfySubscriber(makeDeps());
		(sub as unknown as { onUpdate: () => void }).onUpdate = vi.fn();

		sub.handleMessage(makeMessage({ ...baseState, sessionId: "old" }));
		vi.advanceTimersByTime(4 * 60 * 1000);
		sub.handleMessage(makeMessage({ ...baseState, sessionId: "new" }));
		vi.advanceTimersByTime(1 * 60 * 1000 + 1);

		const sessions = sub.getRemoteSessions();
		expect(sessions.has("old")).toBe(false);
		expect(sessions.has("new")).toBe(true);
	});
});

// ── start ─────────────────────────────────────────────────

describe("start", () => {
	it("does not connect when topic is empty string", () => {
		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		sub.start(vi.fn(), "", "https://ntfy.sh");
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("no topic"),
		);
	});

	it("logs subscription when topic is provided", async () => {
		const https = await import("node:https");
		const mockReq = { on: vi.fn(), destroy: vi.fn() };
		vi.mocked(https.default.get).mockReturnValue(
			mockReq as unknown as ReturnType<typeof https.default.get>,
		);

		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		sub.start(vi.fn(), "test-topic", "https://ntfy.sh");
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("subscribing"),
		);
		sub.stop();
	});

	it("uses custom url when provided", async () => {
		const http = await import("node:http");
		const mockReq = { on: vi.fn(), destroy: vi.fn() };
		vi.mocked(http.default.get).mockReturnValue(
			mockReq as unknown as ReturnType<typeof http.default.get>,
		);

		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		sub.start(vi.fn(), "test-topic", "http://my-server.com");
		expect(http.default.get).toHaveBeenCalledWith(
			"http://my-server.com/test-topic/json?since=5m",
			expect.any(Function),
		);
		sub.stop();
	});
});

// ── reconfigure ───────────────────────────────────────────

describe("reconfigure", () => {
	it("does nothing when topic and url unchanged", async () => {
		const https = await import("node:https");
		const mockReq = { on: vi.fn(), destroy: vi.fn() };
		vi.mocked(https.default.get).mockReturnValue(
			mockReq as unknown as ReturnType<typeof https.default.get>,
		);

		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		sub.start(vi.fn(), "topic1", "https://ntfy.sh");
		vi.mocked(https.default.get).mockClear();

		sub.reconfigure("topic1", "https://ntfy.sh");
		expect(https.default.get).not.toHaveBeenCalled();
		sub.stop();
	});

	it("reconnects when topic changes", async () => {
		const https = await import("node:https");
		const mockReq = { on: vi.fn(), destroy: vi.fn() };
		vi.mocked(https.default.get).mockReturnValue(
			mockReq as unknown as ReturnType<typeof https.default.get>,
		);

		const deps = makeDeps();
		const sub = new NtfySubscriber(deps);
		sub.start(vi.fn(), "topic1", "https://ntfy.sh");
		vi.mocked(https.default.get).mockClear();

		sub.reconfigure("topic2", "https://ntfy.sh");
		expect(https.default.get).toHaveBeenCalledWith(
			expect.stringContaining("topic2"),
			expect.any(Function),
		);
		sub.stop();
	});
});

// ── stop ──────────────────────────────────────────────────

describe("stop", () => {
	it("destroys active request", () => {
		const sub = new NtfySubscriber(makeDeps());
		const mockRequest = { destroy: vi.fn() };
		(sub as unknown as { request: unknown }).request = mockRequest;
		sub.stop();
		expect(mockRequest.destroy).toHaveBeenCalled();
	});

	it("clears reconnect timer", () => {
		vi.useFakeTimers();
		const sub = new NtfySubscriber(makeDeps());
		(
			sub as unknown as { reconnectTimer: ReturnType<typeof setTimeout> }
		).reconnectTimer = setTimeout(() => {}, 5000);
		sub.stop();
		expect(
			(sub as unknown as { reconnectTimer: unknown }).reconnectTimer,
		).toBeNull();
		vi.useRealTimers();
	});
});

// ── scheduleReconnect ─────────────────────────────────────

describe("scheduleReconnect", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not schedule duplicate reconnects", () => {
		const sub = new NtfySubscriber(makeDeps());
		const reconnect = (
			sub as unknown as { scheduleReconnect: () => void }
		).scheduleReconnect.bind(sub);
		reconnect();
		const timer1 = (sub as unknown as { reconnectTimer: unknown })
			.reconnectTimer;
		reconnect();
		const timer2 = (sub as unknown as { reconnectTimer: unknown })
			.reconnectTimer;
		expect(timer1).toBe(timer2);
		sub.stop();
	});
});
