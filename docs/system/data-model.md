# Data Model — Claude Task Alert

> No database. All state is file-based. This doc covers the file-based data model.

---

## Entity Relationship

```mermaid
erDiagram
    CONFIG ||--|| SLACK_CONFIG : contains
    CONFIG ||--|| PREFERENCES : contains
    CONFIG ||--|| HOOK_STATE : contains
    HOOK_SCRIPT ||--o| CONFIG : "reads webhook from"
    CLAUDE_CODE_SETTINGS ||--o| HOOK_SCRIPT : "triggers"

    CONFIG {
        string version
        string installed_at
        string updated_at
    }

    SLACK_CONFIG {
        string webhook_url
        string channel
        string app_name
    }

    PREFERENCES {
        number idle_threshold_seconds
        boolean sound_enabled
        number sound_volume
        string message_style
    }

    HOOK_STATE {
        boolean registered
        string hook_path
    }

    HOOK_SCRIPT {
        string path
        string stop_reason_map
        string idle_command
        string sound_command
    }

    CLAUDE_CODE_SETTINGS {
        json hooks
    }
```

---

## File Locations

| File | Path | Owner | Purpose |
|---|---|---|---|
| Config | `~/.claude-task-alert/config.json` | CLI | All user preferences + connection state |
| Hook script | `~/.claude-task-alert/hook.sh` | CLI (generated) | Executed by Claude Code on stop events |
| Claude Code settings | Platform-dependent `settings.json` | Claude Code | Hook registration |

---

## Config Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Fresh: No config.json
    Fresh --> Configured: Setup complete
    Configured --> Configured: Update preferences
    Configured --> Configured: Change webhook
    Configured --> HookMissing: Hook file deleted externally
    HookMissing --> Configured: Re-register hook
    Configured --> [*]: Uninstall
```
