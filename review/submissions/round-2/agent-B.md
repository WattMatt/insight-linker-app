# Round 2 — Agent B

## Strategy

This app sells one thing: a true statement — *your evidence is saved*, *this subsection is compliant*. It makes both when neither holds. An inspector's write fails and toasts success (F-17, F-19). A day of offline capture is deleted by a scheduled logout (F-07). A subsection with certificates on file reads as missing because the verdict receives an empty array (F-25). An expired certificate reads **Compliant** on the QR card the client scans (F-58). Beside these sit controls that enforce nothing (F-16, F-13) and links that go nowhere (F-30).

I rank by: *what does the inspector or the certificate holder wrongly believe?* Security earns priority where it puts someone else's hands on the evidence record — F-03, F-04, F-01 — not where it leaks or relays. The endpoint-auth cluster (F-08, F-09, F-11, F-12, F-14, F-15) is argued out, not overlooked: real, but it does not make the app lie.

---

### P-B01 — Never clear caches while unsynced work is pending

**Addresses:** F-07

**What changes and why:** `SessionWatcher.tsx:54` calls `clearAllCaches()` inside `performLogout` (:46), before `signOut` (:60). `cacheUtils.ts:41-44` deletes `wm_compliance_offline` — unsynced inspections and queued photo blobs — and `:6,69-78` strips every localStorage key except `supabase.auth.token`, a supabase-js **v1** name while `package.json:48` pins `^2.75.0`, so `offline_mutation_queue` goes with it. Change: attempt a drain, then count unsynced records and queue length; if non-zero, abort the auto-logout behind a blocking "N items not yet synced" prompt. Correct the database list too — drop the phantom `wm_floor_plan_offline`, add `wm-download-handoff` (`downloadHandoff.ts:17`) — and `PRESERVED_KEYS`. Cheapest possible prevention of the corpus's only data-loss finding.

**Effort S · Risk low · Order 1 — ship first.** **ESCALATION GATE:** modifies the logout flow; a device that cannot sync now stays signed in past the configured minute. That trade needs an explicit owner decision. The DB default is already `false`, so blast radius today is small.

---

### P-B02 — Drop the blanket policies that put another tenant's hands on the evidence record

**Addresses:** F-03, F-04, F-01 (anon storage SELECT + authenticated write legs), F-05

**What changes and why:** One migration, four drops, nothing invented. `20251120080517…sql:206,213` grants every signed-in user `FOR ALL USING (auth.uid() IS NOT NULL)` on `user_sites` and `user_clients` — the tables Contractor and Client policies scope through (`20260612220000…:53-58`, `20260708090000…:28-38`) — so a Contractor repoints their own mapping and inherits another site's evidence; the 2025-10 Admin-manage/view-own policies (`20251017061634…:12-23`) still sit underneath. Drop `client_access_links`' `SELECT USING (true)` (`20260123052614…:9-12`); the QR portal is unaffected (portfolio RPCs are SECURITY DEFINER, `20260610113000…:11,23,54`) and the only app reader is `AccessLinkGenerator.tsx:101`. Drop `"Anyone can view all storage"` (`20251120083932…:18-20`) — the triage's own comment (`20260611110000…:19-20`) says public buckets serve reads by URL. Re-scope its `WITH CHECK (true)` authenticated UPDATE/DELETE (`:26-30`). Codify the out-of-band anon-SELECT drops as migrations (F-05).

**Effort M · Risk high · Order 2.** **ESCALATION GATE:** non-additive migration on tenancy and auth-adjacent policies. Two preconditions before merge: (a) count `storage.objects` rows whose `owner` is null — service-role uploads — because any owner-or-Admin predicate makes those Admin-only; (b) exercise every client-side delete site in staging (`useSubsectionDetail.ts:707,857,880`, `documentMutations.ts:72-128`, `poolUpload.ts:31`, `uploadCocFiles.ts:57`). Bucket privatisation is still excluded: it forces signed URLs across nine copy-pasted call sites (F-66) and is its own track. Each of the four drops is independently revertable.

---

### P-B03 — Stop the three paths that rewrite or delete evidence nobody asked them to touch

**Addresses:** F-02, F-01 (pool-upload leg), F-74, F-43

**What changes and why:** Delete `supabase/functions/fix-inspection-photos` and `fix-tenant-images` with their `config.toml:49,36` blocks: they rewrite `inspections.json_data` by blind first-image substitution (`fix-inspection-photos/index.ts:95-100`) and write in dryRun too (`:246-253`). `GAPS.md:36` records both already deleted from prod, zero callers, 404 verified — source hygiene, not an outage. Call the existing 50MB/extension `validate()` (`uploadCocFiles.ts:5-10`) from `poolUpload.ts:22`, which today accepts any file into the public documents bucket and persists its public URL (`:24`). Add the missing `asset_category` predicate at `AssetVerification.tsx:273`, where "Clear All" deletes every `site_assets` row. Repoint the three `permanent` redirects to the deleted `/feedback-management` (`next.config.mjs:129-131`) and close the `Bearer ${CRON_SECRET}` fail-open (`api/snapshots/capture/route.ts:37`).

**Effort M · Risk med · Order 3.** **ESCALATION GATE:** two categories. Removing code a scheduled job might call — `GAPS.md:36` is the evidence the two functions are already 404 in prod; re-confirm before deleting, and keep the deletion in its own revert-able commit. And the `Clear All` predicate change alters a data-deletion flow — pair it with a row count in the confirmation dialog so the operator sees what the scoped delete will actually remove.

---

### P-B04 — No success toast without a checked result

**Addresses:** F-17, F-19 (fall-through half), F-22, F-76

**What changes and why:** Scope is a closed list of seven files — the COC ingestion chain and the artefacts it feeds — not the repo. supabase-js resolves rather than throws, so `{ data }`-only destructuring turns a failed write into success. Add `.throwOnError()` in `useSiteCocImport.ts:59-142` (two unchecked deletes of the previous register, then an unconditional success toast at :141), `assignPoolFile.ts:17-65`, `reassignPool.ts:11-34`, `useSiteCoc.ts:38-62`, `SiteSummaryReport.tsx:232-284`. Delete the catch-and-fall-through-to-offline branches in `useOfflineInspections.ts:44-47` and `useOfflineSubsections.ts:119-121` so an RLS rejection surfaces instead of toasting "saved offline". Excluded and named: `Dashboard.tsx`, `QRActivity.tsx`, `Settings.tsx`, `SiteEditDialog.tsx`, `ClientDetail.tsx`, `DocumentHistoryDialog.tsx` — branding and count surfaces feeding no compliance artefact.

**Effort M · Risk med · Order 4** (independent of P-B05). Blast radius: previously hidden failures become visible in one release — expect a support spike; that is the deliverable, not a regression. One file per commit, so each surfaced failure is attributable. **ESCALATION GATE:** the F-76 fix touches the logout path — `ContractorPortalLayout.tsx:76-79` toasts "Logged out successfully" and navigates regardless of `signOut`'s result. Ship it as *report the error and still navigate*; never as a branch that can strand a user signed in.

---

### P-B05 — One durable offline queue: dead-letter it, make drains idempotent, reconcile server ids

**Addresses:** F-18, F-19 (discard half), F-83, F-84, F-85, F-20, F-21, F-81

**What changes and why:** `useOfflineSync.ts:442-451` deletes a mutation *and its photo blob* after `MAX_RETRIES = 3` (:17) behind a transient toast. Replace with a `dead_letter` IndexedDB store keeping payload and blob, surfaced as a persistent "N items failed to sync". Client-mint a uuid per mutation and upsert on it for `UPLOAD_DOCUMENT` (:160-183) and `ADD_FLOOR_PLAN_PIN` (:233-255), which plain-insert then bookkeep. Capture the server id with `.select('id').single()` and rewrite queued mutations still naming `offline_pin_*` (`useOfflineFloorPlanAnnotations.ts:44`). Check the `DELETE_FLOOR_PLAN_PIN` result (:284-289). Carry the image id in `UPLOAD_IMAGE` (`useOfflineInspections.ts:153`) so `markImageSynced` stops flagging an arbitrary row (:137-141). Add pin-move's missing offline branch (`InteractiveFloorPlan.tsx:224-238`, which toasts "Pin moved successfully" regardless).

**Effort L · Risk med · Order 5** (after P-B04). **ESCALATION GATE:** client-supplied ids change the insert contract and need additive unique indexes; queues already resident on field devices need a one-time upgrade path or they re-drain under the old shape. Also removing code that looks dead: the `ADD/DELETE_MARKUP` and `_MEASUREMENT` executor cases (`useOfflineSync.ts:293-317`) plus their inverted `synced: !isOnline` writers. Grep outside `src/` hits only `docs/system-reference/06-flows/offline-sync.md:118,148-149` — no `config.toml` entry, no edge function, no cron — and F-81's own verification records zero callers. Cross-tab lease (replacing `let isDraining`, :21-24) ships behind a flag.

---

### P-B06 — Fix the six inputs that make the compliance answer wrong

**Addresses:** F-25, F-24, F-58, F-48, F-26, F-67

**What changes and why:** `useSubsectionDetail.ts:133` selects `category_id` while `OverviewTab.tsx:68-70` filters on `d.category`, so `cocDocs` is always `[]` and every COC-required subsection reads missing — select the category name. `recompute_subsection_installation_status` matches `sn.status in ('open','in_progress')` (`20260615140000…:44`) against a title-case CHECK (`20260611150000…:25-26`), so open snags never demote installation status. `publicVerdict.ts:34` tests `days < EXPIRY_HINT_DAYS` (:22 = 30), true for negatives, so an expired Pass prints headline "Compliant" (:35). `cocReportModel.ts:111` counts pending as clear; `complianceCalculations.ts:91-101` can exceed 100%. `normalize.ts:26` shifts imported issue dates a day early. `InspectionDetail.tsx:2218` passes `clientName={siteData?.siteName}`.

**Effort M · Risk med · Order 6.** **ESCALATION GATE:** the recompute fix rewrites stored `installation_status` and compliance across the live register on first trigger — run it as a counted dry-run query first and record before/after totals for sign-off. Each of the six is a separate commit and independently revertable; the four client-side ones need no migration at all.

---

### P-B07 — One snag/COC vocabulary, imported rather than copied

**Addresses:** F-46, F-63, F-49, F-23 (casing leg), F-108

**What changes and why:** `siteHealth.ts:42-43` documents in a comment that prod carries mixed casing, and `isSnagResolved` (:41-46) handles it — yet `:54` (`snag.status === 'Open'`) and `siteDeliverables.ts:160` do exact-case blocking checks. Export the case-insensitive predicates and make those two call them. Replace the three divergent public-view classifiers with imports: `PublicSiteReview.tsx:221` misses lowercase `closed`; `PublicSubsectionReview.tsx:252-260` normalises while `:552` demands exact `rectified`, so one snag reads resolved on one page and open on another. Lowercase the risk-palette lookup (`pdfSubsectionRenderer.ts:284` vs `subsectionCardSpec.ts:78-82`). Re-tighten `subsections.coc_status`, which `20260611161000…:10-19` instructs and `20260727101000…:84-87` wrongly claims is done. This deletes copies of an existing helper; it invents no abstraction.

**Effort M · Risk med · Order 7** — after P-B06, so verdicts are correct before they are unified. **ESCALATION GATE:** the CHECK re-tightening is a non-additive migration that will reject legacy rows — gate it on a counted audit of live `coc_status` values and ship the backfill in the same migration file.

---

### P-B08 — Controls that report success and enforce nothing; links that resolve to nothing

**Addresses:** F-16, F-13, F-30, F-29, F-100, F-101

**What changes and why:** Two are security theatre. `UserRLSPolicies.tsx:137-150` inserts GRANT/DENY rows carrying free-text SQL conditions and toasts success (:154), yet the sole migration (`20251120061340…:2-34`) only creates the table — delete the panel (`Users.tsx:1114`) rather than build an enforcer. `requires_password_change` lives in self-writable user_metadata: `Login.tsx:107-111` merely navigates once the session exists, `ProtectedRoute.tsx:8-27` never reads it, `ResetPassword.tsx:80` self-clears it. Enforce it server-side or stop advertising it. `/profile` is admin-only (`ProtectedRoute.tsx:19-20`) yet both portals link it (`ClientPortalLayout.tsx:173`, `ContractorPortalLayout.tsx:159`) and it is the only password UI. Then the inert: `SiteDetail.tsx:540` writes four columns absent from `types.ts:2262-2280`, so Edit Site always fails; `SubsectionDetail.tsx:106` has no `onClick`; `OverviewTab.tsx:421-423` hardcodes "Completed"; `pdfEngine.ts:793-796` hardcodes compliance flags true; `TemplateValidator.tsx:139` and `SiteDetail.tsx:685,711,832` build URLs that 404.

**Effort M · Risk med · Order 8** — parallelisable from Order 4; each item is a separate commit and none share state. **ESCALATION GATE:** F-13 is an auth-flow change. Server-side enforcement can lock out any account whose metadata is already stale, so count affected users first, and never ship it before the F-30 fix lands — until Client and Contractor can reach a password-change screen, enforcing the flag traps them. Deleting the RLS-override panel removes a visible admin feature: confirm no compliance narrative claims it works.

---

## CHANGE LOG

- **Added P-B02 (new).** Round 1 left blocker F-03 out of every Addresses line and claimed only the pool-validation leg of F-01. Both describe a signed-in user reaching another tenant's evidence, which my own priority rule ranks above everything except data loss — the omission was inconsistent, not deliberate. The new item also picks up F-01's never-dropped anon `storage.objects` SELECT and the `WITH CHECK (true)` authenticated write/delete, and codifies F-05's out-of-band anon-read lockdown so a clean apply cannot reopen it. Bucket privatisation stays excluded, unchanged.
- **Added F-16 and F-13 to P-B08.** Both are controls that report success and enforce nothing — literally my stated thesis, applied in round 1 only to buttons and links, not to the security surface. F-13 also explains why F-30 must ship first, so the two now sit in one dependency-correct item.
- **Added an argued exclusion.** F-08, F-09, F-11, F-12, F-14, F-15 are now named in the preamble and declined with a reason (they leak or relay; they do not make the app state a falsehood to an inspector or a client) rather than passed over in silence.
- **Modified P-B04 (was P-B02).** "Worst-first" is gone. The scope is now a closed list of seven files, plus a named list of six files deliberately excluded. An escalation gate was added: the F-76 fix touches the logout path.
- **Merged round-1 P-B04 into P-B05.** Pins and the queue are one subsystem sharing one durability contract, and the pin work already depended on the queue's idempotency keys. Merging removes an artificial dependency edge and frees a slot for P-B02.
- **Modified P-B05's gate.** The markup/measurement executor deletion was argued in round 1 from "no UI caller" inside `src/` only. It is now grounded outside `src/`: the sole non-`src` references are `docs/system-reference/06-flows/offline-sync.md:118,148-149`; there is no `config.toml` entry, edge function or cron, and F-81's own verification records zero callers.
- **Moved F-74 from the round-1 grab-bag into P-B03.** It is a data-deletion flow and belongs under a med-risk item with an explicit gate, not inside an eight-finding item rated low.
- **Dropped F-102 and F-119.** Real, but nobody believes anything false because of them; cutting them shrinks the grab-bag the round-1 P-B08 had become. F-27 also dropped — its "arbitrary latest inspection" leg is better handled once P-B06 makes the verdict inputs correct.
- **Corrected two loose anchors.** `siteHealth.ts` — the comment is at :42-43 and the exact-case blocking check at :54, not :41-42/:53-54. `publicVerdict.ts` — the test is `days < EXPIRY_HINT_DAYS` at :34 with the constant at :22, not the paraphrased `days < 30`.
- **Declared order now matches document order.** Round 1 printed the Order-1 item fifth.
