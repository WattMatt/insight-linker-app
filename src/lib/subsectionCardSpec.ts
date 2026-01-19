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

// Extended card data with tenant name (used in some views)
export interface SubsectionCardData extends SubsectionData {
  tenantName?: string | null;
  cocNumber?: string | null;
  cocIssueDate?: string | null;
  cocType?: string | null;
}

// ============================================================================
// LAYOUT CONSTANTS - Used by both React preview and PDF generator
// ============================================================================

export const CARD_LAYOUT = {
  // Card dimensions
  cardPadding: 12,
  cardBorderRadius: 8,
  cardBorderWidth: 1,
  
  // Header
  headerHeight: 40,
  titleSize: 14,
  categoryBadgeSize: 10,
  
  // QR Code
  qrCodeSize: 80,
  qrCodeLogoSize: 20,
  
  // Content sections
  sectionSpacing: 8,
  labelSize: 10,
  valueSize: 11,
  
  // Status badges
  badgeHeight: 20,
  badgePadding: 6,
  badgeFontSize: 9,
  
  // Snag list
  snagItemHeight: 24,
  maxSnagsShown: 3,
  
  // Footer
  footerHeight: 32,
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
      width: CARD_LAYOUT.qrCodeSize * 2, // 2x for retina
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
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
      
      if (ctx) {
        // Draw QR code
        ctx.drawImage(qrImg, 0, 0);
        
        // Draw white circle background for logo
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const logoSize = CARD_LAYOUT.qrCodeLogoSize * 2;
        
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(centerX, centerY, logoSize / 2 + 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Try to load and draw logo
        const logoImg = new Image();
        logoImg.crossOrigin = 'anonymous';
        logoImg.onload = () => {
          ctx.drawImage(
            logoImg,
            centerX - logoSize / 2,
            centerY - logoSize / 2,
            logoSize,
            logoSize
          );
          resolve(canvas.toDataURL('image/png'));
        };
        logoImg.onerror = () => {
          resolve(canvas.toDataURL('image/png'));
        };
        logoImg.src = logoUrl;
      } else {
        resolve(qrDataUrl);
      }
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
