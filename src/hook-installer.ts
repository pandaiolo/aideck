import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_DIR = path.resolve(path.dirname(__filename), "..");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const HOOKS_DIR = path.join(CLAUDE_DIR, "hooks");
const INSTALLED_SCRIPT_PATH = path.join(HOOKS_DIR, "aideck.sh");
const BUNDLED_SCRIPT_PATH = path.join(PLUGIN_DIR, "hooks", "aideck.sh");

export { PLUGIN_DIR };

const HOOK_COMMAND =
	"[ -x ~/.claude/hooks/aideck.sh ] && ~/.claude/hooks/aideck.sh; exit 0";
const HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"Stop",
	"Notification",
	"PreCompact",
	"PostCompact",
	"SessionEnd",
] as const;

interface HookEntry {
	matcher: string;
	hooks: { type: string; command: string }[];
}

export interface HookStatus {
	scriptInstalled: boolean;
	settingsConfigured: boolean;
	fullyInstalled: boolean;
}

export function generateTopic(): string {
	return `aideck-${crypto.randomBytes(8).toString("hex")}`;
}

function isAideckEntry(entry: HookEntry): boolean {
	return entry.hooks?.some((h) => h.command?.includes("aideck.sh")) ?? false;
}

function checkSettingsContainHooks(): boolean {
	try {
		const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
		const settings = JSON.parse(raw);
		const hooks = settings.hooks;
		if (!hooks || typeof hooks !== "object") return false;
		return HOOK_EVENTS.every((event) => {
			const entries = hooks[event];
			if (!Array.isArray(entries)) return false;
			return entries.some((entry: HookEntry) => isAideckEntry(entry));
		});
	} catch {
		return false;
	}
}

export function getHookStatus(): HookStatus {
	const scriptInstalled = fs.existsSync(INSTALLED_SCRIPT_PATH);
	const settingsConfigured = checkSettingsContainHooks();
	return {
		scriptInstalled,
		settingsConfigured,
		fullyInstalled: scriptInstalled && settingsConfigured,
	};
}

export function installHooks(): { installed: boolean; error?: string } {
	try {
		fs.mkdirSync(HOOKS_DIR, { recursive: true });

		// Copy script (always overwrite to handle plugin upgrades)
		if (fs.existsSync(BUNDLED_SCRIPT_PATH)) {
			fs.copyFileSync(BUNDLED_SCRIPT_PATH, INSTALLED_SCRIPT_PATH);
			fs.chmodSync(INSTALLED_SCRIPT_PATH, 0o755);
		}

		// Read or create settings.json
		let settings: Record<string, unknown> = {};
		try {
			const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
			settings = JSON.parse(raw);
		} catch {
			// File missing or invalid — start with empty object
		}

		if (!settings.hooks || typeof settings.hooks !== "object") {
			settings.hooks = {};
		}
		const hooks = settings.hooks as Record<string, HookEntry[]>;

		const aideckEntry: HookEntry = {
			matcher: "",
			hooks: [{ type: "command", command: HOOK_COMMAND }],
		};

		let modified = false;
		for (const event of HOOK_EVENTS) {
			if (!Array.isArray(hooks[event])) {
				hooks[event] = [];
			}
			const existingIdx = hooks[event].findIndex((entry) =>
				isAideckEntry(entry),
			);
			if (existingIdx === -1) {
				hooks[event].push(aideckEntry);
				modified = true;
			} else if (hooks[event][existingIdx].hooks[0]?.command !== HOOK_COMMAND) {
				// Migrate old unsafe command to new safe format
				hooks[event][existingIdx] = aideckEntry;
				modified = true;
			}
		}

		if (modified) {
			fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
			const tmpPath = `${CLAUDE_SETTINGS_PATH}.tmp`;
			fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf-8");
			fs.renameSync(tmpPath, CLAUDE_SETTINGS_PATH);
		}

		return { installed: true };
	} catch (err) {
		return {
			installed: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export function removeHooks(): { removed: boolean; error?: string } {
	try {
		// Remove aideck entries from settings.json
		try {
			const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
			const settings = JSON.parse(raw);
			if (settings.hooks && typeof settings.hooks === "object") {
				const hooks = settings.hooks as Record<string, HookEntry[]>;
				for (const event of HOOK_EVENTS) {
					if (Array.isArray(hooks[event])) {
						hooks[event] = hooks[event].filter(
							(entry) => !isAideckEntry(entry),
						);
						if (hooks[event].length === 0) {
							delete hooks[event];
						}
					}
				}
				if (Object.keys(hooks).length === 0) {
					delete settings.hooks;
				}
				const tmpPath = `${CLAUDE_SETTINGS_PATH}.tmp`;
				fs.writeFileSync(tmpPath, JSON.stringify(settings, null, 2), "utf-8");
				fs.renameSync(tmpPath, CLAUDE_SETTINGS_PATH);
			}
		} catch {
			// settings.json not found or invalid — nothing to clean
		}

		// Remove script file
		try {
			fs.unlinkSync(INSTALLED_SCRIPT_PATH);
		} catch {
			// Already gone
		}

		// Remove config file
		try {
			fs.unlinkSync(path.join(HOOKS_DIR, "aideck.json"));
		} catch {
			// Already gone
		}

		return { removed: true };
	} catch (err) {
		return {
			removed: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
