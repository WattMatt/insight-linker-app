/**
 * Inspection report quality score.
 *
 * The score is the percentage of ASSESSED items that passed. Items that were never captured —
 * left pending, marked N/A, or otherwise not given a pass/fail verdict — are EXCLUDED from the
 * denominator. Not every subsection requires every checklist item, so a subsection must not be
 * negatively marked for items that don't apply to it.
 *
 * Returns 100 when nothing was assessed (no pass and no fail) — nothing failed, so it is not
 * penalised. Pure function; see inspectionScore.test.ts.
 */
export function scorePercentage(passCount: number, failCount: number): number {
  const assessed = passCount + failCount;
  return assessed > 0 ? Math.round((passCount / assessed) * 100) : 100;
}
