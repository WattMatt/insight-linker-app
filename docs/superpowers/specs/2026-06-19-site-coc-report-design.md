# Site COC report — inclusive (FM dashboard + per-tenant)

**Date:** 2026-06-19
**Surface:** Site COC tab → Report sub-tab (rewrites `siteCocReport.ts`)
**Status:** Design (approved — validated against a live YARONA-data mockup)

## Goal
One inclusive PDF that lets a facility manager see overall COC status + where the issues are, and
lets a building operator forward per-tenant sections to tenants so they fix what's outstanding.

## Audiences & shape (locked)
Single PDF. Page 1 = facility-manager dashboard. Then one per-tenant section per COC-required
subsection, page-break between (so a section can be sent to that tenant).

## Page 1 — facility-manager dashboard
- Header: site, generated date, last-import date, branding.
- Metric cards: COC required, Clear (Pass), No COC on file, Failed, Compliant %.
- **Issues & exceptions list** (only these two categories, per decision):
  - **No COC on file** — list of COC-required subsections with no certificate.
  - **Failed** — subsection + cert no. + failed SANS rule codes.

## Per-tenant section (one per COC-required subsection)
- Header: shop no · trading name · status.
- **Coverage bar:** compact indicators — COC present · evaluation present · verdict — for quick scan.
- **Register vs on file:** the register's expected Initial / Supplementary cert numbers
  (`coc_db_schedule.initial_cert_nos` / `supplementary_cert_nos`) shown alongside the cert numbers
  actually on file, so discrepancies are visible.
- **COCs on file:** per certificate — number, Initial/Supplementary, issued date, verdict
  (Pass / Fail / Review / CV / Pending), COC ✓ / Eval ✓.
- **Outstanding actions** (drive only off the two issue categories): No COC → "obtain & upload an
  Initial COC"; Failed → "COC {no} failed rule {codes} — remediate & re-certify".
- **Full SANS grid:** the 21 rules per certificate as a compact grouped (A/B/C) pass/fail/CV/N-A
  strip. REVIEW/CV cells show amber here (REVIEW is visible in the section but NOT pulled into the
  page-1 issues list).

## Data
From data already on the tab: `subsections` (is_coc_required, name, tenant_name, coc_status),
`coc_certificates` (cert_no, cert_type, verdict, reasons, rules jsonb, issued_date,
coc_document_id, eval_document_id, subsection_id), `coc_db_schedule` (per-shop register numbers +
status). No schema change.

## Derivations (pure)
- `verdictKind(verdict, rules)` → pass | fail | review | cv | pending (fail if verdict starts FAIL
  or any rule = FAIL; review if verdict starts REVIEW; cv if any rule = CV; pending if blank).
- A COC-required subsection is **No COC on file** when it has zero `coc_certificates` rows.
- **Failed** subsection = any of its certs is `fail`.
- `summary`: required = COC-required subs; clear = required with certs and none failed; noCoc;
  failed (distinct subs); compliantPct = round(clear / required * 100).
- `coverage` per subsection: hasCoc (any cert with `coc_document_id`), hasEval (any
  `eval_document_id`), overall verdictKind.
- `actions`: noCoc + failed only (REVIEW not an action).

## Architecture
- `src/lib/siteCoc/cocReportModel.ts` (new, unit-tested) — `buildCocReportModel(input)` →
  `{ siteName, generatedAt, lastImport, summary, issues, tenants[] }`.
- `src/lib/siteCoc/siteCocReport.ts` (rewrite) — `buildSiteCocReportDocDef(model)` renders the
  dashboard + per-tenant sections (pdfmake; landscape; SANS grid as a grouped strip; page-break
  per tenant).
- `src/views/site-coc/ReportSubTab.tsx` — pass `subsections`; build model then `downloadPdf`.
- `src/views/site-coc/SiteCocTab.tsx` — pass `subsections` to `ReportSubTab`.

## Out of scope (YAGNI)
- Per-tenant standalone one-pager generator (forward the section from the single PDF instead).
- Expiry dates (not captured at site level yet).
- Flagging REVIEW/CV in the page-1 issues list (shown in tenant sections only, per decision).

## Testing
- Unit: `verdictKind`, and `buildCocReportModel` over a fixture (no-COC, failed, review, clean) →
  correct summary counts, issues, per-tenant actions.
- Build + suite green. Runtime: generate on YARONA → 22 required, 9 No COC, 1 Failed
  (CLOTHING JUNCTION C8), per-tenant sections with coverage bar + register numbers + SANS grid.

## Deploy
Frontend-only; standard Vercel deploy. Generate a sample on YARONA to confirm.
