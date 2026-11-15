import { describe, it, expect } from 'vitest';
import { aggregateHistory } from './aggregates';
import type { HistoryData, HistoryTrack } from './types';

// Deterministic fixture mirroring the legacy site/data-core.js prepared format.
const DAY_MS = 86400000;

const utc = (y: number, m: number, d: number, h = 0, min = 0) =>
  Math.floor(Date.UTC(y, m, d, h, min) / 1000);

function mkTrack(over: Partial<HistoryTrack> & { title: string }): HistoryTrack {
  const base: HistoryTrack = {
    id: null,
    title: over.title,
    artist: null,
    album: null,
    features: Array(8).fill(null),
    families: [],
    tags: [],
    statsTrack: [],
    statsAlbum: [],
    statsArtist: [],
  };
  return Object.assign(base, over) as HistoryTrack;
}

// t0 complete audio, Rock. t1 incomplete audio, no families. t2 complete audio, Jazz+Rock.
const tracks: HistoryTrack[] = [
  mkTrack({
    title: 'Song A',
    artist: 'Alpha',
    families: ['Rock'],
    features: [0.5, 0.6, 0.4, 0.2, 0.1, 0.1, -5, 400], // tempo 400 clamps to 1.0
  }),
  mkTrack({
    title: 'Song B',
    features: [null, 0.5, 0.5, null, 0.2, 0.1, -5, 100], // energy + acousticness missing
  }),
  mkTrack({
    title: 'Tie',
    artist: 'Beta',
    families: ['Jazz', 'Rock'],
    features: [0.8, 0.9, 0.6, 0.1, 0.9, 0.05, -3, 120],
  }),
];

// artistNames index 2 is null -> 'Unknown artist' attribution.
const events: [number, number, number][] = [
  [utc(2025, 0, 15, 3), 0, 60000], // e1 eligible
  [utc(2025, 0, 16, 22, 30), 1, 30000], // e2 eligible (exactly minMs)
  [utc(2025, 0, 16, 23), 0, 10000], // e3 below default minMs -> excluded
  [utc(2025, 0, 17, 12), 2, 60000], // e4 eligible
  [utc(2024, 5, 1, 9), 2, 30000], // e5 eligible
];

function fixture(): HistoryData {
  return {
    format: 'merlin-history',
    version: 1,
    tracks: JSON.parse(JSON.stringify(tracks)),
    events: JSON.parse(JSON.stringify(events)),
    meta: {
      artistNames: ['Alpha', 'Beta', null],
      // Per-event artists must align with the supplied event order, not a future sort:
      // e1(Alpha), e2(null), e3(Alpha, too short), e4(Beta), e5(Beta).
      eventArtists: [0, 2, 0, 1, 1],
      first: events[0][0],
      last: events[events.length - 1][0],
      eventMs: events.reduce((n, e) => n + e[2], 0),
    },
  };
}

const iso = (s: number) => new Date(s * 1000).toISOString();

describe('aggregateHistory — hero figures', () => {
  it('counts only eligible events with the default 30000 ms threshold, UTC', () => {
    const s = aggregateHistory(fixture());
    // Eligible ms: 60000 + 30000 + 60000 + 30000 = 180000 -> 0.05 h
    expect(s.hours).toBe(0.05);
    expect(s.plays).toBe(4);
    // Alpha, Beta and the null-name artist (Unknown) all attributed
    expect(s.artists).toBe(3);
    expect(s.first).toBe(iso(events[4][0])); // 2024-06-01T09:00:00Z
    expect(s.last).toBe(iso(events[3][0])); // 2025-01-17T12:00:00Z
  });

  it('honours a custom minMs threshold', () => {
    const s = aggregateHistory(fixture(), { minMs: 60000 });
    expect(s.plays).toBe(2); // only e1 and e4
    expect(s.hours).toBe(60000 * 2 / 3.6e6);
  });
});

describe('aggregateHistory — I The Litany', () => {
  it('ranks songs by ms with distinct track identities and per-event artist attribution', () => {
    const s = aggregateHistory(fixture());
    expect(s.topSongs).toEqual([
      { key: 'track:2', name: 'Tie', subtitle: 'Beta', ms: 90000, plays: 2 },
      { key: 'track:0', name: 'Song A', subtitle: 'Alpha', ms: 60000, plays: 1 },
      { key: 'track:1', name: 'Song B', subtitle: 'Unknown artist', ms: 30000, plays: 1 },
    ]);
    // Beta gets e4 + e5 (60000 + 30000); the null artist name becomes Unknown.
    expect(s.topArtists).toEqual([
      { key: 'artist:1', name: 'Beta', subtitle: '2 plays', ms: 90000, plays: 2 },
      { key: 'artist:0', name: 'Alpha', subtitle: '1 plays', ms: 60000, plays: 1 },
      { key: 'artist:2', name: 'Unknown artist', subtitle: '1 plays', ms: 30000, plays: 1 },
    ]);
  });

  it('breaks ms ties deterministically by plays, then identity order', () => {
    const s = aggregateHistory(fixture(), { from: '2025-01-15', to: '2025-01-15' });
    // Only e1 (Song A, 60000). Track order tie: lower track index wins.
    expect(s.topSongs).toEqual([
      { key: 'track:0', name: 'Song A', subtitle: 'Alpha', ms: 60000, plays: 1 },
    ]);
  });
});

describe('aggregateHistory — II Hours', () => {
  it('buckets listening by UTC hour, picks first peak, and computes late share by ms', () => {
    const s = aggregateHistory(fixture());
    expect(s.hoursOfDay[3]).toBe(60000); // e1 03:00 UTC
    expect(s.hoursOfDay[9]).toBe(30000); // e5 09:00 UTC
    expect(s.hoursOfDay[12]).toBe(60000); // e4 12:00 UTC
    expect(s.hoursOfDay[22]).toBe(30000); // e2 22:30 UTC
    expect(s.hoursOfDay.reduce((a, b) => a + b, 0)).toBe(180000);
    // 60000 appears at hours 3 and 12; lowest hour wins
    expect(s.peakHour).toBe(3);
    // late = ms at hour >= 21 UTC: only e2 (30000)
    expect(s.lateShare).toBeCloseTo(30000 / 180000, 12);
    expect(s.heaviestDay).toBe('2025-01-15'); // tie 01-15 vs 01-17 at 60000 -> earliest
  });

  it('returns a null peak and zero late share with no eligible events', () => {
    const s = aggregateHistory(fixture(), { from: '2026-01-01', to: '2026-01-05' });
    expect(s.peakHour).toBeNull();
    expect(s.lateShare).toBe(0);
    expect(s.heaviestDay).toBeNull();
    expect(s.plays).toBe(0);
  });
});

describe('aggregateHistory — III Kalendarium', () => {
  it('covers the last 53 weeks ending at the selected `to`, marking future and pre-archive days unavailable', () => {
    const s = aggregateHistory(fixture(), { to: '2025-01-20' });
    expect(s.calendar).toHaveLength(371);
    const end = '2025-01-20';
    expect(s.calendar.at(-1)!.date).toBe(end);
    // 370 days earlier than 2025-01-20 is 2024-01-16
    expect(s.calendar[0].date).toBe('2024-01-16');
    const byDate = new Map(s.calendar.map((d) => [d.date, d]));
    // Before the archive's first listening day (2024-06-01): unavailable, zero
    expect(byDate.get('2024-01-16')).toEqual({ date: '2024-01-16', ms: 0, plays: 0, available: false });
    expect(byDate.get('2024-05-31')).toEqual({ date: '2024-05-31', ms: 0, plays: 0, available: false });
    // Archive first day: available with ms
    expect(byDate.get('2024-06-01')).toEqual({ date: '2024-06-01', ms: 30000, plays: 1, available: true });
    // Silent but inside archive: available, zero (missing listening vs zero listening)
    expect(byDate.get('2024-06-02')).toEqual({ date: '2024-06-02', ms: 0, plays: 0, available: true });
    expect(byDate.get('2025-01-14')).toEqual({ date: '2025-01-14', ms: 0, plays: 0, available: true });
    // Listening days
    expect(byDate.get('2025-01-16')).toEqual({ date: '2025-01-16', ms: 30000, plays: 1, available: true });
    // After the archive's last day but <= selected `to`: future, unavailable
    expect(byDate.get('2025-01-18')).toEqual({ date: '2025-01-18', ms: 0, plays: 0, available: false });
    expect(byDate.get('2025-01-20')).toEqual({ date: '2025-01-20', ms: 0, plays: 0, available: false });
  });

  it('ends at the archive last day when no `to` is given', () => {
    const s = aggregateHistory(fixture());
    expect(s.calendar).toHaveLength(371);
    expect(s.calendar.at(-1)!.date).toBe('2025-01-17');
    expect(s.calendar.at(-1)!.available).toBe(true);
    expect(s.calendar.at(-1)!.ms).toBe(60000);
  });

  it('computes the longest streak and biggest day over available days', () => {
    const s = aggregateHistory(fixture());
    // 2025-01-15, 16, 17 all have listening
    expect(s.longestStreak).toBe(3);
    expect(s.biggestDay).toEqual({ date: '2025-01-15', ms: 60000 });
  });

  it('treats a day whose only events fall below minMs as silent but available', () => {
    const s = aggregateHistory(fixture(), { from: '2025-01-16', to: '2025-01-16', minMs: 60000 });
    const day = s.calendar.find((d) => d.date === '2025-01-16')!;
    expect(day).toEqual({ date: '2025-01-16', ms: 0, plays: 0, available: true });
    expect(s.biggestDay).toBeNull();
    expect(s.longestStreak).toBe(0);
  });
});

describe('aggregateHistory — IV Sonus', () => {
  it('weights audio features by eligible ms on complete tracks only', () => {
    const s = aggregateHistory(fixture());
    // Complete-audio eligible ms: t0 60000 (e1) + t2 90000 (e4, e5) = 150000 of 180000
    expect(s.audioCoverage).toBeCloseTo(150000 / 180000, 12);
    const byName = new Map(s.audio.map((a) => [a.name, a]));
    expect(s.audio).toHaveLength(6);
    expect([...byName.keys()]).toEqual([
      'Acoustic', 'Energy', 'Danceable', 'Mood', 'Instrumental', 'Tempo',
    ]);
    // acousticness: t0 0.2 * 60000, t2 0.1 * 90000
    expect(byName.get('Acoustic')!.value).toBeCloseTo((60000 * 0.2 + 90000 * 0.1) / 150000, 12);
    expect(byName.get('Acoustic')!.low).toBe('Electric');
    expect(byName.get('Acoustic')!.high).toBe('Acoustic');
    // tempo: t0 clamps 400 -> 1, t2 120/200 = 0.6
    expect(byName.get('Tempo')!.value).toBeCloseTo((60000 * 1 + 90000 * 0.6) / 150000, 12);
    expect(byName.get('Tempo')!.low).toBe('Slow');
    expect(byName.get('Tempo')!.high).toBe('Fast');
    // valence pole naming
    expect(byName.get('Mood')!.low).toBe('Low-valence');
    expect(byName.get('Mood')!.high).toBe('High-valence');
  });

  it('reports null audio values when no eligible event has complete features', () => {
    const d = fixture();
    d.tracks.forEach((t) => t.features.fill(null));
    const s = aggregateHistory(d);
    expect(s.audio.every((a) => a.value === null)).toBe(true);
    expect(s.audioCoverage).toBe(0);
  });
});

describe('aggregateHistory — V Genera', () => {
  it('splits ms equally across multiple families and adds Unknown for missing tracks', () => {
    const s = aggregateHistory(fixture());
    expect(s.genres.map((g) => g.year)).toEqual([2024, 2025]);
    expect(s.genreCoverage).toBeCloseTo(150000 / 180000, 12);

    // 2024: t2 30000 split Jazz/Rock equally
    expect(s.genres[0].shares).toEqual([
      { name: 'Jazz', share: 0.5 },
      { name: 'Rock', share: 0.5 },
    ]);
    expect(s.genres[0].coverage).toBe(1);

    // 2025: Rock 60000(e1) + 30000(half e4) = 90000/150000; Jazz 30000/150000;
    // Unknown = e2's 30000 (no families); coverage = 120000/150000
    expect(s.genres[1].shares).toEqual([
      { name: 'Rock', share: 0.6 },
      { name: 'Jazz', share: 0.2 },
      { name: 'Unknown', share: 0.2 },
    ]);
    expect(s.genres[1].coverage).toBeCloseTo(0.8, 12);
    for (const g of s.genres) {
      expect(g.shares.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 12);
    }
  });

  it('adds an Unknown year share when no eligible track has families', () => {
    const d = fixture();
    d.tracks.forEach((t) => (t.families = []));
    const s = aggregateHistory(d);
    expect(s.genreCoverage).toBe(0);
    for (const g of s.genres) {
      expect(g.shares).toEqual([{ name: 'Unknown', share: 1 }]);
      expect(g.coverage).toBe(0);
    }
  });
});

describe('aggregateHistory — VI Folia Rara', () => {
  it('is always empty: the current schema has no listener counts', () => {
    expect(aggregateHistory(fixture()).rare).toEqual([]);
  });
});

describe('aggregateHistory — range validation', () => {
  it('treats the range bounds inclusively in UTC', () => {
    const s = aggregateHistory(fixture(), { from: '2025-01-15', to: '2025-01-16' });
    expect(s.plays).toBe(2); // e1 (03:00 on 15th) and e2 (22:30 on 16th); e3 too short
    expect(s.first).toBe(iso(events[0][0]));
    expect(s.last).toBe(iso(events[1][0]));
  });

  it('throws on malformed dates and inverted ranges', () => {
    expect(() => aggregateHistory(fixture(), { from: '2025/01/15' })).toThrow();
    expect(() => aggregateHistory(fixture(), { from: '2025-1-15' })).toThrow();
    expect(() => aggregateHistory(fixture(), { from: '2025-13-01' })).toThrow();
    expect(() => aggregateHistory(fixture(), { to: '2025-02-30' })).toThrow();
    expect(() => aggregateHistory(fixture(), { from: '2025-02-01', to: '2025-01-01' })).toThrow();
  });

  it('returns safe zeroes and nulls for an empty eligible range', () => {
    const s = aggregateHistory(fixture(), { from: '2026-01-01', to: '2026-01-05' });
    expect(s.hours).toBe(0);
    expect(s.plays).toBe(0);
    expect(s.artists).toBe(0);
    expect(s.first).toBeNull();
    expect(s.last).toBeNull();
    expect(s.topSongs).toEqual([]);
    expect(s.topArtists).toEqual([]);
    expect(s.biggestDay).toBeNull();
    expect(s.longestStreak).toBe(0);
    expect(s.genres).toEqual([]);
    expect(s.hoursOfDay).toEqual(Array(24).fill(0));
  });
});

describe('aggregateHistory — empty archive', () => {
  it('handles a history with zero events safely', () => {
    const d = fixture();
    d.events = [];
    d.meta.eventArtists = [];
    const s = aggregateHistory(d);
    expect(s.plays).toBe(0);
    expect(s.first).toBeNull();
    expect(s.last).toBeNull();
    expect(s.calendar).toEqual([]);
    expect(s.audio.every((a) => a.value === null)).toBe(true);
    expect(s.rare).toEqual([]);
  });
});

describe('aggregateHistory — purity', () => {
  it('never mutates the input data', () => {
    const d = fixture();
    const snapshot = JSON.stringify(d);
    aggregateHistory(d, { from: '2024-01-01', to: '2026-01-01' });
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});
