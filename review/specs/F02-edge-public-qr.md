# F02 — edge-public-qr

- Unit id: F02
- Slug: edge-public-qr
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 2 (`supabase/functions/qr-redirect/index.ts`, `supabase/functions/report-issue/index.ts`)

## Unit header

**Unit purpose.** The two anonymous-facing Supabase edge functions behind the printed-QR platform: `qr-redirect` resolves any historical or current QR payload (site UUID, subsection UUID, malformed double-slash path, Firebase legacy path, fuzzy name path) to a 302 onto the live public app origin while best-effort logging the scan; `report-issue` accepts a Turnstile-gated multipart snag submission (title, description, up to 3 photos) from an unauthenticated QR-landing visitor and inserts it into `snags` with `reported_channel: 'public_qr'`.

**Module-level observations (cross-file facts inside the unit).**
- Both files import `serve` from `deno.land/std@0.190.0` and `createClient` from `esm.sh/@supabase/supabase-js@2.39.3` (qr-redirect/index.ts:1-2; report-issue/index.ts:1-2).
- Both define an identical `corsHeaders` object with `Access-Control-Allow-Origin: '*'` (qr-redirect/index.ts:4-7; report-issue/index.ts:4-7) and an identical `uuidRegex` (qr-redirect/index.ts:23; report-issue/index.ts:9) — duplicated, not shared.
- Both are registered `verify_jwt = false` in supabase/config.toml:9-13 and both construct a service-role client from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (qr-redirect/index.ts:31-33; report-issue/index.ts:67-70).
- Both read the same per-subsection kill switch `subsections.qr_disabled` (qr-redirect/index.ts:115/146/171/193; report-issue/index.ts:73), a column added by supabase/migrations/20260727102000_qr_killswitch_snag_channel.sql:7-8.
- Neither file has an `export` statement; each file's entire surface is the HTTP handler passed to `serve(...)`.
- No test file in the repo exercises either function (grep across `src` and `supabase` for the function names finds only URL-builder tests in L16 and comment references — see per-file Tests sections).

**External contract.** The rest of the app never imports this unit; it reaches it only by URL. `src/lib/qrBaseUrl.ts:43,50` (L16 qr-platform) bakes `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qr-redirect?path=<subsectionId>` and `...?site=<siteId>` into every generated QR PNG/SVG, and `src/components/public/PublicIssueReportDialog.tsx:78` (C06) POSTs multipart form data to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue`. The functions' redirect targets are A09 public routes: `src/app/public/subsections/[subsectionId]/page.tsx`, `src/app/public/sites/[siteId]/register/page.tsx`, and `src/app/public/qr-retired/page.tsx` (all exist, verified by `find src/app -path "*public*" -name page.tsx`).

---

## supabase/functions/qr-redirect/index.ts

- **Purpose:** Anonymous edge function that resolves a scanned QR payload (site UUID query param, subsection UUID, malformed legacy path, Firebase `firebase_id`, or client/site/subsection name path) to a 302 redirect on the configured public origin, logging subsection scans to `qr_scans` and honoring the per-subsection `qr_disabled` kill switch.

- **Public surface:** No module exports. Single HTTP handler via `serve(async (req) => ...)` (line 9).
  - `OPTIONS *` → 204-style empty response with CORS headers (lines 11-13).
  - `GET/any ?site=<uuid>` → 302 `Location: ${appOrigin}/public/sites/<uuid>/register` if the site row exists (lines 91-104); 404 text `Site not found` otherwise (line 97).
  - `?path=<value>` or path suffix after `/qr-redirect` (line 17), resolved in order:
    1. `//public/subsections/<uuid>` or `/public/subsections/<uuid>` malformed shapes → subsection lookup → 302 or 404 `Subsection not found` (lines 108-129).
    2. Empty path → 400 text `Missing path parameter` (lines 131-136).
    3. Bare UUID → subsection lookup via `.single()` → 302 or 404 (lines 139-160).
    4. Firebase legacy path → `subsections.firebase_id = cleanPath` via `.single()` → 302 (lines 169-178).
    5. Name fallback for paths of ≥3 segments → `ilike` on subsection name + in-JS substring filter on joined site/client names → 302 on first match (lines 181-219).
    6. Otherwise 404 text `Subsection not found` (lines 221-225).
  - Successful subsection resolution goes through closure `redirectToSubsection(subsectionId: string, qrDisabled: boolean)` (lines 67-89): if `qrDisabled` → 302 `Location: ${appOrigin}/public/qr-retired` (lines 68-73); else fires `logScan` (deferred via `EdgeRuntime.waitUntil` when defined, awaited otherwise, lines 74-84) and 302s to `${appOrigin}/public/subsections/<id>` (lines 85-88).
  - Closure `logScan(subsectionId: string)` (lines 47-62): inserts one `qr_scans` row inside its own try/catch.

- **Inputs & outputs:**
  - In: request URL (`?path`, `?site`, pathname), headers `x-forwarded-for` (line 49) and `user-agent` (line 55).
  - Out: 302 with `Location` header (four target shapes), or plain-text 400/404, or JSON 500 `{ error: <message> }` (lines 230-233).
  - Tables read: `settings` (`qr_base_url`, oldest row by `created_at` asc, `maybeSingle`, lines 35-40); `sites` (`id`, lines 93-94); `subsections` (`id, qr_disabled` at 113-117 and 144-148; `id, name, site_id, qr_disabled, sites(name, client_id, clients(name))` at 169-173; `id, name, firebase_id, qr_disabled, sites(...)` at 191-194).
  - Table written: `qr_scans` insert `{ subsection_id, user_agent, ip_address, source: 'redirect' }` (lines 53-58) — columns exist per migrations 20251014140001 (base table) and 20260727100000 (`source` column + check constraint `redirect|landing`).
  - Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (lines 31-32, both non-null-asserted).
  - Hard-coded fallback origin `https://insight-linker-app.vercel.app` when `settings.qr_base_url` is empty/absent (line 41).

- **Dependencies:**
  - uses -> `deno.land/std@0.190.0/http/server.ts` (`serve`, line 1); `esm.sh/@supabase/supabase-js@2.39.3` (`createClient`, line 2). No imports from repo units.
  - used by <- (grep-verified; consumption is by URL, not import):
    - L16 qr-platform: `src/lib/qrBaseUrl.ts:43` (`?path=` builder) and `:50` (`?site=` builder) — the only places the function URL is constructed.
    - D04 db-platform-config: `supabase/config.toml:9-10` (`verify_jwt = false`).
    - D03 db-era-2026-current: migrations 20260727100000_qr_scans_hardening.sql:2 and 20260727102000_qr_killswitch_snag_channel.sql:1 name this function as the writer/checker.
    - Comment-only references (no runtime coupling): `src/components/SiteSummaryReport.tsx:165,574` (C14), `src/components/client-portal/ClientCocView.tsx:99` (C03), `src/views/site-coc/ReportSubTab.tsx:50` (V06), `src/views/InspectionDetail.tsx:1076,1082` (V01), `src/lib/subsectionCardSpec.ts:103` (L15), `src/lib/qrCodeGenerator.ts:19` (L16).

- **Side effects:** Network: up to 3 Supabase PostgREST reads per request plus one `qr_scans` insert on successful non-disabled subsection resolution. The insert is deferred past the 302 via `EdgeRuntime.waitUntil(scanPromise)` when `EdgeRuntime` is defined, else awaited (lines 79-84). Nine `console.log`/`console.error` statements (19, 20, 42, 60, 96, 99, 120, 126, 141, 151, 166, 176, 185, 197, 213, 221, 228). No other mutations; the `?site=` branch performs no scan logging and no kill-switch check (lines 91-104).

- **Error handling:**
  - `settings` read error is discarded (destructures `data` only, line 35); falls back to the hard-coded origin (line 41).
  - `logScan` wraps its insert in try/catch and `console.error`s on throw (lines 59-61); the supabase-js `{ error }` result of the insert is never inspected, so a failed insert that resolves (rather than throws) produces no log line.
  - Site not found → 404 text (lines 95-98). Subsection not found in the malformed-path branch → direct 404 without falling through, per comment "firebase_id/name-match can never match it" (lines 123-127). UUID branch not found → 404 (lines 150-156). Name-fallback query error → 500 text `Database query failed` (lines 196-202). No match at all → 404 (lines 221-225).
  - Top-level catch: any thrown error → 500 JSON `{ error: errorMessage }` where `errorMessage` is `error.message` for `Error` instances (lines 227-234) — the raw message is returned to the anonymous caller.

- **Tests:** None for this function. `src/lib/qrBaseUrl.test.ts:18-27` asserts the *client-side builders* produce `.../functions/v1/qr-redirect?path=...` URLs; `src/lib/qrSvg.test.ts:7` uses such a URL as fixture input. Nothing executes this handler.

- **Observed issues (factual only):**
  - The `?site=` branch never writes a `qr_scans` row and checks no kill switch (lines 91-104); scan logging exists only for subsection redirects, and the `qr_disabled` branch also skips logging (lines 68-73, `logScan` invoked only at line 74).
  - Name-fallback destructuring `const [, clientName, siteName, ...subsectionParts] = pathParts` (line 182) discards `pathParts[0]` without checking it equals `clients` (the documented shape at line 162), so any ≥3-segment path is interpreted with segments 2/3 as client/site.
  - Name matching is substring-loose in both directions: SQL `ilike '%<subsectionName>%'` (line 194) then JS `site.name.includes(siteName)` / `client.name.includes(clientName)` (lines 205-210), and `.find` takes the first match in whatever order PostgREST returns rows.
  - The kill-switch flag reaches `redirectToSubsection` as `(matchedSubsection as any).qr_disabled` in the name-match branch (line 216) — the in-code comment attributes the cast to TS widening from the untyped join (lines 214-215).
  - `appOrigin` resolution takes the oldest `settings` row (`order('created_at', { ascending: true }).limit(1)`, lines 36-40); the fallback string at line 41 duplicates `DEFAULT_QR_ORIGIN` in `src/lib/qrBaseUrl.ts:15`.
  - IP truncation: IPv4 is masked to /24 (`.0` last octet, lines 50-52); any non-IPv4 `x-forwarded-for` (including IPv6) stores `ip_address: null` — stated as an accepted v1 trade-off in the comment at lines 45-46.
  - The 500 catch path returns the internal error message verbatim to unauthenticated callers (lines 229-233).

- **ASSUMED:**
  - That `EdgeRuntime.waitUntil` keeps the isolate alive to finish the deferred insert — asserted by the in-file comment (lines 75-78), not verified against the deployed runtime.
  - That the deployed database matches the migration files (repo comments state prod schema is ahead of `schema_migrations`, e.g. 20260727100000 header lines 5-6).
  - That Supabase's gateway populates `x-forwarded-for`; the code does not handle its absence beyond producing `ip_address: null`.

---

## supabase/functions/report-issue/index.ts

- **Purpose:** Anonymous edge function that accepts a multipart "report an issue" form from a public QR landing page, verifies a Cloudflare Turnstile token server-side, rate-limits per IP in instance memory, uploads up to three validated photos to storage, and inserts a `snags` row tagged `reported_channel: 'public_qr'`.

- **Public surface:** No module exports. Single HTTP handler via `serve(async (req) => ...)` (line 38).
  - `OPTIONS` → empty CORS response (line 39); any method other than POST → 405 JSON `{ error: 'Method not allowed' }` (line 40).
  - `POST multipart/form-data` with fields: `turnstile_token` (string), `subsection_id` (uuid string), `title` (trimmed, sliced to 200 chars), `description` (trimmed, sliced to 2000 chars), `photos` (repeated File entries, first 3 kept) (lines 46-51).
  - Responses (all JSON via `json(status, body)`, lines 32-36): 200 `{ ok: true, photosSaved: number }` (line 107); 400 `{ error: 'Missing subsection or title.' }` (line 54); 403 `{ error: 'Captcha verification failed.' }` (line 65); 404 `{ error: 'Subsection not found.' }` (lines 74, 77); 429 `{ error: 'Too many reports — please wait a minute.' }` (line 44); 500 `{ error: 'Could not submit the report. Please try again.' }` (line 110).
  - Module-private: `corsHeaders` (4-7), `uuidRegex` (9), `ALLOWED_IMAGE_TYPES: Record<string,string>` mapping jpeg/png/webp MIME → extension, SVG deliberately excluded per comment (11-17), `recent: Map<string, number[]>` + `throttled(ip: string): boolean` allowing ≤5 hits per rolling 60 s per key (23-30), `json(status: number, body: unknown): Response` (32-36).

- **Inputs & outputs:**
  - In: multipart form fields above; header `x-forwarded-for` (first entry, default `'unknown'`, line 43).
  - Out: JSON responses above.
  - Tables: `subsections` read `id, qr_disabled` via `.single()` (lines 72-74); `snags` insert `{ subsection_id, title, description: description || null, status: 'Open', photos: photoPaths, reported_channel: 'public_qr' }` (lines 97-104). `snags.photos` is `jsonb DEFAULT '[]'` (migration 20251016084545); `reported_channel` has check constraint `internal|public_qr` (migration 20260727102000:11-17).
  - Storage: bucket `inspection-photos`, upload to `public-issue-reports/<subsectionId>/<crypto.randomUUID()>.<ext>` with the file's contentType (lines 85-88), then `getPublicUrl` (line 92); the *public URL string* (not the path) is what lands in `snags.photos` (line 93).
  - Env vars: `TURNSTILE_SECRET_KEY` (line 58, throws if absent), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (lines 68-69).
  - In-memory store: module-level `recent` Map keyed by IP string (line 23) — per edge-instance only, per comment lines 19-22.

- **Dependencies:**
  - uses -> `deno.land/std@0.190.0/http/server.ts` (`serve`, line 1); `esm.sh/@supabase/supabase-js@2.39.3` (`createClient`, line 2); external service `https://challenges.cloudflare.com/turnstile/v0/siteverify` (lines 60-64). No imports from repo units.
  - used by <- (grep-verified; consumption by URL):
    - C06 public-fortress-floorplan: `src/components/public/PublicIssueReportDialog.tsx:78` — the only caller in the repo (POSTs FormData with the exact field names, no auth header).
    - D04 db-platform-config: `supabase/config.toml:12-13` (`verify_jwt = false`).

- **Side effects:** Network: one Turnstile verification fetch per non-throttled request (lines 60-64), one `subsections` read, up to 3 storage uploads + `getPublicUrl` calls, one `snags` insert. Mutates the module-level `recent` Map on every non-OPTIONS POST (lines 26-28). `console.error` on photo upload failure (line 90) and in the top-level catch (line 109).

- **Error handling:**
  - Throttled IP → 429 before any parsing (line 44).
  - Invalid `subsection_id` or empty `title` → 400 (lines 53-55).
  - Missing `TURNSTILE_SECRET_KEY` → `throw` → caught → 500 generic message (lines 58-59, 108-111). Failed Turnstile verification → 403 (line 65).
  - Subsection lookup error or no row → 404; `qr_disabled` subsection → the same 404 body, per comment "deliberately indistinguishable ... no info leak" (lines 74-77).
  - Photo with disallowed MIME type or size > 5 MiB → silently skipped via `continue` (line 82). Storage upload error → `console.error` and continue with remaining photos (lines 89-91); the response reports only `photosSaved`, not skips.
  - `snags` insert error → re-thrown (line 105) → top-level catch → 500 with generic message; the real error goes only to `console.error` (lines 108-111).

- **Tests:** None. Grep for `report-issue` across `src` and `supabase` finds only the caller (`PublicIssueReportDialog.tsx:26,78`) and `config.toml:12`; no test file references the function or replicates its handler.

- **Observed issues (factual only):**
  - Requests lacking `x-forwarded-for` all share the single throttle key `'unknown'` (line 43), so they draw from one shared 5/minute budget.
  - `recent` Map entries are pruned per-key only when that same key recurs (lines 26-28); keys are never deleted, so the map grows monotonically over an isolate's lifetime — the in-file comment (lines 19-22) frames the whole throttle as a per-instance "speed bump".
  - Turnstile verification is unconditional (lines 57-65), while the sole caller appends `turnstile_token` only when `CAPTCHA_ENABLED` is true, i.e. when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set client-side (`src/components/CaptchaTurnstile.tsx:20-21`, `PublicIssueReportDialog.tsx:64,69`); a captcha-disabled client submits `token = ''` and receives whatever `siteverify` returns for an empty response token.
  - The kill-switch read casts `(sub as any).qr_disabled` (line 77) despite `qr_disabled` being explicitly selected at line 73.
  - Photos are stored as full public URLs in `snags.photos` (lines 92-93); the in-file comment (83-84) states this matches "the app-wide snag-photo convention". The `inspection-photos` bucket's storage policies are authenticated-only (migration 20251014132137:63-77), but the function writes with the service role, and migration 20251120083541:20 sets `storage.buckets SET public = true` for all buckets, which is what makes `getPublicUrl` outputs fetchable.
  - `photosSaved` can be lower than the number of photos submitted with no indication of which were dropped (type/size skip at line 82, upload failure at lines 89-91).
  - The Turnstile fetch chain has no `.catch` of its own (lines 60-64); a network failure there surfaces as the generic 500.

- **ASSUMED:**
  - That Cloudflare's `siteverify` returns `success: false` for an empty `response` token (line 65 behavior with captcha-disabled clients) — not verified against the live service.
  - That the deployed bucket's `public` flag matches migration history (20251120083541:20), given repo comments that prod schema is ahead of `schema_migrations`.
  - That each Supabase edge instance's module scope (and thus the `recent` throttle map) is isolated per instance and reset on cold start — per the in-file comment (lines 19-22), not verified at runtime.
