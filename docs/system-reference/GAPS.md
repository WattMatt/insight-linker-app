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
- **Compounds with G-SEC-09:** open signup + an unauthenticated admin-create endpoint = two independent ways to mint accounts.

### G-SEC-02 · Turnstile captcha enforcement unknown 🔴 Medium
- **Gap:** Client silently degrades to no-captcha when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (`src/components/CaptchaTurnstile.tsx:20-21`); whether Supabase project-level captcha enforcement is on is dashboard-only state.
- **Partial evidence (2026-06-11):** local `.env` has `NEXT_PUBLIC_TURNSTILE_SITE_KEY=` **empty** (line 4), so dev has no captcha. Prod value couldn't be read — repo isn't `vercel link`ed (Vercel CLI authed as arno-7196). Captcha *enforcement* is a Supabase dashboard setting regardless.
- **Resolve:** Arno checks Supabase dashboard (Auth → Attack protection/Captcha) + Vercel prod env for the site key. If enforcement off, enable both sides or remove the dead client path.
- **Owner:** Arno (dashboard + prod env) · Claude (code change if path removed).

### G-SEC-03 · `send-password-reset` orphan email sender — CONFIRMED deployed 🔴 High
- **Gap:** Zero app callers (only a comment ref at `src/views/Auth.tsx:27`), absent from `supabase/config.toml` so its `verify_jwt` is whatever it was deployed with.
- **Evidence (2026-06-11):** `supabase functions list` → `send-password-reset` ACTIVE, v31, updated 2026-05-25. It IS live.
- **Resolve:** Decide delete vs keep. App uses GoTrue's built-in recovery, so deletion is the simple path. If kept, pin `verify_jwt` in config.toml and rate-limit harder. (Probe its auth like G-SEC-09 before deciding — same `verify_jwt`-bypass-via-anon-key risk applies; it sends email, not creates users, so lower severity.)
- **Owner:** Arno approves delete · Claude executes.

### G-SEC-04 · Defined audit events have no emitters 🔴 Low-Med
- **Gap:** `user_created`, `account_deleted`, `lockout`, `mfa_*`, `account_email_changed` exist in the `auth_events` CHECK + edge-fn allowlists, but `invite-user`/`delete-user` write no audit rows.
- **Resolve:** Decide intentional-deferral vs omission. If omission: add `auth_events` inserts to invite-user and delete-user (small PR).
- **Owner:** Arno decides · Claude implements.

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
