/**
 * Types for Merlin prepared listening history (format "merlin-history", version 1)
 * and the pure Codex aggregation built on top of it.
 *
 * These mirror the legacy site/data-core.js import contract exactly — do not
 * change that file, and keep this file compatible with its output.
 */

/** One prepared track. Extra optional fields from enrichment are allowed. */
export interface HistoryTrack {
  /** 22-char Spotify ID, or null when the source row lacked one. */
  id: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  /** 8 slots: energy, danceability, valence, acousticness, instrumentalness, speechiness, loudness, tempo. */
  features: (number | null)[];
  families: string[];
  tags: string[];
  statsTrack: string[];
  statsAlbum: string[];
  statsArtist: string[];
  [key: string]: unknown;
}

export interface HistoryMeta {
  /** Artist display names indexed by eventArtists entries. */
  artistNames: (string | null)[];
  /** Per-event artist index into artistNames (same length as events). */
  eventArtists: number[];
  /** Seconds (Unix) of the first and last event and total recorded ms. */
  first: number;
  last: number;
  eventMs: number;
  [key: string]: unknown;
}

export interface HistoryData {
  format: 'merlin-history';
  version: 1;
  tracks: HistoryTrack[];
  /** Sorted [unixSeconds, trackIndex, msPlayed] triples. */
  events: [number, number, number][];
  meta: HistoryMeta;
}

export interface AggregateOptions {
  /** Inclusive lower bound, UTC calendar date 'YYYY-MM-DD'. */
  from?: string;
  /** Inclusive upper bound, UTC calendar date 'YYYY-MM-DD'. */
  to?: string;
  /** Minimum ms_played for an event to count (default 30000). */
  minMs?: number;
}

export interface RankedEntry {
  key: string;
  name: string;
  subtitle: string;
  ms: number;
  plays: number;
}

export interface CalendarDay {
  date: string;
  ms: number;
  plays: number;
  available: boolean;
}

export interface AudioBar {
  name: string;
  low: string;
  high: string;
  value: number | null;
}

export interface GenreShare {
  name: string;
  share: number;
}

export interface GenreYear {
  year: number;
  shares: GenreShare[];
  /** Fraction of that year's listening ms with at least one family. */
  coverage: number;
}

export interface CodexSummary {
  hours: number;
  plays: number;
  artists: number;
  first: string | null;
  last: string | null;
  topArtists: RankedEntry[];
  topSongs: RankedEntry[];
  /** Listening ms per UTC hour of day (24 entries). */
  hoursOfDay: number[];
  peakHour: number | null;
  /** Fraction of eligible ms played at UTC hour >= 21. */
  lateShare: number;
  heaviestDay: string | null;
  calendar: CalendarDay[];
  longestStreak: number;
  biggestDay: { date: string; ms: number } | null;
  audio: AudioBar[];
  /** Fraction of eligible ms from tracks with complete audio features. */
  audioCoverage: number;
  genres: GenreYear[];
  /** Fraction of eligible ms from tracks with at least one family. */
  genreCoverage: number;
  /** Always empty: the current schema has no per-track listener counts. */
  rare: Array<{ key: string; name: string; artist: string; plays: number; listeners: number }>;
}
