/**
 * PDFMAKE UTILITIES
 * Reusable document building functions for pdfmake
 * 
 * This is the PRIMARY utility library for PDF generation.
 * All PDF generators should use these functions to ensure consistent
 * branding, typography, colors, and layout across all documents.
 * 
 * NOTE: This library completely replaces the legacy pdfUtils.ts (jsPDF).
 */

import {
  pdfMake,
  generatePdfBlob,
  generatePdfDataUrl,
  downloadPdf,
  openPdfInNewWindow,
  createBaseDocDefinition,
  COLORS,
  DEFAULT_STYLES,
  PAGE_CONFIG,
  CONTENT_WIDTH_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  mmToPt,
  ptToMm,
  getStandardTableLayout,
  getLightTableLayout,
  getKpiTableLayout,
} from './pdfMakeConfig';
import { DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename } from './documentDesignStandards';

// Re-export for convenience
export {
  pdfMake,
  generatePdfBlob,
  generatePdfDataUrl,
  downloadPdf,
  openPdfInNewWindow,
  createBaseDocDefinition,
  COLORS,
  DEFAULT_STYLES,
  PAGE_CONFIG,
  CONTENT_WIDTH_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  mmToPt,
  ptToMm,
  getStandardTableLayout,
  getLightTableLayout,
  getKpiTableLayout,
  generateDocumentFilename,
};

const { typography, margins, footers } = DOCUMENT_DESIGN_STANDARDS;

// Type definitions
type Content = any;
type TDocumentDefinitions = any;

// ============================================================================
// COVER PAGE BUILDERS
// ============================================================================

// Accent color palette for templates
export const ACCENT_COLORS: Record<string, { primary: string; light: string; text: string }> = {
  blue: { primary: '#2563eb', light: '#dbeafe', text: '#1e40af' },
  green: { primary: '#16a34a', light: '#dcfce7', text: '#166534' },
  orange: { primary: '#ea580c', light: '#ffedd5', text: '#c2410c' },
  red: { primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
  purple: { primary: '#9333ea', light: '#f3e8ff', text: '#7e22ce' },
};

export interface CoverPageOptions {
  title: string;
  subtitle?: string;
  siteName: string;
  clientName?: string;
  reportType?: string;
  logoDataUrl?: string | null;
  organizationName?: string;
  reportDate?: Date;
  referenceNumber?: string;
  preparedBy?: string;
  qrCodeDataUrl?: string | null;
  accentColor?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  siteAddress?: string;
}

/**
 * Create cover page content for pdfmake
 */
export function createCoverPage(options: CoverPageOptions): Content[] {
  const {
    title,
    subtitle,
    siteName,
    clientName,
    reportType = 'Report',
    logoDataUrl,
    organizationName = 'Asset Management System',
    reportDate = new Date(),
    referenceNumber,
    preparedBy,
    qrCodeDataUrl,
    accentColor = 'blue',
    siteAddress,
  } = options;

  // Get accent color values from palette
  const accentPalette = ACCENT_COLORS[accentColor] || ACCENT_COLORS.blue;
  const primaryAccent = accentPalette.primary;

  const formattedDate = reportDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const content: Content[] = [];

  // Top accent bar - uses dynamic accent color
  content.push({
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: A4_WIDTH_PT,
        h: mmToPt(8),
        color: primaryAccent,
      },
    ],
    absolutePosition: { x: 0, y: 0 },
  });

  // Logo or organization name
  if (logoDataUrl) {
    content.push({
      image: logoDataUrl,
      width: 120,
      alignment: 'center',
      margin: [0, 60, 0, 20],
    });
  } else {
    content.push({
      text: organizationName,
      style: 'coverMeta',
      margin: [0, 80, 0, 25],
    });
  }

  // Report type badge
  content.push({
    table: {
      widths: ['auto'],
      body: [[{
        text: reportType.toUpperCase(),
        fontSize: 10,
        bold: true,
        color: COLORS.textSecondary,
        fillColor: COLORS.bgHeader,
        margin: [15, 5, 15, 5],
      }]],
    },
    layout: 'noBorders',
    alignment: 'center',
    margin: [0, 0, 0, 20],
  });

  // Main title
  content.push({
    text: title,
    style: 'coverTitle',
    margin: [0, 0, 0, 10],
  });

  // Decorative line - uses dynamic accent color
  content.push({
    canvas: [
      {
        type: 'line',
        x1: CONTENT_WIDTH_PT / 2 - 60,
        y1: 0,
        x2: CONTENT_WIDTH_PT / 2 + 60,
        y2: 0,
        lineWidth: 2,
        lineColor: primaryAccent,
      },
    ],
    margin: [0, 5, 0, 15],
  });

  // Subtitle
  if (subtitle) {
    content.push({
      text: subtitle,
      style: 'coverSubtitle',
      margin: [0, 0, 0, 20],
    });
  }

  // Site & client info box - styled to match template preview
  const infoRows: Content[][] = [];
  
  // Site name row with icon indicator
  infoRows.push([
    { 
      text: '🏢', 
      fontSize: 12, 
      color: primaryAccent,
      margin: [0, 2, 0, 0],
    },
    { text: siteName, bold: true, fontSize: 12, color: COLORS.textPrimary },
  ]);

  // Client name row  
  if (clientName) {
    infoRows.push([
      { 
        text: '👤', 
        fontSize: 12, 
        color: primaryAccent,
        margin: [0, 2, 0, 0],
      },
      { text: clientName, fontSize: 11, color: COLORS.textSecondary },
    ]);
  }
  
  // Site address row
  if (siteAddress) {
    infoRows.push([
      { 
        text: '📍', 
        fontSize: 12, 
        color: primaryAccent,
        margin: [0, 2, 0, 0],
      },
      { text: siteAddress, fontSize: 10, color: COLORS.textMuted },
    ]);
  }

  content.push({
    table: {
      widths: [25, '*'],
      body: infoRows,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 3 : 0),
      vLineColor: () => primaryAccent,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: () => COLORS.bgCard,
    },
    margin: [60, 20, 60, 40],
  });

  // Metadata section (positioned toward bottom)
  const metaContent: Content[] = [];

  if (referenceNumber) {
    metaContent.push({
      text: `REF: ${referenceNumber}`,
      fontSize: 10,
      color: COLORS.textMuted,
      alignment: 'center',
      margin: [0, 0, 0, 5],
    });
  }

  metaContent.push({
    text: `Generated: ${formattedDate}`,
    fontSize: 11,
    color: COLORS.textSecondary,
    alignment: 'center',
  });

  if (preparedBy) {
    metaContent.push({
      text: `Prepared by: ${preparedBy}`,
      fontSize: 11,
      color: COLORS.textSecondary,
      alignment: 'center',
      margin: [0, 5, 0, 0],
    });
  }

  // QR Code if provided
  if (qrCodeDataUrl) {
    content.push({
      image: qrCodeDataUrl,
      width: 80,
      alignment: 'center',
      margin: [0, 20, 0, 5],
    });
    content.push({
      text: 'Scan for digital access',
      fontSize: 8,
      color: COLORS.textMuted,
      alignment: 'center',
      margin: [0, 0, 0, 20],
    });
  }

  content.push({
    stack: metaContent,
    margin: [0, qrCodeDataUrl ? 20 : 60, 0, 0],
  });

  // Confidentiality notice
  content.push({
    text: footers.confidentialityText,
    fontSize: 8,
    color: COLORS.textMuted,
    italics: true,
    alignment: 'center',
    margin: [0, 40, 0, 5],
  });

  content.push({
    text: organizationName,
    fontSize: 10,
    color: COLORS.textMuted,
    alignment: 'center',
  });

  // Bottom accent bar (using pageBreak to separate from next content)
  content.push({
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: A4_WIDTH_PT,
        h: mmToPt(8),
        color: COLORS.primary,
      },
    ],
    absolutePosition: { x: 0, y: A4_HEIGHT_PT - mmToPt(8) },
  });

  content.push({ text: '', pageBreak: 'after' });

  return content;
}

// ============================================================================
// HEADER & FOOTER BUILDERS
// ============================================================================

/**
 * Create a section header with background
 */
export function createSectionHeader(
  title: string,
  style: 'primary' | 'secondary' | 'muted' = 'secondary'
): Content {
  const bgColor = style === 'primary' ? COLORS.primary : COLORS.bgHeader;
  const textColor = style === 'primary' ? COLORS.white : COLORS.textPrimary;

  return {
    table: {
      widths: ['*'],
      body: [[{
        text: title,
        bold: true,
        fontSize: 11,
        color: textColor,
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: () => bgColor,
    },
    margin: [0, 10, 0, 8],
  };
}

/**
 * Create page header function for document definition
 */
export function createPageHeader(title: string, skipFirstPage = true): (currentPage: number, pageCount: number) => Content {
  return (currentPage: number, _pageCount: number): Content => {
    if (skipFirstPage && currentPage === 1) {
      return { text: '' };
    }

    return {
      table: {
        widths: ['*'],
        body: [[{
          text: title,
          bold: true,
          fontSize: 12,
          color: COLORS.white,
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => mmToPt(margins.left),
        paddingRight: () => mmToPt(margins.right),
        paddingTop: () => 12,
        paddingBottom: () => 12,
        fillColor: () => COLORS.primary,
      },
      margin: [0, 0, 0, 0],
    };
  };
}

/**
 * Create page footer function for document definition
 */
export function createPageFooter(skipFirstPage = true): (currentPage: number, pageCount: number) => Content {
  const formattedDate = new Date().toLocaleDateString('en-GB');

  return (currentPage: number, pageCount: number): Content => {
    if (skipFirstPage && currentPage === 1) {
      return { text: '' };
    }

    const displayPage = skipFirstPage ? currentPage - 1 : currentPage;
    const displayTotal = skipFirstPage ? pageCount - 1 : pageCount;

    return {
      columns: [
        {
          text: footers.confidentialityText,
          fontSize: 8,
          color: COLORS.textMuted,
          width: '*',
        },
        {
          text: `Page ${displayPage} of ${displayTotal}`,
          fontSize: 8,
          color: COLORS.textMuted,
          alignment: 'center',
          width: 80,
        },
        {
          text: formattedDate,
          fontSize: 8,
          color: COLORS.textMuted,
          alignment: 'right',
          width: '*',
        },
      ],
      margin: [mmToPt(margins.left), 0, mmToPt(margins.right), 0],
    };
  };
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

export interface TableColumn {
  header: string;
  field: string;
  width?: number | string | '*';
  alignment?: 'left' | 'center' | 'right';
  format?: (value: any) => string;
}

/**
 * Create a styled data table
 */
export function createDataTable(
  columns: TableColumn[],
  data: Record<string, any>[],
  options?: {
    zebra?: boolean;
    headerStyle?: 'primary' | 'secondary';
  }
): Content {
  const { zebra = true, headerStyle = 'primary' } = options || {};

  const widths = columns.map(col => col.width || '*');

  const headerRow = columns.map(col => ({
    text: col.header,
    bold: true,
    fontSize: 10,
    color: headerStyle === 'primary' ? COLORS.white : COLORS.textPrimary,
  }));

  const bodyRows = data.map((row, rowIndex) =>
    columns.map(col => ({
      text: col.format ? col.format(row[col.field]) : String(row[col.field] ?? ''),
      fontSize: 9,
      alignment: col.alignment || 'left',
      fillColor: zebra && rowIndex % 2 === 1 ? COLORS.bgCard : null,
    }))
  );

  return {
    table: {
      headerRows: 1,
      widths,
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.border,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
      fillColor: (rowIndex: number) => {
        if (rowIndex === 0) return headerStyle === 'primary' ? COLORS.primary : COLORS.bgHeader;
        return zebra && rowIndex % 2 === 0 ? COLORS.bgCard : null;
      },
    },
    margin: [0, 0, 0, 10],
  };
}

/**
 * Create a key-value info table (2 columns)
 */
export function createInfoTable(data: [string, string][]): Content {
  return {
    table: {
      widths: [120, '*'],
      body: data.map(([label, value]) => [
        { text: label, bold: true, fontSize: 10, color: COLORS.textSecondary },
        { text: value, fontSize: 10 },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0.25,
      vLineWidth: () => 0,
      hLineColor: () => COLORS.border,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      fillColor: (rowIndex: number) => rowIndex % 2 === 0 ? COLORS.bgCard : null,
    },
    margin: [0, 0, 0, 15],
  };
}

// ============================================================================
// STATUS & BADGE BUILDERS
// ============================================================================

/**
 * Create a status badge
 */
export function createStatusBadge(
  status: string,
  type: 'success' | 'warning' | 'error' | 'info' = 'info'
): Content {
  const colorMap = {
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    info: COLORS.accent,
  };

  return {
    table: {
      widths: ['auto'],
      body: [[{
        text: status.toUpperCase(),
        fontSize: 9,
        bold: true,
        color: COLORS.white,
        alignment: 'center',
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      fillColor: () => colorMap[type],
    },
  };
}

/**
 * Determine status type from status string
 */
export function getStatusType(status: string): 'success' | 'warning' | 'error' | 'info' {
  const lower = status.toLowerCase();
  if (['pass', 'approved', 'valid', 'complete', 'compliant'].includes(lower)) return 'success';
  if (['fail', 'failed', 'rejected', 'invalid', 'critical'].includes(lower)) return 'error';
  if (['pending', 'in_progress', 'warning', 'incomplete'].includes(lower)) return 'warning';
  return 'info';
}

// ============================================================================
// KPI CARD BUILDERS
// ============================================================================

/**
 * Create a KPI card for dashboards/summaries
 */
export function createKpiCard(
  value: string,
  label: string,
  color: string = COLORS.primary
): Content {
  return {
    stack: [
      {
        text: value,
        fontSize: 24,
        bold: true,
        color: color,
        alignment: 'center',
      },
      {
        text: label,
        fontSize: 9,
        color: COLORS.textMuted,
        alignment: 'center',
        margin: [0, 4, 0, 0],
      },
    ],
    margin: [0, 0, 0, 0],
  };
}

/**
 * Create a row of KPI cards
 */
export function createKpiRow(
  kpis: Array<{ value: string; label: string; color?: string }>
): Content {
  const colWidth = 100 / kpis.length;

  return {
    columns: kpis.map(kpi => ({
      width: `${colWidth}%`,
      stack: [createKpiCard(kpi.value, kpi.label, kpi.color)],
      margin: [5, 0, 5, 0],
    })),
    margin: [0, 10, 0, 15],
  };
}

// ============================================================================
// COMPLIANCE LOGGING
// ============================================================================

export interface PDFComplianceCheck {
  hasCoverPage: boolean;
  logoPlacement: boolean;
  standardMargins: boolean;
  typographyScale: boolean;
  brandColors: boolean;
  pageHeaders: boolean;
  pageFooters: boolean;
  tableStyles: boolean;
  pageBreaks: boolean;
}

/**
 * Log compliance check for PDF generation
 */
export function logComplianceCheck(
  reportName: string,
  checks: PDFComplianceCheck
): PDFComplianceCheck {
  const passed = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length;
  const percentage = Math.round((passed / total) * 100);

  console.log(`[PDF Compliance] ${reportName}: ${passed}/${total} (${percentage}%)`);

  if (percentage < 100) {
    const failed = Object.entries(checks)
      .filter(([_, v]) => !v)
      .map(([k]) => k);
    console.warn(`[PDF Compliance] Missing: ${failed.join(', ')}`);
  }

  return checks;
}

// ============================================================================
// DOCUMENT BUILDER
// ============================================================================

/**
 * Build a complete document definition with all standard elements
 */
export function buildDocument(options: {
  title: string;
  coverPage?: CoverPageOptions;
  content: Content[];
  skipCoverPageInHeaderFooter?: boolean;
}): TDocumentDefinitions {
  const { title, coverPage, content, skipCoverPageInHeaderFooter = true } = options;

  const allContent: Content[] = [];

  // Add cover page if provided
  if (coverPage) {
    allContent.push(...createCoverPage(coverPage));
  }

  // Add main content
  allContent.push(...content);

  return createBaseDocDefinition(allContent, {
    title,
    header: createPageHeader(title, skipCoverPageInHeaderFooter && !!coverPage),
    footer: createPageFooter(skipCoverPageInHeaderFooter && !!coverPage),
  });
}
