# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

```bash
npm run build                                    # Production build (Rollup → plugin.js)
npm run watch                                    # Watch mode + auto-restart Stream Deck plugin
streamdeck restart com.aideck.aideck             # Restart plugin without rebuild
streamdeck link com.aideck.aideck.sdPlugin       # Link plugin dir for development
```

Build output goes to `com.aideck.aideck.sdPlugin/bin/plugin.js`.

```bash
npm test                                         # Run all tests (vitest)
npm run test:watch                               # Watch mode
npm run test:coverage                            # With coverage report
```

Tests are co-located with source as `*.test.ts` files. The `@elgato/streamdeck` SDK singleton is mocked via `src/test-utils/mock-streamdeck.ts`. The `tsconfig.json` has `experimentalDecorators: true` to support the SDK's `@action()` decorator in vitest's transform.

```bash
npm run lint                                     # Check lint + format (Biome)
npm run lint:fix                                 # Auto-fix lint + format
npm run format                                   # Format only
```

Biome is configured in `biome.json` — tabs, double quotes, recommended rules. Non-null assertions (`!`) are allowed in test files via an override.

## Architecture

AIDeck is an Elgato Stream Deck plugin that displays Claude Code sessions as buttons with live status indicators. TypeScript source in `src/` is bundled with Rollup into a single ES module consumed by Stream Deck's Node.js runtime.

### Data Flow

```
Claude Code event → ~/.claude/hooks/aideck.sh (bash) → push to ntfy.sh

Stream Deck plugin:
    startup → load ~/.claude/aideck/cache.json → display cached sessions
    ntfy connect (?since=5m) → reconcile history → update display + save cache
    real-time ntfy streaming → handleMessage() → update display + save cache
```

No polling timer, no file watcher. Refresh is triggered solely by ntfy messages. A local cache (`cache.json`) provides instant startup; ntfy history (`?since=5m`) reconciles on connect.

### Key Modules

- **`plugin.ts`** — Entry point. Registers 4 Stream Deck actions with the SDK.
- **`session-manager.ts`** — Central orchestrator. Manages pagination, global settings, and dispatches rendered images to action slots. Refreshes on ntfy messages only.
- **`sessions.ts`** — Exports `Session`/`SessionStatus` types and `sortSessions()` utility.
- **`renderer.ts`** — Pure SVG generators for all button types. Configurable font sizes (small/medium/large), status colors, and fade-out mask for text overflow.
- **`ntfy.ts`** — HTTP streaming subscriber to ntfy.sh. Single source of truth for all sessions. Manages local cache (`~/.claude/aideck/cache.json`) for instant startup. Sessions go stale after 5 minutes without update.
- **`actions/`** — One file per Stream Deck action (`open-panel`, `back`, `session-slot`, `page-nav`). Each is a class extending `SingletonAction` with `onWillAppear`/`onKeyDown`/`onWillDisappear` lifecycle hooks.

### Hook Script (`hooks/aideck.sh`)

Bash script invoked by Claude Code on SessionStart, UserPromptSubmit, Stop, PreCompact, PostCompact, Notification, and SessionEnd events. Receives JSON on stdin, reads ntfy topic from `~/.claude/aideck/config.json`, and pushes session state to ntfy. Also resolves the remote session URL and custom session name from JSONL transcripts. Installed via `~/.claude/settings.json` hook configuration.

**Hook gotchas:**
- Hook input only provides `session_id`, `cwd`, `transcript_path`, `hook_event_name` — no `session_name` or remote URL. Those must come from the transcript.
- Transcripts can be multi-MB. Use `grep 'pattern' | jq` not `jq 'select(...)'` — jq on the full file is too slow and may timeout under `set -e`.
- Grep patterns must be specific (e.g. `'"subtype":"bridge_status"'` not `'"bridge_status"'`) to avoid matching embedded command strings in the transcript.
- Compaction destroys `bridge_status` and `custom-title` entries. The plugin's `handleMessage` merges instead of overwrites — once a remoteUrl or summary is received, it persists in the cache even if subsequent events lack it.
- Never search sibling transcripts for bridge_status — it picks up wrong sessions' URLs. Only use the current session's transcript.
- `config.json` is written by the plugin (from Stream Deck settings) and read by the hook. Don't write it with empty values — guard with `if (!topic) return`.

### Stream Deck Panel Layout (Standard 5×3)

```
[BACK] [slot0] [slot1] [slot2] [slot3]
[slot4] [slot5] [slot6] [slot7] [slot8]
[slot9] [slot10] [slot11] [PREV] [NEXT]
```

Sessions are assigned to slots by index within the current page. Single-panel mode removes PREV/NEXT and uses those positions as extra slots.

### Settings

Global settings (shared across all action instances) are managed via the property inspector (`com.aideck.aideck.sdPlugin/ui/property-inspector.html`) and include: open-in-desktop preference, single-panel mode, font size, and three status colors.

## Testing Guidelines

- When adding or changing functionality, update or add corresponding tests. Pure functions (renderer, sessions, utils) get direct unit tests; `ntfy.ts` uses DI (`NtfyDeps`) with `vi.spyOn(fs, ...)` for cache/config mocking; SDK-coupled modules (session-manager, actions) mock all dependencies via `vi.doMock()` + dynamic `import()` for fresh singletons per test.
- SVG rendering functions use snapshot tests (`toMatchSnapshot()`) — run `npm test -- --update` to regenerate after intentional visual changes.
- For `session-manager.test.ts`, use `vi.resetModules()` + dynamic import to get a fresh `sessionManager` singleton per test, since the class is not exported.

## Maintaining This File

When you learn something non-obvious about this codebase during a conversation — a quirk, a gotcha, an architectural decision, a workaround — add it to this file so future sessions benefit from that knowledge.
