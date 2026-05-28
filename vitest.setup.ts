import '@testing-library/jest-dom/vitest'

// Web ARCHITECTURE_AUDIT.md Strategy 1: baseline Vitest setup.
//
// This file runs once before each test file. It adds the
// `@testing-library/jest-dom` matchers (toBeInTheDocument, toHaveClass,
// toHaveAttribute, etc.) to Vitest's `expect`.
//
// No default Supabase mock here — each test owns its own mock scope so
// shared mutable mock state doesn't bleed between tests. Common pattern:
//
//   vi.mock('@/integrations/supabase/client', () => ({
//     supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } },
//   }))
//
// at the top of each test file that needs the supabase client.
