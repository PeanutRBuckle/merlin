import type { AuthController, AuthSnapshot } from './controller';

/** Unmodified, self-hosted pre-approved Google button artwork. */
export function GoogleButton({ auth, state }: { auth: AuthController; state: AuthSnapshot }) {
  return <>
    <button type="button" aria-label="Sign in with Google" disabled={!state.configured || state.loading || state.busy}
      onClick={() => { void auth.signIn(); }}
      style={{ padding: 0, border: 0, background: 'transparent', alignSelf: 'flex-start', cursor: 'pointer', lineHeight: 0 }}>
      <img src="/assets/google-sign-in.png" alt="Sign in with Google" style={{ display: 'block', height: 44, width: 'auto', maxWidth: '100%' }} />
    </button>
    {state.loading ? <p role="status">Checking sign-in…</p> : state.busy ? <p role="status">Opening Google sign-in…</p> : null}
  </>;
}
