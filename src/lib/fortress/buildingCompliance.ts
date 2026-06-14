// Pure OHS building-compliance rollup for the Fortress dashboard (S2-1). Per D7 this is the
// single source of truth for the building-compliance % — screen and PDF both import it.
// Weighted: compliance % = Σ(weight for 'Y') / Σ(weight for applicable 'Y'|'N') × 100.
// 'N/A' and uncaptured (null) answers are excluded from the denominator. See
// buildingCompliance.test.ts.

import type { OhsComplianceItem } from "./types";

export const DEFAULT_OHS_WEIGHT = 1; // tunable: weight used when an item has no explicit weight

export interface BuildingComplianceSummary {
  compliantWeight: number; // Σ weight where answer = 'Y'
  applicableWeight: number; // Σ weight where answer ∈ {'Y','N'}
  compliancePct: number; // compliantWeight / applicableWeight × 100 (100 when none applicable)
  applicableCount: number; // count of 'Y'|'N' items
  naCount: number; // count of 'N/A' items
}

const weightOf = (item: OhsComplianceItem): number =>
  typeof item.weight === "number" && !Number.isNaN(item.weight) ? item.weight : DEFAULT_OHS_WEIGHT;

export function buildingCompliance(items: OhsComplianceItem[]): BuildingComplianceSummary {
  let compliantWeight = 0;
  let applicableWeight = 0;
  let applicableCount = 0;
  let naCount = 0;

  for (const item of items) {
    if (item.answer === "N/A") {
      naCount++;
      continue;
    }
    if (item.answer !== "Y" && item.answer !== "N") continue; // skip uncaptured (null) answers
    const w = weightOf(item);
    applicableWeight += w;
    applicableCount++;
    if (item.answer === "Y") compliantWeight += w;
  }

  const compliancePct = applicableWeight === 0 ? 100 : Math.round((compliantWeight / applicableWeight) * 100);
  return { compliantWeight, applicableWeight, compliancePct, applicableCount, naCount };
}

/** Per-section rollup for the OHS drill-down (S2-2). Items with no section group under "Uncategorised". */
export function complianceBySection(items: OhsComplianceItem[]): Record<string, BuildingComplianceSummary> {
  const groups = new Map<string, OhsComplianceItem[]>();
  for (const item of items) {
    const key = item.section || "Uncategorised";
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  const out: Record<string, BuildingComplianceSummary> = {};
  for (const [section, sectionItems] of groups) {
    out[section] = buildingCompliance(sectionItems);
  }
  return out;
}
