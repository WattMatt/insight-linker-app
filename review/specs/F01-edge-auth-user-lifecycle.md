# F01 — edge-auth-user-lifecycle — Phase 2 spec

- Unit id: F01
- Slug: edge-auth-user-lifecycle
- Spec mode: full
- Date: 2026-07-29
- Files: 5 (matches `review/unit-files.json` key "F01")

## Unit header

**Unit purpose.** Five self-contained Deno edge functions that implement the account lifecycle around Supabase Auth: admin-driven user provisioning with role/client/site mapping and branded invite or initial-password emails (invite-user), admin-driven account deletion (delete-user), a hardened audit-trail writer for the `auth_events` table (log-auth-event), a branded password-reset email sender (send-password-reset), and a generic Gmail-SMTP email relay (send-email). None of the five exports any symbol; each file's entire public surface is one HTTP handler registered via `Deno.serve(...)` or `serve(...)` (verified: no `export` statement in any of the 5 files).

**Module-level observations (cross-file facts).**
- All five create their Supabase client with `SUPABASE_SERVICE_ROLE_KEY` (invite-user/index.ts:177-179, delete-user/index.ts:16-25, log-auth-event/index.ts:118-122, send-password-reset/index.ts:46-50, send-email/index.ts:29-32).
- All five ship identical permissive CORS headers `Access-Control-Allow-Origin: *` (invite-user:6-9, delete-user:4-8, log-auth-event:24-27, send-password-reset:6-9, send-email:5-8) and answer OPTIONS preflight before any auth check.
- Two email providers coexist: Resend (`esm.sh/resend@2.0.0`, sender `noreply@watsonmattheus.com`) in invite-user (index.ts:2,4,158-163,665-670) and send-password-reset (index.ts:2,4,189-194); Gmail SMTP via denomailer in send-email (index.ts:2,72-95, from = `GMAIL_USER` at 88).
- Dependency version spread inside the unit: supabase-js `@2.39.3` (invite-user:1, log-auth-event:1, send-password-reset:1) vs `@2.7.1` (delete-user:2) vs unpinned `@2` (send-email:3); deno std http `0.168.0` (delete-user:1) vs `0.190.0` (send-email:1); the other three use the built-in `Deno.serve`.
- Both invite-user and send-password-reset derive their link base from `Deno.env.get('APP_URL')` with the identical fallback `'https://insight-linker-app.vercel.app'` (invite-user:234, send-password-reset:69), with comments explaining the request Origin is deliberately not trusted (invite-user:231-233, send-password-reset:66-68).
- Both invite-user and send-password-reset read `settings.company_name` / `company_logo_url` via `.single()` for email branding, defaulting to `'WM Compliance'` (invite-user:140-145,588-593; send-password-reset:106-111).
- `auth_events` is written by three of the five functions: log-auth-event (index.ts:146-152, its whole job), invite-user (`user_created`, index.ts:437-441), delete-user (`account_deleted`, index.ts:77-81). In invite-user and delete-user the insert's returned `error` object is never inspected — only thrown exceptions reach the surrounding `try/catch` (invite-user:436-444, delete-user:76-84).
- Two in-memory per-isolate per-IP rate limiters: log-auth-event 20 req/min with map cleanup once size ≥ 10 000 (index.ts:50-74,101); send-password-reset 5 req/min with no cleanup routine at all (index.ts:15-29).
- `verify_jwt` declarations (unit D04, supabase/config.toml): invite-user `true` (config.toml:3-4), delete-user `true` (6-7), send-email `true` (21-22), log-auth-event `false` with an explanatory comment (61-66). send-password-reset has no config.toml entry (`grep -n 'send-password-reset' supabase/config.toml` → no match).
- No test file anywhere in the repo references any of the five functions (`grep -rln "invite-user\|delete-user\|log-auth-event\|send-password-reset\|send-email" src --include='*.test.*' --include='*.spec.*'` → no matches; `find supabase/functions -name '*test*'` → nothing).
- Untracked byte-identical duplicate on disk: `supabase/functions/log-auth-event/index 2.ts` (`git status --porcelain` → `??`; `diff` → identical).

**External contract (what the rest of the app gets).**
- `invite-user`: called by the admin Users screen — src/views/Users.tsx:261, 303, 373 (V02) — for create-invite, create-with-temp-password, and resend flows; the `temporaryPassword` it receives is produced by `generateInitialPassword()` from src/lib/auth/initialInvite.ts (L21), wired at src/views/Users.tsx:5,667.
- `delete-user`: called by the same admin screen — src/views/Users.tsx:522 (V02).
- `log-auth-event`: called exclusively through the client helper `recordAuthEvent` in src/lib/auth-audit.ts:62 (L13), which is in turn imported by C10 (SessionWatcher), C11 (AppSidebar, ClientPortalLayout, ContractorPortalLayout), V02 (MyProfile), and V05 (Login, ResetPassword, SetPassword, ForgotPassword) — grep-verified list above. The function's event vocabulary (3 anon + 8 authed = 11 types, log-auth-event/index.ts:29-44) exactly matches the `AuthEventType` union in src/lib/auth-audit.ts:16-27, and its metadata allowlist (`method`, `reason`, `error_code`, index.ts:47) matches `AuthEventMetadata` (auth-audit.ts:29-33).
- `send-password-reset`: no in-repo invocation (grep-verified). The frontend forgot-password flow uses `supabase.auth.resetPasswordForEmail` directly (src/views/auth/ForgotPassword.tsx:72, V05). Only comment references exist (src/views/Auth.tsx:27, invite-user/index.ts:233).
- `send-email`: no tracked in-repo invocation; the only grep hit is the untracked duplicate `src/views/IssueReports 2.tsx:189` (`git status --porcelain` → `??`; no tracked `src/views/IssueReports.tsx` exists — `git ls-files | grep -i issuereports` → empty).

---

## supabase/functions/invite-user/index.ts

- Purpose: Admin-only edge function that creates or re-invites a platform user, assigns role/client/site mappings, and delivers credentials either as a Resend-branded invite link, a Resend-branded initial-password email, or a plaintext temporary password echoed back to the admin.
- Public surface:
  - HTTP handler: `Deno.serve(async (req) => ...)` (line 171). OPTIONS → 204-style empty response with CORS (172-174).
  - Request: POST JSON `InviteUserRequest` (interface, 11-24): `{ email: string; fullName: string; role: string; isResend?: boolean; temporaryPassword?: string; clientId?: string; siteIds?: string[]; deliverByEmail?: boolean }`.
  - Success responses (all 200 JSON with CORS):
    - resend + temp password + deliverByEmail: `{ success, userId, isNewUser: false, passwordEmailed: true, message }` (349-358);
    - resend + temp password (legacy): `{ success, userId, isNewUser: false, message: "...Temporary password: <plaintext>...", temporaryPassword }` (363-375);
    - resend, confirmed user, no temp password: `{ success, userId, isNewUser: false, message }` after a recovery email (391-402);
    - create/update + temp password + deliverByEmail: `{ success, userId, isNewUser, passwordEmailed: true, message }` (533-542);
    - create/update + temp password (legacy): `{ success, userId, isNewUser, message (contains plaintext for new users), temporaryPassword }` (547-561);
    - invite-link path: `{ success, userId, isNewUser, message }` (679-692).
  - Error response: `{ success: false, error }` at status 400 for every failure including auth failures (693-704).
  - Module-private: `escapeHtml(value: string): string` (26-33); `renderInitialPasswordEmailHtml(params: { companyName; logoUrl?; fullName; role; email; password; loginUrl }): string` (41-129); `sendInitialPasswordEmail(supabase, params: { email; fullName; role; password; origin }): Promise<void>` (136-169).
- Inputs & outputs:
  - In: JSON body above; `Authorization: Bearer <JWT>` header (182-188); env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (177-178), `RESEND_API_KEY` (4), `APP_URL` with fallback `https://insight-linker-app.vercel.app` (234).
  - Out: JSON responses above; up to two kinds of outbound email (invite link 665-670, initial password 158-163); recovery email via `resetPasswordForEmail` (382-384).
  - Tables: `user_roles` read/insert/update (196-204, 277-292, 447-483); `user_clients` read/insert/update (296-312, 486-500); `user_sites` delete+insert (316-334, 503-519); `settings` read (140-143, 588-591); `auth_events` insert `user_created` (437-441). Auth Admin API: `listUsers()` (240), `updateUserById` (267-270), `createUser` (423), `generateLink({ type: 'invite' })` (565-575); plus non-admin `resetPasswordForEmail` (382).
- Dependencies:
  - uses -> `https://esm.sh/@supabase/supabase-js@2.39.3` (1), `https://esm.sh/resend@2.0.0` (2). Cross-unit coupling by contract, not import: the `temporaryPassword` it validates at ≥6 chars (227-229) is generated client-side by src/lib/auth/initialInvite.ts (L21) per its own comment (21-22) and Users.tsx wiring.
  - used by <- V02 admin-ops-and-template-views (src/views/Users.tsx:261, 303, 373 — three `supabase.functions.invoke('invite-user', ...)` calls). Comment-only references: src/lib/auth/initialInvite.ts:5 (L21), src/views/Auth.tsx:26 (V04), src/views/auth/Signup.tsx:9 (V05). Grep-verified.
- Side effects: creates/updates Supabase Auth users (`createUser` 423, `updateUserById` 267, `email_confirm: true` when a temp password is set at 264/410); mutates `user_roles`, `user_clients`, `user_sites`; deletes then re-inserts all `user_sites` rows for contractors on resend (318-331); sends Resend emails; triggers Supabase's own recovery email via `resetPasswordForEmail` (382); inserts an `auth_events` audit row (new-user path only); extensive `console.log`/`console.error` logging including the target email and role (214, 237).
- Error handling: a single top-level `try/catch` converts every thrown error into a 400 `{ success:false, error: message }` (693-704) — including missing/invalid JWT (184, 192) and non-admin caller (203), so authorization failures are 400 not 401/403. Within the flow: `updateUserById` failure on the resend path is only `console.warn`ed and processing continues (272-274); the `auth_events` insert is wrapped in try/catch with a warn (436-444) but the awaited call's returned `error` field is never inspected, so a DB-level insert failure is silent; role/client/site mapping errors on the create path throw (461-463, 478-481, 494-497, 513-516); Resend send errors throw from `sendInitialPasswordEmail` (165-168) and at 672-675; `generateLink` error throws (577-580). The role check reads with `.maybeSingle()` and treats a missing row the same as a wrong role (196-204).
- Tests: none found (grep-verified — no test file references `invite-user`).
- Observed issues:
  - The invite-link email template interpolates `companyName`, `logoUrl`, `fullName`, `role`, and `inviteUrl` into HTML without `escapeHtml` (602, 612, 620, 623, 633, 644), while the sibling `renderInitialPasswordEmailHtml` in the same file escapes every interpolation (58, 67, 73, 77, 84, 86, 94, 111).
  - The legacy (non-`deliverByEmail`) paths return the plaintext temporary password to the caller both inside `message` and as a dedicated `temporaryPassword` field (363-375, 547-561).
  - `listUsers()` is called with no pagination arguments and the target email is looked up with `.find()` on the single returned page, using a case-sensitive `===` comparison and no trim/lowercase (240-241) — contrast send-password-reset which trims and lowercases (send-password-reset/index.ts:58).
  - `isResend: true` for an email that does not exist falls through to the `else` branch and silently creates a new user (246, 404, 406-432).
  - The `auth_events` `user_created` audit insert exists only on the brand-new-user path (436-444); resend-path role/client/site changes produce no audit row.
  - All failures, including authentication and authorization failures, return status 400 (702).
- ASSUMED:
  - The Supabase Auth Admin `listUsers()` default page size (and therefore the point at which the existing-user lookup stops seeing accounts) is platform-defined and not verifiable from this repo.
  - `verify_jwt = true` (config.toml:3-4) is assumed enforced at the platform edge in addition to the in-file `getUser` check; deployment state not verifiable from the repo.
  - A DB trigger that "already created" a `user_roles` row is referenced only by the comment at 446; the trigger itself lives in the migrations units (D01-D03) and was not verified here.

## supabase/functions/delete-user/index.ts

- Purpose: Admin-only edge function that deletes a Supabase Auth user via the Admin API, blocks self-deletion, and best-effort writes an `account_deleted` audit row that outlives the user.
- Public surface:
  - HTTP handler: `serve(async (req) => ...)` (line 10, deno std 0.168.0). OPTIONS → body `"ok"` with CORS (11-13).
  - Request: POST JSON `{ userId: string }` (53).
  - Success: `{ success: true, message: "User deleted successfully" }` at 200 (86-95).
  - Error: `{ success: false, error }` at status 400 for all failures (96-108).
- Inputs & outputs:
  - In: JSON body `{ userId }`; `Authorization` header (28-31); env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (17-18).
  - Out: JSON responses above.
  - Tables: `user_roles` read via `.single()` (42-46); `auth_events` insert `account_deleted` with `metadata.deleted_by` (77-81). Auth Admin API: `auth.admin.deleteUser(userId)` (65-67).
- Dependencies:
  - uses -> `https://deno.land/std@0.168.0/http/server.ts` (1), `https://esm.sh/@supabase/supabase-js@2.7.1` (2).
  - used by <- V02 admin-ops-and-template-views (src/views/Users.tsx:522 — `supabase.functions.invoke('delete-user', ...)`). Grep-verified; no other consumers.
- Side effects: permanent deletion of the auth user (65-67, cascading behaviour lives in DB, not this file); one `auth_events` insert whose row is described as "intentionally FK-free so it persists after the user is gone" (73-75); no logging of the deletion besides the audit attempt and the catch-path `console.warn` (83).
- Error handling: single top-level `try/catch` → 400 `{ success:false, error: message }` for everything (96-108), including missing header (30), invalid JWT (38), and non-admin (49) — so auth failures are 400, not 401/403. The role check uses `.single()`, so a user with zero `user_roles` rows produces `roleError` and is rejected (42-50). `deleteUser` error is re-thrown (69-71). The audit insert is wrapped in try/catch with a `console.warn` (76-84), but the awaited insert's returned `error` field is not inspected — supabase-js returns errors rather than throwing, so a failed insert (e.g. RLS/constraint) produces neither warning nor failure.
- Tests: none found (grep-verified).
- Observed issues:
  - The audit try/catch (76-84) can only catch thrown exceptions; the insert's `{ error }` result is discarded, so the comment's "best-effort" logging (`console.warn` at 83) is unreachable for ordinary DB-level insert failures.
  - Unlike invite-user's `.maybeSingle()` role check, this file uses `.single()` (46); both files otherwise duplicate the same admin-gate logic with different supabase-js versions (2.7.1 vs 2.39.3).
  - All failures return status 400 (105).
- ASSUMED:
  - `verify_jwt = true` (config.toml:6-7) assumed enforced at the platform edge; not verifiable from the repo.
  - Whatever happens to the deleted user's `user_roles`/`user_clients`/`user_sites` rows is assumed handled by DB-side cascades or triggers (units D01-D03); this file touches none of them.

## supabase/functions/log-auth-event/index.ts

- Purpose: Anon-callable audit endpoint that validates, classifies (anonymous vs authenticated event types), sanitizes, rate-limits, and inserts a single row into `public.auth_events` using the service role.
- Public surface:
  - HTTP handler: `Deno.serve(async (req) => ...)` (line 87). OPTIONS → empty 200 with CORS (88-90).
  - Request: POST JSON `{ event_type: string, metadata?: object }` (104-106).
  - Responses: 204 empty on success (162); 400 `{ error }` for missing/unknown `event_type` (108-116 via `badRequest` 172-177); 401 `{ error }` for AUTHED_EVENTS without a valid JWT (129-136 via `unauthorized` 179-184); 429 `{ error: 'Too many requests' }` (95-100); 500 `{ error: 'Failed to log event' }` on insert failure (154-160); 500 `{ error: 'Internal error' }` on any thrown error (163-169).
  - Module-private: `checkRateLimit(ip: string): boolean` (55-65); `maybeCleanup(): void` (68-74); `sanitizeMetadata(input: unknown): Record<string, unknown>` (76-85); `badRequest(message)` (172); `unauthorized(message)` (179); consts `ANON_EVENTS` = {password_reset_requested, magic_link_requested, lockout} (29-33), `AUTHED_EVENTS` = {login, logout, password_changed, mfa_enrolled, mfa_unenrolled, account_deleted, account_email_changed, user_created} (35-44), `METADATA_ALLOWED_KEYS` = {method, reason, error_code} (47), rate-limit consts 20/min (50-51).
- Inputs & outputs:
  - In: JSON body; `Authorization` header (required only for AUTHED_EVENTS, 128-137); `x-forwarded-for` (92-93) and `user-agent` (143) headers; env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (118-119).
  - Out: one `auth_events` insert `{ user_id, event_type, ip_address, user_agent (≤500 chars), metadata }` (146-152); HTTP responses above. `user_id` is NULL for ANON_EVENTS regardless of any supplied header (124, 139-141 comment); for AUTHED_EVENTS it is taken from the verified JWT (137).
  - Stores: in-memory `rateLimits` Map keyed by IP, per Deno isolate (53).
- Dependencies:
  - uses -> `https://esm.sh/@supabase/supabase-js@2.39.3` (1).
  - used by <- L13 app-platform-helpers (src/lib/auth-audit.ts:62 — sole `supabase.functions.invoke("log-auth-event", ...)` call; that helper's `recordAuthEvent` is imported by C10 src/components/SessionWatcher.tsx:5, C11 src/components/AppSidebar.tsx:23 + ClientPortalLayout.tsx:4 + ContractorPortalLayout.tsx:4, V02 src/views/MyProfile.tsx:3, V05 src/views/auth/Login.tsx:20 + ResetPassword.tsx:14 + SetPassword.tsx:14 + ForgotPassword.tsx:18). Comment-only reference: src/components/AppSidebar.tsx:108 (C11). Grep-verified.
- Side effects: the `auth_events` insert; mutation of the in-isolate rate-limit map; `console.error` on insert or handler failure (155, 164). No email, no storage.
- Error handling: rate-limit exceeded → 429 before body parse (95-100); missing `event_type` → 400 (108-110); event type in neither set → 400 (112-116); AUTHED event without `Bearer` header → 401 (129-131); `getUser` error or no user → 401 (133-136); insert error is explicitly checked and mapped to 500 with a generic message (154-160); any thrown error (e.g. non-JSON body) hits the catch → 500 `Internal error` (163-169). Metadata sanitization is silent: non-allowlisted keys, non-string values, and strings >200 chars are dropped without signal (76-85).
- Tests: none found (grep-verified).
- Observed issues:
  - `checkRateLimit` runs before JSON parsing, so malformed-body requests still consume rate-limit budget (95, 104).
  - All callers behind the same proxy value of `x-forwarded-for`'s first hop share one bucket, and requests with no header share the single `'unknown'` bucket (92-93); `ip_address` is stored raw and untruncated (144, 149) — unlike qr-redirect (F02) which truncates IPv4 to /24 per its POPIA comment.
  - The header comment (20-22) itself documents the limiter as per-isolate, non-durable, "defence-against-naive-flooding only".
  - `account_deleted` and `user_created` are AUTHED_EVENTS requiring the subject's own JWT (35-44), but the actual writers of those event types are invite-user and delete-user, which insert into `auth_events` directly with the admin as actor — two write paths for the same vocabulary.
  - Untracked byte-identical duplicate `index 2.ts` sits in the same directory (diff-verified identical).
- ASSUMED:
  - `verify_jwt = false` (config.toml:65-66) is assumed to match the deployed state; the config comment (61-64) matches the file's design.
  - The `auth_events` table shape (columns `user_id`, `event_type`, `ip_address`, `user_agent`, `metadata`) is assumed defined by supabase/migrations/20260525120000_auth_events_audit.sql (units D02); the migration content was not read in this pass.

## supabase/functions/send-password-reset/index.ts

- Purpose: Rate-limited edge function that generates a Supabase recovery link via the Admin API and emails a branded reset link (built from the link's `hashed_token`) through Resend, without revealing whether the account exists.
- Public surface:
  - HTTP handler: `Deno.serve(async (req) => ...)` (line 31). OPTIONS → empty response with CORS (32-34).
  - Request: POST JSON `{ email: string }` (52).
  - Responses: 200 `{ success: true, message: 'If an account exists with this email, a password reset link has been sent.' }` both on real success (203-212) and when recovery-link generation fails (84-94); 429 `{ error: 'Too many requests' }` (38-43); 400 `{ success: false, error }` for validation failures and email-send failures (213-225).
  - Module-private: `checkRateLimit(ip: string): boolean` (19-29); consts `RL_WINDOW_MS`/`RL_MAX` = 60s/5 (15-16), `rl` Map (17).
- Inputs & outputs:
  - In: JSON body `{ email }` — trimmed, lowercased (58), regex-validated (61-64); `x-forwarded-for` header (36-37); env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (46-47), `RESEND_API_KEY` (4), `APP_URL` with Vercel fallback (69).
  - Out: one Resend email to the submitted address with subject `Password Reset - <companyName>` (189-194); JSON responses above. The emailed link is `${appUrl}/auth?type=recovery&token=<hashed_token>` when `generateLink` returns a `hashed_token`, else the bare `${appUrl}/auth` (100-103).
  - Tables: `settings` read `company_name, company_logo_url` via `.single()` (106-109). Auth Admin API: `generateLink({ type: 'recovery', email, options: { redirectTo } })` (73-79).
  - Stores: in-memory `rl` Map per isolate (17).
- Dependencies:
  - uses -> `https://esm.sh/@supabase/supabase-js@2.39.3` (1), `https://esm.sh/resend@2.0.0` (2).
  - used by <- none found (grep-verified: `grep -rn "send-password-reset" src` yields only the comment at src/views/Auth.tsx:27 describing the `/auth?type=recovery&token=...` URL shape it produces; no `functions.invoke('send-password-reset')` exists anywhere in src). The in-repo forgot-password flow calls `supabase.auth.resetPasswordForEmail` directly instead (src/views/auth/ForgotPassword.tsx:72, V05). The other reference is a comment in invite-user/index.ts:233 (this unit).
- Side effects: mints a live recovery token for the target account via the Admin API (73-79) and emails it; `console.error` on link/send failure (82, 197), `console.log` of the recipient email on success (201); rate-limit map mutation.
- Error handling: rate limit → 429 before body parse (38-43); missing/non-string email and bad format → throw → 400 (54-64, 213-225); `generateLink` error → anti-enumeration 200 success message, no email sent (81-94); Resend send error → throw with `Failed to send password reset email: <message>` → 400 (196-199); top-level catch returns the raw error message (218).
- Tests: none found (grep-verified).
- Observed issues:
  - No consumer in the repo (grep-verified above): the deployed frontend resets passwords through `supabase.auth.resetPasswordForEmail`, while the comment trail (Auth.tsx:26-27) still documents this function's URL format as a live entry path.
  - It is the only function in the repo's `supabase/functions/` set with no `verify_jwt` entry in supabase/config.toml (grep-verified; also recorded in inventory 12 Oddities).
  - The email HTML interpolates `companyName`, `logoUrl`, and `resetUrl` without escaping (120, 130, 141, 151, 162, 177); the file has no `escapeHtml` helper.
  - Anti-enumeration is asymmetric: `generateLink` failure returns the neutral 200 (84-94), but a Resend failure returns 400 with `error.message` (196-199, 213-225), and the validation errors also return 400 with reasons (54-64).
  - Unlike log-auth-event, the rate-limit map has no cleanup path — entries are only overwritten per-IP after expiry (15-29); all no-header callers share the `'unknown'` bucket (37).
  - The response body claims "This link will expire in 1 hour" (144, 177); no expiry is set in this file — token TTL is wherever the platform defines it.
- ASSUMED:
  - Because the config.toml entry is absent, the effective `verify_jwt` behaviour is the platform default; whether the deployed function accepts anonymous calls cannot be determined from the repo (same assumption recorded in inventory 12).
  - The `hashed_token` → `/auth?type=recovery&token=` handoff is assumed consumed by src/views/Auth.tsx (V04) based on its comment at line 27; the token-verification code path there was not traced in this pass.
  - Recovery-link TTL ("1 hour" claim) is assumed to be a Supabase project setting; not verifiable here.

## supabase/functions/send-email/index.ts

- Purpose: Generic authenticated email relay that sends arbitrary subject/body/recipient email through Gmail SMTP (denomailer) using `GMAIL_USER` credentials.
- Public surface:
  - HTTP handler: `const handler = async (req: Request): Promise<Response>` (19-125) registered via `serve(handler)` (127, deno std 0.190.0). OPTIONS → empty response with CORS (21-23).
  - Request: POST JSON `EmailRequest` (interface, 10-17): `{ to: string | string[]; subject: string; html?: string; text?: string; cc?: string | string[]; bcc?: string | string[] }`.
  - Responses: 200 `{ success: true, message: 'Email sent successfully', to }` (101-111); 401 `{ error: 'Unauthorized' }` (37-41); 400 `{ error: 'Missing required fields: to, subject, and html or text' }` (46-54); 500 `{ error: 'Email service not configured' }` when Gmail creds are absent (60-69); 500 `{ error: 'Failed to send email', details: error.message }` on any thrown error (112-124).
- Inputs & outputs:
  - In: JSON body above; `Authorization: Bearer <JWT>` (33-36); env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (30-31), `GMAIL_USER`, `GMAIL_APP_PASSWORD` (57-58).
  - Out: one SMTP send via `smtp.gmail.com:465` TLS (72-95) with `from: gmailUser` (88), `content: text || ""` (93), `html: html || undefined` (94); JSON responses above.
  - Tables/buckets: none.
- Dependencies:
  - uses -> `https://deno.land/std@0.190.0/http/server.ts` (1), `https://deno.land/x/denomailer@1.6.0/mod.ts` (2), `https://esm.sh/@supabase/supabase-js@2` (3, unpinned major).
  - used by <- none found in tracked files (grep-verified: the only src hit is the untracked duplicate `src/views/IssueReports 2.tsx:189`, `git status --porcelain` → `??`; no tracked `src/views/IssueReports.tsx` exists per `git ls-files`).
- Side effects: outbound SMTP connection and send (87-95), explicit `client.close()` (97); `console.log` of recipients before and after send (84, 99); `console.error` on failure (61, 113). No DB access beyond the `getUser` auth call.
- Error handling: G-SEC-12 gate — missing token is synthesized into an error object, and any `getUser` failure or null user → 401 (33-41); field validation → 400 (46-54); missing Gmail env → 500 with a generic message (60-69); everything else (SMTP failures, bad JSON) falls to the catch which returns 500 and leaks `error.message` as `details` (112-124). `error` is typed `any` (112).
- Tests: none found (grep-verified).
- Observed issues:
  - Zero tracked consumers (grep-verified above); the sole caller on disk is the untracked `src/views/IssueReports 2.tsx`.
  - Beyond the authenticated-user gate there is no restriction on recipients, content, cc/bcc fan-out, or rate — any signed-in user of any role can relay arbitrary email from the `GMAIL_USER` address (comment acknowledges only the auth gate, 26-28; inventory 12 records the same).
  - The catch handler returns internal `error.message` to the caller as `details` (117).
  - When only `html` is supplied, the plain-text `content` is sent as the empty string (93).
  - A fresh `SMTPClient` TCP/TLS connection is created per request (72-82); nothing is reused.
- ASSUMED:
  - `verify_jwt = true` (config.toml:21-22) assumed enforced at the platform edge in addition to the in-file check; deployment state not verifiable.
  - The G-SEC-12 identifier in the comment (26) is assumed to reference the same internal security-review register cited elsewhere in the functions slice (per inventory 12 ASSUMED); the register is not in the repo.
