# 2026-04-22 — Orphaned Inspections (perceived data loss)

**Severity:** High — user believed historical inspection data had been destroyed.
**Actual impact:** No data lost. 575 of 1,261 inspections (46%) were unreachable from their subsection page because `inspections.subsection_id` was NULL.
**Root cause date:** First orphan 2025-10-14. Bug present continuously until fix in commit `cafb164` on 2026-04-22.

## Symptoms reported

- User navigated to `YARONA CENTRE / DEBONAIRS` subsection → "No inspections found for this subsection".
- Expected to see a completed Low Voltage Line Shop Board Audit with photos, statuses, notes.
- Same pattern reported for Debonairs, Pep Cell, Shoprite across multiple Line Shop subsections.
- Perceived as data loss after recent builds.

## Diagnostic findings (in order)

1. DB rows existed and were byte-identical to yesterday's snapshot → no destruction.
2. `json_data` populated (e.g. Debonairs: 3,864 chars, full `componentImages` / `emergencyBoardImages` / etc.).
3. Storage URLs returned HTTP 200 → images reachable.
4. `subsection_id IS NULL` on affected rows → orphaned from subsection, so subsection view filtered them out.
5. Globally: 575 orphans, earliest 2025-10-14, latest 2026-03-24 — continuous regression.
6. 499 of 575 orphans also had NULL `shop_name` AND NULL `shop_number`.

## Root cause

Two code paths inserted inspections without `subsection_id`:

1. **`src/pages/SiteDetail.tsx:576-593`** — `handleCreateInspection()` inserted with only `site_id, template_id, title, inspection_date, status`. Never set `subsection_id` or `shop_name`. Primary source of nameless orphans.
2. **`src/hooks/useOfflineInspections.ts:9-16`** — `InspectionData` interface did not declare `subsection_id`, `shop_name`, or `shop_number`, so no caller could pass them through the hook.

## Fix (commit `cafb164`)

- Extended `InspectionData` interface with optional `subsection_id`, `shop_name`, `shop_number`.
- `SiteDetail.tsx` now sets `shop_name = "Site-wide: <template>"` so future site-level rows have a breadcrumb.
- `src/pages/Inspections.tsx` — added amber "Unlinked" badge for rows with `subsection_id = NULL` and a click-to-assign dialog (picks a subsection from the same site and UPDATEs in place).

## Data remediation (executed 2026-04-22)

- Snapshots created first: `inspections_snap_20260421`, `inspections_snap_20260422_pre_relink`, `subsections_snap_20260421`, `offline_photos_snap_20260421`. All RLS-enabled with no policies (admin-only).
- 26 orphans auto-relinked where `inspections.shop_name` exactly matched a single `subsections.name` at the same site (case/whitespace-insensitive).
- Remaining 549 orphans untouched — discoverable via the Unlinked badge and relinkable one-by-one from the UI.
- **No DELETE or destructive operation executed.**

## Rollback plan

Undo the 26 relinks if ever needed:

```sql
UPDATE inspections i
SET subsection_id = s.subsection_id
FROM inspections_snap_20260422_pre_relink s
WHERE i.id = s.id
  AND i.subsection_id IS DISTINCT FROM s.subsection_id;
```

## Fast diagnostic for future "missing data" reports

Given a reported blank inspection with its UUID from the URL:

```sql
SELECT
  id,
  length(json_data::text)          AS chars,
  json_data IS NULL                AS null_json,
  subsection_id IS NULL            AS orphaned,
  shop_name,
  inspection_date
FROM inspections
WHERE id = '<uuid>';
```

Interpretation:
- **`chars` near 0** → inspection was genuinely never filled (not a bug)
- **`chars` large + `orphaned = true`** → linkage bug like this incident — use the UI's Unlinked badge or SQL UPDATE to relink
- **`chars` large + `orphaned = false`** → real render bug; inspect the component

## Lessons for future code review

- Any `.insert({...})` on `inspections` should either include `subsection_id` or explicitly document why the row is site-level and set a descriptive `shop_name`.
- Shared data-access hooks (`useOfflineInspections` etc.) must declare every column callers are expected to write through them. Silent omission = runtime data loss.
- Snapshots (`CREATE TABLE ..._snap_<date> AS SELECT * FROM live_table` with RLS enabled and no policies) are a cheap, repeatable freeze before any incident remediation.
