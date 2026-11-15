/**
 * Main-thread import API used by the upload UI.
 *
 *   importHistory(files: File[], onProgress?): Promise<{ data, files }>
 *
 * The heavy parsing/conversion runs in a module worker; if no Worker global
 * exists (e.g. plain Node test runtimes) the same pure core runs in-process.
 * The worker is always terminated when the job settles.
 */
import type { HistoryData } from '../data/types';
import { LIMITS } from './limits';
import { runImportJob, type ImportFileResult, type ImportStage, type InputFile } from './parse';
import type { WorkerRequest, WorkerResponse } from './worker';

export type ImportProgress = { stage: ImportStage; message: string };
export type { ImportFileResult };

export type HistoryDataResult = {
  data: HistoryData;
  files: ImportFileResult[];
};

export async function importHistory(
  files: File[],
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<HistoryDataResult> {
  // Request guards before any byte is read.
  if (files.length > LIMITS.maxFiles) {
    throw new Error(`Too many files: the limit is ${LIMITS.maxFiles} per request.`);
  }
  const declaredTotal = files.reduce((s, f) => s + f.size, 0);
  if (declaredTotal > LIMITS.maxTotalCompressed) {
    throw new Error('Upload is too large: the total compressed budget is 100 MiB.');
  }
  const rawBytes = files.filter((f) => !f.name.toLowerCase().endsWith('.zip')).reduce((s, f) => s + f.size, 0);
  if (rawBytes > LIMITS.maxExpanded) {
    throw new Error('Upload would expand beyond the 256 MiB budget.');
  }

  // Honor an already-aborted signal before any File is read.
  if (signal?.aborted) {
    throw new DOMException('Import aborted.', 'AbortError');
  }

  const onProgressInternal = onProgress ?? (() => {});
  onProgressInternal({ stage: 'reading', message: 'Reading your files…' });

  // Read bytes on the main thread, hand ArrayBuffers to the worker.
  const payload: InputFile[] = [];
  for (const f of files) {
    let buffer: ArrayBuffer;
    try {
      buffer = await f.arrayBuffer();
    } catch {
      throw new Error(`${f.name}: could not be read.`);
    }
    payload.push({ name: f.name, size: f.size, buffer });
  }

  const workerFactory = () =>
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

  // A Worker global means a real worker environment (browser or Node worker);
  // construction failures there are fatal — no silent heavy main-thread
  // fallback. The pure in-process path is only for non-worker runtimes
  // (e.g. plain Node test runtimes).
  let worker: Worker | null = null;
  if (canUseWorkers()) {
    try {
      worker = workerFactory();
    } catch (err) {
      throw new Error(
        `Import worker could not be started: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!worker) {
    // Pure in-process fallback (same core the worker runs).
    try {
      const { data, files: results } = runImportJob(payload, onProgressInternal);
      return { data: data as HistoryData, files: results };
    } catch (err) {
      throw decorate(err);
    }
  }

  return new Promise<HistoryDataResult>((resolve, reject) => {
    const local = worker as Worker;
    let settled = false;
    // Every settle path removes the abort listener and terminates the worker.
    const cleanup = () => {
      if (signal) signal.removeEventListener('abort', abort);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(decorate(err));
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('Import aborted.', 'AbortError'));
    };
    if (signal?.aborted) return abort();
    if (signal) signal.addEventListener('abort', abort, { once: true });
    // A throwing user callback must not hang the import — treat as failure.
    const safeProgress = (p: ImportProgress) => {
      try {
        onProgressInternal(p);
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)));
      }
    };
    local.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if ('progress' in msg && msg.progress) {
        safeProgress(msg.progress);
        return;
      }
      if ('result' in msg && msg.result) {
        settled = true;
        cleanup();
        resolve({ data: msg.result.data as HistoryData, files: msg.result.files });
      } else if ('error' in msg) {
        fail(Object.assign(new Error(msg.error), { files: msg.files }));
      } else {
        fail(new Error('Import worker sent an unrecognized message.'));
      }
    };
    local.onerror = (event) => {
      fail(new Error(event.message || 'Import worker failed.'));
    };
    local.onmessageerror = () => {
      fail(new Error('Import worker returned an undecodable message.'));
    };
    const request: WorkerRequest = { id: Date.now(), files: payload };
    const transfer = payload.map((p) => p.buffer);
    try {
      local.postMessage(request, transfer);
    } catch (err) {
      fail(new Error(`Import worker could not receive the files: ${err instanceof Error ? err.message : String(err)}`));
    }
  }).finally(() => {
    worker?.terminate();
  });
}

function canUseWorkers(): boolean {
  return typeof Worker !== 'undefined';
}

function decorate(err: unknown): Error {
  const e = err as Error & { files?: ImportFileResult[] };
  if (e?.files) {
    const failed = e.files.filter((f) => f.status === 'error');
    const detail = failed.map((f) => `${f.name}: ${f.reason}`).join('; ');
    const message = detail ? `${e.message} (${detail})` : e.message;
    return Object.assign(new Error(message), { files: e.files });
  }
  return e instanceof Error ? e : new Error(String(err));
}
