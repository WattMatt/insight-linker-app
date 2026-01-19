/**
 * PDF Subsection Card Renderer
 * 
 * Generates pdfmake content definitions for subsection cards
 * using the shared SubsectionCardSpec for layout consistency.
 */

import { 
  SubsectionCardData,
  SnagData,
  CARD_LAYOUT, 
  STATUS_COLORS, 
  RISK_COLORS,
  getCocStatusLabel,
  getComplianceLabel,
  generateSubsectionQRCode
} from './subsectionCardSpec';

// ============================================================================
// MAIN RENDERER
// ============================================================================

export async function renderSubsectionCardToPDF(
  data: SubsectionCardData,
  accentColor: string = '#3b82f6',
  logoUrl?: string | null
): Promise<any> {
  // Generate QR code if URL exists
  let qrCodeDataUrl: string | null = null;
  if (data.qrCodeUrl) {
    try {
      qrCodeDataUrl = await generateSubsectionQRCode(data.qrCodeUrl, logoUrl);
    } catch (e) {
      console.warn('Failed to generate QR code for subsection:', data.id);
    }
  }

  const cardContent = {
    stack: [
      // Card container with border
      {
        table: {
          widths: ['*'],
          body: [[
            {
              stack: [
                // Header
                createCardHeader(data, accentColor),
                // Main content with QR
                createCardBody(data, qrCodeDataUrl),
                // Snags section
                createSnagsSection(data.snags || []),
                // Footer with compliance
                createCardFooter(data),
              ],
              margin: [CARD_LAYOUT.cardPadding, CARD_LAYOUT.cardPadding, CARD_LAYOUT.cardPadding, CARD_LAYOUT.cardPadding],
            }
          ]]
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => '#e5e7eb',
          vLineColor: () => '#e5e7eb',
        }
      }
    ],
    unbreakable: true,
  };

  return cardContent;
}

// ============================================================================
// CARD SECTIONS
// ============================================================================

function createCardHeader(data: SubsectionCardData, accentColor: string): any {
  const categoryBadge = data.category ? {
    text: data.category,
    fontSize: CARD_LAYOUT.categoryBadgeSize,
    color: '#6b7280',
    background: '#f3f4f6',
    margin: [4, 2, 4, 2],
  } : { text: '' };

  return {
    columns: [
      {
        stack: [
          { 
            text: data.name, 
            fontSize: CARD_LAYOUT.titleSize, 
            bold: true, 
            color: '#111827' 
          },
          data.tenantName ? { 
            text: data.tenantName, 
            fontSize: 10, 
            color: '#6b7280',
            margin: [0, 2, 0, 0]
          } : { text: '' },
        ],
        width: '*',
      },
      {
        stack: [categoryBadge],
        width: 'auto',
        alignment: 'right',
      }
    ],
    margin: [0, 0, 0, CARD_LAYOUT.sectionSpacing],
  };
}

function createCardBody(data: SubsectionCardData, qrCodeDataUrl: string | null): any {
  const cocStatus = data.cocStatus || 'pending';
  const cocColors = STATUS_COLORS[cocStatus] || STATUS_COLORS.pending;

  // Left column: COC Status, Metering info
  const leftColumn = {
    stack: [
      // COC Status
      {
        columns: [
          { text: 'COC Status:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
          createStatusBadge(getCocStatusLabel(data.cocStatus), cocColors),
        ],
        margin: [0, 0, 0, 6],
      },
      // COC Number if available
      data.cocNumber ? {
        columns: [
          { text: 'COC #:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
          { text: data.cocNumber, fontSize: CARD_LAYOUT.valueSize, color: '#374151' },
        ],
        margin: [0, 0, 0, 6],
      } : { text: '' },
      // Metering, Meter S/N, and CT Ratio - all on one row
      {
        columns: [
          { 
            columns: [
              { text: 'Metering:', fontSize: 9, color: '#6b7280', width: 'auto' },
              { text: data.meteringStatus || 'N/A', fontSize: 10, color: '#374151', bold: true, margin: [4, 0, 0, 0] },
            ],
            width: 'auto',
          },
          { 
            columns: [
              { text: 'Meter S/N:', fontSize: 9, color: '#6b7280', width: 'auto' },
              { text: data.meterSerialNumber || 'N/A', fontSize: 10, color: '#374151', bold: true, margin: [4, 0, 0, 0] },
            ],
            width: 'auto',
            margin: [20, 0, 0, 0],
          },
          { 
            columns: [
              { text: 'CT Ratio:', fontSize: 9, color: '#6b7280', width: 'auto' },
              { text: data.ctRatio || 'N/A', fontSize: 10, color: '#374151', bold: true, margin: [4, 0, 0, 0] },
            ],
            width: 'auto',
            margin: [20, 0, 0, 0],
          },
        ],
        margin: [0, 0, 0, 6],
      },
    ],
    width: '*',
  };

  // Right column: QR Code
  const rightColumn = qrCodeDataUrl ? {
    stack: [
      {
        image: qrCodeDataUrl,
        width: CARD_LAYOUT.qrCodeSize,
        height: CARD_LAYOUT.qrCodeSize,
        alignment: 'center',
      },
      { 
        text: 'Scan for details', 
        fontSize: 7, 
        color: '#9ca3af', 
        alignment: 'center',
        margin: [0, 4, 0, 0],
      }
    ],
    width: CARD_LAYOUT.qrCodeSize + 10,
    alignment: 'center',
  } : {
    stack: [
      {
        canvas: [{
          type: 'rect',
          x: 0,
          y: 0,
          w: CARD_LAYOUT.qrCodeSize,
          h: CARD_LAYOUT.qrCodeSize,
          r: 4,
          lineWidth: 1,
          lineColor: '#d1d5db',
        }],
      },
      { 
        text: 'No QR Code', 
        fontSize: 8, 
        color: '#9ca3af', 
        alignment: 'center',
        margin: [0, 4, 0, 0],
      }
    ],
    width: CARD_LAYOUT.qrCodeSize + 10,
    alignment: 'center',
  };

  return {
    columns: [leftColumn, rightColumn],
    columnGap: 15,
    margin: [0, 0, 0, CARD_LAYOUT.sectionSpacing],
  };
}

function createSnagsSection(snags: SnagData[]): any {
  if (!snags || snags.length === 0) {
    return {
      columns: [
        { text: 'Snags:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
        { 
          text: '✓ No open snags', 
          fontSize: CARD_LAYOUT.valueSize, 
          color: '#166534',
          italics: true,
        },
      ],
      margin: [0, 0, 0, CARD_LAYOUT.sectionSpacing],
    };
  }

  const displaySnags = snags.slice(0, CARD_LAYOUT.maxSnagsShown);
  const remainingCount = snags.length - displaySnags.length;

  const snagItems: any[] = displaySnags.map(snag => {
    const riskColors = RISK_COLORS[snag.riskLevel] || RISK_COLORS.low;
    return {
      columns: [
        {
          text: snag.riskLevel.toUpperCase(),
          fontSize: 7,
          color: riskColors.text,
          background: riskColors.bg,
          margin: [3, 1, 3, 1],
          width: 40,
        },
        {
          text: snag.title,
          fontSize: CARD_LAYOUT.valueSize - 1,
          color: '#374151',
          width: '*',
        },
      ],
      margin: [0, 2, 0, 2],
    };
  });

  if (remainingCount > 0) {
    snagItems.push({
      text: `+ ${remainingCount} more snag${remainingCount > 1 ? 's' : ''}`,
      fontSize: 9,
      color: '#6b7280',
      italics: true,
      margin: [0, 2, 0, 0],
    });
  }

  return {
    stack: [
      { 
        text: 'Snags:', 
        fontSize: CARD_LAYOUT.labelSize, 
        color: '#6b7280',
        margin: [0, 0, 0, 4],
      },
      ...snagItems,
    ],
    margin: [0, 0, 0, CARD_LAYOUT.sectionSpacing],
  };
}

function createCardFooter(data: SubsectionCardData): any {
  const isCompliant = data.isCompliant;
  const complianceColors = isCompliant === true 
    ? STATUS_COLORS.compliant 
    : isCompliant === false 
      ? STATUS_COLORS.nonCompliant 
      : { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' };

  return {
    columns: [
      { text: 'Compliance:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
      createStatusBadge(getComplianceLabel(isCompliant), complianceColors),
    ],
    margin: [0, CARD_LAYOUT.sectionSpacing, 0, 0],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function createStatusBadge(
  text: string, 
  colors: { bg: string; text: string; border?: string }
): any {
  return {
    text: text,
    fontSize: CARD_LAYOUT.badgeFontSize,
    color: colors.text,
    background: colors.bg,
    margin: [CARD_LAYOUT.badgePadding, 2, CARD_LAYOUT.badgePadding, 2],
  };
}

// ============================================================================
// FULL-WIDTH STACKED LAYOUT RENDERER
// ============================================================================

export async function renderSubsectionGrid(
  subsections: SubsectionCardData[],
  accentColor: string = '#3b82f6',
  logoUrl?: string | null
): Promise<any> {
  const cards: any[] = [];
  
  // Stack subsections vertically, each taking full page width
  for (const subsection of subsections) {
    const card = await renderSubsectionCardToPDF(subsection, accentColor, logoUrl);
    cards.push({
      ...card,
      margin: [0, 0, 0, 20], // Space between cards
      pageBreak: cards.length > 0 ? undefined : undefined, // Could add pageBreak: 'before' if needed
    });
  }

  return {
    stack: cards,
  };
}
