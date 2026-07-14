# Client Portal Access & Onboarding — Review + Remediation (2026-07-07)

Reviewer note: this covers invite → credential delivery → first login → forced
reset → portal visibility. Investigated against the actual code (not the spec).
Two criteria in the brief — **sending real emails** and **publishing to the live
app** — are outward-facing and irreversible, so this document stages them to
"one command from go" and does **not** fire them autonomously. Everything else is
implemented and verified (typecheck + lint + 455/455 tests).

Assumption (noted per brief): the desired onboarding flow is *"user receives an
initial password in their invite email, signs in with it, and is forced to set
their own password on first login."* The app already had the forced-reset half;
it was missing the emailed-password half. That is now built.

---

## 1. How onboarding actually works today (as-found)

| Step | File | Behaviour |
|---|---|---|
| Admin invites a user | `src/views/Users.tsx` (invite dialog + `inviteMutation`) | Calls `invite-user` edge fn. Optional "Temporary Password" field. |
| User creation | `supabase/functions/invite-user/index.ts` | Admin-only (verifies `user_roles.role === 'Admin'`). Creates auth user, assigns role, maps `user_clients`/`user_sites`. |
| Credential delivery — **path A (blank password)** | same | Generates a Supabase `invite` magic link, emails a branded "Accept Invitation" button. **No password in email.** |
| Credential delivery — **path B (temp password set)** | same | Sets the password, auto-confirms, `requires_password_change: true`, **sends no email** — returns the plaintext to the admin's toast to relay by hand. |
| Invite acceptance (path A) | `src/views/Auth.tsx` → `src/views/auth/SetPassword.tsx` | `?type=invite` link establishes session → user sets their own password → flag cleared. |
| First login (path B) | `src/views/auth/Login.tsx:100`, `src/views/Auth.tsx:69` | On sign-in, `requires_password_change` → redirect to `/auth/reset-password`. |
| Forced reset | `src/views/auth/ResetPassword.tsx` | Any valid session → `updateUser({password})` → clears `requires_password_change` → role redirect. |
| Password reset (self-service) | `src/views/auth/ForgotPassword.tsx` → `supabase/functions/send-password-reset/index.ts` | Branded email, 256-bit hashed-token link, per-IP rate limit (5/min), enumeration-safe responses. |
| Portal landing | `src/views/auth/useRoleRedirect.ts` | `Client` → `/client-portal`, `Contractor` → `/contractor`, else `/dashboard`. |
| Portal visibility (RLS) | migrations (`get_user_client_id()`, `user_clients`) | Client sees only sites where `client_id = get_user_client_id()`. |

All five auth routes (`/auth/login`, `/signup`, `/forgot-password`,
`/reset-password`, `/set-password`) are correctly wired to their views. Signup is
invite-only (self-signup locked) — correct for this product.

---

## 2. Findings (as-found), by severity

### CONFIRMED DEFECTS

1. **Invite emails are unbranded and mislabelled (HIGH — formatting).**
   `invite-user` queried `settings.select('company_name, logo_url')`, but the
   `settings` table has **no `logo_url` column** (it is `company_logo_url`; migration
   `20251014132137` line 99). PostgREST rejects the whole select → `companySettings`
   is null → every invite email hardcodes **"WM Compliance"** (ignoring the configured
   company name, default "Watson Mattheus") and **never shows the logo**. The
   password-reset email uses the correct columns and *is* branded — so the two
   transactional emails look different. **→ FIXED** (see §3.1).

2. **No user ever receives a password by email (HIGH — the core gap).**
   Path A emails a link but no password; path B sets a password but emails nothing
   (plaintext shown to the admin to hand-deliver). The brief's required flow did not
   exist. **→ FIXED** (see §3.2): a new "Email login details" option generates a
   strong initial password, emails it in a branded template with a forced-change
   notice, and never echoes it back to the admin.

### GAPS NOT CHANGED THIS PASS (documented, with rationale)

3. **Forced password change is a soft (client-side) gate (MEDIUM).**
   `requires_password_change` only drives a client redirect (`Login.tsx`, `Auth.tsx`).
   A user who ignores the redirect and navigates straight to `/client-portal` still
   has a valid session and their role's RLS access. Impact is limited (the account
   owner is the intended recipient), but the "must change first" is UX, not a security
   boundary. *Proper fix:* store the flag in a `profiles` column and enforce in the
   route protectors + an RLS predicate. Deferred — needs a migration + protector change
   and careful testing; not safe to bundle blind.

4. **Storage buckets are public (HIGH — carried over from the 2026-07-07 architecture
   review, `docs/ARCHITECTURE_REVIEW_2026-07-07.md` Tier-1 #1).** `company-logos` and
   `client-logos` are intentionally public (fine — they are embedded in emails). But
   migration `20251120083541` set **all** buckets public, so inspection photos and
   documents visible in the portal are anonymously downloadable. Onboarding doesn't
   create these, but portal *visibility* inherits the exposure. Tracked there; not
   re-fixed here to avoid double-owning it.

5. **Resend-invite path doesn't offer emailed-password delivery (LOW).**
   `resendInviteMutation` still uses the legacy relay-by-hand path. The new capability
   exists in the edge function (`deliverByEmail`) and only needs the resend dialog
   wired the same way as the invite dialog. Deferred to keep this pass focused.

---

## 3. What changed this pass (implemented + verified)

### 3.1 Invite-email branding fix
`supabase/functions/invite-user/index.ts`: `logo_url` → `company_logo_url` in the
settings select and the `logoUrl` assignment. Invite emails now render the configured
company name + logo, consistent with the reset email.

### 3.2 New flow — email the initial password
- **`src/lib/auth/initialInvite.ts`** (new, unit-tested): `generateInitialPassword()`
  — 16 chars, guaranteed one lower/upper/digit/symbol, ambiguous characters (0/O/1/l/I)
  excluded, unbiased Web-Crypto sampling. Satisfies the app password policy so the
  account is immediately usable. Tested in `initialInvite.test.ts` (charset classes,
  alphabet safety, entropy/no-repeat) — 4 tests, passing.
- **`supabase/functions/invite-user/index.ts`**: new `deliverByEmail` request flag +
  `sendInitialPasswordEmail()` + `renderInitialPasswordEmailHtml()` (branded template
  matching the invite/reset emails; email + password in a monospace box; prominent
  "you'll change this on first login" notice; HTML-escaped inputs). When
  `deliverByEmail` is set, the credentials are emailed and the plaintext is **not**
  returned to the admin (single delivery channel). Missing password + `deliverByEmail`
  fails loud rather than creating an unreachable account.
- **`src/views/Users.tsx`**: "Email login details to the user" checkbox in the invite
  dialog. Checked → generates an initial password (or uses the admin-typed one) and
  sends `deliverByEmail: true`. Success toast reflects emailed delivery.

Existing behaviour is untouched when the box is unchecked (magic-link invite) or when
an admin sets a temp password without the box (legacy relay) — no functional regression.

### Verification of this pass
- `tsc --noEmit`: 0 errors in changed files (123 pre-existing errors elsewhere, untouched).
- `eslint`: 0 errors in changed files.
- `vitest run`: **455/455** passing (was 451; +4 new).
- Edge-function structure: brace-balanced; `deliverByEmail` and `sendInitialPasswordEmail` wired.

Deno-level `deno check` of the edge function is **not** run here — it requires the
Supabase CLI linked to the project. Listed as a gate in §4.

---

## 4. Deploy plan (staged — NOT executed; requires your go)

These are outward-facing/irreversible (real emails, production auth). Run from the
repo root with the Supabase project linked.

```bash
# 0. Confirm env on the deployed function (once):
#    APP_URL = https://insight-linker-app.vercel.app   (or the custom domain)
#    RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (already set)

# 1. Deno type-check the edge function
supabase functions deploy invite-user --no-verify-jwt --dry-run   # or: deno check supabase/functions/invite-user/index.ts

# 2. Deploy the edge function
supabase functions deploy invite-user

# 3. Deploy the web app (Vercel) — the Users.tsx + lib change
#    (via your normal Vercel pipeline / `vercel --prod`)
```

No database migration is required for this pass (§3 changes are code-only). The
soft-gate hardening (§2.3) would add one — separate change.

---

## 5. End-to-end verification checklist (run against a preview/staging project first)

Use a throwaway Client user on a **preview** deployment before production. Each line
is pass/fail.

**Invite + emailed password**
- [ ] Admin → Users → invite a Client, tick "Email login details", assign a client, submit.
- [ ] User receives a **branded** email (correct company name + logo), showing their email + a 16-char password + "Sign in" button to `/auth/login`.
- [ ] Admin toast says "login details emailed" and does **not** display the password.
- [ ] Sign in at `/auth/login` with the emailed password → redirected to `/auth/reset-password` (forced).
- [ ] Set a new password → lands on `/client-portal`. Old temp password no longer works.

**Magic-link invite (unchecked box) still works**
- [ ] Invite without the box → branded "Accept Invitation" email → `/auth/set-password` → portal.

**Self-service reset after onboarding**
- [ ] `/auth/forgot-password` → branded reset email → link → `/auth/reset-password` → new password works.
- [ ] Reset link expires after 1h; 6+ requests/min from one IP → HTTP 429.

**Portal visibility / security (RLS)**
- [ ] Client sees only their own client's sites/subsections; cannot load another client's `siteId` (RLS denies).
- [ ] Contractor sees only assigned sites.
- [ ] Signing out and replaying the emailed link/password does not grant access without the forced reset.

**Regression**
- [ ] Admin/User login unaffected. Existing users' reset flow unaffected.

---

## 6. Security assessment of the emailed-password approach

Emailing a password is inherently weaker than a magic link (the secret sits in a
mailbox). It is acceptable here **because**: (a) the password is single-use in
practice — forced reset on first login invalidates it; (b) it is generated with
CSPRNG entropy, not a weak human choice; (c) it is never logged and never echoed to
the admin when emailed; (d) inputs are HTML-escaped in the template. Residual risk:
mailbox compromise before first login, and the soft-gate (§2.3). Recommendation: keep
**magic-link as the default** (leave the box unchecked) and use emailed-password only
where a client explicitly needs username/password onboarding; harden the forced-change
gate (§2.3) before relying on it at scale.
