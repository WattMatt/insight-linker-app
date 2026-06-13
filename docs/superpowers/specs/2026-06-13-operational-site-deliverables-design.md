# Operational Site Dashboard — Per-Site Deliverables Tracking

**Date:** 2026-06-13
**Status:** Design — awaiting user review
**Stage:** 1 of 4 (Brainstorm → Design). Next: writing-plans.

---

## 1. Problem

On the operational (ops/admin) side, users cannot see — per site — which work items are
completed and which are outstanding, so they cannot track next tasks or prioritise across
sites. The global `Dashboard.tsx` shows only aggregate KPIs (no per-site breakdown), and the
per-site `SiteDetail.tsx` has no consolidated "what's done / what's outstanding" view.

The underlying signals largely already exist (`siteHealth.ts`, `complianceCalculations.ts`,
and several per-site tables) but are not surfaced as a completion/outstanding model.

## 2. Goal

Let ops users answer, at a glance and per site:
1. **What is complete vs outstanding** across all tracked deliverables.
2. **What to do next** (a prioritised, actionable list).
3. **Which sites need attention first** (cross-site triage).

## 3. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Surfaces | Global `Dashboard.tsx` triage widget **+** per-site `SiteDetail.tsx` panel. (Sites list NOT in scope.) |
| Granularity | Rollup per category **+** drill-down list of actual outstanding items. |
| Ranking ("needs attention") | **Severity-first**: blocking issues float to top, then by outstanding count. |
| Categories | **8**: Snags, Inspections, Metering, COC, Schematic, Asset register, Infrared/thermal docs, Site summary report. |
| Architecture | **Phased (C)**: derive-only Phase 1 (no schema change); explicit status overrides in Phase 2 after prod migration drift is reconciled. |
| Per-site panel placement | Card at **top of the Overview tab**. |

### Constraint
Prod schema is ahead of `schema_migrations` (API-applied SQL) and must be reconciled before any
DB push (see memory: `prod-migration-drift`). Phase 1 therefore introduces **no migration**.

## 4. Architecture

### 4.1 Read-model module — `src/lib/siteDeliverables.ts` (new)

A pure module that is the single source of truth for "done vs outstanding". It takes
already-loaded site data and returns a structured status. It **reuses** `siteHealth.ts`
(`getHealthBand`, factor logic) and `complianceCalculations.ts` (COC).

**All fragile/centralised logic lives here only**: the document-category text matching and the
canonical 8-item list. This is what makes Phase 2 a data-source swap with zero UI rework.

Two entry points:
- `computeSiteDeliverables(siteData) → SiteDeliverablesSummary` — one site (per-site panel).
- `summarizeSitesForTriage(allSitesData) → SiteTriageRow[]` — ranked rows (global widget).

**Types (indicative):**

```ts
type DeliverableKey =
  | 'snags' | 'inspections' | 'metering' | 'coc'
  | 'schematic' | 'asset_register' | 'thermal' | 'summary_report';

type DeliverableStatus = 'complete' | 'outstanding' | 'not_required';
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none';

interface OutstandingItem {
  id: string;
  category: DeliverableKey;
  label: string;            // e.g. "Open snag: Exposed wiring"
  severity: Severity;
  subsectionId?: string;
  subsectionName?: string;
  href?: string;            // deep link to act on it
}

interface DeliverableResult {
  key: DeliverableKey;
  label: string;
  kind: 'count' | 'binary';
  done: number;             // count: completed items; binary: 0|1
  total: number;            // count: total items; binary: 1 (0 if not_required)
  status: DeliverableStatus;
  blocking: boolean;
  outstandingItems: OutstandingItem[];
}

interface SiteDeliverablesSummary {
  siteId: string;
  siteName: string;
  deliverables: DeliverableResult[];   // all 8
  completeCount: number;               // fully-complete applicable deliverables (the "5" in "5 of 8")
  applicableCount: number;             // applicable deliverables = 8 minus not_required (the "8")
  completionPct: number;               // completeCount / applicableCount * 100
  outstandingCount: number;            // total outstanding ITEMS across categories (drives drill-down + triage)
  blockingCount: number;
  band: 'success' | 'warning' | 'danger';
  nextTasks: OutstandingItem[];        // flattened, prioritised
}

interface SiteTriageRow {
  siteId: string;
  siteName: string;
  band: 'success' | 'warning' | 'danger';
  blockingCount: number;
  outstandingCount: number;
  completionPct: number;
  byCategory: Record<DeliverableKey, { done: number; total: number; status: DeliverableStatus }>;
}
```

### 4.2 Category derivation (Phase 1)

Reusing existing status logic verbatim:
- Resolved snags: `['Rectified', 'Closed']`; blocking open snag: `status === 'Open' && risk_level ∈ ['Critical','High']`.
- Completed inspections: `['Complete','Completed','Closed','Done']`.
- Metering done: `metering_status === 'Installed' || !!meter_serial_number`.
- COC compliant: `is_coc_required === false` → compliant; else `coc_status ∈ ['Approved','Valid','Pass']`.

| Category | Kind | Done | Total | Outstanding item | Blocking |
|---|---|---|---|---|---|
| Snags | count | resolved snags | all snags | each open snag | yes if Critical/High open |
| Inspections | count | subsections w/ a completed inspection | subsections | subsection lacking one | no |
| Metering | count | metered subsections | subsections (excl. `Not Required`) | subsection needing metering | no |
| COC | count | required subsections that are compliant | required subsections | required-but-not-compliant subsection | yes |
| Schematic | binary | `site_schematics` row exists | 1 | "Upload schematic" | no |
| Asset register | binary | ≥1 `site_assets` row | 1 | "Load asset register" | no |
| Infrared/thermal | binary | a `site_documents` row matches thermal patterns | 1 | "Upload infrared/thermal docs" | no |
| Site summary report | binary | a `site_documents` row matches summary patterns | 1 | "Generate site summary report" | no |

**Not-required (Phase 1):** honoured only where data already says so — metering
`metering_status === 'Not Required'` (excluded from total) and `is_coc_required === false`
(excluded from COC total). Binary doc items have no not-required signal in Phase 1 → absent =
outstanding. (Phase 2 adds explicit not-required.)

**Document-category matching (centralised, the fragile part):**
```ts
// "IR" alone is intentionally NOT matched: in SANS 10142 electrical-compliance, "IR" means
// Insulation Resistance, not infrared — a bare /\bir\b/ would false-positive and wrongly mark
// the thermal deliverable complete (hiding outstanding work). Caught in Task 1 code review.
const THERMAL_CATEGORY_PATTERNS  = [/thermal/i, /infrared/i, /thermograph/i];
const SUMMARY_CATEGORY_PATTERNS  = [/site summary/i, /summary report/i];
```
Matched against `site_documents.category` (freeform text; legacy values include
`'05 Thermal Reports'`, `'Site Summary Reports'`).

### 4.3 Prioritisation

**Next-tasks order (within a site):** blocking → severity (critical→low) → category order.

**Triage order (across sites, the widget):** `blockingCount` desc → `outstandingCount` desc →
`completionPct` asc.

**Deliverable "complete" (denominator definition):** a deliverable's `status` is `complete`
when — count kind: `done === total`; binary kind: `done === 1`. `not_required` deliverables are
excluded from `applicableCount` entirely. `completionPct = completeCount / applicableCount * 100`
(this is the "5 of 8 · 62%" figure: 5 of 8 deliverables fully complete).

**Health band:** reuse `getHealthBand` thresholds (≥80 success, ≥50 warning, <50 danger), applied
to `completionPct`. NOTE: this band reflects **deliverable completion** (the 8 items) and is a
distinct number from `siteHealth.ts`'s weighted score (snags 40% / inspections 35% / metering
25%). They are intentionally different lenses; the panel shows the deliverable-completion band.

## 5. UI components

### 5.1 `src/components/site/SiteReadinessPanel.tsx` (new) — used in SiteDetail Overview tab (top)
- **Header:** overall completion ("5 of 8 deliverables complete · 62%"), health band chip,
  "⚠ N blocking" badge when applicable.
- **Rollup grid:** 8 colour-coded category chips — count shows `8/12`, binary shows ✓/✗,
  not-required shown muted.
- **Next Tasks list:** prioritised outstanding items; each row is clickable and deep-links to
  where the user acts (subsection detail, documents tab, etc.). Capped with "show all".

### 5.2 `src/components/dashboard/SitesNeedingAttention.tsx` (new) — used in Dashboard
- Triage card, severity-ranked. Each row: site name, band chip, "⚠ N blocking" badge,
  "X outstanding", compact per-category mini-breakdown, links to that site's detail.
- Shows top ~6 with a "view all sites" affordance.

## 6. Data fetching

- **SiteDetail:** already loads subsections, snags, inspections, `site_documents`. **Add two
  cheap queries** — `site_schematics` (1 row, `site_id` is UNIQUE) and `site_assets` (presence).
  COC derives from subsections already in hand.
- **Dashboard widget:** a **bounded ~7 grouped queries** (sites, subsections, snags via
  subsection→site, inspections, schematics, assets, documents), rolled up in-memory keyed by
  site. **No N+1.** Query cost flagged as a watch-item for very large portfolios; scope to
  active/non-archived sites.

## 7. Testing

`siteDeliverables.ts` is pure → unit-tested first (TDD):
- each category's done/outstanding/not-required derivation
- blocking detection (Critical/High open snags; failing required COC)
- next-tasks ordering and triage ordering
- thermal/summary pattern matching (including legacy category strings)
- empty-site and all-complete edge cases

UI components: light interaction coverage (renders rollup, lists outstanding items, links resolve).

## 8. Phase 2 (NOT built now — upgrade path)

After prod migration drift is reconciled:
- Add `site_deliverables` (`site_id`, `deliverable_type`, `status`, `completed_at`, …).
- `computeSiteDeliverables` gains an optional `overrides` arg; binary items prefer explicit
  status (done / not_required / approved), else fall back to derivation.
- Consumers (panel, widget) unchanged.

## 9. File plan (Phase 1)

**New**
- `src/lib/siteDeliverables.ts`
- `src/lib/siteDeliverables.test.ts`
- `src/components/site/SiteReadinessPanel.tsx`
- `src/components/dashboard/SitesNeedingAttention.tsx`

**Edit**
- `src/views/SiteDetail.tsx` — load `site_schematics` + `site_assets`; render panel atop Overview.
- `src/views/Dashboard.tsx` — fetch per-site rollups; render widget.

**Reuse (no change)**
- `src/lib/siteHealth.ts`, `src/lib/complianceCalculations.ts`.

## 10. Out of scope

- Sites list (`Sites.tsx`) per-card status.
- Any schema migration / new tables (Phase 2).
- Approval workflows, SLAs, due dates.
- Client- and contractor-facing portals.
