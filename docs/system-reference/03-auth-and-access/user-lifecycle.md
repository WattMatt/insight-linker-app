# User Lifecycle

Chapter 03 — Auth & access. Documented from code 2026-06-11. Every claim cites `src/path:line`,
a migration filename, or an edge function path. Items not provable from the repo are marked ⚠️ UNVERIFIED.

Scope: invitation → account creation → invite acceptance → role assignment/changes → profile
management → password reset issuance → deactivation/deletion → lifecycle email → audit trail.

---

## 1. Identity & role model (stores the lifecycle writes to)

| Store | Created in | Notes |
|---|---|---|
| `auth.users` | Supabase-managed | All creation via admin API inside edge fns; self-signup disabled (`src/views/auth/Signup.tsx:8-15`) |
| `public.profiles` | `supabase/migrations/20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql:2-8` | `id` FK → `auth.users ON DELETE CASCADE`. `status` col added `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:63-64` (default `'Active'`); contact/bio/avatar cols added `20251015010134_9e552eb7-e8b8-4e7d-af61-f0ddac644a18.sql`; `onboarding_completed` added `20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql:2-4` |
| `public.user_roles` | `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:5-11` | `UNIQUE(user_id, role)`; FK cascade re-asserted in `20251020093858_2be55e8a-8d60-4677-9da5-136858567424.sql:16-27` |
| `public.user_clients` | `20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql` | 1:1 user↔client (`UNIQUE(user_id)`, `UNIQUE(client_id)`); FK cascade added `20251020093858_...sql:29-40` |
| `public.user_sites` | `20251017061634_0f314109-0186-45b7-9d30-23aacfd775d3.sql:2-8` | N:M user↔site, `UNIQUE(user_id, site_id)`; `user_id` FK cascade added `20251020093858_...sql:42-53` |
| `public.pending_user_invites` | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql:2-10` | Firebase-migration backlog; admin-only RLS (all four CRUD policies `has_role(auth.uid(), 'Admin')`, same file lines 16-38) |
| `public.auth_events` | `20260525120000_auth_events_audit.sql:18-38` | Audit trail; no FK to `auth.users` by design (survives deletion, lines 12-14) |

### app_role enum

```sql
CREATE TYPE public.app_role AS ENUM ('Admin', 'User', 'Contractor');
```
— `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:2`. Then:
`ALTER TYPE ... ADD VALUE 'Moderator'` (`20251014172237_cf2b6c0e-4e10-4df0-abc2-8a96d54ef0ab.sql:2`),
`ALTER TYPE ... ADD VALUE 'Client'` (`20251017054230_bf53246a-a037-4e22-8a74-1f4cfc594269.sql:2`).
Effective values: **Admin, User, Contractor, Moderator, Client**.

### Account-creation trigger (current effective version)

`on_auth_user_created AFTER INSERT ON auth.users` executes `handle_new_user()`
(trigger created `20251014114352_...sql:193-196`, re-created `20251020093607_800422ff-162b-4cf6-867a-6b2d690a64ff.sql:32-39`).
Function history: original (`20251014114352:175-191`) → defaulted everyone to `'Admin'`
(`20251020093607:2-30`) → current version fixes default to `'User'`
(`20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql:7-32`):

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT COUNT(*) FROM auth.users) = 1
                       THEN 'Admin'::app_role ELSE 'User'::app_role END);
  RETURN NEW;
END; $$;
```

So every user creation (any path) side-effects a `profiles` row and a default `user_roles` row.

### user_roles RLS

`20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:33-61`: SELECT own row
(`auth.uid() = user_id`) or Admin; INSERT/UPDATE/DELETE Admin-only via
`has_role(auth.uid(), 'Admin')`. `has_role` is `SECURITY DEFINER` (same file lines 17-30).

---

## 2. Invitation

### 2.1 Who can perform it

- **UI**: the Users view at `/users` (`src/app/(admin)/users/page.tsx`) sits behind the admin
  layout's `ProtectedRoute` (`src/app/(admin)/layout.tsx:12`), which only requires *any* session
  and bounces Contractor → `/contractor`, Client → `/client-portal`
  (`src/components/ProtectedRoute.tsx:14-16`). There is **no Admin check at the route level** —
  Admin/Moderator/User roles can all render the page.
- **Server**: `invite-user` requires a valid JWT (`verify_jwt = true`,
  `supabase/config.toml:3-4`) and then enforces **Admin** by reading the caller's `user_roles`
  row with the service-role client (`supabase/functions/invite-user/index.ts:37-54`). Non-admins
  get `Only admins can invite users` (line 53).

### 2.2 Code path (UI → edge fn)

| Action | UI element | Mutation | Invoke |
|---|---|---|---|
| Invite new user | "Invite User" dialog (`src/views/Users.tsx:670-807`) | `inviteMutation` (`Users.tsx:284-324`) | `invite-user` with `{email, fullName, role, isResend:false, temporaryPassword?, clientId?, siteIds?}` (`Users.tsx:286-296`) |
| Resend / reset password for existing user | "Reset Password" dialog (`Users.tsx:1310-1361`) | `resendInviteMutation` (`Users.tsx:327-386`); first re-reads the user's `user_clients`/`user_sites` mappings (`Users.tsx:335-350`) | `invite-user` with `isResend:true` (`Users.tsx:352-362`) |
| Send invite to Firebase-migration backlog entry | "Send Invite" button in Pending Invites table (`Users.tsx:858-867`) | `sendInviteMutation` (`Users.tsx:242-262`) | `invite-user` with **only** `{email, fullName}` — no `role` (`Users.tsx:244-246`) |

Client-side pre-validation in `handleInvite` (`Users.tsx:628-651`): Client role requires a
selected client; Contractor role requires ≥1 site; temp-password input has `minLength={6}`
(`Users.tsx:789`). Role options offered: Admin, Moderator, User, Contractor, Client
(`Users.tsx:717-723`).

### 2.3 invite-user edge function

Path: `supabase/functions/invite-user/index.ts`. Service-role client (lines 27-29).
Request shape (lines 11-19): `email, fullName, role, isResend?, temporaryPassword?, clientId?, siteIds?`.

Server validations (after the Admin gate):

| Validation | Line |
|---|---|
| `role === 'Client'` requires `clientId` | `invite-user/index.ts:61-63` |
| `role === 'Contractor'` requires non-empty `siteIds` | `:66-68` |
| `temporaryPassword`, if given, ≥ 6 chars | `:71-73` |
| Existing email + `isResend:false` → rejected (`use resend invite instead`) | `:223-224` |

Existence check is `auth.admin.listUsers()` scanned for the email (lines 81-86).
Redirect base is taken from the request `origin`/`referer` header → `${origin}/auth?type=invite`
(lines 76-77).

**Branch matrix** (all writes via service role, bypassing RLS):

| Branch | Condition | auth.users effect | DB side effects | Email |
|---|---|---|---|---|
| New user, temp password | no existing user, `temporaryPassword` set | `auth.admin.createUser` with `email_confirm:true`, password set, metadata `{full_name, role, requires_password_change:true}` (`:226-247`) | role row insert/update (`:253-290`); `user_clients` insert if Client (`:292-307`); `user_sites` inserts if Contractor (`:309-326`) | **None** — temp password returned in the JSON response and shown in an admin toast (`:329-348`; `Users.tsx:304-308`) |
| New user, email invite | no existing user, no temp password | `createUser` with `email_confirm:false` (`:229`) | same role/mapping writes | `auth.admin.generateLink({type:'invite', redirectTo})` (`:350-366`) → branded HTML sent via Resend (`:451-461`) |
| Resend, temp password | existing user, `isResend:true`, temp password | `auth.admin.updateUserById`: password overwritten, `email_confirm:true`, metadata `requires_password_change:true` (`:94-116`) | role updated if changed (`:118-134`); `user_clients` upserted (`:136-155`); `user_sites` delete-then-insert (`:157-176`) | None — temp password in response (`:178-195`) |
| Resend, confirmed user | existing user, email confirmed, no temp password | none | same role/mapping updates | `supabase.auth.resetPasswordForEmail(email, {redirectTo: origin + '/auth'})` — Supabase built-in recovery mailer (`:197-222`) |
| Resend, unconfirmed user | existing user, not confirmed, no temp password | metadata refresh (`:94-116`) | same role/mapping updates | falls through to fresh `generateLink({type:'invite'})` + Resend email (`:350-461`) |

Invite email: sent from `` `${companyName} <onboarding@resend.dev>` `` (`invite-user/index.ts:452`),
subject `You're invited to join ${companyName}` (`:454`), CTA links the generated
`action_link` (`:371`, `:419`). Branding fetch is
`.from('settings').select('company_name, logo_url')` (`:374-377`) — but the `settings` table has
**no `logo_url` column** (it is `company_logo_url`: `20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql:97-106`,
`src/integrations/supabase/types.ts:2335`). The error is not checked, so `companySettings` is
null and the email always falls back to text-header `'WM Compliance'` with no logo (`:379-380`).

### 2.4 Pending invites (Firebase migration backlog)

- Table is read in the Users view (`src/views/Users.tsx:116-127`) and rendered when non-empty
  (`Users.tsx:811-885`); described in-UI as "Users from Firebase migration waiting to be invited"
  (`Users.tsx:818-819`).
- "Send Invite" calls `invite-user` with no `role` (`Users.tsx:244-246`). ⚠️ UNVERIFIED what the
  fn then stores: with `role === undefined` the Client/Contractor validations pass vacuously and
  the trigger-created `'User'` role row exists, so `existingRole.role !== role` is true and an
  `update({ role: undefined })` is attempted (`invite-user/index.ts:260-271`) — runtime outcome
  not provable from the repo.
- `invited_at` gates the button (`Resend` label + disabled, `Users.tsx:863-866`) but **no code in
  the repo ever writes `invited_at`** (only reads: `Users.tsx:73,848-866`; nothing in
  `supabase/functions/invite-user/index.ts` touches `pending_user_invites`).
- Delete: direct client-side `DELETE` (`Users.tsx:265-281`), allowed by the Admin-only RLS policy
  (`20251014164357_...sql:34-38`).
- Housekeeping: `cleanup_old_pending_invites()` SECURITY DEFINER fn deletes rows older than 30
  days and logs to `activity_logs`; granted to `authenticated`, but no scheduler call exists in
  the repo (`20251017095131_9a8ba3df-3011-4282-a18e-42ecf40feb00.sql:5-33,40-41`).

---

## 3. Invite acceptance (token validation → first password)

1. The email link lands on `/auth?type=invite` with `#access_token=...&refresh_token=...` in the
   hash. `src/views/Auth.tsx` is a back-compat dispatcher (`Auth.tsx:10-32`); it detects the
   invite shape (`Auth.tsx:46-49`).
2. `handleInviteToken` scrubs the token from `window.location` **before** any async work
   (`Auth.tsx:83-85`), then validates by `supabase.auth.setSession({access_token, refresh_token})`
   (`Auth.tsx:86-89`). Failure → toast "Invalid or expired invite link" + redirect `/auth/login`
   (`Auth.tsx:91-97`). Success → `/auth/set-password` (`Auth.tsx:99`).
3. `SetPassword` (`src/views/auth/SetPassword.tsx`) re-checks the session on mount
   (`SetPassword.tsx:40-51`) and on submit (`:55-59`). Password gates:
   - zod `setPasswordSchema`: min 8 / max 72 chars + confirm match
     (`src/lib/validation-schemas.ts:113-122`)
   - zxcvbn score ≥ 2 via `evaluatePassword` (`SetPassword.tsx:62-66`)
   - HIBP breach check, best-effort (`SetPassword.tsx:67-72`)
   - server-side weak/pwned error mapped to a friendly message (`SetPassword.tsx:74-81,132-139`)
4. Side effects on success: `supabase.auth.updateUser({password})` (`SetPassword.tsx:74`); clear
   `requires_password_change` metadata (`:89`); audit event
   `password_changed {method:'invite'}` (`:91`); role-based redirect (`:93`) — Client →
   `/client-portal`, Contractor → `/contractor`, else `/dashboard`
   (`src/views/auth/useRoleRedirect.ts:15-33`).

Temp-password variant: the user logs in normally; `requires_password_change` in user metadata
forces `/auth/reset-password` both at already-signed-in check (`src/views/auth/Login.tsx:60-71`)
and post-login (`Login.tsx:98-107`). `ResetPassword` applies the same strength gates and clears
the flag (`src/views/auth/ResetPassword.tsx:49-85`, flag cleared `:80`).

First render of any admin-portal page after acceptance runs the onboarding gate: missing
`profiles.onboarding_completed` shows `OnboardingWizard`
(`src/components/ProtectedRoute.tsx:19-21`, `src/components/auth/OnboardingGate.tsx:15-31`,
`src/components/auth/useOnboardingStatus.ts:10-24`), which writes profile fields +
`onboarding_completed: true` to the user's own row (`src/components/OnboardingWizard.tsx:110-121`).

---

## 4. Role assignment & changes

| Path | Who | Mechanism | Enforcement |
|---|---|---|---|
| Default at creation | trigger | `handle_new_user`: first-ever user `'Admin'`, else `'User'` (`20260214023114_...sql:21-28`) | SECURITY DEFINER |
| At invite | Admin | `invite-user` upserts `user_roles` to the requested role (`invite-user/index.ts:253-290` new, `:118-134` resend) | service role + fn-level Admin gate |
| Edit User dialog | Users-view operator | `updateRoleMutation`: client-side update-or-insert on `user_roles` (`src/views/Users.tsx:389-423`), fired from `handleSaveEdit` (`:609-613`) | RLS: Admin-only INSERT/UPDATE (`20251014120311_...sql:45-55`) — non-admin operators' writes are filtered |
| Client mapping | Admin | invite path (`invite-user/index.ts:136-155,292-307`) | `user_clients` RLS `FOR ALL` Admin (`20251017054255_...sql`) |
| Site mapping | Admin | invite path (`invite-user/index.ts:157-176,309-326`); "Edit Sites" dialog delete-then-insert (`Users.tsx:426-456`, UI `:1363-1437`, ≥1 site enforced `:1420-1431`) | `user_sites` RLS `FOR ALL` Admin (`20251017061634_...sql:12-17`) |

Role reads for routing/UX: `useUserRole` queries own `user_roles` row
(`src/hooks/useUserRole.tsx:34-51`); allowed for any user by the own-row SELECT policy
(`20251014120311_...sql:33-37`).

---

## 5. Profile management

### 5.1 Self-service — MyProfile

Route `/profile` (`src/app/(admin)/profile/page.tsx`) renders `src/views/MyProfile.tsx`.

| Operation | Code path | Validation | DB/storage effect |
|---|---|---|---|
| View own profile | query `profiles` by `auth.uid()` (`MyProfile.tsx:46-59`) | — | SELECT allowed by own-row policy (`20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:12-17`) |
| Edit fields | `handleSaveProfile` (`MyProfile.tsx:116-146`) | none beyond types | UPDATE own row — policy `Users can update their own profile` `USING (auth.uid() = id)` (`20251014114352_...sql:81-83`) |
| Avatar upload | `handlePhotoUpload` (`MyProfile.tsx:84-114`) | ≤ 5 MB (`:87-90`) | upsert to `profile-images/{uid}/avatar.{ext}` (`:96-99`), `avatar_url` saved immediately (`:106`) |
| Change password | `handleChangePassword` (`MyProfile.tsx:148-204`) | min 8 (`:152`), confirm match (`:156`), re-auth with current password via `signInWithPassword` (`:163-170`), zxcvbn ≥ 2 + HIBP (`:172-183`) | `auth.updateUser({password})` (`:185`); audit `password_changed {method:'self'}` (`:194`) |

### 5.2 Admin-side — Users view Edit dialog

`handleSaveEdit` (`src/views/Users.tsx:571-626`) fires three parallel mutations: role
(`:389-423`), status Active/Inactive on `profiles.status` (`:459-475`), and full profile-field
update (`:478-496`), plus avatar upload/removal in the `profile-images` bucket (`:579-607`).

⚠️ UNVERIFIED / likely defect: the only `profiles` UPDATE policy in the migration history is the
own-row policy (`20251014114352_...sql:81-83`); no Admin-update policy exists in
`supabase/migrations/` or in the prod-applied
`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (which only rewrites anon SELECT
policies). Under that state, an admin editing **another** user's profile/status from this dialog
matches 0 rows — PostgREST returns success with no rows, so the UI toasts success while writing
nothing. Live-DB policy state not verifiable from the repo.

### 5.3 profiles RLS evolution (SELECT)

1. `Users can view all profiles` `USING (true)` — `20251014114352_...sql:77-79`
2. → `Authenticated users can view profiles` (TO authenticated, `true`) — `20251016035546_4ea02c08-d2af-456a-a2e2-cacd46327e5d.sql:6-14`
3. → own-row + `Admins can view all profiles` — `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:9-24`
4. + `Contractors can view their own profile` (redundant with own-row) — `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql:263-269`

Consequence: the Users view's `profiles` list query (`Users.tsx:198-239`) only returns the full
roster for Admins; staff with the User/Moderator role see just their own row.

### 5.4 Avatar storage

Bucket `profile-images` created **public** (`20251015010856_b93b0802-94f0-48f4-9b68-3634fd86419f.sql:2-4`),
later set **private** alongside own-folder object policies
(`20251017094000_3768dc89-d62f-4024-8a63-0a5de4e09423.sql`); policies re-created with an
`Admins can view all profile images` SELECT added (`20251120051502_3843cc67-3b79-4c47-be4a-e544dd4c03fc.sql:255-294`).
⚠️ UNVERIFIED: both MyProfile (`MyProfile.tsx:101-104`) and Users (`Users.tsx:595-599`) persist
`getPublicUrl()` URLs, which do not resolve against a private bucket — whether avatars render
depends on the live bucket's `public` flag, not provable from the repo.

---

## 6. Password reset issuance

### 6.1 Self-service (OTP-first), any user

`/auth/forgot-password` → `src/views/auth/ForgotPassword.tsx` (design notes `:24-37`):

1. Email step: optional Turnstile captcha gate (`:58-61`), email zod-validated
   (`validation-schemas.ts:108-111`), then `supabase.auth.resetPasswordForEmail(trimmed, {redirectTo: origin + '/auth'})`
   (`:71-75`). Response timing padded to 1.0-1.3 s against user enumeration (`:63-79`); the UI
   always advances to the code step regardless of whether the account exists (`:82-91`). Audit
   event `password_reset_requested {method:'recovery'}` (`:83`).
2. Code step: `verifyOtp({email, token, type:'recovery'})` (`:99-103`); success → recovery
   session → `/auth/reset-password` (`:115-116`).
3. The clickable link in the same email still works via the dispatcher:
   `/auth?type=recovery&token=...` → `verifyOtp({token_hash, type:'recovery'})`
   (`src/views/Auth.tsx:52-55,102-120`).
4. `ResetPassword` applies zod 8-72 + zxcvbn ≥ 2 + HIBP gates, updates the password, clears
   `requires_password_change`, records `password_changed {method:'recovery'}`, redirects by role
   (`src/views/auth/ResetPassword.tsx:49-85`).

### 6.2 Admin-issued

The Users-view "Reset Password" action is the resend flow of `invite-user` (§2.3 branch matrix):
temp password → password overwritten + forced change flag, no email
(`invite-user/index.ts:94-116,178-195`); no temp password + confirmed user → Supabase recovery
email (`:197-222`); no temp password + unconfirmed user → fresh invite email (`:350-461`).

### 6.3 send-password-reset edge function — no caller found

`supabase/functions/send-password-reset/index.ts` builds a branded Resend recovery email:
per-IP rate limit 5/min per isolate (`:11-29`), email format check (`:54-64`),
`auth.admin.generateLink({type:'recovery'})` (`:73-79`), enumeration-safe success response on
link failure (`:81-94`), direct app link `${APP_URL}/auth?type=recovery&token=${hashed_token}`
(`:96-103`, `APP_URL` env with Vercel fallback `:69`), correct `company_logo_url` settings column
(`:106-112`), from `noreply@watsonmattheus.com` (`:189-194`).

**No `src/` code invokes it** (repo-wide grep finds only a comment reference,
`src/views/Auth.tsx:27`), and it has no `[functions.send-password-reset]` entry in
`supabase/config.toml`. ⚠️ UNVERIFIED whether it is dead code or called externally; its
JWT-verification default for unlisted functions is platform behavior, not visible in the repo.

### 6.4 requires_password_change flag lifecycle

| Transition | Where |
|---|---|
| Set true | `invite-user` when a temp password is issued (`invite-user/index.ts:96-100,230-234`) |
| Checked | `Login.tsx:60-71` (existing session), `Login.tsx:98-107` (after sign-in), `Auth.tsx:68-72` (dispatcher default path) — all route to `/auth/reset-password` |
| Cleared | `SetPassword.tsx:89`, `ResetPassword.tsx:80` via `auth.updateUser({data:{requires_password_change:false}})` |

---

## 7. Deactivation & deletion

### 7.1 Status (Active / Inactive)

Set only from the Users-view Edit dialog (`Users.tsx:1163-1175` UI, `:459-475` mutation) onto
`profiles.status` (column: `20251014120311_...sql:63-64`). ⚠️ UNVERIFIED enforcement: no code in
`src/` or edge functions reads `profiles.status` to block login or access (repo-wide grep for
`Inactive` matches only the Users view, an unrelated site dialog, and API-client `is_active`) —
"Inactive" appears to be display-only. Also subject to the §5.2 RLS gap for non-own rows.

### 7.2 Deletion

UI: Users-view dropdown → confirm dialog (`Users.tsx:992-1001,1019-1053`) →
`deleteUserMutation` invokes `delete-user` with `{userId}` (`Users.tsx:499-522`).

Edge fn `supabase/functions/delete-user/index.ts` (`verify_jwt = true`, `supabase/config.toml:6-7`):

| Step | Line |
|---|---|
| JWT required, resolved via `auth.getUser(token)` | `delete-user/index.ts:28-39` |
| Admin gate: caller's `user_roles` row must be `'Admin'` (`.single()`) | `:42-50` |
| `userId` required | `:53-57` |
| Self-deletion blocked (`userId === caller`) | `:59-62` |
| `auth.admin.deleteUser(userId)` | `:64-71` |

Side effects: deleting the `auth.users` row cascades to `profiles`
(`20251014114352_...sql:3` + `20251020093858_...sql:3-14`), `user_roles`
(`20251014120311_...sql:7`), `user_clients` and `user_sites`
(`20251020093858_...sql:29-53`); `activity_logs.user_id` is `ON DELETE SET NULL`
(`20251020093858_...sql:55-67`). `auth_events` rows persist (no FK,
`20260525120000_auth_events_audit.sql:12-14`). No soft-delete, no grace period, no
`account_deleted` audit write in the fn (full file read, no `auth_events` insert).

---

## 8. Lifecycle email sending

| Email | Producer | Provider / from | Cited |
|---|---|---|---|
| Invite (new or unconfirmed user) | `invite-user` | Resend, `${companyName} <onboarding@resend.dev>` | `invite-user/index.ts:451-456` |
| Recovery (admin resend, confirmed user) | `invite-user` → `auth.resetPasswordForEmail` | Supabase built-in mailer — template/SMTP configured in dashboard, ⚠️ UNVERIFIED from repo | `invite-user/index.ts:197-208` |
| Recovery OTP + link (self-service) | `ForgotPassword` → `auth.resetPasswordForEmail` | Supabase built-in mailer ⚠️ as above | `ForgotPassword.tsx:71-75` |
| Branded password reset | `send-password-reset` | Resend, `noreply@watsonmattheus.com` — **no caller in repo** (§6.3) | `send-password-reset/index.ts:189-194` |
| Temp-password issuance | — | **No email**; password shown in admin toast | `invite-user/index.ts:329-348`, `Users.tsx:304-308` |

`send-email` (`supabase/functions/send-email/index.ts`) is **not used for the user lifecycle**:
it is a generic Gmail-SMTP relay (`GMAIL_USER`/`GMAIL_APP_PASSWORD`, smtp.gmail.com:465,
`:38-64`) invoked only by suggestion/issue-report features
(`src/components/SuggestionDialog.tsx:102`, `src/components/IssueReportDialog.tsx:93`,
`src/views/Suggestions.tsx:182`, `src/views/IssueReports.tsx:189`). It validates only
`to/subject/html|text` (`:28-36`) and performs **no role check** beyond gateway JWT verification
(`verify_jwt = true`, `supabase/config.toml:22-23`) — any authenticated user can send arbitrary
mail from the Gmail account.

---

## 9. Audit trail (lifecycle events)

Writer: `log-auth-event` edge fn (`verify_jwt = false` so pre-session events land,
`supabase/config.toml:82-87`). It splits event types into ANON (`password_reset_requested`,
`magic_link_requested`, `lockout` — `user_id` forced NULL,
`supabase/functions/log-auth-event/index.ts:29-33,139-141`) and AUTHED (login, logout,
password_changed, mfa_*, account_deleted, account_email_changed, user_created — `user_id` from
verified JWT only, `:35-44,126-138`). Metadata whitelisted to `method/reason/error_code`
(`:46-47,76-85`); per-IP 20/min per isolate (`:50-65`). Client helper `recordAuthEvent` is
fire-and-forget with a 50-entry localStorage retry queue (`src/lib/auth-audit.ts:60-105`).

Lifecycle events actually emitted:

| Event | Emitted from |
|---|---|
| `password_changed {method:'invite'}` | `SetPassword.tsx:91` |
| `password_changed {method:'recovery'}` | `ResetPassword.tsx:82` |
| `password_changed {method:'self'}` | `MyProfile.tsx:194` |
| `password_reset_requested` | `ForgotPassword.tsx:83` |
| `login` / `logout` / `magic_link_requested` | `Login.tsx:99,137,172`; `AppSidebar.tsx:115`; `ClientPortalLayout.tsx:81`; `ContractorPortalLayout.tsx:76`; `SessionWatcher.tsx:57` |

`user_created` and `account_deleted` are defined in the schema CHECK
(`20260525120000_auth_events_audit.sql:21-33`) and the fn allowlist
(`log-auth-event/index.ts:41-43`) but **never emitted anywhere** — neither `invite-user` nor
`delete-user` writes `auth_events`, and no `recordAuthEvent("user_created"|"account_deleted")`
call exists in `src/`.

---

## Open questions

1. **Admin profile/status updates vs RLS.** No Admin UPDATE policy on `public.profiles` exists in
   the migration history (only own-row: `20251014114352_...sql:81-83`). Does the live DB have one
   (added via SQL editor)? If not, the Users-view Edit dialog's profile/status writes for other
   users (`Users.tsx:459-496,609-621`) silently no-op while toasting success.
2. **`pending_user_invites.invited_at` is never written.** The Send/Resend button state
   (`Users.tsx:863-866`) keys off a column no code path updates. Was a write in `invite-user`
   intended?
3. **Pending-invite sends pass no `role`** (`Users.tsx:244-246`). What does
   `invite-user/index.ts:260-271` actually do with `role === undefined` at runtime
   (`update({ role: undefined })` semantics in supabase-js v2.39)?
4. **`send-password-reset` has no caller** in the repo and no `config.toml` entry. Dead code,
   or invoked from outside (cron, external tool)? What is its effective JWT verification state?
5. **invite-user branding query selects nonexistent `settings.logo_url`**
   (`invite-user/index.ts:374-377` vs `20251014132137_...sql:97-106`) — invite emails can never
   carry the company logo. Intended fix: `company_logo_url`?
6. **`profiles.status = 'Inactive'` enforcement.** Nothing blocks an Inactive user from logging
   in or using the app. Is deactivation supposed to gate sessions, or is the field cosmetic?
7. **Avatar URLs vs private bucket.** `profile-images` was set private
   (`20251017094000_...sql`), but the app stores `getPublicUrl()` URLs
   (`MyProfile.tsx:101-104`, `Users.tsx:595-599`). What is the bucket's live `public` flag, and
   do avatars currently render?
8. **`user_created` / `account_deleted` audit events are defined but never emitted.** Should
   `invite-user` / `delete-user` write `auth_events` rows server-side?
9. **`delete-user` role check uses `.single()`** (`delete-user/index.ts:42-50`); since
   `user_roles` is `UNIQUE(user_id, role)` (not unique on `user_id`), a user holding two role
   rows would make `.single()` error and deny deletion. Can multi-role rows occur in practice?
10. **Temp-password floor is 6 chars** (`invite-user/index.ts:71-73`, `Users.tsx:789`) while
    every user-set password requires ≥ 8 + zxcvbn ≥ 2 (`validation-schemas.ts:113-122`).
    Intentional gap for admin-issued temporaries?
11. **Supabase dashboard auth config** (recovery/invite email templates, OTP expiry — the reset
    email claims a 1-hour expiry at `send-password-reset/index.ts:144,177` — Site URL, SMTP) is
    not in the repo and could not be verified.
