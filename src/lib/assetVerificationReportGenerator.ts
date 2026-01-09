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

  // KPI Cards on cover page
  const kpiY = 85;
  const cardWidth = (pageWidth - margins.left - margins.right - 15) / 4;
  const cardHeight = 32;
  const cardGap = 5;

  const kpiCards = [
    { label: 'Total', value: stats.total.toString(), color: [100, 116, 139] },
    { label: 'Matched', value: stats.matchedNoDiscrepancy.toString(), color: [34, 197, 94] },
    { label: 'Discrepancies', value: stats.discrepancies.toString(), color: [234, 179, 8] },
    { label: 'Unmatched', value: (stats.assetOnly + stats.subsectionOnly).toString(), color: [239, 68, 68] },
  ];

  kpiCards.forEach((card, i) => {
    const x = margins.left + i * (cardWidth + cardGap);
    
    // Card background
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, kpiY, cardWidth, cardHeight, 2, 2, 'F');
    
    // Left accent bar
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(x, kpiY, 3, cardHeight, 'F');
    
    // Value
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(card.value, x + cardWidth / 2, kpiY + 14, { align: 'center' });
    
    // Label
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + cardWidth / 2, kpiY + 25, { align: 'center' });
  });

  // Match rate bar
  const matchRate = stats.total > 0 ? Math.round((stats.matchedNoDiscrepancy / stats.total) * 100) : 0;
  const barY = kpiY + cardHeight + 12;
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Match Rate', margins.left, barY);
  
  const barWidth = pageWidth - margins.left - margins.right - 40;
  const barHeight = 8;
  doc.setFillColor(226, 232, 240);
  doc.roundedRect(margins.left + 30, barY - 6, barWidth, barHeight, 2, 2, 'F');
  
  const fillWidth = (matchRate / 100) * barWidth;
  if (fillWidth > 0) {
    const fillColor = matchRate >= 80 ? [34, 197, 94] : matchRate >= 50 ? [234, 179, 8] : [239, 68, 68];
    doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
    doc.roundedRect(margins.left + 30, barY - 6, fillWidth, barHeight, 2, 2, 'F');
  }
  
  doc.text(`${matchRate}%`, margins.left + 32 + barWidth + 5, barY);

  // Report details
  const detailsY = barY + 18;
  doc.setFontSize(typography.scale.caption);
  doc.setTextColor(colors.text.muted);
  doc.text(`Generated: ${date}`, margins.left, detailsY);
  doc.text(`Assets Only: ${stats.assetOnly} | Subsections Only: ${stats.subsectionOnly}`, pageWidth - margins.right, detailsY, { align: 'right' });

  // ===== MATCHED ITEMS TABLE =====
  doc.addPage();
  addPageHeader(doc, 'Matched Items', 2);

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
