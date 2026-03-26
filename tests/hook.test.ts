import { describe, it, expect } from 'vitest';
import {
  generateHookScript,
  generateWorkerScript,
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
    it('generates thin launcher with perl double-fork', () => {
      const script = generateHookScript({
        ntfyTopic: 'claude-ping-test123',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 10,
          message_style: 'detailed',
        },
        platform: 'darwin',
      });

      expect(script).toContain('#!/usr/bin/env bash');
      expect(script).toContain('STOP_REASON=');
      expect(script).toContain('TMPFILE=$(mktemp');
      expect(script).toContain('perl -e');
      expect(script).toContain('setsid');
      expect(script).toContain('worker.sh');
      expect(script).toContain('exit 0');
    });
  });

  describe('generateWorkerScript', () => {
    it('generates valid bash script with all sections for darwin', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 10,
          message_style: 'detailed',
        },
        platform: 'darwin',
      });

      expect(script).toContain('#!/usr/bin/env bash');
      expect(script).toContain('STOP_REASON=');
      expect(script).toContain('ioreg');
      expect(script).toContain('THRESHOLD_MS=30000');
      expect(script).toContain('afplay');
      expect(script).toContain('ntfy.sh/claude-ping-test123');
    });

    it('generates script without sound when disabled', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
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
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'darwin',
      });

      expect(script).toContain('MSG="Claude stopped ($STOP_REASON)"');
      expect(script).toContain('ntfy.sh/claude-ping-test123');
    });

    it('generates detailed message style with DETAIL field', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'detailed',
        },
        platform: 'darwin',
      });

      expect(script).toContain('DETAIL=');
      expect(script).toContain('$MSG — $DETAIL');
    });

    it('uses paplay/aplay on Linux', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
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
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
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
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
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

    it('uses xprintidle on WSL', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'claude-ping-test123',
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

    it('includes ntfy headers in POST', () => {
      const script = generateWorkerScript({
        ntfyTopic: 'my-topic',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: false,
          sound_volume: 5,
          message_style: 'minimal',
        },
        platform: 'darwin',
      });

      expect(script).toContain('Priority: urgent');
      expect(script).toContain('Title: claude-ping');
      expect(script).toContain('Tags: bell');
      expect(script).toContain('ntfy.sh/my-topic');
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
