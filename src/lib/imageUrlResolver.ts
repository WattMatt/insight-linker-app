import { supabase } from '@/integrations/supabase/client';

/**
 * Extract bucket and path from Supabase storage URL
 */
export function extractStorageInfo(url: string): { bucket: string; path: string; fileName: string } | null {
  if (!url) return null;
  try {
    const patterns = [
      /\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/,
      /supabase\.co\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const fullPath = decodeURIComponent(match[2].split('?')[0]);
        const pathParts = fullPath.split('/');
        const fileName = pathParts.pop() || '';
        return { bucket: match[1], path: fullPath, fileName };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find the correct image file in storage when the URL doesn't match actual filename
 * Uses the index pattern from filename to find the right image
 */
export async function findCorrectImageUrl(url: string): Promise<string | null> {
  const storageInfo = extractStorageInfo(url);
  if (!storageInfo) return null;
  
  try {
    // Get the folder path (everything except the filename)
    const pathParts = storageInfo.path.split('/');
    pathParts.pop(); // Remove filename
    const folderPath = pathParts.join('/');
    
    if (!folderPath) return null;

    // Extract the unique identifier from the expected filename
    // Pattern: ..._SECTION_ITEM_TIMESTAMP_INDEX.jpg
    const fileNameMatch = storageInfo.fileName.match(/_(\d+)_(\d+)_(\d+)_(\d+)\.(jpg|jpeg|png|webp|gif)$/i);
    
    // List files in the folder
    const { data: files, error } = await supabase.storage
      .from(storageInfo.bucket)
      .list(folderPath, { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });

    if (error || !files || files.length === 0) return null;

    // Filter to only image files
    const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name));
    
    if (imageFiles.length === 0) return null;

    // If we found the pattern, try to match by the index number (the _1, _2, _3 at the end)
    if (fileNameMatch) {
      const expectedIndex = parseInt(fileNameMatch[4], 10);
      // Get the image at the expected index (0-based, but filenames use 1-based)
      const targetIndex = expectedIndex - 1;
      if (targetIndex >= 0 && targetIndex < imageFiles.length) {
        const targetFile = imageFiles[targetIndex];
        const { data: urlData } = supabase.storage
          .from(storageInfo.bucket)
          .getPublicUrl(`${folderPath}/${targetFile.name}`);
        return urlData.publicUrl;
      }
    }

    // Fallback: return the first image if only one exists
    if (imageFiles.length === 1) {
      const { data: urlData } = supabase.storage
        .from(storageInfo.bucket)
        .getPublicUrl(`${folderPath}/${imageFiles[0].name}`);
      return urlData.publicUrl;
    }
    
    return null;
  } catch (err) {
    console.error('Error finding correct image:', err);
    return null;
  }
}

/**
 * Try to fetch an image, with fallback to find correct URL if original fails
 */
export async function fetchImageWithFallback(url: string): Promise<Blob | null> {
  // First try the original URL
  try {
    const response = await fetch(url);
    if (response.ok) {
      return await response.blob();
    }
  } catch {
    // Original URL failed, try to find the correct one
  }

  // Try to find the correct URL
  const correctUrl = await findCorrectImageUrl(url);
  if (correctUrl) {
    try {
      const response = await fetch(correctUrl);
      if (response.ok) {
        return await response.blob();
      }
    } catch {
      // Correct URL also failed
    }
  }

  return null;
}

/**
 * Fetch image and convert to base64 data URL for PDF embedding
 */
export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  const blob = await fetchImageWithFallback(url);
  if (!blob) return null;

  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null as any);
    reader.readAsDataURL(blob);
  });
}
