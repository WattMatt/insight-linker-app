# Round 2 — Independent Judge Scorecard

- Date: 2026-07-30
- Authority: `./review/04-rubric.md` (LOCKED 2026-07-30) and nothing else.
- Inputs received: rubric, `./review/03-findings.md`, `./review/manifest.md`, read access to `./review/specs/` and the repo, three anonymized submissions in shuffled order.
- Not received / not opened: `./review/04-personas.md`, `./review/scores/` (prior rounds), competitor prompts, authorship.
- Feedback below is GAP-based by rule: it names what is weak, missing, unsupported or out of scope, and proposes no remedy.

## Format-cap check (criterion 6 precondition)

Measured mechanically. All three comply; no over-length penalty applied to any submission.

| | preamble words (cap 150) | proposals (cap 8) | max "what changes and why" body (cap 120) | total words |
|---|---|---|---|---|
| Submission 1 | 124 | 8 | 108 (P-C05) | 2,502 |
| Submission 2 | 141 | 8 | 107 (P-A03) | 2,005 |
| Submission 3 | 149 | 8 | 114 (P-B02) | 2,179 |

---

# Submission 1

## 1. Evidence & grounding — 9.5 (weight 25%)

Every spot-check landed, including four claims that are machine-reproducible rather than merely citable: I ran `npx tsc --noEmit` and counted exactly **171** errors against the **109** baseline recorded at `next.config.mjs:110`, and exactly **42** of them in `' 2'`-suffixed files — both numbers as asserted. Line anchors are exact across `UserRLSPolicies.tsx:112-123,131-134`, `pdfTemplates.ts:268`, `BulkInspectionReportGenerator.tsx:87-102,127,407,449`, `vitest.config.ts:22`, `tsconfig.json:27,28`, `.gitignore:11`.

Its correction of the F-31 failure anchor is independently right: `20260612120000:52` sits inside a PL/pgSQL body (not name-resolved at CREATE) while `:65` is the executed `DO` block — which is precisely what the findings doc's own adversarial verifier recorded ("Clean apply fails at 20260612120000's executed DO block"). One slip: "F-31's six objects" understates — F-31 enumerates eight.

## 2. Impact — 7.0 (weight 20%)

All four blockers are touched, but F-01 is explicitly declared partial (the `public = true` bucket flag is out of scope) and F-03's F-111 leg is deferred to an unmade decision. Three of eight slots (P-C02 rebuildability, P-C05 CI, P-C08 consolidation) reduce no severity directly; they buy provability, which the rubric does not weight.

Twelve of thirty-one highs are addressed. The remaining nineteen — including F-07 (the corpus's only data-loss finding), the entire endpoint-auth cluster F-08/F-11/F-12/F-14/F-15, F-13, F-16, the error-handling block F-17–F-22, and F-29/F-30 — are neither covered nor argued out anywhere in the document.

## 3. Feasibility & effort realism — 9.0 (weight 15%)

Sequencing is the submission's spine and it prices its own cost honestly: P-C02 states outright that P-C06/P-C07's verdict fixes wait behind it and accepts that. P-C04 is deliberately decoupled from P-C05 with a stated reason (the pgTAP file runs locally now, unchanged later), which is a correct dependency call rather than a convenient one.

P-C02 replaces an unbounded enumeration with a terminating procedure plus a machine criterion (`supabase db reset` exits 0) — the only honest handling of that task in the field. Weakest sizing: P-C05 carries seven findings, a types regeneration, an error-count gate, a vitest scope change and a deno job at a single **L**.

## 4. Risk handling — 9.5 (weight 15%)

Gates are specific, not boilerplate, and several catch things the others miss. P-C01 notes that deleting the directory does **not** undeploy — `supabase functions delete` must run against prod as a named step. P-C08 flags that consolidating the two `DB_VERSION 5` IndexedDB managers forces a client-side offline **re-sync**, an escalation-gate item nobody else identifies.

P-C06's "recompute, do not backfill" cites the precedent to avoid by line (`20260725100000:86-101` sets `coc_status='Pending'` with no pre-image). P-C04 separates the `UNIQUE(user_id)` schema change from the live-data reconciliation as two reviews. P-C05 forbids CI auto-seeding the PII seed file. P-C07 states that already-imported dates stay wrong and correcting them is a separate reviewed rewrite.

## 5. Scope discipline — 9.5 (weight 15%)

The clearest subtraction bias in the field, and it is documented. P-C08 was cut from five findings to two with the reason stated ("a deletion sweep dressed as consolidation"). Round-1's "delete the 33 untracked files" was replaced by two config entries on the stated ground that "deleting one machine's untracked working tree is not a reviewable change."

F-34 is declared partial with a refusal to claim 16 tests it has not written. F-01's bucket leg is declared out of scope with a counted reason (49 `getPublicUrl` sites across 34 files — verified). A single-claim rule is applied so F-23 is owned once and cross-referenced, not double-counted. P-C05 is the one item that grows.

## 6. Clarity & decidability — 7.5 (weight 10%)

Within all format caps, and the declared-partial notation (F-01, F-34, F-109) is precise and rare. But it is the longest document by 25%, and the density costs decidability at two points.

P-C03 cannot be locked as written: it says F-111 "forces a choice — pick one staff predicate for the three at…", leaving the reviewer to answer a question before accepting the item. P-C05 bundles seven findings, a tooling addition, a partial declaration and a CI credential prohibition in one block a reviewer must take or leave whole.

**Composite: 8.7**

## Gap-based feedback — Submission 1

Nineteen of thirty-one highs are absent from the document with no accounting: F-07 — the only data-loss finding in the corpus — plus F-06, F-08 through F-16, F-17 through F-22, F-29 and F-30. The other two submissions each name and argue their declines; this one does not, so a reviewer cannot tell whether the omissions are judgments or oversights.

Three of eight slots buy provability rather than severity reduction. Under a corpus with four blockers and thirty-one highs, that allocation is asserted, not defended: the preamble argues that fixes are "currently unprovable" but never states what severity is being deferred to obtain provability, or for how long.

P-C03 is not lockable. It hands the reviewer an open question (which of three staff predicates wins) inside the item, and separately concedes that a reset gate cannot see prod-side drift — so its own verification story is incomplete by its own admission, with "only a prod policy probe settles that" left unowned.

P-C02's effort **M** is not derivable from anything in the submission. The procedure terminates, but the number of repair migrations it terminates after is unknown and unbounded by the evidence given; F-31's object list is called a "seed list, not the boundary."

P-C05 at **L** absorbs seven findings plus a types regeneration plus an error-count mechanism plus a harness scope change. Nothing in the item distinguishes which of those a reviewer may reject independently.

The "F-31's six objects" count is wrong — the finding enumerates eight — in a proposal whose whole deliverable is object completeness.

---

# Submission 2

## 1. Evidence & grounding — 8.5 (weight 25%)

The derived counts are the strongest evidence work in the field and they reproduce exactly. `grep -c 'CREATE POLICY "All authenticated users full access'` on `20251120080517` returns **22** as claimed; the create-vs-drop differential returns exactly **8** never-dropped names — F-03's six plus `validation_conversations`/`validation_messages`, which independently recovers a note the findings doc's adversarial verifier made. `getPublicUrl` over `src` + `supabase` is **49** occurrences across **34** files with **4** in tests: all three numbers exact.

Direct anchors verified exact at `send-email:33-41,87-95`, `templates/index.ts:345-351,348`, `api-reports:58-63`, `imageUrlResolver.ts:6-27`, `qrBaseUrl.ts:43,50`, `GAPS.md:36` (quoted verbatim), `20260110172925:2-13`.

Three imprecisions, all off-target rather than fabricated: the four phantom `config.toml` anchors (`14-15,17-18,26-27,45-46`) are each off by one — the real blocks are 15-16, 18-19, 27-28, 46-47, so a reviewer following those numbers edits the wrong lines; "three further `deleted_at` columns" is two; and `20260727101000:25` is the `SECURITY DEFINER` declaration, not a grant to anon.

## 2. Impact — 8.5 (weight 20%)

The only submission that takes all four blockers whole — F-01 including the bucket flag, F-02, F-03 and F-04 — and P-A03 is the deepest single blocker remediation in the field: 36 enumerated DROPs with per-source counts (8 + 6 + 5 + 11 + 1 + 4 + 1), not a gesture at a policy class.

Twelve of thirty-one highs, with the remaining nineteen named and declined in the preamble and change log. The declined set is expensive and it says so: F-07 is the corpus's only data-loss finding and the submission concedes P-A06 makes it worse ("I accept that"). That is a real impact cost paid knowingly, not a coverage gap hidden.

## 3. Feasibility & effort realism — 8.5 (weight 15%)

Sizes are derived rather than asserted, and the derivations check out: P-A03's **L** from 36 DROPs across 8 source migrations plus a mirrored down file; P-A05's **L** from 34 files / 49 call sites / 4 tests, verified. Preconditions are stated as methods, not wishes — `supabase secrets list` plus `templates/index.ts:348` used as a live 503 oracle to establish `DOCBUILDER_*` state before shipping.

Two soft spots. P-A04 is declared "Order 2, parallel with P-A02/P-A03" while P-A02 is declared to gate "P-A03–P-A08" — the item is parallel with its own gate. And P-A02 carries six findings (rebuildability, the down-file convention, a temp-table drop, two PII purges, a credential rotation) at a single **M**.

## 4. Risk handling — 9.0 (weight 15%)

Every proposal carries a rollback clause distinct from its gate, and the two high-risk items name their reversal concretely: P-A03 mirrors all 36 DROPs verbatim in a down file with a three-stage apply (clean DB → branch DB → prod); P-A05 reverses with one `UPDATE … public=true` plus the down-file policy and observes that signed URLs keep resolving through the same code path, so rollback needs no second frontend deploy.

P-A08 phases the API-contract change additively before the drop so everything pre-drop rolls back by config, and flags the public API contract explicitly. P-A02 makes the sharp point that for a committed credential, deletion is not the control — rotation is. P-A06 flags forced re-login and role-less staff lockout, with the backfill in the same migration.

## 5. Scope discipline — 8.0 (weight 15%)

Genuine subtraction bias: P-A05 extends `imageUrlResolver.ts:6-27`, which already parses both URL shapes, rather than adding an abstraction, and absorbs F-66's nine copies; P-A06 replaces three incompatible predicates with one; round-1's P-A07 and P-A08 were merged because they shared one re-provisioning window.

Against that, P-A02 is bundled on adjacency, not on being one change — "same pass: DROP temp_import, delete the seed file, delete the runbook, rotate the credential" is four unrelated concerns riding a rebuildability migration. P-A06 introduces `src/middleware.ts` where none exists; defensible under F-99 but it is new infrastructure inside a smallest-viable-change brief. Two **L** items plus a new middleware layer is a large surface.

## 6. Clarity & decidability — 9.0 (weight 10%)

The most uniformly decidable document of the three. Every item carries Addresses / What changes and why / Gate-rollback / Effort-Risk-Order in the same shape, the change log supplies a full round-1→round-2 renumbering map, and the declined findings are enumerated by id.

One follow-up question survives: the P-A04 ordering contradiction above. A reviewer must ask whether P-A04 truly runs parallel to the migration that gates everything after it.

**Composite: 8.6**

## Gap-based feedback — Submission 2

The four phantom `config.toml` registry anchors are each off by one. In an item whose deliverable is "delete four phantom registry entries," the cited lines point at the blank line and header rather than the header and its `verify_jwt` value — the one place in the submission where an anchor error propagates directly into an edit.

P-A02's **M** is unsupported. It fuses rebuildability (F-31, itself eight missing objects), the `.down.sql` convention for every subsequent security migration, a non-additive `DROP temp_import`, two PII deletions and a credential rotation. Nothing in the item lets a reviewer accept the rebuildability leg and reject the purge leg, and no evidence sizes the down-file convention across the migrations that follow.

The ordering statement is self-contradictory: P-A04 is "Order 2, parallel with P-A02/P-A03" while P-A02 "gates staged verification for P-A03–P-A08."

`20260727101000:25` is cited for the proposition that `get_public_subsection` "grants anon." That line declares `SECURITY DEFINER`; the grant is not there. The claim may be true elsewhere in the file, but the anchor does not support it.

The declined block (F-07, F-17–F-30, F-32–F-35) is argued as "not boundaries," yet P-A03, P-A05, P-A06 and P-A08 all ship migrations whose verification depends on the tracked tree applying — and F-32/F-33/F-34 are precisely the findings recording that nothing machine-checks the result. The exclusion is stated but its interaction with the plan's own verification story is not.

`src/middleware.ts` is new infrastructure. The submission establishes the gap (`git ls-files 'src/middleware*'` returns nothing) but not that a middleware layer is the smallest change satisfying F-99.

---

# Submission 3

## 1. Evidence & grounding — 8.0 (weight 25%)

Anchor precision was flawless across twelve checks. `SessionWatcher.tsx` — `performLogout` at :46, `clearAllCaches()` at :54, `signOut` at :60 — exact. `cacheUtils.ts:6` (`PRESERVED_KEYS = ['supabase.auth.token']`), `:41-44`, `:69-78` — exact, and `package.json:48` does pin `^2.75.0`, so the v1-key-name argument holds. `publicVerdict.ts:22`/`:34`/`:35`, `20251120080517:206,213`, `20260615140000:44` against `20260611150000:25-26`, `AssetVerification.tsx:273`, `next.config.mjs:129-131`, `useOfflineSync.ts:17,442-451`, `ContractorPortalLayout.tsx:76-79` — all exact. Its change log documents two anchor self-corrections, both of which I confirmed were needed and are now right. I also verified the harder claim that `AccessLinkGenerator.tsx:101` is the *only* SELECT on `client_access_links` — the file's other three hits are insert/delete/update.

One overstated claim, sitting on an escalation gate where exhaustiveness is the point: "Grep outside `src/` hits only `docs/system-reference/06-flows/offline-sync.md:118,148-149`." There are three further hits — `hooks-1.md:130,132` and `uncovered-gapfill.md:126`. The substance (docs only, no invoker) survives; the "only" does not. Evidence here is largely single-line anchoring rather than derivation.

## 2. Impact — 8.5 (weight 20%)

The broadest high coverage in the field — sixteen of thirty-one — and the only submission that owns F-07, the corpus's sole data-loss finding, at Order 1 and effort **S**. It also owns the entire error-handling and offline-durability cluster (F-17–F-22, F-18/F-20/F-21, F-83/F-84/F-85, F-81) that both rivals decline.

All four blockers appear, but F-01 is split across two items and bucket privatisation is excluded, so F-01 is covered less completely than in Submission 2. Six highs are named and declined with a reason (F-08/F-09/F-11/F-12/F-14/F-15). Nine more are simply absent without comment — F-06, F-10, F-28, F-31, F-32, F-33, F-34, F-35 — and F-31's absence is load-bearing, since three of its own items ship non-additive migrations.

## 3. Feasibility & effort realism — 7.5 (weight 15%)

Ordering is coherent and internally consistent (the change log records fixing a round-1 declared/printed mismatch), dependencies are stated (P-B07 after P-B06 so verdicts are correct before unification; P-B05 after P-B04), and P-B01 at **S** for the data-loss fix is honest sizing on the highest-value item.

The dependency gap is structural: P-B02's stated precondition is to "exercise every client-side delete site in staging," and P-B06's gate requires "a counted dry-run query" — both presuppose a database the tracked migrations cannot build (F-31), which appears nowhere in the plan. P-B05 at **L** adds a dead-letter store, client-minted ids, server-id reconciliation and a flagged cross-tab lease; the flag is asserted, its rollout is not sized.

## 4. Risk handling — 8.5 (weight 15%)

The best pre-conditions in the field appear in P-B02: count `storage.objects` rows with null `owner` before any owner-or-Admin predicate, because service-role uploads would become Admin-only — a second-order consequence neither rival identifies. P-B08 derives an ordering constraint from a lockout risk correctly, and states it as a prohibition ("never ship it before the F-30 fix lands — until Client and Contractor can reach a password-change screen, enforcing the flag traps them").

P-B04's gate is unusually honest about blast radius: previously hidden failures become visible in one release, "expect a support spike; that is the deliverable, not a regression." P-B06 requires before/after totals recorded for sign-off before the recompute rewrites live status. P-B01's gate names the trade it creates (a device that cannot sync stays signed in past the configured minute).

Deductions: the staging substrate the gates depend on is not established, and P-B05's dead-code gate rests on the overstated grep above.

## 5. Scope discipline — 7.5 (weight 15%)

Real discipline in places: P-B04 scopes to a closed list of seven files and names six files deliberately excluded; bucket privatisation is excluded from P-B02 with a counted reason; the endpoint-auth cluster is declined with an argument; F-102, F-119 and F-27 were dropped to shrink a grab-bag.

But P-B08 is still a six-finding grab-bag spanning an RLS-override panel deletion, a password-change enforcement flow, a broken profile link, a phantom-column update, a hardcoded status string, hardcoded PDF flags and three 404 URL builders — the change log admits round-1's P-B08 "had become" a grab-bag and the item remains one. P-B05 is the largest new machinery proposed by any submission: a dead-letter store, an id-minting contract change and a cross-tab lease.

## 6. Clarity & decidability — 8.5 (weight 10%)

Within all caps. Escalation gates are consistently flagged and specific, declined findings are named with reasons, and declared order matches document order.

Two frictions. F-01 is split across P-B02 ("anon storage SELECT + authenticated write legs") and P-B03 ("pool-upload leg") with a third leg excluded, so a reviewer must reconstruct what F-01 coverage actually amounts to from three places. P-B08's six heterogeneous findings must be accepted or rejected as one item, despite the note that each is a separate commit.

**Composite: 8.1**

## Gap-based feedback — Submission 3

F-31 is absent, and its absence undermines the submission's own gates. P-B02 requires exercising every client-side delete site in staging; P-B06 requires a counted dry-run before the recompute rewrites live `installation_status`; P-B07 re-tightens a CHECK constraint. All three presuppose a database that can be built from the tracked tree. The plan never establishes that it can be, and never states what verification is available if it cannot.

The claim that the sole non-`src` references to the markup/measurement executor cases are `offline-sync.md:118,148-149` is not exhaustive — `hooks-1.md:130,132` and `uncovered-gapfill.md:126` also reference them. Exhaustiveness is the entire evidentiary burden of a "removing code that looks dead" gate, and this grep does not carry it.

Nine highs are neither addressed nor declined: F-06, F-10, F-28, F-31, F-32, F-33, F-34, F-35. The preamble builds an explicit exclusion argument for the endpoint-auth cluster but is silent on these, so the document's coverage rationale is applied unevenly.

F-01 is claimed in two items with a third leg excluded and no single place stating the net coverage. A reviewer accepting P-B02 and rejecting P-B03 gets a partial blocker fix and the submission does not say what remains open.

P-B08 bundles six findings across three unrelated risk classes — an auth-flow change with lockout potential, a visible admin feature deletion, and inert UI defects — under one **M / med** rating. The rating cannot be true of all six simultaneously, and the item offers no per-leg differentiation.

P-B05's **L** covers a dead-letter store, client-minted idempotency ids that "change the insert contract," server-id reconciliation, and a cross-tab lease behind a flag. The one-time upgrade path for queues already resident on field devices is named as a requirement but not sized, scoped, or evidenced.

---

# Citation spot-check log

Every check below was performed by opening the cited file at the cited line in the repository.

## Submission 1

| # | Citation as claimed | What I found |
|---|---|---|
| 1 | "`tsc --noEmit` today gives 171 errors against the recorded 109 baseline (`next.config.mjs:110`)" | **Confirmed exactly.** Ran `npx tsc --noEmit`: 171 lines matching `error TS`. `next.config.mjs:110` reads "Audit baseline: 109 strict-mode type errors…". `:112` is `typescript: { ignoreBuildErrors: true }`. |
| 2 | "The 171-vs-109 gap is 42 errors in untracked `' 2'` files swept in by `tsconfig.json:27`" | **Confirmed exactly.** 42 of the 171 errors are in `' 2'`-suffixed files. `tsconfig.json:27` is `"include": [… "**/*.ts", "**/*.tsx" …]`; `:28` is `"exclude": ["node_modules", "supabase"]`. |
| 3 | "`:65` filters `public.subsections WHERE deleted_at IS NULL` … the function body at `:10-59` does not resolve column names at `CREATE`" | **Confirmed, and more precise than the findings doc.** `20260612120000:65` is `FOR rec IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP` inside the `DO` block at :62-69; `:52` is inside the PL/pgSQL body. F-31's verifier states "Clean apply fails at 20260612120000's executed DO block." No migration adds `subsections.deleted_at`. |
| 4 | "`UserRLSPolicies.tsx:112-123` deletes every `user_roles` row for a user then inserts, as two unwrapped requests; `onError` is a toast (`:131-134`)" | **Confirmed exactly** in `src/components/UserRLSPolicies.tsx`: :112-117 delete + throw, :119-123 insert + throw, no transaction; :131-134 `onError` → `toast.error` + `console.error`. |
| 5 | "`pdfTemplates.ts:268` calls `formatPdfDate()` with no argument" | **Confirmed exactly.** `src/lib/pdfTemplates.ts:268` reads `text: formatPdfDate(),`. |
| 6 | "`site_health_snapshots` has 0 hits yet three live consumers (`route.ts:93`, `useSiteScores.ts:26`, `ComplianceDashboard.tsx:110`)" | **Confirmed exactly.** `grep -c site_health_snapshots src/integrations/supabase/types.ts` → 0. All three consumer lines match the cited line numbers. |
| 7 | "F-31's six objects plus `trg_recompute_from_template` are the seed list" | **Not supported.** F-31 enumerates eight: `subsections.deleted_at`, `snags.snag_type`, `snags.deleted_at`, `inspections.deleted_at`, `classify_field_status`, `get_compliance_setting_numeric`, `…_bool`, `trg_recompute_from_template`. Undercount, not fabrication. |

## Submission 2

| # | Citation as claimed | What I found |
|---|---|---|
| 1 | "`grep -rho "All authenticated users full access to [a-z_]*" …` shows 22 created in `20251120080517` and **8** never dropped — F-03's six names plus `validation_conversations`/`validation_messages`" | **Confirmed exactly.** `grep -c 'CREATE POLICY "All authenticated users full access'` on that file → 22. Create-vs-drop differential → exactly 8 names, matching the two named extras; F-03's own verifier records the same undercount. |
| 2 | "34 files, 49 `getPublicUrl` sites, 4 of them tests" | **Confirmed exactly** over `src` + `supabase`: 34 files, 49 occurrences, 4 test files. |
| 3 | "`send-email` gates only on `getUser` (`:33-41`) then forwards `to/cc/bcc` verbatim to SMTP as `GMAIL_USER` (`:87-95`)" | **Confirmed exactly.** :33-41 is the `getUser`/401 block with no role check; :87-95 is `client.send({ from: gmailUser, to, cc, bcc, … })`. |
| 4 | "`templates/index.ts:348` is a live oracle: an unauthenticated GET 503s iff `DOCBUILDER_PUBLIC_TOKEN` is missing" | **Confirmed exactly.** :345 reads the env var; :348 `if (!expectedApiKey)`; :351 returns status 503. |
| 5 | "delete four phantom registry entries whose directories do not exist (`config.toml:14-15,17-18,26-27,45-46` vs the 17 dirs)" | **Substance confirmed, anchors off by one.** 17 dirs exist and the four named functions are absent, but the blocks are at 15-16 (`validate-coc`), 18-19 (`extract-coc`), 27-28 (`verify-fix`), 46-47 (`detect-schematic-regions`). Cited lines are the preceding blank + header. |
| 6 | "F-31 names eight such objects (three further `deleted_at` columns, …)" | **Total confirmed, parenthetical wrong.** F-31 does name eight objects. But beyond `subsections.deleted_at` there are two further `deleted_at` columns (`snags`, `inspections`), not three. |
| 7 | "returns a live subsection UUID (`:87`) that `get_public_subsection` grants anon (`20260727101000:25`)" | **Anchor does not support the claim.** `20260727101000:25` is `RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$` — a definer declaration, not a grant to anon. |

## Submission 3

| # | Citation as claimed | What I found |
|---|---|---|
| 1 | "`SessionWatcher.tsx:54` calls `clearAllCaches()` inside `performLogout` (:46), before `signOut` (:60)" | **Confirmed exactly.** :46 `const performLogout = useCallback(async () => {`; :54 `await clearAllCaches();`; :60 `await supabase.auth.signOut();`. |
| 2 | "`cacheUtils.ts:41-44` deletes `wm_compliance_offline` … `:6,69-78` strips every localStorage key except `supabase.auth.token`, a supabase-js **v1** name while `package.json:48` pins `^2.75.0`" | **Confirmed exactly.** :41-44 is the `dbNames` array; :6 is `PRESERVED_KEYS = ['supabase.auth.token']`; :69-78 is the strip loop; `package.json:48` is `"@supabase/supabase-js": "^2.75.0"`. |
| 3 | "`20251120080517…sql:206,213` grants every signed-in user `FOR ALL USING (auth.uid() IS NOT NULL)` on `user_sites` and `user_clients`" | **Confirmed exactly.** :206 `…full access to user_sites`, :213 `…full access to user_clients`, both `FOR ALL` with `USING`/`WITH CHECK (auth.uid() IS NOT NULL)`. |
| 4 | "`publicVerdict.ts:34` tests `days < EXPIRY_HINT_DAYS` (:22 = 30), true for negatives, so an expired Pass prints headline 'Compliant' (:35)" | **Confirmed exactly**, including the self-correction noted in its change log. :22 `const EXPIRY_HINT_DAYS = 30;`, :34 `if (days < EXPIRY_HINT_DAYS) {`, :35 returns `headline: "Compliant"`. |
| 5 | "the only app reader is `AccessLinkGenerator.tsx:101`" | **Confirmed.** :101 is the sole `.select()` on `client_access_links`; the file's other three hits (:177, :219, :239) are insert, delete and update. |
| 6 | "Grep outside `src/` hits only `docs/system-reference/06-flows/offline-sync.md:118,148-149`" | **Not supported as stated.** Also hits `docs/system-reference/07-components-hooks-lib/hooks-1.md:130,132` and `…/uncovered-gapfill.md:126`. All hits are docs, so the underlying "no invoker" conclusion stands, but the enumeration is incomplete. |
| 7 | "`AssetVerification.tsx:273`, where 'Clear All' deletes every `site_assets` row" | **Confirmed exactly.** :273 `const { error } = await supabase.from("site_assets").delete().eq("site_id", siteId);` — no `asset_category` predicate. |

---

# Ranking

| Rank | Submission | Composite | Evidence & grounding | Basis |
|---|---|---|---|---|
| 1 | **Submission 1** | **8.7** | 9.5 | Wins on the three criteria totalling 55% (Evidence 25, Risk 15, Scope 15). Only submission whose headline claims I could reproduce by running a command, and the only one to correct a findings-doc anchor in a way the corpus's own verifier independently supports. Pays for it in Impact — three of eight slots buy provability, and nineteen highs go unaccounted. |
| 2 | **Submission 2** | **8.6** | 8.5 | Deepest blocker remediation in the field and the only complete, explicitly-argued account of what it declines. Grep-derived sizings reproduce exactly. Loses to Submission 1 on Scope (P-A02 bundles five unrelated concerns) and on Evidence (four anchors off by one in an item whose deliverable is a line edit). |
| 3 | **Submission 3** | **8.1** | 8.0 | Broadest high coverage and the only owner of the corpus's sole data-loss finding, with the best pre-conditions of any gate written. Held down by a structural dependency gap — three of its items presuppose a buildable database while F-31 is absent — a surviving six-finding grab-bag, and one exhaustiveness claim that does not hold on the gate where exhaustiveness is the burden. |

No ties. Composites are distinct at one decimal; the Evidence & grounding column orders identically (9.5 / 8.5 / 8.0), so the tiebreak rule is not engaged and would not change the order if it were.

---

# Round 1 → Round 2 delta

Appended after round-2 scoring was complete and sealed. **No round-2 score has been altered.** This section is bookkeeping only.

The two rounds used different anonymisation shuffles. De-shuffled alignment (agent-X are anonymous author ids; no persona or authorship information was available or inferred):

| author | round-1 slot | round-2 slot |
|---|---|---|
| agent-A | Submission 3 | Submission 2 |
| agent-B | Submission 1 | Submission 3 |
| agent-C | Submission 2 | Submission 1 |

## agent-A (R1 Submission 3 → R2 Submission 2)

| criterion (weight) | R1 | R2 | movement |
|---|---|---|---|
| Evidence & grounding (25%) | 8.5 | 8.5 | — 0.0 |
| Impact (20%) | 8.0 | 8.5 | ▲ +0.5 |
| Feasibility & effort realism (15%) | 8.0 | 8.5 | ▲ +0.5 |
| Risk handling (15%) | 8.0 | 9.0 | ▲ +1.0 |
| Scope discipline (15%) | 7.5 | 8.0 | ▲ +0.5 |
| Clarity & decidability (10%) | 8.0 | 9.0 | ▲ +1.0 |
| **Composite** | **8.1** | **8.6** | **▲ +0.5** |

The movement is concentrated in Risk and Clarity, the two places round 1 marked hardest against it — round 1 recorded "rollback is almost absent … two L/high non-additive migrations ship with no down file", where round 2 records "every proposal carries a rollback clause distinct from its gate" and a mirrored 36-DROP down file with a three-stage apply; Impact rose as declined findings moved from silent omission to an enumerated, argued decline list, while Evidence stood still because the four off-by-one `config.toml` anchors offset the newly derived counts.

## agent-B (R1 Submission 1 → R2 Submission 3)

| criterion (weight) | R1 | R2 | movement |
|---|---|---|---|
| Evidence & grounding (25%) | 8.0 | 8.0 | — 0.0 |
| Impact (20%) | 7.5 | 8.5 | ▲ +1.0 |
| Feasibility & effort realism (15%) | 7.5 | 7.5 | — 0.0 |
| Risk handling (15%) | 8.0 | 8.5 | ▲ +0.5 |
| Scope discipline (15%) | 8.5 | 7.5 | ▼ −1.0 |
| Clarity & decidability (10%) | 7.5 | 8.5 | ▲ +1.0 |
| **Composite** | **7.9** | **8.1** | **▲ +0.2** |

The only author to trade a criterion away: it bought Impact (+1.0 — the missing blocker closed, high coverage 14 → 16, and it kept sole ownership of the corpus's only data-loss finding) and Clarity (+1.0) at the direct cost of its round-1 best criterion, Scope (−1.0), because the grab-bag proposal round 1 flagged survived the revision by its own admission while the plan's largest new machinery grew rather than shrank.

## agent-C (R1 Submission 2 → R2 Submission 1)

| criterion (weight) | R1 | R2 | movement |
|---|---|---|---|
| Evidence & grounding (25%) | 9.0 | 9.5 | ▲ +0.5 |
| Impact (20%) | 6.5 | 7.0 | ▲ +0.5 |
| Feasibility & effort realism (15%) | 7.0 | 9.0 | ▲ +2.0 |
| Risk handling (15%) | 9.0 | 9.5 | ▲ +0.5 |
| Scope discipline (15%) | 6.5 | 9.5 | ▲ +3.0 |
| Clarity & decidability (10%) | 8.5 | 7.5 | ▼ −1.0 |
| **Composite** | **7.8** | **8.7** | **▲ +0.9** |

Much the largest movement in the field, and it is almost entirely the repair of the two criteria that sank it in round 1: Scope +3.0 (the greenfield CI build and the untracked-working-tree deletion sweep were cut, with the cut and its reason documented) and Feasibility +2.0 (round 1's unbounded "every object that exists only in prod" was replaced by a terminating procedure with a machine-checkable exit); the −1.0 in Clarity is the price of the added justification density, which made it the longest document in the field with two items a reviewer cannot lock as written.

---

# Verdict

**Winner: agent-C — composite 8.7** (round-2 Submission 1).

- **Margin: 0.1** over agent-A at 8.6 (unrounded 8.725 vs 8.550, a margin of 0.175 — narrow but unambiguous). Third is agent-B at 8.1, 0.6 behind the winner.
- **Tie-break not engaged.** No two composites tie at one decimal. Recorded for completeness: had Evidence & grounding been needed, it points the same way — agent-C 9.5, agent-A 8.5, agent-B 8.0, ordering identically to the composite.
- Basis, per the sealed round-2 scorecard: agent-C wins the three criteria totalling 55% of the weight (Evidence 25%, Risk 15%, Scope 15%) and pays for it in Impact, where it is last in the field at 7.0.

**The ranking changed — it inverted at both ends.**

| rank | round 1 | round 2 |
|---|---|---|
| 1 | agent-A (8.1) | **agent-C (8.7)** |
| 2 | agent-B (7.9) | agent-A (8.6) |
| 3 | agent-C (7.8) | agent-B (8.1) |

agent-C moved from last to first, agent-A from first to second, agent-B from second to third. Every author's composite rose; the ordering flipped because the gains were unequal (+0.9 / +0.5 / +0.2) and, in agent-C's case, landed on the two heaviest criteria it had previously been weakest on. The round-1 gap between first and last was 0.3; in round 2 the same three authors span 0.6.

---

# Convergence check

**Assessment: no. The round-2 slates did not become more similar to one another than the round-1 slates were — they diverged.** The leaked-solution failure mode is not in evidence. Convergence appeared in document *form*, not in *content*.

What separated, on the numbers in the two scorecards:

- **Composite dispersion widened**, it did not narrow: range 0.3 in round 1 (8.1 / 7.9 / 7.8) versus 0.6 in round 2 (8.7 / 8.6 / 8.1); population standard deviation 0.12 → 0.28. Per-criterion spread across the three submissions widened or held on five of six criteria (Evidence 1.0 → 1.5, Feasibility 1.0 → 1.5, Clarity 1.0 → 1.5, Impact 1.5 → 1.5, Risk 1.0 → 1.0, Scope 2.0 → 2.0). Homogenised slates would compress these, not stretch them.
- **Territories held.** Each author kept the finding cluster it owned in round 1: agent-C stayed on rebuildability and tooling (tsc counts, `supabase db reset`, migrations, CI, duplicate exports), agent-A stayed on the security boundary (policy DROPs, bucket flag, edge-function auth, credentials), agent-B stayed on runtime correctness and offline durability (logout cache-clear, verdict logic, the error-handling block, the delete predicate). The round-2 citation spot-check logs make this visible directly: across twenty-one checks the three submissions share essentially no cited files.
- **Coverage stayed differentiated, and the leader changed hands.** Highs addressed went 14 / 12 / 9 in round 1 (agent-B / agent-C / agent-A) to 16 / 12 / 12 in round 2 (agent-B / agent-C / agent-A) — spread 5 → 4, marginally tighter, but agent-B's exclusive ownership of the corpus's only data-loss finding persisted across both rounds and both rivals declined it again, one of them explicitly conceding its own item makes it worse.

Where similarity did increase, and it is worth recording honestly:

- **Blocker coverage collapsed to uniform.** Round 1 was 3 of 4 / 3 of 4 / 4 of 4 with two *different* blockers missing (agent-B omitted F-03, agent-C omitted F-02). In round 2 all three touch all four. This is the single clearest convergence, and it is the expected effect of gap feedback that named a missing blocker to two of the three authors — it is coverage of the brief converging, not solutions converging, since the three still fix those blockers by different routes and to different depths (only agent-A takes F-01 whole; agent-C declares it partial; agent-B splits it across two items with a leg excluded).
- **Document conventions converged.** All three round-2 submissions now carry per-item escalation gates, explicit declared-partial notation, named declined findings, and a round-1→round-2 change log. Round 1 had these unevenly (two of agent-B's proposals carried no gate at all; agent-A had almost no rollback thinking). That is process discipline propagating from the rubric and the gap feedback, which is the intended effect.
- **One measurable cross-pollination.** The `getPublicUrl` figure appears in two slates in round 2 — agent-A derives 49 sites / 34 files / 4 tests to size its L, and agent-C cites the same count as its reason for excluding the bucket leg. In round 1 that number existed only in agent-A's slate, and only as an unverified "~30 files". A shared, now-corrected measurement moving between slates is the one place a solution-shaped detail crossed authors. It is isolated: no other figure, anchor, or proposal in the round-2 logs is shared between submissions.

Net: the substance stayed distinct and the score spread doubled. The convergence that occurred is in rigour and in meeting the brief's blocker floor, not in what the submissions propose.
