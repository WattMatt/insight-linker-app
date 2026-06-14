/**
 * Client-side pdfmake generator for the Inspection Template (blank structure) report.
 *
 * Previously this report type fell through to a generic Site-Summary in the
 * server generate-pdf edge fn (i.e. it never rendered the template structure).
 * This builds the real document: template meta + per-section field tables.
 */
import { createInfoTable, createDataTable, createSectionHeader, COLORS } from './pdfMakeUtils';
import { generateReport } from './pdfEngine';
import { loadCompanyBranding } from './pdfBranding';
import {
  buildTemplateMeta,
  buildTemplateItemRows,
  type InspectionTemplateData,
} from './report/inspectionTemplateRows';

type Content = any;

export type { InspectionTemplateData } from './report/inspectionTemplateRows';

export interface InspectionTemplatePdfResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

function buildContent(data: InspectionTemplateData): Content[] {
  const content: Content[] = [];

  content.push(createInfoTable(buildTemplateMeta(data).map((m) => [m.label, m.value] as [string, string])));

  if (data.description?.trim()) {
    content.push({ text: data.description.trim(), fontSize: 10, color: COLORS.textSecondary, margin: [0, 4, 0, 10] });
  }

  const sections = data.sections || [];
  if (!sections.length) {
    content.push({
      text: 'This template has no sections defined.',
      italics: true,
      color: COLORS.textMuted,
      margin: [0, 8, 0, 0],
    });
    return content;
  }

  for (const section of sections) {
    content.push(createSectionHeader(section.title?.trim() || 'Section', 'primary'));
    content.push(
      createDataTable(
        [
          { header: 'Field', field: 'label', width: '*' },
          { header: 'Type', field: 'type', width: 90 },
          { header: 'Required', field: 'required', width: 65, alignment: 'center' },
          { header: 'Options', field: 'options', width: 150 },
        ],
        buildTemplateItemRows(section),
      ),
    );
  }

  return content;
}

export async function generateInspectionTemplatePdf(
  data: InspectionTemplateData,
): Promise<InspectionTemplatePdfResult> {
  try {
    const branding = await loadCompanyBranding();
    const title = data.title || data.templateName || 'Inspection Template';
    const safeName = (data.templateName || 'Template').replace(/[^a-zA-Z0-9_.-]/g, '_');

    const result = await generateReport({
      type: 'generic',
      title,
      content: buildContent(data),
      coverPage: {
        title,
        subtitle: data.subtitle || data.category || 'Inspection Template',
        siteName: '',
        reportType: 'Inspection Template',
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        reportDate: new Date(),
      },
      options: {
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        filename: `${safeName}_Template.pdf`,
      },
    });

    return { success: true, blob: result.blob, filename: result.filename, previewUrl: result.previewUrl };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[InspectionTemplateReport] generation failed:', error);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate report' };
  }
}
