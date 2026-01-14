import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCategoryAbbreviation } from "@/lib/subsectionCategories";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
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

  const calculateSubsectionCompliance = (
    subsection: any,
    inspections: any[],
    documents: any[]
  ): boolean => {
    const hasCoc = subsection.coc_status === 'Approved' ||
                   subsection.coc_status === 'Valid' ||
                   subsection.coc_status === 'Pass';
    const hasDocuments = documents.some(d => d.subsection_id === subsection.id);
    return hasCoc || hasDocuments || subsection.is_compliant;
  };

  const generatePdfDocument = async (): Promise<{ blob: Blob; filename: string }> => {
    // Fetch all necessary data
    const [siteRes, subsectionsRes, inspectionsRes, docsRes, subsectionDocsRes] = await Promise.all([
      supabase.from("sites").select("*, clients(name)").eq("id", siteId).single(),
      supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
      supabase.from("inspections").select("*").eq("site_id", siteId),
      supabase.from("site_documents").select("*").eq("site_id", siteId),
      supabase.from("subsection_documents").select("subsection_id, file_name, category_id")
    ]);

    if (siteRes.error) throw siteRes.error;

    const site = siteRes.data;
    const subsections = subsectionsRes.data || [];
    const allInspections = inspectionsRes.data || [];
    const siteDocuments = docsRes.data || [];
    const subsectionDocuments = subsectionDocsRes.data || [];

    // Get COC validations
    const subsectionIds = subsections.map(s => s.id);
    const cocValidationsQuery = await supabase
      .from("coc_validations")
      .select("*")
      .in("subsection_id", subsectionIds)
      .order("validated_at", { ascending: false });

    const cocValidations = cocValidationsQuery.data || [];

    // Calculate metrics
    const cocRequired = subsections.filter(s => s.is_coc_required).length;
    const cocCompliant = subsections.filter(s => ['Approved', 'Valid', 'Pass'].includes(s.coc_status)).length;
    const meteringInstalled = subsections.filter(s => s.metering_status === 'Installed' || s.meter_serial_number).length;
    const compliantCount = subsections.filter(s => calculateSubsectionCompliance(s, allInspections, subsectionDocuments)).length;

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

    // ===== SUBSECTION DETAILS =====
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Subsection Details', 'primary'));

    content.push(createDataTable(
      [
        { header: 'Name', field: 'name', width: '*' },
        { header: 'Category', field: 'category', width: 80 },
        { header: 'COC Status', field: 'cocStatus', width: 80 },
        { header: 'Metering', field: 'metering', width: 70 },
        { header: 'Status', field: 'status', width: 70, alignment: 'center' },
      ],
      subsections.map(sub => ({
        name: sub.name,
        category: getCategoryAbbreviation(sub.category || 'Other'),
        cocStatus: sub.coc_status || 'Not Set',
        metering: sub.metering_status || 'Unknown',
        status: calculateSubsectionCompliance(sub, allInspections, subsectionDocuments) ? '✓' : '✗',
      }))
    ));

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
            <Eye className="h-4 w-4 mr-2" />
            Preview Report
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
