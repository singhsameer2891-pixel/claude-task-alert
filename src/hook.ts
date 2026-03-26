import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { type Preferences, getConfigDir } from './config.js';

// ── 5.1 OS Detection ─────────────────────────────────────

export type Platform = 'darwin' | 'linux' | 'win32' | 'wsl';

/** Detect OS platform, distinguishing WSL from native Linux */
export function detectPlatform(): Platform {
  const platform = os.platform();

  if (platform === 'darwin') return 'darwin';
  if (platform === 'win32') return 'win32';

  // Linux — check if running under WSL
  if (platform === 'linux') {
    try {
      const release = os.release().toLowerCase();
      if (release.includes('microsoft') || release.includes('wsl')) {
        return 'wsl';
      }
    } catch {
      // Fall through to linux
    }
    return 'linux';
  }

  return 'linux'; // Fallback
}

// ── 5.2 Idle Detection Commands ───────────────────────────

/** Get the bash snippet for reading system idle time in milliseconds */
function getIdleDetectionSnippet(platform: Platform): string | null {
  switch (platform) {
    case 'darwin':
      return `IDLE_MS=$(ioreg -c IOHIDSystem | awk '/HIDIdleTime/ {print int($NF/1000000); exit}')`;

    case 'linux':
    case 'wsl':
      return [
        'if command -v xprintidle &>/dev/null; then',
        '  IDLE_MS=$(xprintidle)',
        'else',
        '  IDLE_MS=999999999',
        'fi',
      ].join('\n');

    case 'win32':
      return [
        'IDLE_MS=$(powershell.exe -NoProfile -Command "Add-Type @\'',
        'using System; using System.Runtime.InteropServices;',
        'public class IdleTime {',
        '  [DllImport(\"user32.dll\")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);',
        '  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
        '  public static int Get() {',
        '    var info = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO)) };',
        '    GetLastInputInfo(ref info);',
        '    return (int)(Environment.TickCount - info.dwTime);',
        '  }',
        '}',
        '\'@ ; [IdleTime]::Get()" 2>/dev/null || echo 999999999)',
      ].join('\n');

    default:
      return null;
  }
}

// ── 5.3 Sound Playback Commands ───────────────────────────

/** Get the bash snippet for playing an alert sound */
function getSoundSnippet(platform: Platform, volume: number): string | null {
  // Normalize volume from 1-10 scale to platform-specific range
  const volumePct = volume / 10;

  switch (platform) {
    case 'darwin': {
      // afplay volume: 0.0–1.0
      const afVol = volumePct.toFixed(1);
      return `afplay /System/Library/Sounds/Glass.aiff -v ${afVol} &`;
    }

    case 'linux':
    case 'wsl': {
      // paplay uses percentage (0–100) via environment, aplay has no volume control
      const paVol = Math.round(volumePct * 65536);
      return [
        'if command -v paplay &>/dev/null; then',
        `  PULSE_PROP="media.role=event" paplay --volume=${paVol} /usr/share/sounds/freedesktop/stereo/complete.oga &`,
        'elif command -v aplay &>/dev/null; then',
        '  aplay -q /usr/share/sounds/freedesktop/stereo/complete.oga &',
        'fi',
      ].join('\n');
    }

    case 'win32': {
      return `powershell.exe -NoProfile -Command "[System.Media.SoundPlayer]::new('C:\\Windows\\Media\\notify.wav').PlaySync()" &`;
    }

    default:
      return null;
  }
}

// ── 5.4 Stop Reason Mapping ──────────────────────────────

function getStopReasonMapping(style: 'minimal' | 'detailed'): string {
  if (style === 'minimal') {
    return [
      'case "$STOP_REASON" in',
      '  end_turn)         MSG="Claude is waiting for your input" ;;',
      '  max_tokens)       MSG="Claude hit token limit" ;;',
      '  tool_error)       MSG="Claude hit an error" ;;',
      '  permission_denied) MSG="Claude needs permission" ;;',
      '  *)                MSG="Claude stopped ($STOP_REASON)" ;;',
      'esac',
      'EMOJI=":robot_face:"',
    ].join('\n');
  }

  return [
    'case "$STOP_REASON" in',
    '  end_turn)',
    '    MSG="Claude is waiting for your input"',
    '    EMOJI=":speech_balloon:" ;;',
    '  max_tokens)',
    '    MSG="Claude hit token limit — needs you to continue"',
    '    EMOJI=":warning:" ;;',
    '  tool_error)',
    '    MSG="Claude hit an error — needs your attention"',
    '    EMOJI=":x:" ;;',
    '  permission_denied)',
    '    MSG="Claude needs permission to proceed"',
    '    EMOJI=":lock:" ;;',
    '  *)',
    '    MSG="Claude session stopped (reason: $STOP_REASON)"',
    '    EMOJI=":robot_face:" ;;',
    'esac',
  ].join('\n');
}

function getSlackPayload(style: 'minimal' | 'detailed'): string {
  if (style === 'minimal') {
    return `PAYLOAD="{\\"text\\":\\"$EMOJI $MSG\\"}"`;
  }

  return `PAYLOAD="{\\"text\\":\\"$EMOJI *$MSG*\\\\nDir: \`$CWD\`\\\\nReason: \\\\\`$STOP_REASON\\\\\`\\"}"`;
}

// ── 5.4 Hook Script Template ─────────────────────────────

interface HookScriptOptions {
  webhookUrl: string;
  preferences: Preferences;
  platform: Platform;
}

/** Generate the full hook.sh script content */
export function generateHookScript(options: HookScriptOptions): string {
  const { webhookUrl, preferences, platform } = options;
  const thresholdMs = preferences.idle_threshold_seconds * 1000;

  const idleSnippet = getIdleDetectionSnippet(platform);
  const soundSnippet = preferences.sound_enabled
    ? getSoundSnippet(platform, preferences.sound_volume)
    : null;

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# Claude Task Alert — stop hook',
    '# Auto-generated by claude-task-alert. Do not edit manually.',
    '',
    '# Read stop event JSON from stdin',
    'INPUT=$(cat)',
    '',
    '# Parse stop reason and working directory',
    'STOP_REASON=$(echo "$INPUT" | grep -o \'"stop_reason":"[^"]*"\' | head -1 | cut -d\'"\' -f4)',
    'CWD=$(echo "$INPUT" | grep -o \'"cwd":"[^"]*"\' | head -1 | cut -d\'"\' -f4)',
    '',
    'if [ -z "$STOP_REASON" ]; then',
    '  STOP_REASON="unknown"',
    'fi',
    'if [ -z "$CWD" ]; then',
    '  CWD="unknown"',
    'fi',
  ];

  // ── 5.2 Idle detection block (with 5.6 graceful degradation) ──
  if (idleSnippet) {
    lines.push(
      '',
      '# Idle detection',
      idleSnippet,
      `THRESHOLD_MS=${thresholdMs}`,
      '',
      'if [ -n "$IDLE_MS" ] && [ "$IDLE_MS" -lt "$THRESHOLD_MS" ] 2>/dev/null; then',
      '  # User is active — skip alert',
      '  exit 0',
      'fi',
    );
  } else {
    lines.push(
      '',
      '# Idle detection not available on this platform — always alert',
    );
  }

  // ── Stop reason → message mapping ──
  lines.push(
    '',
    '# Map stop reason to message',
    getStopReasonMapping(preferences.message_style),
  );

  // ── 5.3 Sound alert (with 5.6 graceful degradation) ──
  if (soundSnippet) {
    lines.push(
      '',
      '# Sound alert',
      soundSnippet,
    );
  }

  // ── Slack POST ──
  lines.push(
    '',
    '# Send Slack notification',
    getSlackPayload(preferences.message_style),
    '',
    `curl -s -o /dev/null -X POST -H 'Content-type: application/json' \\`,
    `  --data "$PAYLOAD" \\`,
    `  '${webhookUrl}'`,
    '',
    'exit 0',
  );

  return lines.join('\n') + '\n';
}

// ── 5.5 Write Hook Script ─────────────────────────────────

/** Write hook.sh to ~/.claude-task-alert/hook.sh and make it executable */
export async function writeHookScript(options: HookScriptOptions): Promise<string> {
  const configDir = getConfigDir();
  const hookPath = path.join(configDir, 'hook.sh');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(hookPath, generateHookScript(options), { encoding: 'utf-8', mode: 0o755 });

  return hookPath;
}

// ── 5.6 Graceful Degradation Info ─────────────────────────

export interface PlatformCapabilities {
  idleDetection: boolean;
  soundAlert: boolean;
  notes: string[];
}

/** Check what features are supported on the current platform */
export function checkPlatformCapabilities(platform: Platform, soundEnabled: boolean): PlatformCapabilities {
  const notes: string[] = [];
  const idleDetection = getIdleDetectionSnippet(platform) !== null;
  const soundAlert = soundEnabled && getSoundSnippet(platform, 5) !== null;

  if (!idleDetection) {
    notes.push('Idle detection not available on this system. Alerts will fire every time Claude stops.');
  }

  if (soundEnabled && !soundAlert) {
    notes.push('Sound alerts not available on this system. Slack alerts will still work.');
  }

  if (platform === 'linux' || platform === 'wsl') {
    if (idleDetection) {
      notes.push('Idle detection requires xprintidle. Install it if alerts fire too often.');
    }
  }

  return { idleDetection, soundAlert, notes };
}
