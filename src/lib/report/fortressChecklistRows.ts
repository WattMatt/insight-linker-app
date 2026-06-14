/**
 * Pure, testable row/KPI builders for the Fortress Site Close-Out Checklist report.
 *
 * Kept free of any pdfmake imports (pdfMakeConfig pulls in the pdfmake lib + fonts)
 * so these stay unit-testable in the node test env — the pdfmake assembly lives in
 * fortressChecklistReportGenerator.ts. Mirrors the Phase-0 pattern (complianceRows /
 * siteSummaryRows).
 */
import { formatDate } from './reportKernel';

export type StatusLevel = 'success' | 'warning' | 'error' | 'muted';

export interface FortressChecklistItem {
  id?: string;
  label: string;
  isChecked: boolean;
  isNotApplicable: boolean;
  checkedAt?: string;
}

export interface FortressChecklistSection {
  name: string;
  progress: number;
  items: FortressChecklistItem[];
}

export interface FortressChecklistData {
  title?: string;
  siteName?: string;
  siteId?: string;
  overallProgress: number;
  sections: FortressChecklistSection[];
  stats: { completed: number; pending: number; notApplicable: number; total: number };
  generatedAt?: string;
}

export interface FortressKpi {
  value: string;
  label: string;
  level: StatusLevel;
}

export interface FortressItemRow {
  status: 'Done' | 'Pending' | 'N/A';
  label: string;
  completed: string;
}

/** Traffic-light level for a 0–100 progress value (>=80 green, >=50 amber, else red). */
export function progressLevel(progress: number): StatusLevel {
  if (progress >= 80) return 'success';
  if (progress >= 50) return 'warning';
  return 'error';
}

/** The four executive-summary KPIs, in display order. */
export function buildFortressKpis(data: FortressChecklistData): FortressKpi[] {
  return [
    { value: `${data.overallProgress}%`, label: 'Overall Progress', level: progressLevel(data.overallProgress) },
    { value: String(data.stats.completed), label: 'Completed', level: 'success' },
    { value: String(data.stats.pending), label: 'Pending', level: 'warning' },
    { value: String(data.stats.notApplicable), label: 'Not Applicable', level: 'muted' },
  ];
}

/** One row per checklist item — N/A wins, then checked, else pending; date only when genuinely completed. */
export function buildFortressItemRows(section: FortressChecklistSection): FortressItemRow[] {
  return section.items.map((item) => ({
    status: item.isNotApplicable ? 'N/A' : item.isChecked ? 'Done' : 'Pending',
    label: item.label?.trim() || '—',
    completed: !item.isNotApplicable && item.isChecked ? formatDate(item.checkedAt) : '—',
  }));
}
