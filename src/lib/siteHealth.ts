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

// `snags.status`, `inspections.status` and `subsections.metering_status` are free-text columns
// (no DB enum/check constraint) and carry mixed casing plus sign-off variants in prod
// (e.g. inspection 'Approved', metering 'Active'). Every status comparison normalizes
// (trim + lowercase) so a real, completed record is never silently scored as outstanding.
// The canonical sets are written in display casing for readability.
const normalizeStatus = (s?: string | null): string => (s ?? '').trim().toLowerCase();
const matches = (value: string | null | undefined, set: readonly string[]): boolean =>
  !!normalizeStatus(value) && set.some(v => normalizeStatus(v) === normalizeStatus(value));

export const METERED_STATUSES = ['Installed', 'Active', 'Verified'];
export const RESOLVED_SNAG_STATUSES = ['Rectified', 'Closed'];
export const BLOCKING_RISK_LEVELS = ['Critical', 'High'];
export const COMPLETED_INSPECTION_STATUSES = ['Complete', 'Completed', 'Closed', 'Done', 'Approved', 'Signed Off'];

export function isMetered(s: SubsectionForHealth): boolean {
  return matches(s.metering_status, METERED_STATUSES) || !!s.meter_serial_number;
}
export function isSnagResolved(snag: SnagForHealth): boolean {
  return matches(snag.status, RESOLVED_SNAG_STATUSES);
}
export function isInspectionCompleted(i: InspectionForHealth): boolean {
  return matches(i.status, COMPLETED_INSPECTION_STATUSES);
}
function isBlockingOpenSnag(snag: SnagForHealth): boolean {
  return normalizeStatus(snag.status) === 'open' && matches(snag.risk_level, BLOCKING_RISK_LEVELS);
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
  const inspections_ = total === 0 ? 100 : Math.round((subsections.filter(s => inspectedIds.has(s.id)).length / total) * 100);
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
    const inspected = inspectedIds.has(s.id);
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

export type HealthBand = 'success' | 'warning' | 'danger';
export interface SiteGrade {
  gradable: boolean;
  score: number | null;
  band: HealthBand | 'ungraded';
}

/**
 * Whether a site has enough real compliance activity for an overall grade to be meaningful.
 * Guards the "absence of data reads as a clean grade" failure: a site with no subsections, or
 * one where no metering and no inspection work has started, is NOT graded — its empty factors
 * would otherwise inflate the score (e.g. "no snags" => snag factor 100, a free 40%).
 * Component factors are still computed and shown; only the overall grade is gated.
 *
 * This is the single onboarding threshold for the whole app — tune it here.
 */
export function isGradable(
  subsections: SubsectionForHealth[],
  _snags: SnagForHealth[],
  inspections: InspectionForHealth[],
): boolean {
  if (subsections.length === 0) return false;
  const anyMetered = subsections.some(isMetered);
  const inspectedIds = new Set(
    inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  return anyMetered || inspectedIds.size > 0;
}

/**
 * The overall site grade, gated by data sufficiency. When the site is not yet gradable the score
 * is null and the band is 'ungraded', so callers render an honest "onboarding / not graded" state
 * instead of a green success badge on an un-worked site. When gradable it is the weighted
 * siteHealthScore over the same factors used everywhere else.
 */
export function siteGrade(
  subsections: SubsectionForHealth[],
  snags: SnagForHealth[],
  inspections: InspectionForHealth[],
  weights: HealthWeights = DEFAULT_WEIGHTS,
): SiteGrade {
  if (!isGradable(subsections, snags, inspections)) {
    return { gradable: false, score: null, band: 'ungraded' };
  }
  const score = siteHealthScore(factorScores(subsections, snags, inspections), weights);
  return { gradable: true, score, band: getHealthBand(score) };
}
