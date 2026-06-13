// Standalone append to the offline mutation queue (same localStorage key useOfflineSync drains).
// Used by hooks that need to enqueue without instantiating the full useOfflineSync hook.
export const OFFLINE_QUEUE_KEY = 'offline_mutation_queue';

interface QueuedMutation {
  id: string;
  type: string;
  data: unknown;
  timestamp: number;
  retries: number;
}

export function enqueueOfflineMutation(
  type: string,
  data: unknown,
  opts?: { dedupeKey?: string },
): void {
  let queue: QueuedMutation[] = [];
  try {
    const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
    queue = stored ? JSON.parse(stored) : [];
  } catch {
    queue = [];
  }
  if (opts?.dedupeKey) {
    queue = queue.filter(
      m => !(m.type === type && (m.data as { id?: string })?.id === opts.dedupeKey),
    );
  }
  queue.push({ id: crypto.randomUUID(), type, data, timestamp: Date.now(), retries: 0 });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('offline-queue-updated'));
  }
}

// Order a drained queue so json_data overwrites run before json_data appends.
// SYNC_INSPECTION overwrites an inspection's json_data; UPLOAD_INSPECTION_IMAGE appends
// a photo URL to it via read-modify-write. If an upload drains before a queued full
// save, the save clobbers the freshly-appended photo URL (the blob is safe in storage,
// but it's orphaned — never shown). Running uploads LAST guarantees appends survive.
// Stable sort: relative order is otherwise preserved.
export function orderQueueForSync<T extends { type: string }>(queue: T[]): T[] {
  const rank = (type: string) => (type === 'UPLOAD_INSPECTION_IMAGE' ? 1 : 0);
  return [...queue].sort((a, b) => rank(a.type) - rank(b.type));
}

// Union photo arrays from the server's json_data into a client json_data snapshot,
// without overwriting the client's other edits (notes/status/etc.). A full offline
// save's json_data snapshot does NOT contain offline-captured photos (those upload
// separately). orderQueueForSync stops a same-drain clobber, but a photo committed to
// the server in an EARLIER drain would still be orphaned by this save's overwrite.
// Merging the server's photos back in makes SYNC_INSPECTION safe regardless of ordering.
// Photos live at json_data[sectionKey][itemKey].photos; `tenants` (a top-level array)
// and other non-object values are passed through untouched.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mergeServerPhotos(serverJson: any, clientJson: any): any {
  if (!serverJson || typeof serverJson !== 'object' || Array.isArray(serverJson)) return clientJson;
  const result = { ...(clientJson ?? {}) };

  for (const sectionKey of Object.keys(serverJson)) {
    const serverSection = serverJson[sectionKey];
    if (!serverSection || typeof serverSection !== 'object' || Array.isArray(serverSection)) continue;

    const base = result[sectionKey];
    const clientSection =
      base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};

    for (const itemKey of Object.keys(serverSection)) {
      const serverPhotos = serverSection[itemKey]?.photos;
      if (!Array.isArray(serverPhotos) || serverPhotos.length === 0) continue;

      const clientItem =
        clientSection[itemKey] && typeof clientSection[itemKey] === 'object'
          ? clientSection[itemKey]
          : {};
      const clientPhotos = Array.isArray(clientItem.photos) ? clientItem.photos : [];
      clientSection[itemKey] = {
        ...clientItem,
        photos: [...new Set([...clientPhotos, ...serverPhotos])],
      };
    }

    result[sectionKey] = clientSection;
  }

  return result;
}
