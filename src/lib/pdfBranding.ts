/**
 * PDF BRANDING
 * Logo loading, caching, and branding asset management for PDF generation
 * 
 * This module handles fetching company branding from the database,
 * converting images to base64 for PDF embedding, and caching for performance.
 */

import { supabase } from '@/integrations/supabase/client';
import { DOCUMENT_DESIGN_STANDARDS } from './documentDesignStandards';
import { mmToPt } from './pdfMakeConfig';
import { formatDate as kernelFormatDate, formatDateTime as kernelFormatDateTime } from './report/reportKernel';

// ============================================================================
// BRANDING CONSTANTS
// ============================================================================

const { logo } = DOCUMENT_DESIGN_STANDARDS;

export const BRANDING = {
  // Logo dimensions in points
  logoWidth: mmToPt(logo.masterSize.width),           // ~113pt from 40mm
  logoHeight: mmToPt(logo.masterSize.maxHeight),      // ~57pt from 20mm
  
  // Larger logo for cover pages
  coverLogoWidth: mmToPt(60),                         // ~170pt
  coverLogoHeight: mmToPt(30),                        // ~85pt
  
  // Small logo for headers
  headerLogoWidth: mmToPt(25),                        // ~71pt
  headerLogoHeight: mmToPt(12),                       // ~34pt
  
  // Default text when logo is unavailable
  defaultOrgName: 'Asset Management System',
  
  // Confidentiality notice
  confidentialityText: DOCUMENT_DESIGN_STANDARDS.footers.confidentialityText,
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

interface BrandingCache {
  logoDataUrl: string | null;
  organizationName: string;
  lastFetched: number;
}

let brandingCache: BrandingCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Clear the branding cache (call when settings change)
 */
export function clearBrandingCache(): void {
  brandingCache = null;
}

/**
 * Get cached branding without fetching
 */
export function getCachedBranding(): { logoDataUrl: string | null; organizationName: string } {
  if (brandingCache && Date.now() - brandingCache.lastFetched < CACHE_TTL_MS) {
    return {
      logoDataUrl: brandingCache.logoDataUrl,
      organizationName: brandingCache.organizationName,
    };
  }
  return {
    logoDataUrl: null,
    organizationName: BRANDING.defaultOrgName,
  };
}

// ============================================================================
// IMAGE CONVERSION
// ============================================================================

/**
 * Convert an image URL to base64 data URL for PDF embedding
 * @param url - The URL of the image to convert
 * @returns Base64 data URL or null if conversion fails
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  
  try {
    // Handle data URLs - already in correct format
    if (url.startsWith('data:')) {
      return url;
    }
    
    // Fetch the image
    const response = await fetch(url, { 
      mode: 'cors',
      cache: 'force-cache',
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch image: ${response.status}`);
      return null;
    }
    
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result);
      };
      reader.onerror = () => {
        console.warn('FileReader error converting image to base64');
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn('Error converting image to base64:', error);
    return null;
  }
}

// ============================================================================
// BRANDING LOADING
// ============================================================================

/**
 * Load company branding from settings
 * Fetches logo and organization name, with caching for performance
 */
export async function loadCompanyBranding(): Promise<{
  logoDataUrl: string | null;
  organizationName: string;
}> {
  // Check cache first
  if (brandingCache && Date.now() - brandingCache.lastFetched < CACHE_TTL_MS) {
    return {
      logoDataUrl: brandingCache.logoDataUrl,
      organizationName: brandingCache.organizationName,
    };
  }
  
  try {
    const { data: settings, error } = await supabase
      .from('settings')
      .select('company_logo_url, company_name')
      .limit(1)
      .maybeSingle();
    
    if (error) {
      console.warn('Error fetching branding settings:', error);
      return getCachedBranding();
    }
    
    const organizationName = settings?.company_name || BRANDING.defaultOrgName;
    let logoDataUrl: string | null = null;
    
    if (settings?.company_logo_url) {
      logoDataUrl = await imageUrlToBase64(settings.company_logo_url);
    }
    
    // Update cache
    brandingCache = {
      logoDataUrl,
      organizationName,
      lastFetched: Date.now(),
    };
    
    return { logoDataUrl, organizationName };
  } catch (error) {
    console.warn('Error loading company branding:', error);
    return getCachedBranding();
  }
}

/**
 * Load client branding (logo) for a specific client
 */
export async function loadClientBranding(clientId: string): Promise<{
  logoDataUrl: string | null;
  clientName: string;
}> {
  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('name, logo_url')
      .eq('id', clientId)
      .maybeSingle();
    
    if (error || !client) {
      console.warn('Error fetching client branding:', error);
      return { logoDataUrl: null, clientName: 'Unknown Client' };
    }
    
    let logoDataUrl: string | null = null;
    if (client.logo_url) {
      logoDataUrl = await imageUrlToBase64(client.logo_url);
    }
    
    return {
      logoDataUrl,
      clientName: client.name,
    };
  } catch (error) {
    console.warn('Error loading client branding:', error);
    return { logoDataUrl: null, clientName: 'Unknown Client' };
  }
}

/**
 * Load site branding with fallback to client logo
 */
export async function loadSiteBranding(siteId: string): Promise<{
  logoDataUrl: string | null;
  siteName: string;
  clientName: string;
}> {
  try {
    const { data: site, error } = await supabase
      .from('sites')
      .select(`
        name,
        client_logo_url,
        clients (
          name,
          logo_url
        )
      `)
      .eq('id', siteId)
      .maybeSingle();
    
    if (error || !site) {
      console.warn('Error fetching site branding:', error);
      return { logoDataUrl: null, siteName: 'Unknown Site', clientName: 'Unknown Client' };
    }
    
    // Priority: site-specific logo > client logo
    const logoUrl = site.client_logo_url || (site.clients as any)?.logo_url;
    let logoDataUrl: string | null = null;
    
    if (logoUrl) {
      logoDataUrl = await imageUrlToBase64(logoUrl);
    }
    
    return {
      logoDataUrl,
      siteName: site.name,
      clientName: (site.clients as any)?.name || 'Unknown Client',
    };
  } catch (error) {
    console.warn('Error loading site branding:', error);
    return { logoDataUrl: null, siteName: 'Unknown Site', clientName: 'Unknown Client' };
  }
}

// ============================================================================
// PDFMAKE IMAGE HELPERS
// ============================================================================

// pdfmake types
type Content = any;
type ContentImage = any;

/**
 * Create a pdfmake image content object from a data URL
 */
export function createImageContent(
  dataUrl: string,
  options?: {
    width?: number;
    height?: number;
    fit?: [number, number];
    alignment?: 'left' | 'center' | 'right';
    margin?: [number, number, number, number];
  }
): ContentImage {
  const imageContent: ContentImage = {
    image: dataUrl,
  };
  
  if (options?.width) imageContent.width = options.width;
  if (options?.height) imageContent.height = options.height;
  if (options?.fit) imageContent.fit = options.fit;
  if (options?.alignment) imageContent.alignment = options.alignment;
  if (options?.margin) imageContent.margin = options.margin;
  
  return imageContent;
}

/**
 * Create a logo content object for headers
 */
export function createHeaderLogo(logoDataUrl: string | null, orgName: string): Content {
  if (logoDataUrl) {
    return createImageContent(logoDataUrl, {
      fit: [BRANDING.headerLogoWidth, BRANDING.headerLogoHeight],
      alignment: 'right',
    });
  }
  
  // Fallback to text
  return {
    text: orgName,
    style: 'h4',
    alignment: 'right' as const,
  };
}

/**
 * Create a logo content object for cover pages
 */
export function createCoverLogo(logoDataUrl: string | null, orgName: string): Content {
  if (logoDataUrl) {
    return createImageContent(logoDataUrl, {
      fit: [BRANDING.coverLogoWidth, BRANDING.coverLogoHeight],
      alignment: 'center',
      margin: [0, 0, 0, 20],
    });
  }
  
  // Fallback to styled text
  return {
    text: orgName,
    style: 'coverSubtitle',
    margin: [0, 0, 0, 20] as [number, number, number, number],
  };
}

// ============================================================================
// DATE AND REFERENCE FORMATTING
// ============================================================================

/**
 * Format a date for display in PDFs
 */
export function formatPdfDate(date?: Date | string): string {
  return kernelFormatDate(date);
}

/**
 * Format a datetime for display in PDFs. Delegates to the report kernel:
 * day-first, locale-independent, "—" for missing/invalid.
 */
export function formatPdfDateTime(date?: Date | string): string {
  return kernelFormatDateTime(date);
}

/**
 * Generate a reference number for documents
 */
export function generateReferenceNumber(prefix: string = 'REF'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}
