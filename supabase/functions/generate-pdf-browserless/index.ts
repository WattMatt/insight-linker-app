/**
 * Browserless PDF Generator Edge Function
 * 
 * Uses Browserless.io's Puppeteer-as-a-service for high-fidelity Chrome rendering.
 * This provides perfect CSS support and reliable image embedding without
 * the storage limitations of Google Drive or rendering quirks of PDFShift.
 * 
 * API: https://www.browserless.io/docs/pdf
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client for image fetching
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClient) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClient;
}

// ============================================================================
// IMAGE HANDLING
// ============================================================================

function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    if (!url.includes('/storage/v1/object/public/')) return null;
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/storage/v1/object/public/');
    if (pathParts.length === 2) {
      const filePathWithBucket = pathParts[1];
      const firstSlashIndex = filePathWithBucket.indexOf('/');
      if (firstSlashIndex > 0) {
        return {
          bucket: filePathWithBucket.substring(0, firstSlashIndex),
          path: filePathWithBucket.substring(firstSlashIndex + 1),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

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

/**
 * Generate a signed URL for Supabase storage images
 * This allows Browserless/Chrome to fetch images directly without auth issues
 */
async function getSignedImageUrl(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;
  
  try {
    const parsed = parseSupabaseStorageUrl(url);
    
    if (parsed) {
      const supabase = getSupabaseClient();
      
      // Generate a signed URL valid for 1 hour
      const { data, error } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600);
      
      if (error || !data?.signedUrl) {
        console.warn(`[getSignedImageUrl] Failed to create signed URL: ${error?.message}`);
        // Fall back to public URL if signing fails
        return url;
      }
      
      console.log(`[getSignedImageUrl] Created signed URL for: ${parsed.path.substring(0, 40)}...`);
      return data.signedUrl;
    }
    
    // External URL - return as-is (Chrome can fetch it)
    return url;
    
  } catch (err) {
    console.warn(`[getSignedImageUrl] Error:`, err);
    return url; // Return original URL as fallback
  }
}

/**
 * Legacy function for small images like signatures that need base64 embedding
 */
async function getImageAsBase64(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;
  
  const MAX_SIZE_KB = 200; // Only for small images like signatures
  
  try {
    const parsed = parseSupabaseStorageUrl(url);
    
    if (parsed) {
      const supabase = getSupabaseClient();
      const { data: blob, error } = await supabase.storage
        .from(parsed.bucket)
        .download(parsed.path);
      
      if (error || !blob) {
        console.warn(`[getImageAsBase64] Download failed: ${error?.message}`);
        return null;
      }
      
      const buffer = await blob.arrayBuffer();
      if (buffer.byteLength > MAX_SIZE_KB * 1024) {
        console.warn(`[getImageAsBase64] Image too large for base64: ${Math.round(buffer.byteLength / 1024)}KB, using signed URL`);
        // Return signed URL instead of null for large images
        const { data } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, 3600);
        return data?.signedUrl || null;
      }
      
      const base64 = arrayBufferToBase64(buffer);
      const contentType = detectImageType(new Uint8Array(buffer));
      return `data:${contentType};base64,${base64}`;
    }
    
    // External URL
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE_KB * 1024) return url; // Return original URL for large external images
    
    const base64 = arrayBufferToBase64(buffer);
    const contentType = detectImageType(new Uint8Array(buffer));
    return `data:${contentType};base64,${base64}`;
    
  } catch (err) {
    console.warn(`[getImageAsBase64] Error:`, err);
    return null;
  }
}

// ============================================================================
// HTML TEMPLATE GENERATION
// ============================================================================

interface InspectionData {
  inspectionId: string;
  templateName?: string;
  inspectorName?: string;
  inspectionDate?: string;
  status?: string;
  qualityRating?: number;
  generalInfo?: Record<string, any>;
  sections?: Array<{
    title: string;
    items: Array<{
      label: string;
      value: string | boolean | number;
      type?: string;
      notes?: string;
      photos?: string[];
    }>;
  }>;
  tenants?: Array<{
    shopName: string;
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
    status: string;
    riskLevel?: string;
    photos?: string[];
  }>;
  signatures?: Array<{
    name: string;
    role?: string;
    signatureUrl?: string;
    signedAt?: string;
  }>;
  subsectionName?: string;
}

function generateHTML(
  inspection: InspectionData,
  siteName: string,
  clientName?: string,
  siteLogoUrl?: string,
  accentColor: string = '#2563eb'
): string {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status?: string) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'pass' || statusLower === 'passed' || statusLower === 'compliant') {
      return `<span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">✓ PASS</span>`;
    } else if (statusLower === 'fail' || statusLower === 'failed' || statusLower === 'non-compliant') {
      return `<span style="background: #ef4444; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">✗ FAIL</span>`;
    } else if (statusLower === 'pending' || statusLower === 'in_progress') {
      return `<span style="background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">⏳ PENDING</span>`;
    }
    return `<span style="background: #6b7280; color: white; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600;">${status || 'N/A'}</span>`;
  };

  const getRiskBadge = (level?: string) => {
    const levelLower = (level || '').toLowerCase();
    if (levelLower === 'critical' || levelLower === 'high') {
      return `<span style="background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">HIGH RISK</span>`;
    } else if (levelLower === 'medium') {
      return `<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">MEDIUM</span>`;
    } else if (levelLower === 'low') {
      return `<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">LOW</span>`;
    }
    return '';
  };

  // Calculate compliance stats
  let passCount = 0, failCount = 0, pendingCount = 0, totalPhotos = 0;
  if (inspection.sections) {
    for (const section of inspection.sections) {
      for (const item of section.items) {
        const val = String(item.value || '').toLowerCase();
        if (val === 'pass' || val === 'passed' || val === 'compliant' || val === 'yes') passCount++;
        else if (val === 'fail' || val === 'failed' || val === 'non-compliant' || val === 'no') failCount++;
        else pendingCount++;
        if (item.photos) totalPhotos += item.photos.length;
      }
    }
  }
  const totalItems = passCount + failCount + pendingCount;
  const compliancePercent = totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0;

  // Build sections HTML
  let sectionsHtml = '';
  if (inspection.sections) {
    for (let sIdx = 0; sIdx < inspection.sections.length; sIdx++) {
      const section = inspection.sections[sIdx];
      sectionsHtml += `
        <div style="page-break-inside: avoid; margin-bottom: 24px;">
          <div style="background: linear-gradient(135deg, ${accentColor}, #1e3a5f); color: white; padding: 12px 16px; border-radius: 8px 8px 0 0;">
            <span style="font-size: 11px; opacity: 0.8;">Section ${sIdx + 1}</span>
            <h3 style="margin: 4px 0 0; font-size: 16px; font-weight: 600;">${section.title}</h3>
          </div>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb;">
            <thead>
              <tr style="background: #f9fafb;">
                <th style="text-align: left; padding: 10px 12px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb; width: 35%;">Item</th>
                <th style="text-align: center; padding: 10px 12px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb; width: 15%;">Status</th>
                <th style="text-align: left; padding: 10px 12px; font-size: 11px; color: #374151; border-bottom: 1px solid #e5e7eb; width: 50%;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${section.items.map(item => `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 12px; font-size: 11px; color: #111827;">${item.label}</td>
                  <td style="padding: 10px 12px; text-align: center;">${getStatusBadge(String(item.value))}</td>
                  <td style="padding: 10px 12px; font-size: 10px; color: #6b7280;">${item.notes || '-'}</td>
                </tr>
                ${item.photos && item.photos.length > 0 ? `
                  <tr>
                    <td colspan="3" style="padding: 12px; background: #fafafa;">
                      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${item.photos.slice(0, 4).map(photo => `
                          <div style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                            <img src="${photo}" style="width: 180px; height: 135px; object-fit: cover; display: block;" />
                          </div>
                        `).join('')}
                      </div>
                    </td>
                  </tr>
                ` : ''}
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  // Build snags HTML
  let snagsHtml = '';
  if (inspection.snags && inspection.snags.length > 0) {
    snagsHtml = `
      <div style="page-break-before: always; margin-top: 20px;">
        <h2 style="color: ${accentColor}; font-size: 18px; margin-bottom: 16px; border-bottom: 2px solid ${accentColor}; padding-bottom: 8px;">
          ⚠️ Issues & Snags (${inspection.snags.length})
        </h2>
        ${inspection.snags.map((snag, idx) => `
          <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <div>
                <span style="font-size: 10px; color: #92400e;">Issue #${idx + 1}</span>
                <h4 style="margin: 4px 0; font-size: 14px; color: #92400e; font-weight: 600;">${snag.title}</h4>
              </div>
              <div style="text-align: right;">
                ${getStatusBadge(snag.status)}
                ${snag.riskLevel ? `<div style="margin-top: 4px;">${getRiskBadge(snag.riskLevel)}</div>` : ''}
              </div>
            </div>
            ${snag.description ? `<p style="font-size: 11px; color: #78350f; margin: 8px 0 0;">${snag.description}</p>` : ''}
            ${snag.photos && snag.photos.length > 0 ? `
              <div style="display: flex; gap: 8px; margin-top: 12px;">
                ${snag.photos.slice(0, 2).map(photo => `
                  <img src="${photo}" style="width: 160px; height: 120px; object-fit: cover; border-radius: 4px; border: 1px solid #fcd34d;" />
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  // Build signatures HTML
  let signaturesHtml = '';
  if (inspection.signatures && inspection.signatures.length > 0) {
    signaturesHtml = `
      <div style="page-break-before: always; margin-top: 20px;">
        <h2 style="color: ${accentColor}; font-size: 18px; margin-bottom: 16px; border-bottom: 2px solid ${accentColor}; padding-bottom: 8px;">
          ✍️ Signatures & Approvals
        </h2>
        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
          ${inspection.signatures.map(sig => `
            <div style="flex: 1; min-width: 200px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center;">
              ${sig.signatureUrl ? `
                <img src="${sig.signatureUrl}" style="max-width: 150px; max-height: 60px; margin-bottom: 8px;" />
              ` : '<div style="height: 60px; border-bottom: 1px solid #9ca3af; margin-bottom: 8px;"></div>'}
              <div style="font-size: 12px; font-weight: 600; color: #111827;">${sig.name}</div>
              <div style="font-size: 10px; color: #6b7280;">${sig.role || 'Signatory'}</div>
              <div style="font-size: 9px; color: #9ca3af; margin-top: 4px;">${sig.signedAt ? formatDate(sig.signedAt) : 'Pending'}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Inspection Report - ${siteName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #111827;
      margin: 0;
      padding: 0;
      background: white;
    }
    
    .page {
      padding: 40px 50px;
      min-height: 100vh;
    }
    
    @media print {
      .page { padding: 20mm 15mm; }
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <div class="page" style="display: flex; flex-direction: column; justify-content: center; text-align: center; page-break-after: always;">
    ${siteLogoUrl ? `<img src="${siteLogoUrl}" style="max-width: 180px; max-height: 100px; margin: 0 auto 40px;" />` : ''}
    <div style="margin-bottom: 60px;">
      <h1 style="font-size: 36px; font-weight: 700; color: ${accentColor}; margin: 0 0 16px;">INSPECTION REPORT</h1>
      <div style="font-size: 20px; color: #4b5563; margin-bottom: 8px;">${siteName}</div>
      ${inspection.subsectionName ? `<div style="font-size: 16px; color: #6b7280;">${inspection.subsectionName}</div>` : ''}
    </div>
    
    <div style="background: #f9fafb; border-radius: 12px; padding: 30px; max-width: 400px; margin: 0 auto;">
      <table style="width: 100%; font-size: 12px;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Template:</td><td style="padding: 8px 0; font-weight: 600;">${inspection.templateName || 'Standard'}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Inspector:</td><td style="padding: 8px 0; font-weight: 600;">${inspection.inspectorName || 'N/A'}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Date:</td><td style="padding: 8px 0; font-weight: 600;">${formatDate(inspection.inspectionDate)}</td></tr>
        ${clientName ? `<tr><td style="padding: 8px 0; color: #6b7280;">Client:</td><td style="padding: 8px 0; font-weight: 600;">${clientName}</td></tr>` : ''}
      </table>
    </div>
    
    <div style="position: absolute; bottom: 40px; left: 50px; right: 50px; text-align: center;">
      <div style="font-size: 9px; color: #9ca3af;">Generated on ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      <div style="font-size: 8px; color: #d1d5db; margin-top: 4px;">CONFIDENTIAL - SANS 10142-1 Compliant Document</div>
    </div>
  </div>
  
  <!-- DASHBOARD PAGE -->
  <div class="page" style="page-break-after: always;">
    <h2 style="color: ${accentColor}; font-size: 22px; margin: 0 0 24px; text-align: center;">Quality Score Dashboard</h2>
    
    <!-- Compliance Circle -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="width: 160px; height: 160px; border-radius: 50%; background: conic-gradient(${compliancePercent >= 80 ? '#10b981' : compliancePercent >= 50 ? '#f59e0b' : '#ef4444'} ${compliancePercent}%, #e5e7eb ${compliancePercent}%); display: inline-flex; align-items: center; justify-content: center;">
        <div style="width: 120px; height: 120px; border-radius: 50%; background: white; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <div style="font-size: 36px; font-weight: 700; color: ${compliancePercent >= 80 ? '#10b981' : compliancePercent >= 50 ? '#f59e0b' : '#ef4444'};">${compliancePercent}%</div>
          <div style="font-size: 11px; color: #6b7280;">Compliance</div>
        </div>
      </div>
    </div>
    
    <!-- KPI Grid -->
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #10b981;">${passCount}</div>
        <div style="font-size: 11px; color: #166534; margin-top: 4px;">Items Passed</div>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #ef4444;">${failCount}</div>
        <div style="font-size: 11px; color: #991b1b; margin-top: 4px;">Items Failed</div>
      </div>
      <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #f59e0b;">${pendingCount}</div>
        <div style="font-size: 11px; color: #92400e; margin-top: 4px;">Pending</div>
      </div>
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #2563eb;">${totalPhotos}</div>
        <div style="font-size: 11px; color: #1e40af; margin-top: 4px;">Photos</div>
      </div>
    </div>
    
    <!-- General Info Table -->
    ${Object.keys(inspection.generalInfo || {}).length > 0 ? `
      <h3 style="color: ${accentColor}; font-size: 14px; margin: 24px 0 12px;">General Information</h3>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
        ${Object.entries(inspection.generalInfo || {}).map(([key, value], idx) => `
          <tr style="background: ${idx % 2 === 0 ? '#f9fafb' : 'white'};">
            <td style="padding: 10px 16px; font-size: 11px; color: #6b7280; width: 35%; border-bottom: 1px solid #f3f4f6;">${key}</td>
            <td style="padding: 10px 16px; font-size: 11px; color: #111827; font-weight: 500; border-bottom: 1px solid #f3f4f6;">${String(value) || '-'}</td>
          </tr>
        `).join('')}
      </table>
    ` : ''}
    
    <div style="margin-top: 24px; padding: 12px; background: #f9fafb; border-radius: 8px; text-align: center;">
      <div style="font-size: 9px; color: #6b7280;">This report complies with SANS 10142-1 electrical installation standards</div>
    </div>
  </div>
  
  <!-- INSPECTION SECTIONS -->
  <div class="page">
    <h2 style="color: ${accentColor}; font-size: 18px; margin: 0 0 20px; border-bottom: 2px solid ${accentColor}; padding-bottom: 8px;">
      📋 Inspection Sections
    </h2>
    ${sectionsHtml}
  </div>
  
  ${snagsHtml}
  ${signaturesHtml}
  
</body>
</html>`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY');
    if (!BROWSERLESS_API_KEY) {
      throw new Error('BROWSERLESS_API_KEY not configured');
    }

    const body = await req.json();
    const { 
      reportType = 'inspection',
      inspection,
      siteName = 'Site Report',
      clientName,
      siteLogoUrl,
      accentColor = '#2563eb',
      debugHtml = false,
    } = body;

    console.log(`[Browserless] Starting PDF generation for: ${siteName}`);
    console.log(`[Browserless] Report type: ${reportType}`);
    console.log(`[Browserless] Sections: ${inspection?.sections?.length || 0}`);

    if (!inspection) {
      throw new Error('No inspection data provided');
    }

    // Process images - convert to SIGNED URLs for Chrome to fetch directly
    // This avoids base64 size limits and lets Chrome render images at display size
    const processedInspection = JSON.parse(JSON.stringify(inspection));
    let imageCount = 0;
    
    // Process section photos - use signed URLs
    if (processedInspection.sections) {
      for (const section of processedInspection.sections) {
        for (const item of section.items) {
          if (item.photos && item.photos.length > 0) {
            const processedPhotos: string[] = [];
            for (const photoUrl of item.photos.slice(0, 4)) {
              const signedUrl = await getSignedImageUrl(photoUrl);
              if (signedUrl) {
                processedPhotos.push(signedUrl);
                imageCount++;
              }
            }
            item.photos = processedPhotos;
          }
        }
      }
    }

    // Process snag photos - use signed URLs
    if (processedInspection.snags) {
      for (const snag of processedInspection.snags) {
        if (snag.photos && snag.photos.length > 0) {
          const processedPhotos: string[] = [];
          for (const photoUrl of snag.photos.slice(0, 2)) {
            const signedUrl = await getSignedImageUrl(photoUrl);
            if (signedUrl) {
              processedPhotos.push(signedUrl);
              imageCount++;
            }
          }
          snag.photos = processedPhotos;
        }
      }
    }

    // Process signatures - these are small, can use base64
    if (processedInspection.signatures) {
      for (const sig of processedInspection.signatures) {
        if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
          const base64OrUrl = await getImageAsBase64(sig.signatureUrl);
          if (base64OrUrl) {
            sig.signatureUrl = base64OrUrl;
            imageCount++;
          }
        }
      }
    }

    // Process logo - can use signed URL
    let processedLogoUrl = siteLogoUrl;
    if (siteLogoUrl && !siteLogoUrl.startsWith('data:')) {
      const signedLogo = await getSignedImageUrl(siteLogoUrl);
      if (signedLogo) processedLogoUrl = signedLogo;
    }

    console.log(`[Browserless] Processed ${imageCount} images (using signed URLs)`);

    // Generate HTML
    const html = generateHTML(processedInspection, siteName, clientName, processedLogoUrl, accentColor);
    console.log(`[Browserless] HTML size: ${Math.round(html.length / 1024)}KB`);

    // Save debug HTML if requested
    if (debugHtml) {
      const supabase = getSupabaseClient();
      const debugPath = `debug/browserless_${Date.now()}.html`;
      await supabase.storage.from('documents').upload(debugPath, html, {
        contentType: 'text/html',
        upsert: true,
      });
      console.log(`[Browserless] Debug HTML saved: ${debugPath}`);
    }

    // Call Browserless PDF API
    const browserlessUrl = `https://chrome.browserless.io/pdf?token=${BROWSERLESS_API_KEY}`;
    
    const pdfResponse = await fetch(browserlessUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        html,
        options: {
          format: 'A4',
          printBackground: true,
          margin: {
            top: '15mm',
            right: '15mm',
            bottom: '20mm',
            left: '15mm',
          },
          displayHeaderFooter: true,
          headerTemplate: '<div></div>',
          footerTemplate: `
            <div style="width: 100%; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; padding: 0 15mm;">
              <span>CONFIDENTIAL</span>
              <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
              <span>${new Date().toLocaleDateString('en-ZA')}</span>
            </div>
          `,
        },
        gotoOptions: {
          waitUntil: 'networkidle0',
          timeout: 60000,
        },
      }),
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error(`[Browserless] API error: ${pdfResponse.status}`, errorText);
      throw new Error(`Browserless API error: ${pdfResponse.status} - ${errorText.substring(0, 200)}`);
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    console.log(`[Browserless] PDF generated: ${Math.round(pdfBuffer.byteLength / 1024)}KB`);

    // Upload to Supabase storage
    const supabase = getSupabaseClient();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeSiteName = (siteName || 'report').replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const filename = `${safeSiteName}_Inspection_${timestamp}.pdf`;
    const storagePath = `reports/${filename}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[Browserless] Upload error:`, uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    console.log(`[Browserless] PDF uploaded: ${urlData.publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        filename,
        size: pdfBuffer.byteLength,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('[Browserless] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
