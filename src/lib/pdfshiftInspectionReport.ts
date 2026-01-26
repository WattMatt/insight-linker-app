/**
 * PDFShift-based Inspection Report Generator
 * 
 * Uses the server-side Edge Function with PDFShift for HTML-to-PDF conversion.
 * All images are pre-embedded as Base64 data URIs client-side BEFORE sending
 * to the Edge Function. This solves:
 * 1. PDFShift layout/styling excellence (CSS-based)
 * 2. Reliable image rendering (Base64 embedded, no fetch issues)
 * 
 * This is the PREFERRED method for inspection reports.
 */

import { supabase } from '@/integrations/supabase/client';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface InspectionSection {
  title: string;
  items: Array<{
    label: string;
    value: string | boolean | number;
    type?: string;
    notes?: string;
    photos?: string[];
  }>;
}

export interface InspectionSnag {
  title: string;
  description?: string;
  status: string;
  riskLevel?: string;
  photos?: string[];
}

export interface InspectionSignature {
  name: string;
  role?: string;
  signatureUrl?: string;
  signedAt?: string;
}

export interface InspectionTenant {
  shopName: string;
  shopNumber?: string;
  meterSerialNumber?: string;
  breakerSize?: string;
  ctSizeAndRatio?: string;
  meterImage?: string;
  breakerImage?: string;
  ctRatioImage?: string;
}

export interface InspectionReportData {
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

export interface GeneratePdfShiftReportOptions {
  inspection: InspectionReportData;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string | null;
  accentColor?: string;
}

export interface GeneratePdfShiftReportResult {
  success: boolean;
  url?: string;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

// ============================================================================
// IMAGE COMPRESSION & EMBEDDING
// ============================================================================

const MAX_IMAGE_WIDTH = 800;
const JPEG_QUALITY = 0.75;
const MAX_SIZE_KB = 200;

/**
 * Compress and convert image to Base64 data URI
 * Uses canvas for client-side resizing/compression
 */
async function imageToBase64(url: string): Promise<string | null> {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url; // Already Base64
  
  try {
    // Fetch the image
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      console.warn(`[imageToBase64] Failed to fetch: ${url.substring(0, 50)}...`);
      return null;
    }
    
    const blob = await response.blob();
    
    // Skip if too large (>2MB original likely means uncompressed)
    if (blob.size > 2 * 1024 * 1024) {
      console.warn(`[imageToBase64] Skipping large image: ${Math.round(blob.size / 1024)}KB`);
      return null;
    }
    
    // Create image element
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    return new Promise((resolve) => {
      img.onload = () => {
        // Calculate new dimensions
        let width = img.width;
        let height = img.height;
        
        if (width > MAX_IMAGE_WIDTH) {
          height = Math.round((height * MAX_IMAGE_WIDTH) / width);
          width = MAX_IMAGE_WIDTH;
        }
        
        // Draw to canvas and compress
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG for better compression
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        
        // Check final size
        const base64Size = Math.round((dataUrl.length * 3) / 4 / 1024);
        if (base64Size > MAX_SIZE_KB) {
          console.warn(`[imageToBase64] Compressed but still large: ${base64Size}KB`);
        }
        
        resolve(dataUrl);
      };
      
      img.onerror = () => {
        console.warn(`[imageToBase64] Failed to load image: ${url.substring(0, 50)}...`);
        resolve(null);
      };
      
      // Load from blob URL
      img.src = URL.createObjectURL(blob);
    });
  } catch (error) {
    console.warn(`[imageToBase64] Error processing: ${url.substring(0, 50)}...`, error);
    return null;
  }
}

/**
 * Process all images in inspection data and convert to Base64
 */
async function embedAllImages(inspection: InspectionReportData): Promise<InspectionReportData> {
  const processed = JSON.parse(JSON.stringify(inspection)) as InspectionReportData;
  let processedCount = 0;
  let totalCount = 0;
  let failedUrls: string[] = [];
  
  console.log('[embedAllImages] Starting image embedding...');
  console.log('[embedAllImages] Sections count:', processed.sections?.length || 0);
  console.log('[embedAllImages] Tenants count:', processed.tenants?.length || 0);
  console.log('[embedAllImages] Snags count:', processed.snags?.length || 0);
  
  // Process section item photos
  if (processed.sections) {
    for (const section of processed.sections) {
      for (const item of section.items) {
        if (item.photos && item.photos.length > 0) {
          console.log(`[embedAllImages] Processing ${item.photos.length} photos for item: ${item.label}`);
          totalCount += item.photos.length;
          const embeddedPhotos: string[] = [];
          
          // Limit to 4 photos per item to keep size manageable
          for (const photoUrl of item.photos.slice(0, 4)) {
            console.log(`[embedAllImages] Converting: ${photoUrl.substring(0, 80)}...`);
            const base64 = await imageToBase64(photoUrl);
            if (base64) {
              embeddedPhotos.push(base64);
              processedCount++;
              console.log(`[embedAllImages] ✓ Converted successfully`);
            } else {
              failedUrls.push(photoUrl);
              console.warn(`[embedAllImages] ✗ Failed to convert`);
            }
          }
          
          item.photos = embeddedPhotos;
        }
      }
    }
  }
  
  // Process tenant images
  if (processed.tenants) {
    for (const tenant of processed.tenants) {
      if (tenant.meterImage) {
        totalCount++;
        console.log(`[embedAllImages] Converting tenant meter image for: ${tenant.shopName}`);
        const base64 = await imageToBase64(tenant.meterImage);
        tenant.meterImage = base64 || undefined;
        if (base64) processedCount++;
        else failedUrls.push(tenant.meterImage);
      }
      if (tenant.breakerImage) {
        totalCount++;
        console.log(`[embedAllImages] Converting tenant breaker image for: ${tenant.shopName}`);
        const base64 = await imageToBase64(tenant.breakerImage);
        tenant.breakerImage = base64 || undefined;
        if (base64) processedCount++;
        else failedUrls.push(tenant.breakerImage);
      }
      if (tenant.ctRatioImage) {
        totalCount++;
        console.log(`[embedAllImages] Converting tenant CT ratio image for: ${tenant.shopName}`);
        const base64 = await imageToBase64(tenant.ctRatioImage);
        tenant.ctRatioImage = base64 || undefined;
        if (base64) processedCount++;
        else failedUrls.push(tenant.ctRatioImage);
      }
    }
  }
  
  // Process snag photos
  if (processed.snags) {
    for (const snag of processed.snags) {
      if (snag.photos && snag.photos.length > 0) {
        console.log(`[embedAllImages] Processing ${snag.photos.length} photos for snag: ${snag.title}`);
        totalCount += snag.photos.length;
        const embeddedPhotos: string[] = [];
        
        // Limit to 2 photos per snag
        for (const photoUrl of snag.photos.slice(0, 2)) {
          console.log(`[embedAllImages] Converting snag photo: ${photoUrl.substring(0, 80)}...`);
          const base64 = await imageToBase64(photoUrl);
          if (base64) {
            embeddedPhotos.push(base64);
            processedCount++;
          } else {
            failedUrls.push(photoUrl);
          }
        }
        
        snag.photos = embeddedPhotos;
      }
    }
  }
  
  // Process signatures
  if (processed.signatures) {
    for (const sig of processed.signatures) {
      if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
        totalCount++;
        console.log(`[embedAllImages] Converting signature for: ${sig.name}`);
        const base64 = await imageToBase64(sig.signatureUrl);
        sig.signatureUrl = base64 || undefined;
        if (base64) processedCount++;
        else if (sig.signatureUrl) failedUrls.push(sig.signatureUrl);
      }
    }
  }
  
  console.log(`[embedAllImages] ========================================`);
  console.log(`[embedAllImages] Processed ${processedCount}/${totalCount} images successfully`);
  if (failedUrls.length > 0) {
    console.warn(`[embedAllImages] Failed URLs:`, failedUrls.slice(0, 5));
  }
  console.log(`[embedAllImages] ========================================`);
  
  return processed;
}

// ============================================================================
// MAIN GENERATOR FUNCTIONS
// ============================================================================

/**
 * Generate inspection report via PDFShift Edge Function
 * Uses PDFShift for HTML-to-PDF conversion with embedded Base64 images
 */
export async function generatePdfShiftInspectionReport(
  options: GeneratePdfShiftReportOptions
): Promise<GeneratePdfShiftReportResult> {
  const { inspection, siteName, clientName, siteLogoUrl, accentColor = '#2563eb' } = options;
  
  try {
    console.log('[PDFShift] Starting inspection report generation...');
    console.log('[PDFShift] Sections:', inspection.sections?.length || 0);
    console.log('[PDFShift] Tenants:', inspection.tenants?.length || 0);
    console.log('[PDFShift] Snags:', inspection.snags?.length || 0);
    
    // Pre-embed all images as Base64 client-side
    console.log('[PDFShift] Embedding images as Base64...');
    const processedInspection = await embedAllImages(inspection);
    
    // Build payload for Edge Function
    const payload = {
      inspection: {
        inspectionId: processedInspection.inspectionId,
        templateName: processedInspection.templateName,
        inspectorName: processedInspection.inspectorName,
        inspectionDate: processedInspection.inspectionDate,
        status: processedInspection.status,
        qualityRating: processedInspection.qualityRating,
        generalInfo: processedInspection.generalInfo,
        sections: processedInspection.sections,
        tenants: processedInspection.tenants,
        snags: processedInspection.snags,
        signatures: processedInspection.signatures,
        subsectionName: processedInspection.subsectionName,
      },
      siteName,
      clientName,
      siteLogoUrl,
      accentColor,
    };
    
    console.log('[PDFShift] Calling Edge Function...');
    
    // Call PDFShift Edge Function
    const { data, error } = await supabase.functions.invoke('generate-pdf', {
      body: payload,
    });
    
    if (error) {
      console.error('[PDFShift] Edge Function error:', error);
      return { success: false, error: error.message || 'Failed to generate PDF' };
    }
    
    if (!data?.url) {
      console.error('[PDFShift] No URL returned from Edge Function');
      return { success: false, error: data?.error || 'No PDF URL returned' };
    }
    
    console.log('[PDFShift] PDF generated successfully:', data.url);
    
    return {
      success: true,
      url: data.url,
      filename: data.filename,
      previewUrl: data.url,
    };
    
  } catch (error) {
    console.error('[PDFShift] Error generating report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate and save inspection report via PDFShift
 * Also creates document record in database
 */
export async function generateAndSavePdfShiftInspectionReport(
  options: GeneratePdfShiftReportOptions & {
    subsectionId: string;
    siteId?: string;
  }
): Promise<{
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}> {
  const { subsectionId, siteId } = options;
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Generate PDF via Edge Function (which also saves to storage)
    const result = await generatePdfShiftInspectionReport(options);
    
    if (!result.success || !result.url) {
      return { success: false, error: result.error || 'Failed to generate PDF' };
    }
    
    // The Edge Function already creates the document record for site-level reports
    // For subsection-level, we need to find or create an "Inspection Reports" category first
    let categoryId: string | undefined;
    
    // Try to find existing category
    const { data: existingCategory } = await supabase
      .from('document_categories')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('name', 'Inspection Reports')
      .maybeSingle();
    
    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      // Create the category
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
    
    if (categoryId) {
      const { data: docData, error: docError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: result.filename || 'Inspection_Report.pdf',
          file_url: result.url,
          uploaded_by: user.id,
        })
        .select('id')
        .single();
      
      if (docError) {
        console.warn('[PDFShift] Failed to create document record:', docError);
      }
      
      return {
        success: true,
        documentId: docData?.id,
        fileName: result.filename,
        fileUrl: result.url,
      };
    }
    
    // Category creation failed but PDF was generated
    return {
      success: true,
      fileName: result.filename,
      fileUrl: result.url,
    };
    
  } catch (error) {
    console.error('[PDFShift] Save error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
