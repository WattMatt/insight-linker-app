# Token Systems & Unauthenticated Access Paths

Every tokenized / unauthenticated entry point into the app, documented from code.
Each path is reached without a Supabase auth session (anon key, or no key at all for
edge functions with `verify_jwt = false`). The June 2026 security work repointed the
public review/portfolio/QR pages off direct anon table reads and onto scoped
`SECURITY DEFINER` RPCs; the current calls are cited below.

Every claim here is cited to a `src` path with `:line`, a migration filename, an
edge-function path, or the applied lockdown SQL. Items that cannot be verified from
checked-in code (live `pg_policies`, live storage config, production-only producers)
are marked **⚠️ UNVERIFIED** and collected under "Open questions".

## Token store: `client_access_links`

All review/portfolio tokens are minted into one table.

Schema (`supabase/migrations/20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql:2-16`):

| Column | Type / default | Notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | link identifier returned as `link_id` |
| `access_token` | `text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32),'hex')` | 64-hex-char share token; the value in the URL |
| `client_id` | `uuid → clients(id) ON DELETE CASCADE` | set for `link_type='client'` |
| `site_id` | `uuid → sites(id) ON DELETE CASCADE` | set for `link_type='site'` |
| `link_type` | `text NOT NULL DEFAULT 'site' CHECK IN ('client','site','subsection')` | scope discriminator |
| `subsection_id` | `uuid → subsections(id) ON DELETE CASCADE` | set for `link_type='subsection'` |
| `label` | `text` | optional admin label |
| `is_active` | `bool NOT NULL DEFAULT true` | revocation flag |
| `expires_at` | `timestamptz NULL` | NULL = never expires |
| `created_by` | `uuid → auth.users(id)` | minting admin |
| `last_accessed_at`, `access_count` | tracking | bumped on every successful `validate_access_link` call |

Indexes: `access_token`, `client_id`, `site_id` (`...20260122090622...:18-21`).

### RLS on `client_access_links`

- `"Admins can manage access links"` — `FOR ALL USING (EXISTS SELECT 1 FROM user_roles WHERE user_id=auth.uid() AND role='Admin')` (`...20260122090622...:27-36`).
- `"Public can select access_links for validation"` — `FOR SELECT USING (true)`, no `TO` clause so it applies to the `public` role (incl. anon) (`...20260123052614...:9-12`).
  - **⚠️ UNVERIFIED whether this policy still exists in production.** The 2026-06-11 tier-2 anon-read lockdown (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`) scans `pg_policies` for every policy where `cmd='SELECT' AND qual='true' AND (roles='{public}' OR 'anon'=ANY(roles)) AND tablename NOT IN ('settings')` and demotes each to `authenticated USING(true)`. This policy matches those criteria **by qual + role, not by name** — so if the lockdown ran in prod, it was dropped and replaced with an `auth_read_client_access_links` authenticated-only policy. Either way this is **non-breaking**: `validate_access_link` and `_share_link` are `SECURITY DEFINER` and execute as the function owner (postgres), which bypasses RLS, so they do not depend on any anon SELECT policy.
- A short-lived `"Allow tracking updates via token"` UPDATE policy (`USING(true) WITH CHECK(true)`) was added in `...20260123052554...:7-11` and **dropped** in `...20260123052614...:1`. It is not present in the current schema.

### Minting (admin UI)

`src/components/client-portal/AccessLinkGenerator.tsx`:
- Insert into `client_access_links` supplying `label`, `link_type`, `site_id`, `client_id`, `expires_at`, `created_by` only (`:176-188`). `access_token` is **not** supplied by the client — it defaults to `encode(gen_random_bytes(32),'hex')` server-side.
- `expires_at` computed from a dropdown of `never | 7d | 30d | 90d` (`:166-172`).
- After insert, URL built client-side: `link_type==='client' → /portfolio/{token}`, else `/review/{token}` (`:204-205`); same mapping in `copyLink`/`openLink` (`:254-256`, `:261-264`).
- Revocation = toggle `is_active` (`:236-243`) or `DELETE` the row (`:216-223`). The UI list labels a link `isValid = is_active && !isExpired` where `isExpired = expires_at && new Date(expires_at) < now` (`:430-431`), mirroring the DB check.

> `link_type='subsection'` is allowed by the CHECK constraint but the generator UI only offers `site` ("Site Review") and `client` ("Client Portfolio") (`:318-319`); no UI path mints a subsection-scoped link. The drill-down RPCs still handle `v_link.subsection_id` if one exists (see scope checks below).

### Validation function `validate_access_link(token)`

Current definition: `supabase/migrations/20260123052657_71a9512e-785c-4b85-bb99-36699b88907d.sql:6-63`. This **supersedes the function body** defined in `...20260123052614...:15-` (which used an unsupported `set_config('role',...)` role switch). `...20260123052554...` did **not** define a function — it only added the later-dropped UPDATE policy.
`LANGUAGE plpgsql SECURITY DEFINER SET search_path='public'`. Granted to `anon` and `authenticated` (`...052657...:66-67`).

Behaviour:
1. Looks up the row by `access_token` into a RECORD (`:23-35`).
2. If found AND `is_active=true` AND (`expires_at IS NULL OR expires_at > now()`), bumps `last_accessed_at = now()` and `access_count + 1` (`:38-47`).
3. Returns one row only if the token exists: `link_id, link_type, client_id, site_id, subsection_id, is_valid`, where `is_valid = (is_active AND (expires_at IS NULL OR expires_at > now()))` (`:50-59`).

It returns the row even when invalid (`is_valid=false`); it returns **no rows** only when the token does not exist. Callers treat empty result or `is_valid=false` as "invalid or expired". This function bumps tracking counters; it is the only anon-callable token validator.

### Internal scope helper `_share_link(p_token)`

`supabase/migrations/20260610113000_public_rpcs_phase1.sql:9-19`. `LANGUAGE sql STABLE SECURITY DEFINER`, **REVOKEd from PUBLIC** (`:19`) and never re-granted — only the scoped RPCs below call it. Returns the full `client_access_links` row only if `is_active AND (expires_at IS NULL OR expires_at > now())`. This is the canonical "is this token live" gate for the scoped payload RPCs; unlike `validate_access_link` it does **not** bump tracking counters and is not anon-callable.

---

## Path 1 — `/review/[token]` (site review)

- Route wrapper: `src/app/review/[token]/page.tsx` → view `src/views/PublicSiteReview.tsx`.
- On mount: `supabase.auth.signOut({scope:'local'})` (clears stale session so anon RPC runs cleanly), `.catch(()=>{})`, then `.finally(validateAndFetchData)` (`PublicSiteReview.tsx:133-139`).

Validation + reads:
1. `rpc('validate_access_link', { token })` (`:147-148`). Empty / `length===0` / `!is_valid` → "This link is invalid or has expired" (`:156-159`).
2. If `link_type==='client'` and no `routeSiteId`, **redirects** to `/portfolio/{token}` (`:164-167`).
3. Registration gate: if no `getVisitorSession(link_id)`, the page renders `VisitorRegistrationGate` before content (`:173-175` set state, `:273-282` render). See "Visitor gate" note — data is fetched before the gate renders.
4. Site payload: `targetSiteId = routeSiteId || link.site_id` (`:180`), then `rpc('get_public_site_review', { p_token: token, p_site_id: targetSiteId })` (`:182-184`). `null` return → leaves `site`/`client` unset, rendering "Site Not Found" (`:194-196`, `:298-310`).

RPC `get_public_site_review(p_token text, p_site_id uuid)` — `supabase/migrations/20260610130000_public_drilldown_rpcs.sql:12-83`. `LANGUAGE plpgsql STABLE SECURITY DEFINER`, granted `anon, authenticated` (`:83`). Scope enforcement (closes "Vuln 7" cross-tenant IDOR, `:28-35`):
```
IF v_link.client_id IS NOT NULL THEN IF v_site_client_id <> v_link.client_id THEN RETURN NULL; END IF;
ELSIF v_link.site_id IS NOT NULL THEN IF p_site_id <> v_link.site_id THEN RETURN NULL; END IF;
ELSE RETURN NULL;  -- link neither client- nor site-scoped
```
(`v_site_client_id` resolved from `sites WHERE id=p_site_id`; a non-existent site returns NULL at `:24-26`.)
Returns a single JSON object: `settings` (company_name + logo only), `site`, `client`, `subsections` (incl. `meter_serial_number`, `metering_status`), `snags`, `site_documents` (with `file_url`), `site_document_categories`, `inspections` (incl. full `json_data`), `subsection_documents` (with `file_url`) (`:37-80`).

**Attacker with the URL can see:** the full compliance dataset for one site the token is scoped to — site metadata, every subsection (incl. meter serials), all snags (title/status/risk), all site + subsection documents (`file_url`), and every inspection's raw `json_data`. After visitor-gate submission, also the Schematic and Assets tabs (see "Residual anon table reads").
**Cannot see:** any site outside the token's `client_id`/`site_id` scope — guessing another `siteId` in the URL returns `null` from the RPC (`:28-35`). The visitor gate is a soft, client-side gate (see below); it does not block data retrieval by a scripted client.

### `/review/[token]/subsection/[subsectionId]` (subsection review)

- Route wrapper: `src/app/review/[token]/subsection/[subsectionId]/page.tsx` → `src/views/PublicSubsectionReview.tsx`.
- Mount: `signOut({scope:'local'}).catch().finally(validateAndFetchData)` (`PublicSubsectionReview.tsx:129-135`).
- Validates token via `validate_access_link` for the gate/redirect (`:143-144`; invalid → error `:152-155`), then reads the scoped payload: `rpc('get_public_subsection_review', { p_token: token, p_subsection_id: subsectionId })` (`:168-169`). `null` → "Subsection not found" (`:177-180`).

RPC `get_public_subsection_review(p_token text, p_subsection_id uuid)` — `...20260610130000...:86-164`. `LANGUAGE plpgsql STABLE SECURITY DEFINER`, granted `anon, authenticated` (`:164`). Scope enforcement (closes "Vuln 6", `:105-114`): resolves the subsection's `site_id` + `client_id` (`:98-100`; missing subsection → NULL `:101-103`), then requires it be inside the token's client / site / subsection scope, else `RETURN NULL`. Payload: `settings`, `subsection` (incl. `meter_serial_number`, `ct_ratio`), `site`, `client`, `documents` (with `file_url`), `snags` (incl. `rectification_notes`), `inspections` (each carrying `json_data`, `template_name`, `template_sections`, and `signatures` so the report dialog renders with no second read — `:142-155`), and `floor_plans` with pin counts (`:156-160`). The view reshapes these into the inspection dialog purely client-side, no second read (`PublicSubsectionReview.tsx:277-292`).

**Attacker with the URL can see:** everything about one in-scope subsection — meter serial / CT ratio, every document `file_url`, all snags with rectification notes, and full inspection reports including embedded photos, tenant meter details, and signer names/types/dates. **Cannot see:** any subsection whose site falls outside the token scope (RPC returns `null`).

---

## Path 2 — `/portfolio/[token]` (client portfolio)

- Route wrapper: `src/app/portfolio/[token]/page.tsx` → `src/views/PublicClientPortfolio.tsx`.
- Mount: `signOut({scope:'local'}).catch().finally(fetchData)` (`:51-57`).
1. Sets up a 15s `AbortController` timeout (`:65-67`), calls `rpc('validate_access_link', { token })` (`:70-71`), then `clearTimeout` (`:73`). Requires a non-empty array result (`:83-86`) with `is_valid` (`:88-91`) **and** `link_type==='client'` with non-null `client_id` (`:101-104`), else "not a client portfolio link". (Note: the abort timeout wraps the validate call only; the supabase-js RPC does not actually consume the `AbortController`, so the timeout is effectively dead — it sets up `controller` but never passes `controller.signal` to the call.)
2. Visitor gate (`:97-99` set state, `:180-189` render).
3. `rpc('get_public_portfolio', { p_token: token })` (`:107-108`). Error or `null` → "Unable to load client data" (`:110-113`).

RPC `get_public_portfolio(p_token text)` — `supabase/migrations/20260610113000_public_rpcs_phase1.sql:53-77`. `LANGUAGE plpgsql SECURITY DEFINER`, granted `anon, authenticated` (`:77`). Returns `NULL` if `_share_link` is null **or** `client_id IS NULL` (`:58-60`) — so a `site`-type token cannot read a portfolio. Payload: `settings`, `client` (name/company/logo), and `sites[]` each with `total_subsections` and `open_snags` aggregate counts (`:61-74`). Returns no per-subsection detail — only site cards with counts.

Site images: the view post-processes each `site_image_url` through `supabase.storage.from('site-images').createSignedUrl(path, 3600)` (`PublicClientPortfolio.tsx:127-145`); on any failure it falls through to the original URL (`:143`).
- The `site-images` bucket was set `public=false` (`...20251017094000...:8-10`, alongside `profile-images`), then a later blanket `UPDATE storage.buckets SET public = true` flipped **all** buckets public (`...20251120083541...:20`). That same migration dropped all `storage.objects` policies (`:4-15`) and recreated authenticated-only CRUD policies (`:23-36`) **plus a `"Public can view all buckets" FOR SELECT` policy** (`:40-41`). So with the bucket public and a public storage SELECT policy, anon can resolve `site-images` via public URL regardless of whether the `createSignedUrl` call succeeds. **⚠️ UNVERIFIED against live storage config** — the two bucket-`public` migrations conflict and the live `public` flag / storage policy set must be confirmed in the DB.

**Attacker with the URL can see:** the client's company name/logo, every site under that client, per-site subsection + open-snag counts, and (via public bucket) site images. **Cannot see:** drill-down detail from this RPC alone (must navigate into `/portfolio/{token}/site/{siteId}`, which re-validates scope); or any other client's portfolio (RPC keys strictly off `v_link.client_id`).

### `/portfolio/[token]/site/[siteId]` (portfolio → site drill-down)

- Route wrapper: `src/app/portfolio/[token]/site/[siteId]/page.tsx` → **same view** `PublicSiteReview`. `useParams` reads both `token` and `siteId` (`PublicSiteReview.tsx:113`); `targetSiteId = routeSiteId || link.site_id` (`:180`) is passed to `get_public_site_review`. The site-scope check in the RPC (`...130000...:28-35`) makes the URL-supplied `siteId` safe — a client-token holder can only reach sites under their `client_id`.

---

## Path 3 — `/public/subsections/[subsectionId]` (QR landing, no token)

- Two route wrappers, **same view** `src/views/PublicSubsection.tsx`:
  - `src/app/public/subsections/[subsectionId]/page.tsx`
  - `src/app/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx` (legacy nested QR URL; the view reads only `subsectionId` from params — `PublicSubsection.tsx:64` — so `clientId`/`siteId` are decorative).
- **No token.** Access is gated only by knowledge of the `subsectionId` UUID. This is the QR-code target, built as `{baseUrl}/public/subsections/{id}` in `src/lib/qrCodeGenerator.ts:31`, `src/components/SiteSummaryReport.tsx:139` and `:186`.
- Mount: `fetchPublicData()` on `subsectionId` (`PublicSubsection.tsx:72-76`). No `signOut` here. Read: `rpc('get_public_subsection', { p_subsection_id: subsectionId })` (`:82-83`).

RPC `get_public_subsection(p_subsection_id uuid)` — `supabase/migrations/20260610113000_public_rpcs_phase1.sql:22-50`. `LANGUAGE sql STABLE SECURITY DEFINER`, REVOKEd from PUBLIC then granted `anon, authenticated` (`:49-50`). Returns `NULL` if the subsection does not exist (`:24-25`), else: `settings` (branding), `subsection` (`id, name, tenant_name` only), `site` (`id, name`), document `categories` with `subsection_documents` (incl. `file_url`), and `snags` (`:26-46`). This is a deliberately thinner payload than the token-gated subsection review — **no** meter serials, **no** inspection `json_data`, **no** CT ratio, **no** signatures, **no** floor plans.

**Attacker with the URL (or who guesses/enumerates a UUID) can see:** the subsection name + tenant, parent site name, all document `file_url`s grouped by category, and all snags (title, description, status, risk). **Cannot see:** inspections, meter/CT detail, signatures, floor plans, or any client PII beyond the site name. Because there is no token, **any** valid subsection UUID is viewable by anyone — the only protection is UUID unguessability. This path is what the tier-2 lockdown was designed to preserve: the prereq note (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:6-11`) requires this RPC to ship (and `PublicSubsection` to be repointed onto it) **before** anon table SELECT is closed, so QR scans keep working through the RPC rather than direct reads. The view as it stands calls only the RPC (`:82-83`); no residual direct table reads remain in it.

---

## Path 4 — `/download/[requestId]` (client-side download handoff)

- Route wrapper: `src/app/download/[requestId]/page.tsx` → `src/views/DownloadHandoff.tsx`.
- **No server token and no DB.** `requestId` keys a record in a browser IndexedDB store (`wm-download-handoff` / `requests`, `src/lib/downloadHandoff.ts:17-18`). The view polls IndexedDB up to `MAX_POLL_ATTEMPTS=60 × POLL_INTERVAL_MS=500ms` (`DownloadHandoff.tsx:9-10`, loop `:45-61`) for a `{ fileName, blob?, url? }` record, then auto-triggers a top-level download and deletes the record (`:84-103`).
- The record is purely local to the browser; the IndexedDB store key for the live producer's pending handoff is a `crypto.randomUUID()` (`downloadHandoff.ts:223`) and is meaningless on any other device.

> **Dead route in current code.** The IndexedDB writer `putDownloadRequest` (`downloadHandoff.ts:152`) is **not exported** and is **called nowhere in `src`** (verified by grep). No code in `src` navigates to `/download/...` (verified by grep). The live report-download flow uses `createPendingDownloadHandoff()` → `window.open('','_blank')` + `document.write` (`downloadHandoff.ts:210-271`), reached via `openDownloadHandoffWindow()` from `src/lib/fileDownload.ts:201` and directly from `src/components/site/GenerateFinalReportButton.tsx:424` (`completeDownloadHandoff` at `:517`). That flow renders/streams into the opened tab and **never** navigates to `/download/[requestId]`. So as wired today, visiting `/download/{anything}` polls an empty IndexedDB store for ~30s and shows "This download request expired before the file payload arrived" (`DownloadHandoff.tsx:58-60`). **⚠️ UNVERIFIED** whether any deployed/legacy producer ever wrote to this store and navigated here; in current `src` it is an unwired, ported Next.js page.

**Attacker with the URL can see:** nothing — there is no server state behind `requestId`; the only data is in the originating browser's IndexedDB.

---

## Path 5 — `qr-redirect` edge function

- File: `supabase/functions/qr-redirect/index.ts`. `verify_jwt = false` (`supabase/config.toml:9-10`, `[functions.qr-redirect]`) — anon-callable, no auth.
- Purpose: resolve a legacy/Firebase QR path or a bare UUID to the canonical `/public/subsections/{id}` page and 302-redirect. Hardcoded target origin `https://watsonmattheus.com` (`:32`, `:61`).
- **Uses the service-role key, not anon** (`SUPABASE_SERVICE_ROLE_KEY`, `:56-58`), with a code comment that this is safe because it only resolves an id and 302-redirects — it never returns row data (`:53-55`). This was a deliberate fix (commit `9233c5e`) so the function keeps working after the tier-2 lockdown removed anon SELECT on `subsections`.

Resolution order:
1. Malformed `//public/subsections/{uuid}` or `/public/subsections/{uuid}` paths from old QR codes → cleaned, UUID-validated, and 302'd (`:27-43`).
2. Missing/`'/'` path → 400 (`:45-50`).
3. Bare UUID → verifies `subsections` row exists via `.select('id').eq('id',…).single()`, 302 to public page, else 404 (`:65-94`).
4. Firebase path → matches `subsections.firebase_id = cleanPath`, 302 or fall through (`:103-120`).
5. Name-structure fallback: `ilike` on subsection name + client/site name match in JS (`:123-163`).
6. No match → 404 (`:165-169`); thrown error → 500 (`:171-178`).

**Attacker can:** enumerate which subsection UUIDs / firebase ids / name structures exist (302 vs 404 is an existence oracle) and be redirected to the public page. **Cannot:** read row contents from this function — it returns only `Location` headers and status codes. Any data exposure happens at the redirect *target* (Path 3), not here. The service-role key is held server-side and not exposed in responses.

---

## Path 6 — `oauth-token` edge function (machine-to-machine API auth)

- File: `supabase/functions/oauth-token/index.ts`. `verify_jwt = false` (`supabase/config.toml:73-74`, `[functions.oauth-token]`) — anon-reachable; auth is by client credentials in the request body.
- **Uses the service-role key** to read/write the API token tables (`SUPABASE_SERVICE_ROLE_KEY`, `:16-18`).

Token store — separate from `client_access_links`. Migration `supabase/migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`:
- `api_clients` (`:2-13`): `client_id text DEFAULT encode(gen_random_bytes(16),'hex')`, `client_secret text DEFAULT encode(gen_random_bytes(32),'hex')`, `scopes text[] DEFAULT ARRAY['reports:read']`, `is_active bool DEFAULT true`. RLS: `"Admins can manage API clients" FOR ALL TO authenticated USING/ WITH CHECK has_role(auth.uid(),'Admin')` (`:47-52`). Created via admin UI `src/views/APIClients.tsx:73-78` (insert supplies only `name` + `created_by`; id/secret default server-side).
- `api_access_tokens` (`:16-26`): `access_token`/`refresh_token` default `encode(gen_random_bytes(32),'hex')`, `expires_at DEFAULT now()+1h`, `refresh_expires_at DEFAULT now()+30 days`. RLS: `"Service role manages tokens" FOR ALL TO service_role` (`:55-60`).
- `api_request_logs` (`:29-39`): audit trail; `"Admins can view API logs" FOR SELECT TO authenticated` (`:63-67`) + `"Service role manages logs" FOR ALL TO service_role` (`:69-74`).

Grant flows (`oauth-token/index.ts`):
- Unsupported `grant_type` → 400 (`:23-28`).
- `grant_type=client_credentials`: looks up `api_clients` by `client_id + client_secret + is_active=true` via `.eq` chain (`:34-40`); 401 `invalid_client` if no match (`:42-47`).
- `grant_type=refresh_token`: looks up `api_access_tokens` by `refresh_token` with `refresh_expires_at > now()` and active joined client (`:51-58`); 401 `invalid_grant` if no match (`:58-63`); deletes the old token (rotation) and reuses the joined client (`:65-67`).
- Issues a new access+refresh token pair (each `crypto.randomUUID() + crypto.randomUUID().replace(/-/g,'')`, `:71-72`), inserts into `api_access_tokens` with 1h / 30d expiry (`:73-83`), logs the request (`:94-102`), returns `{ access_token, token_type:'Bearer', expires_in:3600, refresh_token, scope }` (`:104-113`).

Consumption: `api-reports` edge function validates the bearer access token inline — selects `api_access_tokens` joined to `api_clients` where `access_token = token AND expires_at > now()` and `api_clients.is_active` (`supabase/functions/api-reports/index.ts:18-27`), bumps `last_used_at` (`:30-33`), then enforces the `reports:read` scope (`:58-63`); 401 on bad token, 403 on missing scope. There is also a DB function `validate_api_token(token)` (`...20260110172925...:77-99`, `SECURITY DEFINER`) but `api-reports` validates inline rather than calling it. **⚠️ UNVERIFIED** whether any other (possibly non-checked-in) caller uses `validate_api_token`.

**Attacker without valid client credentials:** cannot mint a token — both grant types fail closed with 401 (`:42-47`, `:58-63`). Client secret comparison is a plain SQL equality match (`.eq("client_secret", client_secret)`, `:37-38`); **not** a constant-time compare, but the value is a 64-hex random secret. **Attacker with a leaked `access_token`:** can call `api-reports` for `reports:read` data until the 1h expiry; with a leaked `refresh_token`, can rotate for up to 30 days. Revocation = set `api_clients.is_active=false` (admin UI toggle, `APIClients.tsx:92-95`) — both `oauth-token` and `api-reports` validation paths require an active client, so this immediately invalidates all of that client's existing tokens. Deleting a client cascades its tokens (`api_access_tokens.client_id ... ON DELETE CASCADE`, `...20260110172925...:18`).

---

## Visitor registration gate

`VisitorRegistrationGate` (`src/components/VisitorRegistrationGate.tsx`) is rendered by all three token-gated views (site review, subsection review, portfolio) when `getVisitorSession(link_id)` is false. Mechanics:
- `getVisitorSession` reads `sessionStorage["visitor_session"]` and returns true if its stored `linkId` matches (`:32-44`).
- On submit, the gate validates the form client-side (`:62-81`) and inserts a row into `access_link_visitors` (`:89-97`), then writes `{ linkId, email }` to `sessionStorage` (`:106-109`) and calls `onRegistered()`.
- `access_link_visitors` RLS: `"Anyone can register as visitor" FOR INSERT WITH CHECK (true)` (`supabase/migrations/20260217082506_a2247d71-37f4-49d4-bb28-fbb9724692fd.sql:20-22`) — anon can insert; `"Admins can view visitors" FOR SELECT` (`:25-26`).

**The gate does not withhold data.** In every token-gated view the scoped payload RPC is awaited and stored in state *before* the gate's render condition is evaluated (e.g. `PublicSiteReview.tsx:182-211` runs inside `validateAndFetchData`, which `:137` invokes; the gate render at `:273-282` happens on a later render). A scripted anon client can call `get_public_site_review` / `get_public_subsection_review` / `get_public_portfolio` directly and never touch the gate. The gate is a UX/lead-capture step backed only by `sessionStorage`, not an access control.

---

## Residual anon table reads (post-lockdown gap)

Two components rendered inside the **token-gated** `/review/[token]` site page still read tables directly with the anon key rather than through the scoped RPC. Note `SchematicDiagram` is passed `accessToken={token}` (`PublicSiteReview.tsx:473`) but its `loadData()` does **not** use that prop — it queries tables directly by `siteId`.

- `SchematicDiagram` (Schematic tab, `PublicSiteReview.tsx:473`) reads `site_schematics` (`SchematicDiagram.tsx:679-683`), `schematic_blocks` (`:701-705`), `subsections` (`:711-715`), `inspections` (`:720-723`) directly by `siteId`. `site_schematics` / `schematic_blocks` carry `"Anyone can view ... USING (true)"` anon SELECT policies (`supabase/migrations/20260120132425_dd27775f-2702-483d-846e-ba743b2d95f6.sql:34-37` and `:55-58`).
- `AssetVerification` (Assets tab, `PublicSiteReview.tsx:478`) reads `site_assets` (`AssetVerification.tsx:56-60`), `inspections` (`:71-75`), `subsections` (`:86-90`) directly via `useQuery`.

**⚠️ UNVERIFIED post-lockdown state.** The tier-2 script (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`) demotes every anon `USING(true)` SELECT policy to authenticated-only across all tables except `settings`. If applied to production it would have removed the `site_schematics` / `schematic_blocks` anon SELECT and any anon SELECT on `subsections` / `inspections` / `site_assets`, in which case these two tabs would now fail to load for an anon reviewer (the page renders, but those tabs error/empty — a correctness/availability regression, not a new IDOR, since `siteId` is passed straight from the DB-scope-checked page). Whether these reads still succeed for anon depends on the live policy set, which must be checked against `pg_policies` because the lockdown SQL lives outside `supabase/migrations/` and was applied via the SQL editor.

---

## Open questions

1. **`"Public can select access_links for validation"` policy** — does it still exist in production, or did the 2026-06-11 tier-2 anon-read lockdown demote it to authenticated-only? It matches the lockdown's drop criteria (`cmd='SELECT'`, `qual='true'`, public/anon role, not `settings`) — see `...20260123052614...:9-12` vs lockdown `:22-39`. Non-breaking either way, since validation runs `SECURITY DEFINER`.
2. **Anon reads on schematic/asset tabs** — after the tier-2 lockdown, can an anonymous `/review/[token]` visitor still load `site_schematics`, `schematic_blocks`, `site_assets`, `subsections`, `inspections` directly? If not, those tabs are broken for public reviewers and should be repointed to a scoped RPC. Cannot be resolved from migrations alone because the lockdown SQL lives outside `supabase/migrations/`.
3. **`site-images` access for anon** — the portfolio view calls `createSignedUrl` on `site-images` as anon, but the bucket appears `public=true` with a `"Public can view all buckets" FOR SELECT` storage policy (`...20251120083541...:20`, `:40-41`), conflicting with the earlier `public=false` (`...20251017094000...:8-10`). Effective live behaviour (public flag + storage.objects policies) must be confirmed against the DB.
4. **`/download/[requestId]` reachability** — is there any deployed or legacy producer that wrote to the `wm-download-handoff` IndexedDB store and navigated to this route, or is it fully dead in production? Current `src` has no writer caller and no navigation to the route.
5. **`validate_api_token` usage** — `api-reports` validates inline; is the DB function `validate_api_token` (`...20260110172925...:77-99`) called by any other (possibly non-checked-in) consumer?
6. **Visitor gate as access control** — the gate is purely client-side (`sessionStorage`) and the scoped RPCs return their full payload *before* the gate render condition is checked, so it does not withhold data from a scripted anon client calling the RPCs directly. Confirm whether withholding data behind registration is a requirement; if so, the gate must move server-side (e.g. require a registration token the RPC checks).
7. **Portfolio validate timeout is dead** — `PublicClientPortfolio.tsx:65-73` builds an `AbortController` with a 15s timeout but never passes `controller.signal` to the `validate_access_link` RPC, so the abort never fires. Confirm whether a real timeout on the validate call is wanted.
