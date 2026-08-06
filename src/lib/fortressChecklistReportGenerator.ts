/**
 * Client-side pdfmake generator for the Fortress Site Close-Out Checklist.
 *
 * Replaces the server `generate-pdf` (PDFShift) path that ran through
 * useUnifiedPdfGeneration. Pure row/KPI logic lives in report/fortressChecklistRows.ts
 * (unit-tested); this module is the thin pdfmake assembly + branding + render glue.
 */
import { createKpiRow, createDataTable, createSectionHeader, COLORS, generateDocumentFilename } from './pdfMakeUtils';
import { generateReport } from './pdfEngine';
import { loadCompanyBranding, imageUrlToBase64 } from './pdfBranding';
import {
  buildFortressKpis,
  buildFortressItemRows,
  type FortressChecklistData,
  type StatusLevel,
} from './report/fortressChecklistRows';

type Content = any;

export type { FortressChecklistData } from './report/fortressChecklistRows';

export interface FortressChecklistPdfResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

const LEVEL_COLOR: Record<StatusLevel, string> = {
  success: COLORS.success,
  warning: COLORS.warning,
  error: COLORS.error,
  muted: COLORS.textMuted,
};

function buildContent(data: FortressChecklistData): Content[] {
  const content: Content[] = [];

  content.push(
    createKpiRow(
      buildFortressKpis(data).map((k) => ({ value: k.value, label: k.label, color: LEVEL_COLOR[k.level] })),
    ),
  );

  if (!data.sections.length) {
    content.push({
      text: 'No checklist items recorded.',
      italics: true,
      color: COLORS.textMuted,
      margin: [0, 8, 0, 0],
    });
    return content;
  }

  for (const section of data.sections) {
    content.push(createSectionHeader(`${section.name}  —  ${section.progress}%`, 'primary'));
    content.push(
      createDataTable(
        [
          { header: 'Status', field: 'status', width: 70, alignment: 'center' },
          { header: 'Item', field: 'label', width: '*' },
          { header: 'Completed', field: 'completed', width: 100 },
        ],
        buildFortressItemRows(section),
      ),
    );
  }

  return content;
}

export async function generateFortressChecklistPdf(
  data: FortressChecklistData,
  options: { siteLogoUrl?: string | null } = {},
): Promise<FortressChecklistPdfResult> {
  try {
    const branding = await loadCompanyBranding();
    let logoDataUrl = branding.logoDataUrl;
    if (options.siteLogoUrl) {
      const clientLogo = await imageUrlToBase64(options.siteLogoUrl);
      if (clientLogo) logoDataUrl = clientLogo;
    }

    const title = data.title || 'Fortress Site Close-Out Checklist';
    const safeSite = (data.siteName || 'Site').replace(/[^a-zA-Z0-9_.-]/g, '_');

    const result = await generateReport({
      type: 'checklist',
      title,
      content: buildContent(data),
      coverPage: {
        title,
        subtitle: 'Site Close-Out Marking Checklist',
        siteName: data.siteName || 'Site',
        reportType: 'Marking Checklist',
        logoDataUrl,
        organizationName: branding.organizationName,
        reportDate: new Date(),
      },
      options: {
        logoDataUrl,
        organizationName: branding.organizationName,
        // Unified naming (F3): sanitised, LOCAL date stamp — no UTC drift.
        filename: generateDocumentFilename('Fortress_Checklist', safeSite),
      },
    });

    return { success: true, blob: result.blob, filename: result.filename, previewUrl: result.previewUrl };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[FortressChecklistReport] generation failed:', error);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate report' };
  }
}
