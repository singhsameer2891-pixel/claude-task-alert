import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

vi.mock('node:fs/promises');

const CONFIG_DIR = path.join(os.homedir(), '.claude-ping');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

describe('config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readConfig', () => {
    it('returns parsed config when file exists', async () => {
      const { readConfig } = await import('../src/config.js');
      const mockConfig = {
        version: '1.0.0',
        installed_at: '2026-03-26T00:00:00.000Z',
        updated_at: '2026-03-26T00:00:00.000Z',
        slack: {
          webhook_url: 'https://hooks.slack.com/services/T/B/x',
          channel: '#test',
          app_name: 'claude-ping',
        },
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        hook: { registered: true, hook_path: path.join(CONFIG_DIR, 'hook.sh') },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readConfig();
      expect(result).toEqual(mockConfig);
      expect(fs.readFile).toHaveBeenCalledWith(CONFIG_FILE, 'utf-8');
    });

    it('returns null when file does not exist', async () => {
      const { readConfig } = await import('../src/config.js');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await readConfig();
      expect(result).toBeNull();
    });
  });

  describe('writeConfig', () => {
    it('creates directory and writes config JSON', async () => {
      const { writeConfig } = await import('../src/config.js');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = {
        version: '1.0.0',
        installed_at: '2026-03-26T00:00:00.000Z',
        updated_at: '2026-03-26T00:00:00.000Z',
        slack: {
          webhook_url: 'https://hooks.slack.com/services/T/B/x',
          channel: '#test',
          app_name: 'claude-ping',
        },
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed' as const,
        },
        hook: { registered: true, hook_path: path.join(CONFIG_DIR, 'hook.sh') },
      };

      await writeConfig(config);
      expect(fs.mkdir).toHaveBeenCalledWith(CONFIG_DIR, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        CONFIG_FILE,
        JSON.stringify(config, null, 2) + '\n',
        'utf-8',
      );
    });
  });

  describe('checkConfigDirAccess', () => {
    it('returns true when directory is writable', async () => {
      const { checkConfigDirAccess } = await import('../src/config.js');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const result = await checkConfigDirAccess();
      expect(result).toBe(true);
    });

    it('returns false when directory is not writable', async () => {
      const { checkConfigDirAccess } = await import('../src/config.js');
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('EACCES'));

      const result = await checkConfigDirAccess();
      expect(result).toBe(false);
    });
  });

  describe('detectState', () => {
    it('returns fresh when no config exists', async () => {
      const { detectState } = await import('../src/config.js');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));

      const state = await detectState();
      expect(state).toBe('fresh');
    });

    it('returns configured when config and hook file exist', async () => {
      const { detectState } = await import('../src/config.js');
      const hookPath = path.join(CONFIG_DIR, 'hook.sh');
      const mockConfig = {
        version: '1.0.0',
        installed_at: '2026-03-26T00:00:00.000Z',
        updated_at: '2026-03-26T00:00:00.000Z',
        slack: {
          webhook_url: 'https://hooks.slack.com/services/T/B/x',
          channel: '#test',
          app_name: 'claude-ping',
        },
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        hook: { registered: true, hook_path: hookPath },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const state = await detectState();
      expect(state).toBe('configured');
    });

    it('returns hook_missing when config exists but hook file is gone', async () => {
      const { detectState } = await import('../src/config.js');
      const hookPath = path.join(CONFIG_DIR, 'hook.sh');
      const mockConfig = {
        version: '1.0.0',
        installed_at: '2026-03-26T00:00:00.000Z',
        updated_at: '2026-03-26T00:00:00.000Z',
        slack: {
          webhook_url: 'https://hooks.slack.com/services/T/B/x',
          channel: '#test',
          app_name: 'claude-ping',
        },
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        hook: { registered: true, hook_path: hookPath },
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockConfig));
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const state = await detectState();
      expect(state).toBe('hook_missing');
    });
  });
});
