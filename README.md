# claude-ping

Never miss a Claude Code moment.

Get Slack notifications + loud alarm sounds when Claude Code stops and needs your attention.

One command. No manual Slack setup. Works on macOS, Linux, and Windows.

## Install & Setup

```bash
npx claude-ping
```

The CLI walks you through:
1. Alert preferences (channel, idle threshold, sound, message style)
2. Slack app creation (opens browser, pre-configured manifest)
3. Webhook connection (paste URL, auto-validated)
4. Claude Code hook registration (automatic)

Setup takes ~2 minutes.

## What Triggers Alerts

| Scenario | Slack Message |
|---|---|
| Claude waiting for input | "Claude is waiting for your input" |
| Token limit reached | "Claude hit token limit — needs you to continue" |
| Error occurred | "Claude hit an error — needs your attention" |
| Permission needed | "Claude needs permission to proceed" |

Alerts only fire when you've been idle longer than your threshold (default: 30 seconds). No spam while you're at the keyboard.

## Manage Settings

Re-run to update preferences, change channel, test alerts, or uninstall:

```bash
npx claude-ping
```

## How It Works

1. Creates a Slack app in your workspace via pre-built manifest (you own it)
2. Generates a hook script at `~/.claude-ping/hook.sh`
3. Registers the hook in Claude Code's `settings.json`
4. On every Claude stop: checks idle time → pauses media → plays alarm at max volume → restores volume → resumes media → sends Slack message

The hook returns instantly — a fully detached background worker handles the alert logic so Claude Code is never blocked.

## Platform Support

| Feature | macOS | Linux | Windows (WSL) |
|---|---|---|---|
| Slack alerts | Yes | Yes | Yes |
| Sound alerts | Yes (sharp alarm + media pause/resume) | Yes | Limited |
| Idle detection | Yes | Yes | Limited |

Sound and idle detection degrade gracefully — Slack alerts always work.

## Uninstall

```bash
npx claude-ping
# Select "Uninstall" from the menu
```

This removes the hook from Claude Code settings and deletes `~/.claude-ping/`.

To also remove the Slack app: go to [Slack App Management](https://api.slack.com/apps) and delete "claude-ping".

## Configuration

All config is stored at `~/.claude-ping/`:

| File | Purpose |
|---|---|
| `config.json` | Preferences, webhook URL, hook status |
| `hook.sh` | Thin launcher — reads stop event, spawns worker |
| `worker.sh` | Background worker — idle polling, sound, Slack POST |
| `alarm.wav` | Generated sharp alarm tone (macOS) |

## Requirements

- Node.js >= 18
- Claude Code installed
- Slack workspace where you can create apps

## Development

```bash
git clone https://github.com/singhsameer2891-pixel/claude-task-alert.git
cd claude-task-alert
npm install
npm run build
npm test
```

## License

MIT
