/**
 * Data-access layer for sites — the reference implementation of the repository
 * pattern this codebase is missing (see docs/ARCHITECTURE_REVIEW_2026-07-07.md).
 *
 * Rules of the layer:
 *  - All Supabase queries for an entity live here, typed from the generated schema,
 *    so admin / client-portal / contractor / public views stop re-declaring the
 *    same select strings.
 *  - Functions are framework-free (no React) — unit-testable with a mocked client,
 *    callable from hooks, offline sync, and report generators alike.
 *  - Every list function is bounded (explicit limit) — no unbounded table fetches.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { withSignedUrls } from "@/lib/data/signedUrls";

export type SiteRow = Database["public"]["Tables"]["sites"]["Row"];
export type SiteWithClient = SiteRow & { clients: { name: string } | null };
export type ClientOption = Pick<Database["public"]["Tables"]["clients"]["Row"], "id" | "name">;

export const SITE_LIST_LIMIT = 200;

/**
 * Sites list with client names and display-ready image URLs.
 * Mirrors the query currently inlined in src/views/Sites.tsx, with two fixes:
 * signed URLs are resolved in ONE storage round trip instead of one per site,
 * and the result set is bounded.
 */
export async function fetchSites(options: { clientId?: string; limit?: number } = {}): Promise<SiteWithClient[]> {
  let query = supabase
    .from("sites")
    .select("*, clients(name)")
    .order("name", { ascending: true })
    .limit(options.limit ?? SITE_LIST_LIMIT);

  if (options.clientId) {
    query = query.eq("client_id", options.clientId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return withSignedUrls((data ?? []) as SiteWithClient[], {
    bucket: "site-images",
    getUrl: (site) => site.site_image_url,
    withUrl: (site, signedUrl) => ({ ...site, site_image_url: signedUrl }),
  });
}

/** Lightweight client options for filter dropdowns and forms. */
export async function fetchClientOptions(): Promise<ClientOption[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .order("name")
    .limit(SITE_LIST_LIMIT);
  if (error) throw error;
  return data ?? [];
}
