# 06 — Execution Plan

- Date: 2026-07-30 · Derived from `04-proposals.md` (20 locked items), `03-findings.md` (135 findings), and a dependency/backlog analysis.
- **Scope of "up to date":** all 135 findings. 74 are owned by locked items, 1 rides along, 58 need backlog packages, 2 are droppable. Arithmetic verified: 74 + 1 + 58 + 2 = 135.
- **Done:** R-15, R-17, R-18, R-19 (branch `review/ungated-fixes`, uncommitted). **Remaining:** 16 locked items + 12 backlog packages.

---

## A. The blocking prerequisites

Nothing in Batch 1 can start until these are answered. Most are not code — they are facts only production can supply, or decisions only you can make.

### A1. One production read session unblocks almost everything

Ten of the nineteen prerequisites are read-only queries against production. **They can be done in a single sitting**, and until they are, six of the sixteen items cannot even be *written* correctly.

| # | Query | Unblocks | Why it cannot come from the repo |
| --- | --- | --- | --- |
| P-01 | `pg_policies` dump over `schemaname IN ('public','storage')`, **all** cmds, with `qual` and `with_check` text | R-07, R-08 | The tier-2 script's `public`-only/`SELECT`-only filter is exactly what left F-01 live. Reusing that filter repeats the error. |
| P-02 | `\d` + `pg_get_functiondef` for F-31's eight prod-only objects (`subsections/snags/inspections.deleted_at`, `snags.snag_type`, `classify_field_status`, `get_compliance_setting_numeric/bool`, `trg_recompute_from_template`) | R-03, R-16 | They exist only in prod. Guessing a column type deepens the divergence and every later item then verifies against a wrong baseline. |
| P-04 | `supabase functions list` | R-01, R-09 | Seven `*.PULLED-FROM-PROD.ts` files prove prod runs functions the repo lacks. R-09 cannot equate "every handler" with "every tracked directory". |
| P-07 | Count `storage.objects` where `owner IS NULL` | R-08, R-07 | Service-role uploads have no owner; any owner-or-Admin predicate makes them Admin-only. |
| P-08 | Count `qr_codes` rows whose `qr_code_url` is not the `?path=`/`?site=` shape | R-10 | That is the exact population that stops resolving when the `.ilike` fallback is deleted. |
| P-09 | `subsections.coc_status` and `snags.status` grouped with counts | R-16 | The CHECK re-tightening is non-additive; §6 requires the count and backfill in the same migration. |
| P-10 | Count users with `requires_password_change=true`, and staff with no `user_roles` row | R-14 | Enforcement locks out anyone already stale; positive-allow drops anyone role-less until the backfill promotes them. |
| P-11 | Count duplicate `user_roles` rows per `user_id` | R-12 | `UNIQUE(user_id)` is non-additive against existing duplicates; the table is `UNIQUE(user_id, role)` today. |
| P-12 | Count rows in `public.temp_import` | R-04 | It received staff PII and was never dropped. Dropping a table that may hold the only copy is unrecoverable. |
| P-15 | Inventory of active `api_clients` rows | R-11 | Phase 2 (dropping plaintext) cannot be scheduled without knowing who must re-provision. |

### A2. Provisioning and access

| # | What | Unblocks |
| --- | --- | --- |
| P-05 | Provision `CRON_SECRET` in Vercel Production and verify one manual `/api/snapshots/capture` returns 200 | R-01 — **must be true before R-01 ships or the 02:00 cron starts 401ing** |
| P-14 | A staging or Supabase-branch database | R-07, R-08, R-11, R-12, R-14, R-16 — R-07's apply path is clean DB → branch DB → prod, and every client-side delete site must be exercised there |

### A3. Decisions only you can make

| # | Decision |
| --- | --- |
| P-13 | Authority to rotate the credential at `20260212144831:12,19` — a live password reset on a named individual, needing their cooperation — plus whether to scrub git history. Deleting the files leaves both in history; **rotation is the only real control**. |
| P-16 | R-02's trade-off: blocking logout on unsynced work means a device that cannot sync stays signed in past the configured auto-logout minute. |
| P-19 | Per-item escalation-gate sign-off (`04-proposals.md` §6). All 16 remaining items carry one; locking the plan cleared none. This is a dependency on every batch, not a one-off. |

### A4. Engineer tasks, doable now from the repo

| # | What | Unblocks |
| --- | --- | --- |
| P-03 | Live probe of the two repair-function URLs (only the prod functions hostname is needed; `fix-inspection-photos` is `verify_jwt=false`) | R-01 |
| P-06 | Establish `DOCBUILDER_*` state: `supabase secrets list`; `templates/index.ts:348` is a live oracle — an unauthenticated GET 503s iff the token is unset | R-09 |
| P-17 | **Add the database and Deno CI jobs R-18 did not ship** (see §E) | R-03, R-07, R-08, R-12 |
| P-18 | ~~Two written adjudications~~ — **RESOLVED 2026-07-30, see `07-adjudications.md`.** (a) R-05 owns both offline hooks in full; R-06 drops to five files. (b) R-07 creates `public.is_staff()` in the same migration as the 36 policy changes; R-14 adopts rather than creates it and shrinks to M/med | R-05, R-06, R-07, R-14 — **unblocked** |

---

## B. Execution batches

Items inside a batch have disjoint file sets and may be authored in parallel. **Production application is always serial**, with the offline-drain and delete-site fixtures re-run after each.

| Batch | Items | Entry conditions |
| --- | --- | --- |
| **1** | R-01, R-02, R-03, R-04 | P-03/P-04/P-05 (R-01) · P-16 (R-02) · P-02 (R-03) · P-12/P-13 (R-04) · P-18's down-convention note · 4 gates signed |
| **2** | R-05, R-06 | Batch 1 merged · P-18's R-05/R-06 file split written down · R-02's logout guard live so no auto-logout wipes the queue mid-rebuild · 2 gates |
| **3** | R-07, R-08, R-09, R-12 | R-03 and R-05 merged · P-01, P-07, P-14, P-17 · P-06 + R-01 merged (R-09) · P-11 (R-12) · staff-predicate call settled · 4 gates |
| **4** | R-10, R-11, R-13, R-16 | R-09 merged (R-10 and R-11 both rewrite files it touches) · R-12 merged (D4) · R-03 + R-06 merged (R-16) · P-08, P-15, P-09 · 4 gates |
| **5** | R-14 *(alone)* | R-13 merged (D4) · R-05 merged (D1) · R-07 merged (one settled staff predicate) · P-10 · gate + same-migration backfill |
| **6** | R-20 *(alone, last)* | R-13, R-14, R-11, R-05 merged · **view-level test coverage added first** (see §E) · gate |

**Critical path:** P-01/P-02 → R-03 → R-05 → R-07 → R-13 → R-14 → R-20. Nothing shortens it: R-03 gates every later migration's clean apply, R-05 must precede R-07 (durability before the boundary moves), R-07 must precede R-14 so the staff predicate is defined once, D4 forces R-12 → R-13 → R-14, and R-20 is last by its own release condition. The two heaviest items, R-05 and R-07, sit consecutively and neither can start earlier. Off the critical path, **R-11 waiting on third-party integrators is the likeliest determinant of total elapsed time.**

---

## C. Backlog packages (58 findings not owned by any locked item)

Ordered by the harm they do, not by severity label. Each is a work package, not a single edit.

| # | Package | Findings | E/R | After |
| --- | --- | --- | --- | --- |
| OP-1 | **Writes that persist the wrong row or object** — raw-vs-normalised cert keys, matching against soft-deleted subsections, colliding batch-move paths, an uncapped anonymous upload | F-47, F-51, F-55, F-62, F-69, F-94 | M / med | R-06, R-08, R-16 |
| OP-2 | **Edge API correctness beyond authorization** — R-09 fixes *who may call*, not *what they do*: `save-template` delete is unreachable when `template.id` is truthy, so **deletes execute as updates that overwrite live template content** | F-45, F-90, F-91, F-92, F-93, F-95, F-127 | L / med | R-01, R-09, R-11 |
| OP-3 | **Audit integrity and edge PII** — the audit trail can be forged with a client-supplied IP and replayed against the next session's user; `report-issue` orphans public uploads on insert failure | F-40, F-41, F-87, F-88, F-97 | M / med | R-08, R-09, R-10 |
| OP-4 | **Guards, onboarding gate and cached identity** — R-14 inverts `ProtectedRoute` only; the unawaited onboarding query and the Admin `?preview=` bypass survive, and query keys omit user identity | F-37, F-38, F-77, F-82 | M / med | R-12, R-13, R-14 |
| OP-5 | **Non-atomic multi-step writes** — R-12's problem class in other tables: `user_sites` reassignment and the subsection cascade are unwrapped delete-then-insert leaving orphaned storage objects | F-61, F-71, F-120 | M / med | R-12 |
| OP-6 | **Report generation correctness** — eight literal-`true` compliance flags in the asset report mirroring the `pdfEngine` ones R-13 fixes, in another file; plus UTC filename stamps and unpkg workers. Homes F-29's residual `workerSrc` leg | F-52, F-53, F-59, F-73, F-75 | M / med | R-13, R-20 |
| OP-7 | **Failure-path resilience** — the read and render paths R-06 excludes: a bare `JSON.parse` that takes the share page down with no segment `error.tsx`, search errors rendered as empty results | F-60, F-64, F-86, F-103, F-119 | M / low | R-06 |
| OP-8 | **Floor-plan pin lifecycle and realtime scope** — homes F-21's residual undo-timer collision and orphan untitled pin | F-78, F-126 | M / med | R-05 |
| OP-9 | **Client runtime cost and leaks** — homes F-23's residual: the Dashboard re-runs the snapshot scan as eight unbounded selects in-browser. Plus the users-page N+1, never-revoked blob URLs, a hidden-tab reload discarding unsaved state | F-54, F-68, F-72, F-122 | M / med | R-05, R-07 |
| OP-10 | **Unwired subsystems and unreachable routes** — Fortress layer, OCR pipeline, dead ui-kit, four stranded deps, a 710-line live-DB harness on an admin route. Homes two F-29 link legs | F-44, F-102, F-104, F-129, F-130, F-131 | L / med | R-04, R-18, R-19, R-20 |
| OP-11 | **Migration-history integrity and the DB verification harness** — homes F-109's residual 14 irreversible CASCADE drops, and F-112, which **still has no owner because R-18's CI shipped without a database job** | F-112, F-124, F-132 | M / med | R-03, R-07, R-08, R-12, R-18 |
| OP-12 | **Build, config, dependency and docs truth** — unmapped design tokens used by four live views, a Vite-era `bun.lock` and README, unused `fabric`/`jspdf`, orphaned Capacitor config, a duplicated polyfill | F-56, F-115, F-117, F-118, F-123, F-125, F-128, F-135 | M / low | R-18 |

**Ride-along (1):** F-74 — the missing `asset_category` predicate on "Clear All" (`AssetVerification.tsx:273` deletes every `site_assets` row for the site while the dialog promises electrical meters only) sits inside R-13's execution scope via its §6 data-deletion gate.

**Droppable (2):** F-116 — prose classes emit no CSS, but the sole consumer is a debug view OP-10 proposes deleting. F-121 — `usePaginatedList`'s stale page state is latent; both current callers pass static base keys, so there is no live defect.

---

## D. Sequencing hazards

The three the review already found are respected by the batch order above and re-verified: policy drops sit behind the dead-letter store (R-05 Batch 2 → R-07 Batch 3); enforcement sits behind the profile-link fix (R-13 Batch 4 → R-14 Batch 5); and the storage predicate must not use a site-id prefix — of the five real upload paths, **only the pool path carries a site id**, and R-08's own source proposal still wrongly proposes that prefix, so the locked constraint overrides it.

Fourteen further hazards were found. The ones that change what you do:

1. **Four items edit `UserRLSPolicies.tsx`** — R-06 (error handling), R-12 (role mutation), R-14 (delete the override sub-panel). Earlier analysis caught three; R-06 is the fourth. Batch order resolves it only if R-06 stays ahead of R-12.
2. **R-09, R-10 and R-11 cannot be parallel** — all three rewrite the same catch-all error handlers in `qr-redirect`, `api-reports` and `template-sync`. Hence R-09 in Batch 3 and the other two in Batch 4.
3. **R-01 and R-09 collide on `config.toml`** — R-01 removes six blocks; R-09 must resolve the missing `send-password-reset` entry.
4. **R-14 and R-05 will turn CI red unless they rewrite the tests R-19 just shipped.** The new characterisation tests deliberately assert *today's* fail-open guard behaviour and today's discard-at-3 queue behaviour — the exact things those items invert. Each must update them in the same commit. This is the intended design, but it must be booked as work.
5. **R-07's `coc_file_pool` re-scope can break the contractor COC upload panel** shipped three commits ago (`be5d524`). A staff-only predicate locks Contractors out; a site-scoped one resolves through `user_sites`, whose blanket policy R-07 drops in the same migration. Exercise both halves together in staging.
6. **`types.ts` was never regenerated**, so the type ratchet can go red on a correct change: R-04 drops `temp_import` while R-11/R-12/R-14/R-16 all add columns. Regeneration must ride in the same commit as each — and it needs a database.
7. **R-02's unsynced-work count stays incomplete until R-05 extends it** to the new dead-letter store. A device holding only dead-lettered work would pass R-02's guard, log out, and lose it — F-07 again in a narrower window. Book the extension inside R-05.
8. **R-20 is authorised by tests that do not cover what it changes.** Its release condition is "once R-18 and R-19 prove what still runs", but no test touches `src/views`, and R-20's `src/lib/data` adoption lands in nine view/hook files. Add view coverage before, not after.
9. **Nine tables would be left with zero policies if R-07 drops without replacing** (raised by the P-18(b) adjudication): `inspection_subsections`, `qr_codes`, `site_document_categories`, `site_marking_checklist`, `coc_compliance_photos`, `offline_photos`, `inspection_items`, `inspection_signatures`, `floor_plan_pin_comments`. RLS-enabled with no policy is deny-all — a drop-only migration stops the admin application. Five of the nine lost their Admin policies in the migration that created the blanket, so the blanket is currently their only policy. **R-07's staging apply must assert a non-empty policy set per affected table before promotion.** Of the 36 policies: 17 are pure drops, 4 embed staff as a disjunct, 15 need a staff predicate outright.

---

## E. Honest gaps in what was already delivered

- **R-18 shipped without its database and Deno jobs.** The item text promised CI jobs for `db reset` + policy assertions + pgTAP + `deno test`. The delivered `.github/workflows/ci.yml` has only `static` and `test`, and states in-file that no database job exists — a defensible call, since the safe path needs a throwaway Postgres and the PII seed must never load, but it means R-12's promise that "R-18 later runs the pgTAP file unchanged" has no runner, and **F-112 remains unowned**. Tracked as P-17 and OP-11.
- **R-19 wrote characterisation tests, not correctness tests** — deliberately, so R-05 and R-14 have proof their inversions did what they claim. The cost is hazard 4 above.
- **R-20's Owns line is broader than its text.** It claims all of F-35 while its text covers only the pdfmake families and `src/lib/data`; the compressor and `workerSrc` legs are undeclared. OP-6 and OP-10 pick them up.

---

## F. The task list

**Now — no code, blocks everything:**
1. Run the ten production read queries in §A1 as one session — **the script is ready at `review/prereq-queries.sql`** (16 bare SELECTs, no DDL/DML, one block per prerequisite, each annotated with what a concerning result looks like). Q3 is a CLI command, not SQL.
2. Provision `CRON_SECRET` (P-05); stand up a staging/branch database (P-14).
3. Decide P-13 (credential rotation authority), P-16 (R-02's logout trade-off).
4. Engineer: probe the two function URLs (P-03), establish `DOCBUILDER_*` state (P-06), add the missing CI database job (P-17, after R-03). ~~Write the two adjudications (P-18)~~ — **done, `07-adjudications.md`**.
5. ~~Commit the completed work on `review/ungated-fixes`~~ — **done**, five intent-named commits.

**Then, in order:** Batch 1 (R-01, R-02, R-03, R-04) → Batch 2 (R-05, R-06) → Batch 3 (R-07, R-08, R-09, R-12) → Batch 4 (R-10, R-11, R-13, R-16) → Batch 5 (R-14) → Batch 6 (R-20), signing each item's gate as its session starts.

**Then the backlog:** OP-1 … OP-12, each behind the items listed in §C. OP-2 is the one to pull forward if capacity allows — a template "delete" that silently overwrites live content is a data-integrity defect hiding in a medium.
