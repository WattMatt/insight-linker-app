/**
 * PDF Utility Functions
 * Centralized utilities for PDF generation that enforce DOCUMENT_DESIGN_STANDARDS
 * 
 * All PDF generators MUST use these functions to ensure consistent branding,
 * typography, colors, and layout across all generated documents.
 */

import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";
import { DOCUMENT_DESIGN_STANDARDS, getContentWidth, generateDocumentFilename as generateFilename } from "./documentDesignStandards";

// Re-export for convenience
export { DOCUMENT_DESIGN_STANDARDS, getContentWidth, generateFilename };

const { typography, colors, margins, tables, logo, headers, footers, cards, pageBreaks } = DOCUMENT_DESIGN_STANDARDS;

// ============================================================================
// COLOR UTILITIES
// ============================================================================

/**
 * Convert hex color string to RGB array for jsPDF
 */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
}

/**
 * Standard color palette as RGB arrays
 */
export const RGB_COLORS = {
  primary: hexToRgb(colors.primary),
  secondary: hexToRgb(colors.secondary),
  accent: hexToRgb(colors.accent),
  success: hexToRgb(colors.success),
  warning: hexToRgb(colors.warning),
  error: hexToRgb(colors.error),
  textPrimary: hexToRgb(colors.text.primary),
  textSecondary: hexToRgb(colors.text.secondary),
  textMuted: hexToRgb(colors.text.muted),
  bgPage: hexToRgb(colors.background.page),
  bgCard: hexToRgb(colors.background.card),
  bgHeader: hexToRgb(colors.background.header),
  tableBorder: hexToRgb(tables.border.color),
  tableHeader: hexToRgb(tables.header.backgroundColor),
  tableAltRow: hexToRgb(tables.body.alternateRowColor),
  cardBorder: hexToRgb(cards.borderColor),
  footerBorder: hexToRgb(footers.borderColor),
  white: [255, 255, 255] as [number, number, number],
};

// ============================================================================
// PAGE DIMENSIONS
// ============================================================================

export const PAGE = {
  width: 210, // A4 width in mm
  height: 297, // A4 height in mm
  margins,
  contentWidth: getContentWidth(),
  contentStartY: margins.top + headers.height + 5,
};

// ============================================================================
// HEADER FUNCTIONS
// ============================================================================

/**
 * Add standardized page header following DOCUMENT_DESIGN_STANDARDS
 * - Left-aligned title with white text
 * - Right-aligned logo
 * - Primary brand color background
 */
export function addStandardHeader(
  doc: jsPDF, 
  title: string, 
  logoDataUrl?: string | null
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerHeight = headers.height + margins.top;
  
  // Header background bar using primary brand color
  doc.setFillColor(...RGB_COLORS.primary);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  
  // Document title (left aligned per standards)
  doc.setFontSize(typography.scale.h3);
  doc.setTextColor(...RGB_COLORS.white);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title, margins.left, margins.header + 5);
  
  // Logo (right aligned per standards)
  if (logoDataUrl) {
    try {
      const logoX = pageWidth - margins.right - logo.masterSize.width;
      const logoY = logo.placement.marginTop;
      doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logo.masterSize.width, logo.masterSize.maxHeight);
    } catch (e) {
      console.warn('Failed to add logo to header:', e);
    }
  }
  
  // Header border bottom
  if (headers.borderBottom) {
    doc.setDrawColor(...hexToRgb(headers.borderColor));
    doc.setLineWidth(0.5);
    doc.line(0, headerHeight, pageWidth, headerHeight);
  }
  
  return headerHeight + 5;
}

/**
 * Add cover page header (larger, centered style for cover pages)
 */
export function addCoverPageHeader(
  doc: jsPDF,
  title: string,
  subtitle?: string,
  logoDataUrl?: string | null
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = margins.top + 20;
  
  // Logo centered at top if available
  if (logoDataUrl) {
    try {
      const logoWidth = logo.masterSize.width * 1.5;
      const logoHeight = logo.masterSize.maxHeight * 1.5;
      doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoWidth) / 2, y, logoWidth, logoHeight);
      y += logoHeight + 15;
    } catch (e) {
      console.warn('Failed to add logo to cover page:', e);
    }
  }
  
  // Main title
  doc.setFontSize(typography.scale.h1);
  doc.setTextColor(...RGB_COLORS.primary);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += typography.paragraphSpacing.afterH1;
  
  // Subtitle
  if (subtitle) {
    doc.setFontSize(typography.scale.h3);
    doc.setTextColor(...RGB_COLORS.textSecondary);
    doc.setFont(typography.fonts.body, 'normal');
    doc.text(subtitle, pageWidth / 2, y, { align: 'center' });
    y += typography.paragraphSpacing.afterH2;
  }
  
  return y;
}

// ============================================================================
// FOOTER FUNCTIONS
// ============================================================================

/**
 * Add standardized page footer following DOCUMENT_DESIGN_STANDARDS
 * - Left: Confidentiality notice
 * - Center: Page number
 * - Right: Generation date
 */
export function addStandardFooter(
  doc: jsPDF, 
  currentPage: number, 
  totalPages: number, 
  customLeftText?: string
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - margins.bottom;
  
  // Footer border top
  if (footers.borderTop) {
    doc.setDrawColor(...RGB_COLORS.footerBorder);
    doc.setLineWidth(0.5);
    doc.line(margins.left, footerY - 5, pageWidth - margins.right, footerY - 5);
  }
  
  // Footer text styling
  doc.setFontSize(footers.fontSize);
  doc.setTextColor(...RGB_COLORS.textMuted);
  doc.setFont(typography.fonts.body, 'normal');
  
  // Left: Confidentiality notice (or custom text)
  doc.text(customLeftText || footers.confidentialityText, margins.left, footerY);
  
  // Center: Page number
  const pageText = footers.pageNumberFormat
    .replace('{current}', currentPage.toString())
    .replace('{total}', totalPages.toString());
  doc.text(pageText, pageWidth / 2, footerY, { align: 'center' });
  
  // Right: Generation date
  doc.text(new Date().toLocaleDateString('en-GB'), pageWidth - margins.right, footerY, { align: 'right' });
}

/**
 * Add footers to all pages (call after document is complete)
 */
export function addFootersToAllPages(
  doc: jsPDF,
  skipCoverPage: boolean = true,
  customLeftText?: string
): void {
  const totalPages = doc.getNumberOfPages();
  
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    
    // Skip cover page if requested
    if (skipCoverPage && i === 1) continue;
    
    const displayPage = skipCoverPage ? i - 1 : i;
    const displayTotal = skipCoverPage ? totalPages - 1 : totalPages;
    
    addStandardFooter(doc, displayPage, displayTotal, customLeftText);
  }
}

// ============================================================================
// SECTION HEADERS
// ============================================================================

/**
 * Add a section header following typography standards
 * Returns the new Y position after the header
 */
export function addSectionHeader(
  doc: jsPDF, 
  title: string, 
  y: number,
  style: 'primary' | 'secondary' | 'muted' = 'secondary'
): number {
  const contentWidth = getContentWidth();
  
  // Section header background
  let bgColor: [number, number, number];
  let textColor: [number, number, number];
  
  switch (style) {
    case 'primary':
      bgColor = RGB_COLORS.primary;
      textColor = RGB_COLORS.white;
      break;
    case 'muted':
      bgColor = RGB_COLORS.bgHeader;
      textColor = RGB_COLORS.textSecondary;
      break;
    default:
      bgColor = RGB_COLORS.bgHeader;
      textColor = RGB_COLORS.textPrimary;
  }
  
  doc.setFillColor(...bgColor);
  doc.rect(margins.left, y, contentWidth, 8, 'F');
  
  // Section title
  doc.setFontSize(typography.scale.h4);
  doc.setTextColor(...textColor);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title, margins.left + 3, y + 5.5);
  
  return y + 8 + typography.paragraphSpacing.afterH3;
}

/**
 * Add a full-width section header bar (for major sections)
 */
export function addFullWidthSectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  bgColor?: [number, number, number]
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(...(bgColor || RGB_COLORS.primary));
  doc.rect(0, y, pageWidth, 15, 'F');
  
  doc.setFontSize(typography.scale.h3);
  doc.setTextColor(...RGB_COLORS.white);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title.toUpperCase(), pageWidth / 2, y + 10, { align: 'center' });
  
  return y + 20;
}

// ============================================================================
// KPI CARDS
// ============================================================================

/**
 * Draw KPI card following card design standards
 * Includes left accent bar for visual emphasis
 */
export function drawKpiCard(
  doc: jsPDF, 
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  value: string, 
  label: string, 
  accentColor?: [number, number, number]
): void {
  // Card background
  doc.setFillColor(...RGB_COLORS.bgCard);
  doc.roundedRect(x, y, width, height, cards.borderRadius, cards.borderRadius, 'F');
  
  // Card border
  doc.setDrawColor(...RGB_COLORS.cardBorder);
  doc.setLineWidth(cards.borderWidth);
  doc.roundedRect(x, y, width, height, cards.borderRadius, cards.borderRadius, 'S');
  
  // Left accent bar
  if (accentColor) {
    doc.setFillColor(...accentColor);
    doc.rect(x, y + cards.borderRadius, 3, height - (cards.borderRadius * 2), 'F');
    // Top corner
    doc.rect(x, y, 3, cards.borderRadius, 'F');
    // Bottom corner
    doc.rect(x, y + height - cards.borderRadius, 3, cards.borderRadius, 'F');
  }
  
  // Value text (large, centered)
  doc.setFontSize(typography.scale.h2);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.setTextColor(...RGB_COLORS.textPrimary);
  doc.text(value, x + width / 2, y + height / 2, { align: 'center' });
  
  // Label text (small, at bottom)
  doc.setFontSize(typography.scale.caption);
  doc.setFont(typography.fonts.body, 'normal');
  doc.setTextColor(...RGB_COLORS.textMuted);
  doc.text(label, x + width / 2, y + height - 5, { align: 'center' });
}

/**
 * Draw a row of KPI cards
 */
export function drawKpiCardRow(
  doc: jsPDF,
  y: number,
  kpis: Array<{ value: string; label: string; color?: [number, number, number] }>,
  cardHeight: number = 28
): number {
  const contentWidth = getContentWidth();
  const cardSpacing = cards.margin;
  const cardWidth = (contentWidth - (cardSpacing * (kpis.length - 1))) / kpis.length;
  
  kpis.forEach((kpi, i) => {
    const cardX = margins.left + i * (cardWidth + cardSpacing);
    drawKpiCard(doc, cardX, y, cardWidth, cardHeight, kpi.value, kpi.label, kpi.color);
  });
  
  return y + cardHeight + 10;
}

// ============================================================================
// TABLE UTILITIES
// ============================================================================

/**
 * Standard table options following DOCUMENT_DESIGN_STANDARDS
 */
export function getStandardTableStyles(): Partial<UserOptions> {
  return {
    margin: { left: margins.left, right: margins.right },
    styles: {
      fontSize: tables.body.fontSize,
      cellPadding: { 
        horizontal: tables.cellPadding.horizontal, 
        vertical: tables.cellPadding.vertical 
      },
      lineColor: RGB_COLORS.tableBorder,
      lineWidth: tables.border.width,
    },
    headStyles: {
      fillColor: RGB_COLORS.tableHeader,
      textColor: RGB_COLORS.textPrimary,
      fontStyle: 'bold',
      fontSize: tables.header.fontSize,
    },
    alternateRowStyles: {
      fillColor: RGB_COLORS.tableAltRow,
    },
  };
}

/**
 * Create a table with standard styling
 */
export function addStandardTable(
  doc: jsPDF,
  head: string[][],
  body: string[][],
  startY: number,
  additionalOptions?: Partial<UserOptions>
): number {
  autoTable(doc, {
    ...getStandardTableStyles(),
    startY,
    head,
    body,
    ...additionalOptions,
  });
  
  return (doc as any).lastAutoTable?.finalY || startY;
}

/**
 * Create a table with primary-colored header
 */
export function addPrimaryHeaderTable(
  doc: jsPDF,
  head: string[][],
  body: string[][],
  startY: number,
  additionalOptions?: Partial<UserOptions>
): number {
  autoTable(doc, {
    ...getStandardTableStyles(),
    startY,
    head,
    body,
    headStyles: {
      fillColor: RGB_COLORS.primary,
      textColor: RGB_COLORS.white,
      fontStyle: 'bold',
      fontSize: tables.header.fontSize,
    },
    ...additionalOptions,
  });
  
  return (doc as any).lastAutoTable?.finalY || startY;
}

// ============================================================================
// PAGE BREAK UTILITIES
// ============================================================================

/**
 * Check if content should trigger a page break
 */
export function shouldBreakPage(
  currentY: number, 
  contentHeight: number
): boolean {
  const pageHeight = 297; // A4 height
  const availableSpace = pageHeight - currentY - margins.bottom - footers.height;
  return availableSpace < Math.max(contentHeight, pageBreaks.minContentBeforeBreak);
}

/**
 * Add page break and return new Y position with header
 */
export function addPageBreakWithHeader(
  doc: jsPDF,
  headerTitle: string,
  logoDataUrl?: string | null
): number {
  doc.addPage();
  return addStandardHeader(doc, headerTitle, logoDataUrl);
}

/**
 * Check and add page break if needed, returns current or new Y position
 */
export function checkPageBreak(
  doc: jsPDF,
  currentY: number,
  neededHeight: number,
  headerTitle: string,
  logoDataUrl?: string | null
): number {
  if (shouldBreakPage(currentY, neededHeight)) {
    return addPageBreakWithHeader(doc, headerTitle, logoDataUrl);
  }
  return currentY;
}

// ============================================================================
// TEXT UTILITIES
// ============================================================================

/**
 * Add paragraph text with proper line height
 */
export function addParagraph(
  doc: jsPDF,
  text: string,
  y: number,
  options?: { 
    maxWidth?: number; 
    fontSize?: number; 
    color?: [number, number, number];
    align?: 'left' | 'center' | 'right';
  }
): number {
  const maxWidth = options?.maxWidth || getContentWidth();
  const fontSize = options?.fontSize || typography.scale.body;
  const color = options?.color || RGB_COLORS.textPrimary;
  
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);
  doc.setFont(typography.fonts.body, 'normal');
  
  const lines = doc.splitTextToSize(text, maxWidth);
  const lineHeight = fontSize * typography.lineHeight.body * 0.35;
  
  if (options?.align === 'center') {
    const pageWidth = doc.internal.pageSize.getWidth();
    lines.forEach((line: string, i: number) => {
      doc.text(line, pageWidth / 2, y + (i * lineHeight), { align: 'center' });
    });
  } else {
    doc.text(lines, margins.left, y);
  }
  
  return y + (lines.length * lineHeight) + typography.paragraphSpacing.afterParagraph;
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

/**
 * Load image from URL and convert to data URL for embedding in PDF
 */
export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error loading image:', error);
    return null;
  }
}

/**
 * Add image with standard sizing constraints
 */
export function addStandardImage(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } {
  const targetMaxWidth = maxWidth || DOCUMENT_DESIGN_STANDARDS.images.maxWidth;
  const targetMaxHeight = maxHeight || DOCUMENT_DESIGN_STANDARDS.images.maxHeight;
  
  // Use a default size - actual aspect ratio would need image dimension detection
  const width = Math.min(80, targetMaxWidth);
  const height = Math.min(60, targetMaxHeight);
  
  doc.addImage(dataUrl, 'JPEG', x, y, width, height);
  
  return { width, height };
}

// ============================================================================
// PROGRESS BAR
// ============================================================================

/**
 * Draw a progress bar
 */
export function drawProgressBar(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  percentage: number,
  height: number = 6,
  showLabel: boolean = true
): void {
  // Background bar
  doc.setFillColor(...RGB_COLORS.bgHeader);
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  
  // Filled portion
  const fillWidth = (percentage / 100) * width;
  if (fillWidth > 0) {
    const fillColor = percentage >= 80 ? RGB_COLORS.success : 
                      percentage >= 50 ? RGB_COLORS.warning : RGB_COLORS.error;
    doc.setFillColor(...fillColor);
    doc.roundedRect(x, y, Math.max(fillWidth, 4), height, 2, 2, 'F');
  }
  
  // Percentage label
  if (showLabel) {
    doc.setFontSize(typography.scale.caption);
    doc.setTextColor(...RGB_COLORS.textPrimary);
    doc.setFont(typography.fonts.body, 'bold');
    doc.text(`${percentage}%`, x + width + 5, y + height - 1);
  }
}

// ============================================================================
// COMPLIANCE TRACKING
// ============================================================================

export interface PDFComplianceCheck {
  logoSizing: boolean;
  margins: boolean;
  typography: boolean;
  colors: boolean;
  headers: boolean;
  footers: boolean;
  tables: boolean;
  pageBreaks: boolean;
}

/**
 * Log compliance check for debugging
 */
export function logComplianceCheck(
  generatorName: string,
  checks: Partial<PDFComplianceCheck>
): void {
  const allChecks: PDFComplianceCheck = {
    logoSizing: false,
    margins: false,
    typography: false,
    colors: false,
    headers: false,
    footers: false,
    tables: false,
    pageBreaks: false,
    ...checks,
  };
  
  const passed = Object.values(allChecks).filter(Boolean).length;
  const total = Object.keys(allChecks).length;
  
  console.log(`[PDF Compliance] ${generatorName}: ${passed}/${total} checks passed`, allChecks);
}

// ============================================================================
// STANDARD DOCUMENT FILENAME
// ============================================================================

export { generateFilename as generateDocumentFilename };
