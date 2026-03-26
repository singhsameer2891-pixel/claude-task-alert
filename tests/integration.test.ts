import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';

vi.mock('node:fs/promises');

describe('integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClaudeSettingsPath', () => {
    it('returns a path ending in .claude/settings.json', async () => {
      const { getClaudeSettingsPath } = await import('../src/integration.js');
      const result = getClaudeSettingsPath();
      expect(result).toMatch(/\.claude[/\\]settings\.json$/);
    });
  });

  describe('isHookRegistered', () => {
    it('returns false when no hooks section exists', async () => {
      const { isHookRegistered } = await import('../src/integration.js');
      expect(isHookRegistered({}, '/path/hook.sh')).toBe(false);
    });

    it('returns false when Stop hooks exist but none match', async () => {
      const { isHookRegistered } = await import('../src/integration.js');
      const settings = {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: '/other/hook.sh' }] }],
        },
      };
      expect(isHookRegistered(settings, '/path/hook.sh')).toBe(false);
    });

    it('returns true when matching hook is found', async () => {
      const { isHookRegistered } = await import('../src/integration.js');
      const hookPath = '/home/user/.claude-ping/hook.sh';
      const settings = {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: hookPath }] }],
        },
      };
      expect(isHookRegistered(settings, hookPath)).toBe(true);
    });
  });

  describe('registerHook', () => {
    it('creates new settings file when none exists', async () => {
      const { registerHook } = await import('../src/integration.js');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const hookPath = '/home/user/.claude-ping/hook.sh';
      const result = await registerHook(hookPath);

      expect(result.action).toBe('created_new');
      expect(fs.writeFile).toHaveBeenCalled();

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.hooks.Stop).toHaveLength(1);
      expect(written.hooks.Stop[0].hooks[0].command).toBe(hookPath);
    });

    it('appends to existing settings with other hooks', async () => {
      const { registerHook } = await import('../src/integration.js');
      const existingSettings = {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: '/other/hook.sh' }] }],
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const hookPath = '/home/user/.claude-ping/hook.sh';
      const result = await registerHook(hookPath);

      expect(result.action).toBe('registered');
      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const written = JSON.parse(writeCall[1] as string);
      expect(written.hooks.Stop).toHaveLength(2);
    });

    it('skips registration when hook already exists', async () => {
      const { registerHook } = await import('../src/integration.js');
      const hookPath = '/home/user/.claude-ping/hook.sh';
      const existingSettings = {
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: hookPath }] }],
        },
      };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingSettings));

      const result = await registerHook(hookPath);
      expect(result.action).toBe('already_registered');
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('writeFinalConfig', () => {
    it('writes complete config with all fields', async () => {
      const { writeFinalConfig } = await import('../src/integration.js');
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const config = await writeFinalConfig({
        channel: '#test',
        webhookUrl: 'https://hooks.slack.com/services/T/B/x',
        preferences: {
          idle_threshold_seconds: 30,
          sound_enabled: true,
          sound_volume: 5,
          message_style: 'detailed',
        },
        hookPath: '/home/user/.claude-ping/hook.sh',
      });

      expect(config.version).toBe('1.0.0');
      expect(config.slack.channel).toBe('#test');
      expect(config.hook.registered).toBe(true);
      expect(config.installed_at).toBeTruthy();
    });
  });

  describe('checkClaudeCodeInstalled', () => {
    it('returns installed when .claude dir exists', async () => {
      const { checkClaudeCodeInstalled } = await import('../src/integration.js');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await checkClaudeCodeInstalled();
      expect(result.installed).toBe(true);
    });

    it('returns not installed when .claude dir missing', async () => {
      const { checkClaudeCodeInstalled } = await import('../src/integration.js');
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await checkClaudeCodeInstalled();
      expect(result.installed).toBe(false);
      expect(result.message).toContain('Claude Code');
    });
  });
});
