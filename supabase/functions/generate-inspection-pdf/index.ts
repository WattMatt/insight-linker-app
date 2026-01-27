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
}

// ============================================================================
// IMAGE PROCESSING PIPELINE
// ============================================================================

// Maximum images to process to avoid CPU limits
const MAX_TOTAL_IMAGES = 15;
const MAX_PHOTOS_PER_ITEM = 2;

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
 * Download image and convert to base64 data URI
 * Uses Supabase service role for authenticated access
 */
async function imageToBase64(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url; // Already base64
  
  try {
    console.log(`[ImagePipeline] Processing: ${url.substring(0, 60)}...`);
    
    // Create service role client for storage access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Check if this is a Supabase storage URL
    if (url.includes('supabase') && url.includes('/storage/')) {
      const urlObj = new URL(url);
      const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)/);
      
      if (pathMatch) {
        const [, bucket, filePath] = pathMatch;
        const decodedPath = decodeURIComponent(filePath);
        
        console.log(`[ImagePipeline] Downloading: ${decodedPath.substring(0, 50)}...`);
        
        const { data, error } = await supabase.storage.from(bucket).download(decodedPath);
        
        if (error) {
          console.error(`[ImagePipeline] Storage error:`, error.message);
        } else if (data) {
          const buffer = await data.arrayBuffer();
          
          // Skip very large images (>500KB)
          if (buffer.byteLength > 500 * 1024) {
            console.warn(`[ImagePipeline] Skipping large image (${Math.round(buffer.byteLength / 1024)}KB)`);
            return null;
          }
          
          const base64 = arrayBufferToBase64(buffer);
          const mimeType = data.type || 'image/jpeg';
          console.log(`[ImagePipeline] ✓ OK (${Math.round(buffer.byteLength / 1024)}KB)`);
          return `data:${mimeType};base64,${base64}`;
        }
      }
    }
    
    // Fallback: Direct fetch with timeout
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
      console.warn(`[ImagePipeline] Skipping large image (${Math.round(buffer.byteLength / 1024)}KB)`);
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
 * Process images SEQUENTIALLY to avoid CPU overload
 * Also limits total images to stay within edge function resource limits
 */
async function processAllImages(
  payload: InspectionPayload
): Promise<Map<string, string>> {
  const imageMap = new Map<string, string>();
  const urls: string[] = [];
  
  // Prioritize: 1) Logo 2) First photo of each item
  if (payload.siteLogoUrl) urls.push(payload.siteLogoUrl);
  
  // Collect limited photos from sections (max 2 per item)
  if (payload.inspection.sections) {
    for (const section of payload.inspection.sections) {
      for (const item of section.items) {
        if (item.photos) {
          const limitedPhotos = item.photos.slice(0, MAX_PHOTOS_PER_ITEM);
          for (const photo of limitedPhotos) {
            if (photo && urls.length < MAX_TOTAL_IMAGES) {
              urls.push(photo);
            }
          }
        }
      }
    }
  }
  
  // Snag photos (limited)
  if (payload.inspection.snags) {
    for (const snag of payload.inspection.snags) {
      if (snag.photos && snag.photos[0] && urls.length < MAX_TOTAL_IMAGES) {
        urls.push(snag.photos[0]);
      }
    }
  }
  
  // Signatures
  if (payload.inspection.signatures) {
    for (const sig of payload.inspection.signatures) {
      if (sig.signatureUrl && urls.length < MAX_TOTAL_IMAGES) {
        urls.push(sig.signatureUrl);
      }
    }
  }
  
  console.log(`[ImagePipeline] Processing ${urls.length} images (max ${MAX_TOTAL_IMAGES})...`);
  
  // Process SEQUENTIALLY to avoid CPU spikes
  for (const url of urls) {
    try {
      const base64 = await imageToBase64(url);
      if (base64) {
        imageMap.set(url, base64);
      }
    } catch (e) {
      console.warn(`[ImagePipeline] Failed: ${url.substring(0, 40)}...`);
    }
  }
  
  console.log(`[ImagePipeline] ✓ Processed ${imageMap.size}/${urls.length} images`);
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
        ${logoBase64 ? `<img src="${logoBase64}" class="cover-logo" alt="Logo">` : '<div class="cover-logo-placeholder"></div>'}
        
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
      
      <div class="footer">
        <span>CONFIDENTIAL - For authorized use only</span>
        <span>Page 1 of ${totalPages}</span>
        <span>${date}</span>
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
      
      <div class="footer">
        <span>CONFIDENTIAL - For authorized use only</span>
        <span>Page ${currentPage} of ${totalPages}</span>
        <span>${date}</span>
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
      
      <div class="footer">
        <span>CONFIDENTIAL - For authorized use only</span>
        <span>Page ${currentPage} of ${totalPages}</span>
        <span>${date}</span>
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
  const date = formatDate(payload.inspection.inspectionDate);
  let html = '';
  let currentPage = startPage;
  
  sections.forEach((section, sectionIdx) => {
    // Start new page for each section
    html += `
      <div class="page section-page">
        <div class="header-bar">
          <span class="header-title">${payload.inspection.templateName || 'ELECTRICAL INSPECTION REPORT'}</span>
        </div>
        
        <div class="section-header">
          <span class="section-number">${sectionIdx + 1}</span>
          <span class="section-name">${section.title.toUpperCase()}</span>
        </div>
        
        <div class="section-content">
    `;
    
    section.items.forEach((item, itemIdx) => {
      const photos = (item.photos || []).filter(p => p);
      const photoHtml = photos.length > 0 ? photos.map((photoUrl, pIdx) => {
        const base64 = getImage(photoUrl, imageMap);
        return base64 ? `
          <div class="photo-item">
            <img src="${base64}" alt="Photo ${pIdx + 1}">
            <span class="photo-label">Photo ${pIdx + 1}</span>
          </div>
        ` : '';
      }).join('') : '';
      
      html += `
        <div class="inspection-item">
          <div class="item-header">
            <span class="item-label">${item.label}</span>
            ${getStatusBadge(item.value)}
          </div>
          ${item.notes ? `<div class="item-notes">${item.notes}</div>` : ''}
          ${photoHtml ? `<div class="photo-grid">${photoHtml}</div>` : ''}
        </div>
      `;
    });
    
    html += `
        </div>
        
        <div class="footer">
          <span>CONFIDENTIAL - For authorized use only</span>
          <span>Page ${currentPage} of ${totalPages}</span>
          <span>${date}</span>
        </div>
      </div>
    `;
    
    currentPage++;
  });
  
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
      margin: 0; 
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
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      position: relative;
      page-break-after: always;
      background: white;
    }
    
    .page:last-child {
      page-break-after: auto;
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
    
    /* Footer */
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 10px 24px;
      font-size: 8pt;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
      background: white;
    }
    
    /* Cover Page */
    .cover-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 24px;
      text-align: center;
    }
    
    .cover-logo {
      max-width: 180px;
      max-height: 100px;
      margin-bottom: 30px;
      object-fit: contain;
    }
    
    .cover-logo-placeholder {
      width: 180px;
      height: 80px;
      margin-bottom: 30px;
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
    
    .alt-row { background: #f9fafb; }
    
    .info-label {
      font-weight: 600;
      width: 180px;
      color: #4b5563;
    }
    
    /* Section Pages */
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
      padding-bottom: 60px;
    }
    
    .inspection-item {
      margin-bottom: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
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
    
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      padding: 12px 14px;
      background: white;
      border-top: 1px solid #e5e7eb;
    }
    
    .photo-item {
      text-align: center;
    }
    
    .photo-item img {
      max-width: 100%;
      max-height: 150px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      object-fit: contain;
    }
    
    .photo-label {
      display: block;
      font-size: 8pt;
      color: #6b7280;
      margin-top: 4px;
    }
  `;
  
  const coverPage = buildCoverPageHTML(payload, imageMap, totalPages);
  const dashboardPage = buildDashboardHTML(payload, stats, 2, totalPages);
  const breakdownPage = buildBreakdownHTML(payload, stats, sectionBreakdown, 3, totalPages);
  const sectionPages = buildSectionPagesHTML(payload, imageMap, 4, totalPages);
  
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
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
        displayHeaderFooter: false,
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
// STORAGE & RESPONSE
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
    
    const payload: InspectionPayload = await req.json();
    
    if (!payload.inspection) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing inspection data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[GenerateInspectionPDF] Inspection:', payload.inspection.inspectionId);
    console.log('[GenerateInspectionPDF] Sections:', payload.inspection.sections?.length || 0);
    
    // Phase 1: Process all images
    const imageMap = await processAllImages(payload);
    
    // Phase 2: Build complete HTML
    const html = buildCompleteHTML(payload, imageMap);
    
    // Phase 3: Convert to PDF via Browserless
    const pdfBuffer = await generatePdfWithBrowserless(html);
    
    // Phase 4: Upload to storage
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (payload.inspection.subsectionName || payload.siteName || 'report')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${safeName}_${timestamp}.pdf`;
    
    const publicUrl = await uploadToStorage(pdfBuffer, fileName);
    
    console.log('[GenerateInspectionPDF] ✓ Complete');
    
    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        fileName,
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
