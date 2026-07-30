# Round 1 — Agent B

## Strategy

This app's only product is a true statement: *"your evidence is saved"* and *"this subsection is compliant."* It currently makes both when neither holds. An inspector's write can fail and still toast success (F-17, F-19). A day of offline capture is deleted by a scheduled logout (F-07). A subsection with certificates on file renders as missing because the verdict function receives an empty array (F-25). An expired certificate reads **"Compliant"** on the public QR card the client scans (F-58). Alongside these sit controls that do nothing (F-29, F-30, F-101), training users to distrust the ones that work.

I rank strictly by *what does the inspector or the certificate holder wrongly believe?* Security work earns priority only where it corrupts or exposes the evidence record itself. Everything else waits.

---

### P-B01 — Stop the two functions that silently rewrite evidence; close the share-token leak

**Addresses:** F-02, F-04, F-01 (partial), F-43

**What changes and why:** Delete `supabase/functions/fix-inspection-photos` and `fix-tenant-images` plus their `supabase/config.toml:49-50,36-37` blocks. They rewrite `inspections.json_data` using blind first-image substitution (`fix-inspection-photos/index.ts:95-100`) and write even in dryRun (`:246-253`) — corruption of the evidence record itself. `docs/system-reference/GAPS.md:36` records both already 404 in prod with zero callers, so this is source hygiene, not an outage. Replace `client_access_links`' `FOR SELECT USING (true)` (`20260123052614…sql:9-12`) with an Admin-only policy; the QR portal is unaffected because the portfolio RPCs are SECURITY DEFINER (`20260610113000_public_rpcs_phase1.sql:11,23,54`) and the only app reader is `AccessLinkGenerator.tsx:101`. Call the existing `validate()` (`uploadCocFiles.ts:5-10`) from `poolUpload.ts:22-27`.

**Effort M · Risk med · Order 2** (after P-B05). **ESCALATION GATE:** removing code that may be invoked by an ops job — confirm the prod 404 before deleting; non-additive RLS policy drop. Bucket privatisation (rest of F-01) is deliberately excluded: it forces signed URLs across nine copy-pasted call sites (F-66) and is its own track.

---

### P-B02 — No success toast without a checked result

**Addresses:** F-17, F-19 (fall-through half), F-22, F-76, F-67

**What changes and why:** supabase-js resolves instead of throwing, so `{ data }`-only destructuring turns failed writes into success. Apply `.throwOnError()` to mutations and to reads feeding a compliance artefact, worst-first: `useSiteCocImport.ts:86-142` deletes the previous COC register with two unchecked deletes, re-links unchecked, then toasts success unconditionally; `SiteSummaryReport.tsx:232-284` builds a saveable compliance PDF from `.data || []` with only `:230` checked. Delete the catch-and-fall-through-to-offline branches (`useOfflineInspections.ts:44-47`, `useOfflineSubsections.ts:119-121`) so an RLS rejection surfaces instead of toasting "saved offline". Fix `InspectionDetail.tsx:2218` passing `siteName` into `clientName`.

**Effort M · Risk med · Order 3** (independent of P-B03). Blast radius: previously-hidden failures become visible in one release — expect a support spike; that is the deliverable, not a regression. Roll out per-file, not repo-wide, so each surfaced failure is attributable.

---

### P-B03 — Dead-letter the offline queue; make drains idempotent and cross-tab safe

**Addresses:** F-18, F-19 (discard half), F-83, F-84, F-85

**What changes and why:** `useOfflineSync.ts:442-451` deletes a mutation *and its photo blob* after `MAX_RETRIES = 3` (`:17`) behind a transient toast — the write the user was told was saved is destroyed. Replace that branch with a `dead_letter` IndexedDB store that retains payload and blob, surfaced as a persistent "N items failed to sync" banner. Give each mutation a client-minted uuid and upsert on it for `UPLOAD_DOCUMENT` (`:160-183`) and `ADD_FLOOR_PLAN_PIN` (`:233-255`), which today plain-insert then bookkeep, duplicating rows on retry. Check the `DELETE_FLOOR_PLAN_PIN` result (`:284-289`). Carry the image id in `UPLOAD_IMAGE` (`useOfflineInspections.ts:153`) so `markImageSynced` stops flagging an arbitrary record (`:137-141`).

**Effort L · Risk med · Order 4** (after P-B02). **ESCALATION GATE:** additive unique indexes plus client-supplied ids change the insert contract; queues already resident on field devices need a one-time upgrade path or they will re-drain under the old shape. Cross-tab lease (replacing the module-scope flag at `:21-24`) ships behind a flag.

---

### P-B04 — Make floor-plan pins survive the round trip

**Addresses:** F-20, F-21, F-81

**What changes and why:** `ADD_FLOOR_PLAN_PIN` inserts without capturing the server id (`useOfflineSync.ts:233-255`), so queued edits to offline-created pins target `offline_pin_*` (`useOfflineFloorPlanAnnotations.ts:44`) and evaporate. Add `.select('id').single()` and rewrite queued mutations referencing the local id before execution. Add the missing offline branch to move-mode: `InteractiveFloorPlan.tsx:224-234` writes only when online yet toasts "Pin moved successfully" unconditionally at `:236-238`. Key undo timers per pin and clear on unmount (`:327-329`, `:113-118`). Give the footer-less type step a cancel that removes the row inserted at `:253`. Delete the no-op markup/measurement executor cases (`useOfflineSync.ts:293-317`) and their inverted `synced: !isOnline` writers — they have no UI caller, so remove the false promise rather than build a backend.

**Effort M · Risk med · Order 5** — depends on P-B03's idempotency keys.

---

### P-B05 — Never clear caches while unsynced work is pending

**Addresses:** F-07

**What changes and why:** `SessionWatcher.tsx:54` calls `clearAllCaches()` unconditionally inside `performLogout`, before `signOut`. `cacheUtils.ts:41-44` deletes `wm_compliance_offline` (unsynced inspections, queued photo blobs) and `:6,71-78` removes every localStorage key except `supabase.auth.token` — a supabase-js **v1** name, while `package.json:48` pins `^2.75.0` — taking `offline_mutation_queue` with it. Change: attempt a drain, then count unsynced records and queue length; if non-zero, abort the auto-logout and show a blocking "N items not yet synced" prompt. Fix the DB list (drop the phantom `wm_floor_plan_offline`, add `wm-download-handoff`, `downloadHandoff.ts:17`) and `PRESERVED_KEYS`.

**Effort S · Risk low · Order 1 — ship first.** Cheapest possible prevention of the only data-loss finding in the set. **ESCALATION GATE:** modifies the logout flow; a device that cannot sync now stays signed in past the configured minute. That trade needs an explicit owner decision, and the DB default is already `false`, so blast radius today is small.

---

### P-B06 — Fix the five inputs that make the compliance answer wrong

**Addresses:** F-25, F-24, F-58, F-48, F-26

**What changes and why:** Each is a small, isolated defect producing a confidently false verdict. `useSubsectionDetail.ts:133` selects `category_id` while `OverviewTab.tsx:68-70` filters on `d.category`, so `cocDocs` is always `[]` and every COC-required subsection reads missing — join the category name. `recompute_subsection_installation_status` matches `status in ('open','in_progress')` (`20260615140000…sql:44`) against a title-case CHECK (`20260611150000…sql:25-26`), so open snags never demote. `publicVerdict.ts:31-38` uses `days < 30`, true for negatives, printing "Compliant" for an expired Pass. `cocReportModel.ts:111` counts pending as clear; `complianceCalculations.ts:91-101` can exceed 100%. `normalize.ts:26` shifts imported issue dates a day early.

**Effort M · Risk med · Order 6.** **ESCALATION GATE:** the recompute fix changes stored `installation_status`/compliance across the live register on first trigger — run it as a counted dry-run query first and record before/after totals. Each of the five is independently revertable.

---

### P-B07 — One snag/COC vocabulary, imported rather than copied

**Addresses:** F-46, F-63, F-49, F-23 (casing leg), F-108

**What changes and why:** `siteHealth.ts:41-42` already documents that prod carries mixed casing, yet `:53-54` and `siteDeliverables.ts:160` do exact-case blocking checks two lines away. Export the case-insensitive predicates and make those two call them. Replace the three divergent public-view classifiers with imports — `PublicSiteReview.tsx:221` misses lowercase `closed`, `PublicSubsectionReview.tsx:252-260` normalises while `:552` demands exact `rectified`, so one snag reads resolved and open on one page. Lowercase the risk-palette lookup (`pdfSubsectionRenderer.ts:284` vs `subsectionCardSpec.ts:78-82`). Re-tighten `subsections.coc_status`, which `20260611161000…sql:10-19` instructs and `20260727101000…sql:84-87` wrongly claims is done. This deletes copies of an existing helper; it invents no abstraction.

**Effort M · Risk med · Order 7** — after P-B06 so verdicts are correct before they are unified. **ESCALATION GATE:** the CHECK re-tightening is a non-additive migration that will reject legacy rows — gate it on a counted audit of live values and ship the backfill in the same migration.

---

### P-B08 — Remove or wire every reachable control that does nothing

**Addresses:** F-29, F-30, F-100, F-101, F-102, F-74, F-27, F-119

**What changes and why:** Dead controls are cheap individually and corrosive collectively. `/profile` sits only in `(admin)` (`profile/page.tsx:2-3`) whose guard bounces Contractor and Client (`ProtectedRoute.tsx:19-20`) while both portal menus link to it (`ClientPortalLayout.tsx:173`, `ContractorPortalLayout.tsx:159`) — and it is the only password-change UI. Drop the four phantom columns from the sites update (`SiteDetail.tsx:81-82,540` vs `types.ts:2262-2280`). Fallback `clientId` to stop `/clients/undefined` (`:685,711,832`). Correct `TemplateValidator.tsx:139`'s route shape. Delete the `onClick`-less Export Reports button (`SubsectionDetail.tsx:106`), the hardcoded "Completed" badge (`OverviewTab.tsx:421-423`), and `pdfEngine.ts:793-796`'s all-true compliance flags. Add the missing `asset_category` predicate at `AssetVerification.tsx:273`, which deletes more than its dialog promises.

**Effort M · Risk low · Order 8 — parallelisable with P-B02 onward.** Each item is a separate commit; none share state. `F-102`'s unreachable routes get a link or a delete, not a redirect. **ESCALATION GATE:** the `Clear All` predicate change alters a deletion flow — pair it with a row-count confirmation in the dialog.
