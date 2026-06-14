import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import {
  generateInspectionReportPdf,
  type InspectionReportData,
} from "@/lib/pdfmakeInspectionReport";
import { savePDFToDocuments } from "@/lib/pdfDocumentSaver";

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
  const [isLoading, setIsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ url: string; blob: Blob; filename: string } | null>(null);

  const handleGenerateReport = async () => {
    setIsLoading(true);
    try {
      // Fetch template
      let template: any = null;
      if (templateId) {
        const { data: templateData, error: templateError } = await supabase
          .from('inspection_templates')
          .select('*')
          .eq('id', templateId)
          .maybeSingle();
        if (templateError && process.env.NODE_ENV === 'development') {
          console.error('[Inspection Report] Template fetch error:', templateError);
        }
        template = templateData;
      }

      if (!template) {
        toast.error("Cannot generate report without a template");
        return;
      }

      // Fetch signatures
      let signatures: any[] = [];
      const inspId = inspectionId || inspectionData?.id;
      if (inspId) {
        const { data: sigData } = await supabase
          .from('inspection_signatures')
          .select('*')
          .eq('inspection_id', inspId);
        signatures = sigData || [];
      }

      // Resolve jsonData (props, then a fresh fetch if empty)
      let jsonData: Record<string, any> = inspectionData?.jsonData || inspectionData?.json_data || {};
      if (Object.keys(jsonData).length === 0 && inspId) {
        const { data: freshInspection } = await supabase
          .from('inspections')
          .select('json_data')
          .eq('id', inspId)
          .single();
        if (freshInspection?.json_data) jsonData = freshInspection.json_data as Record<string, any>;
      }
      const generalInfo = jsonData.generalInfo || {};

      // Build sections from template + recorded values/photos
      const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections || {});
      const sectionsForReport = templateSections.map((section: any) => {
        const sectionId = String(section.id ?? '');
        const items = Array.isArray(section.items) ? section.items : Object.values(section.items || {});
        return {
          title: section.name || sectionId,
          items: items.map((item: any, idx: number) => {
            const itemId = String(item.id ?? idx);
            const itemData = jsonData[sectionId]?.[itemId] || {};
            const photos = Array.isArray(itemData.photos) ? itemData.photos : [];
            return {
              label: item.name || itemId,
              value: itemData.status || itemData.value || 'N/A',
              type: item.type || 'text',
              notes: itemData.notes || '',
              photos,
            };
          }),
        };
      });

      // Extract tenants (array, or legacy object map keyed by template tenant id)
      const rawTenants = jsonData.tenants;
      let tenantsForReport: any[] = [];
      if (Array.isArray(rawTenants) && rawTenants.length > 0) {
        tenantsForReport = rawTenants.map((tenant: any, idx: number) => ({
          shopName: tenant.shopName || `Tenant ${idx + 1}`,
          shopNumber: tenant.shopNumber || '',
          meterSerialNumber: tenant.meterSerialNumber || '',
          breakerSize: tenant.breakerSize || '',
          ctSizeAndRatio: tenant.ctSizeAndRatio || '',
          meterImage: tenant.meterImage || null,
          breakerImage: tenant.breakerImage || null,
          ctRatioImage: tenant.ctRatioImage || null,
        }));
      } else if (rawTenants && typeof rawTenants === 'object') {
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
            meterImage: tenantData.meterImage || null,
            breakerImage: tenantData.breakerImage || null,
            ctRatioImage: tenantData.ctRatioImage || null,
          };
        });
      }

      // Build the pdfmake inspection payload (same shape as the bulk generator)
      const data: InspectionReportData = {
        inspectionId: inspId || '',
        templateName: template.name,
        subsectionName,
        inspectorName: generalInfo.inspectorName || inspectionData?.inspector_name,
        inspectionDate: generalInfo.date || inspectionData?.inspection_date,
        status: inspectionData?.status,
        qualityRating: inspectionData?.quality_rating ?? undefined,
        generalInfo,
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

      const result = await generateInspectionReportPdf({
        inspection: data,
        siteName,
        clientName,
        siteLogoUrl,
      });

      if (!result.success || !result.blob) {
        toast.error(result.error || "Failed to generate report");
        return;
      }

      const url = URL.createObjectURL(result.blob);
      setPreviewData({
        url,
        blob: result.blob,
        filename: result.filename || `${subsectionName}_Inspection_Report.pdf`,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('[Inspection Report] Generate error:', error);
      toast.error("Failed to generate report");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewData?.blob || !subsectionId) {
      toast.error("Cannot save report");
      return;
    }
    try {
      setSaving(true);
      const res = await savePDFToDocuments({
        blob: previewData.blob,
        fileName: previewData.filename,
        subsectionId,
        categoryName: 'Inspection Reports',
      });
      if (res.success) {
        toast.success("Report saved to documents!");
      } else {
        toast.error(res.error || "Failed to save report");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClosePreview = () => {
    if (previewData?.url) URL.revokeObjectURL(previewData.url);
    setPreviewData(null);
  };

  return (
    <>
      <Button onClick={handleGenerateReport} disabled={isLoading} variant="default">
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Eye className="mr-2 h-4 w-4" />
            Generate Report
          </>
        )}
      </Button>

      <DocumentPreviewDialog
        open={!!previewData}
        onOpenChange={(open) => !open && handleClosePreview()}
        fileUrl={previewData?.url || ""}
        fileName={previewData?.filename || ""}
        onSaveToDocuments={subsectionId ? handleSaveToDocuments : undefined}
        saveLocation="subsection"
        contextName={subsectionName}
        isSaving={saving}
      />
    </>
  );
};
