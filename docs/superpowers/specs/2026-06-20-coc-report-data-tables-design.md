# Site COC report — ingested data tables (replace tenant detail)

**Date:** 2026-06-20
**Surface:** Site COC report (`siteCocReport.ts` + `cocReportModel.ts`)
**Status:** Design (approved)

## Goal
Incorporate the three visually-rich ingested tables (the Schedule, the SANS verification grid, and
the file register — as seen in the Site COC sub-tabs) into the generated report, and **drop the
per-shop tenant-detail section**.

## New report order
cover → guideline (9pp) → executive summary (10-KPI grid + Issues) → **DB/COC Schedule** →
**COC Verification vs SANS 10142-1** → **File register**. (Tenant detail removed.)

## The three tables
1. **DB / COC Schedule** — Shop No · Trading · Req · Initial COC(s) · Supplementary COC(s) · Files ·
   Status · Notes. Status cell colour-coded via `scheduleStatusTone` (OK green / MISSING·FAIL red /
   FLAG amber / N/A slate).
2. **COC Verification grid (full 21 columns)** — Shop · Cert no · Type · Verdict + the 21 SANS rule
   columns, banded Admin (5) / Install (4) / Tests (12). Verdict coloured via `verdictTone`; each
   rule cell coloured via `ruleFill` with the Roboto-safe glyph (`P/F/CV/N/A/·`). Reasons column
   dropped (verdict text carries the reason).
3. **File register** — File · Matched (shop) · Doc type · Cert no · Type · 9(2) · Issued · Conf ·
   Notes. Doc-type `electrical_coc` tinted green, else slate; confidence text coloured high/med/low.

All colour-coding reuses `statusDisplay.ts` tones rendered as pdfmake `fillColor`. Landscape; each
table starts on its own page (`pageBreak:"before"`); `headerRows` repeat across page breaks.

## Data
- Model gains `scheduleTable`, `verificationRows`, `fileRegister` (flat raw-value rows) built in
  `buildCocReportModel`.
- `BuildInput.schedule` / `.certificates` rows extended with the extra fields (trading_name,
  coc_required, files_count, status, notes; shop_no_raw, doc_type, clause_9_2, confidence,
  source_file, notes) — all optional, so existing tests keep compiling. `ReportSubTab` passes the
  full `CocScheduleRow` / `CocCertRow` fields it already holds.
- The KPI/summary/issues computation (built from tenants) is unchanged; only tenant *rendering* is
  removed.

## Testing
Unit: `buildCocReportModel` populates the three arrays with the right columns + raw status/verdict
values for colouring. Build + full suite green. Runtime: YARONA report shows the three tables,
correctly coloured, no tenant-detail section.

## Deploy
Frontend-only; standard Vercel deploy.
