import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineDB } from './offlineDB';

describe('queued_blobs round-trip (the file-loss fix)', () => {
  it('a queued upload survives the localStorage JSON round-trip without losing the blob', async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/jpeg' });

    const blobId = await offlineDB.putQueuedBlob(original, { fileName: 'x.jpg', fileType: 'image/jpeg' });
    expect(typeof blobId).toBe('string');

    // The mutation payload that goes to localStorage must reference the blob, never carry it.
    const mutationData = { bucket: 'inspection-photos', path: 'p/x.jpg', blobId, fileName: 'x.jpg' };
    const roundTripped = JSON.parse(JSON.stringify(mutationData));
    expect(roundTripped.blobId).toBe(blobId);
    expect('file' in roundTripped).toBe(false); // no File/Blob leaked into the queue

    // After the JSON round-trip, the blob is still recoverable from IndexedDB.
    const recovered = await offlineDB.getQueuedBlob(roundTripped.blobId);
    expect(recovered).toBeTruthy();
    const bytes = new Uint8Array(await recovered!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4, 5]);

    await offlineDB.deleteQueuedBlob(blobId);
    expect(await offlineDB.getQueuedBlob(blobId)).toBeFalsy();
  });
});
