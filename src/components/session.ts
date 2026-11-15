/**
 * Per-tab local session state. Milestone is local-only: everything lives in
 * React state (tab memory) — no localStorage, no IndexedDB, no cloud.
 */
import type { HistoryData } from '../data/types';

/** Mirrors the importHistory result entry (src/import/history contract). */
export interface ImportFileResult {
  name: string;
  size: number;
  status: 'accepted' | 'skipped' | 'error';
  reason?: string;
  records?: number;
}

export interface CodexSession {
  data: HistoryData;
  files: ImportFileResult[];
  uploadedAt: number;
  /** Which "Try with my files" path created it — always local in this milestone. */
  source: 'local';
}

export function createSession(data: HistoryData, files: ImportFileResult[]): CodexSession {
  return { data, files, uploadedAt: Date.now(), source: 'local' };
}
