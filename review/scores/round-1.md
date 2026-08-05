# Round 1 — Judge Scorecard

- Date: 2026-07-30
- Authority: `./review/04-rubric.md` (LOCKED 2026-07-30) and nothing else.
- Inputs used: the rubric, `./review/03-findings.md`, `./review/manifest.md`, read access to `./review/specs/` and the repo, three anonymized submissions in shuffled order.
- Not read: `./review/04-personas.md`, competitor prompts, any prior scorecard. No authorship inference attempted.
- Format caps checked by script (preamble ≤150 words, ≤8 proposals, body ≤120 words). **All three submissions are within every cap.** No criterion-6 length penalty applied to anyone.

| submission | preamble words | proposals | longest body |
|---|---|---|---|
| Submission 1 | 128 | 8 | 105 |
| Submission 2 | 140 | 8 | 103 |
| Submission 3 | 127 | 8 | 97 |

Blocker/high coverage tallies (blockers F-01…F-04; highs F-05…F-35), derived from each submission's own `Addresses:` lines:

| submission | blockers | highs | total of 35 |
|---|---|---|---|
| Submission 1 | 3 of 4 (F-01 self-declared partial; **F-03 absent**) | 14 | ~17 |
| Submission 2 | 3 of 4 (F-01 partial, not declared; **F-02 absent**) | 12 | ~15 |
| Submission 3 | **4 of 4** | 9 | ~13 |

---

## Submission 1

### 1. Evidence & grounding — **8** (weight 25%)

Every proposal opens with an `Addresses:` line of F-## ids and the prose is anchored almost line-by-line; the eight anchors I opened were exact, including originals not lifted from the findings doc (`InspectionDetail.tsx:2218` is literally `clientName={siteData?.siteName}`; `OverviewTab.tsx:421-423` is literally the hardcoded `Completed` badge). It is the only submission that labels partial coverage honestly — "F-01 (partial)", "F-19 (fall-through half)", "F-23 (casing leg)" — which makes its claims checkable rather than merely broad. Held below 9 because two anchors are loose (`siteHealth.ts:41-42` points at the signature, the mixed-casing comment is at 42-43; `days < 30` is a paraphrase of `days < EXPIRY_HINT_DAYS` with the constant at `:22`) and because most anchors re-use the findings doc's own evidence set rather than adding independently derived verification.

### 2. Impact — **7.5** (weight 20%)

Broadest high coverage of the three (14 highs), and it owns the only `data-loss` finding in the corpus (F-07) plus the four false-verdict highs (F-24, F-25, F-26, F-58 cluster) that determine what a client actually reads off a QR card. Against that: **F-03 — a blocker, the blanket `FOR ALL` tenancy policies on `user_sites`/`user_clients` — is not addressed by any proposal**, and F-01 is explicitly reduced to one of its several legs (the `poolUpload` validation call), leaving the public buckets, the never-dropped anon `storage.objects` SELECT and the `WITH CHECK (true)` writes untouched. The whole F-08…F-16 endpoint-auth and credential block is unowned. Effective blocker coverage is roughly 2.2 of 4.

### 3. Feasibility & effort realism — **7.5** (weight 15%)

Effort labels are calibrated: P-B05 at S is genuinely a guard plus two list corrections; P-B03 at L is genuinely a new store, id minting and a device-upgrade path. Dependencies are stated and correct ("Order 5 — depends on P-B03's idempotency keys"; "Order 7 — after P-B06 so verdicts are correct before they are unified"), and shipping the cheapest data-loss prevention as Order 1 is sane. Two weaknesses: P-B08 carries eight findings across eight unrelated surfaces at a single "M", which is optimistic for that many distinct edits; and P-B02's scope is defined as ".throwOnError() … worst-first" with two worked examples, so the file count behind the M is not actually bounded.

### 4. Risk handling — **8** (weight 15%)

Six of eight proposals carry an explicit `ESCALATION GATE:` label and the categories hit are correct: dead-code-that-a-job-may-call and a non-additive policy drop (P-B01), an insert-contract change plus queues already resident on field devices needing a one-time upgrade (P-B03 — the re-sync gate, well spotted), the logout/auth flow (P-B05, with the residual risk named: a device that cannot sync stays signed in), a non-additive CHECK re-tightening (P-B07), and a deletion flow (P-B08's `Clear All`). Rollback thinking is present and concrete: "each of the five is independently revertable", per-file rollout, the cross-tab lease behind a flag. Two proposals carry no gate; P-B04 deletes the markup/measurement executor cases on a no-UI-caller argument without flagging that under the dead-code gate.

### 5. Scope discipline — **8.5** (weight 15%)

The strongest of the three, and it says so in the places where a competitor is most tempted to expand: P-B01 excludes bucket privatisation by name and states why ("it forces signed URLs across nine copy-pasted call sites (F-66) and is its own track"); P-B07 states "This deletes copies of an existing helper; it invents no abstraction"; P-B04 chooses to delete a false promise rather than build the backend behind it; P-B08 says unreachable routes "get a link or a delete, not a redirect". Docked because P-B08 is itself an eight-finding grab-bag across unrelated surfaces, and P-B03 introduces the most new machinery in the field (a dead-letter store, client-minted uuids, a cross-tab lease).

### 6. Clarity & decidability — **7.5** (weight 10%)

Within all caps and readable; each item names the file and the resulting behaviour. Decidability suffers in two places. P-B08 presents eight independent findings as one accept/reject — a reviewer who wants the `/profile` fix but not the `Clear All` predicate change has to ask, and "each item is a separate commit" mitigates delivery, not the decision. P-B02's "worst-first" leaves the reviewer unable to say what is in and out. The declared order also runs against the document order (P-B05 is Order 1 but printed fifth), which costs a re-read.

**Composite: 8(.25) + 7.5(.20) + 7.5(.15) + 8(.15) + 8.5(.15) + 7.5(.10) = 7.85 → 7.9**

### Gap feedback (Submission 1)

- A blocker is missing outright. F-03 appears in no `Addresses:` line. The submission's own framing — security work earns priority only where it corrupts or exposes the evidence record — is not applied to it, and the finding describes any signed-in Client or Contractor repointing their own tenancy mapping, which reaches the evidence record. The omission is unexplained rather than argued.
- F-01 is claimed at one-eighth strength. The declared exclusion covers the signed-URL cost of privatising the bucket but is silent on the never-dropped anon `storage.objects` SELECT and the `WITH CHECK (true)` authenticated writes, which are separate legs of the same finding and are not costed anywhere.
- The entire endpoint-auth and credential surface (F-08 through F-16) is absent with no stated rationale beyond the preamble's general ordering principle. F-16 in particular — a security control that reports success and enforces nothing — sits inside the submission's own "controls that do nothing" thesis (F-29, F-30, F-101) and is still not picked up.
- P-B02's scope is unbounded. "Apply `.throwOnError()` to mutations and to reads feeding a compliance artefact, worst-first" names two files out of a finding (F-17) whose evidence spans ten units; the effort label rests on a count the submission never gives.
- P-B08 mixes a deletion-flow predicate change, a routing bug, four dead controls and a phantom-column write under one decision and one risk rating of "low", while its own gate text concedes one item alters a deletion flow.
- Two proposals (P-B02, P-B04) carry no escalation-gate line at all, and P-B04 removes executor cases on a no-caller argument without testing that argument against anything outside `src/`.

### Citation-check log (Submission 1)

| # | claim (verbatim from submission) | what I found |
|---|---|---|
| 1 | "`SessionWatcher.tsx:54` calls `clearAllCaches()` unconditionally inside `performLogout`, before `signOut`" | CONFIRMED. Line 54 is `await clearAllCaches();`, preceded by `// Clear all caches first` at 53 and followed by the audit call then signOut. |
| 2 | "`cacheUtils.ts:41-44` deletes `wm_compliance_offline` … and `:6,71-78` removes every localStorage key except `supabase.auth.token`" | CONFIRMED. 41-44 is `const dbNames = [ 'wm_compliance_offline', 'wm_floor_plan_offline', ];`. Line 6 is `const PRESERVED_KEYS = ['supabase.auth.token'];`. 71-78 is the loop + `keysToRemove.forEach(key => localStorage.removeItem(key))`. |
| 3 | "`package.json:48` pins `^2.75.0`" (against the v1 key name) | CONFIRMED. Line 48 is `"@supabase/supabase-js": "^2.75.0",`. |
| 4 | "`useOfflineSync.ts:442-451` deletes a mutation *and its photo blob* after `MAX_RETRIES = 3` (`:17`)" | CONFIRMED. Line 17 is `const MAX_RETRIES = 3;`. 442-451 is the retry test, the `else` discard branch with `deleteQueuedBlob` at 447-448, and `toast.error` at 450. |
| 5 | "`useSubsectionDetail.ts:133` selects `category_id` while `OverviewTab.tsx:68-70` filters on `d.category`, so `cocDocs` is always `[]`" | CONFIRMED. 133 is the `.select('id, file_name, file_url, category_id, …')`. 68-70 is the `cocDocs` block whose filter is `isCocCertificateCategory(d.category \|\| '')`. |
| 6 | "`publicVerdict.ts:31-38` uses `days < 30`, true for negatives, printing 'Compliant' for an expired Pass" | CONFIRMED in substance, paraphrased in form. 31-38 is the PASS block; line 34 is `if (days < EXPIRY_HINT_DAYS)` and line 22 is `const EXPIRY_HINT_DAYS = 30;`. Both branches return headline `"Compliant"`. |
| 7 | "`/profile` sits only in `(admin)` (`profile/page.tsx:2-3`) whose guard bounces Contractor and Client (`ProtectedRoute.tsx:19-20`)" | CONFIRMED. `src/app/(admin)/profile/page.tsx` lines 2-3 import and mount `MyProfile`. ProtectedRoute 19-20 are the Contractor and Client `<Navigate>` returns. |
| 8 | "`pdfEngine.ts:793-796`'s all-true compliance flags"; "the missing `asset_category` predicate at `AssetVerification.tsx:273`" | CONFIRMED both. pdfEngine 793-796 are `standardMargins/typographyScale/brandColors/pageHeaders: true`. AssetVerification 273 is `.from("site_assets").delete().eq("site_id", siteId)` with no category predicate. |
| 9 | "the only app reader is `AccessLinkGenerator.tsx:101`" | CONFIRMED at file level. Line 101 is `.from("client_access_links")`; a repo grep over `src` returns four hits, all four inside that same file (101, 177, 219, 239). |

No fabricated or unsupported claim found. Evidence cap not triggered.

---

## Submission 2

### 1. Evidence & grounding — **9** (weight 25%)

The only submission whose central claims I could re-derive from scratch rather than merely confirm, and every derivation matched exactly: `tsc --noEmit` produced **171** errors as stated against the 109 recorded at `next.config.mjs:110`; **42** of those errors are in `' 2'`-suffixed files as stated; **33** such files are untracked in the working tree as stated; **183** tracked migrations of which exactly **2** carry a `.down.sql`; 7 `*.PULLED-FROM-PROD.ts`; 76 test files; 17 functions; `site_health_snapshots` has 0 occurrences in `types.ts`; `.github` does not exist. The duplicate-export list matched line-for-line including its deliberately non-monotonic ordering (`pdfMakeUtils` 96/379/452/594 vs `pdfTemplates` 48/337/239/466). Two small imprecisions keep it off 10: `src/lib/data` holds five files, not four; and the clean-apply failure is anchored at `:52`, which sits inside the `CREATE FUNCTION` body — the executing `DO` block is at 62-69 and its own `WHERE deleted_at IS NULL` at 65 would resolve first.

### 2. Impact — **6.5** (weight 20%)

P-C02 is genuinely high-leverage: it closes three blockers in one migration set and correctly identifies why the existing prod script misses two of them (`schemaname='public'` at `:24`). But **F-02 — a blocker, anonymous/any-JWT service-role functions that rewrite `inspections.json_data` and write even in dryRun — appears in no `Addresses:` line**, while P-C08 spends its budget on duplicate pdfmake helpers and untracked working-tree files and is explicitly sequenced last. F-01 is claimed in full but treated as a policy-assertion problem only; the `public = true` bucket flag, the `WITH CHECK (true)` writes and the unvalidated pool upload are not in the change description. Three of eight proposals (P-C01, P-C03, P-C04) are enabling infrastructure whose severity payoff is deferred, and the argument that nothing else is provable without them, while well made, does not itself close a hole.

### 3. Feasibility & effort realism — **7** (weight 15%)

Dependencies are the most carefully reasoned in the field and are correct ("needs P-C01 to have a database to test against"; "type regen needs a rebuildable DB"). Half-grades (M-L, S-M) show real calibration effort. The problems are delivery-shaped: the chain is strictly serial, so nothing user-visible lands until position 5, and P-C07 — a two-statement authorization defect with a self-lockout path — is deliberately parked at position 7 behind a pgTAP harness that position 4 has to build first. P-C01 at "M" is understated: it commits to repair migrations "for every object that exists only in prod" from a repo with no prod access, and the submission itself concedes the set is enumerated by grep over call sites.

### 4. Risk handling — **9** (weight 15%)

Strongest in the field. Every proposal carries a `Gate:` line and none is boilerplate. P-C02 cites the script's own `PREREQUISITE` block (`:6-11`) warning that live QR reads break, and asks for a staging apply plus a `.down.sql`. P-C04 notices that CI seeding would execute `supabase/seeds/fortress_abaqulusi_seed.sql`, which carries real named individuals (F-113), and rules it out — a risk no other submission sees. P-C05 says "recompute, do not backfill" and cites F-109's `coc_status='Pending'` overwrite as the precedent to avoid. P-C06 explicitly refuses the data correction: already-imported dates "remain a day early in prod … explicitly not part of this change". P-C07 flags `UNIQUE(user_id)` as non-additive against existing duplicates and ships a down file. P-C08 states the dead-code gate almost verbatim: "unwired in this repo is not the same as uncalled in prod". P-C03 correctly declares no gate. Rollback artefacts are treated as deliverables rather than afterthoughts.

### 5. Scope discipline — **6.5** (weight 15%)

Weakest of the three. P-C04 constructs four CI workflows, a `deno test` setup with no `deno.json` present, a pgTAP harness, guard tests and seeds for 16 mutation types — by a wide margin the largest greenfield build in the field, and infrastructure rather than a change to the code the findings indict. P-C08 bundles duplicate pdfmake exports, two IndexedDB managers, an unconsumed repository layer and "the 33 untracked `' 2'` files" — deleting untracked working-tree cruft is drive-by work, and it is already claimed under P-C03. Findings are double-claimed across proposals (F-134 in C03 and C08, F-33 in C03 and C04, F-112 in C02 and C04, F-23 in C05 and C06), which blurs where a change actually lives. P-C01's "No squash, no history rewrite" and P-C06's carve-out are the countervailing strengths.

### 6. Clarity & decidability — **8.5** (weight 10%)

The only submission that states machine-checkable acceptance criteria: "`supabase db reset` exiting 0", "commit an error-count file and fail CI on any increase", "Flip `ignoreBuildErrors`/`ignoreDuringBuilds` off only at zero", "a policy assertion that fails when any anon/public `USING (true)` SELECT exists". A reviewer can tell what "done" looks like without asking. Two decidability costs: the cross-proposal finding overlap means accepting P-C03 and rejecting P-C08 leaves F-134 in an ambiguous state; and P-C01's object list is open-ended by construction ("every object that exists only in prod", then six examples), so a reviewer approves a set whose boundary is unknown.

**Composite: 9(.25) + 6.5(.20) + 7(.15) + 9(.15) + 6.5(.15) + 8.5(.10) = 7.775 → 7.8**

### Gap feedback (Submission 2)

- A blocker is missing outright. F-02 appears in no `Addresses:` line. The submission's own thesis — that the repo and prod have diverged and the tracked tree is what a redeploy restores — bears directly on two functions that remain registered in `config.toml`, and the omission is neither argued nor acknowledged.
- F-01 is listed as fully addressed but the described change covers one leg. The `public = true` flag on all buckets, the recreated `TO authenticated WITH CHECK (true)` writes and the unvalidated pool upload are all inside that finding and none appears in the change text. Unlike Submission 1, the partiality is not declared.
- Three of eight proposals produce no change to indicted code. The enabling argument is stated once in the preamble and then assumed; there is no statement of what a reviewer forgoes by sequencing four positions of infrastructure ahead of the first correctness fix.
- P-C01's deliverable is unbounded. "Every object that exists only in prod" cannot be enumerated from a repo with no prod access; the submission concedes the discovery method is grep over call sites, which finds only objects the tracked code happens to reference.
- P-C07 is self-gated into position 7. An authorization write with a described self-lockout path and no UI recovery is held behind a test harness the submission itself has to build first; the cost of that ordering is not stated.
- P-C08 includes deletion of untracked working-tree files, which are not part of the tracked codebase under review, and re-claims F-134 already claimed in P-C03.
- The clean-apply failure anchor is imprecise: `:52` is in the function body, which does not resolve column names at `CREATE`; the `DO` block that forces resolution is at 62-69.

### Citation-check log (Submission 2)

| # | claim (verbatim from submission) | what I found |
|---|---|---|
| 1 | "I ran `tsc --noEmit` today: **171** errors against the recorded 109 baseline (`next.config.mjs:110`)" | CONFIRMED, reproduced. `npx tsc --noEmit` yields exactly 171 `error TS` lines. `next.config.mjs:110` is `// Audit baseline: 109 strict-mode type errors and an eslint config issue`. |
| 2 | "42 come from untracked `' 2'` duplicate files (33 in the working tree)" | CONFIRMED, reproduced. Exactly 42 of the 171 errors are in ` 2.ts`/` 2.tsx` files; `git status --untracked-files=all` lists exactly 33 untracked `' 2'`-suffixed files. |
| 3 | "no typecheck script (`package.json:5-11`), `ignoreBuildErrors` on (`next.config.mjs:112`)"; "`ls .github` → no such directory" | CONFIRMED. The `scripts` block spans 5-12 and contains dev/build/start/lint/test/test:watch only. Line 112 is `typescript: { ignoreBuildErrors: true },`. `ls .github` → "No such file or directory". |
| 4 | "a clean apply dies at `20260612120000_coc_compliance_gate.sql:52` on a column no migration creates" | PARTLY CONFIRMED. Line 52 is `and s.deleted_at is null`, inside the `CREATE OR REPLACE FUNCTION` body (10-59). The executing `DO $do$` block is 62-69 and its own line 65 reads `FROM public.subsections WHERE deleted_at IS NULL`. The failure is real and in this file; the anchor is one construct off. |
| 5 | "`.down.sql` for the recent lockdowns — 2 of 183 tracked migrations have one" | CONFIRMED exactly. `git ls-files supabase/migrations` returns 183 `.sql` files; exactly two end in `.down.sql` (`20260612210000_fortress_layer_hardening.down.sql`, `20260612220000_fortress_rls_scope.down.sql`). |
| 6 | "`site_health_snapshots` has 0 hits in types.ts yet three live consumers (`api/snapshots/capture/route.ts:93`, `useSiteScores.ts:26`, `ComplianceDashboard.tsx:110`), the last masked by `(supabase as any)` at `:109`" | CONFIRMED. grep count in `types.ts` = 0. route.ts:93 is `.from("site_health_snapshots")`. ComplianceDashboard.tsx:109 is `const { data: snaps } = await (supabase as any)` and 110 is `.from("site_health_snapshots")`. |
| 7 | "`api/snapshots/capture/route.ts:16` pages with `.range()` and no `.order()`" | CONFIRMED. Line 16 is `const { data, error } = await supabase.from(table).select(columns).range(from, from + size - 1);` — no `.order()` in `fetchAll`. |
| 8 | "`pdfMakeUtils.ts` and `pdfTemplates.ts` both export `createCoverPage`/`createSectionHeader`/`createPageFooter`/`createStatusBadge` (`:96,:379,:452,:594` vs `:48,:337,:239,:466`)"; "`pdfTemplates.ts:268` calls `formatPdfDate()` with no argument" | CONFIRMED exactly, including the non-monotonic ordering of the second list. `pdfTemplates.ts:268` is `text: formatPdfDate(),`. |
| 9 | "`UserRLSPolicies.tsx:112-123` deletes every `user_roles` row for a user then inserts, as two unwrapped requests; `onError` is a toast (`:131-134`)" | CONFIRMED. 112-123 is the delete/throw then insert/throw pair with no transaction. 131-134 is `onError: (error) => { toast.error(…); console.error(error); }`. |
| 10 | "two IndexedDB managers hardcode `DB_VERSION 5` with 'MUST match' comments recording a prior production `VersionError` (`offlineDB.ts:7`, `offlineInspectionDB.ts:7`)" | CONFIRMED. Both files have `const DB_VERSION = 5;` at line 7 with adjacent comments citing `VersionError`. |
| 11 | "`BulkInspectionReportGenerator.tsx:89-102` never selects `created_at`, so the … sort at `:125-127` compares `new Date(0)`"; "Stop button reads `shouldStop` from a stale closure (`:407`; `handleStop:449`)" | CONFIRMED. The select at 87-102 has no `created_at`; 127 is `.sort((a, b) => new Date(b.created_at \|\| 0)…)`; 407 is `if (shouldStop) {`; 449 is `const handleStop = () => {`. |
| 12 | "`src/lib/data` has four files and zero code importers" | PARTLY CONFIRMED. The directory holds five entries (`README.md`, `queryKeys.ts`, `signedUrls.ts`, `sites.ts`, `useSites.ts`) — four are code. Substance holds; the count is loose. |

No fabricated claim found. Evidence cap not triggered.

---

## Submission 3

### 1. Evidence & grounding — **8.5** (weight 25%)

Every anchor I opened was exact, including the ones doing the most work. Its distinguishing move is an original inference rather than a restatement: the preamble reads the out-of-band prod script's own filter (`schemaname='public' AND cmd='SELECT' AND qual='true'`) and concludes that `storage.objects` and every blanket `FOR ALL` policy survived **in production too**, not merely in tracked history. I opened the file — the filter is at line 24, exactly as characterised — and the inference follows. It also absorbs the findings' adversarial nuances correctly rather than restating the headline: it says a *four*-segment path drives the `ilike` (three hits the `:189` guard), and it cites `templates/index.ts:345-351` as the fail-closed sibling that proves the divergence unintentional. Held below 9 only because it adds fewer independently derived measurements than Submission 2; every claim is verifiable, but most are verified against the tree rather than re-derived.

### 2. Impact — **8** (weight 20%)

The only submission covering **all four blockers**, each with a dedicated proposal, and its blocker treatments are the deepest in the field: P-A03 alone handles the bucket flag, the never-dropped anon SELECT, the `WITH CHECK (true)` writes, the read path and the upload validation seam — the full span of F-01, where Submission 1 takes one leg and Submission 2 takes the policy leg. P-A02 enumerates the surviving permissive policies by migration and line rather than gesturing at them. The counterweight is breadth: 9 highs, the narrowest of the three, all inside the security cluster. F-07 (the corpus's only data-loss finding), F-13 (authn-bypass), F-16 and the whole F-17…F-35 correctness/verification block are unowned. The preamble states the sequencing principle but does not name what is being left on the floor.

### 3. Feasibility & effort realism — **8** (weight 15%)

The most honestly calibrated set. It is the only submission that assigns `high` risk anywhere, and it assigns it exactly twice, to the two proposals with the largest blast radius (P-A02's policy reconciliation, P-A03's bucket privatisation), both correctly sized L. P-A01 at S/low is right — two directory deletions and two config blocks. Dependencies are explicit and correct, including a non-obvious one ("Depends on P-A02 (`is_staff` lands in that migration set)"), and it identifies genuine parallelism (P-A04 at Order 2 alongside P-A02, with "No dependencies"). P-A03's internal ordering constraint — "land the resolver before flipping the bucket" — is a feasibility observation, not just a risk note. Docked because P-A03's "~30 files call `getPublicUrl`" is the only sizing figure given for an L, and P-A08 folds five distinct workstreams under one M.

### 4. Risk handling — **8** (weight 15%)

Every proposal carries an `Escalation gate:` line, and between them they hit five of the six listed categories: dead code a job might call (P-A01, with the check actually performed — "`vercel.json`'s only cron is `/api/snapshots/capture`"), non-additive migrations (P-A02, P-A03, P-A08), auth flows (P-A04, P-A05, P-A08), forced re-login (P-A05), and a public API contract change with token reissue (P-A07). The preamble owns the blast radius up front in a way no other submission does: "I will break the DocBuilder integration, invalidate live API credentials and force re-login rather than leave a boundary open." P-A06's gate is the most operationally grounded in the field — printed QR stickers must be inventoried and regenerated. Held at 8 because rollback is almost absent: two L/high non-additive migrations ship with no down file, no staging step and no reversal plan; the only recovery thinking is P-A03's ordering constraint.

### 5. Scope discipline — **7.5** (weight 15%)

Each proposal maps to one coherent finding cluster, no finding is claimed twice, and P-A01 and P-A06 are pure subtraction. Three pressures against it. P-A04 introduces a shared `requireRole(req, roles)` across the edge surface — a new abstraction, modest and justified by three findings, but new. P-A03 folds "one signed-URL resolver" into an already-L proposal; F-66 documents nine copy-pasted blocks so consolidation is warranted, but this is exactly the work another competitor costed separately as "its own track", and no sizing is given for it. P-A08 carries hash columns, a two-phase plaintext drop, the invite-response change, a credential rotation, a docs deletion and a `DROP temp_import` under two findings — all are evidence legs of F-09/F-10, so it stays in scope, but it is the loosest bundle in the submission.

### 6. Clarity & decidability — **8** (weight 10%)

One decision per proposal, no cross-claimed findings, and a fixed shape — Addresses, change, escalation gate, effort/risk/order — that makes items comparable at a glance. The preamble discloses the accepted casualties before the reviewer reads a single proposal, so the cost of "yes" is known up front. Two costs: P-A04 bundles four handler changes plus a function deletion into one accept/reject; and P-A02 describes its contents by reference ("drops by name every surviving permissive policy", then a list of source migrations) without stating the resulting policy count, so a reviewer approves a migration whose final shape has to be reconstructed from six citations.

**Composite: 8.5(.25) + 8(.20) + 8(.15) + 8(.15) + 7.5(.15) + 8(.10) = 8.05 → 8.1**

### Gap feedback (Submission 3)

- Coverage is the narrowest in the field: 9 of 31 highs. F-07 — the corpus's only `data-loss` finding, where a scheduled logout destroys a day of unsynced field capture — is unowned, as are F-13, F-16 and the whole F-17…F-35 block. The preamble asserts a sequencing principle but never states what that principle costs or which findings it consciously abandons.
- Rollback is absent where the risk is highest. P-A02 and P-A03 are both L/high and both non-additive, and neither describes a down migration, a staging apply, or how the change is reversed if anon PostgREST reads or stored public URLs break in a way the resolver did not anticipate.
- P-A03's sizing rests on a single number ("~30 files call `getPublicUrl`") with no breakdown, while the proposal simultaneously flips a bucket, drops a policy, replaces write policies with a path-prefix predicate, builds a shared resolver and adds an upload validation call. The L is asserted rather than derived.
- P-A08 bundles credential hashing, a phased plaintext column drop, the invite-response change, rotation of a committed credential, deletion of a tracked PII runbook and `DROP temp_import` into one accept/reject at one risk rating, with a re-provisioning window shared with P-A07 that is named but not scheduled.
- P-A04 asserts that an unset `DOCBUILDER_*` env var is the live state's risk, and the finding's own verification records that precondition as unverifiable from the repo. The proposal does not say how the current state is established before the change lands.
- P-A02's contents are specified by citation rather than enumeration; the reviewer is asked to approve "every surviving permissive policy" without a count or a list of the policies that will exist afterwards.
- P-A06 removes the name-matching fallback and states that legacy stickers must be inventoried, but gives no way to establish how many legacy name-based labels are in the field, which is the fact the gate depends on.

### Citation-check log (Submission 3)

| # | claim (verbatim from submission) | what I found |
|---|---|---|
| 1 | "the fixes sit in `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4` — 'intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied'" | CONFIRMED verbatim. Line 4 reads `-- This is intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied.` |
| 2 | "it filters `schemaname='public' AND cmd='SELECT' AND qual='true'` (same file, :22-24), so `storage.objects` and every blanket `FOR ALL` policy survived in production too" | CONFIRMED. The `FOR t IN` loop opens at 22, `SELECT DISTINCT tablename FROM pg_policies` at 23, and line 24 is exactly `WHERE schemaname='public' AND cmd='SELECT' AND qual='true'`. The inference about storage and `FOR ALL` follows from that filter. |
| 3 | "Prod already 404s them — `docs/system-reference/GAPS.md:36` records both as 'DELETED from prod … source kept in repo'"; "`vercel.json`'s only cron is `/api/snapshots/capture`" | CONFIRMED both. GAPS.md:36 lists 7 dead anon-reachable fns "DELETED from prod", naming `fix-inspection-photos` and `fix-tenant-images`, "0 callers, verified 404; source kept in repo". `vercel.json` has one `crons` entry, `/api/snapshots/capture`. |
| 4 | "`send-email` … then forwards `to/cc/bcc` verbatim to SMTP as `GMAIL_USER` (`:87-95`)" | CONFIRMED. 87-95 is `await client.send({ from: gmailUser, to: …, cc: …, bcc: …, subject, content, html });` with cc/bcc taken straight from the body. |
| 5 | "Make `save-template` … and `template-sync` … fail closed with 503 as sibling `templates/index.ts:345-351` does" | CONFIRMED. 345-351 is `const expectedApiKey = Deno.env.get('DOCBUILDER_PUBLIC_TOKEN')` … `// Fail closed: never serve data when the API token is not configured` … `if (!expectedApiKey) { return new Response(…, { status: 503 … }) }`. |
| 6 | "A four-segment path drives `.ilike('name','%x%')` (`:194`) plus substring site/client matching (`:205-210`)" | CONFIRMED. 181 is `if (pathParts.length >= 3)`, 189 is the `if (subsectionName)` guard (so 3 segments are filtered out), 194 is `.ilike('name', \`%${subsectionName}%\`)`, and 205-210 is the `.find` with `includes()` on both site and client names. |
| 7 | "`api_clients` carries no tenant column (`20260110172925…:2-13`)" | CONFIRMED. Lines 2-13 are the full `CREATE TABLE public.api_clients` — id, name, client_id, client_secret, redirect_uris, scopes, is_active, created_by, created_at, updated_at. No tenant/client/site scoping column. |
| 8 | "re-displayed in the admin UI (`APIClients.tsx:201,273,288`)" | CONFIRMED all three. 201 renders `{createdClient.client_secret}`; 273 renders `Secret: {showSecrets[client.id] ? client.client_secret : "••••…"}`; 288 is `onClick={() => copyToClipboard(client.client_secret, "Client Secret")}`. |
| 9 | "the SECURITY DEFINER RPCs (`20260727101000:25`) replace them"; "`ProtectedRoute.tsx:19-26` renders the admin shell for anything that is not Contractor/Client" | CONFIRMED both. Line 25 of that migration is `RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$`. ProtectedRoute 19-20 are the only role tests and 22-26 return `<OnboardingGate>{children}</OnboardingGate>` for everything else. |

No fabricated or unsupported claim found. Evidence cap not triggered.

---

## Ranking

| rank | submission | composite | Evidence & grounding (tiebreak) |
|---|---|---|---|
| 1 | **Submission 3** | **8.1** | 8.5 |
| 2 | **Submission 1** | **7.9** | 8.0 |
| 3 | **Submission 2** | **7.8** | 9.0 |

No ties on composite, so the Evidence tiebreak was not invoked. Recorded for completeness: Submission 2 carries the highest Evidence score in the field (its measurements reproduce exactly on re-run) but places third on the weighted composite, where the 20% Impact and 15% Scope criteria pull hardest against it — a missing blocker, a partial-but-undeclared blocker leg, and the largest greenfield construction of the three.

### Score matrix

| criterion (weight) | Submission 1 | Submission 2 | Submission 3 |
|---|---|---|---|
| Evidence & grounding (25%) | 8 | **9** | 8.5 |
| Impact (20%) | 7.5 | 6.5 | **8** |
| Feasibility & effort realism (15%) | 7.5 | 7 | **8** |
| Risk handling (15%) | 8 | **9** | 8 |
| Scope discipline (15%) | **8.5** | 6.5 | 7.5 |
| Clarity & decidability (10%) | 7.5 | **8.5** | 8 |
| **Composite** | **7.9** | **7.8** | **8.1** |
