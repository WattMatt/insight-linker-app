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
  generateReport,
  createSectionHeader,
  createInfoTable,
  createDataTable,
  createKpiRow,
  COLORS,
} from "@/lib/pdfEngine";
import { loadCompanyBranding, imageUrlToBase64 } from "@/lib/pdfBranding";
import { ReportSection, ReportCustomization } from "@/components/pdf-editor/types";
import { fetchPDFTemplate } from "@/hooks/usePDFTemplateGateway";

// Import from SINGLE SOURCE OF TRUTH
import {
  HEALTH_METRICS_CARDS,
  SUMMARY_STAT_ROWS,
  SUBSECTION_CARD_FIELDS,
  COC_VALIDATION_COLUMNS,
  INSPECTION_COLUMNS,
  SECTION_SPECS,
  STATUS_COLORS,
  getAccentPalette,
  getSectionTitle,
  getEnabledSections,
  findSectionSpec,
  calculateMetrics,
  calculateCategoryHealth,
  type SiteSummaryMetrics,
  type SubsectionData,
  type SnagData,
  LAYOUT,
} from "@/lib/siteSummaryRenderSpec";
import { renderSubsectionGrid } from "@/lib/pdfSubsectionRenderer";
import type { SubsectionCardData } from "@/lib/subsectionCardSpec";

interface SiteSummaryReportProps {
  siteId: string;
  siteName: string;
  clientName: string;
}

interface TemplateConfig {
  customization: ReportCustomization;
  sections: ReportSection[];
}

// Default sections if no template exists in database - ALIGNED WITH SPEC
const DEFAULT_SECTIONS: ReportSection[] = Object.values(SECTION_SPECS).map(spec => ({
  id: spec.id,
  title: spec.defaultTitle,
  type: spec.type,
  enabled: true,
  order: spec.renderPriority,
  editable: true,
}));

const DEFAULT_CUSTOMIZATION: Partial<ReportCustomization> = {
  coverTitle: "Site Summary Report",
  coverSubtitle: "Comprehensive Site Health & Compliance Overview",
  accentColor: "blue",
  includeDate: true,
  includePageNumbers: true,
  includeTableOfContents: false,
};

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
    if (subsection.is_coc_required && 
        !['Approved', 'Valid', 'Pass'].includes(subsection.coc_status || '')) {
      return false;
    }
    if (subsection.is_coc_required && 
        subsection.metering_status === 'Missing' && 
        !subsection.meter_serial_number) {
      return false;
    }
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
  const generateQRCodeBase64 = async (subsectionId: string, qrBaseUrl: string): Promise<string | null> => {
    try {
      const baseUrl = (qrBaseUrl || 'https://watsonmattheus.com').replace(/\/$/, '');
      const qrTargetUrl = `${baseUrl}/public/subsections/${subsectionId}`;
      
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

  // Fetch template configuration using the gateway - SINGLE SOURCE OF TRUTH
  const fetchTemplateConfig = async (): Promise<TemplateConfig> => {
    try {
      const { customization, sections } = await fetchPDFTemplate('site_summary');
      return {
        customization: { ...DEFAULT_CUSTOMIZATION, ...customization } as ReportCustomization,
        sections: sections?.length > 0 ? sections : DEFAULT_SECTIONS,
      };
    } catch (error) {
      console.log("Error fetching template, using defaults:", error);
    }
    
    return {
      customization: DEFAULT_CUSTOMIZATION as ReportCustomization,
      sections: DEFAULT_SECTIONS,
    };
  };

  // Check if a section is enabled in the template
  const isSectionEnabled = (sections: ReportSection[], sectionId: string): boolean => {
    const section = sections.find(s => s.id === sectionId);
    return section?.enabled ?? true;
  };

  // Transform DB subsection to SubsectionCardData (extended for cards)
  const transformToSubsectionCardData = (sub: any, allSnags: any[], qrBaseUrl: string): SubsectionCardData => {
    const subSnags = allSnags.filter(s => 
      s.subsection_id === sub.id && 
      !['rectified', 'Rectified'].includes(s.status || '')
    );
    
    // Generate QR URL if not stored - use public subsection URL
    const qrUrl = sub.qr_code_url || `${qrBaseUrl}/public/subsections/${sub.id}`;
    
    return {
      id: sub.id,
      name: sub.name,
      category: sub.category,
      cocStatus: sub.coc_status,
      cocNumber: sub.coc_number,
      meteringStatus: sub.metering_status,
      meterSerialNumber: sub.meter_serial_number,
      ctRatio: sub.ct_ratio,
      snagCount: subSnags.length,
      isCompliant: calculateSubsectionCompliance(sub, allSnags),
      qrCodeUrl: qrUrl,
      tenantName: sub.tenant_name,
      snags: subSnags.map(s => ({
        id: s.id,
        title: s.title || 'Untitled snag',
        riskLevel: s.risk_level || 'Medium',
        status: s.status,
        description: s.description,
      })) as SnagData[],
    };
  };

  const generatePdfDocument = async (): Promise<{ blob: Blob; filename: string }> => {
    // Fetch template configuration from database - SINGLE SOURCE OF TRUTH
    const templateConfig = await fetchTemplateConfig();
    const { customization, sections } = templateConfig;

    // Debug: Log template configuration being applied
    console.log('[SiteSummaryReport] Template Config Applied:', {
      coverTitle: customization.coverTitle,
      coverSubtitle: customization.coverSubtitle,
      accentColor: customization.accentColor,
      includeDate: customization.includeDate,
      includePageNumbers: customization.includePageNumbers,
      totalSections: sections.length,
      enabledSections: sections.filter(s => s.enabled).map(s => s.id),
      disabledSections: sections.filter(s => !s.enabled).map(s => s.id),
    });

    // Sort sections using spec function
    const sortedSections = getEnabledSections(sections);

    // Fetch all necessary data
    const [siteRes, subsectionsRes, inspectionsRes, docsRes, subsectionDocsRes, settingsRes] = await Promise.all([
      supabase.from("sites").select("*, clients(name, logo_url)").eq("id", siteId).single(),
      supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
      supabase.from("inspections").select("*").eq("site_id", siteId),
      supabase.from("site_documents").select("*").eq("site_id", siteId),
      supabase.from("subsection_documents").select("subsection_id, file_name, category_id"),
      supabase.from("settings").select("qr_base_url").single(),
    ]);

    if (siteRes.error) throw siteRes.error;

    const site = siteRes.data;
    const subsections = subsectionsRes.data || [];
    const allInspections = inspectionsRes.data || [];
    const qrBaseUrl = settingsRes.data?.qr_base_url || 'https://watsonmattheus.com';

    // Fetch snags separately
    const subsectionIds = subsections.map(s => s.id);
    // Fetch snags with full details for card rendering
    const snagsRes = await supabase.from("snags").select("id, subsection_id, title, status, risk_level, description").in("subsection_id", subsectionIds);
    const allSnags = snagsRes.data || [];

    // Get COC validations
    const cocValidationsQuery = await supabase
      .from("coc_validations")
      .select("*")
      .in("subsection_id", subsectionIds)
      .order("validated_at", { ascending: false });

    const cocValidations = cocValidationsQuery.data || [];

    // Transform subsections to card format with snags
    const subsectionCardData: SubsectionCardData[] = subsections.map(sub => 
      transformToSubsectionCardData(sub, allSnags, qrBaseUrl)
    );

    // Also create SubsectionData for metrics calculation
    const subsectionData: SubsectionData[] = subsectionCardData;

    // Calculate metrics using spec function
    const cocRequired = subsections.filter(s => s.is_coc_required).length;
    const openSnags = allSnags.filter(snag => !['rectified', 'Rectified'].includes(snag.status || '')).length;
    const metrics = calculateMetrics(subsectionData, cocRequired, openSnags);

    // Build content based on template sections - USING SPEC CONSTANTS
    const content: any[] = [];

    // Process each section in order, only if enabled
    for (const section of sortedSections) {
      const spec = findSectionSpec(section.id);
      const title = getSectionTitle(section);

      switch (section.id) {
        case "health-metrics":
        case "compliance": // Support legacy section ID
          content.push(createSectionHeader(title, 'primary'));
          // Use HEALTH_METRICS_CARDS from spec
          content.push(createKpiRow(
            HEALTH_METRICS_CARDS.map(card => ({
              value: card.format(card.getValue(metrics)),
              label: card.label,
              color: card.color,
            }))
          ));
          break;

        case "health-by-category":
          // Use calculateCategoryHealth from spec
          const categoryData = calculateCategoryHealth(subsectionData, getCategoryAbbreviation, 4);
          
          if (categoryData.length > 0) {
            content.push(createSectionHeader(title));
            content.push(createKpiRow(
              categoryData.map(cat => ({
                value: `${cat.percentage}%`,
                label: cat.abbreviation,
                color: cat.percentage >= 80 ? STATUS_COLORS.success : 
                       cat.percentage >= 60 ? STATUS_COLORS.warning : STATUS_COLORS.error,
              }))
            ));
          }
          break;

        case "summary-statistics":
        case "site-info": // Support legacy section ID
          content.push(createSectionHeader(title));
          // Use SUMMARY_STAT_ROWS from spec
          content.push(createInfoTable(
            SUMMARY_STAT_ROWS.map(row => [row.label, row.getValue(metrics)])
          ));
          break;

        case "subsection-details":
        case "subsections": // Support legacy section ID
          if (spec?.pageBreakBefore) {
            content.push({ text: '', pageBreak: 'before' });
          }
          // Section header sits directly below page header (no top margin after page break)
          content.push(createSectionHeader(title, 'primary', { noTopMargin: true }));

          // Use the new 2-column subsection grid renderer with full snag details
          const accentColor = getAccentPalette(customization.accentColor || 'blue').primary;
          const subsectionGrid = await renderSubsectionGrid(
            subsectionCardData,
            accentColor,
            null // Logo will be embedded later by pdfEngine
          );
          content.push(subsectionGrid);
          break;

        case "coc-validations":
        case "documents": // Support legacy section ID
          if (cocValidations.length > 0) {
            if (spec?.pageBreakBefore) {
              content.push({ text: '', pageBreak: 'before' });
            }
            content.push(createSectionHeader(title, 'primary'));

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

            // Use COC_VALIDATION_COLUMNS from spec
            content.push(createDataTable(
              COC_VALIDATION_COLUMNS.map(col => ({
                header: col.header,
                field: col.id,
                width: col.width,
                alignment: col.alignment,
              })),
              validationRows
            ));
          }
          break;

        case "inspections":
          if (allInspections.length > 0) {
            if (spec?.pageBreakBefore) {
              content.push({ text: '', pageBreak: 'before' });
            }
            content.push(createSectionHeader(title, 'primary'));

            const inspectionRows = allInspections.slice(0, 20).map(insp => ({
              title: insp.title || 'Untitled',
              status: insp.status || 'Unknown',
              inspector: insp.inspector_name || '-',
              date: insp.inspection_date ? new Date(insp.inspection_date).toLocaleDateString() : '-',
            }));

            // Use INSPECTION_COLUMNS from spec
            content.push(createDataTable(
              INSPECTION_COLUMNS.map(col => ({
                header: col.header,
                field: col.id,
                width: col.width,
                alignment: col.alignment,
              })),
              inspectionRows
            ));
          }
          break;

        // Skip subsection-qr-codes as it's handled within subsection-details
        case "subsection-qr-codes":
          break;

        default:
          // Handle any custom sections
          if (section.textContent) {
            content.push(createSectionHeader(title));
            content.push({ text: section.textContent, fontSize: 10, margin: [0, 0, 0, 10] });
          }
          break;
      }
    }

    // Load branding - prefer client logo from site, fallback to company branding
    const companyBranding = await loadCompanyBranding();
    
    // Use client logo from the already-fetched site data if available
    let logoDataUrl = companyBranding.logoDataUrl;
    if (site?.client_logo_url) {
      const clientLogo = await imageUrlToBase64(site.client_logo_url);
      if (clientLogo) logoDataUrl = clientLogo;
    } else if ((site?.clients as any)?.logo_url) {
      const clientLogo = await imageUrlToBase64((site.clients as any).logo_url);
      if (clientLogo) logoDataUrl = clientLogo;
    }

    // Use unified PDF engine for generation
    const result = await generateReport({
      type: 'site-summary',
      title: customization.coverTitle || 'Site Summary Report',
      content,
      coverPage: {
        title: customization.coverTitle || 'Site Summary Report',
        subtitle: customization.coverSubtitle || 'Comprehensive Site Health & Compliance Overview',
        siteName: siteName,
        clientName: clientName,
        reportType: 'Site Summary Report',
        organizationName: companyBranding.organizationName,
        logoDataUrl: logoDataUrl,
        accentColor: customization.accentColor || 'blue',
        reportDate: new Date(),
        siteAddress: site?.address || undefined,
      },
      options: {
        includeCoverPage: true,
        skipCoverPageInHeaderFooter: true,
        logoDataUrl: logoDataUrl,
        organizationName: companyBranding.organizationName,
        filename: `Site_Summary_Report_${siteName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      },
    });

    console.log('[SiteSummaryReport] Generated via pdfEngine:', result.complianceChecks);

    return { blob: result.blob, filename: result.filename };
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
