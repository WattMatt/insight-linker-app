/**
 * PDFMake-based PDF Generator Edge Function
 * 
 * Uses pdfmake library for reliable PDF generation with embedded images.
 * This approach handles images natively without browser rendering issues.
 * 
 * Design matches the exact layout of the Browserless version:
 * - Cover page with logo and metadata
 * - Quality Score Dashboard with circular compliance indicator
 * - Section tables with photo grids
 * - Tenant verification with images
 * - Snags section with photos
 * - Signature section
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const CONFIG = {
  MAX_IMAGE_SIZE_KB: 300,
  IMAGE_TRANSFORM_WIDTH: 400,
  IMAGE_TRANSFORM_QUALITY: 65,
  LOGO_MAX_SIZE_KB: 500,
  MAX_IMAGES_PER_REPORT: 20,
};

// Color palette matching the design
const COLORS = {
  primary: '#1e3a5f',
  secondary: '#1a7a8a',
  accent: '#2563eb',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  lightBg: '#f8fafc',
  border: '#e2e8f0',
  textPrimary: '#1e293b',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
};

// Placeholder for failed images
const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgwIiBoZWlnaHQ9IjEzNSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjNmNGY2Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOWNhM2FmIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2UgVW5hdmFpbGFibGU8L3RleHQ+PC9zdmc+';

// Supabase client
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

// Track logos for special handling
const logoUrls = new Set<string>();

async function downloadImage(url: string, isLogo: boolean = false): Promise<string> {
  const parsed = parseSupabaseStorageUrl(url);
  
  if (parsed) {
    const supabase = getSupabaseClient();
    
    // Logos: download original
    if (isLogo) {
      console.log(`[Image] Downloading logo original...`);
      const { data: blob, error } = await supabase.storage
        .from(parsed.bucket)
        .download(parsed.path);
      
      if (error || !blob) {
        console.warn(`[Image] Logo download failed: ${error?.message}`);
        return PLACEHOLDER_IMAGE;
      }
      
      const buffer = await blob.arrayBuffer();
      const sizeKB = buffer.byteLength / 1024;
      console.log(`[Image] Logo: ${Math.round(sizeKB)}KB`);
      
      // If logo is too big, try transformation
      if (sizeKB > CONFIG.LOGO_MAX_SIZE_KB) {
        console.log(`[Image] Logo too large, applying transformation...`);
        const { data: signedUrlData } = await supabase.storage
          .from(parsed.bucket)
          .createSignedUrl(parsed.path, 60, {
            transform: { width: 300, quality: 85 }
          });
        
        if (signedUrlData?.signedUrl) {
          try {
            const resp = await fetch(signedUrlData.signedUrl);
            if (resp.ok) {
              const transformedBuffer = await resp.arrayBuffer();
              const mimeType = detectImageType(new Uint8Array(transformedBuffer));
              const base64 = arrayBufferToBase64(transformedBuffer);
              console.log(`[Image] Logo transformed: ${Math.round(transformedBuffer.byteLength / 1024)}KB`);
              return `data:${mimeType};base64,${base64}`;
            }
          } catch (err) {
            console.warn(`[Image] Logo transformation failed:`, err);
          }
        }
      }
      
      const mimeType = detectImageType(new Uint8Array(buffer));
      const base64 = arrayBufferToBase64(buffer);
      return `data:${mimeType};base64,${base64}`;
    }
    
    // Photos: use transformation for compression
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
          return `data:${mimeType};base64,${base64}`;
        }
      }
    } catch (err) {
      console.warn(`[Image] Error downloading:`, err);
    }
  }
  
  // External URLs
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const sizeKB = buffer.byteLength / 1024;
      if (sizeKB <= CONFIG.MAX_IMAGE_SIZE_KB) {
        const mimeType = detectImageType(new Uint8Array(buffer));
        const base64 = arrayBufferToBase64(buffer);
        return `data:${mimeType};base64,${base64}`;
      }
    }
  } catch (err) {
    console.warn(`[Image] External fetch failed:`, err);
  }
  
  return PLACEHOLDER_IMAGE;
}

// ============================================================================
// STATISTICS
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
  const s = status.toLowerCase();
  return ['pass', 'passed', 'yes', 'compliant', 'ok', 'good', 'complete', 'completed'].includes(s);
}

function isFailStatus(status: string): boolean {
  const s = status.toLowerCase();
  return ['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical'].includes(s);
}

function calculateStats(inspection: any): Stats {
  let totalItems = 0, passCount = 0, failCount = 0, pendingCount = 0, totalPhotos = 0;
  
  inspection.sections?.forEach((section: any) => {
    section.items?.forEach((item: any) => {
      totalItems++;
      const status = String(item.value || '');
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
// PDFMAKE DOCUMENT DEFINITION BUILDER
// ============================================================================

function getStatusBadge(status: string): any {
  const s = String(status).toLowerCase();
  let text = status || 'N/A';
  let color = COLORS.textMuted;
  let bgColor = '#f3f4f6';
  
  if (isPassStatus(s)) {
    text = '✓ PASS';
    color = '#ffffff';
    bgColor = COLORS.success;
  } else if (isFailStatus(s)) {
    text = '✗ FAIL';
    color = '#ffffff';
    bgColor = COLORS.error;
  } else if (['pending', 'in_progress'].includes(s)) {
    text = '⏳ PENDING';
    color = '#ffffff';
    bgColor = COLORS.warning;
  }
  
  return {
    text,
    fontSize: 9,
    bold: true,
    color,
    fillColor: bgColor,
    margin: [6, 3, 6, 3],
  };
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
  const getImage = (url?: string) => {
    if (!url) return PLACEHOLDER_IMAGE;
    if (url.startsWith('data:')) return url;
    return imageMap.get(url) || PLACEHOLDER_IMAGE;
  };

  const formatDate = (d?: string) => {
    if (!d) return 'N/A';
    try {
      return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return d;
    }
  };

  const content: any[] = [];

  // ==================== COVER PAGE ====================
  // Logo
  if (logoDataUri && logoDataUri !== PLACEHOLDER_IMAGE) {
    content.push({
      image: logoDataUri,
      width: 150,
      alignment: 'center',
      margin: [0, 60, 0, 40],
    });
  } else {
    content.push({ text: '', margin: [0, 100, 0, 0] });
  }

  // Title
  content.push({
    text: 'INSPECTION REPORT',
    fontSize: 28,
    bold: true,
    color: accentColor,
    alignment: 'center',
    margin: [0, 0, 0, 10],
  });

  content.push({
    text: siteName,
    fontSize: 16,
    color: COLORS.textPrimary,
    alignment: 'center',
    margin: [0, 0, 0, 5],
  });

  if (inspection.subsectionName) {
    content.push({
      text: inspection.subsectionName,
      fontSize: 12,
      color: COLORS.textSecondary,
      alignment: 'center',
      margin: [0, 0, 0, 40],
    });
  }

  // Info box
  const infoRows: any[][] = [
    [{ text: 'Template:', color: COLORS.textSecondary }, { text: inspection.templateName || 'Standard', bold: true }],
    [{ text: 'Inspector:', color: COLORS.textSecondary }, { text: inspection.inspectorName || 'N/A', bold: true }],
    [{ text: 'Date:', color: COLORS.textSecondary }, { text: formatDate(inspection.inspectionDate), bold: true }],
  ];
  if (clientName) {
    infoRows.push([{ text: 'Client:', color: COLORS.textSecondary }, { text: clientName, bold: true }]);
  }

  content.push({
    table: {
      widths: [80, '*'],
      body: infoRows.map(row => row.map(cell => ({ ...cell, fontSize: 10, margin: [8, 6] }))),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => '#f9fafb',
    },
    margin: [100, 20, 100, 0],
  });

  // Footer on cover
  content.push({
    text: [
      { text: `Generated on ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}`, fontSize: 8, color: COLORS.textMuted },
      '\n',
      { text: 'CONFIDENTIAL - SANS 10142-1 Compliant Document', fontSize: 7, color: '#d1d5db' },
    ],
    alignment: 'center',
    margin: [0, 60, 0, 0],
  });

  content.push({ text: '', pageBreak: 'after' });

  // ==================== DASHBOARD PAGE ====================
  const scoreColor = stats.passPercentage >= 80 ? COLORS.success 
    : stats.passPercentage >= 50 ? COLORS.warning 
    : COLORS.error;

  content.push({
    text: 'Quality Score Dashboard',
    fontSize: 18,
    bold: true,
    color: accentColor,
    alignment: 'center',
    margin: [0, 0, 0, 20],
  });

  // Compliance circle (using canvas)
  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        stack: [
          {
            canvas: [
              { type: 'ellipse', x: 60, y: 60, r1: 50, r2: 50, lineWidth: 8, lineColor: scoreColor },
            ],
          },
          {
            text: `${stats.passPercentage}%`,
            fontSize: 28,
            bold: true,
            color: scoreColor,
            alignment: 'center',
            relativePosition: { x: 0, y: -80 },
          },
          {
            text: 'Compliance',
            fontSize: 9,
            color: COLORS.textMuted,
            alignment: 'center',
            relativePosition: { x: 0, y: -50 },
          },
        ],
      },
      { width: '*', text: '' },
    ],
    margin: [0, 10, 0, 20],
  });

  // KPI Grid
  content.push({
    columns: [
      {
        stack: [
          { text: String(stats.passCount), fontSize: 24, bold: true, color: COLORS.success, alignment: 'center' },
          { text: 'Items Passed', fontSize: 9, color: COLORS.textSecondary, alignment: 'center' },
        ],
        width: '*',
      },
      {
        stack: [
          { text: String(stats.failCount), fontSize: 24, bold: true, color: COLORS.error, alignment: 'center' },
          { text: 'Items Failed', fontSize: 9, color: COLORS.textSecondary, alignment: 'center' },
        ],
        width: '*',
      },
      {
        stack: [
          { text: String(stats.pendingCount), fontSize: 24, bold: true, color: COLORS.warning, alignment: 'center' },
          { text: 'Pending', fontSize: 9, color: COLORS.textSecondary, alignment: 'center' },
        ],
        width: '*',
      },
      {
        stack: [
          { text: String(stats.totalPhotos), fontSize: 24, bold: true, color: accentColor, alignment: 'center' },
          { text: 'Photos', fontSize: 9, color: COLORS.textSecondary, alignment: 'center' },
        ],
        width: '*',
      },
    ],
    margin: [20, 20, 20, 30],
  });

  // SANS Notice
  content.push({
    text: 'This report complies with SANS 10142-1 electrical installation standards',
    fontSize: 8,
    color: COLORS.textMuted,
    alignment: 'center',
    margin: [0, 0, 0, 20],
  });

  content.push({ text: '', pageBreak: 'after' });

  // ==================== INSPECTION SECTIONS ====================
  content.push({
    text: '📋 Inspection Sections',
    fontSize: 14,
    bold: true,
    color: accentColor,
    margin: [0, 0, 0, 15],
  });

  inspection.sections?.forEach((section: any, sIdx: number) => {
    // Section header
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          text: [
            { text: `Section ${sIdx + 1}: `, fontSize: 9, opacity: 0.8 },
            { text: section.title, fontSize: 12, bold: true },
          ],
          color: '#ffffff',
          margin: [10, 8],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => COLORS.primary,
      },
      margin: [0, 10, 0, 0],
    });

    // Items table
    const tableBody: any[][] = [
      [
        { text: 'Item', bold: true, fontSize: 9, color: COLORS.textPrimary },
        { text: 'Status', bold: true, fontSize: 9, color: COLORS.textPrimary, alignment: 'center' },
        { text: 'Notes', bold: true, fontSize: 9, color: COLORS.textPrimary },
      ],
    ];

    section.items?.forEach((item: any) => {
      tableBody.push([
        { text: item.label || '', fontSize: 9, color: COLORS.textPrimary },
        { ...getStatusBadge(String(item.value)), alignment: 'center' },
        { text: item.notes || '-', fontSize: 8, color: COLORS.textSecondary },
      ]);

      // Photos row
      if (item.photos && item.photos.length > 0) {
        const photoColumns = item.photos.slice(0, 3).map((photo: string) => ({
          image: getImage(photo),
          width: 120,
          height: 90,
          margin: [0, 5, 10, 5],
        }));

        tableBody.push([{
          colSpan: 3,
          stack: [
            {
              columns: photoColumns,
            },
          ],
          fillColor: '#fafafa',
          margin: [5, 5],
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
        hLineWidth: (i: number) => (i === 1 ? 1 : 0.5),
        vLineWidth: () => 0.5,
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        paddingLeft: () => 8,
        paddingRight: () => 8,
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 0, 0, 15],
    });
  });

  // ==================== TENANT VERIFICATION ====================
  if (inspection.tenants && inspection.tenants.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: '🏢 Tenant Verification',
      fontSize: 14,
      bold: true,
      color: accentColor,
      margin: [0, 0, 0, 15],
    });

    inspection.tenants.forEach((tenant: any, idx: number) => {
      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: `Tenant #${idx + 1}`, fontSize: 8, color: COLORS.textMuted },
              { text: tenant.shopName || 'Unknown', fontSize: 12, bold: true, color: COLORS.textPrimary },
              tenant.shopNumber ? { text: `Shop: ${tenant.shopNumber}`, fontSize: 9, color: COLORS.textSecondary } : {},
            ],
            margin: [10, 8],
          }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => COLORS.border,
          vLineColor: () => COLORS.border,
        },
        margin: [0, 0, 0, 5],
      });

      // Meter details
      content.push({
        columns: [
          { text: `Meter S/N: ${tenant.meterSerialNumber || 'N/A'}`, fontSize: 9 },
          { text: `Breaker: ${tenant.breakerSize || 'N/A'}`, fontSize: 9 },
          { text: `CT Ratio: ${tenant.ctSizeAndRatio || 'N/A'}`, fontSize: 9 },
        ],
        margin: [0, 5, 0, 10],
      });

      // Tenant images
      const tenantImages: any[] = [];
      if (tenant.meterImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.meterImage), width: 100, height: 75 },
            { text: 'Meter', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
          ],
        });
      }
      if (tenant.breakerImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.breakerImage), width: 100, height: 75 },
            { text: 'Breaker', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
          ],
        });
      }
      if (tenant.ctRatioImage) {
        tenantImages.push({
          stack: [
            { image: getImage(tenant.ctRatioImage), width: 100, height: 75 },
            { text: 'CT Ratio', fontSize: 8, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
          ],
        });
      }

      if (tenantImages.length > 0) {
        content.push({
          columns: tenantImages,
          columnGap: 15,
          margin: [0, 0, 0, 20],
        });
      }
    });
  }

  // ==================== SNAGS ====================
  if (inspection.snags && inspection.snags.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: '⚠️ Issues & Snags',
      fontSize: 14,
      bold: true,
      color: accentColor,
      margin: [0, 0, 0, 15],
    });

    inspection.snags.forEach((snag: any, idx: number) => {
      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              {
                columns: [
                  { text: `Issue #${idx + 1}: ${snag.title}`, fontSize: 11, bold: true, color: '#92400e', width: '*' },
                  { ...getStatusBadge(snag.status), width: 'auto' },
                ],
              },
              snag.description ? { text: snag.description, fontSize: 9, color: '#78350f', margin: [0, 5, 0, 0] } : {},
            ],
            margin: [10, 8],
          }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#fcd34d',
          vLineColor: () => '#fcd34d',
          fillColor: () => '#fef3c7',
        },
        margin: [0, 0, 0, 5],
      });

      if (snag.photos && snag.photos.length > 0) {
        content.push({
          columns: snag.photos.slice(0, 2).map((photo: string) => ({
            image: getImage(photo),
            width: 140,
            height: 105,
          })),
          columnGap: 10,
          margin: [0, 5, 0, 15],
        });
      }
    });
  }

  // ==================== SIGNATURES ====================
  if (inspection.signatures && inspection.signatures.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: '✍️ Signatures & Approvals',
      fontSize: 14,
      bold: true,
      color: accentColor,
      margin: [0, 0, 0, 15],
    });

    const sigColumns = inspection.signatures.map((sig: any) => ({
      stack: [
        sig.signatureUrl ? {
          image: getImage(sig.signatureUrl),
          width: 120,
          height: 50,
          alignment: 'center',
        } : { text: '________________', alignment: 'center', margin: [0, 20, 0, 10] },
        { text: sig.name, fontSize: 10, bold: true, alignment: 'center' },
        { text: sig.role || 'Signatory', fontSize: 8, color: COLORS.textMuted, alignment: 'center' },
        { text: sig.signedAt ? formatDate(sig.signedAt) : 'Pending', fontSize: 7, color: COLORS.textMuted, alignment: 'center', margin: [0, 3, 0, 0] },
      ],
      width: '*',
    }));

    content.push({
      columns: sigColumns,
      margin: [0, 20, 0, 0],
    });
  }

  // Build document definition
  return {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'CONFIDENTIAL', fontSize: 7, color: COLORS.textMuted, margin: [40, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 7, color: COLORS.textMuted, alignment: 'center' },
        { text: new Date().toISOString().split('T')[0], fontSize: 7, color: COLORS.textMuted, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 20, 0, 0],
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
    console.log('[PDFMake] Sections:', inspection.sections?.length || 0);
    console.log('[PDFMake] Tenants:', inspection.tenants?.length || 0);
    console.log('[PDFMake] Snags:', inspection.snags?.length || 0);

    // Calculate stats
    const stats = calculateStats(inspection);
    console.log('[PDFMake] Stats:', stats);

    // Collect all image URLs
    const extractStart = Date.now();
    const imageUrls: string[] = [];
    
    // Logo first
    if (siteLogoUrl && !siteLogoUrl.startsWith('data:')) {
      imageUrls.push(siteLogoUrl);
      logoUrls.add(siteLogoUrl);
    }

    // Section photos
    inspection.sections?.forEach((section: any) => {
      section.items?.forEach((item: any) => {
        if (item.photos?.length) {
          imageUrls.push(...item.photos.filter((p: string) => p && !p.startsWith('data:')).slice(0, 3));
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
        imageUrls.push(...snag.photos.filter((p: string) => p && !p.startsWith('data:')).slice(0, 2));
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
    const logoDataUri = siteLogoUrl ? (imageMap.get(siteLogoUrl) || await downloadImage(siteLogoUrl, true)) : undefined;

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

    // Import pdfmake dynamically - using UMD build compatible with Deno
    const pdfmakeStart = Date.now();
    
    // @ts-ignore - Dynamic import for Deno compatibility
    const pdfMakeModule = await import('https://esm.sh/pdfmake@0.2.10/build/pdfmake.min.js?bundle');
    // @ts-ignore - Dynamic import for fonts
    const vfsModule = await import('https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js?bundle') as any;
    
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    // @ts-ignore - VFS fonts structure varies
    pdfMake.vfs = vfsModule?.pdfMake?.vfs || vfsModule?.default?.pdfMake?.vfs || (vfsModule as any)?.vfs || {};
    
    timings.load_pdfmake = Date.now() - pdfmakeStart;

    // Generate PDF
    const generateStart = Date.now();
    
    const pdfDoc = pdfMake.createPdf(docDefinition);
    
    // Get buffer using promise
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
