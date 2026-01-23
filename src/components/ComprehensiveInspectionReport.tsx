import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { 
  generateInspectionReportPdf, 
  generateAndSaveInspectionReportPdfmake,
  InspectionReportData as PdfmakeInspectionData 
} from "@/lib/pdfmakeInspectionReport";

// Standalone interface for external use
export interface GenerateReportOptions {
  inspectionId: string;
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  clientName?: string;
  templateId?: string | null;
  siteLogoUrl?: string | null;
}

export interface GenerateReportResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

/**
 * Standalone function to generate and save inspection report
 * Uses pdfmake for reliable image handling
 */
export async function generateAndSaveComprehensiveReport(
  options: GenerateReportOptions
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

    // Fetch template
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

    // Fetch snags
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

    // Get jsonData from inspection
    const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
    const generalInfo = jsonData.generalInfo || {};

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
          
          // Extract photos array for photographic documentation
          const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
          
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

    // Build pdfmake inspection data
    const pdfData: PdfmakeInspectionData = {
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

    console.log('[ComprehensiveReport] Generating via pdfmake');

    // Generate and save using pdfmake
    const result = await generateAndSaveInspectionReportPdfmake({
      inspection: pdfData,
      siteName,
      clientName,
      siteLogoUrl,
      subsectionId,
      siteId: inspection.site_id,
    });

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to generate PDF' };
    }

    return {
      success: true,
      documentId: result.documentId,
      fileName: result.fileName,
      fileUrl: result.fileUrl
    };
  } catch (error) {
    console.error("Error generating report:", error);
    return { success: false, error: "Failed to generate report" };
  }
}

interface Snag {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  status: string;
  risk_level?: string;
  estimated_cost?: number;
  photos?: string[];
}

interface ComprehensiveInspectionReportProps {
  inspectionData: any;
  siteName: string;
  subsectionName: string;
  templateId?: string | null;
  subsectionId?: string;
  siteLogoUrl?: string | null;
  inspectionId?: string;
  clientName?: string;
  snags?: Snag[];
}

export const ComprehensiveInspectionReport = ({
  inspectionData,
  siteName,
  subsectionName,
  templateId,
  subsectionId,
  siteLogoUrl,
  inspectionId,
  clientName,
  snags = [],
}: ComprehensiveInspectionReportProps) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePreviewReport = async () => {
    setIsGenerating(true);
    
    try {
      // Fetch template
      let template: any = null;
      if (templateId) {
        const { data: templateData } = await supabase
          .from('inspection_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        template = templateData;
      }

      if (!template) {
        toast.error("Cannot generate report without a template");
        return;
      }

      // Fetch signatures if we have an inspection ID
      let signatures: any[] = [];
      const inspId = inspectionId || inspectionData?.id;
      if (inspId) {
        const { data: sigData } = await supabase
          .from('inspection_signatures')
          .select('*')
          .eq('inspection_id', inspId);
        signatures = sigData || [];
      }

      // Get jsonData from inspection
      const jsonData: Record<string, any> = inspectionData?.jsonData || inspectionData?.json_data || {};
      const generalInfo = jsonData.generalInfo || {};

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
            
            // Extract photos array for photographic documentation
            const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
            
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

      // Build pdfmake inspection data
      const pdfData: PdfmakeInspectionData = {
        inspectionId: inspId || '',
        templateName: template.name,
        inspectorName: generalInfo.inspectorName || inspectionData?.inspector_name,
        inspectionDate: generalInfo.date || inspectionData?.inspection_date,
        status: inspectionData?.status,
        qualityRating: inspectionData?.quality_rating,
        generalInfo,
        sections: sectionsForPdf,
        snags: snags.map(snag => ({
          title: snag.title,
          description: snag.description,
          status: snag.status,
          riskLevel: snag.risk_level,
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

      // Generate using pdfmake
      const result = await generateInspectionReportPdf({
        inspection: pdfData,
        siteName,
        clientName,
        siteLogoUrl,
      });
      
      if (result.success && result.previewUrl) {
        setPreviewUrl(result.previewUrl);
        setPreviewFileName(result.filename || `${subsectionName}_Inspection_Report.pdf`);
        setPreviewOpen(true);
      } else {
        toast.error(result.error || "Failed to generate report");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button onClick={handlePreviewReport} disabled={isGenerating} variant="default">
        <Eye className="mr-2 h-4 w-4" />
        {isGenerating ? "Generating..." : "Preview Report"}
      </Button>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        saveLocation="subsection"
        contextName={subsectionName}
      />
    </>
  );
};
