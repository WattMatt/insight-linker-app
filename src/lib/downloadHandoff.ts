interface DownloadHandoffPayload {
  fileName: string;
  blob?: Blob;
  url?: string;
}

export interface PendingDownloadHandoff {
  id: string;
  windowRef: Window;
}

export interface StoredDownloadHandoffRequest extends DownloadHandoffPayload {
  createdAt: number;
  id: string;
}

const DOWNLOAD_HANDOFF_DB = 'wm-download-handoff';
const DOWNLOAD_HANDOFF_STORE = 'requests';

function buildDirectDownloadUrl(url: string, fileName: string): string {
  const downloadUrl = new URL(url, window.location.origin);
  downloadUrl.searchParams.set('download', fileName);
  return downloadUrl.toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHandoffWindow(
  handoffWindow: Window,
  options: {
    description: string;
    fileName?: string;
    showRetry?: boolean;
    title: string;
  },
): void {
  const safeTitle = escapeHtml(options.title);
  const safeDescription = escapeHtml(options.description);
  const safeFileName = options.fileName ? escapeHtml(options.fileName) : '';
  const actionMarkup = options.showRetry
    ? `<a id="download-link" href="#" class="button" download="${safeFileName}">Download PDF again</a>`
    : '<div class="spinner" aria-hidden="true"></div>';

  handoffWindow.document.open();
  handoffWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      .card {
        width: min(100%, 520px);
        background: white;
        border: 1px solid #cbd5e1;
        border-radius: 14px;
        padding: 24px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.75rem;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #475569;
        line-height: 1.5;
      }
      .meta {
        margin-top: 16px;
        color: #64748b;
        font-size: 0.95rem;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        margin-top: 20px;
        padding: 0 18px;
        border-radius: 10px;
        background: #0f172a;
        color: white;
        font-weight: 600;
        text-decoration: none;
      }
      .spinner {
        width: 18px;
        height: 18px;
        margin-top: 20px;
        border-radius: 999px;
        border: 2px solid #cbd5e1;
        border-top-color: #0f172a;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>${safeTitle}</h1>
      <p>${safeDescription}</p>
      ${safeFileName ? `<p class="meta">${safeFileName}</p>` : ''}
      ${actionMarkup}
    </main>
  </body>
</html>`);
  handoffWindow.document.close();
}

function openDownloadHandoffDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DOWNLOAD_HANDOFF_DB, 1);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open download handoff database'));
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DOWNLOAD_HANDOFF_STORE)) {
        db.createObjectStore(DOWNLOAD_HANDOFF_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };
  });
}

async function putDownloadRequest(request: StoredDownloadHandoffRequest): Promise<void> {
  const db = await openDownloadHandoffDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOWNLOAD_HANDOFF_STORE, 'readwrite');
    const store = transaction.objectStore(DOWNLOAD_HANDOFF_STORE);
    const putRequest = store.put(request);

    putRequest.onerror = () => {
      reject(putRequest.error ?? new Error('Failed to store download request'));
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to store download request'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Download request storage was aborted'));
  }).finally(() => db.close());
}

export async function getDownloadRequest(id: string): Promise<StoredDownloadHandoffRequest | null> {
  const db = await openDownloadHandoffDatabase();

  return new Promise<StoredDownloadHandoffRequest | null>((resolve, reject) => {
    const transaction = db.transaction(DOWNLOAD_HANDOFF_STORE, 'readonly');
    const store = transaction.objectStore(DOWNLOAD_HANDOFF_STORE);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      resolve((getRequest.result as StoredDownloadHandoffRequest | undefined) ?? null);
    };

    getRequest.onerror = () => {
      reject(getRequest.error ?? new Error('Failed to read download request'));
    };

    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to read download request'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Download request read was aborted'));
  });
}

export async function deleteDownloadRequest(id: string): Promise<void> {
  const db = await openDownloadHandoffDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DOWNLOAD_HANDOFF_STORE, 'readwrite');
    const store = transaction.objectStore(DOWNLOAD_HANDOFF_STORE);
    const deleteRequest = store.delete(id);

    deleteRequest.onerror = () => {
      reject(deleteRequest.error ?? new Error('Failed to delete download request'));
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Failed to delete download request'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Download request deletion was aborted'));
  }).finally(() => db.close());
}

export function createPendingDownloadHandoff(): PendingDownloadHandoff | null {
  const handoffWindow = window.open('', '_blank');

  if (!handoffWindow) {
    return null;
  }

  renderHandoffWindow(handoffWindow, {
    title: 'Preparing your report download',
    description: 'Please wait while the browser receives the PDF.',
  });

  return {
    id: crypto.randomUUID(),
    windowRef: handoffWindow,
  };
}

export async function completeDownloadHandoff(
  pendingRequest: PendingDownloadHandoff,
  payload: DownloadHandoffPayload,
): Promise<void> {
  if (!payload.blob && !payload.url) {
    throw new Error('A blob or URL is required to hand off a download');
  }

  if (pendingRequest.windowRef.closed) {
    throw new Error('The download window was closed before the file was ready');
  }

  if (payload.url) {
    pendingRequest.windowRef.location.replace(buildDirectDownloadUrl(payload.url, payload.fileName));
    return;
  }

  const blobUrl = URL.createObjectURL(payload.blob);

  renderHandoffWindow(pendingRequest.windowRef, {
    title: 'Your report is ready',
    description: 'If the download does not start automatically, use the button below.',
    fileName: payload.fileName,
    showRetry: true,
  });

  const downloadLink = pendingRequest.windowRef.document.getElementById('download-link') as HTMLAnchorElement | null;

  if (!downloadLink) {
    URL.revokeObjectURL(blobUrl);
    throw new Error('Failed to prepare the download link');
  }

  downloadLink.href = blobUrl;
  downloadLink.download = payload.fileName;

  pendingRequest.windowRef.setTimeout(() => {
    downloadLink.click();
  }, 120);

  pendingRequest.windowRef.setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 60000);
}

export async function openDownloadHandoffWindow(payload: DownloadHandoffPayload): Promise<boolean> {
  const pendingRequest = createPendingDownloadHandoff();
  if (!pendingRequest) {
    return false;
  }

  await completeDownloadHandoff(pendingRequest, payload);

  return true;
}