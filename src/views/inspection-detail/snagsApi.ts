/**
 * Snag CRUD helpers — Web ARCHITECTURE_AUDIT.md Strategy 5 (first carve
 * from `InspectionDetail.tsx`, 2,834 lines).
 *
 * These functions are the pure I/O layer for snags. The view component
 * still owns React state + dialog + form, but every supabase call has
 * been lifted into this module so:
 *
 *   - the data shape lives in one place,
 *   - the field-trimming + null-coalescing logic is testable,
 *   - swapping the data source later (Server Action, RSC fetch) is a
 *     one-file change.
 *
 * Pattern matches `PublicSubsection.data.ts` from Strategy 2.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────
// Public input/output shapes. The view component already uses these
// shapes informally — this module just makes them explicit so drift
// becomes a TypeScript error.
// ─────────────────────────────────────────────────────────────────────

/**
 * Shape of the inline "new snag" form on `InspectionDetail.tsx`.
 * `estimated_cost` is a string because it comes straight out of an
 * <input>; this module is responsible for parsing it.
 */
export interface NewSnagInput {
  title: string
  description: string
  notes: string
  photos: string[]
  risk_level: string
  estimated_cost: string
}

/**
 * Shape of the existing snag being edited. `photos` is always an array
 * here (the view normalises null → []) and `estimated_cost` is again
 * the raw string from the form.
 */
export interface EditingSnagInput {
  id: string
  title: string
  description?: string | null
  notes?: string | null
  photos: string[]
  risk_level?: string | null
  estimated_cost?: string | null
}

export type SnagStatus = 'Open' | 'Closed' | string

// ─────────────────────────────────────────────────────────────────────
// fetchSnagsForSubsection
// ─────────────────────────────────────────────────────────────────────

/**
 * Return all snags for a subsection, newest first. Throws on RPC error.
 */
export async function fetchSnagsForSubsection(
  supabase: SupabaseClient,
  subsectionId: string,
): Promise<unknown[]> {
  const { data, error } = await supabase
    .from('snags')
    .select('*')
    .eq('subsection_id', subsectionId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ─────────────────────────────────────────────────────────────────────
// createSnag
// ─────────────────────────────────────────────────────────────────────

/**
 * Insert a new snag. `createdBy` comes from the calling component's
 * auth context (the view fetches `supabase.auth.getUser()` once).
 *
 * String → number/null coalescing for `estimated_cost` lives here so
 * it can't drift across call sites.
 */
export async function createSnag(
  supabase: SupabaseClient,
  args: {
    subsectionId: string
    input: NewSnagInput
    createdBy: string | undefined
  },
): Promise<void> {
  const payload = {
    subsection_id: args.subsectionId,
    title: args.input.title,
    description: args.input.description,
    notes: args.input.notes,
    photos: args.input.photos,
    risk_level: args.input.risk_level || null,
    estimated_cost: args.input.estimated_cost
      ? parseFloat(args.input.estimated_cost)
      : null,
    status: 'Open',
    created_by: args.createdBy,
  }

  const { error } = await supabase.from('snags').insert(payload)
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────
// updateSnag
// ─────────────────────────────────────────────────────────────────────

/**
 * Update an existing snag from the edit-form payload. Empty
 * description/notes/risk_level/cost go to NULL (not empty strings)
 * so downstream queries can rely on consistent NULL semantics.
 *
 * Photos: empty array → NULL (matches existing view behavior — keeps
 * the column tidy when all photos are removed).
 */
export async function updateSnag(
  supabase: SupabaseClient,
  editing: EditingSnagInput,
): Promise<void> {
  const update = {
    title: editing.title,
    description: editing.description || null,
    notes: editing.notes || null,
    photos: editing.photos.length > 0 ? editing.photos : null,
    risk_level: editing.risk_level || null,
    estimated_cost: editing.estimated_cost
      ? parseFloat(editing.estimated_cost)
      : null,
  }

  const { error } = await supabase
    .from('snags')
    .update(update)
    .eq('id', editing.id)

  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────────
// toggleSnagStatus
// ─────────────────────────────────────────────────────────────────────

/**
 * Flip a snag between Open and Closed. Returns the new status so the
 * caller can show a tailored toast.
 */
export function nextSnagStatus(current: SnagStatus): 'Open' | 'Closed' {
  return current === 'Open' ? 'Closed' : 'Open'
}

export async function toggleSnagStatus(
  supabase: SupabaseClient,
  snagId: string,
  currentStatus: SnagStatus,
): Promise<'Open' | 'Closed'> {
  const newStatus = nextSnagStatus(currentStatus)
  const { error } = await supabase
    .from('snags')
    .update({ status: newStatus })
    .eq('id', snagId)
  if (error) throw error
  return newStatus
}

// ─────────────────────────────────────────────────────────────────────
// deleteSnag
// ─────────────────────────────────────────────────────────────────────

export async function deleteSnag(
  supabase: SupabaseClient,
  snagId: string,
): Promise<void> {
  const { error } = await supabase.from('snags').delete().eq('id', snagId)
  if (error) throw error
}
