import { generateDocumentFilename } from "./documentDesignStandards";
import {
  createBaseDocDefinition,
  generatePdfBlob,
  COLORS,
  DEFAULT_STYLES,
  getStandardTableLayout,
  getLightTableLayout,
  Content,
  TDocumentDefinitions,
} from "./pdfMakeConfig";
import {
  loadCompanyBranding,
  imageUrlToBase64,
  formatPdfDate,
  generateReferenceNumber,
  createHeaderLogo,
  createCoverLogo,
} from "./pdfBranding";
import {
  createCoverPage,
  createPageHeader,
  createPageFooter,
  createKpiDashboard,
  createSectionHeader,
  createDataTable,
  createProgressBar,
  createSpacer,
  createParagraph,
  PDFComplianceCheck,
  createComplianceResult,
  getStatusType,
  createStatusBadge,
} from "./pdfTemplates";

// Asset interface - matches AssetComparisonTable
interface Asset {
  id: string;
  premises_id: string;
  trade_as: string | null;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  asset_category: string;
}

// InspectionMatch interface - matches InspectionTenantMatch from AssetComparisonTable
interface InspectionMatch {
  inspectionId: string;
  inspectionTitle: string;
  subsectionId: string | null;
  subsectionName?: string;
  shopName?: string;
  shopNumber?: string;
  meterSerialNumber: string;
  ctSizeAndRatio?: string;
  breakerSize?: string;
  meterImage?: string;
  ctRatioImage?: string;
  breakerImage?: string;
}

// ComparisonResult interface - matches AssetComparisonTable.ComparisonResult
export interface ComparisonResult {
  asset: Asset;
  inspectionMatch: InspectionMatch | null;
  verified: boolean;
  ctMatch: "match" | "mismatch" | "na";
  breakerMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
}

// Legacy alias for backwards compatibility
export type InspectionComparisonResult = ComparisonResult;

// Legacy interface for backwards compatibility
interface LegacyComparisonResult {
  asset: Asset | null;
  subsection: {
    id: string;
    name: string;
    meter_serial_number: string | null;
    ct_ratio: string | null;
    tenant_name: string | null;
  } | null;
  matchType: "matched" | "asset_only" | "subsection_only";
  meterSerialMatch: "match" | "mismatch" | "na";
  ctRatioMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
  potentialAssetMatch?: Asset;
}

interface InspectionGeneratorOptions {
  siteName: string;
  clientName?: string;
  comparisonResults: ComparisonResult[];
  stats: {
    total: number;
    verified: number;
    verifiedNoDiscrepancy: number;
    discrepancies: number;
    unverified: number;
    withImages: number;
  };
  companyLogoUrl?: string | null;
}

// Legacy options for backwards compatibility
interface LegacyGeneratorOptions {
  siteName: string;
  clientName?: string;
  comparisonResults: LegacyComparisonResult[];
  stats: {
    total: number;
    matched: number;
    matchedNoDiscrepancy: number;
    discrepancies: number;
    assetOnly: number;
    subsectionOnly: number;
    potentialMatches?: number;
  };
  companyLogoUrl?: string | null;
}

/**
 * Generate Asset Verification Report PDF - New inspection-based version using pdfmake
 * Returns both blob/filename and compliance checks for preview dialog
 */
export async function generateInspectionBasedReport(
  options: InspectionGeneratorOptions
): Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }> {
  const { siteName, clientName, comparisonResults, stats, companyLogoUrl } = options;
  
  // Load branding
  let logoDataUrl: string | null = null;
  let organizationName = 'Asset Management System';
  
  if (companyLogoUrl) {
    logoDataUrl = await imageUrlToBase64(companyLogoUrl);
  } else {
    const branding = await loadCompanyBranding();
    logoDataUrl = branding.logoDataUrl;
    organizationName = branding.organizationName;
  }

  const matchRate = stats.total > 0 ? Math.round((stats.verifiedNoDiscrepancy / stats.total) * 100) : 0;
  
  // Build document content
  const content: Content[] = [];

  // ===== COVER PAGE =====
  content.push(...createCoverPage({
    title: 'Asset Verification Report',
    subtitle: 'Asset Register vs Inspection Data Verification',
    siteName,
    clientName,
    reportType: 'Verification Report',
    reportDate: new Date(),
    referenceNumber: generateReferenceNumber('AVR'),
  }, logoDataUrl));

  // ===== PAGE 2: EXECUTIVE SUMMARY =====
  content.push({ text: '', pageBreak: 'before' });
  content.push(createSectionHeader('Verification Overview', 'primary'));
  content.push(createSpacer(5));

  // KPI Dashboard
  content.push(createKpiDashboard([
    { value: stats.total, label: 'Total Assets', color: COLORS.textMuted },
    { value: stats.verifiedNoDiscrepancy, label: 'Verified', color: COLORS.success },
    { value: stats.discrepancies, label: 'Discrepancies', color: COLORS.warning },
    { value: stats.unverified, label: 'Not Verified', color: COLORS.error },
  ]));

  content.push(createSpacer(10));

  // Verification Rate - simplified to avoid canvas issues
  content.push({
    text: `Verification Rate: ${matchRate}%`,
    style: 'body',
    bold: true,
    margin: [0, 0, 0, 15],
  });

  // Summary Statistics Section
  content.push(createSectionHeader('Summary Statistics', 'secondary'));
  content.push(createSpacer(5));

  content.push(...createDataTable(
    [
      { header: 'Metric', dataKey: 'metric', width: '*' },
      { header: 'Value', dataKey: 'value', width: 80, align: 'center' },
    ],
    [
      { metric: 'Total Assets in Register', value: stats.total.toString() },
      { metric: 'Verified (No Discrepancies)', value: stats.verifiedNoDiscrepancy.toString() },
      { metric: 'Verified (With Discrepancies)', value: stats.discrepancies.toString() },
      { metric: 'Not Yet Verified', value: stats.unverified.toString() },
      { metric: 'Assets with Inspection Photos', value: stats.withImages.toString() },
      { metric: 'Verification Rate', value: `${matchRate}%` },
    ],
    { zebraStripe: true }
  ));

  content.push(createSpacer(10));
  content.push({
    text: `Generated: ${formatPdfDate(new Date())}`,
    style: 'caption',
    margin: [0, 5, 0, 0],
  });

  // ===== VERIFIED ASSETS TABLE =====
  const verifiedResults = comparisonResults.filter(r => r.verified);
  
  content.push({ text: '', pageBreak: 'before' });
  content.push(createSectionHeader('Verified via Inspection Data', 'primary'));
  content.push(createSpacer(5));

  if (verifiedResults.length > 0) {
    // Create table with custom cell styling for status
    const verifiedTableBody = verifiedResults.map(r => ({
      premisesId: r.asset.premises_id || '-',
      tradeAs: r.asset.trade_as || '-',
      status: r.hasDiscrepancy ? '⚠ Mismatch' : '✓ Verified',
      statusType: r.hasDiscrepancy ? 'warning' : 'success',
      source: r.inspectionMatch?.subsectionName || r.inspectionMatch?.shopName || 'Inspection',
      meterSerial: r.asset.meter_serial_number || '-',
      ctRatio: formatComparisonCell(r.asset.ct_ratio, r.inspectionMatch?.ctSizeAndRatio, r.ctMatch),
      ctMismatch: r.ctMatch === 'mismatch',
      breaker: formatComparisonCell(r.asset.breaker_size, r.inspectionMatch?.breakerSize, r.breakerMatch),
      breakerMismatch: r.breakerMatch === 'mismatch',
    }));

    // Build table manually for cell-level styling
    const tableBody: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader' },
        { text: 'Trade As', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' },
        { text: 'Source', style: 'tableHeader' },
        { text: 'Meter Serial', style: 'tableHeader' },
        { text: 'CT Ratio', style: 'tableHeader' },
        { text: 'Breaker', style: 'tableHeader' },
      ],
    ];

    verifiedTableBody.forEach(row => {
      tableBody.push([
        { text: row.premisesId, style: 'tableBody' },
        { text: row.tradeAs, style: 'tableBody' },
        { 
          text: row.status, 
          style: 'tableBody', 
          color: row.statusType === 'warning' ? COLORS.warning : COLORS.success,
          bold: true 
        },
        { text: row.source, style: 'tableBody' },
        { text: row.meterSerial, style: 'tableBody' },
        { 
          text: row.ctRatio, 
          style: 'tableBody',
          fillColor: row.ctMismatch ? '#fef3c7' : undefined,
        },
        { 
          text: row.breaker, 
          style: 'tableBody',
          fillColor: row.breakerMismatch ? '#fef3c7' : undefined,
        },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [55, 70, 50, 60, 55, 45, 45],
        body: tableBody,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  } else {
    content.push(createParagraph('No verified items found.', 'muted'));
  }

  // ===== DISCREPANCIES TABLE =====
  const discrepancies = comparisonResults.filter(r => r.hasDiscrepancy);
  
  if (discrepancies.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Value Mismatches Between Asset Register and Inspections', 'primary'));
    content.push(createSpacer(5));

    const discrepancyRows: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Field', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Asset Register Value', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Inspection Value', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Status', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
      ],
    ];

    discrepancies.forEach(r => {
      if (r.ctMatch === 'mismatch') {
        discrepancyRows.push([
          { text: r.asset.premises_id || '-', style: 'tableBody' },
          { text: 'CT Ratio', style: 'tableBody' },
          { text: r.asset.ct_ratio || '-', style: 'tableBody' },
          { text: r.inspectionMatch?.ctSizeAndRatio || '-', style: 'tableBody' },
          { text: 'MISMATCH', style: 'tableBody', color: COLORS.warning, bold: true },
        ]);
      }
      if (r.breakerMatch === 'mismatch') {
        discrepancyRows.push([
          { text: r.asset.premises_id || '-', style: 'tableBody' },
          { text: 'Breaker Size', style: 'tableBody' },
          { text: r.asset.breaker_size || '-', style: 'tableBody' },
          { text: r.inspectionMatch?.breakerSize || '-', style: 'tableBody' },
          { text: 'MISMATCH', style: 'tableBody', color: COLORS.warning, bold: true },
        ]);
      }
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [70, 60, 90, 90, 50],
        body: discrepancyRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // ===== UNVERIFIED ASSETS =====
  const unverified = comparisonResults.filter(r => !r.verified);
  
  if (unverified.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Assets Without Matching Inspection Data', 'primary'));
    content.push(createSpacer(5));

    const unverifiedRows: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Trade As', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Meter Serial', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'CT Ratio', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Breaker Size', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Action Required', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
      ],
    ];

    unverified.forEach(r => {
      unverifiedRows.push([
        { text: r.asset.premises_id || '-', style: 'tableBody' },
        { text: r.asset.trade_as || '-', style: 'tableBody' },
        { text: r.asset.meter_serial_number || '-', style: 'tableBody' },
        { text: r.asset.ct_ratio || '-', style: 'tableBody' },
        { text: r.asset.breaker_size || '-', style: 'tableBody' },
        { text: 'Requires Inspection', style: 'tableBody', color: COLORS.error, italics: true },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [60, 80, 60, 50, 50, 60],
        body: unverifiedRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // Create document definition
  const docDefinition = createBaseDocDefinition(
    content,
    {
      title: `Asset Verification Report - ${siteName}`,
      author: organizationName,
      header: createPageHeader('Asset Verification Report', logoDataUrl, organizationName),
      footer: createPageFooter('CONFIDENTIAL'),
    }
  );

  // Generate PDF blob
  const blob = await generatePdfBlob(docDefinition);
  const filename = generateDocumentFilename('Asset_Verification', siteName);

  // Create compliance checks
  const complianceChecks = createComplianceResult({
    hasCoverPage: true,
    logoPlacement: !!logoDataUrl,
    standardMargins: true,
    typographyScale: true,
    brandColors: true,
    pageHeaders: true,
    pageFooters: true,
    tableStyles: true,
    pageBreaks: true,
  });

  return { blob, filename, complianceChecks };
}

/**
 * Format comparison cell value for display
 */
function formatComparisonCell(
  assetValue: string | null | undefined, 
  inspectionValue: string | null | undefined, 
  matchStatus: "match" | "mismatch" | "na"
): string {
  const asset = assetValue || '-';
  if (matchStatus === 'na' || !inspectionValue) {
    return asset;
  }
  if (matchStatus === 'match') {
    return asset;
  }
  return `${asset}\n(Insp: ${inspectionValue})`;
}

/**
 * Generate Asset Verification Report PDF - Legacy version for backwards compatibility using pdfmake
 */
export async function generateAssetVerificationReport(
  options: LegacyGeneratorOptions
): Promise<{ blob: Blob; filename: string }> {
  const { siteName, clientName, comparisonResults, stats, companyLogoUrl } = options;
  
  // Load branding
  let logoDataUrl: string | null = null;
  let organizationName = 'Asset Management System';
  
  if (companyLogoUrl) {
    logoDataUrl = await imageUrlToBase64(companyLogoUrl);
  } else {
    const branding = await loadCompanyBranding();
    logoDataUrl = branding.logoDataUrl;
    organizationName = branding.organizationName;
  }

  const matchRate = stats.total > 0 ? Math.round((stats.matchedNoDiscrepancy / stats.total) * 100) : 0;
  
  // Build document content
  const content: Content[] = [];

  // ===== COVER PAGE =====
  content.push(...createCoverPage({
    title: 'Asset Verification Report',
    subtitle: 'Asset Register vs Subsection Data Comparison',
    siteName,
    clientName,
    reportType: 'Verification Report',
    reportDate: new Date(),
    referenceNumber: generateReferenceNumber('AVR'),
  }, logoDataUrl));

  // ===== PAGE 2: EXECUTIVE SUMMARY =====
  content.push({ text: '', pageBreak: 'before' });
  content.push(createSectionHeader('Verification Overview', 'primary'));
  content.push(createSpacer(5));

  // KPI Dashboard
  content.push(createKpiDashboard([
    { value: stats.total, label: 'Total Assets', color: COLORS.textMuted },
    { value: stats.matchedNoDiscrepancy, label: 'Verified', color: COLORS.success },
    { value: stats.discrepancies, label: 'Discrepancies', color: COLORS.warning },
    { value: stats.assetOnly + stats.subsectionOnly, label: 'Unverified', color: COLORS.error },
  ]));

  content.push(createSpacer(10));

  // Verification Rate - simplified to avoid canvas issues
  content.push({
    text: `Verification Rate: ${matchRate}%`,
    style: 'body',
    bold: true,
    margin: [0, 0, 0, 15],
  });

  // Summary Statistics Section
  content.push(createSectionHeader('Summary Statistics', 'secondary'));
  content.push(createSpacer(5));

  content.push(...createDataTable(
    [
      { header: 'Metric', dataKey: 'metric', width: '*' },
      { header: 'Value', dataKey: 'value', width: 80, align: 'center' },
    ],
    [
      { metric: 'Total Assets in Register', value: stats.total.toString() },
      { metric: 'Verified (No Discrepancies)', value: stats.matchedNoDiscrepancy.toString() },
      { metric: 'Verified (With Discrepancies)', value: stats.discrepancies.toString() },
      { metric: 'Assets Without Inspection', value: stats.assetOnly.toString() },
      { metric: 'Inspections Without Asset', value: stats.subsectionOnly.toString() },
      { metric: 'Potential Matches Found', value: (stats.potentialMatches || 0).toString() },
      { metric: 'Verification Rate', value: `${matchRate}%` },
    ],
    { zebraStripe: true }
  ));

  content.push(createSpacer(10));
  content.push({
    text: `Generated: ${formatPdfDate(new Date())}`,
    style: 'caption',
    margin: [0, 5, 0, 0],
  });

  // ===== VERIFIED ITEMS TABLE =====
  const matchedResults = comparisonResults.filter(r => r.matchType === 'matched');
  
  content.push({ text: '', pageBreak: 'before' });
  content.push(createSectionHeader('Matched Asset and Inspection Records', 'primary'));
  content.push(createSpacer(5));

  if (matchedResults.length > 0) {
    const matchedTableBody: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader' },
        { text: 'Status', style: 'tableHeader' },
        { text: 'Meter (Asset)', style: 'tableHeader' },
        { text: 'Meter (Insp)', style: 'tableHeader' },
        { text: 'CT (Asset)', style: 'tableHeader' },
        { text: 'CT (Insp)', style: 'tableHeader' },
        { text: 'Breaker', style: 'tableHeader' },
      ],
    ];

    matchedResults.forEach(r => {
      matchedTableBody.push([
        { text: r.asset?.premises_id || '-', style: 'tableBody' },
        { 
          text: r.hasDiscrepancy ? '⚠ Mismatch' : '✓ Verified', 
          style: 'tableBody',
          color: r.hasDiscrepancy ? COLORS.warning : COLORS.success,
          bold: true,
        },
        { 
          text: r.asset?.meter_serial_number || '-', 
          style: 'tableBody',
          fillColor: r.meterSerialMatch === 'mismatch' ? '#fef3c7' : undefined,
        },
        { 
          text: r.subsection?.meter_serial_number || '-', 
          style: 'tableBody',
          fillColor: r.meterSerialMatch === 'mismatch' ? '#fef3c7' : undefined,
        },
        { 
          text: r.asset?.ct_ratio || '-', 
          style: 'tableBody',
          fillColor: r.ctRatioMatch === 'mismatch' ? '#fef3c7' : undefined,
        },
        { 
          text: r.subsection?.ct_ratio || '-', 
          style: 'tableBody',
          fillColor: r.ctRatioMatch === 'mismatch' ? '#fef3c7' : undefined,
        },
        { text: r.asset?.breaker_size || '-', style: 'tableBody' },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [55, 50, 55, 55, 50, 50, 45],
        body: matchedTableBody,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  } else {
    content.push(createParagraph('No verified items found.', 'muted'));
  }

  // ===== DISCREPANCIES =====
  const discrepancies = comparisonResults.filter(r => r.hasDiscrepancy);
  
  if (discrepancies.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Value Mismatches', 'primary'));
    content.push(createSpacer(5));

    const discrepancyRows: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Field', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Asset Value', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Inspection Value', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
        { text: 'Status', style: 'tableHeader', fillColor: '#fef3c7', color: '#92400e' },
      ],
    ];

    discrepancies.forEach(r => {
      if (r.meterSerialMatch === 'mismatch') {
        discrepancyRows.push([
          { text: r.asset?.premises_id || '-', style: 'tableBody' },
          { text: 'Meter Serial', style: 'tableBody' },
          { text: r.asset?.meter_serial_number || '-', style: 'tableBody' },
          { text: r.subsection?.meter_serial_number || '-', style: 'tableBody' },
          { text: 'MISMATCH', style: 'tableBody', color: COLORS.warning, bold: true },
        ]);
      }
      if (r.ctRatioMatch === 'mismatch') {
        discrepancyRows.push([
          { text: r.asset?.premises_id || '-', style: 'tableBody' },
          { text: 'CT Ratio', style: 'tableBody' },
          { text: r.asset?.ct_ratio || '-', style: 'tableBody' },
          { text: r.subsection?.ct_ratio || '-', style: 'tableBody' },
          { text: 'MISMATCH', style: 'tableBody', color: COLORS.warning, bold: true },
        ]);
      }
    });

    content.push({
      table: {
        headerRows: 1,
        widths: [70, 60, 90, 90, 50],
        body: discrepancyRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // ===== UNMATCHED ASSETS =====
  const assetOnly = comparisonResults.filter(r => r.matchType === 'asset_only');
  
  if (assetOnly.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Assets Without Matching Inspection', 'primary'));
    content.push(createSpacer(5));

    const assetOnlyRows: any[][] = [
      [
        { text: 'Premises ID', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Trade As', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Meter Serial', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'CT Ratio', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
        { text: 'Breaker Size', style: 'tableHeader', fillColor: '#fed7aa', color: '#9a3412' },
      ],
    ];

    assetOnly.forEach(r => {
      assetOnlyRows.push([
        { text: r.asset?.premises_id || '-', style: 'tableBody' },
        { text: r.asset?.trade_as || '-', style: 'tableBody' },
        { text: r.asset?.meter_serial_number || '-', style: 'tableBody' },
        { text: r.asset?.ct_ratio || '-', style: 'tableBody' },
        { text: r.asset?.breaker_size || '-', style: 'tableBody' },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', '*', 80, 60, 60],
        body: assetOnlyRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // ===== INSPECTIONS WITHOUT ASSETS =====
  const subsectionOnly = comparisonResults.filter(r => r.matchType === 'subsection_only' && !r.potentialAssetMatch);
  
  if (subsectionOnly.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Inspections Without Matching Asset Record', 'primary'));
    content.push(createSpacer(5));

    const subsectionOnlyRows: any[][] = [
      [
        { text: 'Source Name', style: 'tableHeader', fillColor: '#bfdbfe', color: '#1e40af' },
        { text: 'Tenant Name', style: 'tableHeader', fillColor: '#bfdbfe', color: '#1e40af' },
        { text: 'Meter Serial', style: 'tableHeader', fillColor: '#bfdbfe', color: '#1e40af' },
        { text: 'CT Ratio', style: 'tableHeader', fillColor: '#bfdbfe', color: '#1e40af' },
      ],
    ];

    subsectionOnly.forEach(r => {
      subsectionOnlyRows.push([
        { text: r.subsection?.name || '-', style: 'tableBody' },
        { text: r.subsection?.tenant_name || '-', style: 'tableBody' },
        { text: r.subsection?.meter_serial_number || '-', style: 'tableBody' },
        { text: r.subsection?.ct_ratio || '-', style: 'tableBody' },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', '*', 80, 60],
        body: subsectionOnlyRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // ===== POTENTIAL MATCHES =====
  const potentialMatches = comparisonResults.filter(r => r.matchType === 'subsection_only' && r.potentialAssetMatch);
  
  if (potentialMatches.length > 0) {
    content.push({ text: '', pageBreak: 'before' });
    content.push(createSectionHeader('Meter Serials Found in Asset Register', 'primary'));
    content.push(createSpacer(5));

    const potentialMatchRows: any[][] = [
      [
        { text: 'Source Name', style: 'tableHeader', fillColor: '#e9d5ff', color: '#581c87' },
        { text: 'Meter Serial', style: 'tableHeader', fillColor: '#e9d5ff', color: '#581c87' },
        { text: 'Found in Asset (Premises ID)', style: 'tableHeader', fillColor: '#e9d5ff', color: '#581c87' },
        { text: 'Asset Trade As', style: 'tableHeader', fillColor: '#e9d5ff', color: '#581c87' },
      ],
    ];

    potentialMatches.forEach(r => {
      potentialMatchRows.push([
        { text: r.subsection?.name || '-', style: 'tableBody' },
        { text: r.subsection?.meter_serial_number || '-', style: 'tableBody' },
        { text: r.potentialAssetMatch?.premises_id || '-', style: 'tableBody' },
        { text: r.potentialAssetMatch?.trade_as || '-', style: 'tableBody' },
      ]);
    });

    content.push({
      table: {
        headerRows: 1,
        widths: ['*', 80, 100, '*'],
        body: potentialMatchRows,
        dontBreakRows: true,
      },
      layout: getStandardTableLayout(),
      margin: [0, 0, 0, 15],
    } as Content);
  }

  // Create document definition
  const docDefinition = createBaseDocDefinition(
    content,
    {
      title: `Asset Verification Report - ${siteName}`,
      author: organizationName,
      header: createPageHeader('Asset Verification Report', logoDataUrl, organizationName),
      footer: createPageFooter('CONFIDENTIAL'),
    }
  );

  // Generate PDF blob
  const blob = await generatePdfBlob(docDefinition);
  const filename = generateDocumentFilename('Asset_Verification', siteName);

  return { blob, filename };
}
