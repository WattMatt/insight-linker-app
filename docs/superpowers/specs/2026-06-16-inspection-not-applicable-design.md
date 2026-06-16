# Inspection-Not-Applicable per subsection — Design

**Date:** 2026-06-16
**Status:** Approved (design); pending spec review → plan → implementation

## Problem

Some subsections cannot be inspected (inaccessible, energised, tenant refused access,
not an inspectable installation, etc.). Today every subsection is implicitly
inspection-required, so an un-inspectable one:

- nags forever on the "Get this site compliant" checklist (inspection outstanding),
- drags down the **site grading** (inspection factor of the health score),
- drags down the **inspection KPIs**,
- and is reflected in **site summary reports**.

We need a way to mark such subsections so the inspection requirement is **waived** for them.

## Scope (decided with the user, 2026-06-16)

**Inspections only.** A waived subsection is removed from the inspection requirement and
the inspection slice of results. **COC, metering, snags and thermal remain fully in effect
and continue to count** toward the site's results. (The user explicitly chose this over a
full whole-subsection exclusion.)

**Plain toggle, no reason captured.** Mirrors the existing `is_coc_required` and
`is_thermal_required` toggles. No reason/audit field (user's choice).

### Explicitly OUT of scope

- The server-side `is_compliant` / `installation_status` recompute functions are **not**
  changed. This feature changes the **frontend grading / KPI / checklist / summary-report**
  surfaces only — not the per-subsection compliance gate. (If a waived inspection should
  also stop affecting a subsection's own `is_compliant`, that is a separate change to the
  `recompute_subsection_installation_status` / `apply_subsection_recompute` DB functions and
  is deferred.)

## Data model

```sql
ALTER TABLE public.subsections
  ADD COLUMN IF NOT EXISTS is_inspection_required boolean NOT NULL DEFAULT true;
NOTIFY pgrst, 'reload schema';
```

- Mirrors `is_coc_required`. **No backfill** — default `true` reproduces today's behaviour;
  nothing changes until a subsection is explicitly toggled off.
- Applied to prod via the Management API `database/query` endpoint, **plus** a matching
  `supabase_migrations.schema_migrations` row, same drift-safe path used for
  `20260616120000_subsection_thermal_required`. Migration file committed to
  `supabase/migrations/`.

## Exclusion logic (the core — pure functions)

A subsection is "inspection-required" when `is_inspection_required !== false` (treat
`null`/`undefined` as required, so legacy rows are unaffected).

### `src/lib/siteDeliverables.ts` → `buildInspections`

- `applicable = input.subsections.filter(s => s.is_inspection_required !== false)`.
- `total`, `done`, and `outstandingItems` are computed over `applicable` (not all subsections).
- `status` is `not_required` when `applicable.length === 0` (mirrors metering/COC).
- This is the same shape as `buildMetering`, which already excludes `metering_status === 'Not Required'`.

### `src/lib/siteHealth.ts` → `factorScores`

- The **inspection factor** denominator counts only inspection-required subsections.
  A waived subsection is neither "inspected" nor "missing" — it is neutral.
  - `requiredSubs = subsections.filter(s => s.is_inspection_required !== false)`
  - `inspections_ = requiredSubs.length === 0 ? 100 : round(requiredSubs.filter(inspected).length / requiredSubs.length * 100)`
- The **metering factor** is unchanged (waived inspection does not change metering).
- `SubsectionForHealth` gains `is_inspection_required?: boolean | null`.

### `src/lib/siteHealth.ts` → `readiness`

- A waived subsection is **never** counted as inspection-failing (`failInsp` excludes it).
- It remains in the readiness `total` and can still fail on metering/snags.
- Net: a waived subsection is "ready" once it is metered and has no blocking snag, regardless
  of inspection.

## KPIs & summary report (flow-through, no direct edits)

- `kpiMetrics.ts` has **no inspection counting of its own** — it derives inspection numbers
  from `computeSiteDeliverables` / `readiness` / `factorScores`, so the three edits above
  propagate to all KPIs automatically. (Verify during implementation that this still holds.)
- `snapshotMetrics.ts` / the cron capture route likewise derive from the shared functions.
- Site summary report: its inspection rows are inspection-driven (built from the `inspections`
  array, not from subsections), so a waived subsection with no inspection simply does not appear.
  **Verify during implementation** that the report derives any grade/score from `siteHealth` /
  `computeSiteDeliverables` rather than counting inspectable subsections directly; if it counts
  them directly, apply the same `is_inspection_required !== false` exclusion there.

## Consumers (feed the new column)

- `src/views/SiteDetail.tsx` — uses `subsections.select("*")`; no fetch change.
- `src/components/SiteSummaryReport.tsx` — uses `subsections.select("*")`; no fetch change.
- `src/views/Dashboard.tsx:170` — add `is_inspection_required` to the column list.
- `src/app/api/snapshots/capture/route.ts` — add `is_inspection_required` to the subsections
  `fetchAll` column list.

`SiteDeliverablesInput.subsections` already extends `SubsectionForHealth`, so the type picks up
the new optional field once added there.

## UI

- `src/views/subsection-detail/OverviewTab.tsx` — add an "Inspection Required: Yes / No" row +
  toggle next to the COC and Thermal toggles, using the same pattern (update
  `subsections.is_inspection_required`, then `setSubsection`). "No" reads as the N/A state.
- `src/views/subsection-detail/types.ts` — add `isInspectionRequired: boolean` to `SubsectionData`.
- `src/views/subsection-detail/useSubsectionDetail.ts` — map
  `isInspectionRequired: fullSubsection.is_inspection_required ?? true`.

## Testing

- `src/lib/siteHealth.test.ts` (or the existing suite): `factorScores` inspection factor excludes
  waived subsections from the denominator; `readiness` does not count a waived subsection as
  inspection-failing.
- `src/lib/siteDeliverables.test.ts`: `buildInspections` excludes waived subsections from
  total/outstanding; status is `not_required` when all required subsections are waived; COC /
  metering / snags counts are unaffected by the flag.

## Edge cases / decisions

- **Default `true`, no backfill** → zero behaviour change for existing sites until toggled.
- **Waived subsection that *has* an inspection:** excluded from inspection counts entirely
  (neither numerator nor denominator) — it is genuinely "not applicable".
- **All subsections waived on a site:** the inspection deliverable reads `not_required` (N/A),
  exactly like a site with no COC-required subsections.
- `null`/`undefined` `is_inspection_required` is treated as required (legacy-safe).

## Deploy

- One prod migration (add column, no backfill) applied + ledger row recorded.
- Frontend deploy (Vercel, main → production).
- ~6 files touched: migration, `siteHealth.ts`, `siteDeliverables.ts`, `Dashboard.tsx`,
  `capture/route.ts`, `OverviewTab.tsx` (+ subsection-detail `types.ts` / `useSubsectionDetail.ts`),
  plus tests.
