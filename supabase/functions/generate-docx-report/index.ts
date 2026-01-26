/**
 * Word Document (DOCX) Report Generator v2.0
 * 
 * Optimized for performance:
 * - Pre-downloads all images in parallel
 * - Uses Supabase image transformation for resizing (reduces bandwidth)
 * - Caches images to avoid re-downloading
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
  convertInchesToTwip,
} from "https://esm.sh/docx@8.5.0";

const VERSION = '2.0.0';
const MAX_IMAGE_WIDTH = 400; // Max width for document images
const MAX_CONCURRENT_DOWNLOADS = 5;

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
// IMAGE HANDLING - OPTIMIZED
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
  
  // Handle data URLs
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
    // Use Supabase Image Transformation API for resizing
    // This dramatically reduces download size and processing time
    const transformUrl = `${supabaseUrl}/storage/v1/render/image/public/${parsed.bucket}/${parsed.path}?width=${maxWidth}&quality=75`;
    
    try {
      const response = await fetch(transformUrl);
      if (response.ok) {
        const buffer = new Uint8Array(await response.arrayBuffer());
        console.log(`[img] ✓ ${parsed.path.substring(0, 30)}... ${Math.round(buffer.length / 1024)}KB`);
        return buffer;
      }
    } catch {
      // Fallback to direct download if transformation fails
    }
    
    // Fallback: direct download
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) return null;
    
    const buffer = new Uint8Array(await data.arrayBuffer());
    console.log(`[img] ✓ fallback ${parsed.path.substring(0, 30)}... ${Math.round(buffer.length / 1024)}KB`);
    return buffer;
  }
  
  // External URL
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
          urls.push(...item.photos.slice(0, 4)); // Limit to 4 per item
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
        urls.push(...snag.photos.slice(0, 2)); // Limit to 2 per snag
      }
    }
  }
  
  if (data.inspection.signatures) {
    for (const sig of data.inspection.signatures) {
      if (sig.signatureUrl) urls.push(sig.signatureUrl);
    }
  }
  
  return [...new Set(urls)]; // Deduplicate
}

async function preloadAllImages(
  supabase: any,
  supabaseUrl: string,
  urls: string[]
): Promise<ImageCache> {
  const cache: ImageCache = new Map();
  
  console.log(`[preload] Starting parallel download of ${urls.length} images...`);
  
  // Process in batches to avoid overwhelming the server
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
// DOCUMENT BUILDERS
// ============================================================================

function createHeading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({
    text,
    heading: level,
    spacing: { after: 200 },
  });
}

function createLabelValue(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true }),
      new TextRun({ text: value }),
    ],
    spacing: { after: 100 },
  });
}

function createImageParagraph(buffer: Uint8Array, width: number, height: number): Paragraph {
  return new Paragraph({
    children: [
      new ImageRun({
        data: buffer,
        transformation: { width, height },
      }),
    ],
    spacing: { before: 100, after: 200 },
  });
}

function buildCoverPage(
  data: RequestPayload,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Logo
  if (data.siteLogoUrl) {
    const logoBuffer = imageCache.get(data.siteLogoUrl);
    if (logoBuffer) {
      elements.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: logoBuffer,
              transformation: { width: 150, height: 60 },
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        })
      );
    }
  }
  
  // Title
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'ELECTRICAL INSPECTION REPORT',
          bold: true,
          size: 48,
          color: '1a365d',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    })
  );
  
  if (data.inspection.subsectionName) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: data.inspection.subsectionName,
            size: 32,
            color: '4a5568',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
  }
  
  // Details table
  const detailRows: [string, string][] = [
    ['Site', data.siteName || 'N/A'],
    ['Client', data.clientName || 'N/A'],
    ['Template', data.inspection.templateName || 'N/A'],
    ['Inspector', data.inspection.inspectorName || 'N/A'],
    ['Date', data.inspection.inspectionDate || new Date().toLocaleDateString()],
    ['Status', data.inspection.status || 'Pending'],
  ];
  
  if (data.inspection.qualityRating) {
    detailRows.push(['Quality Rating', `${data.inspection.qualityRating}%`]);
  }
  
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: detailRows.map(([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })],
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: 'f7fafc', type: ShadingType.SOLID },
              verticalAlign: VerticalAlign.CENTER,
            }),
            new TableCell({
              children: [new Paragraph({ text: value })],
              width: { size: 70, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
            }),
          ],
        })
      ),
    })
  );
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  
  return elements;
}

function buildSections(
  sections: InspectionSection[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!sections || sections.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(createHeading('Inspection Details', HeadingLevel.HEADING_1));
  
  for (const section of sections) {
    elements.push(createHeading(section.title, HeadingLevel.HEADING_2));
    
    for (const item of section.items) {
      const valueText = typeof item.value === 'boolean' 
        ? (item.value ? '✓ Yes' : '✗ No')
        : String(item.value || 'N/A');
      
      elements.push(createLabelValue(item.label, valueText));
      
      if (item.notes) {
        elements.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Notes: ', italics: true, color: '718096' }),
              new TextRun({ text: item.notes, italics: true, color: '718096' }),
            ],
            spacing: { after: 100 },
          })
        );
      }
      
      // Photos from cache
      if (item.photos && item.photos.length > 0) {
        for (const photoUrl of item.photos.slice(0, 4)) {
          const buffer = imageCache.get(photoUrl);
          if (buffer) {
            elements.push(createImageParagraph(buffer, 300, 225));
          }
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }
  
  return elements;
}

function buildTenantSection(
  tenants: InspectionTenant[] | undefined,
  imageCache: ImageCache
): (Paragraph | Table)[] {
  if (!tenants || tenants.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(createHeading('Tenant Verification', HeadingLevel.HEADING_1));
  
  for (const tenant of tenants) {
    elements.push(createHeading(tenant.shopName, HeadingLevel.HEADING_2));
    
    if (tenant.shopNumber) elements.push(createLabelValue('Shop Number', tenant.shopNumber));
    if (tenant.meterSerialNumber) elements.push(createLabelValue('Meter Serial', tenant.meterSerialNumber));
    if (tenant.breakerSize) elements.push(createLabelValue('Breaker Size', tenant.breakerSize));
    if (tenant.ctSizeAndRatio) elements.push(createLabelValue('CT Ratio', tenant.ctSizeAndRatio));
    
    const imageUrls = [tenant.meterImage, tenant.breakerImage, tenant.ctRatioImage].filter(Boolean) as string[];
    for (const url of imageUrls) {
      const buffer = imageCache.get(url);
      if (buffer) {
        elements.push(createImageParagraph(buffer, 200, 150));
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
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
  elements.push(createHeading('Issues / Snags', HeadingLevel.HEADING_1));
  
  for (const snag of snags) {
    const statusColor = snag.status === 'resolved' ? '48bb78' 
                      : snag.status === 'in_progress' ? 'ed8936' 
                      : 'e53e3e';
    
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: snag.title, bold: true, size: 24 }),
          new TextRun({ text: '  ' }),
          new TextRun({ text: `[${snag.status.toUpperCase()}]`, color: statusColor, bold: true }),
        ],
        spacing: { after: 100 },
      })
    );
    
    if (snag.description) {
      elements.push(new Paragraph({ text: snag.description, spacing: { after: 100 } }));
    }
    
    if (snag.riskLevel) {
      elements.push(createLabelValue('Risk Level', snag.riskLevel));
    }
    
    if (snag.photos && snag.photos.length > 0) {
      for (const photoUrl of snag.photos.slice(0, 2)) {
        const buffer = imageCache.get(photoUrl);
        if (buffer) {
          elements.push(createImageParagraph(buffer, 250, 187));
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
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
  elements.push(createHeading('Signatures', HeadingLevel.HEADING_1));
  
  for (const sig of signatures) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({ text: sig.name, bold: true }),
          sig.role ? new TextRun({ text: ` (${sig.role})`, italics: true }) : new TextRun({ text: '' }),
        ],
        spacing: { after: 100 },
      })
    );
    
    if (sig.signedAt) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Signed: ', color: '718096' }),
            new TextRun({ text: new Date(sig.signedAt).toLocaleString(), color: '718096' }),
          ],
          spacing: { after: 100 },
        })
      );
    }
    
    if (sig.signatureUrl) {
      const buffer = imageCache.get(sig.signatureUrl);
      if (buffer) {
        elements.push(createImageParagraph(buffer, 200, 80));
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
    
    // Phase 1: Collect and preload ALL images in parallel
    const allImageUrls = collectAllImageUrls(payload);
    console.log(`[DOCX] Total images to download: ${allImageUrls.length}`);
    
    const imageCache = await preloadAllImages(supabase, supabaseUrl, allImageUrls);
    
    // Phase 2: Build document (no async, uses cached images)
    console.log('[DOCX] Building document...');
    const coverPage = buildCoverPage(payload, imageCache);
    const sections = buildSections(inspection.sections, imageCache);
    const tenants = buildTenantSection(inspection.tenants, imageCache);
    const snags = buildSnagSection(inspection.snags, imageCache);
    const signatures = buildSignatureSection(inspection.signatures, imageCache);
    
    const doc = new Document({
      title: `Inspection Report - ${inspection.subsectionName || siteName}`,
      description: `Generated on ${new Date().toISOString()}`,
      creator: 'WM Compliance System',
      sections: [{
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: siteName || 'Inspection Report', size: 18, color: '718096' }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Generated by WM Compliance | ', size: 16, color: '718096' }),
                  new TextRun({ text: `Page `, size: 16, color: '718096' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '718096' }),
                  new TextRun({ text: ' of ', size: 16, color: '718096' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '718096' }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          ...coverPage,
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
