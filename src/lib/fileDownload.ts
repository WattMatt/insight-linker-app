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
 * Download a file. Works in sandboxed iframes (Lovable preview).
 *
 * Strategy:
 *  - Supabase public URLs → window.open with ?download= param (forces Content-Disposition: attachment)
 *  - Blob/data URLs → fetch blob, open via window.open so user can save from browser PDF viewer
 *  - Other URLs → fetch blob, open via window.open
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const toastId = toast.loading(`Preparing ${fileName}...`);

  try {
    const parsed = parseSupabaseStorageUrl(url);

    // For public Supabase storage: append ?download= to force attachment header
    if (parsed) {
      const separator = url.includes('?') ? '&' : '?';
      const downloadUrl = `${url}${separator}download=${encodeURIComponent(fileName)}`;
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      toast.success(`Download started for ${fileName}`, { id: toastId });
      return;
    }

    // For blob URLs (client-generated PDFs) or data URLs
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      window.open(url, '_blank');
      toast.success(`Opened ${fileName} — use your browser's Save/Download button`, { id: toastId });
      return;
    }

    // For any other URL: fetch as blob, then open
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch file');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    // Revoke after a delay to let the new tab load
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    toast.success(`Opened ${fileName} — use your browser's Save/Download button`, { id: toastId });
  } catch (error) {
    console.error('Download failed:', error);
    toast.error('Download failed — opening in new tab', { id: toastId });
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
