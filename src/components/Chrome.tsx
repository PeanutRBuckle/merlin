import { useEffect, useRef } from 'react';

/** Shared app chrome: blackletter logo, Codex/Discover/Oracle tabs, avatar link. */
export function Chrome({ route, initial }: { route: string; initial: string }): React.JSX.Element {
  const tab = (label: string, href: string) => (
    <a
      key={label}
      href={href}
      className="chrome-tab"
      aria-current={route === href.slice(2) ? 'page' : undefined}
    >
      {label}
    </a>
  );
  return (
    <header className="chrome">
      <nav aria-label="Main">
        <a href="#/" className="chrome-logo" aria-label="Merlin home">Merlin</a>
        <div className="chrome-tabs">
          {tab('Codex', '#/codex')}
          {tab('Discover', '#/discover')}
          {tab('Oracle', '#/oracle')}
        </div>
        <div className="chrome-end">
          <a href="#/account" className="avatar" aria-label="Account">{initial}</a>
        </div>
      </nav>
    </header>
  );
}

/** The "folio" double-rule frame used around art and plates. */
export function FolioArt({
  src, alt, ratio, innerStyle, onUltra,
}: {
  src?: string;
  alt: string;
  ratio?: string;
  innerStyle?: React.CSSProperties;
  onUltra?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { void ref.current; }, []);
  return (
    <div className={onUltra ? 'folo-on-ultra' : ''} style={{ border: `3px double ${onUltra ? '#fff' : 'var(--ink)'}`, padding: 6, ...(onUltra ? {} : { background: 'var(--paper-raised)' }) }}>
      <div
        className={onUltra ? 'inner' : undefined}
        style={{ border: `1px solid ${onUltra ? '#fff' : 'var(--ink)'}`, aspectRatio: ratio ?? '4 / 3', overflow: 'hidden', background: 'var(--ultra-hover)', ...innerStyle }}
      >
        {src ? <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      </div>
    </div>
  );
}

/** Truthful draft-document disclosure for Privacy/Terms links. */
export function DraftLink({ label }: { label: string }): React.JSX.Element {
  return (
    <a
      href="#/agreements"
      onClick={(e) => e.preventDefault()}
      aria-label={`${label} — draft, not yet available`}
      title={`${label} — draft, not yet reviewed`}
      style={{ textDecoration: 'underline' }}
    >
      {label} <span className="sr-only">(draft, not yet available)</span>*
    </a>
  );
}
