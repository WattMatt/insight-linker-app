import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueOfflineMutation, OFFLINE_QUEUE_KEY, orderQueueForSync, mergeServerPhotos } from './offlineQueue';

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

describe('orderQueueForSync', () => {
  // A full-record SYNC_INSPECTION overwrites json_data; UPLOAD_INSPECTION_IMAGE appends
  // a photo URL to it. If the upload drains first, the save clobbers the photo. So
  // uploads must run LAST — after every overwrite — while staying otherwise stable.
  it('moves UPLOAD_INSPECTION_IMAGE after SYNC_INSPECTION, preserving other order', () => {
    const queue = [
      { type: 'UPLOAD_INSPECTION_IMAGE', id: 'u1' },
      { type: 'SYNC_INSPECTION', id: 's1' },
      { type: 'CREATE_INSPECTION', id: 'c1' },
      { type: 'UPLOAD_INSPECTION_IMAGE', id: 'u2' },
    ];
    const ordered = orderQueueForSync(queue);
    expect(ordered.map(m => m.id)).toEqual(['s1', 'c1', 'u1', 'u2']);
  });

  it('is a no-op when there are no inspection-image uploads', () => {
    const queue = [
      { type: 'SYNC_INSPECTION', id: 's1' },
      { type: 'CREATE_INSPECTION', id: 'c1' },
    ];
    expect(orderQueueForSync(queue).map(m => m.id)).toEqual(['s1', 'c1']);
  });

  it('does not mutate the input array', () => {
    const queue = [
      { type: 'UPLOAD_INSPECTION_IMAGE', id: 'u1' },
      { type: 'SYNC_INSPECTION', id: 's1' },
    ];
    orderQueueForSync(queue);
    expect(queue.map(m => m.id)).toEqual(['u1', 's1']);
  });
});

describe('mergeServerPhotos', () => {
  it('preserves a server photo the client snapshot is missing (cross-drain protection)', () => {
    const server = { sectionA: { item1: { photos: ['https://srv/p1.jpg'], notes: 'old' } } };
    const client = { sectionA: { item1: { photos: [], notes: 'edited offline' } } };
    const merged = mergeServerPhotos(server, client);
    expect(merged.sectionA.item1.photos).toEqual(['https://srv/p1.jpg']);
    expect(merged.sectionA.item1.notes).toBe('edited offline'); // client edit wins
  });

  it('unions photos without duplicating shared URLs', () => {
    const server = { s: { i: { photos: ['a', 'b'] } } };
    const client = { s: { i: { photos: ['b', 'c'] } } };
    expect(mergeServerPhotos(server, client).s.i.photos).toEqual(['b', 'c', 'a']);
  });

  it('adds an entire server section/item the client never touched', () => {
    const server = { s2: { i2: { photos: ['x'] } } };
    const client = { s1: { i1: { notes: 'n' } } };
    const merged = mergeServerPhotos(server, client);
    expect(merged.s1.i1.notes).toBe('n');
    expect(merged.s2.i2.photos).toEqual(['x']);
  });

  it('passes through top-level arrays like tenants untouched', () => {
    const server = { tenants: [{ name: 'A' }], s: { i: { photos: ['p'] } } };
    const client = { tenants: [{ name: 'B' }], s: { i: { photos: [] } } };
    const merged = mergeServerPhotos(server, client);
    expect(merged.tenants).toEqual([{ name: 'B' }]); // client wins, not merged as a section
    expect(merged.s.i.photos).toEqual(['p']);
  });

  it('returns the client snapshot when server json is empty/invalid', () => {
    expect(mergeServerPhotos(null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeServerPhotos(undefined, { a: 1 })).toEqual({ a: 1 });
  });
});
