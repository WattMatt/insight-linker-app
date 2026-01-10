/**
 * PDFMAKE CONFIGURATION
 * Core configuration for pdfmake PDF generation
 * 
 * This file sets up pdfmake with proper fonts, page settings, and default styles
 * based on DOCUMENT_DESIGN_STANDARDS for consistent document output.
 */

import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// pdfmake types - use 'any' for complex types until proper type definitions are available
type TDocumentDefinitions = any;
type StyleDictionary = Record<string, any>;
type TableLayout = any;
type Content = any;
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';

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

export const PAGE_CONFIG = {
  pageSize: 'A4' as const,
  // [left, top, right, bottom] in points
  pageMargins: [
    mmToPt(margins.left),      // 15mm = ~42.5pt
    mmToPt(50),                // 50pt top for header space
    mmToPt(margins.right),     // 15mm = ~42.5pt
    mmToPt(50),                // 50pt bottom for footer space
  ] as [number, number, number, number],
  pageOrientation: 'portrait' as const,
};

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
  }
): TDocumentDefinitions {
  return {
    pageSize: PAGE_CONFIG.pageSize,
    pageOrientation: PAGE_CONFIG.pageOrientation,
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
    },

    styles: DEFAULT_STYLES,

    header: options?.header,
    footer: options?.footer,
    background: options?.background,

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
 * Generate a PDF blob from a document definition
 * Uses Promise-based getStream for browser environments
 */
export async function generatePdfBlob(docDefinition: TDocumentDefinitions): Promise<Blob> {
  console.log('Creating PDF with pdfmake...');
  
  // Validate canvas elements before generating
  const canvasIssues = validateCanvasElements(docDefinition);
  if (canvasIssues.length > 0) {
    console.error('Canvas validation issues found:', canvasIssues);
    throw new Error(`Invalid canvas elements: ${canvasIssues.join(', ')}`);
  }
  console.log('Canvas validation passed');
  
  // Verify fonts are loaded
  const instance = pdfMake as any;
  const vfsKeys = Object.keys(instance.vfs || {});
  console.log('VFS available:', vfsKeys.length > 0);
  
  if (!instance.vfs || vfsKeys.length === 0) {
    throw new Error('PDF fonts not loaded. Please refresh the page and try again.');
  }
  
  const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
  
  // In browser, getStream returns a Promise that resolves to a readable stream
  try {
    const stream = await pdfDocGenerator.getStream();
    console.log('Got stream:', typeof stream);
    
    // Read the stream
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    console.log('Stream chunks collected:', chunks.length);
    
    // Combine chunks into blob
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    const blob = new Blob([result], { type: 'application/pdf' });
    console.log('PDF blob created, size:', blob.size);
    return blob;
    
  } catch (streamError) {
    console.log('Stream method failed, trying Promise-based getBlob...');
    
    // pdfmake 0.3 uses Promise-based getBlob()
    try {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
      const blob: Blob = await pdfDocGenerator.getBlob();
      
      if (blob && blob.size > 0) {
        console.log('PDF blob via getBlob, size:', blob.size);
        return blob;
      } else {
        throw new Error('Generated PDF is empty');
      }
    } catch (blobError) {
      console.error('getBlob failed:', blobError);
      throw blobError;
    }
  }
}

/**
 * Generate a PDF data URL from a document definition
 */
export async function generatePdfDataUrl(docDefinition: TDocumentDefinitions): Promise<string> {
  const pdfDocGenerator = pdfMake.createPdf(docDefinition) as any;
  // pdfmake 0.3 uses Promise-based getDataUrl()
  return await pdfDocGenerator.getDataUrl();
}

/**
 * Download a PDF directly from a document definition
 */
export function downloadPdf(docDefinition: TDocumentDefinitions, filename: string): void {
  const pdfDocGenerator = pdfMake.createPdf(docDefinition);
  pdfDocGenerator.download(filename);
}

/**
 * Open a PDF in a new window/tab
 */
export function openPdfInNewWindow(docDefinition: TDocumentDefinitions): void {
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
  console.log('Testing PDF generation...');
  
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
    console.log('Test PDF blob generated, size:', blob.size);
    
    // Create a download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'test-pdf.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('Test PDF download started');
    alert('PDF downloaded successfully! Check your downloads folder.');
  } catch (error) {
    console.error('Test PDF generation failed:', error);
    alert('PDF generation failed: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Generate a test PDF blob to verify blob generation works
 */
export async function testPdfBlobGeneration(): Promise<Blob> {
  console.log('Testing PDF blob generation...');
  
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
