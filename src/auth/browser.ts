import { createClient } from '@supabase/supabase-js';
import { createAuthController, type AuthController } from './controller';

const AUTH_ORIGINS = new Set([
  'https://merlinmusic.linequinn42.workers.dev',
  'http://127.0.0.1:5180',
  'http://127.0.0.1:4180',
  'http://127.0.0.1:8788',
]);

export function createBrowserAuth(config: { url?: string; key?: string }, location: URL): AuthController {
  // New integrations use only publishable keys. Never pass an admin/legacy JWT to the browser SDK.
  if (!config.url || !/^https:\/\/[a-z]{20}\.supabase\.co$/.test(config.url) ||
      !config.key?.startsWith('sb_publishable_') || !AUTH_ORIGINS.has(location.origin)) {
    return createAuthController(null);
  }
  try {
    const client = createClient(config.url, config.key, {
      auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
    });
    return createAuthController(client.auth, {
      returnUrl: `${location.origin}/?auth_callback=1`,
      currentUrl: location.href,
      replaceUrl: url => {
        window.history.replaceState(null, '', url);
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      },
    });
  } catch {
    return createAuthController(null);
  }
}

let browserAuth: AuthController | undefined;
export function getBrowserAuth(): AuthController {
  return browserAuth ??= createBrowserAuth({
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }, new URL(window.location.href));
}
