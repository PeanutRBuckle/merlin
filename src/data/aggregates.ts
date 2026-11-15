/**
 * Pure, deterministic aggregation of a prepared Merlin history (version 1)
 * into the Codex summary consumed by the dashboard chapters. All dates and
 * hour/day bucketing are UTC. Never mutates the input.
 *
 * Chapter references (see merlin/site/handoff/HANDOFF.md):
 * - I   The Litany   -> topSongs / topArtists
 * - II  Hours        -> hoursOfDay / peakHour / lateShare / heaviestDay
 * - III Kalendarium  -> calendar / longestStreak / biggestDay
 * - IV  Sonus        -> audio / audioCoverage
 * - V   Genera       -> genres / genreCoverage
 * - VI  Folia Rara   -> rare (always empty: no listener counts in schema)
 */
import type {
  AggregateOptions,
  AudioBar,
  CalendarDay,
  CodexSummary,
  GenreShare,
  GenreYear,
  HistoryData,
  RankedEntry,
} from './types';

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Audio bar metadata: feature index derived pole pair, matching the Sonus chapter. */
const AUDIO_BARS: Array<{ name: string; low: string; high: string; index: number }> = [
  { name: 'Acoustic', low: 'Electric', high: 'Acoustic', index: 3 },
  { name: 'Energy', low: 'Gentle', high: 'Energetic', index: 0 },
  { name: 'Danceable', low: 'Less danceable', high: 'Danceable', index: 1 },
  { name: 'Mood', low: 'Low-valence', high: 'High-valence', index: 2 },
  { name: 'Instrumental', low: 'Vocal', high: 'Instrumental', index: 4 },
  { name: 'Tempo', low: 'Slow', high: 'Fast', index: 7 },
];

const FEATURE_COUNT = 8;
const TEMPO_MAX_BPM = 200;

function assertUtcDate(value: string, label: string): void {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new Error(`${label} must be a UTC date string formatted YYYY-MM-DD.`);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) throw new Error(`${label} is not a valid calendar date.`);
  // Reject impossible dates like 2025-02-30 that Date.parse silently rolls over.
  if (new Date(ms).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
}

/** First moment (ms) of a UTC date string. */
function dateStartMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function utcDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isCompleteAudio(features: (number | null)[]): boolean {
  return features.length === FEATURE_COUNT && features.every((v) => v !== null);
}

/**
 * Aggregate a prepared history into a Codex summary.
 *
 * - `options.from` / `options.to`: inclusive UTC date bounds (YYYY-MM-DD).
 *   Malformed dates, impossible calendar dates or from > to throw.
 * - `options.minMs`: events with ms_played >= minMs are eligible (default 30000).
 */
export function aggregateHistory(data: HistoryData, options: AggregateOptions = {}): CodexSummary {
  const from = options.from;
  const to = options.to;
  const minMs = options.minMs ?? 30000;

  if (from !== undefined) assertUtcDate(from, 'from');
  if (to !== undefined) assertUtcDate(to, 'to');
  if (from !== undefined && to !== undefined && dateStartMs(from) > dateStartMs(to)) {
    throw new Error('from must not be after to.');
  }
  if (!Number.isFinite(minMs) || minMs < 0) throw new Error('minMs must be a non-negative number.');

  const fromStart = from !== undefined ? dateStartMs(from) : -Infinity;
  // `to` is inclusive: the whole UTC day passes.
  const toEnd = to !== undefined ? dateStartMs(to) + MS_PER_DAY : Infinity;

  // Read-only pass over the events (sorted defensively; input untouched).
  const ordered = data.events.map((event, index) => ({ event, artist: data.meta.eventArtists[index] }))
    .sort((a, b) => a.event[0] - b.event[0]);
  const events = ordered.map(({ event }) => event);
  const tracks = data.tracks;

  let totalMs = 0;
  let plays = 0;
  const artistMs = new Map<string, { ms: number; plays: number }>();
  const hoursOfDay = Array<number>(24).fill(0);
  const dayMs = new Map<string, { ms: number; plays: number }>();
  const audioSum = Array<number>(6).fill(0); // weighted sums for the 6 audio bars
  let audioWeightMs = 0;
  const genreMs = new Map<number, Map<string, number>>(); // year -> family -> split ms
  let genreAnyWeightMs = 0;

  let firstSec: number | null = null;
  let lastSec: number | null = null;
  let firstDay = '';
  let lastDay = '';


  for (const [sec, trackIdx, ms] of events) {
    if (ms < minMs) continue;
    if (sec * 1000 < fromStart || sec * 1000 >= toEnd) continue;

    if (firstSec === null) firstSec = sec;
    lastSec = sec;
    plays += 1;
    totalMs += ms;

    const hour = new Date(sec * 1000).getUTCHours();
    hoursOfDay[hour] += ms;

    const day = utcDateStr(sec * 1000);
    const d = dayMs.get(day) ?? { ms: 0, plays: 0 };
    d.ms += ms;
    d.plays += 1;
    dayMs.set(day, d);
  }

  // Archive bounds come from all events (not just eligible ones) so the
  // calendar can be drawn even when the eligible range is empty.
  if (events.length) {
    firstDay = utcDateStr(events[0][0] * 1000);
    lastDay = utcDateStr(events[events.length - 1][0] * 1000);
  }

  // Second pass: attribute artists per eligible event via the raw event order.
  const artistNames = data.meta.artistNames;
  const artistKeyIdx = new Map<string, number>(); // display name -> first raw index
  let eligibleIdx = 0;
  for (const [sec, trackIdx, ms] of events) {
    // eventArtists is per raw event, so advance the index before filtering.
    const rawIdx = ordered[eligibleIdx].artist;
    eligibleIdx += 1;
    if (ms < minMs || sec * 1000 < fromStart || sec * 1000 >= toEnd) continue;
    if (rawIdx !== undefined && artistNames[rawIdx] !== undefined) {
      const name = artistNames[rawIdx] ?? 'Unknown artist';
      if (!artistKeyIdx.has(name)) artistKeyIdx.set(name, rawIdx);
      const a = artistMs.get(name) ?? { ms: 0, plays: 0 };
      a.ms += ms;
      a.plays += 1;
      artistMs.set(name, a);
    }
  }

  // Track/genre/audio accumulation, again per eligible event.
  for (const [sec, trackIdx, ms] of events) {
    if (ms < minMs || sec * 1000 < fromStart || sec * 1000 >= toEnd) continue;
    const track = tracks[trackIdx];
    if (!track) continue;

    if (isCompleteAudio(track.features)) {
      audioWeightMs += ms;
      AUDIO_BARS.forEach((bar, i) => {
        const raw = track.features[bar.index] as number;
        const value =
          bar.index === 7
            ? Math.max(0, Math.min(raw, TEMPO_MAX_BPM)) / TEMPO_MAX_BPM
            : raw;
        audioSum[i] += value * ms;
      });
    }

    const year = new Date(sec * 1000).getUTCFullYear();
    let ym = genreMs.get(year);
    if (!ym) {
      ym = new Map<string, number>();
      genreMs.set(year, ym);
    }
    if (track.families.length === 0) {
      ym.set('Unknown', (ym.get('Unknown') ?? 0) + ms);
    } else {
      genreAnyWeightMs += ms;
      const slice = ms / track.families.length;
      for (const family of track.families) {
        ym.set(family, (ym.get(family) ?? 0) + slice);
      }
    }
  }

  // Ranked lists.
  const songMs = new Map<number, { ms: number; plays: number }>();
  for (const [sec, trackIdx, ms] of events) {
    if (ms < minMs || sec * 1000 < fromStart || sec * 1000 >= toEnd) continue;
    const s = songMs.get(trackIdx) ?? { ms: 0, plays: 0 };
    s.ms += ms;
    s.plays += 1;
    songMs.set(trackIdx, s);
  }

  const songEntries: RankedEntry[] = [...songMs.entries()].map(([idx, v]) => ({
    key: `track:${idx}`,
    name: tracks[idx]?.title ?? 'Unknown title',
    subtitle: tracks[idx]?.artist ?? 'Unknown artist',
    ms: v.ms,
    plays: v.plays,
  }));
  songEntries.sort(
    (a, b) =>
      b.ms - a.ms ||
      b.plays - a.plays ||
      Number(a.key.slice(6)) - Number(b.key.slice(6)),
  );

  const artistEntries: RankedEntry[] = [...artistMs.entries()].map(([name, v]) => ({
    key: `artist:${artistKeyIdx.get(name) ?? 0}`,
    name,
    subtitle: `${v.plays} plays`,
    ms: v.ms,
    plays: v.plays,
  }));
  artistEntries.sort(
    (a, b) =>
      b.ms - a.ms ||
      b.plays - a.plays ||
      Number(a.key.slice(7)) - Number(b.key.slice(7)),
  );

  // Calendar: last 53 weeks (371 days) ending at the selected `to` or the archive last day.
  const calendar: CalendarDay[] = [];
  let longestStreak = 0;
  let biggestDay: { date: string; ms: number } | null = null;

  if (events.length) {
    // A historical selection must stay anchored to its own end date.
    const endDateStr = to ?? lastDay;
    const endMs = dateStartMs(endDateStr);
    const startMs = endMs - 370 * MS_PER_DAY;
    const archiveFirst = firstDay;
    const archiveLast = lastDay;
    let streak = 0;
    for (let ms = startMs; ms <= endMs; ms += MS_PER_DAY) {
      const dateStr = utcDateStr(ms);
      const available = dateStr >= archiveFirst && dateStr <= archiveLast
        && (from === undefined || dateStr >= from) && (to === undefined || dateStr <= to);
      const day = dayMs.get(dateStr) ?? { ms: 0, plays: 0 };
      calendar.push({ date: dateStr, ms: available ? day.ms : 0, plays: available ? day.plays : 0, available });
      if (available && day.ms > 0) {
        streak += 1;
        if (streak > longestStreak) longestStreak = streak;
        if (!biggestDay || day.ms > biggestDay.ms) biggestDay = { date: dateStr, ms: day.ms };
      } else {
        streak = 0;
      }
    }
  }

  // Genres per year.
  const genres: GenreYear[] = [...genreMs.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, ym]) => {
      const yearTotal = [...ym.values()].reduce((a, b) => a + b, 0);
      const withFamilies = [...ym.entries()]
        .filter(([name]) => name !== 'Unknown')
        .reduce((a, [, v]) => a + v, 0);
      const shares: GenreShare[] = [...ym.entries()]
        .map(([name, v]): GenreShare => ({ name, share: v / yearTotal }))
        .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
      return { year, shares, coverage: yearTotal ? withFamilies / yearTotal : 0 };
    });

  const audio: AudioBar[] = AUDIO_BARS.map((bar, i) => ({
    name: bar.name,
    low: bar.low,
    high: bar.high,
    value: audioWeightMs > 0 ? audioSum[i] / audioWeightMs : null,
  }));

  const peakHour = (() => {
    let best: number | null = null;
    let bestMs = 0;
    for (let h = 0; h < 24; h += 1) {
      if (hoursOfDay[h] > bestMs) {
        bestMs = hoursOfDay[h];
        best = h;
      }
    }
    return best;
  })();

  const lateMs = hoursOfDay.slice(21).reduce((a, b) => a + b, 0);

  return {
    hours: totalMs / MS_PER_HOUR,
    plays,
    artists: artistMs.size,
    first: firstSec !== null ? iso(firstSec) : null,
    last: lastSec !== null ? iso(lastSec) : null,
    topArtists: artistEntries.slice(0, 8),
    topSongs: songEntries.slice(0, 8),
    hoursOfDay,
    peakHour,
    lateShare: totalMs > 0 ? lateMs / totalMs : 0,
    heaviestDay: [...dayMs.entries()].sort((a, b) => b[1].ms - a[1].ms || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
    calendar,
    longestStreak,
    biggestDay,
    audio,
    audioCoverage: totalMs > 0 ? audioWeightMs / totalMs : 0,
    genres,
    genreCoverage: totalMs > 0 ? genreAnyWeightMs / totalMs : 0,
    rare: [],
  };
}

function iso(sec: number): string {
  return new Date(sec * 1000).toISOString();
}
