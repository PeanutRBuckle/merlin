import { useState } from 'react';
import { FolioArt } from '../components/Chrome';

/**
 * Agreements — shown as in the mockup, but truthful: both documents are drafts,
 * so nothing can be ticked and no consent is recorded.
 */
export function AgreementsPage(): React.JSX.Element {
  return (
    <main className="rite">
      <div className="rite-inner">
        <figure className="rite-art" style={{ margin: 0 }}>
          <FolioArt
            src="/assets/agreements.jpg"
            alt="Three angels in a garden playing a psaltery, a harp and a lute, from a late-medieval painting"
            ratio="2360 / 1824"
            onUltra
          />
        </figure>

        <div className="rite-col" style={{ flex: '0 1 380px' }}>
          <h1 style={{ margin: 0, font: '600 clamp(26px, 2.6vw, 32px)/1.15 var(--font-display)' }}>Before we begin</h1>

          <div style={{ border: '3px double #fff', padding: 6 }}>
            <div style={{ border: '1px solid #fff', display: 'flex', flexDirection: 'column' }}>
              <AgreementRow label="Privacy Policy" first />
              <AgreementRow label="Data Use Agreement" />
            </div>
          </div>

          <p role="status" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            These documents are drafts and are not yet available, so they cannot
            be accepted and nothing has been recorded. Continue with Google is
            not connected yet either.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-white" disabled>Continue</button>
            <a href="#/" style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Sign out</a>
          </div>
        </div>
      </div>
    </main>
  );
}

function AgreementRow({ label, first }: { label: string; first?: boolean }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', fontSize: 14, borderTop: first ? 0 : '1px solid rgba(255,255,255,0.34)' }}>
      <input type="checkbox" disabled aria-label={`I agree to the ${label}`} style={{ flex: 'none', width: 20, height: 20, margin: 0, accentColor: '#f0c04a' }} />
      <span>
        I agree to the <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{label}</span>
        <span style={{ opacity: 0.7 }}> — draft, unavailable</span>
      </span>
    </div>
  );
}
