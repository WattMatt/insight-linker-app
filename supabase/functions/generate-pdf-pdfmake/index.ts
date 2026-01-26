/**
 * PDFMake-based PDF Generator Edge Function
 * 
 * Professional Engineering Report Generator for SANS 10142-1 Compliance
 * 
 * Design Features:
 * - Professional cover page with logo, vertical accent bar, and metadata
 * - Quality Score Dashboard with circular compliance indicator
 * - Section breakdown tables with photo grids
 * - Tenant verification with labeled images
 * - Snags section with risk levels
 * - Signature section
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const CONFIG = {
  MAX_IMAGE_SIZE_KB: 400,
  IMAGE_TRANSFORM_WIDTH: 600,
  IMAGE_TRANSFORM_QUALITY: 75,
  LOGO_MAX_SIZE_KB: 600,
  MAX_IMAGES_PER_REPORT: 30,
  PHOTO_WIDTH: 75,
  PHOTO_HEIGHT: 100,
};

// Color palette - professional engineering report
const COLORS = {
  primary: '#1e3a5f',
  secondary: '#0d7377',
  accent: '#2563eb',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  lightBg: '#f8fafc',
  border: '#e2e8f0',
  textPrimary: '#1e293b',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  white: '#ffffff',
};

// Placeholder SVG for failed images
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEzNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmaWxsPSIjOTRhM2I4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgVW5hdmFpbGFibGU8L3RleHQ+PC9zdmc+';

// Supabase client singleton
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClient) {
    supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return supabaseClient;
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const uint8Array = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binaryString = '';
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, Math.min(i + chunkSize, uint8Array.length));
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binaryString);
}

function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const urlObj = new URL(url);
    if (url.includes('/storage/v1/object/public/')) {
      const pathParts = urlObj.pathname.split('/storage/v1/object/public/');
      if (pathParts.length === 2) {
        const filePathWithBucket = pathParts[1];
        const firstSlashIndex = filePathWithBucket.indexOf('/');
        if (firstSlashIndex > 0) {
          return {
            bucket: decodeURIComponent(filePathWithBucket.substring(0, firstSlashIndex)),
            path: decodeURIComponent(filePathWithBucket.substring(firstSlashIndex + 1)),
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Logo URL tracking
const logoUrls = new Set<string>();

async function downloadImage(url: string, isLogo: boolean = false): Promise<string> {
  const parsed = parseSupabaseStorageUrl(url);
  
  if (parsed) {
    const supabase = getSupabaseClient();
    
    // For logos, try to get better quality
    if (isLogo) {
      console.log(`[Image] Downloading logo...`);
      try {
        // First try with transformation for manageable size
        const { data: signedUrlData } = await supabase.storage
          .from(parsed.bucket)
          .createSignedUrl(parsed.path, 120, {
            transform: { width: 400, quality: 90 }
          });
        
        if (signedUrlData?.signedUrl) {
          const resp = await fetch(signedUrlData.signedUrl);
          if (resp.ok) {
            const buffer = await resp.arrayBuffer();
            const sizeKB = buffer.byteLength / 1024;
            const mimeType = detectImageType(new Uint8Array(buffer));
            const base64 = arrayBufferToBase64(buffer);
            console.log(`[Image] Logo downloaded: ${Math.round(sizeKB)}KB`);
            return `data:${mimeType};base64,${base64}`;
          }
        }
        
        // Fallback to direct download
        const { data: blob, error } = await supabase.storage
          .from(parsed.bucket)
          .download(parsed.path);
        
        if (!error && blob) {
          const buffer = await blob.arrayBuffer();
          const sizeKB = buffer.byteLength / 1024;
          console.log(`[Image] Logo (original): ${Math.round(sizeKB)}KB`);
          
          if (sizeKB <= CONFIG.LOGO_MAX_SIZE_KB) {
            const mimeType = detectImageType(new Uint8Array(buffer));
            const base64 = arrayBufferToBase64(buffer);
            return `data:${mimeType};base64,${base64}`;
          }
        }
      } catch (err) {
        console.warn(`[Image] Logo download failed:`, err);
      }
      return PLACEHOLDER_IMAGE;
    }
    
    // Standard photos: use transformation for compression
    try {
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 60, {
          transform: {
            width: CONFIG.IMAGE_TRANSFORM_WIDTH,
            quality: CONFIG.IMAGE_TRANSFORM_QUALITY,
          }
        });
      
      if (!signedUrlError && signedUrlData?.signedUrl) {
        const response = await fetch(signedUrlData.signedUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          const sizeKB = buffer.byteLength / 1024;
          
          if (sizeKB <= CONFIG.MAX_IMAGE_SIZE_KB) {
            const mimeType = detectImageType(new Uint8Array(buffer));
            const base64 = arrayBufferToBase64(buffer);
            console.log(`[Image] Photo: ${Math.round(sizeKB)}KB`);
            return `data:${mimeType};base64,${base64}`;
          }
          console.warn(`[Image] Photo too large after transform: ${Math.round(sizeKB)}KB`);
        }
      }
      
      // Fallback: direct download
      const { data: blob, error } = await supabase.storage
        .from(parsed.bucket)
        .download(parsed.path);
      
      if (!error && blob) {
        const buffer = await blob.arrayBuffer();
        const sizeKB = buffer.byteLength / 1024;
        if (sizeKB <= CONFIG.MAX_IMAGE_SIZE_KB) {
          const mimeType = detectImageType(new Uint8Array(buffer));
          const base64 = arrayBufferToBase64(buffer);
          console.log(`[Image] Photo (original): ${Math.round(sizeKB)}KB`);
          return `data:${mimeType};base64,${base64}`;
        }
        console.warn(`[Image] Photo too large: ${Math.round(sizeKB)}KB, skipping`);
      }
    } catch (err) {
      console.warn(`[Image] Photo download error:`, err);
    }
  }
  
  // External URLs
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const sizeKB = buffer.byteLength / 1024;
      if (sizeKB <= CONFIG.MAX_IMAGE_SIZE_KB) {
        const mimeType = detectImageType(new Uint8Array(buffer));
        const base64 = arrayBufferToBase64(buffer);
        console.log(`[Image] External: ${Math.round(sizeKB)}KB`);
        return `data:${mimeType};base64,${base64}`;
      }
    }
  } catch (err) {
    console.warn(`[Image] External fetch failed:`, err);
  }
  
  return PLACEHOLDER_IMAGE;
}

// ============================================================================
// STATISTICS CALCULATION
// ============================================================================

interface Stats {
  totalItems: number;
  passCount: number;
  failCount: number;
  pendingCount: number;
  passPercentage: number;
  totalPhotos: number;
}

function isPassStatus(status: string): boolean {
  const s = String(status).toLowerCase().trim();
  return ['pass', 'passed', 'yes', 'compliant', 'ok', 'good', 'complete', 'completed', 'true'].includes(s);
}

function isFailStatus(status: string): boolean {
  const s = String(status).toLowerCase().trim();
  return ['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical', 'false'].includes(s);
}

function calculateStats(inspection: any): Stats {
  let totalItems = 0, passCount = 0, failCount = 0, pendingCount = 0, totalPhotos = 0;
  
  inspection.sections?.forEach((section: any) => {
    section.items?.forEach((item: any) => {
      totalItems++;
      const status = String(item.value || item.status || '');
      if (isPassStatus(status)) passCount++;
      else if (isFailStatus(status)) failCount++;
      else pendingCount++;
      if (item.photos?.length) totalPhotos += item.photos.length;
    });
  });
  
  inspection.tenants?.forEach((t: any) => {
    if (t.meterImage) totalPhotos++;
    if (t.breakerImage) totalPhotos++;
    if (t.ctRatioImage) totalPhotos++;
  });
  
  inspection.snags?.forEach((s: any) => {
    if (s.photos?.length) totalPhotos += s.photos.length;
  });
  
  return {
    totalItems,
    passCount,
    failCount,
    pendingCount,
    passPercentage: totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0,
    totalPhotos,
  };
}

// ============================================================================
// STATUS BADGE GENERATOR
// ============================================================================

function getStatusBadgeTable(status: string): any {
  const s = String(status).toLowerCase().trim();
  let text = status || 'N/A';
  let textColor = COLORS.textMuted;
  let bgColor = '#f1f5f9';
  
  if (isPassStatus(s)) {
    text = 'PASS';
    textColor = COLORS.white;
    bgColor = COLORS.success;
  } else if (isFailStatus(s)) {
    text = 'FAIL';
    textColor = COLORS.white;
    bgColor = COLORS.error;
  } else if (['pending', 'in_progress', 'in progress'].includes(s)) {
    text = 'PENDING';
    textColor = COLORS.white;
    bgColor = COLORS.warning;
  } else if (['n/a', 'na', 'not applicable'].includes(s)) {
    text = 'N/A';
    textColor = COLORS.textMuted;
    bgColor = '#f1f5f9';
  }
  
  // Return as a mini table for fillColor support
  return {
    table: {
      body: [[{ text, fontSize: 8, bold: true, color: textColor, alignment: 'center', margin: [6, 2, 6, 2] }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => bgColor,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

// ============================================================================
// DOCUMENT BUILDER
// ============================================================================

function formatDate(d?: string): string {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

function buildDocDefinition(
  inspection: any,
  siteName: string,
  stats: Stats,
  imageMap: Map<string, string>,
  clientName?: string,
  logoDataUri?: string,
  accentColor: string = '#2563eb'
): any {
  const getImage = (url?: string): string => {
    if (!url) return PLACEHOLDER_IMAGE;
    if (url.startsWith('data:')) return url;
    return imageMap.get(url) || PLACEHOLDER_IMAGE;
  };

  const content: any[] = [];

  // ==================== COVER PAGE ====================
  
  // Logo at top center - use stack to avoid empty page issues
  content.push({
    stack: [
      logoDataUri && logoDataUri !== PLACEHOLDER_IMAGE ? {
        image: logoDataUri,
        fit: [75, 100],
        alignment: 'center',
        margin: [0, 30, 0, 25],
      } : { text: '', margin: [0, 60, 0, 0] },
    ],
  });

  // Main title
  content.push({
    text: 'INSPECTION REPORT',
    fontSize: 32,
    bold: true,
    color: COLORS.primary,
    alignment: 'center',
    margin: [0, 20, 0, 15],
  });

  // Site name
  content.push({
    text: siteName.toUpperCase(),
    fontSize: 20,
    bold: true,
    color: accentColor,
    alignment: 'center',
    margin: [0, 0, 0, 8],
  });

  // Subsection name
  if (inspection.subsectionName) {
    content.push({
      text: inspection.subsectionName.toUpperCase(),
      fontSize: 14,
      color: COLORS.secondary,
      alignment: 'center',
      margin: [0, 0, 0, 40],
    });
  } else {
    content.push({ text: '', margin: [0, 0, 0, 40] });
  }

  // Info table - centered with vertical accent bar
  const infoTableData = [
    ['Template', inspection.templateName || 'Standard Inspection'],
    ['Inspector', inspection.inspectorName || 'N/A'],
    ['Date', formatDate(inspection.inspectionDate)],
  ];
  if (clientName) {
    infoTableData.push(['Client', clientName]);
  }

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        table: {
          widths: [100, 200],
          body: infoTableData.map(([label, value]) => [
            { text: label, fontSize: 10, color: COLORS.textSecondary, margin: [10, 8, 5, 8] },
            { text: value, fontSize: 11, bold: true, color: COLORS.textPrimary, margin: [5, 8, 10, 8] },
          ]),
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: (i: number) => (i === 0) ? 4 : (i === 2 ? 1 : 0),
          hLineColor: () => COLORS.border,
          vLineColor: (i: number) => (i === 0) ? accentColor : COLORS.border,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
        },
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 60],
  });

  // Generated timestamp
  content.push({
    text: `Generated on ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    fontSize: 9,
    color: COLORS.textMuted,
    alignment: 'center',
    margin: [0, 20, 0, 5],
  });

  content.push({
    text: 'CONFIDENTIAL - SANS 10142-1 Compliant Document',
    fontSize: 8,
    color: COLORS.textMuted,
    alignment: 'center',
    margin: [0, 0, 0, 0],
  });

  content.push({ text: '', pageBreak: 'after' });

  // ==================== PAGE 2: QUALITY SCORE DASHBOARD ====================
  
  const scoreColor = stats.passPercentage >= 80 ? COLORS.success 
    : stats.passPercentage >= 50 ? COLORS.warning 
    : COLORS.error;

  content.push({
    text: 'Quality Score Dashboard',
    fontSize: 22,
    bold: true,
    color: COLORS.primary,
    alignment: 'center',
    margin: [0, 20, 0, 30],
  });

  // Large compliance percentage with circular indicator
  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        stack: [
          {
            canvas: [
              // Outer circle (background)
              { type: 'ellipse', x: 70, y: 70, r1: 60, r2: 60, lineWidth: 12, lineColor: '#e5e7eb' },
              // Progress arc
              { type: 'ellipse', x: 70, y: 70, r1: 60, r2: 60, lineWidth: 12, lineColor: scoreColor },
            ],
          },
          {
            text: `${stats.passPercentage}%`,
            fontSize: 36,
            bold: true,
            color: scoreColor,
            alignment: 'center',
            relativePosition: { x: 0, y: -95 },
          },
          {
            text: 'Compliance',
            fontSize: 11,
            color: COLORS.textSecondary,
            alignment: 'center',
            relativePosition: { x: 0, y: -55 },
          },
        ],
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 40],
  });

  // KPI Grid - 2x2
  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        table: {
          widths: [120, 120],
          body: [
            [
              {
                stack: [
                  { text: String(stats.passCount), fontSize: 32, bold: true, color: COLORS.success, alignment: 'center' },
                  { text: 'Items Passed', fontSize: 10, color: COLORS.textSecondary, alignment: 'center' },
                ],
                margin: [15, 15],
                fillColor: '#f0fdf4',
              },
              {
                stack: [
                  { text: String(stats.failCount), fontSize: 32, bold: true, color: COLORS.error, alignment: 'center' },
                  { text: 'Items Failed', fontSize: 10, color: COLORS.textSecondary, alignment: 'center' },
                ],
                margin: [15, 15],
                fillColor: '#fef2f2',
              },
            ],
            [
              {
                stack: [
                  { text: String(stats.pendingCount), fontSize: 32, bold: true, color: COLORS.warning, alignment: 'center' },
                  { text: 'Pending', fontSize: 10, color: COLORS.textSecondary, alignment: 'center' },
                ],
                margin: [15, 15],
                fillColor: '#fffbeb',
              },
              {
                stack: [
                  { text: String(stats.totalPhotos), fontSize: 32, bold: true, color: accentColor, alignment: 'center' },
                  { text: 'Photos', fontSize: 10, color: COLORS.textSecondary, alignment: 'center' },
                ],
                margin: [15, 15],
                fillColor: '#eff6ff',
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
        },
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 30],
  });

  // SANS Notice
  content.push({
    text: 'This report complies with SANS 10142-1 electrical installation standards',
    fontSize: 9,
    color: COLORS.textMuted,
    alignment: 'center',
    italics: true,
    margin: [0, 20, 0, 0],
  });

  content.push({ text: '', pageBreak: 'after' });

  // ==================== INSPECTION SECTIONS ====================
  
  content.push({
    text: 'Inspection Sections',
    fontSize: 18,
    bold: true,
    color: COLORS.primary,
    margin: [0, 0, 0, 15],
  });

  inspection.sections?.forEach((section: any, sIdx: number) => {
    // Section header with navy background
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          text: `Section ${sIdx + 1}: ${section.title}`,
          fontSize: 12,
          bold: true,
          color: COLORS.white,
          margin: [12, 10, 12, 10],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => COLORS.primary,
      },
      margin: [0, sIdx > 0 ? 15 : 0, 0, 0],
    });

    // Items table
    const tableBody: any[][] = [
      [
        { text: 'Item', bold: true, fontSize: 9, color: COLORS.textPrimary, fillColor: '#f8fafc', margin: [8, 8] },
        { text: 'Status', bold: true, fontSize: 9, color: COLORS.textPrimary, fillColor: '#f8fafc', alignment: 'center', margin: [8, 8] },
        { text: 'Notes', bold: true, fontSize: 9, color: COLORS.textPrimary, fillColor: '#f8fafc', margin: [8, 8] },
      ],
    ];

    section.items?.forEach((item: any) => {
      tableBody.push([
        { text: item.label || '-', fontSize: 9, color: COLORS.textPrimary, margin: [8, 6] },
        { stack: [getStatusBadgeTable(String(item.value || item.status || 'N/A'))], alignment: 'center', margin: [4, 4] },
        { text: item.notes || '-', fontSize: 8, color: COLORS.textSecondary, margin: [8, 6] },
      ]);

      // Photos row if present
      if (item.photos && item.photos.length > 0) {
        const photoColumns = item.photos.slice(0, 3).map((photo: string, pIdx: number) => ({
          stack: [
            {
              image: getImage(photo),
              fit: [CONFIG.PHOTO_WIDTH, CONFIG.PHOTO_HEIGHT],
              alignment: 'center',
            },
            { text: `Photo ${pIdx + 1}`, fontSize: 7, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
          ],
          margin: [5, 5],
        }));

        // Pad to 3 columns for consistent layout
        while (photoColumns.length < 3) {
          photoColumns.push({ text: '', width: CONFIG.PHOTO_WIDTH });
        }

        tableBody.push([{
          colSpan: 3,
          columns: photoColumns,
          columnGap: 8,
          fillColor: '#fafafa',
          margin: [5, 8, 5, 8],
        }, {}, {}]);
      }
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['35%', '15%', '50%'],
        body: tableBody,
      },
      layout: {
        hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5),
        vLineWidth: () => 0.5,
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 0, 0, 10],
    });
  });

  // ==================== TENANT VERIFICATION ====================
  if (inspection.tenants && inspection.tenants.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Tenant Verification',
      fontSize: 18,
      bold: true,
      color: COLORS.primary,
      margin: [0, 0, 0, 15],
    });

    inspection.tenants.forEach((tenant: any, idx: number) => {
      // Tenant header
      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: `Tenant ${idx + 1}`, fontSize: 8, color: COLORS.textMuted },
              { text: tenant.shopName || 'Unknown Tenant', fontSize: 13, bold: true, color: COLORS.textPrimary },
              tenant.shopNumber ? { text: `Shop Number: ${tenant.shopNumber}`, fontSize: 9, color: COLORS.textSecondary, margin: [0, 2, 0, 0] } : { text: '' },
            ],
            margin: [12, 10],
          }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
          fillColor: () => COLORS.lightBg,
        },
        margin: [0, idx > 0 ? 15 : 0, 0, 8],
      });

      // Meter details row
      content.push({
        table: {
          widths: ['33%', '33%', '34%'],
          body: [[
            { text: `Meter S/N: ${tenant.meterSerialNumber || 'N/A'}`, fontSize: 9, color: COLORS.textPrimary, margin: [8, 6] },
            { text: `Breaker: ${tenant.breakerSize || 'N/A'}`, fontSize: 9, color: COLORS.textPrimary, margin: [8, 6] },
            { text: `CT Ratio: ${tenant.ctSizeAndRatio || 'N/A'}`, fontSize: 9, color: COLORS.textPrimary, margin: [8, 6] },
          ]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
        },
        margin: [0, 0, 0, 10],
      });

      // Tenant images
      const tenantImages: any[] = [];
      if (tenant.meterImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.meterImage), fit: [75, 100], alignment: 'center' },
            { text: 'Meter', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }
      if (tenant.breakerImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.breakerImage), fit: [75, 100], alignment: 'center' },
            { text: 'Breaker', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }
      if (tenant.ctRatioImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.ctRatioImage), fit: [75, 100], alignment: 'center' },
            { text: 'CT Ratio', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }

      if (tenantImages.length > 0) {
        content.push({
          columns: tenantImages,
          columnGap: 15,
          margin: [0, 5, 0, 15],
        });
      }
    });
  }

  // ==================== SNAGS SECTION ====================
  if (inspection.snags && inspection.snags.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Issues & Snags',
      fontSize: 18,
      bold: true,
      color: COLORS.primary,
      margin: [0, 0, 0, 15],
    });

    inspection.snags.forEach((snag: any, idx: number) => {
      const riskColor = snag.riskLevel === 'high' ? COLORS.error 
        : snag.riskLevel === 'medium' ? COLORS.warning 
        : COLORS.textSecondary;

      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              {
                columns: [
                  { text: `Issue ${idx + 1}: ${snag.title}`, fontSize: 11, bold: true, color: '#92400e', width: '*' },
                  getStatusBadgeTable(snag.status),
                ],
              },
              snag.riskLevel ? { text: `Risk Level: ${snag.riskLevel.toUpperCase()}`, fontSize: 8, bold: true, color: riskColor, margin: [0, 4, 0, 0] } : { text: '' },
              snag.description ? { text: snag.description, fontSize: 9, color: '#78350f', margin: [0, 6, 0, 0] } : { text: '' },
            ],
            margin: [12, 10],
          }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#fcd34d',
          vLineColor: () => '#fcd34d',
          fillColor: () => '#fef3c7',
        },
        margin: [0, idx > 0 ? 10 : 0, 0, 8],
      });

      // Snag photos
      if (snag.photos && snag.photos.length > 0) {
        content.push({
          columns: snag.photos.slice(0, 2).map((photo: string, pIdx: number) => ({
            stack: [
              { image: getImage(photo), fit: [75, 100], alignment: 'center' },
              { text: `Evidence ${pIdx + 1}`, fontSize: 7, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          })),
          columnGap: 15,
          margin: [0, 0, 0, 15],
        });
      }
    });
  }

  // ==================== SIGNATURES SECTION ====================
  if (inspection.signatures && inspection.signatures.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Signatures & Approvals',
      fontSize: 18,
      bold: true,
      color: COLORS.primary,
      margin: [0, 0, 0, 20],
    });

    const sigColumns = inspection.signatures.map((sig: any) => ({
      stack: [
        {
          table: {
            widths: ['*'],
            body: [[{
              stack: [
                sig.signatureUrl && getImage(sig.signatureUrl) !== PLACEHOLDER_IMAGE ? {
                  image: getImage(sig.signatureUrl),
                  fit: [140, 60],
                  alignment: 'center',
                  margin: [0, 10, 0, 10],
                } : { text: '', margin: [0, 40, 0, 0] },
                { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 150, y2: 0, lineWidth: 1, lineColor: COLORS.border }] },
                { text: sig.name, fontSize: 11, bold: true, alignment: 'center', margin: [0, 8, 0, 2] },
                { text: sig.role || 'Signatory', fontSize: 9, color: COLORS.textSecondary, alignment: 'center' },
                { text: sig.signedAt ? formatDate(sig.signedAt) : 'Pending', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 4, 0, 0] },
              ],
              margin: [10, 10],
            }]],
          },
          layout: {
            hLineWidth: () => 1,
            vLineWidth: () => 1,
            hLineColor: () => COLORS.border,
            vLineColor: () => COLORS.border,
          },
        },
      ],
      width: '*',
    }));

    content.push({
      columns: sigColumns,
      columnGap: 20,
      margin: [0, 10, 0, 0],
    });
  }

  // Build final document definition
  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 60],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'CONFIDENTIAL', fontSize: 7, color: COLORS.textMuted, margin: [40, 0, 0, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: COLORS.textMuted, alignment: 'center' },
        { text: new Date().toISOString().split('T')[0], fontSize: 7, color: COLORS.textMuted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 15, 0, 0],
    }),
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timings: Record<string, number> = {};
  const startTime = Date.now();

  try {
    const body = await req.json();
    const { inspection, siteName, clientName, siteLogoUrl, accentColor = '#2563eb' } = body;

    if (!inspection || !siteName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields: inspection, siteName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[PDFMake] Starting report generation...');
    console.log('[PDFMake] Site:', siteName);
    console.log('[PDFMake] Subsection:', inspection.subsectionName || 'N/A');
    console.log('[PDFMake] Sections:', inspection.sections?.length || 0);
    console.log('[PDFMake] Tenants:', inspection.tenants?.length || 0);
    console.log('[PDFMake] Snags:', inspection.snags?.length || 0);

    // Calculate stats
    const stats = calculateStats(inspection);
    console.log('[PDFMake] Stats:', stats);

    // Collect all image URLs
    const extractStart = Date.now();
    const imageUrls: string[] = [];
    
    // Logo first (mark as logo for special handling)
    if (siteLogoUrl && !siteLogoUrl.startsWith('data:')) {
      imageUrls.push(siteLogoUrl);
      logoUrls.add(siteLogoUrl);
    }

    // Section photos
    inspection.sections?.forEach((section: any) => {
      section.items?.forEach((item: any) => {
        if (item.photos?.length) {
          const validPhotos = item.photos
            .filter((p: string) => p && typeof p === 'string' && !p.startsWith('data:'))
            .slice(0, 3);
          imageUrls.push(...validPhotos);
        }
      });
    });

    // Tenant images
    inspection.tenants?.forEach((tenant: any) => {
      if (tenant.meterImage && !tenant.meterImage.startsWith('data:')) imageUrls.push(tenant.meterImage);
      if (tenant.breakerImage && !tenant.breakerImage.startsWith('data:')) imageUrls.push(tenant.breakerImage);
      if (tenant.ctRatioImage && !tenant.ctRatioImage.startsWith('data:')) imageUrls.push(tenant.ctRatioImage);
    });

    // Snag photos
    inspection.snags?.forEach((snag: any) => {
      if (snag.photos?.length) {
        const validPhotos = snag.photos
          .filter((p: string) => p && typeof p === 'string' && !p.startsWith('data:'))
          .slice(0, 2);
        imageUrls.push(...validPhotos);
      }
    });

    // Signature images
    inspection.signatures?.forEach((sig: any) => {
      if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
        imageUrls.push(sig.signatureUrl);
      }
    });

    const uniqueUrls = [...new Set(imageUrls)].slice(0, CONFIG.MAX_IMAGES_PER_REPORT);
    timings.extract_urls = Date.now() - extractStart;
    console.log(`[PDFMake] Unique images to process: ${uniqueUrls.length}`);

    // Download all images
    const downloadStart = Date.now();
    const imageMap = new Map<string, string>();
    
    for (const url of uniqueUrls) {
      const isLogo = logoUrls.has(url);
      const dataUri = await downloadImage(url, isLogo);
      imageMap.set(url, dataUri);
    }
    
    timings.download_images = Date.now() - downloadStart;
    console.log(`[PDFMake] Downloaded ${imageMap.size} images`);

    // Get logo data URI
    const logoDataUri = siteLogoUrl 
      ? (siteLogoUrl.startsWith('data:') ? siteLogoUrl : imageMap.get(siteLogoUrl)) 
      : undefined;

    // Build document definition
    const docDefStart = Date.now();
    const docDefinition = buildDocDefinition(
      inspection,
      siteName,
      stats,
      imageMap,
      clientName,
      logoDataUri,
      accentColor
    );
    timings.build_doc = Date.now() - docDefStart;

    // Import pdfmake dynamically
    const pdfmakeStart = Date.now();
    
    // @ts-ignore - Dynamic import for Deno
    const pdfMakeModule = await import('https://esm.sh/pdfmake@0.2.10/build/pdfmake.min.js?bundle');
    // @ts-ignore - Dynamic import for fonts
    const vfsModule = await import('https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js?bundle') as any;
    
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    pdfMake.vfs = vfsModule?.pdfMake?.vfs || vfsModule?.default?.pdfMake?.vfs || (vfsModule as any)?.vfs || {};
    
    timings.load_pdfmake = Date.now() - pdfmakeStart;

    // Generate PDF
    const generateStart = Date.now();
    const pdfDoc = pdfMake.createPdf(docDefinition);
    
    const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
      try {
        pdfDoc.getBuffer((buffer: Uint8Array) => {
          resolve(buffer);
        });
      } catch (error) {
        reject(error);
      }
    });
    
    timings.generate_pdf = Date.now() - generateStart;
    console.log(`[PDFMake] PDF generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    // Upload to storage
    const uploadStart = Date.now();
    const supabase = getSupabaseClient();
    const filename = `Inspection_Report_${Date.now()}.pdf`;
    const storagePath = `reports/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[PDFMake] Upload failed:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(storagePath);
    timings.upload = Date.now() - uploadStart;

    const totalTime = Date.now() - startTime;
    console.log(`[PDFMake] Complete! Total: ${totalTime}ms`, timings);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        filename,
        timings,
        totalTime,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PDFMake] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timings,
        totalTime: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
