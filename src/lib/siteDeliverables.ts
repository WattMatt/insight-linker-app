/**
 * Per-site deliverables read-model — single source of truth for "completed vs outstanding".
 *
 * Phase 1: derives all 8 deliverable statuses from already-loaded data (no schema change).
 * The fragile parts — document-category text matching and the canonical 8-item list — live
 * ONLY here, so Phase 2 can add explicit status overrides behind the same interface.
 * Pure functions, no I/O. See siteDeliverables.test.ts.
 */
import {
  isMetered, isSnagResolved, isInspectionCompleted, getHealthBand, BLOCKING_RISK_LEVELS,
  type SubsectionForHealth, type SnagForHealth, type InspectionForHealth,
} from './siteHealth';
import { isSubsectionCocCompliant, type SubsectionForCompliance } from './complianceCalculations';

export type DeliverableKey =
  | 'snags' | 'inspections' | 'metering' | 'coc'
  | 'schematic' | 'asset_register' | 'thermal' | 'summary_report';

export type DeliverableStatus = 'complete' | 'outstanding' | 'not_required';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface SubsectionForDeliverables extends SubsectionForHealth, SubsectionForCompliance {
  id: string;
  name?: string | null;
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
export const THERMAL_CATEGORY_PATTERNS: readonly RegExp[] = [/thermal/i, /infrared/i, /thermograph/i];
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
  thermal: 'Upload infrared/thermal docs',
  summary_report: 'Generate site summary report',
};

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

function buildCoc(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const required = input.subsections.filter(s => s.is_coc_required === true);
  const compliant = required.filter(isSubsectionCocCompliant).length;
  const outstanding = required.filter(s => !isSubsectionCocCompliant(s));
  const items: OutstandingItem[] = outstanding.map(s => ({
    id: `coc-${s.id}`, category: 'coc',
    label: `COC outstanding: ${subName.get(s.id) ?? 'Subsection'}`,
    severity: 'high', blocking: true,
    subsectionId: s.id, subsectionName: subName.get(s.id),
  }));
  const total = required.length;
  return {
    key: 'coc', label: DELIVERABLE_LABELS.coc, kind: 'count',
    done: compliant, total,
    status: total === 0 ? 'not_required' : compliant === total ? 'complete' : 'outstanding',
    blocking: items.length > 0,
    outstandingItems: items,
  };
}

function buildInspections(input: SiteDeliverablesInput, subName: Map<string, string>): DeliverableResult {
  const inspected = new Set(
    input.inspections.filter(isInspectionCompleted).map(i => i.subsection_id).filter(Boolean) as string[],
  );
  const total = input.subsections.length;
  const done = input.subsections.filter(s => inspected.has(s.id)).length;
  const items: OutstandingItem[] = input.subsections
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
    status: total === 0 || done === total ? 'complete' : 'outstanding',
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
    buildBinary('thermal', categoryMatches(input.documentCategories, THERMAL_CATEGORY_PATTERNS)),
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
