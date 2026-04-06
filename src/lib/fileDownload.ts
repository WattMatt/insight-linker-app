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
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const toastId = toast.loading(`Downloading ${fileName}...`);
  try {
    if (url.startsWith('blob:')) {
      triggerDownload(url, fileName);
      toast.success(`Downloaded ${fileName}`, { id: toastId });
      return;
    }

    const parsed = parseSupabaseStorageUrl(url);

    let blob: Blob;
    if (parsed) {
      const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
      if (error || !data) throw new Error(error?.message || 'SDK download failed');
      blob = data;
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');
      blob = await response.blob();
    }

    const blobUrl = URL.createObjectURL(blob);
    triggerDownload(blobUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
    toast.success(`Downloaded ${fileName}`, { id: toastId });
  } catch (error) {
    console.error('Download failed:', error);
    toast.error(`Download failed — opening in new tab`, { id: toastId });
    window.open(url, '_blank');
  }
}

function triggerDownload(blobUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
