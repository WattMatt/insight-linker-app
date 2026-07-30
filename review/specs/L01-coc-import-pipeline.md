# L01 — coc-import-pipeline

- Unit id: L01
- Slug: coc-import-pipeline
- Spec mode: full
- Date: 2026-07-29
- Files: 11 (per `review/unit-files.json` key "L01")

## Unit header

**Unit purpose.** Pure-function pipeline that turns spreadsheet grids from two COC audit workbooks (a "DB Schedule"/"Certificate Detail" workbook and a "Verification" workbook) into database-insert-shaped rows: parse sheets into typed rows (`parseWorkbooks.ts`), normalise shop/cert identifiers (`normalize.ts`), match shops to site subsections and stamp site/batch ids (`ingest.ts`), carry prior match resolutions across a re-import (`reimport.ts`), against a hard-coded SANS rule catalogue (`sansRules.ts`) and shared row types (`types.ts`).

**Module-level observations (cross-file facts).**
- Every function in the unit is pure: no file performs I/O, network calls, storage access, or reads env vars. All Supabase reads/writes happen in the consumer `src/views/site-coc/useSiteCocImport.ts` (V06), which inserts the assembled rows into `coc_db_schedule` and `coc_certificates` (useSiteCocImport.ts:74, 79).
- No function in the unit throws; every failure path returns a fallback (`null`, `""`, `[]`, `"Unclear"`). There is no try/catch anywhere in the six source files.
- Two distinct shop-key normalisations coexist: `normShop` (uppercase, `&`→` AND `, collapse `[\s\-_]+`; normalize.ts:1-4) is used for all subsection matching and prior-match keying, while `mergeCertificates`' merge key uses only `toUpperCase().trim()` on `shop_no_raw` (parseWorkbooks.ts:120-121).
- The three sheets identify the shop under three different column headers: "Shop No" (DB Schedule, parseWorkbooks.ts:37,39), "Matched" (Certificate Detail, parseWorkbooks.ts:62), "Shop" (Verification, parseWorkbooks.ts:100).
- Five source files are test-paired 1:1; `types.ts` has no test file (it is types-only). All 37 tests in the 5 test files pass under the repo's single vitest config (`vitest.config.ts`, node environment, include `src/**/*.test.{ts,tsx}`) — verified by running `npx vitest run` on the five files on 2026-07-29 (5 files, 37 tests, all passed).

**External contract.** The rest of the app gets:
- From `parseWorkbooks`: `parseDbSchedule` / `parseCertificateDetail` / `parseVerification` / `mergeCertificates` — consumed only by V06 `useSiteCocImport.ts:4`.
- From `ingest`: `assembleScheduleRows` / `assembleCertificateRows` / `summarize` (V06 useSiteCocImport.ts:5) and `matchSubsection` (V06 useSiteCoc.ts:4).
- From `reimport`: `applyPriorMatches` (V06 useSiteCocImport.ts:6).
- From `normalize`: `normShop` / `normCert` reused well beyond import: L02 (assignmentEngine.ts:1, routeUpload.ts:2, rankCandidates.ts:1), L04 (src/lib/coc/assignPoolFile.ts:2), V06 (useSiteCocImport.ts:9, useSiteCoc.ts:3).
- From `sansRules`: `COC_SANS_RULES` (L03 siteCocReport.ts:2; V06 VerificationSubTab.tsx:3) plus the `RuleResult` type.
- From `types`: `SubsectionLite` (V06 useSiteCocImport.ts:10) and the parsed-row types used intra-unit.

---

## src/lib/siteCoc/parseWorkbooks.ts
- Purpose: Parses raw spreadsheet grids (`unknown[][]`) from the three COC workbook sheets into `ParsedScheduleRow` / `ParsedCertificate` arrays and merges Certificate Detail metadata with Verification assessments.
- Public surface:
  - `findHeader(rows: Grid): { idx: number; col: Record<string, number> } | null` (parseWorkbooks.ts:9) — `Grid = unknown[][]` is a non-exported alias (parseWorkbooks.ts:5); returns index of the first row (within the first 25) having ≥2 non-empty cells plus a lowercased header-name→column map.
  - `parseDbSchedule(rows: Grid): ParsedScheduleRow[]` (parseWorkbooks.ts:31).
  - `parseCertificateDetail(rows: Grid): ParsedCertificate[]` (parseWorkbooks.ts:54).
  - `parseVerification(rows: Grid): ParsedCertificate[]` (parseWorkbooks.ts:82).
  - `mergeCertificates(detail: ParsedCertificate[], verification: ParsedCertificate[]): ParsedCertificate[]` (parseWorkbooks.ts:124) — merge on key `${shop_no_raw.toUpperCase().trim()}|${cert_no_norm}|${cert_type}` (parseWorkbooks.ts:120-121).
- Inputs & outputs: in — grids produced by the consumer via `XLSX.utils.sheet_to_json(ws, { header: 1 ... })` (useSiteCocImport.ts:12-19); out — plain typed arrays. Column headers read: DB Schedule "Shop No", "Trading Name", "COC Req.", "Initial COC No(s)", "Supplementary COC No(s)", "Unclear (no tick)", "Supp→Initial ref", "Files", "Status", "Notes" (parseWorkbooks.ts:39-48); Certificate Detail "File", "Matched", "Doc type", "Cert No", "Type", "9(2)", "Supp→Init", "Issued", "Location", "Conf", "Notes" (parseWorkbooks.ts:60-76); Verification "Shop", "Cert No", "Type", "Verdict", "Reasons", "Notes" plus any header starting with a known rule code (parseWorkbooks.ts:85-115). Header lookups are case-insensitive (parseWorkbooks.ts:15, 23). No stores, no env vars.
- Dependencies: uses -> `./normalize` (`normCert`, `normCertType`, `parseFilesCount`, `parseIssuedDate`; parseWorkbooks.ts:1), `./sansRules` (`ruleCodeFromHeader`, `isKnownRuleCode`, `RuleResult`; parseWorkbooks.ts:2), `./types` (types-only; parseWorkbooks.ts:3) — all intra-unit L01. used by <- V06 site-coc-tab (src/views/site-coc/useSiteCocImport.ts:4); own test (src/lib/siteCoc/parseWorkbooks.test.ts:2). Grep-verified; no other consumers.
- Side effects: none — pure functions over in-memory arrays.
- Error handling: no throws. `findHeader` returns `null` when no qualifying row exists in the first 25 rows (parseWorkbooks.ts:19); all three parsers then return `[]` (parseWorkbooks.ts:33, 56, 84). Missing columns yield `""` via `get` / `null` via `getRaw` (parseWorkbooks.ts:22-29). Fully-empty rows are skipped (parseWorkbooks.ts:36, 59, 92); `parseDbSchedule` additionally skips rows with empty "Shop No" (parseWorkbooks.ts:37).
- Tests: `src/lib/siteCoc/parseWorkbooks.test.ts` (see its section) — asserts header-skipping schedule parse, detail field mapping, verification verdict+rule extraction, merge by key, and verification-only cert retention. All pass (run 2026-07-29).
- Observed issues:
  - Header detection has no column-name validation: the header is simply the first row with ≥2 non-empty cells (parseWorkbooks.ts:10-18), so a multi-cell title/preamble row would be selected and subsequent named lookups would return `""`.
  - `parseVerification` stores any non-empty uppercased cell as a `RuleResult` via the cast `v as RuleResult` (parseWorkbooks.ts:96-97) with no membership check against `"PASS" | "FAIL" | "CV" | "N/A"`.
  - `mergeCertificates`' key uses `shop_no_raw.toUpperCase().trim()` (parseWorkbooks.ts:120-121), not `normShop` — "SHOP-002" and "SHOP 002" form distinct merge keys while they are identical everywhere `normShop` is used.
  - `parseCertificateDetail` and `parseVerification` emit rows with an empty `cert_no` (only fully-empty rows are skipped, parseWorkbooks.ts:59, 92-93); such rows share the merge key `${shop}||${type}` in `mergeCertificates`, so a later detail row with the same shop+type and empty cert overwrites an earlier one at Map.set (parseWorkbooks.ts:126).
  - `findHeader` is exported but has no consumer outside this file (grep-verified: not imported anywhere, not exercised directly by the test file, whose imports are parseWorkbooks.test.ts:2).
- ASSUMED:
  - The column-header vocabulary corresponds to a fixed external workbook format (fixtures label it "YARONA — DB / COC SCHEDULE", parseWorkbooks.test.ts:5); no format specification exists inside the unit.

## src/lib/siteCoc/parseWorkbooks.test.ts
- Purpose: Vitest unit tests for the three sheet parsers and the detail+verification merge, using inline grid fixtures shaped like the YARONA workbooks.
- Public surface: none (test module; no exports).
- Inputs & outputs: inline fixtures `schedRows` (title rows + header + 2 data rows; parseWorkbooks.test.ts:4-10), `certRows` (parseWorkbooks.test.ts:12-15), `verifRows` (parseWorkbooks.test.ts:17-22). No stores, no env vars.
- Dependencies: uses -> `vitest` (parseWorkbooks.test.ts:1), `./parseWorkbooks` (parseWorkbooks.test.ts:2, intra-unit L01). used by <- none found (grep-verified); executed by the vitest runner (`vitest.config.ts` include `src/**/*.test.{ts,tsx}`).
- Side effects: none.
- Error handling: n/a (test assertions).
- Tests: is itself the test file; 5 tests, all passing (run 2026-07-29). Asserts: `parseDbSchedule` returns 2 rows past the title rows with mapped fields including `files_count` 4 and 0 (parseWorkbooks.test.ts:25-30); `parseCertificateDetail` maps metadata incl. `cert_no_norm: "B1612744"`, `issued_date: "2024-11-05"` (parseWorkbooks.test.ts:34-37); `parseVerification` maps verdict and `rules` `{ A1: "PASS", B1: "PASS", C15: "N/A" }` (parseWorkbooks.test.ts:41-45); `mergeCertificates` yields one merged row carrying both `doc_type` and `verdict` (parseWorkbooks.test.ts:49-54) and keeps a verification-only cert with empty `doc_type` (parseWorkbooks.test.ts:55-60).
- Observed issues: the merge test relies on `normCertType` mapping detail "Initial" and verification "I" to the same key component; `findHeader` is never asserted directly.
- ASSUMED: none.

## src/lib/siteCoc/normalize.ts
- Purpose: String/scalar normalisers for shop names, certificate numbers, certificate types, file counts, and issued dates shared across the COC import and pool-assignment code.
- Public surface:
  - `normShop(s: string | null | undefined): string` (normalize.ts:1) — uppercase, `&`→` AND `, collapse runs of space/hyphen/underscore to single space, trim.
  - `normCert(s: string | null | undefined): string` (normalize.ts:6) — uppercase, strip all spaces and hyphens.
  - `normCertType(s: string | null | undefined): "Initial" | "Supplementary" | "Unclear"` (normalize.ts:11) — maps `i`/`initial` and `s`/`supplementary` (case-insensitive), everything else `"Unclear"`.
  - `parseFilesCount(v: unknown): number | null` (normalize.ts:18) — `parseInt` base 10, `null` for empty/NaN.
  - `parseIssuedDate(v: unknown): string | null` (normalize.ts:24) — Date instance → `toISOString().slice(0,10)`; string matching `^(\d{4})[-/](\d{1,2})[-/](\d{1,2})` → zero-padded `yyyy-mm-dd`; otherwise `new Date(s)` fallback, `null` if invalid.
- Inputs & outputs: raw cell values in, normalised strings/numbers/dates out. No stores, no env vars.
- Dependencies: uses -> nothing (zero imports). used by <- intra-unit L01 (parseWorkbooks.ts:1, ingest.ts:1, reimport.ts:1); L02 coc-pool-assignment (src/lib/siteCoc/assignmentEngine.ts:1, src/lib/siteCoc/routeUpload.ts:2, src/lib/siteCoc/rankCandidates.ts:1); L04 coc-pool-ingestion (src/lib/coc/assignPoolFile.ts:2); V06 site-coc-tab (src/views/site-coc/useSiteCocImport.ts:9, src/views/site-coc/useSiteCoc.ts:3); own test (normalize.test.ts:2). Grep-verified. This is the unit's most widely consumed file.
- Side effects: none — pure.
- Error handling: no throws; `null`/`undefined` inputs become `""` (normShop/normCert) or `null` (parse* functions); unparseable dates return `null` (normalize.ts:34).
- Tests: `src/lib/siteCoc/normalize.test.ts` — 9 tests covering separator collapsing, `&`→AND, null handling, cert stripping, type mapping, int parsing, and three `parseIssuedDate` shapes. All pass (run 2026-07-29).
- Observed issues:
  - The Date branch serialises via `toISOString()` (UTC; normalize.ts:26): a `Date` representing local midnight in a UTC-positive timezone stringifies to the previous UTC calendar day. The consumer parses workbooks with `cellDates: true` (useSiteCocImport.ts:14) and the paired test only exercises a UTC-midnight Date (normalize.test.ts:43).
  - The string fallback delegates to `new Date(s)` (engine-dependent parsing; normalize.ts:33) and again slices the UTC ISO string.
  - `parseFilesCount` uses `parseInt`, so `"4 files"` would return `4` and `"3.9"` returns `3` (normalize.ts:20); neither case is asserted in tests.
- ASSUMED: none.

## src/lib/siteCoc/normalize.test.ts
- Purpose: Vitest unit tests for the five normaliser functions.
- Public surface: none (test module).
- Inputs & outputs: literal strings/Dates in assertions only. No stores, no env vars.
- Dependencies: uses -> `vitest` (normalize.test.ts:1), `./normalize` (normalize.test.ts:2, intra-unit L01). used by <- none found (grep-verified); executed by the vitest runner.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; 9 tests, all passing (run 2026-07-29). Asserts: `normShop` collapses `-`/whitespace and maps `&`→AND ("SHOP-002"→"SHOP 002", "A&B"→"A AND B"; normalize.test.ts:5-13); `normShop(null)` = `""` (normalize.test.ts:9); `normCert` strips spaces/hyphens and uppercases (normalize.test.ts:17-21); `normCertType` maps `I`/`s`/`Initial`/`""` (normalize.test.ts:25-30); `parseFilesCount` on `3`, `"4"`, `""` (normalize.test.ts:34-38); `parseIssuedDate` on a UTC Date, an ISO string, `"n/a"`, and `null` (normalize.test.ts:42-51).
- Observed issues: no test exercises a non-UTC-midnight `Date` or a slash-separated / ambiguous date string, so the UTC-slice and `new Date(s)` fallback behaviours noted for normalize.ts are unasserted.
- ASSUMED: none.

## src/lib/siteCoc/ingest.ts
- Purpose: Matches parsed schedule shops to site subsections and assembles schedule/certificate arrays into insert-shaped rows stamped with `site_id`, `import_batch_id`, `subsection_id`, and `match_status`, plus a summary counter.
- Public surface:
  - `matchSubsection(row: { shop_no_raw: string; trading_name: string }, subs: SubsectionLite[]): string | null` (ingest.ts:28) — pass 1: exact `normShop` match of {Shop No, Trading Name} against {subsection name, tenant_name}; unique id wins, >1 distinct ids → `null` (ingest.ts:32-35). Pass 2: whole-word "subsection key appears in trading name" contains-fallback, trading name only, keys ≥3 chars, longest matched key wins, ties → `null` (ingest.ts:38-51).
  - `interface ScheduleInsertRow extends ParsedScheduleRow { site_id: string; import_batch_id: string; subsection_id: string | null; match_status: "matched" | "unmatched" }` (ingest.ts:54-56).
  - `interface CertificateInsertRow extends ParsedCertificate { ...same four fields }` (ingest.ts:57-59).
  - `assembleScheduleRows(parsed: ParsedScheduleRow[], subs: SubsectionLite[], siteId: string, batchId: string): ScheduleInsertRow[]` (ingest.ts:61).
  - `assembleCertificateRows(certs: ParsedCertificate[], scheduleRows: ScheduleInsertRow[], siteId: string, batchId: string): CertificateInsertRow[]` (ingest.ts:69) — certs inherit their shop's `subsection_id` from schedule rows via a `normShop`-keyed Map (ingest.ts:70-75).
  - `summarize(schedule: { match_status: string }[], certs: { match_status: string }[]): ImportSummary` (ingest.ts:78).
- Inputs & outputs: parsed rows + `SubsectionLite[]` (id/name/tenant_name) in; insert-shaped arrays out. The rows are inserted by the consumer into `coc_db_schedule` and `coc_certificates` (useSiteCocImport.ts:74, 79) — this file itself touches no store, no env vars.
- Dependencies: uses -> `./normalize` (`normShop`; ingest.ts:1), `./types` (types-only; ingest.ts:2) — intra-unit L01. used by <- V06 site-coc-tab (src/views/site-coc/useSiteCocImport.ts:5 — assemble*/summarize; src/views/site-coc/useSiteCoc.ts:4 — matchSubsection, applied at useSiteCoc.ts:80); own test (ingest.test.ts:2). Grep-verified; `ScheduleInsertRow`/`CertificateInsertRow`/`ImportSummary` symbol names have no consumers outside the unit (grep-verified).
- Side effects: none — pure.
- Error handling: no throws. Every non-match path returns `null` (empty keys ingest.ts:30, ambiguous exact ingest.ts:35, trading name <3 chars ingest.ts:39, no hits ingest.ts:48, length ties ingest.ts:51); unmatched rows get `match_status: "unmatched"` rather than an error (ingest.ts:64, 74).
- Tests: `src/lib/siteCoc/ingest.test.ts` — 15 tests covering exact/contains/longest-key/word-boundary/ambiguity behaviour of `matchSubsection`, stamping in `assembleScheduleRows`, inheritance in `assembleCertificateRows`, and `summarize` counts. All pass (run 2026-07-29).
- Observed issues:
  - `summarize` counts only literal `"matched"` and `"unmatched"` (ingest.ts:79-80); a row whose status is `"manual"` (producible by `applyPriorMatches`, reimport.ts:16, and the consumer calls summarize after applyPriorMatches at useSiteCocImport.ts:68-70) is included in `shops_imported` but in neither `matched_count` nor `unmatched_count`.
  - `summarize`'s `certs` parameter is only used for `certs.length` (ingest.ts:81); its declared `match_status` field is never read.
  - In `assembleCertificateRows`, the shop map is built with `Map.set` per schedule row (ingest.ts:71): two schedule rows normalising to the same shop key leave the later row's `subsection_id` as the inherited value.
  - The contains-fallback deliberately excludes Shop No (comment ingest.ts:37) and requires key length ≥3 (ingest.ts:44), so 1-2 character subsection names can only exact-match.
- ASSUMED:
  - The insert-row field names align with `coc_db_schedule` / `coc_certificates` table columns — inferred from the consumer's untransformed `.insert(schedRows)` / `.insert(certRows)` calls (useSiteCocImport.ts:74, 79), not verified against migrations (D02/D03 scope).

## src/lib/siteCoc/ingest.test.ts
- Purpose: Vitest unit tests for `matchSubsection`, the two assemblers, and `summarize`, using subsection fixtures modelled on the real YARONA naming shapes (comment ingest.test.ts:5).
- Public surface: none (test module).
- Inputs & outputs: fixtures `subs` (7 subsections incl. two "ATM" entries distinguished by tenant; ingest.test.ts:6-14), `subs2` (SHOPRITE/SHOPRITE LIQUOR/FISH AND CHIPS/PEP; ingest.test.ts:38-43), `schedRow` builder (ingest.test.ts:65-68), inline `ParsedCertificate` literals (ingest.test.ts:84-88, 94-98). No stores, no env vars.
- Dependencies: uses -> `vitest` (ingest.test.ts:1), `./ingest` (ingest.test.ts:2), `./types` (types-only; ingest.test.ts:3) — intra-unit L01. used by <- none found (grep-verified); executed by the vitest runner.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; 15 tests, all passing (run 2026-07-29). Asserts for `matchSubsection`: exact trading-name match (ingest.test.ts:17-19); contains match on a longer trading name (ingest.test.ts:20-22); exact beats longer sibling for PEP vs PEP CELL (ingest.test.ts:23-26); ATM resolved by tenant contains-match (ingest.test.ts:27-29); abbreviation mismatch → null ("KENTUCKY FRIED CHICKEN" vs "KFC"; ingest.test.ts:30-32); no match → null (ingest.test.ts:33-35); longest-key-wins for "SHOPRITE LIQUOR SHOP" (ingest.test.ts:44-46); plain SHOPRITE exact (ingest.test.ts:47-49); `&`→AND matching (ingest.test.ts:50-52); word-boundary guard "PEPPER STEAK HOUSE" ≠ PEP (ingest.test.ts:53-55); equal-length tie → null (ingest.test.ts:56-62). For assemblers: stamping + unmatched handling (ingest.test.ts:71-78); cert inheritance matched and unmatched (ingest.test.ts:82-102). `summarize` counts (ingest.test.ts:106-109).
- Observed issues: no test feeds a `"manual"`-status row to `summarize`, so the exclusion noted at ingest.ts:79-80 is unasserted.
- ASSUMED: none.

## src/lib/siteCoc/reimport.ts
- Purpose: Carries prior (auto or manual) shop→subsection resolutions onto freshly assembled schedule rows during a re-import so unmatched new rows regain their earlier match.
- Public surface:
  - `applyPriorMatches<T extends { shop_no_raw: string; subsection_id: string | null; match_status: "matched" | "unmatched" | "manual" }>(newRows: T[], priorMap: Map<string, { id: string; status: "matched" | "manual" }>, validSubsectionIds: Set<string>): T[]` (reimport.ts:9-11).
- Inputs & outputs: new rows plus a `normShop`-keyed prior map and a set of still-existing subsection ids in; a new array out where each currently-unmatched row whose normalised shop has a valid prior gets `subsection_id: prior.id, match_status: prior.status` (reimport.ts:12-19). Rows already matched are returned unchanged (fresh auto-match wins; reimport.ts:13). No stores, no env vars — the prior map is built by the consumer from a `coc_db_schedule` snapshot (useSiteCocImport.ts:59-64).
- Dependencies: uses -> `./normalize` (`normShop`; reimport.ts:1) — intra-unit L01. used by <- V06 site-coc-tab (src/views/site-coc/useSiteCocImport.ts:6, applied at :68); own test (reimport.test.ts:2). Grep-verified; no other consumers.
- Side effects: none — pure; returns new row objects via spread (reimport.ts:16).
- Error handling: no throws; a prior whose subsection id is absent from `validSubsectionIds` is ignored and the row stays unmatched (reimport.ts:15-18).
- Tests: `src/lib/siteCoc/reimport.test.ts` — 5 tests: carry-forward with shop normalisation, manual-status preservation, auto-match precedence, stale-subsection ignore, no-prior passthrough. All pass (run 2026-07-29).
- Observed issues:
  - The function can return rows whose runtime `match_status` is `"manual"` (reimport.ts:16) while the concrete `T` at the production call site is `ScheduleInsertRow`, whose declared `match_status` union is only `"matched" | "unmatched"` (ingest.ts:55) — a static type narrower than the runtime value.
- ASSUMED: none.

## src/lib/siteCoc/reimport.test.ts
- Purpose: Vitest unit tests for `applyPriorMatches`.
- Public surface: none (test module); a local `Row` type and `row()` builder (reimport.test.ts:4-6).
- Inputs & outputs: literal maps/sets; valid-id set `{"sub1","sub2","kept"}` (reimport.test.ts:9). No stores, no env vars.
- Dependencies: uses -> `vitest` (reimport.test.ts:1), `./reimport` (reimport.test.ts:2, intra-unit L01). used by <- none found (grep-verified); executed by the vitest runner.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; 5 tests, all passing (run 2026-07-29). Asserts: prior carried onto an unmatched row keyed by normalised shop ("SHOP-001" row vs "SHOP 001" prior; reimport.test.ts:11-15); prior `"manual"` status preserved (reimport.test.ts:17-21); fresh auto-match not overwritten (reimport.test.ts:23-27); prior with deleted subsection ignored (reimport.test.ts:29-33); rows without prior untouched (reimport.test.ts:35-38).
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/sansRules.ts
- Purpose: Hard-coded catalogue of COC verification rule codes (groups A/B/C) with helpers to extract and validate rule codes from Verification-sheet column headers.
- Public surface:
  - `type RuleResult = "PASS" | "FAIL" | "CV" | "N/A"` (sansRules.ts:1).
  - `interface SansRule { code: string; label: string; group: "A" | "B" | "C" }` (sansRules.ts:2).
  - `const COC_SANS_RULES: SansRule[]` (sansRules.ts:4-26) — 21 entries: A1, A2, A4, A5, A6; B1–B4; C1, C2, C3, C7–C15.
  - `ruleCodeFromHeader(header: string): string | null` (sansRules.ts:31-35) — regex `^([abc]\d+)\b` case-insensitive, uppercased.
  - `isKnownRuleCode(code: string): boolean` (sansRules.ts:37) — membership in a module-level Set built from the catalogue (sansRules.ts:28).
- Inputs & outputs: header strings in, codes/booleans out; the constant array is the data. No stores, no env vars.
- Dependencies: uses -> nothing (zero imports). used by <- intra-unit L01 (parseWorkbooks.ts:2, types.ts:1); L03 coc-reporting-status (src/lib/siteCoc/siteCocReport.ts:2, groups filtered at :40-42); V06 site-coc-tab (src/views/site-coc/VerificationSubTab.tsx:3, groups filtered at :9-11); own test (sansRules.test.ts:2). Grep-verified. `SansRule` and `isKnownRuleCode` have no consumers outside the unit (grep-verified).
- Side effects: none; one module-level `Set` built at import time (sansRules.ts:28).
- Error handling: no throws; `ruleCodeFromHeader` returns `null` on non-matching headers (sansRules.ts:33).
- Tests: `src/lib/siteCoc/sansRules.test.ts` — asserts the exact ordered code list and header extraction/rejection. All pass (run 2026-07-29).
- Observed issues:
  - The catalogue is non-contiguous: codes A3, C4, C5, C6 do not appear (sansRules.ts:4-26); nothing in the unit records why.
  - `RuleResult`'s `"CV"` literal is not expanded or documented anywhere in the unit (sansRules.ts:1).
- ASSUMED:
  - The "SANS" in the filename/constant refers to the SANS electrical-installation standard; no standard number is cited in the code itself (the SANS 10142-1 attribution appears only in Phase 1 notes, review/inventory/01-src-lib-siteCoc.md:134).

## src/lib/siteCoc/sansRules.test.ts
- Purpose: Vitest unit tests for the rule catalogue ordering and `ruleCodeFromHeader`.
- Public surface: none (test module).
- Inputs & outputs: literals only. No stores, no env vars.
- Dependencies: uses -> `vitest` (sansRules.test.ts:1), `./sansRules` (sansRules.test.ts:2, intra-unit L01). used by <- none found (grep-verified); executed by the vitest runner.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file; 3 tests, all passing (run 2026-07-29). Asserts the exact ordered array of 21 codes (sansRules.test.ts:6-9), extraction of "A1"/"C15" from labelled headers (sansRules.test.ts:14-17), and `null` for "Verdict" (sansRules.test.ts:18-20).
- Observed issues:
  - The test title says "has the 22 source rule codes in order" (sansRules.test.ts:5) while the asserted array — and `COC_SANS_RULES` itself — contains 21 codes (sansRules.test.ts:6-9; sansRules.ts:4-26). The assertion passes; only the description count differs.
- ASSUMED: none.

## src/lib/siteCoc/types.ts
- Purpose: Shared TypeScript interfaces for parsed workbook rows, a slim subsection shape, and the import summary.
- Public surface (types only, no runtime code):
  - `interface ParsedScheduleRow { shop_no_raw; trading_name; coc_required; initial_cert_nos; supplementary_cert_nos; unclear; supp_to_initial_ref; files_count: number | null; status; notes }` — all others `string` (types.ts:4-15).
  - `interface ParsedCertificate { shop_no_raw; cert_no; cert_no_norm; cert_type: "Initial" | "Supplementary" | "Unclear"; doc_type; clause_9_2; supp_to_init; issued_date: string | null; location; confidence; source_file; verdict; reasons; rules: Record<string, RuleResult>; notes }` (types.ts:18-34).
  - `interface SubsectionLite { id: string; name: string; tenant_name?: string | null }` (types.ts:36).
  - `interface ImportSummary { shops_imported: number; certs_imported: number; matched_count: number; unmatched_count: number }` (types.ts:38-43).
- Inputs & outputs: none at runtime (type-only module; compiles to nothing). No stores, no env vars.
- Dependencies: uses -> `./sansRules` (`RuleResult`, type-only; types.ts:1) — intra-unit L01. used by <- intra-unit L01 (parseWorkbooks.ts:3, ingest.ts:2, ingest.test.ts:3); V06 site-coc-tab (src/views/site-coc/useSiteCocImport.ts:10 — `SubsectionLite`, used at :48). Grep-verified; `ParsedScheduleRow`/`ParsedCertificate`/`ImportSummary` have no consumers outside the unit's own files.
- Side effects: none.
- Error handling: n/a (no runtime code).
- Tests: no dedicated test file (only implementation file in the unit without one); the interfaces are exercised structurally by all five sibling test files via the functions they type.
- Observed issues:
  - `ParsedCertificate.rules` is `Record<string, RuleResult>` (types.ts:32), keyed by any string — the known-code restriction is enforced only at parse time (parseWorkbooks.ts:88), not in the type.
  - `SubsectionLite` duplicates a subset of the subsection row selected by the consumer (`id, name, tenant_name`; useSiteCocImport.ts:46) rather than referencing the generated Supabase row types (L19).
- ASSUMED: none.
