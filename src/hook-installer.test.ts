import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
	default: {
		logger: { info: vi.fn(), error: vi.fn() },
	},
}));

// Mock import.meta.url resolution so PLUGIN_DIR is predictable
vi.mock("node:url", () => ({
	fileURLToPath: () => "/mock/plugin/bin/plugin.js",
}));

vi.mock("node:os", () => ({
	default: { homedir: () => "/mock/home" },
}));

import {
	generateTopic,
	getHookStatus,
	installHooks,
	removeHooks,
} from "./hook-installer";

const SETTINGS_PATH = "/mock/home/.claude/settings.json";
const HOOKS_DIR = "/mock/home/.claude/hooks";
const INSTALLED_SCRIPT = "/mock/home/.claude/hooks/aideck.sh";
const BUNDLED_SCRIPT = "/mock/plugin/hooks/aideck.sh";
const CONFIG_PATH = "/mock/home/.claude/hooks/aideck.json";

const HOOK_EVENTS = [
	"SessionStart",
	"UserPromptSubmit",
	"Stop",
	"Notification",
	"PreCompact",
	"PostCompact",
	"SessionEnd",
];

const SAFE_COMMAND =
	"[ -x ~/.claude/hooks/aideck.sh ] && ~/.claude/hooks/aideck.sh; exit 0";
const OLD_COMMAND = "~/.claude/hooks/aideck.sh";

function makeAideckEntry(command = SAFE_COMMAND) {
	return {
		matcher: "",
		hooks: [{ type: "command", command }],
	};
}

function makeSettingsWithHooks(
	events: string[] = HOOK_EVENTS,
	extra?: Record<string, unknown>,
) {
	const hooks: Record<string, unknown[]> = {};
	for (const event of events) {
		hooks[event] = [makeAideckEntry()];
	}
	return { hooks, ...extra };
}

let fileStore: Record<string, string>;
let existingFiles: Set<string>;

beforeEach(() => {
	fileStore = {};
	existingFiles = new Set();

	vi.spyOn(fs, "existsSync").mockImplementation(
		(p) => existingFiles.has(p as string) || p.toString() in fileStore,
	);
	vi.spyOn(fs, "readFileSync").mockImplementation((p) => {
		const str = p as string;
		if (str in fileStore) return fileStore[str];
		throw new Error("ENOENT");
	});
	vi.spyOn(fs, "writeFileSync").mockImplementation((p, data) => {
		fileStore[p as string] = data as string;
	});
	vi.spyOn(fs, "renameSync").mockImplementation((src, dest) => {
		fileStore[dest as string] = fileStore[src as string]!;
		delete fileStore[src as string];
	});
	vi.spyOn(fs, "copyFileSync").mockImplementation((src, dest) => {
		fileStore[dest as string] = fileStore[src as string] || "#!/bin/sh\n";
	});
	vi.spyOn(fs, "chmodSync").mockImplementation(() => {});
	vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined as never);
	vi.spyOn(fs, "unlinkSync").mockImplementation((p) => {
		if (!((p as string) in fileStore) && !existingFiles.has(p as string)) {
			throw new Error("ENOENT");
		}
		delete fileStore[p as string];
		existingFiles.delete(p as string);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ── generateTopic ───────────────────────────────────────────

describe("generateTopic", () => {
	it("returns aideck- prefix with 16 hex chars", () => {
		const topic = generateTopic();
		expect(topic).toMatch(/^aideck-[0-9a-f]{16}$/);
	});

	it("returns unique values", () => {
		const a = generateTopic();
		const b = generateTopic();
		expect(a).not.toBe(b);
	});
});

// ── getHookStatus ───────────────────────────────────────────

describe("getHookStatus", () => {
	it("returns fullyInstalled when script exists and all events configured", () => {
		existingFiles.add(INSTALLED_SCRIPT);
		fileStore[SETTINGS_PATH] = JSON.stringify(makeSettingsWithHooks());

		const status = getHookStatus();
		expect(status).toEqual({
			scriptInstalled: true,
			settingsConfigured: true,
			fullyInstalled: true,
		});
	});

	it("returns scriptInstalled false when script missing", () => {
		fileStore[SETTINGS_PATH] = JSON.stringify(makeSettingsWithHooks());

		const status = getHookStatus();
		expect(status.scriptInstalled).toBe(false);
		expect(status.fullyInstalled).toBe(false);
	});

	it("returns settingsConfigured false when settings.json missing", () => {
		existingFiles.add(INSTALLED_SCRIPT);

		const status = getHookStatus();
		expect(status.settingsConfigured).toBe(false);
		expect(status.fullyInstalled).toBe(false);
	});

	it("returns settingsConfigured false with partial hooks", () => {
		existingFiles.add(INSTALLED_SCRIPT);
		fileStore[SETTINGS_PATH] = JSON.stringify(
			makeSettingsWithHooks(["SessionStart", "Stop"]),
		);

		const status = getHookStatus();
		expect(status.settingsConfigured).toBe(false);
	});

	it("returns settingsConfigured false when no hooks key", () => {
		existingFiles.add(INSTALLED_SCRIPT);
		fileStore[SETTINGS_PATH] = JSON.stringify({ env: {} });

		const status = getHookStatus();
		expect(status.settingsConfigured).toBe(false);
	});

	it("handles malformed settings.json", () => {
		existingFiles.add(INSTALLED_SCRIPT);
		fileStore[SETTINGS_PATH] = "not json";

		const status = getHookStatus();
		expect(status.settingsConfigured).toBe(false);
	});
});

// ── installHooks ────────────────────────────────────────────

describe("installHooks", () => {
	it("creates hooks directory", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		installHooks();
		expect(fs.mkdirSync).toHaveBeenCalledWith(HOOKS_DIR, {
			recursive: true,
		});
	});

	it("copies script and sets executable permission", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		installHooks();
		expect(fs.copyFileSync).toHaveBeenCalledWith(
			BUNDLED_SCRIPT,
			INSTALLED_SCRIPT,
		);
		expect(fs.chmodSync).toHaveBeenCalledWith(INSTALLED_SCRIPT, 0o755);
	});

	it("creates settings.json when missing", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		const result = installHooks();
		expect(result.installed).toBe(true);

		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		for (const event of HOOK_EVENTS) {
			expect(written.hooks[event]).toHaveLength(1);
			expect(written.hooks[event][0].hooks[0].command).toContain("aideck.sh");
		}
	});

	it("adds hooks to existing settings.json with no hooks", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		fileStore[SETTINGS_PATH] = JSON.stringify({
			env: {},
			permissions: { allow: [] },
		});

		installHooks();
		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		expect(written.env).toEqual({});
		expect(written.permissions).toEqual({ allow: [] });
		for (const event of HOOK_EVENTS) {
			expect(written.hooks[event]).toHaveLength(1);
		}
	});

	it("preserves existing non-aideck hooks", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		const otherHook = {
			matcher: "",
			hooks: [{ type: "command", command: "~/.claude/hooks/other.sh" }],
		};
		fileStore[SETTINGS_PATH] = JSON.stringify({
			hooks: { SessionStart: [otherHook] },
		});

		installHooks();
		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		expect(written.hooks.SessionStart).toHaveLength(2);
		expect(written.hooks.SessionStart[0].hooks[0].command).toContain(
			"other.sh",
		);
		expect(written.hooks.SessionStart[1].hooks[0].command).toContain(
			"aideck.sh",
		);
	});

	it("does not duplicate entries when run twice (idempotent)", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		installHooks();
		installHooks();

		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		for (const event of HOOK_EVENTS) {
			expect(written.hooks[event]).toHaveLength(1);
		}
	});

	it("writes atomically via tmp + rename", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		installHooks();
		expect(fs.writeFileSync).toHaveBeenCalledWith(
			`${SETTINGS_PATH}.tmp`,
			expect.any(String),
			"utf-8",
		);
		expect(fs.renameSync).toHaveBeenCalledWith(
			`${SETTINGS_PATH}.tmp`,
			SETTINGS_PATH,
		);
	});

	it("returns installed true on success", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		const result = installHooks();
		expect(result).toEqual({ installed: true });
	});

	it("skips settings write when already fully configured with safe command", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		fileStore[SETTINGS_PATH] = JSON.stringify(makeSettingsWithHooks());

		installHooks();
		// renameSync is only called for settings write, not for script copy
		expect(fs.renameSync).not.toHaveBeenCalled();
	});

	it("uses safe command format in new entries", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		installHooks();

		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		for (const event of HOOK_EVENTS) {
			expect(written.hooks[event][0].hooks[0].command).toBe(SAFE_COMMAND);
		}
	});

	it("migrates old unsafe command to safe format", () => {
		existingFiles.add(BUNDLED_SCRIPT);
		// Settings with old-format entries
		const hooks: Record<string, unknown[]> = {};
		for (const event of HOOK_EVENTS) {
			hooks[event] = [makeAideckEntry(OLD_COMMAND)];
		}
		fileStore[SETTINGS_PATH] = JSON.stringify({ hooks });

		installHooks();
		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		for (const event of HOOK_EVENTS) {
			expect(written.hooks[event]).toHaveLength(1);
			expect(written.hooks[event][0].hooks[0].command).toBe(SAFE_COMMAND);
		}
	});

	it("detects old-format entries as installed in getHookStatus", () => {
		existingFiles.add(INSTALLED_SCRIPT);
		const hooks: Record<string, unknown[]> = {};
		for (const event of HOOK_EVENTS) {
			hooks[event] = [makeAideckEntry(OLD_COMMAND)];
		}
		fileStore[SETTINGS_PATH] = JSON.stringify({ hooks });

		const status = getHookStatus();
		expect(status.settingsConfigured).toBe(true);
	});
});

// ── removeHooks ─────────────────────────────────────────────

describe("removeHooks", () => {
	it("removes aideck entries from all hook events", () => {
		fileStore[SETTINGS_PATH] = JSON.stringify(makeSettingsWithHooks());
		fileStore[INSTALLED_SCRIPT] = "#!/bin/sh";
		fileStore[CONFIG_PATH] = '{"topic":"test"}';

		const result = removeHooks();
		expect(result.removed).toBe(true);

		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		expect(written.hooks).toBeUndefined();
	});

	it("preserves other tools hooks", () => {
		const otherHook = {
			matcher: "",
			hooks: [{ type: "command", command: "~/.claude/hooks/other.sh" }],
		};
		const settings = makeSettingsWithHooks();
		(settings.hooks.SessionStart as unknown[]).push(otherHook);
		fileStore[SETTINGS_PATH] = JSON.stringify(settings);

		removeHooks();
		const written = JSON.parse(fileStore[SETTINGS_PATH]!);
		expect(written.hooks.SessionStart).toHaveLength(1);
		expect(written.hooks.SessionStart[0].hooks[0].command).toContain(
			"other.sh",
		);
	});

	it("deletes script file", () => {
		fileStore[SETTINGS_PATH] = JSON.stringify({});
		fileStore[INSTALLED_SCRIPT] = "#!/bin/sh";

		removeHooks();
		expect(fileStore[INSTALLED_SCRIPT]).toBeUndefined();
	});

	it("deletes aideck.json config", () => {
		fileStore[SETTINGS_PATH] = JSON.stringify({});
		fileStore[CONFIG_PATH] = '{"topic":"test"}';

		removeHooks();
		expect(fileStore[CONFIG_PATH]).toBeUndefined();
	});

	it("handles missing settings.json gracefully", () => {
		const result = removeHooks();
		expect(result.removed).toBe(true);
	});

	it("handles missing files gracefully", () => {
		fileStore[SETTINGS_PATH] = JSON.stringify({});
		const result = removeHooks();
		expect(result.removed).toBe(true);
	});
});
