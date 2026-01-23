/**
 * PDFMAKE-BASED INSPECTION REPORT GENERATOR
 * 
 * Generates professional inspection reports matching the reference layout:
 * - Full-width colored section banners
 * - Item name + Status: Pass/Fail format
 * - Single photo per item, naturally stacked
 * - Clean vertical flow with proper spacing
 */

import {
  generateReport,
  loadImageAsDataUrl,
  COLORS,
  CONTENT_WIDTH_PT,
  CoverPageOptions,
} from './pdfEngine';
import { supabase } from '@/integrations/supabase/client';

// Type definitions
type Content = any;

// Section banner color (matching example - teal/dark blue)
const SECTION_BANNER_COLOR = '#1a7a8a';

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

export interface GenerateInspectionReportOptions {
  inspection: InspectionReportData;
  siteName: string;
  clientName?: string;
  siteLogoUrl?: string | null;
  accentColor?: 'blue' | 'green' | 'orange' | 'red' | 'purple';
}

export interface GenerateInspectionReportResult {
  success: boolean;
  blob?: Blob;
  previewUrl?: string;
  filename?: string;
  error?: string;
}

/**
 * Load multiple images in parallel with error handling
 */
async function loadImagesAsDataUrls(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  const loadPromises = urls.map(async (url) => {
    if (!url) return;
    try {
      const dataUrl = await loadImageAsDataUrl(url);
      if (dataUrl) {
        results.set(url, dataUrl);
      }
    } catch (error) {
      console.warn(`Failed to load image: ${url}`, error);
    }
  });
  
  await Promise.all(loadPromises);
  return results;
}

/**
 * Collect all image URLs from inspection data
 */
function collectImageUrls(inspection: InspectionReportData): string[] {
  const urls: string[] = [];
  
  // Section item photos
  inspection.sections?.forEach(section => {
    section.items?.forEach(item => {
      if (item.photos?.length) {
        urls.push(...item.photos.filter(Boolean));
      }
    });
  });
  
  // Tenant photos
  inspection.tenants?.forEach(tenant => {
    if (tenant.meterImage) urls.push(tenant.meterImage);
    if (tenant.breakerImage) urls.push(tenant.breakerImage);
    if (tenant.ctRatioImage) urls.push(tenant.ctRatioImage);
  });
  
  // Snag photos
  inspection.snags?.forEach(snag => {
    if (snag.photos?.length) {
      urls.push(...snag.photos.filter(Boolean));
    }
  });
  
  // Signature images
  inspection.signatures?.forEach(sig => {
    if (sig.signatureUrl && !sig.signatureUrl.startsWith('data:')) {
      urls.push(sig.signatureUrl);
    }
  });
  
  return [...new Set(urls)]; // Deduplicate
}

/**
 * Get status color based on value
 */
function getStatusColor(status: string): string {
  const statusLower = status.toLowerCase();
  if (['pass', 'passed', 'yes', 'compliant', 'ok', 'good', 'complete', 'completed'].includes(statusLower)) {
    return '#22c55e'; // Green
  }
  if (['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical'].includes(statusLower)) {
    return '#ef4444'; // Red
  }
  if (['pending', 'in progress', 'partial', 'warning', 'n/a'].includes(statusLower)) {
    return '#f59e0b'; // Amber
  }
  return COLORS.textMuted;
}

/**
 * Create full-width section banner (matching reference)
 * Uses headlineLevel to keep it with following content
 */
function createSectionBanner(title: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{
        text: title.toUpperCase(),
        fontSize: 14,
        bold: true,
        color: '#FFFFFF',
        alignment: 'center',
        margin: [0, 12, 0, 12],
      }]],
    },
    layout: {
      fillColor: () => SECTION_BANNER_COLOR,
      hLineWidth: () => 0,
      vLineWidth: () => 0,
    },
    margin: [0, 20, 0, 15],
    // Keep header with following content - prevents orphaned headers
    headlineLevel: 1,
  };
}

/**
 * Create inspection section with items and photos - MATCHING REFERENCE LAYOUT
 */
function createInspectionSection(
  section: InspectionSection,
  imageCache: Map<string, string>
): Content[] {
  const content: Content[] = [];
  
  // Full-width section banner
  content.push(createSectionBanner(section.title));
  
  // Render each item
  section.items?.forEach((item) => {
    const statusText = typeof item.value === 'boolean'
      ? (item.value ? 'Pass' : 'Fail')
      : String(item.value || 'N/A');
    
    const statusColor = getStatusColor(statusText);
    
    // Build item stack
    const itemStack: Content[] = [];
    
    // Item name (bold, like reference)
    itemStack.push({
      text: item.label,
      fontSize: 12,
      bold: true,
      margin: [0, 0, 0, 3],
    });
    
    // Status line - green "Status: Pass" format (indented)
    itemStack.push({
      text: `Status: ${statusText}`,
      fontSize: 10,
      color: statusColor,
      margin: [15, 0, 0, 8],
    });
    
    // Notes if present
    if (item.notes) {
      itemStack.push({
        text: item.notes,
        fontSize: 9,
        color: COLORS.textMuted,
        italics: true,
        margin: [15, 0, 0, 8],
      });
    }
    
    // Photos - single column, stacked vertically like reference
    // Using fit to maintain aspect ratio
    item.photos?.forEach((photoUrl) => {
      const dataUrl = imageCache.get(photoUrl);
      if (dataUrl) {
        itemStack.push({
          image: dataUrl,
          fit: [350, 280], // Max width 350pt, max height 280pt - maintains aspect ratio
          alignment: 'left' as const,
          margin: [0, 5, 0, 10],
        });
      }
    });
    
    // Wrap item in unbreakable stack
    content.push({
      stack: itemStack,
      unbreakable: true,
      margin: [0, 8, 0, 12],
    });
  });
  
  return content;
}

/**
 * Create tenant verification section - matching reference layout
 */
function createTenantSection(
  tenants: InspectionTenant[],
  imageCache: Map<string, string>
): Content[] {
  if (!tenants?.length) return [];
  
  const content: Content[] = [];
  content.push(createSectionBanner('Tenants / Meters'));
  
  tenants.forEach((tenant, idx) => {
    const tenantStack: Content[] = [];
    
    // Tenant header with number
    tenantStack.push({
      text: `${idx + 1}. ${tenant.shopName}${tenant.shopNumber ? ` (${tenant.shopNumber})` : ''}`,
      fontSize: 12,
      bold: true,
      margin: [0, 0, 0, 8],
    });
    
    // Info table - Breaker Size, CT Ratio, Meter S/N in stacked format
    const infoItems: Content[] = [];
    
    if (tenant.breakerSize) {
      infoItems.push({
        columns: [
          { text: 'Breaker Size:', fontSize: 10, bold: true, width: 90 },
          { text: tenant.breakerSize, fontSize: 10, width: '*' },
        ],
        margin: [15, 0, 0, 3],
      });
    }
    
    if (tenant.ctSizeAndRatio) {
      infoItems.push({
        columns: [
          { text: 'CT Ratio:', fontSize: 10, bold: true, width: 90 },
          { text: tenant.ctSizeAndRatio, fontSize: 10, width: '*' },
        ],
        margin: [15, 0, 0, 3],
      });
    }
    
    if (tenant.meterSerialNumber) {
      infoItems.push({
        columns: [
          { text: 'Meter S/N:', fontSize: 10, bold: true, width: 90 },
          { text: tenant.meterSerialNumber, fontSize: 10, width: '*' },
        ],
        margin: [15, 0, 0, 3],
      });
    }
    
    tenantStack.push(...infoItems);
    
    // Photos in labeled row (Breaker | CT Ratio | Meter)
    const photoColumns: Content[] = [];
    
    if (tenant.breakerImage) {
      const dataUrl = imageCache.get(tenant.breakerImage);
      if (dataUrl) {
        photoColumns.push({
          stack: [
            { text: 'Breaker', fontSize: 9, bold: true, alignment: 'center' as const, margin: [0, 0, 0, 3] },
            { image: dataUrl, fit: [140, 180], alignment: 'center' as const },
          ],
          width: '*',
        });
      }
    }
    
    if (tenant.ctRatioImage) {
      const dataUrl = imageCache.get(tenant.ctRatioImage);
      if (dataUrl) {
        photoColumns.push({
          stack: [
            { text: 'CT Ratio', fontSize: 9, bold: true, alignment: 'center' as const, margin: [0, 0, 0, 3] },
            { image: dataUrl, fit: [140, 180], alignment: 'center' as const },
          ],
          width: '*',
        });
      }
    }
    
    if (tenant.meterImage) {
      const dataUrl = imageCache.get(tenant.meterImage);
      if (dataUrl) {
        photoColumns.push({
          stack: [
            { text: 'Meter', fontSize: 9, bold: true, alignment: 'center' as const, margin: [0, 0, 0, 3] },
            { image: dataUrl, fit: [140, 180], alignment: 'center' as const },
          ],
          width: '*',
        });
      }
    }
    
    if (photoColumns.length > 0) {
      tenantStack.push({
        columns: photoColumns,
        columnGap: 10,
        margin: [0, 10, 0, 0],
      });
    }
    
    content.push({
      stack: tenantStack,
      unbreakable: true,
      margin: [0, idx > 0 ? 15 : 5, 0, 15],
    });
  });
  
  return content;
}

/**
 * Create snags section
 */
function createSnagsSection(
  snags: InspectionSnag[],
  imageCache: Map<string, string>
): Content[] {
  if (!snags?.length) return [];
  
  const content: Content[] = [];
  content.push(createSectionBanner('Observations & Snag List'));
  
  snags.forEach((snag, idx) => {
    const riskColor = snag.riskLevel === 'critical' ? '#ef4444'
      : snag.riskLevel === 'high' ? '#f59e0b'
      : snag.riskLevel === 'medium' ? '#eab308'
      : COLORS.textMuted;
    
    const snagStack: Content[] = [];
    
    // Title with risk level
    snagStack.push({
      columns: [
        { text: snag.title, fontSize: 11, bold: true, width: '*' },
        snag.riskLevel ? {
          text: snag.riskLevel.toUpperCase(),
          fontSize: 9,
          color: riskColor,
          bold: true,
          width: 'auto',
        } : { text: '', width: 0 },
      ],
      margin: [0, 0, 0, 3],
    });
    
    // Status
    snagStack.push({
      text: `Status: ${snag.status}`,
      fontSize: 10,
      color: getStatusColor(snag.status),
      margin: [15, 0, 0, 5],
    });
    
    // Description
    if (snag.description) {
      snagStack.push({
        text: snag.description,
        fontSize: 9,
        color: COLORS.textMuted,
        margin: [15, 0, 0, 8],
      });
    }
    
    // Photos - using fit to maintain aspect ratio
    snag.photos?.forEach((photoUrl) => {
      const dataUrl = imageCache.get(photoUrl);
      if (dataUrl) {
        snagStack.push({
          image: dataUrl,
          fit: [300, 240], // Max width 300pt, max height 240pt
          alignment: 'left' as const,
          margin: [0, 5, 0, 8],
        });
      }
    });
    
    content.push({
      stack: snagStack,
      unbreakable: true,
      margin: [0, idx > 0 ? 12 : 5, 0, 10],
    });
  });
  
  return content;
}

/**
 * Create signatures section
 */
function createSignaturesSection(
  signatures: InspectionSignature[],
  imageCache: Map<string, string>
): Content[] {
  if (!signatures?.length) return [];
  
  const content: Content[] = [];
  content.push(createSectionBanner('Sign-Off'));
  
  const sigColumns: Content[] = [];
  
  signatures.forEach(sig => {
    const sigContent: Content[] = [
      { text: sig.name, fontSize: 11, bold: true },
      { text: sig.role || 'Signatory', fontSize: 9, color: COLORS.textMuted },
    ];
    
    // Add signature image if available
    if (sig.signatureUrl) {
      const dataUrl = sig.signatureUrl.startsWith('data:') 
        ? sig.signatureUrl 
        : imageCache.get(sig.signatureUrl);
      
      if (dataUrl) {
        sigContent.push({
          image: dataUrl,
          width: 120,
          height: 50,
          margin: [0, 8, 0, 0],
        });
      }
    }
    
    if (sig.signedAt) {
      sigContent.push({
        text: `Signed: ${new Date(sig.signedAt).toLocaleDateString('en-GB')}`,
        fontSize: 8,
        color: COLORS.textMuted,
        margin: [0, 5, 0, 0],
      });
    }
    
    sigColumns.push({
      stack: sigContent,
      width: '*',
      margin: [0, 0, 20, 0],
    });
  });
  
  content.push({
    columns: sigColumns,
    margin: [0, 10, 0, 0],
  });
  
  return content;
}

/**
 * Create general info section - matching reference (stacked key-value pairs)
 */
function createGeneralInfoSection(
  inspection: InspectionReportData,
  siteName: string,
  clientName?: string
): Content[] {
  const content: Content[] = [];
  
  content.push(createSectionBanner('General Information'));
  
  const infoRows: Array<{ label: string; value: string }> = [];
  
  infoRows.push({ label: 'Site Name', value: siteName });
  if (inspection.subsectionName) {
    infoRows.push({ label: 'Subsection', value: inspection.subsectionName });
  }
  if (clientName) {
    infoRows.push({ label: 'Client', value: clientName });
  }
  if (inspection.inspectionDate) {
    infoRows.push({ 
      label: 'Inspection Date', 
      value: new Date(inspection.inspectionDate).toLocaleDateString('en-GB', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    });
  }
  if (inspection.inspectorName) {
    infoRows.push({ label: 'Inspector', value: inspection.inspectorName });
  }
  
  // Add any additional general info
  if (inspection.generalInfo) {
    Object.entries(inspection.generalInfo)
      .filter(([key]) => !['inspectorName', 'date', 'inspectionDate'].includes(key))
      .forEach(([key, value]) => {
        if (value) {
          infoRows.push({
            label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
            value: String(value),
          });
        }
      });
  }
  
  // Render as stacked rows (like reference)
  infoRows.forEach(row => {
    content.push({
      columns: [
        { text: row.label, fontSize: 11, bold: true, width: 140 },
        { text: row.value, fontSize: 11, width: '*' },
      ],
      margin: [0, 4, 0, 4],
    });
  });
  
  return content;
}

/**
 * Generate inspection report PDF using pdfmake
 */
export async function generateInspectionReportPdf(
  options: GenerateInspectionReportOptions
): Promise<GenerateInspectionReportResult> {
  const { inspection, siteName, clientName, siteLogoUrl, accentColor = 'blue' } = options;
  
  try {
    console.log('[pdfmake] Starting inspection report generation');
    
    // Collect and load all images
    const imageUrls = collectImageUrls(inspection);
    console.log(`[pdfmake] Loading ${imageUrls.length} images...`);
    
    const imageCache = await loadImagesAsDataUrls(imageUrls);
    console.log(`[pdfmake] Loaded ${imageCache.size} images successfully`);
    
    // Load logo if provided
    let logoDataUrl: string | null = null;
    if (siteLogoUrl) {
      logoDataUrl = await loadImageAsDataUrl(siteLogoUrl);
    }
    
    // Build document content
    const content: Content[] = [];
    
    // General info section
    content.push(...createGeneralInfoSection(inspection, siteName, clientName));
    
    // Inspection sections with items and photos
    inspection.sections?.forEach(section => {
      content.push(...createInspectionSection(section, imageCache));
    });
    
    // Snags section
    if (inspection.snags?.length) {
      content.push(...createSnagsSection(inspection.snags, imageCache));
    }
    
    // Tenant verification section
    if (inspection.tenants?.length) {
      content.push(...createTenantSection(inspection.tenants, imageCache));
    }
    
    // Signatures section
    if (inspection.signatures?.length) {
      content.push(...createSignaturesSection(inspection.signatures, imageCache));
    }
    
    // Cover page options
    const coverPage: CoverPageOptions = {
      title: inspection.templateName || 'Inspection Report',
      subtitle: inspection.subsectionName,
      siteName,
      clientName,
      logoDataUrl,
      accentColor,
      reportDate: inspection.inspectionDate ? new Date(inspection.inspectionDate) : new Date(),
    };
    
    // Generate PDF
    const result = await generateReport({
      type: 'inspection',
      title: inspection.templateName || 'Inspection Report',
      content,
      coverPage,
      options: {
        includeCoverPage: true,
        logoDataUrl,
        filename: `${siteName}_${inspection.subsectionName || 'Inspection'}_Report.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_'),
      },
    });
    
    console.log('[pdfmake] Report generated successfully');
    
    return {
      success: true,
      blob: result.blob,
      previewUrl: result.previewUrl,
      filename: result.filename,
    };
  } catch (error) {
    console.error('[pdfmake] Error generating inspection report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    };
  }
}

/**
 * Generate and save inspection report to storage
 */
export async function generateAndSaveInspectionReportPdfmake(
  options: GenerateInspectionReportOptions & { 
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
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }
    
    // Generate PDF
    const result = await generateInspectionReportPdf(options);
    if (!result.success || !result.blob) {
      return { success: false, error: result.error || 'Failed to generate PDF' };
    }
    
    // Upload to storage
    const fileName = result.filename || 'Inspection_Report.pdf';
    const storagePath = `inspection-reports/${subsectionId}/${Date.now()}_${fileName}`;
    
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, result.blob, {
        contentType: 'application/pdf',
        upsert: true,
      });
    
    if (uploadError) {
      console.error('Upload error:', uploadError);
      return { success: false, error: 'Failed to upload PDF to storage' };
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);
    
    const fileUrl = urlData.publicUrl;
    
    // Find or create "Inspection Reports" category
    const { data: categories } = await supabase
      .from('document_categories')
      .select('id, name')
      .eq('subsection_id', subsectionId);
    
    let categoryId = categories?.find(c => c.name === 'Inspection Reports')?.id;
    
    if (!categoryId) {
      const { data: newCategory } = await supabase
        .from('document_categories')
        .insert({
          name: 'Inspection Reports',
          subsection_id: subsectionId,
          order_index: (categories?.length || 0) + 1,
        })
        .select()
        .single();
      
      if (newCategory) {
        categoryId = newCategory.id;
      }
    }
    
    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('subsection_documents')
      .insert({
        subsection_id: subsectionId,
        category_id: categoryId,
        file_name: fileName,
        file_url: fileUrl,
        uploaded_by: user.id,
      })
      .select()
      .single();
    
    if (docError) {
      console.warn('Could not create document record:', docError);
    }
    
    return {
      success: true,
      documentId: docData?.id,
      fileName,
      fileUrl,
    };
  } catch (error) {
    console.error('Error saving inspection report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save report',
    };
  }
}
