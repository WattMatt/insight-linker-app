/**
 * PDFMAKE-BASED INSPECTION REPORT GENERATOR
 * 
 * Uses pdfmake for reliable image handling in inspection reports.
 * This replaces the PDFShift-based approach for inspection reports specifically.
 */

import {
  generateReport,
  createSectionHeader,
  createImage,
  createImageGrid,
  loadImageAsDataUrl,
  COLORS,
  CONTENT_WIDTH_PT,
  createInfoTable,
  createStatusBadge,
  getStatusType,
  CoverPageOptions,
} from './pdfEngine';
import { supabase } from '@/integrations/supabase/client';

// Type definitions
type Content = any;

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
    if (sig.signatureUrl && sig.signatureUrl.startsWith('data:')) {
      // Already a data URL, skip
    } else if (sig.signatureUrl) {
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
    return COLORS.success;
  }
  if (['fail', 'failed', 'no', 'non-compliant', 'bad', 'critical'].includes(statusLower)) {
    return COLORS.error;
  }
  if (['pending', 'in progress', 'partial', 'warning', 'n/a'].includes(statusLower)) {
    return COLORS.warning;
  }
  return COLORS.textMuted;
}

/**
 * Create section content for inspection items - INLINE PHOTOS per item
 * Structure: Item Name → Status: Value → Photo(s) directly below
 */
function createInspectionSection(
  section: InspectionSection,
  imageCache: Map<string, string>
): Content[] {
  const content: Content[] = [];
  
  // Section header
  content.push(createSectionHeader(section.title));
  
  // Render each item with its photos inline - wrapped in unbreakable stack
  section.items?.forEach((item, itemIdx) => {
    const statusText = typeof item.value === 'boolean'
      ? (item.value ? 'Pass' : 'Fail')
      : String(item.value || 'N/A');
    
    const statusColor = getStatusColor(statusText);
    
    // Build item stack content
    const itemStack: Content[] = [];
    
    // Item name (bold)
    itemStack.push({
      text: item.label,
      fontSize: 11,
      bold: true,
      margin: [0, 0, 0, 2],
    });
    
    // Status line (colored, slightly indented)
    itemStack.push({
      text: `Status: ${statusText}`,
      fontSize: 9,
      color: statusColor,
      margin: [8, 0, 0, 4],
    });
    
    // Notes if present
    if (item.notes) {
      itemStack.push({
        text: item.notes,
        fontSize: 8,
        color: COLORS.textMuted,
        italics: true,
        margin: [8, 0, 0, 6],
      });
    }
    
    // Photos inline for this item
    const itemPhotos: Array<{ dataUrl: string; caption?: string }> = [];
    item.photos?.forEach((photoUrl, idx) => {
      const dataUrl = imageCache.get(photoUrl);
      if (dataUrl) {
        itemPhotos.push({
          dataUrl,
          caption: `Photo ${idx + 1}`,
        });
      }
    });
    
    if (itemPhotos.length > 0) {
      const columns = itemPhotos.length === 1 ? 1 : Math.min(itemPhotos.length, 2);
      const imageWidth = columns === 1 ? 180 : 140;
      itemStack.push({
        ...createImageGrid(itemPhotos, columns, imageWidth),
        margin: [8, 4, 0, 0],
      });
    }
    
    // Wrap entire item in unbreakable stack to keep header + photos together
    content.push({
      stack: itemStack,
      unbreakable: true,
      margin: [0, itemIdx > 0 ? 16 : 8, 0, 8],
    });
  });
  
  return content;
}

/**
 * Create tenant verification section
 */
function createTenantSection(
  tenants: InspectionTenant[],
  imageCache: Map<string, string>
): Content[] {
  if (!tenants?.length) return [];
  
  const content: Content[] = [];
  content.push(createSectionHeader('Tenant Verification'));
  
  tenants.forEach((tenant, idx) => {
    // Tenant header
    content.push({
      text: `${tenant.shopNumber ? `${tenant.shopNumber} - ` : ''}${tenant.shopName}`,
      fontSize: 11,
      bold: true,
      margin: [0, idx > 0 ? 15 : 5, 0, 5],
    });
    
    // Tenant info table
    const infoRows: [string, string][] = [];
    if (tenant.meterSerialNumber) infoRows.push(['Meter S/N', tenant.meterSerialNumber]);
    if (tenant.breakerSize) infoRows.push(['Breaker Size', tenant.breakerSize]);
    if (tenant.ctSizeAndRatio) infoRows.push(['CT Ratio', tenant.ctSizeAndRatio]);
    
    if (infoRows.length > 0) {
      content.push(createInfoTable(infoRows));
    }
    
    // Tenant photos - 3 column grid
    const tenantPhotos: Array<{ dataUrl: string; caption?: string }> = [];
    
    if (tenant.breakerImage) {
      const dataUrl = imageCache.get(tenant.breakerImage);
      if (dataUrl) tenantPhotos.push({ dataUrl, caption: 'Breaker' });
    }
    if (tenant.ctRatioImage) {
      const dataUrl = imageCache.get(tenant.ctRatioImage);
      if (dataUrl) tenantPhotos.push({ dataUrl, caption: 'CT Ratio' });
    }
    if (tenant.meterImage) {
      const dataUrl = imageCache.get(tenant.meterImage);
      if (dataUrl) tenantPhotos.push({ dataUrl, caption: 'Meter' });
    }
    
    if (tenantPhotos.length > 0) {
      content.push(createImageGrid(tenantPhotos, 3, 150));
    }
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
  content.push(createSectionHeader('Issues / Snags'));
  
  snags.forEach((snag, idx) => {
    const riskColor = snag.riskLevel === 'critical' ? COLORS.error
      : snag.riskLevel === 'high' ? COLORS.warning
      : snag.riskLevel === 'medium' ? '#f59e0b'
      : COLORS.textMuted;
    
    content.push({
      columns: [
        { text: snag.title, fontSize: 10, bold: true, width: '*' },
        createStatusBadge(snag.status, getStatusType(snag.status)),
        snag.riskLevel ? {
          text: snag.riskLevel.toUpperCase(),
          fontSize: 8,
          color: riskColor,
          bold: true,
          width: 60,
          alignment: 'right',
        } : { text: '', width: 60 },
      ],
      margin: [0, idx > 0 ? 10 : 0, 0, 3],
    });
    
    if (snag.description) {
      content.push({
        text: snag.description,
        fontSize: 9,
        color: COLORS.textMuted,
        margin: [0, 0, 0, 5],
      });
    }
    
    // Snag photos
    const snagPhotos: Array<{ dataUrl: string; caption?: string }> = [];
    snag.photos?.forEach((photoUrl, photoIdx) => {
      const dataUrl = imageCache.get(photoUrl);
      if (dataUrl) {
        snagPhotos.push({ dataUrl, caption: `Photo ${photoIdx + 1}` });
      }
    });
    
    if (snagPhotos.length > 0) {
      content.push(createImageGrid(snagPhotos, 3, 150));
    }
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
  content.push(createSectionHeader('Sign-Off'));
  
  const sigColumns: Content[] = [];
  
  signatures.forEach(sig => {
    const sigContent: Content[] = [
      { text: sig.name, fontSize: 10, bold: true },
      { text: sig.role || 'Signatory', fontSize: 8, color: COLORS.textMuted },
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
          margin: [0, 5, 0, 0],
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
    if (inspection.generalInfo && Object.keys(inspection.generalInfo).length > 0) {
      content.push(createSectionHeader('General Information'));
      const infoRows: [string, string][] = Object.entries(inspection.generalInfo)
        .filter(([key]) => key !== 'inspectorName' && key !== 'date')
        .map(([key, value]): [string, string] => [
          key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
          String(value || '-'),
        ]);
      
      // Add inspector and date
      if (inspection.inspectorName) {
        infoRows.unshift(['Inspector', inspection.inspectorName]);
      }
      if (inspection.inspectionDate) {
        infoRows.unshift(['Date', new Date(inspection.inspectionDate).toLocaleDateString('en-GB')]);
      }
      
      if (infoRows.length > 0) {
        content.push(createInfoTable(infoRows));
      }
    }
    
    // Inspection sections with items and photos
    inspection.sections?.forEach(section => {
      content.push(...createInspectionSection(section, imageCache));
    });
    
    // Tenant verification section
    if (inspection.tenants?.length) {
      content.push(...createTenantSection(inspection.tenants, imageCache));
    }
    
    // Snags section
    if (inspection.snags?.length) {
      content.push(...createSnagsSection(inspection.snags, imageCache));
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
