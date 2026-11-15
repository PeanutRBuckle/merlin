import { useMemo, useRef, useState } from 'react';
import { Chrome } from '../components/Chrome';
import { formatIsoDate, formatInt, formatPercent } from '../components/format';
import { aggregateHistory } from '../data/aggregates';
import type { CodexSession } from '../components/session';
import type { AuthController, AuthSnapshot } from '../auth/controller';
import { GoogleButton } from '../auth/GoogleButton';
import { SIGN_IN_WARNING } from './LandingPage';

/**
 * Account — truthful local-session profile. No sample name or email; the
 * summary counts come from the real imported data; "Download my data" writes
 * the prepared JSON; "Clear local memory" (confirmed) is distinct from the
 * unavailable cloud account deletion.
 */
export function AccountPage({
  session,
  onClear,
  auth,
  authState,
}: {
  auth: AuthController;
  authState: AuthSnapshot;
  session: CodexSession | null;
  onClear: () => void;
}): React.JSX.Element {
  const profileName = typeof authState.user?.user_metadata.full_name === 'string' ? authState.user.user_metadata.full_name : 'Google account';
  const initial = authState.user ? profileName.slice(0, 1).toUpperCase() : 'L';
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);

  const summary = useMemo(() => {
    if (!session) return null;
    const agg = aggregateHistory(session.data, {});
    return {
      files: session.files.filter((f) => f.status === 'accepted').length,
      plays: agg.plays,
      hours: agg.hours,
      first: agg.first,
      last: agg.last,
      coverage: agg.audioCoverage,
    };
  }, [session]);

  const download = () => {
    if (!session) return;
    const blob = new Blob([JSON.stringify(session.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = downloadRef.current;
    if (!a) return;
    a.href = url;
    a.download = `merlin-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloadNote('Your prepared history was downloaded to this device.');
  };

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Chrome route="account" initial={initial} />
      <main className="account-main">
        <h1 style={{ margin: 0, font: '600 32px/1.15 var(--font-display)' }}>Account</h1>

        <section aria-label="Profile" className="panel" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <span aria-hidden="true" style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--ultra)', color: 'var(--gilt-on-ultra)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 30px/1 var(--font-ceremonial)' }}>{initial}</span>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column' }}>
            <strong style={{ fontSize: 17, fontWeight: 600 }}>{authState.user ? profileName : 'Local session'}</strong>
            <span className="muted" style={{ overflowWrap: 'anywhere' }}>{authState.user ? authState.user.email : 'Your Codex · no account connected'}</span>
          </div>
          {authState.user ? <button type="button" className="btn" disabled={authState.loading || authState.busy} onClick={() => { if (session) setConfirmSignOut(true); else void auth.signOut(); }}>Sign out</button> : <a href="#/" className="btn">Return to Merlin</a>}
          {!authState.user && authState.configured ? <GoogleButton auth={auth} state={authState} /> : null}
          {!authState.user && authState.configured ? <p role="note" style={{ flexBasis: '100%', margin: 0, fontSize: 13, lineHeight: 1.5 }}>{SIGN_IN_WARNING}</p> : null}
        </section>

        {confirmSignOut ? <div role="alertdialog" aria-label="Sign out and clear local history" className="panel">
          <p>Signing out clears this tab’s imported history. Download your data first if you need a copy.</p>
          <button type="button" className="btn" onClick={() => setConfirmSignOut(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={authState.busy} onClick={() => { setConfirmSignOut(false); void auth.signOut(); }}>Sign out and clear this tab</button>
        </div> : null}
        {authState.error ? <p role="alert">{authState.error}</p> : null}
        <p className="muted" style={{ margin: 0 }}>
          Your sign-in session is stored in this browser separately from listening history. Google and Supabase process basic profile information for sign-in.
          Listening history stays in this tab; cloud history saving is unavailable. Changing accounts or signing out clears this tab’s imported history.
        </p>

        <section aria-labelledby="h-hist" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 id="h-hist">Your history</h2>
          {summary && session ? (
            <>
              <dl className="summary-dl">
                <div>
                  <dt>Last upload</dt>
                  <dd>{new Date(session.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</dd>
                </div>
                <div><dt>Files</dt><dd>{summary.files}</dd></div>
                <div><dt>Plays</dt><dd>{formatInt(summary.plays)}</dd></div>
                <div>
                  <dt>Range</dt>
                  <dd>{summary.first && summary.last ? `${formatIsoDate(summary.first)} – ${formatIsoDate(summary.last)}` : '—'}</dd>
                </div>
              </dl>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <a href="#/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>Upload new history</a>
                <button type="button" className="btn" onClick={download}>Download my data</button>
              </div>
              <p role="status" style={{ margin: 0, fontSize: 13 }} aria-live="polite">
                {downloadNote ?? `${formatPercent(summary.coverage)} of listening time has complete audio features.`}
              </p>
            </>
          ) : (
            <p role="status" style={{ margin: 0 }}>
              No history has been bound in this tab yet.
            </p>
          )}
        </section>

        <section aria-labelledby="h-agree" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="h-agree">Agreements</h2>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span>Privacy Policy</span>
            <span className="muted" style={{ fontSize: 14 }}>Draft — unavailable, nothing recorded</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--line)' }}>
            <span>Data Use Agreement</span>
            <span className="muted" style={{ fontSize: 14 }}>Draft — unavailable, nothing recorded</span>
          </div>
        </section>

        <section aria-labelledby="h-mem" className="panel" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 id="h-mem">Local memory</h2>
          {!cleared ? (
            !confirming ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span className="muted">
                  Erases the codex, imported files and Oracle state from this browser tab.
                  This does not sign you out or delete your Supabase authentication account. No listening history is saved in the cloud.
                </span>
                <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>Clear local memory</button>
              </div>
            ) : (
              <div role="alertdialog" aria-label="Confirm clearing local memory" style={{ border: '1px solid var(--danger)', borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <strong style={{ fontWeight: 600 }}>This can’t be undone.</strong>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
                  <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
                  Erase all local session data
                </label>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn" onClick={() => { setConfirming(false); setConfirmChecked(false); }}>Cancel</button>
                  <button
                    type="button"
                    className="btn btn-danger-solid"
                    disabled={!confirmChecked}
                    onClick={() => { setCleared(true); setConfirming(false); onClear(); }}
                  >
                    Erase everything
                  </button>
                </div>
              </div>
            )
          ) : (
            <div role="status" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <span>Local memory has been cleared.</span>
              <a href="#/" style={{ fontWeight: 500 }}>Return to Merlin</a>
            </div>
          )}
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Account deletion is not implemented yet. To request deletion of an authentication account, contact the Merlin project owner.
            Reminder emails are also unavailable.
          </p>
        </section>
        <a ref={downloadRef} href="#" download="merlin-history.json" className="sr-only" aria-hidden="true" tabIndex={-1}>download</a>
      </main>
    </div>
  );
}
