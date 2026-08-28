/**
 * Site Health & Marking — single source of truth.
 *
 * Operational health is built from metering + snags + inspections ONLY.
 * COC certification is tracked separately (see complianceCalculations.ts) and is
 * NOT part of this score. Pure functions, no I/O — see siteHealth.test.ts.
 */
import { inspectionHasImages } from './inspectionImages';

export interface SubsectionForHealth {
  id: string;
  metering_status?: string | null;
  meter_serial_number?: string | null;
  is_inspection_required?: boolean | null;
}
export interface SnagForHealth {
  subsection_id: string;
  status?: string | null;
  risk_level?: string | null;
}
export interface InspectionForHealth {
  subsection_id?: string | null;
  status?: string | null;
  json_data?: unknown;
}
export interface FactorScores { metering: number; snags: number; inspections: number; }
export interface HealthWeights { snags: number; inspections: number; metering: number; }
export interface ReadinessResult {
  ready: number;
  total: number;
  failing: { metering: number; snags: number; inspection: number };
}

export const DEFAULT_WEIGHTS: HealthWeights = { snags: 0.40, inspections: 0.35, metering: 0.25 };
export const RESOLVED_SNAG_STATUSES = ['Rectified', 'Closed'];
export const BLOCKING_RISK_LEVELS = ['Critical', 'High'];

export function isMetered(s: SubsectionForHealth): boolean {
  return s.metering_status === 'Installed' || !!s.meter_serial_number;
}
export function isSnagResolved(snag: SnagForHealth): boolean {
  // Case-insensitive: prod data carries mixed casing (e.g. lowercase "rectified"),
  // which an exact match would drop — undercounting resolved snags in the health score.
  const s = (snag.status || "").toLowerCase();
  return RESOLVED_SNAG_STATUSES.some(r => r.toLowerCase() === s);
}
// Existence-based model: inspection status markers were removed, so any non-deleted
// inspection counts toward health/compliance simply by existing. (Kept this name so the
// call sites — filters and incomplete-checks — read unchanged; it now means "counts".)
export function isInspectionCompleted(i: InspectionForHealth): boolean {
  return !!i;
}
function isBlockingOpenSnag(snag: SnagForHealth): boolean {
  return snag.status === 'Open' && !!snag.risk_level && BLOCKING_RISK_LEVELS.includes(snag.risk_level);
}

export function factorScores(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): FactorScores {
  const total = subsections.length;
  // An UNPOPULATED site scores 0 across the board: the score measures progress toward a
  // fully captured, compliant site, and nothing has been captured yet. (Empty sites once
  // scored vacuously-100 here — 40 of 76 production sites read as perfect with no data.)
  if (total === 0) return { metering: 0, snags: 0, inspections: 0 };
  const metering = Math.round((subsections.filter(isMetered).length / total) * 100);
  const snagScore = snags.length === 0 ? 100 : Math.round((snags.filter(isSnagResolved).length / snags.length) * 100);
  const inspectedIds = new Set(
    inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  // Inspection-not-applicable subsections are waived: neither inspected nor missing.
  const inspectionReq = subsections.filter(s => s.is_inspection_required !== false);
  const inspections_ = inspectionReq.length === 0 ? 100
    : Math.round((inspectionReq.filter(s => inspectedIds.has(s.id)).length / inspectionReq.length) * 100);
  return { metering, snags: snagScore, inspections: inspections_ };
}

export function siteHealthScore(factors: FactorScores, weights: HealthWeights = DEFAULT_WEIGHTS): number {
  return Math.round(
    weights.snags * factors.snags + weights.inspections * factors.inspections + weights.metering * factors.metering,
  );
}

export interface SiteHealthResult { score: number; factors: FactorScores; }

/**
 * Canonical entry point for a site's overall health.
 *
 * A site with ZERO subsections scores 0% — the score measures progress toward a fully
 * captured, compliant site, so "nothing captured yet" is zero progress by definition
 * (product decision 2026-07-08). It must never read as 100. Factor-level empty scopes
 * inside a POPULATED site remain vacuously 100 (no snags genuinely is good).
 */
export function computeSiteHealth(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): SiteHealthResult {
  const factors = factorScores(subsections, snags, inspections);
  return { score: siteHealthScore(factors), factors };
}

export interface SubsectionReadinessRow {
  id: string;
  metered: boolean;
  /** Has an open Critical/High snag — blocks handover readiness. */
  blocked: boolean;
  /** Waived subsections (is_inspection_required === false) count as inspected. */
  inspected: boolean;
  /** ALL unresolved snags, any risk level — these hold the health score down even when not blocking. */
  openSnags: number;
  ready: boolean;
}

export function subsectionReadiness(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): SubsectionReadinessRow[] {
  const blockedIds = new Set(snags.filter(isBlockingOpenSnag).map(s => s.subsection_id));
  const openCounts = new Map<string, number>();
  for (const snag of snags) {
    if (!isSnagResolved(snag)) openCounts.set(snag.subsection_id, (openCounts.get(snag.subsection_id) ?? 0) + 1);
  }
  const inspectedIds = new Set(
    inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  return subsections.map(s => {
    const metered = isMetered(s);
    const blocked = blockedIds.has(s.id);
    const inspected = s.is_inspection_required === false || inspectedIds.has(s.id);
    return {
      id: s.id, metered, blocked, inspected,
      openSnags: openCounts.get(s.id) ?? 0,
      ready: metered && !blocked && inspected,
    };
  });
}

export function readiness(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): ReadinessResult {
  const rows = subsectionReadiness(subsections, snags, inspections);
  let ready = 0, failMeter = 0, failSnag = 0, failInsp = 0;
  for (const r of rows) {
    if (!r.metered) failMeter++;
    if (r.blocked) failSnag++;
    if (!r.inspected) failInsp++;
    if (r.ready) ready++;
  }
  return { ready, total: rows.length, failing: { metering: failMeter, snags: failSnag, inspection: failInsp } };
}

export interface FactorBreakdown {
  key: 'snags' | 'inspections' | 'metering';
  label: string;
  /** What done/total count: resolved snags, inspected required subsections, metered subsections. */
  done: number;
  total: number;
  factor: number;      // 0–100, exactly as factorScores computes it
  weight: number;      // 0–1
  points: number;      // weight × factor — unrounded so the rows reconcile with the headline score
  maxPoints: number;   // integral share of 100 this factor can contribute
}

/**
 * The health score decomposed into its three weighted factors, with the raw counts
 * behind each — so the UI can show WHAT the % is made of and what closes the gap.
 */
export function healthBreakdown(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
  weights: HealthWeights = DEFAULT_WEIGHTS,
): FactorBreakdown[] {
  const factors = factorScores(subsections, snags, inspections);
  const inspectionReq = subsections.filter(s => s.is_inspection_required !== false);
  const inspectedIds = new Set(
    inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  const row = (key: FactorBreakdown['key'], label: string, done: number, total: number, factor: number, weight: number): FactorBreakdown =>
    ({ key, label, done, total, factor, weight, points: weight * factor, maxPoints: Math.round(weight * 100) });
  return [
    row('snags', 'Snags resolved', snags.filter(isSnagResolved).length, snags.length, factors.snags, weights.snags),
    row('inspections', 'Inspections with photos', inspectionReq.filter(s => inspectedIds.has(s.id)).length, inspectionReq.length, factors.inspections, weights.inspections),
    row('metering', 'Subsections metered', subsections.filter(isMetered).length, subsections.length, factors.metering, weights.metering),
  ];
}

export function getHealthBand(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}
