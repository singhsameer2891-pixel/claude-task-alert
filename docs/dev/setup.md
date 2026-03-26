# Developer Setup — Claude Task Alert

## Prerequisites

- Node.js >= 18
- npm >= 9
- Claude Code (for testing hook integration)
- A Slack workspace (for testing webhook flow)

## Clone & Install

```bash
git clone <repo-url>
cd claude-task-alert
npm install
```

## Build

```bash
npm run build
```

Compiles TypeScript from `src/` to `dist/`. Output is ESModules.

## Run Locally

```bash
# Run directly via ts-node / tsx
npx tsx src/index.ts

# Or after build
node dist/index.js

# Or simulate npx
npm link && npx claude-task-alert
```

## Project Structure

```
src/
  index.ts          # CLI entry point, state detection, flow routing
  config.ts         # Config read/write/validate
  setup.ts          # First-run setup orchestration
  preferences.ts    # Interactive preference prompts
  slack.ts          # Manifest generation, browser open, webhook validation
  hook.ts           # Hook script generation (cross-platform)
  claude-code.ts    # Claude Code settings.json integration
  manage.ts         # Re-run management menu
  os.ts             # Platform detection, idle/sound utilities
```

## Testing

```bash
npm test
```

Tests use Vitest. Mock the filesystem and HTTP calls for webhook testing.

## Key Dev Notes

- Hook script (`hook.sh`) is a shell script, not Node — it must be fast with zero startup overhead
- Config lives at `~/.claude-task-alert/config.json` — never in the project directory
- The Slack manifest is generated at runtime, not stored as a static file
- All prompts use `@clack/prompts` — maintain consistent UI style

## Contributing

1. Check `tasks.md` for current status
2. Follow the group-by-group workflow
3. Test on macOS at minimum; Linux if possible
