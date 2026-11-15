/**
 * Loads the immutable legacy site/data-core.js and adapts its exposure,
 * which differs by context:
 *  - real browser / Vite build (incl. `type: 'module'` workers):
 *      the IIFE sees no `module` and sets globalThis.MerlinData;
 *  - vitest/vite-node ESM transform: the API surfaces as named exports.
 * The legacy source is never rewritten — only its exposure is adapted.
 */
import * as legacyModule from '../../site/data-core.js';

export interface LegacyApi {
  convert(files: Array<{ name: string; rows: unknown[] }>): unknown;
  validate(d: unknown): unknown;
  mergeEnrichment(data: unknown, side: unknown): unknown;
  models(data: unknown): unknown;
  FEATURES: string[];
  FAMILIES: string[];
}

let cached: LegacyApi | null = null;

export function getLegacy(): LegacyApi {
  if (cached) return cached;
  const global = globalThis as unknown as { MerlinData?: LegacyApi };
  const ns = legacyModule as unknown as Partial<LegacyApi> & { default?: Partial<LegacyApi> };
  const candidate: LegacyApi | undefined =
    (global.MerlinData && typeof global.MerlinData.convert === 'function' ? global.MerlinData : undefined) ??
    (typeof ns.convert === 'function' ? (ns as LegacyApi) : undefined) ??
    (typeof ns.default?.convert === 'function' ? (ns.default as LegacyApi) : undefined);
  if (!candidate) {
    throw new Error('Legacy data-core.js did not expose its importer API.');
  }
  cached = candidate;
  return candidate;
}
