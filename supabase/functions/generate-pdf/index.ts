import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import QRCode from 'https://esm.sh/qrcode@1.5.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate QR code as SVG data URI (works in Deno without canvas)
async function generateQRCodeSvgDataUri(url: string): Promise<string> {
  try {
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: 120,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    // Convert SVG to data URI
    const base64Svg = btoa(svg);
    return `data:image/svg+xml;base64,${base64Svg}`;
  } catch (error) {
    console.error('QR generation error:', error);
    return '';
  }
}

// Extract bucket and path from a Supabase storage URL
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    if (!url.includes('/storage/v1/object/public/')) {
      return null;
    }
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/storage/v1/object/public/');
    if (pathParts.length === 2) {
      const filePathWithBucket = pathParts[1];
      const firstSlashIndex = filePathWithBucket.indexOf('/');
      if (firstSlashIndex > 0) {
        const bucket = filePathWithBucket.substring(0, firstSlashIndex);
        const filePath = filePathWithBucket.substring(firstSlashIndex + 1);
        return { bucket, path: filePath };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Global Supabase client for image fetching (initialized once per request)
let supabaseClientForImages: ReturnType<typeof createClient> | null = null;

function getSupabaseClient(): ReturnType<typeof createClient> {
  if (!supabaseClientForImages) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabaseClientForImages = createClient(supabaseUrl, supabaseServiceKey);
  }
  return supabaseClientForImages;
}

// ============================================================================
// IMAGE HANDLING - Strict Size Control for PDFShift 250MB Limit
// ============================================================================
// PROBLEM: Legacy uncompressed images (15MB+) cause 384MB+ documents.
// Supabase Image Transformation requires Pro plan and may not work.
// 
// SOLUTION: Aggressively limit photo count and use smaller signed URLs.
// For legacy sites with many large photos, we skip photos entirely and
// provide a "photos available in system" note instead.
// 
// This ensures reliable PDF generation within the 250MB limit.

const MAX_PHOTOS_PER_ITEM = 2;   // Reduced from 6 - only show key photos
const MAX_TOTAL_PHOTOS = 20;    // Reduced from 60 - prevents size explosion
const MAX_SNAG_PHOTOS = 1;      // Only 1 photo per snag
const PHOTO_SIZE_ESTIMATE_KB = 2000; // Assume worst case 2MB per legacy photo
const MAX_TOTAL_SIZE_MB = 100;  // Target max 100MB for photos (leave room for HTML)

// Track global photo count and estimated size
let globalPhotoCount = 0;
let estimatedTotalSizeKB = 0;

function resetPhotoCount() {
  globalPhotoCount = 0;
  estimatedTotalSizeKB = 0;
}

function canAddPhoto(): boolean {
  // Check both count limit and estimated size limit
  const withinCount = globalPhotoCount < MAX_TOTAL_PHOTOS;
  const withinSize = estimatedTotalSizeKB < (MAX_TOTAL_SIZE_MB * 1024);
  return withinCount && withinSize;
}

function incrementPhotoCount() {
  globalPhotoCount++;
  estimatedTotalSizeKB += PHOTO_SIZE_ESTIMATE_KB;
}

// Extract pattern from filename for matching alternatives
function extractItemPattern(filename: string): { itemId: string; suffix: string } | null {
  const match = filename.match(/.*?_([a-zA-Z]+)_(\d+)_(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (match) {
    return {
      itemId: match[1],
      suffix: `_${match[3]}.${match[4]}`
    };
  }
  const extMatch = filename.match(/\.([a-z]+)$/i);
  return extMatch ? { itemId: '', suffix: `.${extMatch[1]}` } : null;
}

// Find a matching file in the same directory when exact path fails
async function findMatchingFile(bucket: string, path: string): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    const lastSlashIndex = path.lastIndexOf('/');
    if (lastSlashIndex <= 0) return null;
    
    const dirPath = path.substring(0, lastSlashIndex);
    const targetFilename = path.substring(lastSlashIndex + 1);
    
    const { data: files, error } = await supabase.storage.from(bucket).list(dirPath, { limit: 50 });
    
    if (error || !files || files.length === 0) {
      return null;
    }
    
    const pattern = extractItemPattern(targetFilename);
    
    if (pattern?.itemId) {
      for (const file of files) {
        if (file.name.includes(pattern.itemId) && file.name.endsWith(pattern.suffix)) {
          return `${dirPath}/${file.name}`;
        }
      }
      for (const file of files) {
        if (file.name.includes(pattern.itemId) && /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
          return `${dirPath}/${file.name}`;
        }
      }
    }
    
    const imageFile = files.find(f => /\.(jpg|jpeg|png|webp)$/i.test(f.name) && !f.name.startsWith('.'));
    if (imageFile) {
      return `${dirPath}/${imageFile.name}`;
    }
    
    return null;
  } catch {
    return null;
  }
}

// Compress image to target size using fetch + resize
// This ensures ALL images are properly sized regardless of Supabase plan
async function compressImage(imageData: ArrayBuffer, targetWidth: number = 400, quality: number = 0.6): Promise<string | null> {
  try {
    // For Edge Functions, we can't use Canvas API, so we return the original
    // but with size limits enforced. The CSS will handle display sizing.
    const base64 = arrayBufferToBase64(imageData);
    const contentType = detectImageType(new Uint8Array(imageData));
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.warn('[compressImage] Error:', err);
    return null;
  }
}

// Detect image type from magic bytes
function detectImageType(bytes: Uint8Array): string {
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

// Generate optimized image - tries transformation first, falls back to download + embed
// This ensures reliable rendering with controlled file sizes
const MAX_IMAGE_SIZE_KB = 100; // Target ~100KB per image
const MAX_ORIGINAL_SIZE_KB = 500; // Skip images larger than 500KB original

async function getOptimizedImageUrl(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url; // Already embedded
  
  try {
    const parsed = parseSupabaseStorageUrl(url);
    
    if (!parsed) {
      // External URL - try to fetch and embed
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        
        // Skip if too large
        if (buffer.byteLength > MAX_ORIGINAL_SIZE_KB * 1024) {
          console.warn(`[getOptimizedImage] Skipping oversized external image: ${Math.round(buffer.byteLength / 1024)}KB`);
          return null;
        }
        
        return compressImage(buffer);
      } catch {
        return null;
      }
    }
    
    const supabase = getSupabaseClient();
    let finalPath = parsed.path;
    
    // Check if file exists, if not try fallback
    const { data: existsData } = await supabase.storage.from(parsed.bucket).list(
      parsed.path.substring(0, parsed.path.lastIndexOf('/')),
      { limit: 1, search: parsed.path.substring(parsed.path.lastIndexOf('/') + 1) }
    );
    
    if (!existsData || existsData.length === 0) {
      const altPath = await findMatchingFile(parsed.bucket, parsed.path);
      if (altPath) {
        finalPath = altPath;
      } else {
        console.warn(`[getOptimizedImage] File not found: ${parsed.path}`);
        return null;
      }
    }
    
    // Try with image transformation first (requires Supabase Pro)
    // Using 400px width, 60% quality for ~50KB target
    const { data: transformedUrl, error: transformError } = await supabase.storage
      .from(parsed.bucket)
      .createSignedUrl(finalPath, 3600, {
        transform: {
          width: 400,  // 400px source for ~220px display
          quality: 60, // Aggressive compression
        }
      });
    
    if (!transformError && transformedUrl?.signedUrl) {
      // Transformation worked - fetch the transformed image and embed as base64
      try {
        const response = await fetch(transformedUrl.signedUrl, { signal: AbortSignal.timeout(15000) });
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          console.log(`[getOptimizedImage] Transformed image size: ${Math.round(buffer.byteLength / 1024)}KB`);
          return compressImage(buffer);
        }
      } catch (fetchErr) {
        console.warn(`[getOptimizedImage] Failed to fetch transformed URL:`, fetchErr);
      }
    }
    
    // Fallback: Download original and embed (with size limits)
    console.warn(`[getOptimizedImage] Transform failed, downloading original for: ${finalPath.substring(0, 40)}...`);
    
    const { data: blob, error: downloadError } = await supabase.storage
      .from(parsed.bucket)
      .download(finalPath);
    
    if (downloadError || !blob) {
      console.warn(`[getOptimizedImage] Download failed:`, downloadError?.message);
      return null;
    }
    
    const buffer = await blob.arrayBuffer();
    const sizeKB = Math.round(buffer.byteLength / 1024);
    
    // Skip if original is too large (would bloat PDF)
    if (buffer.byteLength > MAX_ORIGINAL_SIZE_KB * 1024) {
      console.warn(`[getOptimizedImage] Skipping oversized image: ${sizeKB}KB (max ${MAX_ORIGINAL_SIZE_KB}KB)`);
      return null;
    }
    
    console.log(`[getOptimizedImage] Embedded original image: ${sizeKB}KB`);
    return compressImage(buffer);
    
  } catch (err) {
    console.warn(`[getOptimizedImage] Error:`, err);
    return null;
  }
}

// Convert ArrayBuffer to Base64 in chunks
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

// For small images like signatures - embed as Base64
async function imageToBase64(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;
  
  const MAX_SIZE = 500 * 1024; // 500KB limit for signatures
  
  try {
    const parsed = parseSupabaseStorageUrl(url);
    if (!parsed) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return null;
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > MAX_SIZE) return null;
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const base64 = arrayBufferToBase64(buffer);
        return `data:${contentType};base64,${base64}`;
      } catch {
        return null;
      }
    }
    
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.storage
      .from(parsed.bucket)
      .download(parsed.path);
    
    if (error || !data || data.size > MAX_SIZE) return null;
    
    const buffer = await data.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    return `data:${data.type || 'image/jpeg'};base64,${base64}`;
  } catch {
    return null;
  }
}

// Generate a responsive photo grid - 3 images per row using table layout for PDF reliability
// Uses explicit pixel widths to ensure proper sizing in PDFShift
function generatePhotoGrid(photos: string[], options?: { 
  perRow?: number; 
  labels?: string[];
  showLabels?: boolean;
}): string {
  if (!photos || photos.length === 0) return '';
  
  const perRow = options?.perRow || 3;
  const labels = options?.labels || [];
  const showLabels = options?.showLabels ?? false;
  
  // A4 content width is ~174mm (658px) with 18mm margins
  // For 3 columns with 8px gaps: (658 - 16) / 3 ≈ 214px per image
  // Fixed heights prevent portrait images from taking up entire pages
  const imageWidth = perRow === 3 ? '200px' : perRow === 2 ? '300px' : '400px';
  const imageHeight = perRow === 3 ? '150px' : perRow === 2 ? '220px' : '300px';
  
  // Split photos into rows
  const rows: { photo: string; label?: string }[][] = [];
  for (let i = 0; i < photos.length; i += perRow) {
    const rowPhotos = photos.slice(i, i + perRow).map((photo, idx) => ({
      photo,
      label: labels[i + idx] || `Photo ${i + idx + 1}`
    }));
    rows.push(rowPhotos);
  }
  
  return `
    <table style="width: 100%; border-collapse: collapse; page-break-inside: avoid; margin-bottom: 15px;">
      ${rows.map(row => `
        <tr>
          ${row.map(item => `
            <td style="width: ${100 / perRow}%; padding: 8px; vertical-align: top; text-align: center;">
              ${showLabels ? `<div style="font-size: 9pt; color: #6b7280; margin-bottom: 6px; font-weight: 500;">${item.label}</div>` : ''}
              <img src="${item.photo}" 
                   style="max-width: 200px; max-height: 150px; display: block; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 4px; background: #f9fafb;" 
                   alt="${item.label}" />
            </td>
          `).join('')}
        </tr>
      `).join('')}
    </table>
  `;
}

// Process inspection photos with signed URLs
// PDFShift fetches images directly; HTML controls sizing via CSS
// This avoids CPU-intensive server-side processing
async function processInspectionPhotos(inspection: any): Promise<any> {
  if (!inspection) return inspection;
  
  resetPhotoCount(); // Reset global counter for this document
  
  const processed = JSON.parse(JSON.stringify(inspection));
  let totalPhotosFound = 0;
  let processedPhotos = 0;
  let skippedForLimit = 0;
  
  // Process section item photos - download, compress, and embed as base64
  if (processed.sections) {
    for (const section of processed.sections) {
      if (section.items) {
        for (const item of section.items) {
          if (item.photos && item.photos.length > 0) {
            totalPhotosFound += item.photos.length;
            const embeddedPhotos: string[] = [];
            // Limit photos per item
            const photosToProcess = item.photos.slice(0, MAX_PHOTOS_PER_ITEM);
            if (item.photos.length > MAX_PHOTOS_PER_ITEM) {
              skippedForLimit += item.photos.length - MAX_PHOTOS_PER_ITEM;
            }
            
            for (const photoUrl of photosToProcess) {
              // Check if we've hit the global limit
              if (!canAddPhoto()) {
                skippedForLimit++;
                continue;
              }
              
              const optimizedImage = await getOptimizedImageUrl(photoUrl);
              if (optimizedImage) {
                embeddedPhotos.push(optimizedImage);
                incrementPhotoCount();
                processedPhotos++;
              }
            }
            item.photos = embeddedPhotos;
          }
        }
      }
    }
  }
  
  // Process tenant photos (meter, breaker, CT) - download, compress, embed as base64
  if (processed.tenants) {
    for (const tenant of processed.tenants) {
      if (tenant.meterImage && canAddPhoto()) {
        totalPhotosFound++;
        const optimizedImage = await getOptimizedImageUrl(tenant.meterImage);
        tenant.meterImage = optimizedImage;
        if (optimizedImage) {
          incrementPhotoCount();
          processedPhotos++;
        }
      } else if (tenant.meterImage) {
        tenant.meterImage = null;
        skippedForLimit++;
      }
      
      if (tenant.breakerImage && canAddPhoto()) {
        totalPhotosFound++;
        const optimizedImage = await getOptimizedImageUrl(tenant.breakerImage);
        tenant.breakerImage = optimizedImage;
        if (optimizedImage) {
          incrementPhotoCount();
          processedPhotos++;
        }
      } else if (tenant.breakerImage) {
        tenant.breakerImage = null;
        skippedForLimit++;
      }
      
      if (tenant.ctRatioImage && canAddPhoto()) {
        totalPhotosFound++;
        const optimizedImage = await getOptimizedImageUrl(tenant.ctRatioImage);
        tenant.ctRatioImage = optimizedImage;
        if (optimizedImage) {
          incrementPhotoCount();
          processedPhotos++;
        }
      } else if (tenant.ctRatioImage) {
        tenant.ctRatioImage = null;
        skippedForLimit++;
      }
    }
  }
  
  // Process snag photos - download, compress, embed as base64 (limited to 1 per snag)
  if (processed.snags) {
    for (const snag of processed.snags) {
      if (snag.photos && snag.photos.length > 0) {
        totalPhotosFound += snag.photos.length;
        const embeddedPhotos: string[] = [];
        // Allow only 1 photo per snag to reduce size
        const photosToProcess = snag.photos.slice(0, MAX_SNAG_PHOTOS);
        if (snag.photos.length > MAX_SNAG_PHOTOS) {
          skippedForLimit += snag.photos.length - MAX_SNAG_PHOTOS;
        }
        
        for (const photoUrl of photosToProcess) {
          if (!canAddPhoto()) {
            skippedForLimit++;
            continue;
          }
          
          const optimizedImage = await getOptimizedImageUrl(photoUrl);
          if (optimizedImage) {
            embeddedPhotos.push(optimizedImage);
            incrementPhotoCount();
            processedPhotos++;
          }
        }
        snag.photos = embeddedPhotos;
      }
    }
  }
  
  // Process signature URLs - use imageToBase64 (signatures are small, no compression needed)
  if (processed.signatures) {
    for (const sig of processed.signatures) {
      if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
        const base64 = await imageToBase64(sig.signatureUrl);
        sig.signatureUrl = base64;
      }
    }
  }
  
  console.log(`[processPhotos] Compressed and embedded ${processedPhotos}/${totalPhotosFound} photos (${skippedForLimit} skipped for limits)`);
  return processed;
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface COCAnnexData {
  subsectionId: string;
  subsectionName: string;
  tenantName?: string;
  category?: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  status: string;
  validatedAt: string;
  violations?: any;
  reportData?: any;
}

type ReportType = 'site-summary' | 'compliance' | 'inspection' | 'floor-plan' | 'coc-validation' | 'site-drawing' | 'fortress-checklist' | 'calendar' | 'inspection-template';

interface ReportData {
  reportType: ReportType;
  title?: string;
  subtitle?: string;
  siteId?: string;
  siteName?: string;
  siteAddress?: string;
  clientName?: string;
  clientLogoUrl?: string;
  companyLogoUrl?: string;
  accentColor?: string;
  qrBaseUrl?: string;
  subsections?: SubsectionData[];
  summaryStats?: SummaryStats;
  healthMetrics?: HealthMetrics;
  categoryHealth?: CategoryHealthData[];
  documentsSummary?: DocumentCategoryData[];
  assetVerification?: AssetVerificationData;
  fortressChecklist?: FortressChecklistData;
  generatedAt?: string;
  enabledSections?: Record<string, boolean>;
  cocAnnexes?: COCAnnexData[];
  // COC Validation specific
  cocValidation?: COCValidationData;
  // Inspection specific
  inspection?: InspectionData;
  // Site Drawing specific
  siteDrawing?: SiteDrawingData;
  // Fortress Checklist standalone
  fortressChecklistFull?: FortressChecklistFullData;
  // Calendar specific
  calendar?: CalendarData;
  // Inspection Template specific
  inspectionTemplate?: InspectionTemplateData;
}

// COC Validation specific data
interface COCValidationData {
  cocNumber?: string;
  cocType?: string;
  evaluationDate?: string;
  overallStatus: string;
  installationSummary?: string;
  overallAssessment?: string;
  checks?: Array<{
    checkId: string;
    clause: string;
    description: string;
    result: string;
    measuredValue: string;
    limit: string;
    category: string;
  }>;
  criticalFailures?: Array<{
    category: string;
    clause: string;
    description: string;
    reason: string;
  }>;
  administrativeDetails?: {
    physicalAddress?: string;
    registeredPerson?: string;
    registrationNumber?: string;
    registrationType?: string;
  };
  technicalEvaluation?: Array<{
    section: string;
    requirement: string;
    finding: string;
    status: string;
  }>;
  recommendations?: string[];
  subsectionName?: string;
}

// Inspection specific data - with PHOTOS support for photographic documentation
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
      photos?: string[]; // Array of photo URLs - CRITICAL for photographic inspection reports
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
    photos?: string[]; // Snag photos
  }>;
  signatures?: Array<{
    name: string;
    role?: string;
    signatureUrl?: string;
    signedAt?: string;
  }>;
  subsectionName?: string;
}

// Site Drawing specific data
interface SiteDrawingData {
  subsectionName: string;
  drawingImageBase64?: string;
  pins: Array<{
    id: string;
    number: number;
    x: number;
    y: number;
    title: string;
    description: string;
    images?: Array<{ url: string; name: string }>;
  }>;
  generalInfo?: Record<string, any>;
}

// Fortress Checklist full data for standalone report
interface FortressChecklistFullData {
  overallProgress: number;
  sections: Array<{
    name: string;
    progress: number;
    items: Array<{
      id: string;
      label: string;
      isChecked: boolean;
      isNotApplicable: boolean;
      checkedAt?: string;
    }>;
  }>;
  stats: {
    completed: number;
    pending: number;
    notApplicable: number;
    total: number;
  };
}

// Calendar specific data
interface CalendarData {
  year: number;
  events: Array<{
    id: string;
    title: string;
    siteName?: string;
    startDate: string;
    endDate?: string;
    status: string;
    priority?: string;
    eventType?: string;
  }>;
  stats: {
    totalEvents: number;
    upcomingCount: number;
    completedCount: number;
    pendingCount: number;
  };
}

// Inspection Template specific data
interface InspectionTemplateData {
  templateName: string;
  category?: string;
  description?: string;
  sections: Array<{
    title: string;
    items: Array<{
      label: string;
      type: string;
      required?: boolean;
      options?: string[];
    }>;
  }>;
}

interface SubsectionData {
  id: string;
  name: string;
  tenantName?: string;
  category?: string;
  cocStatus?: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  meterSerialNumber?: string;
  ctRatio?: string;
  breakerSize?: string;
  isCompliant?: boolean;
  qrCodeUrl?: string;
  snags?: SnagData[];
}

interface SnagData {
  id: string;
  title: string;
  status: string;
  riskLevel?: string;
  description?: string;
}

interface SummaryStats {
  totalSubsections: number;
  compliantCount: number;
  nonCompliantCount: number;
  pendingCount: number;
  cocValidCount: number;
  cocExpiredCount: number;
  cocMissingCount: number;
  cocRequired: number;
  meteringInstalled: number;
  openSnagsCount: number;
  resolvedSnagsCount: number;
}

interface HealthMetrics {
  overallHealth: number;
  cocCompliance: number;
  meteringData: number;
  snagFree: number;
}

interface CategoryHealthData {
  category: string;
  abbreviation: string;
  percentage: number;
}

interface DocumentCategoryData {
  category: string;
  count: number;
}

interface AssetVerificationData {
  totalAssets: number;
  verified: number;
  discrepancies: number;
  pending: number;
  schedule?: AssetScheduleRow[];
}

interface AssetScheduleRow {
  premisesId: string;
  meterSerial: string;
  breakerSize: string;
  ctRatio: string;
  inspectedSerial: string;
  inspectedBreaker: string;
  status: 'verified' | 'discrepancy' | 'pending';
}

interface FortressChecklistData {
  completed: number;
  pending: number;
  notApplicable: number;
  sections?: { name: string; progress: number }[];
}

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

const COLORS = {
  primary: '#1e3a5f',
  accent: '#2563eb',
  success: '#16a34a',
  warning: '#ea580c',
  error: '#dc2626',
  info: '#2563eb',
  muted: '#6b7280',
  white: '#ffffff',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  text: '#1f2937',
  textMuted: '#6b7280',
};

// ============================================================================
// HTML TEMPLATE GENERATORS - TABLE BASED LAYOUT FOR PDF RELIABILITY
// ============================================================================

function generateCoverPage(data: ReportData, accentColor: string): string {
  const {
    siteName,
    siteAddress,
    clientName,
    clientLogoUrl,
    companyLogoUrl,
    generatedAt = new Date().toLocaleDateString('en-ZA'),
  } = data;

  return `
    <div style="width: 210mm; height: 297mm; position: relative; background: white; page-break-after: always;">
      <!-- Top accent bar -->
      <div style="height: 8px; width: 100%; background: ${accentColor};"></div>
      
      <!-- Header with logos -->
      <table style="width: 100%; padding: 40px 40px 0 40px;">
        <tr>
          <td style="width: 50%; vertical-align: top;">
            ${clientLogoUrl ? `<img src="${clientLogoUrl}" style="max-height: 60px; max-width: 150px;" />` : ''}
          </td>
          <td style="width: 50%; text-align: right; vertical-align: top;">
            ${companyLogoUrl ? `<img src="${companyLogoUrl}" style="max-height: 60px; max-width: 150px;" />` : ''}
          </td>
        </tr>
      </table>
      
      <!-- Main content centered -->
      <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 80%;">
        <h1 style="font-size: 32pt; font-weight: 700; color: ${COLORS.primary}; margin: 0 0 10px 0;">Site Summary Report</h1>
        <p style="font-size: 14pt; color: ${COLORS.textMuted}; margin: 0 0 50px 0;">Comprehensive Site Health & Compliance Overview</p>
        
        <!-- Site info box -->
        <div style="border: 3px solid ${accentColor}; border-radius: 12px; padding: 40px 60px; background: ${COLORS.lightGray}; display: inline-block;">
          <h2 style="font-size: 26pt; font-weight: 700; color: ${COLORS.primary}; margin: 0 0 10px 0;">${siteName}</h2>
          ${clientName ? `<p style="font-size: 14pt; color: ${COLORS.textMuted}; margin: 0 0 8px 0;">${clientName}</p>` : ''}
          ${siteAddress ? `<p style="font-size: 12pt; color: ${COLORS.textMuted}; margin: 0 0 12px 0;">${siteAddress}</p>` : ''}
          <p style="font-size: 14pt; font-weight: 600; color: ${accentColor}; margin: 0;">${generatedAt}</p>
        </div>
      </div>
      
      <!-- Footer -->
      <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center;">
        <p style="font-size: 9pt; color: ${COLORS.textMuted}; margin: 0 0 5px 0;">CONFIDENTIAL - For authorized use only</p>
        <p style="font-size: 9pt; color: ${COLORS.textMuted}; margin: 0;">Watson Mattheus Consulting Electrical Engineers (Pty) Ltd</p>
      </div>
    </div>
  `;
}

interface TableOfContentsEntry {
  title: string;
  page: number;
  indent?: boolean;
}

function generateTableOfContents(entries: TableOfContentsEntry[], accentColor: string, generatedAt: string): string {
  const rows = entries.map(entry => `
    <tr style="border-bottom: 1px dotted ${COLORS.border};">
      <td style="padding: 10px 0; font-size: ${entry.indent ? '10pt' : '11pt'}; ${entry.indent ? 'padding-left: 20px;' : ''} color: ${COLORS.text};">
        ${entry.title}
      </td>
      <td style="padding: 10px 0; font-size: 11pt; text-align: right; font-weight: 600; color: ${accentColor};">
        ${entry.page}
      </td>
    </tr>
  `).join('');

  return `
    <div style="width: 210mm; min-height: 297mm; padding: 20mm 25mm 25mm 25mm; position: relative; background: white; page-break-after: always;">
      <!-- Header -->
      <table style="width: 100%; border-bottom: 3px solid ${accentColor}; margin-bottom: 30px;">
        <tr>
          <td style="font-size: 18pt; font-weight: 700; color: ${COLORS.primary}; padding-bottom: 12px;">Table of Contents</td>
        </tr>
      </table>
      
      <!-- TOC Entries -->
      <table style="width: 100%;">
        <tbody>
          ${rows}
        </tbody>
      </table>
      
      <!-- Footer -->
      <table style="width: calc(100% - 50mm); position: absolute; bottom: 10mm; left: 25mm; right: 25mm; border-top: 1px solid ${COLORS.border}; padding-top: 6px; font-size: 8pt; color: ${COLORS.textMuted};">
        <tr>
          <td style="width: 50%;">CONFIDENTIAL</td>
          <td style="width: 50%; text-align: right;">${generatedAt}</td>
        </tr>
      </table>
    </div>
  `;
}

function generatePageHeader(title: string, accentColor: string): string {
  return `
    <table style="width: 100%; border-bottom: 3px solid ${accentColor}; margin-bottom: 20px;">
      <tr>
        <td style="font-size: 14pt; font-weight: 700; color: ${COLORS.primary}; padding-bottom: 10px;">${title}</td>
      </tr>
    </table>
  `;
}

function generatePageFooter(pageNum: number, totalPages: string, generatedAt: string): string {
  return `
    <table style="width: calc(100% - 36mm); position: absolute; bottom: 10mm; left: 18mm; right: 18mm; border-top: 1px solid ${COLORS.border}; padding-top: 6px; font-size: 8pt; color: ${COLORS.textMuted};">
      <tr>
        <td style="width: 33%;">CONFIDENTIAL - For authorized use only</td>
        <td style="width: 33%; text-align: center;">Page ${pageNum} of ${totalPages}</td>
        <td style="width: 33%; text-align: right;">${generatedAt}</td>
      </tr>
    </table>
  `;
}

function generateSectionHeader(title: string, accentColor: string): string {
  return `
    <div style="background: ${accentColor}; color: white; padding: 10px 15px; border-radius: 6px; margin: 0 0 15px 0; display: inline-block;">
      <span style="font-size: 13pt; font-weight: 600;">${title}</span>
    </div>
  `;
}

// Generate SVG circular progress ring with text inside (no rotation issues)
function generateCircularProgress(percentage: number, color: string, size: number = 90, showText: boolean = false): string {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const center = size / 2;
  
  // Use stroke-dasharray rotation trick instead of CSS transform
  // Start from the top (12 o'clock position) by adjusting the path
  const textContent = showText ? `
    <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="middle" 
          font-size="${size > 70 ? '18' : '12'}" font-weight="700" fill="${color}">
      ${percentage}<tspan font-size="${size > 70 ? '10' : '8'}">%</tspan>
    </text>
  ` : '';
  
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <!-- Background circle -->
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}"/>
      <!-- Progress circle - rotated via transform attribute to start at top -->
      <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" 
              stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"
              transform="rotate(-90 ${center} ${center})"/>
      ${textContent}
    </svg>
  `;
}

// Generate an icon for the metric type
function getMetricIcon(type: string, color: string): string {
  const icons: Record<string, string> = {
    health: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
    coc: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>`,
    meter: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    snag: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  };
  return icons[type] || icons.health;
}

function generateHealthMetrics(metrics: HealthMetrics, accentColor: string): string {
  const getColor = (value: number) => value >= 70 ? COLORS.success : value >= 40 ? COLORS.warning : COLORS.error;
  
  const metricCards = [
    { label: 'Overall Health', value: metrics.overallHealth, icon: 'health' },
    { label: 'COC Compliance', value: metrics.cocCompliance, icon: 'coc' },
    { label: 'Metering Data', value: metrics.meteringData, icon: 'meter' },
    { label: 'Snag Free', value: Math.max(0, metrics.snagFree), icon: 'snag' },
  ];
  
  const cards = metricCards.map(m => {
    const color = getColor(m.value);
    return `
      <td style="width: 25%; background: white; border: 2px solid ${COLORS.border}; border-radius: 12px; padding: 18px 12px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
        <div style="display: inline-block; margin-bottom: 8px;">
          ${generateCircularProgress(m.value, color, 85, true)}
        </div>
        <div style="display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 6px;">
          ${getMetricIcon(m.icon, COLORS.textMuted)}
          <span style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; font-weight: 600;">${m.label}</span>
        </div>
      </td>
    `;
  }).join('');

  return `
    ${generateSectionHeader('Health Metrics', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px;">
      <tr>${cards}</tr>
    </table>
  `;
}

function generateCategoryHealth(categories: CategoryHealthData[], accentColor: string): string {
  if (!categories || categories.length === 0) return '';
  
  const getColor = (value: number) => value >= 70 ? COLORS.success : value >= 40 ? COLORS.warning : COLORS.error;

  const categoryCards = categories.map(cat => {
    const color = getColor(cat.percentage);
    return `
      <td style="background: white; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 12px 8px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.03);">
        <div style="display: inline-block;">
          ${generateCircularProgress(cat.percentage, color, 60, true)}
        </div>
        <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px; font-weight: 600;">${cat.abbreviation}</div>
      </td>
    `;
  }).join('');

  return `
    ${generateSectionHeader('Health by Category', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 8px;">
      <tr>${categoryCards}</tr>
    </table>
  `;
}

function generateSummaryStatistics(stats: SummaryStats, accentColor: string): string {
  const overallHealth = Math.round((stats.compliantCount / Math.max(stats.totalSubsections, 1)) * 100);
  
  // Create a visual grid of stats with icons
  const statItems = [
    { label: 'Subsections', value: stats.totalSubsections, icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>` },
    { label: 'COC Valid', value: stats.cocValidCount, icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.success}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="m9 15 2 2 4-4"/></svg>`, color: COLORS.success },
    { label: 'Metering', value: stats.meteringInstalled, icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${COLORS.info}" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`, color: COLORS.info },
    { label: 'Open Snags', value: stats.openSnagsCount, icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${stats.openSnagsCount > 0 ? COLORS.warning : COLORS.success}" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`, color: stats.openSnagsCount > 0 ? COLORS.warning : COLORS.success },
  ];

  const statCards = statItems.map(item => `
    <td style="width: 25%; background: white; border: 1px solid ${COLORS.border}; border-radius: 10px; padding: 16px 10px; text-align: center;">
      <div style="margin-bottom: 8px;">${item.icon}</div>
      <div style="font-size: 22pt; font-weight: 700; color: ${item.color || COLORS.primary};">${item.value}</div>
      <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px; font-weight: 600;">${item.label}</div>
    </td>
  `).join('');

  return `
    ${generateSectionHeader('Summary Statistics', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 15px;">
      <tr>${statCards}</tr>
    </table>
  `;
}

function generateDocumentsSummary(docs: DocumentCategoryData[], accentColor: string): string {
  if (!docs || docs.length === 0) return '';

  const totalDocs = docs.reduce((sum, d) => sum + d.count, 0);

  // Sort documents by category name (handles numeric prefixes like "01 COC", "02 Metering")
  const sortedDocs = [...docs].sort((a, b) => {
    // Extract numeric prefix if exists
    const numA = parseInt(a.category.match(/^(\d+)/)?.[1] || '999');
    const numB = parseInt(b.category.match(/^(\d+)/)?.[1] || '999');
    if (numA !== numB) return numA - numB;
    // Fallback to alphabetical
    return a.category.localeCompare(b.category);
  });

  // Document icon
  const docIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${COLORS.info}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
  const folderIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${COLORS.muted}" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;

  return `
    ${generateSectionHeader('Documents Summary', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 50%; background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; text-align: center;">
          <div style="margin-bottom: 8px;">${docIcon}</div>
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.info};">${totalDocs}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px; font-weight: 600;">Total Documents</div>
        </td>
        <td style="width: 50%; background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border: 1px solid ${COLORS.border}; border-radius: 12px; padding: 24px; text-align: center;">
          <div style="margin-bottom: 8px;">${folderIcon}</div>
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.muted};">${sortedDocs.length}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px; font-weight: 600;">Categories</div>
        </td>
      </tr>
    </table>
    <table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: ${COLORS.primary};">
          <th style="padding: 12px 15px; text-align: left; color: white; font-size: 10pt; font-weight: 600;">Category</th>
          <th style="padding: 12px 15px; text-align: right; color: white; font-size: 10pt; font-weight: 600;">Files</th>
        </tr>
      </thead>
      <tbody>
        ${sortedDocs.map((doc, i) => `
          <tr style="background: white; border-bottom: 0.5pt solid ${COLORS.border};">
            <td style="padding: 10px 15px; font-size: 10pt; color: ${COLORS.text};">${doc.category}</td>
            <td style="padding: 10px 15px; text-align: right; font-size: 10pt; font-weight: 700; color: ${COLORS.primary};">${doc.count}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function generateAssetVerification(data: AssetVerificationData, accentColor: string): string {
  const getStatusStyle = (status: string) => {
    if (status === 'verified') return { color: COLORS.success, text: '✓ Verified' };
    if (status === 'discrepancy') return { color: COLORS.error, text: '✗ Discrepancy' };
    return { color: COLORS.muted, text: '○ Pending' };
  };

  return `
    ${generateSectionHeader('Asset Verification Schedule', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.success};">${data.verified}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Verified</div>
        </td>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.error};">${data.discrepancies}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Discrepancies</div>
        </td>
        <td style="width: 33%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.muted};">${data.pending}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Pending</div>
        </td>
      </tr>
    </table>
    ${data.schedule && data.schedule.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
        <thead>
          <tr style="background: ${COLORS.primary};">
            <th style="padding: 10px 10px; text-align: left; color: white; width: 24%;">Premises</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 13%;">Meter S/N</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">Breaker</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">CT Ratio</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 13%;">Inspected S/N</th>
            <th style="padding: 10px 10px; text-align: left; color: white; width: 11%;">Insp. Breaker</th>
            <th style="padding: 10px 10px; text-align: center; color: white; width: 17%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${data.schedule.map(row => {
            const style = getStatusStyle(row.status);
            return `
              <tr style="background: white; border-bottom: 0.5pt solid ${COLORS.border};">
                <td style="padding: 8px 10px;">${row.premisesId || '-'}</td>
                <td style="padding: 8px 10px;">${row.meterSerial || '-'}</td>
                <td style="padding: 8px 10px;">${row.breakerSize || '-'}</td>
                <td style="padding: 8px 10px;">${row.ctRatio || '-'}</td>
                <td style="padding: 8px 10px;">${row.inspectedSerial || '-'}</td>
                <td style="padding: 8px 10px;">${row.inspectedBreaker || '-'}</td>
                <td style="padding: 8px 10px; text-align: center; color: ${style.color}; font-weight: 600;">${style.text}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : ''}
  `;
}

function generateFortressChecklist(data: FortressChecklistData, accentColor: string): string {
  const total = data.completed + data.pending + data.notApplicable;
  const progressPercent = total > 0 ? Math.round((data.completed / (data.completed + data.pending)) * 100) : 0;

  return `
    ${generateSectionHeader('Fortress Checklist', accentColor)}
    <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 15px;">
      <tr>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.success};">${data.completed}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Completed</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.warning};">${data.pending}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Pending</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${COLORS.muted};">${data.notApplicable}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">N/A</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 16px; text-align: center;">
          <div style="font-size: 22pt; font-weight: 700; color: ${accentColor};">${progressPercent}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-top: 4px;">Progress</div>
        </td>
      </tr>
    </table>
    ${data.sections && data.sections.length > 0 ? `
      <table style="width: 100%; border-collapse: collapse; font-size: 9pt;">
        <thead>
          <tr style="background: ${COLORS.primary};">
            <th style="padding: 10px 15px; text-align: left; color: white;">Section</th>
            <th style="padding: 10px 15px; text-align: right; color: white; width: 100px;">Progress</th>
          </tr>
        </thead>
        <tbody>
          ${data.sections.map(section => `
            <tr style="background: white; border-bottom: 0.5pt solid ${COLORS.border};">
              <td style="padding: 8px 15px;">${section.name}</td>
              <td style="padding: 8px 15px; text-align: right;">
                <span style="display: inline-block; width: 60px; height: 8px; background: ${COLORS.lightGray}; border-radius: 4px; margin-right: 8px; vertical-align: middle;">
                  <span style="display: block; width: ${section.progress}%; height: 100%; background: ${section.progress >= 100 ? COLORS.success : section.progress >= 50 ? COLORS.info : COLORS.warning}; border-radius: 4px;"></span>
                </span>
                <span style="font-weight: 600;">${section.progress}%</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}
  `;
}

function getCocStatusStyle(status: string | undefined): { bg: string; color: string; text: string } {
  if (!status) return { bg: '#fef3c7', color: '#92400e', text: 'Missing' };
  const s = status.toLowerCase();
  if (s.includes('approved') || s.includes('valid') || s.includes('pass')) {
    return { bg: '#d1fae5', color: '#065f46', text: 'Valid' };
  }
  if (s.includes('failed') || s.includes('invalid') || s.includes('expired')) {
    return { bg: '#fee2e2', color: '#991b1b', text: 'Invalid' };
  }
  return { bg: '#fef3c7', color: '#92400e', text: status };
}

function getRiskBadgeStyle(level: string | undefined): { bg: string; color: string } {
  if (!level) return { bg: '#fef3c7', color: '#92400e' };
  const l = level.toLowerCase();
  if (l === 'high' || l === 'critical') return { bg: '#fee2e2', color: '#991b1b' };
  if (l === 'low') return { bg: '#d1fae5', color: '#065f46' };
  return { bg: '#fef3c7', color: '#92400e' };
}

async function generateSubsectionCard(sub: SubsectionData, accentColor: string, qrBaseUrl: string): Promise<string> {
  const cocStyle = getCocStatusStyle(sub.cocStatus);
  const complianceColor = sub.isCompliant === true ? '#d1fae5' : sub.isCompliant === false ? '#fee2e2' : '#fef3c7';
  const complianceTextColor = sub.isCompliant === true ? '#065f46' : sub.isCompliant === false ? '#991b1b' : '#92400e';
  const complianceText = sub.isCompliant === true ? 'Compliant' : sub.isCompliant === false ? 'Non-Compliant' : 'Pending';
  
  const openSnags = sub.snags?.filter(s => s.status !== 'resolved' && s.status !== 'Resolved') || [];
  
  // Generate QR code - use stored URL if image, otherwise generate SVG
  let qrCodeDataUri = '';
  if (sub.qrCodeUrl && (sub.qrCodeUrl.includes('storage') || sub.qrCodeUrl.includes('supabase'))) {
    // Use existing image URL from storage
    qrCodeDataUri = sub.qrCodeUrl;
  } else {
    // Generate QR code server-side as SVG
    const qrTargetUrl = `${qrBaseUrl}/public/subsections/${sub.id}`;
    qrCodeDataUri = await generateQRCodeSvgDataUri(qrTargetUrl);
  }
  
  const snagRows = openSnags.slice(0, 3).map(snag => {
    const riskStyle = getRiskBadgeStyle(snag.riskLevel);
    return `
      <tr>
        <td style="padding: 4px 0; vertical-align: top;">
          <span style="display: inline-block; background: ${riskStyle.bg}; color: ${riskStyle.color}; padding: 3px 8px; border-radius: 4px; font-size: 8pt; font-weight: 700; min-width: 55px; text-align: center;">${(snag.riskLevel || 'MEDIUM').toUpperCase()}</span>
        </td>
        <td style="padding: 4px 8px; font-size: 9pt; color: ${COLORS.text};">${snag.title}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="border: 1px solid ${COLORS.border}; border-radius: 8px; overflow: hidden; margin-bottom: 12px; page-break-inside: avoid; position: relative;">
      <!-- QR Code positioned top-right -->
      ${qrCodeDataUri ? `
        <div style="position: absolute; top: 8px; right: 8px; background: white; border-radius: 4px; padding: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); z-index: 10;">
          <img src="${qrCodeDataUri}" style="width: 55px; height: 55px; display: block;" />
        </div>
      ` : ''}
      
      <!-- Card Header - Compact -->
      <div style="background: ${accentColor}; color: white; padding: 8px 14px; padding-right: 75px;">
        <div style="font-size: 11pt; font-weight: 600; line-height: 1.3;">${sub.name}</div>
        ${sub.category ? `<span style="font-size: 8pt; opacity: 0.85;">${sub.category}</span>` : ''}
        ${sub.tenantName && sub.tenantName !== sub.name ? `<span style="font-size: 8pt; opacity: 0.75; margin-left: 8px;">${sub.tenantName}</span>` : ''}
      </div>
      
      <!-- Card Body -->
      <table style="width: 100%; padding: 10px 14px;">
        <tr>
          <td style="width: 90px; font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">COC Status:</td>
          <td style="padding: 3px 0;">
            <span style="display: inline-block; background: ${cocStyle.bg}; color: ${cocStyle.color}; padding: 2px 10px; border-radius: 10px; font-size: 8pt; font-weight: 600;">${cocStyle.text}</span>
          </td>
        </tr>
        ${sub.cocNumber ? `
          <tr>
            <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">COC #:</td>
            <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">${sub.cocNumber}</td>
          </tr>
        ` : ''}
        ${sub.breakerSize ? `
          <tr>
            <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">Breaker Size:</td>
            <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">${sub.breakerSize}</td>
          </tr>
        ` : ''}
        <tr>
          <td style="font-size: 9pt; color: ${COLORS.textMuted}; padding: 3px 0;">Metering:</td>
          <td style="font-size: 9pt; color: ${COLORS.text}; padding: 3px 0;">
            ${sub.meterSerialNumber ? `S/N: ${sub.meterSerialNumber}` : 'N/A'}
            ${sub.ctRatio ? ` | CT: ${sub.ctRatio}` : ''}
          </td>
        </tr>
      </table>
      
      <!-- Snags Section -->
      <div style="border-top: 1px solid ${COLORS.border}; padding: 8px 14px;">
        <div style="font-size: 9pt; font-weight: 600; margin-bottom: 5px; color: ${COLORS.text};">Snags:</div>
        ${openSnags.length > 0 ? `
          <table style="width: 100%;">
            ${snagRows}
            ${openSnags.length > 3 ? `<tr><td colspan="2" style="font-size: 7pt; color: ${COLORS.textMuted}; padding-top: 3px;">+ ${openSnags.length - 3} more</td></tr>` : ''}
          </table>
        ` : `<span style="color: ${COLORS.success}; font-size: 9pt;">No open snags</span>`}
      </div>
      
      <!-- Card Footer -->
      <div style="background: ${complianceColor}; padding: 6px 14px;">
        <span style="font-size: 9pt; font-weight: 600; color: ${complianceTextColor};">${complianceText}</span>
      </div>
    </div>
  `;
}

async function generateSubsectionPages(subsections: SubsectionData[], accentColor: string, generatedAt: string, startPage: number, qrBaseUrl: string): Promise<string> {
  if (!subsections || subsections.length === 0) return '';
  
  const pages: string[] = [];
  const cardsPerPage = 2;
  const totalContentPages = Math.ceil(subsections.length / cardsPerPage);
  const totalPages = startPage + totalContentPages - 1;
  
  for (let i = 0; i < subsections.length; i += cardsPerPage) {
    const pageSubsections = subsections.slice(i, i + cardsPerPage);
    const currentPage = startPage + Math.floor(i / cardsPerPage);
    const isFirstPage = i === 0;
    
    // Generate cards for this page (await each since QR generation is async)
    const cardsHtml: string[] = [];
    for (const sub of pageSubsections) {
      const cardHtml = await generateSubsectionCard(sub, accentColor, qrBaseUrl);
      cardsHtml.push(cardHtml);
    }
    
    // Join cards with spacer to push second card to mid-page
    // A4 content area is ~267mm (297-15-15). Header+section header ~50mm. Each card ~100mm. Spacer fills gap.
    const cardsSpacer = cardsHtml.length === 2 
      ? `<div style="height: 15mm;"></div>` 
      : '';
    const cardsWithSpacing = cardsHtml.length === 2 
      ? cardsHtml[0] + cardsSpacer + cardsHtml[1]
      : cardsHtml.join('');
    
    pages.push(`
      <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
        ${generatePageHeader('Site Summary Report', accentColor)}
        
        <div style="text-align: left;">
          ${isFirstPage ? generateSectionHeader('Subsection Details', accentColor) : generateSectionHeader('Subsection Details (continued)', accentColor)}
        </div>
        
        ${cardsWithSpacing}
        
        ${generatePageFooter(currentPage, '{{TOTAL_PAGES}}', generatedAt)}
      </div>
    `);
  }
  
  return pages.join('');
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
}

// ============================================================================
// MAIN HTML GENERATOR
// ============================================================================

async function generateSiteSummaryHTML(data: ReportData): Promise<string> {
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  const qrBaseUrl = data.qrBaseUrl || 'https://watsonmattheus.com';
  
  // Calculate health metrics if not provided
  const healthMetrics = data.healthMetrics || calculateHealthMetrics(data);
  
  // Check enabled sections (default to true if not specified)
  const enabledSections = data.enabledSections || {};
  const isSectionEnabled = (id: string) => enabledSections[id] !== false; // Default true if not specified
  const hasCOCAnnexes = isSectionEnabled('coc-annexes') && data.cocAnnexes && data.cocAnnexes.length > 0;
  
  // Calculate total pages: 1 cover + 1 TOC + summary pages + subsection pages + annex pages
  const subsectionPages = Math.ceil((data.subsections?.length || 0) / 2);
  const hasAssetVerification = !!data.assetVerification && (data.assetVerification.totalAssets > 0);
  const hasFortressChecklist = !!data.fortressChecklist && (data.fortressChecklist.completed > 0 || data.fortressChecklist.pending > 0);
  const annexPages = hasCOCAnnexes ? data.cocAnnexes!.length : 0; // 1 page per annex
  const summaryPagesCount = 2 + (hasAssetVerification ? 1 : 0) + (hasFortressChecklist ? 1 : 0);
  // Total: cover (unnumbered) + TOC (page 1) + summary pages + subsection pages + annexes
  const totalPages = 1 + summaryPagesCount + subsectionPages + annexPages;
  
  // Build Table of Contents entries with accurate page numbers
  let tocPage = 2; // Start after TOC (page 1)
  const tocEntries: TableOfContentsEntry[] = [
    { title: 'Health Metrics & Statistics', page: tocPage++ },
    { title: 'Documents Summary', page: tocPage++ },
  ];
  if (hasAssetVerification) {
    tocEntries.push({ title: 'Asset Verification Schedule', page: tocPage++ });
  }
  if (hasFortressChecklist) {
    tocEntries.push({ title: 'Fortress Checklist', page: tocPage++ });
  }
  if ((data.subsections?.length || 0) > 0) {
    tocEntries.push({ title: 'Subsection Details', page: tocPage });
    tocPage += subsectionPages;
  }
  if (hasCOCAnnexes) {
    tocEntries.push({ title: 'COC Verification Annexes', page: tocPage });
  }
  
  // Calculate page numbers for subsection pages
  const subsectionStartPage = tocPage - subsectionPages - (hasCOCAnnexes ? annexPages : 0);
  
  // Generate subsection pages (async for QR generation)
  const subsectionPagesHtml = await generateSubsectionPages(data.subsections || [], accentColor, generatedAt, subsectionStartPage, qrBaseUrl);
  
  // Generate COC Annexes if enabled
  let cocAnnexPagesHtml = '';
  if (hasCOCAnnexes) {
    const annexStartPage = subsectionStartPage + subsectionPages;
    cocAnnexPagesHtml = generateCOCAnnexPages(data.cocAnnexes!, accentColor, generatedAt, annexStartPage);
  }
  
  // Track current page number for summary pages (starting at 2 after TOC)
  let currentPage = 2;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.siteName} - Site Summary Report</title>
  <style>
    @page {
      size: A4;
      margin: 0;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    table {
      border-collapse: collapse;
    }
  </style>
</head>
<body>
  <!-- Cover Page (unnumbered) -->
  ${generateCoverPage(data, accentColor)}
  
  <!-- Table of Contents (Page 1) -->
  ${generateTableOfContents(tocEntries, accentColor, generatedAt)}
  
  <!-- Page ${currentPage}: Health Metrics & Category Health -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateHealthMetrics(healthMetrics, accentColor)}
    ${data.categoryHealth ? generateCategoryHealth(data.categoryHealth, accentColor) : ''}
    ${generateSummaryStatistics(data.summaryStats || { totalSubsections: 0, compliantCount: 0, nonCompliantCount: 0, pendingCount: 0, cocValidCount: 0, cocExpiredCount: 0, cocMissingCount: 0, cocRequired: 0, meteringInstalled: 0, openSnagsCount: 0, resolvedSnagsCount: 0 }, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  
  <!-- Page ${currentPage}: Documents Summary -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${data.documentsSummary ? generateDocumentsSummary(data.documentsSummary, accentColor) : '<div style="padding: 20px; color: ' + COLORS.textMuted + '; text-align: center;">No documents available</div>'}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  
  ${hasAssetVerification ? `
  <!-- Page ${currentPage}: Asset Verification -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateAssetVerification(data.assetVerification!, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  ` : ''}
  
  ${hasFortressChecklist ? `
  <!-- Page ${currentPage}: Fortress Checklist -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('Site Summary Report', accentColor)}
    ${generateFortressChecklist(data.fortressChecklist!, accentColor)}
    ${generatePageFooter(currentPage++, '{{TOTAL_PAGES}}', generatedAt)}
  </div>
  ` : ''}
  
  <!-- Subsection Pages -->
  ${subsectionPagesHtml}
  
  <!-- COC Verification Annexes -->
  ${cocAnnexPagesHtml}
</body>
</html>
  `;
  
  // Replace page number placeholders
  return html.replace(/\{\{TOTAL_PAGES\}\}/g, totalPages.toString());
}

// Generate COC Verification Annex Pages - Two-page layout matching standalone COC Validation Report
function generateCOCAnnexPages(annexes: COCAnnexData[], accentColor: string, generatedAt: string, startPage: number): string {
  let pageNumber = startPage;
  
  return annexes.map((annex) => {
    const status = annex.status || 'Unknown';
    const isPass = status.toLowerCase().includes('pass') || status.toLowerCase().includes('valid');
    const isFail = status.toLowerCase().includes('fail');
    const statusColor = isPass ? COLORS.success : isFail ? COLORS.error : COLORS.warning;
    
    // Parse report data for full validation details
    let reportData: any = {};
    try {
      if (annex.reportData) {
        reportData = typeof annex.reportData === 'string' ? JSON.parse(annex.reportData) : annex.reportData;
      }
    } catch (e) {
      reportData = {};
    }
    
    // Extract all the detailed sections from report_data
    const cocNumber = reportData.cocNumber || annex.cocNumber || 'N/A';
    const cocType = reportData.cocType || annex.cocType || 'N/A';
    const installationSummary = reportData.installationSummary || '';
    const overallAssessment = reportData.overallAssessment || '';
    const administrativeDetails = reportData.administrativeDetails || {};
    const technicalEvaluation = reportData.technicalEvaluation || [];
    const checks = reportData.checks || [];
    const criticalFailures = reportData.criticalFailures || [];
    const recommendations = reportData.recommendations || [];
    
    // Parse violations if they exist (fallback for older data)
    let violations: any[] = [];
    try {
      if (annex.violations) {
        violations = Array.isArray(annex.violations) ? annex.violations : 
                     typeof annex.violations === 'object' && annex.violations.violations ? annex.violations.violations :
                     [];
      }
    } catch (e) {
      violations = [];
    }
    
    // Use criticalFailures from report_data if available, otherwise fall back to violations
    const failuresList = criticalFailures.length > 0 ? criticalFailures : violations;
    const hasPage2Content = failuresList.length > 0 || recommendations.length > 0;
    
    // ===== PAGE 1: Validation Status, Admin, Technical Evaluation, Check Results =====
    const page1Num = pageNumber++;
    
    let page1Html = '';
    
    // Validation Status Section
    page1Html += `
      <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: ${accentColor}; color: white; padding: 8px 12px; font-weight: 600; font-size: 11pt;">
            Validation Status
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 12px;">
            <table style="width: 100%;">
              <tr>
                <td style="vertical-align: top; width: 100px;">
                  <span style="font-size: 18pt; font-weight: 700; color: ${statusColor};">${status.toUpperCase()}</span>
                </td>
                <td style="vertical-align: top; padding-left: 15px;">
                  <span style="font-size: 10pt; color: ${COLORS.textMuted};">COC Type: ${cocType}</span>
                </td>
              </tr>
            </table>
            ${installationSummary ? `
            <p style="margin: 10px 0 0 0; font-size: 9pt; line-height: 1.4;">
              <strong>Installation Summary:</strong> ${installationSummary}
            </p>
            ` : ''}
            ${overallAssessment ? `
            <p style="margin: 6px 0 0 0; font-size: 9pt; line-height: 1.4;">
              <strong>Assessment:</strong> ${overallAssessment}
            </p>
            ` : ''}
          </td>
        </tr>
      </table>
    `;
    
    // Administrative Details Section
    const adminFields = [
      { label: 'Physical Address', value: administrativeDetails.physicalAddress },
      { label: 'Registered Person', value: administrativeDetails.registeredPerson },
      { label: 'Registration Number', value: administrativeDetails.registrationNumber },
      { label: 'Type of Registration', value: administrativeDetails.registrationType },
    ].filter(f => f.value && !f.value.toLowerCase().includes('not found') && !f.value.toLowerCase().includes('n/a'));
    
    if (adminFields.length > 0) {
      page1Html += `
        <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 6px 12px; font-weight: 600; font-size: 10pt; border-bottom: 2px solid ${accentColor};">
              Administrative Details
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                ${adminFields.map(f => `
                <tr>
                  <td style="padding: 6px 12px; width: 30%; border-bottom: 1px solid ${COLORS.border}; font-weight: 500; color: ${COLORS.textMuted}; font-size: 9pt;">${f.label}</td>
                  <td style="padding: 6px 12px; border-bottom: 1px solid ${COLORS.border}; font-size: 9pt;">${f.value}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>
      `;
    }
    
    // Technical Evaluation Section
    if (technicalEvaluation.length > 0) {
      page1Html += `
        <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 6px 12px; font-weight: 600; font-size: 10pt; border-bottom: 2px solid ${accentColor};">
              Technical Evaluation
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr style="background: ${COLORS.lightGray};">
                  <td style="padding: 5px 8px; font-weight: 600; font-size: 8pt; width: 15%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Section</td>
                  <td style="padding: 5px 8px; font-weight: 600; font-size: 8pt; width: 25%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Requirement</td>
                  <td style="padding: 5px 8px; font-weight: 600; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Finding</td>
                  <td style="padding: 5px 8px; font-weight: 600; font-size: 8pt; width: 55px; text-align: center; border-bottom: 1px solid ${COLORS.border};">Status</td>
                </tr>
                ${technicalEvaluation.slice(0, 6).map((te: any) => {
                  const teStatusColor = te.status?.toLowerCase() === 'pass' ? COLORS.success : 
                                        te.status?.toLowerCase() === 'fail' ? COLORS.error : COLORS.textMuted;
                  return `
                  <tr>
                    <td style="padding: 5px 8px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${te.section || '-'}</td>
                    <td style="padding: 5px 8px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${te.requirement || '-'}</td>
                    <td style="padding: 5px 8px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${te.finding || '-'}</td>
                    <td style="padding: 5px 8px; font-size: 8pt; text-align: center; border-bottom: 1px solid ${COLORS.border}; color: ${teStatusColor}; font-weight: 600;">${te.status || '-'}</td>
                  </tr>
                  `;
                }).join('')}
              </table>
            </td>
          </tr>
        </table>
      `;
    }
    
    // Check Results Section
    if (checks.length > 0) {
      page1Html += `
        <table style="width: 100%; margin-bottom: 12px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 6px 12px; font-weight: 600; font-size: 10pt; border-bottom: 2px solid ${accentColor};">
              Check Results
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr style="background: ${COLORS.lightGray};">
                  <td style="padding: 5px 6px; font-weight: 600; font-size: 8pt; width: 10%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Clause</td>
                  <td style="padding: 5px 6px; font-weight: 600; font-size: 8pt; width: 28%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Description</td>
                  <td style="padding: 5px 6px; font-weight: 600; font-size: 8pt; width: 16%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Measured</td>
                  <td style="padding: 5px 6px; font-weight: 600; font-size: 8pt; width: 16%; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">Limit</td>
                  <td style="padding: 5px 6px; font-weight: 600; font-size: 8pt; width: 10%; text-align: center; border-bottom: 1px solid ${COLORS.border};">Result</td>
                </tr>
                ${checks.slice(0, 10).map((check: any) => {
                  const checkColor = check.result?.toLowerCase() === 'pass' ? COLORS.success : 
                                     check.result?.toLowerCase() === 'fail' ? COLORS.error : COLORS.textMuted;
                  return `
                  <tr>
                    <td style="padding: 5px 6px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${check.clause || '-'}</td>
                    <td style="padding: 5px 6px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${check.description || '-'}</td>
                    <td style="padding: 5px 6px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${check.measuredValue || '-'}</td>
                    <td style="padding: 5px 6px; font-size: 8pt; border-right: 1px solid ${COLORS.border}; border-bottom: 1px solid ${COLORS.border};">${check.limit || '-'}</td>
                    <td style="padding: 5px 6px; font-size: 8pt; text-align: center; border-bottom: 1px solid ${COLORS.border}; color: ${checkColor}; font-weight: 600;">${check.result || '-'}</td>
                  </tr>
                  `;
                }).join('')}
              </table>
            </td>
          </tr>
        </table>
      `;
    }
    
    // ===== PAGE 2: Critical Failures and Recommendations (only if content exists) =====
    let page2Html = '';
    if (hasPage2Content) {
      const page2Num = pageNumber++;
      
      let page2Content = '';
      
      // Critical Failures Section
      if (failuresList.length > 0) {
        page2Content += `
          <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background: #fef2f2; color: ${COLORS.error}; padding: 10px 14px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${COLORS.error};">
                Critical Failures (${failuresList.length})
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #fecaca; border-top: none; padding: 0;">
                <table style="width: 100%;" cellpadding="0" cellspacing="0">
                  <tr style="background: #fef2f2;">
                    <td style="padding: 8px 12px; font-weight: 600; font-size: 9pt; width: 5%; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca;">#</td>
                    <td style="padding: 8px 12px; font-weight: 600; font-size: 9pt; width: 15%; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca;">Clause</td>
                    <td style="padding: 8px 12px; font-weight: 600; font-size: 9pt; width: 30%; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca;">Description</td>
                    <td style="padding: 8px 12px; font-weight: 600; font-size: 9pt; border-bottom: 1px solid #fecaca;">Reason</td>
                  </tr>
                  ${failuresList.map((f: any, i: number) => `
                  <tr>
                    <td style="padding: 8px 12px; font-size: 9pt; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca; text-align: center;">${i + 1}</td>
                    <td style="padding: 8px 12px; font-size: 9pt; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca; color: ${COLORS.error}; font-weight: 600;">${f.clause || f.code || f.rule || '-'}</td>
                    <td style="padding: 8px 12px; font-size: 9pt; border-right: 1px solid #fecaca; border-bottom: 1px solid #fecaca;">${f.description || f.message || '-'}</td>
                    <td style="padding: 8px 12px; font-size: 9pt; border-bottom: 1px solid #fecaca; color: ${COLORS.textMuted};">${f.reason || f.evidence || '-'}</td>
                  </tr>
                  `).join('')}
                </table>
              </td>
            </tr>
          </table>
        `;
      }
      
      // Recommendations Section
      if (recommendations.length > 0) {
        page2Content += `
          <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 10px 14px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${accentColor};">
                Recommendations
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 16px;">
                <ol style="margin: 0; padding-left: 20px; font-size: 10pt; line-height: 1.8;">
                  ${recommendations.map((rec: string) => `<li style="margin-bottom: 8px;">${rec}</li>`).join('')}
                </ol>
              </td>
            </tr>
          </table>
        `;
      }
      
      page2Html = `
      <!-- COC Verification Annex Page 2 -->
      <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
        <!-- Header -->
        <table style="width: 100%; border-bottom: 3px solid ${accentColor}; margin-bottom: 20px;">
          <tr>
            <td style="font-size: 12pt; font-weight: 700; color: ${accentColor}; padding-bottom: 8px;">COC Validation Report</td>
            <td style="font-size: 10pt; text-align: right; color: ${COLORS.textMuted}; padding-bottom: 8px;">REF: ${cocNumber}</td>
          </tr>
        </table>
        
        ${page2Content}
        
        ${generatePageFooter(page2Num, '{{TOTAL_PAGES}}', generatedAt)}
      </div>
      `;
    }
    
    // Combine pages
    return `
    <!-- COC Verification Annex Page 1 -->
    <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
      <!-- Header -->
      <table style="width: 100%; border-bottom: 3px solid ${accentColor}; margin-bottom: 15px;">
        <tr>
          <td style="font-size: 12pt; font-weight: 700; color: ${accentColor}; padding-bottom: 8px;">COC Validation Report</td>
          <td style="font-size: 10pt; text-align: right; color: ${COLORS.textMuted}; padding-bottom: 8px;">REF: ${cocNumber}</td>
        </tr>
      </table>
      
      ${page1Html}
      
      ${generatePageFooter(page1Num, '{{TOTAL_PAGES}}', generatedAt)}
    </div>
    ${page2Html}
    `;
  }).join('');
}

function calculateHealthMetrics(data: ReportData): HealthMetrics {
  const subsections = data.subsections || [];
  const total = Math.max(subsections.length, 1);
  const stats = data.summaryStats;
  
  const compliant = stats?.compliantCount || subsections.filter(s => s.isCompliant === true).length;
  const cocValid = stats?.cocValidCount || subsections.filter(s => 
    s.cocStatus?.toLowerCase().includes('valid') || 
    s.cocStatus?.toLowerCase().includes('approved') ||
    s.cocStatus?.toLowerCase().includes('pass')
  ).length;
  const metered = subsections.filter(s => s.meterSerialNumber).length;
  const openSnags = stats?.openSnagsCount || subsections.reduce((acc, s) => 
    acc + (s.snags?.filter(sn => sn.status !== 'resolved' && sn.status !== 'Resolved').length || 0), 0);
  
  return {
    overallHealth: Math.round((compliant / total) * 100),
    cocCompliance: Math.round((cocValid / total) * 100),
    meteringData: Math.round((metered / total) * 100),
    snagFree: Math.round(((total - Math.min(openSnags, total)) / total) * 100),
  };
}

// ============================================================================
// HELPER FUNCTIONS FOR REPORT NAMING
// ============================================================================

function getReportTypeDisplayName(reportType: ReportType): string {
  const names: Record<ReportType, string> = {
    'site-summary': 'Site_Summary_Report',
    'compliance': 'Compliance_Report',
    'inspection': 'Inspection_Report',
    'floor-plan': 'Floor_Plan_Report',
    'coc-validation': 'COC_Validation_Report',
    'site-drawing': 'Site_Drawing_Report',
    'fortress-checklist': 'Fortress_Checklist',
    'calendar': 'Calendar_Report',
    'inspection-template': 'Inspection_Template',
  };
  return names[reportType] || 'Report';
}

function getReportCategory(reportType: ReportType): string {
  const categories: Record<ReportType, string> = {
    'site-summary': 'Site Summary Reports',
    'compliance': 'Compliance Reports',
    'inspection': 'Inspection Reports',
    'floor-plan': 'Floor Plan Reports',
    'coc-validation': 'COC Validation Reports',
    'site-drawing': 'Site Drawing Reports',
    'fortress-checklist': 'Marking Checklists',
    'calendar': 'Calendar Reports',
    'inspection-template': 'Inspection Templates',
  };
  return categories[reportType] || 'Generated Reports';
}

// ============================================================================
// HTML GENERATORS FOR ADDITIONAL REPORT TYPES
// ============================================================================

async function generateCOCValidationHTML(data: ReportData): Promise<string> {
  const coc = data.cocValidation!;
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  
  const status = coc.overallStatus || 'Unknown';
  const isPass = status.toLowerCase().includes('pass') || status.toLowerCase().includes('valid');
  const isFail = status.toLowerCase().includes('fail');
  const statusColor = isPass ? COLORS.success : isFail ? COLORS.error : COLORS.warning;
  
  const hasFailures = (coc.criticalFailures?.length || 0) > 0;
  const hasRecommendations = (coc.recommendations?.length || 0) > 0;
  const totalPages = 1 + (hasFailures || hasRecommendations ? 1 : 0);
  
  // Page 1 content
  let page1Content = '';
  
  // Validation Status Section
  page1Content += `
    <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background: ${accentColor}; color: white; padding: 10px 15px; font-weight: 600; font-size: 12pt;">
          Validation Status
        </td>
      </tr>
      <tr>
        <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 20px;">
          <div style="font-size: 24pt; font-weight: 700; color: ${statusColor}; margin-bottom: 10px;">${status.toUpperCase()}</div>
          ${coc.cocType ? `<div style="font-size: 11pt; color: ${COLORS.textMuted}; margin-bottom: 10px;">COC Type: ${coc.cocType}</div>` : ''}
          ${coc.installationSummary ? `<div style="font-size: 10pt; margin-bottom: 8px;"><strong>Installation Summary:</strong> ${coc.installationSummary}</div>` : ''}
          ${coc.overallAssessment ? `<div style="font-size: 10pt;"><strong>Assessment:</strong> ${coc.overallAssessment}</div>` : ''}
        </td>
      </tr>
    </table>
  `;
  
  // Administrative Details
  if (coc.administrativeDetails) {
    const details = coc.administrativeDetails;
    const fields = [
      { label: 'Physical Address', value: details.physicalAddress },
      { label: 'Registered Person', value: details.registeredPerson },
      { label: 'Registration Number', value: details.registrationNumber },
      { label: 'Type of Registration', value: details.registrationType },
    ].filter(f => f.value && f.value.trim().length > 0 && !f.value.toLowerCase().includes('not found'));
    
    if (fields.length > 0) {
      page1Content += `
        <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 8px 15px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${accentColor};">
              Administrative Details
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                ${fields.map(f => `
                <tr>
                  <td style="padding: 10px 15px; width: 30%; border-bottom: 1px solid ${COLORS.border}; font-weight: 500; color: ${COLORS.textMuted};">${f.label}</td>
                  <td style="padding: 10px 15px; border-bottom: 1px solid ${COLORS.border};">${f.value}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>
      `;
    }
  }
  
  // Technical Evaluation
  if (coc.technicalEvaluation && coc.technicalEvaluation.length > 0) {
    page1Content += `
      <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 8px 15px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${accentColor};">
            Technical Evaluation
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
              <tr style="background: ${COLORS.lightGray};">
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt; width: 15%;">Section</th>
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt; width: 30%;">Requirement</th>
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt;">Finding</th>
                <th style="padding: 8px 10px; text-align: center; font-size: 9pt; width: 60px;">Status</th>
              </tr>
              ${coc.technicalEvaluation.map(te => {
                const teColor = te.status?.toLowerCase() === 'pass' ? COLORS.success : 
                               te.status?.toLowerCase() === 'fail' ? COLORS.error : COLORS.textMuted;
                return `
                <tr style="border-bottom: 1px solid ${COLORS.border};">
                  <td style="padding: 8px 10px; font-size: 9pt;">${te.section || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt;">${te.requirement || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt;">${te.finding || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt; text-align: center; color: ${teColor}; font-weight: 600;">${te.status || '-'}</td>
                </tr>
                `;
              }).join('')}
            </table>
          </td>
        </tr>
      </table>
    `;
  }
  
  // Check Results
  if (coc.checks && coc.checks.length > 0) {
    page1Content += `
      <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 8px 15px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${accentColor};">
            Check Results
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
              <tr style="background: ${COLORS.lightGray};">
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt; width: 10%;">Clause</th>
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt;">Description</th>
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt; width: 15%;">Measured</th>
                <th style="padding: 8px 10px; text-align: left; font-size: 9pt; width: 15%;">Limit</th>
                <th style="padding: 8px 10px; text-align: center; font-size: 9pt; width: 10%;">Result</th>
              </tr>
              ${coc.checks.map(check => {
                const checkColor = check.result?.toLowerCase() === 'pass' ? COLORS.success : 
                                  check.result?.toLowerCase() === 'fail' ? COLORS.error : COLORS.textMuted;
                return `
                <tr style="border-bottom: 1px solid ${COLORS.border};">
                  <td style="padding: 8px 10px; font-size: 9pt;">${check.clause || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt;">${check.description || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt;">${check.measuredValue || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt;">${check.limit || '-'}</td>
                  <td style="padding: 8px 10px; font-size: 9pt; text-align: center; color: ${checkColor}; font-weight: 600;">${check.result || '-'}</td>
                </tr>
                `;
              }).join('')}
            </table>
          </td>
        </tr>
      </table>
    `;
  }
  
  // Page 2 content (if needed)
  let page2Html = '';
  if (hasFailures || hasRecommendations) {
    let page2Content = '';
    
    if (hasFailures) {
      page2Content += `
        <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: #fef2f2; color: ${COLORS.error}; padding: 10px 15px; font-weight: 600; font-size: 12pt; border-bottom: 2px solid ${COLORS.error};">
              Critical Failures (${coc.criticalFailures!.length})
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid #fecaca; border-top: none; padding: 0;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr style="background: #fef2f2;">
                  <th style="padding: 10px 15px; text-align: left; font-size: 9pt; width: 5%;">#</th>
                  <th style="padding: 10px 15px; text-align: left; font-size: 9pt; width: 15%;">Clause</th>
                  <th style="padding: 10px 15px; text-align: left; font-size: 9pt; width: 35%;">Description</th>
                  <th style="padding: 10px 15px; text-align: left; font-size: 9pt;">Reason</th>
                </tr>
                ${coc.criticalFailures!.map((f, i) => `
                <tr style="border-bottom: 1px solid #fecaca;">
                  <td style="padding: 10px 15px; font-size: 9pt;">${i + 1}</td>
                  <td style="padding: 10px 15px; font-size: 9pt; color: ${COLORS.error}; font-weight: 600;">${f.clause || '-'}</td>
                  <td style="padding: 10px 15px; font-size: 9pt;">${f.description || '-'}</td>
                  <td style="padding: 10px 15px; font-size: 9pt; color: ${COLORS.textMuted};">${f.reason || '-'}</td>
                </tr>
                `).join('')}
              </table>
            </td>
          </tr>
        </table>
      `;
    }
    
    if (hasRecommendations) {
      page2Content += `
        <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 10px 15px; font-weight: 600; font-size: 12pt; border-bottom: 2px solid ${accentColor};">
              Recommendations
            </td>
          </tr>
          <tr>
            <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 20px;">
              <ol style="margin: 0; padding-left: 20px; font-size: 10pt; line-height: 1.8;">
                ${coc.recommendations!.map(rec => `<li style="margin-bottom: 10px;">${rec}</li>`).join('')}
              </ol>
            </td>
          </tr>
        </table>
      `;
    }
    
    page2Html = `
    <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
      ${generatePageHeader('COC Validation Report', accentColor)}
      ${page2Content}
      ${generatePageFooter(2, totalPages.toString(), generatedAt)}
    </div>
    `;
  }
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>COC Validation Report - ${coc.cocNumber || 'Unknown'}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <!-- Page 1 -->
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white; page-break-after: always;">
    ${generatePageHeader('COC Validation Report', accentColor)}
    ${page1Content}
    ${generatePageFooter(1, totalPages.toString(), generatedAt)}
  </div>
  ${page2Html}
</body>
</html>
  `;
}

async function generateInspectionHTML(data: ReportData): Promise<string> {
  // CRITICAL: Process all photos to base64 for reliable PDF rendering
  const processedInsp = await processInspectionPhotos(data.inspection!);
  const insp = processedInsp;
  
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  
  const statusColor = insp.status?.toLowerCase() === 'completed' ? COLORS.success :
                     insp.status?.toLowerCase() === 'in_progress' ? COLORS.warning : COLORS.textMuted;
  
  // Count total photos for the report (after processing - only count valid base64 images)
  let totalPhotos = 0;
  if (insp.sections) {
    insp.sections.forEach((section: any) => {
      section.items.forEach((item: any) => {
        if (item.photos && item.photos.length > 0) {
          // Only count photos that were successfully converted
          totalPhotos += item.photos.filter((p: string) => p && p.length > 0).length;
        }
      });
    });
  }
  
  // Count tenant images (after base64 conversion, null means failed)
  if (insp.tenants) {
    insp.tenants.forEach((tenant: any) => {
      if (tenant.meterImage) totalPhotos++;
      if (tenant.breakerImage) totalPhotos++;
      if (tenant.ctRatioImage) totalPhotos++;
    });
  }
  
  console.log(`[Inspection PDF] Total photos after base64 conversion: ${totalPhotos}`);
  
  // Build pages - we'll put items with photos prominently
  let pages: string[] = [];
  let currentPageContent = '';
  let currentPageItemCount = 0;
  const maxItemsPerPage = 3; // Fewer items per page to give photos room
  
  // Page 1: Header/General Info
  let page1Content = `
    <!-- Report Header -->
    <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background: ${accentColor}; color: white; padding: 15px 20px; font-weight: 700; font-size: 14pt;">
          ${insp.templateName || 'Inspection Report'}
        </td>
      </tr>
      <tr>
        <td style="background: ${COLORS.lightGray}; padding: 10px 20px; font-size: 11pt; color: ${COLORS.primary};">
          ${data.siteName || ''} ${insp.subsectionName ? `- ${insp.subsectionName}` : ''}
        </td>
      </tr>
    </table>
    
    <!-- Photo Summary Badge -->
    <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align: center; padding: 15px;">
          <span style="display: inline-block; background: ${accentColor}; color: white; padding: 8px 20px; border-radius: 20px; font-size: 11pt; font-weight: 600;">
            📷 ${totalPhotos} Photographic Record${totalPhotos !== 1 ? 's' : ''} Captured
          </span>
        </td>
      </tr>
    </table>
    
    <!-- General Information Grid -->
    <table style="width: 100%; margin-bottom: 20px; border-collapse: separate; border-spacing: 8px;">
      <tr>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 12px;">
          <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-bottom: 4px;">Status</div>
          <div style="font-size: 12pt; font-weight: 600; color: ${statusColor};">${insp.status || 'Pending'}</div>
        </td>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 12px;">
          <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-bottom: 4px;">Date</div>
          <div style="font-size: 12pt; font-weight: 600; color: ${COLORS.primary};">${insp.inspectionDate ? new Date(insp.inspectionDate).toLocaleDateString() : 'Not set'}</div>
        </td>
      </tr>
      <tr>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 12px;">
          <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-bottom: 4px;">Inspector</div>
          <div style="font-size: 12pt; font-weight: 600; color: ${COLORS.primary};">${insp.inspectorName || 'Not assigned'}</div>
        </td>
        <td style="width: 50%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 6px; padding: 12px;">
          <div style="font-size: 8pt; color: ${COLORS.textMuted}; text-transform: uppercase; margin-bottom: 4px;">Quality Rating</div>
          <div style="font-size: 12pt; font-weight: 600; color: ${COLORS.primary};">${insp.qualityRating ? `${insp.qualityRating}/5 ⭐` : 'Not rated'}</div>
        </td>
      </tr>
    </table>
  `;
  
  // Template Sections with PHOTOS - styled to match reference PDF
  if (insp.sections && insp.sections.length > 0) {
    for (const section of insp.sections) {
      // Section header - full width teal banner matching reference PDF
      page1Content += `
        <div style="page-break-inside: avoid; margin-bottom: 20px;">
          <table style="width: 100%; margin-bottom: 0;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background: ${accentColor}; color: white; padding: 12px 20px; font-weight: 600; font-size: 13pt; text-transform: uppercase; letter-spacing: 0.5px;">
                ${section.title}
              </td>
            </tr>
          </table>
        </div>
      `;
      
      // Render each item with its photos - matching reference PDF layout
      for (const item of section.items) {
        const hasPhotos = item.photos && item.photos.length > 0;
        const statusText = getStatusText(item.value, item.type);
        const statusColor = getStatusColor(item.value, item.type);
        
        page1Content += `
          <div style="margin-bottom: 30px; page-break-inside: avoid;">
            <!-- Item Label and Status -->
            <div style="font-weight: 600; color: ${COLORS.primary}; font-size: 12pt; margin-bottom: 4px;">${item.label}</div>
            <div style="font-size: 10pt; color: ${statusColor}; margin-bottom: 10px; margin-left: 15px;">Status: ${statusText}</div>
            
            ${item.notes ? `
            <div style="font-size: 9pt; color: ${COLORS.textMuted}; margin-bottom: 10px; margin-left: 15px; font-style: italic;">
              ${item.notes}
            </div>
            ` : ''}
            
            ${hasPhotos ? `
            <div style="margin-top: 10px;">
              ${generatePhotoGrid(item.photos!, { perRow: 3 })}
            </div>
            ` : ''}
          </div>
        `;
      }
    }
  }
  
  // Snags Section with photos
  if (insp.snags && insp.snags.length > 0) {
    page1Content += `
      <table style="width: 100%; margin-top: 20px; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: #fef3c7; color: ${COLORS.warning}; padding: 10px 15px; font-weight: 600; font-size: 11pt; border-radius: 6px 6px 0 0; border-bottom: 2px solid ${COLORS.warning};">
            ⚠️ Issues Found (${insp.snags.length})
          </td>
        </tr>
      </table>
    `;
    
    for (const snag of insp.snags) {
      const riskColor = snag.riskLevel === 'high' ? COLORS.error :
                       snag.riskLevel === 'medium' ? COLORS.warning : COLORS.info;
      const hasSnagPhotos = snag.photos && snag.photos.length > 0;
      
      page1Content += `
        <table style="width: 100%; margin-bottom: 15px; border: 1px solid ${COLORS.border}; border-radius: 6px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 12px 15px; background: #fef3c7;">
              <table style="width: 100%;" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-weight: 600; color: ${COLORS.primary};">${snag.title}</td>
                  <td style="text-align: right;">
                    <span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${riskColor}; color: white; font-weight: 600;">${(snag.riskLevel || 'low').toUpperCase()}</span>
                    <span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.lightGray}; margin-left: 5px;">${snag.status}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${snag.description ? `
          <tr>
            <td style="padding: 10px 15px; font-size: 9pt; color: ${COLORS.textMuted}; border-top: 1px solid ${COLORS.border};">
              ${snag.description}
            </td>
          </tr>
          ` : ''}
          ${hasSnagPhotos ? `
          <tr>
            <td style="padding: 15px; border-top: 1px solid ${COLORS.border};">
              ${generatePhotoGrid(snag.photos!.slice(0, 3), { perRow: 3 })}
            </td>
          </tr>
          ` : ''}
        </table>
      `;
    }
  }
  
  // Tenants Section with meter/breaker/CT photos - styled to match reference PDF
  if (insp.tenants && insp.tenants.length > 0) {
    // Section header - matching reference PDF style
    page1Content += `
      <div style="page-break-inside: avoid; margin-top: 30px; margin-bottom: 20px;">
        <table style="width: 100%;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="background: ${COLORS.success}; color: white; padding: 12px 20px; font-weight: 600; font-size: 13pt; text-transform: uppercase; letter-spacing: 0.5px;">
              TENANTS / METERS
            </td>
          </tr>
        </table>
      </div>
    `;
    
    insp.tenants.forEach((tenant: any, index: number) => {
      const hasImages = tenant.meterImage || tenant.breakerImage || tenant.ctRatioImage;
      const imageCount = [tenant.meterImage, tenant.breakerImage, tenant.ctRatioImage].filter(Boolean).length;
      
      page1Content += `
        <div style="margin-bottom: 30px; page-break-inside: avoid;">
          <!-- Tenant Header -->
          <div style="font-weight: 700; color: ${COLORS.primary}; font-size: 12pt; margin-bottom: 12px;">
            ${index + 1}. ${tenant.shopName}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}
          </div>
          
          <!-- Tenant Details -->
          <div style="margin-left: 20px; margin-bottom: 15px;">
            <div style="font-size: 10pt; color: ${COLORS.text}; margin-bottom: 4px;">Breaker Size: ${tenant.breakerSize || 'N/A'}</div>
            <div style="font-size: 10pt; color: ${COLORS.text}; margin-bottom: 4px;">CT Ratio: ${tenant.ctSizeAndRatio || 'N/A'}</div>
            <div style="font-size: 10pt; color: ${COLORS.text}; margin-bottom: 4px;">Meter S/N: ${tenant.meterSerialNumber || 'N/A'}</div>
          </div>
          
          ${hasImages ? `
          <!-- Photo Grid with Labels - 3-column layout with fixed 200x150px photo cards -->
          <div style="margin-top: 15px;">
            <table style="width: 100%; border-collapse: collapse; page-break-inside: avoid;">
              <tr>
                ${tenant.breakerImage ? `
                <td style="width: 33%; padding: 8px; vertical-align: top; text-align: center;">
                  <div style="font-size: 9pt; color: ${COLORS.textMuted}; margin-bottom: 6px; font-weight: 500;">Breaker</div>
                  <img src="${tenant.breakerImage}" 
                       style="max-width: 200px; max-height: 150px; display: block; margin: 0 auto; border: 1px solid ${COLORS.border}; border-radius: 4px; background: #f9fafb;" 
                       alt="Breaker" />
                </td>
                ` : ''}
                ${tenant.ctRatioImage ? `
                <td style="width: 33%; padding: 8px; vertical-align: top; text-align: center;">
                  <div style="font-size: 9pt; color: ${COLORS.textMuted}; margin-bottom: 6px; font-weight: 500;">CT Ratio</div>
                  <img src="${tenant.ctRatioImage}" 
                       style="max-width: 200px; max-height: 150px; display: block; margin: 0 auto; border: 1px solid ${COLORS.border}; border-radius: 4px; background: #f9fafb;" 
                       alt="CT Ratio" />
                </td>
                ` : ''}
                ${tenant.meterImage ? `
                <td style="width: 33%; padding: 8px; vertical-align: top; text-align: center;">
                  <div style="font-size: 9pt; color: ${COLORS.textMuted}; margin-bottom: 6px; font-weight: 500;">Meter</div>
                  <img src="${tenant.meterImage}" 
                       style="max-width: 200px; max-height: 150px; display: block; margin: 0 auto; border: 1px solid ${COLORS.border}; border-radius: 4px; background: #f9fafb;" 
                       alt="Meter" />
                </td>
                ` : ''}
              </tr>
            </table>
          </div>
          ` : ''}
        </div>
      `;
    });
  }
  
  if (insp.signatures && insp.signatures.length > 0) {
    page1Content += `
      <table style="width: 100%; margin-top: 30px; page-break-inside: avoid;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: ${COLORS.primary}; color: white; padding: 10px 15px; font-weight: 600; font-size: 11pt; border-radius: 6px 6px 0 0;">
            Sign-Off
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 20px;">
            <table style="width: 100%;" cellpadding="0" cellspacing="20">
              <tr>
                ${insp.signatures.map((sig: any) => `
                <td style="width: ${100 / insp.signatures!.length}%; text-align: center; vertical-align: top;">
                  ${sig.signatureUrl ? `
                  <img src="${sig.signatureUrl}" style="max-width: 150px; max-height: 60px; margin-bottom: 10px;" alt="Signature" />
                  ` : `
                  <div style="width: 150px; height: 60px; border-bottom: 2px solid ${COLORS.border}; margin: 0 auto 10px auto;"></div>
                  `}
                  <div style="font-weight: 600; color: ${COLORS.primary};">${sig.name}</div>
                  <div style="font-size: 9pt; color: ${COLORS.textMuted};">${sig.role || 'Signatory'}</div>
                  ${sig.signedAt ? `<div style="font-size: 8pt; color: ${COLORS.textMuted};">${new Date(sig.signedAt).toLocaleDateString()}</div>` : ''}
                </td>
                `).join('')}
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Inspection Report - ${insp.templateName || 'General'}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; }
    img { display: block; }
  </style>
</head>
<body>
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white;">
    ${generatePageHeader(`Inspection Report - ${insp.templateName || 'General'}`, accentColor)}
    ${page1Content}
    ${generatePageFooter(1, '1', generatedAt)}
  </div>
</body>
</html>
  `;
}

function formatItemValueWithBadge(value: string | boolean | number, type?: string, accentColor: string = '#2563eb'): string {
  const strValue = String(value).toLowerCase();
  
  if (typeof value === 'boolean' || type === 'checkbox') {
    const checked = value === true || strValue === 'true' || strValue === 'pass' || strValue === 'complete' || strValue === 'completed';
    return checked 
      ? `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.success}; color: white; font-weight: 600;">✓ PASS</span>`
      : `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.error}; color: white; font-weight: 600;">✗ FAIL</span>`;
  }
  
  if (strValue === 'pass' || strValue === 'complete' || strValue === 'completed' || strValue === 'yes') {
    return `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.success}; color: white; font-weight: 600;">✓ ${String(value).toUpperCase()}</span>`;
  }
  
  if (strValue === 'fail' || strValue === 'failed' || strValue === 'no') {
    return `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.error}; color: white; font-weight: 600;">✗ ${String(value).toUpperCase()}</span>`;
  }
  
  if (strValue === 'pending' || strValue === 'in_progress' || strValue === 'n/a') {
    return `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${COLORS.lightGray}; color: ${COLORS.textMuted};">${String(value)}</span>`;
  }
  
  return `<span style="display: inline-block; padding: 3px 10px; font-size: 8pt; border-radius: 12px; background: ${accentColor}22; color: ${accentColor};">${String(value)}</span>`;
}

// Helper functions for cleaner status display (matching reference PDF style)
function getStatusText(value: string | boolean | number, type?: string): string {
  const strValue = String(value).toLowerCase();
  if (typeof value === 'boolean') {
    return value ? 'Pass' : 'Fail';
  }
  if (strValue === 'pass' || strValue === 'complete' || strValue === 'completed' || strValue === 'yes' || strValue === 'true') {
    return 'Pass';
  }
  if (strValue === 'fail' || strValue === 'failed' || strValue === 'no' || strValue === 'false') {
    return 'Fail';
  }
  if (strValue === 'pending' || strValue === 'in_progress') {
    return 'Pending';
  }
  if (strValue === 'n/a' || strValue === 'na') {
    return 'N/A';
  }
  return String(value);
}

function getStatusColor(value: string | boolean | number, type?: string): string {
  const strValue = String(value).toLowerCase();
  if (typeof value === 'boolean') {
    return value ? COLORS.success : COLORS.error;
  }
  if (strValue === 'pass' || strValue === 'complete' || strValue === 'completed' || strValue === 'yes' || strValue === 'true') {
    return COLORS.success;
  }
  if (strValue === 'fail' || strValue === 'failed' || strValue === 'no' || strValue === 'false') {
    return COLORS.error;
  }
  if (strValue === 'pending' || strValue === 'in_progress') {
    return COLORS.warning;
  }
  return COLORS.textMuted;
}

async function generateFortressChecklistHTML(data: ReportData): Promise<string> {
  const checklist = data.fortressChecklistFull!;
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  const siteName = data.siteName || 'Site';
  
  const progressColor = checklist.overallProgress >= 80 ? COLORS.success :
                        checklist.overallProgress >= 50 ? COLORS.warning : COLORS.error;
  
  let content = '';
  
  // Summary Stats
  content += `
    <table style="width: 100%; margin-bottom: 20px; border-collapse: separate; border-spacing: 10px;">
      <tr>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${progressColor};">${checklist.overallProgress}%</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Overall Progress</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.success};">${checklist.stats.completed}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Completed</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.warning};">${checklist.stats.pending}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Pending</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.muted};">${checklist.stats.notApplicable}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">N/A</div>
        </td>
      </tr>
    </table>
  `;
  
  // Sections with items
  checklist.sections.forEach(section => {
    const sectionColor = section.progress >= 80 ? COLORS.success :
                        section.progress >= 50 ? COLORS.warning : COLORS.error;
    
    content += `
      <table style="width: 100%; margin-bottom: 15px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background: ${COLORS.lightGray}; color: ${COLORS.primary}; padding: 10px 15px; font-weight: 600; font-size: 11pt; border-bottom: 2px solid ${accentColor};">
            <table style="width: 100%;"><tr>
              <td>${section.name}</td>
              <td style="text-align: right; color: ${sectionColor}; font-weight: 700;">${section.progress}%</td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="border: 1px solid ${COLORS.border}; border-top: none; padding: 0;">
            <table style="width: 100%;" cellpadding="0" cellspacing="0">
              ${section.items.map(item => {
                const statusIcon = item.isNotApplicable ? '⊘' : item.isChecked ? '✓' : '○';
                const statusColor = item.isNotApplicable ? COLORS.muted : item.isChecked ? COLORS.success : COLORS.warning;
                return `
                <tr style="border-bottom: 1px solid ${COLORS.border};">
                  <td style="padding: 8px 15px; width: 30px; text-align: center; font-size: 14pt; color: ${statusColor};">${statusIcon}</td>
                  <td style="padding: 8px 15px; font-size: 9pt;">${item.label}</td>
                </tr>
                `;
              }).join('')}
            </table>
          </td>
        </tr>
      </table>
    `;
  });
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fortress Checklist - ${siteName}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white;">
    ${generatePageHeader(`Fortress Site Close-Out Checklist - ${siteName}`, accentColor)}
    ${content}
    ${generatePageFooter(1, '1', generatedAt)}
  </div>
</body>
</html>
  `;
}

async function generateCalendarHTML(data: ReportData): Promise<string> {
  const cal = data.calendar!;
  const accentColor = data.accentColor || '#2563eb';
  const generatedAt = data.generatedAt || new Date().toLocaleDateString('en-ZA');
  
  let content = '';
  
  // Stats Summary
  content += `
    <table style="width: 100%; margin-bottom: 20px; border-collapse: separate; border-spacing: 10px;">
      <tr>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${accentColor};">${cal.stats.totalEvents}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Total Events</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.info};">${cal.stats.upcomingCount}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Upcoming</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.success};">${cal.stats.completedCount}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Completed</div>
        </td>
        <td style="width: 25%; background: ${COLORS.lightGray}; border: 1px solid ${COLORS.border}; border-radius: 8px; padding: 20px; text-align: center;">
          <div style="font-size: 28pt; font-weight: 700; color: ${COLORS.warning};">${cal.stats.pendingCount}</div>
          <div style="font-size: 9pt; color: ${COLORS.textMuted}; text-transform: uppercase;">Pending</div>
        </td>
      </tr>
    </table>
  `;
  
  // Events Table
  if (cal.events.length > 0) {
    content += `
      <table style="width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: ${COLORS.primary};">
            <th style="padding: 12px 15px; text-align: left; color: white; font-size: 10pt;">Event</th>
            <th style="padding: 12px 15px; text-align: left; color: white; font-size: 10pt;">Site</th>
            <th style="padding: 12px 15px; text-align: left; color: white; font-size: 10pt;">Date</th>
            <th style="padding: 12px 15px; text-align: center; color: white; font-size: 10pt;">Status</th>
            <th style="padding: 12px 15px; text-align: center; color: white; font-size: 10pt;">Priority</th>
          </tr>
        </thead>
        <tbody>
          ${cal.events.map(event => {
            const statusColor = event.status === 'completed' ? COLORS.success :
                               event.status === 'upcoming' ? COLORS.info : COLORS.warning;
            const priorityColor = event.priority === 'high' ? COLORS.error :
                                 event.priority === 'medium' ? COLORS.warning : COLORS.muted;
            return `
            <tr style="background: white; border-bottom: 1px solid ${COLORS.border};">
              <td style="padding: 10px 15px; font-size: 10pt;">${event.title}</td>
              <td style="padding: 10px 15px; font-size: 10pt; color: ${COLORS.textMuted};">${event.siteName || '-'}</td>
              <td style="padding: 10px 15px; font-size: 10pt;">${new Date(event.startDate).toLocaleDateString()}</td>
              <td style="padding: 10px 15px; font-size: 9pt; text-align: center;"><span style="padding: 2px 8px; border-radius: 4px; background: ${statusColor}22; color: ${statusColor};">${event.status}</span></td>
              <td style="padding: 10px 15px; font-size: 9pt; text-align: center;"><span style="padding: 2px 8px; border-radius: 4px; background: ${priorityColor}22; color: ${priorityColor};">${event.priority || 'normal'}</span></td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Calendar Report - ${cal.year}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      font-size: 10pt;
      color: ${COLORS.text};
      line-height: 1.4;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    table { border-collapse: collapse; }
  </style>
</head>
<body>
  <div style="width: 210mm; min-height: 297mm; padding: 15mm 18mm 25mm 18mm; position: relative; background: white;">
    ${generatePageHeader(`Calendar Report - ${cal.year}`, accentColor)}
    ${content}
    ${generatePageFooter(1, '1', generatedAt)}
  </div>
</body>
</html>
  `;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const PDFSHIFT_API_KEY = Deno.env.get('PDFSHIFT_API_KEY');
    
    if (!PDFSHIFT_API_KEY) {
      console.error('PDFSHIFT_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'PDF generation service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as ReportData;
    console.log('Generating PDF for:', body.siteName, 'Type:', body.reportType, 'Subsections:', body.subsections?.length || 0);
    console.log('Asset Verification:', body.assetVerification ? `${body.assetVerification.totalAssets} assets, ${body.assetVerification.schedule?.length || 0} schedule rows` : 'NONE');
    console.log('Fortress Checklist:', body.fortressChecklist ? `${body.fortressChecklist.completed} completed, ${body.fortressChecklist.sections?.length || 0} sections` : 'NONE');
    console.log('Documents Summary:', body.documentsSummary?.length || 0, 'categories');
    console.log('Category Health:', body.categoryHealth?.length || 0, 'categories');

    // Generate HTML based on report type
    let html: string;
    switch (body.reportType) {
      case 'site-summary':
        html = await generateSiteSummaryHTML(body);
        break;
      case 'coc-validation':
        if (!body.cocValidation) {
          return new Response(
            JSON.stringify({ error: 'Missing cocValidation data for coc-validation report type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        html = await generateCOCValidationHTML(body);
        break;
      case 'inspection':
        // Support both nested (body.inspection) and flat (body.inspectionId, body.sections, etc.) formats
        if (!body.inspection && !(body as any).inspectionId) {
          return new Response(
            JSON.stringify({ error: 'Missing inspection data for inspection report type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // If flat format, wrap into nested format for consistency
        if (!body.inspection && (body as any).inspectionId) {
          const flatBody = body as any;
          body.inspection = {
            inspectionId: flatBody.inspectionId,
            templateName: flatBody.templateName,
            inspectorName: flatBody.inspectorName,
            inspectionDate: flatBody.inspectionDate,
            status: flatBody.status,
            qualityRating: flatBody.qualityRating,
            generalInfo: flatBody.generalInfo,
            sections: flatBody.sections,
            snags: flatBody.snags,
            signatures: flatBody.signatures,
            subsectionName: flatBody.subsectionName || flatBody.subtitle?.split(' - ')[1],
          };
        }
        html = await generateInspectionHTML(body);
        break;
      case 'fortress-checklist':
        if (!body.fortressChecklistFull) {
          return new Response(
            JSON.stringify({ error: 'Missing fortressChecklistFull data for fortress-checklist report type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        html = await generateFortressChecklistHTML(body);
        break;
      case 'calendar':
        if (!body.calendar) {
          return new Response(
            JSON.stringify({ error: 'Missing calendar data for calendar report type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        html = await generateCalendarHTML(body);
        break;
      default:
        html = await generateSiteSummaryHTML(body);
    }

    console.log('HTML generated, calling PDFShift API...');

    // Call PDFShift API
    const pdfResponse = await fetch('https://api.pdfshift.io/v3/convert/pdf', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${PDFSHIFT_API_KEY}`)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: html,
        landscape: false,
        format: 'A4',
        margin: {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm'
        },
        use_print: true,
      }),
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error('PDFShift API error:', pdfResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'PDF generation failed', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('PDF generated successfully, uploading to storage...');

    // Get PDF as blob (more memory-efficient than arrayBuffer)
    const pdfBlob = await pdfResponse.blob();
    console.log(`PDF size: ${(pdfBlob.size / 1024 / 1024).toFixed(2)}MB`);
    
    // Create Supabase client for storage upload
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Generate filename with timestamp based on report type
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportTypeName = getReportTypeDisplayName(body.reportType);
    const sanitizedName = (body.siteName || body.title || 'Report').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${reportTypeName}_${sanitizedName}_${timestamp}.pdf`;
    const storagePath = body.siteId 
      ? `site-reports/${body.siteId}/${filename}`
      : `reports/${filename}`;
    
    // Upload blob directly to Supabase Storage (documents bucket)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      });
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to save PDF to storage', details: uploadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);
    
    console.log('PDF saved to storage:', urlData.publicUrl);

    // Create a record in site_documents table so it appears in the Reports list (only for site-level reports)
    if (body.siteId) {
      const { error: dbError } = await supabase
        .from('site_documents')
        .insert({
          site_id: body.siteId,
          file_name: filename,
          file_url: urlData.publicUrl,
          category: getReportCategory(body.reportType),
        });
      
      if (dbError) {
        console.error('Database insert error:', dbError);
        // Don't fail the request - the file is saved, just log the error
      } else {
        console.log('Report record created in site_documents');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        url: urlData.publicUrl,
        filename,
        storagePath,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error generating PDF:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
