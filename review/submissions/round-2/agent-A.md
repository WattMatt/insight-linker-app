# Round 2 — Agent A

## Strategy

Two facts govern this app. Prod was hand-patched in the SQL editor and the fixes sit in `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:4` — "intentionally OUTSIDE supabase/migrations/ so it is NOT auto-applied". Tracked history is the real posture. The patch was also narrower than believed: it filters `schemaname='public' AND cmd='SELECT' AND qual='true'` (`:24`), so `storage.objects` and every blanket `FOR ALL` policy survived in production too.

New this round: that history cannot be applied at all (F-31), so no boundary here has ever been tested outside prod. Rebuildability comes first; every later fix is a tracked, reversible migration or a handler's first ten lines. Order is by what an unauthenticated request, or one holding any JWT, reaches today.

Abandoned deliberately: F-07 and the correctness/offline block (F-17–F-30, F-32–F-35). They cost data and money, not boundaries — and P-A06 makes forced logout more frequent, not less. I accept that.

---

## P-A01 — Kill the anonymous service-role writers and the fail-open cron guard

**Addresses:** F-02, F-43

**What changes and why**
Delete `supabase/functions/fix-inspection-photos` and `fix-tenant-images` with their registry blocks (`config.toml:36-37,49-50`). Prod already 404s them (`GAPS.md:36`, "DELETED from prod … source kept in repo"), but the surviving entries mean the next `supabase functions deploy` restores an anonymous service-role writer: `index.ts:11` service-role client, `:182-186` unconditional `UPDATE inspections.json_data`, `:246-253` where `dryRun` only swaps in a copy that is written back anyway, `:221` `.limit(100)` on a bare `{}` body. Also delete four phantom registry entries whose directories do not exist (`config.toml:14-15,17-18,26-27,45-46` vs the 17 dirs in `supabase/functions`), and reject unset `CRON_SECRET` at `src/app/api/snapshots/capture/route.ts:37`, which today compares against the literal "Bearer undefined" while gating a service-role, RLS-bypassing upsert.
**Gate / rollback:** removing code a scheduled job might call — zero `src/` callers, and `vercel.json`'s only cron is `/api/snapshots/capture`, which keeps working once `CRON_SECRET` is set. Reversal is `git revert`; no DB change.

**Effort S** · **Risk low** · Order 1. No dependencies; ship first.

---

## P-A02 — Make the tracked tree apply from zero, reversible, and credential-free

**Addresses:** F-31, F-109, F-112, F-10, F-113, F-114

**What changes and why**
Nothing below can be verified outside prod until `supabase db reset` succeeds. A clean apply dies in `20260612120000_coc_compliance_gate.sql:52,65` on `subsections.deleted_at`, which no migration creates; F-31 names eight such objects (three further `deleted_at` columns, `snags.snag_type`, `classify_field_status`, `get_compliance_setting_numeric/bool`, `trg_recompute_from_template`). One migration creates them. Then adopt the repo's own down convention — `supabase/migrations` holds 184 files and exactly two are `.down.sql` (`20260612210000`, `20260612220000`) — for every security migration that follows. Same pass: `DROP temp_import` (created `20251014120224_e944a635…:2`, never dropped, still at `types.ts:2733`), delete `supabase/seeds/fortress_abaqulusi_seed.sql` (`:1` "real data from the 3 workbooks") and `sql-import-scripts.md:8-15` (eight named staff addresses), rotate the credential at `20260212144831:12,19`.
**Gate / rollback:** non-additive (`DROP temp_import`) and an auth flow (credential rotation). Deletion is not the control — git history keeps both files — rotation is. Down file ships with the migration.

**Effort M** · **Risk med** · Order 1, parallel with P-A01. Gates staged verification for P-A03–P-A08.

---

## P-A03 — One tracked migration that drops 36 named permissive policies

**Addresses:** F-03, F-04, F-05, F-106, F-39, F-42

**What changes and why**
Enumerated, not gestured at. `grep -rho "All authenticated users full access to [a-z_]*" supabase/migrations | sort | uniq -c` shows 22 created in `20251120080517` and **8** never dropped — F-03's six names plus `validation_conversations`/`validation_messages`. The same method on `20251120111033`'s nine "Users can manage all …" `FOR ALL` policies leaves **6**. No migration anywhere drops the bare-named 2026-04 policy (`20260406131029:10-102`); F-03's verifier counts **5** live tables. Add F-05's **11** anon `SELECT USING (true)`, "Public can select access_links for validation" (`20260123052614:9-12`) which exposes `access_token`, `coc_file_pool`'s **4** `to authenticated using (true)` (`20260619150000:20-23`), and `access_link_visitors`' anon `INSERT WITH CHECK (true)` (`20260217082506:20-22`). 36 DROPs; anon retains only the SECURITY DEFINER RPCs (`20260727101000:25`).
**Gate / rollback:** non-additive; anon PostgREST reads die. Today a Contractor can `INSERT` a `user_sites` row and reach another tenant. Paired `.down.sql` re-creates all 36 verbatim; apply order is P-A02's clean database → a branch database → prod.

**Effort L** (36 DROPs across 8 source migrations, plus the mirrored down file) · **Risk high** · Order 2. Depends on P-A02.

---

## P-A04 — Authorization preamble in the first ten lines of every edge handler

**Addresses:** F-08, F-11, F-14, F-98, F-96

**What changes and why**
One shared `requireRole(req, roles)`, returning a uniform 401/403 — today `invite-user:693-704` and `delete-user:96-108` answer 400 for a missing JWT while anonymous callers get raw `error.message` (`qr-redirect:227-234`, `api-reports:284-291`). `send-email` gates only on `getUser` (`:33-41`) then forwards `to/cc/bcc` verbatim to SMTP as `GMAIL_USER` (`:87-95`): any Contractor or Client is an authenticated open relay on the company Gmail. Admin-only plus a recipient allowlist; same guard on `offline-review` (`:22-25`) and `batch-compress-images` (`:123-126`), plus a payload cap before `offline-review` posts user content to `ai.gateway.lovable.dev` (`:128`). Make `save-template` (`:15-18`) and `template-sync` (`:12-18`) fail closed with 503, as `templates/index.ts:345-351` already does. Delete `send-password-reset` — zero callers, `generateLink` on unauthenticated input (`:73-79`).
**Gate / rollback:** removes an auth flow; DocBuilder breaks if `DOCBUILDER_*` is unset. Establish that state first — `supabase secrets list` names keys without values, and `templates/index.ts:348` is a live oracle: an unauthenticated GET 503s iff `DOCBUILDER_PUBLIC_TOKEN` is missing. Fail-closed ships either way. Revert is per-function; no DB change.

**Effort M** · **Risk med** · Order 2, parallel with P-A02/P-A03.

---

## P-A05 — Re-privatise `documents`, drop anon storage SELECT, validate at the upload seam

**Addresses:** F-01, F-50, F-66

**What changes and why**
Migration: `UPDATE storage.buckets SET public=false WHERE id='documents'`; DROP "Anyone can view all storage" (created `20251120083932:18-20`; the triage admits leaving it, `20260611110000:18-20`); replace the `WITH CHECK (true)` authenticated write policies (`:25-30`) with a site-id path prefix — `poolUpload.ts:21` already writes `${siteId}/_pool/…`. The prod tier-2 script scans `schemaname='public'`, so storage was never touched there either. Reads: 34 files, 49 `getPublicUrl` sites, 4 of them tests; `imageUrlResolver.ts:6-27` already parses both `/object/public/` and `/object/sign/` URLs into `{bucket,path}`, so this extends one module rather than adding one, and absorbs the nine duplicated signed-URL blocks F-66 records. Call the existing 50MB/extension `validate()` (`uploadCocFiles.ts:5-10`) from `poolUpload.ts:22-27`; drop `'svg'` from `uploadConstraints.ts:5`.
**Gate / rollback:** non-additive; stored public URLs (`coc_file_pool.file_url`) break — land the resolver, then flip the bucket. Reversal is one `UPDATE … public=true` plus the down file's re-created SELECT policy; signed URLs keep resolving through the same code path, so rollback needs no second frontend deploy.

**Effort L** (34 files / 49 call sites, one of which is the existing resolver) · **Risk high** · Order 3. After P-A03.

---

## P-A06 — Fail-closed, positive-allow authorization in SQL and at the server edge

**Addresses:** F-06, F-111, F-13, F-16, F-99

**What changes and why**
Replace exclusion with membership in both layers. SQL: one `public.is_staff(uuid)` replacing three incompatible definitions — NOT-based (`20260610120000:39-48`), not-Client-so-Contractors-count (`20260623120000:3-4`), and an affirmative allowlist (`20260708090000:10-11`) whose own comment says NOT-based policies "silently include users with no role row at all". Necessary because `handle_new_user` gives every signup `'User'` (`20260214023114:21-27`). App: `ProtectedRoute.tsx:19-26` renders the admin shell for anything not Contractor/Client — undefined role, thrown role query (`useUserRole.tsx:51`), disabled query. Invert to an Admin/Moderator allowlist and add `src/middleware.ts` (`git ls-files 'src/middleware*'` returns nothing). Enforce `requires_password_change` in SQL, not `Login.tsx:107-111`. Delete `UserRLSPolicies.tsx:137-150`: nothing reads `user_policy_overrides`.
**Gate / rollback:** auth flow; forces re-login; staff with no explicit role lose access until promoted — ship the backfill listing existing `'User'` accounts in the same migration. Down file restores the prior predicates; the middleware reverts independently.

**Effort M** · **Risk med** · Order 3. Depends on P-A02 (down convention) and P-A03 (`is_staff` lands in that migration set).

---

## P-A07 — De-oracle `qr-redirect` and narrow the anon RPC payload

**Addresses:** F-12, F-107

**What changes and why**
Delete the name-matching fallback (`qr-redirect/index.ts:180-215`). A four-segment path drives `.ilike('name','%x%')` (`:194`) plus substring site/client matching (`:205-210`) under a service-role client (`:32`), and the 302 returns a live subsection UUID (`:87`) that `get_public_subsection` grants anon (`20260727101000:25`) against public buckets. Resolve by exact UUID only — the only shape the app has ever generated (`qrBaseUrl.ts:43,50` emit `?path=<uuid>` and `?site=<uuid>`). Also: one constant 404 body (`:221-225`), generic error text (`:229-233`), `report-issue`'s throttle (`:23-30,44`), stop logging `req.url` (`:19-20`). Whitelist columns in `get_public_site_review`'s `to_jsonb(b)`/`to_jsonb(a)` (`20260614100000:83-91`) — the only two keys in that RPC that do not.
**Gate / rollback:** legacy name-based labels stop resolving. Count them first: `qr_codes.qr_code_url` stores every encoded URL (`20251020070753:3`), so rows not of the `?path=`/`?site=` shape are the exposed population, and `:19` already logs each scanned path — no diagnostic deploy needed. Revert is one function redeploy.

**Effort S** · **Risk med** · Order 4. Independent; any time after P-A01.

---

## P-A08 — Tenant-bind, hash and throttle the API credential surface

**Addresses:** F-15, F-09, F-65, F-89, F-110

**What changes and why**
`api_clients` has no tenant column (`20260110172925:2-13`) and `api-reports` authorises solely on `scopes?.includes("reports:read")` (`:58-63`), then filters on the caller-supplied id under a service-role client (`:44-46,138-142,162-177,205-219,241-250`): one credential reads every tenant. UUID unguessability is not a control — public QR URLs disclose subsection ids and responses leak `site_id`. Add `scoped_client_id`, copy it onto the token in `oauth-token`, add an ownership predicate per branch. Same window: hash the equality-matched secrets (`oauth-token:34-40`, `api-reports:18-23`), stop re-displaying them (`APIClients.tsx:273-288`) and toasting temp passwords (`Users.tsx:325-328,391-394`, returned by `invite-user:363-375`), `REVOKE EXECUTE ON validate_api_token FROM PUBLIC` (`20260110172925:77` — the file contains no REVOKE), throttle `oauth-token` (zero rate-limit hits in the file).
**Gate / rollback:** public API contract change; live tokens reissued. Phased: hash columns and `scoped_client_id` land additively, clients re-provision in one maintenance window, and only a second migration drops the plaintext columns and rejects NULL-scope tokens — everything before that drop rolls back by config.

**Effort M** · **Risk med** · Order 5. Last: the only item requiring customer coordination.

---

## CHANGE LOG

**Added — P-A02 (new, ordered first).** Round 1 asserted "must survive a clean apply" without checking whether a clean apply works. It does not: `20260612120000:52,65` references `subsections.deleted_at`, which no migration creates (F-31). This is the substrate the judge's rollback gap needed — it supplies the staging database and the `.down.sql` convention (184 files, 2 down files) that P-A03/P-A05 now depend on. It absorbs round-1 P-A08's repo-purge legs (F-10) plus F-113/F-114/F-109/F-112, which belong to the same object: the tracked tree.

**Modified — every proposal now carries a rollback clause**, not just an escalation gate. The two L/high items name their reversal explicitly (P-A03: mirrored down file, three-stage apply; P-A05: `public=true` plus down-file policy, resolver survives the revert).

**Modified — sizing derived, not asserted.** P-A03's L is 36 DROPs enumerated by grep with per-source counts (8 + 6 + 5 + 11 + 1 + 4 + 1) rather than "a list of source migrations". P-A05's L is 34 files / 49 `getPublicUrl` sites, 4 in tests, and it now points at `imageUrlResolver.ts:6-27`, which already parses `public` and `sign` URLs — so the resolver is an extension of an existing module and a subtraction of F-66's nine copies, not a new abstraction.

**Modified — preconditions and inventories are now methods.** P-A04 states how the `DOCBUILDER_*` state is established before shipping (`supabase secrets list`; `templates/index.ts:348` as a 503 oracle). P-A07 states how legacy QR labels are counted (`qr_codes.qr_code_url`, `20251020070753:3`, plus the existing `:19` log) instead of "inventory printed stickers".

**Modified — coverage widened inside the lens, 13 → 33 findings.** Round 1 took 4 blockers and 9 highs. Round 2 adds F-31 and F-16 (highs) and F-13 (authn-bypass), plus 17 in-lens mediums that are further evidence legs of the same boundaries: F-39/F-42 (anon PII INSERT) and F-106 (blanket `coc_file_pool` CRUD) into P-A03; F-50/F-66 into P-A05; F-98/F-96 into P-A04; F-99/F-111 into P-A06; F-107 into P-A07; F-65/F-89/F-110 into P-A08; F-43 into P-A01.

**Modified — round-1 P-A07 and P-A08 merged into one P-A08.** The judge is right that they shared an unscheduled re-provisioning window; they are now one decision, one window, and one phased additive-then-drop plan.

**Renumbered.** Round 1 → round 2: P-A01→P-A01, P-A02→P-A03, P-A03→P-A05, P-A04→P-A04, P-A05→P-A06, P-A06→P-A07, P-A07+P-A08→P-A08, new P-A02. Numbering now ascends with apply order.

**Not taken, on purpose.** F-07 (the only data-loss finding), F-17–F-30, F-32–F-35. They are real and they are expensive, and they are not boundaries; P-A06 increases forced logouts, which makes F-07 worse. I decline the trade rather than pretend to make it.
