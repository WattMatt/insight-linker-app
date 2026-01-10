import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename, getContentWidth } from "./documentDesignStandards";
import {
  addCoverPage,
  addStandardHeader,
  addSectionHeader,
  addFootersToAllPages,
  drawKpiCard,
  drawProgressBar,
  logComplianceCheck,
  hexToRgb,
  RGB_COLORS,
  PAGE,
  PDFComplianceCheck,
  CoverPageOptions,
} from "./pdfUtils";

interface Asset {
  id: string;
  premises_id: string;
  trade_as: string | null;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  asset_category: string;
}

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

// New interface for inspection-based comparison
export interface InspectionComparisonResult {
  asset: Asset;
  inspectionMatch: InspectionMatch | null;
  verified: boolean;
  ctMatch: "match" | "mismatch" | "na";
  breakerMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
}

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
  comparisonResults: InspectionComparisonResult[];
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

// Destructure design standards for easy access
const { typography, colors, margins, tables, logo, headers, footers, cards } = DOCUMENT_DESIGN_STANDARDS;

/**
 * Generate Asset Verification Report PDF - New inspection-based version
 * Returns both blob/filename and compliance checks for preview dialog
 */
export async function generateInspectionBasedReport(
  options: InspectionGeneratorOptions
): Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }> {
  const { siteName, clientName, comparisonResults, stats, companyLogoUrl } = options;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = getContentWidth();
  
  // Load logo if available
  let logoDataUrl: string | null = null;
  if (companyLogoUrl) {
    try {
      logoDataUrl = await loadImage(companyLogoUrl);
    } catch (e) {
      console.error('Failed to load logo:', e);
    }
  }
  
  const date = new Date().toLocaleDateString('en-GB', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // ===== PAGE 1: DEDICATED COVER PAGE =====
  addCoverPage(doc, {
    title: 'Asset Verification Report',
    subtitle: 'Asset Register vs Inspection Data Verification',
    siteName,
    clientName,
    reportType: 'Verification Report',
    logoDataUrl,
    organizationName: 'Asset Management System',
    reportDate: new Date(),
  });

  // ===== PAGE 2: EXECUTIVE SUMMARY WITH KPI DASHBOARD =====
  doc.addPage();
  addStandardHeader(doc, 'Executive Summary', logoDataUrl);
  
  let y = headers.height + margins.top + 10;
  
  // Section title
  y = addSectionHeader(doc, 'Verification Overview', y);
  
  // KPI Cards
  const cardWidth = (contentWidth - (cards.margin * 3)) / 4;
  const cardHeight = 28;
  
  const kpiData = [
    { label: 'Total Assets', value: stats.total.toString(), color: RGB_COLORS.textMuted },
    { label: 'Verified', value: stats.verifiedNoDiscrepancy.toString(), color: RGB_COLORS.success },
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: RGB_COLORS.warning },
    { label: 'Not Verified', value: stats.unverified.toString(), color: RGB_COLORS.error },
  ];
  
  kpiData.forEach((kpi, i) => {
    const cardX = margins.left + i * (cardWidth + cards.margin);
    drawKpiCard(doc, cardX, y, cardWidth, cardHeight, kpi.value, kpi.label, kpi.color);
  });
  
  y += cardHeight + 20;
  
  // Verification Rate Progress Bar
  const matchRate = stats.total > 0 ? Math.round((stats.verifiedNoDiscrepancy / stats.total) * 100) : 0;
  
  doc.setFontSize(typography.scale.body);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.setTextColor(...RGB_COLORS.textPrimary);
  doc.text('Verification Rate', margins.left, y);
  
  const barX = margins.left + 40;
  const barWidth = contentWidth - 60;
  drawProgressBar(doc, barX, y - 4, barWidth, matchRate);
  
  y += 20;
  
  // Summary Statistics
  y = addSectionHeader(doc, 'Summary Statistics', y);
  
  const summaryData = [
    ['Total Assets in Register', stats.total.toString()],
    ['Verified (No Discrepancies)', stats.verifiedNoDiscrepancy.toString()],
    ['Verified (With Discrepancies)', stats.discrepancies.toString()],
    ['Not Yet Verified', stats.unverified.toString()],
    ['Assets with Inspection Photos', stats.withImages.toString()],
    ['Verification Rate', `${matchRate}%`],
  ];
  
  autoTable(doc, {
    startY: y,
    margin: { left: margins.left, right: margins.right },
    head: [['Metric', 'Value']],
    body: summaryData,
    styles: {
      fontSize: tables.body.fontSize,
      cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
      lineColor: hexToRgb(tables.border.color),
      lineWidth: tables.border.width,
    },
    headStyles: {
      fillColor: RGB_COLORS.primary,
      textColor: RGB_COLORS.white,
      fontStyle: 'bold',
      fontSize: tables.header.fontSize,
    },
    alternateRowStyles: {
      fillColor: hexToRgb(tables.body.alternateRowColor),
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
    },
  });
  
  y = (doc as any).lastAutoTable?.finalY + 15 || y + 50;
  
  // Report metadata
  doc.setFontSize(typography.scale.caption);
  doc.setTextColor(...RGB_COLORS.textMuted);
  doc.setFont(typography.fonts.body, 'normal');
  doc.text(`Generated: ${date}`, margins.left, y);

  // ===== VERIFIED ITEMS TABLE =====
  doc.addPage();
  addStandardHeader(doc, 'Verified Assets', logoDataUrl);
  
  let tableY = headers.height + margins.top + 10;
  tableY = addSectionHeader(doc, 'Verified via Inspection Data', tableY);

  const verifiedResults = comparisonResults.filter(r => r.verified);
  
  if (verifiedResults.length > 0) {
    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [[
        'Premises ID',
        'Trade As',
        'Status',
        'Inspection Source',
        'Meter Serial',
        'CT Ratio',
        'Breaker'
      ]],
      body: verifiedResults.map(r => [
        r.asset.premises_id || '-',
        r.asset.trade_as || '-',
        r.hasDiscrepancy ? '⚠ Mismatch' : '✓ Verified',
        r.inspectionMatch?.subsectionName || r.inspectionMatch?.shopName || 'Inspection',
        r.asset.meter_serial_number || '-',
        formatComparisonCell(r.asset.ct_ratio, r.inspectionMatch?.ctSizeAndRatio, r.ctMatch),
        formatComparisonCell(r.asset.breaker_size, r.inspectionMatch?.breakerSize, r.breakerMatch)
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: hexToRgb(tables.header.backgroundColor),
        textColor: hexToRgb(tables.header.textColor),
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
      columnStyles: {
        2: { cellWidth: 18 },
        3: { cellWidth: 25 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const value = data.cell.raw as string;
          if (value.includes('Mismatch')) {
            data.cell.styles.textColor = hexToRgb(colors.warning);
            data.cell.styles.fontStyle = 'bold';
          } else if (value.includes('Verified')) {
            data.cell.styles.textColor = hexToRgb(colors.success);
            data.cell.styles.fontStyle = 'bold';
          }
        }
        // Highlight mismatched values
        if (data.section === 'body') {
          const result = verifiedResults[data.row.index];
          if (result) {
            if (data.column.index === 5 && result.ctMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
            if (data.column.index === 6 && result.breakerMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
          }
        }
      },
    });
  } else {
    doc.setFontSize(typography.scale.body);
    doc.setTextColor(...RGB_COLORS.textMuted);
    doc.text('No verified items found.', margins.left, tableY + 10);
  }

  // ===== DISCREPANCIES TABLE =====
  const discrepancies = comparisonResults.filter(r => r.hasDiscrepancy);
  if (discrepancies.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Discrepancies Detail', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Value Mismatches Between Asset Register and Inspections', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Premises ID', 'Field', 'Asset Register Value', 'Inspection Value', 'Status']],
      body: discrepancies.flatMap(r => {
        const rows: string[][] = [];
        if (r.ctMatch === 'mismatch') {
          rows.push([
            r.asset.premises_id || '-',
            'CT Ratio',
            r.asset.ct_ratio || '-',
            r.inspectionMatch?.ctSizeAndRatio || '-',
            'MISMATCH'
          ]);
        }
        if (r.breakerMatch === 'mismatch') {
          rows.push([
            r.asset.premises_id || '-',
            'Breaker Size',
            r.asset.breaker_size || '-',
            r.inspectionMatch?.breakerSize || '-',
            'MISMATCH'
          ]);
        }
        return rows;
      }),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [254, 243, 199],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = hexToRgb(colors.warning);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ===== UNVERIFIED ASSETS =====
  const unverified = comparisonResults.filter(r => !r.verified);
  if (unverified.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Unverified Assets', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Assets Without Matching Inspection Data', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Premises ID', 'Trade As', 'Meter Serial', 'CT Ratio', 'Breaker Size', 'Action Required']],
      body: unverified.map(r => [
        r.asset.premises_id || '-',
        r.asset.trade_as || '-',
        r.asset.meter_serial_number || '-',
        r.asset.ct_ratio || '-',
        r.asset.breaker_size || '-',
        'Requires Inspection'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [254, 215, 170],
        textColor: [154, 52, 18],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          data.cell.styles.textColor = hexToRgb(colors.error);
          data.cell.styles.fontStyle = 'italic';
        }
      },
    });
  }

  // Add footers to all pages (skip cover page)
  addFootersToAllPages(doc, true);

  // Log compliance and return checks
  const complianceChecks = logComplianceCheck('assetVerificationReportGenerator', {
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

  const filename = generateDocumentFilename('Asset_Verification', siteName);
  const blob = doc.output('blob');
  
  return { blob, filename, complianceChecks };
}

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
 * Generate Asset Verification Report PDF - Legacy version for backwards compatibility
 */
export async function generateAssetVerificationReport(
  options: LegacyGeneratorOptions
): Promise<{ blob: Blob; filename: string }> {
  const { siteName, comparisonResults, stats, companyLogoUrl } = options;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = getContentWidth();
  
  // Load logo if available
  let logoDataUrl: string | null = null;
  if (companyLogoUrl) {
    try {
      logoDataUrl = await loadImage(companyLogoUrl);
    } catch (e) {
      console.error('Failed to load logo:', e);
    }
  }
  
  const date = new Date().toLocaleDateString('en-GB', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // ===== PAGE 1: DEDICATED COVER PAGE =====
  addCoverPage(doc, {
    title: 'Asset Verification Report',
    subtitle: 'Asset Register vs Subsection Data Comparison',
    siteName,
    clientName: options.clientName,
    reportType: 'Verification Report',
    logoDataUrl,
    organizationName: 'Asset Management System',
    reportDate: new Date(),
  });

  // ===== PAGE 2: EXECUTIVE SUMMARY WITH KPI DASHBOARD =====
  doc.addPage();
  addStandardHeader(doc, 'Executive Summary', logoDataUrl);
  
  let y = headers.height + margins.top + 10;
  
  // Section title
  y = addSectionHeader(doc, 'Verification Overview', y);

  // KPI Cards
  const cardWidth = (contentWidth - (cards.margin * 3)) / 4;
  const cardHeight = 28;
  
  const kpiData = [
    { label: 'Total Assets', value: stats.total.toString(), color: RGB_COLORS.textMuted },
    { label: 'Verified', value: stats.matchedNoDiscrepancy.toString(), color: RGB_COLORS.success },
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: RGB_COLORS.warning },
    { label: 'Unverified', value: (stats.assetOnly + stats.subsectionOnly).toString(), color: RGB_COLORS.error },
  ];
  
  kpiData.forEach((kpi, i) => {
    const cardX = margins.left + i * (cardWidth + cards.margin);
    drawKpiCard(doc, cardX, y, cardWidth, cardHeight, kpi.value, kpi.label, kpi.color);
  });
  
  y += cardHeight + 20;
  
  // Verification Rate Progress Bar
  const matchRate = stats.total > 0 ? Math.round((stats.matchedNoDiscrepancy / stats.total) * 100) : 0;
  
  doc.setFontSize(typography.scale.body);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.setTextColor(...RGB_COLORS.textPrimary);
  doc.text('Verification Rate', margins.left, y);
  
  const barX = margins.left + 40;
  const barWidth = contentWidth - 60;
  drawProgressBar(doc, barX, y - 4, barWidth, matchRate);
  
  y += 20;
  
  // Summary Statistics Table
  y = addSectionHeader(doc, 'Summary Statistics', y);
  
  const summaryData = [
    ['Total Assets in Register', stats.total.toString()],
    ['Verified (No Discrepancies)', stats.matchedNoDiscrepancy.toString()],
    ['Verified (With Discrepancies)', stats.discrepancies.toString()],
    ['Assets Without Inspection', stats.assetOnly.toString()],
    ['Inspections Without Asset', stats.subsectionOnly.toString()],
    ['Potential Matches Found', (stats.potentialMatches || 0).toString()],
    ['Verification Rate', `${matchRate}%`],
  ];
  
  autoTable(doc, {
    startY: y,
    margin: { left: margins.left, right: margins.right },
    head: [['Metric', 'Value']],
    body: summaryData,
    styles: {
      fontSize: tables.body.fontSize,
      cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
      lineColor: hexToRgb(tables.border.color),
      lineWidth: tables.border.width,
    },
    headStyles: {
      fillColor: RGB_COLORS.primary,
      textColor: RGB_COLORS.white,
      fontStyle: 'bold',
      fontSize: tables.header.fontSize,
    },
    alternateRowStyles: {
      fillColor: hexToRgb(tables.body.alternateRowColor),
    },
    columnStyles: {
      0: { cellWidth: 120 },
      1: { cellWidth: 40, halign: 'center', fontStyle: 'bold' },
    },
  });
  
  y = (doc as any).lastAutoTable?.finalY + 15 || y + 50;
  
  // Report metadata
  doc.setFontSize(typography.scale.caption);
  doc.setTextColor(...RGB_COLORS.textMuted);
  doc.setFont(typography.fonts.body, 'normal');
  doc.text(`Generated: ${date}`, margins.left, y);

  // ===== VERIFIED ITEMS TABLE =====
  doc.addPage();
  addStandardHeader(doc, 'Verified Items', logoDataUrl);
  
  let tableY = headers.height + margins.top + 10;
  tableY = addSectionHeader(doc, 'Matched Asset and Inspection Records', tableY);

  const matchedResults = comparisonResults.filter(r => r.matchType === 'matched');
  
  if (matchedResults.length > 0) {
    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [[
        'Premises ID',
        'Status',
        'Meter Serial (Asset)',
        'Meter Serial (Insp)',
        'CT Ratio (Asset)',
        'CT Ratio (Insp)',
        'Breaker'
      ]],
      body: matchedResults.map(r => [
        r.asset?.premises_id || '-',
        r.hasDiscrepancy ? '⚠ Mismatch' : '✓ Verified',
        r.asset?.meter_serial_number || '-',
        r.subsection?.meter_serial_number || '-',
        r.asset?.ct_ratio || '-',
        r.subsection?.ct_ratio || '-',
        r.asset?.breaker_size || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: hexToRgb(tables.header.backgroundColor),
        textColor: hexToRgb(tables.header.textColor),
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
      columnStyles: {
        1: { cellWidth: 20 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const value = data.cell.raw as string;
          if (value.includes('Mismatch')) {
            data.cell.styles.textColor = hexToRgb(colors.warning);
            data.cell.styles.fontStyle = 'bold';
          } else if (value.includes('Verified')) {
            data.cell.styles.textColor = hexToRgb(colors.success);
            data.cell.styles.fontStyle = 'bold';
          }
        }
        if (data.section === 'body') {
          const result = matchedResults[data.row.index];
          if (result) {
            if ((data.column.index === 2 || data.column.index === 3) && result.meterSerialMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
            if ((data.column.index === 4 || data.column.index === 5) && result.ctRatioMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
          }
        }
      },
    });
  } else {
    doc.setFontSize(typography.scale.body);
    doc.setTextColor(...RGB_COLORS.textMuted);
    doc.text('No verified items found.', margins.left, tableY + 10);
  }

  // ===== DISCREPANCIES =====
  const discrepancies = comparisonResults.filter(r => r.hasDiscrepancy);
  if (discrepancies.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Discrepancies Detail', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Value Mismatches', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Premises ID', 'Field', 'Asset Value', 'Inspection Value', 'Status']],
      body: discrepancies.flatMap(r => {
        const rows: string[][] = [];
        if (r.meterSerialMatch === 'mismatch') {
          rows.push([
            r.asset?.premises_id || '-',
            'Meter Serial',
            r.asset?.meter_serial_number || '-',
            r.subsection?.meter_serial_number || '-',
            'MISMATCH'
          ]);
        }
        if (r.ctRatioMatch === 'mismatch') {
          rows.push([
            r.asset?.premises_id || '-',
            'CT Ratio',
            r.asset?.ct_ratio || '-',
            r.subsection?.ct_ratio || '-',
            'MISMATCH'
          ]);
        }
        return rows;
      }),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [254, 243, 199],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = hexToRgb(colors.warning);
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ===== UNMATCHED ASSETS =====
  const assetOnly = comparisonResults.filter(r => r.matchType === 'asset_only');
  if (assetOnly.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Unverified Assets', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Assets Without Matching Inspection', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Premises ID', 'Trade As', 'Meter Serial', 'CT Ratio', 'Breaker Size']],
      body: assetOnly.map(r => [
        r.asset?.premises_id || '-',
        r.asset?.trade_as || '-',
        r.asset?.meter_serial_number || '-',
        r.asset?.ct_ratio || '-',
        r.asset?.breaker_size || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [254, 215, 170],
        textColor: [154, 52, 18],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
    });
  }

  // ===== INSPECTIONS WITHOUT ASSETS =====
  const subsectionOnly = comparisonResults.filter(r => r.matchType === 'subsection_only' && !r.potentialAssetMatch);
  if (subsectionOnly.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Unmatched Inspections', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Inspections Without Matching Asset Record', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Source Name', 'Tenant Name', 'Meter Serial', 'CT Ratio']],
      body: subsectionOnly.map(r => [
        r.subsection?.name || '-',
        r.subsection?.tenant_name || '-',
        r.subsection?.meter_serial_number || '-',
        r.subsection?.ct_ratio || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [191, 219, 254],
        textColor: [30, 64, 175],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
    });
  }

  // ===== POTENTIAL MATCHES =====
  const potentialMatches = comparisonResults.filter(r => r.matchType === 'subsection_only' && r.potentialAssetMatch);
  if (potentialMatches.length > 0) {
    doc.addPage();
    addStandardHeader(doc, 'Potential Matches', logoDataUrl);
    
    tableY = headers.height + margins.top + 10;
    tableY = addSectionHeader(doc, 'Meter Serials Found in Asset Register', tableY);

    autoTable(doc, {
      startY: tableY,
      margin: { left: margins.left, right: margins.right },
      head: [['Source Name', 'Meter Serial', 'Found in Asset (Premises ID)', 'Asset Trade As']],
      body: potentialMatches.map(r => [
        r.subsection?.name || '-',
        r.subsection?.meter_serial_number || '-',
        r.potentialAssetMatch?.premises_id || '-',
        r.potentialAssetMatch?.trade_as || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: { horizontal: tables.cellPadding.horizontal, vertical: tables.cellPadding.vertical },
        lineColor: hexToRgb(tables.border.color),
        lineWidth: tables.border.width,
      },
      headStyles: {
        fillColor: [233, 213, 255],
        textColor: [88, 28, 135],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      alternateRowStyles: {
        fillColor: hexToRgb(tables.body.alternateRowColor),
      },
    });
  }

  // Add footers to all pages (skip cover page)
  addFootersToAllPages(doc, true);

  // Log compliance
  logComplianceCheck('generateAssetVerificationReport (legacy)', {
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

  const filename = generateDocumentFilename('Asset_Verification', siteName);
  const blob = doc.output('blob');
  
  return { blob, filename };
}

async function loadImage(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
