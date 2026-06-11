# Routes — `/auth/*` (authentication)

Ground-truth reference for the six auth routes. Each `src/app/<route>/page.tsx` is a thin
`"use client"` wrapper that renders one view component from `src/views/`. This document focuses
on what each route **renders + redirects** and the **data it touches**; the end-to-end flow
detail (OTP, invite, recovery token mechanics) lives in
`docs/system-reference/03-auth-and-access/auth-flows.md`, `token-systems.md`, and
`user-lifecycle.md`.

## Access group

All six routes are **public** (no `(admin)`/`(client-portal)`/`(contractor)` route group, no
layout guard). They are reachable unauthenticated by design — they ARE the gate. None render
business data; their only pre-auth DB read is the `settings` branding fetch (see §0.2).

There is no Next.js `middleware.ts` enforcing auth at these routes — access control is entirely
client-side redirect logic inside the view components, backed by Supabase RLS on any data they
touch. (No `src/middleware.ts` present — ⚠️ UNVERIFIED by absence; searched, none found.)

## 0.1 Shared shell — `AuthLayout`

Every view renders inside `AuthLayout` (`src/views/auth/AuthLayout.tsx:21-90`), a two-column
branding shell: left = logo + heading + form (`children`), right = hero image with gradient
fallback.

## 0.2 Pre-auth `settings` read (applies to ALL six routes)

`AuthLayout` runs one query on mount, **before** the user is authenticated
(`src/views/auth/AuthLayout.tsx:31-37`):

```
supabase.from("settings").select("company_name, company_logo_url, login_hero_image_url").single()
```

- **Server-side gate:** policy `"Public can view branding only"` —
  `ON public.settings FOR SELECT TO public USING (true)`
  (`supabase/migrations/20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:106-110`). This
  policy is deliberately **excluded** from the 2026-06-11 tier-2 anon-read lockdown so the
  pre-auth branding fetch keeps working (cross-ref
  `docs/system-reference/03-auth-and-access/auth-flows.md:22-27`).
- **⚠️ Column scoping is client-only.** The RLS policy is `USING (true)` with **no column
  restriction** — it grants `anon`/`public` SELECT on *every* column of `settings`, not just the
  three branding columns. The narrowing to `company_name, company_logo_url,
  login_hero_image_url` is enforced solely by the `.select(...)` list in the client query
  (`AuthLayout.tsx:33`). An attacker can issue a raw PostgREST `select=*` against `settings`
  with only the anon key and read any other columns the row holds. The in-code comment
  (`AuthLayout.tsx:26-29`) acknowledges this constraint ("Limit the SELECT to branding columns
  only — never add anything that could leak business config / keys"). → **security_flag**.

---

## 1. `/auth` — backward-compat dispatcher

| | |
|---|---|
| **Page** | `src/app/auth/page.tsx:1-3` |
| **View** | `src/views/Auth.tsx:34-125` |
| **Renders** | `<LoadingState variant="full-page" message={status} />` only (`src/views/Auth.tsx:122`) — never a form. Pure redirect hub. |

**Purpose.** Handles in-flight email links still pointing at the old single-page URL shape and
forwards to the dedicated routes (`src/views/Auth.tsx:10-32`).

**Access context & guard.** Public. No data render, so no RLS dependency for display. On mount
(`src/views/Auth.tsx:38-77`) it inspects `window.location` query + hash and dispatches:

| Condition (URL) | Action | Cite |
|---|---|---|
| `?type=invite` + hash `access_token` & `refresh_token` | `handleInviteToken` → `setSession` → `/auth/set-password` | `:46-50,79-100` |
| `?type=recovery&token=...` | `handleRecoveryToken` → `verifyOtp({type:"recovery"})` → `/auth/reset-password` | `:52-56,102-120` |
| SDK `PASSWORD_RECOVERY` event fires with session | `/auth/reset-password` | `:60-64` |
| else, session w/ `user_metadata.requires_password_change` | `/auth/reset-password` | `:68-72` |
| else (default) | `/auth/login` | `:73` |

**Data reads.** None (no table/RPC). Reads SDK auth state only: `supabase.auth.onAuthStateChange`
(`:60`), `supabase.auth.getSession()` (`:68`).

**Data writes/mutations.**
- `supabase.auth.setSession({access_token, refresh_token})` (`:86-89`) — establishes an
  authenticated session from invite-link tokens.
- `supabase.auth.verifyOtp({token_hash, type:"recovery"})` (`:106-109`) — establishes a recovery
  session from a recovery link token.
- No DB inserts/updates/uploads.

**Token handling / security.**
- Invite + recovery tokens are scrubbed from `window.location` via `history.replaceState({}, ...,
  "/auth")` **before** the async `setSession`/`verifyOtp` runs (`:85`, `:105`) — prevents
  concurrent analytics/Sentry breadcrumbs from capturing the token (labelled "MED #6").
- Invalid/expired tokens: toast + redirect to `/auth/login` (invite) or `/auth/forgot-password`
  (recovery) — never establishes a session (`:91-97,111-117`).
- An attacker holding a valid, unexpired invite or recovery token from the email IS the
  legitimate user for that token: `setSession`/`verifyOtp` are validated server-side by Supabase
  GoTrue; this route does no privileged action beyond what the token authorises. No tenant data
  is read here.

---

## 2. `/auth/login` — sign-in

| | |
|---|---|
| **Page** | `src/app/auth/login/page.tsx:1-5` |
| **View** | `src/views/auth/Login.tsx:39-354` |
| **Renders** | Two-mode form: `password` (default) and `magic-link` tabs (`:237-252`). Magic-link has a second `code` step (`:178-232`). |

**Access context & guard.** Public. **Already-signed-in guard** (client-side only): on mount,
`supabase.auth.getSession()`; if session exists → `requires_password_change` ⇒
`/auth/reset-password`, else `redirectByRole(user.id)` (`:60-71`). No server guard needed —
the route renders no protected data.

**Data reads.**
- `supabase.auth.getSession()` (`:61`) — mount guard.
- `useRoleRedirect.redirectByRole` (`:41`, used `:67,106,174`) →
  `supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle()`
  (`src/views/auth/useRoleRedirect.ts:16-20`). Gated by RLS `"Users can view their own roles"`
  (`ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id)`,
  cross-ref `docs/.../access-contexts-and-roles.md:60`). Runs only after a session exists, so the
  user can only read their own role row.

**Data writes/mutations (auth + audit, no business-table writes).**
- Password mode: `supabase.auth.signInWithPassword({email, password, options?: {captchaToken}})`
  (`:82-86`).
- Magic-link request: `supabase.auth.signInWithOtp({email, options:{shouldCreateUser:false,
  captchaToken?}})` (`:124-130`).
- Magic-link verify: `supabase.auth.verifyOtp({email, token, type:"email"})` (`:154-158`).
- `recordAuthEvent(...)` on success/request (`:99,137,172`) → invokes `log-auth-event` edge
  function (`src/lib/auth-audit.ts:62-66`). That function requires a valid JWT for authed event
  types and rejects no/invalid JWT with 401, with a per-IP 20 req/min rate limit
  (`supabase/functions/log-auth-event/index.ts:12-20,50-51`).

**Validation / anti-abuse.**
- Password form: `signInSchema` (email format + password `min(1)`) —
  `src/lib/validation-schemas.ts:95-98`, applied `:73`.
- Magic-link form: `forgotPasswordSchema` (email format) — `:108-110`, applied `:74`.
- Captcha (Cloudflare Turnstile) required for both modes iff `CAPTCHA_ENABLED`
  (= `NEXT_PUBLIC_TURNSTILE_SITE_KEY` set) (`:78-81,112-115`;
  `src/components/CaptchaTurnstile.tsx:20-21`). Token reset after failed attempt (single-use)
  (`:54-57,94`).
- **User-enumeration defense (MED #7):** magic-link request pads response to a random 1.0–1.3 s
  and always advances to the code step regardless of whether the email exists; never reveals
  account existence (`:118-147`). Errors only `console.warn` in development (`:139-141`).

**Security check.** No data or mutation exposed beyond the user's own session. `redirectByRole`'s
`user_roles` read is RLS-scoped to `auth.uid()`. The already-signed-in guard is client-only, but
it is a UX redirect, not an access gate — no protected data is rendered on this route to leak.
No flag.

---

## 3. `/auth/signup` — invite-only notice (no form)

| | |
|---|---|
| **Page** | `src/app/auth/signup/page.tsx:1-5` |
| **View** | `src/views/auth/Signup.tsx:15-38` |
| **Renders** | Static notice: "This system is invite-only" + "Back to Login" link (`:17-35`). **No form, no inputs.** |

**Access context & guard.** Public. Self-signup is disabled — the route is preserved only so old
links/bookmarks don't 404 (`src/views/auth/Signup.tsx:8-14`). To re-enable, restore the form from
commit `180822d` (per in-code note `:13-14`).

**Data reads.** None except the `AuthLayout` `settings` branding fetch (§0.2).

**Data writes/mutations.** None. There is no signup call — `supabase.auth.signUp` is **not**
invoked anywhere in this view.

**Security check.** Inert static page. No exposure. No flag. (Account creation is
admin-only via the `invite-user` edge function — see `user-lifecycle.md`.)

---

## 4. `/auth/forgot-password` — request recovery OTP

| | |
|---|---|
| **Page** | `src/app/auth/forgot-password/page.tsx:1-5` |
| **View** | `src/views/auth/ForgotPassword.tsx:40-220` |
| **Renders** | Two steps: `email` (request, default) → `code` (enter 6-digit OTP) (`:38,119-218`). |

**Access context & guard.** Public — must be reachable by a user who has lost access. No
already-signed-in guard. No protected data rendered.

**Data reads.** None (besides `AuthLayout` §0.2).

**Data writes/mutations.**
- `supabase.auth.resetPasswordForEmail(email, {redirectTo: `${origin}/auth`, captchaToken?})`
  (`:71-75`). `redirectTo` is the `/auth` dispatcher (§1) — the email's clickable link routes
  back through it.
- `supabase.auth.verifyOtp({email, token, type:"recovery"})` (`:99-103`) — on success establishes
  a recovery session, then `navigate("/auth/reset-password")` (`:116`).
- `recordAuthEvent("password_reset_requested", {method:"recovery"})` (`:83`) → `log-auth-event`
  edge fn (anon-allowed event type; rate-limited per IP).

**Validation / anti-abuse.**
- `forgotPasswordSchema` (email format) — `src/lib/validation-schemas.ts:108-110`, applied `:54`.
- Captcha required iff `CAPTCHA_ENABLED` (`:58-61`); discarded on Back (consumed by send-code)
  (`:169-171`).
- **User-enumeration defense (MED #7):** `resetPasswordForEmail` padded to random 1.0–1.3 s, and
  the view always advances to the code step + shows the same toast regardless of whether the
  address exists (`:64-92`). Errors `console.warn` in dev only (`:85-87`).
- OTP-first by design: corporate email scanners pre-fetch + burn single-use links, so the 6-digit
  code is the primary path; the link is fallback (in-code rationale `:24-36,140-142`).

**Security check.** The OTP/link are validated server-side by Supabase GoTrue. An attacker who
submits an arbitrary email learns nothing (enumeration-flattened) and cannot obtain a session
without the code/link delivered to that mailbox. No tenant data touched. No flag.

---

## 5. `/auth/reset-password` — set new password (recovery session)

| | |
|---|---|
| **Page** | `src/app/auth/reset-password/page.tsx:1-5` |
| **View** | `src/views/auth/ResetPassword.tsx:25-148` |
| **Renders** | New-password + confirm form with `PasswordStrengthMeter` (`:87-118`). |

**Access context & guard.** Public route, but **session-gated client-side**: on mount,
`supabase.auth.getSession()`; if no session ⇒ toast "Reset link expired" + redirect to
`/auth/forgot-password` (`:40-47`). Reached only after the `/auth` dispatcher verified a recovery
token (§1) or the SDK's `PASSWORD_RECOVERY` event established a recovery session.

**Server-side gate.** The decisive control is the recovery **session** itself:
`supabase.auth.updateUser({password})` runs as the session's user — GoTrue rejects it without a
valid session. RLS is not the gate here; the recovery session (held only by whoever proved
mailbox control) is.

**Data reads.** `supabase.auth.getSession()` (`:41,` and the strength check). No tables/RPCs.
`redirectByRole` runs after success (reads own `user_roles` row, RLS-scoped — see §2).

**Data writes/mutations.**
- `evaluatePassword(password)` (`src/lib/password-strength`, `:53`) — strength scoring + HIBP
  breach check; blocks score `< 2` or pwned (`:54-63`). Best-effort: HIBP network failure does not
  block.
- `supabase.auth.updateUser({password})` (`:65`) — sets the new password.
- `supabase.auth.updateUser({data:{requires_password_change:false}})` (`:80`) — clears the
  forced-change flag.
- `recordAuthEvent("password_changed", {method:"recovery"})` (`:82`).
- Then `redirectByRole(data.user.id)` (`:84`).

**Security check.** Mutation (`updateUser`) is authorised solely by the recovery session;
client-side `getSession` guard is backstopped by GoTrue rejecting the password update without a
valid session. No business data exposed. No flag.

---

## 6. `/auth/set-password` — set initial password (invite session)

| | |
|---|---|
| **Page** | `src/app/auth/set-password/page.tsx:1-5` |
| **View** | `src/views/auth/SetPassword.tsx:24-159` |
| **Renders** | New-password + confirm form with `PasswordStrengthMeter`; subtitle greets the invited email (`:96-128`). |

**Access context & guard.** Public route, **session-gated client-side**: on mount,
`supabase.auth.getSession()`; if no session ⇒ toast "Invite link expired" + redirect to
`/auth/login` (`:40-51`); else stores `session.user.email` for the greeting (`:49`). Reached only
after the `/auth` dispatcher established an invite session via `setSession` (§1). A second
`getSession` check guards the submit handler (`:55-59`).

**Server-side gate.** Same model as §5 — the invite **session** (created from the invite link's
`access_token`/`refresh_token`) authorises `updateUser`. GoTrue rejects without a valid session.

**Data reads.** `supabase.auth.getSession()` (`:41,55`). No tables/RPCs. `redirectByRole` after
success (own `user_roles` row, RLS-scoped — see §2).

**Data writes/mutations.**
- `evaluatePassword(password)` (`:62`) — strength + HIBP gate, same as §5 (`:63-72`).
- `supabase.auth.updateUser({password})` (`:74`) — sets the initial password.
- `supabase.auth.updateUser({data:{requires_password_change:false}})` (`:89`) — clears the flag
  invite users may carry.
- `recordAuthEvent("password_changed", {method:"invite"})` (`:91`).
- Then `redirectByRole(data.user.id)` (`:93`).

**Security check.** Identical posture to §5: mutation authorised by the invite session,
client-side guard backstopped by GoTrue. No business data exposed. No flag.

---

## Cross-cutting notes

- **`redirectByRole` role map** (`src/views/auth/useRoleRedirect.ts:26-32`): `Client` →
  `/client-portal`, `Contractor` → `/contractor`, everyone else (Admin/User/Moderator/no-role) →
  `/dashboard`. A role-fetch error is swallowed (warn-in-dev) and falls through to `/dashboard`
  (`:22-24,30-32`) — ⚠️ a transient `user_roles` read failure would route a Client/Contractor to
  the admin-style `/dashboard` (those routes have their own layout guards, so this is a UX, not
  access, concern — guard enforcement is out of scope for this doc; see route docs for
  `/dashboard`, `/client-portal`, `/contractor`).
- **Audit pipeline** (`src/lib/auth-audit.ts`): `recordAuthEvent` is fire-and-forget; failed
  writes are queued in `localStorage` (key `wm_auth_audit_retry_queue`, cap 50) and replayed on
  next module load / next success (`:39-115`). It calls the `log-auth-event` edge function, which
  enforces JWT-for-authed-events + per-IP rate limit server-side (function file `:12-20,50-51`).
- **Captcha** is globally optional: absent `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `CAPTCHA_ENABLED` is
  `false` and all submit gates that check it are bypassed (`CaptchaTurnstile.tsx:20-21,104`).
  ⚠️ Whether the env var is set in production is config, not code — UNVERIFIED here.
