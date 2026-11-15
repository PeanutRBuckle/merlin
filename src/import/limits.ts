/** Exported request guards. Values are safe expectations, not targets. */
export const LIMITS = {
  /** Maximum number of files in one request (zip entries count against this too). */
  maxFiles: 100,
  /** Maximum total declared/uploaded compressed size: 100 MiB. */
  maxTotalCompressed: 100 * 1024 * 1024,
  /** Maximum total expanded size: 256 MiB (zip claims + raw JSON bytes). */
  maxExpanded: 256 * 1024 * 1024,
  /** Maximum a single raw JSON file or a single zip entry may expand to. */
  maxSingleExpanded: 128 * 1024 * 1024,
  /** Maximum history records accepted in one request. */
  maxRecords: 2_000_000,
} as const;
