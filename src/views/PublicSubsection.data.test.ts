/**
 * Tests for `fetchPublicSubsectionData` — Web ARCHITECTURE_AUDIT.md
 * Strategy 2 (first RSC). The function is pure I/O composition over the
 * Supabase client, so we mock `.from(...).select(...).eq(...).maybeSingle()`
 * chains per table.
 */

import {
  fetchPublicSubsectionData,
  type PublicSubsectionBundle,
} from './PublicSubsection.data'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUBSECTION_ID = 'sub-uuid-1'

// ─────────────────────────────────────────────────────────────────────
// Mock builder — a Supabase client where `.from(table)` returns the
// per-table chain set up in the supplied `tables` map.
// ─────────────────────────────────────────────────────────────────────

interface MaybeSingleResult<T> {
  data: T | null
  error: Error | null
}

interface TableMock {
  /** Result of the *terminal* call (maybeSingle / direct then). */
  result: MaybeSingleResult<unknown>
}

function makeSupabaseMock(tables: Record<string, TableMock>): SupabaseClient {
  return {
    from: vi.fn((table: string) => {
      const t = tables[table]
      if (!t) throw new Error(`Unexpected from(${table})`)
      // Each query in this codebase ends in either `.maybeSingle()` (returns
      // the result) or a `.order(...)` / `.eq(...)` that itself awaits to
      // the result. We model both endpoints by giving every intermediate
      // call back the same thenable. `then` returns a real Promise so
      // TS sees this as PromiseLike compatibly.
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue(t.result),
        then(
          onfulfilled?: (value: unknown) => unknown,
          onrejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(t.result).then(onfulfilled, onrejected)
        },
      }
      return chain
    }),
  } as unknown as SupabaseClient
}

const VALID_SUBSECTION_ROW = {
  id: SUBSECTION_ID,
  name: 'Distribution Board A',
  is_coc_required: true,
  coc_status: 'Valid',
  metering_status: 'Installed',
  sites: {
    id: 'site-1',
    name: 'KingsWalk Mall',
    address: '123 King St',
    client_logo_url: 'https://x/y.png',
    clients: {
      id: 'client-1',
      name: 'Tenant Co',
      company_name: 'Tenant Co (Pty) Ltd',
      logo_url: 'https://x/c.png',
    },
  },
}

describe('fetchPublicSubsectionData', () => {
  it('returns null when the subsection is not found', async () => {
    const supabase = makeSupabaseMock({
      subsections: { result: { data: null, error: null } },
      document_categories: { result: { data: [], error: null } },
      snags: { result: { data: [], error: null } },
      coc_validations: { result: { data: [], error: null } },
      settings: { result: { data: null, error: null } },
    })

    const result = await fetchPublicSubsectionData(supabase, SUBSECTION_ID)
    expect(result).toBeNull()
  })

  it('throws when the subsections query errors', async () => {
    const supabase = makeSupabaseMock({
      subsections: {
        result: { data: null, error: new Error('rls denied') },
      },
      document_categories: { result: { data: [], error: null } },
      snags: { result: { data: [], error: null } },
      coc_validations: { result: { data: [], error: null } },
      settings: { result: { data: null, error: null } },
    })

    await expect(
      fetchPublicSubsectionData(supabase, SUBSECTION_ID),
    ).rejects.toThrow(/rls denied/)
  })

  it('returns a fully-built bundle on the happy path', async () => {
    const supabase = makeSupabaseMock({
      subsections: { result: { data: VALID_SUBSECTION_ROW, error: null } },
      document_categories: {
        result: {
          data: [
            {
              id: 'cat-1',
              name: 'CoC Documents',
              order_index: 0,
              subsection_documents: [
                {
                  id: 'doc-1',
                  file_name: 'coc.pdf',
                  file_url: 'https://x/coc.pdf',
                  uploaded_at: '2026-05-20T10:00:00Z',
                },
              ],
            },
            // Empty category — should be filtered out.
            {
              id: 'cat-2',
              name: 'Empty',
              order_index: 1,
              subsection_documents: [],
            },
          ],
          error: null,
        },
      },
      snags: {
        result: {
          data: [
            {
              id: 'snag-1',
              title: 'Loose terminal',
              status: 'Open',
              risk_level: 'high',
              created_at: '2026-05-20T11:00:00Z',
            },
          ],
          error: null,
        },
      },
      coc_validations: {
        result: {
          data: [{ document_id: 'doc-1', status: 'PASSED' }],
          error: null,
        },
      },
      settings: {
        result: {
          data: { company_name: 'WM Co', company_logo_url: 'https://x/wm.png' },
          error: null,
        },
      },
    })

    const result = (await fetchPublicSubsectionData(
      supabase,
      SUBSECTION_ID,
    )) as PublicSubsectionBundle

    expect(result).not.toBeNull()
    expect(result.subsection.id).toBe(SUBSECTION_ID)
    expect(result.site.name).toBe('KingsWalk Mall')
    expect(result.client.name).toBe('Tenant Co')
    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]?.files[0]?.name).toBe('coc.pdf')
    expect(result.snags).toHaveLength(1)
    expect(result.cocValidations['doc-1']).toMatchObject({ status: 'PASSED' })
    expect(result.companySettings?.company_name).toBe('WM Co')
  })

  it('filters out document categories that have no documents', async () => {
    const supabase = makeSupabaseMock({
      subsections: { result: { data: VALID_SUBSECTION_ROW, error: null } },
      document_categories: {
        result: {
          data: [
            { id: 'a', name: 'A', order_index: 0, subsection_documents: [] },
            {
              id: 'b',
              name: 'B',
              order_index: 1,
              subsection_documents: [
                {
                  id: 'doc-b',
                  file_name: 'b.pdf',
                  file_url: 'https://x/b.pdf',
                },
              ],
            },
          ],
          error: null,
        },
      },
      snags: { result: { data: [], error: null } },
      coc_validations: { result: { data: [], error: null } },
      settings: { result: { data: null, error: null } },
    })

    const result = await fetchPublicSubsectionData(supabase, SUBSECTION_ID)
    expect(result?.documents.map(c => c.name)).toEqual(['B'])
  })

  it('returns empty arrays + null when secondary queries return nothing', async () => {
    const supabase = makeSupabaseMock({
      subsections: { result: { data: VALID_SUBSECTION_ROW, error: null } },
      document_categories: { result: { data: null, error: null } },
      snags: { result: { data: null, error: null } },
      coc_validations: { result: { data: null, error: null } },
      settings: { result: { data: null, error: null } },
    })

    const result = await fetchPublicSubsectionData(supabase, SUBSECTION_ID)
    expect(result?.documents).toEqual([])
    expect(result?.snags).toEqual([])
    expect(result?.cocValidations).toEqual({})
    expect(result?.companySettings).toBeNull()
  })
})
