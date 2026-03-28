import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// ── Types ──────────────────────────────────────────────

export type MessageStyle = 'minimal' | 'detailed';

// Slack config — currently unused, kept for future re-enablement
// export interface SlackConfig {
//   webhook_url: string;
//   channel: string;
//   app_name: string;
// }

export interface NtfyConfig {
  topic: string;
}

export interface Preferences {
  idle_threshold_seconds: number;
  sound_enabled: boolean;
  sound_volume: number;
  message_style: MessageStyle;
}

export interface HookConfig {
  registered: boolean;
  hook_path: string;
}

export interface Config {
  version: string;
  installed_at: string;
  updated_at: string;
  enabled: boolean;
  ntfy: NtfyConfig;
  preferences: Preferences;
  hook: HookConfig;
}

export type AppState = 'fresh' | 'configured' | 'hook_missing';

// ── Paths ──────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.claude-ping');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

// ── Read ───────────────────────────────────────────────

export async function readConfig(): Promise<Config | null> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as Config;
  } catch {
    return null;
  }
}

// ── Write ──────────────────────────────────────────────

export async function writeConfig(config: Config): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ── 8.2 Write Access Check ────────────────────────────

/** Check if we can write to the config directory (create it or write a temp file) */
export async function checkConfigDirAccess(): Promise<boolean> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const testFile = path.join(CONFIG_DIR, '.write-test');
    await fs.writeFile(testFile, '', 'utf-8');
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

// ── State Detection ────────────────────────────────────

export async function detectState(): Promise<AppState> {
  const config = await readConfig();

  if (!config) {
    return 'fresh';
  }

  if (config.hook?.registered && config.hook?.hook_path) {
    try {
      await fs.access(config.hook.hook_path);
      return 'configured';
    } catch {
      return 'hook_missing';
    }
  }

  return 'hook_missing';
}
