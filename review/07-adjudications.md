# 07 — Adjudications (P-18)

- Date: 2026-07-30 · **Both RESOLVED.** These unblock R-05, R-06, R-07 and R-14, and were required before Batch 2 could run parallel sessions.
- Neither reverses a locked item. P-18(a) corrects source prose the locked Owns column already contradicted; P-18(b) changes *where* one artifact is created, not what it is.

---

## P-18(a) — Who owns the offline fall-through branches?

**Decision. R-05 owns `useOfflineInspections.ts` and `useOfflineSubsections.ts` in full. R-06 releases them entirely — no line of either goes to R-06.** R-06's "closed list of seven files" becomes five: `useSiteCocImport.ts`, `assignPoolFile.ts`, `reassignPool.ts`, `useSiteCoc.ts`, `SiteSummaryReport.tsx` (plus its unchanged F-76 files). The two halves are not separable; there is no split to write down.

**Why.** Three independent reasons, any one sufficient:

1. **R-06 owns no finding that reaches these files.** Its claim exists only in its source prose (`agent-B.md:43,45`). F-17's entire evidence block (`03-findings.md:333-339`) never cites either hook, and the locked Owns column gives all of F-19 to R-05.
2. **The cited lines are a sample, not the defect.** The identical catch sits at `useOfflineInspections.ts:75-77, 96-98, 137-139`, `useOfflineSubsections.ts:45-47, 186-188`, and `useOfflineFloorPlanAnnotations.ts:64-66, 180-182` — a third hook R-06 never names but R-05 already owns. Splitting on the two named lines would scatter one pattern across two parallel sessions.
3. **The fix is queue semantics, not error surfacing.** `getOnline()` returns `navigator.onLine` (`onlineStatus.ts:5-8`), which is **true on a captive portal**. Deleting the branch as R-06's source prescribes destroys work in exactly the field condition the queue exists for. What is actually needed is a terminal-vs-transient classifier — the same predicate the dead-letter store needs at `useOfflineSync.ts:442-451`, where a terminal RLS rejection currently burns three retries it can never win before the payload and its photo blob are deleted.

They are also physically inseparable: `updateInspection` is one 20-line function (`:64-83`) whose catch is at `:75-77` and whose F-85 tail is four lines below at `:80-83`.

**Consequences.**
- **R-05** grows to own the enqueue side of all three offline hooks, and must build the classifier as one shared module called from *both* sides — refuse to queue a terminal rejection at enqueue, dead-letter it immediately at drain rather than after three retries. Internal order: drain-side dead-letter contract first, enqueue-side toast rewrite second, so the new toast has a true statement to make.
- **R-05** must note that the toast defect has two shapes: `useOfflineInspections.ts:60` follows a real local save, but `:82` and `:103` follow nothing local at all — those are false outright and must not merely be reworded.
- **R-05** must author the first tests for these two hooks; neither has any today.
- **R-06** deletes both files from scope and must not author any error classifier or queue branch. Its remaining mandate is `.throwOnError()` on unchecked calls in chains with no offline path.
- **Batch 2** stays parallel — this split is what makes the file sets genuinely disjoint.

---

## P-18(b) — Which item defines the staff predicate?

**Decision. R-07 creates `public.is_staff(uuid)` as a database function, in the same migration as the 36 policy changes, and every policy it writes calls it.** It ships the affirmative allowlist body (`Admin | User | Moderator`), not a provisional NOT-based one. F-111 stays owned by R-14, which closes it by retiring the two surviving inline predicates, shipping the role-less backfill, and inverting the client guard. R-14's locked text needs one word changed: it *adopts* `is_staff()` rather than creating it.

**Why.** The three definitions differ on exactly two principals:

| Definition | Admin/User/Moderator | Contractor | No role row |
| --- | --- | --- | --- |
| `20260610120000:39-48` (NOT-both) | admit | deny | **admit** |
| `20260623120000:3-4` (NOT-Client) | admit | **admit** | **admit** |
| `20260708090000:10-11` (allowlist) | admit | deny | deny |

`has_role` is an `EXISTS` (`20251014120311:17-30`), so `NOT has_role(...)` is true for a user with zero rows — the fail-open the 2026-07-08 comment names.

**R-07 cannot avoid authoring a predicate.** Replaying every policy change across the 184 migrations in order: of the 36, **17 are pure drops** (the anon `USING(true)` set, `client_access_links`, `access_link_visitors`, and four with correct policies surviving underneath), **4 embed staff as one disjunct** (`coc_file_pool`), and **15 require a staff predicate outright**. Critically, **9 of those tables would be left with zero policies** — `inspection_subsections`, `qr_codes`, `site_document_categories`, `site_marking_checklist`, `coc_compliance_photos`, `offline_photos`, `inspection_items`, `inspection_signatures`, `floor_plan_pin_comments`. RLS-enabled with no policy is deny-all: **the admin app stops.** These are hard blockers, not preferences. R-07 writes a staff predicate 19 times or it does not ship.

Inlining is the disease itself: `20260610120000:27` reads "Reusable staff predicate is inlined per policy (Postgres has no macro for this)" — the proximate cause of F-111. Repeating it 19 more times institutionalises the drift.

The fail-closed risk of shipping the allowlist early is already retired: **P-10 measures the role-less population before Batch 1**, and that population is legacy-bounded — role assignment landed at `20251020093607:19-27`, six days after the first `handle_new_user`, and `invite-user` updates the single row rather than adding one.

**A sharper problem this exposes:** because `handle_new_user` defaults every signup to `'User'` (`20260214023114:21-27`), *all three* definitions treat every self-registered account as staff. Choosing the allowlist does not fix that — R-14's guard inversion does.

**Consequences.**
- **R-07** adds `CREATE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public` — one `EXISTS` over `user_roles` with `role IN ('Admin','User','Moderator')`, not three `has_role` calls (RLS predicates run per row). Uses it in all 19 policies.
- **R-07** ships the role-less backfill *here*, not in R-14; the "same migration" rule moves with it. P-10's result becomes an R-07 gate.
- **R-07** must express the 2026-06-23 COC reads as `is_staff() OR <contractor assigned-site>`, **not** `NOT Client` — that leg was never a staff definition but a mis-named tenancy rule, and folding it into `is_staff()` would wrongly promote Contractors.
- **R-07's** down file must drop the function as well as re-create the 36 policies.
- **R-14** shrinks to: swap the two surviving inline predicates to `is_staff()`, invert `ProtectedRoute.tsx:19-20`, add `src/middleware.ts`, enforce `requires_password_change`, delete `UserRLSPolicies.tsx:137-170`. Keeps F-111 ownership and its closeout evidence (zero remaining NOT-based staff predicates). Sizing holds at M/med — without this split it becomes a second L/high item alone on the critical path.

**Rejected alternative — provisional predicates now, rewritten by R-14.** Nineteen policy bodies written twice; a second non-additive migration with a mirrored down file; a second clean-DB → branch-DB → prod apply; a second staging exercise of the contractor COC panel; a second `types.ts` regeneration. And between Batch 3 and Batch 5 the codebase would carry **four** staff definitions instead of three, with R-19's characterisation tests pinning the provisional one. The execution plan already forbade this in prose ("R-07 must precede R-14 so the staff predicate is defined once"); this adjudication makes it binding.

---

## New hazard raised by P-18(b)

**Nine tables would be left with zero policies if R-07 drops without replacing.** RLS-enabled with no policy denies everything, so a drop-only migration stops the admin application. Five of the nine lost their Admin policies in the very migration that created the blanket (`20260406131029:4-7,17-20,…`), so the blanket is currently their *only* policy. R-07's staging apply must assert a non-empty policy set per affected table before promotion — this is now an entry condition on Batch 3, not a review comment.
