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
  const { preferences, hook } = config;

  p.note(
    `${pc.bold('Current Configuration')}\n\n` +
    `  Threshold:   ${preferences.idle_threshold_seconds} seconds\n` +
    `  Volume:      ${preferences.sound_volume}/10\n` +
    `  Hook:        ${hook.registered ? pc.green('Active') : pc.red('Missing')}\n` +
    `  Installed:   ${config.installed_at.split('T')[0]}`,
    'claude-ping',
  );
}

// ── 7.2 Update Preferences ──────────────────────────────

async function updatePreferences(config: Config): Promise<Config> {
  const prefs = { ...config.preferences };
  let changed = false;

  while (true) {
    const setting = await p.select({
      message: 'Which setting to update?',
      options: [
        { value: 'threshold', label: `Idle threshold — currently ${pc.cyan(String(prefs.idle_threshold_seconds) + 's')}` },
        { value: 'sound', label: `Sound alerts — currently ${pc.cyan(prefs.sound_enabled ? `On (volume ${prefs.sound_volume})` : 'Off')}` },
        { value: 'style', label: `Message style — currently ${pc.cyan(prefs.message_style)}` },
        { value: 'done', label: changed ? pc.green('Save & exit') : 'Back (no changes)' },
      ],
    });
    assertNotCancelled(setting);

    if (setting === 'done') break;

    if (setting === 'threshold') {
      const val = await p.text({
        message: 'Idle threshold (seconds)',
        placeholder: String(prefs.idle_threshold_seconds),
        defaultValue: String(prefs.idle_threshold_seconds),
        validate(value) {
          const num = Number((value ?? '').trim());
          if (isNaN(num) || !Number.isInteger(num) || num < 1) return 'Must be a positive whole number.';
          if (num > 3600) return 'Max is 3600 seconds.';
          return undefined;
        },
      });
      assertNotCancelled(val);
      prefs.idle_threshold_seconds = Number(val);
      changed = true;
      p.log.success(`Threshold set to ${pc.cyan(String(val) + 's')}`);
    }

    if (setting === 'sound') {
      const enabled = await p.confirm({
        message: 'Enable sound alerts?',
        initialValue: prefs.sound_enabled,
      });
      assertNotCancelled(enabled);
      prefs.sound_enabled = enabled as boolean;

      if (enabled) {
        const vol = await p.text({
          message: 'Sound volume (1–10)',
          placeholder: String(prefs.sound_volume),
          defaultValue: String(prefs.sound_volume),
          validate(value) {
            const num = Number((value ?? '').trim());
            if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 10) return 'Must be 1–10.';
            return undefined;
          },
        });
        assertNotCancelled(vol);
        prefs.sound_volume = Number(vol);
      }
      changed = true;
      p.log.success(`Sound ${prefs.sound_enabled ? `on (volume ${prefs.sound_volume})` : 'off'}`);
    }

    if (setting === 'style') {
      const style = await p.select({
        message: 'Message style?',
        options: [
          { value: 'minimal' as const, label: 'Minimal — "Claude needs input"' },
          { value: 'detailed' as const, label: 'Detailed — "Claude needs input | Dir: ~/project | Reason: end_turn"' },
        ],
        initialValue: prefs.message_style,
      });
      assertNotCancelled(style);
      prefs.message_style = style as MessageStyle;
      changed = true;
      p.log.success(`Style set to ${pc.cyan(prefs.message_style)}`);
    }
  }

  if (!changed) return config;

  const newPreferences: Preferences = prefs;

  // Regenerate hook script with new preferences
  const platform = detectPlatform();
  const capabilities = checkPlatformCapabilities(platform, newPreferences.sound_enabled);
  for (const note of capabilities.notes) {
    p.log.warn(pc.yellow(note));
  }

  const spinner = p.spinner();
  spinner.start('Updating hook script...');
  const hookPath = await writeHookScript({
    ntfyTopic: config.ntfy.topic,
    preferences: newPreferences,
    platform,
  });
  spinner.stop('Hook script updated.');

  const updatedConfig: Config = {
    ...config,
    preferences: newPreferences,
    updated_at: new Date().toISOString(),
    hook: { registered: true, hook_path: hookPath },
  };
  await writeConfig(updatedConfig);

  p.log.success('Preferences saved.');
  return updatedConfig;
}

// ── 7.3 Change ntfy Topic — commented out, sound-only mode ──

// async function changeNtfyTopic(config: Config): Promise<void> {
//   p.log.step(pc.bold('Change ntfy topic'));
//   const topicRaw = await p.text({
//     message: 'New ntfy topic name?',
//     placeholder: config.ntfy.topic,
//     defaultValue: config.ntfy.topic,
//     validate(value) {
//       const trimmed = (value ?? '').trim();
//       if (!trimmed) return 'Topic name is required.';
//       if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return 'Only letters, numbers, hyphens, and underscores.';
//       if (trimmed.length < 3) return 'Must be at least 3 characters.';
//       return undefined;
//     },
//   });
//   assertNotCancelled(topicRaw);
//   const ntfyTopic = (topicRaw as string).trim();
//   const platform = detectPlatform();
//   const spinner = p.spinner();
//   spinner.start('Updating hook script...');
//   const hookPath = await writeHookScript({
//     ntfyTopic,
//     preferences: config.preferences,
//     platform,
//   });
//   spinner.stop('Hook script updated.');
//   const updatedConfig: Config = {
//     ...config,
//     ntfy: { topic: ntfyTopic },
//     updated_at: new Date().toISOString(),
//     hook: { registered: true, hook_path: hookPath },
//   };
//   await writeConfig(updatedConfig);
//   p.log.success(`ntfy topic changed to ${pc.cyan(ntfyTopic)}`);
// }

// ── 7.4 Test Alert ──────────────────────────────────────

async function testAlert(config: Config): Promise<void> {
  // Play sound alert
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
    p.log.success('Test sound played!');
  } else {
    p.log.warn('Sound not supported on this platform.');
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
  let config = await readConfig();
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
        { value: 'preferences', label: 'Update preferences (threshold, volume)' },
        { value: 'test', label: 'Test sound' },
        { value: 'uninstall', label: pc.red('Uninstall (remove hook + config)') },
        { value: 'exit', label: 'Exit' },
      ],
    });
    assertNotCancelled(action);

    switch (action) {
      case 'preferences': {
        config = await updatePreferences(config);
        displayConfigSummary(config);
        break;
      }

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
