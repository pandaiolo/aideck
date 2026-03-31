# AIDeck

Elgato Stream Deck plugin that displays your Claude Code sessions — local and remote.

Press a key to see all your active and recent sessions at a glance. Press a session to open it in Claude Desktop.

## Prerequisites

- [Elgato Stream Deck](https://www.elgato.com/stream-deck) (Standard 5x3, 15 keys)
- Elgato Stream Deck app v6.7+
- macOS 13+
- Node.js 20+
- [jq](https://jqlang.github.io/jq/) (for the hook script)
- `@elgato/cli`: `npm install -g @elgato/cli`

## Install

```bash
git clone https://github.com/your-username/aideck.git
cd aideck
npm install
streamdeck dev          # enable dev mode (first time only)
npm run build
streamdeck link com.aideck.aideck.sdPlugin
```

### Configure Claude Code hooks

The plugin reads session state from files written by a hook script. Copy the script and configure Claude Code to call it:

1. Copy the hook script:
   ```bash
   mkdir -p ~/.claude/hooks
   cp hooks/aideck.sh ~/.claude/hooks/aideck.sh
   chmod +x ~/.claude/hooks/aideck.sh
   ```

2. Add the hooks to `~/.claude/settings.local.json`:
   ```json
   {
     "hooks": {
       "SessionStart": [{ "type": "command", "command": "~/.claude/hooks/aideck.sh" }],
       "UserPromptSubmit": [{ "type": "command", "command": "~/.claude/hooks/aideck.sh" }],
       "Stop": [{ "type": "command", "command": "~/.claude/hooks/aideck.sh" }],
       "Notification": [{ "type": "command", "command": "~/.claude/hooks/aideck.sh" }],
       "SessionEnd": [{ "type": "command", "command": "~/.claude/hooks/aideck.sh" }]
     }
   }
   ```

   If you already have hooks configured, merge the entries into your existing arrays.

3. Restart any running Claude Code sessions for hooks to take effect.

### Development

```bash
npm run watch           # auto-rebuild + restart on changes
```

## Usage

1. In the Stream Deck app, find **AIDeck Panel** in the action list (AIDeck category)
2. Drag it onto any key on your main profile
3. Press the key to open the AIDeck panel
4. Sessions appear with project name, branch, and summary
5. Press a session to open it in Claude Desktop
6. Use **PREV**/**NEXT** to paginate, **back arrow** to return

### Button colors

- **Green border** — active, waiting for your input
- **Orange border** — active, Claude is working
- **No border** — inactive (historical session)

Colors are customizable via the Property Inspector (click the action in the Stream Deck app).

### Panel layout

```
[ BACK  ] [sess 0 ] [sess 1 ] [sess 2 ] [sess 3 ]
[sess 4 ] [sess 5 ] [sess 6 ] [sess 7 ] [sess 8 ]
[sess 9 ] [sess 10] [sess 11] [ PREV  ] [ NEXT  ]
```

12 session slots per page, sorted: active first, then by creation date.

## How it works

### Local sessions

The hook script (`hooks/aideck.sh`) fires on Claude Code lifecycle events and writes state files to `~/.claude/aideck/<session_id>.json`. The plugin watches this directory and updates buttons in real time.

Historical sessions are loaded from `~/.claude/projects/*/sessions-index.json`.

### Remote sessions (via ntfy.sh)

Remote Claude Code instances push session state to [ntfy.sh](https://ntfy.sh) — a free, open-source pub/sub service. The plugin subscribes to the same topic and shows remote sessions alongside local ones.

#### Setup remote sync

1. Generate a random topic name (acts as your shared secret):
   ```bash
   echo "aideck-$(openssl rand -hex 8)"
   ```

2. On your Mac, create `~/.claude/hooks/aideck.json`:
   ```json
   {
     "topic": "aideck-your-random-topic-here"
   }
   ```

3. On each remote server, set the environment variable:
   ```bash
   export AIDECK_NTFY_TOPIC="aideck-your-random-topic-here"
   ```

4. Copy the hook script and settings to each remote server:
   ```bash
   scp hooks/aideck.sh remote:~/.claude/hooks/aideck.sh
   ssh remote chmod +x ~/.claude/hooks/aideck.sh
   scp ~/.claude/settings.local.json remote:~/.claude/settings.local.json
   ```

5. Restart the Stream Deck plugin — remote sessions appear automatically.

#### Self-hosting ntfy

For better privacy, self-host ntfy:

```bash
docker run -p 8080:80 binwiederhier/ntfy serve
```

Then set the URL in `~/.claude/hooks/aideck.json`:
```json
{
  "topic": "aideck-your-topic",
  "url": "http://your-server:8080"
}
```

And on remote servers: `export AIDECK_NTFY_URL="http://your-server:8080"`

## Troubleshooting

### Sessions don't appear

- Verify the hook script is executable: `ls -la ~/.claude/hooks/aideck.sh`
- Check that hooks are configured: `cat ~/.claude/settings.local.json`
- Check hook config: `cat ~/.claude/hooks/aideck.json`
- Check plugin logs: `~/Library/Logs/ElgatoStreamDeck/com.aideck.aideck.*.log` or via Stream Deck app > More... > Logs

### Remote sessions don't appear

- Verify `~/.claude/hooks/aideck.json` has the correct topic
- Test ntfy connectivity: `curl -s "https://ntfy.sh/YOUR_TOPIC/json?poll=1"`
- Ensure `AIDECK_NTFY_TOPIC` is set on the remote server
- Check that `jq` and `curl` are installed on the remote server

### Clicking a session doesn't open Claude Desktop

- Verify Claude Desktop is installed at `/Applications/Claude.app`
- Check the "Open sessions in Claude Desktop" setting in the Property Inspector

## Compatibility

- **Stream Deck models**: Standard (5x3, 15 keys) only. See [ROADMAP.md](ROADMAP.md) for other models.
- **OS**: macOS 13+ only. See [ROADMAP.md](ROADMAP.md) for Windows/Linux.
- **Claude Code**: Works with Claude Code CLI sessions. Requires hooks support.

## License

[MIT](LICENSE)
