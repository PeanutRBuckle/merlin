import { StrictMode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { App } from '../App';
import { createAuthController } from './controller';
import { importHistory } from '../import/history';
vi.mock('../import/history', () => ({ importHistory: vi.fn() }));
const imported = { data: { format: 'merlin-history', version: 1, tracks: [], events: [], meta: { artistNames: [], eventArtists: [], first: 0, last: 0, eventMs: 0 } }, files: [{ name: 'synthetic.json', status: 'accepted', size: 2, records: 0 }] };
async function bindFixture() {
  vi.mocked(importHistory).mockResolvedValue(imported as never);
  const user = userEvent.setup();
  await user.upload(document.querySelector('input[type=file]') as HTMLInputElement, new File(['[]'], 'synthetic.json', { type: 'application/json' }));
  await user.click(screen.getByRole('link', { name: /bind my codex/i }));
  await screen.findByRole('link', { name: /open your codex/i });
  await act(async () => { window.location.hash = '#/account'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(screen.getByRole('button', { name: /download my data/i })).toBeEnabled();
}


function configuredAuth() {
  const port = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    onAuthStateChange: vi.fn((_callback: unknown) => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  };
  const controller = createAuthController(port as never, { returnUrl: 'https://merlinmusic.linequinn42.workers.dev/?auth_callback=1' });
  return { port, controller };
}
beforeEach(() => { window.location.hash = ''; });

it('shows the authenticated profile, truthful auth storage disclosure, and actual sign-out', async () => {
  const { port, controller } = configuredAuth();
  const user = { id: 'synthetic-account-user', email: 'fixture@example.invalid', user_metadata: { full_name: 'Synthetic Listener' } };
  port.getSession.mockResolvedValue({ data: { session: { user } }, error: null } as never);
  window.location.hash = '#/account';
  render(<App auth={controller} />);
  expect(await screen.findByText('fixture@example.invalid')).toBeInTheDocument();
  expect(screen.getByText('Synthetic Listener')).toBeInTheDocument();
  expect(screen.getByText(/sign-in session.*stored.*browser/i)).toBeInTheDocument();
  expect(screen.queryByText(/no cloud data exists/i)).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
  expect(port.signOut).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
  expect(await screen.findByText('Local session')).toBeInTheDocument();
});

it('discards imported history and pending selections on identity changes but not token refresh', async () => {
  const { port, controller } = configuredAuth();
  window.location.hash = '#/upload';
  render(<App auth={controller} />);
  await act(() => controller.initialize());
  await bindFixture();
  const event = port.onAuthStateChange.mock.calls[0][0] as (event: string, session: unknown) => void;
  await act(async () => { event('TOKEN_REFRESHED', null); });
  expect(screen.getByRole('button', { name: /download my data/i })).toBeEnabled();
  await act(async () => { event('SIGNED_IN', { user: { id: 'synthetic-new-user', user_metadata: {} } }); });
  expect(screen.getByText(/no history has been bound/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /download my data/i })).not.toBeInTheDocument();
  await act(async () => { window.location.hash = '#/binding'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
  expect(screen.getByText(/your codex is not bound yet/i)).toBeInTheDocument();
});

it('warns before sign-out clears imported history and preserves it when cancelled', async () => {
  const { port, controller } = configuredAuth();
  port.getSession.mockResolvedValue({ data: { session: { user: { id: 'synthetic-owner', user_metadata: {} } } }, error: null } as never);
  window.location.hash = '#/upload';
  render(<App auth={controller} />);
  await act(() => controller.initialize());
  await bindFixture();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(screen.getByRole('alertdialog', { name: /sign out and clear/i })).toBeInTheDocument();
  expect(port.signOut).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: /download my data/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await user.click(screen.getByRole('button', { name: /sign out and clear this tab/i }));
  expect(port.signOut).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/no history has been bound/i)).toBeInTheDocument();
});

it('warns beside Google sign-in that signing in navigates away, clears tab history, and to export first', async () => {
  const { controller } = configuredAuth();
  render(<App auth={controller} />);
  const warning = await screen.findByText(/signing in with google.*(leaves|navigates|replaces).*tab/i);
  expect(warning).toBeInTheDocument();
  expect(warning.textContent).toMatch(/export|download/i);
  expect(warning.textContent).toMatch(/clears.*history/i);
});

it('enables the configured Google button, disables it only while sign-in is pending, and re-enables after resolution', async () => {
  const { port, controller } = configuredAuth();
  let resolveSignIn: (value: unknown) => void = () => {};
  port.signInWithOAuth.mockReturnValue(new Promise(resolve => { resolveSignIn = resolve; }));
  render(<StrictMode><App auth={controller} /></StrictMode>);
  const button = await screen.findByRole('button', { name: /sign in with google/i });
  await userEvent.setup().click(button);
  expect(port.signInWithOAuth).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  resolveSignIn({ data: {}, error: null });
  await screen.findByRole('button', { name: /sign in with google/i });
  expect(button).toBeEnabled();
  expect(port.getSession).toHaveBeenCalledTimes(1);
});
