/**
 * Pure, testable builders for the Inspection Template (blank structure) report.
 * No pdfmake imports — assembly lives in inspectionTemplateReportGenerator.ts.
 */

export interface TemplateItem {
  label?: string;
  type?: string;
  required?: boolean;
  options?: string[];
}

export interface TemplateSection {
  title?: string;
  items?: TemplateItem[];
}

export interface InspectionTemplateData {
  title?: string;
  subtitle?: string;
  templateName: string;
  category?: string;
  description?: string;
  sections: TemplateSection[];
  generatedAt?: string;
}

export interface TemplateItemRow {
  label: string;
  type: string;
  required: string;
  options: string;
}

export interface TemplateMetaRow {
  label: string;
  value: string;
}

/** One row per template field — required as Yes/No, options joined, blanks guarded. */
export function buildTemplateItemRows(section: TemplateSection): TemplateItemRow[] {
  return (section.items || []).map((item) => ({
    label: item.label?.trim() || '—',
    type: item.type?.trim() || '—',
    required: item.required ? 'Yes' : 'No',
    options: item.options && item.options.length ? item.options.join(', ') : '—',
  }));
}

/** Header meta (Category / Sections / Total Fields). Description is rendered separately as prose. */
export function buildTemplateMeta(data: InspectionTemplateData): TemplateMetaRow[] {
  const sections = data.sections || [];
  const totalFields = sections.reduce((n, s) => n + (s.items?.length || 0), 0);
  return [
    { label: 'Category', value: data.category?.trim() || '—' },
    { label: 'Sections', value: String(sections.length) },
    { label: 'Total Fields', value: String(totalFields) },
  ];
}
