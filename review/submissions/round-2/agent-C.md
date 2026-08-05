# Agent C — Round 2 submission

## Strategy

This repo has two productions: the one that runs and the one git can rebuild. Neither describes the other, and drift runs both ways. `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:2,4` says a blocker fix was pasted into prod and kept "intentionally OUTSIDE supabase/migrations/"; `20260616100000_*.sql:3-4,12` records a trigger "created directly in prod (drift — never recorded in the repo)"; `PENDING-2026-06-11-emergency-triage-lockdown.sql:5-6` is the reverse — a tracked migration never applied. Seven functions exist only as `*.PULLED-FROM-PROD.ts`. A clean apply dies at `20260612120000_coc_compliance_gate.sql:65`. Nothing measures the gap: `ls .github` → absent; no typecheck script (`package.json:5-12`); `ignoreBuildErrors` on (`next.config.mjs:112`); `tsc --noEmit` today gives 171 errors against the recorded 109 baseline (`next.config.mjs:110`). So every fix here is currently unprovable. I sequence one blocker deletion and one rebuildable database first, then fixes a machine re-checks.

---

### P-C01 — Delete the two one-off repair functions instead of hardening them

**Addresses:** F-02

**What changes and why.** These are repair scripts with no caller: `git grep fix-inspection-photos` outside the function's own log strings returns only `supabase/config.toml:49`; `fix-tenant-images` returns only `config.toml:36`. Nothing in `src/` invokes either. They remain live only because tracked config keeps registering them — `verify_jwt = false` at `config.toml:49-50` in front of a service-role handler whose `dryRun` writes anyway (`index.ts:246-253` merely passes a copy into the same writer; `:182-186` updates `inspections.json_data` in either mode). There is no fix to write. An unauthenticated destructive rewrite of `inspections.json_data` with zero callers is deleted, not authorised. Remove both directories and both `[functions.*]` blocks; the registry assertion that keeps them gone lands in P-C05.

**Effort** S · **Risk** low-med · **Order** 1, no dependencies. First position deliberately: this is the only blocker closable without a database. · **Gate:** escalation-list item "removing code that looks dead but might be called by a scheduled job or webhook". Deleting the directory does **not** undeploy — `supabase functions delete` must be run against prod as a named step, and until it is, the deployed URL stays callable. Check the deployment log for invocations first; git revert restores the source.

---

### P-C02 — Make `supabase db reset` succeed from zero

**Addresses:** F-31, F-109 (partial — declared)

**What changes and why.** The deliverable is a machine criterion, not an enumeration I cannot make from a repo with no prod access: `supabase db reset` exits 0. The procedure is the reset itself — run it, add one tracked forward-only repair migration for the object it names, repeat. It terminates: each failure names one missing object. Today it dies in the executed `DO` block at `20260612120000_coc_compliance_gate.sql:62-69` — `:65` filters `public.subsections WHERE deleted_at IS NULL`, a column no migration adds; the function body at `:10-59` does not resolve column names at `CREATE`. F-31's six objects plus `trg_recompute_from_template` are the seed list, not the boundary. Add `.down.sql` for the two 2026-06 lockdowns.

**Effort** M · **Risk** low (local until CI is green) · **Order** 1, parallel with P-C01; blocks P-C03, P-C04, P-C05. Cost of this position: P-C06/P-C07's verdict fixes wait behind it. I accept that — the recompute has been silently wrong since `20260615140000:44` and a correction applied to a database nobody can rebuild cannot be shown to have worked. · **Gate:** forward-only, no squash — a squashed baseline is a history rewrite and needs a decision before code. F-109 partial: this adds down files for two lockdowns and makes "no `.down.sql`" a CI failure for *new* migrations; the 14 historic `CASCADE` drops are not reversed. F-124's hardcoded prod UUIDs replay on every reset and are recorded, not edited.

---

### P-C03 — Re-land the out-of-band prod fixes as migrations, then assert the policy set

**Addresses:** F-03, F-04, F-05, F-111, F-112, F-01 (partial — declared)

**What changes and why.** One defect, not six: tracked history's last word is `USING (true)` and the corrections live outside it. Move the tier-2 script — its own `:11` says "THEN move this into supabase/migrations/" — and `PENDING-…-oob-tables.sql` into migrations, then extend to what the applied script structurally misses: it scans `schemaname='public'` (`:24`), so `storage.objects` and role-unqualified `client_access_links` survive, and it only demotes anon to authenticated. Additionally drop "Anyone can view all storage" (`20251120083932:18-20`), scope the three `TO authenticated WITH CHECK (true)` writes (`20260611110000:25-30`) by leading path segment, and call the existing `validate()` (`uploadCocFiles.ts:8-11`) from `poolUpload.ts:22`. Replace F-112's comment-only VERIFY blocks with executable assertions.

**Effort** M · **Risk** med-high · **Order** 2, after P-C02 (needs a database to test against) · **Gate:** non-additive (drops/replaces policies) and squarely on the access-control gate. The applied script's own PREREQUISITE (`:6-11`) warns live QR reads break unless the public RPCs are in place — staging apply plus `.down.sql`. **F-01 partial, declared:** the `public = true` flag (`20251120083541:20`) is *not* flipped here; 49 tracked `getPublicUrl` call sites across 34 files read through it, so privatising `documents` is a separate read-path change with its own review. F-111 forces a choice — pick one staff predicate for the three at `20260610120000:39-48`, `20260623120000:3-4`, `20260708090000:10-11`; that is a boundary change, not a refactor. And a reset gate cannot see prod-side drift: `PENDING-…-emergency-triage-lockdown.sql:5-6` says its canonical SQL is already tracked at `20260611110000`, so prod may be missing a *tracked* fix. Only a prod policy probe settles that.

---

### P-C04 — Atomic role change, and make "exactly one role row" true rather than assumed

**Addresses:** F-28, F-36

**What changes and why.** `UserRLSPolicies.tsx:112-123` deletes every `user_roles` row for a user then inserts, as two unwrapped requests; `onError` is a toast (`:131-134`). A failure between them leaves zero roles, and an admin editing their own role fails the Admin-gated insert deterministically — self-lockout with no UI recovery. Replace with one `SECURITY DEFINER` RPC running both statements in a single transaction behind an explicit caller check, and add `UNIQUE(user_id)` so the single row every reader assumes — `useUserRole.tsx:45-52` and `useRoleRedirect.ts:16-20` both `.maybeSingle()` — is enforced rather than hoped for. Ships with a pgTAP file asserting the rollback case.

**Effort** S-M · **Risk** med · **Order** 3, depends only on P-C02. Deliberately *not* held behind P-C05: the pgTAP file is written and run locally now, and P-C05 later runs the same file unchanged. An authorization write with a live lockout path does not wait for a workflow to exist. · **Gate:** auth flow. `UNIQUE(user_id)` is non-additive against existing duplicate rows — the migration reconciles and logs discarded rows before adding the constraint, and ships a `.down.sql`. The reconciliation is a data change on live role assignments and must be reviewed as one, separately from the schema change.

---

### P-C05 — One gate, and a machine that runs it

**Addresses:** F-33, F-32, F-70, F-134, F-34 (partial — declared), F-133, F-80

**What changes and why.** Add `typecheck: tsc --noEmit` (`package.json:5-12` has none); create `.github/workflows/` — absent. No new framework: vitest (`:10`), `supabase db reset` and deno already exist. Jobs: reset plus P-C03's assertions and P-C04's pgTAP; `deno test` over `supabase/functions`; vitest with `supabase/**` added to `vitest.config.ts:22`'s `src/**`-only include, `TZ` pinned. Regenerate `types.ts` against P-C02's DB — `site_health_snapshots` has 0 hits yet three live consumers (`route.ts:93`, `useSiteScores.ts:26`, `ComplianceDashboard.tsx:110`, masked by `(supabase as any)` at `:109`). The 171-vs-109 gap is 42 errors in untracked `' 2'` files swept in by `tsconfig.json:27`; exclude them at `tsconfig.json:28` and `.gitignore:11` so the count is machine-identical. Commit an error-count file, fail on increase, flip `ignoreBuildErrors` (`next.config.mjs:112-113`) off at zero.

**Effort** L · **Risk** low · **Order** 3, parallel with P-C04; needs P-C02 for the reset job and type regen · **Gate:** CI runs against a throwaway local Supabase, never prod credentials or the service-role key, and must not auto-seed `supabase/seeds/fortress_abaqulusi_seed.sql` — it carries real named individuals (`supabase/seeds/fortress_abaqulusi_seed.sql:8,13`; F-113). **F-34 partial, declared:** this makes the server, database and access-control paths executable and runs what exists; it does not author the 16 missing offline-mutation-type tests or the `ProtectedRoute`/`useUserRole` guard tests. That is test writing, not gate construction, and I would rather ship a gate that runs three real paths than a plan for tests nobody has written. The F-134 exclusion is the tracked half of that finding — deleting one machine's untracked working tree is not a reviewable change; a glob in `.gitignore` is.

---

### P-C06 — One compliance vocabulary, one verdict engine

**Addresses:** F-24, F-25, F-23, F-46, F-108, F-57, F-63, F-79

**What changes and why.** Read F-23–F-26 as one root cause: no canonical vocabulary and nothing that catches divergence. Four modules declare their own sets — `cocCompliance.ts:6-7`, `complianceCalculations.ts:33,38`, `cocHierarchy.ts:39`, `siteCoc/statusDisplay.ts:4-26` — and the DB recompute matches `status in ('open','in_progress')` (`20260615140000:44`) against `CHECK (status IN ('Open','Rectified','Closed'))` (`20260611150000:26`), so snag demotion has never once fired. `siteHealth.ts:54` exact-cases `'Open'` twelve lines below its own comment that prod carries mixed casing (`:42-43`). Extract one exported vocabulary plus one SQL equivalent, case-fold at both boundaries, delete the copies. Same change closes F-25: `useSubsectionDetail.ts:133` selects `category_id`, `OverviewTab.tsx:69` filters `d.category`.

**Effort** M-L · **Risk** med — verdicts move visibly: demotion starts firing and COC-required subsections stop reporting zero documents · **Order** 4, after P-C05 so the app-vs-DB parity test over shared fixtures runs on every push. Without that test these four copies re-diverge and this proposal becomes copy five. · **Gate:** recompute, do not backfill — no DML that overwrites stored verdicts; `20260725100000_coc_register_truth.sql:86-101` sets `coc_status='Pending'` with no pre-image captured, and that is the precedent to avoid, not repeat. Re-tightening F-108's `coc_status` CHECK is non-additive against existing out-of-vocabulary rows and needs the reconciliation logged first.

---

### P-C07 — Determinism at the data boundaries: ordering keys, dates, pinned TZ

**Addresses:** F-105, F-26, F-27

**What changes and why.** Two symptoms, one cause: selection with no total order, dates with no canonical serialiser. (a) `api/snapshots/capture/route.ts:16` pages with `.range()` and no `.order()`, and `supabase/config.toml` sets no `max_rows` — add `.order('id')`; this also closes F-23's pagination leg, which is claimed once, under P-C06. (b) `BulkInspectionReportGenerator.tsx:87-102` never selects `created_at`, so the "latest inspection" sort at `:127` compares `new Date(0)` on every row; add the column. Its Stop button reads `shouldStop` from a stale closure (`:407`; `handleStop:449` only setStates) — move to a ref. (c) `normalize.ts:26` calls `toISOString().slice(0,10)` on the `cellDates` Dates fed by `useSiteCocImport.ts:14`; use a local-date formatter.

**Effort** S · **Risk** low · **Order** 4, parallel with P-C06; the `TZ` pin ships with P-C05 so the existing UTC-midnight test can finally see the shift · **Gate:** already-imported `issued_date` values stay a day early in prod. Correcting them is a data rewrite that must capture the pre-image — a separate reviewed migration, explicitly not part of this change.

---

### P-C08 — One implementation per concern

**Addresses:** F-35, F-66

**What changes and why.** `pdfMakeUtils.ts` and `pdfTemplates.ts` both export `createCoverPage`/`createSectionHeader`/`createPageFooter`/`createStatusBadge` (`:96,:379,:452,:594` vs `:48,:337,:239,:466`), and `pdfTemplates.ts:268` calls `formatPdfDate()` with no argument, so `complianceReportGenerator.ts:321` ships an em-dash where the date belongs. Two IndexedDB managers hardcode `DB_VERSION 5` with "MUST match" comments recording a prior production `VersionError` (`offlineDB.ts:7`, `offlineInspectionDB.ts:7`). `src/lib/data` holds four code files with zero importers outside itself, while the `.createSignedUrl` N+1 it was written to replace is copy-pasted across the nine tracked modules F-35 lists. Keep exactly one of each; for the data layer, adopt it at those call sites or delete it — shipping both is the defect.

**Effort** M · **Risk** med · **Order** 5, last: deletion is only safe once P-C05 proves what still runs · **Gate:** escalation-list item "removing code that looks dead but might be called by a scheduled job or webhook" — unwired in this repo is not uncalled in prod; check against the seven `*.PULLED-FROM-PROD.ts` functions and the cron caller of `api/snapshots/capture`. Consolidating the two IndexedDB managers forces a `DB_VERSION` bump, which is a client-side data re-sync for anyone holding queued offline work — also an escalation-gate item, and it must ship behind a drain-then-migrate step, not a bare version increment.

---

## CHANGE LOG

**Added — P-C01 (F-02).** Round 1 addressed no proposal to F-02, a blocker, while arguing that tracked history is what a redeploy restores. That was the gap my own thesis most obviously covered: both functions are still registered in `config.toml:36,49` and have zero callers in `src/`. Handled as deletion plus an explicit `supabase functions delete`, because deleting the directory does not undeploy the URL.

**Modified — P-C02 (was P-C01).** The deliverable "every object that exists only in prod" was unbounded and I conceded the discovery method was grep. Replaced with a terminating procedure and a machine criterion (`db reset` exits 0), with F-31's six objects demoted to a seed list. Corrected the failure anchor from `:52` (function body, which does not resolve column names at `CREATE`) to the executed `DO` block at `:62-69`, specifically `:65`. F-109 now declared partial; F-124 dropped from Addresses and stated as a known replay constraint instead of an implied fix.

**Modified — P-C03 (was P-C02).** F-01 was claimed whole but only the policy leg was described. Now names three legs explicitly — the anon `storage.objects` SELECT (`20251120083932:18-20`), the recreated blanket `TO authenticated` writes (`20260611110000:26-31`) and the unvalidated pool upload (`poolUpload.ts:22` vs the existing `validate()` at `uploadCocFiles.ts:8-11`) — and declares the fourth, the `public = true` bucket flag, out of scope with a counted reason (49 tracked `getPublicUrl` sites in 34 files). Also corrected the round-1 claim that both PENDING scripts need moving: one of them says its canonical SQL is already tracked, which is drift in the opposite direction and is now flagged as unprovable by any reset gate.

**Modified — P-C04 (was P-C07, order 7 → 3).** Round 1 parked an authorization write with a described self-lockout path behind a harness it also had to build. The pgTAP file is now written and run locally with the fix; P-C05 later runs the same file. The only remaining dependency is P-C02.

**Merged — P-C05 (was P-C03 + P-C04).** Two proposals produced one thing: a gate that fails. Merging removes one infrastructure position from the sequence and makes the artefact count explicit — one workflow file, one error-count file, and jobs invoking commands that already exist. Dropped from round 1: the deno scaffold framing, the guard-test authorship and the 16 mutation-type seeds, now declared as the part of F-34 this does *not* cover. Added: the tracked fix for F-134 — `.gitignore` and `tsconfig.json:28` entries — replacing round 1's "delete the 33 untracked files", which was drive-by work on files that are not part of the tracked codebase.

**Modified — P-C06 (was P-C05).** Unchanged in substance. F-23 is now claimed here once only; its ordering leg is cross-referenced from P-C07 without being re-claimed. Same treatment removes the round-1 ambiguity where accepting one proposal and rejecting another left F-134 and F-33 unowned.

**Modified — P-C07 (was P-C06).** F-23 removed from Addresses (single-claim rule); F-105 promoted to lead since it is the finding that names the defect.

**Modified — P-C08.** Scope cut from five findings to two. Dropped F-44 (whole unwired subsystems), F-130 (ui-kit cluster) and F-134 — the first two were a deletion sweep dressed as consolidation, the third belongs to the gate. Added the `DB_VERSION` bump as an escalation-gate item: consolidating the IndexedDB managers forces an offline data re-sync.

**Unchanged.** The ordering thesis, and the refusal to trade provability for speed. Every proposal still carries a specific gate rather than a boilerplate one.
