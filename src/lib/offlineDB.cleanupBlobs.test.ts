import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineDB } from './offlineDB';

// M1/M2: queued upload blobs whose mutation never made it (crash between putQueuedBlob
// and queueMutation, or a failed delete) would otherwise pile up in IndexedDB forever.
describe('offlineDB.cleanupOrphanedBlobs', () => {
  it('deletes an unreferenced blob older than the cutoff, keeps the referenced one', async () => {
    const referenced = await offlineDB.putQueuedBlob(new Blob(['a']));
    const orphan = await offlineDB.putQueuedBlob(new Blob(['b']));

    // Cutoff in the future → every existing blob counts as "old enough" to consider.
    const cutoff = new Date(Date.now() + 1000).toISOString();
    const deleted = await offlineDB.cleanupOrphanedBlobs(new Set([referenced]), cutoff);

    expect(deleted).toBe(1);
    expect(await offlineDB.getQueuedBlob(referenced)).toBeTruthy();
    expect(await offlineDB.getQueuedBlob(orphan)).toBeUndefined();
  });

  it('does NOT delete a recent orphan (younger than cutoff) — avoids racing a fresh put', async () => {
    const fresh = await offlineDB.putQueuedBlob(new Blob(['c']));

    // Cutoff in the past → nothing is old enough to delete.
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const deleted = await offlineDB.cleanupOrphanedBlobs(new Set(), cutoff);

    expect(deleted).toBe(0);
    expect(await offlineDB.getQueuedBlob(fresh)).toBeTruthy();
  });
});
