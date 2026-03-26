import { describe, it, expect } from 'vitest';
import {
  generateHookScript,
  checkPlatformCapabilities,
  detectPlatform,
} from '../src/hook.js';

describe('hook', () => {
  describe('detectPlatform', () => {
    it('returns a valid platform string', () => {
      const platform = detectPlatform();
      expect(['darwin', 'linux', 'win32', 'wsl']).toContain(platform);
    });
  });

  describe('generateHookScript', () => {
    it('generates valid bash script with all sections for darwin', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T123/B456/abc',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        platform: 'darwin',
      });

      expect(script).toContain('#!/usr/bin/env bash');
      expect(script).toContain('STOP_REASON=');
      expect(script).toContain('ioreg');
      expect(script).toContain('THRESHOLD_MS=30000');
      expect(script).toContain('afplay');
      expect(script).toContain('hooks.slack.com/services/T123/B456/abc');
      expect(script).toContain('exit 0');
    });

    it('generates script without sound when disabled', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T123/B456/abc',
        preferences: {
          idle_threshold_seconds: 60,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'darwin',
      });

      expect(script).toContain('ioreg');
      expect(script).not.toContain('afplay');
      expect(script).toContain('MSG="Claude is waiting for your input"');
    });

    it('generates minimal message style correctly', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'darwin',
      });

      expect(script).toContain('EMOJI=":robot_face:"');
    });

    it('generates detailed message style with per-reason emojis', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'detailed',
        },
        platform: 'darwin',
      });

      expect(script).toContain(':speech_balloon:');
      expect(script).toContain(':warning:');
      expect(script).toContain(':lock:');
    });

    it('uses paplay/aplay on Linux', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 7,
          message_style: 'detailed',
        },
        platform: 'linux',
      });

      expect(script).toContain('xprintidle');
      expect(script).toContain('paplay');
      expect(script).toContain('aplay');
      expect(script).not.toContain('ioreg');
      expect(script).not.toContain('afplay');
    });

    it('uses powershell on win32', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        platform: 'win32',
      });

      expect(script).toContain('powershell.exe');
      expect(script).toContain('GetLastInputInfo');
      expect(script).toContain('SoundPlayer');
    });

    it('calculates correct threshold in milliseconds', () => {
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 120,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'darwin',
      });

      expect(script).toContain('THRESHOLD_MS=120000');
    });

    it('skips idle detection section for unsupported platforms gracefully', () => {
      // WSL uses same idle as linux
      const script = generateHookScript({
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'wsl',
      });

      expect(script).toContain('xprintidle');
    });
  });

  describe('checkPlatformCapabilities', () => {
    it('reports full capabilities on darwin', () => {
      const caps = checkPlatformCapabilities('darwin', true);
      expect(caps.idleDetection).toBe(true);
      expect(caps.soundAlert).toBe(true);
    });

    it('reports xprintidle note on linux', () => {
      const caps = checkPlatformCapabilities('linux', true);
      expect(caps.idleDetection).toBe(true);
      expect(caps.notes.some((n) => n.includes('xprintidle'))).toBe(true);
    });

    it('reports no sound when sound disabled', () => {
      const caps = checkPlatformCapabilities('darwin', false);
      expect(caps.soundAlert).toBe(false);
    });

    it('reports capabilities for win32', () => {
      const caps = checkPlatformCapabilities('win32', true);
      expect(caps.idleDetection).toBe(true);
      expect(caps.soundAlert).toBe(true);
    });
  });
});
