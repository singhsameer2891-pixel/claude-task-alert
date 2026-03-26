import { describe, it, expect } from 'vitest';
import { generateManifest, buildSlackAppUrl } from '../src/slack.js';

describe('slack', () => {
  describe('generateManifest', () => {
    it('returns valid JSON with required fields', () => {
      const raw = generateManifest();
      const manifest = JSON.parse(raw);

      expect(manifest.display_information.name).toBe('Claude Task Alert');
      expect(manifest.features.bot_user.display_name).toBe('Claude Alert');
      expect(manifest.oauth_config.scopes.bot).toContain('incoming-webhook');
      expect(manifest.settings.org_deploy_enabled).toBe(false);
    });

    it('includes correct background color', () => {
      const manifest = JSON.parse(generateManifest());
      expect(manifest.display_information.background_color).toBe('#D97757');
    });
  });

  describe('buildSlackAppUrl', () => {
    it('returns a valid Slack app creation URL with encoded manifest', () => {
      const url = buildSlackAppUrl();

      expect(url).toContain('https://api.slack.com/apps?new_app=1&manifest_json=');
      // Should be URL-encoded JSON
      const params = new URL(url).searchParams;
      const manifestJson = params.get('manifest_json');
      expect(manifestJson).not.toBeNull();

      const manifest = JSON.parse(manifestJson!);
      expect(manifest.display_information.name).toBe('Claude Task Alert');
    });
  });
});
