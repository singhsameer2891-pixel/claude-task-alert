import * as p from '@clack/prompts';
import pc from 'picocolors';
import { type Preferences, type MessageStyle } from './config.js';

/** Check if user cancelled a prompt (Ctrl+C) */
function assertNotCancelled(value: unknown): asserts value is Exclude<typeof value, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }
}

/** Validate channel name: non-empty */
function validateChannel(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'Channel name is required.';
  return undefined;
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

export interface SetupResult {
  channel: string;
  preferences: Preferences;
}

/** Display welcome screen and collect all first-run preferences */
export async function runFirstRunSetup(): Promise<SetupResult> {
  // ── 3.1 Welcome screen ──
  p.note(
    `${pc.bold('claude-ping')}\n` +
    `Get Slack notifications when Claude\n` +
    `needs your attention.\n\n` +
    `Let's get you set up. (~2 minutes)`,
  );

  // ── 3.2 Channel name ──
  const channelRaw = await p.text({
    message: 'Which Slack channel should alerts go to? (without #)',
    placeholder: 'claude-alerts',
    defaultValue: 'claude-alerts',
    validate: validateChannel,
  });
  assertNotCancelled(channelRaw);
  const channel = `#${(channelRaw as string).trim().replace(/^#/, '')}`;

  // ── 3.3 Idle threshold ──
  const thresholdRaw = await p.text({
    message: 'Alert when you\'ve been idle for how long? (seconds)',
    placeholder: '30',
    defaultValue: '30',
    validate: validateThreshold,
  });
  assertNotCancelled(thresholdRaw);
  const idleThreshold = Number(thresholdRaw);

  // ── 3.4 Sound toggle + volume ──
  const soundEnabledRaw = await p.confirm({
    message: 'Enable sound alerts on this machine?',
    initialValue: true,
  });
  assertNotCancelled(soundEnabledRaw);
  const soundEnabled = soundEnabledRaw as boolean;

  let soundVolume = 5;
  if (soundEnabled) {
    const volumeRaw = await p.text({
      message: 'Sound volume (1–10)',
      placeholder: '5',
      defaultValue: '5',
      validate: validateVolume,
    });
    assertNotCancelled(volumeRaw);
    soundVolume = Number(volumeRaw);
  }

  // ── 3.5 Message style ──
  const messageStyleRaw = await p.select({
    message: 'Message style?',
    options: [
      { value: 'minimal' as const, label: 'Minimal — "Claude needs input"' },
      { value: 'detailed' as const, label: 'Detailed — "Claude needs input | Dir: ~/project | Reason: end_turn"' },
    ],
    initialValue: 'detailed' as const,
  });
  assertNotCancelled(messageStyleRaw);
  const messageStyle = messageStyleRaw as MessageStyle;

  // ── 3.6 Collect preferences ──
  const preferences: Preferences = {
    idle_threshold_seconds: idleThreshold,
    sound_enabled: soundEnabled,
    sound_volume: soundVolume,
    message_style: messageStyle,
  };

  return {
    channel,
    preferences,
  };
}
