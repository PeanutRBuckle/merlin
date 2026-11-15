import { describe, it, expect } from 'vitest';
import { aggregateHistory } from './aggregates';
import type { HistoryData } from './types';

// Synthetic regressions for source attribution and range/coverage boundaries.
function history(events: [string, number, number][]): HistoryData {
  const rows = events.map(([date, , ms]) => [Date.parse(date) / 1000, 0, ms] as [number, number, number]);
  return {
    format: 'merlin-history', version: 1,
    tracks: [{ id: null, title: 'Synthetic', artist: 'Catalog artist', album: null, features: Array(8).fill(null), families: [], tags: [], statsTrack: [], statsAlbum: [], statsArtist: [] }],
    events: rows,
    meta: { artistNames: ['Original A', 'Original B'], eventArtists: events.map(([, artist]) => artist), first: 0, last: 0, eventMs: rows.reduce((sum, row) => sum + row[2], 0) },
  };
}

describe('Codex integration regressions', () => {
  it('preserves per-event artist attribution when defensively sorting unsorted input', () => {
    const data = history([['2025-02-02T10:00:00Z', 0, 60000], ['2025-01-01T10:00:00Z', 1, 180000]]);
    expect(aggregateHistory(data).topArtists.map(({ name, ms }) => [name, ms])).toEqual([
      ['Original B', 180000], ['Original A', 60000],
    ]);
  });

  it('anchors a historical custom calendar to its selected end, not the later archive endpoint', () => {
    const data = history([['2024-01-01T10:00:00Z', 0, 60000], ['2026-01-01T10:00:00Z', 1, 60000]]);
    const summary = aggregateHistory(data, { from: '2024-01-01', to: '2024-01-02' });
    expect(summary.calendar.at(-1)?.date).toBe('2024-01-02');
    expect(summary.calendar.find(day => day.date === '2024-01-01')?.plays).toBe(1);
    expect(summary.calendar.find(day => day.date === '2023-12-31')?.available).toBe(false);
  });

  it('marks dates excluded by a custom lower bound unavailable rather than observed zero', () => {
    const data = history([['2024-01-01T10:00:00Z', 0, 60000], ['2024-02-01T10:00:00Z', 1, 60000]]);
    const summary = aggregateHistory(data, { from: '2024-02-01', to: '2024-02-01' });
    expect(summary.calendar.find(day => day.date === '2024-01-31')?.available).toBe(false);
  });

  it('computes Hours heaviest day over the selected archive even when older than the heatmap', () => {
    const data = history([['2020-01-01T10:00:00Z', 0, 3600000], ['2026-01-01T10:00:00Z', 1, 60000]]);
    expect(aggregateHistory(data).heaviestDay).toBe('2020-01-01');
  });
});
