# Access Model — Build-out Status & E-SITE Comparison

**Date:** 2026-06-09
**Apps:** `insight-linker-app` (this app) vs `ESITE.V1/esite` (the more advanced of your two esite forks — last commit today, ~1,724 files).

---

## Part 1 — Are password reset / resend / access actually built out?

**Verdict: the happy path works on web, but the flow is NOT fully resolved.** Specific gaps below.

### Password reset
**Built:** forgot-password entry ([Auth.tsx:626](src/pages/Auth.tsx) ), request handler `handleForgotPassword` ([Auth.tsx:309](src/pages/Auth.tsx)) → `send-password-reset` edge function → Resend email; "email sent" confirmation panel; token verification (`verifyOtp`) + set-new-password — **all inline on `/auth`** via `?type=recovery&token=`.

**Broken / risky:**
- **Hardcoded domain** `https://wm-compliance.lovable.app/auth` (twice) in [send-password-reset/index.ts:36,64](supabase/functions/send-password-reset/index.ts). If the app is ever served from a custom domain (e.g. watsonmattheus.com), every reset link points at the wrong place. (`invite-user` correctly derives from request `origin` — reset should too.)
- **Inconsistent senders:** reset from `noreply@watsonmattheus.com`, invites from `onboarding@resend.dev` (Resend **sandbox** address → invites likely hit spam or fail).
- **Branding column mismatch:** reset reads `company_logo_url`, invite reads `logo_url` — one email renders with no logo.

**Missing:**
- **No dedicated `/reset-password` page** — it's one `/auth` component doing sign-in + sign-up + invite + recovery + password-change (5 jobs).
- **No "password changed" success screen** (just a toast + 1s auto-redirect).
- **No mobile/Capacitor deep-link handling** — in the native app, tapping the reset link opens the system browser at the Lovable URL, **not the app**, so reset can't complete in-app. (No `appUrlOpen` listener anywhere.)
- Minimal expired/invalid-token UX; no cooldown on reset requests.

### Resend process
**Built:** resend for existing active users via the **"Reset Password"** action ([Users.tsx:966](src/pages/Users.tsx)) → `resendInviteMutation` → `invite-user` with `isResend:true`. Separate Firebase "Pending Invites" path.

**Broken:**
- **The "Pending Invites" Resend button is dead UI** — [Users.tsx:859](src/pages/Users.tsx) `disabled={!!invite.invited_at}` while the label flips to "Resend" once `invited_at` is set, so it can **never be clicked**.
- Two differently-labelled resend paths (the active-user one is mislabelled "Reset Password"); confusing for an admin.

**Missing:** no email-confirmation resend; **no rate-limiting/cooldown anywhere**; no invite-status tracking for normally-invited users (`pending_user_invites` only holds Firebase-migration rows); no expired-invite detection.

### Access model (how users get in)
**Built:** invite flow (role + client/site scoping + temp-password-or-invite) via admin UI → `invite-user`; edit role; reassign contractor sites; delete user; edit profile.

**Broken:**
- **"Deactivate" is cosmetic** — sets `profiles.status='Inactive'` ([Users.tsx:458](src/pages/Users.tsx)) but does **not** block login or revoke the session. A "removed" user can still sign in.
- A **Client's** company mapping can't be changed in the UI (no client picker on edit; only contractor *sites* are editable).
- The signup toast says *"an admin will review and assign your role"* — **false**: the trigger auto-grants `User` immediately.

**Missing:** no app-level **audit log** of access changes; no genuine suspend/ban; self-signup is open (grants `User`; first-ever account = `Admin`).

---

## Part 2 — How E-SITE grants access (and how it compares)

**Key facts:** ESITE.V1 is a different stack (**Next.js 15 + Expo/React-Native + PowerSync**, not Lovable/Vite/Capacitor) on a **different Supabase project** (`cbskbnvvgcybmfikxgky`, vs this app's `oltzgidkjxwsukvkomof` — they do *not* share a backend). It is a **genuine multi-tenant SaaS**; this app is single-company.

### Side-by-side

| Dimension | insight-linker-app | ESITE.V1 |
|---|---|---|
| **Tenancy** | Single company; `clients` are that company's customers | **Multi-tenant**: `organisations` → `user_organisations` (role + `is_active`) → `project_members`; + **sub/shadow orgs**; org id injected into the **JWT** |
| **Roles** | enum: Admin / User / Contractor / Client (+Moderator) | org roles owner/admin/PM/contractor/inspector/supplier/client_viewer **+ per-project roles**, reconciled by an RPC |
| **Grant flow** | Admin invite edge fn; self-signup → `User` | Self-signup → creates own org (onboarding); **admin provisions members** server-side (gated `isOrgAdmin`), creates user + sends reset email |
| **Reset pages** | Inline on `/auth` (query param) | **Dedicated `/reset-password` (+ 6-digit OTP) and `/reset-password/confirm`**, plus scanner-burnt-link recovery |
| **Resend** | Dead button + mislabelled | `verify-email` resend; admin "set password" email; clean paths |
| **Deactivation** | **Cosmetic** (status flag only) | **Real** — middleware + RLS + JWT all honor `is_active`; deactivated user is bounced to `/onboarding` with no data |
| **Enforcement** | RLS only (and currently anon-exposed — see audit) | **3 layers**: RLS (`SECURITY DEFINER` helpers) + server-action role guards + middleware; status-aware RLS (`client_viewer` sees only certified) |
| **Audit** | None at app layer | **Two tables**: `auth_events` (login/reset/MFA/created/deleted + IP/UA) and `audit_log` (CRUD old/new values) |
| **Account security** | Password min 6, no MFA/captcha | **TOTP MFA** (AAL gating) + Turnstile captcha + `zxcvbn` strength + breached-password (HIBP) block |
| **Public sharing** | Token cosmetic (anon tables open) | Token + **expiry + revocation + 1h signed URL + enumeration-safe** |

### What esite does that's worth borrowing (applies even to a single-company app)
1. **Dedicated reset pages** (`/reset-password` + confirm) instead of one overloaded `/auth`.
2. **Real deactivation** that actually blocks access (middleware + RLS honor an `is_active`/status flag; revoke session).
3. **An access-change audit log** (`auth_events` + `audit_log` pattern).
4. **Server-side role checks**, not just RLS — and definitely not client-only guards.
5. **Mobile deep-link handling** so reset/invite links complete inside the app.
6. **Invite status tracking** (the old `org_invites` table had token/`accepted_at`/`expires_at`) and a clean resend.
7. **Stronger account security**: captcha + password strength + optional MFA.

### What esite does that this app probably does NOT need
- Full **organisation multi-tenancy / sub-orgs** — only relevant if WM wants to sell insight-linker to *other* inspection companies. Today it's one company with many clients, so its `clients`/`user_clients` scoping is the right shape; it just needs to be *enforced* (which the security lockdown does).

### esite's own weak spots (so you don't copy them)
- It **deleted its invites table** (`org_invites`) in favor of "admin-create + reset email" — losing pending-invite status/expiry tracking.
- A **stale mobile invite screen** diverges from the web model.
- Heavy **service-role usage** in server code (bypasses RLS) — concentrates trust in the Next.js layer.

---

## Bottom line
esite is essentially the gold-standard template for your access model — you already built it. insight-linker-app is behind on **every** access dimension (reset pages, deactivation, audit, enforcement layers, MFA, sharing), and is currently *anon-exposed* on top of that. The pragmatic path is to **close this app's gaps using esite's patterns, while staying single-tenant** — unless the goal is to make insight-linker a multi-company product, in which case adopt esite's org model wholesale (or converge the two).
