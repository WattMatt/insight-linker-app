/**
 * Service-worker cache janitor.
 *
 * Why this exists: workbox's ExpirationPlugin only ever deletes cache entries it has a
 * timestamp record for (IndexedDB `workbox-expiration` / `cache-entries`). It removes
 * the record first and the cache entry second, so a worker stopped between the two
 * steps leaves an entry nothing will ever expire. Measured on watsonmattheus.com
 * (2026-11-13): `supabase-images` had grown to 31 GB while the expiration store held 2
 * image records, and `supabase-api-cache` held 290 entries against 22 records (268
 * untracked, all written in one 76-minute window). The 200/100-entry limits never
 * applied to any of them.
 *
 * The janitor makes the limits hold regardless of how the bookkeeping got out of step:
 *   1. deletes caches by retired names (one-off cleanup for devices already bloated);
 *   2. deletes entries in managed caches that have no expiration record;
 *   3. deletes expiration records whose entry is gone (they count toward maxEntries
 *      and would otherwise evict live entries early).
 *
 * Race guard: workbox writes the cache entry, then its record, within milliseconds.
 * The janitor snapshots the cache keys, waits `settleMs`, and only then reads the
 * records, so an entry written just before the snapshot has its record by the time we
 * look. A record is only deleted after re-checking that its entry is still absent.
 *
 * Kept free of service-worker globals so it runs under vitest with fakes.
 */

export interface ExpirationRecord {
  id: string;
  cacheName: string;
  url: string;
  timestamp: number;
}

export interface CacheLike {
  keys(): Promise<ReadonlyArray<{ url: string }>>;
  delete(request: string): Promise<boolean>;
  match(request: string): Promise<unknown>;
}

export interface CacheStorageLike {
  keys(): Promise<string[]>;
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export interface ExpirationStore {
  readAll(): Promise<ExpirationRecord[]>;
  deleteRecord(id: string): Promise<void>;
}

export interface JanitorOptions {
  caches: CacheStorageLike;
  store: ExpirationStore;
  /** Runtime caches whose entries must all carry an expiration record. */
  managedCacheNames: readonly string[];
  /** Cache names no longer used; deleted outright. */
  retiredCacheNames: readonly string[];
  settleMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface JanitorReport {
  retiredCachesDeleted: string[];
  untrackedEntriesDeleted: Record<string, number>;
  staleRecordsDeleted: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runCacheJanitor(opts: JanitorOptions): Promise<JanitorReport> {
  const sleep = opts.sleep ?? defaultSleep;
  const settleMs = opts.settleMs ?? 2000;
  const report: JanitorReport = {
    retiredCachesDeleted: [],
    untrackedEntriesDeleted: {},
    staleRecordsDeleted: 0,
  };

  const existing = new Set(await opts.caches.keys());

  for (const name of opts.retiredCacheNames) {
    if (existing.has(name) && (await opts.caches.delete(name))) {
      report.retiredCachesDeleted.push(name);
    }
  }

  // Snapshot keys of every managed cache that exists, before reading the records.
  const snapshots = new Map<string, { cache: CacheLike; urls: Set<string> }>();
  for (const name of opts.managedCacheNames) {
    if (!existing.has(name)) continue;
    const cache = await opts.caches.open(name);
    const keys = await cache.keys();
    snapshots.set(name, { cache, urls: new Set(keys.map((k) => k.url)) });
  }

  await sleep(settleMs);

  const records = await opts.store.readAll();
  const tracked = new Map<string, Set<string>>();
  for (const r of records) {
    let set = tracked.get(r.cacheName);
    if (!set) tracked.set(r.cacheName, (set = new Set()));
    set.add(r.url);
  }

  for (const [name, { cache, urls }] of snapshots) {
    const trackedUrls = tracked.get(name) ?? new Set<string>();
    let deleted = 0;
    for (const url of urls) {
      if (!trackedUrls.has(url) && (await cache.delete(url))) deleted++;
    }
    report.untrackedEntriesDeleted[name] = deleted;
  }

  const managed = new Set(opts.managedCacheNames);
  for (const r of records) {
    if (!managed.has(r.cacheName)) continue;
    const snap = snapshots.get(r.cacheName);
    if (snap?.urls.has(r.url)) continue;
    // Not in the snapshot: confirm it is still absent before dropping the record.
    const cache = snap?.cache ?? (await opts.caches.open(r.cacheName));
    if (await cache.match(r.url)) continue;
    await opts.store.deleteRecord(r.id);
    report.staleRecordsDeleted++;
  }

  return report;
}

/** Reads/writes workbox-expiration's IndexedDB store. Never creates the database. */
export function workboxExpirationStore(idb: IDBFactory): ExpirationStore {
  const open = () =>
    new Promise<IDBDatabase | null>((resolve, reject) => {
      let created = false;
      const req = idb.open('workbox-expiration');
      req.onupgradeneeded = () => {
        // Database did not exist; abort so we don't create an empty one workbox
        // would then have to upgrade around.
        created = true;
        req.transaction?.abort();
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => (created ? resolve(null) : reject(req.error));
    });

  return {
    async readAll() {
      const db = await open();
      if (!db || !db.objectStoreNames.contains('cache-entries')) {
        db?.close();
        return [];
      }
      try {
        return await new Promise<ExpirationRecord[]>((resolve, reject) => {
          const req = db.transaction('cache-entries').objectStore('cache-entries').getAll();
          req.onsuccess = () => resolve(req.result as ExpirationRecord[]);
          req.onerror = () => reject(req.error);
        });
      } finally {
        db.close();
      }
    },
    async deleteRecord(id) {
      const db = await open();
      if (!db) return;
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('cache-entries', 'readwrite');
          tx.objectStore('cache-entries').delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
  };
}
