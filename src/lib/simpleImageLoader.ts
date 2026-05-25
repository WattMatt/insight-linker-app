/**
 * SIMPLE IMAGE LOADER
 * 
 * Unified image loading for PDF generation using Supabase Storage native download.
 * Handles all bucket types: client-logos, site-images, inspection-photos, documents
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Parse Supabase storage URL to extract bucket and path.
 * Handles all URL formats including query parameters and timestamps.
 */
function parseSupabaseUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Match: /storage/v1/object/public/BUCKET/PATH or /storage/v1/object/sign/BUCKET/PATH
    const pathMatch = urlObj.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^\/]+)\/(.+)$/);
    
    if (pathMatch) {
      return {
        bucket: pathMatch[1],
        path: decodeURIComponent(pathMatch[2])
      };
    }
    
    return null;
  } catch (e) {
    if (import.meta.env.DEV) console.warn(`[SimpleLoader] Failed to parse URL: ${url}`, e);
    return null;
  }
}

/**
 * Convert Blob to base64 data URL
 */
function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = () => {
      if (import.meta.env.DEV) console.error(`[SimpleLoader] FileReader failed`);
      resolve(null);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Load image as base64 data URL using Supabase Storage native download.
 * This bypasses CORS issues by using the authenticated storage API.
 */
export async function loadImageSimple(url: string): Promise<string | null> {
  if (!url) return null;
  
  // Skip if already a data URL
  if (url.startsWith('data:')) {
    return url;
  }
  
  
  try {
    // Check if it's a Supabase storage URL
    const storageInfo = parseSupabaseUrl(url);
    
    if (storageInfo) {
      
      // Use Supabase storage download - bypasses CORS issues
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .download(storageInfo.path);
      
      if (error) {
        if (import.meta.env.DEV) console.warn(`[SimpleLoader] Supabase download failed for ${storageInfo.bucket}/${storageInfo.path}:`, error.message);
      } else if (data) {
        return await blobToDataUrl(data);
      }
    }
    
    // Fallback: direct fetch (for non-Supabase URLs or if Supabase download failed)
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        return await blobToDataUrl(blob);
      } else {
        if (import.meta.env.DEV) console.warn(`[SimpleLoader] Fetch failed with status: ${response.status}`);
      }
    } catch (fetchError) {
      if (import.meta.env.DEV) console.warn(`[SimpleLoader] Direct fetch failed:`, fetchError);
    }
    
    if (import.meta.env.DEV) console.error(`[SimpleLoader] All methods failed for: ${url.substring(0, 80)}...`);
    return null;
  } catch (error) {
    if (import.meta.env.DEV) console.error(`[SimpleLoader] Unexpected error:`, error);
    return null;
  }
}

/**
 * Load multiple images in parallel.
 * Returns a Map of original URL -> base64 data URL
 */
export async function loadImagesSimple(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  
  if (uniqueUrls.length === 0) {
    return results;
  }
  
  
  const promises = uniqueUrls.map(async (url) => {
    const dataUrl = await loadImageSimple(url);
    if (dataUrl) {
      results.set(url, dataUrl);
    }
  });
  
  await Promise.all(promises);
  
  return results;
}
