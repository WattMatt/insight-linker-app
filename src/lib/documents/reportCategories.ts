// Single source of truth for the report/system category NAMES that the app's PDF generators
// find-or-create. These must never be renamed/deleted by users (renaming would make the next
// generated report re-create the original-named category and drop the report from the Reports
// view). Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts.
export const SYSTEM_REPORT_CATEGORIES = [
  'Site Summary Reports',
  'Asset Verification Reports',
  'Floor Plan Reports',
  'Inspection Reports',
  'COC Validation Reports',
  'Site COC Reports',
  'Site Drawing Reports',
  'Marking Checklists',
  'Generated Reports',
] as const;

export function isSystemReportCategory(name: string): boolean {
  return (SYSTEM_REPORT_CATEGORIES as readonly string[]).includes(name);
}
