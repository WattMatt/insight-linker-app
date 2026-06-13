import '@testing-library/jest-dom/vitest';

// The Supabase client (src/integrations/supabase/client.ts) throws at *import time*
// if these env vars are missing. Provide harmless dummy values so any module that
// imports the client loads under test. Tests that exercise queries vi.mock the client
// to control responses; createClient never makes a network call until invoked.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key';

// Neither node nor this jsdom build provides Web Storage, yet the offline layer leans
// on localStorage heavily (the mutation queue, supabase auth). Install a Map-backed
// Storage if absent. writable+configurable so a test can still override it (e.g.
// offlineQueue.test.ts assigns its own mock).
function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  } as Storage;
}

for (const key of ['localStorage', 'sessionStorage'] as const) {
  if (!(globalThis as Record<string, unknown>)[key]) {
    const storage = makeStorage();
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: storage });
    if (typeof window !== 'undefined' && !window[key]) {
      Object.defineProperty(window, key, { configurable: true, writable: true, value: storage });
    }
  }
}
