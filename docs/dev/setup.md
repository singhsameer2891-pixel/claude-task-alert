# Developer Setup — Claude Task Alert

## Prerequisites

- Node.js >= 18
- npm >= 9
- Claude Code (for testing hook integration)
- A Slack workspace (for testing webhook flow)

## Clone & Install

```bash
git clone https://github.com/singhsameer2891-pixel/claude-task-alert.git
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
# After build
node dist/index.js

# Or simulate npx
npm link && npx claude-task-alert
```

## Project Structure

```
src/
  index.ts          # CLI entry point, state detection, flow routing
  config.ts         # Config types, read/write, state detection
  setup.ts          # First-run interactive preference prompts
  slack.ts          # Manifest generation, browser handoff, webhook validation
  hook.ts           # Hook script generation (cross-platform)
  integration.ts    # Claude Code settings.json registration
  menu.ts           # Re-run management menu (preferences, test, uninstall)
```

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Tests use Vitest. Test files live in `tests/`:

| File | Covers |
|---|---|
| `config.test.ts` | Config read/write, state detection, access checks |
| `hook.test.ts` | Hook script generation, platform detection, graceful degradation |
| `slack.test.ts` | Manifest generation, Slack app URL building |
| `integration.test.ts` | Claude Code settings registration, hook dedup, install check |

## Key Dev Notes

- Hook script (`hook.sh`) is a shell script, not Node — it must be fast with zero startup overhead
- Config lives at `~/.claude-task-alert/config.json` — never in the project directory
- The Slack manifest is generated at runtime, not stored as a static file
- All prompts use `@clack/prompts` — maintain consistent UI style
- `fs` is mocked in tests — no real file system access during test runs

## Contributing

1. Check `tasks.md` for current status
2. Follow the group-by-group workflow
3. Test on macOS at minimum; Linux if possible
