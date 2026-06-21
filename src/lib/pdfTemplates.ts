/**
 * PDF TEMPLATES
 * Reusable document templates and components for pdfmake
 * 
 * This module provides standardized templates for cover pages, headers, footers,
 * KPI dashboards, tables, and other common PDF elements.
 */

// pdfmake types
type Content = any;
type DynamicContent = any;
type TableCell = any;
type ContentTable = any;
import { 
  COLORS, 
  DEFAULT_STYLES, 
  mmToPt, 
  CONTENT_WIDTH_PT,
  getStandardTableLayout,
  getKpiTableLayout,
} from './pdfMakeConfig';
import { 
  BRANDING, 
  createImageContent, 
  formatPdfDate,
} from './pdfBranding';
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';

// ============================================================================
// COVER PAGE TEMPLATE
// ============================================================================

export interface CoverPageData {
  title: string;
  subtitle?: string;
  siteName: string;
  clientName?: string;
  reportType: string;
  reportDate?: Date;
  referenceNumber?: string;
  preparedBy?: string;
  address?: string;
}

/**
 * Create a professional cover page for reports
 */
export function createCoverPage(
  data: CoverPageData, 
  logoDataUrl?: string | null
): Content[] {
  const content: Content[] = [];
  
  // Add logo or organization name
  if (logoDataUrl) {
    content.push({
      image: logoDataUrl,
      fit: [BRANDING.coverLogoWidth, BRANDING.coverLogoHeight],
      alignment: 'center',
      margin: [0, mmToPt(30), 0, mmToPt(20)],
    });
  } else {
    content.push({
      text: BRANDING.defaultOrgName,
      style: 'coverSubtitle',
      margin: [0, mmToPt(30), 0, mmToPt(20)],
    });
  }
  
  // Report type badge
  content.push({
    text: data.reportType.toUpperCase(),
    fontSize: 10,
    bold: true,
    color: COLORS.accent,
    alignment: 'center',
    margin: [0, mmToPt(20), 0, mmToPt(5)],
  });
  
  // Main title
  content.push({
    text: data.title,
    style: 'coverTitle',
    margin: [0, 0, 0, mmToPt(5)],
  });
  
  // Subtitle if provided
  if (data.subtitle) {
    content.push({
      text: data.subtitle,
      style: 'coverSubtitle',
      margin: [0, 0, 0, mmToPt(15)],
    });
  }
  
  // Divider line - using simple text separator instead of canvas
  content.push({
    text: '━━━━━━━━━━━━━━━━━━━━',
    alignment: 'center',
    color: COLORS.accent,
    margin: [0, mmToPt(10), 0, mmToPt(15)],
  });
  
  // Site and client information
  content.push({
    text: data.siteName,
    fontSize: 16,
    bold: true,
    color: COLORS.primary,
    alignment: 'center',
    margin: [0, 0, 0, mmToPt(3)],
  });
  
  if (data.clientName) {
    content.push({
      text: data.clientName,
      fontSize: 14,
      color: COLORS.textSecondary,
      alignment: 'center',
      margin: [0, 0, 0, mmToPt(3)],
    });
  }
  
  if (data.address) {
    content.push({
      text: data.address,
      fontSize: 10,
      color: COLORS.textMuted,
      alignment: 'center',
      margin: [0, 0, 0, mmToPt(20)],
    });
  }
  
  // Metadata table
  const metaRows: TableCell[][] = [];
  
  if (data.referenceNumber) {
    metaRows.push([
      { text: 'Reference:', style: 'caption', alignment: 'right' },
      { text: data.referenceNumber, style: 'body', bold: true },
    ]);
  }
  
  metaRows.push([
    { text: 'Report Date:', style: 'caption', alignment: 'right' },
    { text: formatPdfDate(data.reportDate), style: 'body' },
  ]);
  
  if (data.preparedBy) {
    metaRows.push([
      { text: 'Prepared By:', style: 'caption', alignment: 'right' },
      { text: data.preparedBy, style: 'body' },
    ]);
  }
  
  content.push({
    table: {
      widths: ['auto', 'auto'],
      body: metaRows,
    },
    layout: 'noBorders',
    alignment: 'center',
    margin: [0, mmToPt(30), 0, 0],
  } as ContentTable);
  
  // Add page break after cover
  content.push({ text: '', pageBreak: 'after' });
  
  return content;
}

// ============================================================================
// PAGE HEADERS
// ============================================================================

/**
 * Create a standard page header function for pdfmake
 */
export function createPageHeader(
  title: string,
  logoDataUrl?: string | null,
  orgName?: string
): DynamicContent {
  return (currentPage, pageCount) => {
    // Skip header on first page (cover page)
    if (currentPage === 1) return null;
    
    const headerContent: Content[] = [];
    
    // Header with logo and title
    const headerColumns: Content[] = [
      {
        text: title,
        style: 'caption',
        color: COLORS.textSecondary,
        width: '*',
      },
    ];
    
    if (logoDataUrl) {
      headerColumns.push({
        image: logoDataUrl,
        fit: [BRANDING.headerLogoWidth, BRANDING.headerLogoHeight],
        alignment: 'right',
        width: 'auto',
      });
    } else if (orgName) {
      headerColumns.push({
        text: orgName,
        style: 'caption',
        alignment: 'right',
        width: 'auto',
      });
    }
    
    headerContent.push({
      columns: headerColumns,
      margin: [mmToPt(15), mmToPt(10), mmToPt(15), mmToPt(5)],
    });
    
    // Header border line - using horizontal rule instead of canvas
    headerContent.push({
      text: '',
      margin: [mmToPt(15), 0, mmToPt(15), 0],
      border: [false, false, false, true],
    });
    
    return headerContent;
  };
}

// ============================================================================
// PAGE FOOTERS
// ============================================================================

/**
 * Create a standard page footer function for pdfmake
 */
export function createPageFooter(customLeftText?: string): DynamicContent {
  return (currentPage, pageCount) => {
    // Skip footer on first page (cover page)
    if (currentPage === 1) return null;
    
    const footerContent: Content[] = [];
    
    // Footer border line - using horizontal rule instead of canvas  
    footerContent.push({
      text: '',
      margin: [mmToPt(15), 0, mmToPt(15), 0],
      border: [false, true, false, false],
    });
    
    // Footer content
    footerContent.push({
      columns: [
        {
          text: customLeftText || BRANDING.confidentialityText,
          style: 'footer',
          width: '*',
        },
        {
          text: `Page ${currentPage} of ${pageCount}`,
          style: 'footer',
          alignment: 'center',
          width: 'auto',
        },
        {
          text: formatPdfDate(),
          style: 'footer',
          alignment: 'right',
          width: 'auto',
        },
      ],
      margin: [mmToPt(15), mmToPt(5), mmToPt(15), 0],
    });
    
    return footerContent;
  };
}

// ============================================================================
// KPI DASHBOARD
// ============================================================================

export interface KpiItem {
  value: string | number;
  label: string;
  color?: string;
  icon?: string;
}

/**
 * Create a KPI dashboard with cards
 */
export function createKpiDashboard(kpis: KpiItem[]): Content {
  const cells: TableCell[] = kpis.map((kpi) => ({
    stack: [
      {
        text: String(kpi.value),
        fontSize: 24,
        bold: true,
        color: kpi.color || COLORS.primary,
        alignment: 'center',
      },
      {
        text: kpi.label,
        fontSize: 9,
        color: COLORS.textMuted,
        alignment: 'center',
        margin: [0, 4, 0, 0],
      },
    ],
    fillColor: COLORS.bgCard,
    border: [false, false, false, false],
  }));
  
  // Calculate equal widths
  const cellWidth = CONTENT_WIDTH_PT / kpis.length;
  
  return {
    table: {
      widths: kpis.map(() => cellWidth),
      body: [cells],
    },
    layout: getKpiTableLayout(),
    margin: [0, mmToPt(5), 0, mmToPt(10)],
  } as ContentTable;
}

// ============================================================================
// SECTION HEADERS
// ============================================================================

/**
 * Create a styled section header
 */
export function createSectionHeader(
  title: string,
  style: 'primary' | 'secondary' | 'muted' = 'primary'
): Content {
  const styleMap = {
    primary: { fontSize: 14, color: COLORS.primary, bgColor: COLORS.bgHeader },
    secondary: { fontSize: 12, color: COLORS.secondary, bgColor: COLORS.bgCard },
    muted: { fontSize: 11, color: COLORS.textSecondary, bgColor: null },
  };
  
  const config = styleMap[style];
  
  if (config.bgColor) {
    return {
      table: {
        widths: ['*'],
        body: [[{
          text: title,
          fontSize: config.fontSize,
          bold: true,
          color: config.color,
          margin: [mmToPt(3), mmToPt(2), mmToPt(3), mmToPt(2)],
        }]],
      },
      layout: {
        fillColor: () => config.bgColor,
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, mmToPt(8), 0, mmToPt(4)],
    } as ContentTable;
  }
  
  return {
    text: title,
    fontSize: config.fontSize,
    bold: true,
    color: config.color,
    margin: [0, mmToPt(8), 0, mmToPt(4)],
  };
}

// ============================================================================
// DATA TABLES
// ============================================================================

export interface TableColumn {
  header: string;
  dataKey: string;
  width?: number | string; // number for fixed pt, '*' for flex, 'auto' for content
  align?: 'left' | 'center' | 'right';
  format?: (value: any, row: any) => string | Content;
}

/**
 * Create a data table from columns and data
 */
export function createDataTable<T extends Record<string, any>>(
  columns: TableColumn[],
  data: T[],
  options?: {
    headerRows?: number;
    dontBreakRows?: boolean;
    zebraStripe?: boolean;
    title?: string;
  }
): Content[] {
  const content: Content[] = [];
  
  // Add title if provided
  if (options?.title) {
    content.push(createSectionHeader(options.title, 'secondary'));
  }
  
  // Create header row
  const headerRow: TableCell[] = columns.map((col) => ({
    text: col.header,
    style: 'tableHeader',
    alignment: col.align || 'left',
  }));
  
  // Create body rows
  const bodyRows: TableCell[][] = data.map((row, rowIndex) => 
    columns.map((col) => {
      const value = row[col.dataKey];
      const cellContent = col.format ? col.format(value, row) : String(value ?? '');
      
      return {
        text: typeof cellContent === 'string' ? cellContent : '',
        ...(typeof cellContent !== 'string' ? cellContent : {}),
        style: 'tableBody',
        alignment: col.align || 'left',
        fillColor: options?.zebraStripe !== false && rowIndex % 2 === 1 
          ? COLORS.bgCard 
          : undefined,
      };
    })
  );
  
  // Calculate widths
  const widths = columns.map((col) => col.width ?? '*');
  
  content.push({
    table: {
      headerRows: options?.headerRows ?? 1,
      dontBreakRows: options?.dontBreakRows ?? true,
      widths,
      body: [headerRow, ...bodyRows],
    },
    layout: getStandardTableLayout(),
    margin: [0, 0, 0, mmToPt(8)],
  } as ContentTable);
  
  return content;
}

// ============================================================================
// STATUS BADGES
// ============================================================================

export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Create a status badge
 */
export function createStatusBadge(
  text: string,
  status: StatusType
): Content {
  const colorMap: Record<StatusType, string> = {
    success: COLORS.success,
    warning: COLORS.warning,
    error: COLORS.error,
    info: COLORS.accent,
    neutral: COLORS.textMuted,
  };
  
  return {
    text: text.toUpperCase(),
    fontSize: 7,
    bold: true,
    color: colorMap[status],
  };
}

/**
 * Get status type from common status strings
 */
export function getStatusType(status: string): StatusType {
  const normalizedStatus = status.toLowerCase();
  
  if (['pass', 'passed', 'success', 'complete', 'completed', 'verified', 'active'].includes(normalizedStatus)) {
    return 'success';
  }
  if (['warning', 'pending', 'in_progress', 'in progress', 'review'].includes(normalizedStatus)) {
    return 'warning';
  }
  if (['fail', 'failed', 'error', 'critical', 'overdue', 'open'].includes(normalizedStatus)) {
    return 'error';
  }
  if (['info', 'note', 'observation'].includes(normalizedStatus)) {
    return 'info';
  }
  return 'neutral';
}

// ============================================================================
// COMPLIANCE TRACKING
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
 * Create a compliance result object with defaults
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
 * Calculate compliance score
 */
export function calculateComplianceScore(checks: PDFComplianceCheck): number {
  const total = Object.keys(checks).length;
  const passed = Object.values(checks).filter(Boolean).length;
  return Math.round((passed / total) * 100);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a simple text paragraph
 */
export function createParagraph(
  text: string,
  style?: keyof typeof DEFAULT_STYLES
): Content {
  return {
    text,
    style: style || 'body',
    margin: [0, 0, 0, mmToPt(DOCUMENT_DESIGN_STANDARDS.typography.paragraphSpacing.afterParagraph)],
  };
}

/**
 * Create a bullet list
 */
export function createBulletList(items: string[]): Content {
  return {
    ul: items.map((item) => ({ text: item, style: 'body' })),
    margin: [mmToPt(5), 0, 0, mmToPt(6)],
  };
}

/**
 * Create vertical spacing
 */
export function createSpacer(heightMm: number = 10): Content {
  return { text: '', margin: [0, mmToPt(heightMm), 0, 0] };
}

/**
 * Create a horizontal divider line
 */
export function createDivider(): Content {
  return {
    text: '────────────────────────────────────────',
    color: COLORS.border,
    alignment: 'center',
    margin: [0, mmToPt(8), 0, mmToPt(8)],
  };
}

/**
 * Truncate text to fit within character limit
 */
export function truncateText(text: string, maxLength: number = 50): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}
