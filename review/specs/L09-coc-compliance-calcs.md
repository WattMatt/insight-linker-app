# L09 — coc-compliance-calcs

- Unit id: L09
- Slug: coc-compliance-calcs
- Spec mode: full
- Date: 2026-07-29
- Files: 10 (5 source + 5 paired tests, per review/unit-files.json "L09")

## Unit header

**Unit purpose (as-is).** Five mutually independent, pure TypeScript modules under `src/lib/` that hold COC (Certificate of Compliance) and compliance domain arithmetic: the client-side mirror of the DB COC gate (`cocCompliance`), filename token extraction (`cocFilename`), the per-document COC hierarchy/roll-up model (`cocHierarchy`), COC + metering compliance counts and rates (`complianceCalculations`), and dashboard KPI helpers for COC expiry and snag aging (`kpiMetrics`). Every source file is 1:1 paired with a vitest spec in the same directory.

**Module-level observations (cross-file, all verified).**
- No I/O anywhere in the unit: `cocCompliance.ts`, `cocFilename.ts`, `cocHierarchy.ts`, and `complianceCalculations.ts` have zero imports; `kpiMetrics.ts` imports only two sibling pure modules (src/lib/kpiMetrics.ts:3-4). No Supabase, storage, or browser API usage in any of the five.
- The five source modules do not import each other. `kpiMetrics.ts` is the only one with dependencies, and they point outside the unit (L17).
- Three COC status vocabularies coexist inside the unit: `COC_STATUSES = ['Missing','Pending','Pass','Fail','N/A']` (src/lib/cocCompliance.ts:1); `CocDocStatus = 'Pass'|'Fail'|'Pending'|'Missing'` (src/lib/cocHierarchy.ts:13); `VALID_COC_STATUSES = ['Approved','Valid','Pass']` / `FAILED_COC_STATUSES = ['Fail','Failed','Rejected']` (src/lib/complianceCalculations.ts:33,38). A fourth comparison style exists in `kpiMetrics.ts:22`: lowercase equality against the single literal `"pass"`.
- Case handling differs per module: `cocHierarchy.normalizeCocDocStatus` lowercases before matching (src/lib/cocHierarchy.ts:40-44); `complianceCalculations.hasValidCocStatus`/`hasFailedCocStatus` are case-sensitive set-membership checks (src/lib/complianceCalculations.ts:45,53); `kpiMetrics.cocExpiryBuckets` lowercases and accepts only `pass` (src/lib/kpiMetrics.ts:22) — legacy `Approved`/`Valid` values that `complianceCalculations` counts as passing are not counted by `kpiMetrics`.
- Two expiry semantics coexist: `cocCompliance.cocFailsGate` treats an expired Pass on a required COC as gating/non-compliant (src/lib/cocCompliance.ts:31), while `cocHierarchy.cocDocFails` — per the "register-truth model (2026-07-25)" comment — ignores expiry entirely, keeping `today` only as an unused parameter (src/lib/cocHierarchy.ts:47-54). `kpiMetrics.cocExpiryBuckets` still buckets by expiry date for display (src/lib/kpiMetrics.ts:18-29).
- DB-mirror claims in comments have grep-verified SQL counterparts: `apply_subsection_recompute` (referenced at src/lib/cocCompliance.ts:4,23) exists in migrations incl. supabase/migrations/20260725100000_coc_register_truth.sql and 20260615120000_recompute_on_inspection_change.sql (units D02/D03); the roll-up ILIKE filter mirrored by `isCocCertificateCategory` (src/lib/cocHierarchy.ts:2-3) appears at supabase/migrations/20260725100000_coc_register_truth.sql:92.
- All five tests are discovered by the root vitest config: `include: ['src/**/*.test.{ts,tsx}']`, environment `node` (vitest.config.ts:18,22), run via `npm test` = `vitest run` (package.json:10).
- An untracked duplicate file `src/views/Dashboard 2.tsx` (present in git status, absent from review/unit-files.json and the manifest) also imports `complianceCalculations` ("src/views/Dashboard 2.tsx":15).

**External contract.** The rest of the app gets: filename→COC-number/verdict extraction consumed by the import/upload pipelines (L02, L04); the CocDoc model, normalizers, roll-up, and I/S card lines consumed by reporting (L03, L15), scoring (L17), components (C14, C17), and the subsection-detail module (V07); COC/metering count-and-rate calculators consumed by dashboards and views (C09, V01, V07, L15, L17); and expiry-bucket/snag-aging KPIs consumed by the compliance dashboard (C14) and the site COC report (L03). `cocCompliance.ts` exports nothing that any non-test file consumes (grep-verified).

---

## src/lib/cocCompliance.test.ts
- Purpose: vitest spec for `cocCompliance.ts`.
- Public surface: none (test file).
- Inputs & outputs: none; fixed `today = '2026-06-12'` (src/lib/cocCompliance.test.ts:5). No stores.
- Dependencies: uses -> `vitest` (:1); `cocFailsGate`, `COC_STATUSES`, `isExpired` from `./cocCompliance` (:2, this unit). used by <- none found (grep-verified; discovered by vitest include glob, vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a.
- Tests: this IS the test file. Asserts: not-required never gates even on Fail (:7); required+Fail gates (:10); legacy `Failed`/`Rejected` gate (:13-14); required+Pass+future expiry does not gate (:17); required+Pass+past expiry gates (:20); required+Pass+no expiry does not gate (:23); `Missing`/`Pending` do not gate (:26-27); `isExpired` — null never expired, past date expired, today not expired (:32-34); `COC_STATUSES` equals the exact 5-value set (:38).
- Observed issues: none.
- ASSUMED: nothing.

## src/lib/cocCompliance.ts
- Purpose: client-side, display-only mirror of the DB recompute COC gate — returns whether a required COC forces a subsection non-compliant (src/lib/cocCompliance.ts:20-26).
- Public surface:
  - `COC_STATUSES: readonly ['Missing','Pending','Pass','Fail','N/A']` (:1)
  - `type CocStatus = typeof COC_STATUSES[number]` (:2)
  - `interface CocGateInput { isCocRequired?: boolean|null; cocStatus?: string|null; cocExpiryDate?: string|null }` (:9-13; expiry documented as ISO yyyy-mm-dd)
  - `isExpired(cocExpiryDate: string|null|undefined, today: string): boolean` (:15-18)
  - `cocFailsGate(s: CocGateInput, today: string): boolean` (:27-33)
- Inputs & outputs: in — a subsection-shaped object and an ISO date string; out — booleans. No tables, buckets, storage keys, or env vars.
- Dependencies: uses -> none (zero imports). used by <- src/lib/cocCompliance.test.ts only; no non-test importer of any export in `src/` or `supabase/` (grep-verified on `cocFailsGate`, `COC_STATUSES`, `CocGateInput`, `CocStatus`, and module-path imports).
- Side effects: none; pure.
- Error handling: no throw paths. Null/undefined expiry returns `false` from `isExpired` (:16); missing `cocStatus` becomes `''` via `?? ''` (:29) and matches neither vocab set; falsy `isCocRequired` short-circuits to `false` (:28). Date comparison is lexicographic string `<` on ISO strings (:17).
- Tests: src/lib/cocCompliance.test.ts (all branches of both functions plus the constant — see its section).
- Observed issues: zero non-test consumers, grep-verified. Private `FAILED_VALUES`/`PASS_VALUES` sets (:6-7) carry the same legacy vocab (`Failed`/`Rejected`/`Approved`/`Valid`) that `complianceCalculations.ts:33,38` exports as separate constants — two parallel encodings of the same tolerance. Its expired-Pass-gates semantics (:31) is the opposite of `cocHierarchy.cocDocFails`, which ignores expiry (src/lib/cocHierarchy.ts:52-54). `N/A` appears in `COC_STATUSES` (:1) but in neither vocab set, so `cocFailsGate` never gates on it.
- ASSUMED: the comment's claim of behavioural parity with the DB gate in `apply_subsection_recompute` (:4-5, :20-26) — the SQL function exists (supabase/migrations/20260725100000_coc_register_truth.sql, grep-verified) but SQL-vs-TS parity was not line-checked in this pass.

## src/lib/cocFilename.test.ts
- Purpose: vitest spec for `cocFilename.ts`.
- Public surface: none (test file).
- Inputs & outputs: none. No stores.
- Dependencies: uses -> `vitest` (:1); `extractCocNumber`, `extractEvalVerdict` from `./cocFilename` (:2, this unit). used by <- none found (grep-verified; vitest glob discovery).
- Side effects: none.
- Error handling: n/a.
- Tests: this IS the test file. `extractCocNumber`: hyphenated number extracted (:6); leading `PASS-` token stripped (:9); no-hyphen `B1612744` normalised to `B-1612744` (:12); prefix not hardcoded to B (`X-99001`, :15); lowercase prefix uppercased (:18); null when no letter+digit token (:21). `extractEvalVerdict`: `PASS-` → `"Pass"` (:27); `FAIL_` → `"Fail"` (:30); case-insensitive (:33); null without prefix (:36).
- Observed issues: none.
- ASSUMED: nothing.

## src/lib/cocFilename.ts
- Purpose: extracts a normalised COC number (`PREFIX-DIGITS`) and an optional leading Pass/Fail verdict token from a filename (src/lib/cocFilename.ts:1-6,15-18).
- Public surface:
  - `extractCocNumber(fileName: string): string | null` (:7-13)
  - `extractEvalVerdict(fileName: string): "Pass" | "Fail" | null` (:19-24)
- Inputs & outputs: in — a filename string (may include path segments); out — normalised token string / verdict literal / null. No stores.
- Dependencies: uses -> none (zero imports). used by <- L02 coc-import-pipeline... note: manifest places routeUpload in L02 — src/lib/siteCoc/routeUpload.ts:1,23 (`extractCocNumber`); L04 coc-pool-ingestion — src/lib/coc/poolUpload.ts:2,25 (`extractCocNumber`), src/lib/coc/uploadCocFiles.ts:2,53-54 (both functions), src/lib/coc/assignPoolFile.ts:3,57 (`extractEvalVerdict`); plus src/lib/cocFilename.test.ts. (grep-verified)
- Side effects: none; pure.
- Error handling: no throw paths; returns `null` when the regex finds no letter+digit token (:11) or no verdict prefix (:23).
- Tests: src/lib/cocFilename.test.ts (see its section).
- Observed issues: `extractCocNumber` strips path and extension (:8) then matches the FIRST letter-run followed by an optional single `-`/`_`/space and a digit-run anywhere in the remaining name (:10) — whichever letter+digit token comes first is returned as the COC number. `extractEvalVerdict` strips only the path, not the extension (:20), and tests only the leading token.
- ASSUMED: nothing.

## src/lib/cocHierarchy.test.ts
- Purpose: vitest spec for `cocHierarchy.ts`.
- Public surface: none (test file). Local `doc()` factory building a default Supplementary/Pending `CocDoc` (:7-10); fixed `today = '2026-06-12'` (:11).
- Inputs & outputs: none. No stores.
- Dependencies: uses -> `vitest` (:1); `normalizeCocType`, `normalizeCocDocStatus`, `cocDocFails`, `rollupStatus`, `groupCocDocuments`, `toCocDoc`, `CocDoc`, `isCocCertificateCategory`, `buildCocCardLines` from `./cocHierarchy` (:2-5, this unit). used by <- none found (grep-verified; vitest glob discovery).
- Side effects: none.
- Error handling: n/a.
- Tests: this IS the test file. `normalizeCocType`: case/variant mapping (:14-19); unknown/blank/null → Supplementary (:21-22). `normalizeCocDocStatus`: both vocabularies map (:28-32); null/'' → Pending (:35-36). `cocDocFails`: Fail fails (:41); Pass with future/past/no expiry never fails — "expiry no longer drives status" (:42-47); Pending does not fail (:48). `rollupStatus`: empty → Missing (:52); any Fail → Fail (:53-54); expired Pass still Pass (:55-56); Pass+Pending → Pass (:57-58); only Pending → Pending (:59-60). `groupCocDocuments`: Initial-typed doc picked, supplementaries issue-date-ascending (:64-73); no Initial-typed → earliest promoted (:74-81); empty → null initial + Missing rollup (:82-87). `toCocDoc`: maps a raw row (:91-95). `isCocCertificateCategory`: accepts '01 COC' (:100); rejects '07 COC Evaluation Reports' (:103), 'COC Validation Reports' (:106), '04 Metering' (:109). `buildCocCardLines`: empty → single I-Missing line (:114-117); initial carries number/status (:119-124); I then S lines issue-date-ascending (:126-137); supplementary-without-initial still emits I-Missing first (:139-147); Temporary listed as S (:149-156); initial with null number → '—' placeholder (:158-163).
- Observed issues: none.
- ASSUMED: nothing.

## src/lib/cocHierarchy.ts
- Purpose: pure model of a subsection's COC document set — category filter, type/status normalisers, per-doc fail rule, set roll-up, initial/supplementary grouping, and I/S card-line builder for subsection cards.
- Public surface:
  - `isCocCertificateCategory(name: string): boolean` (:7-10)
  - `type CocType = 'Initial' | 'Supplementary' | 'Temporary'` (:12)
  - `type CocDocStatus = 'Pass' | 'Fail' | 'Pending' | 'Missing'` (:13)
  - `interface CocDoc { id; cocType; cocNumber: string|null; cocIssueDate: string|null; cocExpiryDate: string|null; cocStatus: CocDocStatus; fileName; fileUrl }` (:15-24; comment: per-doc status is never 'Missing' — roll-up-only value, :21)
  - `interface CocGroup { initial: CocDoc|null; supplementaries: CocDoc[]; rollup: CocDocStatus }` (:26-30)
  - `normalizeCocType(raw: string|null|undefined): CocType` (:32-37)
  - `normalizeCocDocStatus(raw: string|null|undefined): CocDocStatus` (:39-44)
  - `cocDocFails(d: CocDoc, _today: string): boolean` (:52-54)
  - `rollupStatus(docs: CocDoc[], today: string): CocDocStatus` (:56-61)
  - `groupCocDocuments(docs: CocDoc[], today: string): CocGroup` (:63-68)
  - `toCocDoc(d: { id; file_name; file_url; coc_number?; coc_issue_date?; coc_expiry_date?; coc_type?; coc_status? }): CocDoc` (:70-85)
  - `interface CocCardLine { label: 'I'|'S'; number: string; status: CocDocStatus; missing: boolean }` (:91-96)
  - `buildCocCardLines(docs: CocDoc[]): CocCardLine[]` (:108-123)
- Inputs & outputs: in — raw snake_case document rows / `CocDoc[]` / category name strings; out — normalised `CocDoc`s, `CocGroup`, `CocCardLine[]`, status literals. No stores.
- Dependencies: uses -> none (zero imports). used by <- C14 src/components/SiteSummaryReport.tsx:11 (`isCocCertificateCategory`, `toCocDoc`, `buildCocCardLines`); C17 src/components/coc/CocCertificateList.tsx:4 (`toCocDoc`, `groupCocDocuments`, `CocDoc`); L15 src/lib/pdfSubsectionRenderer.ts:16 and src/lib/subsectionCardSpec.ts:15 (type `CocCardLine`); L17 src/lib/subsectionCompliance.ts:1 (`CocDoc`, `cocDocFails`) and src/lib/subsectionCompliance.test.ts:3 (type `CocDoc`); L03 src/lib/siteCoc/clientCocSummary.ts:1 (`isCocCertificateCategory`, `normalizeCocType`); V07 src/views/subsection-detail/useSubsectionDetail.ts:8 (`isCocCertificateCategory`) and src/views/subsection-detail/OverviewTab.tsx:14 (`isCocCertificateCategory`, `toCocDoc`); plus src/lib/cocHierarchy.test.ts. (all grep-verified)
- Side effects: none; pure. Sorting copies the array before `.sort` (:64, :109).
- Error handling: no throw paths. Nullish raw values normalise to defaults: unknown/blank type → `Supplementary` (:36), unknown/blank status → `Pending` (:43), missing optional row fields → `null` (:78-80). `isCocCertificateCategory` coalesces null-ish name to `''` (:8). Null issue dates sort via `?? ''` localeCompare (:64, :109).
- Tests: src/lib/cocHierarchy.test.ts covers every exported function (see its section). Additionally L17's src/lib/subsectionCompliance.test.ts:3 consumes the `CocDoc` type to test `computeSubsectionVerdict` — it asserts nothing about this file's own functions.
- Observed issues: `cocDocFails` ignores `_today` (:52-54); the comment states the param is "kept for call-site stability" and expiry is display-only under the 2026-07-25 register-truth model (:46-51) — the opposite expiry semantics of `cocCompliance.cocFailsGate` (src/lib/cocCompliance.ts:31). `groupCocDocuments` and `buildCocCardLines` use different initial-selection rules — earliest-doc promotion (:65) vs strict `cocType === 'Initial'` with a synthetic Missing line (:108-117), documented at :98-107. In `groupCocDocuments`, when several docs are typed `Initial`, only the first in issue-date order becomes `initial`; the others land in `supplementaries` via the `d !== initial` filter (:65-66). `rollupStatus` is computed from the unsorted input `docs` (:67). The SQL filter mirrored by `isCocCertificateCategory` (:2-3) exists verbatim in supabase/migrations/20260725100000_coc_register_truth.sql:92 (D03).
- ASSUMED: `toCocDoc`'s input corresponds to `subsection_documents` rows — asserted by the test description "maps a raw subsection_documents row" (src/lib/cocHierarchy.test.ts:91) and the snake_case field names; not checked against the DB schema in this pass.

## src/lib/complianceCalculations.test.ts
- Purpose: vitest spec for `complianceCalculations.ts`.
- Public surface: none (test file).
- Inputs & outputs: none. No stores.
- Dependencies: uses -> `vitest` (:1); `hasValidCocStatus`, `hasFailedCocStatus`, `isSubsectionCocCompliant`, `calculateCocComplianceStats` from `./complianceCalculations` (:2-7, this unit). used by <- none found (grep-verified; vitest glob discovery).
- Side effects: none.
- Error handling: n/a.
- Tests: this IS the test file. `hasValidCocStatus`: accepts Pass/Approved/Valid (:11-13); rejects Fail/Missing/null/undefined (:16-19). `hasFailedCocStatus`: matches Fail/Failed/Rejected (:25-27); false for Pass/Pending/null (:30-32). `isSubsectionCocCompliant`: not-required always compliant (:38-39); required needs a passing verdict (:42-44). `calculateCocComplianceStats`: 4-subsection fixture — total 4, required 3, approved 2 (Pass+Approved), metering 2 (Installed + serial present), cocComplianceRate 67 (:50-61); nothing required → both rates 100 (:63-70); `meter_serial_number` presence alone counts as metered, comment "matches siteHealth.isMetered" (:72-77).
- Observed issues: `meteringComplianceRate` is asserted only in the empty-denominator case (:69); no test pins its value when numerator and denominator populations differ (see source section).
- ASSUMED: nothing.

## src/lib/complianceCalculations.ts
- Purpose: pure COC + metering compliance counts and percentage rates derived from each subsection's manual `coc_status` verdict; header declares it the "single source of truth" for COC counts across Overview, Compliance Dashboard, and the main Dashboard (src/lib/complianceCalculations.ts:1-10,76-78).
- Public surface:
  - `interface SubsectionForCompliance { id: string; is_coc_required?: boolean|null; coc_status?: string|null; metering_status?: string|null; meter_serial_number?: string|null }` (:12-18)
  - `interface ComplianceStats { totalSubsections; cocRequiredCount; cocApprovedCount; meteringInstalledCount; cocComplianceRate; meteringComplianceRate }` (all number, :20-27)
  - `VALID_COC_STATUSES = ['Approved','Valid','Pass'] as const` (:33)
  - `FAILED_COC_STATUSES = ['Fail','Failed','Rejected'] as const` (:38)
  - `hasValidCocStatus(cocStatus: string|null|undefined): boolean` (:43-46)
  - `hasFailedCocStatus(cocStatus: string|null|undefined): boolean` (:51-54)
  - `isSubsectionCocCompliant(subsection: SubsectionForCompliance): boolean` (:60-63)
  - `cocComplianceRate(approvedCount: number, requiredCount: number): number` (:71-73)
  - `calculateCocComplianceStats(subsections: SubsectionForCompliance[]): ComplianceStats` (:79-103)
- Inputs & outputs: in — arrays of subsection-shaped objects / status strings / counts; out — booleans, rounded integer percentages, a `ComplianceStats` record. Empty denominator → 100 by the stated vacuous-compliance convention (:66-72). No stores.
- Dependencies: uses -> none (zero imports). used by <- C09 src/components/site/SubsectionList.tsx:13 (`hasFailedCocStatus`, `hasValidCocStatus`); L17 src/lib/siteDeliverables.ts:13 (`hasValidCocStatus`, type `SubsectionForCompliance`); L15 src/lib/siteSummaryRenderSpec.ts:23 (`cocComplianceRate`, `hasValidCocStatus`) and src/lib/siteSummaryRenderSpec.test.ts:8 (`calculateCocComplianceStats`); V01 src/views/Dashboard.tsx:11,147 and src/views/SiteDetail.tsx:31,499 (`calculateCocComplianceStats`); V07 src/views/subsection-detail/OverviewTab.tsx:12 (`hasValidCocStatus`); plus src/lib/complianceCalculations.test.ts. Referenced in a comment only at L17 src/lib/siteHealth.ts:5. The untracked, out-of-manifest duplicate "src/views/Dashboard 2.tsx":15 also imports it. (all grep-verified)
- Side effects: none; pure.
- Error handling: no throw paths; null/undefined status returns `false` from both predicates (:44,52); falsy `is_coc_required` makes a subsection vacuously compliant (:61); division guarded by `requiredCount > 0` ternary (:72).
- Tests: src/lib/complianceCalculations.test.ts (see its section). L15's src/lib/siteSummaryRenderSpec.test.ts:78 additionally asserts that the site-summary render metric `cocCompliance` equals `calculateCocComplianceStats(...).cocComplianceRate` for the same input.
- Observed issues: `meteringInstalledCount` is counted over ALL subsections (:91-93) while `meteringComplianceRate` divides it by `cocRequiredCount` (:101) — numerator and denominator are drawn from different populations, so with more metered subsections than COC-required ones the rate exceeds 100; no test exercises that combination. Membership checks are case-sensitive (:45,:53), unlike `cocHierarchy.normalizeCocDocStatus` which lowercases first (src/lib/cocHierarchy.ts:40-44). Despite the "can never drift" rationale for exporting `cocComplianceRate` (:66-70), V01 src/views/Dashboard.tsx:235-237 recomputes the same rate inline from `stats.cocCompliantCount / stats.cocRequiredCount` instead of calling it.
- ASSUMED: `coc_status`, `is_coc_required`, `metering_status`, `meter_serial_number` correspond to `subsections` table columns (inferred from field naming and call sites; schema not checked in this pass).

## src/lib/kpiMetrics.test.ts
- Purpose: vitest spec for `kpiMetrics.ts`.
- Public surface: none (test file).
- Inputs & outputs: none; fixed `today = "2026-06-16"` (:5, :20). No stores.
- Dependencies: uses -> `vitest` (:1); `cocExpiryBuckets`, `snagAging` from `./kpiMetrics` (:2, this unit). used by <- none found (grep-verified; vitest glob discovery).
- Side effects: none.
- Error handling: n/a.
- Tests: this IS the test file. `cocExpiryBuckets`: 6-element fixture yields `{expired:1, within30:1, within90:1}` — beyond-90, null-expiry, and non-Pass rows ignored (:6-16). `snagAging`: mixed fixture yields `criticalOpen:1`, `oldestOpenDays:46`, `medianResolveDays:7` (median of [4,10], even-length rounding) (:21-32); empty input yields `{criticalOpen:0, oldestOpenDays:null, medianResolveDays:null}` (:33-35).
- Observed issues: none.
- ASSUMED: nothing.

## src/lib/kpiMetrics.ts
- Purpose: pure site-dashboard KPI helpers — COC expiry buckets and snag-aging metrics — explicitly scoped to metrics "NOT already produced by siteDeliverables.ts / siteHealth.ts" (src/lib/kpiMetrics.ts:1-2).
- Public surface:
  - `interface SubsectionForExpiry { coc_status?: string|null; coc_expiry_date?: string|null }` (:10-13)
  - `interface CocExpiryBuckets { expired: number; within30: number; within90: number }` (:14)
  - `cocExpiryBuckets(subs: SubsectionForExpiry[], today: string): CocExpiryBuckets` (:18-29)
  - `interface SnagForAging { status?; risk_level?; created_at?; rectified_at?: string|null }` (:31-36)
  - `interface SnagAging { criticalOpen: number; oldestOpenDays: number|null; medianResolveDays: number|null }` (:37)
  - `snagAging(snags: SnagForAging[], today: string): SnagAging` (:49-66)
  - (private: `DAY`/`daysBetween` :6-8, `median` :39-44)
- Inputs & outputs: in — subsection/snag-shaped arrays plus an ISO `today` string; out — bucket counts and aging numbers. Bucketing: `days < 0` expired, `<= 30` within30, `<= 90` within90, beyond 90 uncounted (:24-26). Open = `snagStatusBucket(status) !== "closed"` (:54); `criticalOpen` additionally requires `risk_level` in `BLOCKING_RISK_LEVELS` (:56); `medianResolveDays` uses snags carrying both `created_at` and `rectified_at` (:61-63). No stores.
- Dependencies: uses -> `snagStatusBucket` from `./subsectionStatus` (:3, L17); `BLOCKING_RISK_LEVELS` from `./siteHealth` (:4, L17). used by <- C14 src/components/ComplianceDashboard.tsx:14,136-137 (both functions); L03 src/lib/siteCoc/reportKpis.ts:5,55,68 (both functions plus both input types); plus src/lib/kpiMetrics.test.ts. (grep-verified)
- Side effects: none; pure.
- Error handling: no throw paths; rows without `coc_expiry_date` or without lowercase-`pass` status are skipped (:21-22); snags without `created_at` contribute to neither age nor durations (:57,:61); `median` of an empty list returns `null` (:40). `daysBetween` floors the raw `Date.parse` millisecond difference (:7-8); invalid date strings would produce `NaN` (no guard).
- Tests: src/lib/kpiMetrics.test.ts (see its section).
- Observed issues: the function comment says it counts "COC-required 'Pass' certificates" (:16), but the code never checks `is_coc_required`, the `SubsectionForExpiry` type has no such field (:10-13), and both grep-verified callers pass unfiltered subsection arrays (src/components/ComplianceDashboard.tsx:137 — where the surrounding code separately probes `s.is_coc_required` at :138 — and src/lib/siteCoc/reportKpis.ts:68). The status check accepts only case-insensitive `"pass"` (:22) — legacy `Approved`/`Valid` values counted as passing by `complianceCalculations.ts:33` fall outside these buckets. `snagAging`'s `criticalOpen` open-definition (bucket !== closed, :54-56) differs from L17 `siteHealth.ts:54`'s own blocking-snag rule, which requires `status === 'Open'` exactly.
- ASSUMED: `coc_expiry_date`/`created_at`/`rectified_at` arrive as parseable ISO strings from Supabase rows (inferred from call sites; not schema-verified).
