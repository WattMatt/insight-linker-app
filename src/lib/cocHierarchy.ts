export type CocType = 'Initial' | 'Supplementary' | 'Temporary';
export type CocDocStatus = 'Pass' | 'Fail' | 'Pending' | 'Missing';

export interface CocDoc {
  id: string;
  cocType: CocType;
  cocNumber: string | null;
  cocIssueDate: string | null; // yyyy-mm-dd
  cocExpiryDate: string | null;
  cocStatus: CocDocStatus; // per-doc never 'Missing' (that is a roll-up-only value)
  fileName: string;
  fileUrl: string;
}

export interface CocGroup {
  initial: CocDoc | null;
  supplementaries: CocDoc[]; // includes Temporary; ordered by issue date asc
  rollup: CocDocStatus;
}

export function normalizeCocType(raw: string | null | undefined): CocType {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'initial') return 'Initial';
  if (v === 'temporary') return 'Temporary';
  return 'Supplementary'; // 'supplementary' / unknown / blank / 'not marked'
}

export function normalizeCocDocStatus(raw: string | null | undefined): CocDocStatus {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'pass' || v === 'approved' || v === 'valid') return 'Pass';
  if (v === 'fail' || v === 'failed' || v === 'rejected') return 'Fail';
  return 'Pending'; // null/blank/unknown => uploaded but unmarked
}

export function cocDocFails(d: CocDoc, today: string): boolean {
  if (d.cocStatus === 'Fail') return true;
  if (d.cocStatus === 'Pass' && d.cocExpiryDate && d.cocExpiryDate < today) return true;
  return false;
}

export function rollupStatus(docs: CocDoc[], today: string): CocDocStatus {
  if (docs.length === 0) return 'Missing';
  if (docs.some(d => cocDocFails(d, today))) return 'Fail';
  if (docs.some(d => d.cocStatus === 'Pass')) return 'Pass';
  return 'Pending';
}

export function groupCocDocuments(docs: CocDoc[], today: string): CocGroup {
  const sorted = [...docs].sort((a, b) => (a.cocIssueDate ?? '').localeCompare(b.cocIssueDate ?? ''));
  const initial: CocDoc | null = sorted.find(d => d.cocType === 'Initial') ?? sorted[0] ?? null;
  const supplementaries = sorted.filter(d => d !== initial);
  return { initial, supplementaries, rollup: rollupStatus(docs, today) };
}

export function toCocDoc(d: {
  id: string; file_name: string; file_url: string;
  coc_number?: string | null; coc_issue_date?: string | null; coc_expiry_date?: string | null;
  coc_type?: string | null; coc_status?: string | null;
}): CocDoc {
  return {
    id: d.id,
    cocType: normalizeCocType(d.coc_type),
    cocNumber: d.coc_number ?? null,
    cocIssueDate: d.coc_issue_date ?? null,
    cocExpiryDate: d.coc_expiry_date ?? null,
    cocStatus: normalizeCocDocStatus(d.coc_status),
    fileName: d.file_name,
    fileUrl: d.file_url,
  };
}
