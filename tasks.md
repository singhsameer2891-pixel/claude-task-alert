# tasks.md — Claude Task Alert
> Generated: 2026-03-26 | PRD ref: PRD.md
> Status legend: ⏳ PENDING | 🔄 IN PROGRESS | ✅ DONE | ❌ BLOCKED

---

## GROUP 1: Project Scaffolding & CLI Framework
**Depends on:** None
**Summary:** Initialize npm package, configure TypeScript, set up bin entry point, install core dependencies.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 1.1 | `npm init` with package.json (name: `claude-task-alert`, bin entry, type: module) | ✅ | |
| 1.2 | tsconfig.json for ESModules + Node 18 target | ✅ | |
| 1.3 | Install deps: `@clack/prompts`, `picocolors`, `open` | ✅ | |
| 1.4 | Create `src/index.ts` as CLI entry point with bin shebang | ✅ | |
| 1.5 | Verify `npx .` runs the CLI locally | ✅ | |

---

## GROUP 2: Config & State Management
**Depends on:** GROUP 1
**Summary:** Build config read/write/validate utilities and first-run vs re-run detection logic.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 2.1 | Define `Config` TypeScript interface matching PRD §7 schema | ✅ | |
| 2.2 | Implement `readConfig()` — reads `~/.claude-task-alert/config.json`, returns null if missing | ✅ | |
| 2.3 | Implement `writeConfig(config)` — creates dir if needed, writes JSON | ✅ | |
| 2.4 | Implement `detectState()` — returns `fresh` / `configured` / `hook_missing` | ✅ | |

---

## GROUP 3: Interactive CLI — First-Run Flow
**Depends on:** GROUP 2
**Summary:** Build the interactive setup prompts: welcome screen, preferences (channel, threshold, sound, style), input validation with re-prompt.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 3.1 | Welcome screen using `@clack/prompts` intro | ✅ | p.note with branded welcome |
| 3.2 | Channel name prompt with validation (non-empty, starts with `#`) | ✅ | Re-prompts on invalid |
| 3.3 | Idle threshold prompt (number input, default 30) | ✅ | Validates 1–3600 |
| 3.4 | Sound enable/disable toggle + volume prompt (if enabled) | ✅ | Volume 1–10, skipped if sound off |
| 3.5 | Message style select (minimal / detailed) | ✅ | @clack/prompts select |
| 3.6 | Collect all preferences into a `Preferences` object, pass to next step | ✅ | SetupResult type returned |

---

## GROUP 4: Slack Manifest & Browser Handoff ✅
**Depends on:** GROUP 3
**Summary:** Generate Slack app manifest, open browser for app creation, handle webhook paste + validation + test POST.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 4.1 | Implement `generateManifest()` — returns JSON string per PRD §5 | ✅ | src/slack.ts |
| 4.2 | Build Slack app creation URL with manifest query param | ✅ | `buildSlackAppUrl()` with encodeURIComponent |
| 4.3 | Open browser using `open` package, fallback to printing URL manually | ✅ | try/catch with manual URL fallback |
| 4.4 | Display step-by-step instructions in CLI (PRD §10.3) while waiting | ✅ | p.note with 8-step guide |
| 4.5 | Webhook URL paste prompt with format validation (`https://hooks.slack.com/services/...`) | ✅ | Regex validation |
| 4.6 | Test webhook POST — send "Connected!" message, verify 200 response | ✅ | fetch POST with spinner |
| 4.7 | On failure: clear error message + re-prompt (loop until valid or user cancels) | ✅ | while(true) loop with retry confirm |

---

## GROUP 5: Hook Script Generation ✅
**Depends on:** GROUP 4
**Summary:** Generate the cross-platform hook shell script with OS detection, idle check, sound alert, and Slack POST.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 5.1 | Implement OS detection utility (`darwin` / `linux` / `win32` / `wsl`) | ✅ | `detectPlatform()` in src/hook.ts |
| 5.2 | Generate idle detection command per OS (ioreg / xprintidle / powershell) | ✅ | `getIdleDetectionSnippet()` — ioreg/xprintidle/powershell |
| 5.3 | Generate sound playback command per OS (afplay / paplay / powershell SoundPlayer) | ✅ | `getSoundSnippet()` — afplay/paplay/aplay/powershell |
| 5.4 | Generate hook.sh template with: stdin JSON parse, idle check, sound, Slack POST, stop reason mapping | ✅ | `generateHookScript()` with full template |
| 5.5 | Write hook.sh to `~/.claude-task-alert/hook.sh`, chmod +x | ✅ | `writeHookScript()` with mode 0o755 |
| 5.6 | Graceful degradation: skip sound/idle sections if OS doesn't support, log one-time note | ✅ | `checkPlatformCapabilities()` returns notes |

---

## GROUP 6: Claude Code Integration ✅
**Depends on:** GROUP 5
**Summary:** Register the hook in Claude Code's settings.json, detect existing hooks, avoid duplicates.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 6.1 | Locate Claude Code settings.json path (platform-aware) | ✅ | `getClaudeSettingsPath()` in src/integration.ts |
| 6.2 | Read existing settings.json, parse hooks section | ✅ | `readClaudeSettings()` with typed interface |
| 6.3 | Check if our hook is already registered (by command path match) | ✅ | `isHookRegistered()` checks Stop hooks by command path |
| 6.4 | If not registered: add stop hook entry per PRD §8, write back | ✅ | `registerHook()` appends to Stop array |
| 6.5 | If already registered: skip, log "Hook already configured" | ✅ | Returns `already_registered` action |
| 6.6 | Handle missing settings.json: create with just the hook entry | ✅ | Creates dir + file if missing, checks Claude Code install |
| 6.7 | Write final config.json with all preferences + webhook + hook status | ✅ | `writeFinalConfig()` builds full Config object |
| 6.8 | Display success screen (PRD §10.4) | ✅ | `displaySuccessScreen()` per PRD spec |

---

## GROUP 7: Re-Run Management Menu ✅
**Depends on:** GROUP 6
**Summary:** Build the "already configured" menu with update preferences, change webhook, test alert, and uninstall flows.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 7.1 | "Already configured" screen showing current config summary (PRD §10.5) | ✅ | displayConfigSummary() in src/menu.ts |
| 7.2 | "Update preferences" flow — re-prompt threshold, sound, style, write to config | ✅ | Regenerates hook.sh with new prefs |
| 7.3 | "Change Slack channel / webhook" flow — re-run browser handoff (GROUP 4 logic) | ✅ | Reuses runSlackConnection() |
| 7.4 | "Test alert" action — fire a test Slack notification + sound | ✅ | POST + platform sound via child_process |
| 7.5 | "Uninstall" action — remove hook from settings.json, delete `~/.claude-task-alert/`, confirm | ✅ | Cleans up settings.json + rm config dir |
| 7.6 | "Exit" action — clean exit | ✅ | Returns from menu loop |

---

## GROUP 8: Error Handling & Edge Cases ✅
**Depends on:** GROUP 7
**Summary:** Implement all error scenarios from PRD §11 and edge case detection.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 8.1 | Claude Code not installed detection (no settings.json path resolvable) | ✅ | `checkClaudeCodeInstalled()` in integration.ts, early check in index.ts |
| 8.2 | No write access to `~/.claude-task-alert/` — permission error messaging | ✅ | `checkConfigDirAccess()` in config.ts, checked before setup/re-register |
| 8.3 | Slack workspace restriction detection (webhook test returns auth error) | ✅ | `WebhookTestResult` with error classification: auth/not_found/server/network |
| 8.4 | Ctrl+C / cancel handling at every prompt — clean exit, no partial state | ✅ | All prompts covered via `assertNotCancelled()` + global SIGINT handler in index.ts |
| 8.5 | Audit all flows for uncaught exceptions — wrap CLI entry in top-level try/catch | ✅ | Categorized error handler: EACCES/EPERM, ENOSPC, network, unknown + DEBUG mode |

---

## GROUP 9: Cross-Platform Testing & Polish
**Depends on:** GROUP 8
**Summary:** Validate on macOS/Linux/Windows, end-to-end test flows, write README and docs.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 9.1 | End-to-end test: fresh install flow (mock webhook) | ⏳ | |
| 9.2 | End-to-end test: re-run management menu | ⏳ | |
| 9.3 | End-to-end test: uninstall flow | ⏳ | |
| 9.4 | Verify graceful degradation on Linux (no afplay, no ioreg) | ⏳ | |
| 9.5 | README.md — what it is, install, usage, configuration, uninstall | ⏳ | |
| 9.6 | docs/user/guide.md — end-user setup walkthrough with screenshots placeholders | ⏳ | |
| 9.7 | docs/dev/setup.md — clone, install, build, test, contribute | ⏳ | |

---

## GROUP 10: Publish
**Depends on:** GROUP 9
**Summary:** Prepare for npm publish — metadata, license, architecture doc, final validation.

| ID | Task | Status | Notes |
|----|------|--------|-------|
| 10.1 | package.json: description, keywords, repository, author, license fields | ⏳ | |
| 10.2 | Add LICENSE file (MIT) | ⏳ | |
| 10.3 | architecture.md — system diagram (Mermaid), component map, data flow | ⏳ | |
| 10.4 | docs/system/api-spec.md — config schema, hook JSON format, manifest spec | ⏳ | |
| 10.5 | `npm pack` dry run — verify included files, no secrets | ⏳ | |
| 10.6 | Final `npx .` smoke test on clean machine / fresh dir | ⏳ | |
