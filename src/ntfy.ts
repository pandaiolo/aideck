import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import streamDeck from "@elgato/streamdeck";
import type { Session, SessionStatus } from "./sessions";
import { sortSessions } from "./sessions";

const AIDECK_DIR = path.join(os.homedir(), ".claude", "aideck");
const DEFAULT_CACHE_PATH = path.join(AIDECK_DIR, "cache.json");
const STALE_TIMEOUT_MS = 14 * 24 * 60 * 60 * 1000;
interface NtfyMessage {
	event: string;
	message?: string;
}

interface RemoteSessionState {
	sessionId: string;
	status: SessionStatus;
	projectPath: string;
	projectName: string;
	gitBranch: string;
	sessionName: string;
	remoteUrl: string;
	startedAt: string;
	updatedAt: string;
	hostname: string;
	event?: string;
}

interface CacheFile {
	sessions: Record<string, Session>;
	lastSeen: Record<string, number>;
	lastUpdated: number;
}

export interface NtfyDeps {
	cachePath: string;
	logger: { info(msg: string): void; error(msg: string): void };
}

const defaultDeps: NtfyDeps = {
	cachePath: DEFAULT_CACHE_PATH,
	logger: streamDeck.logger,
};

export class NtfySubscriber {
	private remoteSessions = new Map<string, Session>();
	private lastSeen = new Map<string, number>();
	private request: http.ClientRequest | null = null;
	private onUpdate: (() => void) | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private topic = "";
	private baseUrl = "";
	private deps: NtfyDeps;

	constructor(deps: NtfyDeps = defaultDeps) {
		this.deps = deps;
		this.loadCache();
	}

	start(onUpdate: () => void, topic: string, url: string): void {
		this.onUpdate = onUpdate;

		if (!topic) {
			this.deps.logger.info("ntfy: no topic configured, remote sync disabled");
			return;
		}

		this.topic = topic;
		this.baseUrl = url;
		this.deps.logger.info(`ntfy: subscribing to ${this.baseUrl}/${this.topic}`);
		this.connect();
	}

	reconfigure(topic: string, url: string): void {
		if (topic === this.topic && url === this.baseUrl) return;
		this.stop();
		if (!this.onUpdate) return;
		this.start(this.onUpdate, topic, url);
	}

	stop(): void {
		if (this.request) {
			this.request.destroy();
			this.request = null;
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	getRemoteSessions(): Map<string, Session> {
		const now = Date.now();
		for (const [id, lastTime] of this.lastSeen) {
			if (now - lastTime > STALE_TIMEOUT_MS) {
				this.remoteSessions.delete(id);
				this.lastSeen.delete(id);
			}
		}
		return this.remoteSessions;
	}

	getSortedSessions(): Session[] {
		return sortSessions(Array.from(this.getRemoteSessions().values()));
	}

	handleMessage(line: string): void {
		try {
			const msg: NtfyMessage = JSON.parse(line);
			if (msg.event !== "message" || !msg.message) return;

			const state: RemoteSessionState = JSON.parse(msg.message);
			if (!state.sessionId) return;

			if (state.event === "SessionEnd") {
				const existing = this.remoteSessions.get(state.sessionId);
				if (existing) {
					existing.status = "inactive";
					this.lastSeen.set(state.sessionId, Date.now());
				}
			} else {
				const status: SessionStatus =
					state.status === "working"
						? "working"
						: state.status === "awaiting_input"
							? "awaiting_input"
							: "inactive";

				const existing = this.remoteSessions.get(state.sessionId);
				this.remoteSessions.set(state.sessionId, {
					sessionId: state.sessionId,
					summary: state.sessionName || existing?.summary || "",
					firstPrompt: existing?.firstPrompt || "",
					projectPath: state.projectPath || existing?.projectPath || "",
					projectName: state.projectName || existing?.projectName || "",
					created: state.startedAt || existing?.created || "",
					modified: state.updatedAt,
					messageCount: 0,
					gitBranch: state.gitBranch || existing?.gitBranch || "",
					status,
					hostname: state.hostname || existing?.hostname || "remote",
					remoteUrl: state.remoteUrl || existing?.remoteUrl || "",
				});
				this.lastSeen.set(state.sessionId, Date.now());
			}

			this.onUpdate?.();
			this.saveCache();
		} catch {
			// skip malformed messages
		}
	}

	private loadCache(): void {
		try {
			const raw = fs.readFileSync(this.deps.cachePath, "utf-8");
			const cache: CacheFile = JSON.parse(raw);
			for (const [id, session] of Object.entries(cache.sessions)) {
				this.remoteSessions.set(id, session);
			}
			for (const [id, timestamp] of Object.entries(cache.lastSeen)) {
				this.lastSeen.set(id, timestamp);
			}
		} catch {
			// no cache or corrupted — start empty
		}
	}

	private saveCache(): void {
		try {
			// Prune stale sessions before saving
			this.getRemoteSessions();

			const cache: CacheFile = {
				sessions: Object.fromEntries(this.remoteSessions),
				lastSeen: Object.fromEntries(this.lastSeen),
				lastUpdated: Date.now(),
			};
			const json = JSON.stringify(cache);
			const dir = path.dirname(this.deps.cachePath);
			fs.mkdirSync(dir, { recursive: true });
			const tmpPath = `${this.deps.cachePath}.tmp`;
			fs.writeFileSync(tmpPath, json, "utf-8");
			fs.renameSync(tmpPath, this.deps.cachePath);
		} catch {
			// cache write failure is non-fatal
		}
	}

	private connect(): void {
		const url = `${this.baseUrl}/${this.topic}/json?since=5m`;
		const mod = url.startsWith("https") ? https : http;

		this.request = mod.get(url, (res) => {
			if (res.statusCode !== 200) {
				this.deps.logger.error(`ntfy: HTTP ${res.statusCode}`);
				this.scheduleReconnect();
				return;
			}

			let buffer = "";

			res.on("data", (chunk: Buffer) => {
				buffer += chunk.toString();
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (!line.trim()) continue;
					this.handleMessage(line);
				}
			});

			res.on("end", () => {
				this.deps.logger.info("ntfy: connection closed, reconnecting...");
				this.scheduleReconnect();
			});

			res.on("error", (err: Error) => {
				this.deps.logger.error(`ntfy: stream error: ${err.message}`);
				this.scheduleReconnect();
			});
		});

		this.request.on("error", (err: Error) => {
			this.deps.logger.error(`ntfy: request error: ${err.message}`);
			this.scheduleReconnect();
		});
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) return;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, 5000);
	}
}

export const ntfySubscriber = new NtfySubscriber();
