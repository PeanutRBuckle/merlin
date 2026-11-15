// Strict RED/GREEN tests for the src/import pipeline (synthetic fixtures only).
import { describe, it, expect } from 'vitest';
import { importHistory } from './history';
import { LIMITS } from './limits';
import { preflightZip } from './zipinfo';

// --- synthetic fixtures (labeled; no real listening data) ---
const AUDIO_ROW = {
  ts: '2024-01-01T12:00:00Z',
  ms_played: 60000,
  master_metadata_track_name: 'Synthetic song',
  master_metadata_album_artist_name: 'Synthetic artist',
  master_metadata_album_album_name: 'Synthetic album',
  spotify_track_uri: 'spotify:track:0123456789ABCDEFGHIJKL',
  ip_addr: '192.0.2.1',
};
const OTHER_ROW = { ...AUDIO_ROW, ts: '2024-01-02T12:00:00Z', ms_played: 120000 };
const PODCAST_ROW = {
  ts: '2024-01-03T12:00:00Z',
  ms_played: 80000,
  episode_name: 'Synthetic episode',
  spotify_episode_uri: 'spotify:episode:0123456789ABCDEFGHIJKL',
};

const file = (name: string, content: string | Uint8Array) =>
  new File([content as BlobPart], name, { type: 'application/json' });

const jsonFile = (name: string, rows: unknown) => file(name, JSON.stringify(rows));

// Minimal hand-built ZIP with a central directory whose claimed uncompressed
// size lies (zip-bomb preflight target). Labeled synthetic.
function fakeZipWithClaimedUncompressed(uncompressedSize: number): Uint8Array {
  const name = new TextEncoder().encode('history.json');
  // Proper local header (small, honest) — the central directory is the liar.
  const local = new Uint8Array(30 + name.length);
  const dvL = new DataView(local.buffer);
  dvL.setUint32(0, 0x04034b50, true); // local header signature
  dvL.setUint16(4, 20, true); // version
  dvL.setUint16(8, 0, true); // method: stored
  dvL.setUint16(26, name.length, true); // name length
  local.set(name, 30);
  const cdEntry = new Uint8Array(46 + name.length);
  const dv = new DataView(cdEntry.buffer);
  dv.setUint32(0, 0x02014b50, true); // central directory header signature
  dv.setUint16(10, 0, true); // method: stored
  dv.setUint32(20, 0, true); // compressed size
  dv.setUint32(24, uncompressedSize, true); // claimed uncompressed size
  dv.setUint32(42, 0, true); // local header offset
  cdEntry.set(name, 46);
  const eocd = new Uint8Array(22);
  const dv2 = new DataView(eocd.buffer);
  dv2.setUint32(0, 0x06054b50, true);
  dv2.setUint16(10, 1, true); // total entry count (EOCD offset 10)
  dv2.setUint32(12, cdEntry.length, true); // central dir size
  dv2.setUint32(16, local.length, true); // central dir offset
  const out = new Uint8Array(local.length + cdEntry.length + eocd.length);
  out.set(local, 0);
  out.set(cdEntry, local.length);
  out.set(eocd, local.length + cdEntry.length);
  return out;
}

// minimal valid EOCD-less header (truncated archive: no EOCD present)
const truncatedZip = file('export.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]));

describe('importHistory — raw Spotify JSON', () => {
  it('imports two audio files with legacy counting semantics', async () => {
    const one = jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW, OTHER_ROW, PODCAST_ROW]);
    const two = jsonFile('Streaming_History_Audio_1.json', [
      { ...AUDIO_ROW },
      { ...AUDIO_ROW, ip_addr: '192.0.2.2' },
    ]);
    const { data, files } = await importHistory([one, two]);
    const report = data.meta.importReport as { duplicates: number; excludedNonMusic: number };
    expect(data.format).toBe('merlin-history');
    expect(data.events.length).toBe(3);
    expect(report.duplicates).toBe(1);
    expect(report.excludedNonMusic).toBe(1); // podcast row inside an audio file is excluded by legacy
    expect(data.meta.eventMs).toBe(240000);
    files.forEach((f) => expect(f.status).toBe('accepted'));
  });

  it('reports skipped video/podcast files explicitly', async () => {
    const video = jsonFile('Streaming_History_Video_0.json', [PODCAST_ROW]);
    const audio = jsonFile('endsong_0.json', [AUDIO_ROW]);
    const { data, files } = await importHistory([video, audio]);
    const v = files.find((f) => f.name === 'Streaming_History_Video_0.json')!;
    expect(v.status).toBe('skipped');
    expect(v.reason).toMatch(/video|podcast/i);
    expect(data.events.length).toBe(1);
  });

  it('rejects when no listening history is found', async () => {
    const video = jsonFile('Streaming_History_Video_0.json', [PODCAST_ROW]);
    await expect(importHistory([video])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'skipped' }),
      ]),
    });
  });

  it('skips irrelevant non-history JSON with a reason instead of failing', async () => {
    const noise = jsonFile('readme.json', { hello: 'world' });
    const audio = jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW]);
    const { files } = await importHistory([noise, audio]);
    expect(files.find((f) => f.name === 'readme.json')!.status).toBe('skipped');
  });

  it('rejects malformed apparent history without silently accepting the batch', async () => {
    const bad = jsonFile('Streaming_History_Audio_0.json', [
      { ...AUDIO_ROW, ms_played: -1 },
    ]);
    await expect(importHistory([bad])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'Streaming_History_Audio_0.json', status: 'error' }),
      ]),
    });
  });

  it('rejects syntactically broken JSON as an error', async () => {
    const broken = file('Streaming_History_Audio_0.json', '{"ts": ');
    await expect(importHistory([broken])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error' }),
      ]),
    });
  });

  it('rejects invalid UTF-8 payloads before parsing', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x81]);
    const bad = file('Streaming_History_Audio_0.json', bytes);
    await expect(importHistory([bad])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error', reason: expect.stringMatching(/utf-8|encoding/i) }),
      ]),
    });
  });
});

describe('importHistory — prepared Merlin JSON', () => {
  it('round-trips a prepared file with no mutations', async () => {
    const { data, files } = await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW, OTHER_ROW])]);
    const prepared = JSON.parse(JSON.stringify(data));
    const round = await importHistory([new File([JSON.stringify(prepared)], 'prepared.json')]);
    expect(round.files[0].status).toBe('accepted');
    expect(round.data.events).toEqual(prepared.events);
    expect(round.data.tracks).toEqual(prepared.tracks);
    expect(round.data.meta.importReport).toEqual(prepared.meta.importReport);
  });

  it('rejects a prepared file mixed with raw history', async () => {
    const raw = jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW]);
    const prepared = file('prepared.json', JSON.stringify(await preparedViaRoundtrip()));
    await expect(importHistory([prepared, raw])).rejects.toThrow(/alone|prepared/i);
  });

  it('rejects a JSON lookalike pretending to be prepared history', async () => {
    const lookalike = jsonFile('prepared.json', {
      format: 'merlin-history',
      version: 1,
      tracks: [{ id: 'nope', features: [] }],
      events: [[0, 0, 1]],
      meta: { artistNames: [], eventArtists: [] },
    });
    await expect(importHistory([lookalike])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error' }),
      ]),
    });
  });

  async function preparedViaRoundtrip() {
    const { data } = await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW])]);
    return data;
  }
});

describe('importHistory — ZIP archives', () => {
  it('accepts a real zip with audio JSON and skips a nested zip entry', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const nested = zipSync({ 'inner.json': strToU8(JSON.stringify([AUDIO_ROW])) });
    const outer = zipSync({
      'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW, OTHER_ROW])),
      'nested-export.zip': nested,
    });
    const { data, files } = await importHistory([file('export.zip', outer)]);
    expect(data.events.length).toBe(2);
    const nestedResult = files.find((f) => f.name.endsWith('nested-export.zip'))!;
    expect(nestedResult.status).toBe('skipped');
  });

  it('rejects a truncated archive before any allocation', async () => {
    await expect(importHistory([truncatedZip])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error', reason: expect.stringMatching(/truncat|corrupt/i) }),
      ]),
    });
  });

  it('rejects zip bombs whose central directory claims an enormous expanded size', async () => {
    const bomb = file('bomb.zip', fakeZipWithClaimedUncompressed(600 * 1024 * 1024));
    await expect(importHistory([bomb])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error', reason: expect.stringMatching(/expand|bomb|limit/i) }),
      ]),
    });
  });

  it('validates zip entries by content, not extension', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const outer = zipSync({
      'weird-name-no-extension': strToU8(JSON.stringify([AUDIO_ROW])),
      'notes.txt': strToU8('not json at all'),
    });
    const { data, files } = await importHistory([file('export.zip', outer)]);
    expect(data.events.length).toBe(1);
    expect(files.find((f) => f.name.endsWith('notes.txt'))!.status).toBe('skipped');
  });
});

describe('importHistory — request guards', () => {
  it('rejects more than the file-count limit before reading anything', async () => {
    const many = Array.from({ length: LIMITS.maxFiles + 1 }, () =>
      jsonFile('x.json', [AUDIO_ROW]));
    await expect(importHistory(many)).rejects.toThrow(/too many|file/i);
  });

  it('rejects when declared total size exceeds the compressed budget', async () => {
    const huge = new File([new Uint8Array(2)], 'big.json', { lastModified: 0 });
    Object.defineProperty(huge, 'size', { value: LIMITS.maxTotalCompressed + 1 });
    await expect(importHistory([huge])).rejects.toThrow(/size|budget|large/i);
  });

  it('rejects expanded-size budget violations advertised by the archive', async () => {
    const bomb = file('bomb.zip', fakeZipWithClaimedUncompressed(LIMITS.maxExpanded + 1));
    await expect(importHistory([bomb])).rejects.toThrow(/bomb|expand|limit/i);
  });
});

describe('importHistory — progress + worker contract', () => {
  it('reports all four stages in order', async () => {
    const stages: string[] = [];
    await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW])], (p) => {
      stages.push(p.stage);
    });
    for (const stage of ['reading', 'merging', 'enriching', 'binding']) {
      expect(stages).toContain(stage);
    }
    expect(stages[0]).toBe('reading');
  });

  it('settles cleanly: the worker path is exercised or a pure fallback is used', async () => {
    const { data } = await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW])]);
    expect(data.events.length).toBe(1);
  });

  it('never fakes enrichment progress: the enriching message is truthful', async () => {
    const messages: string[] = [];
    await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW])], (p: { message: string }) => {
      messages.push(p.message);
    });
    const enriching = messages.filter((m) => /sound and genre/i.test(m));
    expect(enriching).toHaveLength(0);
  });
});

// --- corrupt-byte helpers: locate the central directory and patch fields ---
function withCentralPatched(zip: Uint8Array, patch: (dv: DataView, entry: number) => void): Uint8Array {
  const out = new Uint8Array(zip);
  const dv = new DataView(out.buffer);
  let found = 0;
  for (let i = 0; i < out.length - 4; i++) {
    if (dv.getUint32(i, true) === 0x02014b50) {
      patch(dv, i);
      found++;
    }
  }
  expect(found).toBeGreaterThan(0);
  return out;
}
function withLocalPatched(zip: Uint8Array, patch: (dv: DataView) => void): Uint8Array {
  const out = new Uint8Array(zip);
  const dv = new DataView(out.buffer);
  expect(dv.getUint32(0, true)).toBe(0x04034b50);
  patch(dv);
  return out;
}

describe('importHistory — strict audio classification', () => {
  it('does not accept an array of arbitrary objects as listening history', async () => {
    const noise = jsonFile('Streaming_History_Audio_0.json', [{ foo: 'bar' }, { other: 1 }]);
    await expect(importHistory([noise])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'Streaming_History_Audio_0.json', status: 'skipped' }),
      ]),
    });
  });

  it('does not let one invalid file fail the batch when valid history is present (partial success forbidden)', async () => {
    const good = jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW]);
    const bad = file('Streaming_History_Audio_1.json', '{"ts": ');
    await expect(importHistory([good, bad])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ name: 'Streaming_History_Audio_1.json', status: 'error' }),
      ]),
    });
  });
});

describe('importHistory — prepared schema hardening', () => {
  it('strips unknown top-level and track fields (no arbitrary metadata survives export)', async () => {
    const base = await preparedViaRoundtrip();
    const poisoned = JSON.parse(JSON.stringify(base));
    poisoned.debug_source_ip = '192.0.2.99';
    poisoned.unknownBlob = { nested: true };
    poisoned.tracks[0].ip_addr = '192.0.2.99';
    poisoned.tracks[0].secretField = 'nope';
    const round = await importHistory([file('prepared.json', JSON.stringify(poisoned))]);
    expect(round.files[0].status).toBe('accepted');
    expect(round.data).not.toHaveProperty('debug_source_ip');
    expect(round.data).not.toHaveProperty('unknownBlob');
    expect(round.data.tracks[0]).not.toHaveProperty('ip_addr');
    expect(round.data.tracks[0]).not.toHaveProperty('secretField');
    // Legitimate content survives sanitization.
    expect(round.data.events).toEqual(base.events);
    expect(round.data.tracks[0].title).toEqual(base.tracks[0].title);
    expect(round.data.meta.artistNames).toEqual(base.meta.artistNames);
  });

  it('rejects a prepared file with an unsupported version', async () => {
    const base = await preparedViaRoundtrip();
    base.version = 2;
    await expect(importHistory([file('prepared.json', JSON.stringify(base))])).rejects.toMatchObject({
      files: expect.arrayContaining([
        expect.objectContaining({ status: 'error', reason: expect.stringMatching(/version/i) }),
      ]),
    });
  });

  it('accepts a prepared file alongside irrelevant skipped files', async () => {
    const base = await preparedViaRoundtrip();
    const noise = jsonFile('readme.json', { hello: 'world' });
    const round = await importHistory([file('prepared.json', JSON.stringify(base)), noise]);
    expect(round.files[0].status).toBe('accepted');
  });

  it('rejects multiple prepared files', async () => {
    const base = await preparedViaRoundtrip();
    const a = file('a.json', JSON.stringify(base));
    const b = file('b.json', JSON.stringify(base));
    await expect(importHistory([a, b])).rejects.toThrow(/alone|prepared/i);
  });

  it('rejects a zip containing both a prepared entry and raw history entries', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const base = await preparedViaRoundtrip();
    const outer = zipSync({
      'prepared.json': strToU8(JSON.stringify(base)),
      'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])),
    });
    await expect(importHistory([file('export.zip', outer)])).rejects.toThrow(/alone|prepared/i);
  });

  async function preparedViaRoundtrip() {
    const { data } = await importHistory([jsonFile('Streaming_History_Audio_0.json', [AUDIO_ROW])]);
    return JSON.parse(JSON.stringify(data));
  }
});

describe('importHistory — cumulative request budgets', () => {
  it('rejects two archives whose combined claimed expansion exceeds the request budget', async () => {
    const claim = 150 * 1024 * 1024; // each under maxExpanded, together over
    const build = () => fakeZipWithClaimedUncompressed(claim);
    await expect(importHistory([file('a.zip', build()), file('b.zip', build())])).rejects.toThrow(/bomb|expand|budget|limit/i);
  });

  it('rejects a single zip entry claiming more than the single-entry expansion cap', async () => {
    const bomb = file('bomb.zip', fakeZipWithClaimedUncompressed(LIMITS.maxSingleExpanded + 1));
    await expect(importHistory([bomb])).rejects.toThrow(/bomb|expand|limit/i);
  });
});

describe('importHistory — archive integrity (CRC, flags, local headers)', () => {
  const realZip = async () => {
    const { zipSync, strToU8 } = await import('fflate');
    return zipSync({ 'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])) });
  };

  it('rejects a zip whose stored CRC does not match the inflated content', async () => {
    const zipped = await realZip();
    const entries = preflightZip(zipped);
    const corrupted = withCentralPatched(zipped, (dv, entry) => {
      dv.setUint32(entry + 16, entries[0].crc32 ^ 0xffffffff, true); // crc field
    });
    await expect(importHistory([file('export.zip', corrupted)])).rejects.toThrow(/crc|integrity|corrupt/i);
  });

  it('rejects encrypted archives', async () => {
    const zipped = await realZip();
    const central = withCentralPatched(zipped, (dv, entry) => {
      dv.setUint16(entry + 8, dv.getUint16(entry + 8, true) | 1, true);
    });
    const both = withLocalPatched(central, (dv) => {
      dv.setUint16(6, dv.getUint16(6, true) | 1, true);
    });
    await expect(importHistory([file('export.zip', both)])).rejects.toThrow(/encrypt/i);
  });

  it('rejects unsupported compression methods', async () => {
    const zipped = await realZip();
    const central = withCentralPatched(zipped, (dv, entry) => {
      dv.setUint16(entry + 10, 99, true);
    });
    const both = withLocalPatched(central, (dv) => {
      dv.setUint16(8, 99, true);
    });
    await expect(importHistory([file('export.zip', both)])).rejects.toThrow(/compression/i);
  });

  it('rejects a local header whose sizes lie about the central directory', async () => {
    const zipped = await realZip();
    const patched = withLocalPatched(zipped, (dv) => {
      dv.setUint32(22, 4242, true); // local uncompressed size
    });
    await expect(importHistory([file('export.zip', patched)])).rejects.toThrow(/bomb|corrupt|mismatch/i);
  });

  it('skips unrelated binary entries (e.g. .png) instead of failing UTF-8 decoding', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);
    const outer = zipSync({
      'cover.png': png,
      'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])),
    });
    const { data, files } = await importHistory([file('export.zip', outer)]);
    expect(data.events.length).toBe(1);
    expect(files.find((f: { name: string }) => f.name.endsWith('cover.png'))!.status).toBe('skipped');
  });

  it('classifies zip entries by basename, not full path, for video folder names', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const outer = zipSync({
      'videos/Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])),
    });
    const { data, files } = await importHistory([file('export.zip', outer)]);
    expect(data.events.length).toBe(1);
    expect(files[0].status).toBe('accepted');
  });
});
