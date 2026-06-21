/**
 * Unified Subsection Card Specification
 * 
 * This file defines the SINGLE SOURCE OF TRUTH for subsection card layout
 * used by both the template preview (React) and PDF generator (pdfmake).
 * 
 * Re-exports types from siteSummaryRenderSpec for consistency.
 */

import QRCode from 'qrcode';

// Re-export types from the spec for consistency
export type { SnagData, SubsectionData } from './siteSummaryRenderSpec';
import type { SnagData, SubsectionData } from './siteSummaryRenderSpec';
import type { CocCardLine } from './cocHierarchy';

// Extended card data with tenant name (used in some views)
export interface SubsectionCardData extends SubsectionData {
  tenantName?: string | null;
  cocNumber?: string | null;
  cocIssueDate?: string | null;
  cocType?: string | null;
  breakerSize?: string | null;
  // Initial/Supplementary COC certificate lines built from subsection_documents
  // (see cocHierarchy.buildCocCardLines). Empty when not yet populated.
  cocCertificates?: CocCardLine[];
}

// ============================================================================
// LAYOUT CONSTANTS - Used by both React preview and PDF generator
// ============================================================================

export const CARD_LAYOUT = {
  // Card dimensions - compact for 2 cards per page
  cardPadding: 10,
  cardBorderRadius: 6,
  cardBorderWidth: 1,
  
  // Header
  headerHeight: 32,
  titleSize: 13,
  categoryBadgeSize: 9,
  
  // QR Code (display size in the PDF card; generation resolution is decoupled — see generateSubsectionQRCode)
  qrCodeSize: 90,
  qrCodeLogoSize: 18,
  
  // Content sections - tighter spacing
  sectionSpacing: 6,
  labelSize: 9,
  valueSize: 10,
  
  // Status badges
  badgeHeight: 18,
  badgePadding: 5,
  badgeFontSize: 8,
  
  // Snag list
  snagItemHeight: 20,
  maxSnagsShown: 3,
  
  // Footer
  footerHeight: 28,
} as const;

export const STATUS_COLORS = {
  pass: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  fail: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  pending: { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  compliant: { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  nonCompliant: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
} as const;

export const RISK_COLORS = {
  high: { bg: '#fee2e2', text: '#991b1b' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  low: { bg: '#dbeafe', text: '#1e40af' },
} as const;

// ============================================================================
// QR CODE GENERATION - Shared utility
// ============================================================================

const qrCodeCache = new Map<string, string>();

export async function generateSubsectionQRCode(
  url: string,
  logoUrl?: string | null
): Promise<string> {
  const cacheKey = `${url}-${logoUrl || 'no-logo'}`;
  
  if (qrCodeCache.has(cacheKey)) {
    return qrCodeCache.get(cacheKey)!;
  }
  
  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      // High-res source, DECOUPLED from the small card display size. The encoded
      // qr-redirect URL is ~107 chars → at ECC 'H' that's a 57x57-module (v10) QR;
      // generating at 140px gave ~2.4px/module (unscannable + blurry). 500px gives
      // ~8.5px/module — crisp when pdfmake downscales it into the card.
      width: 500,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      // 'H' (30% recovery) keeps the code scannable under the centered logo overlay,
      // matching qrCodeGenerator / LabeledQRCode.
      errorCorrectionLevel: 'H',
    });
    
    // If we have a logo, embed it in the center
    if (logoUrl) {
      const withLogo = await embedLogoInQR(qrDataUrl, logoUrl);
      qrCodeCache.set(cacheKey, withLogo);
      return withLogo;
    }
    
    qrCodeCache.set(cacheKey, qrDataUrl);
    return qrDataUrl;
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    // Return a placeholder
    return '';
  }
}

async function embedLogoInQR(qrDataUrl: string, logoUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const qrImg = new Image();
    
    qrImg.onload = () => {
      canvas.width = qrImg.width;
      canvas.height = qrImg.height;

      if (!ctx) {
        resolve(qrDataUrl);
        return;
      }

      // Draw QR code
      ctx.drawImage(qrImg, 0, 0);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const maxLogoSize = canvas.width * 0.28; // ~28% of the high-res QR (proportional, not a fixed px)

      // Draw the logo aspect-ratio-preserved with a white rectangular backing, matching
      // qrCodeGenerator / LabeledQRCode so a wide WM logo is never squashed into a square.
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.onload = () => {
        let logoWidth = logoImg.width;
        let logoHeight = logoImg.height;
        if (logoWidth > logoHeight) {
          if (logoWidth > maxLogoSize) {
            logoHeight = (logoHeight * maxLogoSize) / logoWidth;
            logoWidth = maxLogoSize;
          }
        } else {
          if (logoHeight > maxLogoSize) {
            logoWidth = (logoWidth * maxLogoSize) / logoHeight;
            logoHeight = maxLogoSize;
          }
        }
        const logoX = centerX - logoWidth / 2;
        const logoY = centerY - logoHeight / 2;
        const logoPadding = Math.min(logoWidth, logoHeight) * 0.15;

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(
          logoX - logoPadding,
          logoY - logoPadding,
          logoWidth + logoPadding * 2,
          logoHeight + logoPadding * 2,
        );
        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
        resolve(canvas.toDataURL('image/png'));
      };
      logoImg.onerror = () => {
        resolve(canvas.toDataURL('image/png'));
      };
      logoImg.src = logoUrl;
    };
    
    qrImg.onerror = () => {
      resolve(qrDataUrl);
    };
    
    qrImg.src = qrDataUrl;
  });
}

// ============================================================================
// DATA HELPERS
// ============================================================================

export function getCocStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Missing';
  // Normalize the status display
  const normalized = status.toLowerCase();
  if (['approved', 'valid', 'pass'].includes(normalized)) return 'Valid';
  if (['rejected', 'invalid', 'fail', 'failed'].includes(normalized)) return 'Invalid';
  if (['pending', 'awaiting'].includes(normalized)) return 'Pending';
  return status; // Return as-is if not matched (e.g., 'Missing')
}

export function formatMeteringInfo(data: SubsectionCardData): string {
  const parts: string[] = [];
  if (data.meterSerialNumber) parts.push(`S/N: ${data.meterSerialNumber}`);
  if (data.ctRatio) parts.push(`CT: ${data.ctRatio}`);
  return parts.join(' | ') || 'No metering data';
}

export function getComplianceLabel(isCompliant: boolean | null | undefined): string {
  if (isCompliant === true) return 'Compliant';
  if (isCompliant === false) return 'Non-Compliant';
  return 'Unknown';
}

export function getRiskLevelColor(level: SnagData['riskLevel']) {
  return RISK_COLORS[level] || RISK_COLORS.low;
}
