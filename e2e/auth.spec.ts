import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

const project = 'https://wweydrvazpwkhmtombdx.supabase.co';
const sessionKey = 'sb-wweydrvazpwkhmtombdx-auth-token';
const configured = process.env.MERLIN_AUTH_CONFIGURED !== '0';

test('real SDK and enabled provider issue a PKCE Google redirect with only basic scopes (no login attempted)', async ({ page }) => {
  test.skip(!configured, 'Unconfigured local-only build');
  // Only the final Google navigation is intercepted. Supabase must issue the real redirect.
  const googleNavigation = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).hostname === 'accounts.google.com');
  await page.route('https://accounts.google.com/**', route => route.fulfill({ status: 200, contentType: 'text/plain', body: 'Test intercepted Google navigation; no login attempted.' }));
  await page.goto('/');
  const authorizeRequest = page.waitForRequest(request => request.url().startsWith(`${project}/auth/v1/authorize`));
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const request = await authorizeRequest;
  const authorize = new URL(request.url());
  expect(authorize.searchParams.get('provider')).toBe('google');
  expect(authorize.searchParams.get('code_challenge_method')).toBe('s256');
  const callback = new URL(authorize.searchParams.get('redirect_to')!);
  expect(callback.origin).toBe(new URL(test.info().project.use.baseURL!).origin);
  expect(callback.pathname).toBe('/');
  expect(callback.search).toBe('?auth_callback=1');
  const google = new URL((await googleNavigation).url());
  expect(google.searchParams.get('redirect_uri')).toBe(`${project}/auth/v1/callback`);
  expect(new Set(google.searchParams.get('scope')!.split(' '))).toEqual(new Set(['openid', 'email', 'profile']));
  expect((await request.response())?.status()).toBe(302);
  // Verify the SDK's actual challenge, not a mocked OAuth request.
  await page.goto('/');
  const verifier = await page.evaluate(key => localStorage.getItem(`${key}-code-verifier`), sessionKey);
  expect(verifier).not.toBeNull();
  const rawVerifier = JSON.parse(verifier!);
  expect(createHash('sha256').update(rawVerifier.split('/')[0]).digest('base64url')).toBe(authorize.searchParams.get('code_challenge'));
});

test('cancelled OAuth callback is scrubbed and local import remains usable', async ({ page }) => {
  test.skip(!configured, 'Unconfigured local-only build');
  await page.goto('/?auth_callback=1&error=access_denied&error_description=synthetic-private-detail');
  await expect(page.getByRole('alert')).toContainText(/sign-in was cancelled|could not complete/);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Try with my files' })).toBeEnabled();
  await page.getByRole('link', { name: 'Try with my files' }).click();
  await expect(page.getByRole('heading', { name: /bring your history/i })).toBeVisible();
});

test('synthetic persisted SDK session restores profile and sign-out removes it (not a real OAuth completion)', async ({ page }) => {
  test.skip(!configured, 'Unconfigured local-only build');
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', user_metadata: { full_name: 'Synthetic Browser Listener' }, app_metadata: { provider: 'google' }, created_at: '2026-01-01T00:00:00Z' };
  const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', exp: expires })).toString('base64url'), 'synthetic-test-signature'].join('.');
  // Every backend request in this scenario is intercepted: synthetic credentials never reach Supabase.
  const requests: string[] = [];
  await page.route(`${project}/**`, async route => {
    const request = route.request();
    requests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (new URL(request.url()).pathname === '/auth/v1/logout') await route.fulfill({ status: 204 });
    else await route.abort();
  });
  await page.goto('/#/account');
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: sessionKey, session: { access_token: token, refresh_token: 'synthetic-refresh-token', expires_at: expires, expires_in: 3600, token_type: 'bearer', user } });
  await page.reload();
  await expect(page.getByText('synthetic@example.invalid', { exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic Browser Listener', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Local session', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  expect(requests).toEqual(['POST /auth/v1/logout']);
  await page.reload();
  await expect(page.getByText('Local session', { exact: true })).toBeVisible();
});
