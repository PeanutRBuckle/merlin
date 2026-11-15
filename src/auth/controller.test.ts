import { describe, expect, it, vi } from 'vitest';
import { createAuthController } from './controller';

function fakeAuth() {
  return {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn((_callback: unknown) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  };
}

export { fakeAuth };

describe('auth controller', () => {
  it('starts Google PKCE sign-in with only basic identity scopes and the fixed app callback', async () => {
    const auth = fakeAuth();
    const controller = createAuthController(auth as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1' });
    await controller.initialize();
    await controller.signIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: {
      redirectTo: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1', scopes: 'openid email profile',
    } });
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it('restores a session once and changes the identity boundary only when the user changes', async () => {
    const auth = fakeAuth();
    const user = { id: 'synthetic-user-a', email: 'fixture@example.invalid', user_metadata: { full_name: 'Synthetic Listener' } };
    auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null } as never);
    const controller = createAuthController(auth as never);
    const changed = vi.fn();
    const unsubscribe = controller.subscribe(changed);
    await Promise.all([controller.initialize(), controller.initialize()]);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({ user, loading: false, identityVersion: 1 });
    const event = auth.onAuthStateChange.mock.calls[0][0] as unknown as (event: string, session: unknown) => void;
    event('TOKEN_REFRESHED', { user });
    expect(controller.getSnapshot().identityVersion).toBe(1);
    event('SIGNED_IN', { user: { ...user, id: 'synthetic-user-b' } });
    expect(controller.getSnapshot().identityVersion).toBe(2);
    event('SIGNED_OUT', null);
    expect(controller.getSnapshot()).toMatchObject({ user: null, identityVersion: 3 });
    unsubscribe();
  });

  it('accepts a valid getSession result even after an async INITIAL_SESSION null event', async () => {
    const auth = fakeAuth();
    const user = { id: 'synthetic-initial-user' };
    let resolveGetSession: (value: unknown) => void = () => {};
    auth.getSession.mockReturnValue(new Promise(resolve => { resolveGetSession = resolve; }) as never);
    const controller = createAuthController(auth as never);
    const pending = controller.initialize();
    const event = auth.onAuthStateChange.mock.calls[0][0] as (event: string, session: unknown) => void;
    await Promise.resolve();
    event('INITIAL_SESSION', null);
    resolveGetSession({ data: { session: { user } }, error: null });
    await pending;
    expect(controller.getSnapshot().user).toEqual(user);
    expect(controller.getSnapshot().error).toBeNull();
  });

  it('ignores a stale getSession result that resolves after a newer material SIGNED_OUT event', async () => {
    const auth = fakeAuth();
    let resolveGetSession: (value: unknown) => void = () => {};
    auth.getSession.mockReturnValue(new Promise(resolve => { resolveGetSession = resolve; }) as never);
    const controller = createAuthController(auth as never);
    const pending = controller.initialize();
    const event = auth.onAuthStateChange.mock.calls[0][0] as (event: string, session: unknown) => void;
    await Promise.resolve();
    event('SIGNED_OUT', null);
    resolveGetSession({ data: { session: { user: { id: 'synthetic-stale-user' } } }, error: null });
    await pending;
    expect(controller.getSnapshot().user).toBeNull();
  });

  it('exchanges a callback code once, scrubs auth parameters, and lands on Account instead of the hash router', async () => {
    const auth = fakeAuth();
    const user = { id: 'synthetic-callback-user' };
    auth.exchangeCodeForSession.mockResolvedValue({ data: { session: { user } }, error: null } as never);
    const replaceUrl = vi.fn();
    const controller = createAuthController(auth as never, {
      returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1',
      currentUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1&code=synthetic-code&next=https://evil.invalid', replaceUrl,
    });
    await Promise.all([controller.initialize(), controller.initialize()]);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith('synthetic-code');
    expect(replaceUrl).toHaveBeenCalledWith('/#/account');
    expect(controller.getSnapshot().user).toEqual(user);
  });

  it.each([
    '?error=access_denied&error_description=private-provider-detail',
    '?code=some-code&error_description=private-provider-detail',
    '#error=access_denied&error_description=private-provider-detail',
    '?error=access_denied&auth_callback=0',
  ])('ignores auth-looking parameters without an exact auth_callback=1 marker: %s', async suffix => {
    const auth = fakeAuth();
    const replaceUrl = vi.fn();
    const controller = createAuthController(auth as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1', currentUrl: `https://merlinmusic.linequinn42.workers.dev/${suffix}`, replaceUrl });
    await controller.initialize();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toBeNull();
    expect(replaceUrl).not.toHaveBeenCalled();
  });

  it.each([
    '?auth_callback=1&error=access_denied&error_description=private-provider-detail',
    '?auth_callback=1#error=access_denied&error_description=private-provider-detail',
    '?auth_callback=1',
    '?auth_callback=1&code=expired-code',
  ])('reports a failed or cancelled callback safely and clears its URL: %s', async suffix => {
    const auth = fakeAuth();
    auth.exchangeCodeForSession.mockRejectedValue(new Error('private-provider-detail'));
    const replaceUrl = vi.fn();
    const controller = createAuthController(auth as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1', currentUrl: `https://merlinmusic.linequinn42.workers.dev/${suffix}`, replaceUrl });
    await expect(controller.initialize()).resolves.toBeUndefined();
    expect(controller.getSnapshot()).toMatchObject({ loading: false, user: null });
    expect(controller.getSnapshot().error).toMatch(/sign-in.*(cancelled|complete|again)/i);
    expect(controller.getSnapshot().error).not.toContain('private-provider-detail');
    expect(replaceUrl).toHaveBeenCalledWith('/');
  });

  it.each(['getSession', 'signInWithOAuth'] as const)('recovers from a thrown %s error without leaking provider details', async method => {
    const auth = fakeAuth();
    auth[method].mockRejectedValue(new Error('private-provider-detail'));
    const controller = createAuthController(auth as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1' });
    await expect(controller.initialize()).resolves.toBeUndefined();
    if (method === 'signInWithOAuth') await expect(controller.signIn()).resolves.toBeUndefined();
    expect(controller.getSnapshot()).toMatchObject({ loading: false, busy: false });
    expect(controller.getSnapshot().error).toMatch(/try again/i);
    expect(controller.getSnapshot().error).not.toContain('private-provider-detail');
  });

  it('signs out this browser session and changes the identity boundary only after success', async () => {
    const auth = fakeAuth();
    const user = { id: 'synthetic-signout-user' };
    auth.getSession.mockResolvedValue({ data: { session: { user } }, error: null } as never);
    const controller = createAuthController(auth as never);
    await controller.initialize();
    auth.signOut.mockResolvedValueOnce({ error: new Error('private-detail') } as never);
    await controller.signOut();
    expect(controller.getSnapshot().user).toEqual(user);
    expect(controller.getSnapshot().error).toMatch(/could not sign out/i);
    await controller.signOut();
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expect(controller.getSnapshot()).toMatchObject({ user: null, busy: false, error: null, identityVersion: 2 });
  });

  it('ignores duplicate signIn calls while pending but allows retry after the SDK resolves', async () => {
    const auth = fakeAuth();
    let resolveSignIn: (value: unknown) => void = () => {};
    auth.signInWithOAuth.mockReturnValue(new Promise(resolve => { resolveSignIn = resolve; }) as never);
    const controller = createAuthController(auth as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1' });
    const first = controller.signIn();
    expect(controller.getSnapshot().busy).toBe(true);
    await controller.signIn();
    await controller.signIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(1);
    resolveSignIn({ data: {}, error: null });
    await first;
    expect(controller.getSnapshot().busy).toBe(false);
    await controller.signIn();
    expect(auth.signInWithOAuth).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().busy).toBe(false);
  });

  it('keeps local import available without contacting an unconfigured backend', async () => {
    const controller = createAuthController(null);
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ configured: false, loading: false, user: null, busy: false });
    await controller.signIn();
    expect(controller.getSnapshot().error).toMatch(/not configured/i);
  });
});
