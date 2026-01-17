import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCategoryAbbreviation } from "@/lib/subsectionCategories";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import QRCode from "qrcode";
import {
  generatePdfBlob,
  buildDocument,
  createSectionHeader,
  createInfoTable,
  createDataTable,
  createKpiRow,
  logComplianceCheck,
  COLORS,
  PDFComplianceCheck,
} from "@/lib/pdfMakeUtils";

interface SiteSummaryReportProps {
  siteId: string;
  siteName: string;
  clientName: string;
}

export const SiteSummaryReport = ({ siteId, siteName, clientName }: SiteSummaryReportProps) => {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ url: string; blob: Blob; filename: string } | null>(null);

  const extractSnags = (jsonData: any): any[] => {
    if (!jsonData) return [];
    const snags: any[] = [];

    if (jsonData.sections) {
      jsonData.sections.forEach((section: any) => {
        if (section.items) {
          section.items.forEach((item: any) => {
            if (item.status === 'snag' || item.isSnag) {
              snags.push(item);
            }
          });
        }
      });
    }

    if (jsonData.snags) {
      snags.push(...jsonData.snags);
    }

    return snags;
  };

  // Match dashboard compliance logic exactly (strict multi-point check)
  const calculateSubsectionCompliance = (
    subsection: any,
    snags: any[]
  ): boolean => {
    // If COC is required, status must be Approved/Valid/Pass
    if (subsection.is_coc_required && 
        !['Approved', 'Valid', 'Pass'].includes(subsection.coc_status || '')) {
      return false;
    }
    // If COC is required, metering must not be missing
    if (subsection.is_coc_required && 
        subsection.metering_status === 'Missing' && 
        !subsection.meter_serial_number) {
      return false;
    }
    // Must have zero open snags
    const subsectionSnags = snags.filter(snag =>
      snag.subsection_id === subsection.id &&
      snag.status !== 'rectified' &&
      snag.status !== 'Rectified'
    );
    if (subsectionSnags.length > 0) {
      return false;
    }
    return true;
  };

  // Helper function to generate QR code as base64 data URL
  const generateQRCodeBase64 = async (subsectionId: string): Promise<string | null> => {
    try {
      // Get QR base URL from settings
      const { data: settings } = await supabase
        .from('settings')
        .select('qr_base_url')
        .single();
      
      const baseUrl = (settings?.qr_base_url || 'https://watsonmattheus.com').replace(/\/$/, '');
      const qrTargetUrl = `${baseUrl}/public/subsections/${subsectionId}`;
      
      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(qrTargetUrl, {
        width: 150,
        margin: 1,
        errorCorrectionLevel: 'M'
      });
      
      return dataUrl;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      return null;
    }
  };

  const generatePdfDocument = async (): Promise<{ blob: Blob; filename: string }> => {
    // Fetch all necessary data
    const [siteRes, subsectionsRes, inspectionsRes, docsRes, subsectionDocsRes] = await Promise.all([
      supabase.from("sites").select("*, clients(name, logo_url)").eq("id", siteId).single(),
      supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
      supabase.from("inspections").select("*").eq("site_id", siteId),
      supabase.from("site_documents").select("*").eq("site_id", siteId),
      supabase.from("subsection_documents").select("subsection_id, file_name, category_id"),
    ]);

    if (siteRes.error) throw siteRes.error;

    const site = siteRes.data;
    const subsections = subsectionsRes.data || [];
    const allInspections = inspectionsRes.data || [];
    const siteDocuments = docsRes.data || [];
    const subsectionDocuments = subsectionDocsRes.data || [];

    // Fetch snags separately to avoid type instantiation depth issue
    const subsectionIds = subsections.map(s => s.id);
    const snagsRes = await supabase.from("snags").select("id, subsection_id, status").in("subsection_id", subsectionIds);
    const allSnags = snagsRes.data || [];

    // Get COC validations
    const cocValidationsQuery = await supabase
      .from("coc_validations")
      .select("*")
      .in("subsection_id", subsectionIds)
      .order("validated_at", { ascending: false });

    const cocValidations = cocValidationsQuery.data || [];

    // Calculate metrics - matching dashboard logic exactly
    const cocRequired = subsections.filter(s => s.is_coc_required).length;
    const cocCompliant = subsections.filter(s => s.is_coc_required && ['Approved', 'Valid', 'Pass'].includes(s.coc_status || '')).length;
    const meteringInstalled = subsections.filter(s => s.metering_status === 'Installed' || s.meter_serial_number).length;
    const compliantCount = subsections.filter(s => calculateSubsectionCompliance(s, allSnags)).length;
    const openSnags = allSnags.filter(snag => !['rectified', 'Rectified'].includes(snag.status || '')).length;

    let totalSnags = 0;
    const subsectionsWithSnags = new Set<string>();
    allInspections.forEach(insp => {
      const snags = extractSnags(insp.json_data);
      if (snags.length > 0 && insp.subsection_id) {
        subsectionsWithSnags.add(insp.subsection_id);
        totalSnags += snags.length;
      }
    });

    const subsectionCount = subsections.length || 1;
    const overallHealth = Math.round((compliantCount / subsectionCount) * 100);
    const cocCompliance = cocRequired > 0 ? Math.round((cocCompliant / cocRequired) * 100) : 0;
    const meteringData = Math.round((meteringInstalled / subsectionCount) * 100);
    const snagsPercentage = Math.round((subsectionsWithSnags.size / subsectionCount) * 100);

    // Build content
    const content: any[] = [];

    // ===== HEALTH OVERVIEW PAGE =====
    content.push(createSectionHeader('Health Metrics', 'primary'));

    content.push(createKpiRow([
      { value: `${overallHealth}%`, label: 'Overall Health', color: COLORS.success },
      { value: `${cocCompliance}%`, label: 'COC Compliance', color: COLORS.warning },
      { value: `${meteringData}%`, label: 'Metering Data', color: COLORS.primary },
      { value: `${100 - snagsPercentage}%`, label: 'Snag Free', color: COLORS.error },
    ]));

    // Health by category
    const categoryGroups = subsections.reduce((acc, sub) => {
      const cat = sub.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { total: 0, compliant: 0 };
      acc[cat].total++;
      if (sub.is_compliant) acc[cat].compliant++;
      return acc;
    }, {} as Record<string, { total: number; compliant: number }>);

    const categories = Object.keys(categoryGroups).slice(0, 4);
    if (categories.length > 0) {
      content.push(createSectionHeader('Health by Category'));
      content.push(createKpiRow(
        categories.map(cat => {
          const data = categoryGroups[cat];
          const percentage = Math.round((data.compliant / data.total) * 100) || 0;
          return {
            value: `${percentage}%`,
            label: getCategoryAbbreviation(cat),
            color: percentage >= 80 ? COLORS.success : percentage >= 60 ? COLORS.warning : COLORS.error,
          };
        })
      ));
    }

    // Summary statistics table
    content.push(createSectionHeader('Summary Statistics'));
    content.push(createInfoTable([
      ['Total Subsections', subsections.length.toString()],
      ['COC Required', cocRequired.toString()],
      ['COC Compliant', cocCompliant.toString()],
      ['Metering Installed', meteringInstalled.toString()],
      ['Total Snags', totalSnags.toString()],
      ['Overall Health Rate', `${overallHealth}%`],
    ]));

    // ===== SUBSECTION DETAILS WITH QR CODES =====
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Subsection Details', 'primary'));

    // Create subsection cards with QR codes
    for (const sub of subsections) {
      const subInspections = allInspections.filter(i => i.subsection_id === sub.id);
      const subSnagCount = allSnags.filter(s => s.subsection_id === sub.id && !['rectified', 'Rectified'].includes(s.status || '')).length;
      const subDocs = subsectionDocuments.filter(d => d.subsection_id === sub.id);
      const isCompliant = calculateSubsectionCompliance(sub, allSnags);
      
      // Generate QR code dynamically for this subsection
      const qrCodeBase64 = await generateQRCodeBase64(sub.id);

      // Create card content with QR code in top right
      const cardContent: any[] = [
        {
          columns: [
            {
              width: '*',
              stack: [
                { text: sub.name, style: 'h3', color: COLORS.primary, margin: [0, 0, 0, 4] },
                { text: `Category: ${getCategoryAbbreviation(sub.category || 'Other')}`, fontSize: 9, color: COLORS.textMuted },
              ]
            },
            qrCodeBase64 ? { 
              width: 70,
              stack: [
                { image: qrCodeBase64, width: 55, height: 55, alignment: 'right' as const },
              ]
            } : { width: 0, text: '' },
          ],
          margin: [0, 0, 0, 8],
        },
        {
          columns: [
            { width: '*', text: 'COC Status:', fontSize: 9, bold: true },
            { width: 'auto', text: sub.coc_status || 'Not Set', fontSize: 9, color: sub.coc_status === 'Approved' ? COLORS.success : COLORS.textMuted },
          ],
          margin: [0, 2, 0, 2],
        },
        {
          columns: [
            { width: '*', text: 'Metering:', fontSize: 9, bold: true },
            { width: 'auto', text: sub.metering_status || 'Unknown', fontSize: 9 },
          ],
          margin: [0, 2, 0, 2],
        },
        sub.meter_serial_number ? {
          columns: [
            { width: '*', text: 'Meter S/N:', fontSize: 9, bold: true },
            { width: 'auto', text: sub.meter_serial_number, fontSize: 9 },
          ],
          margin: [0, 2, 0, 2],
        } : null,
        sub.ct_ratio ? {
          columns: [
            { width: '*', text: 'CT Ratio:', fontSize: 9, bold: true },
            { width: 'auto', text: sub.ct_ratio, fontSize: 9 },
          ],
          margin: [0, 2, 0, 2],
        } : null,
        {
          columns: [
            { width: '*', text: 'Snags:', fontSize: 9, bold: true },
            { width: 'auto', text: subSnagCount.toString(), fontSize: 9, color: subSnagCount > 0 ? COLORS.error : COLORS.success },
          ],
          margin: [0, 2, 0, 2],
        },
        {
          columns: [
            { width: '*', text: 'Compliance:', fontSize: 9, bold: true },
            { width: 'auto', text: isCompliant ? '✓ Compliant' : '✗ Non-Compliant', fontSize: 9, color: isCompliant ? COLORS.success : COLORS.error },
          ],
          margin: [0, 2, 0, 2],
        },
      ].filter(Boolean);

      content.push({
        table: {
          widths: ['*'],
          body: [[{ stack: cardContent, margin: [8, 8, 8, 8] }]],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#e2e8f0',
          vLineColor: () => '#e2e8f0',
        },
        margin: [0, 0, 0, 10],
        unbreakable: true,
      });
    }

    // ===== COC VALIDATIONS SUMMARY =====
    if (cocValidations.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('COC Validation Summary', 'primary'));

      const validationRows = cocValidations.slice(0, 20).map(v => {
        const report = (v.report_data || {}) as any;
        const subsection = subsections.find(s => s.id === v.subsection_id);
        return {
          subsection: subsection?.name || 'Unknown',
          cocNumber: report.cocNumber || '-',
          status: report.overallStatus || v.status,
          date: new Date(v.validated_at).toLocaleDateString(),
        };
      });

      content.push(createDataTable(
        [
          { header: 'Subsection', field: 'subsection', width: '*' },
          { header: 'COC Number', field: 'cocNumber', width: 100 },
          { header: 'Status', field: 'status', width: 70, alignment: 'center' },
          { header: 'Date', field: 'date', width: 80 },
        ],
        validationRows
      ));
    }

    // Build document
    const docDefinition = buildDocument({
      title: 'Site Summary Report',
      coverPage: {
        title: 'Site Summary Report',
        subtitle: 'Comprehensive Site Health & Compliance Overview',
        siteName: siteName,
        clientName: clientName,
        reportType: 'Summary Report',
        organizationName: 'Asset Management System',
        reportDate: new Date(),
      },
      content,
    });

    // Generate blob
    const blob = await generatePdfBlob(docDefinition);

    // Log compliance
    logComplianceCheck('SiteSummaryReport', {
      hasCoverPage: true,
      logoPlacement: false,
      standardMargins: true,
      typographyScale: true,
      brandColors: true,
      pageHeaders: true,
      pageFooters: true,
      tableStyles: true,
      pageBreaks: true,
    });

    const filename = `Site_Summary_Report_${siteName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

    return { blob, filename };
  };

  const handlePreview = async () => {
    try {
      setGenerating(true);
      const result = await generatePdfDocument();
      const url = URL.createObjectURL(result.blob);
      setPreviewData({ url, blob: result.blob, filename: result.filename });
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewData?.blob) {
      toast.error("No report to save");
      return;
    }

    try {
      setSaving(true);
      const result = await savePDFToDocuments({
        blob: previewData.blob,
        fileName: previewData.filename,
        siteId,
        categoryName: getReportCategoryName("site-summary"),
      });

      if (result.success) {
        toast.success("Report saved to site documents!");
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error("Error saving report:", error);
      toast.error("Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  const handleClosePreview = () => {
    if (previewData?.url) {
      URL.revokeObjectURL(previewData.url);
    }
    setPreviewData(null);
  };

  return (
    <>
      <Button onClick={handlePreview} disabled={generating} variant="default" size="sm">
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <FileText className="h-4 w-4 mr-2" />
            Generate PDF
          </>
        )}
      </Button>

      <DocumentPreviewDialog
        open={!!previewData}
        onOpenChange={(open) => !open && handleClosePreview()}
        fileUrl={previewData?.url || ""}
        fileName={previewData?.filename || ""}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="site"
        contextName={siteName}
        isSaving={saving}
      />
    </>
  );
};
