// Pure mapping from the live read-models to a site_health_snapshots row.
// Used by the daily capture job so trend numbers match the live KPI cards exactly.
import type { SiteDeliverablesSummary } from "./siteDeliverables";
import type { ReadinessResult } from "./siteHealth";

export interface SnapshotInput {
  siteId: string;
  capturedAt: string; // ISO yyyy-mm-dd
  summary: SiteDeliverablesSummary;
  readiness: ReadinessResult;
  /** 0 for an empty site (no subsections) — zero progress, never a vacuous 100. */
  healthScore: number;
  openSnags: number;
}

export interface SnapshotRow {
  site_id: string;
  captured_at: string;
  health_score: number;
  completion_pct: number;
  outstanding_count: number;
  blocking_count: number;
  open_snags: number;
  ready_count: number;
  total_subsections: number;
}

export function toSnapshotRow(i: SnapshotInput): SnapshotRow {
  return {
    site_id: i.siteId,
    captured_at: i.capturedAt,
    health_score: i.healthScore,
    completion_pct: i.summary.completionPct,
    outstanding_count: i.summary.outstandingCount,
    blocking_count: i.summary.blockingCount,
    open_snags: i.openSnags,
    ready_count: i.readiness.ready,
    total_subsections: i.readiness.total,
  };
}
