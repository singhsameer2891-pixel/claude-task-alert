# PRD — Claude Task Alert

> Version: 1.0 | Date: 2026-03-26
> Status: DRAFT — Awaiting approval

---

## 1. Overview

**Claude Task Alert** is an npm package that lets Claude Code users get Slack notifications when Claude stops and needs attention — with zero manual Slack configuration.

**One command:** `npx claude-task-alert` → interactive CLI → browser-based Slack app creation → auto-configures Claude Code hooks → done.

---

## 2. Problem

Claude Code users walk away while Claude works. When Claude stops (needs input, hits token limit, errors out, permission prompt), the user has no idea until they check back. The current solution (`claude-alert.sh`) works but requires:

- Manually creating a Slack app
- Manually generating a webhook
- Manually configuring Claude Code hooks
- Hardcoded values, no portability, no update path

---

## 3. Target User

Any Claude Code user (Mac, Linux, Windows) who wants Slack alerts when Claude needs attention.

---

## 4. User Flow

### 4.1 First-Time Setup

```
Step 1:  User runs `npx claude-task-alert`
Step 2:  CLI detects no existing config → starts fresh setup
Step 3:  CLI asks setup questions via interactive UI:
           - Slack channel preference (existing name or new)
           - Idle threshold (seconds before alert fires, default 30)
           - Sound alert on/off + volume (if supported on OS)
           - Alert message style (minimal / detailed)
Step 4:  CLI says "Let's connect to Slack" → opens browser
Step 5:  Browser: Slack app creation page with pre-filled manifest
Step 6:  User clicks "Create App" → "Install to Workspace"
Step 7:  Slack shows "Incoming Webhooks" → user adds to their chosen channel
Step 8:  CLI displays: "Paste the webhook URL here: ___"
Step 9:  CLI validates webhook (format check + test POST)
           - If invalid → clear error message + re-prompt
           - If valid → sends a test "Connected!" message to Slack
Step 10: CLI writes config + registers Claude Code stop hook
Step 11: "All set! You'll get Slack alerts when Claude needs you."
```

### 4.2 Re-Run (Already Configured)

```
Step 1:  User runs `npx claude-task-alert`
Step 2:  CLI detects existing config at ~/.claude-task-alert/config.json
Step 3:  CLI shows current config summary, then menu:
           a) Update preferences (threshold, sound, message style)
           b) Change Slack channel / webhook
           c) Uninstall (remove hook + config)
           d) Test alert (fire a test notification now)
           e) Exit
Step 4:  User picks option → CLI handles it → done
```

### 4.3 Browser ↔ CLI Handoff

This must be seamless. The user should never feel lost.

```
CLI states:
  "Opening Slack in your browser..."
  "Complete the steps in your browser, then come back here."
  "Waiting for you to paste the webhook URL..."

If browser doesn't open:
  CLI prints the URL manually:
  "Couldn't open browser. Copy this URL and open it manually:"
  "https://api.slack.com/apps?new_app=1&manifest_json=..."

After paste:
  CLI immediately validates + confirms → user never leaves CLI again
```

---

## 5. Slack App Manifest

Pre-built manifest that the CLI generates and passes to Slack's app creation URL.

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

**Scopes:** Only `incoming-webhook`. Minimal permissions — we don't read messages, don't access channels, don't list users.

---

## 6. Channel Handling

| Scenario | Behavior |
|---|---|
| User provides existing channel name | Webhook gets attached to that channel during Slack app install |
| User provides name that doesn't exist | CLI informs: "That channel doesn't exist. Create it in Slack first, or give a different name." Re-prompt. |
| User wants a new channel | CLI instructs: "Create the channel in Slack, then tell me the name." |
| Channel selection happens in Slack | During "Add to Channel" step in webhook setup, user picks the channel in Slack UI — CLI just validates the webhook works after paste |

**Note:** Channel selection ultimately happens in Slack's UI during webhook creation. The CLI asks for the preferred channel name upfront so it can:
1. Set user expectations
2. Validate the webhook posts to the right place (test message includes channel name)
3. Store it in config for display purposes

---

## 7. Idempotency & State Detection

### Config Location

```
~/.claude-task-alert/
  config.json        # All user preferences + webhook + install state
```

### config.json Schema

```json
{
  "version": "1.0",
  "installed_at": "2026-03-26T10:00:00Z",
  "updated_at": "2026-03-26T10:00:00Z",
  "slack": {
    "webhook_url": "https://hooks.slack.com/services/...",
    "channel": "#claude-alerts",
    "app_name": "Claude Task Alert"
  },
  "preferences": {
    "idle_threshold_seconds": 30,
    "sound_enabled": true,
    "sound_volume": 5,
    "message_style": "detailed"
  },
  "hook": {
    "registered": true,
    "hook_path": "~/.claude-task-alert/hook.sh"
  }
}
```

### Detection Logic

```
On launch:
  IF config.json exists AND hook is registered:
    → Show "Already configured" menu (§4.2)
  IF config.json exists BUT hook is missing:
    → "Config found but hook not registered. Re-register? (Y/n)"
  IF no config.json:
    → Fresh setup (§4.1)
```

---

## 8. Claude Code Hook Integration

### What triggers alerts

The CLI registers a **stop hook** in Claude Code's `settings.json`. Stop hooks fire on ALL stop scenarios:

| Stop Reason | Alert Message |
|---|---|
| `end_turn` | "Claude is waiting for your input" |
| `max_tokens` | "Claude hit token limit — needs you to continue" |
| `tool_error` | "Claude hit an error — needs your attention" |
| `permission_denied` | "Claude needs permission to proceed" |
| Other/unknown | "Claude session stopped (reason: {reason})" |

### Hook Registration

The CLI writes the hook script to `~/.claude-task-alert/hook.sh` and adds it to Claude Code's settings:

```json
// In Claude Code settings.json
{
  "hooks": {
    "stop": [
      {
        "command": "~/.claude-task-alert/hook.sh",
        "timeout": 10000
      }
    ]
  }
}
```

### Hook Script Behavior

1. Read stop reason from stdin (JSON from Claude Code)
2. Check system idle time (only alert if user has been away > threshold)
3. Play sound alert (if enabled + supported on OS)
4. Send Slack message with reason, emoji, and working directory
5. Exit 0 (never block Claude Code)

---

## 9. Cross-Platform Support

| Feature | macOS | Linux | Windows (WSL) | Windows (native) |
|---|---|---|---|---|
| Slack webhook | Yes | Yes | Yes | Yes |
| Idle detection | `ioreg` | `xprintidle` | `xprintidle` | `powershell` query |
| Sound alert | `afplay` | `paplay` / `aplay` | `paplay` | `powershell` `[System.Media.SoundPlayer]` |
| Browser open | `open` | `xdg-open` | `wslview` / `xdg-open` | `start` |
| Hook script | bash | bash | bash | bash (via Git Bash / WSL) |

**Graceful degradation:** If idle detection or sound isn't available on a platform, skip it silently and rely on Slack-only alerts. Log a one-time note during setup: "Sound alerts not supported on this system — Slack alerts will still work."

---

## 10. CLI UI Screens

### 10.1 Welcome Screen (First Run)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   Claude Task Alert                             │
│   Get Slack notifications when Claude           │
│   needs your attention.                         │
│                                                 │
│   Let's get you set up. (~2 minutes)            │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 10.2 Preferences Prompts

```
? Which Slack channel should alerts go to?
  (type a channel name, e.g. #claude-alerts)
  > #claude-alerts

? Alert when you've been idle for how long?
  (seconds — only alerts if you've been away this long)
  > 30

? Enable sound alerts on this machine?
  > Yes / No

? Message style?
  > Minimal ("Claude needs input")
  > Detailed ("Claude needs input | Dir: ~/project | Reason: end_turn")
```

### 10.3 Slack Connection Screen

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   Step 1: Create the Slack App                  │
│   Opening Slack in your browser...              │
│                                                 │
│   In the browser:                               │
│   1. Review the app config → click "Create"     │
│   2. Click "Install to Workspace"               │
│   3. Go to "Incoming Webhooks" in the sidebar   │
│   4. Toggle webhooks ON                         │
│   5. Click "Add New Webhook to Workspace"       │
│   6. Select your channel → click "Allow"        │
│   7. Copy the Webhook URL                       │
│                                                 │
│   Then come back here and paste it.             │
│                                                 │
└─────────────────────────────────────────────────┘

? Paste your Webhook URL here:
  > https://hooks.slack.com/services/...
```

### 10.4 Success Screen

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   All set!                                      │
│                                                 │
│   Channel:    #claude-alerts                    │
│   Threshold:  30 seconds idle                   │
│   Sound:      Enabled                           │
│   Style:      Detailed                          │
│                                                 │
│   A test message was sent to your channel.      │
│   You'll get Slack alerts whenever Claude       │
│   stops and needs your attention.               │
│                                                 │
│   Run `npx claude-task-alert` again to          │
│   update settings or uninstall.                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 10.5 Already Configured Menu

```
┌─────────────────────────────────────────────────┐
│                                                 │
│   Claude Task Alert — Already Configured        │
│                                                 │
│   Channel:    #claude-alerts                    │
│   Threshold:  30s │ Sound: On │ Style: Detailed │
│   Installed:  2026-03-26                        │
│                                                 │
└─────────────────────────────────────────────────┘

? What would you like to do?
  > Update preferences
  > Change Slack channel / webhook
  > Test alert
  > Uninstall
  > Exit
```

---

## 11. Error Handling

| Error | Response |
|---|---|
| Invalid webhook URL format | "That doesn't look like a Slack webhook URL. It should start with `https://hooks.slack.com/services/`. Try again." |
| Webhook test POST fails (non-200) | "Couldn't reach that webhook. Double-check the URL and make sure the app is installed. Try again." |
| Browser won't open | Print URL manually with copy instructions |
| No write access to `~/.claude-task-alert/` | "Can't write config. Check permissions on your home directory." |
| Claude Code settings.json not found | "Claude Code doesn't seem to be installed. Install it first: https://claude.ai/code" |
| Idle detection unavailable | "Idle detection not available on this system. Alerts will fire every time Claude stops, regardless of whether you're at the keyboard." Proceed without idle check. |
| Sound playback unavailable | "Sound alerts not available on this system. Slack alerts will still work." Disable sound in config. |

---

## 12. Package Details

| Field | Value |
|---|---|
| Package name | `claude-task-alert` |
| Registry | npm |
| Entry point | `npx claude-task-alert` |
| Runtime | Node.js >= 18 |
| Dependencies | `@clack/prompts`, `picocolors`, `open` (browser launch) |
| Zero runtime deps on user system | Node only — shell commands for sound/idle are optional |
| License | MIT |

---

## 13. Out of Scope (v1)

- Slack bot that responds to commands (read-only webhook is enough)
- Multiple workspace support
- Claude Code extension/plugin (we're a standalone CLI)
- Email / Discord / Teams notifications (Slack only for v1)
- Dashboard or web UI

---

## 14. Success Criteria

1. User goes from zero to working Slack alerts in under 3 minutes
2. Works on macOS, Linux, and Windows (WSL)
3. Re-running the CLI never creates duplicate Slack apps
4. Non-technical users can complete setup without documentation

---

## 15. Known Risks

| Risk | Mitigation |
|---|---|
| Slack changes manifest URL scheme | CLI detects failure, falls back to manual URL print |
| Claude Code hook format changes | Version-check Claude Code settings schema, warn if incompatible |
| Webhook URL leaks (stored in plaintext) | Config file is in user's home dir with default permissions. Document that webhook URLs are sensitive. |
| User's Slack workspace restricts app creation | Detect + surface: "Your workspace may restrict app creation. Contact your Slack admin." |

---

*Last updated: 2026-03-26*
