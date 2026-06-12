export const COC_STATUSES = ['Missing', 'Pending', 'Pass', 'Fail', 'N/A'] as const;
export type CocStatus = typeof COC_STATUSES[number];

// Vocab-tolerant sets — must match the DB gate in apply_subsection_recompute during the
// old-flow transition (the old engine may still write Failed/Approved/Valid/Rejected).
const FAILED_VALUES = new Set(['Fail', 'Failed', 'Rejected']);
const PASS_VALUES = new Set(['Pass', 'Approved', 'Valid']);

export interface CocGateInput {
  isCocRequired?: boolean | null;
  cocStatus?: string | null;
  cocExpiryDate?: string | null; // ISO yyyy-mm-dd
}

export function isExpired(cocExpiryDate: string | null | undefined, today: string): boolean {
  if (!cocExpiryDate) return false;
  return cocExpiryDate < today;
}

/**
 * Client-side mirror of the DB recompute COC gate. Returns true when a required COC
 * forces the subsection non-compliant (failed/rejected, or an expired pass). This is NOT
 * the source of truth for is_compliant — that is owned by apply_subsection_recompute in
 * the DB (inspection base AND not COC-gated). Use only for display ("COC is blocking
 * compliance" / "expired").
 */
export function cocFailsGate(s: CocGateInput, today: string): boolean {
  if (!s.isCocRequired) return false;
  const status = s.cocStatus ?? '';
  if (FAILED_VALUES.has(status)) return true;
  if (PASS_VALUES.has(status) && isExpired(s.cocExpiryDate, today)) return true;
  return false;
}
