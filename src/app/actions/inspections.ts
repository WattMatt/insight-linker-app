'use server'

/**
 * Server Actions for the `inspections` table.
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 3 — adds the server-side
 * validation tier the web app has been missing. Today inspections
 * are created/updated by client-side `supabase.from('inspections')...`
 * calls. RLS gates row visibility but cannot enforce things like:
 *
 *   - inspector_id must equal the calling user (Stage 1 finding (f)
 *     showed inspector_id was NULL on all 1,109 production rows
 *     because the iOS DTO never pushed it; web side just doesn't set it).
 *   - Template must exist and be active.
 *   - Site must exist and the user must have access.
 *
 * This module hosts those rules. The corresponding iOS-side checks
 * live in `Inspection.bind(subsection:)` and
 * `InspectionCompletionValidator` (ECompliance ARCHITECTURE_AUDIT.md
 * Strategies 2 + Stage 4c-4).
 */

import { createServerClient } from '@/integrations/supabase/server'
import {
  createSiteInspectionSchema,
  buildSiteInspectionInsertRow,
  type CreateSiteInspectionInput,
} from './inspections.schema'

// ─────────────────────────────────────────────────────────────────────
// createSiteInspection
// ─────────────────────────────────────────────────────────────────────

export type { CreateSiteInspectionInput }

export type CreateSiteInspectionResult =
  | { ok: true; inspectionId: string }
  | { ok: false; error: string }

/**
 * Create a site-level inspection (no specific subsection — used by the
 * "site-wide inspection" flow in SiteDetail.tsx).
 *
 * Server-side guards (none of which RLS alone can enforce):
 *   - Caller must be authenticated.
 *   - Input must parse the Zod schema (UUIDs, ISO date, sane lengths).
 *   - Template must exist.
 *   - Site must exist.
 *   - inspector_id is set from the auth session (NOT from client input).
 *     This closes finding (f) on the web side.
 */
export async function createSiteInspection(
  rawInput: unknown,
): Promise<CreateSiteInspectionResult> {
  const parse = createSiteInspectionSchema.safeParse(rawInput)
  if (!parse.success) {
    return { ok: false, error: parse.error.issues[0]?.message ?? 'Invalid input' }
  }
  const input = parse.data

  const supabase = await createServerClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: 'Not authenticated' }
  }

  // Validate template exists.
  const { data: template, error: templateError } = await supabase
    .from('inspection_templates')
    .select('id, name')
    .eq('id', input.templateId)
    .maybeSingle()
  if (templateError) return { ok: false, error: templateError.message }
  if (!template) return { ok: false, error: 'Template not found' }

  // Validate site exists. RLS will also gate this — but a missing site
  // surfaces here as a clean error rather than a confusing RLS denial.
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id')
    .eq('id', input.siteId)
    .maybeSingle()
  if (siteError) return { ok: false, error: siteError.message }
  if (!site) return { ok: false, error: 'Site not found or you lack access' }

  // Build the insert row via the pure helper — inspector_id sourced
  // from the auth session, NOT client input. Closes finding (f).
  const insertRow = buildSiteInspectionInsertRow({
    input,
    inspectorId: user.id,
    templateName: template.name,
  })

  // Cast scoped to this single .insert because Supabase's chained
  // generic for new columns (inspector_id is auth.users.id uuid) can
  // require a regenerate of the Database type. Strategy 4 (CI types)
  // will land that regen workflow.
  const { data: insertedRows, error: insertError } = await (
    supabase as unknown as {
      from: (t: string) => {
        insert: (row: unknown) => { select: () => { single: () => Promise<{ data: { id: string } | null; error: Error | null }> } }
      }
    }
  )
    .from('inspections')
    .insert(insertRow)
    .select()
    .single()

  if (insertError) return { ok: false, error: insertError.message }
  if (!insertedRows?.id) return { ok: false, error: 'Insert returned no row' }

  return { ok: true, inspectionId: insertedRows.id }
}
