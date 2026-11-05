# Login, password reset and admin-assist: end-to-end review

**Date:** 2026-10-29. **Code reviewed:** `origin/main` @ `9b2ed08b`. **Live config:** Supabase project `oltzgidkjxwsukvkomof`, read through the Management API on 2026-10-29.
**Reported:** users can't log in. When they reset a password they get the code by email, but the code is rejected or reported as expired straight away. Admin "reset password" help doesn't work. Audit records don't follow the user through the process.

Each finding is labelled with how much is proven:
- **CONFIRMED**: I read it in the code or the live config.
- **LIKELY**: it follows from documented Supabase (GoTrue) behaviour, but I haven't reproduced it.
- **UNVERIFIED**: it needs the database query that was blocked in this session (see the end of this document).

---

## 1. Every layer this touches

| # | Layer | Where |
|---|-------|-------|
| 1 | Login form (password tab and magic-link code tab) | `src/views/auth/Login.tsx` |
| 2 | Forgot password: send code, then type code | `src/views/auth/ForgotPassword.tsx` |
| 3 | Link landing pages: `/auth` dispatcher and `/` (Index) | `src/views/Auth.tsx`, `src/views/Index.tsx` |
| 4 | Set new password / first password | `src/views/auth/ResetPassword.tsx`, `SetPassword.tsx` |
| 5 | Forced password change | `ProtectedRoute` / `ClientProtectedRoute` / `ContractorProtectedRoute` (`requires_password_change`) |
| 6 | Admin "Invite", "Resend" and "Reset Password" | `src/views/Users.tsx` → `supabase/functions/invite-user` |
| 7 | Supabase Auth: redirect allow-list, Site URL, OTP, email templates, password policy | Live project config |
| 8 | Email delivery | Resend SMTP (`smtp.resend.com`, from `noreply@watsonmattheus.com`) |
| 9 | Recipient mailbox: link scanners (Microsoft Defender Safe Links and similar) | External |
| 10 | Audit trail | `src/lib/auth-audit.ts` → `log-auth-event` → `public.auth_events` |

Live auth config values that matter here (CONFIRMED):

| Setting | Live value | Assessment |
|---|---|---|
| `site_url` | `https://insight-linker-app.vercel.app` | **Wrong.** This is the old domain, which now 308-redirects to `watsonmattheus.com`. |
| `uri_allow_list` | `insight-linker-app.vercel.app/**`, `localhost:3000/**`, `insight-linker-app-*.vercel.app/**` | **`watsonmattheus.com` is missing.** |
| `mailer_otp_length` | 6 | Fine. It matches the 6-digit input. |
| `mailer_otp_exp` | 3600 s | Fine. Codes really do last one hour. |
| Recovery template | Contains both `{{ .Token }}` (code) and `{{ .ConfirmationURL }}` (link) | The link undermines the code (see RC-2). |
| `smtp_max_frequency` | 60 s | Asking again within 60 s fails, and the app hides the failure (see RC-3). |
| `password_hibp_enabled` | true | Supabase rejects breached passwords, including admin-chosen temporary ones (see RC-4). |
| `password_min_length` | 6 | The app's own forms require 8 or more. These are inconsistent but don't cause the reported failure. |
| `security_captcha_enabled` | false | The Turnstile widget in the app is checked in the browser only, so it gives no server-side protection. Separate issue. |

---

## 2. Root causes

### RC-1: Every emailed link lands on the wrong page, and the user is signed in without ever setting a password. CONFIRMED (config + code)

*Every auth link is broken because Supabase rejects the redirect target. Evidence: `uri_allow_list` has no `watsonmattheus.com` entry, and `site_url` is the old domain.*

- The app asks for `redirectTo = https://watsonmattheus.com/auth` (`ForgotPassword.tsx:71`). `invite-user` asks for `${APP_URL}/auth?type=invite` and `${APP_URL}/auth` (`index.ts:347`, `:492`), with `APP_URL = https://watsonmattheus.com`.
- That address isn't on the allow-list, so Supabase falls back to `site_url`, the root `https://insight-linker-app.vercel.app/`. That 308-redirects to `https://watsonmattheus.com/`. I checked the redirect live; it keeps the path and query.
- `/` is `Index.tsx`. Supabase's client reads the session out of the link, `Index` finds it, and routes the user by role to `/dashboard` (or the client portal or contractor home). **`/auth` never runs, so the "set your password" and "reset your password" screens are never shown.**
- Effect on an **invite link**: the user is signed in once, with no password. When that session ends they cannot log in. This matches "unable to login".
- Effect on a **reset link** (the link in the reset email, or the email an admin "Reset Password" sends): the user lands in the dashboard, the password is never changed, and the next login with the forgotten password fails.
- Only users flagged `requires_password_change: true` are caught, because the route guards send them to `/auth/reset-password`. Link-based invites set that flag to `false` (`invite-user/index.ts:368`, `:527`).

How many accounts this has already affected is **UNVERIFIED**. It needs a count of users with no password who have signed in.

### RC-2: The code and the link are the same single-use credential, and things outside the user's control burn it. CONFIRMED (code + template) / LIKELY (scanner)

*The typed code fails because it was already used or replaced before the user typed it.*

In Supabase, the 6-digit code and the link in the same email point to one stored recovery token. Whichever is used first consumes it, and every new send replaces it. The token can be lost before the user types the code in several ways:

1. **Mail link scanners.** Microsoft 365 Safe Links and similar tools open every link when the email arrives. Opening `{{ .ConfirmationURL }}` verifies, and so consumes, the token, so the code the user then types fails. The recovery template contains that link (`supabase/templates/recovery.html:60`, and the live template does too). The code comment in `ForgotPassword.tsx:34-36` names this risk, but the template still carries the link. LIKELY. This matches the symptom exactly ("receive the code, then it doesn't work").
2. **Asking again.** After 60 s, every new reset request replaces the old code. Users whose email is slow press "Back" and then "Send Code" again, then type the code from the *first* email. Rejected.
3. **An admin's reset or resend while the user is mid-reset.** It sends a new token and kills the user's code (`invite-user/index.ts:493`).
4. **A magic-link request.** It uses the same recovery-token slot for existing users. LIKELY, from GoTrue's behaviour; not reproduced.

### RC-3: The app tells the user "Code expired" for every failure and hides send failures. CONFIRMED (code)

*The "immediately says it has expired" message is produced by our own code.*

- Supabase returns one message for a wrong, used, replaced or expired code: *"Token has expired or is invalid"*.
- `ForgotPassword.tsx:106` (and the same at `Login.tsx:173`) maps any message containing `"expired"` to **"Code expired. Request a new one."** So every failure reads as "expired", even seconds after the email arrived.
- `ForgotPassword.tsx:85-91`: errors from `resetPasswordForEmail` are only logged in development. The user always sees "Check your email for the 6-digit code", even when Supabase refused to send (60-second limit, rate limit, SMTP error). They then type an older code, which fails.
- The screen never says that only the most recent code works.

### RC-4: Admin "Reset Password" is two different actions behind one button, and both can fail silently. CONFIRMED (code) / LIKELY where marked

The dialog (`Users.tsx:1511-1560`) says: "Set a temporary password … or leave blank to send an email invitation."

**Path A: admin types a temporary password**
- `invite-user/index.ts:378-385`: if `auth.admin.updateUserById` fails, the error is **only logged with `console.warn`**. The function then returns *"Password reset successfully. Temporary password: X"* (`:479`). The admin passes on a password that was never set, and the user can't log in.
- Why it would fail: HIBP is on live, so common passwords like `Welcome123` are rejected. LIKELY: GoTrue's admin update runs the same strength check. Not reproduced.
- The temporary password is free text that the admin chooses, and is shown in plain text in a toast (`Users.tsx:463`). The invite form already has a secure generator (`generateInitialPassword`); the reset dialog doesn't use it.
- Role, client and site writes in this path don't check their errors (`index.ts:388-445`). If the role lookup failed when the list loaded, the user's role is sent as `'User'` (`Users.tsx:304`) and saved, which would silently demote a Client or Contractor.

**Path B: admin leaves it blank**
- For a confirmed user, the function calls `resetPasswordForEmail` (`index.ts:493`). The user gets the "enter this 6-digit code" email, but **they never started a reset in the app, so they have no screen to type the code into.** Going to Forgot Password sends a *new* code that cancels the first (RC-2). Clicking the link lands on `/` and signs them in without a reset (RC-1). That route cannot succeed.

**Other admin defects**
- `findUserByEmail` compares `u.email === email` exactly (`index.ts:221`). Supabase stores email addresses in lower case, and the admin form doesn't lower-case them. A mixed-case address isn't recognised as existing, so the function falls through to "create user", which Supabase rejects as a duplicate.
- `isConfirmed = existingUser.email_confirmed_at !== null` (`index.ts:360`). If the API leaves the field out (undefined) for unconfirmed users, they are treated as confirmed and sent a reset email instead of an invite. UNVERIFIED.

### RC-5: The audit trail cannot follow one user through the process. CONFIRMED (code)

- `password_reset_requested` and `magic_link_requested` are logged anonymously. `log-auth-event` deliberately forces `user_id = NULL` and records no email address. A reset request can't be tied to a person.
- They are logged **even when the send failed** (`ForgotPassword.tsx:83`).
- **Nothing is logged** for:
  - failed code entries,
  - a successful code check,
  - admin "Reset Password" in either path,
  - admin resends,
  - a failed temporary-password update.

  `invite-user` writes only `user_created`.
- Events are sent from the browser on a best-effort basis (retry queue in `localStorage`), so they are lost if the tab closes.
- Supabase's own `auth.audit_log_entries` has the real sequence of events, but nothing in the app shows it to an admin.

Effect: when a user says "it doesn't work", an admin has no record to look at.

### RC-6: Smaller defects on the same path. CONFIRMED (code) / LIKELY where marked

- `ResetPassword.tsx:80` and `SetPassword.tsx:89`: the second `updateUser` call, which clears `requires_password_change`, isn't checked. If it fails, the user changes their password and is still forced back to the reset screen.
- `Auth.tsx:62-76`: on a recovery link, `getSession()` resolves *before* the client fires its `PASSWORD_RECOVERY` event (deferred with `setTimeout(0)` in auth-js 2.99.2, `GoTrueClient.js:296`). The dispatcher therefore calls `navigate("/auth/login")` first, and Login's "already signed in" check then races the recovery redirect. LIKELY. This only matters once RC-1 is fixed.
- `site_url` still points at the old domain, so every Supabase-generated email defaults there.

---

## 3. Is the design itself wrong?

**Yes.** These aren't isolated bugs in a sound flow.

1. **One email carries two competing credentials** (code and link) for one single-use token. Scanners consume the link and so break the code.
2. **One admin button does two different things**: set a password, or email the user.
3. **The admin-triggered reset sends the user into a flow that assumes they started it themselves.** It sends a code with nowhere to type it.
4. **Link invites depend on a redirect that is fragile**, and none of them set `requires_password_change`. Nothing makes sure a password was ever created.
5. **Audit is anonymous, browser-side and best-effort**, where it should be server-side, tied to the user, and record failures.

---

## 4. Proposed fix (for approval; no code written yet)

### Step 0: live config change (no deploy, minutes, reversible)
- Add `https://watsonmattheus.com/**` to the Auth redirect allow-list and set `site_url` to `https://watsonmattheus.com`. Keep the old entries for now.
- This fixes RC-1 for every link already sitting in an inbox, as long as the token hasn't been used.
- Deploy cost: none. It is a single PATCH to the auth config.

### Step 1: password reset that a scanner can't break
- **The reset email carries the code only.** Its button opens `https://watsonmattheus.com/auth/forgot-password?email=<addr>`, which goes straight to the code-entry step. The button has no token in it, so a scanner opening it changes nothing.
- The code screen will:
  - show what actually went wrong (wrong or replaced code vs. too many attempts vs. send refused),
  - say "only the most recent code works",
  - offer a **Resend code** button with a 60-second countdown,
  - stop hiding send errors.
- This also makes the admin-triggered reset work, because the email's button opens the right screen.

### Step 2: split admin assist into two explicit actions
- **"Email a reset code"**: sends the Step-1 email and logs who did it.
- **"Set a temporary password"**: always generated (`generateInitialPassword`), always emailed through the existing branded-email path, and always flagged `requires_password_change`. Never shown in a toast.
- Both actions **fail loudly**: any error from `updateUserById` or from the role, client or site writes is returned to the admin, never logged as a warning only.
- Email addresses are trimmed and lower-cased before lookup. A missing role is an error, not a default to `'User'`.
- A user who hasn't accepted their invite gets a new invite of the same kind, not a reset email.

### Step 3: invites a user can't lose
- Make "email login details" (temporary password plus forced change) the default invite.
- Keep the link invite only behind the fixed allow-list. The `/` page and the route guards also send any recovery or invite session to the right screen, so a link can never sign someone in without a password.

### Step 4: audit that follows the user
- Log on the server inside the functions, with `user_id` resolved from the email:
  - reset requested (sent or failed),
  - code verified or failed,
  - password changed,
  - admin reset or temporary password (with the acting admin's id),
  - invite resent.
- Add an admin-only **"Sign-in history"** panel per user, reading our events plus Supabase's `auth.audit_log_entries`, so an admin can see exactly where a user is stuck.

### Built-in diagnostics (ship with the first deploy, not after)
- Every send or verify failure shows the user a reason code and writes an `auth_events` row that includes the Supabase error code.
- The admin panel shows the last reset, last code failure and last sign-in for each user.

### Verification plan (stated before building)
1. **Config:** re-read the auth config and confirm the allow-list and `site_url`.
2. **End to end against production** with a test account on the `wmeng.co.za` mailbox. It sits behind real Microsoft 365 scanning, which is the worst case.
   - Reset from Forgot Password: code arrives, code works, the new password logs in, the old one is rejected.
   - Admin "Email reset code": the email's button opens the code screen and the code works.
   - Admin "Set temporary password": the emailed password logs in, forces a change, and the change sticks.
   - Request twice: the old code gets the "replaced" message and the new code works.
   - Invite: user accepts, sets a password, logs in again after signing out.
3. **Audit:** each step above leaves a matching row tied to the user, visible in the admin panel.
4. **Unit tests** for the error mapping and the admin function's failure paths.

---

## 5. Not verified in this session

- **How many real users are affected now.** I need a read-only query on `auth.users` and `auth.audit_log_entries`: accounts with no password that have signed in, accounts stuck with `requires_password_change`, reset activity in the last 30 days, and duplicate `user_roles` rows. The permission classifier blocked that query in this session.
- With that data, the repair list would be: users who need a fresh temporary password, and users who need the flag cleared.
- Whether GoTrue's admin update enforces HIBP (RC-4), and whether `email_confirmed_at` is omitted for unconfirmed users. The first E2E run would settle both.

---

## 6. Progress

### Step 0: applied to live config 2026-11-03
- `site_url` is now `https://watsonmattheus.com`, and `https://watsonmattheus.com/**` is on the allow-list. The old entries are kept.
- Verified with a harmless invalid-token request to `/verify`:
  - an allowed `redirect_to` is honoured,
  - a disallowed one falls back to `watsonmattheus.com`.

### Step 1: branch `fix/auth-reset-step1` (not deployed)

| Root cause | Change | Files |
|---|---|---|
| RC-6 race, RC-1 leftovers | A recovery session is recognised from the token's `amr` claim, with no event timing involved. `/auth`, `/` and `/auth/login` all send it to `/auth/reset-password`. | `src/lib/auth/recoveryFlow.ts`, `src/views/Auth.tsx`, `src/views/Index.tsx`, `src/views/auth/Login.tsx` |
| RC-3 | Rejected codes are explained ("mistyped, already used, or replaced by a newer email") with a `ref`, instead of always "Code expired". Send failures are shown, not hidden; a send blocked by the 60-second limit moves on to the code screen and says so. | `ForgotPassword.tsx`, `Login.tsx`, `recoveryFlow.ts` |
| RC-2 | The screen says only the latest email's code works. "Send a new code" waits out a 60-second countdown. There is an "I already have a code" entry point, and `?step=code` opens straight onto the code screen. Pasting "123 456" works. | `ForgotPassword.tsx`, `src/app/auth/forgot-password/page.tsx` |
| RC-2 | **Email template is code-only.** The token link is removed; the button opens `{{ .SiteURL }}/auth/forgot-password?step=code`, which carries no token. This also gives the admin "Reset Password" (blank) email somewhere to type the code. | `supabase/templates/recovery.html` (live template applied at deploy) |
| RC-6 | Reset completion checks that the flag was cleared, then signs in again with the new password. That ends the recovery session and proves the password works before the user is told it does. | `ResetPassword.tsx` |
| RC-5 (interim) | Events recorded: each send (`sent` / `send_failed`), each rejected code (`code_rejected`) with the Supabase error code, a verified code (`login`, method `recovery`, with the user), and the password change (`verified` / `flag_clear_failed` / `resignin_failed`). Failures are still anonymous until Step 4 moves audit to the server. | — |

**Verified before deploy:**
- 22 new tests: 11 helper, 7 Forgot Password screen, 4 landing. The 2 recovery landing tests fail on `main`'s code and pass on this branch.
- Full suite: 901 tests pass. 4 MCP test files don't load in this worktree because `@modelcontextprotocol/sdk` is missing from the borrowed `node_modules`; this branch doesn't touch them.
- `tsc` reports no errors in the changed files. ESLint: 0 errors.
- **Not browser-checked:** the local `next dev` hung at start-up, so the screens were exercised through component tests instead.

**Deploy plan (proposed, not done):**
1. **Web:** merge the branch to `main`, then `vercel --prod --yes`. Build takes about 5–8 minutes. Users on the old PWA shell need one reload. There is no database migration and no edge-function change.
2. **Live email template** (only after step 1 is live): PATCH `mailer_templates_recovery_content` with `supabase/templates/recovery.html`, and set the subject to "Your WM Compliance password reset code". Save the current template first, so rolling back is a single PATCH. Order matters: until the new screen is live, the new button would open the old email-entry screen.
3. **Check:** re-read the template through the API and confirm it has no `ConfirmationURL`.
4. **E2E:** request a reset for a test account on the `wmeng.co.za` mailbox (behind Microsoft 365 scanning). Read the code from that mailbox, then:
   - the code is accepted, even after the email has sat long enough for a scan,
   - a second request makes the first code fail with the "replaced" message,
   - `auth_events` gets `sent`, `code_rejected` and `login`/`recovery` rows.

   Typing the new password on the live site has to be done by a person: the agent doesn't enter passwords into production.

Not in Step 1:
- The magic-link template still has code + link (same scanner exposure, sign-in only).
- Admin actions (Step 2), invites (Step 3), server-side audit (Step 4).
