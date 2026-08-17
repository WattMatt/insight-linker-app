/**
 * DOCUMENT DESIGN STANDARDS
 * Master reference for all reports and exports
 * 
 * This file defines the design standards that ALL PDF reports and document exports
 * must follow to ensure consistency, professionalism, and accessibility.
 */

import { localDateStamp } from './report/reportKernel';

export const DOCUMENT_DESIGN_STANDARDS = {
  // ============================================================================
  // 1. LOGO SIZING AND PLACEMENT
  // ============================================================================
  logo: {
    masterSize: {
      width: 40, // mm - standard logo width
      maxHeight: 20, // mm - maximum height to maintain aspect ratio
    },
    placement: {
      marginTop: 10, // mm from page top
      marginLeft: 15, // mm from left edge (or right-aligned with same margin)
    },
    clearSpace: 5, // mm minimum clear space around logo
    quality: {
      minDPI: 300,
      preferredFormat: 'PNG', // for transparency support
    },
  },

  // ============================================================================
  // 2. PAGE MARGINS AND GRID
  // ============================================================================
  margins: {
    top: 20, // mm
    bottom: 20, // mm
    left: 15, // mm
    right: 15, // mm
    header: 15, // mm from top for header content
    footer: 10, // mm from bottom for footer content
  },
  
  grid: {
    columns: 12,
    gutter: 5, // mm between columns
    maxContentWidth: 180, // mm for A4 with margins
  },

  // ============================================================================
  // 3. TYPOGRAPHY SCALE
  // ============================================================================
  typography: {
    // Font families
    fonts: {
      heading: 'Roboto',
      body: 'Roboto',
      mono: 'Courier',
    },
    
    // Type scale (in points)
    scale: {
      h1: 24,
      h2: 18,
      h3: 14,
      h4: 12,
      body: 10,
      caption: 8,
      footer: 7,
    },
    
    // Line heights (multiplier)
    lineHeight: {
      heading: 1.2,
      body: 1.5,
      tight: 1.1,
    },
    
    // Spacing after elements (in mm)
    paragraphSpacing: {
      afterH1: 8,
      afterH2: 6,
      afterH3: 4,
      afterParagraph: 4,
      afterList: 6,
    },
  },

  // ============================================================================
  // 4. COLORS AND CONTRAST
  // ============================================================================
  colors: {
    // Primary brand colors (as hex for PDF)
    primary: '#1a365d', // Dark blue for headings
    secondary: '#2d3748', // Dark gray for body text
    accent: '#3182ce', // Blue for links and highlights
    
    // Status colors
    success: '#38a169',
    warning: '#d69e2e',
    error: '#e53e3e',
    
    // Neutral colors
    text: {
      primary: '#1a202c',
      secondary: '#4a5568',
      muted: '#718096',
    },
    
    // Background colors
    background: {
      page: '#ffffff',
      card: '#f7fafc',
      header: '#edf2f7',
    },
    
    // Minimum contrast ratios (WCAG AA)
    minContrast: {
      normalText: 4.5,
      largeText: 3.0,
    },
  },

  // ============================================================================
  // 5. IMAGE STANDARDS
  // ============================================================================
  images: {
    // Resolution requirements
    minDPI: 150,
    preferredDPI: 300,
    
    // Maximum dimensions (in mm)
    maxWidth: 170,
    maxHeight: 200,
    
    // Thumbnail sizes
    thumbnail: {
      width: 40,
      height: 40,
    },
    
    // Scaling rules
    scaling: {
      maintainAspectRatio: true,
      allowUpscaling: false,
      maxUpscalePercent: 0,
    },
    
    // Margins around images
    margin: 5, // mm
    
    // Caption styling
    caption: {
      fontSize: 8,
      color: '#718096',
      marginTop: 2,
    },
  },

  // ============================================================================
  // 6. TABLES AND CHARTS
  // ============================================================================
  tables: {
    // Cell padding
    cellPadding: {
      horizontal: 3,
      vertical: 2,
    },
    
    // Header styling
    header: {
      backgroundColor: '#edf2f7',
      textColor: '#1a202c',
      fontWeight: 'bold',
      fontSize: 9,
    },
    
    // Body styling
    body: {
      fontSize: 9,
      alternateRowColor: '#f7fafc',
    },
    
    // Border styling
    border: {
      color: '#e2e8f0',
      width: 0.5,
    },
    
    // Maximum rows before page break consideration
    maxRowsPerPage: 25,
  },
  
  charts: {
    // Minimum readable font size
    minLabelSize: 8,
    
    // Legend placement
    legendPosition: 'bottom',
    
    // Axis label margins
    axisMargin: 10,
    
    // Ensure no truncation
    overflow: 'visible',
  },

  // ============================================================================
  // 7. CARDS AND UI ELEMENTS
  // ============================================================================
  cards: {
    padding: 8, // mm
    borderRadius: 2, // mm
    borderColor: '#e2e8f0',
    borderWidth: 0.5,
    shadow: false, // Shadows don't render well in PDF
    margin: 5, // mm between cards
  },
  
  icons: {
    standardSize: 4, // mm
    smallSize: 3, // mm
    largeSize: 6, // mm
    strokeWidth: 1.5,
  },
  
  bullets: {
    indent: 5, // mm
    spacing: 2, // mm between items
    markerSize: 1.5, // mm
  },

  // ============================================================================
  // 8. PAGE BREAKS AND FLOW
  // ============================================================================
  pageBreaks: {
    // Minimum content before break (in mm)
    minContentBeforeBreak: 30,
    
    // Keep headings with following content
    keepWithNext: {
      h1: 50, // mm of content to keep with H1
      h2: 40,
      h3: 30,
    },
    
    // Widow/orphan control
    minLinesTop: 2, // Minimum lines at top of page
    minLinesBottom: 2, // Minimum lines at bottom of page
    
    // Table splitting
    tableMinRowsOnPage: 3,
  },

  // ============================================================================
  // 9. HEADERS AND FOOTERS
  // ============================================================================
  headers: {
    height: 15, // mm
    fontSize: 8,
    color: '#718096',
    borderBottom: true,
    borderColor: '#e2e8f0',
    content: {
      left: 'document_title',
      right: 'company_logo',
    },
  },
  
  footers: {
    height: 12, // mm
    fontSize: 7,
    color: '#a0aec0',
    borderTop: true,
    borderColor: '#e2e8f0',
    content: {
      left: 'confidentiality_notice',
      center: 'page_number',
      right: 'generation_date',
    },
    confidentialityText: 'CONFIDENTIAL - For authorized use only',
    pageNumberFormat: 'Page {current} of {total}',
  },

  // ============================================================================
  // 10. EXPORT AND PREFLIGHT CHECKLIST
  // ============================================================================
  export: {
    format: 'PDF',
    version: '1.7',
    
    // Font embedding
    embedFonts: true,
    subsetFonts: true,
    
    // Color profile
    colorSpace: 'RGB', // Use CMYK for print
    
    // Compression
    imageCompression: 'JPEG',
    imageQuality: 0.92,
    
    // Accessibility
    tagged: true,
    language: 'en',
    
    // File naming
    namingPattern: '{document_type}_{site_name}_{date}',
    dateFormat: 'YYYY-MM-DD',
  },
  
  preflight: {
    checks: [
      'fonts_embedded',
      'images_resolution',
      'color_contrast',
      'page_breaks',
      'links_valid',
      'accessibility_tags',
      'file_size_optimized',
    ],
    maxFileSizeMB: 25,
  },
};

// ============================================================================
// HELPER FUNCTIONS FOR REPORT GENERATORS
// ============================================================================

// NOTE: getContentWidth, getContentHeight, getSafeImageDimensions, shouldBreakPage
// and generateFooterText were removed. All five had zero call sites — pdfmake does
// its own layout, so hand-rolled mm arithmetic and manual page-break prediction had
// nothing to drive. The standards they read are now consumed where they matter:
// margins by PAGE_CONFIG (pdfMakeConfig.ts), footers.height by the footer offset,
// and images.maxWidth/minDPI by the report image loader (pdf/loadReportImage.ts).

/**
 * Generate filename following naming convention
 */
export function generateDocumentFilename(
  documentType: string,
  siteName: string,
  date?: Date
): string {
  const { export: exportSettings } = DOCUMENT_DESIGN_STANDARDS;
  const sanitize = (str: string) => str.replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
  
  const dateStr = localDateStamp(date);
  
  return exportSettings.namingPattern
    .replace('{document_type}', sanitize(documentType))
    .replace('{site_name}', sanitize(siteName))
    .replace('{date}', dateStr) + '.pdf';
}

// ============================================================================
// DESIGN TASK CHECKLIST (for reference)
// ============================================================================
export const DESIGN_CHECKLIST = [
  {
    id: 'logo',
    task: 'Fix logo sizing and placement',
    details: 'Ensure all logos use the correct master size, align to margins, and maintain clear space.',
  },
  {
    id: 'cards',
    task: 'Prevent cropped cards and figures',
    details: 'Adjust frames and margins so cards and images never cut off at page edges or column breaks.',
  },
  {
    id: 'images',
    task: 'Correct image scaling and resolution',
    details: 'Replace low-res assets; set consistent scaling rules and focal points.',
  },
  {
    id: 'typography',
    task: 'Standardize typography',
    details: 'Apply defined type scale, paragraph styles, and consistent font weights across headings, body, and captions.',
  },
  {
    id: 'spacing',
    task: 'Resolve text spacing issues',
    details: 'Fix inconsistent leading, kerning, and paragraph spacing; eliminate widows and orphans.',
  },
  {
    id: 'grid',
    task: 'Enforce consistent margins and grid',
    details: 'Apply a single page grid and margin system for all pages and sections.',
  },
  {
    id: 'charts',
    task: 'Ensure charts and tables are fully visible',
    details: 'Resize or reflow charts so axes, labels, and legends are readable without overlap or truncation.',
  },
  {
    id: 'pageBreaks',
    task: 'Fix page breaks and flow',
    details: 'Move section breaks to avoid orphaned headings, split long tables across pages cleanly, and keep related content together.',
  },
  {
    id: 'ui',
    task: 'Align and tidy UI elements',
    details: 'Standardize card padding, icon sizes, and alignment of lists and bullets.',
  },
  {
    id: 'colors',
    task: 'Apply brand color and contrast rules',
    details: 'Correct color usage, ensure sufficient contrast for legibility and accessibility.',
  },
  {
    id: 'pagination',
    task: 'Update headers, footers, and pagination',
    details: 'Ensure accurate page numbers, consistent footer text, and correct confidentiality notice placement.',
  },
  {
    id: 'preflight',
    task: 'Final preflight and export QA',
    details: 'Run a checklist: fonts embedded, color profiles, bleeds, links, accessibility tags, and produce print-ready PDF.',
  },
];

export default DOCUMENT_DESIGN_STANDARDS;
