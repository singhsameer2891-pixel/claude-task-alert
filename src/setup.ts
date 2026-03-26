import * as p from '@clack/prompts';
import pc from 'picocolors';
import crypto from 'node:crypto';
import { type Preferences, type MessageStyle } from './config.js';

/** Check if user cancelled a prompt (Ctrl+C) */
function assertNotCancelled(value: unknown): asserts value is Exclude<typeof value, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
}

/** Validate idle threshold: positive integer */
function validateThreshold(value: string | undefined): string | undefined {
  const v = (value ?? '').trim();
  const num = Number(v);
  if (!v || isNaN(num)) return 'Enter a number in seconds.';
  if (!Number.isInteger(num) || num < 1) return 'Must be a positive whole number.';
  if (num > 3600) return 'Max threshold is 3600 seconds (1 hour).';
  return undefined;
}

/** Validate volume: 1–10 */
function validateVolume(value: string | undefined): string | undefined {
  const v = (value ?? '').trim();
  const num = Number(v);
  if (!v || isNaN(num)) return 'Enter a number between 1 and 10.';
  if (!Number.isInteger(num) || num < 1 || num > 10) return 'Volume must be between 1 and 10.';
  return undefined;
}

/** Validate ntfy topic: non-empty, URL-safe */
function validateTopic(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Topic name is required.';
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return 'Only letters, numbers, hyphens, and underscores allowed.';
  if (trimmed.length < 3) return 'Topic must be at least 3 characters.';
  return undefined;
}

export interface SetupResult {
  ntfyTopic: string;
  preferences: Preferences;
}

/** Generate a random topic suggestion */
function generateTopicSuggestion(): string {
  const random = crypto.randomBytes(3).toString('hex');
  return `claude-ping-${random}`;
}

/** Send a test notification to ntfy */
async function sendTestNtfy(topic: string): Promise<boolean> {
  try {
    const response = await fetch(`https://ntfy.sh/${topic}`, {
      method: 'POST',
      headers: {
        'Priority': 'urgent',
        'Title': 'claude-ping',
        'Tags': 'bell',
      },
      body: 'Test notification from claude-ping! If you see this, setup is working.',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Display welcome screen and collect all first-run preferences */
export async function runFirstRunSetup(): Promise<SetupResult> {
  const suggestedTopic = generateTopicSuggestion();

  // ── Welcome ──
  p.note(
    `${pc.bold('claude-ping')}\n` +
    `Get mobile notifications when Claude\n` +
    `needs your attention.\n\n` +
    `Let's get you set up. (~1 minute)`,
  );

  // ── ntfy topic ──
  p.note(
    `${pc.yellow('Privacy note:')}\n` +
    `Your topic name is stored locally in\n` +
    `~/.claude-ping/config.json only.\n` +
    `Notifications are sent via ntfy.sh (open source).\n` +
    `Anyone who knows your topic name can send\n` +
    `you notifications — use a unique, hard-to-guess name.`,
    'Privacy',
  );

  const topicRaw = await p.text({
    message: 'Choose an ntfy topic name',
    placeholder: suggestedTopic,
    defaultValue: suggestedTopic,
    validate: validateTopic,
  });
  assertNotCancelled(topicRaw);
  const ntfyTopic = (topicRaw as string).trim();

  // ── Subscribe instructions ──
  p.note(
    `${pc.bold('Set up your phone:')}\n\n` +
    `  1. Install the ${pc.cyan('ntfy')} app on your phone\n` +
    `     ${pc.dim('iOS: App Store  |  Android: Play Store / F-Droid')}\n` +
    `  2. Open the app → tap ${pc.cyan('"Subscribe to topic"')}\n` +
    `  3. Enter topic: ${pc.cyan(ntfyTopic)}\n` +
    `  4. Come back here when done`,
    'ntfy Setup',
  );

  const subscribed = await p.confirm({
    message: 'Have you subscribed to the topic in the ntfy app?',
    initialValue: true,
  });
  assertNotCancelled(subscribed);

  if (!subscribed) {
    p.log.warn('You can subscribe later — notifications will queue until you do.');
  }

  // ── Test notification ──
  const spinner = p.spinner();
  spinner.start('Sending test notification...');
  const testOk = await sendTestNtfy(ntfyTopic);

  if (testOk) {
    spinner.stop('Test notification sent — check your phone!');
  } else {
    spinner.stop(pc.yellow('Could not send test notification. Check your internet connection.'));
  }

  // ── Settings choice ──
  const settingsChoice = await p.select({
    message: 'How would you like to configure alerts?',
    options: [
      {
        value: 'recommended' as const,
        label: 'Recommended settings',
        hint: 'Alert after 30s idle, sound on at max volume, detailed messages',
      },
      {
        value: 'custom' as const,
        label: 'Configure settings myself',
      },
    ],
    initialValue: 'recommended' as const,
  });
  assertNotCancelled(settingsChoice);

  let preferences: Preferences;

  if (settingsChoice === 'recommended') {
    preferences = {
      idle_threshold_seconds: 30,
      sound_enabled: true,
      sound_volume: 10,
      message_style: 'detailed',
    };
    p.log.success('Using recommended settings.');
  } else {
    // ── Custom: Idle threshold ──
    const thresholdRaw = await p.text({
      message: 'Alert when you\'ve been idle for how long? (seconds)',
      placeholder: '30',
      defaultValue: '30',
      validate: validateThreshold,
    });
    assertNotCancelled(thresholdRaw);

    // ── Sound toggle + volume ──
    const soundEnabledRaw = await p.confirm({
      message: 'Enable sound alerts on this machine?',
      initialValue: true,
    });
    assertNotCancelled(soundEnabledRaw);
    const soundEnabled = soundEnabledRaw as boolean;

    let soundVolume = 10;
    if (soundEnabled) {
      const volumeRaw = await p.text({
        message: 'Sound volume (1–10)',
        placeholder: '10',
        defaultValue: '10',
        validate: validateVolume,
      });
      assertNotCancelled(volumeRaw);
      soundVolume = Number(volumeRaw);
    }

    // ── Message style ──
    const messageStyleRaw = await p.select({
      message: 'Message style?',
      options: [
        { value: 'minimal' as const, label: 'Minimal — "Claude needs input"' },
        { value: 'detailed' as const, label: 'Detailed — "Claude needs input | Dir: ~/project | Reason: end_turn"' },
      ],
      initialValue: 'detailed' as const,
    });
    assertNotCancelled(messageStyleRaw);

    preferences = {
      idle_threshold_seconds: Number(thresholdRaw),
      sound_enabled: soundEnabled,
      sound_volume: soundVolume,
      message_style: messageStyleRaw as MessageStyle,
    };
  }

  return { ntfyTopic, preferences };
}
