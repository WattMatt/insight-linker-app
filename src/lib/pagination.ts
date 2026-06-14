/**
 * Pure pagination math — shared by usePaginatedList (Supabase .range) and the
 * ListPagination control. No React/Supabase imports so it stays unit-testable.
 */

export interface PageRange {
  /** zero-based inclusive start index for Supabase .range() */
  from: number;
  /** zero-based inclusive end index for Supabase .range() */
  to: number;
}

/** Sentinel emitted by getPageWindow to mark a gap (…) between page numbers. */
export const ELLIPSIS = -1;

const toPositiveInt = (n: number, min: number): number => {
  const v = Math.floor(n);
  return Number.isFinite(v) && v >= min ? v : min;
};

/** zero-based inclusive [from, to] for a 1-based page. */
export function getPageRange(page: number, pageSize: number): PageRange {
  const safePage = toPositiveInt(page, 1);
  const safeSize = toPositiveInt(pageSize, 1);
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

/** Total number of pages for a row count; always at least 1 (an empty list is "page 1 of 1"). */
export function getPageCount(total: number, pageSize: number): number {
  const safeSize = toPositiveInt(pageSize, 1);
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  return Math.max(1, Math.ceil(safeTotal / safeSize));
}

/** Constrain a page index into [1, pageCount]. */
export function clampPage(page: number, pageCount: number): number {
  const max = Math.max(1, toPositiveInt(pageCount, 1));
  return Math.min(Math.max(1, toPositiveInt(page, 1)), max);
}

/**
 * Page numbers to render in the control, with ELLIPSIS sentinels for gaps.
 * Always keeps the first and last page; shows `siblings` pages either side of current.
 * e.g. page 5 / 10 -> [1, ELLIPSIS, 4, 5, 6, ELLIPSIS, 10]
 */
export function getPageWindow(page: number, pageCount: number, maxButtons = 7): number[] {
  const total = Math.max(1, toPositiveInt(pageCount, 1));
  const current = clampPage(page, total);

  if (total <= maxButtons) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const siblings = 1;
  const left = Math.max(2, current - siblings);
  const right = Math.min(total - 1, current + siblings);

  const result: number[] = [1];
  if (left > 2) result.push(ELLIPSIS);
  for (let p = left; p <= right; p++) result.push(p);
  if (right < total - 1) result.push(ELLIPSIS);
  result.push(total);
  return result;
}
