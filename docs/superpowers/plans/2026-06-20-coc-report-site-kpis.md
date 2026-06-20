# Site COC report 10-KPI summary page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Render a 10-card KPI grid (5 COC + 5 site) on the report's executive-summary page.

**Spec:** `docs/superpowers/specs/2026-06-20-coc-report-site-kpis-design.md`
**Gate:** `npm run build` + `npx vitest run`.

---

## Task 1: Shared inspection status helpers

**Files:** Modify `src/lib/report/inspectionScore.ts` (+ `inspectionScore.test.ts`); refactor
`src/lib/pdfmakeInspectionReport.ts`.

- [ ] **1.1** Test (`inspectionScore.test.ts`): `itemStatusKind({value:true})==='pass'`,
  `{value:false}==='fail'`, `{value:'N/A'}==='pending'`, `{value:'Pass'}==='pass'`,
  `{value:'fail'}==='fail'`, `{value:''}==='pending'`.
- [ ] **1.2** Add to `inspectionScore.ts`: `isPassStatus`, `isFailStatus` (same vocab as today),
  and `itemStatusKind(item:{value?:unknown})` → `'pass'|'fail'|'pending'` using the boolean/string
  rule from `pdfmakeInspectionReport.calculateStats`.
- [ ] **1.3** Refactor `pdfmakeInspectionReport.ts`: import `isPassStatus`/`isFailStatus` from
  `./report/inspectionScore`, delete its two private copies. (Leave its inline status derivation.)
- [ ] **1.4** `npx vitest run src/lib/report/inspectionScore.test.ts` + `npm run build` — green.
- [ ] **1.5** Commit.

## Task 2: reportKpis lib

**Files:** Create `src/lib/siteCoc/reportKpis.ts` + `reportKpis.test.ts`.

- [ ] **2.1** Test: `inspectionPassRate([{json_data:{sections:[{items:[{value:true},{value:false},{value:'N/A'}]}]}}])`
  → `{pass:1, fail:1, pct:50}`; empty → `{pass:0,fail:0,pct:100}`.
- [ ] **2.2** Test: `buildSiteKpiBlock` with a small `deliverablesSummary` (completionPct 63,
  metering done 28/total 28, inspections done 26/28), 3 snags (2 open incl. 1 high-risk + ages, 1
  closed), 2 subsections (one Pass with expiry in 20 days), inspections fixture → asserts
  `readinessPct:63, meteringDone:28/meteringTotal:28, snagsOpen:2, snagsHighRisk:1,
  oldestOpenDays:>0, inspectionPassPct from items, expiry.within30:1`.
- [ ] **2.3** Implement:
  - `inspectionPassRate(inspections:{json_data:any}[])` → walks `json_data.sections[].items[]`,
    tallies via `itemStatusKind`, returns `{pass,fail,pct:scorePercentage(pass,fail)}`.
  - `SiteKpiBlock` interface: `{ readinessPct; snagsOpen; snagsHighRisk; snagsClosed;
    oldestOpenDays:number|null; inspectionPassPct; inspectionPass; inspectionFail;
    meteringDone; meteringTotal; expiry:{expired;within30;within90} }`.
  - `buildSiteKpiBlock({deliverablesSummary, snags, subsections, inspections, today})`:
    snags open/closed via `snagStatusBucket`; high-risk open via `BLOCKING_RISK_LEVELS`; aging via
    `snagAging`; expiry via `cocExpiryBuckets`; metering from the `metering` deliverable result;
    readiness from `deliverablesSummary.completionPct`; pass rate via `inspectionPassRate`.
- [ ] **2.4** `npx vitest run src/lib/siteCoc/reportKpis.test.ts` — green.
- [ ] **2.5** Commit.

## Task 3: Carry SiteKpiBlock through the model

**Files:** Modify `src/lib/siteCoc/cocReportModel.ts`.

- [ ] **3.1** Import `SiteKpiBlock`; add `siteKpis?: SiteKpiBlock` to both `BuildInput` and
  `CocReportModel`; in `buildCocReportModel` set `siteKpis: input.siteKpis`.
- [ ] **3.2** `npm run build` — green. Commit.

## Task 4: Render the 10-card grid

**Files:** Modify `src/lib/siteCoc/siteCocReport.ts`.

- [ ] **4.1** Add a `kpiGrid(model)` builder: two `columns` rows of 5 `kpiCell`s.
  Row A (COC): Compliance `${s.compliantPct}%`, COC coverage `${k.cocCoveragePct}%`, Eval coverage
  `${k.evalCoveragePct}%`, Verdict (render `verdictBar` + counts), Expiry
  `${exp.expired}/${exp.within30}/${exp.within90}` (expired · ≤30 · ≤90).
  Row B (site): Open snags `${snagsOpen}` (`${snagsHighRisk} high-risk`), Oldest snag
  `${oldestOpenDays ?? '—'}d`, Inspection pass `${inspectionPassPct}%`, Readiness `${readinessPct}%`,
  Metering `${meteringDone}/${meteringTotal}`. Use `miniBar` on the % cells.
- [ ] **4.2** In `summary`, when `model.siteKpis` is present use `kpiGrid`; else keep the current
  4-KPI + status-cells block (fallback). Keep narrative + Issues. Remove the now-duplicated 4 status
  cells when the grid is used.
- [ ] **4.3** `npm run build` — green. Commit.

## Task 5: Thread the data from SiteDetail

**Files:** Modify `src/views/SiteDetail.tsx`, `src/views/site-coc/SiteCocTab.tsx`,
`src/views/site-coc/ReportSubTab.tsx`.

- [ ] **5.1** `SiteDetail.tsx`: add `created_at, rectified_at` to the snags `select`; compute
  `const siteKpis = useMemo(() => buildSiteKpiBlock({ deliverablesSummary, snags, subsections,
  inspections, today: new Date().toISOString().slice(0,10) }), [deliverablesSummary, snags,
  subsections, inspections])`; pass `siteKpis={siteKpis}` to `<SiteCocTab>`.
- [ ] **5.2** `SiteCocTab.tsx`: accept `siteKpis?: SiteKpiBlock`; forward to `<ReportSubTab siteKpis=…>`.
- [ ] **5.3** `ReportSubTab.tsx`: accept `siteKpis?: SiteKpiBlock`; pass into `buildCocReportModel({…, siteKpis})`.
- [ ] **5.4** `npm run build` — green. Commit.

## Task 6: Verify + deploy

- [ ] `npx vitest run` — all green. `npm run build` — green.
- [ ] Merge → main, push, Vercel Ready.
- [ ] Runtime (YARONA): report summary page shows all 10 cards with live numbers; guideline + tenant
  detail still follow.

## Self-Review
- Spec KPIs 1–10 ↔ Task 4 rows. ✓  Data reuse ↔ Task 5. ✓  Pass-rate choice ↔ Task 1–2. ✓
- Optional `siteKpis` fallback ↔ Task 3 + 4.2. ✓
- Types: `SiteKpiBlock` defined in Task 2, consumed in 3/4/5 consistently.
