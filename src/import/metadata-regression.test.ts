import { describe, it, expect } from 'vitest';
import { runImportJob, type InputFile } from './parse';

const payload = (name: string, data: unknown): InputFile => {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return { name, size: bytes.length, buffer: bytes.buffer };
};

describe('Prepared metadata scalar validation', () => {
  it('rejects nested private metadata hidden inside the canonical built field', () => {
    const { data } = runImportJob([payload('endsong_synthetic.json', [{
      ts: '2024-01-01T00:00:00Z', ms_played: 60000,
      master_metadata_track_name: 'Synthetic', master_metadata_album_artist_name: 'Synthetic',
      master_metadata_album_album_name: 'Synthetic', spotify_track_uri: 'spotify:track:AAAAAAAAAAAAAAAAAAAAAA',
    }])]);
    if (!data) throw new Error('Missing synthetic fixture');
    data.meta.built = { ip_addr: '192.0.2.100' };
    expect(() => runImportJob([payload('prepared.json', data)])).toThrow(/built|metadata|prepared/i);
  });
});
