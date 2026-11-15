import { useEffect, useRef, useState } from 'react';
import { importHistory } from '../import/history';
import type { HistoryData } from '../data/types';
import type { ImportFileResult } from '../components/session';
import { formatInt } from '../components/format';

type Stage = 'reading' | 'merging' | 'enriching' | 'binding';

const STEP_LABELS: Array<{ stage: Stage; label: string }> = [
  { stage: 'reading', label: 'Reading your files' },
  { stage: 'merging', label: 'Merging your history' },
  { stage: 'enriching', label: 'Checking sound and genre' },
  { stage: 'binding', label: 'Binding the codex' },
];

/**
 * Binding — real import progress, no fake timers. Each step shows a count once
 * that stage has actually completed. Errors surface with a retry.
 */
export function BindingPage({
  files,
  onBound,
}: {
  files: File[];
  onBound: (data: HistoryData, results: ImportFileResult[]) => void;
}): React.JSX.Element {
  const [doneStages, setDoneStages] = useState<Set<Stage>>(new Set());
  const [meta, setMeta] = useState<{ files: number; plays: number; tracks: number; audio: number; genre: number } | null>(null);
  const [results, setResults] = useState<ImportFileResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const jobRef = useRef<ReturnType<typeof importHistory> | null>(null);
  const progressRef = useRef<((stage: Stage) => void) | null>(null);

  useEffect(() => {
    if (files.length === 0) return;
    let cancelled = false;
    const markDone = (stage: Stage) =>
      setDoneStages((prev) => new Set(prev).add(stage));
    progressRef.current = (stage) => {
      const idx = STEP_LABELS.findIndex((s) => s.stage === stage);
      for (let i = 0; i < idx; i++) markDone(STEP_LABELS[i].stage);
    };
    // StrictMode reattaches this subscriber, not a second import. The job
    // survives effect cleanup, while an unmounted subscriber cannot update UI.
    jobRef.current ??= importHistory(files, (p) => progressRef.current?.(p.stage));
    jobRef.current
      .then(({ data, files: results }) => {
        if (cancelled) return;
        setResults(results);
        markDone('reading'); markDone('merging'); markDone('enriching'); markDone('binding');
        setMeta({
          files: results.filter((r) => r.status === 'accepted').length,
          plays: data.events.length,
          tracks: data.tracks.length,
          audio: data.tracks.filter(track => track.features.every(value => value !== null)).length,
          genre: data.tracks.filter(track => track.families.length > 0).length,
        });
        onBound(data, results);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err && typeof err === 'object' && 'files' in err && Array.isArray(err.files)) setResults(err.files);
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; progressRef.current = null; };
  }, [files, attempt, onBound]);

  if (files.length === 0) {
    return (
      <main className="rite" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <p role="status">No files are ready to bind.</p>
        <a href="#/upload" className="btn btn-white" style={{ textDecoration: 'none' }}>Back to upload</a>
      </main>
    );
  }

  const completed = meta !== null;
  const pct = completed ? 100 : Math.round((doneStages.size / 4) * 100);
  const stepMeta: Record<Stage, string> = {
    reading: meta ? `${meta.files} files` : '',
    merging: meta ? `${formatInt(meta.plays)} plays` : '',
    enriching: meta ? `${formatInt(meta.audio)} audio · ${formatInt(meta.genre)} genre tracks` : '',
    binding: meta ? 'Ready' : '',
  };

  return (
    <div style={{ background: 'var(--ultra)', color: '#fff', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '16px clamp(16px, 4vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ font: '400 34px/1 var(--font-ceremonial)' }}>Merlin</span>
        <span aria-label="Local session" style={{ width: 40, height: 40, borderRadius: '50%', background: '#fff', color: 'var(--ultra)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 20px/1 var(--font-ceremonial)' }}>L</span>
      </header>
      <main style={{ flex: 1, width: '100%', maxWidth: 520, margin: '0 auto', padding: '24px 16px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <span aria-hidden="true" style={{ width: 96, height: 96, background: 'var(--ultra-hover)', color: 'var(--gilt-on-ultra)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '400 80px/1 var(--font-ceremonial)', outline: '1px solid #fff', outlineOffset: 5 }}>L</span>
          <h1 className="sr-only" role="status" aria-live="polite">
            {completed ? 'Your codex is bound' : 'Binding your codex'}
          </h1>
        </div>

        <div role="progressbar" aria-label="Binding progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="progress-track">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>

        <ol className="step-list">
          {STEP_LABELS.map((s, i) => {
            const done = completed || doneStages.has(s.stage);
            const active = !done && i <= doneStages.size;
            return (
              <li className="step-row" data-pending={!done && !active} key={s.stage}>
                <span aria-hidden="true" className="step-dot" data-done={done || undefined}>
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="var(--ultra)" strokeWidth="2.25"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
                  ) : null}
                </span>
                <span style={{ flex: 1 }}>{s.label}</span>
                <span style={{ font: '400 12px var(--font-mono)', color: 'rgba(255,255,255,0.8)' }}>{done ? stepMeta[s.stage] : ''}</span>
              </li>
            );
          })}
        </ol>

        {results.length ? (
          <ul aria-label="Import results" style={{ margin: 0, paddingLeft: 20, fontSize: 13, overflowWrap: 'anywhere' }}>
            {results.map((result, index) => <li key={`${index}:${result.name}`}>
              {result.name} — {result.status}{result.reason ? `: ${result.reason}` : ''}
            </li>)}
          </ul>
        ) : null}

        {error ? (
          <div role="alert" className="notice notice-danger" style={{ borderColor: '#fff', color: '#fff' }}>
            <p style={{ margin: '0 0 12px' }}>Binding failed: {error}</p>
            <button type="button" className="btn btn-white" onClick={() => { setError(null); jobRef.current = null; setAttempt(a => a + 1); setDoneStages(new Set()); }}>
              Try again
            </button>
            <a href="#/upload" className="btn btn-white" style={{ marginLeft: 8 }}>Choose different files</a>
          </div>
        ) : null}

        {completed ? (
          <a href="#/codex" className="btn btn-white" style={{ textDecoration: 'none', alignSelf: 'center' }}>Open your codex</a>
        ) : null}
      </main>
    </div>
  );
}
