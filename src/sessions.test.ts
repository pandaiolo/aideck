import { describe, expect, it } from "vitest";
import type { Session } from "./sessions";
import { sortSessions } from "./sessions";

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

// ── sortSessions ─────────────────────────────────────────

describe("sortSessions", () => {
	it("returns empty array for empty input", () => {
		expect(sortSessions([])).toEqual([]);
	});

	it("does not mutate the original array", () => {
		const sessions = [makeSession()];
		const sorted = sortSessions(sessions);
		expect(sorted).not.toBe(sessions);
	});

	it("sorts active sessions before inactive", () => {
		const sessions = [
			makeSession({ sessionId: "inactive", status: "inactive" }),
			makeSession({ sessionId: "active", status: "working" }),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].sessionId).toBe("active");
		expect(sorted[1].sessionId).toBe("inactive");
	});

	it("sorts active sessions by created desc", () => {
		const sessions = [
			makeSession({
				sessionId: "older",
				status: "working",
				created: "2026-03-29T10:00:00Z",
			}),
			makeSession({
				sessionId: "newer",
				status: "working",
				created: "2026-03-30T10:00:00Z",
			}),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].sessionId).toBe("newer");
	});

	it("sorts inactive sessions by modified desc", () => {
		const sessions = [
			makeSession({
				sessionId: "old",
				status: "inactive",
				modified: "2026-03-28T00:00:00Z",
			}),
			makeSession({
				sessionId: "new",
				status: "inactive",
				modified: "2026-03-30T00:00:00Z",
			}),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].sessionId).toBe("new");
	});

	it("pushes active sessions with missing created date to end", () => {
		const sessions = [
			makeSession({ sessionId: "no-date", status: "working", created: "" }),
			makeSession({
				sessionId: "has-date",
				status: "working",
				created: "2026-03-30T10:00:00Z",
			}),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].sessionId).toBe("has-date");
		expect(sorted[1].sessionId).toBe("no-date");
	});

	it("pushes inactive sessions with missing modified date to end", () => {
		const sessions = [
			makeSession({ sessionId: "no-mod", status: "inactive", modified: "" }),
			makeSession({
				sessionId: "has-mod",
				status: "inactive",
				modified: "2026-03-30T00:00:00Z",
			}),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].sessionId).toBe("has-mod");
		expect(sorted[1].sessionId).toBe("no-mod");
	});

	it("handles mix of active and inactive sessions", () => {
		const sessions = [
			makeSession({ sessionId: "inactive1", status: "inactive" }),
			makeSession({ sessionId: "working1", status: "working" }),
			makeSession({ sessionId: "awaiting1", status: "awaiting_input" }),
			makeSession({ sessionId: "inactive2", status: "inactive" }),
		];
		const sorted = sortSessions(sessions);
		expect(sorted[0].status).not.toBe("inactive");
		expect(sorted[1].status).not.toBe("inactive");
		expect(sorted[2].status).toBe("inactive");
		expect(sorted[3].status).toBe("inactive");
	});
});
