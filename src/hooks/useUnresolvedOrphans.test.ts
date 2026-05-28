/**
 * Test 1/5 of the Web ARCHITECTURE_AUDIT.md Strategy 1 baseline.
 *
 * Locks the wire contract of `useUnresolvedOrphans`:
 *   - SELECT from the `my_unresolved_orphans` view
 *   - resolve_my_orphan RPC payload shape
 *   - archive_my_orphan RPC payload shape
 *   - cache invalidation key
 *
 * Mocks the Supabase client. The hook lives at src/hooks/useUnresolvedOrphans.ts
 * and the server contract lives in Supabase project oltzgidkjxwsukvkomof.
 */

import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mutable mock state so each test can wire up its own responses.
const mockState = {
  selectResult: { data: [] as unknown[], error: null as Error | null },
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: { data: null, error: null as Error | null },
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(async () => mockState.selectResult),
    })),
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      mockState.rpcCalls.push({ name, args })
      return mockState.rpcResult
    }),
  },
}))

// Import AFTER the mock is registered.
import {
  useUnresolvedOrphans,
  ORPHANS_QUERY_KEY,
  type OrphanRow,
} from './useUnresolvedOrphans'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
}

const sampleRow: OrphanRow = {
  inspection_id: '11111111-1111-1111-1111-111111111111',
  inspection_title: 'sample',
  inspection_status: 'Completed',
  created_at: '2026-05-27T00:00:00Z',
  site_id: '22222222-2222-2222-2222-222222222222',
  site_name: 'Evaton Mall',
  shop_name_orphan: 'CLAY CAFE',
  shop_number_orphan: null,
  candidate_subsections: [
    { id: '33333333-3333-3333-3333-333333333333', name: 'Shop 7' },
  ],
  best_guess: null,
}

beforeEach(() => {
  mockState.selectResult = { data: [], error: null }
  mockState.rpcCalls = []
  mockState.rpcResult = { data: null, error: null }
})

describe('useUnresolvedOrphans', () => {
  it('returns rows from the my_unresolved_orphans view', async () => {
    mockState.selectResult = { data: [sampleRow], error: null }

    const { result } = renderHook(() => useUnresolvedOrphans(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([sampleRow])
    expect(result.current.error).toBeNull()
  })

  it('returns an empty array (not undefined) when the view has no rows', async () => {
    mockState.selectResult = { data: [], error: null }

    const { result } = renderHook(() => useUnresolvedOrphans(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.rows).toEqual([])
  })

  it('surfaces an error from the SELECT to the caller', async () => {
    mockState.selectResult = { data: [], error: new Error('boom') }

    const { result } = renderHook(() => useUnresolvedOrphans(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('boom')
  })

  it('resolve() calls resolve_my_orphan with snake_case args', async () => {
    const { result } = renderHook(() => useUnresolvedOrphans(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.resolve({
        inspection_id: 'abc',
        subsection_id: 'def',
      })
    })

    expect(mockState.rpcCalls).toEqual([
      {
        name: 'resolve_my_orphan',
        args: { p_inspection_id: 'abc', p_subsection_id: 'def' },
      },
    ])
  })

  it('archive() calls archive_my_orphan with reason', async () => {
    const { result } = renderHook(() => useUnresolvedOrphans(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.archive({
        inspection_id: 'abc',
        reason: 'duplicate',
      })
    })

    expect(mockState.rpcCalls).toEqual([
      {
        name: 'archive_my_orphan',
        args: { p_inspection_id: 'abc', p_reason: 'duplicate' },
      },
    ])
  })

  it('exposes a stable cache key under ORPHANS_QUERY_KEY', () => {
    // Locked so the Strategy 4 type-regen workflow and the modal both
    // know which key to invalidate.
    expect(ORPHANS_QUERY_KEY).toEqual(['unresolved-orphans'])
  })
})
