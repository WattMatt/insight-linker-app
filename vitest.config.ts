import { defineConfig } from 'vitest/config';
import path from 'path';

// Layer (b) of the offline-hardening harness. Component/hook tests (.test.tsx) run
// under jsdom so they can render real components and drive the offline runtime
// surface — navigator.onLine, localStorage, IndexedDB (fake-indexeddb). Pure-logic
// and IndexedDB-blob tests (.test.ts) stay on node, where Node's Blob survives the
// structured-clone round-trip (jsdom's Blob does not). jsdom gets a real origin so
// window.localStorage is available (about:blank is an opaque origin and has none).
export default defineConfig({
  // Match the Next build's automatic JSX runtime so .test.tsx files can render real
  // components without importing React (components in this repo never import React).
  esbuild: { jsx: 'automatic' },
  test: {
    // Default node (Node's Blob survives fake-indexeddb's structured clone; jsdom's
    // does not). DOM tests opt into jsdom per-file with a `// @vitest-environment
    // jsdom` docblock — see src/hooks/useOfflineSync.online.test.tsx.
    environment: 'node',
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // supabase/** is listed ahead of the files existing so an edge-function test is
    // picked up the moment one is written rather than silently never running; the
    // tree carries none today. tsconfig.json excludes supabase/, so those tests are
    // outside the type-error ratchet.
    include: [
      'src/**/*.test.{ts,tsx}',
      'supabase/**/*.test.{ts,tsx}',
      'scripts/**/*.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
