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
