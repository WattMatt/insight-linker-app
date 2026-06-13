import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineDB } from './offlineDB';
import { offlineInspectionDB } from './offlineInspectionDB';

// Both modules open the SAME IndexedDB name ('wm_compliance_offline'). If their
// DB_VERSION constants drift, the lower-versioned module's indexedDB.open() throws
// VersionError and that whole offline path silently breaks.
//
// Prod regression this guards against: offlineDB (used by the app-root useOfflineSync,
// which mounts early) opens the db FIRST at v5, creating it. offlineInspectionDB then
// opens the same db at v4 -> 4 < 5 -> VersionError -> offline inspection caching dies.
describe('offline DB version parity', () => {
  it('both modules open the shared db without VersionError, in app mount order', async () => {
    // offlineDB initializes first (mirrors prod: useOfflineSync at the app root).
    await expect(offlineDB.init()).resolves.toBeUndefined();
    // offlineInspectionDB initializes second against the now-existing db.
    await expect(offlineInspectionDB.init()).resolves.toBeUndefined();

    // Both schemas must coexist in the single shared db — neither clobbered the other.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('wm_compliance_offline');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(db.objectStoreNames.contains('queued_blobs')).toBe(true);
    expect(db.objectStoreNames.contains('inspection_cache')).toBe(true);
    db.close();
  });
});
