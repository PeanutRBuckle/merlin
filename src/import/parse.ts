/**
 * Pure import core: classifies files, applies request guards, and runs the
 * legacy convert/validate pipeline. Runs inside the worker; unit-testable
 * without any Worker or DOM. Extraction is memory-only — never the filesystem.
 *
 * Hardening rules enforced here:
 *  - Only rows shaped like streaming-history records count as audio history.
 *  - ANY error result fails the whole batch — no partial success on bad input.
 *  - Prepared files are sanitized to the canonical schema (exact version,
 *    known fields only) before legacy.validate; arbitrary metadata cannot
 *    survive the round-trip.
 *  - A prepared file must be the ONLY accepted history payload in the request
 *    (irrelevant skipped files are fine); it is never silently chosen over
 *    raw history.
 *  - Byte budgets are enforced cumulatively across the whole request and
 *    before any inflation; entries over the single-entry cap are rejected,
 *    never silently skipped.
 *  - Inflated content is CRC-verified against the central directory (fflate
 *    does not check CRC itself).
 */
import { unzipSync } from 'fflate';
import type { HistoryData } from '../data/types';
import { LIMITS } from './limits';
import { getLegacy, type LegacyApi } from './legacy';
import { preflightZip, crc32, ZipPreflightError, type ZipEntry } from './zipinfo';

export type ImportStatus = 'accepted' | 'skipped' | 'error';
export type ImportStage = 'reading' | 'merging' | 'enriching' | 'binding';
export type ProgressMessage = { stage: ImportStage; message: string };

export type ImportFileResult = {
  name: string;
  size: number;
  status: ImportStatus;
  reason?: string;
  records?: number;
};

export type InputFile = { name: string; size: number; buffer: ArrayBuffer };

export type ImportOutcome = { data?: HistoryData; files: ImportFileResult[] };

export class ImportError extends Error {
  files: ImportFileResult[];
  constructor(message: string, files: ImportFileResult[]) {
    super(message);
    this.name = 'ImportError';
    this.files = files;
  }
}

type OnProgress = (p: ProgressMessage) => void;

const VIDEO_OR_PODCAST = /video|podcast/i;
const HISTORY_NAME = /streaming|history|endsong/i;

/** Keys that identify a row as coming from a Spotify extended-history file. */
const HISTORY_ROW_KEYS = [
  'ts',
  'master_metadata_track_name',
  'master_metadata_album_artist_name',
  'master_metadata_album_album_name',
  'episode_name',
  'spotify_episode_uri',
  'spotify_track_uri',
  'audiobook_uri',
] as const;

function looksLikeHistoryRow(r: unknown): boolean {
  if (!isPlainObject(r)) return false;
  return HISTORY_ROW_KEYS.some((k) => k in r);
}

/** Last path segment — video/podcast inference must not match folder names. */
function baseName(name: string): string {
  const i = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return i >= 0 ? name.slice(i + 1) : name;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

type Classification =
  | { kind: 'none' }
  | { kind: 'audio'; rows: unknown[]; records: number; expandedBytes: number }
  | { kind: 'prepared'; preparedValue: unknown; resultIndex: number; expandedBytes?: number };

/** Classifies one decoded text file. Appends the per-file result. */
function classifyJson(
  name: string,
  text: string,
  size: number,
  results: ImportFileResult[],
): Classification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    if (HISTORY_NAME.test(name)) {
      results.push({ name, size, status: 'error', reason: 'Not valid JSON.' });
    } else {
      results.push({ name, size, status: 'skipped', reason: 'Not listening history (unreadable content).' });
    }
    return { kind: 'none' };
  }
  return classifyParsed(name, parsed, size, results);
}

function classifyParsed(
  name: string,
  parsed: unknown,
  size: number,
  results: ImportFileResult[],
): Classification {
  if (isPlainObject(parsed) && parsed.format === 'merlin-history') {
    if (parsed.version !== 1) {
      results.push({
        name,
        size,
        status: 'error',
        reason: 'Unsupported prepared history version. Re-export from the original Spotify JSON files.',
      });
      return { kind: 'none' };
    }
    results.push({ name, size, status: 'accepted' });
    return { kind: 'prepared', preparedValue: parsed, resultIndex: results.length - 1 };
  }
  if (VIDEO_OR_PODCAST.test(baseName(name))) {
    results.push({
      name,
      size,
      status: 'skipped',
      reason: 'Skipped: video or podcast files are not listening history.',
    });
    return { kind: 'none' };
  }
  if (!Array.isArray(parsed)) {
    if (HISTORY_NAME.test(baseName(name))) {
      // A history-named file that is not an array is malformed history —
      // an error, never a silent skip.
      results.push({ name, size, status: 'error', reason: 'Malformed listening history file.' });
      return { kind: 'none' };
    }
    results.push({ name, size, status: 'skipped', reason: 'Not listening history (expected an array of records).' });
    return { kind: 'none' };
  }
  if (parsed.length === 0) {
    results.push({ name, size, status: 'error', reason: 'Malformed listening history file.' });
    return { kind: 'none' };
  }
  const historyRows = parsed.filter(looksLikeHistoryRow);
  if (historyRows.length && historyRows.length < parsed.length) {
    // Some rows look like history and others do not: the file is corrupt —
    // error the whole batch rather than silently skipping alongside valid files.
    results.push({ name, size, status: 'error', reason: 'Malformed listening history file.' });
    return { kind: 'none' };
  }
  if (!historyRows.length) {
    // Array noise without any history keys is irrelevant, whatever the name.
    results.push({ name, size, status: 'skipped', reason: 'Not listening history (unrecognized record shape).' });
    return { kind: 'none' };
  }
  results.push({ name, size, status: 'accepted', records: parsed.length });
  return { kind: 'audio', rows: parsed, records: parsed.length, expandedBytes: size };
}

function decodeUtf8(bytes: Uint8Array, name: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportError(`${name}: not valid UTF-8 text.`, []);
  }
}

function isZip(data: Uint8Array, name: string): boolean {
  if (name.toLowerCase().endsWith('.zip')) return true;
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}

/** Known canonical schema fields — everything else is stripped. */
const PREPARED_TRACK_KEYS = ['id', 'title', 'artist', 'album', 'features', 'families', 'tags', 'statsTrack', 'statsAlbum', 'statsArtist'] as const;
const PREPARED_META_KEYS = ['artistNames', 'eventArtists', 'first', 'last', 'eventMs', 'features', 'importReport', 'enrichment', 'built'] as const;

/** importReport counters are flat non-negative safe integers, nothing else. */
const IMPORT_REPORT_KEYS = ['sourceRows', 'duplicates', 'excludedNonMusic', 'missingTrackIds'] as const;
/** enrichment is a flat counters/scalars blob plus a string-array and two strings. */
const ENRICHMENT_COUNT_KEYS = [
  'matched', 'provided', 'unmatched', 'audioTracksInFile', 'genreTracksInFile',
  'completeAudioTracks', 'usableGenreTracks', 'audioMs', 'genreMs',
  'newCompleteAudioTracks', 'newUsableGenreTracks',
] as const;

const MAX_DATE_MS = 8_640_000_000_000; // ±100,000,000 days — Date's range

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function sanitizeImportReport(v: unknown): Record<string, unknown> {
  if (!isPlainObject(v)) throw new Error('Invalid import report.');
  const clean: Record<string, unknown> = {};
  for (const k of IMPORT_REPORT_KEYS) {
    const field = v[k];
    if (field === undefined) continue;
    if (!isCount(field)) throw new Error(`Invalid import report field: ${k}.`);
    clean[k] = field;
  }
  return clean; // arbitrary nested keys/IP objects cannot survive
}

function sanitizeEnrichment(v: unknown): Record<string, unknown> {
  if (!isPlainObject(v)) throw new Error('Invalid enrichment summary.');
  const clean: Record<string, unknown> = {};
  for (const k of ENRICHMENT_COUNT_KEYS) {
    const field = v[k];
    if (field === undefined) continue;
    if (!isCount(field)) throw new Error(`Invalid enrichment field: ${k}.`);
    clean[k] = field;
  }
  const newViews = v['newViews'];
  if (newViews !== undefined) {
    if (!Array.isArray(newViews) || !newViews.every((x) => typeof x === 'string')) {
      throw new Error('Invalid enrichment field: newViews.');
    }
    clean['newViews'] = newViews;
  }
  for (const k of ['source', 'importedAt'] as const) {
    const field = v[k];
    if (field === undefined) continue;
    if (typeof field !== 'string') throw new Error(`Invalid enrichment field: ${k}.`);
    clean[k] = field;
  }
  return clean;
}

/**
 * Rebuilds a prepared history file as the exact canonical schema: known
 * top-level/meta/track fields only, version 1 required. Unknown fields
 * (including anything that leaked from raw rows, e.g. source IPs) cannot
 * survive the round-trip. Events are copied as plain number triplets.
 */
function sanitizePrepared(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error('Not a Merlin prepared-history file.');
  if (value.format !== 'merlin-history') throw new Error('Not a Merlin prepared-history file.');
  if (value.version !== 1) throw new Error('Unsupported prepared history version. Re-export from the original Spotify JSON files.');
  if (!Array.isArray(value.tracks) || !Array.isArray(value.events) || !isPlainObject(value.meta)) {
    throw new Error('Not a Merlin prepared-history file.');
  }
  if ((value.events as unknown[]).length > LIMITS.maxRecords) {
    throw new Error('Too many listening records in this request.');
  }
  const tracks = (value.tracks as unknown[]).map((t) => {
    if (!isPlainObject(t)) throw new Error('Not a Merlin prepared-history file.');
    // Reject malformed field types before legacy validation sees them.
    if ('title' in t && typeof t['title'] !== 'string') throw new Error('Not a Merlin prepared-history file.');
    for (const k of ['artist', 'album'] as const) {
      if (k in t && t[k] !== null && typeof t[k] !== 'string') throw new Error('Not a Merlin prepared-history file.');
    }
    const clean: Record<string, unknown> = {};
    for (const k of PREPARED_TRACK_KEYS) if (k in t) clean[k] = t[k];
    return clean;
  });
  const events = (value.events as unknown[]).map((e) => {
    if (!Array.isArray(e) || e.length !== 3 || !e.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      throw new Error('Invalid or unsorted timestamp.');
    }
    // Legacy only checks safe integers; a timestamp must also be
    // representable as a Date, and durations as a sum must not overflow.
    if (!Number.isSafeInteger(e[0]) || Math.abs(e[0]) > MAX_DATE_MS) {
      throw new Error('Invalid or unsorted timestamp.');
    }
    if (!Number.isSafeInteger(e[2]) || e[2] < 0) {
      throw new Error('Invalid duration.');
    }
    return [e[0], e[1], e[2]] as number[];
  });
  let totalDuration = 0;
  for (const e of events) {
    totalDuration += e[2];
    if (!Number.isSafeInteger(totalDuration)) {
      throw new Error('Invalid duration: the request total overflows the safe-integer range.');
    }
  }
  const meta: Record<string, unknown> = {};
  for (const k of PREPARED_META_KEYS) {
    const v = value.meta[k];
    if (v === undefined) continue;
    if (k === 'importReport') {
      if (isPlainObject(v)) meta[k] = sanitizeImportReport(v);
    } else if (k === 'enrichment') {
      if (isPlainObject(v)) meta[k] = sanitizeEnrichment(v);
    } else if (k === 'artistNames') {
      if (!Array.isArray(v) || !v.every((x) => x === null || typeof x === 'string')) {
        throw new Error('Not a Merlin prepared-history file.');
      }
      meta[k] = v;
    } else if (k === 'eventArtists') {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isSafeInteger(x))) {
        throw new Error('Not a Merlin prepared-history file.');
      }
      meta[k] = v;
    } else if (k === 'features') {
      // meta.features is fixed: exactly the legacy FEATURES list.
      const legacy = getLegacy().FEATURES;
      if (!Array.isArray(v) || v.length !== legacy.length || !v.every((x, i) => x === legacy[i])) {
        throw new Error('Not a Merlin prepared-history file.');
      }
      meta[k] = v;
    } else if (k === 'built') {
      if (typeof v !== 'string' || !Number.isFinite(Date.parse(v))) throw new Error('Invalid prepared metadata: built must be a timestamp string.');
      meta[k] = v;
    } else {
      meta[k] = v;
    }
  }
  return { format: 'merlin-history', version: 1, tracks, events, meta };
}

/** Parses one zip archive: central-directory preflight, guards, then inflate. */
function classifyZip(
  name: string,
  data: Uint8Array,
  size: number,
  budget: { expanded: number },
  results: ImportFileResult[],
): Classification {
  let entries: ZipEntry[];
  try {
    entries = preflightZip(data);
  } catch (err) {
    const reason = err instanceof ZipPreflightError ? err.message : 'Truncated or corrupt archive.';
    results.push({ name, size, status: 'error', reason });
    return { kind: 'none' };
  }
  const nested = entries.filter((e) => !e.isDirectory && e.name.toLowerCase().endsWith('.zip'));
  const files = entries.filter((e) => !e.isDirectory && !e.name.toLowerCase().endsWith('.zip'));
  for (const entry of nested) {
    results.push({
      name: `${name} :: ${entry.name}`,
      size: entry.uncompressedSize,
      status: 'skipped',
      reason: 'Nested archive skipped.',
    });
  }
  const overCap = files.find((e) => e.uncompressedSize > LIMITS.maxSingleExpanded);
  if (overCap) {
    results.push({
      name,
      size,
      status: 'error',
      reason: `Archive entry ${overCap.name} would expand beyond the single-entry limit (possible zip bomb).`,
    });
    return { kind: 'none' };
  }
  const claimedExpanded = files.reduce((s, e) => s + e.uncompressedSize, 0);
  if (budget.expanded + claimedExpanded > LIMITS.maxExpanded) {
    results.push({
      name,
      size,
      status: 'error',
      reason: 'Request would expand beyond the 256 MiB budget (possible zip bomb).',
    });
    return { kind: 'none' };
  }
  // Each file pushes one result; nested skips are already in `results`.
  if (files.length + results.length > LIMITS.maxFiles) {
    results.push({ name, size, status: 'error', reason: 'Archive contains too many files.' });
    return { kind: 'none' };
  }
  // Reserve every inflated byte exactly once, including irrelevant entries,
  // before decompression. The same shared budget also accounts for raw files.
  budget.expanded += claimedExpanded;
  let rows: unknown[] = [];
  let preparedValue: unknown;
  let preparedCount = 0;
  let resultIndex = -1;
  try {
    // Metadata was fully validated above; unzipSync now inflates exactly the
    // vetted entries (directories and nested archives excluded).
    const inflated = unzipSync(data, {
      filter: (f) => !f.name.endsWith('/') && !f.name.toLowerCase().endsWith('.zip'),
    });
    for (const [entryName, bytes] of Object.entries(inflated)) {
      const entry = entries.find((e) => e.name === entryName);
      if (entry && !entry.isDirectory && !entry.name.toLowerCase().endsWith('.zip')) {
        // Inflated length must match the central directory before CRC is
        // meaningful — a shorter buffer would hash the wrong content.
        if (bytes.length !== entry.uncompressedSize) {
          throw new Error(`Size mismatch in ${entryName}: archive content is corrupt.`);
        }
        if (crc32(bytes) !== entry.crc32) {
          throw new Error(`CRC mismatch in ${entryName}: archive content is corrupt.`);
        }
      }
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        if (HISTORY_NAME.test(baseName(entryName))) {
          // Invalid UTF-8 inside apparent history JSON is corruption, not
          // ignorable binary noise.
          throw new Error(`${name} :: ${entryName}: not valid UTF-8 text.`);
        }
        // Unrelated binary entries (e.g. .png) are irrelevant, not fatal.
        results.push({
          name: `${name} :: ${entryName}`,
          size: bytes.length,
          status: 'skipped',
          reason: 'Not listening history (not UTF-8 text).',
        });
        continue;
      }
      const r = classifyJson(`${name} :: ${entryName}`, text, bytes.length, results);
      if (r.kind === 'audio') rows = rows.concat(r.rows);
      if (r.kind === 'prepared') {
        preparedValue = r.preparedValue;
        preparedCount++;
        resultIndex = r.resultIndex;
      }
    }
  } catch (err) {
    results.push({
      name,
      size,
      status: 'error',
      reason: err instanceof Error ? err.message : 'Archive could not be inflated.',
    });
    return { kind: 'none' };
  }
  if (preparedCount > 1 || (preparedCount === 1 && rows.length)) {
    results.push({
      name,
      size,
      status: 'error',
      reason: 'A prepared Merlin history file can only be imported alone.',
    });
    return { kind: 'none' };
  }
  if (preparedCount === 1) return { kind: 'prepared', preparedValue, resultIndex: resultIndex!, expandedBytes: claimedExpanded };
  return rows.length ? { kind: 'audio', rows, records: rows.length, expandedBytes: claimedExpanded } : { kind: 'none' };
}

/**
 * Runs the whole import job for decoded file payloads. Throws ImportError
 * (with per-file results attached) instead of ever returning a corrupt batch.
 */
export function runImportJob(
  payload: InputFile[],
  onProgress?: OnProgress,
): ImportOutcome {
  const legacy: LegacyApi = getLegacy();
  const results: ImportFileResult[] = [];
  let preparedValue: unknown;
  let preparedResultIndex = -1;
  let preparedCount = 0;
  // Cumulative expanded-size budget across the entire request, enforced
  // before any inflation happens.
  const budget = { expanded: 0 };

  onProgress?.({ stage: 'reading', message: 'Reading your files…' });
  const audioFiles: Array<{ name: string; rows: unknown[] }> = [];
  for (const f of payload) {
    const data = new Uint8Array(f.buffer);
    let classification: Classification;
    if (isZip(data, f.name)) {
      classification = classifyZip(f.name, data, f.size, budget, results);
    } else {
      const rawBytes = data.byteLength;
      if (rawBytes > LIMITS.maxSingleExpanded) {
        results.push({ name: f.name, size: f.size, status: 'error', reason: 'File exceeds the single-entry expansion limit.' });
        continue;
      }
      budget.expanded += rawBytes;
      if (budget.expanded > LIMITS.maxExpanded) {
        results.push({
          name: f.name,
          size: f.size,
          status: 'error',
          reason: 'Request would expand beyond the 256 MiB budget (possible zip bomb).',
        });
        continue;
      }
      let text: string;
      try {
        text = decodeUtf8(data, f.name);
      } catch {
        results.push({ name: f.name, size: f.size, status: 'error', reason: 'Not valid UTF-8 text.' });
        continue;
      }
      classification = classifyJson(f.name, text, f.size, results);
    }
    if (classification.kind === 'prepared') {
      preparedValue = classification.preparedValue;
      preparedResultIndex = classification.resultIndex;
      preparedCount++;

    }
    if (classification.kind === 'audio') {
      audioFiles.push({ name: f.name, rows: classification.rows });
    }
  }

  // A prepared file must be the only accepted history payload; skipped
  // (irrelevant) files are fine.
  if (preparedCount > 1) {
    throw new ImportError('A prepared Merlin history file can only be imported alone.', results);
  }
  if (preparedCount === 1 && audioFiles.length) {
    const target = results[preparedResultIndex];
    if (target && target.status === 'accepted') {
      target.status = 'error';
      target.reason = 'Prepared file must be the only accepted history payload.';
    }
    throw new ImportError('A prepared Merlin history file can only be imported alone.', results);
  }

  // Any error anywhere fails the whole batch — never a partial success.
  const firstError = results.find((r) => r.status === 'error');
  if (firstError) {
    throw new ImportError(firstError.reason ?? 'Import failed.', results);
  }

  const totalRecords = audioFiles.reduce((s, f) => s + f.rows.length, 0);
  if (totalRecords > LIMITS.maxRecords) {
    throw new ImportError('Too many listening records in this request.', results);
  }

  if (preparedCount === 1) {
    const target = results[preparedResultIndex];
    onProgress?.({ stage: 'enriching', message: 'Validating your prepared history…' });
    try {
      const canonical = sanitizePrepared(preparedValue) as unknown as HistoryData;
      const data = legacy.validate(canonical) as HistoryData;
      if (target) target.status = 'accepted';
      onProgress?.({ stage: 'binding', message: 'Binding the codex…' });
      return { data, files: results };
    } catch (err) {
      if (target) {
        target.status = 'error';
        target.reason = err instanceof Error ? err.message : 'Not a Merlin prepared-history file.';
      }
      throw new ImportError(err instanceof Error ? err.message : 'Not a Merlin prepared-history file.', results);
    }
  }

  if (!audioFiles.length) {
    throw new ImportError('No listening history was found in the uploaded files.', results);
  }

  onProgress?.({ stage: 'merging', message: 'Merging your history…' });
  let data: HistoryData;
  try {
    data = legacy.convert(audioFiles) as HistoryData;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed.';
    for (const r of results) {
      if (r.status === 'accepted' && message.includes(r.name)) {
        r.status = 'error';
        r.reason = message;
      }
    }
    throw new ImportError(message, results);
  }

  // Truthful progress: no enrichment happens during a raw import (no sidecar
  // was provided), so the UI must not imply features/genres were added.
  onProgress?.({ stage: 'enriching', message: 'No enrichment sidecar provided — audio features and genres remain unavailable.' });
  onProgress?.({ stage: 'binding', message: 'Binding the codex…' });
  return { data, files: results };
}
