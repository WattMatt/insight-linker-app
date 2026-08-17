/**
 * PDFMAKE CONFIGURATION
 * Core configuration for pdfmake PDF generation
 * 
 * This file sets up pdfmake with proper fonts, page settings, and default styles
 * based on DOCUMENT_DESIGN_STANDARDS for consistent document output.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Real pdfmake types via @types/pdfmake (the runtime package ships none).
import type {
  TDocumentDefinitions,
  StyleDictionary,
  Content,
  CustomTableLayout,
} from 'pdfmake/interfaces';
type TableLayout = CustomTableLayout;
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';
import { sanitizeDocDefinitionImages } from './pdf/sanitizeDocImages';

// Initialize pdfmake with bundled fonts
// pdfmake v0.3.x - direct assignment approach
const pdfMakeInstance = pdfMake as any;

// Assign VFS directly from the fonts module
if ((pdfFonts as any)?.pdfMake?.vfs) {
  pdfMakeInstance.vfs = (pdfFonts as any).pdfMake.vfs;
} else if ((pdfFonts as any)?.vfs) {
  pdfMakeInstance.vfs = (pdfFonts as any).vfs;
} else {
  // For ES modules, the default export contains the vfs
  pdfMakeInstance.vfs = pdfFonts;
}

// Define fonts - these must match the font files in vfs_fonts
pdfMakeInstance.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

// ============================================================================
// PAGE CONFIGURATION
// ============================================================================

const { margins } = DOCUMENT_DESIGN_STANDARDS;

// Convert mm to points (1mm = 2.83465 points)
const MM_TO_PT = 2.83465;

export const mmToPt = (mm: number): number => mm * MM_TO_PT;
export const ptToMm = (pt: number): number => pt / MM_TO_PT;

const { headers: headerStandards, footers: footerStandards } = DOCUMENT_DESIGN_STANDARDS;

export const PAGE_CONFIG = {
  pageSize: 'A4' as const,
  // [left, top, right, bottom] in points, derived from DOCUMENT_DESIGN_STANDARDS
  // rather than hand-tuned. Previously top was a hardcoded 64pt and bottom was
  // mmToPt(35)≈99pt, neither traceable to the standard; the 99pt bottom left ~25mm
  // of dead space between where content stopped and where the footer text sat.
  //
  // The running header band (createPageHeader) measures ~42pt ≈ 15mm, matching
  // headers.height, so a 20mm top margin clears it with ~5mm to spare. The footer
  // band is footers.height (12mm) sitting flush to the bottom edge.
  pageMargins: [
    mmToPt(margins.left),      // 15mm ≈ 42.5pt
    mmToPt(margins.top),       // 20mm ≈ 56.7pt — clears the ~15mm header band
    mmToPt(margins.right),     // 15mm ≈ 42.5pt
    mmToPt(margins.bottom),    // 20mm ≈ 56.7pt — holds the 12mm footer band
  ] as [number, number, number, number],
  pageOrientation: 'portrait' as const,
};

/**
 * Top offset for footer content inside the footer area, so the footer band sits
 * flush with the bottom page edge. pdfmake's footer area starts at
 * (pageHeight - pageMargins[3]); shifting down by (bottom - footerHeight) leaves
 * exactly footers.height of band below it.
 */
export const FOOTER_CONTENT_OFFSET_PT = mmToPt(
  Math.max(0, margins.bottom - footerStandards.height),
);

/** Declared height of the running header band, for generators that need to clear it. */
export const HEADER_BAND_HEIGHT_PT = mmToPt(headerStandards.height);

// A4 dimensions in points
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

// Content width in points (A4 width minus margins)
export const CONTENT_WIDTH_PT = A4_WIDTH_PT - PAGE_CONFIG.pageMargins[0] - PAGE_CONFIG.pageMargins[2];

// ============================================================================
// COLOR PALETTE (from DOCUMENT_DESIGN_STANDARDS)
// ============================================================================

const { colors } = DOCUMENT_DESIGN_STANDARDS;

export const COLORS = {
  // Primary brand colors
  primary: colors.primary,           // '#1a365d' - Dark blue for headings
  secondary: colors.secondary,       // '#2d3748' - Dark gray for body text
  accent: colors.accent,             // '#3182ce' - Blue for links/highlights

  // Status colors
  success: colors.success,           // '#38a169'
  warning: colors.warning,           // '#d69e2e'
  error: colors.error,               // '#e53e3e'

  // Text colors
  textPrimary: colors.text.primary,  // '#1a202c'
  textSecondary: colors.text.secondary, // '#4a5568'
  textMuted: colors.text.muted,      // '#718096'

  // Background colors
  bgPage: colors.background.page,    // '#ffffff'
  bgCard: colors.background.card,    // '#f7fafc'
  bgHeader: colors.background.header, // '#edf2f7'

  // Border color
  border: '#e2e8f0',
  
  // Pure white
  white: '#ffffff',
};

// ============================================================================
// TYPOGRAPHY (from DOCUMENT_DESIGN_STANDARDS)
// ============================================================================

const { typography } = DOCUMENT_DESIGN_STANDARDS;

export const DEFAULT_STYLES: StyleDictionary = {
  // Headings
  h1: {
    fontSize: typography.scale.h1,
    bold: true,
    color: COLORS.primary,
    margin: [0, 0, 0, mmToPt(typography.paragraphSpacing.afterH1)],
    lineHeight: typography.lineHeight.heading,
  },
  h2: {
    fontSize: typography.scale.h2,
    bold: true,
    color: COLORS.primary,
    margin: [0, 0, 0, mmToPt(typography.paragraphSpacing.afterH2)],
    lineHeight: typography.lineHeight.heading,
  },
  h3: {
    fontSize: typography.scale.h3,
    bold: true,
    color: COLORS.primary,
    margin: [0, 0, 0, mmToPt(typography.paragraphSpacing.afterH3)],
    lineHeight: typography.lineHeight.heading,
  },
  h4: {
    fontSize: typography.scale.h4,
    bold: true,
    color: COLORS.secondary,
    margin: [0, 0, 0, mmToPt(2)],
    lineHeight: typography.lineHeight.heading,
  },

  // Body text
  body: {
    fontSize: typography.scale.body,
    color: COLORS.textPrimary,
    lineHeight: typography.lineHeight.body,
  },
  bodySmall: {
    fontSize: 9,
    color: COLORS.textPrimary,
    lineHeight: typography.lineHeight.body,
  },

  // Caption and footer
  caption: {
    fontSize: typography.scale.caption,
    color: COLORS.textMuted,
    lineHeight: typography.lineHeight.body,
  },
  footer: {
    fontSize: typography.scale.footer,
    color: '#a0aec0',
  },

  // Table styles
  tableHeader: {
    fontSize: DOCUMENT_DESIGN_STANDARDS.tables.header.fontSize,
    bold: true,
    color: COLORS.white,
    fillColor: COLORS.primary,
  },
  tableBody: {
    fontSize: DOCUMENT_DESIGN_STANDARDS.tables.body.fontSize,
    color: COLORS.textPrimary,
  },

  // Special styles
  link: {
    color: COLORS.accent,
    decoration: 'underline' as const,
  },
  emphasis: {
    italics: true,
  },
  strong: {
    bold: true,
  },
  muted: {
    color: COLORS.textMuted,
  },

  // Status badges
  statusSuccess: {
    fontSize: 8,
    bold: true,
    color: COLORS.success,
  },
  statusWarning: {
    fontSize: 8,
    bold: true,
    color: COLORS.warning,
  },
  statusError: {
    fontSize: 8,
    bold: true,
    color: COLORS.error,
  },

  // Cover page styles
  coverTitle: {
    fontSize: 32,
    bold: true,
    color: COLORS.primary,
    alignment: 'center' as const,
  },
  coverSubtitle: {
    fontSize: 18,
    color: COLORS.secondary,
    alignment: 'center' as const,
  },
  coverMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    alignment: 'center' as const,
  },
};

// ============================================================================
// TABLE LAYOUTS
// ============================================================================

/**
 * Standard table layout with zebra striping and branded header
 */
export const getStandardTableLayout = (): TableLayout => ({
  hLineWidth: (i, node) => {
    if (i === 0 || i === node.table.body.length) return 0.5;
    return 0.25;
  },
  vLineWidth: () => 0,
  hLineColor: () => COLORS.border,
  vLineColor: () => COLORS.border,
  paddingLeft: () => mmToPt(DOCUMENT_DESIGN_STANDARDS.tables.cellPadding.horizontal),
  paddingRight: () => mmToPt(DOCUMENT_DESIGN_STANDARDS.tables.cellPadding.horizontal),
  paddingTop: () => mmToPt(DOCUMENT_DESIGN_STANDARDS.tables.cellPadding.vertical),
  paddingBottom: () => mmToPt(DOCUMENT_DESIGN_STANDARDS.tables.cellPadding.vertical),
  fillColor: (rowIndex) => {
    if (rowIndex === 0) return COLORS.primary; // Header row
    return rowIndex % 2 === 0 ? COLORS.bgCard : null; // Zebra stripe
  },
});

/**
 * Light table layout without zebra striping
 */
export const getLightTableLayout = (): TableLayout => ({
  hLineWidth: (i, node) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
  vLineWidth: () => 0,
  hLineColor: () => COLORS.border,
  paddingLeft: () => mmToPt(3),
  paddingRight: () => mmToPt(3),
  paddingTop: () => mmToPt(2),
  paddingBottom: () => mmToPt(2),
  fillColor: (rowIndex) => rowIndex === 0 ? COLORS.bgHeader : null,
});

/**
 * Borderless table layout for KPI cards
 */
export const getKpiTableLayout = (): TableLayout => ({
  hLineWidth: () => 0,
  vLineWidth: () => 0,
  paddingLeft: () => mmToPt(4),
  paddingRight: () => mmToPt(4),
  paddingTop: () => mmToPt(6),
  paddingBottom: () => mmToPt(6),
});

// ============================================================================
// DOCUMENT DEFINITION HELPERS
// ============================================================================

/**
 * Create a base document definition with standard settings
 */
export function createBaseDocDefinition(
  content: Content[],
  options?: {
    title?: string;
    author?: string;
    subject?: string;
    header?: TDocumentDefinitions['header'];
    footer?: TDocumentDefinitions['footer'];
    pageMargins?: [number, number, number, number];
    background?: TDocumentDefinitions['background'];
    pageOrientation?: 'portrait' | 'landscape';
    /** Merged over the standard defaults — for dense landscape registers. */
    defaultStyle?: TDocumentDefinitions['defaultStyle'];
    pageBreakBefore?: TDocumentDefinitions['pageBreakBefore'];
  }
): TDocumentDefinitions {
  return {
    pageSize: PAGE_CONFIG.pageSize,
    pageOrientation: options?.pageOrientation ?? PAGE_CONFIG.pageOrientation,
    pageMargins: options?.pageMargins ?? PAGE_CONFIG.pageMargins,

    info: {
      title: options?.title ?? 'Document',
      author: options?.author ?? 'Asset Management System',
      subject: options?.subject ?? '',
      creator: 'Asset Management System',
      producer: 'pdfmake',
    },

    defaultStyle: {
      font: 'Roboto',
      fontSize: typography.scale.body,
      color: COLORS.textPrimary,
      lineHeight: typography.lineHeight.body,
      ...options?.defaultStyle,
    },

    styles: DEFAULT_STYLES,

    header: options?.header,
    footer: options?.footer,
    background: options?.background,
    pageBreakBefore: options?.pageBreakBefore,

    content,
  };
}

// ============================================================================
// PDF GENERATION UTILITIES
// ============================================================================

/**
 * Convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Recursively find and validate canvas elements in document definition
 */
function validateCanvasElements(obj: any, path: string = 'root'): string[] {
  const issues: string[] = [];
  
  if (obj === null || obj === undefined) return issues;
  
  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      issues.push(...validateCanvasElements(item, `${path}[${index}]`));
    });
  } else if (typeof obj === 'object') {
    if ('canvas' in obj) {
      const canvas = obj.canvas;
      if (!Array.isArray(canvas)) {
        issues.push(`${path}.canvas is not an array: ${typeof canvas}`);
      } else {
        canvas.forEach((element: any, i: number) => {
          if (typeof element !== 'object' || element === null) {
            issues.push(`${path}.canvas[${i}] is not an object: ${typeof element}`);
          }
        });
      }
    }
    
    // Recurse into object properties
    for (const key of Object.keys(obj)) {
      if (key !== 'canvas') { // Don't recurse into canvas array items
        issues.push(...validateCanvasElements(obj[key], `${path}.${key}`));
      }
    }
  }
  
  return issues;
}

/**
 * Pre-flight every document definition before pdfmake touches it.
 *
 * Canvas nodes are checked (a malformed one is a coding error, so it throws), and
 * image nodes are sanitized: anything pdfkit cannot embed becomes a placeholder
 * plus a diagnostic instead of aborting the whole render. See
 * ./pdf/sanitizeDocImages.ts for why the guard lives at the sink.
 *
 * Runs exactly once per definition — the retry inside generatePdfBlob reuses the
 * already-sanitized object, so the warning panel is never appended twice.
 */
function preflightDocDefinition(docDefinition: TDocumentDefinitions, label: string): void {
  const canvasIssues = validateCanvasElements(docDefinition);
  if (canvasIssues.length > 0) {
    if (process.env.NODE_ENV === 'development') console.error('Canvas validation issues found:', canvasIssues);
    throw new Error(`Invalid canvas elements: ${canvasIssues.join(', ')}`);
  }

  const { dropped } = sanitizeDocDefinitionImages(docDefinition as unknown as Record<string, unknown>);
  if (dropped.length > 0) {
    console.warn(
      `[PDF] ${label}: ${dropped.length} image(s) could not be embedded and were replaced with placeholders:`,
    );
    for (const drop of dropped) {
      console.warn(`  • ${drop.label ?? drop.path} — ${drop.detail} [${drop.value}]`);
    }
  }
}

/**
 * Generate a PDF blob from a document definition
 * Uses Promise-based getStream for browser environments
 */
export async function generatePdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob> {

  preflightDocDefinition(docDefinition, 'generatePdfBlob');

  // Verify fonts are loaded
  const instance = pdfMake as any;
  const vfsKeys = Object.keys(instance.vfs || {});
  
  if (!instance.vfs || vfsKeys.length === 0) {
    throw new Error('PDF fonts not loaded. Please refresh the page and try again.');
  }
  
  const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
  
  // In browser, getStream returns a Promise that resolves to a readable stream
  try {
    const stream = await pdfDocGenerator.getStream();
    
    // Read the stream
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    
    // Combine chunks into blob
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    const blob = new Blob([result], { type: 'application/pdf' });
    return blob;
    
  } catch (streamError) {
    
    // pdfmake 0.3 uses Promise-based getBlob()
    try {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
      const blob: Blob = await pdfDocGenerator.getBlob();
      
      if (blob && blob.size > 0) {
        return blob;
      } else {
        throw new Error('Generated PDF is empty');
      }
    } catch (blobError) {
      if (process.env.NODE_ENV === 'development') console.error('getBlob failed:', blobError);
      throw blobError;
    }
  }
}

/**
 * Generate a PDF data URL from a document definition
 */
export async function generatePdfDataUrl(docDefinition: TDocumentDefinitions): Promise<string> {
  preflightDocDefinition(docDefinition, 'generatePdfDataUrl');
  const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
  // pdfmake 0.3 uses Promise-based getDataUrl()
  return await pdfDocGenerator.getDataUrl();
}

/**
 * Download a PDF directly from a document definition
 */
export function downloadPdf(docDefinition: TDocumentDefinitions, filename: string): void {
  preflightDocDefinition(docDefinition, 'downloadPdf');
  const pdfDocGenerator = pdfMake.createPdf(docDefinition);
  pdfDocGenerator.download(filename);
}

/**
 * Open a PDF in a new window/tab
 */
export function openPdfInNewWindow(docDefinition: TDocumentDefinitions): void {
  preflightDocDefinition(docDefinition, 'openPdfInNewWindow');
  const pdfDocGenerator = pdfMake.createPdf(docDefinition);
  pdfDocGenerator.open();
}

// ============================================================================
// TEST FUNCTION
// ============================================================================

/**
 * Test PDF generation with a simple document
 * Downloads a simple PDF to verify pdfmake is working
 */
export async function testPdfGeneration(): Promise<void> {
  
  const testDoc: TDocumentDefinitions = {
    content: [
      { text: 'PDF Generation Test', fontSize: 24, bold: true, margin: [0, 0, 0, 20] },
      { text: 'If you can see this, pdfmake is working correctly!', fontSize: 14 },
      { text: `Generated at: ${new Date().toISOString()}`, fontSize: 10, margin: [0, 20, 0, 0] },
    ],
    defaultStyle: {
      font: 'Roboto',
    },
  };
  
  try {
    const pdfDocGenerator = pdfMake.createPdf(testDoc) as any;
    
    // pdfmake 0.3 uses Promise-based getBlob()
    const blob: Blob = await pdfDocGenerator.getBlob();
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-pdf.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('PDF downloaded successfully! Check your downloads folder.');
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Test PDF generation failed:', error);
    alert('PDF generation failed: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Generate a test PDF blob to verify blob generation works
 */
export async function testPdfBlobGeneration(): Promise<Blob> {
  
  const testDoc: TDocumentDefinitions = {
    content: [
      { text: 'PDF Blob Generation Test', fontSize: 24, bold: true },
      { text: 'This PDF was generated as a blob.', fontSize: 14 },
    ],
    defaultStyle: {
      font: 'Roboto',
    },
  };
  
  return generatePdfBlob(testDoc);
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export { pdfMake };
export type { TDocumentDefinitions, Content, StyleDictionary, TableLayout };
