#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { detectState } from './config.js';
import { runFirstRunSetup } from './setup.js';
import { runSlackConnection } from './slack.js';

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

      // Hook registration handled in GROUP 5+6
      p.outro('Slack connected! Hook setup coming next.');
      break;
    }

    case 'configured': {
      // Re-run management menu (GROUP 7)
      p.log.info('Already configured. Management menu coming soon.');
      p.outro('Done.');
      break;
    }

    case 'hook_missing': {
      // Re-register hook flow (GROUP 6)
      p.log.warn('Config found but hook is missing. Re-registration coming soon.');
      p.outro('Done.');
      break;
    }
  }
}

main().catch((err) => {
  console.error(pc.red('Fatal error:'), err);
  process.exit(1);
});
