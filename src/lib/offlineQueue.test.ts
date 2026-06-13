import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueOfflineMutation, OFFLINE_QUEUE_KEY } from './offlineQueue';

function mockLocalStorage() {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

describe('enqueueOfflineMutation', () => {
  beforeEach(() => mockLocalStorage());

  it('appends a well-formed mutation to the shared queue', () => {
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { a: 1 } });
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ type: 'SYNC_INSPECTION', data: { id: 'i1', json_data: { a: 1 } }, retries: 0 });
    expect(typeof q[0].id).toBe('string');
  });

  it('dedupes by dedupeKey — repeated saves collapse to the latest', () => {
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { v: 1 } }, { dedupeKey: 'i1' });
    enqueueOfflineMutation('SYNC_INSPECTION', { id: 'i1', json_data: { v: 2 } }, { dedupeKey: 'i1' });
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0].data.json_data.v).toBe(2);
  });

  it('does NOT dedupe distinct items without a dedupeKey', () => {
    enqueueOfflineMutation('UPLOAD_INSPECTION_IMAGE', { imageId: 'a' });
    enqueueOfflineMutation('UPLOAD_INSPECTION_IMAGE', { imageId: 'b' });
    expect(JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!)).toHaveLength(2);
  });
});
