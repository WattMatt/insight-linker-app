/**
 * Generate Inspection PDF - HTML + Browserless Architecture
 * 
 * Complete rebuild of PDF generation using:
 * 1. HTML/CSS templates for pixel-perfect layout
 * 2. Browserless (headless Chrome) for reliable rendering
 * 3. Embedded base64 images for guaranteed display
 * 
 * This replaces all previous PDF/DOCX generation attempts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// CORS & CONFIG
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BROWSERLESS_API_KEY = Deno.env.get('BROWSERLESS_API_KEY')!;

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

interface InspectionPayload {
  inspection: {
    inspectionId: string;
    templateName?: string;
    inspectorName?: string;
    inspectionDate?: string;
    status?: string;
    qualityRating?: number;
    generalInfo?: Record<string, any>;
    sections?: InspectionSection[];
    tenants?: any[];
    snags?: InspectionSnag[];
    signatures?: InspectionSignature[];
    subsectionName?: string;
  };
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string | null;
  accentColor?: string;
  // For document persistence
  subsectionId?: string;
  userId?: string;
}

// ============================================================================
// IMAGE PROCESSING PIPELINE - Aligned with DOCX Generator (Direct Render API)
// ============================================================================

// Maximum images to process to avoid CPU limits
// Increased to 40 to support EMB inspections with many tenants and section photos
// Maximum images to process to avoid CPU limits
// Increased to 100 to support larger inspection reports
// Maximum images to process to avoid CPU limits
// Increased to 150 to support large comprehensive inspection reports
const MAX_TOTAL_IMAGES = 150;
const MAX_PHOTOS_PER_ITEM = 3; // Support up to 3 photos per item for 3-column grid

/**
 * Image size specifications - UNIFIED 3-COLUMN GRID STANDARD
 * ... (unchanged comments)
 */
const IMAGE_SPECS = {
  logo: { maxHeight: 200, quality: 80 },       // Logo: fit cover area height
  photo: { maxHeight: 280, quality: 70 },      // Photos: 2x 140px container height for sharpness
  signature: { maxHeight: 150, quality: 80 },  // Signatures: preserve legibility
};

type ImageType = keyof typeof IMAGE_SPECS;

// Singleton Supabase client for efficient image processing
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

/**
 * Parse Supabase storage URL to extract bucket and file path
 * Handles both public URLs and signed URLs
 */
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const urlObj = new URL(url);

    // Match: /storage/v1/object/public/{bucket}/{path}
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

    // Match: /storage/v1/object/sign/{bucket}/{path} (signed URLs)
    if (url.includes('/storage/v1/object/sign/')) {
      const pathParts = urlObj.pathname.split('/storage/v1/object/sign/');
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

/**
 * Convert ArrayBuffer to base64 string safely (without stack overflow)
 * Uses chunked processing to avoid call stack issues with large buffers
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192; // Process 8KB chunks at a time
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(binary);
}

/**
 * Detect image MIME type from first bytes
 */
function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/**
 * Search for alternative file in the same directory when exact file not found
 * This handles cases where files were re-uploaded with different naming patterns
 */
async function findAlternativeFile(bucket: string, filePath: string): Promise<string | null> {
  const supabase = getSupabaseClient();

  // Extract directory path (everything up to the last segment)
  const pathParts = filePath.split('/');
  const fileName = pathParts.pop() || '';
  const dirPath = pathParts.join('/');

  if (!dirPath) return null;

  console.log(`[ImagePipeline] Searching for alternative in: ${dirPath}/`);

  try {
    // List files in the directory
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(dirPath, { limit: 10 });

    if (error || !files || files.length === 0) {
      console.warn(`[ImagePipeline] No files found in directory: ${dirPath}`);
      return null;
    }

    // Filter for image files only
    const imageFiles = files.filter(f =>
      f.name &&
      !f.name.startsWith('.') &&
      (f.name.endsWith('.jpg') || f.name.endsWith('.jpeg') || f.name.endsWith('.png') || f.name.endsWith('.webp'))
    );

    if (imageFiles.length === 0) {
      console.warn(`[ImagePipeline] No image files found in: ${dirPath}`);
      return null;
    }

    // Sort by name (most recent by timestamp pattern) and take the first one
    const sortedFiles = imageFiles.sort((a, b) => {
      // Try to extract timestamp from filename for sorting
      const aMatch = a.name.match(/(\d{13})/) || a.name.match(/(\d{10})/);
      const bMatch = b.name.match(/(\d{13})/) || b.name.match(/(\d{10})/);
      if (aMatch && bMatch) {
        return Number(bMatch[1]) - Number(aMatch[1]); // Descending (newest first)
      }
      return a.name.localeCompare(b.name);
    });

    const alternativeFile = sortedFiles[0];
    const alternativePath = `${dirPath}/${alternativeFile.name}`;

    console.log(`[ImagePipeline] ✓ Found alternative: ${alternativeFile.name}`);
    return alternativePath;
  } catch (err) {
    console.warn(`[ImagePipeline] Error searching for alternative:`, err);
    return null;
  }
}

/**
 * Download image via Direct Render API - MATCHES DOCX GENERATOR EXACTLY
 * Constructs URL: /storage/v1/render/image/public/{bucket}/{path}?width={maxWidth}&quality={quality}
 */
async function downloadImageViaRenderAPI(
  bucket: string,
  filePath: string,
  maxHeight: number,
  quality: number = 75
): Promise<ArrayBuffer | null> {
  // Encode each path segment individually to handle spaces and special characters
  const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const transformUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${encodedPath}?height=${maxHeight}&quality=${quality}`;

  try {
    console.log(`[ImagePipeline] Render API: height=${maxHeight}, quality=${quality}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(transformUrl, {
      signal: controller.signal,
      headers: { 'Accept': 'image/*' }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      console.log(`[ImagePipeline] ✓ Render API success: ${Math.round(buffer.byteLength / 1024)}KB`);
      return buffer;
    }

    console.warn(`[ImagePipeline] Render API failed: HTTP ${response.status}`);
  } catch (err) {
    console.warn(`[ImagePipeline] Render API error:`, err);
  }

  // Fallback: Try alternative file in same directory
  const alternativePath = await findAlternativeFile(bucket, filePath);
  if (alternativePath && alternativePath !== filePath) {
    const encodedAltPath = alternativePath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    console.log(`[ImagePipeline] Trying alternative: ${alternativePath.substring(0, 50)}...`);
    const altUrl = `${SUPABASE_URL}/storage/v1/render/image/public/${bucket}/${encodedAltPath}?height=${maxHeight}&quality=${quality}`;

    try {
      const altResponse = await fetch(altUrl);
      if (altResponse.ok) {
        const buffer = await altResponse.arrayBuffer();
        console.log(`[ImagePipeline] ✓ Alternative success: ${Math.round(buffer.byteLength / 1024)}KB`);
        return buffer;
      }
    } catch {
      // Fall through to direct download
    }
  }

  // Final fallback: Direct download without transformation
  console.log(`[ImagePipeline] Falling back to direct download...`);
  const supabase = getSupabaseClient();
  const { data: blob, error } = await supabase.storage
    .from(bucket)
    .download(filePath);

  if (error || !blob) {
    console.error(`[ImagePipeline] Direct download also failed: ${error?.message}`);
    return null;
  }

  const buffer = await blob.arrayBuffer();
  console.log(`[ImagePipeline] ✓ Direct download: ${Math.round(buffer.byteLength / 1024)}KB`);
  return buffer;
}

/**
 * Download image and convert to base64 data URI
 * Uses Direct Render API (matching DOCX generator) for Supabase images
 * Falls back to direct fetch for external URLs
 */
async function imageToBase64(url: string, imageType: ImageType = 'photo'): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url; // Already base64

  const spec = IMAGE_SPECS[imageType];
  const maxSizeKB = imageType === 'logo' ? 150 : 300;

  try {
    console.log(`[ImagePipeline] Processing (${imageType}): ${url.substring(0, 60)}...`);

    // Check if this is a Supabase storage URL
    const parsed = parseSupabaseStorageUrl(url);

    if (parsed) {
      // Use Direct Render API with height-based transformation for proper portrait scaling
      const buffer = await downloadImageViaRenderAPI(
        parsed.bucket,
        parsed.path,
        spec.maxHeight,
        spec.quality
      );

      if (buffer && buffer.byteLength > 0) {
        if (buffer.byteLength > maxSizeKB * 1024) {
          console.warn(`[ImagePipeline] Image still large after transform (${Math.round(buffer.byteLength / 1024)}KB), but continuing...`);
        }

        const bytes = new Uint8Array(buffer);
        const mimeType = detectImageType(bytes);
        const base64 = arrayBufferToBase64(buffer);
        console.log(`[ImagePipeline] ✓ OK (${Math.round(buffer.byteLength / 1024)}KB, ${mimeType})`);
        return `data:${mimeType};base64,${base64}`;
      }

      console.warn(`[ImagePipeline] ✗ Failed to download from Supabase storage`);
      return null;
    }

    // Fallback: Direct fetch for non-Supabase URLs
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'image/*' }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[ImagePipeline] Fetch failed: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();

    // Skip very large images
    if (buffer.byteLength > 500 * 1024) {
      console.warn(`[ImagePipeline] Skipping large external image (${Math.round(buffer.byteLength / 1024)}KB)`);
      return null;
    }

    const base64 = arrayBufferToBase64(buffer);
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    console.log(`[ImagePipeline] ✓ OK via fetch (${Math.round(buffer.byteLength / 1024)}KB)`);
    return `data:${contentType};base64,${base64}`;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ImagePipeline] Error: ${errMsg}`);
    return null;
  }
}

/**
 * Image request with type information for template-matched sizing
 */
interface ImageRequest {
  url: string;
  type: ImageType;
}
async function processAllImages(
  payload: InspectionPayload
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const requests: ImageRequest[] = [];

  // Helper to add request if not already data URI and under limit
  const addRequest = (url: string, type: ImageType) => {
    if (!url) return;

    // If already data URI, we don't need to fetch it
    // The getImage function will handle it directly
    if (url.startsWith('data:')) return;

    if (requests.length < MAX_TOTAL_IMAGES) {
      requests.push({ url, type });
    }
  };

  // Prioritize: 1) Logo (special sizing)
  if (payload.siteLogoUrl) {
    addRequest(payload.siteLogoUrl, 'logo');
  }

  // Collect photos from sections - ALL use unified 3-column sizing
  if (payload.inspection.sections) {
    for (const section of payload.inspection.sections) {
      for (const item of section.items) {
        if (item.photos) {
          const limitedPhotos = item.photos.slice(0, MAX_PHOTOS_PER_ITEM);
          for (const photo of limitedPhotos) {
            addRequest(photo, 'photo');
          }
        }
      }
    }
  }

  // Tenant images (meterImage, breakerImage, ctRatioImage) - unified 3-column sizing
  if (payload.inspection.tenants) {
    for (const tenant of payload.inspection.tenants) {
      if (tenant.meterImage) addRequest(tenant.meterImage, 'photo');
      if (tenant.breakerImage) addRequest(tenant.breakerImage, 'photo');
      if (tenant.ctRatioImage) addRequest(tenant.ctRatioImage, 'photo');
    }
  }

  // Snag photos - unified 3-column sizing
  if (payload.inspection.snags) {
    for (const snag of payload.inspection.snags) {
      if (snag.photos && snag.photos[0]) {
        addRequest(snag.photos[0], 'photo');
      }
    }
  }

  // Signatures (special sizing)
  if (payload.inspection.signatures) {
    for (const sig of payload.inspection.signatures) {
      if (sig.signatureUrl) {
        addRequest(sig.signatureUrl, 'signature');
      }
    }
  }

  console.log(`[ImagePipeline] Processing ${requests.length} images (max ${MAX_TOTAL_IMAGES})...`);

  // Process SEQUENTIALLY to avoid CPU spikes
  for (const req of requests) {
    try {
      // Check for duplicates to avoid re-fetching
      if (imageMap.has(req.url)) continue;

      const base64 = await imageToBase64(req.url, req.type);
      if (base64) {
        imageMap.set(req.url, base64);
      }
    } catch (e) {
      console.warn(`[ImagePipeline] Failed: ${req.url.substring(0, 40)}...`);
    }
  }

  console.log(`[ImagePipeline] ✓ Processed ${imageMap.size}/${requests.length} images`);
  return imageMap;
}
// ============================================================================
// HTML TEMPLATE BUILDERS
// ============================================================================

/**
 * Get base64 image from map, with fallback placeholder
 */
function getImage(url: string | undefined | null, imageMap: Map<string, string>): string {
  if (!url) return '';
  return imageMap.get(url) || '';
}

/**
 * Format date for display
 */
function formatDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('en-ZA');
  try {
    return new Date(dateStr).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Calculate statistics from sections
 */
function calculateStats(sections: InspectionSection[]) {
  let totalItems = 0;
  let passed = 0;
  let failed = 0;
  let pending = 0;
  let totalPhotos = 0;

  for (const section of sections) {
    for (const item of section.items) {
      totalItems++;
      const value = String(item.value || '').toLowerCase();

      if (value === 'pass' || value === 'compliant' || value === 'yes' || value === 'true') {
        passed++;
      } else if (value === 'fail' || value === 'non-compliant' || value === 'no' || value === 'false') {
        failed++;
      } else if (value === 'n/a' || value === 'na' || value === 'not applicable') {
        // Don't count N/A in pending
      } else {
        pending++;
      }

      if (item.photos) {
        totalPhotos += item.photos.length;
      }
    }
  }

  const compliance = totalItems > 0 ? Math.round((passed / (passed + failed || 1)) * 100) : 0;

  return { totalItems, passed, failed, pending, totalPhotos, compliance };
}

/**
 * Calculate section breakdown
 */
function calculateSectionBreakdown(sections: InspectionSection[]) {
  return sections.map(section => {
    let items = section.items.length;
    let pass = 0;
    let fail = 0;
    let photos = 0;

    for (const item of section.items) {
      const value = String(item.value || '').toLowerCase();
      if (value === 'pass' || value === 'compliant' || value === 'yes' || value === 'true') {
        pass++;
      } else if (value === 'fail' || value === 'non-compliant' || value === 'no' || value === 'false') {
        fail++;
      }
      if (item.photos) photos += item.photos.length;
    }

    const score = items > 0 ? Math.round((pass / (pass + fail || 1)) * 100) : 100;

    return { title: section.title, items, pass, fail, photos, score };
  });
}

/**
 * Get status badge HTML
 */
function getStatusBadge(value: string | boolean | number): string {
  const v = String(value || '').toLowerCase();

  if (v === 'pass' || v === 'compliant' || v === 'yes' || v === 'true') {
    return '<span class="badge pass">PASS</span>';
  } else if (v === 'fail' || v === 'non-compliant' || v === 'no' || v === 'false') {
    return '<span class="badge fail">FAIL</span>';
  } else if (v === 'n/a' || v === 'na' || v === 'not applicable') {
    return '<span class="badge na">N/A</span>';
  } else {
    return `<span class="badge pending">${value || 'PENDING'}</span>`;
  }
}

/**
 * Build Cover Page (Page 1)
 */
function buildCoverPageHTML(
  payload: InspectionPayload,
  imageMap: Map<string, string>,
  totalPages: number
): string {
  const { inspection, siteName, clientName, siteLogoUrl } = payload;
  const logoBase64 = getImage(siteLogoUrl, imageMap);
  const date = formatDate(inspection.inspectionDate);

  return `
    <div class="page cover">
      <div class="header-bar">
        <span class="header-title">${inspection.templateName || 'ELECTRICAL INSPECTION REPORT'}</span>
      </div>
      
      <div class="cover-content">
        ${logoBase64 ? `
          <div class="cover-logo-wrapper">
            <img src="${logoBase64}" alt="Logo">
          </div>` : '<div class="cover-logo-placeholder"></div>'}
        
        <h1 class="cover-title">${inspection.templateName || 'Electrical Inspection Report'}</h1>
        <p class="cover-subtitle">${inspection.subsectionName || siteName}</p>
        
        <div class="cover-meta">
          <div class="meta-row">
            <span class="meta-label">Site</span>
            <span class="meta-value">${siteName}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Client</span>
            <span class="meta-value">${clientName || 'N/A'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Inspector</span>
            <span class="meta-value">${inspection.inspectorName || 'N/A'}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Date</span>
            <span class="meta-value">${date}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Build Quality Score Dashboard (Page 2)
 */
function buildDashboardHTML(
  payload: InspectionPayload,
  stats: ReturnType<typeof calculateStats>,
  currentPage: number,
  totalPages: number
): string {
  const date = formatDate(payload.inspection.inspectionDate);

  return `
    <div class="page dashboard">
      <div class="header-bar">
        <span class="header-title">${payload.inspection.templateName || 'ELECTRICAL INSPECTION REPORT'}</span>
      </div>
      
      <div class="section-banner">QUALITY SCORE DASHBOARD</div>
      
      <div class="dashboard-content">
        <div class="big-stats">
          <div class="big-stat">
            <div class="big-stat-value green">${stats.compliance}%</div>
            <div class="big-stat-label">COMPLIANCE</div>
          </div>
          <div class="big-stat">
            <div class="big-stat-value navy">${stats.totalItems}</div>
            <div class="big-stat-label">ITEMS CHECKED</div>
          </div>
          <div class="big-stat">
            <div class="big-stat-value navy">${stats.totalPhotos}</div>
            <div class="big-stat-label">PHOTOS</div>
          </div>
        </div>
        
        <p class="sans-notice">
          This inspection was conducted in accordance with SANS 10142-1 requirements for electrical installations.
        </p>
        
        <div class="stat-grid">
          <div class="stat-card green-bg">
            <div class="stat-card-value">${stats.passed}</div>
            <div class="stat-card-label">Items Passed</div>
          </div>
          <div class="stat-card red-bg">
            <div class="stat-card-value">${stats.failed}</div>
            <div class="stat-card-label">Items Failed</div>
          </div>
          <div class="stat-card amber-bg">
            <div class="stat-card-value">${stats.pending}</div>
            <div class="stat-card-label">Pending Review</div>
          </div>
          <div class="stat-card blue-bg">
            <div class="stat-card-value">${stats.totalPhotos}</div>
            <div class="stat-card-label">Photos Captured</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Build Section Breakdown Page (Page 3)
 */
function buildBreakdownHTML(
  payload: InspectionPayload,
  stats: ReturnType<typeof calculateStats>,
  sectionBreakdown: ReturnType<typeof calculateSectionBreakdown>,
  currentPage: number,
  totalPages: number
): string {
  const date = formatDate(payload.inspection.inspectionDate);
  const generalInfo = payload.inspection.generalInfo || {};

  const breakdownRows = sectionBreakdown.map(s => `
    <tr>
      <td>${s.title}</td>
      <td class="center">${s.items}</td>
      <td class="center green-text">${s.pass}</td>
      <td class="center red-text">${s.fail}</td>
      <td class="center">${s.photos}</td>
      <td class="center ${s.score >= 80 ? 'green-text' : s.score >= 50 ? 'amber-text' : 'red-text'}">${s.score}%</td>
    </tr>
  `).join('');

  // Build general info rows
  const infoEntries = Object.entries(generalInfo).filter(([_, v]) => v);
  const infoRows = infoEntries.map(([key, value], idx) => `
    <tr class="${idx % 2 === 0 ? 'alt-row' : ''}">
      <td class="info-label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</td>
      <td class="info-value">${value}</td>
    </tr>
  `).join('');

  return `
    <div class="page breakdown">
      <div class="header-bar">
        <span class="header-title">${payload.inspection.templateName || 'ELECTRICAL INSPECTION REPORT'}</span>
      </div>
      
      <div class="breakdown-content">
        <div class="overall-indicator">
          <svg viewBox="0 0 120 120" class="progress-ring">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e5e7eb" stroke-width="8"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="${stats.compliance >= 80 ? '#16a34a' : stats.compliance >= 50 ? '#f59e0b' : '#dc2626'}" 
              stroke-width="8" stroke-linecap="round"
              stroke-dasharray="${(stats.compliance / 100) * 339.292} 339.292"
              transform="rotate(-90 60 60)"/>
          </svg>
          <div class="overall-text">
            <div class="overall-value">${stats.compliance}%</div>
            <div class="overall-label">OVERALL</div>
          </div>
        </div>
        
        <h3 class="table-title">Section Breakdown</h3>
        <table class="breakdown-table">
          <thead>
            <tr>
              <th>Section</th>
              <th class="center">Items</th>
              <th class="center">Pass</th>
              <th class="center">Fail</th>
              <th class="center">Photos</th>
              <th class="center">Score</th>
            </tr>
          </thead>
          <tbody>
            ${breakdownRows}
          </tbody>
        </table>
        
        ${infoRows ? `
          <div class="section-banner info-banner">GENERAL INFORMATION</div>
          <table class="info-table">
            <tbody>${infoRows}</tbody>
          </table>
        ` : ''}
      </div>
    </div>
  `;
}

/**
 * Build Section Content Pages (Pages 4+)
 */
function buildSectionPagesHTML(
  payload: InspectionPayload,
  imageMap: Map<string, string>,
  startPage: number,
  totalPages: number
): string {
  const sections = payload.inspection.sections || [];
  let html = '';

  // Content flows naturally - no fixed page wrappers for sections
  // Page breaks are handled via CSS (section headers force new pages)
  sections.forEach((section, sectionIdx) => {
    // Section container - forces page break before each section
    html += `
      <div class="section-container">
        <div class="section-header-bar">
          <span class="section-number">${sectionIdx + 1}</span>
          <span class="section-name">${section.title.toUpperCase()}</span>
        </div>
        
        <div class="section-content">
    `;

    section.items.forEach((item, itemIdx) => {
      const photos = (item.photos || []).filter(p => p);

      // Build TABLE-based photo grid with HTML width/height attributes
      let photoTableHtml = '';
      if (photos.length > 0) {
        const validPhotos = photos.map((photoUrl, pIdx) => {
          const base64 = getImage(photoUrl, imageMap);
          return base64 ? { base64, label: `Photo ${pIdx + 1}` } : null;
        }).filter(Boolean);

        if (validPhotos.length > 0) {
          // Build rows of 3 photos each
          const rows: string[] = [];
          for (let i = 0; i < validPhotos.length; i += 3) {
            const rowPhotos = validPhotos.slice(i, i + 3);
            const cells = rowPhotos.map(p => `
              <td>
                <img src="${p!.base64}" width="180" height="130" style="display:block;margin:0 auto;object-fit:cover;">
                <span class="photo-caption">${p!.label}</span>
              </td>
            `).join('');
            // Pad with empty cells if less than 3
            const emptyCells = '<td></td>'.repeat(3 - rowPhotos.length);
            rows.push(`<tr>${cells}${emptyCells}</tr>`);
          }
          photoTableHtml = `<table class="photo-grid-table"><tbody>${rows.join('')}</tbody></table>`;
        }
      }

      html += `
        <div class="inspection-item">
          <div class="item-header">
            <span class="item-label">${item.label}</span>
            ${getStatusBadge(item.value)}
          </div>
          ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
          ${photoTableHtml}
        </div>
      `
    });

    html += `
        </div>
      </div>
    `;
  });

  return html;
}

/**
 * Build Tenants Section Page
 */
function buildTenantsPageHTML(
  payload: InspectionPayload,
  imageMap: Map<string, string>,
  sectionNumber: number
): string {
  const tenants = payload.inspection.tenants || [];

  if (tenants.length === 0) {
    return '';
  }

  let html = `
    <div class="section-container">
      <div class="section-header-bar">
        <span class="section-number">${sectionNumber}</span>
        <span class="section-name">TENANT INFORMATION</span>
      </div>
      
      <div class="section-content">
  `;

  tenants.forEach((tenant, idx) => {
    const meterBase64 = getImage(tenant.meterImage, imageMap);
    const breakerBase64 = getImage(tenant.breakerImage, imageMap);
    const ctRatioBase64 = getImage(tenant.ctRatioImage, imageMap);

    const hasImages = meterBase64 || breakerBase64 || ctRatioBase64;

    html += `
      <div class="tenant-card">
        <div class="tenant-header">
          <span class="tenant-name">${tenant.shopName || 'Tenant ' + (idx + 1)}</span>
          ${tenant.shopNumber ? `<span class="tenant-number">Shop: ${tenant.shopNumber}</span>` : ''}
        </div>
        
        <div class="tenant-details">
          <table class="tenant-table">
            <tbody>
              ${tenant.meterSerialNumber ? `
                <tr>
                  <td class="detail-label">Meter Serial Number</td>
                  <td class="detail-value">${tenant.meterSerialNumber}</td>
                </tr>
              ` : ''}
              ${tenant.breakerSize ? `
                <tr>
                  <td class="detail-label">Breaker Size</td>
                  <td class="detail-value">${tenant.breakerSize}</td>
                </tr>
              ` : ''}
              ${tenant.ctSizeAndRatio ? `
                <tr>
                  <td class="detail-label">CT Size and Ratio</td>
                  <td class="detail-value">${tenant.ctSizeAndRatio}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>
        
        ${hasImages ? `
          <table class="photo-grid-table">
            <tbody>
              <tr>
                ${meterBase64 ? `
                  <td>
                    <img src="${meterBase64}" width="180" height="130" style="display:block;margin:0 auto;object-fit:cover;">
                    <span class="photo-caption">Meter</span>
                  </td>
                ` : '<td></td>'}
                ${breakerBase64 ? `
                  <td>
                    <img src="${breakerBase64}" width="180" height="130" style="display:block;margin:0 auto;object-fit:cover;">
                    <span class="photo-caption">Breaker</span>
                  </td>
                ` : '<td></td>'}
                ${ctRatioBase64 ? `
                  <td>
                    <img src="${ctRatioBase64}" width="180" height="130" style="display:block;margin:0 auto;object-fit:cover;">
                    <span class="photo-caption">CT Ratio</span>
                  </td>
                ` : '<td></td>'}
              </tr>
            </tbody>
          </table>
        ` : ''}
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Build complete HTML document
 */
function buildCompleteHTML(
  payload: InspectionPayload,
  imageMap: Map<string, string>
): string {
  const sections = payload.inspection.sections || [];
  const stats = calculateStats(sections);
  const sectionBreakdown = calculateSectionBreakdown(sections);

  // Calculate total pages: Cover + Dashboard + Breakdown + one per section
  const totalPages = 3 + sections.length;

  const css = `
    @page { 
      size: A4; 
      margin: 20mm 10mm 20mm 10mm;
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: #1f2937;
      line-height: 1.4;
      background: white;
    }
    
    .page {
      width: 100%;
      padding: 0;
      position: relative;
      background: white;
    }
    
    .page.dashboard,
    .page.breakdown,
    .page.cover ~ .page {
      page-break-before: always;
    }
    
    .page.cover {
      page-break-before: avoid;
    }
    
    /* Header Bar */
    .header-bar {
      background: #1a365d;
      color: white;
      padding: 12px 24px;
      font-size: 11pt;
      font-weight: 600;
    }
    
    /* Section Banner */
    .section-banner {
      background: #0d7377;
      color: white;
      padding: 10px 24px;
      font-size: 12pt;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .info-banner {
      margin-top: 20px;
    }
    
    /* Cover Page */
    .cover-content {
      padding: 40px 24px;
      text-align: center;
    }
    
    /* Logo container - simple block with explicit dimensions */
    .cover-logo-wrapper {
      width: 200px;
      height: 120px;
      margin: 0 auto 30px;
      display: block;
    }
    
    .cover-logo-wrapper img {
      width: 200px;
      height: 120px;
      object-fit: contain;
      display: block;
    }
    
    .cover-logo-placeholder {
      width: 200px;
      height: 100px;
      margin: 0 auto 30px;
    }
    
    .cover-title {
      font-size: 24pt;
      font-weight: 700;
      color: #1a365d;
      margin-bottom: 10px;
    }
    
    .cover-subtitle {
      font-size: 14pt;
      color: #0d7377;
      margin-bottom: 40px;
    }
    
    .cover-meta {
      border-left: 4px solid #0d7377;
      padding-left: 20px;
      text-align: left;
      width: 300px;
      margin: 0 auto;
    }
    
    .meta-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .meta-row:last-child {
      border-bottom: none;
    }
    
    .meta-label {
      font-weight: 600;
      width: 80px;
      color: #4b5563;
    }
    
    .meta-value {
      flex: 1;
      color: #1f2937;
    }
    
    /* Dashboard Page */
    .dashboard-content {
      padding: 30px 24px;
    }
    
    .big-stats {
      display: flex;
      justify-content: center;
      gap: 60px;
      margin-bottom: 30px;
    }
    
    .big-stat {
      text-align: center;
    }
    
    .big-stat-value {
      font-size: 48pt;
      font-weight: 700;
      line-height: 1;
    }
    
    .big-stat-value.green { color: #16a34a; }
    .big-stat-value.navy { color: #1a365d; }
    
    .big-stat-label {
      font-size: 10pt;
      color: #6b7280;
      margin-top: 8px;
      letter-spacing: 1px;
    }
    
    .sans-notice {
      text-align: center;
      font-style: italic;
      color: #6b7280;
      margin: 20px 0 30px;
      font-size: 9pt;
    }
    
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      max-width: 500px;
      margin: 0 auto;
    }
    
    .stat-card {
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    
    .stat-card-value {
      font-size: 28pt;
      font-weight: 700;
      color: white;
    }
    
    .stat-card-label {
      font-size: 9pt;
      color: rgba(255,255,255,0.9);
      margin-top: 4px;
    }
    
    .green-bg { background: #16a34a; }
    .red-bg { background: #dc2626; }
    .amber-bg { background: #f59e0b; }
    .blue-bg { background: #2563eb; }
    
    /* Breakdown Page */
    .breakdown-content {
      padding: 20px 24px;
    }
    
    .overall-indicator {
      position: relative;
      width: 120px;
      height: 120px;
      margin: 0 auto 20px;
    }
    
    .progress-ring {
      width: 100%;
      height: 100%;
    }
    
    .overall-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }
    
    .overall-value {
      font-size: 24pt;
      font-weight: 700;
      color: #1a365d;
    }
    
    .overall-label {
      font-size: 8pt;
      color: #6b7280;
      letter-spacing: 1px;
    }
    
    .table-title {
      font-size: 12pt;
      font-weight: 600;
      color: #1a365d;
      margin-bottom: 10px;
    }
    
    .breakdown-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    
    .breakdown-table th {
      background: #1a365d;
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 9pt;
    }
    
    .breakdown-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    
    .center { text-align: center; }
    .green-text { color: #16a34a; font-weight: 600; }
    .red-text { color: #dc2626; font-weight: 600; }
    .amber-text { color: #f59e0b; font-weight: 600; }
    
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .info-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    
    /* Table content integrity - prevents split across pages (PDF_LAYOUT_STANDARDS.md) */
    .breakdown-table,
    .info-table,
    .tenant-table {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    
    .alt-row { background: #f9fafb; }
    
    .info-label {
      font-weight: 600;
      width: 180px;
      color: #4b5563;
    }
    
    /* Section Container - flows across pages */
    .section-container {
      page-break-before: always;
    }
    
    .section-container:first-child {
      page-break-before: auto;
    }
    
    .section-header-bar {
      background: #0d7377;
      color: white;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      break-after: avoid;
      page-break-after: avoid;
    }
    
    /* Legacy section header for fixed pages */
    .section-header {
      background: #0d7377;
      color: white;
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .section-number {
      font-size: 18pt;
      font-weight: 700;
    }
    
    .section-name {
      font-size: 12pt;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .section-content {
      padding: 20px 24px;
      padding-bottom: 40px;
    }
    
    .inspection-item {
      margin-bottom: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    
    .item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f9fafb;
    }
    
    .item-label {
      font-weight: 500;
      color: #1f2937;
    }
    
    .badge {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .badge.pass {
      background: #dcfce7;
      color: #16a34a;
    }
    
    .badge.fail {
      background: #fef2f2;
      color: #dc2626;
    }
    
    .badge.na {
      background: #f3f4f6;
      color: #6b7280;
    }
    
    .badge.pending {
      background: #fef3c7;
      color: #d97706;
    }
    
    .item-notes {
      padding: 8px 14px;
      font-size: 9pt;
      color: #6b7280;
      background: white;
      border-top: 1px solid #e5e7eb;
    }
    
    /* PHOTO GRID TABLE - Most reliable for PDF rendering */
    .photo-grid-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 6px;
      background: #f9fafb;
      padding: 8px;
      border-top: 1px solid #e5e7eb;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    
    .photo-grid-table td {
      width: 186px;
      height: 140px;
      vertical-align: middle;
      text-align: center;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 0;
      position: relative;
    }
    
    /* IMAGE with HTML width/height attributes - most reliable */
    .photo-grid-table img {
      display: block;
      margin: 0 auto;
    }
    
    /* Photo label */
    .photo-caption {
      display: block;
      background: rgba(0,0,0,0.6);
      color: white;
      font-size: 8pt;
      padding: 3px 4px;
      text-align: center;
      margin-top: -4px;
    }
    
    /* Tenant Card Styles */
    .tenant-card {
      margin-bottom: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    
    .tenant-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #1a365d 0%, #2d4a7c 100%);
      color: white;
    }
    
    .tenant-name {
      font-weight: 600;
      font-size: 11pt;
    }
    
    .tenant-number {
      font-size: 9pt;
      opacity: 0.9;
    }
    
    .tenant-details {
      padding: 12px 16px;
      background: #f9fafb;
    }
    
    .tenant-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .tenant-table td {
      padding: 6px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 9pt;
    }
    
    .tenant-table tr:last-child td {
      border-bottom: none;
    }
    
    .detail-label {
      font-weight: 500;
      color: #4b5563;
      width: 40%;
    }
    
    .detail-value {
      color: #1f2937;
    }
    
    .tenant-images {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      padding: 12px 16px;
      background: white;
      border-top: 1px solid #e5e7eb;
    }
    
    .tenant-image-item {
      text-align: center;
    }
    
    /* Tenant image sizing - ASPECT RATIO PRESERVED (matching DOCX approach) */
    .tenant-image-item img {
      width: 100%;
      max-width: 200px;
      height: auto;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
  `;

  const tenants = payload.inspection.tenants || [];
  const hasTenants = tenants.length > 0;

  const coverPage = buildCoverPageHTML(payload, imageMap, totalPages);
  const dashboardPage = buildDashboardHTML(payload, stats, 2, totalPages);
  const breakdownPage = buildBreakdownHTML(payload, stats, sectionBreakdown, 3, totalPages);
  const sectionPages = buildSectionPagesHTML(payload, imageMap, 4, totalPages);

  // Add tenants page after all sections if there are tenants
  const tenantsPage = hasTenants ? buildTenantsPageHTML(payload, imageMap, sections.length + 1) : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>${css}</style>
    </head>
    <body>
      ${coverPage}
      ${dashboardPage}
      ${breakdownPage}
      ${sectionPages}
      ${tenantsPage}
    </body>
    </html>
  `;
}

// ============================================================================
// BROWSERLESS PDF GENERATION
// ============================================================================

async function generatePdfWithBrowserless(html: string): Promise<ArrayBuffer> {
  console.log('[Browserless] Sending HTML for PDF conversion...');
  console.log('[Browserless] HTML size:', Math.round(html.length / 1024), 'KB');

  // Dynamic footer template with page numbers
  const footerTemplate = `
    <div style="width: 100%; font-size: 8px; font-family: Arial, sans-serif; display: flex; justify-content: space-between; padding: 0 24px; color: #6b7280;">
      <span>CONFIDENTIAL - For authorized use only</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      <span>${new Date().toLocaleDateString('en-ZA')}</span>
    </div>
  `;

  const response = await fetch('https://chrome.browserless.io/pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(BROWSERLESS_API_KEY + ':')}`,
    },
    body: JSON.stringify({
      html,
      options: {
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          bottom: '20mm',
          left: '10mm',
          right: '10mm'
        },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: footerTemplate,
        preferCSSPageSize: true,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Browserless] Error:', response.status, errorText);
    throw new Error(`Browserless failed: ${response.status} - ${errorText}`);
  }

  const pdfBuffer = await response.arrayBuffer();
  console.log('[Browserless] ✓ PDF generated:', Math.round(pdfBuffer.byteLength / 1024), 'KB');

  return pdfBuffer;
}

// ============================================================================
// STORAGE & DOCUMENT PERSISTENCE
// ============================================================================

async function uploadToStorage(
  pdfBuffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const path = `inspection-reports/${fileName}`;

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (error) {
    console.error('[Storage] Upload error:', error);
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(path);

  console.log('[Storage] ✓ Uploaded:', urlData.publicUrl);
  return urlData.publicUrl;
}

/**
 * Create document record in subsection_documents table
 * This ensures the report is saved even if client connection times out
 */
async function saveDocumentRecord(
  subsectionId: string,
  fileName: string,
  fileUrl: string,
  userId?: string
): Promise<string | null> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find or create "Inspection Reports" category
    let categoryId: string | undefined;

    const { data: existingCategory } = await supabase
      .from('document_categories')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('name', 'Inspection Reports')
      .maybeSingle();

    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const { data: newCategory } = await supabase
        .from('document_categories')
        .insert({
          subsection_id: subsectionId,
          name: 'Inspection Reports',
          order_index: 0,
        })
        .select('id')
        .single();
      categoryId = newCategory?.id;
    }

    if (!categoryId) {
      console.warn('[Document] Could not create/find category');
      return null;
    }

    // Insert document record
    const { data: docData, error: docError } = await supabase
      .from('subsection_documents')
      .insert({
        subsection_id: subsectionId,
        category_id: categoryId,
        file_name: fileName,
        file_url: fileUrl,
        uploaded_by: userId || null,
      })
      .select('id')
      .single();

    if (docError) {
      console.warn('[Document] Insert error:', docError.message);
      return null;
    }

    console.log('[Document] ✓ Saved record:', docData.id);
    return docData.id;
  } catch (err) {
    console.warn('[Document] Save error:', err);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[GenerateInspectionPDF] Starting...');

    const payload: InspectionPayload & { returnHtmlOnly?: boolean } = await req.json();

    if (!payload.inspection) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing inspection data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[GenerateInspectionPDF] Inspection:', payload.inspection.inspectionId);
    console.log('[GenerateInspectionPDF] Sections:', payload.inspection.sections?.length || 0);
    console.log('[GenerateInspectionPDF] Tenants:', payload.inspection.tenants?.length || 0);
    console.log('[GenerateInspectionPDF] Snags:', payload.inspection.snags?.length || 0);

    // Log tenant data to verify it's reaching the edge function
    if (payload.inspection.tenants && payload.inspection.tenants.length > 0) {
      const firstTenant = payload.inspection.tenants[0];
      console.log('[GenerateInspectionPDF] First tenant sample:', {
        shopName: firstTenant.shopName,
        shopNumber: firstTenant.shopNumber,
        meterSerialNumber: firstTenant.meterSerialNumber,
        hasMeterImage: !!firstTenant.meterImage,
        hasBreakerImage: !!firstTenant.breakerImage,
        hasCTRatioImage: !!firstTenant.ctRatioImage,
      });
    }

    // Phase 1: Process all images
    const imageMap = await processAllImages(payload);

    // Phase 2: Build complete HTML
    const html = buildCompleteHTML(payload, imageMap);
    
    // Debug mode: return HTML only for inspection
    if (payload.returnHtmlOnly) {
      console.log('[GenerateInspectionPDF] Debug mode - returning HTML only');
      return new Response(html, { 
        headers: { ...corsHeaders, 'Content-Type': 'text/html' } 
      });
    }

    // Phase 3: Convert to PDF via Browserless
    const pdfBuffer = await generatePdfWithBrowserless(html);

    // Phase 4: Upload to storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (payload.inspection.subsectionName || payload.siteName || 'report')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${safeName}_${timestamp}.pdf`;

    const publicUrl = await uploadToStorage(pdfBuffer, fileName);

    // Phase 5: Save document record (server-side to survive client timeout)
    let documentId: string | null = null;
    if (payload.subsectionId) {
      documentId = await saveDocumentRecord(
        payload.subsectionId,
        fileName,
        publicUrl,
        payload.userId
      );
    }

    console.log('[GenerateInspectionPDF] ✓ Complete');

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        fileName,
        documentId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GenerateInspectionPDF] Error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
