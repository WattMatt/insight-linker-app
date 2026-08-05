# L03 — coc-reporting-status

- Unit id: L03
- Slug: coc-reporting-status
- Spec mode: full
- Date: 2026-07-29
- Files: 11 (6 source + 5 tests, per review/unit-files.json "L03")

## Unit header

**Unit purpose (as-is).** Transforms imported COC register data (subsection rows, `coc_certificates`-shaped rows, `coc_schedule`-shaped rows) into a typed report model (`cocReportModel.ts`), renders that model as a landscape pdfmake document definition (`siteCocReport.ts`), and computes the site-wide KPI block embedded in that report (`reportKpis.ts`). Alongside the report pipeline it provides the shared status→tone display vocabulary (`statusDisplay.ts`), the register-verdict→document-status mapper (`verdictMap.ts`), and a client-portal COC summary row builder (`clientCocSummary.ts`).

**Module-level observations (cross-file, verified).**
- Every source file in the unit is pure computation: no network calls, no Supabase client, no storage, no localStorage/IndexedDB, no env vars anywhere in the 6 source files (verified by reading each file in full; only imports are type/logic imports and `pdfmake/interfaces` types at siteCocReport.ts:1).
- No `try/catch` exists anywhere in the unit; robustness is via nullish coalescing, `Math.max`/clamping, and empty-collection defaults (see per-file Error handling).
- Three status vocabularies coexist in/adjacent to the unit: `VerdictKind = "pass"|"fail"|"review"|"cv"|"pending"` (cocReportModel.ts:3), `docStatusFromVerdict`'s `"Pass"|"Fail"|"Pending"` (verdictMap.ts:7), and the subsection `coc_status` string vocabulary `'Pass'|'Pending'|'Missing'|'Fail'|'N/A'|null` documented in a comment at clientCocSummary.ts:9. This matches the "three status vocabularies" note the manifest records against L09.
- `Tone = "green"|"red"|"amber"|"slate"` (statusDisplay.ts:1) is the shared display currency: siteCocReport.ts:8-13 maps it to PDF hex fills, statusDisplay.ts:31-44 maps it to Tailwind classes, clientCocSummary.ts:2 re-exports it into portal rows.
- The PDF colour palette is hex literals inside siteCocReport.ts (`FILL`/`TEXT`/`TONE` at lines 6-13, `TINT` at lines 193-198), parallel to (not derived from) the Tailwind class maps `TONE_PILL`/`TONE_CELL` in statusDisplay.ts:31-44.
- 5 of the 6 source files are test-paired; `siteCocReport.ts` (the 291-line renderer) has no test file (no `siteCocReport.test.*` exists; grep for `siteCocReport` finds only consumers and comments — see its "used by" line).
- All 5 test files run under the root vitest config (include pattern `src/**/*.test.{ts,tsx}`, vitest.config.ts:23); executed 2026-07-29: 5 files, 26 tests, all pass.

**External contract (what the rest of the app gets).**
- `buildCocReportModel` + model types → C03 client-portal-components (ClientCocView.tsx:18) and V06 site-coc-tab (ReportSubTab.tsx:9).
- `buildSiteCocReportDocDef` → C03 (ClientCocView.tsx:19) and V06 (ReportSubTab.tsx:11); callers feed the returned `TDocumentDefinitions` to the pdfmake engine (L14) themselves.
- `buildSiteKpiBlock` / `SiteKpiBlock` → V01 (SiteDetail.tsx:33, value import) and V06 (SiteCocTab.tsx:8, ReportSubTab.tsx:10, type-only).
- `scheduleStatusTone` / `verdictTone` / `ruleTone` / `TONE_PILL` / `TONE_CELL` / `Tone` → C03 and five V06 files.
- `docStatusFromVerdict` → L04 coc-pool-ingestion (assignPoolFile.ts:4) and V06 (useSiteCocImport.ts:7).
- `buildClientCocSummary` + row/input types → C03 (ClientCocView.tsx:12-16).

---

## src/lib/siteCoc/cocReportModel.ts

- Purpose: Pure builder that assembles the complete COC status-report view model (`CocReportModel`) from subsection, certificate and schedule rows, plus the `verdictKind` classifier.
- Public surface:
  - `type VerdictKind = "pass" | "fail" | "review" | "cv" | "pending"` (line 3).
  - Interfaces `ReportCert` (lines 5-9), `ReportTenant` (10-15), `ScheduleTableRow` (16-19), `VerificationRow` (20), `FileRegisterRow` (21-24), `CocReportModel` (25-36), `BuildInput` (49).
  - `verdictKind(verdict: string, rules: Record<string,string> | null): VerdictKind` (line 51).
  - `buildCocReportModel(input: BuildInput): CocReportModel` (line 66).
  - Non-exported input row shapes `SubRow` (38), `CertRow` (39-44), `SchedRow` (45-48).
- Inputs & outputs: In — `BuildInput` carrying `siteName`, `generatedAt`, `lastImport`, optional `clientName`/`address`/`siteKpis`, and arrays shaped like `subsections` (id/name/tenant_name/is_coc_required), `coc_certificates` rows (cert_no, cert_type, verdict, rules JSON, issued_date, coc/eval document ids, plus optional register columns shop_no_raw/doc_type/clause_9_2/confidence/source_file/notes), and `coc_schedule` rows. Out — a single `CocReportModel` object (cover, summary, kpis, issues, tenants, scheduleTable, verificationRows, fileRegister). No stores, tables, buckets, or env vars touched; callers fetch the DB rows.
- Dependencies: uses -> `type SiteKpiBlock` from `./reportKpis` (line 1, in-unit L03). used by <- src/lib/siteCoc/siteCocReport.ts:3 (in-unit, types only); src/components/client-portal/ClientCocView.tsx:18 (C03); src/views/site-coc/ReportSubTab.tsx:9 (V06); src/lib/siteCoc/cocReportModel.test.ts:2 (grep-verified).
- Side effects: none — pure function of its input; builds Maps internally (lines 68-76) and returns a new object.
- Error handling: no throw paths and no try/catch. Null `rules` coerced via `Object.values(rules || {})` (line 53) and `c.rules ?? {}` (line 87); certificates with null `subsection_id` are skipped for tenant grouping (line 70); missing schedule fields default to `""`/`null` via `??` (lines 102-103, 126-128, 133, 138-140); division by zero guarded by `required.length ?` ternaries (lines 114, 147). Unknown non-empty verdict text returns `"review"` (comment + line 59-60).
- Tests: `src/lib/siteCoc/cocReportModel.test.ts` (see its section). Asserts verdict classification incl. the review-not-pass default, summary counts restricted to COC-required subsections, issues lists, tenant register/coverage/action assembly, exclusion of non-required subsections, schedule/verification/file-register table pass-through, cover fields, and KPI arithmetic.
- Observed issues (factual):
  - Rule-value `"FAIL"` overrides any verdict text (line 54), but rule-value `"CV"` does not override a `PASS`/`REVIEW` verdict text (lines 55-57); asserted at cocReportModel.test.ts:8 (`verdictKind("PASS — minor (C14)", { C14: "CV" })` → `"pass"`).
  - `summary.clear` counts every required tenant that is neither no-COC nor holder of a fail-verdict cert (line 111) — tenants whose overall coverage verdict is `"review"`, `"cv"` or `"pending"` (with at least one cert) count as clear; the renderer's narrative labels this count "clear (Pass)" (siteCocReport.ts:188).
  - Certificates with `subsection_id: null` are excluded from tenants/kpis (line 70) but included in `verificationRows` and `fileRegister`, which map over `input.certificates` unfiltered (lines 132-142); `scheduleTable` likewise maps over all `input.schedule` rows including null-subsection rows (line 124-130).
  - All three data tables sort by plain `localeCompare` without numeric option (lines 130, 134, 142), i.e. lexicographic ordering of shop numbers/file names.
  - `kpis.outstanding` is the total count of action strings (line 121): one per no-COC tenant plus one per fail-verdict cert (lines 98-100).
- ASSUMED: the `CertRow`/`SchedRow` field names correspond to `coc_certificates` / `coc_schedule` table columns populated by the L01 import pipeline (inferred from naming and from V06 `useSiteCocImport` usage; not verified against migrations in this spec).

## src/lib/siteCoc/cocReportModel.test.ts

- Purpose: Vitest suite for `verdictKind` and `buildCocReportModel`.
- Public surface: none (test module; four `describe` blocks, 11 `it` cases).
- Inputs & outputs: In — inline fixtures: 3 subsections (2 COC-required, 1 not; lines 19-23), 2 certificates for subsection "a" (PASS + FAIL{C8}; lines 24-27), 1 schedule row (line 28), plus richer `schedule2`/`certs2` fixtures with register columns (lines 56-64). Out — assertions only.
- Dependencies: uses -> `vitest` (line 1), `./cocReportModel` (line 2, in-unit). used by <- none found (grep-verified; only the vitest include glob picks it up, vitest.config.ts:23).
- Side effects: none.
- Error handling: n/a (test file).
- Tests: this file *is* the coverage. Asserts: `verdictKind` classification for fail/pass/review/cv/pending (lines 5-12) and the unknown-verdict→review safe default (lines 13-16); `summary.required`=2 / `noCoc`=1 / `failed`=1 (lines 32-36); issues lists name TELKOM (no COC) and ACK B2 C8 (lines 37-40); tenant rows carry register cert numbers, coverage flag, and action wording ("remediate", "no coc") (lines 41-49); non-required "STORE" absent from tenants (lines 50-52); `scheduleTable` row carries raw status/trading/files/notes (lines 67-69); `verificationRows` carry per-rule values (lines 70-74); `fileRegister` carries file/matched/docType/clause92/conf (lines 75-77); cover carries client + address (lines 82-84); KPI values cocCoveragePct=50, evalCoveragePct=50, verdict fail=1/pass=1, outstanding=2 (lines 85-91).
- Observed issues: none observed.
- ASSUMED: nothing.

## src/lib/siteCoc/siteCocReport.ts

- Purpose: Renders a `CocReportModel` into a pdfmake `TDocumentDefinitions` — cover page with gauge, executive summary with tinted KPI cards, and three data tables (schedule, SANS verification grid, file register) — in landscape.
- Public surface: `buildSiteCocReportDocDef(model: CocReportModel, logoDataUrl?: string | null, qrCodeDataUrl?: string | null): TDocumentDefinitions` (line 132). Everything else is module-private: `FILL`/`TEXT`/`TONE` colour maps (6-13), `shortVerdict`/`glyph`/`ruleFill`/`hcell` (14-18), `scheduleTableContent` (20), `verificationContent` (39), `fileRegisterContent` (70), `miniBar` (94), `verdictBar` (99), `gaugeBar` (112), `stripeLayout` (125).
- Inputs & outputs: In — the model plus optional logo and QR data-URLs. Out — a pdfmake document-definition object with `pageOrientation: "landscape"` (line 275), a per-page footer closure (278-284), and a `pageBreakBefore` callback that breaks before `headlineLevel === 1` nodes only when the current page already has content (287-288). No stores, no env vars; the actual PDF generation happens in callers via L14 (`generatePdfBlob`, ClientCocView.tsx:20).
- Dependencies: uses -> `pdfmake/interfaces` types (line 1); `COC_SANS_RULES` from `./sansRules` (line 2, L01 coc-import-pipeline); model types from `./cocReportModel` (line 3, in-unit); `scheduleStatusTone`, `verdictTone`, `type Tone` from `./statusDisplay` (line 4, in-unit). used by <- src/components/client-portal/ClientCocView.tsx:19 (C03); src/views/site-coc/ReportSubTab.tsx:11 (V06); comment-only mentions in src/lib/pdfBars.ts:13,98 (L14) and src/lib/assetVerificationReportModel.ts:2 (L08) (grep-verified).
- Side effects: none — pure builder; the footer and pageBreakBefore closures execute later inside pdfmake.
- Error handling: no try/catch, no throws. Empty schedule gets a "No schedule imported." colSpan-8 row (line 35); percentage inputs clamped to 0-100 (lines 95, 113); `verdictBar` divides by `Math.max(1, total)` (line 100); metering percentage falls back to 100 when `meteringTotal` is falsy (line 225); missing text cells render "—" throughout.
- Tests: none — no test file exists for this module; no test imports it (grep-verified). Behaviour of its two tone dependencies is tested in statusDisplay.test.ts.
- Observed issues (factual):
  - Bars/gauges are deliberately built as 2-or-N-cell tables, never canvases, per in-code comments citing pdf.js mis-positioning of canvases in table cells (lines 90-92, 110-111) and pdf.js row-stretch with fixed outer heights (lines 205-207).
  - `ruleFill("")` returns `FILL.pass` (line 16 falls through), so a not-captured rule cell (glyph "·", legend at line 268) renders with the pass-green fill `#E1F5EE`; `FILL.review` (line 6) is defined but never returned by `ruleFill`.
  - `verificationContent` computes header blanks as `blanks(A.length - 1)` etc. (lines 49-51), which requires each SANS group non-empty; the current catalogue has A=6, B=4, C=12 entries (grep counts of `group: "A"|"B"|"C"` in src/lib/siteCoc/sansRules.ts).
  - Brand fallback text "WATSON MATTHEUS / CONSULTING ELECTRICAL ENGINEERS" (lines 139-141), "Prepared by Watson Mattheus…" (line 175) and footer "Watson Mattheus · Confidential" (line 281) are hardcoded strings.
  - `pageBreakBefore` calls `opts.getPreviousNodesOnPage()` (line 288); this matches the installed pdfmake 0.3.7 API, which passes an object of getter functions as the second argument (node_modules/pdfmake/js/LayoutBuilder.js:94-122; package.json:71 pins `^0.3.2`).
  - `verdictBar` merges `review + cv` into one amber segment (lines 102-103); the card caption prints them combined as "R/CV" (line 223).
  - Comments at lines 191 and 194 write "pd.js" where surrounding comments write "pdf.js".
- ASSUMED: rendered output layout (page breaks, card equalization) behaves as the comments describe in pdf.js — inferred from comments, not re-verified by generating a PDF in this review.

## src/lib/siteCoc/reportKpis.ts

- Purpose: Pure assembly of the site-wide KPI block (`SiteKpiBlock`) for the COC report summary page, reusing shared deliverables/aging/expiry helpers so report and dashboard stay consistent (header comment, lines 1-2).
- Public surface:
  - `interface SiteKpiBlock` — readinessPct, snagsOpen, snagsHighRisk, snagsClosed, oldestOpenDays (number|null), inspectionPassPct, inspectionPass, inspectionFail, meteringDone, meteringTotal, expiry {expired, within30, within90} (lines 8-20).
  - `inspectionPassRate(inspections: { json_data?: { sections?: { items?: { value?: unknown }[] }[] } }[]): { pass: number; fail: number; pct: number }` (line 23).
  - `buildSiteKpiBlock(input: { deliverablesSummary: DeliverablesLite; snags: SnagLite[]; subsections: SubsectionForExpiry[]; inspections: …; today: string }): SiteKpiBlock` (line 41).
  - Non-exported `DeliverablesLite` (line 38), `SnagLite extends SnagForAging` adding status/risk_level (line 39).
- Inputs & outputs: In — deliverables summary (completionPct + per-key done/total), snag rows, subsection expiry rows, inspection `json_data` checklists, and a `today` ISO date string supplied by the caller. Out — one `SiteKpiBlock`. No stores/env.
- Dependencies: uses -> `snagStatusBucket` from `../subsectionStatus` (line 3, L17; export at src/lib/subsectionStatus.ts:31); `BLOCKING_RISK_LEVELS` from `../siteHealth` (line 4, L17; `['Critical','High']` at src/lib/siteHealth.ts:36); `snagAging`, `cocExpiryBuckets`, `type SubsectionForExpiry`, `type SnagForAging` from `../kpiMetrics` (line 5, L09); `itemStatusKind`, `scorePercentage` from `../report/inspectionScore` (line 6, L07). used by <- src/lib/siteCoc/cocReportModel.ts:1 (in-unit, type-only); src/views/SiteDetail.tsx:33 (V01, value import of `buildSiteKpiBlock`); src/views/site-coc/SiteCocTab.tsx:8 and src/views/site-coc/ReportSubTab.tsx:10 (V06, type-only `SiteKpiBlock`); src/lib/siteCoc/reportKpis.test.ts:2 (grep-verified).
- Side effects: none — pure.
- Error handling: no try/catch. Missing `json_data`/`sections`/`items` default to empty arrays via `?? []` (lines 27-28); items that are neither pass nor fail (pending/N-A per `itemStatusKind`) are simply not counted (lines 29-31); missing "metering" deliverable yields done/total 0 via `?? 0` (line 67); null `risk_level` coerced to `""` before the blocking-levels check (line 57).
- Tests: `src/lib/siteCoc/reportKpis.test.ts` (see its section).
- Observed issues (factual): high-risk snag counting reads `BLOCKING_RISK_LEVELS.includes(s.risk_level || "")` (lines 56-57), i.e. exact string match against `'Critical'`/`'High'`; `inspectionPassRate` of an empty input returns `pct: 100` (via `scorePercentage(0,0)`; asserted at reportKpis.test.ts:18-20).
- ASSUMED: the semantics of `snagStatusBucket`, `snagAging`, `cocExpiryBuckets`, `itemStatusKind`, `scorePercentage` are as their home units define them (L17/L09/L07); only their signatures and call sites were verified here.

## src/lib/siteCoc/reportKpis.test.ts

- Purpose: Vitest suite for `inspectionPassRate` and `buildSiteKpiBlock`.
- Public surface: none (2 `describe` blocks, 4 `it` cases).
- Inputs & outputs: In — inline fixtures: checklist items with boolean/string values (lines 6-16), a deliverables summary with metering 28/28 (lines 24-30), 3 snags (2 open incl. 1 Critical, 1 rectified; lines 31-35), 2 subsections (one expiring 2026-07-05 vs today 2026-06-20; lines 36-39), 1 inspection (lines 40-42). Out — assertions.
- Dependencies: uses -> `vitest` (line 1), `./reportKpis` (line 2, in-unit). used by <- none found (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: asserts pass/fail tally excludes "N/A" (lines 5-10), aggregation across inspections with mixed-case values → {2,1,67} (lines 11-17), empty input → pct 100 (lines 18-20); and for `buildSiteKpiBlock`: readinessPct 63, metering 28/28, snagsOpen 2 / highRisk 1 / closed 1, oldestOpenDays > 100, inspectionPassPct 50, expiry within30=1 / expired=0 (lines 44-56).
- Observed issues: none observed.
- ASSUMED: nothing.

## src/lib/siteCoc/statusDisplay.ts

- Purpose: Maps register status text, certificate verdict text and single SANS-rule cell values to a shared four-value `Tone`, and exports Tailwind class maps for pill badges and dense grid cells.
- Public surface:
  - `type Tone = "green" | "red" | "amber" | "slate"` (line 1).
  - `scheduleStatusTone(status: string | null | undefined): Tone` — prefix match OK→green, MISSING/FAIL→red, FLAG→amber, else slate (lines 4-10).
  - `verdictTone(verdict: string | null | undefined): Tone` — prefix match PASS/FAIL/CV, else slate (lines 13-19).
  - `ruleTone(v: string | null | undefined): Tone` — exact match PASS/FAIL/CV, else slate (lines 22-28).
  - `TONE_PILL: Record<Tone, string>` — bordered soft-fill badge classes (lines 31-36); `TONE_CELL: Record<Tone, string>` — compact grid-cell classes (lines 39-44).
- Inputs & outputs: In — status/verdict/rule strings (nullable). Out — `Tone` values / Tailwind class strings. No stores/env.
- Dependencies: uses -> nothing (zero imports). used by <- src/lib/siteCoc/siteCocReport.ts:4 (in-unit: `scheduleStatusTone`, `verdictTone`, `Tone`); src/lib/siteCoc/clientCocSummary.ts:2 (in-unit, `type Tone`); src/components/client-portal/ClientCocView.tsx:17 (C03: `TONE_PILL`, `verdictTone`); src/views/site-coc/VerificationSubTab.tsx:4 (V06: `ruleTone`, `verdictTone`, `TONE_CELL`); src/views/site-coc/ScheduleSubTab.tsx:4 (V06: `scheduleStatusTone`); src/views/site-coc/CertificatesSubTab.tsx:3 (V06: `verdictTone`); src/views/site-coc/StatusPill.tsx:2 (V06: `TONE_PILL`, `type Tone`); src/lib/siteCoc/statusDisplay.test.ts:2 (grep-verified).
- Side effects: none — pure functions and frozen-shape constant objects.
- Error handling: null/undefined coerced to `""` via `?? ""` then uppercased (lines 5, 14, 23); every unmatched value falls through to `"slate"`.
- Tests: `src/lib/siteCoc/statusDisplay.test.ts` covers the three functions (see its section). `TONE_PILL`/`TONE_CELL` constants are not asserted by any test.
- Observed issues (factual): `scheduleStatusTone` and `verdictTone` use `startsWith` (prefix) matching while `ruleTone` uses exact equality (lines 6-8 vs 24-26); the same PASS/FAIL/CV prefix logic exists independently in `verdictKind` (cocReportModel.ts:51-61) and `docStatusFromVerdict` (verdictMap.ts:7-12), each with a different output vocabulary.
- ASSUMED: nothing.

## src/lib/siteCoc/statusDisplay.test.ts

- Purpose: Vitest suite for the three tone-mapping functions.
- Public surface: none (3 `describe` blocks, 3 `it` cases).
- Inputs & outputs: In — literal status strings mirroring register wording ("OK — initial present", "MISSING — no electrical CoC", "FLAG — initial referenced, not on file"). Out — assertions.
- Dependencies: uses -> `vitest` (line 1), `./statusDisplay` (line 2, in-unit). used by <- none found (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: asserts `scheduleStatusTone` prefix mapping incl. "N/A" and ""→slate (lines 5-11); `verdictTone` prefix mapping incl. suffixed "PASS — minor fields unrecorded (C7)"→green (lines 15-21); `ruleTone` exact-value mapping incl. "N/A" and ""→slate (lines 25-31).
- Observed issues: none observed.
- ASSUMED: nothing.

## src/lib/siteCoc/verdictMap.ts

- Purpose: Maps an imported register verdict string (`coc_certificates.verdict`) to a per-document COC status, treating the register as the single source of truth (doc comment, lines 1-6).
- Public surface: `docStatusFromVerdict(verdict: string | null | undefined): "Pass" | "Fail" | "Pending"` (line 7) — trim + uppercase, then prefix match: PASS→"Pass", FAIL→"Fail", anything else (CV/blank/unknown)→"Pending".
- Inputs & outputs: In — a verdict string (nullable). Out — one of three document-status literals. No stores/env in this file; consumers write the result into document rows.
- Dependencies: uses -> nothing (zero imports). used by <- src/lib/coc/assignPoolFile.ts:4 (L04 coc-pool-ingestion); src/views/site-coc/useSiteCocImport.ts:7 (V06 site-coc-tab); src/lib/siteCoc/verdictMap.test.ts:2 (grep-verified).
- Side effects: none — pure.
- Error handling: null/undefined coerced to `""` via `?? ""` (line 8); no throw paths; everything unmatched returns `"Pending"`.
- Tests: `src/lib/siteCoc/verdictMap.test.ts` (see its section).
- Observed issues (factual): its "Pass"/"Fail"/"Pending" output vocabulary intersects but does not equal the subsection `coc_status` vocabulary documented at clientCocSummary.ts:9 ('Pass'|'Pending'|'Missing'|'Fail'|'N/A'); the doc comment (line 5) states it "Matches verdictTone() prefixes" — verdictTone additionally distinguishes CV→amber where this function folds CV into "Pending".
- ASSUMED: the consumers persist the returned status to a document/table column (inferred from the doc comment "per-document COC status"; the writes live in L04/V06, not verified here).

## src/lib/siteCoc/verdictMap.test.ts

- Purpose: Vitest suite for `docStatusFromVerdict`.
- Public surface: none (1 `describe`, 3 `it` cases).
- Inputs & outputs: In — verdict string literals incl. mixed case, padded, and suffixed forms. Out — assertions.
- Dependencies: uses -> `vitest` (line 1), `./verdictMap` (line 2, in-unit). used by <- none found (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: asserts "PASS"/"pass"/" Passed " → "Pass" (lines 5-9); "FAIL"/"Failed - see reasons" → "Fail" (lines 10-13); "CV"/"Cannot verify"/""/null/undefined → "Pending" (lines 14-20).
- Observed issues: none observed.
- ASSUMED: nothing.

## src/lib/siteCoc/clientCocSummary.ts

- Purpose: Builds curated client-portal COC summary rows (one per subsection) with display name, required flag, status label + tone, expiry, and a "view" link to the Initial COC document.
- Public surface:
  - `interface ClientCocSubsection` — id, name, tenant_name, is_coc_required, coc_status, coc_expiry_date (lines 4-11).
  - `interface ClientCocDoc` — subsection_id, file_name, file_url, coc_type, category_name (lines 13-19).
  - `interface ClientCocRow` — subsectionId, name, cocRequired, statusLabel, tone, expiry, viewUrl, viewName (lines 21-30).
  - `cocStatusTone(status: string | null | undefined, required: boolean): Tone` (line 32) — not-required→slate; Pass→green; Fail→red; Missing/Pending→amber; "n/a"→slate; required-but-unknown/blank→amber (comment line 40).
  - `cocStatusLabel(status: string | null | undefined, required: boolean): string` (line 43) — "Not required" when not required; trimmed status or "Pending" fallback.
  - `buildClientCocSummary(subsections: ClientCocSubsection[], cocDocs: ClientCocDoc[]): ClientCocRow[]` (line 49).
- Inputs & outputs: In — subsection rows (with `coc_status`/`coc_expiry_date` columns) and document rows carrying `category_name` "from document_categories(name)" (comment line 18). Out — one `ClientCocRow` per subsection, in input order. No stores/env in this file; the caller queries Supabase (ClientCocView.tsx).
- Dependencies: uses -> `isCocCertificateCategory`, `normalizeCocType` from `@/lib/cocHierarchy` (line 1, L09; exports at src/lib/cocHierarchy.ts:7,32); `type Tone` from `@/lib/siteCoc/statusDisplay` (line 2, in-unit). used by <- src/components/client-portal/ClientCocView.tsx:12-16 (C03: `buildClientCocSummary`, `type ClientCocSubsection`, `type ClientCocDoc`); src/lib/siteCoc/clientCocSummary.test.ts:2 (grep-verified).
- Side effects: none — pure.
- Error handling: no try/catch. Docs with null `subsection_id` skipped (line 55); docs whose `category_name` fails `isCocCertificateCategory` skipped (line 56, with `?? ""` coercion); missing docs yield null viewUrl/viewName (lines 65, 73-74); `expiry` forced to null for non-required subsections (line 72).
- Tests: `src/lib/siteCoc/clientCocSummary.test.ts` (see its section).
- Observed issues (factual): the "view" document selection is `docs.find(normalizeCocType(d.coc_type) === "Initial") ?? docs[0] ?? null` (line 65) — when no Initial-typed COC doc exists, the first COC-category doc of any type becomes the view link. `cocStatusTone` lowercases its input for exact matching (line 34) whereas the other classifiers in this unit uppercase and prefix-match.
- ASSUMED: `isCocCertificateCategory` returns false for the "COC Validation Report" category (inferred from the test at clientCocSummary.test.ts:13,46 where eval.pdf is excluded; the function body belongs to L09 and was not re-derived here).

## src/lib/siteCoc/clientCocSummary.test.ts

- Purpose: Vitest suite for `cocStatusTone`, `cocStatusLabel`, and `buildClientCocSummary`.
- Public surface: none (3 `describe` blocks, 5 `it` cases).
- Inputs & outputs: In — 4 subsection fixtures (required Pass w/ tenant, required Missing, non-required N/A, required null-status; lines 4-9) and 2 doc fixtures for s1 (Initial in "COC Certificates", Supplementary in "COC Validation Report"; lines 11-14). Out — assertions.
- Dependencies: uses -> `vitest` (line 1), `./clientCocSummary` (line 2, in-unit). used by <- none found (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: asserts tone mapping incl. null-and-required→amber and Pass-but-not-required→slate (lines 17-24); label fallbacks "Pending"/"Not required" (lines 28-32); row assembly for s1 — name "Shop 1 (Acme)", status Pass/green, expiry kept, viewUrl "u1" is the Initial doc not the validation report (lines 36-48); s2 Missing/amber with null viewUrl (lines 50-56); s3 not-required with null expiry (lines 58-65).
- Observed issues: none observed.
- ASSUMED: nothing.
