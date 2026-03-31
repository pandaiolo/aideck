# Plan: Publish AIDeck as OSS + Elgato Marketplace

## Context

AIDeck is a working Stream Deck plugin for displaying Claude Code sessions. It needs to go from a local dev setup to a published OSS project on GitHub + a free plugin on the Elgato Marketplace, with a smooth install experience that auto-configures Claude Code hooks.

---

## 1. GitHub OSS Publication

### Current state
- Not a git repo yet (`.gitignore` exists)
- MIT license present
- README.md exists with install/usage docs
- CLAUDE.md, ROADMAP.md present

### Steps
1. `git init` + initial commit
2. Create GitHub repo (public, MIT)
3. Update `package.json`: add `author`, `repository`, `homepage` fields
4. Update README.md: add GitHub URLs, badges, marketplace link (once published)
5. Push

### Files to update
- `package.json` — author, repository, homepage
- `README.md` — install instructions (update for marketplace install path)

---

## 2. Elgato Marketplace Publication

### Requirements (from docs.elgato.com/sdk)
- **Free** to publish — no fees, no revenue share
- Submit via **Maker Console** (developer.elgato.com)
- Plugin must pass `streamdeck validate`
- Need: app icon (288x288 PNG), 1+ gallery preview image
- Manifest requirements: SDKVersion, Software.MinimumVersion ≥ 6.7 (we have 6.7, fine)

### Packaging
```bash
streamdeck pack com.aideck.aideck.sdPlugin  # creates .streamDeckPlugin file
```
- Uses `.sdignore` for exclusions (like `.gitignore` for the package)
- Output is a double-clickable installer

### Steps
1. Run `streamdeck validate com.aideck.aideck.sdPlugin` — fix any issues
2. Create `.sdignore` (exclude `logs/`, `*.d.ts`, etc.)
3. Create gallery images (screenshots of deck with sessions)
4. `streamdeck pack` to generate `.streamDeckPlugin`
5. Sign up at Maker Console, submit for review

### Files to create/update
- `.sdignore` — exclusions for packaging
- `com.aideck.aideck.sdPlugin/manifest.json` — verify all fields, potentially bump SDKVersion if needed
- Gallery images (manual creation)

---

## 3. Auto-Install/Uninstall of Claude Code Hooks

This is the hardest part. The Stream Deck SDK has **no install/uninstall lifecycle events**. But the plugin runs Node.js with full fs access.

### Architecture: Auto-Install on First Use

**Trigger**: When the plugin starts and connects (`plugin.ts` after `streamDeck.connect()`), check if hooks are configured. If not, install them.

**What to install:**
1. **Hook script** — bundle `aideck.sh` inside the plugin dir (`com.aideck.aideck.sdPlugin/aideck.sh`). No need to copy to `~/.claude/hooks/` — reference it directly from the plugin dir.
2. **Hook entries in `~/.claude/settings.json`** — programmatically add the 7 hook events pointing to the bundled script path.
3. **ntfy topic** — auto-generate a cryptographically random topic on first run, save to Stream Deck global settings.

**Hook script path**: Use the plugin's own directory:
```
~/Library/Application Support/com.elgato.StreamDeck/Plugins/com.aideck.aideck.sdPlugin/aideck.sh
```
This keeps everything self-contained. The path can be resolved at runtime.

**Settings.json modification logic:**
```typescript
// In plugin.ts or a new setup.ts module
function installHooks():
  1. Read ~/.claude/settings.json (create if missing, with empty {})
  2. Parse JSON
  3. Check if hooks already contain aideck entries (grep for "aideck")
  4. If not, merge our hook config into the hooks object
  5. Write back atomically (tmp + rename)
  6. Claude Code auto-detects settings.json changes (file watcher)
```

**Hook events to register:** SessionStart, UserPromptSubmit, Stop, Notification, PreCompact, PostCompact, SessionEnd

### Architecture: Uninstall / Remove Hooks

Since there's no uninstall lifecycle event, two options:

**Option A (recommended): "Remove Hooks" button in property inspector**
- Add a button to the PI HTML that sends a `sendToPlugin` message
- Plugin receives it, removes aideck entries from `~/.claude/settings.json`
- Simple, user-controlled, reversible

**Option B: Detect plugin removal**
- Not possible with current SDK — no lifecycle event fires on uninstall
- Could document manual cleanup in README

### Auto-Generated ntfy Topic

On first run (no topic in settings):
1. Generate: `aideck-` + 16 random hex chars (e.g. `aideck-a3f7b2c9e1d4f6a8`)
2. Save to Stream Deck global settings
3. Write to `~/.claude/aideck/config.json` (for hook script)
4. Show in property inspector (user can change it)

### New Module: `src/setup.ts`

```typescript
export function ensureHooksInstalled(pluginDir: string): void
  // Idempotent: check if already installed, skip if so
  // Read settings.json, merge hooks, write back
  // Make aideck.sh executable (chmod +x)

export function removeHooks(): void
  // Read settings.json, remove aideck entries, write back

export function generateTopic(): string
  // crypto.randomBytes(8).toString('hex') prefixed with 'aideck-'
```

### Property Inspector Updates

Add a "Setup" section:
- Status indicator: "Hooks installed" / "Hooks not installed"
- "Install Hooks" / "Remove Hooks" button
- Auto-generated topic display with copy button

### Security & Privacy for ntfy

- **Topic = password** — anyone who knows it can see messages. Random 16-hex is 2^64 combinations.
- **Data transmitted**: session names, project paths, hostnames, git branches, truncated last messages
- **Document in README**: what data is sent, where it goes, how to self-host
- **Self-hosted option**: property inspector URL field already supports custom ntfy servers

---

## 4. Implementation Order

### Phase 1: Auto-install infrastructure
1. Create `src/setup.ts` — `ensureHooksInstalled()`, `removeHooks()`, `generateTopic()`
2. Bundle `aideck.sh` in plugin dir (it's already there at `hooks/aideck.sh`, add copy step or reference)
3. Call `ensureHooksInstalled()` from `plugin.ts` on connect
4. Add auto-topic generation to `session-manager.ts` `loadSettings()` path
5. Add "Install/Remove Hooks" UI to property inspector
6. Tests for setup.ts

### Phase 2: Packaging & GitHub
1. `git init`, initial commit
2. Create `.sdignore`
3. `streamdeck validate` — fix issues
4. Update `package.json` metadata
5. Update README for end-user install flow (marketplace → auto-setup)
6. Create GitHub repo, push
7. `streamdeck pack` for `.streamDeckPlugin`

### Phase 3: Marketplace submission
1. Create gallery images
2. Sign up at Maker Console
3. Submit plugin for review
4. Add marketplace badge/link to README

---

## 5. End-User Install Flow (Target UX)

1. Install AIDeck from Elgato Marketplace (one click)
2. Add "AIDeck Panel" action to Stream Deck (drag & drop)
3. Plugin auto-installs Claude Code hooks + generates ntfy topic
4. Sessions appear on Stream Deck immediately
5. (Optional) Open property inspector to customize colors, font size, or self-host ntfy

**Uninstall:**
1. Open property inspector → click "Remove Hooks"
2. Remove plugin from Stream Deck

---

## 6. Verification

- Fresh install test: remove all aideck config, reinstall plugin, verify hooks auto-configure
- Hook removal test: use PI button, verify `~/.claude/settings.json` is clean
- Package test: `streamdeck pack`, install `.streamDeckPlugin` on a clean profile
- Privacy test: verify only expected data appears in ntfy messages
- Cross-session test: verify topic persists across plugin restarts

---

## Key Files

| File | Change |
|------|--------|
| `src/setup.ts` | NEW — hook install/remove/topic generation |
| `src/plugin.ts` | Call `ensureHooksInstalled()` on connect |
| `src/session-manager.ts` | Auto-generate topic if empty |
| `com.aideck.aideck.sdPlugin/ui/property-inspector.html` | Add setup section |
| `hooks/aideck.sh` | Bundle in plugin dir, make path dynamic |
| `package.json` | Add author, repository, homepage |
| `README.md` | Update install flow for marketplace |
| `.sdignore` | NEW — packaging exclusions |
| `.gitignore` | Verify completeness |
