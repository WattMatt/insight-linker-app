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
  getComplianceLabel,
  generateSubsectionQRCode
} from './subsectionCardSpec';
import type { CocCardLine } from './cocHierarchy';

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

// Small status pill for a single COC line (Pass/Fail/Pending).
function cocLineStatusBadge(status: CocCardLine['status']): any {
  const colors = status === 'Pass' ? STATUS_COLORS.pass
    : status === 'Fail' || status === 'Missing' ? STATUS_COLORS.fail
    : STATUS_COLORS.pending;
  return createStatusBadge(status, colors);
}

// COC certificate block: lists every certificate as an "I" (initial) or "S"
// (supplementary) line. A subsection that does not require a COC shows
// "Not Required" and is never reported as Missing. When the initial certificate
// is absent we still render an "I — Missing" line.
function createCocBlock(data: SubsectionCardData): any {
  if (data.isCocRequired === false) {
    return {
      columns: [
        { text: 'COC:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
        createStatusBadge('Not Required', { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db' }),
      ],
      margin: [0, 0, 0, 8],
    };
  }

  const lines: CocCardLine[] = data.cocCertificates && data.cocCertificates.length > 0
    ? data.cocCertificates
    : [{ label: 'I', number: 'Missing', status: 'Missing', missing: true }];

  return {
    stack: [
      { text: 'COC Certificates:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', margin: [0, 0, 0, 3] },
      ...lines.map(line => ({
        columns: [
          {
            // I / S tag
            table: { widths: ['auto'], body: [[{
              text: line.label, fontSize: 8, bold: true,
              color: line.missing ? '#991b1b' : '#1e40af', alignment: 'center',
            }]] },
            layout: {
              hLineWidth: () => 0, vLineWidth: () => 0,
              paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 1, paddingBottom: () => 1,
              fillColor: () => (line.missing ? '#fee2e2' : '#dbeafe'),
            },
            width: 'auto',
          },
          {
            text: line.number,
            fontSize: CARD_LAYOUT.valueSize,
            color: line.missing ? '#991b1b' : '#374151',
            bold: !line.missing,
            italics: line.missing,
            margin: [6, 1, 0, 0],
            width: '*',
          },
          line.missing ? { text: '', width: 'auto' } : cocLineStatusBadge(line.status),
        ],
        margin: [0, 1, 0, 1],
      })),
    ],
    margin: [0, 0, 0, 8],
  };
}

function createCardBody(data: SubsectionCardData, qrCodeDataUrl: string | null): any {
  // Left column: COC certificates (I/S), Breaker Size, Metering info
  const leftColumn = {
    stack: [
      // COC certificate list (Initial / Supplementary), or "Not Required"
      createCocBlock(data),
      // Circuit Breaker Size row
      {
        columns: [
          { text: 'Breaker Size:', fontSize: CARD_LAYOUT.labelSize, color: '#6b7280', width: 70 },
          { text: data.breakerSize || 'N/A', fontSize: CARD_LAYOUT.valueSize, color: '#374151', bold: true },
        ],
        margin: [0, 0, 0, 6],
      },
      // Metering, Meter S/N, and CT Ratio - using simple table for reliable layout
      {
        table: {
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
          body: [[
            { text: 'Metering:', fontSize: 9, color: '#6b7280', margin: [0, 0, 4, 0] },
            { text: data.meteringStatus || 'N/A', fontSize: 10, color: '#374151', bold: true, margin: [0, 0, 15, 0] },
            { text: 'S/N:', fontSize: 9, color: '#6b7280', margin: [0, 0, 4, 0] },
            { text: data.meterSerialNumber || 'N/A', fontSize: 10, color: '#374151', bold: true, margin: [0, 0, 15, 0] },
            { text: 'CT:', fontSize: 9, color: '#6b7280', margin: [0, 0, 4, 0] },
            { text: data.ctRatio || 'N/A', fontSize: 10, color: '#374151', bold: true },
          ]],
        },
        layout: 'noBorders',
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
          // Use table with fillColor for proper badge background
          table: {
            widths: ['auto'],
            body: [[{
              text: snag.riskLevel.toUpperCase(),
              fontSize: 7,
              bold: true,
              color: riskColors.text,
              alignment: 'center',
            }]],
          },
          layout: {
            hLineWidth: () => 0,
            vLineWidth: () => 0,
            paddingLeft: () => 4,
            paddingRight: () => 4,
            paddingTop: () => 2,
            paddingBottom: () => 2,
            fillColor: () => riskColors.bg,
          },
          width: 'auto',
        },
        {
          text: snag.title,
          fontSize: CARD_LAYOUT.valueSize - 1,
          color: '#374151',
          width: '*',
          margin: [8, 2, 0, 0],
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
  // Use table with fillColor for proper background rendering in pdfmake
  return {
    table: {
      widths: ['auto'],
      body: [[{
        text: text,
        fontSize: CARD_LAYOUT.badgeFontSize,
        bold: true,
        color: colors.text,
        alignment: 'center',
      }]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => CARD_LAYOUT.badgePadding,
      paddingRight: () => CARD_LAYOUT.badgePadding,
      paddingTop: () => 3,
      paddingBottom: () => 3,
      fillColor: () => colors.bg,
    },
  };
}

// ============================================================================
// FULL-WIDTH STACKED LAYOUT RENDERER - 2 cards per page
// ============================================================================

export async function renderSubsectionGrid(
  subsections: SubsectionCardData[],
  accentColor: string = '#3b82f6',
  logoUrl?: string | null
): Promise<any> {
  const cards: any[] = [];
  
  // Stack subsections vertically with 2 per page
  // A4 content area is ~700pt tall, so each card should be ~320pt max with compact gap
  for (let i = 0; i < subsections.length; i++) {
    const card = await renderSubsectionCardToPDF(subsections[i], accentColor, logoUrl);
    
    // Page break before every pair (except first)
    const needsPageBreak = i > 0 && i % 2 === 0;
    
    // Compact margin between cards - only 10pt gap for tighter layout
    cards.push({
      ...card,
      margin: [0, 0, 0, 10],
      pageBreak: needsPageBreak ? 'before' : undefined,
    });
  }

  return {
    stack: cards,
    margin: [0, 0, 0, 0],
  };
}
