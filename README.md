# Claude Task Alert

Get Slack notifications when Claude Code stops and needs your attention.

One command. No manual Slack setup. Works on macOS, Linux, and Windows.

## Install & Setup

```bash
npx claude-task-alert
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
npx claude-task-alert
```

## How It Works

1. Creates a Slack app in your workspace via pre-built manifest (you own it)
2. Generates a hook script at `~/.claude-task-alert/hook.sh`
3. Registers the hook in Claude Code's `settings.json`
4. On every Claude stop: checks idle time → plays sound → sends Slack message

## Platform Support

| Feature | macOS | Linux | Windows (WSL) |
|---|---|---|---|
| Slack alerts | Yes | Yes | Yes |
| Sound alerts | Yes | Yes | Limited |
| Idle detection | Yes | Yes | Limited |

Sound and idle detection degrade gracefully — Slack alerts always work.

## Uninstall

```bash
npx claude-task-alert
# Select "Uninstall" from the menu
```

This removes the hook from Claude Code settings and deletes `~/.claude-task-alert/`.

To also remove the Slack app: go to [Slack App Management](https://api.slack.com/apps) and delete "Claude Task Alert".

## Configuration

All config is stored at `~/.claude-task-alert/`:

| File | Purpose |
|---|---|
| `config.json` | Preferences, webhook URL, hook status |
| `hook.sh` | Generated shell script registered with Claude Code |

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
