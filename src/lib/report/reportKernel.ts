/**
 * Report kernel — pure, deterministic formatters shared by all report builders.
 *
 * Dates are formatted with EXPLICIT day-first output (not toLocaleDateString),
 * so results are identical regardless of host locale, ICU build, or timezone of
 * the test runner. Missing/invalid dates return a visible fallback ("—") and
 * NEVER "Invalid Date" or a fabricated "today".
 */

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function toValidDate(input?: Date | string | null): Date | null {
  if (input === undefined || input === null || input === '') return null;
  const d = input instanceof Date ? input : new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** "13 June 2026" (local components, day-first). Fallback for missing/invalid. */
export function formatDate(input?: Date | string | null, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return `${pad2(d.getDate())} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

/** "13 Jun 2026, 14:30" (local, 24h). Fallback for missing/invalid. */
export function formatDateTime(input?: Date | string | null, fallback = '—'): string {
  const d = toValidDate(input);
  if (!d) return fallback;
  return `${pad2(d.getDate())} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "2026-06-13" from LOCAL components, for filenames. Defaults to now. */
export function localDateStamp(input?: Date | string | null): string {
  const d = toValidDate(input) ?? new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "25%" with divide-by-zero / NaN guards. */
export function percent(numerator: number, denominator: number, fallback = '0%'): string {
  if (!denominator || isNaN(denominator) || isNaN(numerator)) return fallback;
  return `${Math.round((numerator / denominator) * 100)}%`;
}
