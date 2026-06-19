# Site COC — full coverage + no double-assign

**Date:** 2026-06-19
**Surface:** Site COC tab → Schedule sub-tab
**Status:** Design (approved)
**Builds on:** `2026-06-19-site-coc-system-design.md`, `…-central-file-loading-design.md`

## Problem
The Schedule lists only imported rows, so COC-**required** subsections with no imported entry
(no COC available yet) are invisible — e.g. on YARONA: `CENTRE MANAGEMENT`, `COUNCIL OFFICE`,
`LV ROOM`. And the Assign-subsection dropdown offers every subsection, so the same subsection can
be assigned to two shops (double-counting).

## Decisions (locked with user)
1. **Merge gaps into the Schedule list** — COC-required subsections not linked to any shop appear
   as rows flagged **"No COC on file."**
2. **Assign dropdown offers only COC-required, not-yet-assigned subsections** — each drops out once
   assigned (no double-counting).
3. "Requires COC" = `subsections.is_coc_required = true`. Frontend-only; no schema/migration.

Key identity: *uncovered COC-required subsection* == *available to assign* — one derived set drives
both the gap rows and the dropdown options, so assigning removes it from both.

## Design

### Data
`useSiteCoc` adds `is_coc_required` to its subsections fetch (`SubsectionOption`). Nothing else
backend changes.

### Pure helper — `src/lib/siteCoc/coverage.ts` (unit-tested)
- `assignedSubsectionIds(rows: {subsection_id: string|null}[]): Set<string>` — ids already linked.
- `unassignedCocRequired(subs, assigned): SubsectionOption[]` — `s.is_coc_required && !assigned.has(s.id)`.

### Schedule sub-tab (`ScheduleSubTab.tsx`)
- Compute `assigned = assignedSubsectionIds(rows)`, `gaps = unassignedCocRequired(subsections, assigned)`.
- Render imported rows as today, then one **gap row** per `gaps` entry: Shop `—` (muted), Trading =
  subsection name, Req `Y`, Status pill "No COC on file" (red tone), Subsection column = the
  subsection name (no dropdown).
- Unmatched imported rows' Assign dropdown lists **`gaps`** (COC-required, unassigned). After
  `resolveShop` refetches, the assigned subsection leaves every dropdown and its gap row clears.
- Header line: "N COC-required subsection(s) have no COC on file" when `gaps.length > 0`.

## Out of scope (YAGNI)
- Actions on gap rows beyond flagging (no upload/mark-N/A from here — done per-subsection).
- Optimistic local dedup across simultaneously-open dropdowns (refetch after each assign suffices).

## Testing
- Unit: `assignedSubsectionIds`, `unassignedCocRequired`.
- Build + existing suite green; frontend deploy. Runtime: YARONA Schedule shows 3 "No COC on file"
  rows; dropdown excludes already-assigned subsections.
