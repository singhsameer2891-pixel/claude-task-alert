#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detectState, readConfig } from './config.js';
import { runFirstRunSetup } from './setup.js';
import { runSlackConnection } from './slack.js';
import { runIntegration } from './integration.js';
import { runManagementMenu } from './menu.js';

async function main() {
  p.intro(pc.bgCyan(pc.black(' Claude Task Alert ')));

  const state = await detectState();

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
      // Re-register hook: read existing config, run integration again
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

main().catch((err) => {
  console.error(pc.red('Fatal error:'), err);
  process.exit(1);
});
