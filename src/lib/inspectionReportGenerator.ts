/**
 * Inspection Report Generator
 * Uses pdfmake (client-side) for reliable PDF generation
 * without external API dependencies.
 */

import { supabase } from "@/integrations/supabase/client";
import { 
  generateAndSaveInspectionReportPdfmake as pdfmakeGenerateAndSave,
  InspectionReportData 
} from "@/lib/pdfmakeInspectionReport";

interface GenerateAndSaveReportOptions {
  inspectionId: string;
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  clientName?: string;
  templateId?: string | null;
  siteLogoUrl?: string | null;
}

interface GenerateReportResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Generates a comprehensive inspection report PDF using pdfmake (client-side)
 * and saves it to the documents folder
 */
export async function generateAndSaveInspectionReport(
  options: GenerateAndSaveReportOptions
): Promise<GenerateReportResult> {
  const { inspectionId, subsectionId, siteName, subsectionName, clientName, templateId, siteLogoUrl } = options;

  try {
    console.log('[InspectionReport] Starting pdfmake generation...');
    
    // Fetch inspection data
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return { success: false, error: "Failed to fetch inspection data" };
    }

    // Fetch template if available
    const effectiveTemplateId = templateId || inspection.template_id;
    let template: any = null;
    if (effectiveTemplateId) {
      const { data: templateData } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', effectiveTemplateId)
        .maybeSingle();
      template = templateData;
    }

    if (!template) {
      return { success: false, error: "Cannot generate report without a template" };
    }

    // Get jsonData from inspection
    const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
    const generalInfo = jsonData.generalInfo || {};

    // Fetch snags for this subsection
    const { data: snagsData } = await supabase
      .from('snags')
      .select('*')
      .eq('subsection_id', subsectionId);
    const snags = snagsData || [];

    // Fetch signatures
    const { data: signaturesData } = await supabase
      .from('inspection_signatures')
      .select('*')
      .eq('inspection_id', inspectionId);
    const signatures = signaturesData || [];

    // Build sections data from template - including photos!
    const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
    
    console.log('[InspectionReport] Template sections count:', templateSections.length);
    console.log('[InspectionReport] jsonData keys:', Object.keys(jsonData));
    
    let totalPhotosExtracted = 0;
    
    const sectionsForPdf = templateSections.map((section: any) => {
      const sectionId = String(section.id ?? '');
      const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
      const sectionData = jsonData[sectionId];
      
      console.log(`[InspectionReport] Section "${sectionId}": data exists = ${!!sectionData}, item keys = ${sectionData ? Object.keys(sectionData).join(', ') : 'N/A'}`);
      
      return {
        title: section.name || sectionId,
        items: items.map((item: any, idx: number) => {
          const itemId = String(item.id ?? idx);
          const itemData = jsonData[sectionId]?.[itemId] || {};
          
          // Extract photos array from the item data
          const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
          
          if (photos.length > 0) {
            console.log(`[InspectionReport] Found ${photos.length} photos for ${sectionId}/${itemId}`);
            totalPhotosExtracted += photos.length;
          }
          
          return {
            label: item.name || itemId,
            value: itemData.status || itemData.value || 'N/A',
            type: item.type || 'text',
            notes: itemData.notes || '',
            photos: photos,
          };
        }),
      };
    });
    
    console.log('[InspectionReport] Total photos extracted:', totalPhotosExtracted);

    // Extract tenants - jsonData.tenants is stored as an ARRAY, not an object map
    // Support both array format (from InspectionDetail) and object format (legacy)
    const rawTenants = jsonData.tenants;
    let tenants: any[] = [];
    
    if (Array.isArray(rawTenants) && rawTenants.length > 0) {
      // Tenants stored as array - direct extraction
      console.log('[InspectionReport] Extracting tenants from array:', rawTenants.length);
      tenants = rawTenants.map((tenant: any, idx: number) => ({
        shopName: tenant.shopName || `Tenant ${idx + 1}`,
        shopNumber: tenant.shopNumber || '',
        meterSerialNumber: tenant.meterSerialNumber || '',
        breakerSize: tenant.breakerSize || '',
        ctSizeAndRatio: tenant.ctSizeAndRatio || '',
        meterImage: tenant.meterImage || undefined,
        breakerImage: tenant.breakerImage || undefined,
        ctRatioImage: tenant.ctRatioImage || undefined,
      }));
    } else if (rawTenants && typeof rawTenants === 'object') {
      // Legacy: tenants stored as object map
      console.log('[InspectionReport] Extracting tenants from object map');
      tenants = Object.values(rawTenants).map((tenant: any, idx: number) => ({
        shopName: tenant.shopName || `Tenant ${idx + 1}`,
        shopNumber: tenant.shopNumber || '',
        meterSerialNumber: tenant.meterSerialNumber || '',
        breakerSize: tenant.breakerSize || '',
        ctSizeAndRatio: tenant.ctSizeAndRatio || '',
        meterImage: tenant.meterImage || undefined,
        breakerImage: tenant.breakerImage || undefined,
        ctRatioImage: tenant.ctRatioImage || undefined,
      }));
    }
    
    console.log('[InspectionReport] Final tenants for PDF:', tenants.length);
    if (tenants.length > 0) {
      console.log('[InspectionReport] First tenant sample:', tenants[0]);
    }

    // Build inspection data for pdfmake
    const inspectionData: InspectionReportData = {
      inspectionId,
      templateName: template.name,
      inspectorName: generalInfo.inspectorName || inspection.inspector_name,
      inspectionDate: generalInfo.date || inspection.inspection_date,
      status: inspection.status,
      qualityRating: inspection.quality_rating,
      generalInfo,
      sections: sectionsForPdf,
      tenants,
      snags: snags.map(snag => ({
        title: snag.title,
        description: snag.description || undefined,
        status: snag.status,
        riskLevel: snag.risk_level || undefined,
        photos: Array.isArray(snag.photos) ? (snag.photos as string[]) : [],
      })),
      signatures: signatures.map(sig => ({
        name: sig.signer_name,
        role: sig.signer_type,
        signatureUrl: sig.signature_data,
        signedAt: sig.signed_at,
      })),
      subsectionName,
    };

    console.log('[InspectionReport] Generating via pdfmake (client-side)');

    // Generate using pdfmake (client-side - no external API dependencies)
    const result = await pdfmakeGenerateAndSave({
      inspection: inspectionData,
      siteName,
      clientName,
      siteLogoUrl,
      subsectionId,
    });

    return result;
  } catch (error) {
    console.error('Error generating inspection report:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate report' 
    };
  }
}
