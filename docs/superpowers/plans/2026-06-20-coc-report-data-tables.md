# Site COC report data tables — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Add Schedule / SANS-verification / file-register tables to the report; drop tenant detail.
**Spec:** `docs/superpowers/specs/2026-06-20-coc-report-data-tables-design.md`
**Gate:** `npm run build` + `npx vitest run`.

---

## Task 1: Model — three table arrays

**Files:** `src/lib/siteCoc/cocReportModel.ts` (+ `cocReportModel.test.ts`).

- [ ] **1.1** Extend `SchedRow` (add optional `trading_name, coc_required, files_count, status,
  notes`) and `CertRow` (add optional `shop_no_raw, doc_type, clause_9_2, confidence, source_file,
  notes`).
- [ ] **1.2** Add exported interfaces `ScheduleTableRow`, `VerificationRow`, `FileRegisterRow`; add
  `scheduleTable: ScheduleTableRow[]`, `verificationRows: VerificationRow[]`,
  `fileRegister: FileRegisterRow[]` to `CocReportModel`.
- [ ] **1.3** Test (`cocReportModel.test.ts`): with one schedule row (status "MISSING — no
  electrical CoC", trading, req Y) and one cert (verdict, rules {A1:PASS,C8:FAIL}, doc_type
  electrical_coc, source_file, shop_no_raw), assert `scheduleTable[0].status` carries the raw status,
  `verificationRows[0].rules.C8==='FAIL'`, `fileRegister[0].file===source_file` and
  `fileRegister[0].docType==='electrical_coc'`.
- [ ] **1.4** Implement the three `.map` builders in `buildCocReportModel` (sort scheduleTable +
  verificationRows by shop, fileRegister by file). Return them on the model.
- [ ] **1.5** `npx vitest run src/lib/siteCoc/cocReportModel.test.ts` — green.
- [ ] **1.6** Commit.

## Task 2: Render the three tables, drop tenant detail

**Files:** `src/lib/siteCoc/siteCocReport.ts`.

- [ ] **2.1** Import `scheduleStatusTone, verdictTone, type Tone` from `./statusDisplay`; add a
  `TONE: Record<Tone,{fill;text}>` map (green/red/amber/slate → the statusDisplay hexes).
- [ ] **2.2** `scheduleTableContent(rows)` — header + body; Status cell uses
  `TONE[scheduleStatusTone(r.status)]`. Widths `[40,110,18,95,100,20,80,"*"]`,
  `layout:"lightHorizontalLines"`, `headerRows:1`.
- [ ] **2.3** `verificationContent(rows)` — two header rows (meta cols `rowSpan:2`; band cells
  `Admin colSpan 5 / Install 4 / Tests 12`; second row = 21 rule codes), body rows = shop, cert,
  type, verdict (`TONE[verdictTone]`), then 21 cells using existing `glyph`/`ruleFill`. Widths
  `[45,60,16,60, ...Array(21).fill("*")]`, `headerRows:2`, small font (7 / 6 for cells).
- [ ] **2.4** `fileRegisterContent(rows)` — header + body; doc-type cell green when
  `electrical_coc` else slate; confidence text coloured high→green/med→amber/low→red. Widths
  `["*",45,65,60,36,24,50,32,"*"]`, `headerRows:1`.
- [ ] **2.5** Replace `tenantsBlock` with a `tablesBlock` (three section headings each
  `pageBreak:"before"` + a one-line verification legend). Update `content: [...cover, ...summary,
  ...tablesBlock]`. Remove the now-unused `tenantSection`/`sansGrid` if no longer referenced (keep
  `glyph`/`ruleFill`).
- [ ] **2.6** `npm run build` — green. Commit.

## Task 3: Thread the full row fields

**Files:** `src/views/site-coc/ReportSubTab.tsx`.

- [ ] **3.1** In `buildModel`, extend the `schedule` map to include `trading_name, coc_required,
  files_count, status, notes`; extend the `certificates` map to include `shop_no_raw, doc_type,
  clause_9_2, confidence, source_file, notes`.
- [ ] **3.2** `npm run build` — green. Commit.

## Task 4: Verify + deploy

- [ ] `npx vitest run` — green. `npm run build` — green.
- [ ] Merge → main, push, Vercel Ready.
- [ ] Runtime (YARONA): report shows the 3 colour-coded tables after the exec summary; no tenant
  detail; guideline + cover intact.

## Self-Review
- 3 tables ↔ Task 2; tenant detail dropped ↔ 2.5; data ↔ Task 1 + 3. ✓
- Tones reuse statusDisplay (single source). ✓  Full 21-col grid ↔ 2.3. ✓
- Optional BuildInput fields keep existing model tests compiling. ✓
