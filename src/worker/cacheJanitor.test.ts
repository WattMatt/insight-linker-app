import { describe, it, expect } from 'vitest';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import {
  runCacheJanitor,
  workboxExpirationStore,
  type CacheLike,
  type CacheStorageLike,
  type ExpirationRecord,
  type ExpirationStore,
} from './cacheJanitor';

class FakeCache implements CacheLike {
  urls = new Set<string>();
  constructor(urls: string[] = []) {
    urls.forEach((u) => this.urls.add(u));
  }
  async keys() {
    return [...this.urls].map((url) => ({ url }));
  }
  async delete(url: string) {
    return this.urls.delete(url);
  }
  async match(url: string) {
    return this.urls.has(url) ? {} : undefined;
  }
}

class FakeCacheStorage implements CacheStorageLike {
  constructor(public map: Map<string, FakeCache>) {}
  async keys() {
    return [...this.map.keys()];
  }
  async open(name: string) {
    let c = this.map.get(name);
    if (!c) this.map.set(name, (c = new FakeCache()));
    return c;
  }
  async delete(name: string) {
    return this.map.delete(name);
  }
}

class FakeStore implements ExpirationStore {
  constructor(public records: ExpirationRecord[]) {}
  async readAll() {
    return [...this.records];
  }
  async deleteRecord(id: string) {
    this.records = this.records.filter((r) => r.id !== id);
  }
}

const rec = (cacheName: string, url: string): ExpirationRecord => ({
  id: `${cacheName}|${url}`,
  cacheName,
  url,
  timestamp: 1,
});

const IMG = 'supabase-images-v2';
const API = 'supabase-api-cache-v2';
const u = (n: number) => `https://x.supabase.co/storage/v1/object/public/p/${n}.jpg`;

describe('runCacheJanitor', () => {
  it('deletes untracked entries and keeps tracked ones', async () => {
    const img = new FakeCache([u(1), u(2), u(3)]);
    const caches = new FakeCacheStorage(new Map([[IMG, img]]));
    const store = new FakeStore([rec(IMG, u(1))]);

    const report = await runCacheJanitor({
      caches,
      store,
      managedCacheNames: [IMG],
      retiredCacheNames: [],
      sleep: async () => {},
    });

    expect([...img.urls]).toEqual([u(1)]);
    expect(report.untrackedEntriesDeleted[IMG]).toBe(2);
    expect(store.records).toHaveLength(1);
  });

  it('keeps an entry whose record lands during the settle wait', async () => {
    const img = new FakeCache([u(1)]);
    const caches = new FakeCacheStorage(new Map([[IMG, img]]));
    const store = new FakeStore([]);

    await runCacheJanitor({
      caches,
      store,
      managedCacheNames: [IMG],
      retiredCacheNames: [],
      // workbox writes the record right after the cache put
      sleep: async () => {
        store.records.push(rec(IMG, u(1)));
      },
    });

    expect([...img.urls]).toEqual([u(1)]);
  });

  it('never deletes an entry written after the snapshot', async () => {
    const img = new FakeCache([]);
    const caches = new FakeCacheStorage(new Map([[IMG, img]]));
    const store = new FakeStore([]);

    await runCacheJanitor({
      caches,
      store,
      managedCacheNames: [IMG],
      retiredCacheNames: [],
      sleep: async () => {
        img.urls.add(u(9));
        store.records.push(rec(IMG, u(9)));
      },
    });

    expect([...img.urls]).toEqual([u(9)]);
    expect(store.records).toHaveLength(1); // record kept: re-check found the entry
  });

  it('deletes records whose entry is gone, only for managed caches', async () => {
    const img = new FakeCache([u(1)]);
    const caches = new FakeCacheStorage(new Map([[IMG, img]]));
    const store = new FakeStore([
      rec(IMG, u(1)),
      rec(IMG, u(2)), // entry gone
      rec(API, 'https://x.supabase.co/rest/v1/a'), // managed cache that does not exist
      rec('google-fonts', 'https://fonts.gstatic.com/a'), // unmanaged: leave alone
    ]);

    const report = await runCacheJanitor({
      caches,
      store,
      managedCacheNames: [IMG, API],
      retiredCacheNames: [],
      sleep: async () => {},
    });

    expect(report.staleRecordsDeleted).toBe(2);
    expect(store.records.map((r) => r.cacheName).sort()).toEqual(['google-fonts', IMG]);
  });

  it('deletes retired caches and leaves unmanaged caches untouched', async () => {
    const fonts = new FakeCache(['https://fonts.gstatic.com/a']);
    const caches = new FakeCacheStorage(
      new Map([
        ['supabase-images', new FakeCache([u(1), u(2)])],
        ['supabase-api-cache', new FakeCache(['https://x.supabase.co/rest/v1/a'])],
        ['google-fonts', fonts],
      ]),
    );

    const report = await runCacheJanitor({
      caches,
      store: new FakeStore([]),
      managedCacheNames: [IMG, API],
      retiredCacheNames: ['supabase-images', 'supabase-api-cache'],
      sleep: async () => {},
    });

    expect(report.retiredCachesDeleted).toEqual(['supabase-images', 'supabase-api-cache']);
    expect(await caches.keys()).toEqual(['google-fonts']);
    expect(fonts.urls.size).toBe(1);
  });

  it('does not create managed caches that do not exist', async () => {
    const caches = new FakeCacheStorage(new Map());
    await runCacheJanitor({
      caches,
      store: new FakeStore([]),
      managedCacheNames: [IMG, API],
      retiredCacheNames: [],
      sleep: async () => {},
    });
    expect(await caches.keys()).toEqual([]);
  });
});

describe('workboxExpirationStore', () => {
  it('returns no records and creates nothing when the database is absent', async () => {
    const idb = new FakeIDBFactory();
    const store = workboxExpirationStore(idb as unknown as IDBFactory);
    expect(await store.readAll()).toEqual([]);
    const dbs = await idb.databases();
    expect(dbs.map((d) => d.name)).not.toContain('workbox-expiration');
  });

  it('reads and deletes workbox records', async () => {
    const idb = new FakeIDBFactory();
    await new Promise<void>((resolve, reject) => {
      const req = idb.open('workbox-expiration', 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore('cache-entries', { keyPath: 'id' });
        os.put(rec(IMG, u(1)));
        os.put(rec(IMG, u(2)));
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    const store = workboxExpirationStore(idb as unknown as IDBFactory);
    expect((await store.readAll()).map((r) => r.url).sort()).toEqual([u(1), u(2)]);
    await store.deleteRecord(`${IMG}|${u(2)}`);
    expect((await store.readAll()).map((r) => r.url)).toEqual([u(1)]);
  });
});
