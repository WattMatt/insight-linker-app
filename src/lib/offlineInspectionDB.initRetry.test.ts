import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineInspectionDB } from './offlineInspectionDB';

// C4: init() caches this.initPromise and, on the FIRST open failing, used to cache
// the REJECTED promise forever (never nulled) — so every later init() returned the
// same rejection and offline storage was dead for the whole session. A transient
// open failure must be recoverable: a later init() should be able to succeed.

// Make the next indexedDB.open() error exactly once, then restore the real factory.
function failNextOpenOnce() {
  const realOpen = indexedDB.open.bind(indexedDB);
  let consumed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (indexedDB as any).open = (...args: unknown[]) => {
    if (consumed) return (realOpen as (...a: unknown[]) => IDBOpenDBRequest)(...args);
    consumed = true;
    (indexedDB as { open: unknown }).open = realOpen; // next call uses the real one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { error: new DOMException('simulated transient failure', 'UnknownError') };
    queueMicrotask(() => req.onerror?.());
    return req;
  };
}

describe('offlineInspectionDB.init — transient-failure recovery (C4)', () => {
  it('does not cache a rejected initPromise; a later init() can still succeed', async () => {
    failNextOpenOnce();

    // First attempt fails (simulated open error).
    await expect(offlineInspectionDB.init()).rejects.toBeTruthy();

    // Second attempt must be able to open the db — NOT return the cached rejection.
    await expect(offlineInspectionDB.init()).resolves.toBeUndefined();
  });
});
