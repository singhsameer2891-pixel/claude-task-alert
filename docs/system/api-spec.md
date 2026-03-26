# API & Schema Spec — Claude Task Alert

> No REST API — this is a CLI tool. This doc covers internal schemas and external integrations.

---

## 1. Config Schema

**Location:** `~/.claude-task-alert/config.json`

```typescript
interface Config {
  version: string;              // "1.0"
  installed_at: string;         // ISO 8601 timestamp
  updated_at: string;           // ISO 8601 timestamp
  slack: {
    webhook_url: string;        // https://hooks.slack.com/services/T.../B.../...
    channel: string;            // "#claude-alerts"
    app_name: string;           // "Claude Task Alert"
  };
  preferences: {
    idle_threshold_seconds: number;  // default: 30
    sound_enabled: boolean;          // default: true
    sound_volume: number;            // 1-10, default: 5
    message_style: "minimal" | "detailed";  // default: "detailed"
  };
  hook: {
    registered: boolean;        // true if hook is in Claude Code settings
    hook_path: string;          // "~/.claude-task-alert/hook.sh"
  };
}
```

---

## 2. Slack Webhook POST

**Endpoint:** User's webhook URL (from config)
**Method:** POST
**Content-Type:** `application/json`

### Request Body

```json
{
  "text": "<!channel> :raised_hand: *Claude Code Alert*\nClaude is waiting for your input\nDir: /Users/sam/project"
}
```

### Stop Reason → Message Mapping

| `stop_reason` | Emoji | Message |
|---|---|---|
| `end_turn` | `:raised_hand:` | Claude is waiting for your input |
| `max_tokens` | `:warning:` | Claude hit token limit — needs you to continue |
| `tool_error` | `:x:` | Claude hit an error — needs your attention |
| `permission_denied` | `:lock:` | Claude needs permission to proceed |
| Other | `:bell:` | Claude session stopped (reason: {reason}) |

### Detailed Style Message Format

```
<!channel> :raised_hand: *Claude Code Alert*
Claude is waiting for your input
Dir: /Users/sam/project
Reason: end_turn
```

### Minimal Style Message Format

```
:raised_hand: Claude needs input — /Users/sam/project
```

---

## 3. Claude Code Hook JSON (stdin)

**Source:** Claude Code passes this to hook.sh via stdin on stop events.

```json
{
  "stop_reason": "end_turn"
}
```

Known values: `end_turn`, `max_tokens`, `tool_error`, `permission_denied`.

The hook script also extracts `cwd` from the JSON payload for use in detailed-style messages.

---

## 4. Claude Code settings.json Hook Entry

**Location:** Platform-dependent (see `src/integration.ts`)
- macOS / Linux: `~/.claude/settings.json`
- Windows: `%APPDATA%/claude/settings.json`

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/<user>/.claude-task-alert/hook.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

---

## 5. Slack App Manifest

**Used during:** Setup flow, passed as URL query param to Slack app creation page.

```json
{
  "display_information": {
    "name": "Claude Task Alert",
    "description": "Get notified when Claude Code needs your attention",
    "background_color": "#D97757"
  },
  "features": {
    "bot_user": {
      "display_name": "Claude Alert",
      "always_online": false
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": ["incoming-webhook"]
    }
  },
  "settings": {
    "org_deploy_enabled": false,
    "socket_mode_enabled": false,
    "token_rotation_enabled": false
  }
}
```

---

## 6. Webhook URL Format

**Validation regex:**
```
^https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+$
```

---

## 7. State Detection Logic

```
detectState():
  1. Check if ~/.claude-task-alert/config.json exists
     - No → return "fresh"
  2. Read config, check hook.registered
     - hook.registered = true AND hook file exists → return "configured"
     - hook.registered = true BUT hook file missing → return "hook_missing"
     - hook.registered = false → return "hook_missing"
```
