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
