import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename, getContentWidth } from "./documentDesignStandards";

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

// Helper to convert hex color to RGB array
function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
}

/**
 * Add standardized page header following DOCUMENT_DESIGN_STANDARDS
 */
function addStandardHeader(doc: jsPDF, title: string, logoDataUrl?: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header background bar using primary brand color
  const primaryRgb = hexToRgb(colors.primary);
  doc.setFillColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.rect(0, 0, pageWidth, headers.height + margins.top, 'F');
  
  // Document title (left aligned per standards)
  doc.setFontSize(typography.scale.h3);
  doc.setTextColor(255, 255, 255);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title, margins.left, margins.header + 5);
  
  // Logo (right aligned per standards)
  if (logoDataUrl) {
    const logoX = pageWidth - margins.right - logo.masterSize.width;
    const logoY = logo.placement.marginTop;
    doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logo.masterSize.width, logo.masterSize.maxHeight);
  }
  
  // Header border bottom
  if (headers.borderBottom) {
    const borderRgb = hexToRgb(headers.borderColor);
    doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
    doc.setLineWidth(0.5);
    doc.line(0, headers.height + margins.top, pageWidth, headers.height + margins.top);
  }
}

/**
 * Add standardized page footer following DOCUMENT_DESIGN_STANDARDS
 */
function addStandardFooter(doc: jsPDF, currentPage: number, totalPages: number, siteName: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - margins.bottom;
  
  // Footer border top
  if (footers.borderTop) {
    const borderRgb = hexToRgb(footers.borderColor);
    doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
    doc.setLineWidth(0.5);
    doc.line(margins.left, footerY - 5, pageWidth - margins.right, footerY - 5);
  }
  
  // Footer text styling
  doc.setFontSize(footers.fontSize);
  const footerTextRgb = hexToRgb(footers.color);
  doc.setTextColor(footerTextRgb[0], footerTextRgb[1], footerTextRgb[2]);
  doc.setFont(typography.fonts.body, 'normal');
  
  // Left: Confidentiality notice
  doc.text(footers.confidentialityText, margins.left, footerY);
  
  // Center: Page number
  const pageText = footers.pageNumberFormat
    .replace('{current}', currentPage.toString())
    .replace('{total}', totalPages.toString());
  doc.text(pageText, pageWidth / 2, footerY, { align: 'center' });
  
  // Right: Generation date
  doc.text(new Date().toLocaleDateString('en-GB'), pageWidth - margins.right, footerY, { align: 'right' });
}

/**
 * Add a section header following typography standards
 */
function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Section header background
  const headerBgRgb = hexToRgb(colors.background.header);
  doc.setFillColor(headerBgRgb[0], headerBgRgb[1], headerBgRgb[2]);
  doc.rect(margins.left, y, getContentWidth(), 8, 'F');
  
  // Section title
  doc.setFontSize(typography.scale.h4);
  const textRgb = hexToRgb(colors.text.primary);
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(title, margins.left + 3, y + 5.5);
  
  return y + 8 + typography.paragraphSpacing.afterH3;
}

/**
 * Draw KPI card following card design standards
 */
function drawKpiCard(
  doc: jsPDF, 
  x: number, 
  y: number, 
  width: number, 
  height: number, 
  value: string, 
  label: string, 
  accentColor: [number, number, number]
) {
  // Card background
  const cardBgRgb = hexToRgb(colors.background.card);
  doc.setFillColor(cardBgRgb[0], cardBgRgb[1], cardBgRgb[2]);
  doc.roundedRect(x, y, width, height, cards.borderRadius, cards.borderRadius, 'F');
  
  // Card border
  const borderRgb = hexToRgb(cards.borderColor);
  doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
  doc.setLineWidth(cards.borderWidth);
  doc.roundedRect(x, y, width, height, cards.borderRadius, cards.borderRadius, 'S');
  
  // Left accent bar
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(x, y, 3, height, 'F');
  
  // Value text
  doc.setFontSize(typography.scale.h2);
  doc.setFont(typography.fonts.heading, 'bold');
  const textRgb = hexToRgb(colors.text.primary);
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text(value, x + width / 2, y + height / 2, { align: 'center' });
  
  // Label text
  doc.setFontSize(typography.scale.caption);
  doc.setFont(typography.fonts.body, 'normal');
  const mutedRgb = hexToRgb(colors.text.muted);
  doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
  doc.text(label, x + width / 2, y + height - 5, { align: 'center' });
}

/**
 * Generate Asset Verification Report PDF - New inspection-based version
 */
export async function generateInspectionBasedReport(
  options: InspectionGeneratorOptions
): Promise<{ blob: Blob; filename: string }> {
  const { siteName, comparisonResults, stats, companyLogoUrl } = options;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
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

  // ===== COVER PAGE =====
  // Header with title and logo
  addStandardHeader(doc, 'ASSET VERIFICATION REPORT', logoDataUrl);
  
  // Main title section
  let y = headers.height + margins.top + 20;
  
  // Site name as main heading
  doc.setFontSize(typography.scale.h1);
  const primaryRgb = hexToRgb(colors.primary);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(siteName, pageWidth / 2, y, { align: 'center' });
  y += typography.paragraphSpacing.afterH1;
  
  // Subtitle
  doc.setFontSize(typography.scale.h3);
  const secondaryRgb = hexToRgb(colors.text.secondary);
  doc.setTextColor(secondaryRgb[0], secondaryRgb[1], secondaryRgb[2]);
  doc.setFont(typography.fonts.body, 'normal');
  doc.text('Asset Register vs Inspection Data Verification', pageWidth / 2, y, { align: 'center' });
  y += typography.paragraphSpacing.afterH2 + 10;
  
  // KPI Cards
  const cardWidth = (contentWidth - (cards.margin * 3)) / 4;
  const cardHeight = 28;
  
  const kpiData = [
    { label: 'Total Assets', value: stats.total.toString(), color: hexToRgb(colors.text.muted) },
    { label: 'Verified', value: stats.verifiedNoDiscrepancy.toString(), color: hexToRgb(colors.success) },
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: hexToRgb(colors.warning) },
    { label: 'Not Verified', value: stats.unverified.toString(), color: hexToRgb(colors.error) },
  ];
  
  kpiData.forEach((kpi, i) => {
    const cardX = margins.left + i * (cardWidth + cards.margin);
    drawKpiCard(doc, cardX, y, cardWidth, cardHeight, kpi.value, kpi.label, kpi.color);
  });
  
  y += cardHeight + 15;
  
  // Verification Rate Progress Bar
  const matchRate = stats.total > 0 ? Math.round((stats.verifiedNoDiscrepancy / stats.total) * 100) : 0;
  
  doc.setFontSize(typography.scale.body);
  doc.setFont(typography.fonts.heading, 'bold');
  const textRgb = hexToRgb(colors.text.primary);
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text('Verification Rate', margins.left, y);
  
  const barX = margins.left + 35;
  const barWidth = contentWidth - 50;
  const barHeight = 6;
  
  // Background bar
  const bgRgb = hexToRgb(colors.background.header);
  doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
  doc.roundedRect(barX, y - 4, barWidth, barHeight, 2, 2, 'F');
  
  // Filled bar
  const fillWidth = (matchRate / 100) * barWidth;
  if (fillWidth > 0) {
    const fillColor = matchRate >= 80 ? hexToRgb(colors.success) : 
                      matchRate >= 50 ? hexToRgb(colors.warning) : hexToRgb(colors.error);
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.roundedRect(barX, y - 4, fillWidth, barHeight, 2, 2, 'F');
  }
  
  // Percentage text
  doc.text(`${matchRate}%`, barX + barWidth + 5, y);
  
  y += 15;
  
  // Report metadata
  doc.setFontSize(typography.scale.caption);
  const mutedRgb = hexToRgb(colors.text.muted);
  doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
  doc.setFont(typography.fonts.body, 'normal');
  doc.text(`Generated: ${date}`, margins.left, y);
  doc.text(`Assets with inspection photos: ${stats.withImages}`, pageWidth - margins.right, y, { align: 'right' });

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
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
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

  // Add footers to all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addStandardFooter(doc, i, totalPages, siteName);
  }

  const filename = generateDocumentFilename('Asset_Verification', siteName);
  const blob = doc.output('blob');
  
  return { blob, filename };
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

  // ===== COVER PAGE =====
  addStandardHeader(doc, 'ASSET VERIFICATION REPORT', logoDataUrl);
  
  let y = headers.height + margins.top + 20;
  
  // Site name
  doc.setFontSize(typography.scale.h1);
  const primaryRgb = hexToRgb(colors.primary);
  doc.setTextColor(primaryRgb[0], primaryRgb[1], primaryRgb[2]);
  doc.setFont(typography.fonts.heading, 'bold');
  doc.text(siteName, pageWidth / 2, y, { align: 'center' });
  y += typography.paragraphSpacing.afterH1;
  
  // Subtitle
  doc.setFontSize(typography.scale.h3);
  const secondaryRgb = hexToRgb(colors.text.secondary);
  doc.setTextColor(secondaryRgb[0], secondaryRgb[1], secondaryRgb[2]);
  doc.setFont(typography.fonts.body, 'normal');
  doc.text('Asset Register vs Inspection Data Comparison', pageWidth / 2, y, { align: 'center' });
  y += typography.paragraphSpacing.afterH2 + 10;

  // KPI Cards
  const cardWidth = (contentWidth - (cards.margin * 4)) / 5;
  const cardHeight = 28;
  
  const kpiData = [
    { label: 'Total', value: stats.total.toString(), color: hexToRgb(colors.text.muted) },
    { label: 'Verified', value: stats.matchedNoDiscrepancy.toString(), color: hexToRgb(colors.success) },
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: hexToRgb(colors.warning) },
    { label: 'Unverified', value: (stats.assetOnly + stats.subsectionOnly).toString(), color: hexToRgb(colors.error) },
    { label: 'In Register', value: (stats.potentialMatches || 0).toString(), color: [147, 51, 234] as [number, number, number] },
  ];
  
  kpiData.forEach((kpi, i) => {
    const cardX = margins.left + i * (cardWidth + cards.margin);
    drawKpiCard(doc, cardX, y, cardWidth, cardHeight, kpi.value, kpi.label, kpi.color);
  });
  
  y += cardHeight + 15;
  
  // Verification Rate
  const matchRate = stats.total > 0 ? Math.round((stats.matchedNoDiscrepancy / stats.total) * 100) : 0;
  
  doc.setFontSize(typography.scale.body);
  doc.setFont(typography.fonts.heading, 'bold');
  const textRgb = hexToRgb(colors.text.primary);
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text('Verification Rate', margins.left, y);
  
  const barX = margins.left + 35;
  const barWidth = contentWidth - 50;
  const barHeight = 6;
  
  const bgRgb = hexToRgb(colors.background.header);
  doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
  doc.roundedRect(barX, y - 4, barWidth, barHeight, 2, 2, 'F');
  
  const fillWidth = (matchRate / 100) * barWidth;
  if (fillWidth > 0) {
    const fillColor = matchRate >= 80 ? hexToRgb(colors.success) : 
                      matchRate >= 50 ? hexToRgb(colors.warning) : hexToRgb(colors.error);
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.roundedRect(barX, y - 4, fillWidth, barHeight, 2, 2, 'F');
  }
  
  doc.text(`${matchRate}%`, barX + barWidth + 5, y);
  
  y += 15;
  
  // Metadata
  doc.setFontSize(typography.scale.caption);
  const mutedRgb = hexToRgb(colors.text.muted);
  doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
  doc.text(`Generated: ${date}`, margins.left, y);
  doc.text(`Assets Only: ${stats.assetOnly} | Inspections Only: ${stats.subsectionOnly}`, pageWidth - margins.right, y, { align: 'right' });

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
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
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

  // Add footers to all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addStandardFooter(doc, i, totalPages, siteName);
  }

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
