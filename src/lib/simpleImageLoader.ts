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
    if (process.env.NODE_ENV === 'development') console.warn(`[SimpleLoader] Failed to parse URL: ${url}`, e);
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
      if (process.env.NODE_ENV === 'development') console.error(`[SimpleLoader] FileReader failed`);
      resolve(null);
    };
    reader.readAsDataURL(blob);
  });
}

export interface ReportImageOptions {
  /** Downscale + re-encode to JPEG before returning, to keep generated PDFs small. */
  compress?: boolean;
  /** Max width in px when compressing (default 800). */
  maxWidth?: number;
  /** JPEG quality 0..1 when compressing (default 0.6). */
  quality?: number;
}

/**
 * Downscale + re-encode an image blob to a compressed JPEG for PDF embedding.
 * Returns the original blob unchanged on any failure (best-effort).
 */
export async function compressImageBlob(
  blob: Blob,
  maxWidth: number = 800,
  quality: number = 0.6
): Promise<Blob> {
  if (!blob.type.startsWith('image/')) return blob;
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        resolve(blob);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      canvas.toBlob((out) => resolve(out || blob), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(blob);
    };
    img.src = objectUrl;
  });
}

/**
 * Load image as base64 data URL using Supabase Storage native download.
 * This bypasses CORS issues by using the authenticated storage API.
 * Pass { compress: true } to downscale/recompress before encoding (smaller PDFs).
 */
export async function loadImageSimple(url: string, opts?: ReportImageOptions): Promise<string | null> {
  if (!url) return null;

  // Skip if already a data URL
  if (url.startsWith('data:')) {
    return url;
  }

  try {
    let blob: Blob | null = null;

    // Check if it's a Supabase storage URL — use the authenticated storage API (bypasses CORS)
    const storageInfo = parseSupabaseUrl(url);
    if (storageInfo) {
      const { data, error } = await supabase.storage
        .from(storageInfo.bucket)
        .download(storageInfo.path);

      if (error) {
        if (process.env.NODE_ENV === 'development') console.warn(`[SimpleLoader] Supabase download failed for ${storageInfo.bucket}/${storageInfo.path}:`, error.message);
      } else if (data) {
        blob = data;
      }
    }

    // Fallback: direct fetch (for non-Supabase URLs or if Supabase download failed)
    if (!blob) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          blob = await response.blob();
        } else {
          if (process.env.NODE_ENV === 'development') console.warn(`[SimpleLoader] Fetch failed with status: ${response.status}`);
        }
      } catch (fetchError) {
        if (process.env.NODE_ENV === 'development') console.warn(`[SimpleLoader] Direct fetch failed:`, fetchError);
      }
    }

    if (!blob) {
      if (process.env.NODE_ENV === 'development') console.error(`[SimpleLoader] All methods failed for: ${url.substring(0, 80)}...`);
      return null;
    }

    const finalBlob = opts?.compress
      ? await compressImageBlob(blob, opts.maxWidth, opts.quality)
      : blob;
    return await blobToDataUrl(finalBlob);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error(`[SimpleLoader] Unexpected error:`, error);
    return null;
  }
}

/**
 * Load multiple images in parallel.
 * Returns a Map of original URL -> base64 data URL
 */
export async function loadImagesSimple(urls: string[], opts?: ReportImageOptions): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const uniqueUrls = [...new Set(urls.filter(Boolean))];

  if (uniqueUrls.length === 0) {
    return results;
  }

  const promises = uniqueUrls.map(async (url) => {
    const dataUrl = await loadImageSimple(url, opts);
    if (dataUrl) {
      results.set(url, dataUrl);
    }
  });

  await Promise.all(promises);

  return results;
}
