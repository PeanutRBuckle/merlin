import { describe, it, expect, vi } from 'vitest';
vi.mock('./limits', () => ({ LIMITS: { maxFiles: 100, maxTotalCompressed: 100000, maxExpanded: 1024, maxSingleExpanded: 1024, maxRecords: 1000 } }));
import { runImportJob, type InputFile } from './parse';

function raw(name: string, bytes: number): InputFile {
  const text = JSON.stringify([{ ts: '2024-01-01T00:00:00Z', ms_played: 60000,
    master_metadata_track_name: 'Synthetic', master_metadata_album_artist_name: 'Synthetic',
    master_metadata_album_album_name: 'Synthetic', spotify_track_uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA' }]);
  const encoded = new TextEncoder().encode(text.padEnd(bytes, ' '));
  expect(encoded.byteLength).toBe(bytes);
  return { name, size: encoded.byteLength, buffer: encoded.buffer };
}

describe('Exact cumulative request bytes', () => {
  it('counts each raw JSON byte once without weakening the real combined limit', () => {
    expect(runImportJob([raw('endsong_a.json', 450), raw('endsong_b.json', 450)]).data?.events).toHaveLength(1);
    expect(() => runImportJob([raw('endsong_a.json', 600), raw('endsong_b.json', 600)])).toThrow(/expand|budget/i);
  });
});
