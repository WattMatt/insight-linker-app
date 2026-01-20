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
  ASSET_VERIFICATION_CARDS,
  SECTION_SPECS,
  STATUS_COLORS,
  getAccentPalette,
  getSectionTitle,
  getEnabledSections,
  findSectionSpec,
  calculateMetrics,
  calculateCategoryHealth,
  calculateAssetMetrics,
  calculateFortressMetrics,
  calculateDocumentMetrics,
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
  const transformToSubsectionCardData = (sub: any, allSnags: any[], qrBaseUrl: string, assets: any[]): SubsectionCardData => {
    const subSnags = allSnags.filter(s => 
      s.subsection_id === sub.id && 
      !['rectified', 'Rectified'].includes(s.status || '')
    );
    
    // Generate QR URL if not stored - use public subsection URL
    const qrUrl = sub.qr_code_url || `${qrBaseUrl}/public/subsections/${sub.id}`;
    
    // Find matching asset by premises_id containing the subsection name
    // premises_id may have format like "YA - KIOSK" while subsection name is just "KIOSK"
    const subNameNorm = sub.name?.toLowerCase().trim() || '';
    const matchingAsset = assets.find(a => {
      const premisesNorm = a.premises_id?.toLowerCase().trim() || '';
      // Check for exact match or if premises_id ends with the subsection name
      return premisesNorm === subNameNorm || 
             premisesNorm.endsWith(` - ${subNameNorm}`) ||
             premisesNorm.endsWith(`-${subNameNorm}`);
    });
    
    return {
      id: sub.id,
      name: sub.name,
      category: sub.category,
      cocStatus: sub.coc_status,
      cocNumber: sub.coc_number,
      meteringStatus: sub.metering_status,
      meterSerialNumber: sub.meter_serial_number,
      ctRatio: sub.ct_ratio,
      breakerSize: matchingAsset?.breaker_size || null,
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

    // Fetch site and subsection data first to get subsection IDs
    const [siteRes, subsectionsRes] = await Promise.all([
      supabase.from("sites").select("*, clients(name, logo_url)").eq("id", siteId).single(),
      supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
    ]);

    if (siteRes.error) throw siteRes.error;
    const site = siteRes.data;
    const subsections = subsectionsRes.data || [];
    const subsectionIds = subsections.map(s => s.id);

    // Fetch remaining data with proper filtering
    const [inspectionsRes, docsRes, subsectionDocsRes, settingsRes, assetsRes, checklistRes] = await Promise.all([
      supabase.from("inspections").select("*").eq("site_id", siteId),
      supabase.from("site_documents").select("*, site_document_categories(name)").eq("site_id", siteId),
      // CRITICAL FIX: Filter subsection documents by subsection IDs belonging to this site
      subsectionIds.length > 0 
        ? supabase.from("subsection_documents").select("subsection_id, file_name, category_id, document_categories(name)").in("subsection_id", subsectionIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.from("settings").select("qr_base_url").single(),
      supabase.from("site_assets").select("id, meter_serial_number, ct_ratio, breaker_size, premises_id, asset_category").eq("site_id", siteId).eq("asset_category", "electrical_meter"),
      supabase.from("site_marking_checklist").select("section_name, is_checked, status").eq("site_id", siteId),
    ]);

    const allInspections = inspectionsRes.data || [];
    const siteAssets = assetsRes.data || [];
    const qrBaseUrl = settingsRes.data?.qr_base_url || 'https://watsonmattheus.com';

    // Fetch snags with full details for card rendering
    const snagsRes = subsectionIds.length > 0 
      ? await supabase.from("snags").select("id, subsection_id, title, status, risk_level, description").in("subsection_id", subsectionIds)
      : { data: [], error: null };
    const allSnags = snagsRes.data || [];

    // Get COC validations
    const cocValidationsQuery = await supabase
      .from("coc_validations")
      .select("*")
      .in("subsection_id", subsectionIds)
      .order("validated_at", { ascending: false });

    const cocValidations = cocValidationsQuery.data || [];

    // Transform subsections to card format with snags and asset breaker size
    const subsectionCardData: SubsectionCardData[] = subsections.map(sub => 
      transformToSubsectionCardData(sub, allSnags, qrBaseUrl, siteAssets)
    );

    // Also create SubsectionData for metrics calculation
    const subsectionData: SubsectionData[] = subsectionCardData;

    // Calculate metrics using spec function
    const cocRequired = subsections.filter(s => s.is_coc_required).length;
    const openSnags = allSnags.filter(snag => !['rectified', 'Rectified'].includes(snag.status || '')).length;
    const metrics = calculateMetrics(subsectionData, cocRequired, openSnags);

    // Calculate asset verification metrics using inspection json_data
    const assetMetrics = calculateAssetMetrics(siteAssets, allInspections);

    // Calculate Fortress checklist metrics
    const checklistItems = checklistRes.data || [];
    const fortressMetrics = calculateFortressMetrics(checklistItems);

    // Build content based on template sections - USING SPEC CONSTANTS
    const content: any[] = [];

    // Debug: Log data availability for conditional sections
    console.log('[SiteSummaryReport] Section Data Availability:', {
      subsections: subsections.length,
      siteAssets: siteAssets.length,
      assetMetrics,
      fortressChecklistItems: checklistItems.length,
      fortressMetrics,
      siteDocuments: docsRes.data?.length || 0,
      subsectionDocuments: subsectionDocsRes.data?.length || 0,
    });

    // Process each section in order, only if enabled
    for (const section of sortedSections) {
      const spec = findSectionSpec(section.id);
      const title = getSectionTitle(section);
      
      console.log(`[SiteSummaryReport] Processing section: ${section.id} (order: ${section.order})`);

      switch (section.id) {
        case "health-metrics":
        case "compliance": // Support legacy section ID
          // Use noTopMargin to push content up and fit more on first page
          content.push(createSectionHeader(title, 'primary', { noTopMargin: true }));
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

        case "documents-summary":
          // Calculate document metrics from fetched documents
          const siteDocsData = docsRes.data || [];
          const subsectionDocsData = subsectionDocsRes.data || [];
          const docMetrics = calculateDocumentMetrics(siteDocsData, subsectionDocsData);
          console.log(`[SiteSummaryReport] documents-summary: ${docMetrics.totalDocuments} docs, ${docMetrics.categories.length} categories`);
          
          if (docMetrics.totalDocuments > 0) {
            content.push(createSectionHeader(title));
            
            // Total documents KPI
            content.push(createKpiRow([
              { value: docMetrics.totalDocuments.toString(), label: 'Total Documents', color: STATUS_COLORS.info },
              { value: docMetrics.categories.length.toString(), label: 'Categories', color: STATUS_COLORS.muted },
            ]));
            
            // Documents by category table
            if (docMetrics.categories.length > 0) {
              content.push({
                text: 'Documents by Category',
                fontSize: 10,
                bold: true,
                color: '#374151',
                margin: [0, 8, 0, 6],
              });
              
              const tableBody = [
                [
                  { text: 'Category', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Files', bold: true, fontSize: 8, color: '#ffffff', alignment: 'center' as const },
                ],
                ...docMetrics.categories.map((cat, idx) => {
                  const bgColor = idx % 2 === 1 ? '#f9fafb' : null;
                  return [
                    { text: cat.categoryName, fontSize: 8, fillColor: bgColor },
                    { text: cat.fileCount.toString(), fontSize: 8, alignment: 'center' as const, fillColor: bgColor, bold: true },
                  ];
                }),
              ];
              
              content.push({
                table: {
                  headerRows: 1,
                  widths: ['*', 60],
                  body: tableBody,
                },
                layout: {
                  hLineWidth: () => 0.5,
                  vLineWidth: () => 0.5,
                  hLineColor: () => '#e5e7eb',
                  vLineColor: () => '#e5e7eb',
                  fillColor: (rowIndex: number) => rowIndex === 0 ? '#374151' : null,
                  paddingLeft: () => 6,
                  paddingRight: () => 6,
                  paddingTop: () => 4,
                  paddingBottom: () => 4,
                },
                margin: [0, 0, 0, 12],
              });
            }
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

        case "asset-verification":
        case "asset-summary": // Support legacy section ID
          console.log(`[SiteSummaryReport] asset-verification: ${assetMetrics.totalAssets} assets, verified=${assetMetrics.verified}, discrepancies=${assetMetrics.discrepancies}`);
          if (assetMetrics.totalAssets > 0) {
            content.push(createSectionHeader(title, 'primary'));
            content.push(createKpiRow(
              ASSET_VERIFICATION_CARDS.map(card => ({
                value: card.format(card.getValue(assetMetrics)),
                label: card.label,
                color: card.color,
              }))
            ));
            // Add verification rate text
            content.push({ 
              text: `Verification Rate: ${assetMetrics.verificationRate}%`, 
              fontSize: 10, 
              bold: true,
              margin: [0, 8, 0, 16] 
            });
            
            // Add detailed asset verification schedule table
            const { generateAssetSchedule } = await import('@/lib/siteSummaryRenderSpec');
            const assetSchedule = generateAssetSchedule(siteAssets, allInspections);
            
            if (assetSchedule.length > 0) {
              content.push({
                text: 'Asset Verification Schedule',
                fontSize: 11,
                bold: true,
                color: '#374151',
                margin: [0, 0, 0, 8],
              });
              
              // Create table with asset register vs inspected values
              const tableBody = [
                // Header row
                [
                  { text: 'Premises', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Meter S/N', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Breaker', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'CT Ratio', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Insp. Breaker', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Insp. CT', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Status', bold: true, fontSize: 8, color: '#ffffff' },
                ],
                // Data rows
                ...assetSchedule.map((row, idx) => {
                  const statusColor = row.status === 'verified' ? '#16a34a' : 
                                      row.status === 'discrepancy' ? '#dc2626' : '#9ca3af';
                  const statusText = row.status === 'verified' ? '✓ Verified' : 
                                     row.status === 'discrepancy' ? '✗ Discrepancy' : '○ Pending';
                  const bgColor = idx % 2 === 1 ? '#f9fafb' : null;
                  
                  return [
                    { text: row.premisesId, fontSize: 7, fillColor: bgColor },
                    { text: row.meterSerial, fontSize: 7, fillColor: bgColor },
                    { text: row.breakerSize, fontSize: 7, fillColor: bgColor },
                    { text: row.ctRatio, fontSize: 7, fillColor: bgColor },
                    { text: row.inspectedBreaker, fontSize: 7, fillColor: bgColor, color: row.discrepancyFields.includes('Breaker') ? '#dc2626' : '#374151' },
                    { text: row.inspectedCT, fontSize: 7, fillColor: bgColor, color: row.discrepancyFields.includes('CT Ratio') ? '#dc2626' : '#374151' },
                    { text: statusText, fontSize: 7, color: statusColor, bold: true, fillColor: bgColor },
                  ];
                }),
              ];
              
              content.push({
                table: {
                  headerRows: 1,
                  widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
                  body: tableBody,
                },
                layout: {
                  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
                  vLineWidth: () => 0,
                  hLineColor: () => '#e5e7eb',
                  paddingLeft: () => 4,
                  paddingRight: () => 4,
                  paddingTop: () => 3,
                  paddingBottom: () => 3,
                  fillColor: (rowIndex: number) => rowIndex === 0 ? '#1e3a5f' : null,
                },
                margin: [0, 0, 0, 12],
              });
            }
          }
          break;

        case "fortress-checklist":
          console.log(`[SiteSummaryReport] fortress-checklist: ${fortressMetrics.totalItems} items, progress=${fortressMetrics.overallProgress}%`);
          if (fortressMetrics.totalItems > 0) {
            if (spec?.pageBreakBefore) {
              content.push({ text: '', pageBreak: 'before' });
            }
            content.push(createSectionHeader(title, 'primary'));
            
            // Overall progress summary KPIs
            content.push(createKpiRow([
              { value: `${fortressMetrics.overallProgress}%`, label: 'Overall Progress', color: fortressMetrics.overallProgress >= 80 ? STATUS_COLORS.success : fortressMetrics.overallProgress >= 50 ? STATUS_COLORS.warning : STATUS_COLORS.error },
              { value: fortressMetrics.completedItems.toString(), label: 'Completed', color: STATUS_COLORS.success },
              { value: fortressMetrics.pendingItems.toString(), label: 'Pending', color: STATUS_COLORS.muted },
              { value: fortressMetrics.notApplicableItems.toString(), label: 'N/A', color: STATUS_COLORS.info },
            ]));
            
            // Section-by-section progress table
            if (fortressMetrics.sections.length > 0) {
              content.push({
                text: 'Section Progress',
                fontSize: 11,
                bold: true,
                color: '#374151',
                margin: [0, 12, 0, 8],
              });
              
              const tableBody = [
                // Header row
                [
                  { text: 'Section', bold: true, fontSize: 8, color: '#ffffff' },
                  { text: 'Total', bold: true, fontSize: 8, color: '#ffffff', alignment: 'center' as const },
                  { text: 'Done', bold: true, fontSize: 8, color: '#ffffff', alignment: 'center' as const },
                  { text: 'N/A', bold: true, fontSize: 8, color: '#ffffff', alignment: 'center' as const },
                  { text: 'Progress', bold: true, fontSize: 8, color: '#ffffff', alignment: 'center' as const },
                ],
                // Data rows
                ...fortressMetrics.sections.map((section, idx) => {
                  const progressColor = section.progressPercent >= 80 ? '#16a34a' : 
                                       section.progressPercent >= 50 ? '#ea580c' : '#dc2626';
                  const bgColor = idx % 2 === 1 ? '#f9fafb' : null;
                  
                  return [
                    { text: section.shortName, fontSize: 8, fillColor: bgColor },
                    { text: section.totalItems.toString(), fontSize: 8, alignment: 'center' as const, fillColor: bgColor },
                    { text: section.completedItems.toString(), fontSize: 8, alignment: 'center' as const, fillColor: bgColor, color: '#16a34a' },
                    { text: section.notApplicableItems.toString(), fontSize: 8, alignment: 'center' as const, fillColor: bgColor, color: '#6b7280' },
                    { text: `${section.progressPercent}%`, fontSize: 8, alignment: 'center' as const, bold: true, color: progressColor, fillColor: bgColor },
                  ];
                }),
              ];
              
              content.push({
                table: {
                  headerRows: 1,
                  widths: ['*', 50, 50, 50, 60],
                  body: tableBody,
                },
                layout: {
                  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0.25,
                  vLineWidth: () => 0,
                  hLineColor: () => '#e5e7eb',
                  paddingLeft: () => 6,
                  paddingRight: () => 6,
                  paddingTop: () => 4,
                  paddingBottom: () => 4,
                  fillColor: (rowIndex: number) => rowIndex === 0 ? '#1e3a5f' : null,
                },
                margin: [0, 0, 0, 12],
              });
            }
          }
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
