/**
 * Site Health & Marking — single source of truth.
 *
 * Operational health is built from metering + snags + inspections ONLY.
 * COC certification is tracked separately (see complianceCalculations.ts) and is
 * NOT part of this score. Pure functions, no I/O — see siteHealth.test.ts.
 */

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
  const metering = total === 0 ? 100 : Math.round((subsections.filter(isMetered).length / total) * 100);
  const snagScore = snags.length === 0 ? 100 : Math.round((snags.filter(isSnagResolved).length / snags.length) * 100);
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
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

export function readiness(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): ReadinessResult {
  const blockedIds = new Set(snags.filter(isBlockingOpenSnag).map(s => s.subsection_id));
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  let ready = 0, failMeter = 0, failSnag = 0, failInsp = 0;
  for (const s of subsections) {
    const metered = isMetered(s);
    const blocked = blockedIds.has(s.id);
    // Waived subsections (is_inspection_required === false) are treated as inspection-satisfied.
    const inspected = s.is_inspection_required === false || inspectedIds.has(s.id);
    if (!metered) failMeter++;
    if (blocked) failSnag++;
    if (!inspected) failInsp++;
    if (metered && !blocked && inspected) ready++;
  }
  return { ready, total: subsections.length, failing: { metering: failMeter, snags: failSnag, inspection: failInsp } };
}

export function getHealthBand(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}
