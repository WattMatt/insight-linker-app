import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server contract: see Supabase project oltzgidkjxwsukvkomof.
 *
 * View `public.my_unresolved_orphans` (security_invoker, scoped to
 * `inspector_id = auth.uid()`):
 *   inspection_id, inspection_title, inspection_status, created_at,
 *   site_id, site_name,
 *   shop_name_orphan, shop_number_orphan,
 *   candidate_subsections: [{id, name}] for the inspection's site,
 *   best_guess: {id, name, similarity} or null (pg_trgm)
 *
 * RPCs (both SECURITY DEFINER, authenticated):
 *   - resolve_my_orphan(p_inspection_id uuid, p_subsection_id uuid)
 *   - archive_my_orphan(p_inspection_id uuid, p_reason text)
 *
 * See docs/integrity-audit/force-at-login-resolution.md.
 */

export interface OrphanCandidate {
  id: string;
  name: string;
}

export interface OrphanBestGuess {
  id: string;
  name: string;
  similarity: number;
}

export interface OrphanRow {
  inspection_id: string;
  inspection_title: string | null;
  inspection_status: string | null;
  created_at: string;
  site_id: string | null;
  site_name: string | null;
  shop_name_orphan: string | null;
  shop_number_orphan: string | null;
  candidate_subsections: OrphanCandidate[] | null;
  best_guess: OrphanBestGuess | null;
}

// The view + RPCs are recently deployed and not yet in the generated
// `Database` type. `supabase gen types typescript` against the project
// will pick them up; until then, narrow to `unknown` and cast in this
// hook only.
//
// NOTE on the casts below: every cast is scoped to a single .from() or
// .rpc() call, and the runtime contract is enforced server-side by the
// RPC SECURITY DEFINER guards — so a client mistake can't corrupt data.
type SupabaseUntyped = {
  from: (table: string) => {
    select: (cols: string) => Promise<{ data: unknown; error: Error | null }>;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
};

const ut = supabase as unknown as SupabaseUntyped;

export const ORPHANS_QUERY_KEY = ["unresolved-orphans"] as const;

export function useUnresolvedOrphans() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ORPHANS_QUERY_KEY,
    queryFn: async (): Promise<OrphanRow[]> => {
      const { data, error } = await ut
        .from("my_unresolved_orphans")
        .select("*");
      if (error) throw error;
      return (data ?? []) as OrphanRow[];
    },
    // Re-check every time the user lands on a protected route. View is
    // small (per-user) and cheap, so we don't aggressively cache.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({
      inspection_id,
      subsection_id,
    }: {
      inspection_id: string;
      subsection_id: string;
    }) => {
      const { error } = await ut.rpc("resolve_my_orphan", {
        p_inspection_id: inspection_id,
        p_subsection_id: subsection_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORPHANS_QUERY_KEY });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({
      inspection_id,
      reason,
    }: {
      inspection_id: string;
      reason: string | null;
    }) => {
      const { error } = await ut.rpc("archive_my_orphan", {
        p_inspection_id: inspection_id,
        p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORPHANS_QUERY_KEY });
    },
  });

  return {
    rows: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    resolve: resolveMutation.mutateAsync,
    archive: archiveMutation.mutateAsync,
    isMutating: resolveMutation.isPending || archiveMutation.isPending,
  };
}
