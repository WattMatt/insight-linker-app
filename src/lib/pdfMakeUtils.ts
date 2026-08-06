/**
 * PDFMAKE UTILITIES
 * Reusable document building functions for pdfmake
 * 
 * This is the PRIMARY utility library for PDF generation.
 * All PDF generators should use these functions to ensure consistent
 * branding, typography, colors, and layout across all documents.
 * 
 * CRITICAL: Uses shared LAYOUT constants from siteSummaryRenderSpec.ts
 * to ensure exact WYSIWYG matching between preview and PDF output.
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
// Import shared layout constants for WYSIWYG matching
import { LAYOUT, ACCENT_PALETTES } from './siteSummaryRenderSpec';
import { clampPageNumbers, formatDate } from './report/reportKernel';

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

// Real pdfmake types via @types/pdfmake (the runtime package ships none).
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

// ============================================================================
// COVER PAGE BUILDERS
// ============================================================================

// Accent color palette for templates - use shared spec for WYSIWYG
export const ACCENT_COLORS: Record<string, { primary: string; light: string; text: string }> = Object.fromEntries(
  Object.entries(ACCENT_PALETTES).map(([key, val]) => [key, { primary: val.primary, light: val.light, text: val.dark }])
);

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
 * Uses shared LAYOUT constants from siteSummaryRenderSpec.ts for WYSIWYG matching
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

  // Get accent color values from shared palette (WYSIWYG)
  const accentPalette = ACCENT_COLORS[accentColor] || ACCENT_COLORS.blue;
  const primaryAccent = accentPalette.primary;
  const lightAccent = accentPalette.light;

  // Debug: Log template configuration being applied to PDF
  console.log('[createCoverPage] Template Applied:', {
    title,
    subtitle,
    accentColor,
    primaryAccent,
    hasLogo: !!logoDataUrl,
    siteName,
    clientName,
    layoutConstants: {
      accentBarHeight: LAYOUT.cover.accentBarHeight,
      titleSize: LAYOUT.cover.titleSize,
      subtitleSize: LAYOUT.cover.subtitleSize,
      logoHeight: LAYOUT.cover.logoHeight,
    },
  });

  const formattedDate = reportDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const content: Content[] = [];

  // ======================================================================
  // TOP ACCENT BAR - Uses LAYOUT.cover.accentBarHeight for WYSIWYG
  // ======================================================================
  content.push({
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: A4_WIDTH_PT,
        h: LAYOUT.cover.accentBarHeight,
        color: primaryAccent,
      },
    ],
    absolutePosition: { x: 0, y: 0 },
  });

  // ======================================================================
  // LOGO OR PLACEHOLDER - Uses LAYOUT.cover dimensions for WYSIWYG
  // ======================================================================
  if (logoDataUrl) {
    content.push({
      image: logoDataUrl,
      height: LAYOUT.cover.logoHeight,
      alignment: 'center',
      margin: [0, 60, 0, LAYOUT.cover.logoPadding],
    });
  } else {
    // Placeholder box matching preview style
    content.push({
      table: {
        widths: [120],
        body: [[{
          text: '🏢',
          fontSize: 24,
          color: primaryAccent,
          alignment: 'center',
          fillColor: lightAccent,
          margin: [0, 18, 0, 18],
        }]],
      },
      layout: 'noBorders',
      alignment: 'center',
      margin: [0, 60, 0, LAYOUT.cover.logoPadding],
    });
  }

  // ======================================================================
  // MAIN TITLE - Uses LAYOUT.cover.titleSize for WYSIWYG
  // ======================================================================
  content.push({
    text: title,
    fontSize: LAYOUT.cover.titleSize,
    bold: true,
    color: primaryAccent,
    alignment: 'center',
    margin: [0, 0, 0, 8],
  });

  // ======================================================================
  // SUBTITLE - Uses LAYOUT.cover.subtitleSize for WYSIWYG
  // ======================================================================
  if (subtitle) {
    content.push({
      text: subtitle,
      fontSize: LAYOUT.cover.subtitleSize,
      color: '#6b7280',
      alignment: 'center',
      margin: [0, 0, 0, 32],
    });
  }

  // ======================================================================
  // SITE INFO BOX - Left border accent, matching preview exactly
  // ======================================================================
  const infoRows: Content[][] = [];
  
  // Site name row with building icon
  infoRows.push([
    { 
      text: '🏢', 
      fontSize: 12, 
      color: primaryAccent,
      margin: [0, 2, 8, 0],
    },
    { text: siteName, bold: true, fontSize: 12, color: COLORS.textPrimary },
  ]);

  // Client name row with user icon
  if (clientName) {
    infoRows.push([
      { 
        text: '👤', 
        fontSize: 12, 
        color: primaryAccent,
        margin: [0, 2, 8, 0],
      },
      { text: clientName, fontSize: 11, color: COLORS.textSecondary },
    ]);
  }
  
  // Site address row with pin icon
  if (siteAddress) {
    infoRows.push([
      { 
        text: '📍', 
        fontSize: 12, 
        color: primaryAccent,
        margin: [0, 2, 8, 0],
      },
      { text: siteAddress, fontSize: 10, color: '#6b7280' },
    ]);
  }

  content.push({
    table: {
      widths: [25, '*'],
      body: infoRows,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 4 : 0),
      vLineColor: () => primaryAccent,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      fillColor: () => '#f9fafb',
    },
    margin: [60, 0, 60, 40],
  });

  // ======================================================================
  // QR CODE (if provided)
  // ======================================================================
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

  // ======================================================================
  // METADATA SECTION - Date, reference, prepared by
  // ======================================================================
  const metaContent: Content[] = [];

  if (referenceNumber) {
    metaContent.push({
      text: `REF: ${referenceNumber}`,
      fontSize: 10,
      color: '#6b7280',
      alignment: 'center',
      margin: [0, 0, 0, 5],
    });
  }

  metaContent.push({
    text: formattedDate,
    fontSize: 11,
    color: '#6b7280',
    alignment: 'center',
  });

  if (preparedBy) {
    metaContent.push({
      text: `Prepared by: ${preparedBy}`,
      fontSize: 11,
      color: '#6b7280',
      alignment: 'center',
      margin: [0, 5, 0, 0],
    });
  }

  content.push({
    stack: metaContent,
    margin: [0, qrCodeDataUrl ? 20 : 80, 0, 0],
  });

  // ======================================================================
  // CONFIDENTIALITY NOTICE
  // ======================================================================
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

  // ======================================================================
  // BOTTOM ACCENT BAR - Uses LAYOUT.cover.accentBarHeight for WYSIWYG
  // ======================================================================
  content.push({
    canvas: [
      {
        type: 'rect',
        x: 0,
        y: 0,
        w: A4_WIDTH_PT,
        h: LAYOUT.cover.accentBarHeight,
        color: primaryAccent,
      },
    ],
    absolutePosition: { x: 0, y: A4_HEIGHT_PT - LAYOUT.cover.accentBarHeight },
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
  style: 'primary' | 'secondary' | 'muted' = 'secondary',
  options: { noTopMargin?: boolean } = {}
): Content {
  const bgColor = style === 'primary' ? COLORS.primary : COLORS.bgHeader;
  const textColor = style === 'primary' ? COLORS.white : COLORS.textPrimary;
  
  // No top margin when header should sit directly below page header
  // Reduced default margin from 10 to 6 for tighter layout
  const topMargin = options.noTopMargin ? 0 : 6;

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
    // Reduced bottom margin from 8 to 6 for tighter layout
    margin: [0, topMargin, 0, 6],
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
 * Footer is positioned at the very bottom of the page within the margin area
 */
export function createPageFooter(skipFirstPage = true): (currentPage: number, pageCount: number) => Content {
  const formattedDate = formatDate(new Date());

  return (currentPage: number, pageCount: number): Content => {
    if (skipFirstPage && currentPage === 1) {
      return { text: '' };
    }

    const { page: displayPage, total: displayTotal } = clampPageNumbers(currentPage, pageCount, skipFirstPage);

    // Footer positioned at absolute bottom - pdfmake footer area starts at pageMargins[3] from bottom
    // We use a small top margin to push content to the very bottom of the footer area
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
      // Footer area is 35mm (~99pt). Push content to bottom with margin-top
      // This positions text at the very bottom of the page
      margin: [mmToPt(margins.left), mmToPt(25), mmToPt(margins.right), 0],
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
      fillColor: zebra && rowIndex % 2 === 1 ? COLORS.bgCard : undefined,
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
    // Reduced bottom margin from 15 to 10 for tighter layout
    margin: [0, 0, 0, 10],
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
    // Compact margins for tighter layout - reduced from [0, 6, 0, 10] to [0, 4, 0, 8]
    margin: [0, 4, 0, 8],
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
 * Create a compliance result object with defaults (migrated from the deleted
 * duplicate template lib pdfTemplates.ts).
 */
export function createComplianceResult(
  checks: Partial<PDFComplianceCheck>
): PDFComplianceCheck {
  return {
    hasCoverPage: checks.hasCoverPage ?? false,
    logoPlacement: checks.logoPlacement ?? false,
    standardMargins: checks.standardMargins ?? false,
    typographyScale: checks.typographyScale ?? false,
    brandColors: checks.brandColors ?? false,
    pageHeaders: checks.pageHeaders ?? false,
    pageFooters: checks.pageFooters ?? false,
    tableStyles: checks.tableStyles ?? false,
    pageBreaks: checks.pageBreaks ?? false,
  };
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
