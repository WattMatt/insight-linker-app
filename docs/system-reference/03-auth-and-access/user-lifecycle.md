# User Lifecycle

Chapter 03 — Auth & access. Documented from code, validated 2026-06-11. Every claim cites
`src/path:line`, a migration filename, or an edge-function path. Items not provable from the repo
are marked ⚠️ UNVERIFIED.

> Validation note: line numbers below were read from the on-disk files with `cat -n`. An earlier
> draft of this doc cited line numbers from a stale snapshot of `invite-user/index.ts` and
> `delete-user/index.ts` (before the `auth_events` audit inserts were added) and got the invite
> email sender, the redirect-base source, and the audit-emission facts wrong. Those are corrected
> here.

Scope: invitation → account creation → invite acceptance → role assignment/changes → profile
management → password reset issuance → deactivation/deletion → lifecycle email → audit trail.

---

## 1. Identity & role model (stores the lifecycle writes to)

| Store | Created in | Notes |
|---|---|---|
| `auth.users` | Supabase-managed | All creation via admin API inside edge fns; self-signup disabled (`src/views/auth/Signup.tsx:8-14`) |
| `public.profiles` | `supabase/migrations/20251014114352_f0238ce6-c819-49f9-9445-d5b79bd15290.sql:2-8` | `id` FK → `auth.users ON DELETE CASCADE` (`:3`). `status` col added `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:64` (default `'Active'`); contact/bio/avatar cols added `20251015010134_9e552eb7-e8b8-4e7d-af61-f0ddac644a18.sql:3-12`; `onboarding_completed` added `20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql:3-4` |
| `public.user_roles` | `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:5-11` | `UNIQUE(user_id, role)` (`:10`); FK cascade re-asserted in `20251020093858_2be55e8a-8d60-4677-9da5-136858567424.sql:23-25` |
| `public.user_clients` | `20251017054255_cd78a557-c3ab-4a9b-b95c-d8da8696f61c.sql` | 1:1 user↔client; FK cascade added `20251020093858_...sql:36-38` |
| `public.user_sites` | `20251017061634_0f314109-0186-45b7-9d30-23aacfd775d3.sql:2-8` | N:M user↔site, `UNIQUE(user_id, site_id)`; `user_id` FK cascade added `20251020093858_...sql:49-51` |
| `public.pending_user_invites` | `20251014164357_37295947-5f1a-4fb6-aa2f-b81d8cf4144d.sql:2-10` | Firebase-migration backlog; admin-only RLS (all four CRUD policies `has_role(auth.uid(), 'Admin')`, same file lines 16-38) |
| `public.auth_events` | `20260525120000_auth_events_audit.sql:18-38` | Audit trail; no FK to `auth.users` by design (survives deletion, lines 12-14) |

### app_role enum

```sql
CREATE TYPE public.app_role AS ENUM ('Admin', 'User', 'Contractor');
```
— `20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:2`. Then:
`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'Moderator'` (`20251014172237_cf2b6c0e-4e10-4df0-abc2-8a96d54ef0ab.sql:2`),
`ALTER TYPE ... ADD VALUE IF NOT EXISTS 'Client'` (`20251017054230_bf53246a-a037-4e22-8a74-1f4cfc594269.sql:2`).
Effective values: **Admin, User, Contractor, Moderator, Client**.

### Account-creation trigger (current effective version)

`on_auth_user_created AFTER INSERT ON auth.users` executes `handle_new_user()`
(trigger created `20251014114352_...sql:193-196`, re-created `20251020093607_800422ff-162b-4cf6-867a-6b2d690a64ff.sql:33-39`).
Function history: original (`20251014114352:175-191`) → interim version defaulted **everyone** to
`'Admin'` (`20251020093607:2-30`, line 24 reads `ELSE 'Admin'::app_role`) → current version fixes
the default to `'User'` (`20260214023114_a056bc18-90e7-4e5b-9b06-b7b6443a3ce7.sql:7-32`):

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
Because the trigger fires *inside* `auth.admin.createUser`, by the time `invite-user` reaches its
own role-assignment block the trigger row already exists — which is why `invite-user` reads the
existing role and updates-or-skips rather than blind-inserting (§2.3).

### user_roles RLS

`20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:32-62`: SELECT own row
(`auth.uid() = user_id`, `:32-37`) or Admin (`:39-44`); INSERT/UPDATE/DELETE Admin-only via
`has_role(auth.uid(), 'Admin')` (`:46-62`). `has_role` is a `SECURITY DEFINER` SQL function
(same file lines 17-30).

---

## 2. Invitation

### 2.1 Who can perform it

- **UI**: the Users view at `/users` (`src/app/(admin)/users/page.tsx` → `src/views/Users.tsx`)
  sits behind the admin layout's `ProtectedRoute` (`src/app/(admin)/layout.tsx:12`), which
  requires *any* session (`src/components/ProtectedRoute.tsx:14`) and bounces
  Contractor → `/contractor`, Client → `/client-portal` (`ProtectedRoute.tsx:15-16`). There is
  **no Admin check at the route level** — Admin/Moderator/User roles all render the page.
- **Server**: `invite-user` requires a valid JWT (`verify_jwt = true`, `supabase/config.toml:3-4`)
  and then enforces **Admin** by reading the caller's `user_roles` row with the service-role
  client (`supabase/functions/invite-user/index.ts:37-54`, `.maybeSingle()` at `:50`). Non-admins
  get `Only admins can invite users` (`:52-53`).

### 2.2 Code path (UI → edge fn)

| Action | UI element | Mutation | Invoke |
|---|---|---|---|
| Invite new user | "Invite User" dialog (`src/views/Users.tsx:670-807`) | `inviteMutation` (`Users.tsx:284-324`) | `invite-user` with `{email, fullName, role, isResend:false, temporaryPassword?, clientId?, siteIds?}` (`Users.tsx:286-296`) |
| Resend / reset password for existing user | "Reset Password" dialog (`Users.tsx:1310-1361`) | `resendInviteMutation` (`Users.tsx:327-386`); first re-reads the user's `user_clients`/`user_sites` mappings (`Users.tsx:335-350`) | `invite-user` with `isResend:true` (`Users.tsx:352-362`) |
| Send invite to Firebase-migration backlog entry | "Send Invite" button in Pending Invites table (`Users.tsx:858-867`) | `sendInviteMutation` (`Users.tsx:242-262`) | `invite-user` with **only** `{email, fullName}` — no `role` (`Users.tsx:244-246`) |

Client-side pre-validation in `handleInvite` (`Users.tsx:628-651`): Client role requires a
selected client (`:632-635`); Contractor role requires ≥1 site (`:638-641`); the temp-password
input has `minLength={6}` (`Users.tsx:790`). Role options offered: Admin, Moderator, User,
Contractor, Client (`Users.tsx:718-722`).

> No zod schema gates the invite UI. A `userInviteSchema` exists
> (`src/lib/validation-schemas.ts:60-68`, role enum **only** `['Admin','Client','Contractor']`,
> `temporaryPassword` min 8) but is **imported nowhere** — repo-wide grep finds no usage outside
> its own definition. `profileUpdateSchema` (`validation-schemas.ts:46-57`) is likewise unused.
> The Users view sends raw form state straight to the edge function.

### 2.3 invite-user edge function

Path: `supabase/functions/invite-user/index.ts` (505 lines). Service-role client (`:27-29`).
Request shape (`:11-19`): `email, fullName, role, isResend?, temporaryPassword?, clientId?, siteIds?`.

Server validations (after the Admin gate):

| Validation | Line |
|---|---|
| `role === 'Client'` requires `clientId` | `:61-63` |
| `role === 'Contractor'` requires non-empty `siteIds` | `:66-68` |
| `temporaryPassword`, if given, ≥ 6 chars | `:71-73` |
| Existing email + `isResend:false` → rejected (`use resend invite instead`) | `:225-226` |

Existence check is `auth.admin.listUsers()` scanned for the email (`:84-85`).
**Redirect base is `Deno.env.get('APP_URL')`** with Vercel fallback
`https://insight-linker-app.vercel.app` (`:78`), feeding `${origin}/auth?type=invite` for invites
(`:79`) and `${origin}/auth` for the confirmed-user recovery branch (`:202`). The request origin /
referer header is **not** used (an inline comment at `:75-77` says this is deliberate, to keep
spoofed headers and preview deployments out of invite links).

**Branch matrix** (all writes via service role, bypassing RLS):

| Branch | Condition | auth.users effect | DB side effects | Email |
|---|---|---|---|---|
| New user, temp password | no existing user, `temporaryPassword` set | `auth.admin.createUser` with `email_confirm:true`, password set, metadata `{full_name, role, requires_password_change:true}` (`:228-244`) | `user_created` audit insert (`:255-265`); role row update-or-insert (`:267-304`); `user_clients` insert if Client (`:307-321`); `user_sites` inserts if Contractor (`:323-340`) | **None** — temp password returned in the JSON response and shown in an admin toast (`:343-362`; `Users.tsx:304-308`) |
| New user, email invite | no existing user, no temp password | `createUser` with `email_confirm:false` (`:231`) | same audit + role/mapping writes | `auth.admin.generateLink({type:'invite', redirectTo})` (`:364-375`) → branded HTML sent via Resend (`:465-470`) |
| Resend, temp password | existing user, `isResend:true`, temp password | `auth.admin.updateUserById`: password overwritten, `email_confirm:true`, metadata `requires_password_change:true` (`:96-114`) | role updated if changed / inserted if missing (`:120-136`); `user_clients` upserted (`:138-157`); `user_sites` delete-then-insert (`:159-178`) — **no audit insert on the resend path** | None — temp password in response (`:180-197`) |
| Resend, confirmed user | existing user, email confirmed, no temp password | metadata refresh only (`:96-114`) | same role/mapping updates, no audit insert | `supabase.auth.resetPasswordForEmail(email, {redirectTo: APP_URL + '/auth'})` — Supabase built-in recovery mailer (`:199-224`) |
| Resend, unconfirmed user | existing user, not confirmed, no temp password | metadata refresh (`:96-114`) | same role/mapping updates, no audit insert | falls through to fresh `generateLink({type:'invite'})` + Resend email (`:364-470`) |

Note: the `user_created` audit insert lives **only** in the new-user (`else`) branch (`:255-265`);
none of the resend branches write `auth_events`. Metadata persisted: `{ role, invited_by: user.id,
via: 'invite-user' }` (`:261`). The insert is best-effort (wrapped in `try/catch`, failure logged
non-fatally, `:263-264`).

Invite email: sent from `` `${companyName} <noreply@watsonmattheus.com>` `` (`invite-user/index.ts:466`),
subject `You're invited to join ${companyName}` (`:468`), CTA links the generated `action_link`
(`inviteUrl`, `:385`, `:433`/`:444`). Branding fetch is
`.from('settings').select('company_name, logo_url').single()` (`:388-391`).

**Branding-query defect (confirmed):** the query selects `logo_url`, but the `settings` table has
**no `logo_url` column** — its logo column is `company_logo_url`
(`20251014132137_627a24bc-ffbf-499d-bd22-96df6a7f3bfc.sql:99`; `src/integrations/supabase/types.ts:2335`;
`logo_url` exists on `clients`, not `settings`, migration `:174`). The `.single()` error is not
checked (only `data` is destructured, `:388`), so `companySettings` is `null`, `companyName` falls
back to `'WM Compliance'` (`:393`) and `logoUrl` is `undefined` (`:394`), making the header render
the text fallback with **no logo** every time (`:412`). `send-password-reset` selects the correct
`company_logo_url` (§6.3) — the two functions diverge.

### 2.4 Pending invites (Firebase migration backlog)

- Table is read in the Users view (`src/views/Users.tsx:116-127`) and rendered when non-empty
  (`Users.tsx:812-885`); described in-UI as "Users from Firebase migration waiting to be invited"
  (`Users.tsx:817-819`).
- "Send Invite" calls `invite-user` with no `role` (`Users.tsx:244-246`). ⚠️ UNVERIFIED what the
  fn then stores: with `role === undefined` the Client/Contractor validations pass vacuously and
  the trigger-created `'User'` role row exists, so on the new-user branch `existingRole.role !== role`
  is true and an `update({ role: undefined })` is attempted (`invite-user/index.ts:274-285`).
  Runtime outcome of `update({role: undefined})` in supabase-js v2.39 is not provable from the repo.
  (Note: because the email already exists in `auth.users` for a Firebase-backlog user with a
  trigger-created account, and `isResend` is unset, the call may instead hit the existing-email
  rejection at `:225-226` — depends on whether the backlog email has a matching `auth.users` row.)
- `invited_at` gates the button (`Resend` label + disabled, `Users.tsx:863-866`) but **no code in
  the repo ever writes `invited_at`** (column exists `20251014164357_...sql:7`; only reads in app:
  `Users.tsx:73,848-866`; nothing in `invite-user/index.ts` touches `pending_user_invites`).
- Delete: direct client-side `DELETE` (`Users.tsx:265-281`), allowed by the Admin-only RLS policy
  (`20251014164357_...sql:34-38`).
- Housekeeping: `cleanup_old_pending_invites()` SECURITY DEFINER fn deletes rows older than 30
  days and logs to `activity_logs`; granted to `authenticated`, but no scheduler call exists in
  the repo (`20251017095131_9a8ba3df-3011-4282-a18e-42ecf40feb00.sql:5-30` fn, `:33` grant,
  `:40-41` comment notes it "can be scheduled via pg_cron").

---

## 3. Invite acceptance (token validation → first password)

1. The email link lands on `/auth?type=invite` with `#access_token=...&refresh_token=...` in the
   hash. `src/views/Auth.tsx` is a back-compat dispatcher (header comment `:10-32`); it detects the
   invite shape (`Auth.tsx:46-50`).
2. `handleInviteToken` scrubs the token from `window.location` via `replaceState` **before** the
   async `setSession` (`Auth.tsx:85`), then validates by
   `supabase.auth.setSession({access_token, refresh_token})` (`Auth.tsx:86-89`). Failure → toast
   "Invalid or expired invite link" + redirect `/auth/login` (`Auth.tsx:91-96`). Success →
   `/auth/set-password` (`Auth.tsx:99`).
3. `SetPassword` (`src/views/auth/SetPassword.tsx`) re-checks the session on mount
   (`SetPassword.tsx:40-51`) and on submit (`:55-59`). Password gates:
   - zod `setPasswordSchema`: min 8 / max 72 chars + confirm match
     (`src/lib/validation-schemas.ts:113-122`)
   - zxcvbn score ≥ 2 via `evaluatePassword` (`SetPassword.tsx:62-66`)
   - HIBP breach check, best-effort — network failure does not block (`SetPassword.tsx:67-72`)
   - server-side weak/pwned error mapped to a friendly message (`SetPassword.tsx:74-81,132-139`)
4. Side effects on success: `supabase.auth.updateUser({password})` (`SetPassword.tsx:74`); clear
   `requires_password_change` metadata (`:89`); audit event `password_changed {method:'invite'}`
   (`:91`); role-based redirect (`:93`) — Client → `/client-portal`, Contractor → `/contractor`,
   else `/dashboard` (`src/views/auth/useRoleRedirect.ts:15-33`).

Temp-password variant: the user logs in normally; `requires_password_change` in user metadata
forces `/auth/reset-password` both at the already-signed-in check (`src/views/auth/Login.tsx:60-71`)
and post-login (`Login.tsx:98-107`). `ResetPassword` applies the same strength gates and clears
the flag (`src/views/auth/ResetPassword.tsx:49-85`, flag cleared `:80`).

First render of any admin-portal page after acceptance runs the onboarding gate: missing
`profiles.onboarding_completed` shows `OnboardingWizard`
(`src/components/ProtectedRoute.tsx:18-21`, `src/components/auth/OnboardingGate.tsx:15-32`,
`src/components/auth/useOnboardingStatus.ts:10-24`), which writes profile fields +
`onboarding_completed: true` to the user's own row (`src/components/OnboardingWizard.tsx:110-122`).

---

## 4. Role assignment & changes

| Path | Who | Mechanism | Enforcement |
|---|---|---|---|
| Default at creation | trigger | `handle_new_user`: first-ever user `'Admin'`, else `'User'` (`20260214023114_...sql:21-28`) | SECURITY DEFINER |
| At invite (new user) | Admin | `invite-user` reads the trigger-created role then update-or-inserts to the requested role (`invite-user/index.ts:267-304`) | service role + fn-level Admin gate |
| At resend | Admin | `invite-user` updates the role if changed, inserts if missing (`invite-user/index.ts:120-136`) | service role + fn-level Admin gate |
| Edit User dialog | Users-view operator | `updateRoleMutation`: client-side update-or-insert on `user_roles` (`src/views/Users.tsx:389-423`), fired from `handleSaveEdit` (`:609-613`) | RLS: Admin-only INSERT/UPDATE (`20251014120311_...sql:46-57`) — non-admin operators' writes match 0 rows |
| Client mapping | Admin | invite path (`invite-user/index.ts:138-157,307-321`) | `user_clients` RLS `FOR ALL` Admin (`20251017054255_...sql`) |
| Site mapping | Admin | invite path (`invite-user/index.ts:159-178,323-340`); "Edit Sites" dialog delete-then-insert (`Users.tsx:426-456`, UI `:1363-1437`, ≥1 site enforced `:1404-1406,1431`) | `user_sites` RLS `FOR ALL` Admin (`20251017061634_...sql`) |

Role reads for routing/UX: `useUserRole` queries the own `user_roles` row
(`src/hooks/useUserRole.tsx:34-51`); allowed for any user by the own-row SELECT policy
(`20251014120311_...sql:32-37`). `useRoleRedirect` does the same lookup at sign-in
(`useRoleRedirect.ts:16-20`).

---

## 5. Profile management

### 5.1 Self-service — MyProfile

Route `/profile` (`src/app/(admin)/profile/page.tsx`) renders `src/views/MyProfile.tsx`.

| Operation | Code path | Validation | DB/storage effect |
|---|---|---|---|
| View own profile | query `profiles` by `auth.uid()` (`MyProfile.tsx:46-59`) | — | SELECT allowed by own-row policy (`20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:12-16`) |
| Edit fields | `handleSaveProfile` (`MyProfile.tsx:116-146`) | none beyond types | UPDATE own row — policy `Users can update their own profile` `USING (auth.uid() = id)` (`20251014114352_...sql:81-83`) |
| Avatar upload | `handlePhotoUpload` (`MyProfile.tsx:84-114`) | ≤ 5 MB (`:87-90`) | upsert to `profile-images/{uid}/avatar.{ext}` (`:96-99`), `avatar_url` saved immediately (`:106`) |
| Change password | `handleChangePassword` (`MyProfile.tsx:148-204`) | min 8 (`:152`), confirm match (`:156`), re-auth with current password via `signInWithPassword` (`:163-170`), zxcvbn ≥ 2 + HIBP (`:172-183`) | `auth.updateUser({password})` (`:185`); audit `password_changed {method:'self'}` (`:194`) |

### 5.2 Admin-side — Users view Edit dialog

`handleSaveEdit` (`src/views/Users.tsx:571-626`) fires three parallel mutations via
`Promise.all` (`:609-622`): role (`:389-423`), status Active/Inactive on `profiles.status`
(`:459-475`), and full profile-field update (`:478-496`), plus avatar upload/removal in the
`profile-images` bucket beforehand (`:579-607`).

⚠️ UNVERIFIED / likely defect: the only `profiles` UPDATE policy in the migration history is the
own-row policy (`20251014114352_...sql:81-83`); **no Admin-update policy on `public.profiles`
exists** in `supabase/migrations/` (confirmed by enumerating every `ON public.profiles` policy) or
in the prod-applied `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql` (which only
rewrites anon→authenticated SELECT policies, `:37`). Under that state, an admin editing **another**
user's profile/status from this dialog matches 0 rows — PostgREST returns success with no rows, so
the `updateStatusMutation`/`updateProfileMutation` resolve without error and the UI toasts success
while writing nothing. Live-DB policy state (an out-of-band SQL-editor addition) is not verifiable
from the repo.

### 5.3 profiles RLS evolution (SELECT)

1. `Users can view all profiles` `USING (true)` — `20251014114352_...sql:77-79`
2. → `Authenticated users can view profiles` (TO authenticated, `USING (true)`) — `20251016035546_4ea02c08-d2af-456a-a2e2-cacd46327e5d.sql:9-13`
3. → own-row (`auth.uid() = id`) + `Admins can view all profiles` (`has_role(...,'Admin')`) — `20251016064350_7ace660c-3ad8-402b-84db-2739d3e6fb38.sql:12-24`
4. + `Contractors can view their own profile` (redundant with own-row) — `20251119090820_296d33c0-ea98-46ca-84c8-c43f543484d9.sql:263-269`

Consequence: the Users view's `profiles` list query (`Users.tsx:198-239`) only returns the full
roster for Admins; staff with the User/Moderator role see just their own row.

### 5.4 Avatar storage

Bucket `profile-images` created **public** (`20251015010856_b93b0802-94f0-48f4-9b68-3634fd86419f.sql:2-4`),
later set **private** (`UPDATE storage.buckets SET public = false`) alongside own-folder object
policies (`20251017094000_3768dc89-d62f-4024-8a63-0a5de4e09423.sql:9-10` flag, `:23-50` policies);
policies re-created with an `Admins can view all profile images` SELECT added
(`20251120051502_3843cc67-3b79-4c47-be4a-e544dd4c03fc.sql:258-294`, admin policy `:292-294`).
⚠️ UNVERIFIED: both MyProfile (`MyProfile.tsx:101-104`) and Users (`Users.tsx:595-599`) persist
`getPublicUrl()` URLs, which do not resolve against a private bucket — whether avatars render
depends on the live bucket's `public` flag, not provable from the repo.

---

## 6. Password reset issuance

### 6.1 Self-service (OTP-first), any user

`/auth/forgot-password` → `src/views/auth/ForgotPassword.tsx` (design notes `:24-37`):

1. Email step: optional Turnstile captcha gate (`:58-61`), email zod-validated
   (`validation-schemas.ts:108-111`), then `supabase.auth.resetPasswordForEmail(trimmed, {redirectTo: origin + '/auth'})`
   where `origin = window.location.origin` (`:71-75`). Response timing padded to 1.0-1.3 s against
   user enumeration (`:67-80`); the UI always advances to the code step regardless of whether the
   account exists (`:89-91`). Audit event `password_reset_requested {method:'recovery'}` (`:83`).
2. Code step: `verifyOtp({email, token, type:'recovery'})` (`:99-103`); success → recovery
   session → `/auth/reset-password` (`:115-116`).
3. The clickable link in the same email still works via the dispatcher:
   `/auth?type=recovery&token=...` → `verifyOtp({token_hash, type:'recovery'})`
   (`src/views/Auth.tsx:53-56,102-119`).
4. `ResetPassword` applies zod 8-72 + zxcvbn ≥ 2 + HIBP gates, updates the password, clears
   `requires_password_change`, records `password_changed {method:'recovery'}`, redirects by role
   (`src/views/auth/ResetPassword.tsx:49-85`).

### 6.2 Admin-issued

The Users-view "Reset Password" action is the resend flow of `invite-user` (§2.3 branch matrix):
temp password → password overwritten + forced-change flag, no email
(`invite-user/index.ts:96-114,180-197`); no temp password + confirmed user → Supabase recovery
email (`:199-224`); no temp password + unconfirmed user → fresh invite email (`:364-470`).

### 6.3 send-password-reset edge function — no caller found

`supabase/functions/send-password-reset/index.ts` (227 lines) builds a branded Resend recovery
email: per-IP rate limit 5/min per isolate (`:11-29`), email format check (`:54-64`),
`auth.admin.generateLink({type:'recovery'})` (`:73-79`), enumeration-safe success response on link
failure (`:81-94`), direct app link `${APP_URL}/auth?type=recovery&token=${hashed_token}`
(`:96-103`; `APP_URL` env with Vercel fallback `:69`), **correct** `company_logo_url` settings
column (`:106-112`), from `noreply@watsonmattheus.com` (`:189-194`). Email body claims a 1-hour
link expiry (`:144,177`).

**No `src/` code invokes it** (repo-wide grep finds only a comment reference, `src/views/Auth.tsx:27`),
and it has **no `[functions.send-password-reset]` entry** in `supabase/config.toml`. ⚠️ UNVERIFIED
whether it is dead code or called externally; the JWT-verification default for config-unlisted
functions is platform behavior, not visible in the repo.

### 6.4 requires_password_change flag lifecycle

| Transition | Where |
|---|---|
| Set true | `invite-user` when a temp password is issued — resend (`invite-user/index.ts:101`) and new-user (`:235`) metadata |
| Checked | `Login.tsx:60-71` (existing session), `Login.tsx:98-107` (after sign-in), `Auth.tsx:68-72` (dispatcher default path) — all route to `/auth/reset-password` |
| Cleared | `SetPassword.tsx:89`, `ResetPassword.tsx:80` via `auth.updateUser({data:{requires_password_change:false}})` |

---

## 7. Deactivation & deletion

### 7.1 Status (Active / Inactive)

Set only from the Users-view Edit dialog (`Users.tsx:1163-1175` UI, `:459-475` mutation) onto
`profiles.status` (column: `20251014120311_...sql:64`). ⚠️ UNVERIFIED enforcement: no code in
`src/` or edge functions reads `profiles.status` to block login or access (repo-wide grep for
`Inactive` matches only the Users view edit dialog and unrelated `is_active`/report-status uses) —
"Inactive" appears to be **display-only**. Also subject to the §5.2 RLS gap when set on a non-own row.

### 7.2 Deletion

UI: Users-view dropdown → confirm dialog (`Users.tsx:992-1001,1019-1053`) →
`deleteUserMutation` invokes `delete-user` with `{userId}` (`Users.tsx:499-522`).

Edge fn `supabase/functions/delete-user/index.ts` (109 lines; `verify_jwt = true`,
`supabase/config.toml:6-7`):

| Step | Line |
|---|---|
| JWT required, resolved via `auth.getUser(token)` | `delete-user/index.ts:27-39` |
| Admin gate: caller's `user_roles` row must be `'Admin'` (read with `.single()`) | `:42-50` |
| `userId` required | `:53-57` |
| Self-deletion blocked (`userId === caller`) | `:59-62` |
| `auth.admin.deleteUser(userId)` | `:64-71` |
| `account_deleted` audit insert (best-effort, `try/catch`), metadata `{deleted_by: user.id}` | `:73-84` |

Side effects: deleting the `auth.users` row cascades to `profiles`
(`20251014114352_...sql:3` + `20251020093858_...sql:10-12`), `user_roles`
(`20251014120311_...sql:7` + `20251020093858_...sql:23-25`), `user_clients` and `user_sites`
(`20251020093858_...sql:36-38,49-51`); `activity_logs.user_id` is `ON DELETE SET NULL`
(`20251020093858_...sql:62-64`). The `auth_events` row written at `:73-84` persists (no FK,
`20260525120000_auth_events_audit.sql:12-14,20`). No soft-delete, no grace period. The
`account_deleted` write is the only audit/erasure record (`:79`).

---

## 8. Lifecycle email sending

| Email | Producer | Provider / from | Cited |
|---|---|---|---|
| Invite (new or unconfirmed user) | `invite-user` | Resend, `${companyName} <noreply@watsonmattheus.com>` | `invite-user/index.ts:465-469` |
| Recovery (admin resend, confirmed user) | `invite-user` → `auth.resetPasswordForEmail` | Supabase built-in mailer — template/SMTP configured in dashboard, ⚠️ UNVERIFIED from repo | `invite-user/index.ts:199-205` |
| Recovery OTP + link (self-service) | `ForgotPassword` → `auth.resetPasswordForEmail` | Supabase built-in mailer ⚠️ as above | `ForgotPassword.tsx:71-75` |
| Branded password reset | `send-password-reset` | Resend, `noreply@watsonmattheus.com` — **no caller in repo** (§6.3) | `send-password-reset/index.ts:189-194` |
| Temp-password issuance | — | **No email**; password shown in admin toast | `invite-user/index.ts:343-362`, `Users.tsx:304-308` |

`send-email` (`supabase/functions/send-email/index.ts`) is **not used for the user lifecycle**:
it is a generic Gmail-SMTP relay (`GMAIL_USER`/`GMAIL_APP_PASSWORD`, smtp.gmail.com:465) invoked
only by suggestion/issue-report features (`src/components/SuggestionDialog.tsx:102`,
`src/components/IssueReportDialog.tsx:93`, `src/views/Suggestions.tsx:182`,
`src/views/IssueReports.tsx:189`). It performs no role check beyond gateway JWT verification
(`verify_jwt = true`, `supabase/config.toml:21-22`). ⚠️ UNVERIFIED: exact validation lines inside
`send-email/index.ts` were not re-read for this scope; treat the "any authenticated user can send
mail" inference as design-level, gated only by `verify_jwt`.

---

## 9. Audit trail (lifecycle events)

Writer: `log-auth-event` edge fn (`verify_jwt = false` so pre-session events land,
`supabase/config.toml:83-84`, comment `:79-82`). It splits event types into ANON
(`password_reset_requested`, `magic_link_requested`, `lockout` — `user_id` forced NULL,
`supabase/functions/log-auth-event/index.ts:29-33,139-141`) and AUTHED (login, logout,
password_changed, mfa_*, account_deleted, account_email_changed, user_created — `user_id` from
verified JWT only, `:35-44,126-138`). Metadata whitelisted to `method/reason/error_code`
(`:47,76-85`); per-IP 20/min per isolate (`:50-65`). Client helper `recordAuthEvent` is
fire-and-forget with a 50-entry localStorage retry queue (`src/lib/auth-audit.ts:60-105`).

> Two lifecycle events are written **server-side, not via `log-auth-event`** — the edge functions
> insert directly into `auth_events` with the service-role client:
> - `user_created` — `invite-user/index.ts:255-265` (new-user branch only; metadata
>   `{ role, invited_by, via:'invite-user' }`).
> - `account_deleted` — `delete-user/index.ts:73-84` (metadata `{ deleted_by }`).
>
> Both are best-effort (`try/catch`, non-fatal). They do **not** go through the `log-auth-event`
> rate-limit / whitelist path. An earlier draft of this doc incorrectly stated these events are
> "never emitted"; they are emitted by the edge functions.

Lifecycle events emitted via the `recordAuthEvent` client helper:

| Event | Emitted from |
|---|---|
| `password_changed {method:'invite'}` | `SetPassword.tsx:91` |
| `password_changed {method:'recovery'}` | `ResetPassword.tsx:82` |
| `password_changed {method:'self'}` | `MyProfile.tsx:194` |
| `password_reset_requested {method:'recovery'}` | `ForgotPassword.tsx:83` |
| `login {method:'password'\|'magic_link'}` | `Login.tsx:99,172` |
| `magic_link_requested` | `Login.tsx:137` |
| `logout` | `AppSidebar.tsx:115`; `ClientPortalLayout.tsx:81`; `ContractorPortalLayout.tsx:76`; `SessionWatcher.tsx:57` (`{reason:'session_expired'}`) |

`user_created` and `account_deleted` are also in the schema CHECK
(`20260525120000_auth_events_audit.sql:30,32`) and the `log-auth-event` AUTHED allowlist
(`log-auth-event/index.ts:41,43`), but no `recordAuthEvent("user_created"|"account_deleted")` call
exists in `src/` — they are emitted only by the edge functions (above), never the client.

---

## Open questions

1. **Admin profile/status updates vs RLS.** No Admin UPDATE policy on `public.profiles` exists in
   the migration history or the prod-applied tier-2 SQL (only own-row: `20251014114352_...sql:81-83`).
   Does the live DB have one (added via SQL editor)? If not, the Users-view Edit dialog's
   profile/status writes for other users (`Users.tsx:459-496,609-622`) silently no-op while
   toasting success.
2. **`pending_user_invites.invited_at` is never written.** The Send/Resend button state
   (`Users.tsx:863-866`) keys off a column no code path updates. Was a write in `invite-user`
   intended?
3. **Pending-invite sends pass no `role`** (`Users.tsx:244-246`). What does `invite-user` do at
   runtime with `role === undefined` — `update({role: undefined})` on the new-user branch
   (`:274-285`), or the existing-email rejection (`:225-226`) if the backlog email already has an
   `auth.users` row? Both are reachable depending on data state.
4. **`send-password-reset` has no caller** in the repo and no `config.toml` entry. Dead code, or
   invoked from outside (cron, external tool)? What is its effective JWT verification state for a
   config-unlisted function?
5. **invite-user branding query selects nonexistent `settings.logo_url`**
   (`invite-user/index.ts:388-391` vs `20251014132137_...sql:99`) — invite emails can never carry
   the company logo, and the unchecked `.single()` error nulls the whole settings row. Intended
   fix: `company_logo_url` (as `send-password-reset` already uses)?
6. **`profiles.status = 'Inactive'` enforcement.** Nothing reads the column to block login or
   gate access. Is deactivation supposed to gate sessions, or is the field cosmetic?
7. **Avatar URLs vs private bucket.** `profile-images` was set private
   (`20251017094000_...sql:9-10`), but the app stores `getPublicUrl()` URLs
   (`MyProfile.tsx:101-104`, `Users.tsx:595-599`). What is the bucket's live `public` flag, and do
   avatars currently render?
8. **Audit emission asymmetry.** `user_created` fires only on the new-user invite branch
   (`invite-user/index.ts:255-265`), not on any resend branch; `account_deleted` fires on delete
   (`delete-user/index.ts:73-84`). Should resend/role-change/status-change also emit audit rows,
   and should the direct service-role inserts route through `log-auth-event` for consistent
   rate-limit/whitelist handling?
9. **`delete-user` Admin check uses `.single()`** (`delete-user/index.ts:42-46`); since
   `user_roles` is `UNIQUE(user_id, role)` (not unique on `user_id`), a caller holding two role
   rows would make `.single()` error and deny deletion. (`invite-user` uses `.maybeSingle()`,
   `:50`, and so avoids this.) Can multi-role rows occur in practice?
10. **Temp-password floor is 6 chars** (`invite-user/index.ts:71-73`, `Users.tsx:790`) while every
    user-set password requires ≥ 8 + zxcvbn ≥ 2 (`validation-schemas.ts:113-122`). Intentional gap
    for admin-issued temporaries?
11. **Unused validation schemas.** `userInviteSchema` and `profileUpdateSchema`
    (`validation-schemas.ts:46-68`) are imported nowhere; the invite/profile-edit flows send raw
    form state. `userInviteSchema`'s role enum is also stale (`['Admin','Client','Contractor']`,
    missing `User`/`Moderator`/`Contractor`-vs-actual). Dead code, or intended to be wired in?
12. **Supabase dashboard auth config** (recovery/invite email templates, OTP expiry — the
    `send-password-reset` email claims 1-hour expiry at `:144,177` — Site URL, SMTP) is not in the
    repo and could not be verified.
