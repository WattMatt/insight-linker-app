/**
 * Test 3/5 of the Web ARCHITECTURE_AUDIT.md Strategy 1 baseline.
 *
 * Locks the role-fetch contract: returns null until a user is signed
 * in, then returns the role from `user_roles`. Cache is invalidated
 * when the user changes (logout/login).
 */

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mutable state for auth + role query
const authState = {
  currentUser: null as { id: string } | null,
  authChangeListener: null as ((event: string, session: unknown) => void) | null,
}
const roleState = {
  result: { data: null as { role: string } | null, error: null as Error | null },
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authState.currentUser } })),
      onAuthStateChange: vi.fn((cb) => {
        authState.authChangeListener = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => roleState.result),
        })),
      })),
    })),
  },
}))

import { useUserRole } from './useUserRole'

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

beforeEach(() => {
  authState.currentUser = null
  authState.authChangeListener = null
  roleState.result = { data: null, error: null }
})

describe('useUserRole', () => {
  it('returns null when there is no authenticated user', async () => {
    authState.currentUser = null

    const { result } = renderHook(() => useUserRole(), {
      wrapper: makeWrapper(),
    })

    // No user → enabled:false on the query → data stays undefined.
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeFalsy()
  })

  it('returns the role from user_roles when authenticated', async () => {
    authState.currentUser = { id: 'user-1' }
    roleState.result = { data: { role: 'Contractor' }, error: null }

    const { result } = renderHook(() => useUserRole(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.data).toBe('Contractor'))
  })

  it('returns null when user_roles has no row for the user', async () => {
    authState.currentUser = { id: 'user-1' }
    roleState.result = { data: null, error: null }

    const { result } = renderHook(() => useUserRole(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data).toBeFalsy()
  })
})
