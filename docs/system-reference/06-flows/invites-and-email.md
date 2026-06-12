# Flow — Invites & Transactional Email

End-to-end ground truth for: an Admin inviting a user (create auth user, assign role + client/site mappings, email an invite link via Resend), the `pending_user_invites` carry-over table and its cleanup, invite acceptance (`/auth` dispatcher → `/auth/set-password` → onboarding), and the other transactional email functions (`send-email`, `send-password-reset`).

Schema/route/fn facts are cited to the earlier review chapters rather than re-derived:
- Edge functions: `docs/system-reference/05-edge-functions/auth-user-lifecycle.md`
- Auth flows: `docs/system-reference/03-auth-and-access/auth-flows.md`, `…/access-contexts-and-roles.md`
- Tables/RLS/RPCs: `docs/system-reference/02-data-model/tables-03.md`, `…/rls-policies-03.md`, `…/rpcs-and-functions-01.md`, `…/triggers-enums-storage.md`
- Known issues: `docs/system-reference/GAPS.md`, `docs/system-reference/SECURITY-FINDINGS-phase2.md`

> **Doc-drift note (read first).** `03-auth-and-access/auth-flows.md:197-201` still describes the **pre-fix** invite (`origin` from request header; sender `onboarding@resend.dev`). The **current code** read for this chapter reflects the deployed fixes — `origin = Deno.env.get('APP_URL')` (`invite-user/index.ts:78`) and sender `noreply@watsonmattheus.com` (`:466`). GAPS G-SEC-06 and G-SEC-07 are marked CLOSED/deployed (`GAPS.md:72,79`). This chapter documents the current code; §auth-flows.md is stale on these two points.

---

## 0. Actors & gates (summary)

| Actor | Entry point | Gate | Privileged side effect |
|---|---|---|---|
| Admin | Users view (`src/views/Users.tsx`) → `invite-user` edge fn | gateway `verify_jwt=true` (`supabase/config.toml:3-4`) **and** in-handler `getUser` + `user_roles.role==='Admin'` (`invite-user/index.ts:39,52`) | create auth user, assign role/tenant, send email, OR return cleartext temp password |
| Invitee | invite email link → `/auth?type=invite` → `/auth/set-password` | possession of the Supabase invite magic-link (one-time token) → establishes a session | sets own password; clears `requires_password_change` |
| New user (any path) | first authenticated route load | `OnboardingGate` reads `profiles.onboarding_completed` | writes own `profiles` row, `onboarding_completed=true` |
| Anyone w/ anon key | `send-email` edge fn | gateway `verify_jwt=true` only — **no in-handler auth** (`05/auth-user-lifecycle.md:92,108`) | sends arbitrary email from org Gmail (open relay — flagged) |
| Anyone (per deploy default) | `send-password-reset` edge fn | undeclared `verify_jwt` + per-IP rate limit only (`05/auth-user-lifecycle.md:117-118`) | triggers branded reset email to any address |

Role enum / role semantics: `03-auth-and-access/access-contexts-and-roles.md`. An `Admin` is globally privileged by design in this schema (no tenant scoping on Admin) — `05/auth-user-lifecycle.md:59`.

---

## 1. Invite flow — Admin creates/resends a user

### Step 1 — Admin opens Users view, fills the invite dialog
- Actor/trigger: Admin in `src/views/Users.tsx`. Role dropdown offers Admin/Moderator/User/Contractor/Client (`03/access-contexts-and-roles.md:124`, dialog `Users.tsx:718-722`).
- Reads (to populate the form): `pending_user_invites` (`Users.tsx:119-122`), `clients` (`:130-138`), `sites` (`:143-147`), `profiles` + per-user `user_roles`/`user_clients`/`user_sites` for the existing-users table (`:201-235`).
- UI feedback: pending-invite list, client/site pickers shown conditionally by selected role.

### Step 2 — Submit → `supabase.functions.invoke('invite-user', …)`
Three distinct call sites, all into the **same** edge function:

| Mutation | Body sent | Source |
|---|---|---|
| `sendInviteMutation` (re-invite a *pending_user_invites* row) | `{ email, fullName }` **only** (no role, no isResend) | `Users.tsx:244-246` |
| `inviteMutation` (create new) | `{ email, fullName, role, isResend:false, temporaryPassword?, clientId?, siteIds? }` | `Users.tsx:286-296` |
| `resendInviteMutation` (existing user) | `{ email, fullName, role, isResend:true, temporaryPassword?, clientId?, siteIds? }` (clientId/siteIds re-fetched from `user_clients`/`user_sites` first, `:335-350`) | `Users.tsx:352-362` |

- Transport: Supabase Functions client attaches the **caller's session JWT** in `Authorization` automatically.
- UI feedback on success: toast (incl. cleartext temp password for 10s when present, `Users.tsx:304-308,370-374`); invalidates `users`/`pending-invites` queries. On error: `toast.error(error.message)`.

### Step 3 — `invite-user` gateway + in-handler auth gate
- Gateway: `verify_jwt=true` (`supabase/config.toml:3-4`) — a valid JWT (the anon key also satisfies this) must be present.
- Handler creates a **service-role** client (`invite-user/index.ts:27-29`).
- Requires `Authorization` header (`:32-35`); `supabase.auth.getUser(token)` must resolve a real user (`:39-43`); then reads the caller's `user_roles` row (via service-role) and requires `roleData?.role === 'Admin'` using `.maybeSingle()` (`:46-54`).
- **Failure:** any miss throws → caught → `{ success:false, error }`, HTTP **400** (`:493-504`). (Note: returns 400 even for authz failures, not 401/403.)
- Security: this is the **correct** pattern — the inverse of the `create-user-admin` bug (unauthenticated service-role account creation, GAPS G-SEC-09, now deleted from prod, `GAPS.md:86-91`). Cross-ref `05/auth-user-lifecycle.md:30,59`.

### Step 4 — Input validation
- `role==='Client'` requires `clientId` else throw (`invite-user/index.ts:61-63`).
- `role==='Contractor'` requires ≥1 `siteIds` else throw (`:66-68`).
- `temporaryPassword` if present must be ≥6 chars (`:71-73`).
- Note: the `sendInviteMutation` path sends **no `role`** (`Users.tsx:245`), so `role` is `undefined` → none of these branches fire and no `user_roles` insert path with a real role runs for that call (relies on the DB signup trigger default — see Step 5/§3).

### Step 5 — Redirect base + branch: existing vs new user
- `origin = Deno.env.get('APP_URL') ?? 'https://insight-linker-app.vercel.app'`; `redirectTo = ${origin}/auth?type=invite` (`invite-user/index.ts:78-79`). **Env-driven, not request-origin** (G-SEC-07 fix, `GAPS.md:79-83`).
- `auth.admin.listUsers()` then finds an existing user by email (`:84-85`). Branches:
  - **existing + `isResend`** → update branch (`:90`).
  - **existing + not resend** → throw "User with this email already exists…" HTTP 400 (`:225-226`).
  - **new** → create branch (`:227`).

### Step 6a — NEW user branch
- `auth.admin.createUser({ email, email_confirm: <true iff temp pw>, user_metadata:{ full_name, role, requires_password_change:<true iff temp pw> } })` (`:229-244`).
- **Audit:** best-effort insert into `auth_events` `{ event_type:'user_created', metadata:{ role, invited_by:user.id, via:'invite-user' } }` wrapped in try/catch — an audit failure must not abort creation (`:257-265`). This is the G-SEC-04 emitter, CLOSED/deployed (`GAPS.md:57-58`).
- **Role:** reads `user_roles` (trigger may have created one); updates if different, else inserts (`:268-304`). Tolerates the `handle_new_user` trigger-created row (`03/access-contexts-and-roles.md:134`).
- **Tenant mapping:** `role==='Client'` → insert `user_clients` (`:307-313`); `role==='Contractor'` → insert N `user_sites` rows (`:324-332`). Each insert error throws → 400.

### Step 6b — RESEND (existing user) branch
- `auth.admin.updateUserById(userId, { user_metadata:{…}, password?, email_confirm? })` (`:97-114`); update failure is logged but **non-fatal** (`:116-118`).
- Role: update if changed else insert (`:121-136`).
- `user_clients`: update-or-insert (`:139-157`). `user_sites`: **delete-all then re-insert** the provided set (`:160-178`).
- Sub-branches:
  - **temp password given** → returns early with cleartext temp password in JSON, **no email** (`:181-197`).
  - **already email-confirmed** → `auth.resetPasswordForEmail(email, { redirectTo: ${origin}/auth })` (recovery, not invite) then early return (`:200-224`).

### Step 7 — Temp-password short-circuit (new or resend, after mappings)
- If `temporaryPassword` set: returns `{ success, userId, temporaryPassword, message }` with the **cleartext password in the body** and **skips email entirely** (`:343-362`). User then logs in with it and is forced to `/auth/reset-password` (`requires_password_change` metadata, `Login.tsx:100-103`; `03/auth-flows.md:204-208`).
- Security: cleartext temp password in response body + success-message logging — LOW data-exposure flag (`05/auth-user-lifecycle.md:59`).

### Step 8 — Generate invite link + send Resend email (non-temp path)
- `auth.admin.generateLink({ type:'invite', email, options:{ data:{ full_name, role }, redirectTo } })` (`:365-375`); failure throws → 400 (`:377-380`).
- `inviteUrl = inviteData.properties.action_link || redirectTo` (`:385`) — the Supabase magic-link that, when clicked, establishes the session and lands on `redirectTo` with the token in the URL hash.
- Reads `settings` (`company_name, logo_url`, `:388-391`) for branding (fallback "WM Compliance").
- `resend.emails.send({ from: '<companyName> <noreply@watsonmattheus.com>', to:[email], subject, html })` (`:465-470`). Sender is the org domain (G-SEC-06 fix, `GAPS.md:72`). Email failure throws → 400 (`:472-475`).
- Success: `{ success:true, userId, isNewUser, message }` HTTP 200 (`:479-492`).
- Secrets used: `RESEND_API_KEY` (`:4`), `SUPABASE_SERVICE_ROLE_KEY` (`:28`).

**Tables/fns touched (invite-user, full):** Auth admin API (`listUsers`/`createUser`/`updateUserById`/`generateLink`/`resetPasswordForEmail`); writes `user_roles`, `user_clients`, `user_sites`, `auth_events`; reads `user_roles`, `user_clients`, `settings`; email via Resend. (Mirrors `05/auth-user-lifecycle.md:47-52`.)

---

## 2. `pending_user_invites` — carry-over table & cleanup

- **Purpose:** tracks pending invites **carried over from the Firebase migration**; email-harvesting-sensitive; auto-pruned after 30 days (`02/tables-03.md:293-295`). It is **NOT** written by `invite-user` — that function uses Supabase Auth + `user_roles`/mappings. `pending_user_invites` is only read/deleted from the Users admin view.
- Created in migration `20251014164357_…sql:2`; RLS enabled (`:13`), Admin-only policies (`02/rls-policies-03.md:36`), `updated_at` trigger `update_pending_user_invites_updated_at` (`02/triggers-enums-storage.md:27`).
- **Read:** `Users.tsx:119-122` (pending list). **Delete:** `deletePendingInviteMutation` → `pending_user_invites.delete().eq('id', …)` (`Users.tsx:266-272`), gated by Admin-only RLS.
- **Re-invite from a pending row:** `sendInviteMutation` → `invite-user` with `{ email, fullName }` only (`Users.tsx:244-246`). The pending row is **not** auto-deleted on success — only `pending-invites`/`users` queries are invalidated (`:255-258`).
- **Cleanup function:** `public.cleanup_old_pending_invites()` — `SECURITY DEFINER`, deletes rows `created_at < NOW() - INTERVAL '30 days'`, writes an `activity_logs` row, `GRANT EXECUTE TO authenticated` (`20251017095131_…sql:5-33`; `02/rpcs-and-functions-01.md:88-96`). **No in-function auth check** — relies on the EXECUTE grant. Intended for manual admin run or pg_cron.
- ⚠️ UNVERIFIED whether any `pg_cron` job actually invokes it — no `cron.schedule` in the event log (`02/triggers-enums-storage.md:75`). If unscheduled, the 30-day auto-prune does not run automatically and sensitive emails persist.

---

## 3. Invite acceptance — `/auth` dispatcher → set-password → onboarding

### Step A — Invitee clicks the email link
- Link target resolves (after Supabase consumes the one-time token) to `${APP_URL}/auth?type=invite` **with `#access_token=…&refresh_token=…` appended in the URL hash** by GoTrue.
- Handler: `src/views/Auth.tsx` — a backward-compat dispatcher for old-shape email links (`Auth.tsx:10-33`).

### Step B — Dispatcher establishes session
- Reads `type` from query and `access_token`/`refresh_token` from the hash (`Auth.tsx:39-44`).
- Invite branch (`type==='invite'` + both tokens): scrubs the token from `window.location` via `history.replaceState` **before** the async call (MED #6 token-leak mitigation, `Auth.tsx:81-85`; `03/auth-flows.md:173`), then `supabase.auth.setSession({ access_token, refresh_token })` (`:86-89`).
- **Failure:** invalid/expired → toast "Invalid or expired invite link…" → `/auth/login` (`:91-97`).
- **Success:** `navigate('/auth/set-password')` (`:99`).
- (Recovery branch `type==='recovery'&token` → `verifyOtp` → `/auth/reset-password`, `:102-120` — used by `send-password-reset`/`resetPasswordForEmail` links, §5.)

### Step C — `/auth/set-password` sets the initial password
- Handler: `src/views/auth/SetPassword.tsx`. On mount, requires an active session else toast "Invite link expired…" → `/auth/login` (`:40-51`).
- Submit (`:53-94`): re-checks session; runs `evaluatePassword` strength+HIBP-breach gate (score ≥2, not pwned; network failure non-blocking, `:62-72`); `supabase.auth.updateUser({ password })` (`:74`); then `updateUser({ data:{ requires_password_change:false } })` (`:89`); then `recordAuthEvent('password_changed', { method:'invite' })` (`:91`); toast "Password set. Welcome!"; `redirectByRole(user.id)` (`:93`).
- `recordAuthEvent` → `log-auth-event` edge fn (fire-and-forget w/ localStorage retry queue, `05/auth-user-lifecycle.md:154`). `password_changed` is an AUTHED event → `user_id` taken from verified JWT (`05/auth-user-lifecycle.md:143`).
- Writes: Supabase Auth `auth.users` (password + metadata); `auth_events` via log-auth-event.

### Step D — Role/tenant already assigned (server-side, Step 6)
- The invitee's role + `user_clients`/`user_sites` mappings were written by `invite-user` at invite time (§1 Step 6), **not** during acceptance. `redirectByRole` reads the role to route the user (`03/access-contexts-and-roles.md:122-123`).
- The DB signup trigger `on_auth_user_created → handle_new_user()` also inserts a `profiles` row and a default `user_roles` row (Admin only for the very first user, else `User`) — `invite-user` reconciles to the requested role (`03/auth-flows.md:226-235`).

### Step E — `OnboardingGate` / `OnboardingWizard`
- On the first protected route load, `useOnboardingStatus(enabled)` reads `profiles.onboarding_completed` for the current user (`src/components/auth/useOnboardingStatus.ts:14-24`).
- `OnboardingGate` shows `OnboardingWizard` when `onboarding_completed` is falsy and not yet dismissed (`src/components/auth/OnboardingGate.tsx:15-31`; `03/access-contexts-and-roles.md:177-179`).
- `OnboardingWizard.handleComplete` updates the user's **own** `profiles` row (`full_name, phone, job_title, company, bio, avatar_url, onboarding_completed:true`) `.eq('id', user.id)` (`src/components/OnboardingWizard.tsx:104-123`); avatar upload goes to the `profile-images` storage bucket at `${user.id}/avatar.<ext>` with `upsert:true` (`:82-95`). Invalidates `current-user-profile`/`onboarding-profile`.
- The wizard does **not** set role or tenant — it shows the role read-only (`OnboardingWizard.tsx:289`, "Pending" if none).

---

## 4. Other transactional emails

### `send-email` (generic Gmail SMTP relay)
- Gateway: `verify_jwt=true` (`supabase/config.toml:18-19`). **In-handler auth: NONE** (`05/auth-user-lifecycle.md:92`).
- Reads body `{ to, subject, html?, text?, cc?, bcc? }`; requires `to`+`subject`+ one of html/text else 400 (`send-email/index.ts:25-36`).
- Sends via `smtp.gmail.com:465` TLS using `GMAIL_USER`/`GMAIL_APP_PASSWORD`; `from` forced to `gmailUser` (`:54-77`). No DB, no other fn.
- Callers (in-app): `SuggestionDialog.tsx:102` (to hardcoded `arno@wmeng.co.za`), `IssueReportDialog.tsx:93`, `Suggestions.tsx:182`, `IssueReports.tsx:189` (`05/auth-user-lifecycle.md:102-106`).
- **Security:** open email relay — see flag (`05/auth-user-lifecycle.md:108`).

### `send-password-reset` (Resend branded reset)
- `verify_jwt` **undeclared** in config.toml → deploy default; GAPS gate-probe confirms it is **directly callable unauthenticated** (`GAPS.md:54`). In-handler: **no caller auth**, only per-IP in-memory rate limit 5/60s (`send-password-reset/index.ts:11-29,36-43`).
- Reads body `{ email }` (trim/lowercase/regex-validate, `:52-64`); `auth.admin.generateLink({ type:'recovery' })` (`:73-79`); on link error still returns generic success (no user enumeration, `:81-94`).
- Builds `resetUrl = ${APP_URL}/auth?type=recovery&token=${hashedToken}` (`:100-103`); reads `settings` for branding (`:106-109`); sends via Resend from `noreply@watsonmattheus.com` (`:189-194`).
- **In-repo callers: NONE.** The app's forgot-password flow uses native `supabase.auth.resetPasswordForEmail` directly (`ForgotPassword.tsx`); this fn may be a GoTrue email hook — ⚠️ UNVERIFIED (`05/auth-user-lifecycle.md:129`; `GAPS.md:49-54`).
- Copy hardcodes "1 hour" expiry but actual expiry is GoTrue config (G-SEC-05, `GAPS.md:67-68`).

### `invite-user`'s recovery sub-path
- For a resend to an already-confirmed user, `invite-user` itself calls `auth.resetPasswordForEmail(email, { redirectTo: ${origin}/auth })` (§1 Step 6b, `invite-user/index.ts:200-224`) — a third reset-email path distinct from `send-password-reset` and `ForgotPassword`.

---

## 5. Error & offline paths

- **invite-user errors** (auth miss, validation, create/role/mapping/link/email failure): all funnel to the catch → `{ success:false, error }` HTTP **400** (`invite-user/index.ts:493-504`). Frontend surfaces `error.message` via `toast.error` (`Users.tsx:259-261,321-323,383-385`).
- **Partial-failure risk (no transaction):** `createUser` succeeds but a later `user_roles`/`user_clients`/`user_sites` insert throws → the function returns 400 but the **auth user already exists** and (if the trigger ran) has a default `User` role. A retry without `isResend` then hits "User already exists" (`:225-226`); the admin must use resend. See §6 trust boundaries.
- **set-password / acceptance:** expired link or lost session → toast → `/auth/login` (`SetPassword.tsx:42-47`, `Auth.tsx:91-97`). Weak/breached password → inline field error, no submit (`SetPassword.tsx:63-72`).
- **Offline:** the invite + acceptance flows are **online-only** — both depend on Supabase Auth round-trips (`setSession`, `updateUser`, edge-fn invoke). No offline queue for invites. The only offline-tolerant piece is `recordAuthEvent`'s localStorage retry queue for `log-auth-event` (`05/auth-user-lifecycle.md:154`); the password set itself is not queued. `send-email`/`send-password-reset` have no offline handling.

---

## 6. Data integrity / trust boundaries

- **Privilege boundary (invite-user):** correctly enforced — gateway JWT + in-handler service-role `getUser` + `user_roles.role==='Admin'` (`invite-user/index.ts:39,52`). This is the positive counter-example to the `create-user-admin` class (GAPS G-SEC-09). The service-role key never leaves the function.
- **Tenant scoping:** `invite-user` writes `user_clients`/`user_sites` for Client/Contractor roles, but an **Admin caller is global** — there is no check that the inviting admin "owns" the target `clientId`/`siteIds`. By design in this schema (Admin = global), so not a tenant-leak bug, but it means any Admin can map any user to any client/site.
- **No write transaction:** user creation + role + mappings + audit are sequential awaits, not a DB transaction. A mid-sequence failure leaves an orphaned auth user with a default role (see §5). The audit `auth_events` insert is intentionally best-effort/non-fatal (`:257-265`).
- **`sendInviteMutation` sends no role:** re-inviting a `pending_user_invites` row passes only `{email, fullName}` (`Users.tsx:245`) → the new user gets the **DB trigger default role** (`User`), not a deliberate one. Worth noting as a possible source of mis-roled accounts.
- **Cleartext temp password:** returned in the response body and embedded in success messages/logs on the temp-password path (`invite-user/index.ts:189,353-355`). LOW data-exposure.
- **`pending_user_invites` retention:** auto-prune depends on `cleanup_old_pending_invites()` being scheduled; ⚠️ UNVERIFIED that pg_cron runs it (`02/triggers-enums-storage.md:75`). If not scheduled, harvest-sensitive emails persist past 30 days.
- **Email trust boundary:** `send-email` is an unauthenticated-relative-to-app open relay from the org Gmail (anon key suffices); `send-password-reset` is unauthenticated and reachable, sending branded reset emails to any address (rate-limited 5/min/IP only). Both cross a sender-reputation / phishing trust boundary.
- **`auth_events` typing:** the audit table exists in migration `20260525120000` but is absent from `types.ts` (stale) — emitters write an untyped table; harmless for edge fns (`GAPS.md:172`).

---

## 7. Security flags

(Severity · where · issue · evidence)

1. **MED/HIGH · `send-email` edge fn · open email relay.** `verify_jwt=true` only requires the publicly-shipped anon key and the handler does **no** caller auth / rate limit / recipient restriction — anyone with the anon key can send attacker-controlled `to/subject/html` from the org Gmail (phishing-from-trusted-sender, reputation damage). Evidence: `send-email/index.ts` has no `getUser`/role check (`:18-77`); `05/auth-user-lifecycle.md:108`; `supabase/config.toml:18-19`.
2. **MED · `send-password-reset` edge fn · unauthenticated reachable reset-email sender.** `verify_jwt` undeclared (`config.toml` has no stanza) and probe shows direct unauth call reaches handler; only per-IP in-isolate rate limit (5/60s). Anyone can trigger a branded reset email to any address. Evidence: `GAPS.md:54`; `send-password-reset/index.ts:11-43`; `05/auth-user-lifecycle.md:117-118,131`.
3. **LOW · `invite-user` edge fn · cleartext temporary password exposure.** Temp password returned in JSON response body and embedded in `console.log` success messages. Evidence: `invite-user/index.ts:189,353-355`; `05/auth-user-lifecycle.md:59`.
4. **LOW · `invite-user` data integrity · non-transactional user provisioning.** `createUser` + role/mapping/audit are sequential awaits; a mid-sequence failure orphans an auth user with the trigger default role and forces the admin to fall back to resend. Evidence: `invite-user/index.ts:244-340,493-504`.
5. **LOW · `Users.tsx` sendInviteMutation · role-less re-invite.** Re-inviting a `pending_user_invites` row sends `{email, fullName}` only, so the created user inherits the DB trigger default `User` role rather than an intended role. Evidence: `Users.tsx:244-246`; trigger default `03/auth-flows.md:230-231`.
6. **LOW · `pending_user_invites` retention · unverified auto-prune.** `cleanup_old_pending_invites()` (harvest-sensitive email prune) is `GRANT EXECUTE TO authenticated` with no in-fn auth and not wired to any trigger; no confirmed pg_cron schedule. Evidence: `20251017095131_…sql:5-33`; `02/triggers-enums-storage.md:75`; `02/rpcs-and-functions-01.md:96`.
7. **INFO · `invite-user` authz response code.** Authentication/authorization failures return HTTP **400** (generic catch) rather than 401/403 (`invite-user/index.ts:41-43,52-54,493-504`) — cosmetic, but obscures authz failures from monitoring.
8. **INFO · doc drift · `03/auth-flows.md:197-201` stale** vs current code (env-driven origin, `noreply@watsonmattheus.com` sender). Current code is correct (G-SEC-06/07 closed); the auth-flows chapter predates the fix.
