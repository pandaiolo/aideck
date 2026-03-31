export type SessionStatus = "inactive" | "awaiting_input" | "working";

export interface Session {
	sessionId: string;
	summary: string;
	firstPrompt: string;
	projectPath: string;
	projectName: string;
	created: string;
	modified: string;
	messageCount: number;
	gitBranch: string;
	status: SessionStatus;
	hostname: string;
	remoteUrl: string;
}

export function sortSessions(sessions: Session[]): Session[] {
	return sessions.slice().sort((a, b) => {
		const aActive = a.status !== "inactive" ? 0 : 1;
		const bActive = b.status !== "inactive" ? 0 : 1;
		if (aActive !== bActive) return aActive - bActive;
		if (aActive === 0) {
			if (!a.created) return 1;
			if (!b.created) return -1;
			return new Date(b.created).getTime() - new Date(a.created).getTime();
		}
		if (!a.modified) return 1;
		if (!b.modified) return -1;
		return new Date(b.modified).getTime() - new Date(a.modified).getTime();
	});
}
