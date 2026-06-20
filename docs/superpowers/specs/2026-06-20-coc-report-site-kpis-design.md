# Site COC report — 10-KPI summary page

**Date:** 2026-06-20
**Surface:** Site COC report → executive-summary page (`siteCocReport.ts`)
**Status:** Design (approved)

## Goal
Replace the report's current "4 KPI cells + 4 status cells" block with a **10-card KPI grid** (the
approved WYSIWYG): 5 COC KPIs + 5 site KPIs, so a facility manager sees the whole picture on one
page.

## The 10 KPIs
COC (from the existing COC model): 1 compliance %, 2 COC coverage %, 3 eval coverage %,
4 verdict mix (stacked bar), 5 COC expiry (expired / ≤30 / ≤90).
Site (reused site data): 6 open snags (+ high-risk), 7 oldest open snag (days), 8 inspection pass
rate (item-level), 9 site readiness %, 10 metering complete.

## Data flow (no new fetches except 2 snag columns)
`SiteDetail` already loads `deliverablesSummary`, `snags`, `inspections`, full `subsections`
(incl. `coc_expiry_date`/`coc_status`). It computes a `SiteKpiBlock` once and passes it down
`SiteDetail → SiteCocTab → ReportSubTab → buildCocReportModel`.
- Add `created_at, rectified_at` to `SiteDetail`'s snags `select` (needed for snag aging).

## Decisions (locked)
- **#8 = true item-level pass rate**: aggregate pass/fail across all inspections' `json_data`,
  `scorePercentage(pass, fail)` (already excludes pending/N-A). Reuse the pass/fail vocabulary from
  the inspection report (lifted into the shared `inspectionScore` module — single source).
- **#5 expiry** uses `cocExpiryBuckets(subsections)`; reads 0/0/0 when `coc_expiry_date` is
  unpopulated (workbook-imported sites) — shown honestly, lights up when captured.
- **#9 readiness** = `deliverablesSummary.completionPct` (8-deliverable handover).
- **#10 metering** = the metering deliverable's done/total.
- `siteKpis` is **optional** on the model — if absent, the summary page falls back to today's
  COC-only KPI cells. The report never breaks for lack of site data.
- Keep the narrative intro + Issues & exceptions list; the verdict mix becomes card #4.

## New / changed
- `src/lib/report/inspectionScore.ts` — add `isPassStatus`, `isFailStatus`, `itemStatusKind(item)`;
  `pdfmakeInspectionReport.ts` refactored to import them (drop its private copies).
- `src/lib/siteCoc/reportKpis.ts` (new) — `inspectionPassRate(inspections)` +
  `buildSiteKpiBlock({deliverablesSummary, snags, subsections, inspections, today})` → `SiteKpiBlock`.
- `src/lib/siteCoc/cocReportModel.ts` — `SiteKpiBlock` carried through (optional).
- `src/lib/siteCoc/siteCocReport.ts` — 10-card grid render (2 rows × 5).
- Threading: `SiteDetail`, `SiteCocTab`, `ReportSubTab`.

## Testing
Unit: `inspectionPassRate`, `buildSiteKpiBlock`, the lifted status helpers. Build + full suite green.
Runtime: YARONA → report summary shows all 10 cards with live numbers.

## Deploy
Frontend-only (+ 2 snag columns in an existing select); standard Vercel deploy.
