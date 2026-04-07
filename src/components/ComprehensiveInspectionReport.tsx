import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  InspectionReportPreview,
  InspectionReportData,
} from "@/components/inspection-report";
import { downloadBlob } from "@/lib/fileDownload";
import { completeDownloadHandoff, type PendingDownloadHandoff } from "@/lib/downloadHandoff";

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
  const [reportData, setReportData] = useState<InspectionReportData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePreviewReport = async () => {
    setIsLoading(true);
    console.log('[WYSIWYG Report] Starting preview generation...');
    
    try {
      // Fetch template
      let template: any = null;
      if (templateId) {
        console.log('[WYSIWYG Report] Fetching template:', templateId);
        const { data: templateData, error: templateError } = await supabase
          .from('inspection_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        
        if (templateError) {
          console.error('[WYSIWYG Report] Template fetch error:', templateError);
        }
        template = templateData;
      }

      if (!template) {
        console.error('[WYSIWYG Report] No template found');
        toast.error("Cannot generate report without a template");
        return;
      }

      console.log('[WYSIWYG Report] Template loaded:', template.name);

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

      // Get jsonData from inspection - check multiple possible locations
      let jsonData: Record<string, any> = inspectionData?.jsonData || inspectionData?.json_data || {};
      const generalInfo = jsonData.generalInfo || {};

      console.log('[WYSIWYG Report] inspectionData keys:', Object.keys(inspectionData || {}));
      console.log('[WYSIWYG Report] jsonData keys:', Object.keys(jsonData));
      
      // If jsonData is empty but we have an inspection ID, fetch it directly
      if (Object.keys(jsonData).length === 0 && inspId) {
        console.log('[WYSIWYG Report] jsonData empty, fetching from DB for inspection:', inspId);
        const { data: freshInspection } = await supabase
          .from('inspections')
          .select('json_data')
          .eq('id', inspId)
          .single();
        
        if (freshInspection?.json_data) {
          jsonData = freshInspection.json_data as Record<string, any>;
          console.log('[WYSIWYG Report] Fetched jsonData keys:', Object.keys(jsonData));
        }
      }

      // Build sections data from template
      const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
      
      let totalPhotosFound = 0;
      
      const sectionsForReport = templateSections.map((section: any) => {
        const sectionId = String(section.id ?? '');
        const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
        
        return {
          title: section.name || sectionId,
          items: items.map((item: any, idx: number) => {
            const itemId = String(item.id ?? idx);
            const itemData = jsonData[sectionId]?.[itemId] || {};
            
            // Extract photos array for photographic documentation
            const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
            
            if (photos.length > 0) {
              console.log(`[WYSIWYG Report] Found ${photos.length} photos for ${sectionId}/${itemId}`);
              totalPhotosFound += photos.length;
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
      
      console.log(`[WYSIWYG Report] Total photos found across all sections: ${totalPhotosFound}`);

      // Extract tenant data - jsonData.tenants is stored as an ARRAY, not an object map
      const rawTenants = jsonData.tenants;
      let tenantsForReport: any[] = [];
      
      if (Array.isArray(rawTenants) && rawTenants.length > 0) {
        console.log('[WYSIWYG Report] Extracting tenants from array:', rawTenants.length);
        tenantsForReport = rawTenants.map((tenant: any, idx: number) => ({
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
        const templateTenants = Array.isArray(template.tenants) ? template.tenants : [];
        tenantsForReport = templateTenants.map((tenant: any, idx: number) => {
          const tenantId = String(tenant.id ?? idx);
          const tenantData = rawTenants[tenantId] || {};
          return {
            shopName: tenant.shopName || tenant.name || `Tenant ${idx + 1}`,
            shopNumber: tenant.shopNumber || '',
            meterSerialNumber: tenantData.meterSerialNumber || tenant.meterSerialNumber || '',
            breakerSize: tenantData.breakerSize || tenant.breakerSize || '',
            ctSizeAndRatio: tenantData.ctSizeAndRatio || tenant.ctSizeAndRatio || '',
            meterImage: tenantData.meterImage,
            breakerImage: tenantData.breakerImage,
            ctRatioImage: tenantData.ctRatioImage,
          };
        });
      }
      
      console.log('[WYSIWYG Report] Tenants for report:', tenantsForReport.length);

      // Build WYSIWYG report data
      const data: InspectionReportData = {
        templateName: template.name,
        subsectionName,
        siteName,
        clientName,
        logoUrl: siteLogoUrl,
        inspectorName: generalInfo.inspectorName || inspectionData?.inspector_name,
        inspectionDate: generalInfo.date || inspectionData?.inspection_date,
        status: inspectionData?.status,
        qualityRating: inspectionData?.quality_rating,
        sections: sectionsForReport,
        tenants: tenantsForReport,
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
      };

      console.log('[WYSIWYG Report] Report data prepared:', { 
        sectionsCount: sectionsForReport.length, 
        snagsCount: snags.length,
        signaturesCount: signatures.length,
        tenantsCount: tenantsForReport.length,
      });

      setReportData(data);
      setPreviewOpen(true);
    } catch (error) {
      console.error('[WYSIWYG Report] Preview error:', error);
      toast.error("Failed to generate preview");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePdfGenerated = async (result: {
    success: boolean;
    url?: string;
    blob?: Blob;
    error?: string;
    pendingDownload?: PendingDownloadHandoff | null;
  }) => {
    if (result.success && result.blob) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${subsectionName}_Inspection_Report_${timestamp}.pdf`;
      
      try {
        if (result.pendingDownload) {
          await completeDownloadHandoff(result.pendingDownload, {
            blob: result.blob,
            fileName,
          });
        } else {
          await downloadBlob(result.blob, fileName);
        }
      } catch (downloadError) {
        console.error('[WYSIWYG Report] Download handoff failed:', downloadError);
        toast.error('Failed to start PDF download');
      }
      
      // Optionally save to Supabase storage
      if (subsectionId) {
        try {
          const storagePath = `inspection-reports/${subsectionId}/${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, result.blob, {
              contentType: 'application/pdf',
              upsert: true,
            });
          
          if (!uploadError) {
            // Get public URL
            const { data: urlData } = supabase.storage
              .from('documents')
              .getPublicUrl(storagePath);
            
            // First ensure the category exists
            let categoryId: string | null = null;
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
                  order_index: 999,
                })
                .select('id')
                .single();
              categoryId = newCategory?.id || null;
            }
            
            // Save document record with category_id
            if (categoryId) {
              await supabase.from('subsection_documents').insert({
                subsection_id: subsectionId,
                category_id: categoryId,
                file_name: fileName,
                file_url: urlData.publicUrl,
              });
              console.log('[WYSIWYG Report] Document saved to storage');
            }
          }
        } catch (saveError) {
          console.warn('[WYSIWYG Report] Failed to save to storage:', saveError);
          // Don't show error to user - the PDF was still downloaded
        }
      }
    } else {
      toast.error(result.error || "Failed to generate PDF");
    }
  };

  return (
    <>
      <Button onClick={handlePreviewReport} disabled={isLoading} variant="default">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <Eye className="mr-2 h-4 w-4" />
            Generate Report
          </>
        )}
      </Button>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Inspection Report Preview</DialogTitle>
          </DialogHeader>
          {reportData && (
            <InspectionReportPreview 
              data={reportData} 
              onPdfGenerated={handlePdfGenerated}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

/**
 * Standalone function to generate and save inspection report
 * Uses the WYSIWYG approach - requires browser context
 */
export async function generateAndSaveComprehensiveReport(
  options: GenerateReportOptions
): Promise<GenerateReportResult> {
  // This function now requires browser rendering context
  // Return error for non-interactive use
  console.warn('[WYSIWYG Report] generateAndSaveComprehensiveReport called outside UI context');
  return { 
    success: false, 
    error: "WYSIWYG reports require UI context. Use ComprehensiveInspectionReport component instead." 
  };
}
