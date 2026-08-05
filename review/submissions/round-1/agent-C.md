# Agent C — Round 1 submission

## Strategy

This repo has two productions: the one that runs, and the one git can rebuild. `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4` says the blocker fix is "intentionally OUTSIDE supabase/migrations/"; `20260616100000_*.sql:3-12` records a trigger "created directly in prod (drift — never recorded in the repo)"; seven edge functions exist only as `*.PULLED-FROM-PROD.ts` under `docs/system-reference/_work/`; and a clean apply dies at `20260612120000_coc_compliance_gate.sql:52` on a column no migration creates (F-31). Nothing measures the gap: `ls .github` → no such directory, no typecheck script (`package.json:5-11`), `ignoreBuildErrors` on (`next.config.mjs:112`). I ran `tsc --noEmit` today: **171** errors against the recorded 109 baseline (`next.config.mjs:110`). Every other fix in this review is therefore unverifiable — you cannot prove a boundary closed on a database you cannot rebuild, or trust a build that cannot fail. Order: make tracked history the truth, make a machine check it, then collapse the duplicates that keep regenerating divergence.

---

### P-C01 — Make `supabase db reset` succeed from zero

**Addresses:** F-31, F-109, F-124

**What changes and why.** Add tracked, forward-only repair migrations for every object that exists only in prod: `subsections.deleted_at`, `snags.snag_type`, `snags/inspections.deleted_at`, `classify_field_status`, `get_compliance_setting_numeric/bool`. Grep over `supabase/migrations` returns the call sites (`20260615140000_inspection_status_existence_based.sql:20-23,43-45,73`) and zero `CREATE`s; `deleted_at` is only ever added to `building_assets`/`tenants` (`20260612210000:42-43`), so a clean apply dies in the executed DO block at `20260612120000:52`. No squash, no history rewrite. Acceptance test is `supabase db reset` exiting 0, wired in P-C04. Add `.down.sql` for the recent lockdowns — 2 of 183 tracked migrations have one. Without this, nothing else here is provable.

**Effort** M · **Risk** low (local-only until CI is green) · **Order** 1, blocks P-C02, P-C03, P-C04 · **Gate:** additive-only by construction; if the team prefers a squashed baseline instead, that is a history rewrite and needs a decision before code.

---

### P-C02 — Re-land every out-of-band prod fix as a migration, then assert the policy set

**Addresses:** F-01, F-03, F-04, F-05, F-111, F-112

**What changes and why.** Treat these as one defect: tracked history's last word is `USING (true)` and the correction lives outside it. Move `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` and both `PENDING-*.sql` files into `supabase/migrations` — they are already idempotent DO-blocks over `pg_policies` — and extend them to the cases the applied script structurally misses: it filters `schemaname='public'` (`:24`), so `storage.objects` (F-01) and role-unqualified `client_access_links` (F-04) survive. Add a policy assertion that fails when any anon/public `USING (true)` SELECT exists. I block all four blockers landing as SQL-editor paste: `PENDING-…:1-3` shows that workflow already stranded two fixes indefinitely.

**Effort** M · **Risk** med-high · **Order** 2, needs P-C01 to have a database to test against · **Gate:** non-additive (drops/replaces policies), touches access-control, and the script's own `PREREQUISITE` block (`:6-11`) warns live QR reads break unless the public RPCs are in place — staging apply plus a `.down.sql` before prod.

---

### P-C03 — Restore type truth and ratchet the build gate shut

**Addresses:** F-32, F-33, F-70, F-134

**What changes and why.** Add `typecheck: tsc --noEmit` (`package.json:5-11` has none). Regenerate `src/integrations/supabase/types.ts` against the P-C01 database: `site_health_snapshots` has 0 hits in types.ts yet three live consumers (`api/snapshots/capture/route.ts:93`, `useSiteScores.ts:26`, `ComplianceDashboard.tsx:110`), the last masked by `(supabase as any)` at `:109` while `useSiteScores.ts:26,33,52,63` are real TS2769/TS2339 errors. Then commit an error-count file and fail CI on any increase. Measured today: 171, not the 109 at `next.config.mjs:110`; 42 come from untracked `' 2'` duplicate files (33 in the working tree), so tracked code is 129. Delete those first. Flip `ignoreBuildErrors`/`ignoreDuringBuilds` off only at zero.

**Effort** M · **Risk** low · **Order** 3, after P-C01 (type regen needs a rebuildable DB); pairs with P-C04 · **Gate:** none — no runtime behaviour changes; the `as any` deletion may surface a genuine schema mismatch, which is the point.

---

### P-C04 — CI that executes the server, database and access-control paths

**Addresses:** F-34, F-33, F-112, F-133, F-80

**What changes and why.** Create `.github/workflows/` — the directory does not exist — running the four things nothing runs today: (1) `supabase db reset` plus P-C02's policy assertions over 183 migrations; (2) `deno test` over the 17 functions in `supabase/functions` (zero test files, no `deno.json`); (3) vitest with `supabase/**` added to `vitest.config.ts:22`'s `src/**`-only include, and `TZ` pinned; (4) guard tests for `ProtectedRoute`/`useUserRole` — grep across all 76 test files returns neither. Seed `useOfflineSync`'s other 16 mutation types; only `SYNC_INSPECTION` is drained today. This is the machine that catches regressions in every other proposal; without it, each fix decays back.

**Effort** L · **Risk** low · **Order** 4, after P-C01 and P-C03 · **Gate:** CI must run against a throwaway local Supabase and never prod credentials or the service-role key; `supabase/seeds/fortress_abaqulusi_seed.sql` carries real named individuals (F-113), so it must not be auto-seeded.

---

### P-C05 — One compliance vocabulary, one verdict engine

**Addresses:** F-24, F-25, F-23, F-46, F-108, F-57, F-79, F-63

**What changes and why.** Four modules declare their own COC pass/fail sets — `cocCompliance.ts:6-7`, `complianceCalculations.ts:33,38`, `cocHierarchy.ts:39`, `siteCoc/statusDisplay.ts` — and the DB recompute matches `status in ('open','in_progress')` (`20260615140000:44`) against `CHECK (status IN ('Open','Rectified','Closed'))` (`20260611150000:25`), so snag demotion has never once fired. `siteHealth.ts:53` exact-cases `'Open'` twelve lines below a comment stating prod carries mixed casing (`:41-43`). Extract one exported vocabulary plus one SQL equivalent, case-fold at both boundaries, delete the copies. Same change fixes F-25: `useSubsectionDetail.ts:133` selects `category_id`, `OverviewTab.tsx:69` filters `d.category`. Add an app-vs-DB parity test over shared fixtures.

**Effort** M-L · **Risk** med — verdicts will visibly move: demotion starts firing and COC-required subsections stop reporting zero documents · **Order** 5, after P-C04 so the parity test has a harness · **Gate:** recompute, do not backfill; no DML that overwrites stored verdicts (F-109's `coc_status='Pending'` overwrite is the precedent to avoid).

---

### P-C06 — Determinism at the data boundaries: ordering keys, dates, pinned TZ

**Addresses:** F-26, F-27, F-23, F-105

**What changes and why.** Three findings, one cause: selection with no total order, dates with no canonical serialiser. (a) `api/snapshots/capture/route.ts:16` pages with `.range()` and no `.order()`, and `supabase/config.toml` sets no `max_rows` — add `.order('id')`. (b) `BulkInspectionReportGenerator.tsx:89-102` never selects `created_at`, so the "latest inspection" sort at `:125-127` compares `new Date(0)` for every row; add the column. Its Stop button reads `shouldStop` from a stale closure (`:407`; `handleStop:449` only setStates) — move to a ref. (c) `normalize.ts:26` calls `toISOString().slice(0,10)` on `cellDates` Dates; use a local-date formatter and pin `TZ` in vitest so the existing UTC-midnight test can finally see the shift.

**Effort** S · **Risk** low · **Order** 6, parallel with P-C05; the TZ pin lands with P-C04 · **Gate:** already-imported `issued_date` values remain a day early in prod. Correcting them is a data rewrite — separate reviewed migration capturing the pre-image, explicitly not part of this change.

---

### P-C07 — Atomic role change, and make "one role row" true rather than assumed

**Addresses:** F-28, F-36

**What changes and why.** `UserRLSPolicies.tsx:112-123` deletes every `user_roles` row for a user then inserts, as two unwrapped requests; `onError` is a toast (`:131-134`). A failure between them leaves zero roles, and an admin editing their own role fails the Admin-gated insert deterministically — self-lockout with no recovery path in the UI. Replace with a single `SECURITY DEFINER` RPC performing both statements in one transaction behind an explicit caller check, and add `UNIQUE(user_id)` so the "exactly one row" that every reader assumes is enforced. Ship with a pgTAP test asserting the rollback case, because a fix to an authorization write that no machine re-checks is not a fix.

**Effort** S-M · **Risk** med · **Order** 7, needs P-C04's pgTAP harness · **Gate:** authorization flow; `UNIQUE(user_id)` is non-additive against existing duplicate rows — the migration must reconcile and log discarded rows first, and ships with a down file.

---

### P-C08 — One implementation per concern; delete what nothing calls

**Addresses:** F-35, F-66, F-44, F-130, F-134

**What changes and why.** `pdfMakeUtils.ts` and `pdfTemplates.ts` both export `createCoverPage`/`createSectionHeader`/`createPageFooter`/`createStatusBadge` (`:96,:379,:452,:594` vs `:48,:337,:239,:466`), and `pdfTemplates.ts:268` calls `formatPdfDate()` with no argument, so `complianceReportGenerator.ts:321` ships an em-dash where the date belongs. Two IndexedDB managers hardcode `DB_VERSION 5` with "MUST match" comments recording a prior production `VersionError` (`offlineDB.ts:7`, `offlineInspectionDB.ts:7`). `src/lib/data` has four files and zero code importers — the only external hits are untracked `src/graphify-out/cache/*.json`. Keep one of each, delete the rest plus the 33 untracked `' 2'` files.

**Effort** L · **Risk** med · **Order** 8, last — deletion is only safe once CI proves what still runs · **Gate:** before removing anything that merely looks dead, check it against the seven `*.PULLED-FROM-PROD.ts` functions and the cron caller of `api/snapshots/capture`; unwired in this repo is not the same as uncalled in prod.
