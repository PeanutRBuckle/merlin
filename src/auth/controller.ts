import type { SupabaseClient, User } from '@supabase/supabase-js';

export type AuthPort = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange' | 'signInWithOAuth' | 'exchangeCodeForSession' | 'signOut'>;
export interface AuthSnapshot {
  configured: boolean;
  loading: boolean;
  busy: boolean;
  user: User | null;
  error: string | null;
  identityVersion: number;
}
export interface AuthEnvironment {
  returnUrl: string;
  currentUrl?: string;
  replaceUrl?: (url: string) => void;
}

/** Only identity/session data crosses this boundary; never imported history. */
export function createAuthController(auth: AuthPort | null, environment?: AuthEnvironment) {
  let snapshot: AuthSnapshot = { configured: !!auth, loading: false, busy: false, user: null, error: null, identityVersion: 0 };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<AuthSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };
  let initialization: Promise<void> | undefined;
  const acceptUser = (user: User | null) => update({
    user,
    identityVersion: snapshot.identityVersion + (snapshot.user?.id !== user?.id ? 1 : 0),
  });
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize: () => initialization ??= (async () => {
      if (!auth) return;
      update({ loading: true });
      // This callback is deliberately synchronous: awaiting Auth methods here can deadlock the SDK lock.
      let events = 0;
      auth.onAuthStateChange((_event, session) => { if (_event !== 'INITIAL_SESSION') events++; acceptUser(session?.user ?? null); });
      const before = events;
      const url = environment?.currentUrl ? new URL(environment.currentUrl) : null;
      const code = url?.searchParams.get('code');
      const hashParams = new URLSearchParams(url?.hash.slice(1));
      // Only URLs explicitly marked with the app's exact auth_callback=1 query marker are OAuth callbacks.
      const callback = url?.searchParams.get('auth_callback') === '1';
      let succeeded = false;
      try {
        if (callback && (!code || url?.searchParams.has('error') || hashParams.has('error'))) throw new Error('Incomplete callback');
        const { data, error } = callback && code ? await auth.exchangeCodeForSession(code) : await auth.getSession();
        if (error || (callback && !data.session)) throw new Error('Session unavailable');
        if (before === events) acceptUser(data.session?.user ?? null);
        succeeded = true;
      } catch {
        update({ error: callback ? 'Google sign-in was cancelled or could not complete. Please try again in the same browser tab.' : 'Could not restore your sign-in. Please try again.' });
      } finally {
        if (callback && url) {
          for (const key of ['code', 'auth_callback', 'error', 'error_code', 'error_description', 'next']) url.searchParams.delete(key);
          url.hash = succeeded ? '/account' : '';
          environment?.replaceUrl?.(url.pathname + url.search + url.hash);
        }
        update({ loading: false });
      }
    })(),
    signOut: async () => {
      if (!auth || snapshot.busy || snapshot.loading) return;
      update({ busy: true, error: null });
      try {
        const { error } = await auth.signOut({ scope: 'local' });
        if (error) throw error;
        acceptUser(null);
      } catch {
        update({ error: 'Could not sign out. Please try again.' });
      } finally {
        update({ busy: false });
      }
    },
    signIn: async () => {
      if (!auth || !environment) { update({ error: 'Google sign-in is not configured for this build.' }); return; }
      if (snapshot.busy || snapshot.loading) return;
      update({ busy: true, error: null });
      try {
        const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo: environment.returnUrl, scopes: 'openid email profile' } });
        if (error) { update({ error: 'Could not start Google sign-in. Please try again.' }); }
      } catch {
        update({ error: 'Could not start Google sign-in. Please try again.' });
      } finally {
        update({ busy: false });
      }
    },
  };
}
export type AuthController = ReturnType<typeof createAuthController>;
