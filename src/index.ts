#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';

async function main() {
  p.intro(pc.bgCyan(pc.black(' Claude Task Alert ')));

  p.log.info('CLI is working. Setup flow coming soon.');

  p.outro('Done.');
}

main().catch((err) => {
  console.error(pc.red('Fatal error:'), err);
  process.exit(1);
});
