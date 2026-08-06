import { supabase } from '@/integrations/supabase/client';
import { openDownloadHandoffWindow } from '@/lib/downloadHandoff';
import { parseDocumentFileRef, resolveDocumentUrl } from '@/lib/documents/documentUrl';
import { toast } from 'sonner';

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

// Storage-reference parsing (full URLs of any access variant AND bare
// `documents`-bucket paths) is centralised in documents/documentUrl.ts.

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
  const parsed = parseDocumentFileRef(url);

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

/** True when running inside an iframe (where the <a download> attribute is often ignored). */
function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin frame access throws — we are definitely framed
  }
}

/** Standard anchor-download. Reliable in a normal top-level page. */
function triggerAnchorDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

/** Open the blob in a new tab. Returns false if the popup was blocked. */
function triggerWindowOpen(blob: Blob): boolean {
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return win != null;
}

export function getDirectDownloadUrl(url: string, fileName: string): string {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set('download', fileName);
  return downloadUrl.toString();
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

type PickerOutcome = 'saved' | 'cancelled' | 'unavailable';

/** File System Access API save. Real success/failure; falls through on anything but a confirmed save or user-cancel. */
async function trySaveWithPicker(fileName: string, blob: Blob): Promise<PickerOutcome> {
  const w = window as DownloadCapableWindow;
  if (!w.showSaveFilePicker) return 'unavailable';
  try {
    const fileHandle = await w.showSaveFilePicker(buildSavePickerOptions(fileName));
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (error) {
    if (isAbortError(error)) return 'cancelled';
    console.warn('File System Access save failed, falling back:', error);
    return 'unavailable';
  }
}

/**
 * Download a Blob as a file. Honest about success:
 *  1. File System Access API (real save dialog) — when available.
 *  2. Anchor download — reliable in a normal top-level page.
 *  3. window.open — last resort inside sandboxed iframes; reports failure if the popup is blocked.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const toastId = toast.loading(`Preparing ${fileName}...`);

  try {
    const picker = await trySaveWithPicker(fileName, blob);
    if (picker === 'saved') {
      toast.success(`Saved ${fileName}`, { id: toastId });
      return;
    }
    if (picker === 'cancelled') {
      toast.dismiss(toastId);
      return;
    }

    if (!isInIframe()) {
      triggerAnchorDownload(blob, fileName);
      toast.success(`Downloaded ${fileName}`, { id: toastId });
      return;
    }

    if (triggerWindowOpen(blob)) {
      toast.success(`Opened ${fileName} in a new tab`, { id: toastId });
      return;
    }

    toast.error(`Couldn't download ${fileName} — allow pop-ups for this site and try again`, { id: toastId });
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
    // Storage references (bare `documents` paths or legacy public URLs) are
    // resolved to short-lived signed URLs first — the bucket is private, so a
    // raw public URL handed to the handoff window would 400. Non-storage
    // values (blob:/data:/external) pass through unchanged.
    const resolvedUrl = await resolveDocumentUrl(url);
    const handedOffToTopLevel = await openDownloadHandoffWindow({ url: resolvedUrl, fileName });
    if (handedOffToTopLevel) {
      toast.success(`Opened download tab – ${fileName}`, { id: toastId });
      return;
    }

    const blob = await resolveDownloadBlob(resolvedUrl);
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
