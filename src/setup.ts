import * as p from '@clack/prompts';
import pc from 'picocolors';
import { type Preferences } from './config.js';

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

// /** Validate ntfy topic: non-empty, URL-safe */
// function validateTopic(value: string | undefined): string | undefined {
//   const trimmed = (value ?? '').trim();
//   if (!trimmed) return 'Topic name is required.';
//   if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return 'Only letters, numbers, hyphens, and underscores allowed.';
//   if (trimmed.length < 3) return 'Topic must be at least 3 characters.';
//   return undefined;
// }

export interface SetupResult {
  ntfyTopic: string;
  preferences: Preferences;
}

// /** Generate a random topic suggestion */
// function generateTopicSuggestion(): string {
//   const random = crypto.randomBytes(3).toString('hex');
//   return `claude-ping-${random}`;
// }

// /** Send a test notification to ntfy */
// async function sendTestNtfy(topic: string): Promise<boolean> {
//   try {
//     const response = await fetch(`https://ntfy.sh/${topic}`, {
//       method: 'POST',
//       headers: {
//         'Priority': 'urgent',
//         'Title': 'claude-ping',
//         'Tags': 'bell',
//       },
//       body: 'Test notification from claude-ping! If you see this, setup is working.',
//     });
//     return response.ok;
//   } catch {
//     return false;
//   }
// }

/** Display welcome screen and collect all first-run preferences */
export async function runFirstRunSetup(): Promise<SetupResult> {
  // ── Welcome ──
  p.note(
    `${pc.bold('claude-ping')}\n` +
    `Play a sound on your laptop when Claude\n` +
    `stops and needs your attention.\n\n` +
    `Let's get you set up. (~30 seconds)`,
  );

  // ── Settings choice ──
  const settingsChoice = await p.select({
    message: 'How would you like to configure alerts?',
    options: [
      {
        value: 'recommended' as const,
        label: 'Recommended settings',
        hint: 'Volume 10, alert after 30s of no response from you',
      },
      {
        value: 'custom' as const,
        label: 'Custom — set each option yourself',
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
    p.log.success('Using recommended settings: volume 10, alert after 30s idle.');
  } else {
    // ── Custom: Idle threshold ──
    const thresholdRaw = await p.text({
      message: 'Alert after how many seconds of no response from you?',
      placeholder: '30',
      defaultValue: '30',
      validate: validateThreshold,
    });
    assertNotCancelled(thresholdRaw);

    // ── Volume ──
    const volumeRaw = await p.text({
      message: 'Sound volume (1–10)',
      placeholder: '10',
      defaultValue: '10',
      validate: validateVolume,
    });
    assertNotCancelled(volumeRaw);

    preferences = {
      idle_threshold_seconds: Number(thresholdRaw),
      sound_enabled: true,
      sound_volume: Number(volumeRaw),
      message_style: 'detailed',
    };
  }

  return { ntfyTopic: 'disabled', preferences };
}
