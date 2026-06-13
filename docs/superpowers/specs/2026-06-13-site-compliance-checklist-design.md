# Site Overview → "Get Compliant" Deep-Linking Checklist

**Date:** 2026-06-13
**Status:** Design — awaiting user review
**Stage:** 1 of 4 (Brainstorm → Design). Next: writing-plans.
**Builds on:** Phase 1 deliverables tracking (`src/lib/siteDeliverables.ts`, merged to main).

---

## 1. Problem & goal

The per-site Overview tab is cluttered (KPI cards + a site-inspections list) and doesn't drive
action. The user wants the Overview to **be** the per-site task summary, where every outstanding
item is a button that takes you **straight to the exact upload/input** needed to make the site
compliant — so an operator can walk a site to done without hunting through tabs.

## 2. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Layout | **Category checklist** (option B): 8 deliverables as groups, incomplete-and-blocking first, completed groups collapsed at the bottom. |
| Action depth | **Act-ready** — each action navigates to the exact tab/subsection AND auto-opens the upload dialog / focuses the input. |
| Subsection items | **Jump into that subsection** — snags/inspections/metering/COC navigate to the subsection's detail page at the right tab; browser back returns to the checklist. |
| Cleanup scope | **Overview tab content only** — replace KPI cards + inspections list with the checklist; all other tabs stay (they are where actions land). |

## 3. Architecture

### 3.1 Reuse, don't rebuild
The data is already computed by `computeSiteDeliverables(input): SiteDeliverablesSummary` (Phase 1).
The checklist is a **new presentation** of `summary.deliverables` and each deliverable's
`outstandingItems`. No new data logic.

### 3.2 Deep-link contract — URL query params (the key mechanism)
Each action is a navigation to a URL carrying params that the destination page reads on mount to
(a) select the tab and (b) open the dialog / focus the input. URL params (not in-memory callbacks)
because they work uniformly for same-page tabs **and** cross-page subsection jumps, are
back-button friendly, and extend the codebase's existing `?tab=` pattern.

**Pure builder** — `src/lib/buildActionHref.ts`:
```ts
buildActionHref(item: OutstandingItem, ctx: { clientId: string; siteId: string }): string
```
`base = /clients/{clientId}/sites/{siteId}`. By `item.category`:

| Category | Returned href | Destination behavior |
|---|---|---|
| `schematic` | `{base}?tab=schematic` | Schematic tab; upload control already visible |
| `asset_register` | `{base}?tab=asset-verification` | Asset tab; upload control visible |
| `thermal` | `{base}?tab=documents&upload=thermal` | SiteDetail opens the document upload dialog, thermal category preset |
| `summary_report` | `{base}?tab=reports&generate=1` | SiteReports opens the generate dialog |
| `coc` | `{base}/subsections/{item.subsectionId}?tab=coc-metering` | Subsection COC tab — the COC section is already at the top of this tab, so landing here is act-ready (no extra scroll/focus param needed) |
| `metering` | `{base}/subsections/{item.subsectionId}?tab=coc-metering&focus=meter` | Subsection COC/metering tab; meter-serial input focused |
| `inspections` | `{base}/subsections/{item.subsectionId}?tab=inspections&create=1` | Subsection Inspections tab; create dialog open |
| `snags` | `{base}/subsections/{item.subsectionId}?tab=overview&snag={item.id}` | Subsection overview; that snag highlighted (see note — snags are *rectified* in the inspection flow, so this lands-and-shows rather than resolves inline) |

Fallback: if a subsection-scoped item is missing `subsectionId`, return `{base}?tab=subsections`.
(`item.id` is the snag id for snag items — see `buildSnags` in Phase 1.)

**Param vocabulary the destinations must read:** `tab`, `upload`, `generate`, `focus`, `create`, `snag`.

### 3.3 Components

**New — `src/components/site/SiteComplianceChecklist.tsx`**
- Props: `{ summary: SiteDeliverablesSummary; clientId: string; siteId: string }`.
- Renders: progress header (`completeCount of applicableCount · completionPct%`, blocking badge),
  then the 8 deliverables as groups. **Group sort order** (a pure comparator over `DeliverableResult`):
  bucket rank ascending where rank = 0 if `blocking`, 1 if `status === 'outstanding'` (non-blocking),
  2 if `status === 'not_required'`, 3 if `status === 'complete'`; ties broken by `DELIVERABLE_ORDER`
  index. Completed and not-required groups render collapsed (status badge only, no action rows).
- Each `outstandingItem` renders an action row whose button navigates to
  `buildActionHref(item, { clientId, siteId })` via the app's `useNavigate` (`@/lib/navigation`).
- Action verb by category: schematic/asset/thermal → "Upload", summary_report → "Generate",
  coc → "Set COC", metering → "Enter meter", inspections → "Create", snags → "Open"
  (honest verb: rectification happens in the inspection, so this opens the snag's location).

**Removed — `src/components/site/SiteReadinessPanel.tsx`**
Replaced on the Overview by the checklist; not used elsewhere → delete the file (verify no other importers).

### 3.4 "Act-ready" wiring per destination
- **SiteDetail.tsx** — on mount, read `upload` and `generate` params:
  - `upload=thermal` → resolve the site document category whose name matches the thermal patterns
    (reuse `THERMAL_CATEGORY_PATTERNS` from `siteDeliverables.ts`), `setUploadCategoryId(catId)` +
    `setUploadDialogOpen(true)`. If no thermal category exists, just land on the Documents tab.
  - `generate=1` → pass an `autoGenerate` signal into `SiteReports`.
- **SiteReports.tsx** — accept an `autoOpenGenerate?: boolean` prop; when true on mount, open its
  generate dialog (the `GenerateFinalReportButton` settings dialog / `settingsOpen`).
- **SubsectionDetail.tsx** — on mount, read params:
  - `tab` → set active subsection tab (already supports `?tab=`).
  - `focus=meter` → focus the meter-serial input in `CocMeteringTab`.
  - (no `focus=coc` — COC sits at the top of the `coc-metering` tab, so landing on the tab is already act-ready; the param was dropped after review.)
  - `create=1` (on inspections tab) → open the create-inspection dialog.
  - `snag={id}` (on overview) → scroll to / highlight that snag.
- Schematic and asset_register need **no** new wiring beyond tab navigation (upload controls are
  already visible on those tabs).

## 4. File plan

**New**
- `src/lib/buildActionHref.ts` + `src/lib/buildActionHref.test.ts` (pure, unit-tested).
- `src/components/site/SiteComplianceChecklist.tsx`.

**Modified**
- `src/views/SiteDetail.tsx` — Overview renders `<SiteComplianceChecklist>`; remove `SiteOverview`,
  `SiteLevelInspections`, and `SiteReadinessPanel` from Overview (and their now-unused imports/state
  — e.g. the site-level create-inspection dialog state if it's only opened from `SiteLevelInspections`);
  parse `upload`/`generate` params.
- `src/views/SubsectionDetail.tsx` (and the relevant `subsection-detail/*` tab components) — parse
  `focus`/`create`/`snag` params and open/focus/scroll accordingly.
- `src/components/site/SiteReports.tsx` — `autoOpenGenerate` prop.

**Deleted (after verifying no other importers)**
- `src/components/site/SiteReadinessPanel.tsx`.
- `src/components/site/SiteOverview.tsx` and `src/components/site/SiteLevelInspections.tsx` IF unused
  elsewhere after removal from Overview (otherwise leave and just stop rendering them on Overview).

**Untouched**
- `src/lib/siteDeliverables.ts` (read-model), the global dashboard widget `SitesNeedingAttention.tsx`.

## 5. Testing
- `buildActionHref` is pure → unit tests: each of the 8 categories → exact URL; subsection-scoped vs
  site-scoped; the snag-id case; the missing-`subsectionId` fallback.
- Param parsing / auto-open: verified by `next build` (typecheck) + the manual test pass (the surfaces
  are auth-gated; no DOM test infra in the repo).

## 6. Out of scope / flagged
- **Site-level inspections list.** Removing `SiteLevelInspections` drops the site-level inspections
  view from Overview; per-subsection inspection creation remains via the checklist. If a site-level
  "all inspections" view is still wanted, it should get its own tab — separate change.
- Tab-bar restructure (the 9 tabs stay as-is).
- Any change to the Phase-1 read-model or the global dashboard widget.
- Per-snag inline editing on the site page (we jump to the subsection instead).
- **Snag rectification deep-link.** Snags are rectified inside the inspection flow
  (`InspectionDetail.tsx`), and the read-model doesn't carry a snag's inspection id, so the snag
  link lands-and-highlights on the subsection rather than opening the rectify UI. Carrying the
  inspection id on snag outstanding items (to deep-link straight to rectification) is a follow-up.
