import { formatDate } from './reportKernel';

export interface CocSubsectionInput {
  name?: string | null;
  coc_number?: string | null;
  coc_status?: string | null;
  coc_issue_date?: string | null;
}
export interface CocValidationRow {
  subsection: string;
  cocNumber: string;
  status: string;
  date: string;
}

export interface InspectionInput {
  title?: string | null;
  status?: string | null;
  inspector_name?: string | null;
  inspection_date?: string | null;
}
export interface InspectionRow {
  title: string;
  status: string;
  inspector: string;
  date: string;
}

/** All COC validation rows (no truncation), with guarded fields/date. */
export function buildCocValidationRows(subsections: CocSubsectionInput[]): CocValidationRow[] {
  return subsections.map(sub => ({
    subsection: sub.name || 'Unknown',
    cocNumber: sub.coc_number || '-',
    status: sub.coc_status || 'Missing',
    date: formatDate(sub.coc_issue_date),
  }));
}

/** All inspection rows (no truncation), with guarded fields/date. */
export function buildInspectionRows(inspections: InspectionInput[]): InspectionRow[] {
  return inspections.map(insp => ({
    title: insp.title || 'Untitled',
    status: insp.status || 'Unknown',
    inspector: insp.inspector_name || '-',
    date: formatDate(insp.inspection_date),
  }));
}
