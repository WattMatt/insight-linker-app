# Inventory part 12 — supabase/functions (Deno edge functions)

Slice: **supabase/functions — Deno edge functions**
Date: 2026-07-29

List command:

```
$ git ls-files 'supabase/functions/*'
supabase/functions/api-reports/index.ts
supabase/functions/batch-compress-images/index.ts
supabase/functions/compress-image/index.ts
supabase/functions/delete-user/index.ts
supabase/functions/fix-inspection-photos/index.ts
supabase/functions/fix-tenant-images/index.ts
supabase/functions/invite-user/index.ts
supabase/functions/log-auth-event/index.ts
supabase/functions/oauth-token/index.ts
supabase/functions/offline-review/index.ts
supabase/functions/qr-redirect/index.ts
supabase/functions/report-issue/index.ts
supabase/functions/save-template/index.ts
supabase/functions/send-email/index.ts
supabase/functions/send-password-reset/index.ts
supabase/functions/template-sync/index.ts
supabase/functions/templates/index.ts

$ git ls-files 'supabase/functions/*' | wc -l
      17
```

LOC command: `git ls-files 'supabase/functions/*' | xargs wc -l` → per-file counts below, 4520 total.

None of the 17 files contains an `export` statement (`grep -rn '^export ' supabase/functions/ --include='index.ts'` → no matches). Every file is a self-contained Deno edge function whose entire public surface is a single HTTP handler registered via `serve(...)` (deno std) or `Deno.serve(...)`. "Public surface" below therefore describes the HTTP contract, not module exports.

Auth model per function comes from `supabase/config.toml` (`verify_jwt` flags, lines 3–67) plus in-file checks. ALL 17 functions create a Supabase client with `SUPABASE_SERVICE_ROLE_KEY`.

---

### supabase/functions/api-reports/index.ts
- **Type**: source
- **LOC**: 427
- **Public surface (HTTP)**: `serve` handler (line 38). GET/POST + OPTIONS (CORS at 4–8). Routes on `url.pathname` after stripping `/api-reports` (line 66): `/available` or `""` → JSON list of report types (80–118); `/generate/inspection|site-summary|subsection|floor-plan` with params from POST JSON body or query string (120–124), each requiring one id param (`inspection_id`, `site_id`, `subsection_id`, `floor_plan_id`); else 404.
- **Auth**: `verify_jwt = false` (config.toml:44). Custom bearer-token auth: `validateToken()` (lines 11–36) looks up the token in `api_access_tokens` joined to `api_clients`, checks expiry and `is_active`, requires scope `reports:read` (line 58), updates `last_used_at` (30–33).
- **Module-private functions**: `validateToken(supabase, authHeader)` (11); `generateInspectionPDFBase64(inspection)` (295); `generateSiteSummaryPDFBase64(site, subsections, inspections)` (323); `generateSubsectionPDFBase64(subsection, documents, inspections)` (355); `generateFloorPlanPDFBase64(floorPlan, pins)` (394). "PDF" outputs are base64-encoded plain text (comment line 294).
- **Tables**: `api_access_tokens` (read 18–23, update 30–33), `api_clients` (joined 20), `api_request_logs` (insert 69–77), `inspections` (138–142, 173–177, 216–219), `sites` (162–166), `subsections` (168–171, 205–209), `subsection_documents` (211–214), `subsection_floor_plans` (241–245), `floor_plan_pins` (247–250).
- **External integrations**: none beyond Supabase.

### supabase/functions/batch-compress-images/index.ts
- **Type**: source
- **LOC**: 342
- **Public surface (HTTP)**: `Deno.serve` handler (line 93). POST JSON body `BatchCompressRequest` (interface, lines 8–16): `{ bucket?, prefix?, maxWidth?, quality?, minSizeKB?, dryRun?, limit? }` (defaults: `inspection-photos`, '', 800, 70, 150, false, 50). Response `BatchCompressResponse` (26–35): `{ success, processed, compressed, skipped, errors, totalSavings, files: ProcessedFile[], continuationToken? }`.
- **Auth**: `verify_jwt = true` (config.toml:56); additionally in-file G-SEC-12 check requiring the JWT to resolve to a real user via `supabase.auth.getUser(jwt)` (lines 120–131).
- **Module-private**: `detectImageType(bytes)` (38); `listFilesFlat(supabase, bucket, prefix, maxDepth)` (48, BFS folder scan capped at 100 folders / depth 5); interfaces `BatchCompressRequest` (8), `ProcessedFile` (18), `BatchCompressResponse` (26).
- **Storage**: bucket from body (default `inspection-photos`) — list (63–65), download (165–167, 197–199), createSignedUrl with transform (224–231), upload of `*_compressed.jpg` (274–279).
- **Tables**: none.
- **External**: fetch of Supabase image-transformation signed URL (238); no third-party services.

### supabase/functions/compress-image/index.ts
- **Type**: source
- **LOC**: 197
- **Public surface (HTTP)**: `Deno.serve` handler (line 47). POST JSON `CompressImageRequest` (8–13): `{ sourcePath, bucket?, maxWidth?, quality? }`. Response `CompressImageResponse` (15–22): `{ success, originalSize?, compressedSize?, path?, url?, error? }`.
- **Auth**: `verify_jwt = true` (config.toml:53); plus in-file G-SEC-12 user check (76–87).
- **Module-private**: `detectImageType(bytes)` (25); `arrayBufferToBase64(buffer)` (34 — defined, never called in this file).
- **Storage**: bucket (default `inspection-photos`) — download (90–92), createSignedUrl with transform (112–119), upload `*_compressed.<ext>` (154–159), getPublicUrl (170–172).
- **Tables**: none.
- **External**: fetch of Supabase transform signed URL (123). Comment notes transformation requires Supabase Pro plan (105).

### supabase/functions/delete-user/index.ts
- **Type**: source
- **LOC**: 109
- **Public surface (HTTP)**: `serve` handler (line 10). POST JSON `{ userId }` (53). Response `{ success, message }` or `{ success: false, error }` (status 400 for all errors, 96–107).
- **Auth**: `verify_jwt = true` (config.toml:7). In-file: requires Authorization header, resolves user via `auth.getUser(token)` (34–35), requires `user_roles.role === "Admin"` (42–50), blocks self-deletion (60–62).
- **Tables**: `user_roles` (read 42–46), `auth_events` (insert `account_deleted`, best-effort, 76–84). Admin API: `auth.admin.deleteUser(userId)` (65–67).
- **External**: none.

### supabase/functions/fix-inspection-photos/index.ts
- **Type**: source
- **LOC**: 296
- **Public surface (HTTP)**: `Deno.serve` handler (line 196). POST JSON `{ inspectionId?, dryRun? }` (205–207; body optional, defaults to scanning ALL inspections, limit 100 at line 221). Response `{ success, dryRun, summary: { inspectionsProcessed, inspectionsWithIssues, totalFixed, totalNotFound }, results }`.
- **Auth**: `verify_jwt = false` (config.toml:52). NO in-file auth check — anonymous callers can trigger it (data-repair maintenance function; writes to `inspections.json_data`).
- **Module-private**: `getSupabaseClient()` (9); `parseStorageUrl(url)` (16); `buildStorageUrl(baseUrl, bucket, path)` (38); `fileExists(supabase, bucket, path)` (43); `findMatchingFile(supabase, bucket, originalPath)` (49 — 3 fuzzy match strategies incl. hard-coded item-id vocabulary at 63–67); `processInspectionPhotos(supabase, baseUrl, inspectionId, jsonData)` (104).
- **Tables**: `inspections` (select 212–221, update `json_data` 183–186).
- **Storage**: any bucket parsed from stored URLs — download (44), list (74).
- **External**: none.

### supabase/functions/fix-tenant-images/index.ts
- **Type**: source
- **LOC**: 192
- **Public surface (HTTP)**: `Deno.serve` handler (line 25). Any method (no body read at all). Scans every inspection whose `json_data->tenants` is non-null and repairs `breakerImage`/`ctRatioImage`/`meterImage` URLs. Response `{ success, summary: { totalProcessed, fixed, notFound, alreadyValid }, details: FixResult[] }`.
- **Auth**: `verify_jwt = true` (config.toml:41). No further in-file check (any authenticated user can run the repair).
- **Module-private**: interfaces `Tenant` (8), `FixResult` (16).
- **Tables**: `inspections` (select 41–44, update `json_data` 151–154).
- **Storage**: `inspection-photos` — list (81–83), getPublicUrl (109–111).
- **External**: none.

### supabase/functions/invite-user/index.ts
- **Type**: source
- **LOC**: 705
- **Public surface (HTTP)**: `Deno.serve` handler (line 171). POST JSON `InviteUserRequest` (11–24): `{ email, fullName, role, isResend?, temporaryPassword?, clientId?, siteIds?, deliverByEmail? }`. Multiple success shapes: `{ success, userId, isNewUser, passwordEmailed?, message, temporaryPassword? }`. Role-conditional validation: `Client` requires `clientId` (217–219), `Contractor` requires `siteIds` (222–224).
- **Auth**: `verify_jwt = true` (config.toml:4). In-file: caller must resolve to a user (189) with `user_roles.role === 'Admin'` (196–204).
- **Module-private**: `escapeHtml(value)` (26); `renderInitialPasswordEmailHtml(params: { companyName, logoUrl?, fullName, role, email, password, loginUrl })` (41); `sendInitialPasswordEmail(supabase, params)` (136).
- **Tables**: `user_roles` (read/insert/update 196–204, 277–292, 447–483), `user_clients` (296–312, 486–500), `user_sites` (delete+insert 316–334, 503–519), `settings` (branding read 140–143, 588–591), `auth_events` (insert `user_created`, best-effort 436–444). Admin API: `listUsers` (240), `updateUserById` (267), `createUser` (423), `generateLink({ type: 'invite' })` (565–575), `resetPasswordForEmail` (382).
- **External**: **Resend** email API (`esm.sh/resend@2.0.0`, key `RESEND_API_KEY`, lines 2–4; sends at 158–163 and 665–670, from `noreply@watsonmattheus.com`). Redirect base from `APP_URL` env with Vercel fallback (234).

### supabase/functions/log-auth-event/index.ts
- **Type**: source
- **LOC**: 184
- **Public surface (HTTP)**: `Deno.serve` handler (line 87). POST JSON `{ event_type, metadata? }`. Two event buckets (header comment 3–22): `ANON_EVENTS` = password_reset_requested, magic_link_requested, lockout (29–33; `user_id` forced NULL); `AUTHED_EVENTS` = login, logout, password_changed, mfa_enrolled, mfa_unenrolled, account_deleted, account_email_changed, user_created (35–44; require valid JWT, user_id from JWT 126–137). Unknown event_type → 400 (112–116). Success → 204 no body (162).
- **Auth**: `verify_jwt = false` (config.toml:65, with explanatory comment 61–64) — anon-callable by design; JWT enforced in-code only for AUTHED_EVENTS.
- **Rate limiting**: in-memory per-IP, 20 req/min per isolate (50–74), map cleanup at 10k entries (68–74).
- **Module-private**: `checkRateLimit(ip)` (55); `maybeCleanup()` (68); `sanitizeMetadata(input)` (76 — allowlist keys `method`, `reason`, `error_code`, strings ≤200 chars, line 47); `badRequest(message)` (172); `unauthorized(message)` (179).
- **Tables**: `auth_events` (insert 146–152, with ip_address + user_agent truncated to 500 chars, 143).
- **External**: none.

### supabase/functions/oauth-token/index.ts
- **Type**: source
- **LOC**: 122
- **Public surface (HTTP)**: `serve` handler (line 10). POST JSON `{ grant_type, client_id, client_secret, refresh_token }` — OAuth2-style token endpoint supporting `client_credentials` and `refresh_token` grants (23). Response: `{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope }` (104–113). Access token TTL 1h, refresh 30d (73–74); tokens are concatenated `crypto.randomUUID()` values (71–72).
- **Auth**: `verify_jwt = false` (config.toml:59). Auth is the client_id/client_secret lookup itself — `client_secret` compared via `.eq()` DB query, i.e. stored/compared in plaintext (34–40).
- **Tables**: `api_clients` (read 34–40), `api_access_tokens` (read 51–56, delete old token 66, insert 76–83), `api_request_logs` (insert 94–102).
- **External**: none.

### supabase/functions/offline-review/index.ts
- **Type**: source
- **LOC**: 199
- **Public surface (HTTP)**: `serve` handler (line 9). POST JSON `{ codeFiles: {path, content}[], reviewType? ('full'|'security'|'performance'|'architecture'|'sans-compliance'), focusAreas?: string[] }` (32). Response `{ review, developmentPrompt, qualityScore, reviewType, filesReviewed, timestamp }` (181–190). AI code-review function.
- **Auth**: `verify_jwt = false` (config.toml:25); in-file G-SEC-12 check requires JWT resolving to a real user (15–30).
- **Tables**: none.
- **External**: **Lovable AI Gateway** — POST `https://ai.gateway.lovable.dev/v1/chat/completions`, model `google/gemini-3-flash-preview`, key `LOVABLE_API_KEY` (34, 128–143). Maps gateway 429/402 to user-facing errors (149–160).

### supabase/functions/qr-redirect/index.ts
- **Type**: source
- **LOC**: 235
- **Public surface (HTTP)**: `serve` handler (line 9). GET with `?path=` or path suffix (17), plus `?site=<uuid>` (91). Resolution order: site UUID → `/public/sites/:id/register` 302 (92–104); malformed `//public/subsections/<uuid>` paths (108–129); bare UUID → subsection lookup (139–160); Firebase legacy path via `firebase_id` (169–178); fuzzy client/site/subsection name match via `ilike` (181–219). Responds 302 to `${appOrigin}/public/subsections/:id`, or `/public/qr-retired` when `qr_disabled` (kill switch, 67–73); 404 text otherwise.
- **Auth**: `verify_jwt = false` (config.toml:10) — public endpoint scanned from printed QR codes. Uses service role deliberately (comment 25–30): never returns row data, only redirects.
- **Module-private (closures)**: `logScan(subsectionId)` (47 — best-effort, IP truncated to /24 for POPIA, IPv6 → null); `redirectToSubsection(subsectionId, qrDisabled)` (67 — defers scan insert via `EdgeRuntime.waitUntil` when available, 79–84).
- **Tables**: `settings` (read `qr_base_url` 35–40), `qr_scans` (insert 53–58), `sites` (93–94), `subsections` (113–117, 144–148, 169–173, 191–194).
- **External**: none.

### supabase/functions/report-issue/index.ts
- **Type**: source
- **LOC**: 112
- **Public surface (HTTP)**: `serve` handler (line 38). POST **multipart/form-data** only (405 for other methods, 40): fields `turnstile_token`, `subsection_id` (uuid), `title` (≤200), `description` (≤2000), up to 3 `photos` files (46–51). Photos: jpeg/png/webp only, SVG deliberately excluded (11–17), ≤5MB each (82). Response `{ ok: true, photosSaved }`.
- **Auth**: `verify_jwt = false` (config.toml:13) — public QR issue-report endpoint. Gate is server-side **Cloudflare Turnstile** verification (57–65). In-memory per-instance throttle: >5 req/min per IP → 429 (23–30, 43–44). `qr_disabled` subsections respond 404 indistinguishable from not-found (75–77).
- **Module-private**: `throttled(ip)` (24); `json(status, body)` (32); consts `uuidRegex` (9), `ALLOWED_IMAGE_TYPES` (13).
- **Tables**: `subsections` (read 72–74), `snags` (insert with `reported_channel: 'public_qr'`, 97–104).
- **Storage**: `inspection-photos` — upload to `public-issue-reports/<subsectionId>/<uuid>.<ext>` (85–88), getPublicUrl (92).
- **External**: **Cloudflare Turnstile** siteverify (`challenges.cloudflare.com/turnstile/v0/siteverify`, secret `TURNSTILE_SECRET_KEY`, 58–64).

### supabase/functions/save-template/index.ts
- **Type**: source
- **LOC**: 112
- **Public surface (HTTP)**: `Deno.serve` handler (line 8). POST JSON `{ template, action: 'create'|'update'|'delete' }` (25). Maps DocBuilder template shape to DB columns (42–52). Response `{ success, templateId, action }`.
- **Auth**: `verify_jwt = false` (config.toml:38). Bearer key check against `DOCBUILDER_PUBLIC_TOKEN` — but **optional**: if the env var is unset, access is allowed (16–23, `if (expectedApiKey && ...)`). Contrast with `templates/index.ts` which fails closed.
- **Tables**: `inspection_templates` (insert 58–62, update 70–75, delete 83–86).
- **External**: caller is the external "DocBuilder" app (comment line 14).

### supabase/functions/send-email/index.ts
- **Type**: source
- **LOC**: 127
- **Public surface (HTTP)**: `serve(handler)` (127; handler defined at 19). POST JSON `EmailRequest` (10–17): `{ to, subject, html?, text?, cc?, bcc? }` (string or string[]). Response `{ success, message, to }`.
- **Auth**: `verify_jwt = true` (config.toml:22); plus in-file G-SEC-12 user check (26–41). No recipient/content restrictions beyond that — any authenticated user can send arbitrary email.
- **Tables**: none.
- **External**: **Gmail SMTP** via denomailer (`deno.land/x/denomailer@1.6.0`, line 2) — `smtp.gmail.com:465` TLS, creds `GMAIL_USER` / `GMAIL_APP_PASSWORD` (57–82), from = `GMAIL_USER` (88).

### supabase/functions/send-password-reset/index.ts
- **Type**: source
- **LOC**: 226
- **Public surface (HTTP)**: `Deno.serve` handler (line 31). POST JSON `{ email }` (52). Success responses deliberately do not reveal account existence (84–94, 203–212). Failure path returns `{ success: false, error }` at 400.
- **Auth**: **no entry in config.toml** (see Oddities) — Supabase default for `verify_jwt` applies. No in-file JWT check; per-IP in-memory rate limit 5 req/min per isolate (15–29, 36–43).
- **Module-private**: `checkRateLimit(ip)` (19).
- **Tables**: `settings` (branding read 106–109). Admin API: `auth.admin.generateLink({ type: 'recovery' })` (73–79); builds direct reset URL with `hashed_token` (100–103), base from `APP_URL` env with Vercel fallback (69).
- **External**: **Resend** email API (`RESEND_API_KEY`, lines 1–4; send 189–194, from `noreply@watsonmattheus.com`).

### supabase/functions/template-sync/index.ts
- **Type**: source
- **LOC**: 389
- **Public surface (HTTP)**: `serve` handler (line 107). REST-style router on path after `/template-sync` (127) with methods GET/POST/PUT/DELETE: `GET /templates` (133), `GET /templates/:id` (165), `POST /templates` (191), `PUT /templates/:id` (223), `DELETE /templates/:id` (260), `POST /webhook/register` (291 — logs only, nothing persisted; comment at 301–302 says in-memory/"should be stored in the database"), `GET /sync/status` (317). Reads `x-sync-source` header (128). Converts between WM-Compliance and "PDFMaker" template formats.
- **Auth**: `verify_jwt = false` (config.toml:47). Bearer key check against `DOCBUILDER_SYNC_KEY` — **optional**: if unset, access allowed with console warning (11–30, "for development").
- **Module-private**: `validateSyncKey(authHeader)` (11); `convertToPDFMakerFormat(template)` (33); `extractDynamicFields(template)` (68); `convertFromPDFMakerFormat(pdfMakerTemplate)` (92); `notifyWebhook(event, data)` (358).
- **Tables**: `inspection_templates` (select 134–137, 168–172; insert 195–199; update 228–236; delete 263–268; count 318–320).
- **External**: outbound webhook POST to `DOCBUILDER_WEBHOOK_URL` if configured, with `X-Webhook-Event` / `X-Source: wm-compliance` headers (358–389). Hard-codes project id `oltzgidkjxwsukvkomof` in responses (156, 327).

### supabase/functions/templates/index.ts
- **Type**: source
- **LOC**: 546
- **Public surface (HTTP)**: `Deno.serve` handler (line 338). Any method; no body read. Returns a catalogue for the DocBuilder integration: `{ success, app: 'wm-compliance', summary, reportTypes, inspectionTemplates, clients: [] }` (515–537). `reportTypes` built from the 6-entry const `reportTemplateStructures` (9–336: site-summary, subsection-report, floor-plan-report, coc-validation-report, defect-report, asset-verification-report) plus a 7th inline `inspection-report` (457–501), each with `requiredParams` and `availableItems` drawn from live data.
- **Auth**: `verify_jwt = false` (config.toml:35). Bearer key vs `DOCBUILDER_PUBLIC_TOKEN`, **fails closed** with 503 when unset (348–353) and uses constant-time SHA-256 digest comparison (355–374).
- **Tables** (parallel reads, 383–399): `sites`, `subsections`, `inspections`, `subsection_floor_plans`, `inspection_templates`, `snags`, `site_assets`. `clients` deliberately NOT queried — PII exclusion (comments 381–382, 532–534; `totalClients: 0` at 504).
- **External**: caller is DocBuilder; no outbound calls.

---

## Runtime observations

- **17 HTTP entry points**, one per directory, each `serve(...)` (deno std http) or `Deno.serve(...)`: api-reports/index.ts:38, batch-compress-images/index.ts:93, compress-image/index.ts:47, delete-user/index.ts:10, fix-inspection-photos/index.ts:196, fix-tenant-images/index.ts:25, invite-user/index.ts:171, log-auth-event/index.ts:87, oauth-token/index.ts:10, offline-review/index.ts:9, qr-redirect/index.ts:9, report-issue/index.ts:38, save-template/index.ts:8, send-email/index.ts:127, send-password-reset/index.ts:31, template-sync/index.ts:107, templates/index.ts:338.
- **All 17 use the service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) for their Supabase client (e.g. api-reports/index.ts:45, qr-redirect/index.ts:32, invite-user/index.ts:178).
- **Auth models fall into 5 patterns**:
  1. Platform JWT + in-file Admin role check: delete-user (index.ts:42–50), invite-user (index.ts:196–204).
  2. Platform JWT (+ optional in-file getUser): fix-tenant-images, compress-image, batch-compress-images, send-email.
  3. `verify_jwt=false` but in-file getUser required (G-SEC-12 pattern): offline-review (index.ts:15–30).
  4. Custom API-key/token auth for external integrations: api-reports (DB token table, index.ts:11–36), oauth-token (client_id/secret, index.ts:34–40), templates (`DOCBUILDER_PUBLIC_TOKEN`, fails closed, index.ts:348–374), save-template (`DOCBUILDER_PUBLIC_TOKEN`, fails OPEN when unset, index.ts:16–23), template-sync (`DOCBUILDER_SYNC_KEY`, fails OPEN when unset, index.ts:11–30).
  5. Fully anonymous public endpoints: qr-redirect (Turnstile-free 302 redirector, index.ts:9), report-issue (Turnstile-gated form, index.ts:57–65), log-auth-event (anon events allowed, index.ts:112–141), send-password-reset (rate-limited, index.ts:31–43), fix-inspection-photos (`verify_jwt=false` per config.toml:52, no in-file auth — see Oddities).
- **External service integrations**:
  - Resend email API: invite-user/index.ts:2–4,158,665; send-password-reset/index.ts:1–4,189 (env `RESEND_API_KEY`; sender `noreply@watsonmattheus.com`).
  - Gmail SMTP via denomailer: send-email/index.ts:2,72–82 (env `GMAIL_USER`, `GMAIL_APP_PASSWORD`).
  - Cloudflare Turnstile siteverify: report-issue/index.ts:60–64 (env `TURNSTILE_SECRET_KEY`).
  - Lovable AI Gateway (`ai.gateway.lovable.dev`, model `google/gemini-3-flash-preview`): offline-review/index.ts:128–143 (env `LOVABLE_API_KEY`).
  - Outbound webhook to `DOCBUILDER_WEBHOOK_URL`: template-sync/index.ts:358–389.
  - Supabase Storage image transformation via signed URLs: compress-image/index.ts:112–125, batch-compress-images/index.ts:224–244.
- **Background/deferred work**: qr-redirect defers the `qr_scans` insert past the 302 response via `EdgeRuntime.waitUntil` (qr-redirect/index.ts:79–84). No schedulers, cron jobs, or queues anywhere in the slice.
- **In-memory per-isolate rate limiting** (explicitly documented as non-durable): log-auth-event/index.ts:50–74 (20/min), send-password-reset/index.ts:15–29 (5/min), report-issue/index.ts:23–30 (5/min).
- **Storage buckets touched**: `inspection-photos` (compress-image, batch-compress-images default, fix-tenant-images, report-issue); fix-inspection-photos operates on whatever bucket appears in stored URLs.
- **Tables touched across the slice**: api_access_tokens, api_clients, api_request_logs, auth_events, floor_plan_pins, inspection_templates, inspections, qr_scans, settings, site_assets, sites, snags, subsection_documents, subsection_floor_plans, subsections, user_clients, user_roles, user_sites.

## Oddities

- **Config/directory mismatch (4 config-only functions)**: `supabase/config.toml` declares `verify_jwt` for `validate-coc` (line 16), `extract-coc` (line 19), `verify-fix` (line 28), and `detect-schematic-regions` (line 50), but no such directories exist under `supabase/functions/` (verified by `ls supabase/functions/`).
- **send-password-reset has no config.toml entry**: it is the only tracked function absent from `supabase/config.toml` (`grep -n 'send-password-reset' supabase/config.toml` → no match), so its `verify_jwt` behaviour comes from the platform default rather than an explicit declaration.
- **Untracked byte-identical duplicate**: `supabase/functions/log-auth-event/index 2.ts` exists on disk, is untracked (`git status --porcelain supabase/functions/` → `?? "supabase/functions/log-auth-event/index 2.ts"`), and `diff` confirms it is identical to `index.ts`. Matches the repo-wide " 2" duplicate pattern visible in git status.
- **Fail-open vs fail-closed inconsistency in the DocBuilder trio**: `templates/index.ts:348–353` returns 503 when `DOCBUILDER_PUBLIC_TOKEN` is unset (fail closed, constant-time compare), while `save-template/index.ts:16–23` and `template-sync/index.ts:14–17` allow all access when their respective env keys are unset.
- **fix-inspection-photos is anonymous and mutating**: `verify_jwt = false` (config.toml:52) with no in-file auth check, yet it updates `inspections.json_data` (fix-inspection-photos/index.ts:183–186). fix-tenant-images, a near-identical repair function, is `verify_jwt = true` (config.toml:41).
- **oauth-token stores/compares `client_secret` in plaintext** via a DB equality query (oauth-token/index.ts:34–40), and access/refresh tokens are stored as plaintext rows in `api_access_tokens` (76–83).
- **Dead code**: `arrayBufferToBase64` in compress-image/index.ts:34–45 is defined but never called in the file.
- **`template-sync` webhook registration is a no-op**: `POST /webhook/register` logs and returns success but persists nothing (template-sync/index.ts:301–303, comment admits "should be stored in the database"); actual notifications use only the `DOCBUILDER_WEBHOOK_URL` env var (359).
- **"PDF" reports are not PDFs**: api-reports base64-encodes plain-text reports and labels them `content_base64` (api-reports/index.ts:294–320 and siblings).
- **Compression functions may not compress**: both compress-image (107–141) and batch-compress-images (248–257) fall back to re-uploading the original bytes when Supabase image transformation (Pro-plan feature, comment compress-image/index.ts:105) is unavailable; batch skips the save only if reduction <10% (260).
- **Pinned dependency spread**: std lib versions vary across functions (0.168.0 in api-reports/delete-user/oauth-token/offline-review/template-sync vs 0.190.0 in qr-redirect/report-issue/send-email) and supabase-js is variously `@2`, `@2.7.1`, `@2.39.3`.
- **`supabase/functions/.DS_Store`** exists on disk (untracked; `ls -la supabase/functions/`).

## ASSUMED

- Function URL surface: each directory is assumed deployed as `POST/GET https://<project>.supabase.co/functions/v1/<dir-name>` per standard Supabase edge-function routing — not verified against the live project.
- "DocBuilder" / "PDFMaker" is assumed to be a separate external companion app; only inferred from env-var names (`DOCBUILDER_PUBLIC_TOKEN`, `DOCBUILDER_SYNC_KEY`, `DOCBUILDER_WEBHOOK_URL`), comments (save-template/index.ts:14), and format-conversion helpers (template-sync/index.ts:33,92).
- The Supabase platform default of `verify_jwt = true` is assumed to apply to send-password-reset (missing config entry); the in-file rate limiter and anonymous-flow purpose suggest it may actually be deployed with JWT verification disabled via dashboard — not verifiable from the repo.
- The G-SEC-12 / G-SEC-04 identifiers in comments (e.g. batch-compress-images/index.ts:120, delete-user/index.ts:74) are assumed to reference an internal security-review findings register not contained in this slice.
- config-only functions (validate-coc, extract-coc, verify-fix, detect-schematic-regions) are assumed to be either removed or deployed from elsewhere; their status cannot be determined from tracked files.
