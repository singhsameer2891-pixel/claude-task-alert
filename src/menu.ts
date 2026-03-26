import * as p from '@clack/prompts';
import pc from 'picocolors';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type Config,
  type Preferences,
  type MessageStyle,
  readConfig,
  writeConfig,
  getConfigDir,
} from './config.js';
import { runSlackConnection } from './slack.js';
import {
  getClaudeSettingsPath,
  readClaudeSettings,
  writeFinalConfig,
} from './integration.js';
import { detectPlatform, writeHookScript, checkPlatformCapabilities } from './hook.js';

/** Check if user cancelled a prompt */
function assertNotCancelled(value: unknown): asserts value is Exclude<typeof value, symbol> {
  if (p.isCancel(value)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }
}

// ── 7.1 Config Summary Screen ────────────────────────────

function displayConfigSummary(config: Config): void {
  const { slack, preferences, hook } = config;

  p.note(
    `${pc.bold('Current Configuration')}\n\n` +
    `  Channel:    ${pc.cyan(slack.channel)}\n` +
    `  Webhook:    ${pc.dim(slack.webhook_url.slice(0, 45))}...\n` +
    `  Threshold:  ${preferences.idle_threshold_seconds} seconds\n` +
    `  Sound:      ${preferences.sound_enabled ? `On (volume ${preferences.sound_volume})` : 'Off'}\n` +
    `  Style:      ${preferences.message_style}\n` +
    `  Hook:       ${hook.registered ? pc.green('Active') : pc.red('Missing')}\n` +
    `  Installed:  ${config.installed_at.split('T')[0]}`,
    'claude-ping',
  );
}

// ── 7.2 Update Preferences ──────────────────────────────

async function updatePreferences(config: Config): Promise<void> {
  p.log.step(pc.bold('Update Preferences'));

  const thresholdRaw = await p.text({
    message: 'Idle threshold (seconds)',
    placeholder: String(config.preferences.idle_threshold_seconds),
    defaultValue: String(config.preferences.idle_threshold_seconds),
    validate(value) {
      const num = Number((value ?? '').trim());
      if (isNaN(num) || !Number.isInteger(num) || num < 1) return 'Must be a positive whole number.';
      if (num > 3600) return 'Max is 3600 seconds.';
      return undefined;
    },
  });
  assertNotCancelled(thresholdRaw);

  const soundEnabled = await p.confirm({
    message: 'Enable sound alerts?',
    initialValue: config.preferences.sound_enabled,
  });
  assertNotCancelled(soundEnabled);

  let soundVolume = config.preferences.sound_volume;
  if (soundEnabled) {
    const volRaw = await p.text({
      message: 'Sound volume (1–10)',
      placeholder: String(config.preferences.sound_volume),
      defaultValue: String(config.preferences.sound_volume),
      validate(value) {
        const num = Number((value ?? '').trim());
        if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 10) return 'Must be 1–10.';
        return undefined;
      },
    });
    assertNotCancelled(volRaw);
    soundVolume = Number(volRaw);
  }

  const messageStyle = await p.select({
    message: 'Message style?',
    options: [
      { value: 'minimal' as const, label: 'Minimal — "Claude needs input"' },
      { value: 'detailed' as const, label: 'Detailed — "Claude needs input | Dir: ~/project | Reason: end_turn"' },
    ],
    initialValue: config.preferences.message_style,
  });
  assertNotCancelled(messageStyle);

  const newPreferences: Preferences = {
    idle_threshold_seconds: Number(thresholdRaw),
    sound_enabled: soundEnabled as boolean,
    sound_volume: soundVolume,
    message_style: messageStyle as MessageStyle,
  };

  // Regenerate hook script with new preferences
  const platform = detectPlatform();
  const capabilities = checkPlatformCapabilities(platform, newPreferences.sound_enabled);
  for (const note of capabilities.notes) {
    p.log.warn(pc.yellow(note));
  }

  const spinner = p.spinner();
  spinner.start('Updating hook script...');
  const hookPath = await writeHookScript({
    webhookUrl: config.slack.webhook_url,
    preferences: newPreferences,
    platform,
  });
  spinner.stop('Hook script updated.');

  // Update config
  const updatedConfig: Config = {
    ...config,
    preferences: newPreferences,
    updated_at: new Date().toISOString(),
    hook: { registered: true, hook_path: hookPath },
  };
  await writeConfig(updatedConfig);

  p.log.success('Preferences updated.');
}

// ── 7.3 Change Slack Channel / Webhook ──────────────────

async function changeSlack(config: Config): Promise<void> {
  p.log.step(pc.bold('Change Slack Channel / Webhook'));

  const channel = await p.text({
    message: 'New Slack channel?',
    placeholder: config.slack.channel,
    defaultValue: config.slack.channel,
    validate(value) {
      const trimmed = (value ?? '').trim();
      if (!trimmed) return 'Channel name is required.';
      if (!trimmed.startsWith('#')) return 'Must start with #.';
      if (trimmed.length < 2) return 'Must have at least one character after #.';
      return undefined;
    },
  });
  assertNotCancelled(channel);

  const webhookUrl = await runSlackConnection((channel as string).trim());

  // Regenerate hook script with new webhook
  const platform = detectPlatform();
  const spinner = p.spinner();
  spinner.start('Updating hook script...');
  const hookPath = await writeHookScript({
    webhookUrl,
    preferences: config.preferences,
    platform,
  });
  spinner.stop('Hook script updated.');

  // Update config
  const updatedConfig: Config = {
    ...config,
    slack: {
      ...config.slack,
      channel: (channel as string).trim(),
      webhook_url: webhookUrl,
    },
    updated_at: new Date().toISOString(),
    hook: { registered: true, hook_path: hookPath },
  };
  await writeConfig(updatedConfig);

  p.log.success(`Slack updated — alerts now go to ${pc.cyan((channel as string).trim())}`);
}

// ── 7.4 Test Alert ──────────────────────────────────────

async function testAlert(config: Config): Promise<void> {
  const spinner = p.spinner();
  spinner.start('Sending test alert...');

  try {
    const response = await fetch(config.slack.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `:test_tube: *Test alert from claude-ping*\nChannel: ${config.slack.channel} | Style: ${config.preferences.message_style}`,
      }),
    });

    if (response.ok) {
      spinner.stop('Test alert sent — check your Slack channel!');
    } else {
      spinner.stop(pc.red('Webhook returned an error.'));
      p.log.error(`HTTP ${response.status}. Your webhook may have been revoked. Run "Change Slack" to reconnect.`);
    }
  } catch {
    spinner.stop(pc.red('Could not reach Slack.'));
    p.log.error('Network error. Check your connection and webhook URL.');
  }

  // Play sound if enabled
  if (config.preferences.sound_enabled) {
    const platform = detectPlatform();
    const { exec } = await import('node:child_process');
    const volume = config.preferences.sound_volume / 10;

    let cmd: string | null = null;
    switch (platform) {
      case 'darwin':
        cmd = `afplay /System/Library/Sounds/Glass.aiff -v ${volume.toFixed(1)}`;
        break;
      case 'linux':
      case 'wsl':
        cmd = 'paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || aplay -q /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null';
        break;
      case 'win32':
        cmd = 'powershell.exe -NoProfile -Command "[System.Media.SoundPlayer]::new(\'C:\\Windows\\Media\\notify.wav\').PlaySync()"';
        break;
    }

    if (cmd) {
      exec(cmd, () => { /* fire and forget */ });
    }
  }
}

// ── 7.5 Uninstall ───────────────────────────────────────

async function uninstall(config: Config): Promise<boolean> {
  const confirm = await p.confirm({
    message: 'This will remove the hook and delete all config. Continue?',
    initialValue: false,
  });
  assertNotCancelled(confirm);

  if (!confirm) {
    p.log.info('Uninstall cancelled.');
    return false;
  }

  const spinner = p.spinner();

  // Remove hook from Claude Code settings.json
  spinner.start('Removing hook from Claude Code...');
  try {
    const settingsPath = getClaudeSettingsPath();
    const raw = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);

    if (settings.hooks?.Stop && Array.isArray(settings.hooks.Stop)) {
      settings.hooks.Stop = settings.hooks.Stop.filter(
        (entry: { hooks?: Array<{ command?: string }> }) =>
          !entry.hooks?.some((h) => h.command === config.hook.hook_path),
      );

      // Clean up empty Stop array
      if (settings.hooks.Stop.length === 0) {
        delete settings.hooks.Stop;
      }
      // Clean up empty hooks object
      if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }

      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
    }
    spinner.stop('Hook removed from Claude Code settings.');
  } catch {
    spinner.stop(pc.yellow('Could not update Claude Code settings (may already be clean).'));
  }

  // Delete ~/.claude-ping/
  spinner.start('Deleting config directory...');
  try {
    const configDir = getConfigDir();
    await fs.rm(configDir, { recursive: true, force: true });
    spinner.stop(`Deleted ${pc.dim(configDir)}`);
  } catch {
    spinner.stop(pc.yellow('Could not delete config directory.'));
  }

  p.log.success('claude-ping has been uninstalled.');
  return true;
}

// ── Main Menu ───────────────────────────────────────────

export async function runManagementMenu(): Promise<void> {
  const config = await readConfig();
  if (!config) {
    p.log.error('Config file is missing or corrupted. Run setup again.');
    return;
  }

  // 7.1 — Show config summary
  displayConfigSummary(config);

  // Menu loop — return to menu after each action (except exit/uninstall)
  while (true) {
    const action = await p.select({
      message: 'What would you like to do?',
      options: [
        { value: 'preferences', label: 'Update preferences (threshold, sound, style)' },
        { value: 'slack', label: 'Change Slack channel / webhook' },
        { value: 'test', label: 'Test alert (send a test notification)' },
        { value: 'uninstall', label: pc.red('Uninstall (remove hook + config)') },
        { value: 'exit', label: 'Exit' },
      ],
    });
    assertNotCancelled(action);

    switch (action) {
      case 'preferences':
        await updatePreferences(config);
        // Re-read config to reflect changes in summary
        const updatedConfig = await readConfig();
        if (updatedConfig) displayConfigSummary(updatedConfig);
        break;

      case 'slack':
        await changeSlack(config);
        const slackUpdated = await readConfig();
        if (slackUpdated) displayConfigSummary(slackUpdated);
        break;

      case 'test':
        await testAlert(config);
        break;

      case 'uninstall': {
        const removed = await uninstall(config);
        if (removed) return;
        break;
      }

      case 'exit':
        return;
    }
  }
}
