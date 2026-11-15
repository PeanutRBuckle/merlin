import { Chrome } from '../components/Chrome';

/**
 * Oracle — empty by design in this milestone. The composer is disabled with a
 * real explanation, there are no canned responses, and plate actions are
 * unavailable rather than pretending to work.
 */
export function OraclePage(): React.JSX.Element {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Chrome route="oracle" initial="L" />
      <div className="oracle-layout">
        <section aria-label="Oracle conversation" className="oracle-chat">
          <div className="oracle-messages" aria-live="polite">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', maxWidth: '92%' }}>
              <span aria-hidden="true" className="oracle-avatar">O</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 3 }}>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
                  The Oracle is not connected yet — this version runs locally on
                  your files alone, and no replies can be generated or replayed.
                </p>
              </div>
            </div>
          </div>

          <div style={{ padding: '12px clamp(16px, 3vw, 32px) 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['What defines my listening?', 'Which season do I favour?', 'Show my quiet hours'].map((s) => (
                <button key={s} type="button" disabled aria-label={`${s} — unavailable`} style={{ minHeight: 32, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 4, background: '#fff', color: 'var(--ink-muted)', font: '400 13px var(--font-sans)' }}>
                  {s}
                </button>
              ))}
            </div>
            <div role="status" style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
              Asking is unavailable: the Oracle is not connected yet, so there are no responses to show.
            </div>
            <div className="composer">
              <label htmlFor="ask" className="sr-only">Ask the Oracle</label>
              <textarea id="ask" rows={2} placeholder="Ask the Oracle" disabled aria-label="Ask the Oracle (not connected)" />
              <button type="button" className="send-btn" aria-label="Send (unavailable)" disabled>
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="1.75"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg>
              </button>
            </div>
          </div>
        </section>

        <section aria-label="Plates" className="oracle-plates">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="eyebrow">Plates</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button type="button" className="btn" style={{ minHeight: 36, padding: '0 14px' }} disabled aria-label="Pin to codex — unavailable">Pin to codex</button>
              <button type="button" className="btn" style={{ width: 36, height: 36, padding: 0 }} disabled aria-label="Download plate — unavailable">⭳</button>
            </div>
          </div>
          <figure className="plate-frame">
            <div className="plate-inner">
              <figcaption style={{ display: 'flex', alignItems: 'baseline', gap: 14, borderBottom: '3px double var(--ink)', paddingBottom: 10 }}>
                <span aria-hidden="true" className="chapter-num">—</span>
                <span style={{ font: '600 22px/1.2 var(--font-display)' }}>No plates</span>
              </figcaption>
              <p style={{ margin: 0 }}>
                Plates appear only from Oracle conversations. None exist because
                the Oracle is not connected in this version.
              </p>
            </div>
          </figure>
        </section>
      </div>
    </div>
  );
}
