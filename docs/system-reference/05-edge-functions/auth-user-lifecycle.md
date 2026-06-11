# Edge Functions — Auth & User Lifecycle

Reference for the six edge functions that manage user identity, auth events, transactional email, and the machine-to-machine OAuth token endpoint. Ground truth from code only.

Sources: `supabase/functions/<name>/index.ts`. `verify_jwt` settings: `supabase/config.toml`.

> **`verify_jwt` semantics (platform-level gate).** When `verify_jwt = true`, the Supabase Functions gateway rejects any request whose `Authorization: Bearer <jwt>` header is missing or invalid **before** the handler runs — but the **anon key is itself a valid JWT** that satisfies this gate. So `verify_jwt = true` means "a valid JWT (anon or user) must be present", NOT "a logged-in user". Per-user / per-role authorization is enforced (or not) inside the handler. `verify_jwt = false` means the handler is reachable with no `Authorization` header at all.

---

## Summary table

| Function | config.toml | `verify_jwt` | In-handler auth | Who can successfully call |
|---|---|---|---|---|
| `invite-user` | `:3-4` | `true` | `getUser(token)` + `user_roles.role === 'Admin'` (`:39,:52`) | Authenticated **Admin** only |
| `delete-user` | `:6-7` | `true` | `getUser(token)` + `user_roles.role === 'Admin'` (`:35,:48`) | Authenticated **Admin** only |
| `send-email` | `:21-22` | `true` | **NONE** | Any holder of a valid JWT (incl. **anon key**) |
| `send-password-reset` | **absent** → deploy default | unknown (see note) | **NONE** (IP rate-limit only) | Per deploy default; handler does no caller auth |
| `log-auth-event` | `:83-84` | `false` | Conditional: AUTHED events require valid JWT; ANON events need none (`:126-138`) | Anyone (ANON events); valid-JWT holder (AUTHED events) |
| `oauth-token` | `:73-74` | `false` | **NONE** at gateway; validates `api_clients` credentials in-body (`:34-47`) | Any unauthenticated caller (credentials checked in body) |

---

## `invite-user`

**Purpose.** Admin-only: create (or resend invite to) a user, assign role + client/site mappings, and email a branded Supabase invite link (or set a temporary password).

**Auth model.**
- `verify_jwt = true` — `supabase/config.toml:3-4`. A valid JWT (anon or user) is required at the gateway.
- In-handler: requires `Authorization` header (`index.ts:32-35`); `supabase.auth.getUser(token)` must resolve a user (`:39-43`); then reads the caller's `user_roles` row via the **service-role** client and requires `roleData?.role === 'Admin'` (`:46-54`). The role lookup uses `.maybeSingle()`.
- **Who can call:** only an authenticated user whose `user_roles.role` is `'Admin'`.

**Inputs** (JSON body, `index.ts:11-19,56`):

| Field | Type | Notes |
|---|---|---|
| `email` | string | required |
| `fullName` | string | required |
| `role` | string | required; `'Client'` requires `clientId` (`:61-63`), `'Contractor'` requires ≥1 `siteIds` (`:66-68`) |
| `isResend` | boolean? | resend-vs-create branch (`:90,:225`) |
| `temporaryPassword` | string? | min length 6 (`:71-73`); auto-confirms email, skips invite email |
| `clientId` | string? | for Client role |
| `siteIds` | string[]? | for Contractor role |

Header read: `Authorization` (`:32`).

**Side effects.**
- **Supabase Auth admin API** (service-role): `auth.admin.listUsers()` (`:84`), `auth.admin.updateUserById()` (`:111`), `auth.admin.createUser()` (`:244`), `auth.admin.generateLink({type:'invite'})` (`:365`), `auth.resetPasswordForEmail()` for already-confirmed resend (`:203`).
- **Tables written:** `user_roles` (insert/update, `:128-135,:277-302`), `user_clients` (insert/update, `:148-156,:308-313`), `user_sites` (delete + insert, `:162-175,:330-332`), `auth_events` (best-effort insert `event_type:'user_created'`, metadata `{role, invited_by: user.id, via:'invite-user'}`, `:258-262`; non-fatal on error).
- **Tables read:** `user_roles` (`:46,:121,:268`), `user_clients` (`:141`), `settings` (`company_name, logo_url`, `:388-391`).
- **Email:** Resend (`resend.emails.send`, `:465`), from `noreply@watsonmattheus.com`. Secret: `RESEND_API_KEY` (`:4`).
- **Env/secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:27-28`), `APP_URL` (redirect base, fallback `https://insight-linker-app.vercel.app`, `:78`), `RESEND_API_KEY`.

**Callers.**
- `src/views/Users.tsx:244` (resend pending invite — body `{email, fullName}` only)
- `src/views/Users.tsx:286` (create — `isResend:false`)
- `src/views/Users.tsx:352` (resend — `isResend:true`)

**Security check.** Privileged user-creation is gated by both the gateway JWT and an explicit in-handler service-role Admin check — this is the correct pattern (the inverse of the create-user-admin bug). One **data-exposure** note: on the temporary-password path the cleartext `temporaryPassword` is returned in the JSON response body (`:189,:355`) and logged via `console.log` in the success messages — recorded as a flag (LOW). No tenant-scoping gap: an Admin is globally privileged by design in this schema.

---

## `delete-user`

**Purpose.** Admin-only: hard-delete a user via the Supabase Auth admin API and write an `account_deleted` audit row.

**Auth model.**
- `verify_jwt = true` — `supabase/config.toml:6-7`.
- In-handler: requires `Authorization` (`index.ts:28-31`); `getUser(token)` must resolve (`:35-39`); reads caller's `user_roles` with `.single()` and requires `roleData?.role === 'Admin'` (`:42-50`). Self-deletion is blocked (`userId === user.id` → throw, `:60-62`).
- **Who can call:** only an authenticated **Admin**; cannot delete self.

**Inputs** (JSON body): `userId` (string, required — `index.ts:53-57`). Header: `Authorization` (`:28`).

**Side effects.**
- `supabase.auth.admin.deleteUser(userId)` (service-role, `:65`).
- `auth_events` insert: `event_type:'account_deleted'`, metadata `{deleted_by: user.id}` (best-effort, non-fatal, `:77-81`). The row is FK-free by design and survives deletion.
- Reads: `user_roles` (`:42-46`).
- **Env/secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:17-18`).

**Callers.** `src/views/Users.tsx:501` (body `{userId}`).

**Security check.** Correctly gated (gateway JWT + service-role Admin check + self-delete guard). No flag. ⚠️ UNVERIFIED: cascade of dependent rows (`profiles`, `user_roles`, mappings) on `auth.users` delete is handled by DB FK cascade, not this function — see `03-auth-and-access/user-lifecycle.md`.

---

## `send-email`

**Purpose.** Generic transactional email sender via Gmail SMTP (denomailer).

**Auth model.**
- `verify_jwt = true` — `supabase/config.toml:21-22`. A valid JWT (anon or user) is required at the gateway.
- In-handler: **NO** auth check whatsoever — no `getUser`, no role check, no caller validation. It reads the body and sends.
- **Who can call:** any holder of a valid JWT. Since the **anon key** is a valid JWT and is shipped in the client bundle, this is effectively callable by anyone who can read the public app's anon key.

**Inputs** (JSON body, `index.ts:9-16,25`): `to` (string | string[], required), `subject` (string, required), `html` (string?), `text` (string?), `cc`, `bcc` (string | string[]?). At least one of `html`/`text` required (`:28`).

**Side effects.**
- **Outbound SMTP** to `smtp.gmail.com:465` (TLS) (`:54-64`), sends arbitrary `to`/`cc`/`bcc`/`subject`/`html` (`:69-77`).
- **Env/secrets:** `GMAIL_USER`, `GMAIL_APP_PASSWORD` (`:39-40`) — Gmail app password. `from` is forced to `gmailUser` (`:70`).
- No DB tables, no other functions.

**Callers.**
- `src/components/SuggestionDialog.tsx:102` (to hardcoded `arno@wmeng.co.za`)
- `src/components/IssueReportDialog.tsx:93`
- `src/views/Suggestions.tsx:182`
- `src/views/IssueReports.tsx:189`

**Security check.** **Open email relay (MED/HIGH).** `verify_jwt = true` only requires the publicly-distributed anon key, and the handler applies **no caller auth, no rate limit, and no recipient/template restriction** — any party with the anon key can send fully attacker-controlled `to`/`subject`/`html` from the org's Gmail account. This is an abuse/spoofing/exfiltration vector (phishing from a trusted sender, Gmail account reputation damage). Recorded as a security_flag.

---

## `send-password-reset`

**Purpose.** Generate a Supabase recovery link for an email and send a branded reset email via Resend; response is identical whether or not the account exists (no user enumeration).

**Auth model.**
- **Not present in `supabase/config.toml`** — there is no `[functions.send-password-reset]` stanza. The **deploy default** applies (Supabase default is `verify_jwt = true`, satisfied by the anon key). ⚠️ UNVERIFIED whether the deployed instance overrides this via the dashboard; config.toml does not declare it.
- In-handler: **NO** caller auth. Only a per-IP in-memory rate limit (5 req / 60s per Deno isolate, `index.ts:15-29,36-43`). On any link-generation error it still returns a generic success message (`:81-94`) to avoid revealing account existence.
- **Who can call:** governed solely by the (undeclared) gateway default; the handler authenticates no caller and identifies the target purely by the `email` field.

**Inputs** (JSON body): `email` (string, required, `index.ts:52-58`); trimmed/lowercased; format-validated by regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (`:61-62`). IP read from `x-forwarded-for` (`:36-37`).

**Side effects.**
- `supabase.auth.admin.generateLink({type:'recovery'})` (service-role, `:73`).
- Reads `settings` (`company_name, company_logo_url`, `:106-109`).
- **Email:** Resend (`:189`), from `noreply@watsonmattheus.com`. Builds a direct app link `${APP_URL}/auth?type=recovery&token=${hashedToken}` (`:100-103`).
- **Env/secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:46-47`), `APP_URL` (fallback `https://insight-linker-app.vercel.app`, `:69`), `RESEND_API_KEY` (`:4`).

**Callers.** **No in-repo `invoke()`/fetch caller.** The client-side forgot-password flow uses Supabase's native `supabase.auth.resetPasswordForEmail` directly (`src/views/auth/ForgotPassword.tsx:65,86`), not this function. The function appears to be referenced only in comments/route docs (`src/views/Auth.tsx:27`). ⚠️ UNVERIFIED: whether any out-of-repo caller (Supabase dashboard email hook, external script) invokes it.

**Security check.** No privileged side effect beyond sending a recovery email (the link only grants access to the email owner's inbox). User-enumeration is deliberately avoided (`:84-94`, `:206`). The notable issue is **`verify_jwt` is undeclared in config.toml** — sensitivity (recovery-link emails, service-role key in scope) warrants an explicit setting rather than relying on an unstated default. Recorded as a security_flag (LOW — config hygiene / mismatch risk).

---

## `log-auth-event`

**Purpose.** Append a single row to `public.auth_events` (audit trail), supporting pre-session (anon) and authenticated event types with metadata sanitisation and per-IP rate limiting.

**Auth model.**
- `verify_jwt = false` — `supabase/config.toml:83-84` (explicitly documented as anon-callable so pre-session events can be logged).
- In-handler conditional auth (`index.ts:112-141`):
  - **ANON_EVENTS** (`password_reset_requested`, `magic_link_requested`, `lockout`, `:29-33`): no auth required; any `Authorization` header is **ignored** and `user_id` is forced `NULL` (`:139-141`).
  - **AUTHED_EVENTS** (`login`, `logout`, `password_changed`, `mfa_enrolled`, `mfa_unenrolled`, `account_deleted`, `account_email_changed`, `user_created`, `:35-44`): require `Authorization: Bearer <jwt>`; `getUser(token)` must resolve or the call is rejected `401` (`:126-137`). `user_id` is taken from the verified JWT, never from the body.
  - Unknown `event_type` → `400` (`:114-116`).
- **Who can call:** anyone (for ANON events); a valid-JWT holder (for AUTHED events). No `user_id` is ever trusted from the request body.

**Inputs** (JSON body): `event_type` (string, required, `:105`), `metadata` (object?, `:106`). Metadata is allowlisted to keys `method`, `reason`, `error_code` (string ≤200 chars; everything else dropped, `:46-47,:76-85`). Headers: `Authorization` (AUTHED only, `:128`), `x-forwarded-for` (IP, `:92-93`), `user-agent` (`:143`).

**Side effects.**
- Insert into `auth_events` (`user_id`, `event_type`, `ip_address` (NULL if `'unknown'`), `user_agent` (≤500 chars), `metadata`) via service-role client (`:146-152`).
- Per-IP in-memory rate limit: 20 req / 60s per Deno isolate (`:50-65`); `429` on exceed (`:95-100`). Map cleanup at 10k entries (`:67-74`).
- **Env/secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:118-119`).

**Callers.** `src/lib/auth-audit.ts:62` (`recordAuthEvent` → `sendOne` invokes `log-auth-event` with `{event_type, metadata}`; fire-and-forget with a localStorage retry queue). Used app-wide, e.g. logout at `src/components/AppSidebar.tsx:115`.

**Security check.** Well-hardened: ANON events force `user_id=NULL` (no attacker-supplied identity), AUTHED events derive `user_id` from the verified JWT, metadata is allowlisted, and a rate limit blunts flooding. The residual exposure is that an unauthenticated caller can write arbitrary ANON-type audit rows (`password_reset_requested`/`magic_link_requested`/`lockout`) with no real identity — **audit-log pollution / spoofed-volume** within the rate limit. Recorded as a security_flag (LOW).

---

## `oauth-token`

**Purpose.** Machine-to-machine OAuth2-style token endpoint: issues opaque access/refresh tokens to API clients via `client_credentials` and `refresh_token` grants.

**Auth model.**
- `verify_jwt = false` — `supabase/config.toml:73-74`. No gateway JWT required (correct for an OAuth token endpoint — clients authenticate with their own credentials, not a Supabase JWT).
- In-handler: validates `client_id` + `client_secret` against `api_clients` (`is_active = true`) for `client_credentials` (`index.ts:34-47`); validates `refresh_token` against unexpired `api_access_tokens` joined to an active `api_clients` for `refresh_token` (`:51-63`). Invalid → `401`.
- **Who can call:** any unauthenticated network caller; success requires valid `api_clients` credentials (or a valid refresh token) in the body.

**Inputs** (JSON body): `grant_type` (`"client_credentials"` | `"refresh_token"`, validated `:23-28`), `client_id`, `client_secret` (for client_credentials), `refresh_token` (for refresh_token). Headers read for logging: `x-forwarded-for`/`cf-connecting-ip`, `user-agent` (`:100-101`).

**Side effects.**
- **Reads:** `api_clients` (`:34-40`), `api_access_tokens` + joined `api_clients` (`:51-54`).
- **Writes:** deletes the old `api_access_tokens` row on refresh (`:66`); inserts a new `api_access_tokens` row with generated `access_token`, `refresh_token`, `scopes`, `expires_at` (+1h), `refresh_expires_at` (+30d) (`:76-83`); inserts an `api_request_logs` row (`:94-102`).
- Token generation: `crypto.randomUUID()` concatenation (`:71-72`).
- **Env/secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`:16-17`).

**Callers.** **No in-repo `invoke()`/fetch caller** — this is an external-facing API surface for third-party API clients. Documented in `src/views/APIClients.tsx:411,467` (`POST ${supabaseUrl}/functions/v1/oauth-token` shown to admins as integration docs) and referenced as `token_endpoint: "/oauth-token"` in `supabase/functions/api-reports/index.ts:118`. Tokens it issues are consumed by `api-reports` / the `validate_api_token` RPC (see `02-data-model/rpcs-and-functions-02.md:276-282`).

**Security check.** Two flags:
1. **Plaintext client secret comparison (MED).** `client_secret` is matched by an equality filter on the `api_clients` table (`:36-37`) — the secret is stored and compared as plaintext (not hashed), and the equality is not constant-time. Compromise of the `api_clients` table yields usable secrets directly.
2. **`scope` from `clientRecord.scopes` (info).** Issued scopes come straight from the client record; no narrowing/validation of a requested scope (the endpoint accepts no `scope` param). Acceptable by design but noted — privilege equals whatever is stored on the client row.
No tenant-scoping bug (tokens are bound to `client_id` = `clientRecord.id`), and credential validation is present, so the open `verify_jwt = false` is appropriate here.
