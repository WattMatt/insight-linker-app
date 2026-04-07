import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StorageAccessType = 'public' | 'sign' | 'authenticated';

interface SaveFilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

interface SaveFilePickerOptionsLike {
  suggestedName?: string;
  startIn?: 'downloads' | 'documents' | 'desktop';
  types?: SaveFilePickerAcceptType[];
}

interface FileSystemWritableLike {
  close: () => Promise<void>;
  write: (data: Blob) => Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritableLike>;
}

interface DownloadCapableWindow extends Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptionsLike) => Promise<FileSystemFileHandleLike>;
}

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

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

function getMimeType(fileName: string): string {
  switch (getFileExtension(fileName)) {
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'xls':
      return 'application/vnd.ms-excel';
    case 'csv':
      return 'text/csv';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function buildSavePickerOptions(fileName: string): SaveFilePickerOptionsLike {
  const extension = getFileExtension(fileName);
  const mimeType = getMimeType(fileName);

  if (!extension || mimeType === 'application/octet-stream') {
    return {
      suggestedName: fileName,
      startIn: 'downloads',
    };
  }

  return {
    suggestedName: fileName,
    startIn: 'downloads',
    types: [
      {
        description: `${extension.toUpperCase()} file`,
        accept: {
          [mimeType]: [`.${extension}`],
        },
      },
    ],
  };
}

async function resolveDownloadBlob(url: string): Promise<Blob> {
  const parsed = parseSupabaseStorageUrl(url);

  if (parsed) {
    const { data, error } = await supabase.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) {
      throw new Error(error?.message || 'Failed to download file from storage');
    }
    return data;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch file');
  }

  return response.blob();
}

/**
 * Trigger a browser download from a Blob.
 * Uses a user-visible anchor element injected into the DOM with the download attribute.
 * Falls back to opening the blob in a new tab if the anchor approach is blocked.
 */
function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';

    document.body.appendChild(link);

    // Use a MouseEvent to simulate a real click – more likely to bypass popup blockers
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    link.dispatchEvent(clickEvent);

    window.setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
      URL.revokeObjectURL(blobUrl);
    }, 3000);
  } catch {
    // If the anchor approach fails (sandboxed iframe, popup blocked), open in new tab
    console.warn('[fileDownload] Anchor download blocked, opening blob in new tab');
    window.open(blobUrl, '_blank');
    // Revoke after a longer delay so the tab can load
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }
}

export function getDirectDownloadUrl(url: string, fileName: string): string {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set('download', fileName);
  return downloadUrl.toString();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function saveBlobWithPicker(fileName: string, blob: Blob): Promise<boolean> {
  const downloadWindow = window as DownloadCapableWindow;

  if (!downloadWindow.showSaveFilePicker) {
    return false;
  }

  const fileHandle = await downloadWindow.showSaveFilePicker(buildSavePickerOptions(fileName));
  const writable = await fileHandle.createWritable();

  await writable.write(blob);
  await writable.close();

  return true;
}

/**
 * Download a Blob as a file. This is the primary download entry point for
 * generated PDFs and other in-memory files.
 *
 * Priority:
 *  1. File System Access API (showSaveFilePicker) – best UX, real save dialog
 *  2. Anchor download attribute – standard fallback
 *  3. window.open(blobUrl) – last resort for sandboxed environments
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const toastId = toast.loading(`Saving ${fileName}...`);

  try {
    const savedWithPicker = await saveBlobWithPicker(fileName, blob);

    if (savedWithPicker) {
      toast.success(`Saved ${fileName}`, { id: toastId });
      return;
    }

    triggerBrowserDownload(blob, fileName);
    toast.success(`Download started – ${fileName}`, { id: toastId });
  } catch (error) {
    if (isAbortError(error)) {
      toast.dismiss(toastId);
      return;
    }

    console.error('Download failed:', error);
    toast.error(`Failed to save ${fileName}`, { id: toastId });
  }
}

/**
 * Download a file from a URL. Resolves the blob first (via Supabase SDK for
 * storage URLs), then delegates to downloadBlob.
 */
export async function downloadFile(url: string, fileName: string): Promise<void> {
  const toastId = toast.loading(`Preparing ${fileName}...`);

  try {
    const blob = await resolveDownloadBlob(url);
    toast.dismiss(toastId);
    await downloadBlob(blob, fileName);
  } catch (error) {
    if (isAbortError(error)) {
      toast.dismiss(toastId);
      return;
    }

    console.error('Download failed:', error);
    toast.error(`Failed to download ${fileName}`, { id: toastId });
  }
}
