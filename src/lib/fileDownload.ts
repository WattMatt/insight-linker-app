import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Extract bucket and path from a Supabase storage URL.
 */
function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)/);
  if (!match) return null;
  return {
    bucket: match[1],
    path: decodeURIComponent(match[2].split('?')[0]),
  };
}

/**
 * Force download a file from a URL.
 * Uses Supabase SDK for storage URLs to avoid CORS issues.
 * For blob URLs, re-fetches to create a fresh downloadable blob.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const toastId = toast.loading(`Downloading ${fileName}...`);
  try {
    let blob: Blob;

    if (url.startsWith('blob:')) {
      // Re-fetch blob URL to get a fresh Blob object
      const response = await fetch(url);
      blob = await response.blob();
    } else {
      const parsed = parseSupabaseStorageUrl(url);
      if (parsed) {
        const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
        if (error || !data) throw new Error(error?.message || 'SDK download failed');
        blob = data;
      } else {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch file');
        blob = await response.blob();
      }
    }

    triggerBlobDownload(blob, fileName);
    toast.success(`Downloaded ${fileName}`, { id: toastId });
  } catch (error) {
    console.error('Download failed:', error);
    toast.error(`Download failed — opening in new tab`, { id: toastId });
    window.open(url, '_blank');
  }
}

/**
 * Create a fresh blob URL from a Blob and trigger browser download.
 */
function triggerBlobDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Small delay to let the browser start the download before revoking
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, 250);
}
