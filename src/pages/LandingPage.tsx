import { useState } from 'react';
import { FolioArt } from '../components/Chrome';
import { GoogleButton } from '../auth/GoogleButton';
import type { AuthController, AuthSnapshot } from '../auth/controller';

/**
 * Landing — blue page, wordmark left, framed art right.
 * Google sign-in is optional; the explicit local-only path remains available.
 */
const SIGN_IN_WARNING = 'Signing in with Google navigates away and clears this tab’s imported listening history. Export or download your history first if you need a copy.';
export { SIGN_IN_WARNING };

export function LandingPage({ auth, authState }: { auth: AuthController; authState: AuthSnapshot }): React.JSX.Element {
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  return (
    <main className="rite">
      <div className="rite-inner">
        <div className="rite-col">
          <h1 className="wordmark">Merlin</h1>
          <p className="wordmark-sub">Music Magic</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, marginTop: 14 }} aria-live="polite">
            {authState.user ? <a href="#/account" className="btn btn-white">My account</a> : <GoogleButton auth={auth} state={authState} />}
            {!authState.user ? <p role="note" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{SIGN_IN_WARNING}</p> : null}
            {authState.error ? <p role="alert">{authState.error}</p> : null}
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              {!authState.configured ? 'Google sign-in is not configured for this build. ' : 'Signing in shares your basic Google profile with Supabase for your Merlin account. '}
              Listening history stays in this browser tab and is never uploaded. Cloud saving is unavailable.
            </p>
            <a href="#/upload" className="btn-white" style={{ textDecoration: 'none' }}>
              Try with my files
            </a>
            <a
              href="https://www.spotify.com/account/privacy/"
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost-ultra"
              style={{ textDecoration: 'none' }}
            >
              Request my Spotify data ↗
            </a>
          </div>
        </div>

        <figure className="rite-art" style={{ margin: 0 }}>
          <FolioArt
            src="/assets/landing.jpg"
            alt="Two young musicians in red and green, one bowing a fiddle and one playing a lute, from a Renaissance painting"
            ratio="2440 / 1728"
            onUltra
          />
        </figure>
      </div>

      <footer className="rite-footer">
        <button type="button" onClick={() => setDraftNotice('Privacy Policy is a draft and not yet available.')}>Privacy</button>
        <button type="button" onClick={() => setDraftNotice('Terms of Service are a draft and not yet available.')}>Terms</button>
        {draftNotice ? (
          <span role="status" style={{ marginLeft: 'auto', color: '#fff' }}>{draftNotice}</span>
        ) : null}
      </footer>
    </main>
  );
}
