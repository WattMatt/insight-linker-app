/**
 * Word Document (DOCX) Report Generator v3.0
 * 
 * Matches the exact format of the reference "Low Voltage Line Shop Board Audit" document:
 * - Cover Page with template title, subsection name, metadata block
 * - Quality Score Dashboard (Page 2)
 * - Section Breakdown with Overall % and table (Page 3)
 * - Numbered sections with PASS/N/A badges and photo grids
 * - Professional header/footer on every page
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
  HeadingLevel,
  AlignmentType,
  WidthType,
  VerticalAlign,
  ShadingType,
  PageNumber,
  BorderStyle,
  convertInchesToTwip,
} from "https://esm.sh/docx@8.5.0";

const VERSION = '3.0.0';
const MAX_IMAGE_WIDTH = 400;
const MAX_CONCURRENT_DOWNLOADS = 5;

// Colors matching reference document
const COLORS = {
  navy: '1a365d',
  darkBlue: '2d3748',
  gray: '718096',
  lightGray: 'e2e8f0',
  white: 'ffffff',
  green: '48bb78',
  red: 'e53e3e',
  orange: 'ed8936',
  teal: '319795',
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
      if (value === true || value === 'PASS' || value === 'Yes' || value === 'pass') {
        passed++;
        sectionPassed++;
      } else if (value === false || value === 'FAIL' || value === 'No' || value === 'fail') {
        failed++;
        sectionFailed++;
      } else if (value === 'N/A' || value === '' || value === null || value === undefined) {
        pending++;
      } else {
        // Has a value, count as pass
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
    
    const buffer = new Uint8Array(await data.arrayBuffer());
    return buffer;
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
      if (snag.photos) {
        urls.push(...snag.photos.slice(0, 2));
      }
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
      if (buffer) {
        cache.set(url, buffer);
      }
    }
  }
  
  console.log(`[preload] ✓ Cached ${cache.size}/${urls.length} images`);
  return cache;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  bottom: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  left: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
  right: { style: BorderStyle.NONE, size: 0, color: COLORS.white },
};

const thinBorder = {
  top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
  right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.lightGray },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getStatusBadge(value: any): { text: string; color: string } {
  if (value === true || value === 'PASS' || value === 'Yes' || value === 'pass') {
    return { text: 'PASS', color: COLORS.green };
  }
  if (value === false || value === 'FAIL' || value === 'No' || value === 'fail') {
    return { text: 'FAIL', color: COLORS.red };
  }
  if (value === 'N/A' || value === '' || value === null || value === undefined) {
    return { text: 'N/A', color: COLORS.gray };
  }
  return { text: String(value), color: COLORS.navy };
}

// ============================================================================
// PAGE BUILDERS
// ============================================================================

function buildCoverPage(
  data: RequestPayload,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  const templateName = data.inspection.templateName || 'Electrical Inspection Report';
  
  // Header with template name (small, top)
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: templateName, size: 20, color: COLORS.gray })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 600 },
    })
  );
  
  // Large template title
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: templateName, bold: true, size: 56, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );
  
  // Logo (if available)
  if (data.siteLogoUrl) {
    const logoBuffer = imageCache.get(data.siteLogoUrl);
    if (logoBuffer) {
      elements.push(
        new Paragraph({
          children: [new ImageRun({ data: logoBuffer, transformation: { width: 180, height: 72 } })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      );
    }
  }
  
  // Large subsection name
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: data.inspection.subsectionName || data.siteName, bold: true, size: 72, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    })
  );
  
  // Metadata block (vertical layout like reference)
  const metadataItems = [
    ['Site', data.siteName],
    ['Client', data.clientName || 'N/A'],
    ['Inspector', data.inspection.inspectorName || 'N/A'],
    ['Date', formatDate(data.inspection.inspectionDate)],
  ];
  
  for (const [label, value] of metadataItems) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, size: 22, color: COLORS.gray }),
          new TextRun({ text: value || 'N/A', size: 22, color: COLORS.darkBlue }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      })
    );
  }
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  
  return elements;
}

function buildQualityScoreDashboard(stats: ReturnType<typeof calculateStats>): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Title
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'QUALITY SCORE DASHBOARD', bold: true, size: 36, color: COLORS.navy })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );
  
  // Top row: % COMPLIANCE | ITEMS CHECKED | PHOTOS
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorder,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: '% COMPLIANCE', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: String(stats.compliance), bold: true, size: 80, color: COLORS.navy })], alignment: AlignmentType.CENTER }),
              ],
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: noBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'ITEMS CHECKED', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: String(stats.totalItems), bold: true, size: 80, color: COLORS.navy })], alignment: AlignmentType.CENTER }),
              ],
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: noBorder,
            }),
            new TableCell({
              children: [
                new Paragraph({ children: [new TextRun({ text: 'PHOTOS', size: 18, color: COLORS.gray })], alignment: AlignmentType.CENTER }),
                new Paragraph({ children: [new TextRun({ text: String(stats.totalPhotos), bold: true, size: 80, color: COLORS.navy })], alignment: AlignmentType.CENTER }),
              ],
              width: { size: 33, type: WidthType.PERCENTAGE },
              borders: noBorder,
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
      spacing: { before: 300, after: 300 },
    })
  );
  
  // Status grid: Items Passed | Items Failed | Pending Review | Photos Captured
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: thinBorder,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Items Passed', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'f0fff4', type: ShadingType.SOLID },
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Items Failed', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'fff5f5', type: ShadingType.SOLID },
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Pending Review', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'fffaf0', type: ShadingType.SOLID },
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Photos Captured', size: 20, color: COLORS.darkBlue })], alignment: AlignmentType.CENTER })],
              shading: { fill: 'ebf8ff', type: ShadingType.SOLID },
              borders: thinBorder,
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.passed), bold: true, size: 40, color: COLORS.green })], alignment: AlignmentType.CENTER })],
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.failed), bold: true, size: 40, color: COLORS.red })], alignment: AlignmentType.CENTER })],
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.pending), bold: true, size: 40, color: COLORS.orange })], alignment: AlignmentType.CENTER })],
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: String(stats.totalPhotos), bold: true, size: 40, color: COLORS.teal })], alignment: AlignmentType.CENTER })],
              borders: thinBorder,
            }),
          ],
        }),
      ],
    })
  );
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  
  return elements;
}

function buildSectionBreakdownPage(
  data: RequestPayload,
  stats: ReturnType<typeof calculateStats>
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Overall percentage (large, centered)
  elements.push(
    new Paragraph({
      children: [
        new TextRun({ text: `${stats.compliance}%`, bold: true, size: 72, color: COLORS.navy }),
        new TextRun({ text: ' OVERALL', size: 36, color: COLORS.gray }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
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
    const headerRow = new TableRow({
      children: ['Section', 'Items', 'Pass', 'Fail', 'Photos', 'Score'].map((text, idx) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18, color: COLORS.white })], alignment: AlignmentType.CENTER })],
          shading: { fill: COLORS.navy, type: ShadingType.SOLID },
          width: { size: idx === 0 ? 40 : 12, type: WidthType.PERCENTAGE },
          borders: thinBorder,
        })
      ),
    });
    
    const dataRows = stats.sectionStats.map((section) =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: section.name, size: 18 })] })],
            borders: thinBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(section.items), size: 18 })], alignment: AlignmentType.CENTER })],
            borders: thinBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(section.pass), size: 18, color: COLORS.green })], alignment: AlignmentType.CENTER })],
            borders: thinBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(section.fail), size: 18, color: COLORS.red })], alignment: AlignmentType.CENTER })],
            borders: thinBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(section.photos), size: 18 })], alignment: AlignmentType.CENTER })],
            borders: thinBorder,
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `${section.score}%`, size: 18, bold: true })], alignment: AlignmentType.CENTER })],
            borders: thinBorder,
          }),
        ],
      })
    );
    
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [headerRow, ...dataRows],
      })
    );
  }
  
  // General Information section
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'GENERAL INFORMATION', bold: true, size: 28, color: COLORS.navy })],
      spacing: { before: 400, after: 200 },
    })
  );
  
  const generalInfo = [
    ['Site Name', data.siteName],
    ['Subsection', data.inspection.subsectionName || 'N/A'],
    ['Client', data.clientName || 'N/A'],
    ['Inspection Date', formatDate(data.inspection.inspectionDate)],
    ['Inspector', data.inspection.inspectorName || 'N/A'],
    ['Template', data.inspection.templateName || 'N/A'],
  ];
  
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: generalInfo.map(([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'f7fafc', type: ShadingType.SOLID },
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: value || 'N/A', size: 20 })] })],
              borders: thinBorder,
            }),
          ],
        })
      ),
    })
  );
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  
  return elements;
}

function buildInspectionSections(
  sections: InspectionSection[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!sections || sections.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  sections.forEach((section, sectionIndex) => {
    // Section header with number (e.g., "1 NORMAL BOARD STATE IMAGES")
    elements.push(
      new Paragraph({
        children: [new TextRun({ text: `${sectionIndex + 1}  ${section.title.toUpperCase()}`, bold: true, size: 28, color: COLORS.navy })],
        spacing: { before: 300, after: 200 },
      })
    );
    
    // Group items, each with status badge and photos
    for (const item of section.items) {
      const status = getStatusBadge(item.value);
      
      // Item row: Label with PASS/FAIL badge
      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: thinBorder,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: item.label, bold: true, size: 20 })] })],
                  width: { size: 70, type: WidthType.PERCENTAGE },
                  borders: thinBorder,
                  shading: { fill: 'f7fafc', type: ShadingType.SOLID },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: status.text, bold: true, size: 20, color: status.color })], alignment: AlignmentType.CENTER })],
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  borders: thinBorder,
                }),
              ],
            }),
          ],
        })
      );
      
      // Notes if present
      if (item.notes) {
        elements.push(
          new Paragraph({
            children: [new TextRun({ text: item.notes, size: 18, italics: true, color: COLORS.gray })],
            spacing: { before: 50, after: 100 },
          })
        );
      }
      
      // Photos with "Photo 1", "Photo 2" labels
      if (item.photos && item.photos.length > 0) {
        const photoCells: TableCell[] = [];
        
        for (let i = 0; i < Math.min(item.photos.length, 2); i++) {
          const photoUrl = item.photos[i];
          const buffer = imageCache.get(photoUrl);
          
          if (buffer) {
            photoCells.push(
              new TableCell({
                children: [
                  new Paragraph({
                    children: [new ImageRun({ data: buffer, transformation: { width: 220, height: 165 } })],
                    alignment: AlignmentType.CENTER,
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: `Photo ${i + 1}`, size: 16, color: COLORS.gray })],
                    alignment: AlignmentType.CENTER,
                  }),
                ],
                borders: noBorder,
                width: { size: 50, type: WidthType.PERCENTAGE },
              })
            );
          }
        }
        
        if (photoCells.length > 0) {
          // Add empty cell if only one photo
          if (photoCells.length === 1) {
            photoCells.push(new TableCell({ children: [new Paragraph({})], borders: noBorder }));
          }
          
          elements.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: noBorder,
              rows: [new TableRow({ children: photoCells })],
            })
          );
        }
        
        // Handle additional photos (3, 4, etc.) in next row
        if (item.photos.length > 2) {
          const morePhotoCells: TableCell[] = [];
          
          for (let i = 2; i < Math.min(item.photos.length, 4); i++) {
            const photoUrl = item.photos[i];
            const buffer = imageCache.get(photoUrl);
            
            if (buffer) {
              morePhotoCells.push(
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new ImageRun({ data: buffer, transformation: { width: 220, height: 165 } })],
                      alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: `Photo ${i + 1}`, size: 16, color: COLORS.gray })],
                      alignment: AlignmentType.CENTER,
                    }),
                  ],
                  borders: noBorder,
                  width: { size: 50, type: WidthType.PERCENTAGE },
                })
              );
            }
          }
          
          if (morePhotoCells.length > 0) {
            if (morePhotoCells.length === 1) {
              morePhotoCells.push(new TableCell({ children: [new Paragraph({})], borders: noBorder }));
            }
            
            elements.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: noBorder,
                rows: [new TableRow({ children: morePhotoCells })],
              })
            );
          }
        }
      }
      
      elements.push(new Paragraph({ spacing: { after: 150 } }));
    }
    
    // Page break after each section (except last)
    if (sectionIndex < sections.length - 1) {
      elements.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });
  
  return elements;
}

function buildTenantSection(
  tenants: InspectionTenant[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!tenants || tenants.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'TENANT VERIFICATION', bold: true, size: 32, color: COLORS.navy })],
      spacing: { after: 200 },
    })
  );
  
  for (const tenant of tenants) {
    elements.push(
      new Paragraph({
        children: [new TextRun({ text: tenant.shopName, bold: true, size: 24, color: COLORS.darkBlue })],
        spacing: { before: 200, after: 100 },
      })
    );
    
    const infoItems = [
      ['Shop Number', tenant.shopNumber],
      ['Meter Serial', tenant.meterSerialNumber],
      ['Breaker Size', tenant.breakerSize],
      ['CT Ratio', tenant.ctSizeAndRatio],
    ].filter(([, val]) => val);
    
    for (const [label, value] of infoItems) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${label}: `, bold: true, size: 18 }),
            new TextRun({ text: String(value), size: 18 }),
          ],
        })
      );
    }
    
    // Tenant images in a row
    const tenantImages = [
      { url: tenant.meterImage, label: 'Meter' },
      { url: tenant.breakerImage, label: 'Breaker' },
      { url: tenant.ctRatioImage, label: 'CT Ratio' },
    ].filter(img => img.url);
    
    if (tenantImages.length > 0) {
      const cells = tenantImages.map(img => {
        const buffer = imageCache.get(img.url!);
        if (buffer) {
          return new TableCell({
            children: [
              new Paragraph({
                children: [new ImageRun({ data: buffer, transformation: { width: 150, height: 112 } })],
                alignment: AlignmentType.CENTER,
              }),
              new Paragraph({
                children: [new TextRun({ text: img.label, size: 16, color: COLORS.gray })],
                alignment: AlignmentType.CENTER,
              }),
            ],
            borders: noBorder,
          });
        }
        return new TableCell({ children: [new Paragraph({})], borders: noBorder });
      });
      
      elements.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: [new TableRow({ children: cells })],
        })
      );
    }
  }
  
  return elements;
}

function buildSnagSection(
  snags: InspectionSnag[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!snags || snags.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'OBSERVATIONS & ISSUES', bold: true, size: 32, color: COLORS.navy })],
      spacing: { after: 200 },
    })
  );
  
  for (const snag of snags) {
    const statusColor = snag.status === 'resolved' ? COLORS.green
      : snag.status === 'in_progress' ? COLORS.orange
      : COLORS.red;
    
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: thinBorder,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: snag.title, bold: true, size: 20 })] })],
                width: { size: 70, type: WidthType.PERCENTAGE },
                borders: thinBorder,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: snag.status.toUpperCase(), bold: true, size: 18, color: statusColor })], alignment: AlignmentType.CENTER })],
                borders: thinBorder,
              }),
            ],
          }),
        ],
      })
    );
    
    if (snag.description) {
      elements.push(
        new Paragraph({
          children: [new TextRun({ text: snag.description, size: 18 })],
          spacing: { before: 50, after: 100 },
        })
      );
    }
    
    if (snag.photos && snag.photos.length > 0) {
      for (const photoUrl of snag.photos.slice(0, 2)) {
        const buffer = imageCache.get(photoUrl);
        if (buffer) {
          elements.push(
            new Paragraph({
              children: [new ImageRun({ data: buffer, transformation: { width: 250, height: 187 } })],
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

function buildSignatureSection(
  signatures: InspectionSignature[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!signatures || signatures.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(
    new Paragraph({
      children: [new TextRun({ text: 'SIGNATURES', bold: true, size: 32, color: COLORS.navy })],
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
    console.log('[DOCX] Sections:', inspection.sections?.length || 0);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Phase 1: Preload all images
    const allImageUrls = collectAllImageUrls(payload);
    console.log(`[DOCX] Total images to download: ${allImageUrls.length}`);
    const imageCache = await preloadAllImages(supabase, supabaseUrl, allImageUrls);
    
    // Phase 2: Calculate stats
    const stats = calculateStats(inspection.sections);
    console.log(`[DOCX] Stats - Compliance: ${stats.compliance}%, Items: ${stats.totalItems}, Photos: ${stats.totalPhotos}`);
    
    // Phase 3: Build document sections
    const coverPage = buildCoverPage(payload, imageCache);
    const dashboard = buildQualityScoreDashboard(stats);
    const breakdown = buildSectionBreakdownPage(payload, stats);
    const sections = buildInspectionSections(inspection.sections, imageCache);
    const tenants = buildTenantSection(inspection.tenants, imageCache);
    const snags = buildSnagSection(inspection.snags, imageCache);
    const signatures = buildSignatureSection(inspection.signatures, imageCache);
    
    const templateName = inspection.templateName || 'Electrical Inspection Report';
    const currentDate = new Date().toLocaleDateString('en-GB');
    
    const doc = new Document({
      title: `${templateName} - ${inspection.subsectionName || siteName}`,
      description: `Generated on ${new Date().toISOString()}`,
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
                alignment: AlignmentType.LEFT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'CONFIDENTIAL - For authorized use only', size: 16, color: COLORS.gray }),
                ],
                alignment: AlignmentType.LEFT,
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: COLORS.gray }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COLORS.gray }),
                  new TextRun({ text: ' of ', size: 16, color: COLORS.gray }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COLORS.gray }),
                  new TextRun({ text: `    ${currentDate}`, size: 16, color: COLORS.gray }),
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
          ...tenants,
          ...snags,
          ...signatures,
        ],
      }],
    });
    
    console.log('[DOCX] Packing...');
    const buffer = await Packer.toBuffer(doc);
    console.log(`[DOCX] Document size: ${Math.round(buffer.byteLength / 1024)}KB`);
    
    // Upload
    const timestamp = new Date().toISOString().split('T')[0];
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
    
    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    
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
