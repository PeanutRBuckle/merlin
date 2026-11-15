// Strict RED/GREEN hardening regressions (synthetic fixtures only).
// Covers: cumulative expanded budget, prepared-file schema whitelisting,
// mixed/malformed history arrays, ZIP duplicate/size/UTF-8 integrity, and
// zipinfo local-vs-central agreement. Reduced limits via vi.mock so no test
// allocates anywhere near the real 256 MiB budget.
import { describe, it, expect, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { runImportJob, type InputFile } from './parse';
import { preflightZip, ZipPreflightError } from './zipinfo';

// Mutable mock limits — tests shrink the budget without huge allocations.
const mockLimits = vi.hoisted(() => ({
  maxFiles: 100,
  maxTotalCompressed: 1 << 30,
  maxExpanded: 1 << 30,
  maxSingleExpanded: 1 << 30,
  maxRecords: 2_000_000,
}));
vi.mock('./limits', () => ({ LIMITS: mockLimits }));

const AUDIO_ROW = {
  ts: '2024-01-01T12:00:00Z',
  ms_played: 60000,
  master_metadata_track_name: 'Synthetic song',
  master_metadata_album_artist_name: 'Synthetic artist',
  master_metadata_album_album_name: 'Synthetic album',
  spotify_track_uri: 'spotify:track:0123456789ABCDEFGHIJKL',
  ip_addr: '192.0.2.1',
};

const inputFile = (name: string, content: string | Uint8Array): InputFile => {
  const buf = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return { name, size: buf.byteLength, buffer: buf.slice().buffer };
};
const jsonInput = (name: string, rows: unknown) => inputFile(name, JSON.stringify(rows));
const pad = (n: number) => 'x'.repeat(n); // synthetic filler, no real data

// Hand-built ZIP with two entries sharing one exact name (duplicate collapse
// target). Stored entries so no inflate is required to build it.
function zipWithDuplicateNames(): Uint8Array {
  const chunks: Uint8Array[] = [];
  const name = new TextEncoder().encode('history.json');
  const content = new TextEncoder().encode(JSON.stringify([AUDIO_ROW]));
  const offsets: number[] = [];
  let cursor = 0;
  for (let i = 0; i < 2; i++) {
    const local = new Uint8Array(30 + name.length + content.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(26, name.length, true);
    dv.setUint32(18, content.length, true); // crc-32 of content
    dv.setUint32(22, content.length, true); // compressed
    dv.setUint32(26 - 4, content.length, true); // uncompressed (offset 18+4)
    local.set(name, 30);
    local.set(content, 30 + name.length);
    // recompute crc properly below via patch — synthetic, values not verified here
    offsets.push(cursor);
    chunks.push(local);
    cursor += local.length;
  }
  const cdStart = cursor;
  const cds: Uint8Array[] = [];
  for (let i = 0; i < 2; i++) {
    const cd = new Uint8Array(46 + name.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(10, 0, true); // stored
    dv.setUint16(28, name.length, true); // central name length
    dv.setUint32(20, content.length, true);
    dv.setUint32(24, content.length, true);
    dv.setUint32(42, offsets[i], true);
    cd.set(name, 46);
    cds.push(cd);
  }
  const cdSize = cds.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const dv2 = new DataView(eocd.buffer);
  dv2.setUint32(0, 0x06054b50, true);
  dv2.setUint16(10, 2, true);
  dv2.setUint32(12, cdSize, true);
  dv2.setUint32(16, cdStart, true);
  const total = cursor + cdSize + 22;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  for (const c of cds) { out.set(c, p); p += c.length; }
  out.set(eocd, p);
  return out;
}

async function preparedFixture(): Promise<Record<string, unknown>> {
  const { data } = await runImportJob([jsonInput('Streaming_History_Audio_0.json', [AUDIO_ROW])]);
  return JSON.parse(JSON.stringify(data!));
}

describe('cumulative expanded budget (regression)', () => {
  it('fails when two individually-valid small zips exceed the combined budget', () => {
    mockLimits.maxExpanded = 1024;
    mockLimits.maxSingleExpanded = 1 << 30;
    try {
      const z = zipSync({ 'Streaming_History_Audio_0.json': strToU8(JSON.stringify([{ ...AUDIO_ROW, master_metadata_track_name: 'Synthetic ' + pad(500) }])) });
      expect(() => runImportJob([inputFile('a.zip', z), inputFile('b.zip', z)])).toThrow(/bomb|expand|budget|limit/i);
    } finally {
      mockLimits.maxExpanded = 1 << 30;
    }
  });

  it('counts raw files later in the request against the budget', () => {
    mockLimits.maxExpanded = 1024;
    try {
      const z = zipSync({ 'Streaming_History_Audio_0.json': strToU8(JSON.stringify([{ ...AUDIO_ROW, master_metadata_track_name: 'Synthetic ' + pad(500) }])) });
      const raw = jsonInput('Streaming_History_Audio_1.json',
        Array.from({ length: 20 }, () => ({ ...AUDIO_ROW, master_metadata_track_name: 'Synthetic ' + pad(30) })));
      // raw expanded ≈ 700+ bytes → zip 500+ bytes + raw must exceed 1024
      expect(() => runImportJob([inputFile('a.zip', z), raw])).toThrow(/bomb|expand|budget|limit/i);
    } finally {
      mockLimits.maxExpanded = 1 << 30;
    }
  });
});

describe('prepared-file schema whitelisting (regression)', () => {
  it('strips arbitrary nested keys from importReport and enrichment blobs', async () => {
    const base = await preparedFixture();
    const meta = base.meta as Record<string, unknown>;
    meta.importReport = {
      ...(meta.importReport as Record<string, unknown>),
      debugNote: { ip: '192.0.2.99', nested: { deep: true } },
    };
    meta.enrichment = {
      matched: 0, provided: 0, unmatched: 0, source: 'x', importedAt: '2024-01-01T00:00:00.000Z',
      injected: { ip: '192.0.2.99' },
    };
    const { data } = await runImportJob([inputFile('prepared.json', JSON.stringify(base))]);
    const outMeta = (data!.meta) as Record<string, unknown>;
    expect(outMeta.importReport).not.toHaveProperty('debugNote');
    expect(outMeta.enrichment).not.toHaveProperty('injected');
    // Legitimate schema survives.
    expect(outMeta.importReport).toMatchObject({ sourceRows: 1 });
  });

  it('rejects wrong-typed whitelisted report fields before legacy', async () => {
    const base = await preparedFixture();
    (base.meta as Record<string, unknown>).importReport = { sourceRows: 'many' };
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(base))])).toThrow(/import/i);
  });

  it('rejects malformed track field types before legacy', async () => {
    const base = await preparedFixture();
    (base.tracks as Record<string, unknown>[])[0].title = 42;
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(base))])).toThrow(/prepared|track|history/i);
  });

  it('rejects non-string artistNames entries', async () => {
    const base = await preparedFixture();
    (base.meta as Record<string, unknown>).artistNames = [42];
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(base))])).toThrow(/prepared|artist|history/i);
  });

  it('rejects a meta.features array that differs from the fixed legacy list', async () => {
    const base = await preparedFixture();
    (base.meta as Record<string, unknown>).features = ['energy', 'danceability'];
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(base))])).toThrow(/prepared|features|history/i);
  });

  it('rejects event timestamps beyond the representable Date range', async () => {
    const base = await preparedFixture();
    const events = (base.events as number[][]).map((e) => [e[0], e[1], e[2]]);
    events[0][0] = 8_700_000_000_000_000; // safe integer, beyond Date range
    base.events = events;
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(base))])).toThrow(/timestamp/i);
  });

  it('rejects when the duration total overflows the safe-integer range', async () => {
    const base = await preparedFixture();
    const second = JSON.parse(JSON.stringify(base));
    const events = (second.events as number[][]).map((e) => [e[0], e[1], 4_600_000_000_000_000]);
    events.push([events[0][0] + 1, events[0][1], 4_600_000_000_000_000]); // sum > 2^53
    const artists = second.meta?.eventArtists as unknown[];
    if (Array.isArray(artists)) artists.push(artists[artists.length - 1] ?? 0);
    second.events = events;
    expect(() => runImportJob([inputFile('prepared.json', JSON.stringify(second))])).toThrow(/duration|safe/i);
  });
});

describe('mixed / malformed history arrays (regression)', () => {
  it('errors a file mixing history rows with malformed rows', () => {
    expect(() =>
      runImportJob([jsonInput('Streaming_History_Audio_0.json', [AUDIO_ROW, {}])]),
    ).toThrow(/history|malformed|invalid/i);
    const caught: { files?: { status: string }[] } | undefined = (() => { try { runImportJob([jsonInput('Streaming_History_Audio_0.json', [AUDIO_ROW, {}])]); } catch (e) { return e as { files?: { status: string }[] }; } })();
    expect(caught!.files?.some((f) => f.status === 'error')).toBe(true);
  });

  it('errors history-named content that is not an array', () => {
    expect(() =>
      runImportJob([jsonInput('Streaming_History_Audio_0.json', { ts: '2024-01-01T12:00:00Z' })]),
    ).toThrow(/history|malformed/i);
    const caught: { files?: { status: string }[] } | undefined = (() => { try { runImportJob([jsonInput('Streaming_History_Audio_0.json', { ts: '2024-01-01T12:00:00Z' })]); } catch (e) { return e as { files?: { status: string }[] }; } })();
    expect(caught!.files?.some((f) => f.status === 'error')).toBe(true);
  });

  it('still skips array noise without any history keys', () => {
    const outcome = runImportJob([
      jsonInput('Streaming_History_Audio_0.json', [{ foo: 'bar' }]),
      jsonInput('Streaming_History_Audio_1.json', [AUDIO_ROW]),
    ]);
    expect(outcome.files.find((f) => f.name === 'Streaming_History_Audio_0.json')!.status).toBe('skipped');
  });
});

describe('zipinfo local-vs-central agreement (regression)', () => {
  const realZip = () => zipSync({ 'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])) }, { level: 0 });

  it('rejects duplicate exact entry names before extraction', () => {
    expect(() => preflightZip(zipWithDuplicateNames())).toThrow(ZipPreflightError);
    expect(() => preflightZip(zipWithDuplicateNames())).toThrow(/duplicate/i);
  });

  it('rejects local flags that disagree with the central directory', () => {
    const z = realZip();
    const dv = new DataView(z.buffer);
    dv.setUint16(6, 8, true); // local flags: data-descriptor bit set, central has none
    expect(() => preflightZip(z)).toThrow(/flag|mismatch/i);
  });

  it('rejects multi-disk archives', () => {
    const z = realZip();
    const dv = new DataView(z.buffer);
    dv.setUint16(z.length - 22 + 4, 1, true); // disk number
    expect(() => preflightZip(z)).toThrow(/disk/i);
  });

  it('rejects per-entry Zip64 size sentinels', () => {
    const z = realZip();
    const dv = new DataView(z.buffer);
    // central entry uncompressedSize sentinel at cdOffset+24; find the CD header
    for (let i = 0; i < z.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        dv.setUint32(i + 24, 0xffffffff, true);
        expect(() => preflightZip(z)).toThrow(/zip64/i);
        return;
      }
    }
    throw new Error('no central header found');
  });

  it('rejects central entries whose name/extra/comment extend past the directory', () => {
    const z = realZip();
    // Append trailing bytes after the EOCD so a bloated comment stays in view.
    const bloated = new Uint8Array(z.length + 8);
    bloated.set(z, 0);
    const dv = new DataView(bloated.buffer);
    for (let i = 0; i < z.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        dv.setUint16(i + 32, 8, true); // comment length, past cdSize
      }
    }
    expect(() => preflightZip(bloated)).toThrow(/directory|bounds|corrupt/i);
  });

  it('rejects final central-directory consumption beyond the declared size', () => {
    const z = realZip();
    const bloated = new Uint8Array(z.length + 8);
    bloated.set(z, 0);
    const dv = new DataView(bloated.buffer);
    for (let i = 0; i < z.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        dv.setUint16(i + 32, 8, true); // comment length, past cdSize
      }
    }
    expect(() => preflightZip(bloated)).toThrow(/directory|bounds|corrupt/i);
  });

  it('rejects entry data spans that overlap the central directory', () => {
    const z = realZip();
    const dv = new DataView(z.buffer);
    let cdOffset = -1;
    for (let i = 0; i < z.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) { cdOffset = i; break; }
    }
    expect(cdOffset).toBeGreaterThan(0);
    const patched = new Uint8Array(z);
    const pdv = new DataView(patched.buffer);
    // stored entry: grow cSize/uSize in central + local so the data span
    // (dataStart + cSize) crosses cdOffset while still fitting in the file
    for (let i = 0; i < patched.length - 4; i++) {
      if (pdv.getUint32(i, true) === 0x02014b50) {
        const grow = cdOffset - (i < 0 ? 0 : 60) + 4;
        pdv.setUint32(i + 20, grow, true); // central cSize
        pdv.setUint32(i + 24, grow, true); // central uSize
      }
      if (pdv.getUint32(i, true) === 0x04034b50) {
        const nameLen = pdv.getUint16(i + 26, true);
        const extraLen = pdv.getUint16(i + 28, true);
        const grow2 = cdOffset - (i + 30 + nameLen + extraLen) + 4;
        pdv.setUint32(i + 18, grow2, true); // local cSize
        pdv.setUint32(i + 22, grow2, true); // local uSize
      }
    }
    expect(() => preflightZip(patched)).toThrow(/bomb|span|corrupt|bounds|central/i);
  });
});

describe('zip content integrity (regression)', () => {
  it('rejects inflated bytes whose length disagrees with the central size', () => {
    const z = zipSync({ 'Streaming_History_Audio_0.json': strToU8(JSON.stringify([AUDIO_ROW])) }, { level: 0 });
    const patched = new Uint8Array(z);
    const dv = new DataView(patched.buffer);
    for (let i = 0; i < patched.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        dv.setUint32(i + 20, dv.getUint32(i + 20, true) + 4, true); // cSize
        dv.setUint32(i + 24, dv.getUint32(i + 24, true) + 4, true); // uSize
      }
      if (dv.getUint32(i, true) === 0x04034b50) {
        dv.setUint32(i + 18, dv.getUint32(i + 18, true) + 4, true);
        dv.setUint32(i + 22, dv.getUint32(i + 22, true) + 4, true);
      }
    }
    expect(() => runImportJob([inputFile('export.zip', patched)])).toThrow(/size|integrity|corrupt|crc/i);
  });

  it('errors on invalid UTF-8 inside an apparent history JSON entry', () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x81]);
    const z = zipSync({ 'Streaming_History_Audio_0.json': bytes });
    expect(() => runImportJob([inputFile('export.zip', z)])).toThrow(/utf-8|encoding/i);
  });
});
