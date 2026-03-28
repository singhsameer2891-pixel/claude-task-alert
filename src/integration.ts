import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  type Config,
  type Preferences,
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

// ── 8.1 Claude Code Installation Check ───────────────────

interface ClaudeCodeCheck {
  installed: boolean;
  message: string;
}

/** Check if Claude Code appears to be installed (checks for ~/.claude dir) */
export async function checkClaudeCodeInstalled(): Promise<ClaudeCodeCheck> {
  const settingsPath = getClaudeSettingsPath();
  const claudeDir = path.dirname(settingsPath);

  try {
    await fs.access(claudeDir);
    return { installed: true, message: '' };
  } catch {
    return {
      installed: false,
      message:
        "Claude Code doesn't appear to be installed.\n" +
        '  The hook needs Claude Code to work.\n' +
        '  Install it first: https://claude.ai/code',
    };
  }
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
  ntfyTopic: string;
  preferences: Preferences;
  hookPath: string;
}

/** Build and write the final config.json with all settings */
export async function writeFinalConfig(options: FinalConfigOptions): Promise<Config> {
  const now = new Date().toISOString();

  const config: Config = {
    version: '3.0.0',
    installed_at: now,
    updated_at: now,
    enabled: true,
    ntfy: {
      topic: options.ntfyTopic,
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

/** Display the success screen */
export function displaySuccessScreen(config: Config): void {
  const { preferences } = config;

  p.note(
    `${pc.bold(pc.green('All set!'))}\n\n` +
    `  Threshold:   ${preferences.idle_threshold_seconds} seconds idle\n` +
    `  Volume:      ${preferences.sound_volume}/10\n\n` +
    `  Your laptop will play a sound whenever\n` +
    `  Claude stops and needs your attention.\n\n` +
    `  Run ${pc.cyan('npx claude-ping')} again to\n` +
    `  update settings or uninstall.`,
    'claude-ping',
  );
}

// ── Full Integration Flow ─────────────────────────────────

interface IntegrationOptions {
  ntfyTopic: string;
  preferences: Preferences;
}

/** Run the complete integration: hook script → Claude Code registration → config → success */
export async function runIntegration(options: IntegrationOptions): Promise<void> {
  const { ntfyTopic, preferences } = options;
  const platform = detectPlatform();

  // Check platform capabilities and display notes
  const capabilities = checkPlatformCapabilities(platform, preferences.sound_enabled);
  for (const note of capabilities.notes) {
    p.log.warn(pc.yellow(note));
  }

  // Write hook.sh
  const spinner = p.spinner();
  spinner.start('Writing hook script...');
  const hookPath = await writeHookScript({ ntfyTopic, preferences, platform });
  spinner.stop(`Hook script written to ${pc.cyan(hookPath)}`);

  // Register in Claude Code settings.json
  spinner.start('Registering hook in Claude Code...');

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
  const config = await writeFinalConfig({ ntfyTopic, preferences, hookPath });

  // Display success screen
  displaySuccessScreen(config);
}
