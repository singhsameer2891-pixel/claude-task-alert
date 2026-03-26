#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectState, readConfig, checkConfigDirAccess } from './config.js';
import { runFirstRunSetup } from './setup.js';
import { runSlackConnection } from './slack.js';
import { checkClaudeCodeInstalled, runIntegration } from './integration.js';
import { runManagementMenu } from './menu.js';
import { showBanner } from './banner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

// ── 8.4 Global SIGINT handler — clean exit on Ctrl+C outside prompts ──
process.on('SIGINT', () => {
  p.cancel('Interrupted.');
  process.exit(0);
});

async function main() {
  console.clear();
  showBanner(getVersion());

  const state = await detectState();

  // ── 8.1 Early Claude Code detection for fresh installs ──
  if (state === 'fresh') {
    const claudeCheck = await checkClaudeCodeInstalled();
    if (!claudeCheck.installed) {
      p.log.error(claudeCheck.message);
      p.outro('Setup aborted.');
      process.exit(1);
    }
  }

  // ── 8.2 Config dir write access check ──
  if (state === 'fresh' || state === 'hook_missing') {
    const accessOk = await checkConfigDirAccess();
    if (!accessOk) {
      p.log.error(
        `Cannot write to config directory.\n` +
        `  Check permissions on ${pc.cyan('~/.claude-ping/')}`,
      );
      p.outro('Setup aborted.');
      process.exit(1);
    }
  }

  switch (state) {
    case 'fresh': {
      const result = await runFirstRunSetup();
      p.log.success(`Preferences collected for ${pc.cyan(result.channel)}`);
      p.log.info(
        `Threshold: ${result.preferences.idle_threshold_seconds}s | ` +
        `Sound: ${result.preferences.sound_enabled ? 'On' : 'Off'} | ` +
        `Style: ${result.preferences.message_style}`,
      );

      const webhookUrl = await runSlackConnection(result.channel);
      p.log.success(`Slack connected: ${pc.cyan(webhookUrl.slice(0, 50))}...`);

      await runIntegration({
        channel: result.channel,
        webhookUrl,
        preferences: result.preferences,
      });

      p.outro(pc.green('Setup complete!'));
      break;
    }

    case 'configured': {
      await runManagementMenu();
      p.outro('Done.');
      break;
    }

    case 'hook_missing': {
      const config = await readConfig();
      if (config) {
        p.log.warn('Config found but hook is missing. Re-registering...');
        await runIntegration({
          channel: config.slack.channel,
          webhookUrl: config.slack.webhook_url,
          preferences: config.preferences,
        });
        p.outro(pc.green('Hook re-registered!'));
      } else {
        p.log.error('Config file is corrupted. Please run setup again.');
        p.outro('Done.');
      }
      break;
    }
  }
}

// ── 8.5 Top-level error handler with categorization ──
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException)?.code;

  if (code === 'EACCES' || code === 'EPERM') {
    console.error(pc.red('Permission error:'), message);
    console.error('  Try running with appropriate permissions or check file ownership.');
  } else if (code === 'ENOSPC') {
    console.error(pc.red('Disk full:'), 'Not enough space to write config files.');
  } else if (message.includes('fetch') || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    console.error(pc.red('Network error:'), message);
    console.error('  Check your internet connection.');
  } else {
    console.error(pc.red('Unexpected error:'), message);
    if (process.env.DEBUG) {
      console.error(err);
    }
  }

  process.exit(1);
});
