# Auth Modernisation — insight-linker-app

> Closure record for the EC-0 through EC-9 user-management + password-flow
> gap-closure series. Driven by [PARITY_GAP_ANALYSIS.md](./PARITY_GAP_ANALYSIS.md)
> (auth section appended via direct review of ESITE.V1 and RESPUBLICA METERING)
> and executed in nine commits on `main` on 2026-05-25.

---

## 1. What landed (commit → gap)

| Commit | Gap | One-liner |
|---|---|---|
| `04d24ee` | EC-0 | `send-password-reset` redirected to a dead Lovable subdomain — pointed at the live Vercel URL via an env-driven `APP_URL` |
| `ac98017` | EC-3 | New `auth_events` audit table (11 event types, POPIA §16 + §24), `log-auth-event` Edge Function, `src/lib/auth-audit.ts` client helper |
| `4ab1862` | EC-1 + EC-8 | Split the 757-line `Auth.tsx` god-component into per-flow App-Router routes (`/auth/login`, `/signup`, `/forgot-password`, `/reset-password`, `/set-password`). `/auth` retained as a backward-compat dispatcher. Every form rebuilt with react-hook-form + Zod schemas in `src/lib/validation-schemas.ts`. 4 route protectors updated to redirect at `/auth/login` |
| `ef5d880` | EC-2 | Ported ESITE's `password-strength.ts` (zxcvbn-ts + HIBP Pwned Passwords k-anonymity). New `PasswordStrengthMeter` component wired into SetPassword + ResetPassword. Submit blocked on zxcvbn score < 2 or breach count > 0 |
| `ac3954e` | EC-4 | OTP-first password recovery defends against email-scanner link burn. ForgotPassword now two-step: send 6-digit code via `resetPasswordForEmail` → verify with `verifyOtp({ type: 'recovery' })` |
| `d7de68b` | EC-5 | New `CaptchaTurnstile` component on Login + Signup + ForgotPassword. No-op when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset |
| `180822d` | EC-6 | Magic-link login mode (tab toggle on `/auth/login`). `signInWithOtp` + 6-digit code verify. `shouldCreateUser: false` to prevent account-enumeration creation |
| `f886fa4` | EC-7 | De-duplicated the 4 route protectors. Extracted `useAuthSession`, `useOnboardingStatus`, `AuthLoading`, `OnboardingGate` to `src/components/auth/`. 320 lines removed, 100 added |

Net: 9 commits, ~1,500 lines added, ~1,200 lines removed.

## 2. Why EC-9 was deferred

**EC-9 — Evaluate in-DB hashed invite token (RESPUBLICA pattern) for ecompliance.**

**Decision: defer indefinitely.** RESPUBLICA built a custom SHA-256-hashed,
expiring, single-use invite token system because RESPUBLICA does *not* use
Supabase Auth — its backend is custom Fastify + `@fastify/jwt` + `bcryptjs`.
The invite token had to live somewhere; storing only the hash in the DB is
a sensible defence-in-depth choice for that architecture.

ecompliance *does* use Supabase Auth. Invites go through
`supabase.auth.admin.generateLink({ type: 'invite' })` which returns a
single-use token signed and expired by Supabase. Cloning RESPUBLICA's
pattern on top of Supabase Auth would mean duplicating Supabase's token
management without measurable security benefit.

**Re-evaluate if:** ecompliance ever moves off Supabase Auth (e.g. to a
self-hosted identity provider) — at which point the RESPUBLICA pattern
becomes directly applicable.

## 3. Deployment checklist

The code is committed. None of this auth work is in production yet. Order
matters — items at the top unblock items below.

### 3.1 Supabase backend

- [ ] **Apply migration** `20260525120000_auth_events_audit.sql`
  - `supabase db push` from the project root, OR paste into Supabase
    Dashboard → SQL Editor.
  - Without this, the `log-auth-event` Edge Function (and every audit call
    from the client) will error.

- [ ] **Deploy Edge Functions**
  - `supabase functions deploy log-auth-event` (new — EC-3)
  - `supabase functions deploy send-password-reset` (modified — EC-0)
  - Verify both appear in Dashboard → Edge Functions.

- [ ] **Set Edge Function env vars** (Dashboard → Settings → Edge Functions
      → Environment Variables)
  - `APP_URL` = `https://insight-linker-app.vercel.app` (or your custom
    domain). Used by `send-password-reset`. Falls back to the same value
    in code if unset — setting it lets you swap domains without a deploy.

- [ ] **Authentication → URL Configuration**
  - **Site URL** must match the live frontend URL. This is what
    Supabase puts in the clickable link of password-reset and magic-link
    emails (EC-4, EC-6). If stale (`wm-compliance.lovable.app`) those
    links break.
  - **Redirect URLs** should include the live URL and any preview-branch
    URLs the team uses.

- [ ] **(Optional) Authentication → Auth Providers → Captcha protection**
  - Enable, choose Turnstile, paste the **secret** key.
  - Without this, EC-5 Turnstile tokens sent by the client are ignored
    (no harm, but also no protection).

### 3.2 Vercel

- [ ] **(Optional) Environment Variable**
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` = your Cloudflare Turnstile site key.
  - Add to Production AND Preview environments.
  - Set this only after the Supabase Auth-side Turnstile config (3.1) is
    in place — otherwise auth will reject the token and block all logins.

### 3.3 Smoke tests after deploy

Run these in sequence against the deployed URL.

- [ ] **Login (password)**: existing user signs in → lands on /dashboard or
      their portal. Check `auth_events` for a `login` row.
- [ ] **Login (magic link)**: enter email → 6-digit code arrives → enter
      code → signed in. Check `auth_events` for `magic_link_requested`
      followed by `login` with `method: magic_link`.
- [ ] **Forgot password**: enter email → 6-digit code arrives → enter
      code → land on /auth/reset-password → set new password → signed in
      and redirected. Check `auth_events` for `password_reset_requested`
      then `password_changed`.
- [ ] **Backward-compat**: take an in-flight reset email link from the
      OLD flow (if any are still circulating) — clicking it should now
      route through `/auth` → `/auth/reset-password` and succeed.
- [ ] **Signup**: create a new account → email confirmation lands → admin
      can assign a role. Check `auth_events` for `user_created`.
- [ ] **Invite-accept**: admin invites via `invite-user` → new user clicks
      email link → lands on `/auth/set-password` → sets password → signed
      in. Check `auth_events` for `password_changed` with `method: invite`.
- [ ] **Captcha (if enabled)**: try to submit login without completing
      Turnstile → blocked with "complete the verification challenge".
- [ ] **Password strength**: try setting password `password123` →
      blocked with "found in N data breaches". Try setting `qwerty` →
      blocked with "too weak". Try setting a strong unique password →
      accepted.

## 4. Outstanding items (none)

All EC-0 through EC-9 are either closed, committed, or explicitly deferred
with rationale. The 7 commits ahead of `origin/main` from the earlier
parity-pipeline work (audit, gap, plan, doc) are joined by the auth-
modernisation series from this session — currently **17 commits ahead of
`origin/main`**, none pushed yet.

`origin/main` push is a user decision (production deploys land off it via
Vercel).

### 4.1 Follow-up: self-signup locked (post-EC-9 decision)

After the EC series landed, the open question of self-signup was answered:
**lock it.** Compliance is a B2B product where every user maps to a paying
customer or named contractor — there is no "let me try the product"
persona that benefits from open signup, and a locked door is a clearer
gate than an admin-approval queue that backs up.

What changed:
- `src/views/auth/Signup.tsx` rewritten as an invite-only notice. The
  `/auth/signup` route still resolves (no 404 on old bookmarks) but
  shows "contact your administrator" + a Back-to-Login button.
- `src/views/auth/Login.tsx` — removed the "Don't have an account? Sign up"
  link from both password and magic-link modes; replaced with a single-
  line "No account? This system is invite-only — contact your administrator."
- Signup Zod schema in `validation-schemas.ts` left in place (harmless if
  unused; cheap to re-enable later if needed).

All new accounts now go through the `invite-user` Edge Function (admin-
triggered). Invited users land on `/auth/set-password` to set their
initial password.

To re-enable self-signup: restore Signup.tsx to its prior contents (see
commit 180822d) and restore the sign-up links in Login.tsx.

## 5. Related artifacts

- [AUDIT_BASELINE.md](./AUDIT_BASELINE.md) — codebase audit from earlier in the session
- [PARITY_GAP_ANALYSIS.md](./PARITY_GAP_ANALYSIS.md) — iOS-parity gap analysis
- [WEB_PARITY_PLAN.md](./WEB_PARITY_PLAN.md) — iOS-parity sprint plan
- ESITE.V1 reference: `/Users/arnomattheus/Documents/DEVELOPER/ESITE.V1/esite/apps/web/src/app/(auth)/` and `/Users/arnomattheus/Documents/DEVELOPER/ESITE.V1/esite/apps/web/src/lib/password-strength.ts`
- RESPUBLICA reference: `/Users/arnomattheus/Documents/ARNO MATTHEUS/005 - CLAUDE GENERAL REPORTS/04 - Active Projects/001. RESPUBLICA METERING/03 - Platform Development/src/backend/src/`
