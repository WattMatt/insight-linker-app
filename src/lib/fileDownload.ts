import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StorageAccessType = 'public' | 'sign' | 'authenticated';

/**
 * Extract bucket, path, and access type from a Supabase storage URL.
 */
function parseSupabaseStorageUrl(
  url: string,
): { accessType: StorageAccessType; bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(public|sign|authenticated)\/([^/]+)\/(.+)/);
  if (!match) return null;

  return {
    accessType: match[1] as StorageAccessType,
    bucket: match[2],
    path: decodeURIComponent(match[3].split('?')[0]),
  };
}

function buildDirectDownloadUrl(url: string, fileName: string): string {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set('download', fileName);
  return downloadUrl.toString();
}

function triggerAnchorDownload(url: string, options?: { fileName?: string; newTab?: boolean }) {
  const link = document.createElement('a');
  link.href = url;
  link.style.display = 'none';

  if (options?.fileName) {
    link.download = options.fileName;
  }

  if (options?.newTab) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
  }, 250);
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  triggerAnchorDownload(blobUrl, { fileName });

  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 2000);
}

/**
 * Force download a file from a URL.
 * Uses direct browser downloads for Supabase storage URLs to preserve user activation.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const toastId = toast.loading(`Starting download for ${fileName}...`);

  try {
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      triggerAnchorDownload(url, { fileName });
      toast.success(`Download started for ${fileName}`, { id: toastId });
      return;
    }

    const parsed = parseSupabaseStorageUrl(url);

    if (parsed && parsed.accessType !== 'authenticated') {
      const directDownloadUrl = buildDirectDownloadUrl(url, fileName);
      triggerAnchorDownload(directDownloadUrl, { newTab: true });
      toast.success(`Download started for ${fileName}`, { id: toastId });
      return;
    }

    let blob: Blob;

    if (parsed) {
      const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
      if (error || !data) {
        throw new Error(error?.message || 'SDK download failed');
      }
      blob = data;
    } else {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch file');
      }
      blob = await response.blob();
    }

    triggerBlobDownload(blob, fileName);
    toast.success(`Download started for ${fileName}`, { id: toastId });
  } catch (error) {
    console.error('Download failed:', error);
    toast.error('Download failed — opening in new tab', { id: toastId });
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
