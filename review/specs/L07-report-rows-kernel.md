# L07 — report-rows-kernel

- Unit id: L07
- Slug: report-rows-kernel
- Spec mode: full
- Date: 2026-07-29
- Files: 16 (8 source + 8 vitest suites, fully test-paired)

## Unit header

**Unit purpose (as-is).** `src/lib/report` holds pure, synchronous builders that turn caller-supplied data into display-ready rows, KPIs, and formatted strings for PDF reports. `reportKernel.ts` supplies shared date/percent/page-number formatters; the six sibling modules build rows for specific reports (calendar, compliance summary, Fortress close-out checklist, inspection template, site summary) plus inspection score classification and subsection→asset matching. The pdfmake assembly for these rows lives outside the unit, in the L10/L14/L15 generator files.

**Module-level observations (cross-file facts).**
- Intra-unit dependency graph: 4 modules import from `./reportKernel` — calendarRows.ts:5 (`formatDate`), complianceRows.ts:1 (`percent`), fortressChecklistRows.ts:9 (`formatDate`), siteSummaryRows.ts:1 (`formatDate`). inspectionScore.ts, inspectionTemplateRows.ts, and subsectionAssetMatch.ts import nothing from reportKernel.
- Exactly one import leaves the unit: subsectionAssetMatch.ts:1 imports `normalizeMeterSerial` from `@/lib/assetVerification` (L08).
- No file in the unit imports Supabase, pdfmake, React, or any browser API; no env vars, storage keys, or network calls appear anywhere in the 16 files.
- The em-dash `'—'` is the recurring fallback for blank/invalid values (reportKernel.ts:28,35; calendarRows.ts:115–120; fortressChecklistRows.ts:70–71; inspectionTemplateRows.ts:43–46,55); siteSummaryRows.ts instead uses `'Unknown'`/`'-'`/`'Missing'`/`'Untitled'` (siteSummaryRows.ts:32–34,42–44).
- Two hard-coded copies of the 12 full month names exist in the unit: `MONTHS_FULL` (reportKernel.ts:10–13) and `MONTH_NAMES` (calendarRows.ts:7–10).
- Every source file has a same-named `.test.ts` beside it; all 8 suites import only `vitest` and the sibling module (no mocks, no setup). vitest.config.ts:18 sets `environment: 'node'` and vitest.config.ts:22 includes `src/**/*.test.{ts,tsx}`, so all 8 suites are in scope of the repo's vitest run.
- Doc comments in three files state the split-out pattern explicitly: "No pdfmake imports — assembly lives in calendarReportGenerator.ts" (calendarRows.ts:2–3), same for inspectionTemplateRows.ts:2–3, and fortressChecklistRows.ts:3–7 ("Mirrors the Phase-0 pattern (complianceRows / siteSummaryRows)").

**External contract.** The rest of the app gets: deterministic day-first date formatting, `percent`, and footer page clamping (consumed by L10 documentDesignStandards, L14 pdfMakeUtils/pdfBranding); row/KPI builders consumed one-generator-per-module by L10 (calendarReportGenerator, complianceReportGenerator, fortressChecklistReportGenerator, inspectionTemplateReportGenerator); inspection pass/fail scoring consumed by L15 (pdfmakeInspectionReport) and L03 (siteCoc/reportKpis); and site-summary rows plus subsection→asset matching consumed by C14 (SiteSummaryReport.tsx). Three L10 generators also re-export this unit's data types (`CalendarReportData` et al., `FortressChecklistData`, `InspectionTemplateData`) as their own public types.

---

## src/lib/report/reportKernel.ts

- Purpose: Shared pure formatters (dates, percent, footer page numbers) used by all report builders, with explicit day-first output that is locale-independent (header comment lines 1–8).
- Public surface:
  - `formatDate(input?: Date | string | null, fallback = '—'): string` (line 28) — `"13 June 2026"` from local date components.
  - `formatDateTime(input?: Date | string | null, fallback = '—'): string` (line 35) — `"13 Jun 2026, 14:30"`, 24h local time.
  - `localDateStamp(input?: Date | string | null): string` (line 42) — `"2026-06-13"` from local components; defaults to `new Date()` when input missing/invalid (line 43).
  - `percent(numerator: number, denominator: number, fallback = '0%'): string` (line 48) — `Math.round`ed percentage string.
  - `clampPageNumbers(currentPage: number, pageCount: number, skipFirstPage: boolean): { page: number; total: number }` (line 57) — subtracts 1 from page/total when `skipFirstPage`, clamps total to ≥1 and page to `[1, total]` (lines 62–65).
  - Non-exported helpers: `toValidDate` (line 19), `pad2` (line 25), `MONTHS_FULL`/`MONTHS_SHORT` constants (lines 10–17).
- Inputs & outputs: date-ish values / numbers in, formatted strings or a `{page,total}` object out. No stores, tables, buckets, localStorage, or env vars touched.
- Dependencies: uses -> nothing (zero imports). used by <- (grep-verified) in-unit: calendarRows.ts:5, complianceRows.ts:1, fortressChecklistRows.ts:9, siteSummaryRows.ts:1; external: src/lib/documentDesignStandards.ts:9 (L10, `localDateStamp`), src/lib/pdfMakeUtils.ts:37 (L14, `clampPageNumbers`, `formatDate`), src/lib/pdfBranding.ts:12 (L14, `formatDate`/`formatDateTime` aliased as `kernelFormatDate`/`kernelFormatDateTime`), src/lib/pdfMakeUtils.footer.test.ts:3 (L14, `formatDate`).
- Side effects: none, except `localDateStamp` reads the system clock via `new Date()` when input is missing/invalid (line 43).
- Error handling: no throws anywhere. Missing/empty/unparseable dates return the `fallback` parameter (`toValidDate` returns null for `undefined`/`null`/`''`/NaN dates, lines 19–23); `percent` returns `fallback` for zero/NaN denominator or NaN numerator (line 49); `clampPageNumbers` clamps out-of-range values rather than erroring (lines 64–65).
- Tests: src/lib/report/reportKernel.test.ts covers all five exports — asserts day-first padded formatting, ISO-string parsing, em-dash fallback for empty/null/undefined/unparseable input, custom fallbacks, local (not UTC) `localDateStamp` components with `\d{4}-\d{2}-\d{2}` regex for the default-now path, divide-by-zero/NaN percent guards, and clamping so page numbers are never 0/negative or greater than total.
- Observed issues:
  - Header comment (line 2) describes the module as "pure, deterministic", but `localDateStamp()` with no argument is clock-dependent (line 43).
  - `MONTHS_FULL` (lines 10–13) duplicates `MONTH_NAMES` in calendarRows.ts:7–10.
  - `toValidDate` is not exported, so calendarRows.ts re-implements the same `new Date(...)` + `isNaN(getTime())` validity check inline (calendarRows.ts:94–95).
- ASSUMED: none.

## src/lib/report/reportKernel.test.ts

- Purpose: Vitest suite for all five reportKernel exports (import at line 2).
- Public surface: none (test file; 5 `describe` blocks, 18 `it` cases).
- Inputs & outputs: constructs `Date` objects and strings inline; no fixtures, no stores.
- Dependencies: uses -> `vitest` (line 1), `./reportKernel` (line 2, in-unit). used by <- none found (grep-verified); executed by vitest via the include glob `src/**/*.test.{ts,tsx}` (vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a (assertions only).
- Tests: is itself the test file for reportKernel.ts; assertions summarized in that section.
- Observed issues: none.
- ASSUMED: the suite passes — I did not execute the test run.

## src/lib/report/calendarRows.ts

- Purpose: Pure builders for the Calendar report — KPIs, priority tally, month grouping, and per-event table rows (header comment lines 1–4).
- Public surface:
  - Interfaces: `CalendarEvent` (line 12: id?/title?/siteName?/startDate?/endDate?/status?/priority?/eventType?, all optional strings), `CalendarStats` (line 23: totalEvents/upcomingCount/completedCount/pendingCount numbers), `CalendarReportData` (line 30: title?/subtitle?/year/events/stats?/generatedAt?), `CalendarKpi` (line 39: value/label), `PriorityBreakdown` (line 44: high/medium/low/other numbers), `MonthGroup` (line 51: key/label/events), `CalendarEventRow` (line 57: title/site/type/dates/status/priority strings).
  - `buildCalendarKpis(stats?: CalendarStats): CalendarKpi[]` (line 67) — four KPIs; zeroes when stats absent (line 68). Doc comment (line 66): "upcoming needs 'now', so it is supplied, never derived here".
  - `buildPriorityBreakdown(events: CalendarEvent[]): PriorityBreakdown` (line 78) — case-insensitive trim+lowercase tally; unrecognized/missing priority increments `other` (lines 81–85).
  - `groupEventsByMonth(events: CalendarEvent[]): MonthGroup[]` (line 91) — Map keyed `"YYYY-MM"`, chronological sort via `y*12+m`; missing/unparseable start dates get key `'undated'`, label `'Undated'`, sort `Infinity` so they land last (lines 98–100, 104–106).
  - `buildEventRows(events: CalendarEvent[]): CalendarEventRow[]` (line 110) — trims each field with `'—'` fallback; `dates` is `"start – end"` only when the end formats to something other than `'—'`, else start alone (lines 112–118).
- Inputs & outputs: in-memory `CalendarEvent[]`/`CalendarStats` in, KPI/breakdown/group/row arrays out. No stores.
- Dependencies: uses -> `formatDate` from `./reportKernel` (line 5, in-unit). used by <- src/lib/calendarReportGenerator.ts:8–14 (L10; imports `buildCalendarKpis`, `buildPriorityBreakdown`, `groupEventsByMonth`, `buildEventRows`, type `CalendarReportData`; call site for `buildPriorityBreakdown` at calendarReportGenerator.ts:33) and the type re-export `export type { CalendarReportData, CalendarEvent, CalendarStats } from './report/calendarRows'` at calendarReportGenerator.ts:18 (grep-verified).
- Side effects: none (pure; builds a local `Map`).
- Error handling: no throws. Invalid dates route to the `Undated` group (lines 95–99); blank fields become `'—'` (lines 115–120); absent stats become zeros (line 68).
- Tests: src/lib/report/calendarRows.test.ts — asserts KPI order/values and the zeros-when-absent path; case-insensitive priority tally with `other` bucketing; chronological month grouping with full "Month YYYY" labels, `Undated` collected last, empty input → `[]`; event-row field mapping, combined `"13 June 2026 – 14 June 2026"` range, start-only when no end date, and em-dash fallbacks for all five text fields.
- Observed issues:
  - `MONTH_NAMES` (lines 7–10) duplicates reportKernel's `MONTHS_FULL` (reportKernel.ts:10–13).
  - `CalendarReportData` fields `title`, `subtitle`, `year`, `generatedAt` (lines 31–36) are not read by any function in this file.
  - In `buildEventRows`, an event with a missing/invalid `startDate` but valid `endDate` renders `dates` as `"— – <end>"` (start is the em-dash fallback from line 112, and the condition at line 118 only inspects `end`); this path is not covered by the test file.
  - Date validity check at lines 94–95 re-implements reportKernel's non-exported `toValidDate` logic inline.
- ASSUMED: `CalendarReportData`'s unused-here fields are consumed by calendarReportGenerator.ts (L10) — inferred from the re-export and the doc comment at line 3, not traced call-by-call.

## src/lib/report/calendarRows.test.ts

- Purpose: Vitest suite for the four calendarRows builders (imports at lines 2–8).
- Public surface: none (4 `describe` blocks, 9 `it` cases; local `base` fixture object at lines 58–61).
- Inputs & outputs: inline literals only; no stores.
- Dependencies: uses -> `vitest` (line 1), `./calendarRows` (lines 2–8, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under calendarRows.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed.

## src/lib/report/complianceRows.ts

- Purpose: Builds the six-row compliance summary table (metric/count/percentage) with divide-by-zero-safe percentages (doc comment line 18).
- Public surface:
  - `interface ComplianceStats` (line 3: total/compliant/nonCompliant/expiringSoon/expired/pendingReview, all numbers).
  - `interface ComplianceSummaryRow` (line 12: metric string, count number, percentage string).
  - `buildComplianceSummaryRows(stats: ComplianceStats): ComplianceSummaryRow[]` (line 19) — fixed row order: Total Items, Compliant, Non-Compliant, Expiring Within 90 Days, Expired, Pending Review (lines 21–28); each percentage is `percent(count, stats.total)`; the Total Items row uses `percent(t, t)` (line 22).
- Inputs & outputs: a `ComplianceStats` object in, a 6-element row array out. No stores.
- Dependencies: uses -> `percent` from `./reportKernel` (line 1, in-unit). used by <- src/lib/complianceReportGenerator.ts:35 (L10, `buildComplianceSummaryRows`) (grep-verified).
- Side effects: none.
- Error handling: no throws; `percent`'s fallback handles `total === 0` (every percentage becomes `'0%'`, including the Total Items row).
- Tests: src/lib/report/complianceRows.test.ts — asserts a rounded 25% for 1-of-4, no `NaN` substring in any percentage when total is 0, Non-Compliant `'0%'` at total 0, and Total Items `'100%'` with items / `'0%'` with none.
- Observed issues: the file does not validate that the five category counts sum to `total`; each row's percentage is computed independently against `stats.total` (lines 22–27) — stated factually.
- ASSUMED: none.

## src/lib/report/complianceRows.test.ts

- Purpose: Vitest suite for `buildComplianceSummaryRows` (import at line 2).
- Public surface: none (1 `describe`, 3 `it` cases; `stats` partial-override factory at lines 4–6).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./complianceRows` (line 2, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under complianceRows.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed.

## src/lib/report/fortressChecklistRows.ts

- Purpose: Pure row/KPI builders for the Fortress Site Close-Out Checklist report, kept free of pdfmake so they run in the node test env (header comment lines 1–8).
- Public surface:
  - `type StatusLevel = 'success' | 'warning' | 'error' | 'muted'` (line 11).
  - Interfaces: `FortressChecklistItem` (line 13: id?/label/isChecked/isNotApplicable/checkedAt?), `FortressChecklistSection` (line 21: name/progress/items), `FortressChecklistData` (line 27: title?/siteName?/siteId?/overallProgress/sections/stats {completed,pending,notApplicable,total}/generatedAt?), `FortressKpi` (line 37: value/label/level), `FortressItemRow` (line 43: status 'Done'|'Pending'|'N/A', label, completed).
  - `progressLevel(progress: number): StatusLevel` (line 50) — ≥80 `'success'`, ≥50 `'warning'`, else `'error'`.
  - `buildFortressKpis(data: FortressChecklistData): FortressKpi[]` (line 57) — four KPIs: Overall Progress (`${overallProgress}%`, level from `progressLevel`), Completed/'success', Pending/'warning', Not Applicable/'muted'.
  - `buildFortressItemRows(section: FortressChecklistSection): FortressItemRow[]` (line 67) — status precedence N/A → Done → Pending (line 69); `completed` date only when `!isNotApplicable && isChecked`, formatted via `formatDate(item.checkedAt)`, else `'—'` (line 71); blank label → `'—'` (line 70).
- Inputs & outputs: in-memory checklist data in, KPI/row arrays out. No stores.
- Dependencies: uses -> `formatDate` from `./reportKernel` (line 9, in-unit). used by <- src/lib/fortressChecklistReportGenerator.ts:11–16 (L10; imports `buildFortressKpis`, `buildFortressItemRows`, types `FortressChecklistData`, `StatusLevel`) plus the type re-export at fortressChecklistReportGenerator.ts:20 (grep-verified).
- Side effects: none.
- Error handling: no throws; checked-with-no-date yields `'—'` via `formatDate(undefined)`'s fallback; blank labels guarded (line 70).
- Tests: src/lib/report/fortressChecklistRows.test.ts — asserts the 80/50 traffic-light boundaries (80→success, 79→warning, 49→error); KPI order/values and that 75% maps to `'warning'`; N/A winning over checked with no date printed; Done + `"13 June 2026"` for a checked item; Done + em-dash when no `checkedAt`; Pending for unchecked; em-dash for whitespace-only label; order/count preservation across a 3-item section.
- Observed issues:
  - `progressLevel` has no consumer outside this unit — grep for `progressLevel` outside src/lib/report returns nothing; in-unit it is called at line 59 and tested directly.
  - `FortressChecklistData` fields `title`, `siteName`, `siteId`, `sections`, `generatedAt` (lines 28–34) are not read by either builder in this file (`buildFortressKpis` reads only `overallProgress` and `stats`).
  - `data.overallProgress` is interpolated into the KPI value without clamping or rounding (line 59) — stated factually.
- ASSUMED: the unused-here `FortressChecklistData` fields are consumed by fortressChecklistReportGenerator.ts (L10) — inferred from the re-export at its line 20, not traced call-by-call.

## src/lib/report/fortressChecklistRows.test.ts

- Purpose: Vitest suite for `progressLevel`, `buildFortressKpis`, `buildFortressItemRows` (imports at lines 2–8).
- Public surface: none (3 `describe` blocks, 11 `it` cases; `data` factory lines 10–15, `section` factory lines 45–47).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./fortressChecklistRows` (lines 2–8, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under fortressChecklistRows.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed.

## src/lib/report/inspectionScore.ts

- Purpose: Inspection quality score — the percentage of assessed items that passed, where pending/N-A items are excluded from the denominator and a nothing-assessed inspection scores 100 (header comment lines 1–11).
- Public surface:
  - `scorePercentage(passCount: number, failCount: number): number` (line 12) — `Math.round(pass / (pass+fail) * 100)`, or 100 when `pass+fail === 0` (line 14).
  - `isPassStatus(status: string): boolean` (line 20) — lowercase membership in `PASS_WORDS = ['pass','passed','yes','compliant','ok','good','complete','completed']` (line 17).
  - `isFailStatus(status: string): boolean` (line 23) — membership in `FAIL_WORDS = ['fail','failed','no','non-compliant','bad','critical']` (line 18).
  - `itemStatusKind(item: { value?: unknown }): 'pass' | 'fail' | 'pending'` (line 28) — boolean `value` maps directly (true→pass, false→fail); otherwise `String(value ?? '')` is run through the word lists; anything unrecognized is `'pending'` (lines 29–32).
- Inputs & outputs: counts / status strings / `{value}` objects in; number, boolean, or literal-union out. No stores.
- Dependencies: uses -> nothing (zero imports; does not use reportKernel). used by <- src/lib/pdfmakeInspectionReport.ts:23 (L15; `scorePercentage`, `isPassStatus`, `isFailStatus`) and src/lib/siteCoc/reportKpis.ts:6 (L03; `itemStatusKind`, `scorePercentage`) (grep-verified).
- Side effects: none.
- Error handling: no throws; `String(item.value ?? '')` absorbs null/undefined into `''` → `'pending'`.
- Tests: src/lib/report/inspectionScore.test.ts — asserts boolean mapping (true→pass, false→fail); case-insensitive vocabulary mapping ('Pass', 'compliant', 'FAIL', 'non-compliant'); N/A / 'pending' / '' / missing value all → `'pending'`; and for `scorePercentage`: 17-pass-0-fail → 100 (comment cites the Yarona-Ackermans case where the old 17/22 formula gave 77%), 3/1 → 75, 1/1 → 50, 0/0 → 100.
- Observed issues:
  - `isPassStatus`/`isFailStatus` are exported and imported by pdfmakeInspectionReport.ts:23, but the test file imports only `scorePercentage` and `itemStatusKind` (inspectionScore.test.ts:2) — the word lists are exercised only indirectly through `itemStatusKind`.
  - Negative or non-integer inputs to `scorePercentage` are not guarded (line 13–14) — stated factually; no consumer passing such values was observed.
- ASSUMED: none.

## src/lib/report/inspectionScore.test.ts

- Purpose: Vitest suite for `scorePercentage` and `itemStatusKind` (import at line 2).
- Public surface: none (2 `describe` blocks, 7 `it` cases).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./inspectionScore` (line 2, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under inspectionScore.ts.
- Observed issues: does not import or directly test `isPassStatus`/`isFailStatus` (line 2).
- ASSUMED: suite passes; not executed.

## src/lib/report/inspectionTemplateRows.ts

- Purpose: Pure builders for the Inspection Template (blank structure) report — per-field rows and header meta (header comment lines 1–4).
- Public surface:
  - Interfaces: `TemplateItem` (line 6: label?/type?/required?/options?), `TemplateSection` (line 13: title?/items?), `InspectionTemplateData` (line 18: title?/subtitle?/templateName/category?/description?/sections/generatedAt?), `TemplateItemRow` (line 28: label/type/required/options strings), `TemplateMetaRow` (line 35: label/value).
  - `buildTemplateItemRows(section: TemplateSection): TemplateItemRow[]` (line 41) — one row per item; `required` → `'Yes'`/`'No'`; `options` joined with `', '` or `'—'`; blank label/type → `'—'` (lines 42–47).
  - `buildTemplateMeta(data: InspectionTemplateData): TemplateMetaRow[]` (line 51) — three rows: Category (trimmed or `'—'`), Sections (count), Total Fields (sum of `items.length` across sections, lines 53–58). Doc comment (line 50): description is rendered separately as prose.
- Inputs & outputs: template structure objects in, row/meta arrays out. No stores.
- Dependencies: uses -> nothing (zero imports; does not use reportKernel). used by <- src/lib/inspectionTemplateReportGenerator.ts:11–15 (L10; imports `buildTemplateMeta`, `buildTemplateItemRows`, type `InspectionTemplateData`) plus the type re-export at inspectionTemplateReportGenerator.ts:19 (grep-verified).
- Side effects: none.
- Error handling: no throws; `section.items || []` and `data.sections || []` guard missing arrays (lines 42, 52); blanks become `'—'`.
- Tests: src/lib/report/inspectionTemplateRows.test.ts — asserts Yes/No mapping and `'Good, Fair, Poor'` option joining; `'No'` + `'—'` when required/options absent; em-dash for blank label/type; `[]` for a section with no items; section and total-field counting across two sections; em-dash category and `'0'` Total Fields on empty data.
- Observed issues: `InspectionTemplateData` fields `title`, `subtitle`, `templateName`, `description`, `generatedAt` (lines 19–25) are not read by either builder in this file, and `templateName` is the interface's only required string field.
- ASSUMED: the unused-here fields are consumed by inspectionTemplateReportGenerator.ts (L10) — inferred from its type re-export, not traced call-by-call.

## src/lib/report/inspectionTemplateRows.test.ts

- Purpose: Vitest suite for `buildTemplateItemRows` and `buildTemplateMeta` (imports at lines 2–7).
- Public surface: none (2 `describe` blocks, 6 `it` cases; `section` factory line 10, `data` factory lines 37–39).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./inspectionTemplateRows` (lines 2–7, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under inspectionTemplateRows.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed.

## src/lib/report/siteSummaryRows.ts

- Purpose: Row builders for the Site Summary report's COC-validation and inspection tables, with guarded fields and no truncation (doc comments lines 29, 39).
- Public surface:
  - Interfaces: `CocSubsectionInput` (line 3: name?/coc_number?/coc_status?/coc_issue_date?, all `string | null`), `CocValidationRow` (line 9: subsection/cocNumber/status/date), `InspectionInput` (line 16: title?/status?/inspector_name?/inspection_date?), `InspectionRow` (line 22: title/status/inspector/date).
  - `buildCocValidationRows(subsections: CocSubsectionInput[]): CocValidationRow[]` (line 30) — fallbacks: name→`'Unknown'`, coc_number→`'-'`, coc_status→`'Missing'`; date via `formatDate` (lines 31–36).
  - `buildInspectionRows(inspections: InspectionInput[]): InspectionRow[]` (line 40) — fallbacks: title→`'Untitled'`, status→`'Unknown'`, inspector_name→`'-'`; date via `formatDate` (lines 41–46).
- Inputs & outputs: snake_case row inputs (shape mirrors DB columns) in, display rows out. No stores touched by this file itself.
- Dependencies: uses -> `formatDate` from `./reportKernel` (line 1, in-unit). used by <- src/components/SiteSummaryReport.tsx:25 (C14; both builders) (grep-verified).
- Side effects: none.
- Error handling: no throws; every nullable field has a string fallback; invalid dates render `'—'` via `formatDate`.
- Tests: src/lib/report/siteSummaryRows.test.ts — asserts 23 COC rows and 25 inspection rows pass through untruncated ("no 20-row cap" in both test names); day-first date formatting; and the full fallback set (`'Unknown'`/`'-'`/`'Missing'`/`'—'` for COC rows, `'Untitled'`/`'Unknown'`/`'-'`/`'—'` for inspection rows).
- Observed issues: this is the only module in the unit using ASCII hyphen `'-'` (lines 33, 44) alongside the kernel's em-dash `'—'` date fallback within the same row — two different dash glyphs can appear in one output row.
- ASSUMED: the snake_case input fields correspond to `subsections`/`inspections` table columns — inferred from naming; this file performs no queries.

## src/lib/report/siteSummaryRows.test.ts

- Purpose: Vitest suite for `buildCocValidationRows` and `buildInspectionRows` (import at line 2).
- Public surface: none (2 `describe` blocks, 4 `it` cases; generates 23/25-element arrays with `Array.from`).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./siteSummaryRows` (line 2, in-unit). used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under siteSummaryRows.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed. The "no 20-row cap" test names reference a prior truncation behaviour I did not verify historically.

## src/lib/report/subsectionAssetMatch.ts

- Purpose: Resolves the electrical-meter `site_assets` row for a subsection — serial-number identity join first, then a legacy premises_id/trade_as name-suffix fallback — mirroring the Asset Verification tab/report join so both surfaces print the same breaker_size (doc comment lines 20–30).
- Public surface:
  - `interface MatchableAsset` (line 3: meter_serial_number?/premises_id?/trade_as?/breaker_size?, all `string | null`).
  - `interface MatchableSubsection` (line 10: name?/meter_serial_number?).
  - `matchAssetForSubsection<T extends MatchableAsset>(sub: MatchableSubsection, assets: T[]): T | undefined` (line 32) — (1) normalizes both serials with `normalizeMeterSerial` and returns the first asset whose usable normalized serial equals the subsection's (lines 36–43); (2) otherwise lowercase-trims the subsection name and returns the first asset whose `premises_id` or `trade_as` equals it or ends with `` ` - ${name}` `` / `` `-${name}` `` (lines 45–60); (3) `undefined` when neither matches.
  - Non-exported: `isUsableSerial(s: string)` (line 18) — rejects `''`, `'NA'`, `'TBC'`.
- Inputs & outputs: subsection + asset array in, matched asset (generic `T`) or `undefined` out. No stores touched by this file itself.
- Dependencies: uses -> `normalizeMeterSerial` from `@/lib/assetVerification` (line 1, unit L08; that function uppercases and strips non-alphanumerics, assetVerification.ts:82–84). used by <- src/components/SiteSummaryReport.tsx:12 (C14) (grep-verified).
- Side effects: none.
- Error handling: no throws; empty/sentinel serials skip the serial join; empty subsection name short-circuits to `undefined` (line 46).
- Tests: src/lib/report/subsectionAssetMatch.test.ts — asserts serial matching ignores punctuation/case (`"ab 12-34"` matches `"AB1234"`); serial join beats a competing name match; premises_id suffix fallback (`"YA - KIOSK"` matches name `"Kiosk"`); trade_as suffix fallback; `"n/a"`/`"NA"` serials treated as not-a-serial with fallback to name matching; `undefined` when nothing matches.
- Observed issues:
  - `isUsableSerial` (line 18) hard-codes `'NA'`/`'TBC'` to mirror the `SENTINELS` set in assetVerification.ts:79, which is module-private there — a manual-sync invariant the file's own comment acknowledges (lines 15–17: "parity with the SENTINELS set in assetVerification.ts").
  - This is the only file in the unit with an import from outside `src/lib/report`, and the only one consumed exclusively by a component (SiteSummaryReport.tsx) rather than a lib-level generator.
- ASSUMED: that Asset Verification (L08) actually joins by the same key order (serial then name) — the doc comment claims parity; I verified `normalizeMeterSerial` and `SENTINELS` exist in assetVerification.ts but did not trace L08's own matching flow.

## src/lib/report/subsectionAssetMatch.test.ts

- Purpose: Vitest suite for `matchAssetForSubsection` (import at line 2).
- Public surface: none (1 `describe`, 6 `it` cases; `asset` partial-override factory at lines 4–10).
- Inputs & outputs: inline literals; no stores.
- Dependencies: uses -> `vitest` (line 1), `./subsectionAssetMatch` (line 2, in-unit). Note: exercising the module transitively executes `normalizeMeterSerial` from `@/lib/assetVerification` (L08) un-mocked. used by <- none found (grep-verified); run via vitest.config.ts:22.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; assertions summarized under subsectionAssetMatch.ts.
- Observed issues: none.
- ASSUMED: suite passes; not executed.
