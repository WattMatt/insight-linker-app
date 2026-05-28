import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * Vitest baseline config — Web ARCHITECTURE_AUDIT.md Strategy 1.
 *
 * Tests run in jsdom (browser-like) with globals enabled (so `describe`,
 * `it`, `expect`, `vi` don't need imports). Path alias `@/` resolves to
 * `./src` matching the Next.js tsconfig.
 *
 * `setupFiles` adds @testing-library/jest-dom matchers (toBeInTheDocument
 * etc.) globally. Each test file is responsible for its own Supabase /
 * fetch mocking — no default mock here.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    // vmThreads pool — forks/threads pools fail with "Timeout waiting
    // for worker to respond" on this Node/macOS combo after adding the
    // @supabase/ssr dependency (it pulls in next/headers, which doesn't
    // load in a forked worker). vmThreads runs each test file in a
    // V8 vm context inside the main process — slower per-file boot
    // (~40s for the first jsdom env init) but reliable.
    pool: 'vmThreads',
    // Exclude generated + bundle code from coverage targeting.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/*.test.*',
        '**/*.config.*',
        'src/integrations/supabase/types.ts',
        '.next/**',
      ],
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
