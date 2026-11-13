/**
 * Custom worker code. @ducanh2912/next-pwa bundles this file (customWorkerSrc defaults
 * to `worker`, resolved under src/) and importScripts() it into the generated sw.js.
 *
 * Runs the cache janitor when the worker activates and then at most once every
 * JANITOR_INTERVAL_MS while it handles traffic. See cacheJanitor.ts for why.
 */
import { runCacheJanitor, workboxExpirationStore } from './cacheJanitor';
import { MANAGED_RUNTIME_CACHES, RETIRED_RUNTIME_CACHES } from './cacheNames';

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface WorkerScopeLike {
  caches: CacheStorage;
  indexedDB: IDBFactory;
  addEventListener(type: 'activate' | 'fetch', listener: (event: ExtendableEventLike) => void): void;
}

const scope = self as unknown as WorkerScopeLike;

const JANITOR_INTERVAL_MS = 15 * 60 * 1000;
let lastRun = 0;
let running: Promise<unknown> | null = null;

function runJanitor(): Promise<unknown> {
  if (running) return running;
  lastRun = Date.now();
  running = runCacheJanitor({
    caches: scope.caches,
    store: workboxExpirationStore(scope.indexedDB),
    managedCacheNames: MANAGED_RUNTIME_CACHES,
    retiredCacheNames: RETIRED_RUNTIME_CACHES,
  })
    .then((report) => {
      const removed = Object.values(report.untrackedEntriesDeleted).reduce((a, b) => a + b, 0);
      if (removed || report.staleRecordsDeleted || report.retiredCachesDeleted.length) {
        console.info('[sw-cache-janitor]', report);
      }
    })
    .catch((error) => console.warn('[sw-cache-janitor] failed', error))
    .finally(() => {
      running = null;
    });
  return running;
}

scope.addEventListener('activate', (event) => {
  event.waitUntil(runJanitor());
});

scope.addEventListener('fetch', (event) => {
  if (Date.now() - lastRun < JANITOR_INTERVAL_MS) return;
  event.waitUntil(runJanitor());
});
