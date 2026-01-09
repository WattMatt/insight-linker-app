import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename } from "./documentDesignStandards";

interface Asset {
  id: string;
  premises_id: string;
  trade_as: string | null;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  breaker_size: string | null;
  asset_category: string;
}

interface Subsection {
  id: string;
  name: string;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  tenant_name: string | null;
}

interface ComparisonResult {
  asset: Asset | null;
  subsection: Subsection | null;
  matchType: "matched" | "asset_only" | "subsection_only";
  meterSerialMatch: "match" | "mismatch" | "na";
  ctRatioMatch: "match" | "mismatch" | "na";
  hasDiscrepancy: boolean;
}

interface GeneratorOptions {
  siteName: string;
  comparisonResults: ComparisonResult[];
  stats: {
    total: number;
    matched: number;
    matchedNoDiscrepancy: number;
    discrepancies: number;
    assetOnly: number;
    subsectionOnly: number;
  };
  companyLogoUrl?: string | null;
}

const { typography, colors, margins, tables } = DOCUMENT_DESIGN_STANDARDS;

/**
 * Generate Asset Verification Report PDF
 */
export async function generateAssetVerificationReport(
  options: GeneratorOptions
): Promise<{ blob: Blob; filename: string }> {
  const { siteName, comparisonResults, stats, companyLogoUrl } = options;
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const date = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  // ===== COVER PAGE =====
  // Header bar
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  doc.setFontSize(typography.scale.h3);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('ASSET VERIFICATION REPORT', pageWidth / 2, 16, { align: 'center' });

  // Logo if available
  if (companyLogoUrl) {
    try {
      const logoImg = await loadImage(companyLogoUrl);
      if (logoImg) {
        const logoWidth = 40;
        const logoHeight = 20;
        doc.addImage(logoImg, 'PNG', pageWidth - logoWidth - 15, 30, logoWidth, logoHeight);
      }
    } catch (e) {
      console.error('Failed to load logo:', e);
    }
  }

  // Main title
  doc.setTextColor(colors.text.primary);
  doc.setFontSize(typography.scale.h1);
  doc.setFont('helvetica', 'bold');
  doc.text(siteName, pageWidth / 2, 60, { align: 'center' });
  
  doc.setFontSize(typography.scale.h3);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colors.text.secondary);
  doc.text('Asset Register vs Subsection Comparison', pageWidth / 2, 72, { align: 'center' });

  // Summary stats box
  const boxY = 90;
  const boxHeight = 50;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.roundedRect(margins.left, boxY, pageWidth - margins.left - margins.right, boxHeight, 3, 3);

  doc.setFontSize(typography.scale.body);
  doc.setTextColor(colors.text.primary);
  
  const col1X = margins.left + 15;
  const col2X = pageWidth / 2 + 10;
  let statY = boxY + 15;

  // Left column
  doc.setFont('helvetica', 'bold');
  doc.text('Total Items:', col1X, statY);
  doc.setFont('helvetica', 'normal');
  doc.text(stats.total.toString(), col1X + 35, statY);

  doc.setFont('helvetica', 'bold');
  doc.text('Matched:', col1X, statY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colors.success);
  doc.text(stats.matchedNoDiscrepancy.toString(), col1X + 35, statY + 10);
  doc.setTextColor(colors.text.primary);

  doc.setFont('helvetica', 'bold');
  doc.text('Discrepancies:', col1X, statY + 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(colors.warning);
  doc.text(stats.discrepancies.toString(), col1X + 35, statY + 20);
  doc.setTextColor(colors.text.primary);

  // Right column
  doc.setFont('helvetica', 'bold');
  doc.text('Assets Only:', col2X, statY);
  doc.setFont('helvetica', 'normal');
  doc.text(stats.assetOnly.toString(), col2X + 35, statY);

  doc.setFont('helvetica', 'bold');
  doc.text('Subsections Only:', col2X, statY + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(stats.subsectionOnly.toString(), col2X + 35, statY + 10);

  doc.setFont('helvetica', 'bold');
  doc.text('Report Date:', col2X, statY + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(date, col2X + 35, statY + 20);

  // ===== KPI SUMMARY PAGE =====
  doc.addPage();
  addPageHeader(doc, 'Summary Statistics', 2);

  const kpiY = 45;
  const cardWidth = (pageWidth - margins.left - margins.right - 20) / 3;
  const cardHeight = 45;
  const cardGap = 10;

  // Row 1: Total Assets, Matched, Discrepancies
  const row1Cards = [
    { label: 'Total Assets', value: stats.total.toString(), color: [100, 116, 139] },  // slate
    { label: 'Matched', value: stats.matchedNoDiscrepancy.toString(), color: [34, 197, 94] },  // green
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: [234, 179, 8] },  // yellow
  ];

  row1Cards.forEach((card, i) => {
    const x = margins.left + i * (cardWidth + cardGap);
    
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, kpiY, cardWidth, cardHeight, 3, 3, 'F');
    
    // Left accent bar
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(x, kpiY, 4, cardHeight, 'F');
    
    // Value
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(card.value, x + cardWidth / 2, kpiY + 22, { align: 'center' });
    
    // Label
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + cardWidth / 2, kpiY + 36, { align: 'center' });
  });

  // Row 2: Assets Only, Subsections Only
  const row2Y = kpiY + cardHeight + 15;
  const row2CardWidth = (pageWidth - margins.left - margins.right - 10) / 2;
  
  const row2Cards = [
    { label: 'Assets Without Subsection', value: stats.assetOnly.toString(), color: [249, 115, 22] },  // orange
    { label: 'Subsections Without Asset', value: stats.subsectionOnly.toString(), color: [59, 130, 246] },  // blue
  ];

  row2Cards.forEach((card, i) => {
    const x = margins.left + i * (row2CardWidth + cardGap);
    
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, row2Y, row2CardWidth, cardHeight, 3, 3, 'F');
    
    // Left accent bar
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(x, row2Y, 4, cardHeight, 'F');
    
    // Value
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(card.value, x + row2CardWidth / 2, row2Y + 22, { align: 'center' });
    
    // Label
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + row2CardWidth / 2, row2Y + 36, { align: 'center' });
  });

  // Match rate indicator
  const matchRate = stats.total > 0 ? Math.round((stats.matchedNoDiscrepancy / stats.total) * 100) : 0;
  const indicatorY = row2Y + cardHeight + 25;
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Match Rate', margins.left, indicatorY);
  
  // Progress bar background
  const barWidth = pageWidth - margins.left - margins.right - 50;
  const barHeight = 12;
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(margins.left, indicatorY + 5, barWidth, barHeight, 3, 3, 'F');
  
  // Progress bar fill
  const fillWidth = (matchRate / 100) * barWidth;
  if (fillWidth > 0) {
    const fillColor = matchRate >= 80 ? [34, 197, 94] : matchRate >= 50 ? [234, 179, 8] : [239, 68, 68];
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.roundedRect(margins.left, indicatorY + 5, fillWidth, barHeight, 3, 3, 'F');
  }
  
  // Percentage text
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`${matchRate}%`, margins.left + barWidth + 10, indicatorY + 14);

  // ===== MATCHED ITEMS TABLE =====
  doc.addPage();
  addPageHeader(doc, 'Matched Items', 3);

  const matchedResults = comparisonResults.filter(r => r.matchType === 'matched');
  
  if (matchedResults.length > 0) {
    autoTable(doc, {
      startY: 35,
      head: [[
        'Premises ID / Subsection',
        'Status',
        'Meter Serial (Asset)',
        'Meter Serial (Subsection)',
        'CT Ratio (Asset)',
        'CT Ratio (Subsection)',
        'Breaker'
      ]],
      body: matchedResults.map(r => [
        r.asset?.premises_id || '-',
        r.hasDiscrepancy ? '⚠ Mismatch' : '✓ Match',
        r.asset?.meter_serial_number || '-',
        r.subsection?.meter_serial_number || '-',
        r.asset?.ct_ratio || '-',
        r.subsection?.ct_ratio || '-',
        r.asset?.breaker_size || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: tables.cellPadding,
      },
      headStyles: {
        fillColor: [237, 242, 247],
        textColor: [26, 32, 44],
        fontStyle: 'bold',
        fontSize: tables.header.fontSize,
      },
      columnStyles: {
        1: { cellWidth: 22 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 1) {
          const value = data.cell.raw as string;
          if (value.includes('Mismatch')) {
            data.cell.styles.textColor = [214, 158, 46];
            data.cell.styles.fontStyle = 'bold';
          } else if (value.includes('Match')) {
            data.cell.styles.textColor = [56, 161, 105];
            data.cell.styles.fontStyle = 'bold';
          }
        }
        // Highlight mismatched values
        if (data.section === 'body') {
          const result = matchedResults[data.row.index];
          if (result) {
            // Meter serial mismatch
            if ((data.column.index === 2 || data.column.index === 3) && result.meterSerialMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
            // CT ratio mismatch
            if ((data.column.index === 4 || data.column.index === 5) && result.ctRatioMatch === 'mismatch') {
              data.cell.styles.fillColor = [254, 243, 199];
            }
          }
        }
      },
    });
  } else {
    doc.setFontSize(typography.scale.body);
    doc.setTextColor(colors.text.muted);
    doc.text('No matched items found.', margins.left, 45);
  }

  // ===== DISCREPANCIES TABLE =====
  const discrepancies = comparisonResults.filter(r => r.hasDiscrepancy);
  if (discrepancies.length > 0) {
    doc.addPage();
    addPageHeader(doc, 'Discrepancies Detail', doc.internal.pages.length);

    autoTable(doc, {
      startY: 35,
      head: [['Premises ID', 'Field', 'Asset Value', 'Subsection Value', 'Status']],
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
        cellPadding: tables.cellPadding,
      },
      headStyles: {
        fillColor: [254, 243, 199],
        textColor: [146, 64, 14],
        fontStyle: 'bold',
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          data.cell.styles.textColor = [214, 158, 46];
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // ===== UNMATCHED ASSETS =====
  const assetOnly = comparisonResults.filter(r => r.matchType === 'asset_only');
  if (assetOnly.length > 0) {
    doc.addPage();
    addPageHeader(doc, 'Assets Without Matching Subsection', doc.internal.pages.length);

    autoTable(doc, {
      startY: 35,
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
        cellPadding: tables.cellPadding,
      },
      headStyles: {
        fillColor: [254, 215, 170],
        textColor: [154, 52, 18],
        fontStyle: 'bold',
      },
    });
  }

  // ===== SUBSECTIONS WITHOUT ASSETS =====
  const subsectionOnly = comparisonResults.filter(r => r.matchType === 'subsection_only');
  if (subsectionOnly.length > 0) {
    doc.addPage();
    addPageHeader(doc, 'Subsections Without Matching Asset', doc.internal.pages.length);

    autoTable(doc, {
      startY: 35,
      head: [['Subsection Name', 'Tenant Name', 'Meter Serial', 'CT Ratio']],
      body: subsectionOnly.map(r => [
        r.subsection?.name || '-',
        r.subsection?.tenant_name || '-',
        r.subsection?.meter_serial_number || '-',
        r.subsection?.ct_ratio || '-'
      ]),
      styles: {
        fontSize: tables.body.fontSize,
        cellPadding: tables.cellPadding,
      },
      headStyles: {
        fillColor: [191, 219, 254],
        textColor: [30, 64, 175],
        fontStyle: 'bold',
      },
    });
  }

  // Add footers to all pages
  const totalPages = doc.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageFooter(doc, i, totalPages, siteName);
  }

  const filename = generateDocumentFilename('Asset_Verification', siteName);
  const blob = doc.output('blob');
  
  return { blob, filename };
}

function addPageHeader(doc: jsPDF, title: string, pageNum: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, pageWidth, 25, 'F');
  
  doc.setFontSize(typography.scale.h3);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 16, { align: 'center' });
}

function addPageFooter(doc: jsPDF, currentPage: number, totalPages: number, siteName: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  doc.line(margins.left, pageHeight - 15, pageWidth - margins.right, pageHeight - 15);
  
  doc.setFontSize(typography.scale.footer);
  doc.setTextColor(colors.text.muted);
  doc.setFont('helvetica', 'normal');
  
  doc.text('CONFIDENTIAL - For authorized use only', margins.left, pageHeight - 8);
  doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  doc.text(new Date().toLocaleDateString(), pageWidth - margins.right, pageHeight - 8, { align: 'right' });
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
