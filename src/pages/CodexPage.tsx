import { useEffect, useMemo, useRef, useState } from 'react';
import { Chrome, FolioArt } from '../components/Chrome';
import { formatIsoDate, formatDuration, formatInt, formatPercent, hourLabel, isValidIsoDate, weekdayOf, MONTHS_SHORT } from '../components/format';
import type { HistoryData } from '../data/types';
import type { CodexSession } from '../components/session';

type Range = { kind: 'all' } | { kind: 'custom'; from: string; to: string };

/** Codex dashboard — hero plus chapters I–VI per the approved mockup. */
export function CodexPage({ session }: { session: CodexSession }): React.JSX.Element {
  const [range, setRange] = useState<Range>({ kind: 'all' });
  const [popOpen, setPopOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [tab, setTab] = useState<'Artists' | 'Songs'>('Artists');
  const [methodsOpen, setMethodsOpen] = useState(false);
  const customRangeButton = useRef<HTMLButtonElement>(null);
  const rangeBox = useRef<HTMLDivElement>(null);

  const closeRange = () => { setPopOpen(false); customRangeButton.current?.focus(); };
  useEffect(() => {
    if (popOpen) rangeBox.current?.querySelector('input')?.focus();
  }, [popOpen]);

  const opts = range.kind === 'custom' ? { from: range.from, to: range.to } : {};
  const agg = useMemo(() => aggregate(session.data, opts), [session.data, range]);
  void opts;

  const applyRange = () => {
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      setRangeError('Enter real dates as YYYY-MM-DD.');
      return;
    }
    if (from > to) {
      setRangeError('The range must start on or before the end date.');
      return;
    }
    setRangeError(null);
    setRange({ kind: 'custom', from, to });
    closeRange();
  };

  const customLabel = range.kind === 'custom'
    ? `${formatIsoDate(range.from)} – ${formatIsoDate(range.to)}`
    : 'Custom range';

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Chrome route="codex" initial="L" />

      <section className="codex-hero">
        <div className="codex-hero-inner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <span className="eyebrow on-ultra">The codex of</span>
            <h1 className="codex-name">Your Codex</h1>
            <div role="group" aria-label="Time range" className="range-group">
              <button
                type="button"
                className="chip"
                aria-pressed={range.kind === 'all'}
                onClick={() => { setRange({ kind: 'all' }); setPopOpen(false); setRangeError(null); }}
              >
                All time
              </button>
              <div className="range-anchor">
                <button
                  ref={customRangeButton}
                  type="button"
                  className="chip"
                  aria-pressed={range.kind === 'custom' || popOpen}
                  aria-expanded={popOpen}
                  aria-controls="range-pop"
                  onClick={() => { setPopOpen(!popOpen); setRangeError(null); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, paddingRight: 10 }}
                >
                  <span>{customLabel}</span>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ transform: popOpen ? 'rotate(180deg)' : 'none' }}><path d="M5 3l4 4-4 4" /></svg>
                </button>
                {popOpen ? (
                  <div ref={rangeBox} id="range-pop" role="dialog" aria-label="Custom range" className="range-pop" onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); closeRange(); } }}>
                    <span className="eyebrow">Custom range</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
                        From
                        <input type="date" value={from} aria-label="From" onChange={(e) => { setFrom(e.target.value); setRangeError(null); }} style={{ minHeight: 40, padding: '0 8px', border: '1px solid var(--line-strong)', borderRadius: 4, font: '400 13px var(--font-sans)', color: 'var(--ink)', background: '#fff' }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 500 }}>
                        To
                        <input type="date" value={to} aria-label="To" onChange={(e) => { setTo(e.target.value); setRangeError(null); }} style={{ minHeight: 40, padding: '0 8px', border: '1px solid var(--line-strong)', borderRadius: 4, font: '400 13px var(--font-sans)', color: 'var(--ink)', background: '#fff' }} />
                      </label>
                    </div>
                    {rangeError ? <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{rangeError}</p> : null}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn" style={{ minHeight: 44, padding: '0 14px' }} onClick={() => { closeRange(); setRangeError(null); }}>Cancel</button>
                      <button type="button" className="btn btn-primary" style={{ minHeight: 40, padding: '0 14px' }} onClick={applyRange}>Apply</button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="big-figures">
              <div className="big-figure">
                <span className="value gilt">{agg.hours > 0 && agg.hours < 1 ? (agg.hours < 0.1 ? agg.hours.toFixed(2) : agg.hours.toFixed(1)) : formatInt(agg.hours)}</span>
                <span className="label">hours</span>
              </div>
              <div className="big-figure">
                <span className="value">{formatInt(agg.plays)}</span>
                <span className="label">plays</span>
              </div>
              <div className="big-figure">
                <span className="value">{formatInt(agg.artists)}</span>
                <span className="label">artists</span>
              </div>
            </div>
          </div>
          <figure style={{ margin: 0 }}>
            <FolioArt src="/assets/view-3.webp" alt="A medieval court scene with rows of musicians" ratio="16 / 10" onUltra innerStyle={{ objectPosition: '50% 60%' }} />
          </figure>
        </div>
      </section>

      <main style={{ maxWidth: 1280, margin: '0 auto', width: '100%', padding: '56px clamp(16px, 4vw, 48px) 80px', display: 'flex', flexDirection: 'column', gap: 56, boxSizing: 'border-box' }}>

        {/* Oracle's reading — the only AI text on the dashboard. */}
        <section aria-labelledby="oracle-h" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, padding: 32, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 40 }}>
          <div style={{ flex: '999 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <span className="eyebrow" id="oracle-h">The Oracle’s reading</span>
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.5, maxWidth: '62ch' }}>
              The Oracle is not connected in this version, so there is no reading
              yet. Your codex below is drawn only from the files you bound.
            </p>
          </div>
          <div style={{ flex: '1 1 260px', maxWidth: 340, display: 'flex', flexDirection: 'column' }}>
            <FolioArt src="/assets/view-2.webp" alt="Two figures playing stringed instruments in an illuminated manuscript" ratio="4 / 3" innerStyle={{ objectPosition: 'center 40%' }} />
            <a href="#/oracle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, padding: '0 18px', background: 'var(--ultra)', color: '#fff', fontSize: 15, fontWeight: 500, textDecoration: 'none' }}>
              <span>Open the Oracle</span>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="#fff" strokeWidth="1.5"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </a>
          </div>
        </section>

        {/* I + II */}
        <div className="chapter-grid">
          <section aria-labelledby="ch1" className="chapter">
            <div className="chapter-head">
              <span aria-hidden="true" className="chapter-num">I</span>
              <h2 className="chapter-title" id="ch1">The Litany</h2>
              <div role="tablist" aria-label="Rank by" style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {(['Artists', 'Songs'] as const).map((label) => (
                  <button key={label} id={`litany-tab-${label}`} type="button" role="tab" aria-controls="litany-panel" tabIndex={tab === label ? 0 : -1} aria-selected={tab === label} className="chip chip-dark" style={{ color: tab === label ? 'var(--paper-raised)' : 'var(--ink)', minHeight: 44, padding: '0 12px', borderColor: tab === label ? 'var(--ink)' : 'var(--line-strong)' }} onClick={() => setTab(label)} onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 'Artists' : event.key === 'End' ? 'Songs' : label === 'Artists' ? 'Songs' : 'Artists';
                    setTab(next);
                    document.getElementById(`litany-tab-${next}`)?.focus();
                  }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div id="litany-panel" role="tabpanel" aria-labelledby={`litany-tab-${tab}`}>
            <ol className="rank-list">
              {(tab === 'Artists' ? agg.topArtists : agg.topSongs).slice(0, 8).map((entry, i) => {
                const max = (tab === 'Artists' ? agg.topArtists : agg.topSongs)[0]?.ms || 1;
                return (
                  <li className="rank-row" key={entry.key}>
                    <span className="rank-n">{String(i + 1).padStart(2, '0')}</span>
                    <span className="rank-name">
                      <span className="name" style={{ fontWeight: i === 0 ? 600 : 400 }}>{entry.name}</span>
                      <span className="sub">{entry.subtitle}</span>
                    </span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${Math.round((entry.ms / max) * 100)}%`, background: i === 0 ? 'var(--ultra-hover)' : 'var(--ultra)' }} />
                    </span>
                    <span className="rank-v">{formatDuration(entry.ms)}</span>
                  </li>
                );
              })}
            </ol>
            </div>
          </section>

          <section aria-labelledby="ch2" className="chapter">
            <div className="chapter-head">
              <span aria-hidden="true" className="chapter-num">II</span>
              <h2 className="chapter-title" id="ch2">Hours</h2>
            </div>
            <div role="img" aria-label={`Listening by hour of day${agg.peakHour !== null ? `, peaking at ${hourLabel(agg.peakHour)}` : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="hours-chart">
                {agg.hoursOfDay.map((ms, h) => {
                  const max = Math.max(...agg.hoursOfDay, 1);
                  return (
                    <div key={h} title={`${hourLabel(h)} — ${formatDuration(ms)}`} style={{ height: `${Math.round((ms / max) * 100)}%`, background: ms === max ? 'var(--ultra-hover)' : 'var(--ultra)' }} />
                  );
                })}
              </div>
              <div className="hours-labels">
                <span>12 a.m.</span><span>6 a.m.</span><span>12 p.m.</span><span>6 p.m.</span>
              </div>
            </div>
            <div className="stat-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="value">{agg.peakHour !== null ? hourLabel(agg.peakHour) : '—'}</span>
                <span className="label">peak hour</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="value">{formatPercent(agg.lateShare)}</span>
                <span className="label">after 9 p.m.</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="value">{agg.heaviestDay ? weekdayOf(agg.heaviestDay) : '—'}</span>
                <span className="label">heaviest day</span>
              </div>
            </div>
          </section>
        </div>

        {/* III Kalendarium */}
        <section aria-labelledby="ch3" className="chapter">
          <div className="chapter-head">
            <span aria-hidden="true" className="chapter-num">III</span>
            <h2 className="chapter-title" id="ch3">Kalendarium</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 28 }}>
            <div className="cal-wrap">
              <div className="cal-inner">
                <CalendarMonthLabels calendar={agg.calendar} />
                <div role="img" aria-label={`Daily listening heatmap${agg.longestStreak ? `, with a ${agg.longestStreak}-day streak` : ''}`} className="cal-grid">
                  {agg.calendar.map((day) => (
                    <div
                      key={day.date}
                      className="cal-cell"
                      style={{ background: !day.available ? 'var(--paper)' : rampFor(day.ms, agg.calendar), outline: !day.available ? '1px dotted var(--line)' : undefined }}
                      title={day.available
                        ? `${formatIsoDate(day.date)} — ${formatDuration(day.ms)}`
                        : `${formatIsoDate(day.date)} — no listening data available`}
                      aria-label={day.available
                        ? `${formatIsoDate(day.date)} — ${formatDuration(day.ms)}`
                        : `${formatIsoDate(day.date)} — no listening data available`}
                    />
                  ))}
                </div>
                <div className="cal-legend">
                  <span>Silent</span>
                  {RAMP.map((c) => <span key={c} className="swatch" style={{ background: c }} />)}
                  <span>{formatDuration(Math.max(...agg.calendar.map(d => d.ms), 0)) || '0 m'}</span>
                </div>
              </div>
            </div>
            <aside style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ font: '600 36px/1.2 var(--font-display)' }}>{agg.longestStreak ? `${agg.longestStreak} days` : '—'}</span>
                <span className="muted" style={{ fontSize: 13 }}>longest streak</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ font: '600 36px/1.2 var(--font-display)' }}>{agg.biggestDay ? formatDuration(agg.biggestDay.ms) : '—'}</span>
                <span className="muted" style={{ fontSize: 13 }}>{agg.biggestDay ? `biggest day, ${formatIsoDate(agg.biggestDay.date)}` : 'biggest day'}</span>
              </div>
            </aside>
          </div>
        </section>

        {/* IV + V */}
        <div className="chapter-grid">
          <section aria-labelledby="ch4" className="chapter">
            <div className="chapter-head">
              <span aria-hidden="true" className="chapter-num">IV</span>
              <h2 className="chapter-title" id="ch4">Sonus</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {agg.audio.map((d) => (
                <div className="sonus-row" key={d.name}>
                  <span>{d.name}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    {d.value === null ? (
                      <div className="bar-track" aria-label={`${d.name}: unavailable`}><span className="bar-fill" style={{ width: 0 }} /></div>
                    ) : (
                      <div className="bar-track"><span className="bar-fill" style={{ width: `${Math.round(d.value * 100)}%`, background: 'var(--ultra)' }} /></div>
                    )}
                    <div className="sonus-poles"><span>{d.low}</span><span>{d.high}</span></div>
                  </div>
                  <span className="rank-v">{d.value === null ? 'unavailable' : String(Math.round(d.value * 100))}</span>
                </div>
              ))}
              {agg.audio.length === 0 ? <p className="muted" style={{ margin: 0 }}>No audio-feature profile is available for this history.</p> : null}
            </div>
          </section>

          <section aria-labelledby="ch5" className="chapter">
            <div className="chapter-head">
              <span aria-hidden="true" className="chapter-num">V</span>
              <h2 className="chapter-title" id="ch5">Genera</h2>
            </div>
            {agg.genres.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No genre data is available for this history.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 16, alignItems: 'stretch' }}>
                <div role="img" aria-label={`Genre share by year; ${formatPercent(agg.genreCoverage)} of listening has genre data`} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div className="genera-cols" style={{ gridTemplateColumns: `repeat(${agg.genres.length}, minmax(0, 1fr))` }}>
                    {agg.genres.map((y) => (
                      <div className="genera-col" key={y.year}>
                        {y.shares.map((s) => (
                          <div key={s.name} title={`${y.year} · ${s.name}: ${formatPercent(s.share)}`} style={{ height: `${s.share * 100}%`, background: genreColor(s.name) }} />
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="genera-years" style={{ gridTemplateColumns: `repeat(${agg.genres.length}, minmax(0, 1fr))` }}>
                    {agg.genres.map((y) => <span key={y.year}>{`'${String(y.year).slice(2)}`}</span>)}
                  </div>
                </div>
                <ul className="genera-legend" style={{ display: 'flex', flexDirection: 'column-reverse' }}>
                  {genreNames(agg).map((name) => (
                    <li key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="swatch" style={{ background: genreColor(name) }} />
                      <span>{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        {/* VI Folia Rara */}
        <section aria-labelledby="ch6" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="chapter-head">
            <span aria-hidden="true" className="chapter-num">VI</span>
            <h2 className="chapter-title" id="ch6">Folia Rara</h2>
            <a href="#/discover" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500 }}>Find more in Discover</a>
          </div>
          <div role="status">
            <p style={{ margin: 0 }}>
              Rare leaves are not available yet — the current history schema has
              no source-specific listener counts, so nothing can be shown here.
            </p>
          </div>
        </section>

        {/* Methods disclosure */}
        <details className="disclosure" onToggle={(e) => setMethodsOpen((e.target as HTMLDetailsElement).open)}>
          <summary onClick={() => setMethodsOpen(!methodsOpen)}>How these figures are measured</summary>
          <ul style={{ margin: '12px 0 0', paddingLeft: 20, fontSize: 13, color: 'var(--ink-muted)', lineHeight: 1.6 }}>
            <li>All dates and hours are UTC.</li>
            <li>Events shorter than 30 seconds are excluded from these figures. This is an analytical threshold, not an official Spotify stream rule.</li>
            <li>Rankings, hour bars, audio profiles and genre shares use recorded listening duration. Plays count eligible events.</li>
            <li>Dotted pale calendar cells are outside the archive or selected range, not observed zero listening. Vellum cells indicate no eligible listening within covered dates.</li>
            <li>Listening duration is split equally across a track’s genre families. Tracks without families remain Unknown.</li>
            <li>Audio profiles use only tracks with all eight numeric features; partial tracks remain uncovered. Tempo is clamped to 0–200 BPM and mapped to 0–100.</li>
            {range.kind === 'custom' ? <li>Custom range: {formatIsoDate(range.from)} through {formatIsoDate(range.to)}, both ends included.</li> : null}
          </ul>
        </details>
      </main>

      <footer className="site-footer">
        <div>
          <span>merlinmusic.app</span>
          <span>
            Local session
            {session.files.length ? ` · ${session.files.filter((f) => f.status === 'accepted').length} files` : ''}
            {agg.first && agg.last ? ` · ${formatIsoDate(agg.first)} – ${formatIsoDate(agg.last)}` : ''}
            {` · Audio ${formatPercent(agg.audioCoverage)} · Genre ${formatPercent(agg.genreCoverage)} of listening time covered`}
          </span>
        </div>
      </footer>
    </div>
  );
}

// --- helpers ---

/** Month labels aligned above the 53 calendar week-columns. */
function CalendarMonthLabels({ calendar }: { calendar: Array<{ date: string }> }): React.JSX.Element {
  const labels: string[] = [];
  let prevMonth = -1;
  for (let week = 0; week < 53; week++) {
    const cell = calendar[week * 7];
    if (!cell) { labels.push(''); continue; }
    const month = Number(cell.date.slice(5, 7)) - 1;
    if (month !== prevMonth) {
      labels.push(MONTHS_SHORT[month]);
      prevMonth = month;
    } else {
      labels.push('');
    }
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(53, minmax(0, 1fr))', font: '400 11px/14px var(--font-mono)', color: 'var(--ink-muted)', overflow: 'visible', whiteSpace: 'nowrap' }}>
      {labels.map((l, i) => <span key={i} style={{ gridColumn: i + 1, overflow: 'visible' }}>{l}</span>)}
    </div>
  );
}

const RAMP = ['var(--ramp-0)', 'var(--ramp-1)', 'var(--ramp-2)', 'var(--ramp-3)', 'var(--ramp-4)', 'var(--ramp-5)'];

function rampFor(ms: number, calendar: Array<{ ms: number; available: boolean }>): string {
  const max = Math.max(...calendar.filter((d) => d.available).map((d) => d.ms), 0);
  if (max <= 0 || ms <= 0) return RAMP[0];
  const step = Math.min(5, Math.ceil((ms / max) * 5));
  return RAMP[step];
}

const GENRE_PALETTE = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)', 'var(--cat-6)'];
const UNKNOWN_COLOR = 'var(--line)';

function genreColor(name: string): string {
  return name.toLowerCase() === 'unknown' ? UNKNOWN_COLOR : GENRE_PALETTE[name.length % GENRE_PALETTE.length];
}

function genreNames(agg: { genres: Array<{ shares: Array<{ name: string; share: number }> }> }): string[] {
  const names: string[] = [];
  for (const year of agg.genres) {
    for (const s of year.shares) if (!names.includes(s.name)) names.push(s.name);
  }
  return names;
}

// Placeholder typed import kept local so the page compiles against the contract
// module even before it lands; the real aggregateHistory is used when present.
import { aggregateHistory } from '../data/aggregates';

function aggregate(data: HistoryData, opts: { from?: string; to?: string }) {
  return aggregateHistory(data, opts);
}

// Re-export so the tests can observe the month labels deterministically.
export { MONTHS_SHORT as calendarMonths };
