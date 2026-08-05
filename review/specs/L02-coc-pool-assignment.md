# L02 — coc-pool-assignment — Phase 2 specification

- Unit id: L02
- Slug: coc-pool-assignment
- Spec mode: full
- Date: 2026-07-29
- Files: 12 (6 source + 6 co-located tests, per `review/unit-files.json` key "L02")

## Unit header

**Unit purpose.** Pure planning/classification logic for getting uploaded COC files attached to the right subsections of a site: it classifies pooled files against the site's certificate register (`assignmentEngine.ts`, filtered to auto-assignables by `poolAssign.ts`), plans filename-based routing and coc-vs-eval kind detection (`routeUpload.ts`), ranks subsection candidates for manual assignment by fuzzy name similarity (`rankCandidates.ts`), computes live coverage tallies (`coverage.ts`), and provides a bounded-concurrency async runner plus upload-outcome summariser (`uploadQueue.ts`). Every function is data-in/data-out; the unit performs no I/O of any kind.

**Module-level observations (cross-file facts inside the unit).**
- No file in the unit touches network, database, storage, localStorage/IndexedDB, or env vars. The only imports beyond the unit itself are `normCert`/`normShop` from `./normalize` (L01 coc-import-pipeline; assignmentEngine.ts:1, routeUpload.ts:2, rankCandidates.ts:1) and `extractCocNumber` from `@/lib/cocFilename` (L09 coc-compliance-calcs; routeUpload.ts:1). `coverage.ts` and `uploadQueue.ts` have zero imports.
- `CertRowLite` is declared twice with an identical shape `{ id: string; cert_no_norm: string; subsection_id: string | null }`: assignmentEngine.ts:4 and routeUpload.ts:13. poolAssign.ts:3 re-exports the assignmentEngine one.
- Two parallel cert-number classifiers exist over the same `normCert` key with divergent duplicate/no-subsection semantics: `planPoolAssignment` (assignmentEngine.ts:23, five outcomes; >1 matches all pointing to one subsection collapse to `"assigned"` at assignmentEngine.ts:38-42) and `planRouting` (routeUpload.ts:20, three statuses; matches are pre-filtered to rows having a `subsection_id` at routeUpload.ts:25, and any >1 match count is `"ambiguous"` at routeUpload.ts:28 with no same-subsection collapse).
- Each source file has exactly one co-located `*.test.ts` sibling. All six test files are Vitest (`describe`/`it`/`expect` imported from "vitest") and are picked up by the root `vitest.config.ts` (`include: ['src/**/*.test.{ts,tsx}']`, default `environment: 'node'`, vitest.config.ts:20/25).
- Grep hits for unit symbols inside `src/graphify-out/cache/*.json` are generated knowledge-graph cache artifacts (untracked per git status; they reference an old absolute path `/Users/spud/Documents/DEVELOPER/...`), not code consumers; they are excluded from all "used by <-" lists below.

**External contract (what the rest of the app gets from this unit).**
- L04 coc-pool-ingestion: `planPoolAssignment` + `CertRowLite`/`PoolFileLite` types (src/lib/coc/reassignPool.ts:2, used at reassignPool.ts:16) and `classifyCocFile` (src/lib/coc/poolUpload.ts:3).
- V06 site-coc-tab: `rankSubsectionCandidates` (src/views/site-coc/AssignSubTab.tsx:7); `assignedSubsectionIds` + `unassignedCocRequired` (src/views/site-coc/ScheduleSubTab.tsx:5); `liveMatchCounts` (src/views/site-coc/SiteCocTab.tsx:7); `mapWithConcurrency` + `summarizeUpload` + `FileOutcome` (src/views/site-coc/useSiteCocPool.ts:7, runner invoked at useSiteCocPool.ts:36).
- `planPoolAutoAssign` (poolAssign.ts:8) and `planRouting` (routeUpload.ts:20) have no consumers outside their own test files (grep-verified across src and supabase).

---

## src/lib/siteCoc/assignmentEngine.ts
- Purpose: Classifies every pooled COC file by how its detected certificate number maps onto the site's register certs, producing one of five outcomes per file (doc comment assignmentEngine.ts:22).
- Public surface:
  - `interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null }` (assignmentEngine.ts:3)
  - `interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null }` (assignmentEngine.ts:4)
  - `type AssignOutcome = "assigned" | "ambiguous_cert" | "cert_has_no_subsection" | "cert_not_found" | "no_cert_detected"` (assignmentEngine.ts:6-11)
  - `interface PoolClassification { poolId: string; outcome: AssignOutcome; certId?: string; subsectionId?: string; candidateCertIds?: string[]; candidateSubsectionIds?: string[] }` (assignmentEngine.ts:13-20)
  - `planPoolAssignment(files: PoolFileLite[], certs: CertRowLite[]): PoolClassification[]` (assignmentEngine.ts:23)
- Inputs & outputs: In — pool-file rows (id + detected cert number/kind) and register cert rows (id + normalised cert number + subsection id). Out — one `PoolClassification` per input file, in input order. Matching key is `normCert(detected_cert_no)` compared to `cert_no_norm` (assignmentEngine.ts:25, 28). Decision ladder: empty/absent key → `no_cert_detected` (line 26); zero matches → `cert_not_found` (line 29); one match with subsection → `assigned` with certId+subsectionId (line 34), without subsection → `cert_has_no_subsection` with certId (line 35); >1 matches → `assigned` only if every match has a subsection and all point to the same single subsection, taking `matches[0].id` as certId (lines 38-42), otherwise `ambiguous_cert` carrying `candidateCertIds` (all matching cert ids) and `candidateSubsectionIds` (deduped non-null subsection ids) (lines 43-48). Stores touched: none.
- Dependencies: uses -> `normCert` from `./normalize` (assignmentEngine.ts:1; L01 coc-import-pipeline, defined normalize.ts:6). used by <- src/lib/siteCoc/poolAssign.ts:1 (L02, internal), src/lib/coc/reassignPool.ts:2 (L04 coc-pool-ingestion, invoked reassignPool.ts:16), src/lib/siteCoc/assignmentEngine.test.ts:2 (L02) — grep-verified.
- Side effects: none; pure synchronous function, no mutation of inputs.
- Error handling: no throw paths and no try/catch; every input shape maps to an outcome value (null/empty cert number degrades to the `no_cert_detected` outcome rather than an error).
- Tests: src/lib/siteCoc/assignmentEngine.test.ts — 6 cases asserting deep equality of the full classification object for: unique match assigned (test:15-18), null cert number → `no_cert_detected` (test:20-23), unknown number → `cert_not_found` (test:25-28), sole match lacking subsection → `cert_has_no_subsection` (test:30-33), duplicate number across two subsections → `ambiguous_cert` with both candidate lists (test:35-43), duplicates sharing one subsection → `assigned` (test:45-48).
- Observed issues: `CertRowLite` here duplicates routeUpload.ts:13 field-for-field (see unit header). In the >1-match assigned branch, the reported `certId` is arbitrarily `matches[0].id` (assignmentEngine.ts:41) even though several cert rows matched.
- ASSUMED: none.

## src/lib/siteCoc/assignmentEngine.test.ts
- Purpose: Unit tests for `planPoolAssignment` over a fixed 7-row cert fixture covering all five outcomes.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — inline fixtures (`certs` array test:4-12, per-test `PoolFileLite` literals). Out — test pass/fail via vitest assertions. Stores touched: none.
- Dependencies: uses -> `describe/it/expect` from "vitest" (test:1); `planPoolAssignment` from `./assignmentEngine` (test:2, L02). used by <- none found (grep-verified; executed by the vitest runner via `include: 'src/**/*.test.{ts,tsx}'`, vitest.config.ts:25).
- Side effects: registers 1 describe / 6 it blocks with the test runner; nothing else.
- Error handling: assertion failure fails the test case (vitest default); no custom handling.
- Tests: is itself the test file for assignmentEngine.ts; assertions listed in that section above. Notably test:16 passes `"B-1612744"` (hyphenated) against `cert_no_norm: "B1612744"`, exercising the `normCert` strip behaviour end-to-end.
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/poolAssign.ts
- Purpose: Reduces `planPoolAssignment` output to the auto-assignable subset — only files classified `assigned` — pairing each with its subsection and a coc/eval kind (doc comment poolAssign.ts:7).
- Public surface:
  - re-export `type { PoolFileLite, CertRowLite } from "./assignmentEngine"` (poolAssign.ts:3)
  - `interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval" }` (poolAssign.ts:5)
  - `planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[]` (poolAssign.ts:8)
- Inputs & outputs: In — same shapes as `planPoolAssignment`. Out — `AutoAssign[]` for classifications with `outcome === "assigned"` (poolAssign.ts:11); `kind` is `"eval"` only when the source file's `detected_kind === "eval"`, anything else (including null) becomes `"coc"` (poolAssign.ts:14). Stores touched: none.
- Dependencies: uses -> `planPoolAssignment`, types from `./assignmentEngine` (poolAssign.ts:1; L02 internal). used by <- src/lib/siteCoc/poolAssign.test.ts:2 (L02) only; no non-test consumers found (grep-verified for both "poolAssign" and "planPoolAutoAssign" across src and supabase).
- Side effects: none; pure synchronous function.
- Error handling: none. Line 13 uses a non-null assertion `byId.get(c.poolId)!`; a missing id would surface as a TypeError reading `detected_kind` of undefined at runtime (the id set is produced by mapping the same `files` array at poolAssign.ts:9-10, so classification poolIds always exist in the map).
- Tests: src/lib/siteCoc/poolAssign.test.ts — 2 cases: unique matches auto-assigned with detected kind carried through, including `"B 1612747"` (space) matching `"B1612747"` (test:13-22); ambiguous / no-subsection / no-number files all filtered out to `[]` (test:23-30).
- Observed issues: exported production function has zero runtime consumers (grep-verified; see unit header). `subsectionId` is cast with `as string` (poolAssign.ts:14) rather than narrowed.
- ASSUMED: none.

## src/lib/siteCoc/poolAssign.test.ts
- Purpose: Unit tests for `planPoolAutoAssign`'s filtering and kind mapping.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — inline 5-row cert fixture (test:4-10) and per-test pool-file literals. Out — vitest pass/fail. Stores touched: none.
- Dependencies: uses -> "vitest" (test:1); `planPoolAutoAssign` from `./poolAssign` (test:2, L02). used by <- none found (grep-verified; run by vitest include glob).
- Side effects: registers 1 describe / 2 it blocks.
- Error handling: vitest default assertion failure.
- Tests: is itself the test file for poolAssign.ts; asserts exact output arrays via `toEqual` (test:18-21, test:29).
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/routeUpload.ts
- Purpose: Filename-driven planning for direct COC uploads — classifies each file as coc vs eval and routes it to a subsection via the cert number extracted from its name.
- Public surface:
  - `type FileKind = "coc" | "eval"` (routeUpload.ts:4)
  - `classifyCocFile(fileName: string): FileKind` (routeUpload.ts:6)
  - `interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null }` (routeUpload.ts:13)
  - `interface RoutePlanItem { name: string; kind: FileKind; certNo: string | null; subsectionId: string | null; certRowId: string | null; status: "routed" | "unmatched" | "ambiguous" }` (routeUpload.ts:14-18)
  - `planRouting(files: { name: string }[], certRows: CertRowLite[]): RoutePlanItem[]` (routeUpload.ts:20)
- Inputs & outputs: In — file names (path prefix stripped at routeUpload.ts:7) and cert rows. Out — `classifyCocFile` returns `"eval"` for a `pass`/`fail` prefix followed by `-`/`_`/whitespace (case-insensitive, line 8) or a `.htm`/`.html` extension (line 9), else `"coc"` (line 10). `planRouting` extracts the cert number via `extractCocNumber`, normalises with `normCert`, and matches only cert rows that both share the key and have a `subsection_id` (line 25): exactly 1 match → `status: "routed"` with subsectionId+certRowId (line 26); 0 matches (including no extractable number, or matched certs lacking subsections) → `"unmatched"` (line 27); >1 → `"ambiguous"` with null subsectionId/certRowId (line 28). Result is sorted cocs-before-evals via in-place `plan.sort` (line 30). Stores touched: none.
- Dependencies: uses -> `extractCocNumber` from `@/lib/cocFilename` (routeUpload.ts:1; L09 coc-compliance-calcs, defined cocFilename.ts:7), `normCert` from `./normalize` (routeUpload.ts:2; L01). used by <- src/lib/coc/poolUpload.ts:3 imports `classifyCocFile` only (L04 coc-pool-ingestion); src/lib/siteCoc/routeUpload.test.ts:2 (L02). `planRouting` itself: no non-test consumers found (grep-verified).
- Side effects: none external; `planRouting` sorts its own freshly-mapped array in place before returning (line 30) — inputs are not mutated.
- Error handling: no throw paths; unmatchable or numberless filenames degrade to `status: "unmatched"` rather than errors.
- Tests: src/lib/siteCoc/routeUpload.test.ts — `classifyCocFile`: PASS-/FAIL- prefix → eval (test:5-8), `.html` → eval (test:9), plain pdf → coc (test:10). `planRouting`: unique match routed with coc-before-eval ordering (test:20-25), no number match → unmatched (test:26-29), matched cert without subsection → unmatched (test:30-33), duplicate number resolving to >1 subsection → ambiguous (test:34-37).
- Observed issues: duplicate `CertRowLite` declaration (routeUpload.ts:13 vs assignmentEngine.ts:4). Divergent duplicate semantics vs `planPoolAssignment`: two cert rows with the same number pointing at the same subsection yield `"ambiguous"` here (any >1 count, routeUpload.ts:28) but `"assigned"` in assignmentEngine.ts:40-42; and a sole cert without subsection is folded into `"unmatched"` here (filter at line 25) while assignmentEngine gives it the distinct `cert_has_no_subsection` outcome. `planRouting` has no runtime consumers (grep-verified).
- ASSUMED: none.

## src/lib/siteCoc/routeUpload.test.ts
- Purpose: Unit tests for `classifyCocFile` kind detection and `planRouting` status ladder/ordering.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — filename literals and a 4-row cert fixture including a no-subsection cert and a duplicate number (test:14-19). Out — vitest pass/fail. Stores touched: none.
- Dependencies: uses -> "vitest" (test:1); `classifyCocFile`, `planRouting` from `./routeUpload` (test:2, L02). used by <- none found (grep-verified; run by vitest include glob).
- Side effects: registers 2 describes / 7 it blocks.
- Error handling: vitest default assertion failure.
- Tests: is itself the test file for routeUpload.ts; uses `toMatchObject` for routed items (test:23-24) and `toBe`/`toEqual` elsewhere. The kind-ordering assertion checks `["coc","eval"]` after passing eval-first input (test:21-22).
- Observed issues: the same-number-same-subsection duplicate case (which `planPoolAssignment` collapses to assigned) is not exercised for `planRouting`; the ambiguous fixture uses two different subsections (test:18, test:34-37).
- ASSUMED: none.

## src/lib/siteCoc/rankCandidates.ts
- Purpose: Ranks a site's subsections by fuzzy similarity between a shop/trading-name query and each subsection's name or tenant name, returning the top-N (doc comment rankCandidates.ts:43).
- Public surface:
  - `interface RankInput { id: string; name: string; tenant_name?: string | null }` (rankCandidates.ts:3)
  - `interface RankedCandidate { id: string; name: string; score: number }` (rankCandidates.ts:4)
  - `rankSubsectionCandidates(query: string, subs: RankInput[], topN = 3): RankedCandidate[]` (rankCandidates.ts:44)
  - Non-exported helpers: `levenshtein` (two-row DP, rankCandidates.ts:6-21), `editSim` = 1 − distance/maxLen (23-27), `tokenOverlap` = Jaccard on space-split tokens (29-36), `score` = max(editSim, tokenOverlap), 0 for empty key (38-41).
- Inputs & outputs: In — raw query string plus subsection rows. Out — top-N `RankedCandidate`s sorted score-descending (rankCandidates.ts:54-55). Query and both candidate keys are normalised through `normShop` (uppercase, "&"→" AND ", collapse whitespace/hyphen/underscore; normalize.ts:1-4) at rankCandidates.ts:45, 49; per-candidate score is the max over the name key and (when present) tenant-name key (line 50). Display name becomes `"name · tenant_name"` when a distinct tenant name exists, else `name` (line 51). Stores touched: none.
- Dependencies: uses -> `normShop` from `./normalize` (rankCandidates.ts:1; L01, defined normalize.ts:1). used by <- src/views/site-coc/AssignSubTab.tsx:7 (V06 site-coc-tab); src/lib/siteCoc/rankCandidates.test.ts:2 (L02) — grep-verified.
- Side effects: none; pure synchronous function.
- Error handling: no throw paths; empty/whitespace-only query returns `[]` (rankCandidates.ts:46); an empty candidate key scores 0 via the `if (!key) return 0` guard (line 39).
- Tests: src/lib/siteCoc/rankCandidates.test.ts — 4 cases over a 3-subsection fixture: exact match first with score > 0.8 (test:11-15), extra-word near-miss ("MR PRICE" → "Mr Price"/"Mr Price Home") outranks unrelated names (test:17-20), topN honoured and output sorted descending (test:22-26), empty query → `[]` (test:28-30).
- Observed issues: `RankInput` (rankCandidates.ts:3) has the same field shape as `SubsectionLite` (src/lib/siteCoc/types.ts:36, L01 unit) under a different name. `sort` at line 54 is applied to the freshly-mapped array (inputs untouched).
- ASSUMED: none.

## src/lib/siteCoc/rankCandidates.test.ts
- Purpose: Unit tests for `rankSubsectionCandidates` ordering, thresholding, topN, and empty-query behaviour.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — 3-row subsection fixture (test:4-8) with a null tenant_name and a distinct tenant_name. Out — vitest pass/fail. Stores touched: none.
- Dependencies: uses -> "vitest" (test:1); `rankSubsectionCandidates` from `./rankCandidates` (test:2, L02). used by <- none found (grep-verified; run by vitest include glob).
- Side effects: registers 1 describe / 4 it blocks.
- Error handling: vitest default assertion failure.
- Tests: is itself the test file for rankCandidates.ts; asserts winner ids and relative score ordering, plus one absolute threshold (`score > 0.8`, test:14). No assertion covers the `"name · tenant_name"` label format.
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/coverage.ts
- Purpose: Tiny set/tally helpers describing which subsections are covered by schedule rows and which COC-required subsections remain unassigned.
- Public surface:
  - `assignedSubsectionIds(rows: { subsection_id: string | null }[]): Set<string>` (coverage.ts:1)
  - `unassignedCocRequired<T extends { id: string; is_coc_required?: boolean | null }>(subs: T[], assigned: Set<string>): T[]` (coverage.ts:5-7)
  - `liveMatchCounts(rows: { subsection_id: string | null }[]): { matched: number; unmatched: number }` (coverage.ts:12) — doc comment: a row is matched when it has a subsection (coverage.ts:11)
- Inputs & outputs: In — schedule-row projections and subsection rows. Out — `assignedSubsectionIds`: Set of non-null subsection ids (line 2); `unassignedCocRequired`: input subsections where `is_coc_required` is truthy and the id is absent from the assigned set, preserving input order and full row type `T` (line 8); `liveMatchCounts`: `{ matched, unmatched }` counts over the rows (lines 13-15). Stores touched: none.
- Dependencies: uses -> nothing (zero imports). used by <- src/views/site-coc/ScheduleSubTab.tsx:5 (`assignedSubsectionIds`, `unassignedCocRequired`; V06 site-coc-tab), src/views/site-coc/SiteCocTab.tsx:7 (`liveMatchCounts`; V06), src/lib/siteCoc/coverage.test.ts:2 (L02) — grep-verified.
- Side effects: none; pure synchronous functions.
- Error handling: no throw paths; empty inputs produce empty Set / empty array / `{ matched: 0, unmatched: 0 }`.
- Tests: src/lib/siteCoc/coverage.test.ts — 5 cases: matched/unmatched tally including nulls (test:5-8), empty schedule → zeros (test:9-11), non-null id collection (test:14-19), COC-required-and-unassigned filtering (test:27-30), non-required exclusion even when unassigned (test:31-34).
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/coverage.test.ts
- Purpose: Unit tests for the three coverage helpers.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — inline row/subsection literals (fixture with `is_coc_required` true/true/false at test:22-26). Out — vitest pass/fail. Stores touched: none.
- Dependencies: uses -> "vitest" (test:1); all three helpers from `./coverage` (test:2, L02). used by <- none found (grep-verified; run by vitest include glob).
- Side effects: registers 3 describes / 5 it blocks.
- Error handling: vitest default assertion failure.
- Tests: is itself the test file for coverage.ts; asserts via `toEqual` on tallies and mapped id arrays (Set spread-sorted at test:18).
- Observed issues: none.
- ASSUMED: none.

## src/lib/siteCoc/uploadQueue.ts
- Purpose: Generic bounded-concurrency async runner with order-preserving results and per-completion progress, plus a summariser of per-file upload outcomes.
- Public surface:
  - `type FileOutcome = { name: string; state: "uploaded"; poolId: string; detectedCertNo: string | null } | { name: string; state: "failed"; error: string }` (uploadQueue.ts:1-3)
  - `interface UploadSummary { total: number; uploaded: number; failed: number }` (uploadQueue.ts:5)
  - `async mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>, onProgress?: (done: number, total: number) => void): Promise<R[]>` (uploadQueue.ts:8-13)
  - `summarizeUpload(outcomes: FileOutcome[]): UploadSummary` (uploadQueue.ts:31)
- Inputs & outputs: In — arbitrary items, a concurrency limit, an async worker, optional progress callback. Out — results array indexed identically to `items` (results written by captured index, uploadQueue.ts:23). Runner count is `Math.min(Math.max(1, limit), total || 1)` (line 18): limit ≤ 0 becomes 1; an empty items array still creates one runner, which exits immediately and yields `[]`. Runners pull indices from a shared `next` counter until exhausted (lines 20-22); `onProgress(done, total)` fires after every completed worker (lines 24-25). `summarizeUpload` counts `state === "uploaded"` vs everything else as failed (lines 32-34). Stores touched: none — the runner itself performs no I/O; I/O belongs to the caller-supplied worker.
- Dependencies: uses -> nothing (zero imports). used by <- src/views/site-coc/useSiteCocPool.ts:7 (`mapWithConcurrency`, `summarizeUpload`, `FileOutcome`; V06 site-coc-tab, runner invoked at useSiteCocPool.ts:36), src/lib/siteCoc/uploadQueue.test.ts:2 (L02) — grep-verified. No supabase-side consumers.
- Side effects: none of its own; invokes the provided `worker` and `onProgress` callbacks.
- Error handling: no try/catch anywhere. A rejecting worker rejects that runner's loop promise, so the awaited `Promise.all(runners)` (line 27) — and therefore `mapWithConcurrency` itself — rejects; partial results are discarded and other in-flight runners keep pulling from the shared counter unobserved. An exception thrown by `onProgress` propagates the same way. `summarizeUpload` has no failure path.
- Tests: src/lib/siteCoc/uploadQueue.test.ts — `mapWithConcurrency`: processes all 7 items with limit 3, output order preserved, instrumented `maxActive` never exceeds 3 (test:5-16); progress callback fires once per completion with final `done === total` (test:18-23). `summarizeUpload`: 2 uploaded + 1 failed → `{ total: 3, uploaded: 2, failed: 1 }` (test:27-34). The worker-rejection path is not tested.
- Observed issues: `FileOutcome`/`UploadSummary` model upload results, but the file contains no upload logic — the caller (useSiteCocPool.ts, V06) builds the outcomes; the summariser's else-branch counts any non-"uploaded" state as failed (line 33).
- ASSUMED: "other in-flight runners keep pulling from the shared counter" after a rejection is inferred from the code structure (no cancellation mechanism exists in lines 18-27); I did not execute a failing-worker scenario to observe it.

## src/lib/siteCoc/uploadQueue.test.ts
- Purpose: Unit tests for the bounded-concurrency runner and the upload summariser.
- Public surface: none (test module; no exports).
- Inputs & outputs: In — numeric item arrays, an instrumented async worker using a 1 ms `setTimeout` (test:7-12), and a 3-element `FileOutcome[]` fixture (test:28-32). Out — vitest pass/fail. Stores touched: none.
- Dependencies: uses -> "vitest" (test:1); `mapWithConcurrency`, `summarizeUpload`, `type FileOutcome` from `./uploadQueue` (test:2, L02). used by <- none found (grep-verified; run by vitest include glob).
- Side effects: registers 2 describes / 3 it blocks; schedules real 1 ms timers inside the worker (no fake timers used).
- Error handling: vitest default assertion failure; both `it` callbacks are async and awaited by the runner.
- Tests: is itself the test file for uploadQueue.ts; the concurrency bound is asserted as `maxActive <= 3` via live counters (test:15), progress as the exact sequence `[1, 2, 3]` (test:21).
- Observed issues: the progress assertion `seen` equalling strictly increasing `[1, 2, 3]` (test:21) depends on completion ordering of the 2-runner drain over an instant worker; no test covers worker rejection or `limit` values ≤ 0.
- ASSUMED: none.
