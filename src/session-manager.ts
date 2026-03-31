import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import streamDeck from "@elgato/streamdeck";
import type { ActionLike } from "./actions/utils";
import { ntfySubscriber } from "./ntfy";
import {
	DEFAULT_COLORS,
	type FontSize,
	renderEmptyKey,
	renderNavKey,
	renderOpenPanelKey,
	renderSessionKey,
	type StatusColors,
} from "./renderer";
import type { Session } from "./sessions";

const SESSIONS_PER_PAGE = 12;
const SESSIONS_SINGLE_PANEL = 14;
const CLAUDE_APP_PATH = "/Applications/Claude.app";

const AIDECK_CONFIG_PATH = path.join(
	os.homedir(),
	".claude",
	"hooks",
	"aideck.json",
);

type GlobalSettings = {
	openInDesktop?: boolean;
	singlePanel?: boolean;
	colorAwaiting?: string;
	colorWorking?: string;
	colorInactive?: string;
	fontSize?: FontSize;
	ntfyTopic?: string;
	ntfyUrl?: string;
};

interface SlotInfo {
	action: ActionLike;
	slotIndex: number;
}

class SessionManager {
	private sessions: Session[] = [];
	private currentPage = 0;
	private slots = new Map<string, SlotInfo>();
	private navActions = new Map<string, ActionLike>();
	private panelAction: ActionLike | null = null;
	private started = false;
	private openInDesktop = true;
	private singlePanel = false;
	private claudeInstalled = fs.existsSync(CLAUDE_APP_PATH);
	private colors: StatusColors = { ...DEFAULT_COLORS };
	private fontSize: FontSize = "small";
	private ntfyTopic = "";
	private ntfyUrl = "https://ntfy.sh";

	start(): void {
		this.loadSettings();
		this.refresh();
		if (!this.started) {
			this.started = true;
			ntfySubscriber.start(() => this.refresh(), this.ntfyTopic, this.ntfyUrl);
		}
	}

	private applySettings(settings: GlobalSettings): void {
		this.openInDesktop = settings.openInDesktop !== false;
		this.singlePanel = settings.singlePanel === true;
		this.colors = {
			awaiting: settings.colorAwaiting || DEFAULT_COLORS.awaiting,
			working: settings.colorWorking || DEFAULT_COLORS.working,
			inactive: settings.colorInactive || DEFAULT_COLORS.inactive,
		};
		this.fontSize = settings.fontSize || "small";
		this.ntfyTopic = settings.ntfyTopic || "";
		this.ntfyUrl = settings.ntfyUrl || "https://ntfy.sh";

		ntfySubscriber.reconfigure(this.ntfyTopic, this.ntfyUrl);
		this.writeHookConfig();
	}

	private writeHookConfig(): void {
		if (!this.ntfyTopic) return;
		try {
			const dir = path.dirname(AIDECK_CONFIG_PATH);
			fs.mkdirSync(dir, { recursive: true });
			const config = { topic: this.ntfyTopic, url: this.ntfyUrl };
			fs.writeFileSync(AIDECK_CONFIG_PATH, JSON.stringify(config), "utf-8");
		} catch {
			// non-fatal
		}
	}

	private loadSettings(): void {
		streamDeck.settings
			.getGlobalSettings<GlobalSettings>()
			.then((settings) => {
				this.migrateFromConfigFile(settings);
				this.applySettings(settings);
			})
			.catch(() => {});
		streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
			this.applySettings(ev.settings);
			this.refresh();
		});
	}

	private migrateFromConfigFile(settings: GlobalSettings): void {
		if (settings.ntfyTopic) return;
		try {
			const raw = fs.readFileSync(AIDECK_CONFIG_PATH, "utf-8");
			const config = JSON.parse(raw);
			if (config.topic) {
				settings.ntfyTopic = config.topic;
				settings.ntfyUrl = config.url || "https://ntfy.sh";
				streamDeck.settings.setGlobalSettings(settings).catch(() => {});
			}
		} catch {
			// no config file to migrate
		}
	}

	stop(): void {
		this.started = false;
		ntfySubscriber.stop();
	}

	refresh(): void {
		this.sessions = ntfySubscriber.getSortedSessions();
		// Clamp page if sessions shrunk
		if (this.currentPage >= this.totalPages) {
			this.currentPage = Math.max(0, this.totalPages - 1);
		}
		this.updateAllSlots();
		this.updateNavButtons();
		this.updatePanel();
	}

	registerPanel(action: ActionLike): void {
		this.panelAction = action;
		this.start();
	}

	unregisterPanel(): void {
		this.panelAction = null;
	}

	registerSlot(action: ActionLike, slotIndex: number): void {
		this.slots.set(action.id, { action, slotIndex });
		this.updateSlot(action, slotIndex);
	}

	unregisterSlot(actionId: string): void {
		this.slots.delete(actionId);
		if (
			this.slots.size === 0 &&
			this.navActions.size === 0 &&
			!this.panelAction
		) {
			this.stop();
		}
	}

	registerNav(action: ActionLike, direction: "prev" | "next"): void {
		this.navActions.set(direction, action);
		this.updateNavButton(direction);
	}

	unregisterNav(direction: "prev" | "next"): void {
		this.navActions.delete(direction);
		if (
			this.slots.size === 0 &&
			this.navActions.size === 0 &&
			!this.panelAction
		) {
			this.stop();
		}
	}

	get isSinglePanel(): boolean {
		return this.singlePanel;
	}

	private get perPage(): number {
		return this.singlePanel ? SESSIONS_SINGLE_PANEL : SESSIONS_PER_PAGE;
	}

	getSessionForSlot(slotIndex: number): Session | undefined {
		const globalIndex = this.currentPage * this.perPage + slotIndex;
		return this.sessions[globalIndex];
	}

	getSessionForNavSlot(direction: "prev" | "next"): Session | undefined {
		if (!this.singlePanel) return undefined;
		const navSlotIndex =
			direction === "prev" ? SESSIONS_PER_PAGE : SESSIONS_PER_PAGE + 1;
		return this.sessions[navSlotIndex];
	}

	get totalPages(): number {
		return Math.max(1, Math.ceil(this.sessions.length / this.perPage));
	}

	nextPage(): void {
		if (this.currentPage < this.totalPages - 1) {
			this.currentPage++;
			this.updateAllSlots();
			this.updateNavButtons();
		}
	}

	prevPage(): void {
		if (this.currentPage > 0) {
			this.currentPage--;
			this.updateAllSlots();
			this.updateNavButtons();
		}
	}

	openSession(session: Session): void {
		let url: string;

		if (session.remoteUrl) {
			const remoteId = session.remoteUrl.split("/").pop() || "";
			if (this.openInDesktop && this.claudeInstalled) {
				url = `claude://claude.ai/claude-code-desktop/${remoteId}`;
			} else {
				url = session.remoteUrl;
			}
		} else {
			if (!this.claudeInstalled) return;
			url = `claude://resume?session=${session.sessionId}&cwd=${encodeURIComponent(session.projectPath || "")}`;
		}

		streamDeck.logger.info(`Opening session: ${session.sessionId} via ${url}`);
		execFile("open", [url], (err) => {
			if (err) {
				streamDeck.logger.error(`Failed to open session: ${err.message}`);
			}
		});
	}

	private updateAllSlots(): void {
		for (const { action, slotIndex } of this.slots.values()) {
			this.updateSlot(action, slotIndex);
		}
	}

	private updateSlot(action: ActionLike, slotIndex: number): void {
		const session = this.getSessionForSlot(slotIndex);
		if (session) {
			const display = session.summary || session.firstPrompt || "New session";
			const image = renderSessionKey(
				session.projectName,
				session.gitBranch,
				display,
				session.status,
				this.colors,
				this.fontSize,
			);
			action
				.setImage(image)
				.catch((e: unknown) =>
					streamDeck.logger.error(`setImage failed: ${e}`),
				);
		} else {
			action
				.setImage(renderEmptyKey())
				.catch((e: unknown) =>
					streamDeck.logger.error(`setImage failed: ${e}`),
				);
		}
	}

	private updatePanel(): void {
		if (!this.panelAction) return;
		let awaiting = 0;
		let working = 0;
		let inactive = 0;
		for (const s of this.sessions) {
			if (s.status === "awaiting_input") awaiting++;
			else if (s.status === "working") working++;
			else inactive++;
		}
		const image = renderOpenPanelKey(awaiting, working, inactive, this.colors);
		this.panelAction
			.setImage(image)
			.catch((e: unknown) => streamDeck.logger.error(`setImage failed: ${e}`));
	}

	private updateNavButtons(): void {
		this.updateNavButton("prev");
		this.updateNavButton("next");
	}

	private updateNavButton(direction: "prev" | "next"): void {
		const action = this.navActions.get(direction);
		if (!action) return;

		if (this.singlePanel) {
			const session = this.getSessionForNavSlot(direction);
			if (session) {
				const display = session.summary || session.firstPrompt || "New session";
				const image = renderSessionKey(
					session.projectName,
					session.gitBranch,
					display,
					session.status,
					this.colors,
					this.fontSize,
				);
				action
					.setImage(image)
					.catch((e: unknown) =>
						streamDeck.logger.error(`setImage failed: ${e}`),
					);
			} else {
				action
					.setImage(renderEmptyKey())
					.catch((e: unknown) =>
						streamDeck.logger.error(`setImage failed: ${e}`),
					);
			}
		} else {
			const enabled =
				direction === "prev"
					? this.currentPage > 0
					: this.currentPage < this.totalPages - 1;
			const label = direction === "prev" ? "PREV" : "NEXT";
			action
				.setImage(renderNavKey(label, enabled))
				.catch((e: unknown) =>
					streamDeck.logger.error(`setImage failed: ${e}`),
				);
		}
	}
}

export const sessionManager = new SessionManager();
