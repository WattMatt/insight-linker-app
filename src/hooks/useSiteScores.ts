import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildSiteScoreMap, isUsableSnapshotRow, type LiveScoreInputs, type SiteScore } from "@/lib/siteScores";

// Snapshots older than this are ignored; a site that stale falls back to live compute,
// so a long-dead capture job can't keep serving months-old scores as current.
const SNAPSHOT_WINDOW_DAYS = 30;

/**
 * Health scores for a set of sites, keyed by site id. Snapshot-first with a live
 * canonical fallback (see siteScores.ts). RLS scopes every query, so a client-portal
 * user can only ever resolve scores for their own sites.
 */
export function useSiteScores(siteIds: string[] | undefined) {
  const ids = [...(siteIds ?? [])].sort();

  return useQuery({
    queryKey: ["site-scores", ids],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Map<string, SiteScore>> => {
      const since = new Date(Date.now() - SNAPSHOT_WINDOW_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const { data: snapshotRows, error: snapshotError } = await supabase
        .from("site_health_snapshots")
        .select("site_id, health_score, total_subsections, captured_at")
        .in("site_id", ids)
        .gte("captured_at", since);
      if (snapshotError) throw snapshotError;

      const withSnapshot = new Set(
        (snapshotRows ?? []).filter(isUsableSnapshotRow).map(r => r.site_id),
      );
      const missing = ids.filter(id => !withSnapshot.has(id));

      let live: LiveScoreInputs = { coveredSiteIds: [], subsections: [], snags: [], inspections: [] };
      if (missing.length > 0) {
        const [subsRes, inspRes] = await Promise.all([
          supabase
            .from("subsections")
            .select("id, site_id, metering_status, meter_serial_number, is_inspection_required")
            .in("site_id", missing),
          supabase
            .from("inspections")
            .select("subsection_id, site_id, json_data")
            .in("site_id", missing),
        ]);
        if (subsRes.error) throw subsRes.error;
        if (inspRes.error) throw inspRes.error;

        const subsectionIds = (subsRes.data ?? []).map(s => s.id);
        const snagsRes = subsectionIds.length > 0
          ? await supabase
              .from("snags")
              .select("subsection_id, status, risk_level")
              .in("subsection_id", subsectionIds)
          : { data: [], error: null };
        if (snagsRes.error) throw snagsRes.error;

        live = {
          coveredSiteIds: missing,
          subsections: subsRes.data ?? [],
          snags: snagsRes.data ?? [],
          inspections: inspRes.data ?? [],
        };
      }

      return buildSiteScoreMap(ids, snapshotRows ?? [], live);
    },
  });
}
