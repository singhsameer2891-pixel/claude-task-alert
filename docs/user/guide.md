# User Guide — Claude Task Alert

## What It Does

Claude Task Alert sends you a Slack message whenever Claude Code stops and needs your attention. You can walk away from your computer and know you'll get pinged when Claude needs you.

---

## Setup (First Time)

### Step 1: Run the Installer

```bash
npx claude-task-alert
```

### Step 2: Answer Setup Questions

The CLI will ask you:

- **Slack channel** — Which channel should alerts go to? (e.g., `#claude-alerts`)
- **Idle threshold** — Only alert if you've been away for this many seconds (default: 30)
- **Sound alerts** — Play a sound on your machine when Claude stops? (Yes/No)
- **Message style** — Minimal or detailed alerts

### Step 3: Create the Slack App

The CLI opens your browser to Slack's app creation page. Everything is pre-configured.

1. Review the app details and click **Create**
2. Click **Install to Workspace**
3. In the sidebar, click **Incoming Webhooks**
4. Toggle webhooks **ON**
5. Click **Add New Webhook to Workspace**
6. Select your channel and click **Allow**
7. Copy the **Webhook URL**

### Step 4: Paste the Webhook

Go back to your terminal and paste the webhook URL when prompted. The CLI will:

- Validate the URL
- Send a test message to your Slack channel
- Register the alert hook with Claude Code

### Done

You'll see a confirmation screen. From now on, whenever Claude stops and you've been away, you'll get a Slack notification.

---

## Managing Your Setup

Run the same command again:

```bash
npx claude-task-alert
```

You'll see a menu with options:

- **Update preferences** — Change threshold, sound, or message style
- **Change Slack channel / webhook** — Connect to a different channel
- **Test alert** — Send a test notification right now
- **Uninstall** — Remove everything

---

## Alert Types

| When Claude... | You'll see in Slack |
|---|---|
| Finishes and waits for you | "Claude is waiting for your input" |
| Hits the token limit | "Claude hit token limit — needs you to continue" |
| Encounters an error | "Claude hit an error — needs your attention" |
| Needs permission to run a tool | "Claude needs permission to proceed" |

---

## Troubleshooting

### Not getting alerts?

1. Run `npx claude-task-alert` and select **Test alert** — if the test works, your setup is fine
2. Check that your idle threshold isn't too high — if you're at the keyboard, alerts are intentionally suppressed
3. Verify the webhook URL is still valid in your Slack app settings

### Browser didn't open during setup?

The CLI will print the URL. Copy and paste it into your browser manually.

### Sound not playing?

Sound support varies by OS. Slack alerts will still work even if sound isn't supported on your system.

---

## Uninstalling

```bash
npx claude-task-alert
# Select "Uninstall"
```

This removes:
- The hook from Claude Code's settings
- The `~/.claude-task-alert/` config directory

To fully remove: also delete the Slack app at https://api.slack.com/apps.
