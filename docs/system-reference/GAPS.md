# Gap & Problem Register

Every gap, problem, or unverified assumption found by the system-reference review, with a resolution
plan, an owner, and a status. **A gap is only Closed with evidence** (citation, test output, or
dashboard screenshot) — never by assertion.

IDs are stable; later phases append, never renumber. Categories: `SEC` security/config ·
`BUG` code defect · `TEST` verification infrastructure · `OPS` process/deploy · `PROD` product decision.

Status: 🔴 Open · 🟠 Plan agreed, not executed · 🟢 Closed (evidence linked) · ⚪ Accepted risk / deferred by decision

---

## SEC — security & configuration (from Phase 1, auth-flows)

### G-SEC-01 · Public signup is OPEN on prod 🟠 High — CONFIRMED, needs dashboard toggle
- **Gap:** App is invite-only by design, but prod GoTrue allows public self-registration.
- **Evidence (2026-06-11):** `GET https://oltzgidkjxwsukvkomof.supabase.co/auth/v1/settings` → `disable_signup: false`, `external.email: true`, `mailer_autoconfirm: false`. Anyone can `POST /auth/v1/signup` and obtain an `authenticated` JWT (after email confirmation).
- **Resolve:** Arno → Supabase dashboard → Authentication → Sign In/Providers → disable "Allow new users to sign up" (or the Email provider's signup). Re-probe `/settings` to confirm `disable_signup: true`.
- **Owner:** Arno (dashboard) · Claude re-probes to close.
- **Note (2026-06-11):** tried to flip this programmatically via Supabase Management API; the CLI's stored credential isn't a usable management PAT (`go-k…`, 401 "JWT could not be decoded"). Dashboard (or a freshly generated `sbp_` PAT) is required.
- **Compounds with G-SEC-09:** open signup + an unauthenticated admin-create endpoint = two independent ways to mint accounts.

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
