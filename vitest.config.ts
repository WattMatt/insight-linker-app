import { defineConfig } from 'vitest/config';
import path from 'path';

// Layer (b) of the offline-hardening harness. Component/hook tests (.test.tsx) run
// under jsdom so they can render real components and drive the offline runtime
// surface — navigator.onLine, localStorage, IndexedDB (fake-indexeddb). Pure-logic
// and IndexedDB-blob tests (.test.ts) stay on node, where Node's Blob survives the
// structured-clone round-trip (jsdom's Blob does not). jsdom gets a real origin so
// window.localStorage is available (about:blank is an opaque origin and has none).
export default defineConfig({
  test: {
    // Default node (Node's Blob survives fake-indexeddb's structured clone; jsdom's
    // does not). DOM tests opt into jsdom per-file with a `// @vitest-environment
    // jsdom` docblock — see src/hooks/useOfflineSync.online.test.tsx.
    environment: 'node',
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
