/**
 * Pure data-fetching for the public-subsection page.
 *
 * Web ARCHITECTURE_AUDIT.md Strategy 2 — first RSC conversion.
 *
 * Lives in a plain `.ts` file (no React) so it can be called from:
 *
 *   - the async Server Component at `src/app/public/subsections/[id]/page.tsx`
 *     (using the cookie-bound `createServerClient`), and
 *   - any future client-side re-fetch (not currently used — the RSC seeds
 *     the view component with `initial`).
 *
 * The Supabase client is taken as a parameter (instead of imported) so
 * the function is environment-agnostic and easy to mock in tests.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────
// View-model types — kept here so the React view and the server can
// agree on shape without one importing the other.
// ─────────────────────────────────────────────────────────────────────

export interface PublicSubsectionData {
  id: string
  name: string
  tenant_name?: string
  description?: string
  category?: string
  coc_number?: string
  coc_type?: string
  coc_issue_date?: string
  is_coc_required: boolean
  coc_status?: string
  metering_status?: string
  meter_serial_number?: string
}

export interface PublicSiteData {
  id: string
  name: string
  address?: string
  client_logo_url?: string
}

export interface PublicClientData {
  id: string
  name: string
  company_name?: string
  logo_url?: string
}

export interface PublicDocumentFile {
  name: string
  url: string
  uploadedAt?: string
}

export interface PublicDocumentCategory {
  name: string
  files: PublicDocumentFile[]
}

export interface PublicSnagData {
  id: string
  title: string
  description?: string
  status: string
  risk_level?: string
  created_at: string
}

export interface PublicCompanySettings {
  company_name: string
  company_logo_url?: string
}

export interface PublicSubsectionBundle {
  subsection: PublicSubsectionData
  site: PublicSiteData
  client: PublicClientData
  documents: PublicDocumentCategory[]
  snags: PublicSnagData[]
  cocValidations: Record<string, unknown>
  companySettings: PublicCompanySettings | null
}

/**
 * Fetches everything the public subsection page needs in a single call.
 * Returns `null` when the subsection itself isn't found — RSCs can map
 * that straight to `notFound()`.
 *
 * Errors from secondary queries (snags, validations, settings) are
 * swallowed and surfaced as empty data — the page should still render
 * the subsection card. Errors from the primary subsection query bubble.
 */
export async function fetchPublicSubsectionData(
  // Loose type: caller can pass either the server or the browser client.
  // Both implement the same query DSL.
  supabase: SupabaseClient<any, 'public', any>,
  subsectionId: string,
): Promise<PublicSubsectionBundle | null> {
  // 1. Subsection + site + client (single query via PostgREST embeds).
  const { data: subsectionData, error: subsectionError } = await supabase
    .from('subsections')
    .select(
      `
        *,
        sites!inner (
          id,
          name,
          address,
          client_logo_url,
          clients!inner (
            id,
            name,
            company_name,
            logo_url
          )
        )
      `,
    )
    .eq('id', subsectionId)
    .maybeSingle()

  if (subsectionError) throw subsectionError
  if (!subsectionData) return null

  const subsection = subsectionData as PublicSubsectionData & {
    sites: PublicSiteData & { clients: PublicClientData }
  }
  const site = subsection.sites
  const client = subsection.sites.clients

  // 2-5. Run the remaining queries in parallel — they don't depend on
  // each other. If any individual one fails we render empty for that
  // section rather than failing the whole page.
  const [
    { data: categoriesData },
    { data: snagsData },
    { data: validationsData },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from('document_categories')
      .select(
        `
          id,
          name,
          order_index,
          subsection_documents (
            id,
            file_name,
            file_url,
            uploaded_at
          )
        `,
      )
      .eq('subsection_id', subsectionId)
      .order('order_index'),
    supabase
      .from('snags')
      .select('id, title, description, status, risk_level, created_at')
      .eq('subsection_id', subsectionId)
      .order('created_at', { ascending: false }),
    supabase.from('coc_validations').select('*').eq('subsection_id', subsectionId),
    supabase.from('settings').select('company_name, company_logo_url').maybeSingle(),
  ])

  // Reshape document_categories → DocumentCategory[].
  const documents: PublicDocumentCategory[] = (categoriesData ?? [])
    .filter(
      (cat: { subsection_documents?: Array<unknown> }) =>
        cat.subsection_documents && cat.subsection_documents.length > 0,
    )
    .map(
      (cat: {
        name: string
        subsection_documents: Array<{
          file_name: string
          file_url: string
          uploaded_at?: string
        }>
      }) => ({
        name: cat.name,
        files: cat.subsection_documents.map(doc => ({
          name: doc.file_name,
          url: doc.file_url,
          uploadedAt: doc.uploaded_at,
        })),
      }),
    )

  // Index COC validations by document_id for downstream consumers.
  const cocValidations: Record<string, unknown> = {}
  ;(validationsData ?? []).forEach(
    (v: { document_id: string; [k: string]: unknown }) => {
      cocValidations[v.document_id] = v
    },
  )

  return {
    subsection,
    site,
    client,
    documents,
    snags: (snagsData ?? []) as PublicSnagData[],
    cocValidations,
    companySettings: (settings ?? null) as PublicCompanySettings | null,
  }
}
