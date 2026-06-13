/**
 * Per-site deliverables read-model — single source of truth for "completed vs outstanding".
 *
 * Phase 1: derives all 8 deliverable statuses from already-loaded data (no schema change).
 * The fragile parts — document-category text matching and the canonical 8-item list — live
 * ONLY here, so Phase 2 can add explicit status overrides behind the same interface.
 * Pure functions, no I/O. See siteDeliverables.test.ts.
 */
import {
  isMetered, isSnagResolved, isInspectionCompleted, getHealthBand,
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
