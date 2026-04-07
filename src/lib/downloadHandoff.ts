interface DownloadHandoffPayload {
  fileName: string;
  blob?: Blob;
  url?: string;
}

export interface StoredDownloadHandoffRequest extends DownloadHandoffPayload {
  createdAt: number;
  id: string;
}

const DOWNLOAD_HANDOFF_DB = 'wm-download-handoff';
const DOWNLOAD_HANDOFF_STORE = 'requests';

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

export async function openDownloadHandoffWindow(payload: DownloadHandoffPayload): Promise<boolean> {
  if (!payload.blob && !payload.url) {
    throw new Error('A blob or URL is required to hand off a download');
  }

  const id = crypto.randomUUID();
  const handoffUrl = new URL(`/download/${id}`, window.location.origin).toString();
  const handoffWindow = window.open(handoffUrl, '_blank', 'noopener,noreferrer');

  if (!handoffWindow) {
    return false;
  }

  await putDownloadRequest({
    ...payload,
    createdAt: Date.now(),
    id,
  });

  return true;
}