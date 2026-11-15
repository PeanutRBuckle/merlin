import { describe, expect, it, vi } from 'vitest';
import { createBrowserAuth } from './browser';
import { createClient } from '@supabase/supabase-js';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: {} })) }));
const origin = 'https://merlinmusic.linequinn42.workers.dev';
const config = { url: 'https://wweydrvazpwkhmtombdx.supabase.co', key: 'sb_publishable_synthetic_fixture_not_real' };

describe('browser auth configuration', () => {
  it.each([
    { url: '', key: '' },
    { ...config, key: 'sb_secret_DO_NOT_USE_IN_BROWSER' },
    { ...config, url: 'https://attacker.invalid' },
  ])('fails closed for missing or unsafe configuration', value => {
    expect(createBrowserAuth(value, new URL(origin)).getSnapshot().configured).toBe(false);
  });

  it('uses PKCE with manual callback exchange and separate SDK session persistence', () => {
    createBrowserAuth(config, new URL(origin));
    expect(createClient).toHaveBeenCalledWith(config.url, config.key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
  });

  it('does not enable OAuth at an unapproved app origin', () => {
    expect(createBrowserAuth(config, new URL('https://unapproved.invalid')).getSnapshot().configured).toBe(false);
  });
});
