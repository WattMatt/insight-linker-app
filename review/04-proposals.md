# 04 — Proposals (Gate 3 — LOCKED SLATE)

- Date: 2026-07-30 · App: wm-compliance-inspector
- **STATUS: LOCKED 2026-07-30.** Items R-01…R-20 below are the accepted plan of record. Locking is a planning decision: it authorises no code change. Every item still executes as its own session, and the escalation gates in §6 require sign-off **at execution time**.
- Reversals get a superseding dated entry appended to §8, never an edit to a locked item.
- Sources: `./review/submissions/round-2/agent-{A,B,C}.md`; scores in `./review/scores/`. Competition result: **agent-C 8.7 · agent-A 8.6 · agent-B 8.1** (round 1: A 8.1 · B 7.9 · C 7.8 — inverted). Judge's convergence check: slates **diverged**, so the gap-only feedback rule held.
- This slate is a cherry-picked merge across all three submissions, as the protocol expects. It was audited for lock-readiness before locking; **both auditors returned "not safe to lock as written"**, and §7 records the nine defects they found and how each was fixed. The version they rejected is superseded by this one.

---

## 1. Evidence corrections (these change urgency — verified, not assumed)

The competition re-verified Phase 3's conclusions; a pre-lock adversarial pass then re-verified the competition's. Net position:

1. **F-01 and F-03 are live in production, not migration-history residue — CONFIRMED.** The out-of-band fix `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` selects on `schemaname='public' AND cmd='SELECT' AND qual='true'` (L23-26). `storage.objects` is in schema `storage`, so it was never in scope; the blanket `FOR ALL` policies at `20251120080517:206,213` are `cmd='ALL'` with qual `auth.uid() IS NOT NULL`, excluded twice over. No later migration drops either. Phase 3's downgrade of F-05 rested on this script doing more than it does.
2. **The `client_access_links` claim in the pre-lock draft was wrong — REFUTED.** That policy (`20260123052614:9-12`) matches all five of the script's predicates, so tier-2 *did* drop and demote it. The residual exposure is authenticated-wide token read, which is what **F-04** already says. F-04 stands on its own evidence; it does not need F-01's.
3. **F-02's "already 404 in prod" downgrade is STRUCK.** `docs/system-reference/GAPS.md:36` is a single self-report written by the agent that did the work (`git log -S` → sole origin commit `3ab8498`, 2026-06-11), carrying no probe output and no functions-list snapshot — unlike GAPS.md:106 and :115, which do cite the command and the `HTTP 404 NOT_FOUND` result. Phase 3's own verifier called it "unverifiable from repo" (`03-findings.md:84`), `APPLICATION_SPEC.md:1460-61` still lists both functions as live, and both agent-A and agent-B cite this same line, so it is one unwitnessed claim, not corroboration. **F-02 remains a blocker pending a live probe.**
4. **The type-error baseline is worse and differently shaped than recorded — CONFIRMED and extended.** `tsc --noEmit` yields **171** errors against the 109 at `next.config.mjs:110`. Of those, **42** come from untracked `" 2"` duplicates and **49** from tracked `docs/system-reference/_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts` Deno files, both swept in by `tsconfig.json:27`. **Real `src/` errors: 80.** A ratchet that does not exclude both sets would "fix" 91 errors by deleting scratch files.

## 2. Where three isolated, opposed lenses agreed

- Delete the two one-off repair functions rather than harden them (all three; all three independently verified zero callers).
- The blanket permissive policies go in one tracked migration with a paired down file and a staging apply.
- Call the existing `validate()` from `poolUpload.ts:22` — the validator is already in the same module, simply not invoked on the pool path.
- Rebuildability precedes verification (C from the start; A adopted it in round 2).

## 3. Locked items

Ordering is binding: an item may not ship before an item above it that §5 names as its precondition. Every finding has exactly one owner — the double-claims the audit found are resolved.

### Tier 0 — immediate

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-01** | **Delete `fix-inspection-photos` and `fix-tenant-images`** — directories, `config.toml` blocks, and the four phantom registry entries whose directories do not exist. Also reject unset `CRON_SECRET` at `route.ts:37` (today it compares against the literal `"Bearer undefined"` while gating a service-role RLS-bypassing upsert) | F-02, F-43 | C P-C01 + A P-A01 | S / low |
| **R-02** | **Never clear caches while unsynced work is pending** — `SessionWatcher.tsx:54` calls `clearAllCaches()` before `signOut`; `cacheUtils.ts:41-44` deletes the offline DB and strips `offline_mutation_queue` (its preserve list names a supabase-js **v1** token key while the app pins v2). Drain, count, block behind a prompt if anything is unsynced. Correct the DB list (drop phantom `wm_floor_plan_offline`, add `wm-download-handoff`) | F-07 | **B P-B01 only** | S / low |

**R-01 preconditions** (recovered from C P-C01; the pre-lock draft dropped them): (a) provision `CRON_SECRET` in Vercel **before** the reject-unset change ships, or the 02:00 cron at `vercel.json:7` starts 401ing; (b) deleting the directory does **not** undeploy — `supabase functions delete` against prod is a separate named step; (c) probe both function URLs live first. Do not rely on GAPS.md:36 (§1.3).

### Tier 1 — substrate

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-03** | **Make `supabase db reset` succeed from zero.** A machine criterion, not an enumeration: run reset, add one forward-only repair migration for the object it names, repeat; it terminates because each failure names one object. Today it dies at `20260612120000_coc_compliance_gate.sql:65` on `subsections.deleted_at`, a column no migration creates. **Adopt the `.down.sql` convention immediately for every security migration that follows** — do not defer the rule to R-18 | F-31, F-109 (partial) | C P-C02 | M / low |
| **R-04** | **Purge and rotate committed credentials and PII** — `DROP temp_import`; delete `supabase/seeds/fortress_abaqulusi_seed.sql` (real named individuals) and `sql-import-scripts.md:8-15` (eight named staff addresses); **rotate** the credential at `20260212144831:12,19`. Deletion is not the control — git history retains both — rotation is | F-10, F-113, F-114 | A P-A02 (split out) | S–M / med |

### Tier 2 — durability before the boundary moves

Moved ahead of the policy drops. This is the audit's most important structural correction: see §7.2.

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-05** | **One durable offline queue** — dead-letter store replacing discard-after-3-retries (which today deletes the photo blob with the mutation), idempotent drains via client-minted uuids, server-id reconciliation for `offline_pin_*`, checked `DELETE_FLOOR_PLAN_PIN` result, pin-move's missing offline branch. **Owns the single coordinated `DB_VERSION` bump across both IndexedDB managers** (`offlineDB.ts:7`, `offlineInspectionDB.ts:7`, both pinned to 5 with "MUST match" comments recording a prior production `VersionError`) | F-18, F-19, F-20, F-21 (pin-move leg), F-81, F-83, F-84, F-85 | B P-B05 | L / med |
| **R-06** | **No success toast without a checked result** — supabase-js resolves rather than throws, so `{ data }`-only destructuring turns a failed write into a success toast. Closed list of seven files, six named exclusions, one file per commit so each surfaced failure is attributable | F-17, F-22, F-76 | B P-B04 | M / med |

### Tier 3 — the boundary

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-07** | **One tracked migration dropping the 36 enumerated permissive policies** (public schema), with a mirrored `.down.sql` re-creating all 36 verbatim; applied clean DB → branch DB → prod. Enumerated by grep with per-source counts, not gestured at | F-03, F-04, F-05, F-39, F-42, F-106 | A P-A03 + C P-C03's executable VERIFY assertions + B P-B02's preconditions | L / **high** |
| **R-08** | **Storage lockdown** *(new item — F-01's owner)* — drop `"Anyone can view all storage"` (`20251120083932:18-20`, never dropped, out of tier-2's reach); re-scope the recreated `TO authenticated WITH CHECK (true)` writes (`20260611110000:25-30`); call the existing 50MB/extension `validate()` (`uploadCocFiles.ts:5-10`) from `poolUpload.ts:22`; drop `'svg'` from `uploadConstraints.ts:5` | **F-01** (three non-bucket legs), F-50 | A P-A05, minus the bucket flag | M / high |
| **R-09** | **Authorization preamble in the first ten lines of every edge handler** — one shared `requireRole`, uniform 401/403. Includes `send-email`, which gates only on `getUser` then forwards `to/cc/bcc` verbatim as `GMAIL_USER`: **any Contractor or Client is an authenticated open relay on the company Gmail**. `save-template`/`template-sync` fail closed | F-08, F-11, F-14, F-96, F-98 | A P-A04 | M / med |
| **R-10** | **De-oracle `qr-redirect`** — delete the `.ilike` name-matching fallback that makes it an anonymous name-to-UUID oracle; resolve by exact UUID only; constant 404 body; generic error text; column whitelist on the anon RPC payload | F-12, F-107 | A P-A07 | S / med |
| **R-11** | **Tenant-bind, hash and throttle the API credential surface** — `api_clients` has no tenant column, so one token reads every tenant. Phased: hash columns and `scoped_client_id` land additively, clients re-provision in one window, a second migration drops plaintext | F-15, F-09, F-65, F-89, F-110 | A P-A08 | M / med |

**R-08 constraint (audit-derived, binding):** the re-scoping predicate must **not** be a site-id path prefix. The offline drain uploads to `floor-plan-pins/${floor_plan_id}/…` (`useOfflineSync.ts:226,268`) and `${inspectionId}/${sectionKey}/…` (`:372`), neither of which carries a site-id segment — a site-id prefix policy would reject every offline photo on drain. Derive the predicate from the actual upload paths in `useOfflineSync.ts` and `poolUpload.ts:21` together.

### Tier 4 — identity and UI truth (order fixed per D4)

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-12** | **Atomic role change** — one `SECURITY DEFINER` RPC in a single transaction plus `UNIQUE(user_id)`, replacing the unwrapped delete-then-insert that can leave a user with zero roles and self-lock an admin with no UI recovery. Ships with the pgTAP file R-18 later runs unchanged | F-28, F-36 | C P-C04 | S–M / med |
| **R-13** | **Controls that enforce nothing and links that resolve to nothing.** **The F-30 leg (make `/profile` reachable for Client and Contractor) ships first within this item.** Then: Edit Site writes four columns absent from the schema so it always fails; hardcoded "Completed" badge; hardcoded compliance flags at `pdfEngine.ts:793-796`; URLs that 404 | F-29 (6 of 9 legs), F-30, F-100, F-101 | B P-B08 | M / med |
| **R-14** | **Fail-closed, positive-allow authorization** — one `public.is_staff()` replacing three incompatible definitions; invert `ProtectedRoute.tsx:19-26` from exclusion to an allowlist; add the absent `src/middleware.ts`; enforce `requires_password_change` in SQL. **Delete only the `user_policy_overrides` sub-panel (`UserRLSPolicies.tsx:137-170`) — preserve the role-change UI in the same component** | F-06, F-13, F-16, F-99, F-111 | A P-A06 + B P-B08's dependency rule | M / med |

**R-12 → R-13 → R-14 order is binding.** R-14 enforces `requires_password_change` server-side; until R-13's F-30 leg lands, `/profile` is admin-only (`ProtectedRoute.tsx:19-20`) and is the only password-change UI, linked from both portals — enforcing first traps every Client and Contractor. R-12 precedes both because R-13/R-14 delete inside `UserRLSPolicies.tsx`, the same 586-line component that hosts the role Select (`:285-296`) and Apply button (`:301-306`) R-12 repairs.

### Tier 5 — verdict correctness (D3 resolved: no shared objects)

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-15** | **Client-side verdict-input fixes — no migration, no DML, no vocabulary change.** `useSubsectionDetail.ts:133` selects `category_id` while `OverviewTab.tsx:68-70` filters `d.category`, so `cocDocs` is always `[]`; `publicVerdict.ts:34` tests `days < 30`, true for negatives, so **an expired certificate prints "Compliant" on the QR card a client scans**; `cocReportModel.ts:111` counts pending as clear; `complianceCalculations.ts:91-101` can exceed 100%; `InspectionDetail.tsx:2218` passes the site name as `clientName` | F-25, F-58, F-48, F-67 | B P-B06 (DB legs removed) | S–M / low |
| **R-16** | **One compliance vocabulary, one verdict engine — owns every vocabulary and DB-write leg.** One exported vocabulary plus one SQL equivalent, case-folded at both boundaries, with an app-vs-DB parity test over shared fixtures on every push. Includes the snag-demotion recompute (`20260615140000:44` matching lowercase against a title-case CHECK, so demotion has never once fired). **Recompute, do not backfill** — no DML overwriting stored verdicts | F-24, F-23 (casing leg), F-46, F-49, F-63, F-108, F-57, F-79 | C P-C06 + B P-B07's call sites | M–L / med |
| **R-17** | **Determinism at data boundaries** — `.order('id')` on the snapshot cron's `.range()` paging; `created_at` actually selected before sorting by it; `shouldStop` read from a ref not a stale closure; local-date formatter at `normalize.ts:26` for imported issue dates | F-105, F-26, F-27 | C P-C07 | S / low |

### Tier 6 — make it stay fixed

| # | Item | Owns | Source | E/R |
| --- | --- | --- | --- | --- |
| **R-18** | **One gate and a machine that runs it** — add the absent `typecheck` script and `.github/workflows/`; jobs for `db reset` + R-07/R-08 policy assertions + R-12's pgTAP, `deno test` over `supabase/functions`, vitest with `supabase/**` added to its `src/**`-only include, **TZ pinned here and nowhere else**; regenerate `types.ts`. **Exclude both the `" 2"` files and `*.PULLED-FROM-PROD.ts` from `tsconfig.json`, then ratchet from the real figure of 80 `src/` errors** (§1.4); flip `ignoreBuildErrors` off at zero. CI never auto-seeds the PII seed file | F-33, F-32, F-70, F-80, F-133, F-134 | C P-C05 | L / low |
| **R-19** | **Author the missing tests** — the 16 uncovered offline-mutation executor cases and the `ProtectedRoute`/`useUserRole` guard tests. Separated because R-18's source explicitly declares this out of its scope, and without it F-34's substance has no owner (§7.3) | F-34 | new (audit-derived) | M / low |
| **R-20** | **One implementation per concern** — the duplicate pdfmake builder families, and `src/lib/data` (adopt it at the nine copy-pasted call sites or delete it; shipping both is the defect). **Excludes `src/lib/data/signedUrls.ts`, which the deferred bucket-privatisation track needs.** The IndexedDB consolidation is R-05's, not this item's. Last: deletion is only safe once R-18 and R-19 prove what still runs | F-35, F-66 | C P-C08, scoped down | M / med |

## 4. Declared partial coverage — residual legs no locked item owns

Recorded honestly rather than implied as covered. Each is a leg of a finding whose other legs are owned above.

- **F-21** — the undo-timer collision (`InteractiveFloorPlan.tsx:327-329`, `:113-118`) and the orphan untitled pin (`:253,262-263` → footer-less `FloorPlanPinModal.tsx:513`). R-05 takes only the pin-move offline branch.
- **F-23** — `Dashboard.tsx:174-182` re-runs the snapshot cron's scan in-browser as eight unfiltered, un-ranged selects including `inspections.json_data`, with no `max_rows` configured. In no competitor's text.
- **F-29** — the `/contractor/sites` breadcrumb to a nonexistent route (`InspectionDetail.tsx:2173`), the double `?preview=` in `SiteOverviewCard.tsx:35`, and the 404 CDN `workerSrc` at `pdfTemplateExtractor.ts:10`.
- **F-109** — the 14 historic `CASCADE` drops remain irreversible; R-03 covers new migrations only.
- **The 100 medium and low findings** are not individually owned. Many ride along inside locked items; the rest remain in `03-findings.md` as the backlog.

## 5. Decisions — resolved as binding rules

The pre-lock draft carried these as recommendations; the audit showed a recommendation is not a mechanism. They are now rules.

- **D1 — F-07 (A vs B).** R-02 ships in Tier 0 and **R-14 may not ship before R-05**. A guard on `SessionWatcher.performLogout` cannot stop a server-side session invalidation, so the dead-letter store must exist before forced re-login lands, or a device holding unsynced work can neither authenticate to drain nor safely log out.
- **D2 — Bucket privatisation: DEFERRED to its own track.** F-01's other three legs are R-08 and ship now. Consequence recorded: **R-20 must not delete `src/lib/data/signedUrls.ts`**, which that track needs.
- **D3 — Verdict fixes.** R-15 takes only client-side display fixes requiring no migration and no vocabulary change; R-16 owns every vocabulary leg and every DB write, and its "recompute, do not backfill" gate governs both. No object is touched by both.
- **D4 — R-12 → R-13 → R-14**, binding, for the reasons under Tier 4.
- **D5 — A production policy probe is authorised and required before R-07 and R-08 are written.** A read-only `pg_policies` dump. The repo cannot settle this: one PENDING script states its canonical SQL is already tracked, so prod may be missing a *tracked* fix, and migration history is known to diverge from prod.
- **D6 — Escalation gates: see §6**, now complete at 14 rather than the 8 the draft listed.

## 6. Escalation gates — sign-off required at execution time, per item

Locking the plan does not clear these. Each must be approved before that item's session runs.

| Item | Gate |
| --- | --- |
| R-01 | Removing code a scheduled job may call; `CRON_SECRET` must be provisioned first or the nightly cron 401s; prod undeploy is a separate step |
| R-02 | Modifies the logout flow — a device that cannot sync stays signed in past the configured timeout |
| R-03 | Forward-only, no squash; a squashed baseline is a history rewrite |
| R-04 | Non-additive (`DROP temp_import`) and a credential rotation |
| R-05 | Client-minted ids change the insert contract; queues already on field devices need a one-time upgrade path; `DB_VERSION` bump forces an offline re-sync |
| R-06 | Touches the logout path — must report the error and still navigate, never strand a user signed in |
| R-07 | Non-additive; anon PostgREST reads die |
| R-08 | Non-additive; storage read paths change |
| R-09 | Removes an auth flow; DocBuilder breaks if `DOCBUILDER_*` is unset — establish that state first |
| R-10 | Legacy name-based QR labels stop resolving — count them from `qr_codes.qr_code_url` first |
| R-11 | Public API contract change; live tokens reissued |
| R-12 | Auth flow; `UNIQUE(user_id)` is non-additive against existing duplicate rows and the reconciliation is a data change on live role assignments |
| R-13 | Deleting a visible admin feature; the `Clear All` predicate change alters a data-deletion flow |
| R-14 | Auth flow; forces re-login; staff with no explicit role lose access until promoted — ship the backfill in the same migration |
| R-16 | Non-additive CHECK re-tightening; will reject legacy rows — counted audit and backfill in the same file |
| R-20 | Removing code that looks dead but may be called by a scheduled job or webhook — check against the seven `*.PULLED-FROM-PROD.ts` functions and the cron caller |

## 7. What the lock-readiness audit found, and how it was fixed

Two independent auditors both returned "not safe to lock as written." Recorded because the fixes are the difference between this slate and the one it supersedes.

1. **Blocker F-01 had no owner.** My own D2 decision deferred bucket privatisation and folded the remaining legs into R-05-as-drafted — but that item's source (A P-A03) covers public-schema policies only, so the anon `storage.objects` SELECT drop, the `WITH CHECK (true)` re-scope and the `poolUpload` validate() call existed only as prose in a decision note. **Fixed:** they are now **R-08**, a numbered item.
2. **The policy drops preceded the offline durability work.** R-07 drops blanket `FOR ALL` policies on `sites`, `subsections`, `inspections`, `floor_plan_pins` and `subsection_floor_plans` — the exact tables the offline drain writes (`useOfflineSync.ts:102,149,234,275`) — while discard-after-3-retries still deletes payload *and* photo blob. That sequence turns a security fix into the data loss R-02 exists to prevent. **Fixed:** the durable queue moved to Tier 2, ahead of the boundary work.
3. **F-34's substance was owned by nobody.** R-18's source declares the test authorship out of its own scope. **Fixed:** new **R-19**.
4. **The tier order inverted my own D4.** Enforcement (R-14) sat above the fix that makes the password screen reachable (R-13). **Fixed:** Tier 4 reordered and the dependency made binding.
5. **A site-id storage prefix would have rejected every offline photo upload** — the drain's paths carry no site-id segment. **Fixed:** binding constraint under R-08.
6. **Five findings were claimed by two items each** (F-13, F-16, F-24, F-25, F-26) and the TZ pin by two. Two implementation sessions would have collided. **Fixed:** single ownership throughout; D3 rewritten as a clean split.
7. **R-13/R-14 would have deleted the component R-12 repairs** — `Users.tsx:1114` is the sole mount of the 586-line `UserRLSPolicies.tsx`, which hosts both the override panel and the role-change UI. **Fixed:** R-14 deletes only the sub-panel at `:137-170`; R-12 ships first.
8. **R-01 lost its preconditions** in the merge, including that deleting a directory does not undeploy and that an unprovisioned `CRON_SECRET` would 401 the nightly cron. **Fixed:** restored under Tier 0.
9. **The error ratchet would have measured the wrong thing** — 49 further errors come from tracked `*.PULLED-FROM-PROD.ts` files, so the real `src/` figure is 80. **Fixed:** R-18 excludes both sets and ratchets from 80.

Two evidence corrections also landed: the `client_access_links` claim was refuted (§1.2) and F-02's exposure downgrade was struck (§1.3).

## 8. Execution status (2026-07-30)

Branch `review/ungated-fixes`, uncommitted. **Implemented: R-15, R-17, R-18, R-19** — the four items carrying no escalation gate. Verified centrally by the orchestrator, not taken on the implementers' word.

| Check | Baseline | After |
| --- | --- | --- |
| vitest | 76 files / 498 tests | **86 files / 578 tests, 0 failures** (+80 tests) |
| tsc `src/` errors | 80 (of 171 total) | **80** — no regression; 91 non-`src/` errors now excluded at source |
| eslint errors | 74 | **74** — the 3 introduced by new tests were fixed |
| Forbidden paths (`supabase/migrations`, `supabase/functions`, `config.toml`, `next.config.mjs`) | — | **0 touched** |

Two defects were found and fixed during central verification that the parallel implementers had each missed, because each verified against a tree that did not yet contain the others' work:

1. A new `ProtectedRoute` characterisation test waited a single tick after releasing its gate, but the guard needs two async hops (role query resolves → onboarding query fires → resolves). Rewritten to use `waitFor`, matching every other test in that file. The guard source was not touched.
2. **CI as first written would have been red on its first run** — `npm run lint` exits non-zero on 74 pre-existing errors, and a permanently-red gate is one everybody learns to ignore. Lint now follows the same advisory-then-ratchet pattern the type-check already used: `scripts/lint-ratchet.mjs` reusing `evaluateRatchet`, with `lint-baseline.json` at 74. Both ratchets were tested in both directions — exit 1 on a regression, exit 0 at baseline. The lint ratchet runs eslint under `--quiet` because a full JSON report of this tree is ~70 MB and overflows the child-process pipe (`ENOBUFS`); errors-only is ~340 KB.

**Not implemented — 16 items remain locked and unstarted**, each blocked on a gate in §6 or on information the repo cannot supply (D5's production policy probe; a live probe of the two repair-function URLs; `CRON_SECRET` provisioning before R-01). R-02 in particular is deliberately not implemented despite being S/low: it changes the logout flow so a device that cannot sync stays signed in past the configured timeout, which is a product trade-off, not a bug fix.

Nothing is committed. The change set is 13 modified files and 13 new ones.

## 9. Supersession log

- 2026-07-30 — Pre-lock draft of this file (18 items, D1–D6 as recommendations) **superseded** by this version (20 items, decisions as binding rules) following the lock-readiness audit recorded in §7. No item in the draft was ever locked.
