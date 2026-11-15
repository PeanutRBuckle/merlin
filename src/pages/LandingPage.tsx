import { useState } from 'react';
import { FolioArt } from '../components/Chrome';

/**
 * Landing — blue page, wordmark left, framed art right.
 * Google sign-in is NOT connected in this milestone: the button is disabled and
 * says so. The explicit local-only path is "Try with my files".
 */
export function LandingPage(): React.JSX.Element {
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  return (
    <main className="rite">
      <div className="rite-inner">
        <div className="rite-col">
          <h1 className="wordmark">Merlin</h1>
          <p className="wordmark-sub">Music Magic</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280, marginTop: 14 }} aria-live="polite">
            <button type="button" className="btn btn-white" disabled>
              <span className="google-dots" aria-hidden="true" />
              Continue with Google
            </button>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
              Google sign-in is not connected yet. You can still turn your own
              history into a codex — everything stays in this browser tab.
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
