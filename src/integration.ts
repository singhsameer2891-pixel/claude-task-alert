import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  type Config,
  type Preferences,
  type SlackConfig,
  writeConfig,
  getConfigDir,
} from './config.js';
import { writeHookScript, detectPlatform, checkPlatformCapabilities } from './hook.js';

// ── 6.1 Claude Code Settings Path ─────────────────────────

/** Resolve Claude Code settings.json path per platform */
export function getClaudeSettingsPath(): string {
  const platform = os.platform();

  if (platform === 'darwin' || platform === 'linux') {
    return path.join(os.homedir(), '.claude', 'settings.json');
  }

  if (platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'claude', 'settings.json');
  }

  // Fallback (WSL etc.)
  return path.join(os.homedir(), '.claude', 'settings.json');
}

// ── 6.2 Read Settings ─────────────────────────────────────

interface ClaudeSettings {
  [key: string]: unknown;
  hooks?: {
    Stop?: Array<{
      hooks: Array<{
        type: string;
        command: string;
        timeout?: number;
      }>;
    }>;
    [key: string]: unknown;
  };
}

/** Read Claude Code settings.json, returns null if not found */
export async function readClaudeSettings(): Promise<ClaudeSettings | null> {
  const settingsPath = getClaudeSettingsPath();
  try {
    const raw = await fs.readFile(settingsPath, 'utf-8');
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    return null;
  }
}

// ── 6.3 Check Hook Registration ───────────────────────────

/** Check if our hook is already registered (by command path match) */
export function isHookRegistered(settings: ClaudeSettings, hookPath: string): boolean {
  const stopHooks = settings.hooks?.Stop;
  if (!Array.isArray(stopHooks)) return false;

  return stopHooks.some((entry) =>
    entry.hooks?.some((h) => h.command === hookPath),
  );
}

// ── 6.4 + 6.5 + 6.6 Register Hook ────────────────────────

interface RegisterResult {
  action: 'registered' | 'already_registered' | 'created_new';
  settingsPath: string;
}

/** Register the stop hook in Claude Code settings.json */
export async function registerHook(hookPath: string): Promise<RegisterResult> {
  const settingsPath = getClaudeSettingsPath();
  let settings = await readClaudeSettings();

  // 6.6 — settings.json doesn't exist: create with just the hook entry
  if (!settings) {
    settings = {};
  }

  // 6.3 — Already registered: skip
  if (isHookRegistered(settings, hookPath)) {
    return { action: 'already_registered', settingsPath };
  }

  // Ensure hooks.Stop exists
  if (!settings.hooks) {
    settings.hooks = {};
  }
  if (!Array.isArray(settings.hooks.Stop)) {
    settings.hooks.Stop = [];
  }

  // 6.4 — Add our hook entry
  settings.hooks.Stop.push({
    hooks: [
      {
        type: 'command',
        command: hookPath,
        timeout: 10,
      },
    ],
  });

  // Write back
  const settingsDir = path.dirname(settingsPath);
  await fs.mkdir(settingsDir, { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

  const action = settings.hooks.Stop.length === 1 ? 'created_new' : 'registered';
  return { action, settingsPath };
}

// ── 6.7 Write Final Config ────────────────────────────────

interface FinalConfigOptions {
  channel: string;
  webhookUrl: string;
  preferences: Preferences;
  hookPath: string;
}

/** Build and write the final config.json with all settings */
export async function writeFinalConfig(options: FinalConfigOptions): Promise<Config> {
  const now = new Date().toISOString();

  const config: Config = {
    version: '1.0.0',
    installed_at: now,
    updated_at: now,
    slack: {
      webhook_url: options.webhookUrl,
      channel: options.channel,
      app_name: 'Claude Task Alert',
    },
    preferences: options.preferences,
    hook: {
      registered: true,
      hook_path: options.hookPath,
    },
  };

  await writeConfig(config);
  return config;
}

// ── 6.8 Success Screen ────────────────────────────────────

/** Display the PRD §10.4 success screen */
export function displaySuccessScreen(config: Config): void {
  const { slack, preferences } = config;

  p.note(
    `${pc.bold(pc.green('All set!'))}\n\n` +
    `  Channel:    ${pc.cyan(slack.channel)}\n` +
    `  Threshold:  ${preferences.idle_threshold_seconds} seconds idle\n` +
    `  Sound:      ${preferences.sound_enabled ? 'Enabled' : 'Disabled'}\n` +
    `  Style:      ${preferences.message_style === 'detailed' ? 'Detailed' : 'Minimal'}\n\n` +
    `  A test message was sent to your channel.\n` +
    `  You'll get Slack alerts whenever Claude\n` +
    `  stops and needs your attention.\n\n` +
    `  Run ${pc.cyan('npx claude-task-alert')} again to\n` +
    `  update settings or uninstall.`,
    'Claude Task Alert',
  );
}

// ── Full Integration Flow ─────────────────────────────────

interface IntegrationOptions {
  channel: string;
  webhookUrl: string;
  preferences: Preferences;
}

/** Run the complete integration: hook script → Claude Code registration → config → success */
export async function runIntegration(options: IntegrationOptions): Promise<void> {
  const { channel, webhookUrl, preferences } = options;
  const platform = detectPlatform();

  // Check platform capabilities and display notes
  const capabilities = checkPlatformCapabilities(platform, preferences.sound_enabled);
  for (const note of capabilities.notes) {
    p.log.warn(pc.yellow(note));
  }

  // Write hook.sh
  const spinner = p.spinner();
  spinner.start('Writing hook script...');
  const hookPath = await writeHookScript({ webhookUrl, preferences, platform });
  spinner.stop(`Hook script written to ${pc.cyan(hookPath)}`);

  // Register in Claude Code settings.json
  spinner.start('Registering hook in Claude Code...');

  const settingsPath = getClaudeSettingsPath();
  let settingsExist: boolean;
  try {
    await fs.access(settingsPath);
    settingsExist = true;
  } catch {
    settingsExist = false;
  }

  if (!settingsExist) {
    // Check if Claude Code dir exists at all
    const claudeDir = path.dirname(settingsPath);
    try {
      await fs.access(claudeDir);
    } catch {
      spinner.stop(pc.red('Claude Code not found.'));
      p.log.error(
        "Claude Code doesn't seem to be installed.\n" +
        `  Install it first: ${pc.cyan('https://claude.ai/code')}`,
      );
      process.exit(1);
    }
  }

  const result = await registerHook(hookPath);

  switch (result.action) {
    case 'already_registered':
      spinner.stop('Hook already configured — no changes needed.');
      break;
    case 'created_new':
      spinner.stop(`Hook registered in ${pc.cyan(result.settingsPath)}`);
      break;
    case 'registered':
      spinner.stop(`Hook added to existing config at ${pc.cyan(result.settingsPath)}`);
      break;
  }

  // Write final config.json
  const config = await writeFinalConfig({ channel, webhookUrl, preferences, hookPath });

  // Display success screen
  displaySuccessScreen(config);
}
