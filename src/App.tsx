import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getBrowserAuth } from './auth/browser';
import type { AuthController, AuthSnapshot } from './auth/controller';
import type { HistoryData } from './data/types';
import { createSession, type CodexSession, type ImportFileResult } from './components/session';
import { LandingPage } from './pages/LandingPage';
import { AgreementsPage } from './pages/AgreementsPage';
import { UploadPage } from './pages/UploadPage';
import { BindingPage } from './pages/BindingPage';
import { CodexPage } from './pages/CodexPage';
import { OraclePage } from './pages/OraclePage';
import { AccountPage } from './pages/AccountPage';
import { DiscoverPage } from './pages/DiscoverPage';

function routeFromHash(): string {
  const h = window.location.hash.replace(/^#\/?/, '');
  return h;
}

/**
 * App shell: lightweight hash router over per-tab local state.
 * Routes: '' (landing), agreements, upload, binding, codex, account, oracle, discover.
 */
export function App({ auth = getBrowserAuth() }: { auth?: AuthController }): React.JSX.Element {
  const authState = useSyncExternalStore(auth.subscribe, auth.getSnapshot);
  useEffect(() => { void auth.initialize(); }, [auth]);
  // Remount the entire tab-local workspace on identity transitions, cancelling import subscribers too.
  return <LocalApp key={authState.identityVersion} auth={auth} authState={authState} />;
}

function LocalApp({ auth, authState }: { auth: AuthController; authState: AuthSnapshot }): React.JSX.Element {
  const [route, setRoute] = useState<string>(routeFromHash);
  const [picked, setPicked] = useState<File[]>([]);
  const [session, setSession] = useState<CodexSession | null>(null);

  useEffect(() => {
    const onHash = () => {
      const next = routeFromHash();
      if (next === 'upload') setPicked([]);
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Warn before the tab closes with unexported local data.
  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [session]);

  const bind = useCallback((data: HistoryData, results: ImportFileResult[]) =>
    setSession(createSession(data, results)), []);


  const render = (): React.JSX.Element => {
    switch (route) {
      case 'agreements':
        return <AgreementsPage />;
      case 'upload':
        return (
          <UploadPage
            picked={picked}
            onPick={(files) => setPicked((prev) => [...prev, ...files])}
          />
        );
      case 'binding':
        return picked.length > 0 ? (
          <BindingPage files={picked} onBound={bind} />
        ) : (
          <EmptyCodex />
        );
      case 'codex':
        return session ? (
          <CodexPage session={session} />
        ) : (
          <EmptyCodex />
        );
      case 'account':
        return (
          <AccountPage
            auth={auth}
            authState={authState}
            session={session}
            onClear={() => {
              setSession(null);
              setPicked([]);
              // Stay on the account page: it reports the cleared state itself.
            }}
          />
        );
      case 'oracle':
        return <OraclePage />;
      case 'discover':
        return <DiscoverPage />;
      case '':
        return <LandingPage auth={auth} authState={authState} />;
      default:
        return <LandingPage auth={auth} authState={authState} />;
    }
  };

  return <div data-route={route}>{render()}</div>;
}

/** Usable empty state when the codex is requested with nothing bound. */
function EmptyCodex(): React.JSX.Element {
  return (
    <main className="rite" style={{ justifyContent: 'center', alignItems: 'center', gap: 12 }}>
      <h1 style={{ margin: 0, font: '600 clamp(26px, 2.6vw, 32px)/1.15 var(--font-display)' }}>Your codex is not bound yet</h1>
      <p role="status" style={{ margin: 0 }}>Add your Spotify history files to create one in this tab.</p>
      <a href="#/upload" className="btn btn-white" style={{ textDecoration: 'none' }}>Go to upload</a>
    </main>
  );
}
