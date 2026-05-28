/**
 * Tests for the snag CRUD helpers — Web ARCHITECTURE_AUDIT.md Strategy 5.
 *
 * Each test passes a per-call Supabase mock so we can assert both:
 *   - the right query chain was built (table, filters, payload),
 *   - the function surface (return value, throw behaviour, coalescing).
 */

import {
  fetchSnagsForSubsection,
  createSnag,
  updateSnag,
  toggleSnagStatus,
  nextSnagStatus,
  deleteSnag,
} from './snagsApi'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CapturedQuery {
  table?: string
  select?: string
  filters: Array<[string, unknown]>
  payload?: unknown
  orders: Array<{ column: string; ascending: boolean }>
  op?: 'insert' | 'update' | 'delete' | 'select'
}

/**
 * Returns a Supabase-shaped mock that captures every call into
 * `captured` and resolves the terminal step with `result`.
 */
function makeSupabaseSpy(result: { data: unknown; error: Error | null }): {
  client: SupabaseClient
  captured: CapturedQuery
} {
  const captured: CapturedQuery = { filters: [], orders: [] }

  const chain = {
    select: vi.fn((s: string) => {
      captured.select = s
      captured.op = captured.op ?? 'select'
      return chain
    }),
    insert: vi.fn((payload: unknown) => {
      captured.op = 'insert'
      captured.payload = payload
      return chain
    }),
    update: vi.fn((payload: unknown) => {
      captured.op = 'update'
      captured.payload = payload
      return chain
    }),
    delete: vi.fn(() => {
      captured.op = 'delete'
      return chain
    }),
    eq: vi.fn((col: string, val: unknown) => {
      captured.filters.push([col, val])
      return chain
    }),
    order: vi.fn((col: string, opts: { ascending: boolean }) => {
      captured.orders.push({ column: col, ascending: opts.ascending })
      return chain
    }),
    then(
      onfulfilled?: (value: unknown) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected)
    },
  }

  const client = {
    from: vi.fn((table: string) => {
      captured.table = table
      return chain
    }),
  } as unknown as SupabaseClient

  return { client, captured }
}

// ─────────────────────────────────────────────────────────────────────
describe('fetchSnagsForSubsection', () => {
  it('queries snags table, filters by subsection_id, orders newest first', async () => {
    const { client, captured } = makeSupabaseSpy({
      data: [{ id: 'a' }, { id: 'b' }],
      error: null,
    })

    const result = await fetchSnagsForSubsection(client, 'sub-1')

    expect(captured.table).toBe('snags')
    expect(captured.filters).toEqual([['subsection_id', 'sub-1']])
    expect(captured.orders).toEqual([{ column: 'created_at', ascending: false }])
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  it('returns [] when supabase returns null data with no error', async () => {
    const { client } = makeSupabaseSpy({ data: null, error: null })
    expect(await fetchSnagsForSubsection(client, 'sub-1')).toEqual([])
  })

  it('throws when supabase reports an error', async () => {
    const { client } = makeSupabaseSpy({ data: null, error: new Error('rls') })
    await expect(fetchSnagsForSubsection(client, 'sub-1')).rejects.toThrow(/rls/)
  })
})

// ─────────────────────────────────────────────────────────────────────
describe('createSnag', () => {
  const baseInput = {
    title: 'Loose conductor',
    description: 'desc',
    notes: 'notes',
    photos: ['photo1.jpg'],
    risk_level: 'high',
    estimated_cost: '1234.56',
  }

  it('sets status Open and parses estimated_cost as float', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    await createSnag(client, {
      subsectionId: 'sub-1',
      input: baseInput,
      createdBy: 'user-1',
    })

    expect(captured.table).toBe('snags')
    expect(captured.op).toBe('insert')
    expect(captured.payload).toMatchObject({
      subsection_id: 'sub-1',
      title: 'Loose conductor',
      status: 'Open',
      estimated_cost: 1234.56,
      created_by: 'user-1',
    })
  })

  it('null-coalesces empty risk_level and missing estimated_cost', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    await createSnag(client, {
      subsectionId: 'sub-1',
      input: { ...baseInput, risk_level: '', estimated_cost: '' },
      createdBy: 'user-1',
    })

    expect(captured.payload).toMatchObject({
      risk_level: null,
      estimated_cost: null,
    })
  })

  it('throws when supabase reports an error', async () => {
    const { client } = makeSupabaseSpy({
      data: null,
      error: new Error('insert fail'),
    })
    await expect(
      createSnag(client, {
        subsectionId: 'sub-1',
        input: baseInput,
        createdBy: 'user-1',
      }),
    ).rejects.toThrow(/insert fail/)
  })
})

// ─────────────────────────────────────────────────────────────────────
describe('updateSnag', () => {
  it('null-coalesces empty fields and converts empty-photos array to NULL', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    await updateSnag(client, {
      id: 'snag-1',
      title: 'updated',
      description: '',
      notes: '',
      photos: [],
      risk_level: '',
      estimated_cost: '',
    })

    expect(captured.op).toBe('update')
    expect(captured.filters).toEqual([['id', 'snag-1']])
    expect(captured.payload).toEqual({
      title: 'updated',
      description: null,
      notes: null,
      photos: null,
      risk_level: null,
      estimated_cost: null,
    })
  })

  it('keeps a non-empty photos array verbatim', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    await updateSnag(client, {
      id: 'snag-1',
      title: 'updated',
      photos: ['a.jpg', 'b.jpg'],
    })

    expect(captured.payload).toMatchObject({ photos: ['a.jpg', 'b.jpg'] })
  })
})

// ─────────────────────────────────────────────────────────────────────
describe('toggleSnagStatus / nextSnagStatus', () => {
  it('flips Open → Closed', () => {
    expect(nextSnagStatus('Open')).toBe('Closed')
  })

  it('flips anything-non-Open → Open', () => {
    expect(nextSnagStatus('Closed')).toBe('Open')
    expect(nextSnagStatus('Rectified')).toBe('Open')
    expect(nextSnagStatus('')).toBe('Open')
  })

  it('sends the new status to supabase and returns it', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    const result = await toggleSnagStatus(client, 'snag-1', 'Open')

    expect(result).toBe('Closed')
    expect(captured.op).toBe('update')
    expect(captured.payload).toEqual({ status: 'Closed' })
    expect(captured.filters).toEqual([['id', 'snag-1']])
  })
})

// ─────────────────────────────────────────────────────────────────────
describe('deleteSnag', () => {
  it('issues a delete with the right filter', async () => {
    const { client, captured } = makeSupabaseSpy({ data: null, error: null })

    await deleteSnag(client, 'snag-1')

    expect(captured.op).toBe('delete')
    expect(captured.table).toBe('snags')
    expect(captured.filters).toEqual([['id', 'snag-1']])
  })

  it('throws when supabase reports an error', async () => {
    const { client } = makeSupabaseSpy({ data: null, error: new Error('rls') })
    await expect(deleteSnag(client, 'snag-1')).rejects.toThrow(/rls/)
  })
})
