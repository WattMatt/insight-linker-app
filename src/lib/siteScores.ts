/**
 * Latest-known site health score per site — powers the portal site cards.
 *
 * Source order per site:
 *  1. `site_health_snapshots` (nightly capture job) — the fast path. The capture job
 *     computes its numbers with siteHealth.ts, so a snapshot IS the canonical score.
 *  2. Live compute through the same canonical functions for sites with no snapshot yet
 *     (e.g. a site created after the last 2AM capture).
 * Both paths run the identical formula (siteHealthScore ∘ factorScores); the only
 * difference is freshness, which callers can surface via `capturedAt`/`source`.
 * Pure functions, no I/O — see siteScores.test.ts. Fetching lives in useSiteScores.
 */
import {
  factorScores,
  siteHealthScore,
  type SubsectionForHealth,
  type SnagForHealth,
  type InspectionForHealth,
} from "./siteHealth";

export interface SiteScore {
  siteId: string;
  healthScore: number;
  /** Snapshot date (yyyy-mm-dd); null when the score was computed live just now. */
  capturedAt: string | null;
  source: "snapshot" | "live";
}

export interface SnapshotScoreRow {
  site_id: string;
  health_score: number | null;
  captured_at: string;
}

export interface LiveScoreInputs {
  /** Site ids the live rows below are known to cover — a covered site with zero rows
   * legitimately scores 100 (empty-scope convention), which is why coverage must be
   * declared rather than inferred from the rows. */
  coveredSiteIds: Iterable<string>;
  subsections: Array<SubsectionForHealth & { site_id: string }>;
  snags: SnagForHealth[];
  inspections: Array<InspectionForHealth & { site_id?: string | null }>;
}

/** Reduce snapshot rows (any order, any date range) to the latest scored row per site. */
export function latestSnapshotPerSite(rows: SnapshotScoreRow[]): Map<string, SnapshotScoreRow> {
  const latest = new Map<string, SnapshotScoreRow>();
  for (const row of rows) {
    if (row.health_score === null) continue;
    const current = latest.get(row.site_id);
    if (!current || row.captured_at > current.captured_at) latest.set(row.site_id, row);
  }
  return latest;
}

export function buildSiteScoreMap(
  siteIds: string[],
  snapshotRows: SnapshotScoreRow[],
  live: LiveScoreInputs,
): Map<string, SiteScore> {
  const latest = latestSnapshotPerSite(snapshotRows);

  const covered = new Set(live.coveredSiteIds);
  const subsBySite = new Map<string, SubsectionForHealth[]>();
  const subToSite = new Map<string, string>();
  for (const sub of live.subsections) {
    subToSite.set(sub.id, sub.site_id);
    const list = subsBySite.get(sub.site_id);
    if (list) list.push(sub);
    else subsBySite.set(sub.site_id, [sub]);
  }
  const snagsBySite = new Map<string, SnagForHealth[]>();
  for (const snag of live.snags) {
    const siteId = subToSite.get(snag.subsection_id);
    if (!siteId) continue;
    const list = snagsBySite.get(siteId);
    if (list) list.push(snag);
    else snagsBySite.set(siteId, [snag]);
  }
  const inspBySite = new Map<string, InspectionForHealth[]>();
  for (const insp of live.inspections) {
    const siteId = insp.site_id ?? (insp.subsection_id ? subToSite.get(insp.subsection_id) : undefined);
    if (!siteId) continue;
    const list = inspBySite.get(siteId);
    if (list) list.push(insp);
    else inspBySite.set(siteId, [insp]);
  }

  const scores = new Map<string, SiteScore>();
  for (const siteId of siteIds) {
    const snapshot = latest.get(siteId);
    if (snapshot) {
      scores.set(siteId, {
        siteId,
        healthScore: snapshot.health_score!,
        capturedAt: snapshot.captured_at,
        source: "snapshot",
      });
      continue;
    }
    if (!covered.has(siteId)) continue; // no data either way — caller renders a pending state
    scores.set(siteId, {
      siteId,
      healthScore: siteHealthScore(
        factorScores(
          subsBySite.get(siteId) ?? [],
          snagsBySite.get(siteId) ?? [],
          inspBySite.get(siteId) ?? [],
        ),
      ),
      capturedAt: null,
      source: "live",
    });
  }
  return scores;
}
