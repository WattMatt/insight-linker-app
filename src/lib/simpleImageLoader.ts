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
    console.warn(`[SimpleLoader] Failed to parse URL: ${url}`, e);
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
      console.log(`[SimpleLoader] Converted to base64: ${(result.length / 1024).toFixed(1)}KB`);
      resolve(result);
    };
    reader.onerror = () => {
      console.error(`[SimpleLoader] FileReader failed`);
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
    console.log(`[SimpleLoader] Already a data URL, returning as-is`);
    return url;
  }
  
  console.log(`[SimpleLoader] Loading: ${url.substring(0, 80)}...`);
  
  try {
    // Check if it's a Supabase storage URL
    const storageInfo = parseSupabaseUrl(url);
    
    if (storageInfo) {
      console.log(`[SimpleLoader] Using Supabase download: ${storageInfo.bucket}/${storageInfo.path.substring(0, 50)}...`);
      
      // Use Supabase storage download - bypasses CORS issues
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .download(storageInfo.path);
      
      if (error) {
        console.warn(`[SimpleLoader] Supabase download failed for ${storageInfo.bucket}/${storageInfo.path}:`, error.message);
      } else if (data) {
        console.log(`[SimpleLoader] Downloaded via Supabase: ${(data.size / 1024).toFixed(1)}KB`);
        return await blobToDataUrl(data);
      }
    }
    
    // Fallback: direct fetch (for non-Supabase URLs or if Supabase download failed)
    console.log(`[SimpleLoader] Trying direct fetch as fallback...`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        console.log(`[SimpleLoader] Fetched directly: ${(blob.size / 1024).toFixed(1)}KB`);
        return await blobToDataUrl(blob);
      } else {
        console.warn(`[SimpleLoader] Fetch failed with status: ${response.status}`);
      }
    } catch (fetchError) {
      console.warn(`[SimpleLoader] Direct fetch failed:`, fetchError);
    }
    
    console.error(`[SimpleLoader] All methods failed for: ${url.substring(0, 80)}...`);
    return null;
  } catch (error) {
    console.error(`[SimpleLoader] Unexpected error:`, error);
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
    console.log(`[SimpleLoader] No URLs to load`);
    return results;
  }
  
  console.log(`[SimpleLoader] Loading ${uniqueUrls.length} images...`);
  
  const promises = uniqueUrls.map(async (url) => {
    const dataUrl = await loadImageSimple(url);
    if (dataUrl) {
      results.set(url, dataUrl);
    }
  });
  
  await Promise.all(promises);
  
  console.log(`[SimpleLoader] Successfully loaded ${results.size}/${uniqueUrls.length} images`);
  return results;
}
