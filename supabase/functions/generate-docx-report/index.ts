/**
 * Word Document (DOCX) Report Generator
 * 
 * Generates professional inspection reports as Word documents using the docx library.
 * Benefits over PDF:
 * - Native image buffer support (no Base64 issues)
 * - Editable documents for clients
 * - Reliable rendering across platforms
 * - Efficient compression
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
  BorderStyle,
  TableOfContents,
  StyleLevel,
  convertInchesToTwip,
  VerticalAlign,
  ShadingType,
  PageNumber,
  NumberFormat,
} from "https://esm.sh/docx@8.5.0";

const VERSION = '1.0.0';

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

// ============================================================================
// IMAGE HANDLING
// ============================================================================

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url || typeof url !== 'string') return null;
  
  try {
    // Handle Supabase storage URLs
    // Format: https://xxx.supabase.co/storage/v1/object/public/bucket-name/path
    const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)/);
    if (publicMatch) {
      return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
    }
    
    // Format: https://xxx.supabase.co/storage/v1/object/sign/bucket-name/path?token=xxx
    const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^\/]+)\/([^?]+)/);
    if (signedMatch) {
      return { bucket: signedMatch[1], path: decodeURIComponent(signedMatch[2]) };
    }
    
    return null;
  } catch {
    return null;
  }
}

async function downloadImage(
  supabase: any,
  url: string
): Promise<{ buffer: Uint8Array; type: 'png' | 'jpeg' | 'gif' } | null> {
  if (!url) return null;
  
  // Handle data URLs
  if (url.startsWith('data:')) {
    try {
      const [header, base64Data] = url.split(',');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const type = header.includes('png') ? 'png' : header.includes('gif') ? 'gif' : 'jpeg';
      return { buffer: bytes, type };
    } catch (e) {
      console.error('[downloadImage] Failed to parse data URL:', e);
      return null;
    }
  }
  
  const parsed = parseStorageUrl(url);
  
  if (parsed) {
    // Use Supabase Storage API
    console.log(`[downloadImage] Downloading from storage: ${parsed.bucket}/${parsed.path.substring(0, 50)}...`);
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    
    if (error || !data) {
      console.error('[downloadImage] Storage download failed:', error?.message);
      return null;
    }
    
    const buffer = new Uint8Array(await data.arrayBuffer());
    const type = parsed.path.toLowerCase().endsWith('.png') ? 'png' 
               : parsed.path.toLowerCase().endsWith('.gif') ? 'gif' 
               : 'jpeg';
    console.log(`[downloadImage] ✓ Downloaded ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, type };
  }
  
  // Try direct fetch for external URLs
  try {
    console.log(`[downloadImage] Fetching external URL: ${url.substring(0, 60)}...`);
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[downloadImage] Fetch failed:', response.status);
      return null;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const type = contentType.includes('png') ? 'png' 
               : contentType.includes('gif') ? 'gif' 
               : 'jpeg';
    console.log(`[downloadImage] ✓ Fetched ${Math.round(buffer.length / 1024)}KB`);
    return { buffer, type };
  } catch (e) {
    console.error('[downloadImage] External fetch failed:', e);
    return null;
  }
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

function buildCoverPage(
  data: RequestPayload,
  logoImage: { buffer: Uint8Array; type: 'png' | 'jpeg' | 'gif' } | null
): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];
  
  // Logo if available
  if (logoImage) {
    elements.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoImage.buffer,
            transformation: { width: 150, height: 60 },
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      })
    );
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
  
  // Subtitle with subsection name
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

async function buildSections(
  sections: InspectionSection[] | undefined,
  supabase: any
): Promise<(Paragraph | Table)[]> {
  if (!sections || sections.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(createHeading('Inspection Details', HeadingLevel.HEADING_1));
  
  for (const section of sections) {
    elements.push(createHeading(section.title, HeadingLevel.HEADING_2));
    
    for (const item of section.items) {
      // Item header
      const valueText = typeof item.value === 'boolean' 
        ? (item.value ? '✓ Yes' : '✗ No')
        : String(item.value || 'N/A');
      
      elements.push(createLabelValue(item.label, valueText));
      
      // Notes if present
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
      
      // Photos
      if (item.photos && item.photos.length > 0) {
        for (const photoUrl of item.photos.slice(0, 4)) {
          const imageData = await downloadImage(supabase, photoUrl);
          if (imageData) {
            elements.push(
              new Paragraph({
                children: [
                  new ImageRun({
                    data: imageData.buffer,
                    transformation: { width: 300, height: 225 },
                  }),
                ],
                spacing: { before: 100, after: 200 },
              })
            );
          }
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }
  
  return elements;
}

async function buildTenantSection(
  tenants: InspectionTenant[] | undefined,
  supabase: any
): Promise<(Paragraph | Table)[]> {
  if (!tenants || tenants.length === 0) return [];
  
  const elements: (Paragraph | Table)[] = [];
  
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(createHeading('Tenant Verification', HeadingLevel.HEADING_1));
  
  for (const tenant of tenants) {
    elements.push(createHeading(tenant.shopName, HeadingLevel.HEADING_2));
    
    if (tenant.shopNumber) {
      elements.push(createLabelValue('Shop Number', tenant.shopNumber));
    }
    if (tenant.meterSerialNumber) {
      elements.push(createLabelValue('Meter Serial', tenant.meterSerialNumber));
    }
    if (tenant.breakerSize) {
      elements.push(createLabelValue('Breaker Size', tenant.breakerSize));
    }
    if (tenant.ctSizeAndRatio) {
      elements.push(createLabelValue('CT Ratio', tenant.ctSizeAndRatio));
    }
    
    // Tenant images in a row
    const imageUrls = [tenant.meterImage, tenant.breakerImage, tenant.ctRatioImage].filter(Boolean);
    
    for (const url of imageUrls) {
      if (url) {
        const imageData = await downloadImage(supabase, url);
        if (imageData) {
          elements.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageData.buffer,
                  transformation: { width: 200, height: 150 },
                }),
              ],
              spacing: { before: 100, after: 100 },
            })
          );
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }
  
  return elements;
}

async function buildSnagSection(
  snags: InspectionSnag[] | undefined,
  supabase: any
): Promise<(Paragraph | Table)[]> {
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
    
    // Snag photos
    if (snag.photos && snag.photos.length > 0) {
      for (const photoUrl of snag.photos.slice(0, 2)) {
        const imageData = await downloadImage(supabase, photoUrl);
        if (imageData) {
          elements.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageData.buffer,
                  transformation: { width: 250, height: 187 },
                }),
              ],
              spacing: { before: 100, after: 200 },
            })
          );
        }
      }
    }
    
    elements.push(new Paragraph({ spacing: { after: 200 } }));
  }
  
  return elements;
}

async function buildSignatureSection(
  signatures: InspectionSignature[] | undefined,
  supabase: any
): Promise<(Paragraph | Table)[]> {
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
      const imageData = await downloadImage(supabase, sig.signatureUrl);
      if (imageData) {
        elements.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imageData.buffer,
                transformation: { width: 200, height: 80 },
              }),
            ],
            spacing: { after: 300 },
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
    const { inspection, siteName, clientName, siteLogoUrl } = payload;
    
    console.log('[DOCX] Starting document generation');
    console.log('[DOCX] Site:', siteName);
    console.log('[DOCX] Sections:', inspection.sections?.length || 0);
    console.log('[DOCX] Tenants:', inspection.tenants?.length || 0);
    console.log('[DOCX] Snags:', inspection.snags?.length || 0);
    console.log('[DOCX] Signatures:', inspection.signatures?.length || 0);
    
    // Initialize Supabase client with service role for storage access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Download logo if provided
    let logoImage: { buffer: Uint8Array; type: 'png' | 'jpeg' | 'gif' } | null = null;
    if (siteLogoUrl) {
      logoImage = await downloadImage(supabase, siteLogoUrl);
    }
    
    // Build document sections
    const coverPage = buildCoverPage(payload, logoImage);
    const sections = await buildSections(inspection.sections, supabase);
    const tenants = await buildTenantSection(inspection.tenants, supabase);
    const snags = await buildSnagSection(inspection.snags, supabase);
    const signatures = await buildSignatureSection(inspection.signatures, supabase);
    
    // Create the document
    const doc = new Document({
      title: `Inspection Report - ${inspection.subsectionName || siteName}`,
      description: `Electrical inspection report generated on ${new Date().toISOString()}`,
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
    
    console.log('[DOCX] Packing document...');
    
    // Generate the DOCX buffer
    const buffer = await Packer.toBuffer(doc);
    console.log(`[DOCX] Document size: ${Math.round(buffer.byteLength / 1024)}KB`);
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = (inspection.subsectionName || siteName || 'Report')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${safeName}_Inspection_${timestamp}.docx`;
    
    // Upload to Supabase Storage
    const filePath = `inspection-reports/${fileName}`;
    console.log(`[DOCX] Uploading to: ${filePath}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });
    
    if (uploadError) {
      console.error('[DOCX] Upload error:', uploadError);
      throw new Error(`Failed to upload document: ${uploadError.message}`);
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;
    
    console.log(`[DOCX] ✓ Document uploaded successfully: ${publicUrl}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        fileName,
        version: VERSION,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
    
  } catch (error) {
    console.error('[DOCX] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        version: VERSION,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
