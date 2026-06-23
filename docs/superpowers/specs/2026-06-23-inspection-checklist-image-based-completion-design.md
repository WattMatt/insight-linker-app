# Image-based inspection completion — design

**Date:** 2026-06-23
**Status:** Approved (brainstorming → spec)

## Problem

The per-site Dashboard checklist's inspections item, the KPI inspection count, and the
weighted Site Health / readiness score all treat an inspection as "done" by **existence**:
`isInspectionCompleted(i) = !!i`. A subsection whose inspection record exists but is empty
(no photos captured) reads as complete on every surface.

The Reports tab (`BulkInspectionReportGenerator`) is the only place that knows about images.
It computes a per-subsection `photoCount` from the latest inspection's `json_data` and shows
which inspections have images and which don't — exactly the signal that tells us an inspection
still needs to be populated.

The user wants the checklist (and the wider deliverable/health calculation) to reflect the
same thing the Reports tab shows: surface inspections that **do not have images**, so empty,
not-yet-populated inspections are visible as outstanding work.

## Decision

Redefine "done" for the inspection deliverable and health as:

> A subsection is inspection-complete when it has an inspection with **≥1 image**.

"Image" is counted exactly as the Reports tab counts it today:
- section items' `photos[]` arrays, plus
- tenant `meterImage` / `breakerImage` / `ctRatioImage` (EMB templates).

A subsection is **outstanding** if it has *no inspection record* OR *an inspection with zero
images* — a single unified list (not two separate states). Waived subsections
(`is_inspection_required === false`) remain excluded / treated as satisfied, unchanged.

**Selection rule:** a subsection is image-complete if **any** of its inspections has ≥1 image.
The Reports tab's "latest" sort is a no-op today (it sorts on `created_at` but never selects
that column), so "any" is both simpler and consistent. Re-inspections are rare.

### Scope (approved)

The new definition reaches **all three** aggregation surfaces:
1. The Dashboard checklist outstanding list.
2. The KPI deliverable grid (`done`/`total` count).
3. The weighted Site Health / readiness score.

`isInspectionCompleted` (existence-based) is **left untouched** — subsection-detail
(`OverviewTab`, `useSubsectionDetail`) still calls it with `{ status }` only for a separate
per-entry display, which is out of scope.

## Approach: single shared photo-count helper

Chosen over (B) inlining the photo count at each site — which re-creates the drift this fixes —
and (C) a persisted `has_images` column via DB trigger/backfill — overkill, and blocked on prod
DB access. The shared helper guarantees the checklist and Reports tab can never disagree.

### 1. New module `src/lib/inspectionImages.ts`
- `countInspectionPhotos(json_data): number` — lifted verbatim from
  `BulkInspectionReportGenerator.tsx` (the `json_data` walk over sections + tenants).
- `inspectionHasImages(i: { json_data?: unknown }): boolean` → `countInspectionPhotos(i.json_data) > 0`.
- Unit tests: section `photos[]`, tenant images, empty `json_data`, malformed/non-object input,
  `generalInfo` excluded, null/undefined.

### 2. Dedupe the Reports tab
`BulkInspectionReportGenerator` calls `countInspectionPhotos(latestInspection.json_data)` instead
of its inline loop. Behavior identical; removes the second copy. (Pre-existing `created_at`
selection bug in its "latest" sort is left as-is — out of scope.)

### 3. Rewire the three aggregations
Swap the inspected-set predicate from existence to images:
- `buildInspections` (`src/lib/siteDeliverables.ts`) — checklist + KPI count.
- `factorScores` and `readiness` (`src/lib/siteHealth.ts`) — weighted health / readiness.
- Add `json_data?: unknown` to the `InspectionForHealth` interface (`InspectionForDeliverables`
  aliases it, so deliverables inherit the field).
- The inspected set becomes
  `new Set(inspections.filter(inspectionHasImages).map(i => i.subsection_id).filter(Boolean))`.

Outstanding-item label stays the generic `"Inspection outstanding: {name}"` (covers both
"no inspection" and "empty inspection"; the single unified list was the chosen behavior).

### 4. Data plumbing — add `json_data` to two queries that omit it
- `src/app/api/snapshots/capture/route.ts` inspections select (daily snapshot cron) — needs
  `json_data` or every snapshot computes inspection score 0.
- `src/views/Dashboard.tsx` inspections select (multi-site triage via `summarizeSitesForTriage`).
- `src/views/SiteDetail.tsx` (already selects `json_data`), `SiteSummaryReport.tsx`
  (`select("*")`), `ComplianceDashboard.tsx` (prop from SiteDetail) — no change.

Photos are stored as URL strings (not base64), so pulling `json_data` site-wide in the cron is
lightweight.

## Expected impact

Intended and visible: any site with started-but-empty inspections sees its inspection KPI count
and weighted health score **drop** on deploy. The snapshot trend sparkline shows a one-time
step-change (past snapshots used the old existence definition; new ones use images). Correct
behavior, not a regression — flagged so it is not mistaken for one.

## Testing / verification

- New `src/lib/inspectionImages.test.ts`.
- Update `siteHealth.test.ts` and `siteDeliverables.test.ts` fixtures: inspections must now carry
  `json_data` with a photo to count as done; add a case proving an empty inspection reads as
  outstanding.
- Full test suite green + production build green.

## Out of scope

- `isInspectionCompleted` and its subsection-detail per-entry usages.
- The Reports-tab `created_at` "latest" selection bug.
- Any DB migration / persisted column.
- Label differentiation between "no inspection" and "empty inspection".
