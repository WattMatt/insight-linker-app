# 03 — Auth & Access: Authentication Flows

Ground truth from code as of 2026-06-11. Every claim cites `src/path:line`, a migration
filename, or an edge function path. Anything inferred but not verifiable in this repo is
marked ⚠️ UNVERIFIED.

## 1. Route map

The legacy `/auth` "god page" was split into dedicated routes on 2026-05-25 (EC-1)
(`src/views/Auth.tsx:10-32`). Each App Router page is a thin `"use client"` wrapper around a
view component:

| Route | Page file | View component | Purpose |
|---|---|---|---|
| `/auth` | `src/app/auth/page.tsx` | `src/views/Auth.tsx` | Backward-compat dispatcher for in-flight email links |
| `/auth/login` | `src/app/auth/login/page.tsx` | `src/views/auth/Login.tsx` | Sign-in (password + magic-link modes) |
| `/auth/signup` | `src/app/auth/signup/page.tsx` | `src/views/auth/Signup.tsx` | Static invite-only notice (no form) |
| `/auth/forgot-password` | `src/app/auth/forgot-password/page.tsx` | `src/views/auth/ForgotPassword.tsx` | Request recovery OTP |
| `/auth/reset-password` | `src/app/auth/reset-password/page.tsx` | `src/views/auth/ResetPassword.tsx` | Set new password (recovery session) |
| `/auth/set-password` | `src/app/auth/set-password/page.tsx` | `src/views/auth/SetPassword.tsx` | Set initial password (invite session) |

All `/auth/*` pages render inside `AuthLayout`, a two-column branding shell that fetches
`company_name, company_logo_url, login_hero_image_url` from the `settings` table pre-auth
(`src/views/auth/AuthLayout.tsx:30-37`). This read requires `settings` to stay anon-readable —
the tier-2 anon-read lockdown explicitly excludes `settings` for this reason
(`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:14-15,26`; policy "Public can
view branding only" created in migration `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:103-111`).

Navigation uses a react-router-dom compatibility layer over Next App Router
(`src/lib/navigation.tsx:1-40` — `useNavigate` wraps `next/navigation`'s `router.push/replace`).

Root route `/` (`src/app/page.tsx` → `src/views/Index.tsx:8-31`): if a session exists, reads
`user_roles` and routes Client → `/client-portal`, Contractor → `/contractor`, else
`/dashboard`; with no session navigates to `/auth`.

## 2. Login — `/auth/login`

Two modes via in-page tabs: `"password"` (default) and `"magic-link"` (`src/views/auth/Login.tsx:36-43,237-252`).

**Already-signed-in guard:** on mount, `supabase.auth.getSession()`; if a session exists and
`user_metadata.requires_password_change` is set → `/auth/reset-password`, else
`redirectByRole(user.id)` (`src/views/auth/Login.tsx:60-71`).

### 2.1 Password mode

1. Form validated by `signInSchema` (email format, password non-empty) —
   `src/lib/validation-schemas.ts:95-98`; `src/views/auth/Login.tsx:73`.
2. If captcha enabled and no token, submit is blocked with "Please complete the verification
   challenge." (`src/views/auth/Login.tsx:78-81`).
3. Exact call: `supabase.auth.signInWithPassword({ email, password, ...(captchaToken ? { options: { captchaToken } } : {}) })`
   (`src/views/auth/Login.tsx:82-86`).
4. **Error path:** "Invalid login credentials" is rewritten to "Invalid email or password";
   message shown inline + toast; captcha reset (Turnstile tokens are single-use)
   (`src/views/auth/Login.tsx:88-96,52-57`).
5. **Success:** `recordAuthEvent("login", { method: "password" })`; if
   `user_metadata.requires_password_change` → `/auth/reset-password` (forced change for
   temp-password users, set by invite-user — see §6); else toast "Signed in" and
   `redirectByRole(user.id)` (`src/views/auth/Login.tsx:98-107`).

### 2.2 Magic-link mode (email OTP)

Two steps: `"email"` → `"code"` (`src/views/auth/Login.tsx:37,47`).

1. **Request code:** `supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: false, ...(captchaToken ? { captchaToken } : {}) } })`
   (`src/views/auth/Login.tsx:124-130`). `shouldCreateUser: false` means this path can never
   create an account.
2. **Anti-enumeration:** response time is padded to a random 1.0–1.3 s minimum so unknown
   emails are indistinguishable from known ones (MED #7) (`src/views/auth/Login.tsx:118-135`).
   Errors are never surfaced to the user (dev-only `console.warn`); the UI always advances to
   the code step with toast "Check your email for the 6-digit code"
   (`src/views/auth/Login.tsx:139-147`).
3. **Audit:** `recordAuthEvent("magic_link_requested", { method: "magic_link" })` fires
   unconditionally after the request (`src/views/auth/Login.tsx:137`).
4. **Verify code:** `supabase.auth.verifyOtp({ email: mlEmail, token: mlCode.trim(), type: "email" })`
   (`src/views/auth/Login.tsx:154-158`). Error → "Code expired. Request a new one." or
   "Invalid code. Check the email and try again." (`src/views/auth/Login.tsx:160-170`).
5. **Success:** `recordAuthEvent("login", { method: "magic_link" })`, toast, `redirectByRole`
   (`src/views/auth/Login.tsx:172-174`).

Both forms show "No account? This system is invite-only — contact your administrator."
(`src/views/auth/Login.tsx:308-310,347-349`).

### 2.3 Post-login redirect — `useRoleRedirect`

`redirectByRole(userId)` selects `role` from `user_roles` (`maybeSingle`); `"Client"` →
`/client-portal`, `"Contractor"` → `/contractor`, anything else (including no row / query
error) → `/dashboard` (`src/views/auth/useRoleRedirect.ts:15-33`).

## 3. Signup — `/auth/signup`

**There is no signup form.** The route renders a static notice: "Accounts are created by your
administrator… You'll receive an email invitation to set your password," plus a Back to Login
button. No Supabase calls of any kind (`src/views/auth/Signup.tsx:15-38`). The route is kept
only so old links don't 404; the comment notes the previous form lives at commit `180822d`
(`src/views/auth/Signup.tsx:8-14`).

- The only client-side path that could auto-create a user, `signInWithOtp`, passes
  `shouldCreateUser: false` (`src/views/auth/Login.tsx:127`).
- `signUpSchema` still exists in `src/lib/validation-schemas.ts:101-106` but has **no
  importers** (grep: only definition site) — dead code from the removed form.
- ⚠️ UNVERIFIED: the server-side GoTrue setting `enable_signup=false` cannot be confirmed from
  this repo. `supabase/config.toml` contains only `project_id` and per-function `verify_jwt`
  flags — no `[auth]` block. The repo's own security review flags this as an open action:
  "confirm `enable_signup=false` in the Supabase project so the REST `/signup` endpoint is
  closed regardless of UI" (`docs/security/2026-06-10-phase1-full-app-review.md:85`). Until
  confirmed in the Supabase dashboard, direct `POST /auth/v1/signup` may still work.

## 4. Forgot / reset password

### 4.1 Forgot password — `/auth/forgot-password` (OTP-first, EC-4)

Two steps: `"email"` → `"code"` (`src/views/auth/ForgotPassword.tsx:38,42`).

1. Email validated by `forgotPasswordSchema` (`src/lib/validation-schemas.ts:108-110`).
   Captcha gate identical to login (`src/views/auth/ForgotPassword.tsx:58-61`).
2. Exact call: `supabase.auth.resetPasswordForEmail(trimmed, { redirectTo: \`${window.location.origin}/auth\`, ...(captchaToken ? { captchaToken } : {}) })`
   (`src/views/auth/ForgotPassword.tsx:71-75`). Supabase's email contains both a 6-digit OTP
   and a clickable link (`src/views/auth/ForgotPassword.tsx:26-27`). OTP-first design exists
   because corporate mail scanners pre-fetch and burn single-use links
   (`src/views/auth/ForgotPassword.tsx:33-37`).
3. **Anti-enumeration:** same 1.0–1.3 s timing pad as login; errors logged dev-only; the UI
   always advances to the code step (`src/views/auth/ForgotPassword.tsx:64-91`).
4. **Audit:** `recordAuthEvent("password_reset_requested", { method: "recovery" })`
   unconditionally (`src/views/auth/ForgotPassword.tsx:83`).
5. **Verify code:** `supabase.auth.verifyOtp({ email, token: code.trim(), type: "recovery" })`;
   success establishes a recovery session and navigates to `/auth/reset-password`; failure
   shows expired/invalid message (`src/views/auth/ForgotPassword.tsx:99-117`).
6. The "Back" button discards the consumed captcha token so the widget issues a fresh one
   (`src/views/auth/ForgotPassword.tsx:165-172`).

### 4.2 Reset password — `/auth/reset-password`

Requires an existing (recovery) session. On mount, `getSession()`; if none → toast "Reset link
expired. Request a new one." and redirect to `/auth/forgot-password`
(`src/views/auth/ResetPassword.tsx:40-47`).

Submit path (`src/views/auth/ResetPassword.tsx:49-85`):
1. `setPasswordSchema`: min 8 / max 72 chars, confirm must match
   (`src/lib/validation-schemas.ts:113-121`).
2. Strength + breach gate: `evaluatePassword(password)`; reject if zxcvbn `score < 2`
   ("Password is too weak…") or `pwned` (message includes HIBP breach count). HIBP network
   failure does not block (`pwned: null`) (`src/views/auth/ResetPassword.tsx:52-63`,
   `src/lib/password-strength.ts:77-88`).
3. Exact call: `supabase.auth.updateUser({ password })` (`src/views/auth/ResetPassword.tsx:65`).
   Weak-password server errors (message contains "weak"/"pwned" or `code === "weak_password"`)
   get a friendly message (`src/views/auth/ResetPassword.tsx:66-73,121-128`).
4. Side effects on success: second `updateUser({ data: { requires_password_change: false } })`
   clears the forced-change flag; `recordAuthEvent("password_changed", { method: "recovery" })`;
   toast "Password updated. Signing you in..."; `redirectByRole(user.id)`
   (`src/views/auth/ResetPassword.tsx:79-84`).

### 4.3 Orphaned edge function: `send-password-reset`

`supabase/functions/send-password-reset/index.ts` builds a recovery link via
`supabase.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: \`${APP_URL}/auth\` } })`
(lines 73-79), constructs `resetUrl = ${appUrl}/auth?type=recovery&token=${hashed_token}`
(lines 100-103), and sends a branded HTML email via Resend from
`noreply@watsonmattheus.com` (lines 189-194). It rate-limits 5 req/min/IP per isolate
(lines 15-29) and always answers success-shaped on unknown emails (lines 81-94).
**No caller exists in `src/`** (grep for `send-password-reset` matches only a comment at
`src/views/Auth.tsx:27`). The client flow uses `resetPasswordForEmail` directly (§4.1).
The `/auth?type=recovery&token=...` URL shape it emits is still handled by the dispatcher (§5).
It is also absent from `supabase/config.toml`, so its `verify_jwt` behaviour falls to the
platform default — ⚠️ UNVERIFIED which default applies to the deployed instance.

## 5. `/auth` dispatcher (legacy email-link handler)

`src/views/Auth.tsx` parses query (`type`, `token`) and hash (`access_token`, `refresh_token`)
on mount (`src/views/Auth.tsx:39-44`) and dispatches:

| Input | Action | Success → | Failure → |
|---|---|---|---|
| `?type=invite` + `#access_token=…&refresh_token=…` | scrub URL via `history.replaceState` **before** the async call (MED #6), then `supabase.auth.setSession({ access_token, refresh_token })` (`src/views/Auth.tsx:79-99`) | `/auth/set-password` | toast "Invalid or expired invite link…" → `/auth/login` |
| `?type=recovery&token=…` | scrub URL, then `supabase.auth.verifyOtp({ token_hash: token, type: "recovery" })` (`src/views/Auth.tsx:102-120`) | `/auth/reset-password` | toast "Invalid or expired reset link…" → `/auth/forgot-password` |
| anything else | subscribe `onAuthStateChange`; `PASSWORD_RECOVERY` event with session → `/auth/reset-password` (`src/views/Auth.tsx:60-64`); meanwhile `getSession()`: `requires_password_change` → `/auth/reset-password`, else → `/auth/login` (`src/views/Auth.tsx:68-74`) | — | — |

Renders a full-page `LoadingState` with status text while dispatching (`src/views/Auth.tsx:122`).

## 6. Invite acceptance — set-password flow

### 6.1 Server side: `invite-user` edge function

`supabase/functions/invite-user/index.ts`; `verify_jwt = true` (`supabase/config.toml`
`[functions.invite-user]`). Invoked from the admin Users screen
(`src/views/Users.tsx:244,286,352` — send-invite, invite, resend mutations).

Flow (new-user, no temp password):
1. Caller must hold a valid JWT and an `Admin` row in `user_roles`
   (`supabase/functions/invite-user/index.ts:32-54`).
2. Validation: Client role requires `clientId`; Contractor requires ≥1 `siteIds`;
   `temporaryPassword`, if given, must be ≥6 chars
   (`supabase/functions/invite-user/index.ts:61-73`).
3. `supabase.auth.admin.createUser({ email, email_confirm: <true iff temp password>, user_metadata: { full_name, role, requires_password_change: <true iff temp password> } })`
   (`supabase/functions/invite-user/index.ts:226-247`).
4. Role row inserted/updated in `user_roles`; Client → `user_clients` mapping; Contractor →
   `user_sites` mappings (`supabase/functions/invite-user/index.ts:253-326`).
5. `supabase.auth.admin.generateLink({ type: 'invite', email, options: { data: { full_name, role }, redirectTo: \`${origin}/auth?type=invite\` } })`
   (`supabase/functions/invite-user/index.ts:351-361`); `origin` taken from the request's
   `origin`/`referer` header (`supabase/functions/invite-user/index.ts:76-77`).
6. Branded HTML email sent via Resend **from `noreply@watsonmattheus.com`** (was `onboarding@resend.dev`; fixed under G-SEC-06, deployed v298), linking
   `inviteData.properties.action_link` (`supabase/functions/invite-user/index.ts:371,451-456`).

Variants:
- **Temp password** (new or resend): password set directly, `email_confirm: true`,
  `requires_password_change: true`; **no email is sent** — the temp password is returned to
  the admin in the JSON response (`supabase/functions/invite-user/index.ts:104-107,179-195,329-348`).
  The user then logs in with the temp password and is forced to `/auth/reset-password`
  (`src/views/auth/Login.tsx:100-103`).
- **Resend to a confirmed user:** sends `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${origin}/auth\` })`
  instead of an invite (`supabase/functions/invite-user/index.ts:197-222`).
- **Existing user without `isResend`:** rejected ("User with this email already exists…")
  (`supabase/functions/invite-user/index.ts:223-224`).

### 6.2 Client side: `/auth/set-password`

Reached after the dispatcher's invite branch (§5) establishes a session. On mount: no session
→ toast "Invite link expired. Ask your admin for a new invitation." → `/auth/login`; otherwise
displays the session email in the subtitle (`src/views/auth/SetPassword.tsx:40-51,97-99`).

Submit (`src/views/auth/SetPassword.tsx:53-94`): re-checks session, runs the same
`evaluatePassword` gate (score ≥ 2, not pwned) as §4.2, then `supabase.auth.updateUser({ password })`,
then `updateUser({ data: { requires_password_change: false } })`, then
`recordAuthEvent("password_changed", { method: "invite" })`, toast "Password set. Welcome!",
`redirectByRole(user.id)`.

### 6.3 DB side effects of any user creation

Trigger `on_auth_user_created` → `public.handle_new_user()` inserts a `profiles` row
(id, email, full_name from metadata) and a `user_roles` row — role `'Admin'` only for the very
first user (`COUNT(*) FROM auth.users = 1`), `'User'` otherwise
(migration `20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql`, function body lines 7-31;
earlier defective versions in `20251014114352_…sql:175-196` and `20251020093607_…sql:2-39`
granted Admin more broadly — see `docs/security/2026-06-09-auth-access-security-audit.md:100`).
invite-user tolerates the trigger-created role row and updates it to the requested role
(`supabase/functions/invite-user/index.ts:253-290`).

## 7. In-app password change (self-service)

`MyProfile` → `handleChangePassword` (`src/views/MyProfile.tsx:148`): min 8 chars + match
check, then re-authentication via `supabase.auth.signInWithPassword({ email: profile.auth_email || profile.email, password: currentPassword })`
("Current password is incorrect" on failure) (`src/views/MyProfile.tsx:163-170`), then the same
`evaluatePassword` gate, then `supabase.auth.updateUser({ password: newPassword })`
(`src/views/MyProfile.tsx:185`), then `recordAuthEvent("password_changed", { method: "self" })`
(`src/views/MyProfile.tsx:194`).

## 8. Session handling

### 8.1 Client configuration

`src/integrations/supabase/client.ts:15-21`: `createClient(SUPABASE_URL, ANON_KEY, { auth: { storage: window.localStorage, persistSession: true, autoRefreshToken: true } })`.
Env vars `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`; module throws at import
if missing (`src/integrations/supabase/client.ts:5-10`).

There is **no Next.js middleware and no server-side session check** — no `middleware.ts`
exists (verified by `ls`); all gating is client-side route protectors + RLS.

### 8.2 Session state hook

`useAuthSession()` subscribes to `supabase.auth.onAuthStateChange` and seeds with
`getSession()`; exposes `{ session, isLoading }` (`src/components/auth/useAuthSession.ts:14-31`).

### 8.3 Route protectors

| Component | No session → | Role rules | Onboarding gate |
|---|---|---|---|
| `ProtectedRoute` (`src/components/ProtectedRoute.tsx:8-23`) | `/auth/login` | Contractor → `/contractor`; Client → `/client-portal` | yes |
| `AuthOnlyRoute` (`src/components/AuthOnlyRoute.tsx:5-13`) | `/auth/login` | none | no |
| `ClientProtectedRoute` (`src/components/ClientProtectedRoute.tsx:8-29`) | `/auth/login` | Admin + `?preview=` renders children; non-Client → `/dashboard` | yes |
| `ContractorProtectedRoute` (`src/components/ContractorProtectedRoute.tsx:9-34`) | `/auth/login` | Admin + `?preview=` renders children; non-Contractor → `/dashboard`; path must start `/contractor` | yes, plus `OrphanResolutionModal` |

Role comes from `useUserRole()` — TanStack query on `user_roles` keyed by user id, 5-min
staleTime; on auth-state user change it removes `user-role`, `onboarding-status`, and
`user-client-info` query caches (`src/hooks/useUserRole.tsx:18-51`).

### 8.4 Logout

All logout paths log the audit event **before** `signOut()` (after sign-out the JWT is
invalid and log-auth-event could not derive `user_id`):

| Trigger | Code | Calls | Redirect |
|---|---|---|---|
| Sidebar logout (staff) | `src/components/AppSidebar.tsx:112-123` | `recordAuthEvent("logout")` → `supabase.auth.signOut()` | `/auth/login` (toast; error toast if signOut fails) |
| Client portal logout | `src/components/ClientPortalLayout.tsx:73-89` | same; admin-in-preview just navigates to `/portal-management` without signing out | `/auth/login` |
| Contractor portal logout | `src/components/ContractorPortalLayout.tsx:68-80` | same incl. preview short-circuit | `/auth/login` |
| Daily auto-logout | `src/components/SessionWatcher.tsx:46-68` | `clearAllCaches()` → `recordAuthEvent("logout", { reason: "session_expired" })` → `signOut()` | `/auth/login` (replace) + "Your session has expired" toast |

### 8.5 Scheduled auto-logout — `SessionWatcher`

Mounted globally in `Providers` (`src/app/providers.tsx:28`). Polls every 60 s; reads
`settings.auto_logout_enabled` / `auto_logout_time` (refreshed every 5 min)
(`src/components/SessionWatcher.tsx:9,25-44,121-145`). When enabled, a session exists, and the
clock matches the configured HH:MM (once per day, tracked via localStorage key
`wm_last_auto_logout_date`), it warns 30 s ahead then performs the logout above
(`src/components/SessionWatcher.tsx:70-119`). `clearAllCaches()` wipes app IndexedDB
databases, localStorage, and service-worker caches (`src/lib/cacheUtils.ts:15-36`).

Public QR-review views also call `supabase.auth.signOut({ scope: 'local' })` before fetching,
to drop any stale session (`src/views/PublicSiteReview.tsx:136-137`,
`src/views/PublicSubsectionReview.tsx:132-133`, `src/views/PublicClientPortfolio.tsx:54-55`).

## 9. Onboarding gate

- `profiles.onboarding_completed boolean DEFAULT false` added in migration
  `20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql` (lines 1-3).
- `useOnboardingStatus(enabled)` — TanStack query: `getUser()` then
  `profiles.select("onboarding_completed").eq("id", user.id).single()`
  (`src/components/auth/useOnboardingStatus.ts:10-25`).
- `OnboardingGate` renders `OnboardingWizard` alongside children when a status row exists,
  `onboarding_completed` is falsy, and the wizard hasn't been dismissed this mount
  (`src/components/auth/OnboardingGate.tsx:15-32`). Children are **not blocked** — the wizard
  is a dialog overlay.
- `OnboardingWizard` (4 steps: Welcome, Profile, Photo, Overview —
  `src/components/OnboardingWizard.tsx:19`) prefills from `profiles`, optionally uploads an
  avatar to the `profile-images` storage bucket (`src/components/OnboardingWizard.tsx:84-96`),
  and on completion updates `profiles` with the entered fields plus
  `onboarding_completed: true` (`src/components/OnboardingWizard.tsx:104-130`).
- Used by `ProtectedRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute` (§8.3);
  `onComplete` refetches the status query (`src/components/ProtectedRoute.tsx:19`).

## 10. Auth audit logging

### 10.1 Client helper — `recordAuthEvent`

`src/lib/auth-audit.ts:87-105`. Fire-and-forget: invokes the `log-auth-event` edge function
via `supabase.functions.invoke("log-auth-event", { body: { event_type, metadata } })`
(`src/lib/auth-audit.ts:60-69`). Failures are queued in localStorage
(`wm_auth_audit_retry_queue`, capped at 50) and replayed on the next successful call or on
module load (`src/lib/auth-audit.ts:13-14,71-85,94-104`). ⚠️ UNVERIFIED (SDK behaviour, not
repo code): `functions.invoke` attaches the current session's access token as the
`Authorization` header, which is how authed events carry the JWT.

Event/metadata types: `AuthEventType` (11 values) and `AuthEventMetadata`
(`method | reason | error_code`) at `src/lib/auth-audit.ts:16-33`.

### 10.2 Edge function — `log-auth-event`

`supabase/functions/log-auth-event/index.ts`; `verify_jwt = false` in `supabase/config.toml`
(`[functions.log-auth-event]`, with comment explaining anon-callability for pre-session events).

- **ANON_EVENTS** = `password_reset_requested`, `magic_link_requested`, `lockout` — any
  `Authorization` header is deliberately ignored; `user_id` forced NULL (lines 29-33,139-141).
- **AUTHED_EVENTS** = `login`, `logout`, `password_changed`, `mfa_enrolled`, `mfa_unenrolled`,
  `account_deleted`, `account_email_changed`, `user_created` — require `Bearer` JWT validated
  via `supabase.auth.getUser(token)`; `user_id` taken from the verified JWT; otherwise 401
  (lines 35-44,126-137).
- Unknown event types → 400 (lines 112-116). Metadata sanitised to allowlist
  `method|reason|error_code`, string ≤200 chars (lines 47,76-85).
- Rate limit: 20 req/min/IP, in-memory per Deno isolate (best-effort only) (lines 49-74,95-100).
- Insert via service-role client into `public.auth_events` with `ip_address` (first
  `x-forwarded-for` hop) and `user_agent` (≤500 chars); 204 on success (lines 118-162).

### 10.3 Table — `public.auth_events`

Migration `20260525120000_auth_events_audit.sql`: columns
`id uuid PK / user_id uuid (nullable, no FK — rows must outlive user deletion) / event_type
text CHECK(11 values) / ip_address inet / user_agent text / metadata jsonb default '{}' /
occurred_at timestamptz default now()` (lines 18-38); indexes on user_id, event_type,
occurred_at DESC (lines 40-42). RLS enabled; sole policy:

```sql
CREATE POLICY "auth_events: user reads own"
    ON public.auth_events
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
```

(lines 48-53). No INSERT policy — writes are service-role only (bypasses RLS, lines 44-45).

### 10.4 Emitter inventory (every `recordAuthEvent` call site)

| Event | Metadata | Call site |
|---|---|---|
| `login` | `method: "password"` | `src/views/auth/Login.tsx:99` |
| `login` | `method: "magic_link"` | `src/views/auth/Login.tsx:172` |
| `magic_link_requested` | `method: "magic_link"` | `src/views/auth/Login.tsx:137` |
| `password_reset_requested` | `method: "recovery"` | `src/views/auth/ForgotPassword.tsx:83` |
| `password_changed` | `method: "recovery"` | `src/views/auth/ResetPassword.tsx:82` |
| `password_changed` | `method: "invite"` | `src/views/auth/SetPassword.tsx:91` |
| `password_changed` | `method: "self"` | `src/views/MyProfile.tsx:194` |
| `logout` | — | `src/components/AppSidebar.tsx:115`, `src/components/ClientPortalLayout.tsx:81`, `src/components/ContractorPortalLayout.tsx:76` |
| `logout` | `reason: "session_expired"` | `src/components/SessionWatcher.tsx:57` |

**Defined but never emitted anywhere in the codebase:** `lockout`, `mfa_enrolled`,
`mfa_unenrolled`, `account_deleted`, `account_email_changed`, `user_created` (grep across
`src/` and `supabase/functions/` finds no emitters; neither `invite-user` nor `delete-user`
writes to `auth_events`). User creation and deletion therefore leave **no auth_events row**.

## 11. Supporting pieces

### 11.1 Captcha — Cloudflare Turnstile

`src/components/CaptchaTurnstile.tsx`: renders nothing and `CAPTCHA_ENABLED === false` when
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset (lines 20-21,104). Token passed to consumers via
`onTokenChange`; imperative `reset()` required after failed submits (tokens single-use,
lines 8-18,36-39,52-64). Comment: real enforcement is Supabase project-level captcha
protection; the client gate is defence-in-depth (lines 16-18). Used on Login (both modes)
and ForgotPassword (`src/views/auth/Login.tsx:302,341`;
`src/views/auth/ForgotPassword.tsx:206`); **not** on Reset/SetPassword (session already
exists there). `.env.example` documents the key as optional and notes the secret lives in
Supabase only (`.env.example`, Turnstile block). ⚠️ UNVERIFIED: whether captcha enforcement
is actually enabled in the Supabase dashboard, and whether the prod deployment sets
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

### 11.2 Password strength stack

- `src/lib/password-strength.ts`: lazy-loaded zxcvbn-ts scoring (0-4) (lines 23-42);
  HIBP Pwned Passwords k-anonymity check — only first 5 SHA-1 hex chars sent to
  `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true`; network failure
  returns `null` = unknown, never blocks (lines 53-75); `evaluatePassword` combines both
  (lines 77-88).
- `PasswordStrengthMeter` — advisory live meter, 250 ms debounce, 5-segment bar + label +
  breach warning + up to 2 suggestions when score < 3; never blocks submit
  (`src/views/auth/PasswordStrengthMeter.tsx:15-77`). The blocking gate is in each form's
  `onSubmit` (§4.2, §6.2, §7).
- Schemas: min 8 / max 72 with confirm-match for set/reset (`src/lib/validation-schemas.ts:113-121`).

### 11.3 `requires_password_change` lifecycle

Set to `true` in `user_metadata` by invite-user when a temporary password is used
(`supabase/functions/invite-user/index.ts:99,233`). Checked at `/auth/login` mount and after
password login (`src/views/auth/Login.tsx:63,100`) and at the `/auth` dispatcher
(`src/views/Auth.tsx:69`) — all route to `/auth/reset-password`. Cleared by
`updateUser({ data: { requires_password_change: false } })` in both ResetPassword and
SetPassword (`src/views/auth/ResetPassword.tsx:80`, `src/views/auth/SetPassword.tsx:89`).
Enforcement is client-side only — nothing server-side blocks API access while the flag is set.

## Open questions

1. **Server-side `enable_signup`** — expected `false`, but not verifiable from the repo (no
   `[auth]` block in `supabase/config.toml`); the repo's own review lists confirming it as an
   open action (`docs/security/2026-06-10-phase1-full-app-review.md:85`). Needs a dashboard /
   Management API check: is `POST /auth/v1/signup` actually closed?
2. **Supabase captcha enforcement** — is Turnstile protection enabled project-side, and is
   `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set in the prod Vercel env? Client code degrades to
   no-captcha when unset (`src/components/CaptchaTurnstile.tsx:20-21`).
3. **`send-password-reset` deployment status** — the function exists in-repo with no callers
   (§4.3). Is it still deployed/invocable in prod, and with what `verify_jwt` setting (absent
   from `supabase/config.toml`)? If anon-invocable it is an unauthenticated email-sending
   endpoint (rate-limited 5/min/IP per isolate only).
4. **Audit gaps by design or omission?** `user_created`, `account_deleted`, `lockout`, and the
   MFA event types have no emitters (§10.4). Unclear whether emission was planned for
   `invite-user`/`delete-user` and dropped, or intentionally deferred.
5. **OTP/recovery token lifetimes** — emails claim "expires in 1 hour"
   (`supabase/functions/send-password-reset/index.ts:144,177`), but actual GoTrue OTP expiry
   is server config, not in repo.
6. ~~**Invite-email sender mismatch**~~ — **RESOLVED (G-SEC-06):** invite-user now also sends
   from `noreply@watsonmattheus.com` (`supabase/functions/invite-user/index.ts:466`, deployed v298),
   matching send-password-reset. The old `onboarding@resend.dev` (Resend sandbox sender) only
   delivered to the account owner, so external invites were likely failing silently.
7. **invite-user `redirectTo` derives from the request `origin` header**
   (`supabase/functions/invite-user/index.ts:76-77`) rather than the `APP_URL` env used by
   send-password-reset — invite links generated from a preview deployment would point at that
   preview host. Behaviour confirmed in code; whether it is acceptable is a product question.
