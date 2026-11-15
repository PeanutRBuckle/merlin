/**
 * Module worker: performs parsing/conversion off the main thread.
 * Message protocol: { id, files } → { id, result } | { id, error }.
 * Importable in tests: handleMessage is exported and pure.
 */
import { runImportJob, type InputFile, type ImportOutcome, type ProgressMessage } from './parse';

export type WorkerRequest = { id: number; files: InputFile[] };
export type WorkerResponse =
  | { id: number; result: ImportOutcome; progress?: never }
  | { id: number; progress: ProgressMessage }
  | { id: number; error: string; files: ImportOutcome['files'] };

/** Pure message handler (no self/postMessage); used by the worker and tests. */
export function handleMessage(
  request: WorkerRequest,
  onProgress?: (p: ProgressMessage) => void,
): { result: ImportOutcome } {
  const outcome = runImportJob(request.files, onProgress);
  return { result: outcome };
}

export type ImportWorkerGlobal = typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

/** Installs the worker protocol on a global scope (no-op wiring if absent). */
export function installWorkerScope(scope: ImportWorkerGlobal): void {
  scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, files } = event.data;
    try {
      const { result } = handleMessage(filesToRequest(id, files), (progress) => {
        (self as unknown as Worker).postMessage({ id, progress });
      });
      (self as unknown as Worker).postMessage({ id, result });
    } catch (err) {
      const importError = err as Error & { files?: ImportOutcome['files'] };
      (self as unknown as Worker).postMessage({
        id,
        error: importError?.message ?? 'Import failed.',
        files: importError?.files ?? [],
      });
    }
  };
}

function filesToRequest(id: number, files: InputFile[]): WorkerRequest {
  return { id, files };
}

// Only self-install when actually running as a worker scope.
if (typeof self !== 'undefined' && typeof document === 'undefined') {
  installWorkerScope(globalThis as unknown as ImportWorkerGlobal);
}
