/**
 * Compliance Report Generator
 * Generates PDF reports for regulatory compliance overview
 * 
 * TEMPLATE GATEWAY INTEGRATION:
 * This generator uses fetchPDFTemplate to get its configuration from the database.
 * All styling, sections, and branding are controlled by the PDF Template Manager.
 */

import {
  generatePdfBlob,
  createSectionHeader,
  createDataTable,
  createKpiRow,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";
import {
  createCoverPage,
  createPageHeader,
  createPageFooter,
  createKpiDashboard,
  createSpacer,
} from "@/lib/pdfTemplates";
import {
  createBaseDocDefinition,
  Content,
} from "@/lib/pdfMakeConfig";
import {
  loadCompanyBranding,
  generateReferenceNumber,
  formatPdfDate,
} from "@/lib/pdfBranding";
import { fetchPDFTemplate } from "@/hooks/usePDFTemplateGateway";
import { buildComplianceSummaryRows } from "@/lib/report/complianceRows";

export interface ComplianceItem {
  id: string;
  name: string;
  siteName?: string;
  cocNumber?: string;
  cocStatus?: string;
  cocType?: string;
  cocIssueDate?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  isCompliant?: boolean;
  lastValidated?: string;
}

export interface ComplianceReportData {
  siteName?: string;
  clientName?: string;
  items: ComplianceItem[];
  stats: {
    total: number;
    compliant: number;
    nonCompliant: number;
    expiringSoon: number;
    expired: number;
    pendingReview: number;
  };
  companyLogoUrl?: string | null;
}

export interface ComplianceReportResult {
  blob: Blob;
  filename: string;
}

/**
 * Generate a compliance overview report using pdfmake
 * Uses PDF Template Gateway for configuration
 */
export async function generateComplianceReport(
  data: ComplianceReportData
): Promise<ComplianceReportResult> {
  // ===== FETCH TEMPLATE CONFIGURATION =====
  const { customization, sections, accentColors } = await fetchPDFTemplate('compliance');
  
  console.log('[ComplianceReport] Template Config Applied:', {
    coverTitle: customization.coverTitle,
    accentColor: customization.accentColor,
    enabledSections: sections.filter(s => s.enabled).map(s => s.id),
  });

  // Helper to check if section is enabled
  const isSectionEnabled = (sectionId: string): boolean => {
    const section = sections.find(s => s.id === sectionId);
    return section?.enabled ?? true;
  };

  // Load branding
  const branding = await loadCompanyBranding();
  const logoDataUrl = branding.logoDataUrl;
  const organizationName = branding.organizationName;

  const { siteName, clientName, items, stats } = data;
  const complianceRate = stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0;

  // Build document content
  const content: Content[] = [];

  // ===== COVER PAGE =====
  content.push(...createCoverPage({
    title: customization.coverTitle || 'Compliance Report',
    subtitle: customization.coverSubtitle || 'Regulatory Compliance Overview',
    siteName: siteName || 'All Sites',
    clientName,
    reportType: 'Compliance Report',
    reportDate: customization.includeDate ? new Date() : undefined,
    referenceNumber: generateReferenceNumber('CMP'),
  }, logoDataUrl));

  // ===== COMPLIANCE SUMMARY (compliance-summary) =====
  if (isSectionEnabled('compliance-summary')) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Compliance Overview', 'primary'));
    content.push(createSpacer(5));

    // KPI Dashboard with template accent color
    content.push(createKpiDashboard([
      { value: stats.total, label: 'Total Items', color: accentColors.primary },
      { value: stats.compliant, label: 'Compliant', color: COLORS.success },
      { value: stats.nonCompliant, label: 'Non-Compliant', color: COLORS.error },
      { value: stats.expiringSoon, label: 'Expiring Soon', color: COLORS.warning },
    ]));

    content.push(createSpacer(10));

    // Compliance Rate
    content.push({
      text: `Overall Compliance Rate: ${complianceRate}%`,
      fontSize: 14,
      bold: true,
      color: complianceRate >= 80 ? COLORS.success : complianceRate >= 50 ? COLORS.warning : COLORS.error,
      margin: [0, 0, 0, 15],
    });

    // Summary Statistics
    content.push(createSectionHeader('Summary Statistics', 'secondary'));
    content.push(createSpacer(5));

    content.push(createDataTable(
      [
        { header: 'Metric', field: 'metric', width: '*' },
        { header: 'Count', field: 'count', width: 80, alignment: 'center' },
        { header: 'Percentage', field: 'percentage', width: 80, alignment: 'center' },
      ],
      buildComplianceSummaryRows(stats)
    ));

    content.push(createSpacer(10));
    content.push({
      text: `Report Generated: ${formatPdfDate(new Date())}`,
      fontSize: 9,
      color: COLORS.textMuted,
    });
  }

  // ===== COC STATUS BY SITE (coc-status) =====
  if (isSectionEnabled('coc-status') && items.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('COC Status Overview', 'primary'));
    content.push(createSpacer(5));

    const statusRows = items.map(item => ({
      name: item.name,
      site: item.siteName || '-',
      cocNumber: item.cocNumber || '-',
      type: item.cocType || '-',
      status: item.cocStatus || 'Unknown',
      issueDate: formatPdfDate(item.cocIssueDate),
    }));

    content.push(createDataTable(
      [
        { header: 'Item', field: 'name', width: '*' },
        { header: 'Site', field: 'site', width: 80 },
        { header: 'COC #', field: 'cocNumber', width: 70 },
        { header: 'Type', field: 'type', width: 60 },
        { header: 'Status', field: 'status', width: 60 },
        { header: 'Issue Date', field: 'issueDate', width: 70 },
      ],
      statusRows
    ));
  }

  // ===== EXPIRING CERTIFICATES (expiring-cocs) =====
  if (isSectionEnabled('expiring-cocs')) {
    const expiringItems = items.filter(item => 
      item.daysUntilExpiry !== undefined && 
      item.daysUntilExpiry > 0 && 
      item.daysUntilExpiry <= 90
    ).sort((a, b) => (a.daysUntilExpiry || 0) - (b.daysUntilExpiry || 0));

    if (expiringItems.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('Certificates Expiring Soon (Next 90 Days)', 'primary'));
      content.push(createSpacer(5));

      const expiringRows = expiringItems.map(item => ({
        name: item.name,
        site: item.siteName || '-',
        cocNumber: item.cocNumber || '-',
        expiryDate: item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-',
        daysLeft: item.daysUntilExpiry?.toString() || '-',
        urgency: (item.daysUntilExpiry || 0) <= 30 ? 'URGENT' : 'Soon',
      }));

      // Custom table with urgency highlighting
      const tableBody: any[][] = [
        [
          { text: 'Item', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
          { text: 'Site', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
          { text: 'COC #', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
          { text: 'Expiry Date', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
          { text: 'Days Left', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
          { text: 'Urgency', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        ],
      ];

      expiringRows.forEach(row => {
        tableBody.push([
          { text: row.name, fontSize: 9 },
          { text: row.site, fontSize: 9 },
          { text: row.cocNumber, fontSize: 9 },
          { text: row.expiryDate, fontSize: 9 },
          { text: row.daysLeft, fontSize: 9, alignment: 'center' },
          { 
            text: row.urgency, 
            fontSize: 9, 
            bold: true,
            color: row.urgency === 'URGENT' ? COLORS.error : COLORS.warning,
            alignment: 'center',
          },
        ]);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: ['*', 70, 60, 70, 50, 50],
          body: tableBody,
          dontBreakRows: true,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#fcd34d',
          vLineColor: () => '#fcd34d',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 15],
      });
    }
  }

  // ===== NON-COMPLIANT ITEMS (non-compliant) =====
  if (isSectionEnabled('non-compliant')) {
    const nonCompliantItems = items.filter(item => item.isCompliant === false);

    if (nonCompliantItems.length > 0) {
      content.push({ text: '', pageBreak: 'before' });
      content.push(createSectionHeader('Non-Compliant Items', 'primary'));
      content.push(createSpacer(5));

      // Custom table with error styling
      const tableBody: any[][] = [
        [
          { text: 'Item', style: 'tableHeader', fillColor: '#fee2e2', color: '#b91c1c' },
          { text: 'Site', style: 'tableHeader', fillColor: '#fee2e2', color: '#b91c1c' },
          { text: 'COC Status', style: 'tableHeader', fillColor: '#fee2e2', color: '#b91c1c' },
          { text: 'Last Validated', style: 'tableHeader', fillColor: '#fee2e2', color: '#b91c1c' },
          { text: 'Action Required', style: 'tableHeader', fillColor: '#fee2e2', color: '#b91c1c' },
        ],
      ];

      nonCompliantItems.forEach(item => {
        tableBody.push([
          { text: item.name, fontSize: 9 },
          { text: item.siteName || '-', fontSize: 9 },
          { text: item.cocStatus || 'Missing', fontSize: 9, color: COLORS.error },
          { text: item.lastValidated ? new Date(item.lastValidated).toLocaleDateString() : 'Never', fontSize: 9 },
          { text: 'Immediate Review Required', fontSize: 9, italics: true, color: COLORS.error },
        ]);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: ['*', 80, 70, 80, 100],
          body: tableBody,
          dontBreakRows: true,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#fecaca',
          vLineColor: () => '#fecaca',
          paddingLeft: () => 6,
          paddingRight: () => 6,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
        margin: [0, 0, 0, 15],
      });
    }
  }

  // Create document definition
  const docDefinition = createBaseDocDefinition(
    content,
    {
      title: `${customization.coverTitle || 'Compliance Report'} - ${siteName || 'All Sites'}`,
      author: organizationName,
      header: createPageHeader(customization.coverTitle || 'Compliance Report', logoDataUrl, organizationName),
      footer: customization.includePageNumbers ? createPageFooter('CONFIDENTIAL') : undefined,
    }
  );

  // Generate PDF blob
  const blob = await generatePdfBlob(docDefinition);
  const filename = `Compliance_Report_${(siteName || 'All_Sites').replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  return { blob, filename };
}
