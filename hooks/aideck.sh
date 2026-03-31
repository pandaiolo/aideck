#!/bin/sh
# AIDeck hook script — pushes session state to ntfy for Stream Deck display
# Called by Claude Code hooks on: SessionStart, UserPromptSubmit, Stop, Notification, PreCompact, PostCompact, SessionEnd

set -e

# Check dependencies — exit cleanly if missing (e.g. remote sandboxes)
for cmd in jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "aideck: $cmd not found, skipping" >&2
    exit 0
  fi
done

CONFIG_FILE="$HOME/.claude/aideck/config.json"
[ -f "$CONFIG_FILE" ] || exit 0

# Read hook input from stdin
INPUT=$(cat)

EVENT=$(printf '%s' "$INPUT" | jq -r '.hook_event_name // empty')
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty')

[ -z "$SESSION_ID" ] && exit 0

NTFY_TOPIC=$(jq -r '.topic // empty' "$CONFIG_FILE" 2>/dev/null)
[ -z "$NTFY_TOPIC" ] && exit 0
NTFY_URL=$(jq -r '.url // "https://ntfy.sh"' "$CONFIG_FILE" 2>/dev/null)

case "$EVENT" in
  SessionEnd)
    STATE_JSON='{"event":"SessionEnd","sessionId":"'"$SESSION_ID"'"}'
    ;;
  *)
    CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty')
    SESSION_NAME=$(printf '%s' "$INPUT" | jq -r '.session_name // empty')
    STARTED_AT=$(printf '%s' "$INPUT" | jq -r '.started_at // empty')
    PROJECT_NAME=$(basename "$CWD")

    # Try to get session name from the JSONL transcript
    TRANSCRIPT=$(printf '%s' "$INPUT" | jq -r '.transcript_path // empty')
    if [ -z "$SESSION_NAME" ] && [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
      # Check for custom title first (/rename), then fall back to slug
      SESSION_NAME=$(grep '"type":"custom-title"\|"type": "custom-title"' "$TRANSCRIPT" 2>/dev/null | tail -1 | jq -r '.customTitle // empty' 2>/dev/null)
      [ -z "$SESSION_NAME" ] && SESSION_NAME=$(tail -1 "$TRANSCRIPT" | jq -r '.slug // empty' 2>/dev/null)
    fi

    # Detect git branch
    BRANCH=""
    if [ -n "$CWD" ] && [ -f "$CWD/.git/HEAD" ]; then
      HEAD=$(cat "$CWD/.git/HEAD")
      case "$HEAD" in
        ref:\ refs/heads/*) BRANCH="${HEAD#ref: refs/heads/}" ;;
      esac
    fi

    # Determine status based on event
    case "$EVENT" in
      SessionStart)          STATUS="awaiting_input" ;;
      UserPromptSubmit)      STATUS="working" ;;
      PreCompact)            STATUS="working" ;;
      Stop|PostCompact)      STATUS="awaiting_input" ;;
      Notification)
        NTYPE=$(printf '%s' "$INPUT" | jq -r '.notification_type // empty')
        case "$NTYPE" in
          idle_prompt|permission_prompt|elicitation_dialog)
            STATUS="awaiting_input"
            ;;
          *)
            exit 0
            ;;
        esac
        ;;
      *)
        exit 0
        ;;
    esac

    # Capture last assistant message as summary fallback (only from Stop event)
    LAST_MSG=""
    if [ "$EVENT" = "Stop" ]; then
      LAST_MSG=$(printf '%s' "$INPUT" | jq -r '.last_assistant_message // empty' | head -c 80)
    fi

    # Extract remote session URL from bridge_status entries in this session's transcript
    REMOTE_URL=""
    if [ -n "$TRANSCRIPT" ] && [ -f "$TRANSCRIPT" ]; then
      REMOTE_URL=$(grep '"subtype":"bridge_status"\|"subtype": "bridge_status"' "$TRANSCRIPT" 2>/dev/null | tail -1 | jq -r '.url // empty' 2>/dev/null)
    fi

    UPDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    HOSTNAME=$(hostname -s)

    STATE_JSON=$(jq -n \
      --arg sid "$SESSION_ID" \
      --arg status "$STATUS" \
      --arg pp "$CWD" \
      --arg pn "$PROJECT_NAME" \
      --arg br "$BRANCH" \
      --arg sn "$SESSION_NAME" \
      --arg lm "$LAST_MSG" \
      --arg ru "$REMOTE_URL" \
      --arg sa "$STARTED_AT" \
      --arg ua "$UPDATED_AT" \
      --arg hn "$HOSTNAME" \
      '{
        sessionId: $sid,
        status: $status,
        projectPath: $pp,
        projectName: $pn,
        gitBranch: $br,
        sessionName: $sn,
        lastMessage: $lm,
        remoteUrl: $ru,
        startedAt: $sa,
        updatedAt: $ua,
        hostname: $hn
      }')
    ;;
esac

curl -sf -d "$STATE_JSON" "$NTFY_URL/$NTFY_TOPIC" >/dev/null 2>&1 || true

exit 0
