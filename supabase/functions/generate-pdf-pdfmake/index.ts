/**
 * PDFMake PDF Generator - Version 5.1.0
 * 
 * Electrical Inspection Report Generator
 * Fixes: Uses pdfmake images dictionary pattern for reliable image rendering in Deno
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const VERSION = '5.1.0';

const IMAGE_CONFIG = {
  MAX_SIZE_KB: 1200,        // Increased for large images
  TRANSFORM_WIDTH: 600,      // Smaller width for better compression
  TRANSFORM_QUALITY: 60,     // Lower quality to reduce size
};

// Image widths in points (1 point = 1/72 inch)
const SIZES = {
  LOGO: 160,
  PHOTO: 140,          // Section photos
  TENANT_PHOTO: 120,   // Tenant verification
  SNAG_PHOTO: 160,     // Issue evidence
  SIGNATURE: 120,
};

const COLORS = {
  navy: '#1e3a5f',
  teal: '#0d7377',
  blue: '#2563eb',
  green: '#16a34a',
  amber: '#d97706',
  red: '#dc2626',
  slate50: '#f8fafc',
  slate200: '#e2e8f0',
  slate700: '#334155',
  slate500: '#64748b',
  slate400: '#94a3b8',
  white: '#ffffff',
};

// ============================================================================
// SUPABASE CLIENT
// ============================================================================

function getSupabase() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

// ============================================================================
// IMAGE UTILITIES
// ============================================================================

const PLACEHOLDER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZjFmNWY5Ii8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJzYW5zLXNlcmlmIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTRhM2I4IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+';

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Character-by-character loop - safer than spread operator for large buffers
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  return 'image/jpeg';
}

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    if (!url.includes('/storage/v1/object/public/')) return null;
    const parts = new URL(url).pathname.split('/storage/v1/object/public/')[1];
    const slashIdx = parts.indexOf('/');
    if (slashIdx <= 0) return null;
    return {
      bucket: decodeURIComponent(parts.substring(0, slashIdx)),
      path: decodeURIComponent(parts.substring(slashIdx + 1)),
    };
  } catch {
    return null;
  }
}

async function downloadImage(url: string): Promise<string> {
  if (!url || url === '') return PLACEHOLDER;
  if (url.startsWith('data:')) return url;

  const supabase = getSupabase();
  const parsed = parseStorageUrl(url);

  if (parsed) {
    try {
      // Try with transformation first
      const { data: signedData } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 120, {
          transform: {
            width: IMAGE_CONFIG.TRANSFORM_WIDTH,
            quality: IMAGE_CONFIG.TRANSFORM_QUALITY,
          }
        });

      if (signedData?.signedUrl) {
        const resp = await fetch(signedData.signedUrl);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const sizeKB = buffer.byteLength / 1024;
          if (sizeKB <= IMAGE_CONFIG.MAX_SIZE_KB) {
            try {
              const bytes = new Uint8Array(buffer);
              const mime = getMimeType(bytes);
              const b64 = toBase64(buffer);
              console.log(`[IMG] Transformed: ${Math.round(sizeKB)}KB`);
              return `data:${mime};base64,${b64}`;
            } catch (e) {
              console.warn('[IMG] Base64 conversion failed:', e);
              return PLACEHOLDER;
            }
          } else {
            console.warn(`[IMG] Transform too large: ${Math.round(sizeKB)}KB`);
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
        if (sizeKB <= IMAGE_CONFIG.MAX_SIZE_KB) {
          try {
            const bytes = new Uint8Array(buffer);
            const mime = getMimeType(bytes);
            const b64 = toBase64(buffer);
            console.log(`[IMG] Direct: ${Math.round(sizeKB)}KB`);
            return `data:${mime};base64,${b64}`;
          } catch (e) {
            console.warn('[IMG] Base64 conversion failed:', e);
            return PLACEHOLDER;
          }
        }
        console.warn(`[IMG] Too large: ${Math.round(sizeKB)}KB`);
        return PLACEHOLDER;
      }
    } catch (err) {
      console.warn(`[IMG] Download error:`, err);
    }
  }

  // External URL
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const buffer = await resp.arrayBuffer();
      const sizeKB = buffer.byteLength / 1024;
      if (sizeKB <= IMAGE_CONFIG.MAX_SIZE_KB) {
        const bytes = new Uint8Array(buffer);
        const mime = getMimeType(bytes);
        const b64 = toBase64(buffer);
        console.log(`[IMG] External: ${Math.round(sizeKB)}KB`);
        return `data:${mime};base64,${b64}`;
      }
    }
  } catch {
    // ignore
  }

  return PLACEHOLDER;
}

// ============================================================================
// DOCUMENT BUILDER
// ============================================================================

interface InspectionData {
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  subsectionName?: string;
  sections?: Array<{
    title: string;
    items?: Array<{
      label: string;
      value?: string;
      status?: string;
      notes?: string;
      photos?: string[];
    }>;
  }>;
  tenants?: Array<{
    shopName?: string;
    shopNumber?: string;
    meterSerialNumber?: string;
    breakerSize?: string;
    ctSizeAndRatio?: string;
    meterImage?: string;
    breakerImage?: string;
    ctRatioImage?: string;
  }>;
  snags?: Array<{
    title: string;
    description?: string;
    status?: string;
    riskLevel?: string;
    photos?: string[];
  }>;
  signatures?: Array<{
    name: string;
    role?: string;
    signedAt?: string;
    signatureUrl?: string;
  }>;
}

function formatDate(d?: string): string {
  if (!d) return 'N/A';
  try {
    return new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d;
  }
}

function isPass(s: string): boolean {
  const val = String(s).toLowerCase().trim();
  return ['pass', 'passed', 'yes', 'compliant', 'ok', 'complete', 'completed', 'true', 'good'].includes(val);
}

function isFail(s: string): boolean {
  const val = String(s).toLowerCase().trim();
  return ['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical', 'false'].includes(val);
}

function statusBadge(status: string): any {
  const s = String(status).toLowerCase().trim();
  let text = status || 'N/A';
  let color = COLORS.slate400;
  let bg = COLORS.slate50;

  if (isPass(s)) {
    text = 'PASS'; color = COLORS.white; bg = COLORS.green;
  } else if (isFail(s)) {
    text = 'FAIL'; color = COLORS.white; bg = COLORS.red;
  } else if (['pending', 'in_progress', 'in progress'].includes(s)) {
    text = 'PENDING'; color = COLORS.white; bg = COLORS.amber;
  }

  return {
    table: {
      body: [[{ text, fontSize: 8, bold: true, color, alignment: 'center', margin: [6, 2, 6, 2] }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => bg,
      paddingLeft: () => 0, paddingRight: () => 0,
      paddingTop: () => 0, paddingBottom: () => 0,
    },
  };
}

/**
 * Build the PDF document definition using images dictionary pattern
 * This pattern is more reliable in Deno environments than inline data URLs
 */
function buildDocument(
  data: InspectionData,
  siteName: string,
  imageMap: Map<string, string>,
  clientName?: string,
  logoUri?: string,
  accentColor = COLORS.blue
): any {
  // ============================================================================
  // IMAGES DICTIONARY PATTERN (v5.1 Fix)
  // Instead of inline data URLs, we use a dictionary and reference by key
  // ============================================================================
  const images: Record<string, string> = {
    PLACEHOLDER: PLACEHOLDER,
  };
  let imageIndex = 0;

  /**
   * Get an image key for the images dictionary
   * Adds the image to the dictionary if not already present
   */
  const imgKey = (url?: string): string => {
    if (!url) return 'PLACEHOLDER';
    
    // Handle data URLs directly passed in
    if (url.startsWith('data:')) {
      const key = `img_${imageIndex++}`;
      images[key] = url;
      return key;
    }
    
    // Look up in imageMap (pre-downloaded images)
    const dataUri = imageMap.get(url);
    if (dataUri && dataUri !== PLACEHOLDER) {
      const key = `img_${imageIndex++}`;
      images[key] = dataUri;
      return key;
    }
    
    return 'PLACEHOLDER';
  };

  // Register logo in images dictionary
  let logoKey = 'PLACEHOLDER';
  if (logoUri && logoUri !== PLACEHOLDER) {
    logoKey = `logo_${imageIndex++}`;
    images[logoKey] = logoUri;
  }

  // Calculate stats
  let totalItems = 0, passCount = 0, failCount = 0, totalPhotos = 0;
  data.sections?.forEach(sec => {
    sec.items?.forEach(item => {
      totalItems++;
      const val = String(item.value || item.status || '');
      if (isPass(val)) passCount++;
      else if (isFail(val)) failCount++;
      if (item.photos?.length) totalPhotos += item.photos.length;
    });
  });
  data.tenants?.forEach(t => {
    if (t.meterImage) totalPhotos++;
    if (t.breakerImage) totalPhotos++;
    if (t.ctRatioImage) totalPhotos++;
  });
  data.snags?.forEach(s => {
    if (s.photos?.length) totalPhotos += s.photos.length;
  });
  const passPercent = totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0;

  const content: any[] = [];

  // ========== COVER PAGE ==========
  if (logoKey !== 'PLACEHOLDER') {
    content.push({
      image: logoKey,
      width: SIZES.LOGO,
      alignment: 'center',
      margin: [0, 40, 0, 30],
    });
  } else {
    content.push({ text: '', margin: [0, 80, 0, 0] });
  }

  content.push({
    text: 'ELECTRICAL INSPECTION REPORT',
    fontSize: 28,
    bold: true,
    color: COLORS.navy,
    alignment: 'center',
    margin: [0, 20, 0, 15],
  });

  content.push({
    text: siteName.toUpperCase(),
    fontSize: 18,
    bold: true,
    color: accentColor,
    alignment: 'center',
    margin: [0, 0, 0, 8],
  });

  if (data.subsectionName) {
    content.push({
      text: data.subsectionName.toUpperCase(),
      fontSize: 12,
      color: COLORS.teal,
      alignment: 'center',
      margin: [0, 0, 0, 50],
    });
  } else {
    content.push({ text: '', margin: [0, 50, 0, 0] });
  }

  // Info box
  const infoRows = [
    ['Template', data.templateName || 'Standard Inspection'],
    ['Inspector', data.inspectorName || 'N/A'],
    ['Date', formatDate(data.inspectionDate)],
  ];
  if (clientName) infoRows.push(['Client', clientName]);

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        table: {
          widths: [90, 180],
          body: infoRows.map(([label, value]) => [
            { text: label, fontSize: 10, color: COLORS.slate500, margin: [10, 6] },
            { text: value, fontSize: 11, bold: true, color: COLORS.slate700, margin: [10, 6] },
          ]),
        },
        layout: {
          hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 1 : 0.5,
          vLineWidth: (i: number) => (i === 0) ? 3 : (i === 2 ? 1 : 0),
          hLineColor: () => COLORS.slate200,
          vLineColor: (i: number) => (i === 0) ? accentColor : COLORS.slate200,
        },
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 80],
  });

  content.push({
    text: `Generated: ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    fontSize: 9,
    color: COLORS.slate400,
    alignment: 'center',
  });

  content.push({ text: '', pageBreak: 'after' });

  // ========== SUMMARY PAGE ==========
  const scoreColor = passPercent >= 80 ? COLORS.green : passPercent >= 50 ? COLORS.amber : COLORS.red;

  content.push({
    text: 'Inspection Summary',
    fontSize: 20,
    bold: true,
    color: COLORS.navy,
    margin: [0, 20, 0, 25],
  });

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 'auto',
        stack: [
          { text: `${passPercent}%`, fontSize: 48, bold: true, color: scoreColor, alignment: 'center' },
          { text: 'Compliance Score', fontSize: 12, color: COLORS.slate500, alignment: 'center', margin: [0, 5, 0, 0] },
        ],
      },
      { width: '*', text: '' },
    ],
    margin: [0, 0, 0, 30],
  });

  // Stats grid
  content.push({
    columns: [
      { width: '*', stack: [
        { text: String(totalItems), fontSize: 24, bold: true, color: COLORS.navy, alignment: 'center' },
        { text: 'Total Items', fontSize: 10, color: COLORS.slate500, alignment: 'center' },
      ]},
      { width: '*', stack: [
        { text: String(passCount), fontSize: 24, bold: true, color: COLORS.green, alignment: 'center' },
        { text: 'Passed', fontSize: 10, color: COLORS.slate500, alignment: 'center' },
      ]},
      { width: '*', stack: [
        { text: String(failCount), fontSize: 24, bold: true, color: COLORS.red, alignment: 'center' },
        { text: 'Failed', fontSize: 10, color: COLORS.slate500, alignment: 'center' },
      ]},
      { width: '*', stack: [
        { text: String(totalPhotos), fontSize: 24, bold: true, color: COLORS.blue, alignment: 'center' },
        { text: 'Photos', fontSize: 10, color: COLORS.slate500, alignment: 'center' },
      ]},
    ],
    margin: [0, 0, 0, 30],
  });

  content.push({ text: '', pageBreak: 'after' });

  // ========== SECTIONS ==========
  content.push({
    text: 'Inspection Details',
    fontSize: 18,
    bold: true,
    color: COLORS.navy,
    margin: [0, 0, 0, 15],
  });

  data.sections?.forEach((section, sIdx) => {
    // Section header
    content.push({
      table: {
        widths: ['*'],
        body: [[{
          text: `${sIdx + 1}. ${section.title}`,
          fontSize: 12,
          bold: true,
          color: COLORS.white,
          margin: [12, 8],
        }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        fillColor: () => COLORS.navy,
      },
      margin: [0, sIdx > 0 ? 15 : 0, 0, 0],
    });

    // Items table
    const tableBody: any[][] = [[
      { text: 'Item', bold: true, fontSize: 9, fillColor: COLORS.slate50, margin: [8, 6] },
      { text: 'Status', bold: true, fontSize: 9, fillColor: COLORS.slate50, alignment: 'center', margin: [8, 6] },
      { text: 'Notes', bold: true, fontSize: 9, fillColor: COLORS.slate50, margin: [8, 6] },
    ]];

    section.items?.forEach(item => {
      tableBody.push([
        { text: item.label || '-', fontSize: 9, margin: [8, 5] },
        { stack: [statusBadge(String(item.value || item.status || 'N/A'))], alignment: 'center', margin: [4, 3] },
        { text: item.notes || '-', fontSize: 8, color: COLORS.slate500, margin: [8, 5] },
      ]);

      // Photos for this item - using imgKey() for images dictionary pattern
      if (item.photos && item.photos.length > 0) {
        const photoCols = item.photos.slice(0, 3).map((photo, pIdx) => ({
          stack: [
            { image: imgKey(photo), width: SIZES.PHOTO, alignment: 'center' },
            { text: `Photo ${pIdx + 1}`, fontSize: 7, color: COLORS.slate400, alignment: 'center', margin: [0, 3, 0, 0] },
          ],
          width: SIZES.PHOTO + 20,
        }));

        // Pad to 3 columns
        while (photoCols.length < 3) {
          photoCols.push({ text: '', width: SIZES.PHOTO + 20 } as any);
        }

        tableBody.push([{
          colSpan: 3,
          columns: photoCols,
          columnGap: 10,
          margin: [5, 8, 5, 8],
          fillColor: '#fafafa',
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
        hLineWidth: (i: number) => (i <= 1) ? 1 : 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => COLORS.slate200,
        vLineColor: () => COLORS.slate200,
      },
      margin: [0, 0, 0, 10],
    });
  });

  // ========== TENANTS ==========
  if (data.tenants && data.tenants.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Tenant Verification',
      fontSize: 18,
      bold: true,
      color: COLORS.navy,
      margin: [0, 0, 0, 15],
    });

    data.tenants.forEach((tenant, idx) => {
      // Tenant header
      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              { text: tenant.shopName || 'Unknown Tenant', fontSize: 12, bold: true, color: COLORS.slate700 },
              tenant.shopNumber ? { text: `Shop: ${tenant.shopNumber}`, fontSize: 9, color: COLORS.slate500, margin: [0, 2, 0, 0] } : { text: '' },
            ],
            margin: [12, 8],
          }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => COLORS.slate200,
          vLineColor: () => COLORS.slate200,
          fillColor: () => COLORS.slate50,
        },
        margin: [0, idx > 0 ? 15 : 0, 0, 8],
      });

      // Meter info row
      content.push({
        table: {
          widths: ['33%', '33%', '34%'],
          body: [[
            { text: `Meter: ${tenant.meterSerialNumber || 'N/A'}`, fontSize: 9, margin: [8, 5] },
            { text: `Breaker: ${tenant.breakerSize || 'N/A'}`, fontSize: 9, margin: [8, 5] },
            { text: `CT Ratio: ${tenant.ctSizeAndRatio || 'N/A'}`, fontSize: 9, margin: [8, 5] },
          ]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => COLORS.slate200,
          vLineColor: () => COLORS.slate200,
        },
        margin: [0, 0, 0, 10],
      });

      // Tenant photos - using imgKey() for images dictionary pattern
      const tenantPhotos: any[] = [];
      if (tenant.meterImage) {
        tenantPhotos.push({
          stack: [
            { image: imgKey(tenant.meterImage), width: SIZES.TENANT_PHOTO, alignment: 'center' },
            { text: 'Meter', fontSize: 8, color: COLORS.slate400, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }
      if (tenant.breakerImage) {
        tenantPhotos.push({
          stack: [
            { image: imgKey(tenant.breakerImage), width: SIZES.TENANT_PHOTO, alignment: 'center' },
            { text: 'Breaker', fontSize: 8, color: COLORS.slate400, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }
      if (tenant.ctRatioImage) {
        tenantPhotos.push({
          stack: [
            { image: imgKey(tenant.ctRatioImage), width: SIZES.TENANT_PHOTO, alignment: 'center' },
            { text: 'CT Ratio', fontSize: 8, color: COLORS.slate400, alignment: 'center', margin: [0, 4, 0, 0] },
          ],
        });
      }

      if (tenantPhotos.length > 0) {
        content.push({
          columns: tenantPhotos,
          columnGap: 20,
          margin: [0, 5, 0, 15],
        });
      }
    });
  }

  // ========== SNAGS ==========
  if (data.snags && data.snags.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Issues & Snags',
      fontSize: 18,
      bold: true,
      color: COLORS.navy,
      margin: [0, 0, 0, 15],
    });

    data.snags.forEach((snag, idx) => {
      const riskColor = snag.riskLevel === 'high' ? COLORS.red
        : snag.riskLevel === 'medium' ? COLORS.amber
        : COLORS.slate500;

      content.push({
        table: {
          widths: ['*'],
          body: [[{
            stack: [
              {
                columns: [
                  { text: `${idx + 1}. ${snag.title}`, fontSize: 11, bold: true, color: '#92400e', width: '*' },
                  statusBadge(snag.status || 'open'),
                ],
              },
              snag.riskLevel ? { text: `Risk: ${snag.riskLevel.toUpperCase()}`, fontSize: 8, bold: true, color: riskColor, margin: [0, 4, 0, 0] } : { text: '' },
              snag.description ? { text: snag.description, fontSize: 9, color: '#78350f', margin: [0, 5, 0, 0] } : { text: '' },
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

      // Snag photos - using imgKey() for images dictionary pattern
      if (snag.photos && snag.photos.length > 0) {
        content.push({
          columns: snag.photos.slice(0, 2).map((photo, pIdx) => ({
            stack: [
              { image: imgKey(photo), width: SIZES.SNAG_PHOTO, alignment: 'center' },
              { text: `Evidence ${pIdx + 1}`, fontSize: 7, color: COLORS.slate400, alignment: 'center', margin: [0, 3, 0, 0] },
            ],
          })),
          columnGap: 20,
          margin: [0, 0, 0, 15],
        });
      }
    });
  }

  // ========== SIGNATURES ==========
  if (data.signatures && data.signatures.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push({
      text: 'Signatures',
      fontSize: 18,
      bold: true,
      color: COLORS.navy,
      margin: [0, 0, 0, 20],
    });

    content.push({
      columns: data.signatures.map(sig => {
        const sigImgKey = imgKey(sig.signatureUrl);
        return {
          stack: [
            {
              table: {
                widths: ['*'],
                body: [[{
                  stack: [
                    sigImgKey !== 'PLACEHOLDER' ? {
                      image: sigImgKey,
                      width: SIZES.SIGNATURE,
                      alignment: 'center',
                      margin: [0, 10, 0, 10],
                    } : { text: '', margin: [0, 30, 0, 0] },
                    { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 140, y2: 0, lineWidth: 1, lineColor: COLORS.slate200 }] },
                    { text: sig.name, fontSize: 11, bold: true, alignment: 'center', margin: [0, 8, 0, 2] },
                    { text: sig.role || 'Signatory', fontSize: 9, color: COLORS.slate500, alignment: 'center' },
                    { text: sig.signedAt ? formatDate(sig.signedAt) : 'Pending', fontSize: 8, color: COLORS.slate400, alignment: 'center', margin: [0, 4, 0, 0] },
                  ],
                  margin: [10, 10],
                }]],
              },
              layout: {
                hLineWidth: () => 1,
                vLineWidth: () => 1,
                hLineColor: () => COLORS.slate200,
                vLineColor: () => COLORS.slate200,
              },
            },
          ],
          width: '*',
        };
      }),
      columnGap: 20,
    });
  }

  // Log images dictionary stats for debugging
  const imageCount = Object.keys(images).length - 1; // Subtract placeholder
  console.log(`[PDF] Images dictionary: ${imageCount} images registered`);
  if (imageCount > 0) {
    const sampleKeys = Object.keys(images).slice(0, 5);
    console.log(`[PDF] Sample keys: ${sampleKeys.join(', ')}`);
  }

  // Document definition with images dictionary
  return {
    pageSize: 'A4',
    pageMargins: [40, 50, 40, 60],
    content,
    images, // <-- CRITICAL: Include images dictionary for pdfmake
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      color: COLORS.slate700,
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'CONFIDENTIAL', fontSize: 8, color: COLORS.slate400, margin: [40, 0] },
        { text: `Page ${currentPage} of ${pageCount}`, fontSize: 8, color: COLORS.slate400, alignment: 'center' },
        { text: `v${VERSION}`, fontSize: 8, color: COLORS.slate400, alignment: 'right', margin: [0, 0, 40, 0] },
      ],
      margin: [0, 20],
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

  try {
    const body = await req.json();
    const { inspection, siteName, clientName, logoUrl, accentColor } = body;

    if (!inspection || !siteName) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing inspection or siteName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[PDF] Version ${VERSION} - Starting`);
    console.log(`[PDF] Site: ${siteName}`);
    console.log(`[PDF] Sections: ${inspection.sections?.length || 0}`);
    console.log(`[PDF] Tenants: ${inspection.tenants?.length || 0}`);
    console.log(`[PDF] Snags: ${inspection.snags?.length || 0}`);

    // Collect all image URLs
    const imageUrls = new Set<string>();
    
    inspection.sections?.forEach((sec: any) => {
      sec.items?.forEach((item: any) => {
        item.photos?.forEach((p: string) => p && imageUrls.add(p));
      });
    });
    
    inspection.tenants?.forEach((t: any) => {
      if (t.meterImage) imageUrls.add(t.meterImage);
      if (t.breakerImage) imageUrls.add(t.breakerImage);
      if (t.ctRatioImage) imageUrls.add(t.ctRatioImage);
    });
    
    inspection.snags?.forEach((s: any) => {
      s.photos?.forEach((p: string) => p && imageUrls.add(p));
    });
    
    inspection.signatures?.forEach((sig: any) => {
      if (sig.signatureUrl) imageUrls.add(sig.signatureUrl);
    });

    console.log(`[PDF] Images to download: ${imageUrls.size}`);

    // Download all images
    const imageMap = new Map<string, string>();
    let logoUri = PLACEHOLDER;

    if (logoUrl) {
      logoUri = await downloadImage(logoUrl);
      console.log(`[PDF] Logo: ${logoUri !== PLACEHOLDER ? 'OK' : 'Failed'}`);
    }

    // Download images in parallel batches of 5
    const urlArray = Array.from(imageUrls);
    for (let i = 0; i < urlArray.length; i += 5) {
      const batch = urlArray.slice(i, i + 5);
      const results = await Promise.all(batch.map(url => downloadImage(url)));
      batch.forEach((url, idx) => {
        imageMap.set(url, results[idx]);
      });
    }

    console.log(`[PDF] Downloaded: ${imageMap.size} images`);

    // Build document
    const docDef = buildDocument(
      inspection,
      siteName,
      imageMap,
      clientName,
      logoUri,
      accentColor || COLORS.blue
    );

    // Generate PDF - Must explicitly configure Roboto fonts (pdfmake VFS only includes Roboto)
    const pdfMake = await import('https://esm.sh/pdfmake@0.2.10/build/pdfmake.min.js');
    const pdfFonts = await import('https://esm.sh/pdfmake@0.2.10/build/vfs_fonts.js');
    (pdfMake.default as any).vfs = (pdfFonts.default as any).pdfMake.vfs;
    
    // Configure fonts - CRITICAL: pdfmake VFS only includes Roboto, not Helvetica
    (pdfMake.default as any).fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf'
      }
    };

    // Add default font to document definition
    docDef.defaultStyle = docDef.defaultStyle || {};
    docDef.defaultStyle.font = 'Roboto';

    const pdfDoc = (pdfMake.default as any).createPdf(docDef);
    
    const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
      pdfDoc.getBuffer((buffer: Uint8Array) => {
        resolve(buffer);
      });
    });

    console.log(`[PDF] Generated: ${Math.round(pdfBuffer.length / 1024)}KB`);

    // Upload to storage
    const supabase = getSupabase();
    const fileName = `inspection_${Date.now()}.pdf`;
    const filePath = `reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[PDF] Upload error:', uploadError);
      return new Response(
        JSON.stringify({ success: false, error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log(`[PDF] Complete: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        fileName,
        sizeKB: Math.round(pdfBuffer.length / 1024),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[PDF] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
