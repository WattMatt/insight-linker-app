/**
 * Inspection Report Generator
 * Migrated to use unified PDFShift-based generation via generate-pdf edge function
 */

import { supabase } from "@/integrations/supabase/client";

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
 * Generates a comprehensive inspection report PDF using PDFShift and saves it to the documents folder
 */
export async function generateAndSaveInspectionReport(
  options: GenerateAndSaveReportOptions
): Promise<GenerateReportResult> {
  const { inspectionId, subsectionId, siteName, subsectionName, clientName, templateId, siteLogoUrl } = options;

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

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

    // Build sections data from template
    const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
    const sectionsForPdf = templateSections.map((section: any) => {
      const sectionId = String(section.id ?? '');
      const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
      
      return {
        title: section.name || sectionId,
        items: items.map((item: any, idx: number) => {
          const itemId = String(item.id ?? idx);
          const itemData = jsonData[sectionId]?.[itemId] || {};
          
          return {
            label: item.name || itemId,
            value: itemData.status || itemData.value || 'N/A',
            type: item.type || 'text',
          };
        }),
      };
    });

    // Build report data payload
    const reportData = {
      reportType: 'inspection' as const,
      title: template.name || 'Inspection Report',
      subtitle: `${siteName} - ${subsectionName}`,
      siteName,
      clientName,
      siteId: inspection.site_id,
      subsectionId,
      companyLogoUrl: siteLogoUrl,
      generatedAt: new Date().toISOString(),
      inspection: {
        inspectionId,
        templateName: template.name,
        inspectorName: generalInfo.inspectorName || inspection.inspector_name,
        inspectionDate: generalInfo.date || inspection.inspection_date,
        status: inspection.status,
        qualityRating: inspection.quality_rating,
        generalInfo,
        sections: sectionsForPdf,
        snags: snags.map(snag => ({
          title: snag.title,
          description: snag.description,
          status: snag.status,
          riskLevel: snag.risk_level,
        })),
        signatures: signatures.map(sig => ({
          name: sig.signer_name,
          role: sig.signer_type,
          signatureUrl: sig.signature_data,
          signedAt: sig.signed_at,
        })),
        subsectionName,
      },
    };

    console.log('[InspectionReport] Generating via PDFShift edge function');

    const { data: result, error } = await supabase.functions.invoke('generate-pdf', {
      body: reportData,
    });

    if (error) {
      console.error('PDF generation error:', error);
      return { success: false, error: error.message || 'Failed to generate PDF' };
    }

    if (!result?.url) {
      return { success: false, error: 'No storage URL received from PDF generation' };
    }

    // The edge function already saves to storage and creates site_documents record
    // We just need to create/update the subsection_documents record
    
    const sanitizedSite = siteName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const sanitizedSubsection = subsectionName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = result.filename || `${sanitizedSite}_${sanitizedSubsection}_Inspection_${dateStr}.pdf`;

    // Find or create "Inspection Reports" category
    const { data: categories } = await supabase
      .from("document_categories")
      .select("id, name")
      .eq("subsection_id", subsectionId);

    let categoryId = categories?.find(c => c.name === "Inspection Reports")?.id;

    if (!categoryId) {
      const { data: newCategory, error: categoryError } = await supabase
        .from("document_categories")
        .insert({
          name: "Inspection Reports",
          subsection_id: subsectionId,
          order_index: (categories?.length || 0) + 1
        })
        .select()
        .single();

      if (categoryError) {
        console.warn('Could not create category, report still saved:', categoryError);
      } else {
        categoryId = newCategory.id;
      }
    }

    // Check for existing document and create/update
    const { data: existingDoc } = await supabase
      .from('subsection_documents')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('file_name', fileName)
      .maybeSingle();

    let docId: string;
    if (existingDoc) {
      await supabase
        .from('subsection_documents')
        .update({
          file_url: result.url,
          uploaded_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id);
      docId = existingDoc.id;
    } else {
      const { data: docData, error: docError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: result.url,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        console.warn('Could not create document record:', docError);
        docId = '';
      } else {
        docId = docData.id;
      }
    }

    return {
      success: true,
      documentId: docId,
      fileName,
      fileUrl: result.url,
    };
  } catch (error) {
    console.error('Error generating inspection report:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to generate report' 
    };
  }
}
