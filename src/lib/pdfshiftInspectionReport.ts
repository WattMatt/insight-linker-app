/**
 * Word Document (DOCX) Report Generator
 * 
 * Uses the server-side Edge Function with the docx library to generate
 * professional Word documents. This provides:
 * - Native image buffer support (no Base64 issues)
 * - Editable documents for clients
 * - Reliable rendering across all platforms
 * - Efficient compression
 * 
 * This is the PREFERRED method for inspection reports with photographic evidence.
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
  // For document persistence (server-side)
  subsectionId?: string;
}

export interface GenerateDocxReportResult {
  success: boolean;
  url?: string;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

// Legacy alias for backward compatibility
export type GeneratePdfShiftReportResult = GenerateDocxReportResult;

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
  // CRITICAL FIX: Skip client-side embedding to avoid 6MB payload limit on Edge Function
  // The server (Edge Function) now handles image downloading and resizing via Supabase Render API
  // This prevents the "completely destroyed" report issue caused by large base64 strings
  return inspection;

  return inspection;
}

// ============================================================================
// MAIN GENERATOR FUNCTIONS
// ============================================================================

/**
 * Generate inspection report as PDF via HTML + Browserless Edge Function
 * Complete rebuild using pixel-perfect HTML templates rendered in headless Chrome
 */
export async function generatePdfShiftInspectionReport(
  options: GeneratePdfShiftReportOptions
): Promise<GenerateDocxReportResult> {
  const { inspection, siteName, clientName, siteLogoUrl, accentColor = '#2563eb', subsectionId } = options;

  try {
    console.log('[InspectionPDF] Starting HTML+Browserless generation...');
    console.log('[InspectionPDF] Sections:', inspection.sections?.length || 0);
    console.log('[InspectionPDF] Tenants:', inspection.tenants?.length || 0);
    console.log('[InspectionPDF] Snags:', inspection.snags?.length || 0);

    // Get current user for document ownership
    const { data: { user } } = await supabase.auth.getUser();

    // EMBED IMAGES CLIENT-SIDE
    // This ensures private images and local blobs are accurately captured
    // The Edge Function can still process them, but client-side is more reliable for access
    const processedInspection = await embedAllImages(inspection);

    // Count total photos for logging
    let totalPhotos = 0;
    if (processedInspection.sections) {
      for (const section of processedInspection.sections) {
        for (const item of section.items) {
          if (item.photos && item.photos.length > 0) {
            totalPhotos += item.photos.length;
          }
        }
      }
    }
    console.log('[InspectionPDF] Total photos:', totalPhotos);

    // Build payload - send Base64 images
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
      subsectionId,
      userId: user?.id,
    };

    console.log('[InspectionPDF] Calling generate-inspection-pdf Edge Function...');

    // Call Edge Function for HTML + Browserless PDF generation
    const { data, error } = await supabase.functions.invoke('generate-inspection-pdf', {
      body: payload,
    });

    if (error) {
      console.error('[InspectionPDF] Edge Function error:', error);
      return { success: false, error: error.message || 'Failed to generate PDF' };
    }

    console.log('[InspectionPDF] Edge Function response:', {
      success: data?.success,
      url: data?.url,
      fileName: data?.fileName
    });

    if (!data?.url) {
      console.error('[InspectionPDF] No URL returned:', data);
      return { success: false, error: data?.error || 'No PDF URL returned' };
    }

    console.log('[InspectionPDF] ✓ PDF generated successfully:', data.url);

    return {
      success: true,
      url: data.url,
      filename: data.fileName,
      previewUrl: data.url,
    };

  } catch (error) {
    console.error('[InspectionPDF] Error generating report:', error);
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
  const { subsectionId } = options;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    // Generate PDF via Edge Function
    // The Edge Function now handles document persistence server-side
    // This ensures the document is saved even if the client connection times out
    const result = await generatePdfShiftInspectionReport({
      ...options,
      subsectionId, // Pass to Edge Function for server-side persistence
    });

    if (!result.success || !result.url) {
      return { success: false, error: result.error || 'Failed to generate PDF' };
    }

    // The Edge Function handles document record creation server-side
    // Return the result directly
    return {
      success: true,
      documentId: (result as any).documentId, // If Edge Function returns it
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
