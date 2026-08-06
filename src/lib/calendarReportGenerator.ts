/**
 * Client-side pdfmake generator for the Calendar report (events grouped by month).
 * Replaces the server generate-pdf (PDFShift) path. Pure logic in report/calendarRows.ts.
 */
import { createKpiRow, createDataTable, createSectionHeader, COLORS, generateDocumentFilename } from './pdfMakeUtils';
import { generateReport } from './pdfEngine';
import { loadCompanyBranding } from './pdfBranding';
import {
  buildCalendarKpis,
  buildPriorityBreakdown,
  groupEventsByMonth,
  buildEventRows,
  type CalendarReportData,
} from './report/calendarRows';

type Content = any;

export type { CalendarReportData, CalendarEvent, CalendarStats } from './report/calendarRows';

export interface CalendarPdfResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

function buildContent(data: CalendarReportData): Content[] {
  const content: Content[] = [];

  content.push(createKpiRow(buildCalendarKpis(data.stats).map((k) => ({ value: k.value, label: k.label }))));

  const p = buildPriorityBreakdown(data.events);
  content.push({
    text: `Priority — High: ${p.high}  ·  Medium: ${p.medium}  ·  Low: ${p.low}` + (p.other ? `  ·  Other: ${p.other}` : ''),
    fontSize: 9,
    color: COLORS.textSecondary,
    margin: [0, 0, 0, 10],
  });

  if (!data.events.length) {
    content.push({
      text: `No events scheduled for ${data.year}.`,
      italics: true,
      color: COLORS.textMuted,
      margin: [0, 8, 0, 0],
    });
    return content;
  }

  for (const group of groupEventsByMonth(data.events)) {
    content.push(createSectionHeader(group.label, 'primary'));
    content.push(
      createDataTable(
        [
          { header: 'Event', field: 'title', width: '*' },
          { header: 'Site', field: 'site', width: 95 },
          { header: 'Type', field: 'type', width: 60 },
          { header: 'Date(s)', field: 'dates', width: 100 },
          { header: 'Status', field: 'status', width: 60 },
          { header: 'Priority', field: 'priority', width: 52 },
        ],
        buildEventRows(group.events),
      ),
    );
  }

  return content;
}

export async function generateCalendarPdf(data: CalendarReportData): Promise<CalendarPdfResult> {
  try {
    const branding = await loadCompanyBranding();
    const title = data.title || 'Calendar Report';

    const result = await generateReport({
      type: 'calendar',
      title,
      content: buildContent(data),
      coverPage: {
        title,
        subtitle: data.subtitle || `Year: ${data.year}`,
        siteName: '',
        reportType: 'Calendar Report',
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        reportDate: new Date(),
      },
      options: {
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        // Unified naming (F3): {type}_{name}_{local-date}.pdf via the shared helper.
        filename: generateDocumentFilename('Calendar_Report', String(data.year)),
      },
    });

    return { success: true, blob: result.blob, filename: result.filename, previewUrl: result.previewUrl };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[CalendarReport] generation failed:', error);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate report' };
  }
}
