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
      // Pause all media (YouTube/Spotify/Music) via media key, max vol, alarm, restore, resume
      const alarmPath = path.join(os.homedir(), '.claude-task-alert', 'alarm.wav');
      const mediaKeyScript = [
        'MEDIA_KEY_SCRIPT=\'',
        'import Cocoa',
        'func tap(key: UInt32, down: Bool) {',
        '  let flags: UInt64 = down ? 0xa00 : 0xb00',
        '  let d = Int((key << 16) | UInt32(flags))',
        '  if let e = NSEvent.otherEvent(with: .systemDefined, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: 0, context: nil, subtype: 8, data1: d, data2: -1), let cg = e.cgEvent { cg.post(tap: .cghidEventTap) }',
        '}',
        'tap(key: 16, down: true); tap(key: 16, down: false)',
        "'",
      ].join('\n');
      return [
        'PREV_VOL=$(osascript -e "output volume of (get volume settings)")',
        mediaKeyScript,
        'swift -e "$MEDIA_KEY_SCRIPT" 2>/dev/null',
        'sleep 0.3',
        'osascript -e "set volume output volume 100"',
        `afplay '${alarmPath}'`,
        'osascript -e "set volume output volume $PREV_VOL"',
        'swift -e "$MEDIA_KEY_SCRIPT" 2>/dev/null',
      ].join('\n');
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

/** Generate the thin hook.sh — reads stdin, writes temp file, launches worker via double-fork */
export function generateHookScript(options: HookScriptOptions): string {
  const configDir = path.join(os.homedir(), '.claude-task-alert');
  const workerPath = path.join(configDir, 'worker.sh');

  return [
    '#!/usr/bin/env bash',
    '# Claude Task Alert — stop hook (thin launcher)',
    '# Reads stdin, writes to temp file, launches worker as orphaned process, exits instantly.',
    '',
    'INPUT=$(cat)',
    'STOP_REASON=$(echo "$INPUT" | grep -o \'"stop_reason":"[^"]*"\' | head -1 | cut -d\'"\' -f4)',
    'CWD=$(echo "$INPUT" | grep -o \'"cwd":"[^"]*"\' | head -1 | cut -d\'"\' -f4)',
    '',
    'TMPFILE=$(mktemp /tmp/claude-task-alert.XXXXXX)',
    'echo "${STOP_REASON:-unknown}|${CWD:-unknown}" > "$TMPFILE"',
    '',
    '# Double-fork via perl to create a fully orphaned process',
    '# Claude Code cannot track this — it\'s in a new session with no parent link',
    'perl -e \'',
    '  use POSIX qw(setsid);',
    '  defined(my $pid = fork) or die;',
    '  exit if $pid;',
    '  setsid();',
    '  defined($pid = fork) or die;',
    '  exit if $pid;',
    '  open STDIN, "</dev/null";',
    '  open STDOUT, ">/dev/null";',
    '  open STDERR, ">/dev/null";',
    '  exec("bash", $ARGV[0], $ARGV[1]);',
    `' "${workerPath}" "$TMPFILE"`,
    '',
    'exit 0',
  ].join('\n') + '\n';
}

/** Generate the worker.sh — idle polling, sound, Slack POST */
export function generateWorkerScript(options: HookScriptOptions): string {
  const { webhookUrl, preferences, platform } = options;
  const thresholdMs = preferences.idle_threshold_seconds * 1000;

  const idleSnippet = getIdleDetectionSnippet(platform);
  const soundSnippet = preferences.sound_enabled
    ? getSoundSnippet(platform, preferences.sound_volume)
    : null;

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# Claude Task Alert — background worker',
    '# Launched by hook.sh as a fully detached process',
    '',
    'TMPFILE="$1"',
    'if [ ! -f "$TMPFILE" ]; then exit 1; fi',
    '',
    'DATA=$(cat "$TMPFILE")',
    'rm -f "$TMPFILE"',
    'STOP_REASON="${DATA%%|*}"',
    'CWD="${DATA#*|}"',
  ];

  // ── Idle detection polling ──
  if (idleSnippet) {
    lines.push(
      '',
      '# Idle detection — wait for user to go idle, then alert',
      `THRESHOLD_MS=${thresholdMs}`,
      'MAX_WAIT=300',
      'ELAPSED=0',
      '',
      'while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do',
      `  ${idleSnippet.split('\n').join('\n  ')}`,
      '  if [ -n "$IDLE_MS" ] && [ "$IDLE_MS" -ge "$THRESHOLD_MS" ] 2>/dev/null; then',
      '    break',
      '  fi',
      '  sleep 5',
      '  ELAPSED=$((ELAPSED + 5))',
      'done',
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

  // ── Sound alert ──
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
  );

  return lines.join('\n') + '\n';
}

// ── 5.5 Write Hook Script ─────────────────────────────────

/** Generate alarm.wav — sharp alternating two-tone (880Hz/1320Hz) for 3 seconds */
async function generateAlarmWav(filePath: string): Promise<void> {
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = sampleRate * duration;
  const dataSize = numSamples * 2; // 16-bit mono

  // WAV header (44 bytes)
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);       // chunk size
  header.writeUInt16LE(1, 20);        // PCM
  header.writeUInt16LE(1, 22);        // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);        // block align
  header.writeUInt16LE(16, 34);       // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // Audio data — alternating 880Hz / 1320Hz every 0.15s
  const data = Buffer.alloc(dataSize);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = Math.floor(t / 0.15) % 2 === 0 ? 880 : 1320;
    const sample = Math.round(32767 * Math.sin(2 * Math.PI * freq * t));
    data.writeInt16LE(sample, i * 2);
  }

  await fs.writeFile(filePath, Buffer.concat([header, data]));
}

/** Write hook.sh + worker.sh to ~/.claude-task-alert/ and make them executable */
export async function writeHookScript(options: HookScriptOptions): Promise<string> {
  const configDir = getConfigDir();
  const hookPath = path.join(configDir, 'hook.sh');
  const workerPath = path.join(configDir, 'worker.sh');

  await fs.mkdir(configDir, { recursive: true });

  // Generate alarm sound for macOS
  if (options.platform === 'darwin' && options.preferences.sound_enabled) {
    await generateAlarmWav(path.join(configDir, 'alarm.wav'));
  }

  await Promise.all([
    fs.writeFile(hookPath, generateHookScript(options), { encoding: 'utf-8', mode: 0o755 }),
    fs.writeFile(workerPath, generateWorkerScript(options), { encoding: 'utf-8', mode: 0o755 }),
  ]);

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
