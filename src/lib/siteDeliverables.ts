/**
 * Per-site deliverables read-model — single source of truth for "completed vs outstanding".
 *
 * Phase 1: derives all 8 deliverable statuses from already-loaded data (no schema change).
 * The fragile parts — document-category text matching and the canonical 8-item list — live
 * ONLY here, so Phase 2 can add explicit status overrides behind the same interface.
 * Pure functions, no I/O. See siteDeliverables.test.ts.
 */
import {
  isMetered, isSnagResolved, getHealthBand, BLOCKING_RISK_LEVELS,
  type SubsectionForHealth, type SnagForHealth, type InspectionForHealth,
} from './siteHealth';
import { hasValidCocStatus, hasFailedCocStatus, type SubsectionForCompliance } from './complianceCalculations';
import { inspectionHasImages } from './inspectionImages';

export type DeliverableKey =
  | 'snags' | 'inspections' | 'metering' | 'coc'
  | 'schematic' | 'asset_register' | 'thermal' | 'summary_report';

export type DeliverableStatus = 'complete' | 'outstanding' | 'not_required';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface SubsectionForDeliverables extends SubsectionForHealth, SubsectionForCompliance {
  id: string;
  name?: string | null;
  is_thermal_required?: boolean | null;
}
export interface SnagForDeliverables extends SnagForHealth {
  id: string;
  title?: string | null;
}
export type InspectionForDeliverables = InspectionForHealth;

export interface OutstandingItem {
  id: string;
  category: DeliverableKey;
  label: string;
  // Per-item action verb override (e.g. COC: "Set COC" vs "Verify COC" vs "Review COC").
  // Falls back to the category-level verb in the UI when absent.
  actionLabel?: string;
  severity: Severity;
  blocking: boolean;
  // Populated for subsection-scoped items (snags/inspections/metering/COC). Phase 1 consumers
  // route by `category` to the relevant tab; these are reserved for Phase 2 subsection deep-linking.
  subsectionId?: string;
  subsectionName?: string;
}

export interface DeliverableResult {
  key: DeliverableKey;
  label: string;
  kind: 'count' | 'binary';
  done: number;
  total: number;
  status: DeliverableStatus;
  blocking: boolean;
  outstandingItems: OutstandingItem[];
}

export interface SiteDeliverablesInput {
  siteId: string;
  siteName: string;
  subsections: SubsectionForDeliverables[];
  snags: SnagForDeliverables[];
  inspections: InspectionForDeliverables[];
  hasSchematic: boolean;
  assetCount: number;
  documentCategories: (string | null | undefined)[];
  // Subsection IDs that have a thermal/infrared document (subsection_documents). Thermal is a
  // per-subsection deliverable — a site never holds a thermal report itself. Optional so older
  // call sites keep compiling; treated as empty when absent.
  thermalDocSubsectionIds?: string[];
}

export interface SiteDeliverablesSummary {
  siteId: string;
  siteName: string;
  deliverables: DeliverableResult[];
  completeCount: number;
  applicableCount: number;
  completionPct: number;
  outstandingCount: number;
  blockingCount: number;
  band: 'success' | 'warning' | 'danger';
  nextTasks: OutstandingItem[];
}

export interface SiteTriageRow {
  siteId: string;
  siteName: string;
  band: 'success' | 'warning' | 'danger';
  blockingCount: number;
  outstandingCount: number;
  completionPct: number;
  byCategory: Record<DeliverableKey, { done: number; total: number; status: DeliverableStatus }>;
}

export const DELIVERABLE_LABELS: Record<DeliverableKey, string> = {
  snags: 'Snags',
  coc: 'COC',
  inspections: 'Inspections',
  metering: 'Metering',
  schematic: 'Schematic',
  asset_register: 'Asset register',
  thermal: 'Infrared / thermal',
  summary_report: 'Site summary report',
};

export const DELIVERABLE_ORDER: DeliverableKey[] = [
  'snags', 'coc', 'inspections', 'metering', 'schematic', 'asset_register', 'thermal', 'summary_report',
];

// NOTE: "IR" alone is intentionally NOT matched — in SANS 10142 electrical-compliance
// "IR" means Insulation Resistance, not infrared, so a bare /\bir\b/ would false-positive.
// Phase 2 replaces this text-matching with explicit deliverable status.
export const THERMAL_CATEGORY_PATTERNS: readonly RegExp[] = [/thermal/i, /thermo/i, /infrared/i, /thermograph/i];
export const SUMMARY_CATEGORY_PATTERNS: readonly RegExp[] = [/site summary/i, /summary report/i];

export function categoryMatches(
  categories: (string | null | undefined)[],
  patterns: readonly RegExp[],
): boolean {
  return categories.some(c => !!c && patterns.some(p => p.test(c)));
}

const BINARY_ACTION_LABELS: Partial<Record<DeliverableKey, string>> = {
  schematic: 'Upload schematic',
  asset_register: 'Load asset register',
  summary_report: 'Generate site summary report',
};

/**
 * COC outstanding copy keyed off the rolled-up verdict. A failed or unverified COC is NOT the
 * same as a missing one — "Set COC" is wrong when the certificate is already there.
 */
function cocItemCopy(coc_status?: string | null): { label: string; action: string } {
  const st = (coc_status || '').toLowerCase();
  if (['fail', 'failed', 'rejected'].includes(st)) return { label: 'COC failed', action: 'Review COC' };
  if (st === 'pending') return { label: 'COC awaiting verdict', action: 'Verify COC' };
  return { label: 'COC missing', action: 'Set COC' };
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };

function severityFromRisk(risk?: string | null): Severity {
  switch ((risk || '').toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'none';
  }
}

function buildSnags(input: SiteDeliverablesInput): DeliverableResult {
  const total = input.snags.length;
  const resolved = input.snags.filter(isSnagResolved).length;
  const outstanding = input.snags.filter(s => !isSnagResolved(s));
  const items: OutstandingItem[] = outstanding.map(s => {
    const blocking = s.status === 'Open' && BLOCKING_RISK_LEVELS.includes(s.risk_level || '');
    return {
      id: s.id,
      category: 'snags',
      label: `${blocking ? 'Blocking snag' : 'Open snag'}: ${s.title || 'Untitled'}`,
      severity: severityFromRisk(s.risk_level),
      blocking,
      subsectionId: s.subsection_id,
    };
  });
  return {
    key: 'snags', label: DELIVERABLE_LABELS.snags, kind: 'count',
    done: resolved, total,
    status: total === 0 || resolved === total ? 'complete' : 'outstanding',
    blocking: items.some(i => i.blocking),
    outstandingItems: items,
  };
}

// A COC verdict is "recorded" once it is a Pass OR a Fail (incl. legacy vocab). Per Arno's
// decision (2026-06-16): assessing the COC is the checklist task — a recorded Fail clears the
// item. Actual compliance (Pass-only) still gates is_compliant + site health elsewhere, so a
// failed COC is not hidden, it just stops reading as an open to-do here.
function cocVerdictRecorded(s: SubsectionForCompliance): boolean {
  return hasValidCocStatus(s.coc_status) || hasFailedCocStatus(s.coc_status);
}

function buildCoc(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const required = input.subsections.filter(s => s.is_coc_required === true);
  const done = required.filter(cocVerdictRecorded).length;
  const outstanding = required.filter(s => !cocVerdictRecorded(s)); // Missing / Pending only
  const items: OutstandingItem[] = outstanding.map(s => {
    const copy = cocItemCopy(s.coc_status);
    const name = subName.get(s.id) ?? 'Subsection';
    return {
      id: `coc-${s.id}`, category: 'coc',
      label: `${copy.label}: ${name}`, actionLabel: copy.action,
      severity: 'high', blocking: true,
      subsectionId: s.id, subsectionName: name,
    };
  });
  const total = required.length;
  return {
    key: 'coc', label: DELIVERABLE_LABELS.coc, kind: 'count',
    done, total,
    status: total === 0 ? 'not_required' : done === total ? 'complete' : 'outstanding',
    blocking: items.length > 0,
    outstandingItems: items,
  };
}

function buildInspections(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const inspected = new Set(
    input.inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  // Inspection-not-applicable subsections (is_inspection_required === false) are waived.
  const applicable = input.subsections.filter(s => s.is_inspection_required !== false);
  const total = applicable.length;
  const done = applicable.filter(s => inspected.has(s.id)).length;
  const items: OutstandingItem[] = applicable
    .filter(s => !inspected.has(s.id))
    .map(s => ({
      id: `insp-${s.id}`, category: 'inspections',
      label: `Inspection outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
      severity: 'none', blocking: false,
      subsectionId: s.id, subsectionName: subName.get(s.id),
    }));
  return {
    key: 'inspections', label: DELIVERABLE_LABELS.inspections, kind: 'count',
    done, total,
    status: total === 0 ? 'not_required' : done === total ? 'complete' : 'outstanding',
    blocking: false, outstandingItems: items,
  };
}

function buildMetering(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const applicable = input.subsections.filter(s => s.metering_status !== 'Not Required');
  const done = applicable.filter(isMetered).length;
  const items: OutstandingItem[] = applicable
    .filter(s => !isMetered(s))
    .map(s => ({
      id: `meter-${s.id}`, category: 'metering',
      label: `Metering outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
      severity: 'none', blocking: false,
      subsectionId: s.id, subsectionName: subName.get(s.id),
    }));
  const total = applicable.length;
  return {
    key: 'metering', label: DELIVERABLE_LABELS.metering, kind: 'count',
    done, total,
    status: total === 0 ? 'not_required' : done === total ? 'complete' : 'outstanding',
    blocking: false, outstandingItems: items,
  };
}

function buildThermal(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  // Per-subsection, required only where flagged (is_thermal_required). A site itself never has a
  // thermal report; reports live in subsection_documents under a thermal/infrared category.
  const required = input.subsections.filter(s => s.is_thermal_required === true);
  const have = new Set(input.thermalDocSubsectionIds ?? []);
  const done = required.filter(s => have.has(s.id)).length;
  const items: OutstandingItem[] = required
    .filter(s => !have.has(s.id))
    .map(s => ({
      id: `thermal-${s.id}`, category: 'thermal',
      label: `Thermal/IR report outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
      severity: 'none', blocking: false,
      subsectionId: s.id, subsectionName: subName.get(s.id),
    }));
  const total = required.length;
  return {
    key: 'thermal', label: DELIVERABLE_LABELS.thermal, kind: 'count',
    done, total,
    status: total === 0 ? 'not_required' : done === total ? 'complete' : 'outstanding',
    blocking: false, outstandingItems: items,
  };
}

function buildBinary(key: DeliverableKey, done: boolean): DeliverableResult {
  return {
    key, label: DELIVERABLE_LABELS[key], kind: 'binary',
    done: done ? 1 : 0, total: 1,
    status: done ? 'complete' : 'outstanding',
    blocking: false,
    outstandingItems: done ? [] : [{
      id: `binary-${key}`, category: key, label: BINARY_ACTION_LABELS[key] ?? key,
      severity: 'none', blocking: false,
    }],
  };
}

function compareItems(a: OutstandingItem, b: OutstandingItem): number {
  if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
  if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  }
  return DELIVERABLE_ORDER.indexOf(a.category) - DELIVERABLE_ORDER.indexOf(b.category);
}

export function computeSiteDeliverables(input: SiteDeliverablesInput): SiteDeliverablesSummary {
  const subName = new Map(input.subsections.map(s => [s.id, s.name || 'Subsection']));
  const deliverables: DeliverableResult[] = [
    buildSnags(input),
    buildCoc(input, subName),
    buildInspections(input, subName),
    buildMetering(input, subName),
    buildBinary('schematic', input.hasSchematic),
    buildBinary('asset_register', input.assetCount > 0),
    buildThermal(input, subName),
    buildBinary('summary_report', categoryMatches(input.documentCategories, SUMMARY_CATEGORY_PATTERNS)),
  ];
  const applicable = deliverables.filter(d => d.status !== 'not_required');
  const completeCount = applicable.filter(d => d.status === 'complete').length;
  const applicableCount = applicable.length;
  const completionPct = applicableCount === 0 ? 100 : Math.round((completeCount / applicableCount) * 100);
  const allItems = deliverables.flatMap(d => d.outstandingItems);
  const nextTasks = [...allItems].sort(compareItems);
  return {
    siteId: input.siteId, siteName: input.siteName,
    deliverables, completeCount, applicableCount, completionPct,
    outstandingCount: allItems.length,
    blockingCount: allItems.filter(i => i.blocking).length,
    band: getHealthBand(completionPct),
    nextTasks,
  };
}

export function summarizeSitesForTriage(inputs: SiteDeliverablesInput[]): SiteTriageRow[] {
  const rows: SiteTriageRow[] = inputs.map(input => {
    const summary = computeSiteDeliverables(input);
    const byCategory = {} as SiteTriageRow['byCategory'];
    for (const d of summary.deliverables) {
      byCategory[d.key] = { done: d.done, total: d.total, status: d.status };
    }
    return {
      siteId: summary.siteId, siteName: summary.siteName, band: summary.band,
      blockingCount: summary.blockingCount, outstandingCount: summary.outstandingCount,
      completionPct: summary.completionPct, byCategory,
    };
  });
  return rows.sort((a, b) =>
    b.blockingCount - a.blockingCount ||
    b.outstandingCount - a.outstandingCount ||
    a.completionPct - b.completionPct,
  );
}
