# Site COC report — cover page + executive summary + KPIs

**Date:** 2026-06-19
**Surface:** Site COC tab → Report (extends `cocReportModel.ts` + `siteCocReport.ts`)
**Status:** Design (approved — validated against a live YARONA preview)

## Goal
Add front matter to the inclusive COC report: a cover page, an executive summary, and a KPI block —
so it reads as a formal deliverable for facility managers / building owners.

## Locked content (from approved preview)
- **Cover page:** Watson Mattheus wordmark + blue accent; title "Certificate of Compliance — Status
  report"; site name + address; "Prepared for" (client) / "Prepared by" (Watson Mattheus);
  generated + data-as-of dates; headline status box ("55% compliant · N no COC · N failed").
- **Executive summary:** 2–3 sentence auto-written narrative.
- **KPIs:** cards with mini bars — Compliance % (clear/required), COC coverage %, Evaluation
  coverage %, Outstanding actions count — plus a certificate **verdict breakdown** stacked bar
  (Pass / Review+CV / Pending / Fail). Status cards (required/clear/no-COC/failed) retained.
- Then the existing Issues & exceptions list and per-tenant detail.

## Model changes (`cocReportModel.ts`)
- `BuildInput` gains optional `clientName?: string`, `address?: string`.
- `CocReportModel` gains:
  - `cover: { clientName: string | null; address: string | null }`
  - `kpis: { cocCoveragePct: number; evalCoveragePct: number; verdict: { pass: number; fail: number; review: number; cv: number; pending: number }; outstanding: number }`
- Derivations: cocCoveragePct = required tenants with `coverage.hasCoc` / required; evalCoveragePct
  likewise for `hasEval`; verdict = counts of `verdictKind` across required tenants' certs;
  outstanding = sum of tenant `actions`.

## Render changes (`siteCocReport.ts`)
- Prepend a **cover page** (content + `pageBreak:'after'`) and an **executive-summary/KPI page**
  before the existing dashboard/issues. KPI mini-bars and the verdict stacked bar via pdfmake
  `canvas` rects. Branding via text wordmark (matches preview).
- **Roboto-safe SANS marks:** replace `✓ ✗ – · CV` with `P / F / CV / N / ·`-style ASCII-safe marks
  so the app PDF (Roboto) renders correctly. (Verdict column already uses words.)

## Wiring
- `ReportSubTab` accepts `clientName` + `siteAddress`, passes them into `buildCocReportModel`.
- `SiteCocTab` accepts + forwards `clientName` + `siteAddress`.
- `SiteDetail` passes `clientName={site.clients?.name}` and `siteAddress={site.address}`.

## Out of scope
- Image logo asset (text wordmark used); embedding charts beyond simple canvas bars.

## Testing
- Unit: `buildCocReportModel` KPIs (coverage %, verdict counts, outstanding) over the existing
  fixture. Build green. Runtime: YARONA report shows cover (YARONA Centre / Fortress Fund /
  address), summary + KPI page (55% / 45% / 41% / 10), then issues + tenants.

## Deploy
Frontend-only; standard Vercel deploy.
