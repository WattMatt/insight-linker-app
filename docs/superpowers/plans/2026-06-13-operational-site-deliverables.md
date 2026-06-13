# Per-Site Deliverables Tracking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface, per site, which work items are complete vs outstanding — a severity-ranked "sites needing attention" widget on the global dashboard, plus a rollup + drill-down "next tasks" panel on the per-site detail page.

**Architecture:** One pure, fully-tested read-model module (`siteDeliverables.ts`) derives all 8 deliverable statuses from already-loaded data, reusing `siteHealth.ts` and `complianceCalculations.ts`. Two presentational components consume its output. Views do the Supabase I/O and pass computed props down. No schema change (Phase 1).

**Tech Stack:** Next.js (App Router) + React + TypeScript, Supabase JS client, vitest (node env), Tailwind + shadcn/ui primitives (`Card`, `Badge`, `Progress`).

**Spec:** `docs/superpowers/specs/2026-06-13-operational-site-deliverables-design.md`

---

## File Structure

**New**
- `src/lib/siteDeliverables.ts` — pure read-model: types, derivation, prioritisation, triage ranking.
- `src/lib/siteDeliverables.test.ts` — vitest unit tests (the TDD core).
- `src/components/site/SiteReadinessPanel.tsx` — presentational per-site panel.
- `src/components/dashboard/SitesNeedingAttention.tsx` — presentational triage widget.

**Modify**
- `src/views/SiteDetail.tsx` — add `risk_level` to snag select, `status` to inspection select; fetch `site_schematics` + `site_assets` count; compute summary; render panel atop Overview tab.
- `src/views/Dashboard.tsx` — add a per-site triage loader (~7 grouped queries); render widget.

**Reuse unchanged**
- `src/lib/siteHealth.ts` (`isMetered`, `isSnagResolved`, `isInspectionCompleted`, `getHealthBand`, type interfaces).
- `src/lib/complianceCalculations.ts` (`isSubsectionCocCompliant`).

---

## Task 1: Module foundation — types, constants, matchers, helpers

**Files:**
- Create: `src/lib/siteDeliverables.ts`
- Test: `src/lib/siteDeliverables.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/siteDeliverables.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  categoryMatches, THERMAL_CATEGORY_PATTERNS, SUMMARY_CATEGORY_PATTERNS,
  DELIVERABLE_ORDER, DELIVERABLE_LABELS,
} from './siteDeliverables';

describe('document category matching', () => {
  it('matches thermal/infrared category strings (incl. legacy)', () => {
    expect(categoryMatches(['05 Thermal Reports'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Infrared scan'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Thermographic survey'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['IR report'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['01 COC', null, undefined], THERMAL_CATEGORY_PATTERNS)).toBe(false);
  });
  it('matches site summary report category strings', () => {
    expect(categoryMatches(['Site Summary Reports'], SUMMARY_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Compliance Reports'], SUMMARY_CATEGORY_PATTERNS)).toBe(false);
  });
});

describe('constants', () => {
  it('has 8 ordered deliverables with labels', () => {
    expect(DELIVERABLE_ORDER).toHaveLength(8);
    expect(Object.keys(DELIVERABLE_LABELS)).toHaveLength(8);
    expect(DELIVERABLE_ORDER[0]).toBe('snags');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: FAIL — "Cannot find module './siteDeliverables'".

- [ ] **Step 3: Write the module foundation**

Create `src/lib/siteDeliverables.ts`:

```ts
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

export const THERMAL_CATEGORY_PATTERNS = [/thermal/i, /infrared/i, /thermograph/i, /\bir\b/i];
export const SUMMARY_CATEGORY_PATTERNS = [/site summary/i, /summary report/i];

export function categoryMatches(
  categories: (string | null | undefined)[],
  patterns: RegExp[],
): boolean {
  return categories.some(c => !!c && patterns.some(p => p.test(c)));
}

const BINARY_ACTION_LABELS: Record<string, string> = {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteDeliverables.ts src/lib/siteDeliverables.test.ts
git commit -m "feat(deliverables): module foundation — types, constants, category matchers"
```

---

## Task 2: `computeSiteDeliverables` — the 8 category derivations

**Files:**
- Modify: `src/lib/siteDeliverables.ts`
- Test: `src/lib/siteDeliverables.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/siteDeliverables.test.ts`:

```ts
import { computeSiteDeliverables, type SiteDeliverablesInput } from './siteDeliverables';

const baseInput = (over: Partial<SiteDeliverablesInput> = {}): SiteDeliverablesInput => ({
  siteId: 'site-1', siteName: 'Site 1',
  subsections: [], snags: [], inspections: [],
  hasSchematic: false, assetCount: 0, documentCategories: [],
  ...over,
});
const get = (s: ReturnType<typeof computeSiteDeliverables>, key: string) =>
  s.deliverables.find(d => d.key === key)!;

describe('computeSiteDeliverables — counts', () => {
  it('snags: resolved vs open, blocking on Critical/High open', () => {
    const s = computeSiteDeliverables(baseInput({
      snags: [
        { id: 'n1', subsection_id: 'a', status: 'Open', risk_level: 'Critical', title: 'Bad' },
        { id: 'n2', subsection_id: 'a', status: 'Rectified', risk_level: 'Low', title: 'Fixed' },
        { id: 'n3', subsection_id: 'b', status: 'Open', risk_level: 'Low', title: 'Minor' },
      ],
    }));
    const d = get(s, 'snags');
    expect(d.done).toBe(1);
    expect(d.total).toBe(3);
    expect(d.status).toBe('outstanding');
    expect(d.blocking).toBe(true);
    expect(d.outstandingItems).toHaveLength(2);
  });

  it('coc: only required subsections count; not_required when none required', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', is_coc_required: true, coc_status: 'Pass' },
        { id: 'b', name: 'B', is_coc_required: true, coc_status: 'Failed' },
        { id: 'c', name: 'C', is_coc_required: false, coc_status: null },
      ],
    }));
    const d = get(s, 'coc');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.status).toBe('outstanding');
    expect(d.blocking).toBe(true);

    const none = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_coc_required: false, coc_status: null }],
    }));
    expect(get(none, 'coc').status).toBe('not_required');
  });

  it('inspections: per-subsection completion', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      inspections: [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }],
    }));
    const d = get(s, 'inspections');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.outstandingItems[0].subsectionId).toBe('b');
  });

  it('metering: excludes Not Required from total', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', metering_status: 'Installed' },
        { id: 'b', name: 'B', metering_status: 'Pending' },
        { id: 'c', name: 'C', metering_status: 'Not Required' },
      ],
    }));
    const d = get(s, 'metering');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.status).toBe('outstanding');
  });
});

describe('computeSiteDeliverables — binary docs', () => {
  it('schematic / asset / thermal / summary derive from presence', () => {
    const s = computeSiteDeliverables(baseInput({
      hasSchematic: true,
      assetCount: 3,
      documentCategories: ['05 Thermal Reports', 'Site Summary Reports'],
    }));
    expect(get(s, 'schematic').status).toBe('complete');
    expect(get(s, 'asset_register').status).toBe('complete');
    expect(get(s, 'thermal').status).toBe('complete');
    expect(get(s, 'summary_report').status).toBe('complete');

    const empty = computeSiteDeliverables(baseInput());
    expect(get(empty, 'schematic').status).toBe('outstanding');
    expect(get(empty, 'schematic').outstandingItems[0].label).toBe('Upload schematic');
  });
});

describe('computeSiteDeliverables — aggregation', () => {
  it('empty site: all binary outstanding, count categories complete/not_required, band danger', () => {
    const s = computeSiteDeliverables(baseInput());
    // snags(0/0 complete), inspections(0/0 complete), metering(not_required), coc(not_required),
    // 4 binary outstanding -> complete 2 of applicable 6 => 33%
    expect(s.completeCount).toBe(2);
    expect(s.applicableCount).toBe(6);
    expect(s.completionPct).toBe(33);
    expect(s.band).toBe('danger');
    expect(s.outstandingCount).toBe(4);
    expect(s.blockingCount).toBe(0);
  });

  it('all complete => 100% and success band', () => {
    const s = computeSiteDeliverables(baseInput({
      hasSchematic: true, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    }));
    expect(s.completionPct).toBe(100);
    expect(s.band).toBe('success');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: FAIL — "computeSiteDeliverables is not a function".

- [ ] **Step 3: Implement the builders + `computeSiteDeliverables`**

Append to `src/lib/siteDeliverables.ts`:

```ts
function buildSnags(input: SiteDeliverablesInput): DeliverableResult {
  const total = input.snags.length;
  const resolved = input.snags.filter(isSnagResolved).length;
  const outstanding = input.snags.filter(s => !isSnagResolved(s));
  const items: OutstandingItem[] = outstanding.map(s => {
    const blocking = s.status === 'Open' && ['Critical', 'High'].includes(s.risk_level || '');
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
      id: `binary-${key}`, category: key, label: BINARY_ACTION_LABELS[key],
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/siteDeliverables.ts src/lib/siteDeliverables.test.ts
git commit -m "feat(deliverables): computeSiteDeliverables — 8-category derivation + aggregation"
```

---

## Task 3: `summarizeSitesForTriage` — severity-first ranking

**Files:**
- Modify: `src/lib/siteDeliverables.ts`
- Test: `src/lib/siteDeliverables.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/siteDeliverables.test.ts`:

```ts
import { summarizeSitesForTriage } from './siteDeliverables';

describe('summarizeSitesForTriage', () => {
  it('ranks blocking first, then outstanding count, then completion asc', () => {
    const blocking = baseInput({
      siteId: 'blk', siteName: 'Blocking',
      subsections: [{ id: 'a', name: 'A', is_coc_required: true, coc_status: 'Failed' }],
    });
    const manyOutstanding = baseInput({
      siteId: 'many', siteName: 'Many',
      subsections: [
        { id: 'a', name: 'A', metering_status: 'Pending' },
        { id: 'b', name: 'B', metering_status: 'Pending' },
      ],
    });
    const clean = baseInput({
      siteId: 'clean', siteName: 'Clean',
      hasSchematic: true, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    });
    const rows = summarizeSitesForTriage([clean, manyOutstanding, blocking]);
    expect(rows.map(r => r.siteId)).toEqual(['blk', 'many', 'clean']);
    expect(rows[0].blockingCount).toBeGreaterThan(0);
    expect(rows[0].byCategory.coc.status).toBe('outstanding');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: FAIL — "summarizeSitesForTriage is not a function".

- [ ] **Step 3: Implement `summarizeSitesForTriage`**

Append to `src/lib/siteDeliverables.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/siteDeliverables.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full suite + typecheck the module**

Run: `npm test`
Expected: PASS (siteDeliverables + existing siteHealth/coc suites all green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/siteDeliverables.ts src/lib/siteDeliverables.test.ts
git commit -m "feat(deliverables): summarizeSitesForTriage severity-first ranking"
```

---

## Task 4: `SiteReadinessPanel` (presentational)

**Files:**
- Create: `src/components/site/SiteReadinessPanel.tsx`

No unit test (vitest env is `node`; no DOM test infra). Verified by typecheck in Task 5's build.

- [ ] **Step 1: Write the component**

Create `src/components/site/SiteReadinessPanel.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  type SiteDeliverablesSummary, type DeliverableResult, type OutstandingItem,
} from "@/lib/siteDeliverables";

const BAND_TEXT: Record<string, string> = {
  success: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-red-600",
};

function StatusChip({ d }: { d: DeliverableResult }) {
  const muted = d.status === "not_required";
  const complete = d.status === "complete";
  const value = d.kind === "count" ? `${d.done}/${d.total}` : complete ? "Done" : "Outstanding";
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${muted ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2 min-w-0">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : muted ? (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-amber-600 shrink-0" />
        )}
        <span className="text-sm truncate">{d.label}</span>
      </div>
      <span className="text-xs font-medium text-muted-foreground shrink-0">
        {muted ? "N/A" : value}
      </span>
    </div>
  );
}

interface Props {
  summary: SiteDeliverablesSummary;
  onSelectItem?: (item: OutstandingItem) => void;
}

export function SiteReadinessPanel({ summary, onSelectItem }: Props) {
  const [showAll, setShowAll] = useState(false);
  const tasks = showAll ? summary.nextTasks : summary.nextTasks.slice(0, 6);

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">Site Readiness</CardTitle>
          <div className="flex items-center gap-2">
            {summary.blockingCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {summary.blockingCount} blocking
              </Badge>
            )}
            <span className={`text-sm font-semibold ${BAND_TEXT[summary.band]}`}>
              {summary.completeCount} of {summary.applicableCount} complete · {summary.completionPct}%
            </span>
          </div>
        </div>
        <Progress value={summary.completionPct} className="mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {summary.deliverables.map(d => <StatusChip key={d.key} d={d} />)}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2">
            Next tasks {summary.outstandingCount > 0 && `(${summary.outstandingCount})`}
          </h4>
          {summary.outstandingCount === 0 ? (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> All deliverables complete.
            </p>
          ) : (
            <div className="space-y-1">
              {tasks.map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelectItem?.(item)}
                  className="w-full flex items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {item.blocking
                      ? <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      : <Circle className="h-4 w-4 text-amber-600 shrink-0" />}
                    <span className="truncate">{item.label}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
              {summary.nextTasks.length > 6 && (
                <button
                  onClick={() => setShowAll(v => !v)}
                  className="text-xs text-primary hover:underline px-3 py-1"
                >
                  {showAll ? "Show less" : `Show all ${summary.nextTasks.length}`}
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/site/SiteReadinessPanel.tsx
git commit -m "feat(deliverables): SiteReadinessPanel presentational component"
```

---

## Task 5: Integrate panel into `SiteDetail.tsx`

**Files:**
- Modify: `src/views/SiteDetail.tsx`

- [ ] **Step 1: Extend the snag + inspection selects and snag state type**

In `src/views/SiteDetail.tsx`, change the snags state type (line ~53) from:

```tsx
  const [snags, setSnags] = useState<{ id: string; subsection_id: string; status: string; title: string }[]>([]);
```

to:

```tsx
  const [snags, setSnags] = useState<{ id: string; subsection_id: string; status: string; title: string; risk_level: string | null }[]>([]);
```

Change the inspections select (line ~406) from:

```tsx
        .select("id, subsection_id, inspection_date, json_data")
```

to:

```tsx
        .select("id, subsection_id, inspection_date, json_data, status")
```

Change the snags select (line ~416) from:

```tsx
        .select("id, subsection_id, status, title")
```

to:

```tsx
        .select("id, subsection_id, status, title, risk_level")
```

- [ ] **Step 2: Add state + fetch for schematic presence and asset count**

Add two state hooks alongside the others (near line ~58):

```tsx
  const [hasSchematic, setHasSchematic] = useState(false);
  const [assetCount, setAssetCount] = useState(0);
```

Inside `fetchSiteData`, after `setSnags(snagsRes || []);` (line ~455), add:

```tsx
      const [schematicRes, assetCountRes] = await Promise.all([
        supabase.from("site_schematics").select("id").eq("site_id", siteId).maybeSingle(),
        supabase.from("site_assets").select("id", { count: "exact", head: true }).eq("site_id", siteId),
      ]);
      setHasSchematic(!!schematicRes.data);
      setAssetCount(assetCountRes.count || 0);
```

- [ ] **Step 3: Build the summary and a tab-routing handler**

Add imports at the top of `src/views/SiteDetail.tsx`:

```tsx
import { SiteReadinessPanel } from "@/components/site/SiteReadinessPanel";
import { computeSiteDeliverables, type OutstandingItem, type DeliverableKey } from "@/lib/siteDeliverables";
```

Just before the `return (` of the component body, add the computed summary and a handler that jumps to the relevant tab:

```tsx
  const deliverablesSummary = computeSiteDeliverables({
    siteId: siteId!,
    siteName: site?.name || "",
    subsections,
    snags,
    inspections,
    hasSchematic,
    assetCount,
    documentCategories: siteDocuments.map((d: any) => d.category),
  });

  const TAB_FOR_CATEGORY: Record<DeliverableKey, string> = {
    snags: "subsections",
    inspections: "subsections",
    metering: "subsections",
    coc: "compliance",
    schematic: "schematic",
    asset_register: "asset-verification",
    thermal: "documents",
    summary_report: "reports",
  };
  const handleSelectDeliverable = (item: OutstandingItem) => {
    setActiveTab(TAB_FOR_CATEGORY[item.category]);
  };
```

- [ ] **Step 4: Render the panel at the top of the Overview tab**

Find the Overview `TabsContent` (line ~615):

```tsx
        <TabsContent value="overview" className="space-y-6 mt-6">
```

Insert the panel as the first child inside it:

```tsx
        <TabsContent value="overview" className="space-y-6 mt-6">
          <SiteReadinessPanel summary={deliverablesSummary} onSelectItem={handleSelectDeliverable} />
```

(Leave the existing Overview content immediately after.)

- [ ] **Step 5: Verify build + typecheck**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors involving `SiteDetail`, `SiteReadinessPanel`, or `siteDeliverables`.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open an admin site detail page (`/sites/<id>` or `/clients/<clientId>/sites/<siteId>`). Confirm:
- The "Site Readiness" panel renders at the top of Overview.
- The 8 category chips show sensible done/total or Done/Outstanding/N/A.
- "Next tasks" lists outstanding items, blocking ones first with the red icon.
- Clicking a task switches to the mapped tab.

- [ ] **Step 7: Commit**

```bash
git add src/views/SiteDetail.tsx
git commit -m "feat(deliverables): render readiness panel atop SiteDetail Overview"
```

---

## Task 6: `SitesNeedingAttention` widget (presentational)

**Files:**
- Create: `src/components/dashboard/SitesNeedingAttention.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/dashboard/SitesNeedingAttention.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronRight, Building2 } from "lucide-react";
import { type SiteTriageRow } from "@/lib/siteDeliverables";

const BAND_DOT: Record<string, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
};

interface Props {
  rows: SiteTriageRow[];
  onSelectSite: (siteId: string) => void;
  limit?: number;
}

export function SitesNeedingAttention({ rows, onSelectSite, limit = 6 }: Props) {
  const shown = rows.filter(r => r.outstandingCount > 0).slice(0, limit);

  return (
    <Card className="glass-card border-none">
      <CardHeader>
        <CardTitle className="text-lg">Sites Needing Attention</CardTitle>
        <CardDescription>Ranked by blocking issues, then outstanding work</CardDescription>
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outstanding work across sites.</p>
        ) : (
          <div className="space-y-1">
            {shown.map(r => (
              <button
                key={r.siteId}
                onClick={() => onSelectSite(r.siteId)}
                className="w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${BAND_DOT[r.band]}`} />
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{r.siteName}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {r.blockingCount > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {r.blockingCount}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{r.outstandingCount} outstanding</span>
                  <span className="text-xs font-medium">{r.completionPct}%</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/SitesNeedingAttention.tsx
git commit -m "feat(deliverables): SitesNeedingAttention presentational widget"
```

---

## Task 7: Integrate widget into `Dashboard.tsx` + final verification

**Files:**
- Modify: `src/views/Dashboard.tsx`

- [ ] **Step 1: Add imports + triage state**

Add imports at the top of `src/views/Dashboard.tsx`:

```tsx
import { SitesNeedingAttention } from "@/components/dashboard/SitesNeedingAttention";
import { summarizeSitesForTriage, type SiteDeliverablesInput, type SiteTriageRow } from "@/lib/siteDeliverables";
```

Add state near the other `useState` hooks (around line ~77):

```tsx
  const [triageRows, setTriageRows] = useState<SiteTriageRow[]>([]);
  const [siteClientMap, setSiteClientMap] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Add a triage loader and call it from the data-load effect**

Add this function inside the `Dashboard` component (e.g. after `fetchDashboardData`):

```tsx
  const fetchTriageData = async () => {
    try {
      const [sitesRes, subsRes, snagsRes, inspRes, schematicsRes, assetsRes, docsRes] = await Promise.all([
        supabase.from("sites").select("id, name, client_id"),
        supabase.from("subsections").select("id, site_id, name, coc_status, is_coc_required, metering_status, meter_serial_number"),
        supabase.from("snags").select("id, subsection_id, status, risk_level, title"),
        supabase.from("inspections").select("subsection_id, status, site_id"),
        supabase.from("site_schematics").select("site_id"),
        supabase.from("site_assets").select("site_id"),
        supabase.from("site_documents").select("site_id, category"),
      ]);

      const sites = sitesRes.data || [];
      const subs = subsRes.data || [];
      const snags = snagsRes.data || [];
      const insps = inspRes.data || [];

      // Map subsection -> site for snags (snags are subsection-scoped)
      const subToSite = new Map<string, string>(subs.map((s: any) => [s.id, s.site_id]));
      const schematicSites = new Set((schematicsRes.data || []).map((r: any) => r.site_id));
      const assetSites = new Set((assetsRes.data || []).map((r: any) => r.site_id));

      const group = <T,>(rows: T[], key: (r: T) => string | undefined) => {
        const m = new Map<string, T[]>();
        for (const r of rows) {
          const k = key(r);
          if (!k) continue;
          (m.get(k) ?? m.set(k, []).get(k)!).push(r);
        }
        return m;
      };

      const subsBySite = group(subs, (s: any) => s.site_id);
      const snagsBySite = group(snags, (n: any) => subToSite.get(n.subsection_id));
      const inspBySite = group(insps, (i: any) => i.site_id);
      const docsBySite = group(docsRes.data || [], (d: any) => d.site_id);

      const inputs: SiteDeliverablesInput[] = sites.map((site: any) => ({
        siteId: site.id,
        siteName: site.name,
        subsections: subsBySite.get(site.id) || [],
        snags: snagsBySite.get(site.id) || [],
        inspections: inspBySite.get(site.id) || [],
        hasSchematic: schematicSites.has(site.id),
        assetCount: (assetSites.has(site.id) ? 1 : 0),
        documentCategories: (docsBySite.get(site.id) || []).map((d: any) => d.category),
      }));

      setSiteClientMap(Object.fromEntries(sites.map((s: any) => [s.id, s.client_id])));
      setTriageRows(summarizeSitesForTriage(inputs));
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error loading triage data:", error);
    }
  };
```

In the existing mount effect (where `fetchDashboardData()` is called, line ~82), add the call:

```tsx
    fetchDashboardData();
    fetchTriageData();
```

- [ ] **Step 3: Render the widget**

In the JSX `return`, place the widget in the dashboard layout (e.g. immediately above the existing "High-Risk Snags" / activity sections). Insert:

```tsx
      <SitesNeedingAttention
        rows={triageRows}
        onSelectSite={(siteId) => {
          const clientId = siteClientMap[siteId];
          navigate(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`);
        }}
      />
```

- [ ] **Step 4: Verify build + typecheck**

Run: `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Run lint**

Run: `npm run lint`
Expected: no new errors in `siteDeliverables.ts`, `SiteReadinessPanel.tsx`, `SitesNeedingAttention.tsx`, `Dashboard.tsx`, `SiteDetail.tsx`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (all suites).

- [ ] **Step 7: Manual verification**

Run: `npm run dev`, open the admin `/dashboard`. Confirm:
- "Sites Needing Attention" widget renders, sites with blocking issues at top (red badge), then by outstanding count.
- Clicking a site navigates to its detail page.
- Cross-check one site's widget numbers against its readiness panel — they should agree.

- [ ] **Step 8: Commit**

```bash
git add src/views/Dashboard.tsx
git commit -m "feat(deliverables): sites-needing-attention triage widget on dashboard"
```

---

## Verification summary (whole feature)

- [ ] `npm test` — all green (siteDeliverables fully unit-tested).
- [ ] `npm run build` — typechecks clean.
- [ ] `npm run lint` — no new errors.
- [ ] Manual: readiness panel on SiteDetail Overview; triage widget on Dashboard; numbers agree between the two for a spot-checked site.

## Notes for the executor

- **Severity ranking** = blocking count → outstanding count → completion % asc (see `summarizeSitesForTriage`).
- **`assetCount` on the dashboard** is intentionally coarse (presence → 1) to avoid a heavy per-site count query across all sites; the per-site panel uses an exact `head:true` count. Both only feed a binary "done/outstanding", so this is correct, not a bug.
- **Thermal/summary detection** relies on `site_documents.category` text — the deliberately-fragile part, isolated in `THERMAL_CATEGORY_PATTERNS` / `SUMMARY_CATEGORY_PATTERNS`. Phase 2 replaces this with explicit status.
- **Performance watch-item:** the dashboard triage loader runs ~7 unscoped table reads. Fine for current scale; if portfolios grow large, scope to active sites or precompute server-side.
- Do **not** add a DB migration — Phase 1 is derive-only (prod migration drift outstanding).
