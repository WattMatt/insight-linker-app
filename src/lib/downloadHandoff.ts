interface DownloadHandoffPayload {
  fileName: string;
  blob?: Blob;
  url?: string;
}

export interface PendingDownloadHandoff {
  id: string;
}

export interface StoredDownloadHandoffRequest extends DownloadHandoffPayload {
  createdAt: number;
  id: string;
  status?: 'pending' | 'ready';
}

const DOWNLOAD_HANDOFF_DB = 'wm-download-handoff';
const DOWNLOAD_HANDOFF_STORE = 'requests';

function buildDownloadHandoffUrl(id: string): string {
  return new URL(`/download/${id}`, window.location.origin).toString();
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
  const id = crypto.randomUUID();
  const handoffWindow = window.open(buildDownloadHandoffUrl(id), '_blank');

  if (!handoffWindow) {
    return null;
  }

  // Write a placeholder immediately so the download tab knows we're working
  void putDownloadRequest({
    id,
    fileName: 'Generating report…',
    createdAt: Date.now(),
    status: 'pending',
  });

  return { id };
}

export async function completeDownloadHandoff(
  pendingRequest: PendingDownloadHandoff,
  payload: DownloadHandoffPayload,
): Promise<void> {
  if (!payload.blob && !payload.url) {
    throw new Error('A blob or URL is required to hand off a download');
  }

  await putDownloadRequest({
    ...payload,
    createdAt: Date.now(),
    id: pendingRequest.id,
    status: 'ready',
  });
}

export async function openDownloadHandoffWindow(payload: DownloadHandoffPayload): Promise<boolean> {
  const pendingRequest = createPendingDownloadHandoff();
  if (!pendingRequest) {
    return false;
  }

  await completeDownloadHandoff(pendingRequest, payload);

  return true;
}