# Site COC report — embed the Verification Guideline

**Date:** 2026-06-19
**Surface:** Site COC tab → Report (`ReportSubTab.tsx`)
**Status:** Design (approved)

## Goal
Incorporate the "COC Verification Guideline — SANS 10142-1" document (content, formatting, and
everything) into the generated site COC report, so every report carries the methodology it's based
on.

## Decision (locked)
- **Merge the guideline PDF** (don't re-author) — preserves exact content/formatting/branding; the
  guideline is already a polished 9-page WM-branded PDF that matches the report's styling.
- **Placement: up front, after the cover** — order becomes: cover → guideline (9pp) → executive
  summary/KPIs → tenant detail.
- **Always included** in every generated report.

## Asset
- `public/reference/coc-verification-guideline.pdf` — the rendered guideline (served at
  `/reference/coc-verification-guideline.pdf`), bundled with the app.
- `docs/reference/coc-verification-guideline.html` — the source HTML kept for regeneration
  (re-render via headless Chrome `--print-to-pdf` if it changes).

## Mechanics
- New pure-ish helper `src/lib/siteCoc/mergeReportGuideline.ts`:
  `mergeGuidelineAfterCover(reportBytes, guidelineBytes): Promise<Uint8Array>` using `pdf-lib`
  (already a dep, used by `pdfmakeInspectionReport`). Builds a new doc =
  `[report page 0 (cover)] + [all guideline pages] + [report pages 1..n]`.
- `ReportSubTab.generate()`: `generatePdfBlob(docDef)` → `arrayBuffer` → `fetch('/reference/…pdf')`
  → `mergeGuidelineAfterCover` → combined `Blob` → existing preview / download / save (so saved &
  downloaded reports include the guideline).
- **Resilience:** if the guideline fetch/merge fails, fall back to the report-only blob (report
  generation must never break because the asset is missing).

## Assumptions
- The report cover is exactly page 0 (one page) — it is (sparse fixed content). The split relies on
  this; if the cover ever overflows, the guideline would land after page 1. Acceptable for the fixed
  cover.

## Out of scope
- Making the guideline dynamic per site (it's a static methodology); editing it in-app.

## Testing
- Unit: `mergeGuidelineAfterCover` over two pd-lib-created fixtures (2-page "report" + 3-page
  "guide") → 5 pages, cover-first ordering by page size.
- Build + suite green. Runtime: Generate on YARONA → cover, then the 9 guideline pages, then
  summary/KPIs, then tenants; download/save include it.

## Deploy
Frontend-only (+ static asset); standard Vercel deploy.
