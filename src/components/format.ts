/** Formatting helpers — all dates are UTC calendar dates, per the data contract. */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

/** 'YYYY-MM-DD' (UTC) -> 'Mar 2, 2026' */
export function formatIsoDate(iso: string): string {
  let date = iso;
  if (iso.includes('T')) {
    const timestamp = Date.parse(iso);
    if (!Number.isFinite(timestamp)) return iso;
    date = new Date(timestamp).toISOString().slice(0, 10);
  }
  if (!isValidIsoDate(date)) return iso;
  const [y, m, d] = date.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

/** 'YYYY-MM-DD' (UTC) -> 'Sunday' */
export function weekdayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][wd];
}

export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
}

const nf = new Intl.NumberFormat('en-US');
export function formatInt(n: number): string {
  return nf.format(Math.round(n));
}

/** Hours value -> '1,071' style integer (large totals; mockup shows whole hours). */
export function formatHours(hours: number): string {
  return formatInt(hours);
}

/** ms -> '6 h 12 m' */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} m`;
  return `${formatInt(h)} h ${m} m`;
}

/** Fraction 0..1 -> '38%' */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Valid 'YYYY-MM-DD' with a real calendar date (rejects 2026-02-31). */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function formatBytes(bytes: number): string {
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export { MONTHS_SHORT };
