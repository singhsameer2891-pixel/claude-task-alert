import * as p from '@clack/prompts';
import pc from 'picocolors';
import open from 'open';

// ── 4.1 Manifest Generation ──────────────────────────────

/** Generate Slack app manifest JSON per PRD §5 */
export function generateManifest(): string {
  const manifest = {
    display_information: {
      name: 'Claude Task Alert',
      description: 'Get notified when Claude Code needs your attention',
      background_color: '#D97757',
    },
    features: {
      bot_user: {
        display_name: 'Claude Alert',
        always_online: false,
      },
    },
    oauth_config: {
      scopes: {
        bot: ['incoming-webhook'],
      },
    },
    settings: {
      org_deploy_enabled: false,
      socket_mode_enabled: false,
      token_rotation_enabled: false,
    },
  };

  return JSON.stringify(manifest);
}

// ── 4.2 Slack App Creation URL ───────────────────────────

/** Build the Slack app creation URL with pre-filled manifest */
export function buildSlackAppUrl(): string {
  const manifest = generateManifest();
  const encoded = encodeURIComponent(manifest);
  return `https://api.slack.com/apps?new_app=1&manifest_json=${encoded}`;
}

// ── 4.3 Browser Open ─────────────────────────────────────

/** Open Slack app creation page in browser; print URL on failure */
async function openBrowser(url: string): Promise<void> {
  try {
    await open(url);
    p.log.success('Opened Slack in your browser.');
  } catch {
    p.log.warn("Couldn't open browser. Copy this URL and open it manually:");
    p.log.message(pc.cyan(url));
  }
}

// ── 4.5 Webhook Validation ───────────────────────────────

const WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/.+\/.+\/.+$/;

/** Validate webhook URL format */
function validateWebhookUrl(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Webhook URL is required.';
  if (!WEBHOOK_PATTERN.test(trimmed)) {
    return 'Must be a Slack webhook URL (https://hooks.slack.com/services/T.../B.../...)';
  }
  return undefined;
}

// ── 4.6 Test Webhook POST ────────────────────────────────

/** Send a test message to the webhook, returns true on success */
async function testWebhook(webhookUrl: string, channel: string): Promise<boolean> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `✅ *Claude Task Alert connected!*\nAlerts will be posted to ${channel}.`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ── 4.4 + 4.5 + 4.6 + 4.7 Full Handoff Flow ────────────

/** Check if user cancelled a prompt */
function assertNotCancelled(value: unknown): asserts value is Exclude<typeof value, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
}

/** Run the full Slack connection flow: browser handoff → webhook paste → validation → test */
export async function runSlackConnection(channel: string): Promise<string> {
  const url = buildSlackAppUrl();

  // ── 4.3 Open browser ──
  p.log.step(pc.bold('Let\'s connect to Slack'));
  await openBrowser(url);

  // ── 4.4 Step-by-step instructions ──
  p.note(
    `${pc.bold('Complete these steps in your browser:')}\n\n` +
    `  1. Click ${pc.cyan('"Create App"')} on the Slack page\n` +
    `  2. Pick a workspace → click ${pc.cyan('"Next"')}\n` +
    `  3. Click ${pc.cyan('"Create"')}\n` +
    `  4. On the app page, go to ${pc.cyan('"Incoming Webhooks"')}\n` +
    `  5. Toggle ${pc.cyan('"Activate Incoming Webhooks"')} → ON\n` +
    `  6. Click ${pc.cyan('"Add New Webhook to Workspace"')}\n` +
    `  7. Select channel ${pc.cyan(channel)} → click ${pc.cyan('"Allow"')}\n` +
    `  8. Copy the ${pc.cyan('Webhook URL')} and paste it below`,
    'Slack Setup',
  );

  // ── 4.5 + 4.7 Webhook paste with re-prompt loop ──
  while (true) {
    const webhookRaw = await p.text({
      message: 'Paste your Slack webhook URL:',
      placeholder: 'https://hooks.slack.com/services/T.../B.../...',
      validate: validateWebhookUrl,
    });
    assertNotCancelled(webhookRaw);

    const webhookUrl = (webhookRaw as string).trim();

    // ── 4.6 Test POST ──
    const spinner = p.spinner();
    spinner.start('Testing webhook...');

    const ok = await testWebhook(webhookUrl, channel);

    if (ok) {
      spinner.stop('Webhook verified — test message sent to Slack!');
      return webhookUrl;
    }

    spinner.stop(pc.red('Webhook test failed.'));
    p.log.error(
      'Could not reach that webhook. Check that:\n' +
      '  • The URL is copied correctly (full URL, no trailing spaces)\n' +
      '  • The app is installed to your workspace\n' +
      '  • The webhook is active\n',
    );

    const retry = await p.confirm({
      message: 'Try a different webhook URL?',
      initialValue: true,
    });
    assertNotCancelled(retry);

    if (!retry) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
  }
}
