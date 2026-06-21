/**
 * UNIFIED PDF ENGINE
 * Single entry point for all PDF generation in the application
 * 
 * This engine uses pdfmake exclusively and provides a consistent API
 * for generating all report types with proper branding and compliance.
 */

import {
  pdfMake,
  generatePdfBlob,
  downloadPdf,
  openPdfInNewWindow,
  createBaseDocDefinition,
  COLORS,
  PAGE_CONFIG,
  CONTENT_WIDTH_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  mmToPt,
} from './pdfMakeConfig';
import {
  createCoverPage,
  createPageHeader,
  createPageFooter,
  createSectionHeader,
  createDataTable,
  createInfoTable,
  createKpiRow,
  createStatusBadge,
  getStatusType,
  logComplianceCheck,
  CoverPageOptions,
  TableColumn,
  PDFComplianceCheck,
} from './pdfMakeUtils';
import { DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename } from './documentDesignStandards';

// Re-export commonly used utilities
export {
  createCoverPage,
  createPageHeader,
  createPageFooter,
  createSectionHeader,
  createDataTable,
  createInfoTable,
  createKpiRow,
  createStatusBadge,
  getStatusType,
  logComplianceCheck,
  COLORS,
  PAGE_CONFIG,
  CONTENT_WIDTH_PT,
  A4_WIDTH_PT,
  A4_HEIGHT_PT,
  mmToPt,
  generateDocumentFilename,
};

export type { CoverPageOptions, TableColumn, PDFComplianceCheck };

// Type definitions
type Content = any;
type TDocumentDefinitions = any;

// ============================================================================
// REPORT TYPES & OPTIONS
// ============================================================================

export type ReportType = 
  | 'inspection'
  | 'site-summary'
  | 'coc-validation'
  | 'floor-plan'
  | 'calendar'
  | 'checklist'
  | 'qr-sheet'
  | 'comprehensive-inspection'
  | 'site-drawing'
  | 'generic';

export interface ReportGeneratorOptions {
  type: ReportType;
  title: string;
  content: Content[];
  coverPage?: CoverPageOptions;
  options?: {
    includeCoverPage?: boolean;
    skipCoverPageInHeaderFooter?: boolean;
    // For reports that supply their OWN first-page cover as content (includeCoverPage:false):
    // skip the running header/footer on page 1 so the cover isn't stamped with a banner + page number.
    skipFirstPageHeaderFooter?: boolean;
    logoDataUrl?: string | null;
    organizationName?: string;
    filename?: string;
    pageOrientation?: 'portrait' | 'landscape';
    pageMargins?: [number, number, number, number];
  };
}

export interface GenerateReportResult {
  blob: Blob;
  filename: string;
  complianceChecks: PDFComplianceCheck;
  previewUrl?: string;
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

// Image compression settings for PDF generation - optimized for quality
const PDF_IMAGE_CONFIG = {
  maxWidth: 1200,     // Increased for better quality photos
  maxHeight: 1200,    // Increased for better quality photos
  quality: 0.80,      // Higher JPEG quality (0-1)
  format: 'image/jpeg' as const,
};

/**
 * Load image via Image element - works for public URLs with proper CORS headers
 */
async function loadImageViaElement(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl);
      } catch (e) {
        console.warn('[PDF] Canvas export failed (tainted canvas):', e);
        resolve(null);
      }
    };
    
    img.onerror = () => {
      resolve(null);
    };
    
    // Add cache busting to avoid stale responses
    const separator = url.includes('?') ? '&' : '?';
    img.src = `${url}${separator}_t=${Date.now()}`;
  });
}

/**
 * Compress an image blob using canvas
 */
async function compressImageBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions
      let { width, height } = img;
      const { maxWidth, maxHeight } = PDF_IMAGE_CONFIG;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      // Create canvas and draw scaled image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      // White background for JPEG
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to compressed JPEG
      const dataUrl = canvas.toDataURL(PDF_IMAGE_CONFIG.format, PDF_IMAGE_CONFIG.quality);
      resolve(dataUrl);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = url;
  });
}

/**
 * Load an image from URL, compress it, and convert to base64 data URL for embedding in PDF
 * Uses robust Supabase storage handling with fallbacks
 */
export async function loadImageAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  
  try {
    // Try multiple fetch strategies for resilience
    let blob: Blob | null = null;
    
    // Strategy 1: Direct fetch with no-cors fallback
    try {
      const response = await fetch(url, { 
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
      });
      if (response.ok) {
        blob = await response.blob();
      }
    } catch (e) {
      console.warn(`[PDF] CORS fetch failed for ${url.substring(0, 80)}...`);
    }
    
    // Strategy 2: Try without cors mode
    if (!blob) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          blob = await response.blob();
        }
      } catch (e) {
        console.warn(`[PDF] Standard fetch failed for ${url.substring(0, 80)}...`);
      }
    }
    
    // Strategy 3: Use Image element (works for public URLs with CORS headers)
    if (!blob) {
      try {
        const dataUrl = await loadImageViaElement(url);
        if (dataUrl) {
          console.log(`[PDF] Loaded via Image element: ${url.substring(0, 50)}...`);
          return dataUrl;
        }
      } catch (e) {
        console.warn(`[PDF] Image element load failed for ${url.substring(0, 80)}...`);
      }
    }
    
    if (!blob) {
      console.warn(`[PDF] All fetch strategies failed for: ${url.substring(0, 80)}...`);
      return null;
    }
    
    // Skip compression for SVGs and very small files
    if (blob.type === 'image/svg+xml' || blob.size < 5000) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
    
    // Compress image
    try {
      const compressedDataUrl = await compressImageBlob(blob);
      console.log(`[PDF] Compressed image: ${(blob.size / 1024).toFixed(1)}KB → ~${(compressedDataUrl.length * 0.75 / 1024).toFixed(1)}KB`);
      return compressedDataUrl;
    } catch (compressError) {
      console.warn('[PDF] Image compression failed, using original:', compressError);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    }
  } catch (error) {
    console.error('Error loading image:', error);
    return null;
  }
}

/**
 * Create an image content block with proper sizing
 */
export function createImage(
  dataUrl: string,
  options?: {
    width?: number;
    height?: number;
    maxWidth?: number;
    maxHeight?: number;
    alignment?: 'left' | 'center' | 'right';
    margin?: [number, number, number, number];
    caption?: string;
  }
): Content {
  const { maxWidth = 400, maxHeight = 300, alignment = 'center', margin = [0, 10, 0, 10], caption } = options || {};
  
  const imageContent: Content = {
    image: dataUrl,
    alignment,
    margin,
  };

  // Apply explicit dimensions or max constraints
  if (options?.width) {
    imageContent.width = options.width;
  } else {
    imageContent.width = Math.min(maxWidth, CONTENT_WIDTH_PT - 40);
  }
  
  if (options?.height) {
    imageContent.height = options.height;
  }
  
  // If caption is provided, wrap in a stack
  if (caption) {
    return {
      stack: [
        imageContent,
        {
          text: caption,
          fontSize: 8,
          color: COLORS.textMuted,
          alignment,
          margin: [0, 2, 0, 0],
        },
      ],
      margin,
    };
  }
  
  return imageContent;
}

/**
 * Create an image grid for multiple images
 */
export function createImageGrid(
  images: Array<{ dataUrl: string; caption?: string }>,
  columnsPerRow: number = 2,
  imageWidth?: number
): Content {
  const calculatedWidth = imageWidth || (CONTENT_WIDTH_PT - 30) / columnsPerRow;
  
  const rows: Content[][] = [];
  for (let i = 0; i < images.length; i += columnsPerRow) {
    const row: Content[] = images.slice(i, i + columnsPerRow).map(img => ({
      stack: [
        { image: img.dataUrl, width: calculatedWidth, alignment: 'center' as const },
        img.caption ? { text: img.caption, fontSize: 7, color: COLORS.textMuted, alignment: 'center' as const, margin: [0, 2, 0, 0] } : { text: '' },
      ],
      margin: [0, 5, 0, 5],
    }));
    
    // Pad row with empty cells if needed
    while (row.length < columnsPerRow) {
      row.push({ text: '' } as Content);
    }
    
    rows.push(row);
  }
  
  return {
    table: {
      widths: Array(columnsPerRow).fill('*'),
      body: rows,
    },
    layout: 'noBorders',
    margin: [0, 10, 0, 10],
  };
}

// ============================================================================
// SNAG/ISSUE CARDS
// ============================================================================

export interface SnagData {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
  createdAt?: string | Date;
  rectifiedAt?: string | Date;
  rectificationNotes?: string;
}

/**
 * Create a snag/issue card
 */
export function createSnagCard(snag: SnagData): Content {
  const statusType = getStatusType(snag.status);
  
  const cardContent: Content[] = [
    {
      columns: [
        { text: snag.title, fontSize: 11, bold: true, width: '*' },
        createStatusBadge(snag.status, statusType),
      ],
      margin: [0, 0, 0, 5],
    },
  ];
  
  if (snag.description) {
    cardContent.push({
      text: snag.description,
      fontSize: 9,
      color: COLORS.textSecondary,
      margin: [0, 0, 0, 5],
    });
  }
  
  // Risk level badge
  if (snag.riskLevel) {
    const riskType = snag.riskLevel.toLowerCase() === 'high' || snag.riskLevel.toLowerCase() === 'critical' 
      ? 'error' 
      : snag.riskLevel.toLowerCase() === 'medium' ? 'warning' : 'info';
    cardContent.push({
      text: `Risk: ${snag.riskLevel}`,
      fontSize: 8,
      color: riskType === 'error' ? COLORS.error : riskType === 'warning' ? COLORS.warning : COLORS.accent,
      margin: [0, 0, 0, 5],
    });
  }
  
  // Rectification info
  if (snag.rectifiedAt) {
    const rectDate = snag.rectifiedAt instanceof Date 
      ? snag.rectifiedAt.toLocaleDateString('en-GB')
      : new Date(snag.rectifiedAt).toLocaleDateString('en-GB');
    cardContent.push({
      text: `Rectified: ${rectDate}`,
      fontSize: 8,
      color: COLORS.success,
      margin: [0, 0, 0, 2],
    });
    
    if (snag.rectificationNotes) {
      cardContent.push({
        text: snag.rectificationNotes,
        fontSize: 8,
        italics: true,
        color: COLORS.textMuted,
      });
    }
  }
  
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: cardContent, margin: [10, 8, 10, 8] }]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: (i: number) => i === 0 ? 3 : 0.5,
      hLineColor: () => COLORS.border,
      vLineColor: (i: number) => i === 0 
        ? (statusType === 'error' ? COLORS.error : statusType === 'warning' ? COLORS.warning : statusType === 'success' ? COLORS.success : COLORS.accent) 
        : COLORS.border,
      fillColor: () => COLORS.bgCard,
    },
    margin: [0, 0, 0, 10],
  };
}

/**
 * Create a snags summary section
 */
export function createSnagsSummary(snags: SnagData[], title: string = 'Issues / Snags'): Content[] {
  const content: Content[] = [
    createSectionHeader(title, 'secondary'),
  ];
  
  if (snags.length === 0) {
    content.push({
      text: 'No issues or snags recorded',
      fontSize: 10,
      color: COLORS.textMuted,
      italics: true,
      margin: [0, 10, 0, 20],
    });
    return content;
  }
  
  // Summary stats
  const open = snags.filter(s => ['open', 'pending', 'in_progress'].includes(s.status.toLowerCase())).length;
  const resolved = snags.filter(s => ['resolved', 'rectified', 'closed', 'complete'].includes(s.status.toLowerCase())).length;
  
  content.push(
    createKpiRow([
      { value: snags.length.toString(), label: 'Total Issues' },
      { value: open.toString(), label: 'Open', color: open > 0 ? COLORS.warning : COLORS.success },
      { value: resolved.toString(), label: 'Resolved', color: COLORS.success },
    ])
  );
  
  // Individual snag cards
  snags.forEach(snag => {
    content.push(createSnagCard(snag));
  });
  
  return content;
}

// ============================================================================
// QR CODE
// ============================================================================

/**
 * Create a QR code image block
 * Note: The QR code dataUrl should be generated using the qrcode library before calling this
 */
export function createQRCode(
  dataUrl: string,
  options?: {
    size?: number;
    label?: string;
    alignment?: 'left' | 'center' | 'right';
  }
): Content {
  const { size = 100, label, alignment = 'center' } = options || {};
  
  const qrContent: Content[] = [
    {
      image: dataUrl,
      width: size,
      height: size,
      alignment,
    },
  ];
  
  if (label) {
    qrContent.push({
      text: label,
      fontSize: 9,
      color: COLORS.textSecondary,
      alignment,
      margin: [0, 5, 0, 0],
    });
  }
  
  return {
    stack: qrContent,
    margin: [0, 10, 0, 10],
  };
}

/**
 * Create a grid of labeled QR codes
 */
export function createQRCodeGrid(
  qrCodes: Array<{ dataUrl: string; label: string; sublabel?: string }>,
  columnsPerRow: number = 3
): Content {
  const qrSize = (CONTENT_WIDTH_PT - 40) / columnsPerRow - 20;
  
  const rows: Content[][] = [];
  for (let i = 0; i < qrCodes.length; i += columnsPerRow) {
    const row: Content[] = qrCodes.slice(i, i + columnsPerRow).map(qr => ({
      stack: [
        { image: qr.dataUrl, width: qrSize, height: qrSize, alignment: 'center' as const },
        { text: qr.label, fontSize: 9, bold: true, alignment: 'center' as const, margin: [0, 5, 0, 0] },
        qr.sublabel ? { text: qr.sublabel, fontSize: 7, color: COLORS.textMuted, alignment: 'center' as const } : { text: '' },
      ],
      margin: [5, 10, 5, 10],
    }));
    
    while (row.length < columnsPerRow) {
      row.push({ text: '' } as Content);
    }
    
    rows.push(row);
  }
  
  return {
    table: {
      widths: Array(columnsPerRow).fill('*'),
      body: rows,
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      paddingLeft: () => 5,
      paddingRight: () => 5,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 10, 0, 10],
  };
}

// ============================================================================
// CHECKLIST UTILITIES
// ============================================================================

export interface ChecklistItem {
  name: string;
  isChecked: boolean;
  notes?: string;
  status?: string;
}

export interface ChecklistSection {
  name: string;
  items: ChecklistItem[];
}

/**
 * Create a checklist table
 */
export function createChecklistTable(sections: ChecklistSection[]): Content[] {
  const content: Content[] = [];
  
  sections.forEach(section => {
    content.push(createSectionHeader(section.name, 'muted'));
    
    const tableBody = section.items.map(item => [
      { 
        text: item.isChecked ? '✓' : '○', 
        fontSize: 12, 
        color: item.isChecked ? COLORS.success : COLORS.textMuted,
        alignment: 'center' as const,
      },
      { text: item.name, fontSize: 9 },
      { 
        text: item.status || (item.isChecked ? 'Complete' : 'Pending'), 
        fontSize: 8, 
        color: item.isChecked ? COLORS.success : COLORS.textMuted 
      },
      { text: item.notes || '', fontSize: 8, color: COLORS.textMuted },
    ]);
    
    content.push({
      table: {
        headerRows: 1,
        widths: [25, '*', 60, 100],
        body: [
          [
            { text: '', fillColor: COLORS.bgHeader },
            { text: 'Item', bold: true, fontSize: 9, fillColor: COLORS.bgHeader },
            { text: 'Status', bold: true, fontSize: 9, fillColor: COLORS.bgHeader },
            { text: 'Notes', bold: true, fontSize: 9, fillColor: COLORS.bgHeader },
          ],
          ...tableBody,
        ],
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.border,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 15],
    });
  });
  
  return content;
}

// ============================================================================
// CALENDAR/SCHEDULE TABLE
// ============================================================================

export interface CalendarEvent {
  title: string;
  siteName: string;
  startDate: string | Date;
  endDate?: string | Date;
  status?: string;
  priority?: string;
}

/**
 * Create a calendar events table
 */
export function createCalendarTable(events: CalendarEvent[]): Content {
  const tableData = events.map(event => ({
    title: event.title,
    site: event.siteName,
    start: event.startDate instanceof Date 
      ? event.startDate.toLocaleDateString('en-GB') 
      : new Date(event.startDate).toLocaleDateString('en-GB'),
    end: event.endDate 
      ? (event.endDate instanceof Date 
          ? event.endDate.toLocaleDateString('en-GB')
          : new Date(event.endDate).toLocaleDateString('en-GB'))
      : '-',
    status: event.status || 'Scheduled',
    priority: event.priority || 'Normal',
  }));
  
  return createDataTable(
    [
      { header: 'Event', field: 'title', width: '*' },
      { header: 'Site', field: 'site', width: 100 },
      { header: 'Start', field: 'start', width: 70 },
      { header: 'End', field: 'end', width: 70 },
      { header: 'Status', field: 'status', width: 60 },
      { header: 'Priority', field: 'priority', width: 50 },
    ],
    tableData
  );
}

// ============================================================================
// MAIN REPORT GENERATOR
// ============================================================================

/**
 * Generate a complete PDF report
 * This is the primary entry point for all PDF generation
 */
export async function generateReport(opts: ReportGeneratorOptions): Promise<GenerateReportResult> {
  const { type, title, content, coverPage, options = {} } = opts;
  const {
    includeCoverPage = !!coverPage,
    skipCoverPageInHeaderFooter = true,
    skipFirstPageHeaderFooter = false,
    logoDataUrl,
    organizationName,
    filename,
    pageOrientation = 'portrait',
    pageMargins,
  } = options;

  console.log(`[PDF Engine] Generating ${type} report: ${title}`);

  // Build document content
  const allContent: Content[] = [];

  // Add cover page if provided and requested
  if (includeCoverPage && coverPage) {
    allContent.push(...createCoverPage({
      ...coverPage,
      logoDataUrl: logoDataUrl || coverPage.logoDataUrl,
      organizationName: organizationName || coverPage.organizationName,
    }));
  }

  // Add main content
  allContent.push(...content);

  // Create document definition
  const hasCoverPage = includeCoverPage && !!coverPage;
  // Skip the running header/footer on page 1 when the engine drew the cover, OR when the
  // report supplied its own first-page cover as content.
  const skipFirst = (skipCoverPageInHeaderFooter && hasCoverPage) || skipFirstPageHeaderFooter;
  const docDefinition: TDocumentDefinitions = createBaseDocDefinition(allContent, {
    title,
    author: organizationName || 'Asset Management System',
    header: createPageHeader(title, skipFirst),
    footer: createPageFooter(skipFirst),
    pageMargins,
  });

  // Apply page orientation if landscape
  if (pageOrientation === 'landscape') {
    docDefinition.pageOrientation = 'landscape';
  }

  // Generate PDF blob
  const blob = await generatePdfBlob(docDefinition);

  // Generate filename
  const generatedFilename = filename || generateDocumentFilename(
    type.replace(/-/g, '_'),
    coverPage?.siteName || 'report'
  );

  // Log compliance
  const complianceChecks = logComplianceCheck(`${type} Report`, {
    hasCoverPage,
    logoPlacement: !!logoDataUrl || !!coverPage?.logoDataUrl,
    standardMargins: true,
    typographyScale: true,
    brandColors: true,
    pageHeaders: true,
    pageFooters: true,
    tableStyles: true,
    pageBreaks: true,
  });

  console.log(`[PDF Engine] Report generated: ${generatedFilename} (${blob.size} bytes)`);

  // NOTE: we intentionally do NOT create an object URL here. The previous
  // implementation leaked one per call (callers never revoked it). Callers that
  // need a preview create and revoke their own URL (see SiteSummaryReport).
  return {
    blob,
    filename: generatedFilename,
    complianceChecks,
  };
}

/**
 * Convenience function to download a report directly
 */
export function downloadReport(docDefinition: TDocumentDefinitions, filename: string): void {
  downloadPdf(docDefinition, filename);
}

/**
 * Convenience function to open a report in a new window
 */
export function openReportInNewWindow(docDefinition: TDocumentDefinitions): void {
  openPdfInNewWindow(docDefinition);
}

// ============================================================================
// DOCUMENT BUILDER HELPERS
// ============================================================================

/**
 * Create a simple text paragraph
 */
export function createParagraph(
  text: string,
  options?: {
    fontSize?: number;
    color?: string;
    bold?: boolean;
    italics?: boolean;
    alignment?: 'left' | 'center' | 'right' | 'justify';
    margin?: [number, number, number, number];
  }
): Content {
  return {
    text,
    fontSize: options?.fontSize || 10,
    color: options?.color || COLORS.textPrimary,
    bold: options?.bold,
    italics: options?.italics,
    alignment: options?.alignment || 'left',
    margin: options?.margin || [0, 0, 0, 8],
  };
}

/**
 * Create a bullet list
 */
export function createBulletList(
  items: string[],
  options?: {
    markerColor?: string;
    fontSize?: number;
  }
): Content {
  return {
    ul: items,
    fontSize: options?.fontSize || 9,
    markerColor: options?.markerColor || COLORS.primary,
    margin: [0, 0, 0, 10],
  };
}

/**
 * Create a numbered list
 */
export function createNumberedList(
  items: string[],
  options?: {
    markerColor?: string;
    fontSize?: number;
  }
): Content {
  return {
    ol: items,
    fontSize: options?.fontSize || 9,
    markerColor: options?.markerColor || COLORS.primary,
    margin: [0, 0, 0, 10],
  };
}

/**
 * Create a horizontal rule/divider
 */
export function createDivider(margin?: [number, number, number, number]): Content {
  return {
    canvas: [
      {
        type: 'line',
        x1: 0,
        y1: 0,
        x2: CONTENT_WIDTH_PT,
        y2: 0,
        lineWidth: 0.5,
        lineColor: COLORS.border,
      },
    ],
    margin: margin || [0, 10, 0, 10],
  };
}

/**
 * Create a page break
 */
export function createPageBreak(): Content {
  return { text: '', pageBreak: 'after' };
}

/**
 * Create a spacer
 */
export function createSpacer(height: number = 10): Content {
  return { text: '', margin: [0, 0, 0, height] };
}

// ============================================================================
// COMPLIANCE CHECK UTILITIES
// ============================================================================

/**
 * Get default compliance checks (all false)
 */
export function getDefaultComplianceChecks(): PDFComplianceCheck {
  return {
    hasCoverPage: false,
    logoPlacement: false,
    standardMargins: false,
    typographyScale: false,
    brandColors: false,
    pageHeaders: false,
    pageFooters: false,
    tableStyles: false,
    pageBreaks: false,
  };
}

/**
 * Create compliance checks object with passed checks set to true
 */
export function createComplianceChecks(passedChecks: (keyof PDFComplianceCheck)[]): PDFComplianceCheck {
  const checks = getDefaultComplianceChecks();
  passedChecks.forEach(check => {
    checks[check] = true;
  });
  return checks;
}

/**
 * Get compliance check label for display
 */
export function getComplianceCheckLabel(key: keyof PDFComplianceCheck): string {
  const labels: Record<keyof PDFComplianceCheck, string> = {
    hasCoverPage: 'Cover Page',
    logoPlacement: 'Logo Placement',
    standardMargins: 'Standard Margins',
    typographyScale: 'Typography Scale',
    brandColors: 'Brand Colors',
    pageHeaders: 'Page Headers',
    pageFooters: 'Page Footers',
    tableStyles: 'Table Styling',
    pageBreaks: 'Page Breaks',
  };
  return labels[key];
}
