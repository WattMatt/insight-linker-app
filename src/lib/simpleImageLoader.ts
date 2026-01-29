/**
 * SIMPLE IMAGE LOADER
 * Dead simple image loading for PDF generation.
 * No complex fallbacks, no CORS workarounds - just load the image.
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Extract bucket and path from Supabase storage URL
 */
function parseSupabaseUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  try {
    // Pattern: /storage/v1/object/public/BUCKET/PATH
    const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
    if (match) {
      return { 
        bucket: match[1], 
        path: decodeURIComponent(match[2].split('?')[0]) 
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Load image as base64 data URL using the simplest possible method.
 * Uses Supabase storage download for storage URLs, direct fetch for others.
 */
export async function loadImageSimple(url: string): Promise<string | null> {
  if (!url) return null;
  
  console.log(`[SimpleLoader] Loading: ${url.substring(0, 60)}...`);
  
  try {
    let blob: Blob | null = null;
    
    // Check if it's a Supabase storage URL
    const storageInfo = parseSupabaseUrl(url);
    
    if (storageInfo) {
      // Use Supabase storage download - bypasses CORS issues
      console.log(`[SimpleLoader] Using Supabase download: ${storageInfo.bucket}/${storageInfo.path.substring(0, 40)}...`);
      
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .download(storageInfo.path);
      
      if (error) {
        console.warn(`[SimpleLoader] Supabase download failed:`, error.message);
      } else if (data) {
        blob = data;
        console.log(`[SimpleLoader] Downloaded via Supabase: ${(blob.size / 1024).toFixed(1)}KB`);
      }
    }
    
    // Fallback: direct fetch
    if (!blob) {
      console.log(`[SimpleLoader] Trying direct fetch...`);
      const response = await fetch(url);
      if (response.ok) {
        blob = await response.blob();
        console.log(`[SimpleLoader] Fetched directly: ${(blob.size / 1024).toFixed(1)}KB`);
      }
    }
    
    if (!blob) {
      console.error(`[SimpleLoader] Failed to load: ${url.substring(0, 60)}...`);
      return null;
    }
    
    // Convert blob to data URL
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
  } catch (error) {
    console.error(`[SimpleLoader] Error:`, error);
    return null;
  }
}

/**
 * Load multiple images in parallel
 */
export async function loadImagesSimple(urls: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uniqueUrls = [...new Set(urls.filter(Boolean))];
  
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
