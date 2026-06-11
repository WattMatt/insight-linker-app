# Gap & Problem Register

Every gap, problem, or unverified assumption found by the system-reference review, with a resolution
plan, an owner, and a status. **A gap is only Closed with evidence** (citation, test output, or
dashboard screenshot) — never by assertion.

IDs are stable; later phases append, never renumber. Categories: `SEC` security/config ·
`BUG` code defect · `TEST` verification infrastructure · `OPS` process/deploy · `PROD` product decision.

Status: 🔴 Open · 🟠 Plan agreed, not executed · 🟢 Closed (evidence linked) · ⚪ Accepted risk / deferred by decision

---

## SEC — security & configuration (from Phase 1, auth-flows)

### G-SEC-01 · Open signup → auto-`User` role → all-tenant data 🔴🔴 CRITICAL (escalated 2026-06-11) — #1 dashboard action
- **Gap (verified chain):** (1) prod GoTrue allows public self-registration (`/auth/v1/settings → disable_signup:false`, `external.email:true`); (2) `handle_new_user` trigger assigns role `'User'` to every new signup except the first (migration "Fix handle_new_user to assign 'User' role by default", :21-27); (3) role `'User'` has `FOR ALL` manage-all policies on sites/subsections/inspections/snags (20251120111033:4-56). **Net: anyone on the internet can self-register and read/write every tenant's core data.** Email confirmation is no barrier (attacker controls their own email).
- **Resolve (urgent):** Arno → Supabase dashboard → Authentication → disable "Allow new users to sign up". Re-probe `/settings` for `disable_signup:true`. This is necessary but NOT sufficient — see G-SEC-13 (the RLS model lets any *legitimate* authenticated user cross tenants too).
- **Owner:** Arno (dashboard) · Claude re-probes. (Management-API path unavailable — CLI token isn't a PAT.)

### G-SEC-12 · Unauthenticated/under-auth service-role edge functions 🔴 High (batch) — see SECURITY-FINDINGS-phase2.md §A
- **Gap:** ~22 edge functions are anon-reachable (`verify_jwt=false`, or `verify_jwt=true` which the public anon key satisfies) with no in-handler auth, holding the service-role key. HIGH: save-template + template-sync (fail-open privileged `inspection_templates` writes), generate-pdf + generate-inspection-pdf (anon service-role doc INSERTs), fix-inspection-photos + fix-tenant-images (anon cross-tenant data mutation), detect-schematic-regions + offline-review (unauth paid-LLM credit burn). Full list + citations in [SECURITY-FINDINGS-phase2.md](SECURITY-FINDINGS-phase2.md) §A.
- **Resolve:** per function — add in-handler auth (getUser + role/tenant check) the way invite-user/delete-user do, set `verify_jwt=true` won't suffice alone (anon key satisfies it) so the in-handler check is the real fix; DELETE the dead ones (generate-pdf-browserless/-pdfmake/-docx, generate-pdf-google have no callers). The 4 `fix-*`/mutating ones are the most urgent (data integrity).
- **Owner:** Claude (harden/delete batch, needs go-ahead on which to delete vs guard) · deploys gated.
- **Progress (2026-06-11):** 🟢 7 dead anon-reachable fns DELETED from prod (generate-pdf-google/-browserless/-pdfmake/-docx, fix-inspection-photos, fix-tenant-images, detect-schematic-regions — all 0 callers, verified 404; source kept in repo). STILL OPEN: harden the *live* anon-reachable ones (save-template, template-sync, generate-pdf, generate-inspection-pdf, send-email, compress-image, batch-compress-images, offline-review, verify-fix, oauth-token, api-reports, qr-redirect, log-auth-event, extract-coc) — these are USED, so they need in-handler auth, not deletion.

### G-SEC-13 · RLS has no tenant/role isolation — "any authenticated" model 🔴🔴 Critical (architectural) — see §B
- **Gap:** Most tables use blanket `FOR ALL`/`USING(true)` or `auth.role()='authenticated'` policies; the tier-2 lockdown's `auth_read_* USING(true)` grants every authenticated user SELECT on all tenants' rows. Tenant isolation in the client-portal and elsewhere is **client-side `.eq('client_id',…)` only**, with no DB enforcement. Any legitimate Client/Contractor/User can read (and often write) any tenant's data via a crafted query. Affects settings, inspection_templates, validation_feedback, floor_plan_*, calendar_events, inspection_signatures, client_access_links, and the whole sites/subsections/inspections tree. Full list in §B.
- **Resolve:** architectural — design real tenant-scoped RLS (membership-based: `user_clients`/`user_sites` join predicates) and role gating (Admin-only writes on settings/templates/feedback). This is a project, not a patch; scope after the per-table docs are confirmed. Interim: the highest-value quick wins are Admin-gating settings + inspection_templates + validation_feedback writes.
- **Owner:** Claude (design proposal) · Arno (sign-off — this changes the access model).
- **Progress (2026-06-11):** 🟠 quick-win SQL written (`migrations/20260611110000_emergency_triage_lockdown.sql` + PENDING dashboard copy): settings → Admin-only writes; inspection_templates/validation_feedback → drop Client/Contractor write (keep Staff/Admin). ⚠️ "Staff"=Admin+User, so templates/feedback stay writable by any self-registered User until G-SEC-01 (signup) is closed. **Awaiting Arno dashboard apply.** Full membership-scoped redesign still open.

### G-SEC-14 · Public storage buckets, anon read+write 🔴 High — see §C
- **Gap:** `documents` bucket is `public=true` with blanket anon SELECT/INSERT/UPDATE/DELETE `storage.objects` policies `USING(true)`; `inspection-photos` + `site-images` have "Anyone can …" policies. Any anon caller reads/overwrites/deletes every object; all report URLs are world-readable. The 2026-06-11 tier-2 lockdown did not touch storage. (Ties to G-SEC-11 — storage was the other thing both lockdowns skipped.)
- **Resolve:** restrict `storage.objects` policies to authenticated + path/tenant scoping; decide which buckets must stay public (signed-URL model for private docs). SQL migration; needs dashboard apply.
- **Owner:** Claude (policy migration) · Arno (apply + public-vs-private decisions).
- **Progress (2026-06-11):** 🟠 anon-write lockdown SQL written (`migrations/20260611110000_…`): drops "Anyone can upload/update/delete to all storage", replaces with authenticated-only. **Awaiting Arno dashboard apply.** Follow-up (not in this SQL): make `documents` bucket private + signed-URL (anon SELECT left intact to avoid breaking public report images).

### G-SEC-15 · `validation-chat` — stale config.toml entry 🟢 CLOSED 2026-06-11
- **Gap:** `config.toml` declared `[functions.validation-chat]` but no `supabase/functions/validation-chat/` exists, 0 repo refs, and it was NOT in the deployed `functions list` (the 26+7) → stale config, not a deployed function.
- **Closure:** removed the `[functions.validation-chat]` stanza from `supabase/config.toml`.

### G-SEC-02 · Turnstile captcha enforcement unknown 🔴 Medium
- **Gap:** Client silently degrades to no-captcha when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (`src/components/CaptchaTurnstile.tsx:20-21`); whether Supabase project-level captcha enforcement is on is dashboard-only state.
- **Partial evidence (2026-06-11):** local `.env` has `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` **empty** (line 4), so dev has no captcha. Prod value couldn't be read — repo isn't `vercel link`ed (Vercel CLI authed as arno-7196). Captcha *enforcement* is a Supabase dashboard setting regardless.
- **Resolve:** Arno checks Supabase dashboard (Auth → Attack protection/Captcha) + Vercel prod env for the site key. If enforcement off, enable both sides or remove the dead client path.
- **Owner:** Arno (dashboard + prod env) · Claude (code change if path removed).

### G-SEC-03 · `send-password-reset` — DO NOT DELETE BLIND; may be the live email hook 🔴 High — needs dashboard check
- **Revised (2026-06-11):** earlier "orphan, delete it" was WRONG to act on. Evidence against deletion: (1) it's a purpose-built branded password-reset email; (2) recently updated (v31, 2026-05-25 — actively maintained); (3) the app's reset flow calls GoTrue `resetPasswordForEmail` ([ForgotPassword.tsx:72](src/views/auth/ForgotPassword.tsx:72)), which routes through a **Send Email auth hook** if one is configured. config.toml has NO hook entry, but the **prod dashboard** can configure a Send Email hook independently. If `send-password-reset` is that hook, deleting it breaks password resets.
- **Resolve — DASHBOARD CHECK FIRST (Owner Arno):** Supabase → Authentication → Hooks → "Send Email". Is it set to `send-password-reset`?
  - **If YES:** it's load-bearing — keep. Then harden: confirm it validates the GoTrue hook signature/secret (else it's still a callable open email sender). Claude reviews the hook-signature handling.
  - **If NO:** confirmed orphan — safe to delete (source is in repo at `supabase/functions/send-password-reset/`; preserve + `supabase functions delete`).
- **Gate probe (2026-06-11):** no-auth `POST` reaches the handler (400 "Email is required") → `verify_jwt` is OFF, directly callable unauthenticated. So **either branch needs action**: if not the hook → delete; if it IS the hook → it isn't validating the hook signature, so it's still an open email-sender (anyone can trigger a branded reset email to any address, only 5/min/IP in-isolate) → harden with signature validation. The dashboard check only decides delete-vs-harden.
- **Owner:** Arno (one dashboard check) → Claude executes the resulting action.

### G-SEC-04 · invite/delete-user wrote no audit rows 🟢 CLOSED 2026-06-11 (deployed) — residual noted
- **Done:** `user_created` emit added to invite-user (v298, after `admin.createUser`) and `account_deleted` to delete-user (v267, after `admin.deleteUser`). Both best-effort (try/catch, non-fatal — an audit failure can't break the operation), schema-matched to `auth_events` (20260525120000). POPIA §16/§24.
- **Live-verify (Owner Arno):** one real invite + one real delete, then check `auth_events` has the two rows. (Couldn't auto-test without creating/deleting a real prod user.)
- **Residual (new, Low):** GoTrue-lifecycle event types still have no emitters — `login`, `logout`, `password_changed`, `password_reset_requested`, `magic_link_requested`, `lockout`, `mfa_*`, `account_email_changed`. These fire inside GoTrue, not these functions; capturing them needs a GoTrue auth hook or client-side `log-auth-event` calls. Tracked as **G-SEC-10**.

### G-SEC-10 · GoTrue-lifecycle auth events uncaptured 🔴 Low
- **Gap:** `auth_events` allowlist defines login/logout/password_changed/lockout/mfa/email_changed but nothing emits them (only `user_created`/`account_deleted` now do, via G-SEC-04). `log-auth-event` exists as the writer but has callers only for… (verify). POPIA paper trail is partial.
- **Resolve:** wire client-side `log-auth-event` calls on login/logout/password-change, or a GoTrue Send-Auth-Hook. Scope after Phase 3 (auth flow docs).
- **Owner:** Claude (implement) · needs design decision on hook-vs-client.

### G-SEC-05 · Recovery email claims 1-hour expiry; actual expiry is server config 🔴 Low
- **Gap:** Copy hardcodes "1 hour" (`supabase/functions/send-password-reset/index.ts:144,177`) but GoTrue OTP expiry lives in dashboard config. (Likely moot if G-SEC-03 resolves by deletion.)
- **Resolve:** Read actual expiry from dashboard; align copy or delete with the function.
- **Owner:** folds into G-SEC-03.

### G-SEC-06 · Invites sent from `onboarding@resend.dev` 🟢 CLOSED 2026-06-11 (deployed)
- **Closure:** invite-user deployed v297 (2026-06-11 09:19) with sender `noreply@watsonmattheus.com`. To fully verify delivery, send a real invite to an external address (Owner: Arno). Auth gate re-verified post-deploy (no-auth → 401, anon → handler-reject).
- *(original below)*
- **Gap:** `invite-user` sent from Resend's sandbox sender (was `index.ts:452`) vs `noreply@watsonmattheus.com` for password reset. **Resend sandbox senders only deliver to the account owner's own address** — external invites were likely silently failing.
- **Fix (branch `fix/sec-gaps-invite-user`):** sender → `noreply@watsonmattheus.com`, matching send-password-reset:190.
- **To close:** deploy invite-user, send a test invite to an external address, confirm delivery. **Owner:** Claude (deploy on Arno's OK) · Arno confirms receipt.

### G-SEC-07 · Invite `redirectTo` derived from request origin header 🟢 CLOSED 2026-06-11 (deployed)
- **Closure:** invite-user deployed v297; redirect base now from `APP_URL` env. Fixes both invite + recovery redirects.
- *(original below)*
- **Gap:** `invite-user` built the invite link from `origin`/`referer` (was `index.ts:76-77`, also feeding `recoveryRedirect` at :200) instead of an env var — invites from a preview/spoofed host would point invitees there.
- **Fix (branch `fix/sec-gaps-invite-user`):** `origin` now sourced from `Deno.env.get('APP_URL')` with the prod fallback, mirroring send-password-reset:69. One change fixes both the invite and recovery redirects.
- **To close:** deploy invite-user. **Owner:** Claude (deploy on Arno's OK).

### G-SEC-09 · `create-user-admin` — UNAUTHENTICATED account creation 🟢 CLOSED 2026-06-11 (deleted from prod)
- **Closure evidence:** `supabase functions delete create-user-admin --project-ref oltzgidkjxwsukvkomof` → "Deleted Function". No longer in `functions list`. Re-probe `POST .../create-user-admin` → HTTP 404 `NOT_FOUND`. Source preserved at `docs/system-reference/_work/unversioned-prod-functions/create-user-admin.PULLED-FROM-PROD.ts`.
- *(Original finding, for the record:)*
- **Gap:** Edge function `create-user-admin` (deployed v2 since 2026-02-12, **source NOT in repo**) uses the **service-role key** and calls `auth.admin.createUser({ email, password, email_confirm: true })` from the raw request body with **NO authentication check of any kind** — no `Authorization` verification, no admin-role gate (contrast `invite-user/index.ts:32-54`).
- **Evidence (2026-06-11):** source pulled via `supabase functions download` to `/tmp/fnreview/.../create-user-admin/index.ts` (lines 13-24 = no guard). Live probe: `POST .../functions/v1/create-user-admin` with **no Authorization header**, body `{}` → HTTP 400 `"Cannot create a user without either an email or phone"` — i.e. the request reached the handler unauthenticated (`verify_jwt` is OFF; even if ON, the public anon key satisfies it). No user was created (empty body). 0 repo callers.
- **Impact:** anyone on the internet can create a fully email-confirmed account with a chosen password — bypasses the invite-only model and email confirmation entirely; yields a working login. Compounds with G-SEC-01.
- **Resolve:** **DELETE from prod immediately** — it has no callers and no repo source. `supabase functions delete create-user-admin --project-ref oltzgidkjxwsukvkomof`. Source is backed up at `/tmp/fnreview` if ever needed. (If a real use surfaces later, re-implement WITH an admin-role guard + `verify_jwt`.)
- **Owner:** Arno approves deletion (destructive, prod) · Claude executes the one command on OK. **Blocking — recommend before any other gap work.**

### G-SEC-08 · 7 prod edge functions had no source in the repo 🟢 CLOSED 2026-06-11 (all 7 deleted)
- **Closure evidence:** all 7 reviewed, sources preserved at `docs/system-reference/_work/unversioned-prod-functions/*.PULLED-FROM-PROD.ts`, then deleted from prod (`supabase functions delete`). Verified: none appear in `functions list`; every endpoint returns HTTP 404 on probe. create-user-admin → G-SEC-09 (CRITICAL, was the headline). Others were unauthenticated service-role endpoints / finished one-off migrations with 0 repo callers: bulk-validate-coc (RLS-bypass COC read), abacus-code-review (denial-of-wallet on paid Abacus key + third-party egress), migrate-storage/images (unauth bucket upload), migrate-firebase-data, audit-orphan-photos (read-only). All confirmed superseded or obsolete.
- *(Original finding, for the record:)*
- **Gap:** `supabase functions list` shows 7 ACTIVE functions absent from `supabase/functions/`: `create-user-admin` (→ G-SEC-09), `abacus-code-review`, `bulk-validate-coc`, `audit-orphan-photos`, `migrate-storage`, `migrate-images`, `migrate-firebase-data`. All have **0 repo references**. Unreviewable prod attack surface; the June security review (26 repo functions) never covered them.
- **Notables:** `abacus-code-review` (third-party? may exfiltrate code — review its source + egress); the three `migrate-*` are likely one-off data migrations safe to remove; `bulk-validate-coc`/`audit-orphan-photos` need an auth-model review like the repo functions got.
- **Resolve:** Download each (`supabase functions download <slug>`), review auth model + side effects, then per function: delete if obsolete, or commit to repo + pin `verify_jwt` if kept. Probe each unauthenticated (folds into G-TEST-03).
- **Owner:** Claude (download + review + recommendation) · Arno (delete/keep decisions).
- **Status:** create-user-admin reviewed → G-SEC-09 → **deleted/closed**. Other 6 pending review: abacus-code-review, bulk-validate-coc, audit-orphan-photos, migrate-storage, migrate-images, migrate-firebase-data.

### G-SEC-11 · anon READ+WRITE open on 2 out-of-band tables 🟠 High — fix written, awaiting dashboard apply
- **Gap:** `contractor_coc_uploads` and `inspection_relink_audit` allow unauthenticated read AND write. Both tier-2 (read) and the 2026-06-10 write-lockdown missed them — they're out-of-band tables (G-OPS-01) absent from both lockdowns' table lists.
- **Evidence (2026-06-11, anon REST + public anon key):** SELECT → `200 []` (read open, tables empty); INSERT `{}` → `400 23502 null value … project_id` (write passed RLS, stopped only by NOT NULL — no row created). All other probed tables returned `42501` RLS-denied. Zero read/write call sites in src/ or supabase/functions/ (only generated types.ts).
- **Fix (written):** `supabase/migrations/20260611100000_anon_lockdown_oob_tables.sql` + dashboard copy `docs/security/PENDING-2026-06-11-anon-lockdown-oob-tables.sql` — `REVOKE ALL … FROM anon` on both (PostgREST runs as anon, so this is sufficient and policy-name-independent; breaks nothing since no app writer).
- **To close (Owner Arno):** apply the PENDING SQL via dashboard SQL editor (no DB creds in repo — I can't apply it), then I re-probe (expect 401 read + write). Then rename PENDING→APPLIED.

### G-SEC-12 · authenticated WRITE open on 3 admin-config tables 🟠 High — fix written, awaiting apply
- **Gap:** `inspection_templates`, `settings`, `validation_feedback` granted write to ANY authenticated principal, although all three are edited only from `src/app/(admin)/` views behind `ProtectedRoute` (admits Admin/User/Moderator; bounces Contractor/Client). A Client/Contractor session — or, since signup is open (G-SEC-01), any self-registered account — could INSERT/UPDATE (and on the FOR-ALL tables, DELETE) via REST.
  - `inspection_templates`: blanket `FOR ALL USING/CHECK (auth.uid() IS NOT NULL)` (`rls-policies-02.md:202`).
  - `settings`: UPDATE + INSERT gated only by `auth.role()='authenticated'` (`rls-policies-04.md:138-139`).
  - `validation_feedback`: blanket `FOR ALL (auth.uid() IS NOT NULL)` burying a dead `Admins can update feedback` policy (`rls-policies-06.md:60`).
- **Fix (written):** `supabase/migrations/20260611140000_admin_config_write_lockdown.sql` — applies the phase-1 **staff** predicate (`NOT Contractor AND NOT Client`) to all three write-sides. Tier confirmed with Arno 2026-06-11 (staff, not Admin — most staff are default `User` role; Admin-only would block legitimate triage/editing). `settings` SELECT policies left untouched so anon login-page branding still reads (deliberately excluded from tier-2). `validation_feedback` drops the blanket → restores original all-auth SELECT + own-row INSERT, removes incidental DELETE grant, staff-gates UPDATE. Reads on all three unchanged.
- **To close (Owner Arno):** apply the migration (`supabase db push` or dashboard SQL editor — no DB creds in repo, I can't apply it), then I re-probe per the migration's verification block (Client/Contractor write → denied; staff write → ok; anon branding read → 200).
- **Related:** same class as the phase-1 write lockdown (`20260610120000`) and G-SEC-11; full out-of-band policy reconciliation tracked under G-OPS-01.

### G-SEC-16 · COC validation can be gamed / is inconsistent 🔴 High — NEW (Phase 3)
- **Gap (3 sub-issues, electrical-safety-critical):** (1) **Threshold override** — a caller (Admin or site-scoped Contractor) can pass arbitrary validation thresholds in the request body via `testSettings` (`validate-coc/index.ts:1007-1009`), bypassing the DB `coc_validation_settings` for that run and **potentially forcing a Pass on a non-compliant COC**; the result persists to `coc_validations.status` + subsection `is_compliant`. (2) **Two disagreeing writers of `is_compliant`** — validate-coc's 4-way AND (`:1659`) vs the `sync_coc_compliance_status` trigger's coc_status-derived value (`20260201151127:42-48`); a hierarchy-invalid "Approved" COC can be recomputed compliant by the trigger. (3) **Optimistic pre-write drift** — client pre-writes approved coc_number/type/date before validation (`:354-365`); a failed validation rolls back only client state, leaving approved-but-unvalidated metadata server-side.
- **Resolve:** ignore/whitelist `testSettings` for persisted runs (or restrict to a dry-run that never writes); make the trigger the single authority for `is_compliant` (or have validate-coc defer to it); move the metadata write to AFTER a Pass. Needs a domain decision on the intended validation authority.
- **Owner:** Claude (proposal + edge-fn/trigger change) · Arno (sign-off on the validation-authority rule).

### G-SEC-17 · Spoofable evidence provenance 🔴 Medium — NEW (Phase 3)
- **Gap:** `captured_by`/`created_by`/`uploaded_by` on compliance photos + offline uploads are set from client input with an `'unknown'` fallback and no `auth.uid()` constraint (scoped policies were dropped) — `useOfflinePhotos.ts:163`, `useOfflineFloorPlanAnnotations.ts:87`. Provenance of compliance evidence is forgeable.
- **Resolve:** set provenance server-side from the JWT (DB column default `auth.uid()` or in an edge fn), not client input. Folds into the G-SEC-13 RLS redesign.
- **Owner:** Claude.

### G-SEC-18 · template-sync unsigned webhook egress 🔴 Medium — NEW (Phase 3)
- **Gap:** every inspection_template CRUD POSTs the full template payload to `DOCBUILDER_WEBHOOK_URL` with no signature/auth (`template-sync/index.ts:358-389`); whoever controls that env var receives all template data. `/webhook/register` is a no-op stub.
- **Resolve:** sign the webhook (HMAC) + verify on the receiver, or drop the egress if DocBuilder is retired. Ties to G-SEC-12 (template-sync is also fail-open).
- **Owner:** Claude · needs Arno's call on DocBuilder's future.

### G-SEC-19 · Client-only invariants / trust-the-client figures 🔴 Low-Med — NEW (Phase 3)
- **Gap (cluster):** "Completed requires `quality_rating`" enforced only in TS (`InspectionDetail.tsx:1483`), no DB CHECK; PDF compliance figures computed in-browser and rendered by generate-pdf without recomputation (`GenerateFinalReportButton.tsx`); online authz failures masked as offline retries then silently dropped after 3 tries (`useOfflineSync.ts:447-457`); `cleanup_old_pending_invites()` GRANT EXECUTE TO authenticated with no in-fn auth + no confirmed cron; generate-pdf orphans PDFs on swallowed INSERT failure (`:3054`).
- **Resolve:** add DB CHECK/trigger for the completion invariant; recompute report figures server-side (or accept once server PDF is retired); surface authz failures distinctly from connectivity; confirm the prune schedule.
- **Owner:** Claude (per-item) · low priority vs G-SEC-16.

## TEST — verification infrastructure (assessed 2026-06-11; repo has ZERO automated tests, no CI, tsc/eslint gates disabled)

### G-TEST-01 · RLS/access-matrix regression suite 🟠 (plan agreed: build after Phase 2)
The 2026-06-11 prod verification (anon → `[]`, cross-tenant IDOR → NULL, RPCs work) was manual.
Codify as a suite using anon key + per-role JWTs asserting the access matrix for all 50 policy tables.
**Spec source:** the `02-data-model/rls-policies-*.md` docs being generated now.

### G-TEST-02 · Schema drift check 🟠
CI job: regenerate `types.ts` + `supabase db diff` vs prod → catches dashboard-applied SQL outside
migrations (already happened once: tier-2 lockdown) and stale types (4 known `.rpc()` errors).

### G-TEST-03 · Edge-function auth matrix 🟠
Call all 26 functions unauthenticated → assert 401/403; per-role expectations after.
Would have caught G-SEC-03. **Spec source:** Phase 2 edge-function docs.

### G-TEST-04 · TypeScript/ESLint baseline ratchet 🟠
109 pre-existing tsc errors; `ignoreBuildErrors`/`ignoreDuringBuilds` on. CI enforces "no NEW
errors" via shift-invariant baseline diff; ratchet down over time; end state removes the ignores.

### G-TEST-05 · CI pipeline (carrier for 01–04) 🟠
No `.github/workflows/` exists. Minimal: typecheck-baseline → lint-baseline → tests on PR.
Side-fix: `NEXT_PUBLIC_SUPABASE_*` are Production-scoped only, so preview builds fail.

### G-TEST-06 · Dead-code detection (knip/ts-prune) 🟠
Orphans keep being found by hand (G-SEC-03, P3-5 dead flow). Automate in CI.

### G-TEST-07 · Secrets scanning (gitleaks) 🟠
Tokens have transited the desktop during deploys (docbuilder-token.txt).

### G-TEST-08 · E2E smoke flows (Playwright) 🟠
One journey per access context (admin, client-portal, contractor, token-public, QR).
**Spec source:** Phase 3 flows chapter.

### G-TEST-09 · PDF golden-file tests 🟠
5 generators; Phase-3 of June review found WYSIWYG wrong-section output. Snapshot each generator
against fixtures; `src/lib/pdfTemplateTestRunner.ts` is a starting harness.

### G-TEST-10 · Offline queue unit tests (vitest + fake-indexeddb) 🟠
Shrinks PR #11's manual device-test matrix (snapshot-safe flush, idempotent upserts, concurrency guard).

### G-TEST-11 · Docs-drift check 🟠
Periodic job verifying system-reference citations still hold; flags chapters touching changed files.

**Sequencing decision (agreed 2026-06-11):** build TEST items only after their spec source exists —
G-TEST-01/03 after Phase 2 docs land; 04–07 any time; 08–09 after Phase 3. Writing tests before the
docs would encode assumptions — the exact failure mode this review exists to kill.

## OPS — process / drift

### G-OPS-01 · Prod schema has drifted from the migrations + types.ts is stale 🔴 High
- **Gap:** Multiple objects exist in the live DB (confirmed via generated `types.ts`) but appear in **no** `supabase/migrations/` file — applied out-of-band via the dashboard. This is what *caused* G-SEC-11 (the two anon-open tables were never in any lockdown's list). Surfaced by the Phase-1b synthesis types.ts cross-check.
- **Out-of-band objects found (2026-06-11):**
  - Tables/columns with no migration: `contractor_coc_uploads.{legend_card_id, site_id, subsection_id}` (types.ts:965+), `inspections.deleted_at` (types.ts:1455), `snags.{assignee, coc_validation_id, deleted_at, snag_type, trade}`, `subsections.{installation_score, installation_status, deleted_at}`, `inspection_signatures_snap_20260421` (a 2026-04-21 dashboard backup snapshot table).
  - `auth_events` exists in migration 20260525120000 but is **absent from types.ts** → types.ts predates it and is stale (the G-SEC-04 emitters write an untyped table; harmless for edge fns but app code touching it is untyped).
  - `snags.status` CHECK may have been widened out-of-band (RPCs reference `rectified`/`closed` not in the original `Open`/`Closed` CHECK).
- **Resolve:** (1) `supabase db pull` / dashboard schema diff to capture every out-of-band change into real migrations; (2) regenerate `types.ts`; (3) reconcile RLS on the recovered tables (folds in G-SEC-11's full policy redesign). This is the confirmed instance of **G-TEST-02** (schema-drift check) — stand that check up so this can't recur silently.
- **Owner:** Claude (db pull + migration authoring + types regen) · needs DB connection (db password or dashboard) from Arno.

### G-OPS-02 · Several fully-defined tables have no call sites (possible dead schema) 🔵 Low
- **Gap:** `validation_conversations`, `validation_messages`, `user_storage_connections`, `coc_local_validations`, `qr_codes`, `temp_import` are fully defined (columns/RLS/indexes) but have **zero** read/write call sites in src/ or supabase/functions/. Either dead, planned, or written by an out-of-repo process.
- **Resolve:** per table, confirm live row counts + intended writer; drop if dead, document if planned. Low priority; revisit during the components/flows phases.
- **Owner:** Claude (confirm) · Arno (drop decision).

### G-OPS-03 · Large dead-code surface (deletion backlog) 🔵 Low — NEW (Phase 4)
- **Gap:** Phase-4 grep-verified a substantial amount of zero-caller code: ~10 dead components (COCReviewStatus, OfflineImage/PhotoGallery, SiteDrawingInspection, SiteImages, SiteExport, 5 `*Preview` + their barrel, pdf-preview/SubsectionCard…), 14 unused vendored shadcn `ui/` primitives + the unused Sonner toaster, and many dead lib files/exports — incl. **the entire orphaned `src/lib/pdf/` OCR pipeline** (with a stub `ocrEngine` returning `[]`), `usePDFTemplate.ts`, `complianceReportGenerator`, `imagePathFixer.*`, etc. Plus heavy duplicated logic (meter-match ×3, image-compress ×4, QR ×2, status-badge ×3, toast ×2, sample-data ×2). Full list: [FINDINGS-phase4.md](07-components-hooks-lib/FINDINGS-phase4.md) §A/§C.
- **Resolve:** a focused dead-code-deletion PR (low risk — all grep-verified zero-caller) + a consolidation pass for the duplicated logic. Significantly shrinks maintenance/attack surface.
- **Owner:** Claude (can do the deletion sweep on request) · Arno (sign-off).

### G-BUG-01 · Stubs/diagnostics that mislead or shipped to prod 🔴 Low-Med — NEW (Phase 4)
- **Gap:** (1) `storageQuota.clearOldOfflineData` toasts "Old offline data cleared successfully" but deletes **nothing**; `estimateIndexedDBUsage` returns a fabricated estimate — the storage-management UI lies to the user. (2) `ocrEngine.extractTextFromCanvas` is a stub returning `[]`. (3) **A test diagnostic is wired to a prod button** — `pdfMakeConfig.testPdfGeneration` (downloads a hello-world PDF + `alert()`) is on an onClick in `AssetComparisonTable.tsx:565`. Also several stale-brand `'SiteWise'` fallbacks + a hardcoded `arno@wmeng.co.za` in IssueReportDialog/SuggestionDialog (§B/§F).
- **Resolve:** make `clearOldOfflineData` actually clear (or remove the affordance); remove/guard the prod test button; fix brand fallbacks. Small, self-contained.
- **Owner:** Claude.

## PROD — deferred product decisions (carried from June review)

### G-PROD-01 · PR #11 offline queue engine — DRAFT, device-test matrix required ⚪
Stacked on #10. Un-draft only after the device matrix in the PR passes (G-TEST-10 shrinks the matrix).

### G-PROD-02 · P3-5 dead inspection-template edit/save flow in PDFTemplateManager ⚪
Decide: remove or finish. Dead UI that looks functional.

### G-PROD-03 · Offline A3/A4/A5 — never-uploaded inspection image/markup/measurement paths ⚪
Markups/measurements have no server table; needs a schema decision before wiring.

---

## Intake rule

Every later review phase appends its findings here: critic gaps → new entries; open questions that
turn out to be real problems → promoted from 00-INDEX.md to an ID here with severity + plan.
00-INDEX.md tracks *coverage* (what's been read); this file tracks *problems* (what's wrong).
