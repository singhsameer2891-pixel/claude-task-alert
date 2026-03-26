# Architecture — Claude Task Alert

> Living document. Updated with every structural change.

---

## System Diagram

```mermaid
flowchart LR
    subgraph CLI["npx claude-task-alert"]
        A[Entry Point] --> B{Detect State}
        B -->|Fresh| C[Setup Flow]
        B -->|Configured| D[Management Menu]
        C --> E[Preferences Prompts]
        E --> F[Slack Browser Handoff]
        F --> G[Webhook Validation]
        G --> H[Hook Generator]
        H --> I[Claude Code Integration]
        I --> J[Write Config]
    end

    subgraph Slack["Slack"]
        K[App Manifest Page]
        L[Webhook Endpoint]
    end

    subgraph ClaudeCode["Claude Code"]
        M[settings.json]
        N[Stop Hook Event]
    end

    subgraph UserSystem["~/.claude-task-alert/"]
        O[config.json]
        P[hook.sh]
    end

    F -->|Opens browser| K
    G -->|Test POST| L
    I -->|Registers hook| M
    N -->|Triggers| P
    P -->|POST| L
    J --> O
    H --> P
```

---

## Component Responsibilities

| Component | File | Role |
|---|---|---|
| Entry point | `src/index.ts` | CLI bin entry, state detection, flow routing, SIGINT handler, top-level error handler |
| Config manager | `src/config.ts` | Config type definitions, read/write `config.json`, `detectState()`, write-access check |
| Setup flow | `src/setup.ts` | First-run interactive prompts (channel, threshold, sound, style). Returns `SetupResult` |
| Slack connector | `src/slack.ts` | Manifest generation, browser handoff, webhook paste + validation, test POST with retry loop |
| Hook generator | `src/hook.ts` | OS/platform detection, idle/sound command resolution, `hook.sh` template generation + writer |
| Claude Code integration | `src/integration.ts` | settings.json read/write, hook registration/dedup, final config write, success screen |
| Management menu | `src/menu.ts` | Re-run menu: update prefs, change Slack, test alert, uninstall |

---

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant CLI as CLI (npx)
    participant B as Browser
    participant S as Slack
    participant CC as Claude Code
    participant H as hook.sh

    U->>CLI: npx claude-task-alert
    CLI->>CLI: detectState()
    alt Fresh install
        CLI->>U: Preferences prompts
        U->>CLI: Channel, threshold, sound, style
        CLI->>B: Open Slack manifest URL
        B->>S: Create app + install
        U->>CLI: Paste webhook URL
        CLI->>S: Test POST
        S-->>CLI: 200 OK
        CLI->>CLI: Generate hook.sh
        CLI->>CC: Register hook in settings.json
        CLI->>CLI: Write config.json
        CLI->>U: Success screen
    else Already configured
        CLI->>U: Management menu
    end

    Note over CC,H: Later, during Claude Code session...
    CC->>H: Stop event (stdin JSON)
    H->>H: Check idle time
    H->>H: Play sound (if enabled)
    H->>S: POST alert message
    S->>U: Slack notification
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Manifest-based Slack app (Option C) | No backend infra, user owns app, minimal friction, zero cost |
| `incoming-webhook` scope only | Minimal permissions — write-only, no message reading |
| Config in `~/.claude-task-alert/` | Consistent location, survives project switches, easy to find/delete |
| Shell script for hook (not Node) | Hooks must be fast + lightweight — no Node startup overhead on every Claude stop |
| Graceful degradation for sound/idle | Core value is Slack alerts; sound/idle are nice-to-haves per platform |

---

*Last updated: 2026-03-26*
