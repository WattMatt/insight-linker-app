/**
 * Word Document (DOCX) Report Generator v3.1.0
 * 
 * EXACT match to reference "Low Voltage Line Shop Board Audit" document:
 * - Cover Page: Template title header (small), template name (large), subsection name (large), vertical metadata
 * - Quality Score Dashboard: Large stats grid with SANS notice  
 * - Section Breakdown: Overall % + table + General Information
 * - Numbered sections with PASS/N/A badges and photo grids
 * - Confidential footer with page numbers and date
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageBreak,
  AlignmentType,
  WidthType,
  VerticalAlign,
  ShadingType,
  PageNumber,
  BorderStyle,
  convertInchesToTwip,
  TableLayoutType,
} from "https://esm.sh/docx@8.5.0";

const VERSION = '3.1.0';
const MAX_IMAGE_WIDTH = 400;
const MAX_CONCURRENT_DOWNLOADS = 5;

// Colors matching reference document exactly
const COLORS = {
  navy: '1a365d',
  darkBlue: '2d3748',
  gray: '718096',
  lightGray: 'e2e8f0',
  white: 'ffffff',
  green: '22c55e',
  red: 'ef4444',
  orange: 'f97316',
  blue: '3b82f6',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface InspectionSection {
  title: string;
  items: Array<{
    label: string;
    value: string | boolean | number;
    type?: string;
    notes?: string;
    photos?: string[];
  }>;
}

interface InspectionSnag {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
}

interface InspectionSignature {
  name: string;
  role?: string;
  signatureUrl?: string;
  signedAt?: string;
}

interface InspectionTenant {
  shopName: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
  meterImage?: string;
  breakerImage?: string;
  ctRatioImage?: string;
}

interface InspectionReportData {
  inspectionId: string;
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  generalInfo?: Record<string, any>;
  sections?: InspectionSection[];
  tenants?: InspectionTenant[];
  snags?: InspectionSnag[];
  signatures?: InspectionSignature[];
  subsectionName?: string;
}

interface RequestPayload {
  reportType: string;
  inspection: InspectionReportData;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string;
  accentColor?: string;
}

type ImageCache = Map<string, Uint8Array>;

// ============================================================================
// CALCULATIONS
// ============================================================================

interface SectionStats {
  name: string;
  items: number;
  pass: number;
  fail: number;
  photos: number;
  score: number;
}

function calculateStats(sections: InspectionSection[] | undefined): {
  totalItems: number;
  passed: number;
  failed: number;
  pending: number;
  totalPhotos: number;
  compliance: number;
  sectionStats: SectionStats[];
} {
  if (!sections || sections.length === 0) {
    return { totalItems: 0, passed: 0, failed: 0, pending: 0, totalPhotos: 0, compliance: 0, sectionStats: [] };
  }
  
  let totalItems = 0;
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let totalPhotos = 0;
  const sectionStats: SectionStats[] = [];
  
  for (const section of sections) {
    let sectionPassed = 0;
    let sectionFailed = 0;
    let sectionPhotos = 0;
    
    for (const item of section.items) {
      totalItems++;
      const photos = item.photos?.length || 0;
      totalPhotos += photos;
      sectionPhotos += photos;
      
      const value = item.value;
      const valueStr = String(value).toLowerCase();
      
      if (value === true || valueStr === 'pass' || valueStr === 'yes' || valueStr === 'compliant') {
        passed++;
        sectionPassed++;
      } else if (value === false || valueStr === 'fail' || valueStr === 'no' || valueStr === 'non-compliant') {
        failed++;
        sectionFailed++;
      } else if (valueStr === 'n/a' || valueStr === '' || value === null || value === undefined) {
        pending++;
      } else {
        // Has a non-empty value, count as pass
        passed++;
        sectionPassed++;
      }
    }
    
    const sectionTotal = section.items.length;
    const sectionScore = sectionTotal > 0 ? Math.round((sectionPassed / sectionTotal) * 100) : 0;
    
    sectionStats.push({
      name: section.title,
      items: sectionTotal,
      pass: sectionPassed,
      fail: sectionFailed,
      photos: sectionPhotos,
      score: sectionScore,
    });
  }
  
  const compliance = totalItems > 0 ? Math.round((passed / totalItems) * 100) : 0;
  
  return { totalItems, passed, failed, pending, totalPhotos, compliance, sectionStats };
}

// ============================================================================
// IMAGE HANDLING
// ============================================================================

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  
  try {
    const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
    if (publicMatch) {
      return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
    }
    
    const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^\/]+)\/([^?]+)/);
    if (signedMatch) {
      return { bucket: signedMatch[1], path: decodeURIComponent(signedMatch[2]) };
    }
    
    return null;
  } catch {
    return null;
  }
}

async function downloadSingleImage(
  supabase: any,
  supabaseUrl: string,
  url: string,
  maxWidth: number = MAX_IMAGE_WIDTH
): Promise<Uint8Array | null> {
  if (!url) return null;
  
  if (url.startsWith('data:')) {
    try {
      const [, base64Data] = url.split(',');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch {
      return null;
    }
  }
  
  const parsed = parseStorageUrl(url);
  
  if (parsed) {
    const transformUrl = `${supabaseUrl}/storage/v1/render/image/public/${parsed.bucket}/${parsed.path}?width=${maxWidth}&quality=75`;
    
    try {
      const response = await fetch(transformUrl);
      if (response.ok) {
        const buffer = new Uint8Array(await response.arrayBuffer());
        console.log(`[img] ✓ ${parsed.path.substring(0, 30)}... ${Math.round(buffer.length / 1024)}KB`);
        return buffer;
      }
    } catch {
      // Fallback
    }
    
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) return null;
    
    return new Uint8Array(await data.arrayBuffer());
  }
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

function collectAllImageUrls(data: RequestPayload): string[] {
  const urls: string[] = [];
  
  if (data.siteLogoUrl) urls.push(data.siteLogoUrl);
  
  if (data.inspection.sections) {
    for (const section of data.inspection.sections) {
      for (const item of section.items) {
        if (item.photos) {
          urls.push(...item.photos.slice(0, 4));
        }
      }
    }
  }
  
  if (data.inspection.tenants) {
    for (const tenant of data.inspection.tenants) {
      if (tenant.meterImage) urls.push(tenant.meterImage);
      if (tenant.breakerImage) urls.push(tenant.breakerImage);
      if (tenant.ctRatioImage) urls.push(tenant.ctRatioImage);
    }
  }
  
  if (data.inspection.snags) {
    for (const snag of data.inspection.snags) {
      if (snag.photos) urls.push(...snag.photos.slice(0, 2));
    }
  }
  
  if (data.inspection.signatures) {
    for (const sig of data.inspection.signatures) {
      if (sig.signatureUrl) urls.push(sig.signatureUrl);
    }
  }
  
  return [...new Set(urls)];
}

async function preloadAllImages(
  supabase: any,
  supabaseUrl: string,
  urls: string[]
): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  
  console.log(`[preload] Starting parallel download of ${urls.length} images...`);
  
  for (let i = 0; i < urls.length; i += MAX_CONCURRENT_DOWNLOADS) {
    const batch = urls.slice(i, i + MAX_CONCURRENT_DOWNLOADS);
    const results = await Promise.all(
      batch.map(async (url) => {
        const buffer = await downloadSingleImage(supabase, supabaseUrl, url);
        return { url, buffer };
      })
    );
    
    for (const { url, buffer } of results) {
      if (buffer) cache.set(url, buffer);
    }
  }
  
  console.log(`[preload] ✓ Cached ${cache.size}/${urls.length} images`);
  return cache;
}

// ============================================================================
// HELPERS
// ============================================================================

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  bottom: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  left: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  right: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
};

const thinBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getStatusText(value: any): { text: string; color: string } {
  const valueStr = String(value).toLowerCase();
  if (value === true || valueStr === 'pass' || valueStr === 'yes' || valueStr === 'compliant') {
    return { text: 'PASS', color: COLORS.green };
  }
  if (value === false || valueStr === 'fail' || valueStr === 'no') {
    return { text: 'FAIL', color: COLORS.red };
  }
  if (valueStr === 'n/a' || valueStr === '' || value === null || value === undefined) {
    return { text: 'N/A', color: COLORS.gray };
  }
  return { text: String(value), color: COLORS.navy };
}

// ============================================================================
// PAGE 1: COVER PAGE
// ============================================================================

function buildCoverPage(
  data: RequestPayload,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const templateName = data.inspection.templateName || 'Electrical Inspection Report';
  const subsectionName = data.inspection.subsectionName || data.siteName;
  
  // Small template name at top (like header)
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: templateName, size: 20, color: COLORS.gray })],
      spacing: { after: 800 },
    })
  );
  
  // Large template title (centered, bold, navy)
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: templateName, bold: true, size: 48, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );
  
  // Logo if available
  if (data.siteLogoUrl) {
    const logoBuffer = imageCache.get(data.siteLogoUrl);
    if (logoBuffer) {
      elements.push(
        new Paragraph({
          children: [new ImageRun({ data: logoBuffer, transformation: { width: 200, height: 80 } })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    }
  }
  
  // Large subsection name (centered, bold, navy)
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: subsectionName.toUpperCase(), bold: true, size: 56, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    })
  );
  
  // Vertical metadata list (matching reference exactly)
  const metadata = [
    { label: 'Site', value: data.siteName },
    { label: 'Client', value: data.clientName || 'N/A' },
    { label: 'Inspector', value: data.inspection.inspectorName || 'N/A' },
    { label: 'Date', value: formatShortDate(data.inspection.inspectionDate) },
  ];
  
  for (const item of metadata) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${item.label}: `, size: 24, color: COLORS.gray }),
          new TextRun({ text: item.value || 'N/A', size: 24, color: COLORS.darkBlue }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
      })
    );
  }
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

// ============================================================================
// PAGE 2: QUALITY SCORE DASHBOARD
// ============================================================================

function buildQualityDashboard(stats: ReturnType<typeof calculateStats>): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Title
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'QUALITY SCORE DASHBOARD', bold: true, size: 40, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );
  
  // Large stats row: % COMPLIANCE | ITEMS CHECKED | PHOTOS
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: noBorders,
      rows: [
        // Labels row
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: '% COMPLIANCE', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
              width: { size: 33, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'ITEMS CHECKED', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
              width: { size: 33, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'PHOTOS', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
              width: { size: 33, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
        // Values row (large numbers)
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.compliance), bold: true, size: 96, color: COLORS.navy })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.totalItems), bold: true, size: 96, color: COLORS.navy })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.totalPhotos), bold: true, size: 96, color: COLORS.navy })], alignment: AlignmentType.CENTER })],
              borders: noBorders,
            }),
          ],
        }),
      ],
    })
  );
  
  // SANS notice
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'This inspection is conducted in accordance with SANS 10142-1 requirements', size: 20, italics: true, color: COLORS.gray })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );
  
  // 4-column grid: Items Passed | Items Failed | Pending Review | Photos Captured
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        // Header row
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Items Passed', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'dcfce7', type: ShadingType.SOLID },
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Items Failed', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'fee2e2', type: ShadingType.SOLID },
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Pending Review', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'fef3c7', type: ShadingType.SOLID },
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Photos Captured', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'dbeafe', type: ShadingType.SOLID },
              borders: thinBorders,
            }),
          ],
        }),
        // Values row
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.passed), bold: true, size: 48, color: COLORS.green })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })],
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.failed), bold: true, size: 48, color: COLORS.red })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })],
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.pending), bold: true, size: 48, color: COLORS.orange })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })],
              borders: thinBorders,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.totalPhotos), bold: true, size: 48, color: COLORS.blue })], alignment: AlignmentType.CENTER, spacing: { before: 100, after: 100 } })],
              borders: thinBorders,
            }),
          ],
        }),
      ],
    })
  );
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

// ============================================================================
// PAGE 3: SECTION BREAKDOWN + GENERAL INFO
// ============================================================================

function buildSectionBreakdown(
  data: RequestPayload,
  stats: ReturnType<typeof calculateStats>
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Large overall percentage
  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${stats.compliance}%`, bold: true, size: 72, color: COLORS.navy }),
        new TextRun({ text: ' OVERALL', size: 32, color: COLORS.gray }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    })
  );
  
  // Section Breakdown title
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'Section Breakdown', bold: true, size: 32, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );
  
  // Section breakdown table
  if (stats.sectionStats.length > 0) {
    const headerCells = ['Section', 'Items', 'Pass', 'Fail', 'Photos', 'Score'].map((text, i) =>
      new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: COLORS.white })], alignment: AlignmentType.CENTER })],
        shading: { fill: COLORS.navy, type: ShadingType.SOLID },
        borders: thinBorders,
        width: { size: i === 0 ? 40 : 12, type: WidthType.PERCENTAGE },
      })
    );
    
    const dataRows = stats.sectionStats.map(s =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.name, size: 18 })] })], borders: thinBorders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.items), size: 18 })], alignment: AlignmentType.CENTER })], borders: thinBorders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.pass), size: 18, color: COLORS.green })], alignment: AlignmentType.CENTER })], borders: thinBorders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.fail), size: 18, color: s.fail > 0 ? COLORS.red : COLORS.gray })], alignment: AlignmentType.CENTER })], borders: thinBorders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.photos), size: 18 })], alignment: AlignmentType.CENTER })], borders: thinBorders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${s.score}%`, size: 18, bold: true })], alignment: AlignmentType.CENTER })], borders: thinBorders }),
        ],
      })
    );
    
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: headerCells }), ...dataRows],
      })
    );
  }
  
  // GENERAL INFORMATION title
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'GENERAL INFORMATION', bold: true, size: 28, color: COLORS.navy })],
      spacing: { before: 400, after: 200 },
    })
  );
  
  // General info table (vertical layout like reference)
  const generalInfo = [
    ['Site Name', data.siteName],
    ['Subsection', data.inspection.subsectionName || 'N/A'],
    ['Client', data.clientName || 'N/A'],
    ['Inspection Date', formatDate(data.inspection.inspectionDate)],
    ['Inspector', data.inspection.inspectorName || 'N/A'],
    ['Template', data.inspection.templateName || 'N/A'],
  ];
  
  for (const [label, value] of generalInfo) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, size: 22, color: COLORS.gray }),
          new TextRun({ text: value || 'N/A', size: 22, color: COLORS.darkBlue }),
        ],
        spacing: { after: 60 },
      })
    );
  }
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  return elements;
}

// ============================================================================
// SECTION PAGES: Numbered sections with items and photos
// ============================================================================

function buildInspectionSections(
  sections: InspectionSection[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!sections || sections.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  sections.forEach((section, sectionIndex) => {
    // Section header: "1 NORMAL BOARD STATE IMAGES"
    elements.push(
      new Paragraph({
        children: [new TextRun({ text: `${sectionIndex + 1}  ${section.title.toUpperCase()}`, bold: true, size: 28, color: COLORS.navy })],
        spacing: { before: 300, after: 200 },
      })
    );
    
    // Items with status and photos
    for (const item of section.items) {
      const status = getStatusText(item.value);
      
      // Item row: Label | Status
      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: item.label, bold: true, size: 22 })] })],
                  borders: thinBorders,
                  shading: { fill: 'f8fafc', type: ShadingType.SOLID },
                  width: { size: 70, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: status.text, bold: true, size: 22, color: status.color })], alignment: AlignmentType.CENTER })],
                  borders: thinBorders,
                  width: { size: 30, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
          ],
        })
      );
      
      // Notes
      if (item.notes) {
        elements.push(
          new Paragraph({
            children: [new TextRun({ text: item.notes, size: 18, italics: true, color: COLORS.gray })],
            spacing: { before: 50, after: 50 },
          })
        );
      }
      
      // Photos in 2-column grid with "Photo 1", "Photo 2" labels
      if (item.photos && item.photos.length > 0) {
        // Process photos in pairs
        for (let i = 0; i < item.photos.length; i += 2) {
          const photoCells: TableCell[] = [];
          
          for (let j = i; j < Math.min(i + 2, item.photos.length); j++) {
            const buffer = imageCache.get(item.photos[j]);
            if (buffer) {
              photoCells.push(
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new ImageRun({ data: buffer, transformation: { width: 240, height: 180 } })],
                      alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: `Photo ${j + 1}`, size: 16, color: COLORS.gray })],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  borders: noBorders,
                  width: { size: 50, type: WidthType.PERCENTAGE },
                })
              );
            }
          }
          
          // Add empty cell if odd number
          if (photoCells.length === 1) {
            photoCells.push(new TableCell({ children: [new Paragraph({})], borders: noBorders, width: { size: 50, type: WidthType.PERCENTAGE } }));
          }
          
          if (photoCells.length > 0) {
            elements.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorders,
                rows: [new TableRow({ children: photoCells })],
              })
            );
          }
        }
      }
      
      elements.push(new Paragraph({ spacing: { after: 150 } }));
    }
    
    // Page break after each section except last
    if (sectionIndex < sections.length - 1) {
      elements.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });
  
  return elements;
}

// ============================================================================
// OBSERVATIONS & SNAGS
// ============================================================================

function buildSnagsSection(
  snags: InspectionSnag[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!snags || snags.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'OBSERVATIONS & ISSUES', bold: true, size: 28, color: COLORS.navy })],
      spacing: { after: 200 },
    })
  );
  
  for (const snag of snags) {
    const statusColor = snag.status === 'resolved' ? COLORS.green : snag.status === 'in_progress' ? COLORS.orange : COLORS.red;
    
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: snag.title, bold: true, size: 20 })] })],
                borders: thinBorders,
                width: { size: 70, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: snag.status.toUpperCase(), bold: true, size: 18, color: statusColor })], alignment: AlignmentType.CENTER })],
                borders: thinBorders,
              }),
            ],
          }),
        ],
      })
    );
    
    if (snag.description) {
      elements.push(new Paragraph({ children: [new TextRun({ text: snag.description, size: 18 })], spacing: { before: 50, after: 100 } }));
    }
    
    if (snag.photos) {
      for (const url of snag.photos.slice(0, 2)) {
        const buffer = imageCache.get(url);
        if (buffer) {
          elements.push(
            new Paragraph({
              children: [new ImageRun({ data: buffer, transformation: { width: 280, height: 210 } })],
              spacing: { before: 100, after: 100 },
            })
          );
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 150 } }));
  }
  
  return elements;
}

// ============================================================================
// SIGNATURES
// ============================================================================

function buildSignatures(
  signatures: InspectionSignature[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!signatures || signatures.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'SIGNATURES', bold: true, size: 28, color: COLORS.navy })],
      spacing: { after: 200 },
    })
  );
  
  for (const sig of signatures) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: sig.name, bold: true, size: 20 }),
          sig.role ? new TextRun({ text: ` (${sig.role})`, size: 18, italics: true, color: COLORS.gray }) : new TextRun({}),
        ],
        spacing: { after: 50 },
      })
    );
    
    if (sig.signedAt) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: `Signed: ${new Date(sig.signedAt).toLocaleString()}`, size: 16, color: COLORS.gray })],
          spacing: { after: 100 },
        })
      );
    }
    
    if (sig.signatureUrl) {
      const buffer = imageCache.get(sig.signatureUrl);
      if (buffer) {
        elements.push(
          new Paragraph({
            children: [new ImageRun({ data: buffer, transformation: { width: 200, height: 80 } })],
            spacing: { after: 200 },
          })
        );
      }
    }
  }
  
  return elements;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  console.log(`[generate-docx-report v${VERSION}] Request received`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const payload: RequestPayload = await req.json();
    const { inspection, siteName } = payload;
    
    console.log('[DOCX] Site:', siteName);
    console.log('[DOCX] Template:', inspection.templateName);
    console.log('[DOCX] Sections:', inspection.sections?.length || 0);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Preload images
    const allImageUrls = collectAllImageUrls(payload);
    console.log(`[DOCX] Total images: ${allImageUrls.length}`);
    const imageCache = await preloadAllImages(supabase, supabaseUrl, allImageUrls);
    
    // Calculate stats
    const stats = calculateStats(inspection.sections);
    console.log(`[DOCX] Stats - Compliance: ${stats.compliance}%, Items: ${stats.totalItems}, Photos: ${stats.totalPhotos}`);
    
    // Build document sections
    const coverPage = buildCoverPage(payload, imageCache);
    const dashboard = buildQualityDashboard(stats);
    const breakdown = buildSectionBreakdown(payload, stats);
    const sections = buildInspectionSections(inspection.sections, imageCache);
    const snags = buildSnagsSection(inspection.snags, imageCache);
    const signatures = buildSignatures(inspection.signatures, imageCache);
    
    const templateName = inspection.templateName || 'Electrical Inspection Report';
    const todayDate = new Date().toLocaleDateString('en-GB');
    
    const doc = new Document({
      title: `${templateName} - ${inspection.subsectionName || siteName}`,
      creator: 'WM Compliance System',
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: templateName, size: 18, color: COLORS.gray })],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'CONFIDENTIAL - For authorized use only', size: 16, color: COLORS.gray })],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: COLORS.gray }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.gray }),
                  new TextRun({ text: ' of ', size: 16, color: COLORS.gray }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLORS.gray }),
                  new TextRun({ text: `    ${todayDate}`, size: 16, color: COLORS.gray }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        children: [
          ...coverPage,
          ...dashboard,
          ...breakdown,
          ...sections,
          ...snags,
          ...signatures,
        ],
      }],
    });
    
    console.log('[DOCX] Packing...');
    const buffer = await Packer.toBuffer(doc);
    console.log(`[DOCX] Document size: ${Math.round(buffer.byteLength / 1024)}KB`);
    
    // Upload with unique filename
    const timestamp = Date.now();
    const safeName = (inspection.subsectionName || siteName || 'Report')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${safeName}_Inspection_${timestamp}.docx`;
    const filePath = `inspection-reports/${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    
    if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
    
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
    
    console.log(`[DOCX] ✓ Done: ${urlData.publicUrl}`);
    
    return new Response(
      JSON.stringify({ success: true, url: urlData.publicUrl, fileName, version: VERSION }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[DOCX] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', version: VERSION }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
