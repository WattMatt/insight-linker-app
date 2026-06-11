# Token Systems & Unauthenticated Access Paths

Every tokenized / unauthenticated entry point into the app, documented from code.
Each path is reached without a Supabase auth session (anon key, or no key at all for
edge functions with `verify_jwt = false`). The June 2026 security work repointed the
public review pages off direct anon table reads and onto scoped `SECURITY DEFINER`
RPCs; the current calls are cited below.

## Token store: `client_access_links`

All review/portfolio tokens are minted into one table.

Schema (`supabase/migrations/20260122090622_9c76c44a-8b4a-4666-807a-e523b21acfea.sql:2-16`):

| Column | Type / default | Notes |
|---|---|---|
| `id` | uuid PK | link identifier returned as `link_id` |
| `access_token` | `text UNIQUE DEFAULT encode(gen_random_bytes(32),'hex')` | 64-hex-char share token; the value in the URL |
| `client_id` | uuid → `clients(id)` ON DELETE CASCADE | set for `link_type='client'` |
| `site_id` | uuid → `sites(id)` ON DELETE CASCADE | set for `link_type='site'` |
| `subsection_id` | uuid → `subsections(id)` ON DELETE CASCADE | set for `link_type='subsection'` |
| `link_type` | `text DEFAULT 'site' CHECK IN ('client','site','subsection')` | scope discriminator |
| `is_active` | `bool DEFAULT true` | revocation flag |
| `expires_at` | `timestamptz NULL` | NULL = never expires |
| `created_by` | uuid → `auth.users(id)` | minting admin |
| `last_accessed_at`, `access_count` | tracking | bumped on every validate call |

RLS on the table (`...20260122090622...:24-36`, `...20260123052614...:13-15`):
- `"Admins can manage access links"` — `FOR ALL USING (EXISTS user_roles WHERE user_id=auth.uid() AND role='Admin')`.
- `"Public can select access_links for validation"` — `FOR SELECT USING (true)`. ⚠️ UNVERIFIED whether the 2026-06-11 tier-2 anon-read lockdown removed this policy: that script (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-26`) drops every `cmd='SELECT' AND qual='true'` policy granted to anon/public except `settings`, which would match this policy by name. The public RPCs do not depend on it (they are `SECURITY DEFINER`), so its removal is non-breaking. Confirm against live `pg_policies`.

### Minting (admin UI)

`src/components/client-portal/AccessLinkGenerator.tsx`:
- Insert into `client_access_links` with `link_type`, `site_id`/`client_id`, `expires_at`, `created_by` (`:176-187`). `access_token` is **not** supplied by the client — it defaults to `gen_random_bytes(32)` server-side.
- `expires_at` computed from a dropdown of `never | 7d | 30d | 90d` (`:166-172`).
- After insert, the URL is built client-side: `link_type==='client' → /portfolio/{token}`, else `/review/{token}` (`:204-205`, `:254-256`).
- Revocation = toggle `is_active` (`:236-243`) or `DELETE` the row (`:216-223`). The UI labels a link invalid when `is_active=false` OR `expires_at < now` (`:432-433`), mirroring the DB check.

> `link_type='subsection'` is allowed by the CHECK constraint but the generator UI only offers `site` and `client` (`:318-319`); no UI path mints a subsection-scoped link. The drill-down RPC still handles `v_link.subsection_id` if one exists (see scope checks below).

### Validation function `validate_access_link(token)`

Current definition: `supabase/migrations/20260123052657_71a9512e-785c-4b85-bb99-36699b88907d.sql` (supersedes the two earlier attempts in `...052554...` and `...052614...`).
`LANGUAGE plpgsql SECURITY DEFINER SET search_path=public`. Granted to `anon, authenticated` (`...052657...:64-65`).

Behaviour:
1. Looks up the row by `access_token` (`:18-32`).
2. If found AND `is_active=true` AND (`expires_at IS NULL OR expires_at > now()`), bumps `last_accessed_at = now()` and `access_count + 1` (`:35-44`).
3. Returns one row: `link_id, link_type, client_id, site_id, subsection_id, is_valid`, where `is_valid = (is_active AND (expires_at IS NULL OR expires_at > now()))` (`:48-57`).

It returns the row even when invalid (with `is_valid=false`); it returns no rows only when the token does not exist. Callers treat empty result or `is_valid=false` as "invalid or expired".

### Internal scope helper `_share_link(p_token)`

`supabase/migrations/20260610113000_public_rpcs_phase1.sql:9-19`. `SECURITY DEFINER`, **REVOKEd from PUBLIC** (`:19`) — only the scoped RPCs below call it. Returns the full `client_access_links` row only if `is_active AND (expires_at IS NULL OR expires_at > now())`. This is the canonical "is this token live" gate for the scoped payload RPCs; unlike `validate_access_link` it does **not** bump tracking counters and is not anon-callable.

---

## Path 1 — `/review/[token]` (site review)

- Route: `src/app/review/[token]/page.tsx` → view `src/views/PublicSiteReview.tsx`.
- On mount: `supabase.auth.signOut({scope:'local'})` (clears stale session so anon RPC runs cleanly) then `validateAndFetchData()` (`PublicSiteReview.tsx:133-139`).

Validation + reads:
1. `rpc('validate_access_link', { token })` (`:147-148`). Empty/`!is_valid` → "This link is invalid or has expired" (`:156-159`).
2. If `link_type==='client'` and no `routeSiteId`, **redirects** to `/portfolio/{token}` (`:164-167`).
3. Registration gate: if no `getVisitorSession(link_id)`, renders `VisitorRegistrationGate` before any content (`:173-175`, `:273-282`).
4. Site payload: `rpc('get_public_site_review', { p_token: token, p_site_id: routeSiteId || link.site_id })` (`:180-184`). `null` return → "Site Not Found" (`:194-196`).

RPC `get_public_site_review(p_token text, p_site_id uuid)` — `supabase/migrations/20260610130000_public_drilldown_rpcs.sql:12-83`. `SECURITY DEFINER`, granted `anon, authenticated` (`:83`). Scope enforcement (closes "Vuln 7" cross-tenant IDOR, `:28-35`):
```
IF v_link.client_id IS NOT NULL THEN IF v_site_client_id <> v_link.client_id THEN RETURN NULL;
ELSIF v_link.site_id IS NOT NULL THEN IF p_site_id <> v_link.site_id THEN RETURN NULL;
ELSE RETURN NULL;  -- link neither client- nor site-scoped
```
Returns a single JSON object: `settings` (company branding), `site`, `client`, `subsections`, `snags`, `site_documents`, `site_document_categories`, `inspections` (incl. full `json_data`), `subsection_documents` (`:37-80`).

**Attacker with the URL can see:** the full compliance dataset for one site that the token is scoped to — site metadata, every subsection, all snags (with risk levels), all site + subsection documents (file URLs), and every inspection's raw `json_data`. After visitor-gate submission, also the schematic and asset tabs (see "Residual anon table reads" below).
**Cannot see:** any site outside the token's `client_id`/`site_id` scope — guessing another `siteId` in the URL returns `null` from the RPC (`:28-35`). The visitor gate is a soft gate (client-side `sessionStorage`, see Path notes); it does not block data retrieval.

### `/review/[token]/subsection/[subsectionId]` (subsection review)

- Route: `src/app/review/[token]/subsection/[subsectionId]/page.tsx` → `src/views/PublicSubsectionReview.tsx`.
- Validates token via `validate_access_link` for the gate/redirect (`PublicSubsectionReview.tsx:143-144`), then reads the scoped payload: `rpc('get_public_subsection_review', { p_token: token, p_subsection_id: subsectionId })` (`:168-169`). `null` → "Subsection not found".

RPC `get_public_subsection_review(p_token text, p_subsection_id uuid)` — `...20260610130000...:86-164`. Granted `anon, authenticated` (`:164`). Scope enforcement (closes "Vuln 6", `:105-114`): resolves the subsection's site + client, then requires it be inside the token's client / site / subsection scope, else `RETURN NULL`. Payload: `settings, subsection, site, client, documents, snags, inspections` (each carrying `json_data`, `template_name`, `template_sections`, and `signatures` so the report dialog renders with no second read — `:142-155`), and `floor_plans` with pin counts (`:156-160`).

**Attacker with the URL can see:** everything about one in-scope subsection — meter serial / CT ratio, every document URL, all snags with rectification notes, and full inspection reports including embedded photos, tenant meter details, and signer names/types/dates. **Cannot see:** any subsection whose site falls outside the token scope (RPC returns `null`).

---

## Path 2 — `/portfolio/[token]` (client portfolio)

- Route: `src/app/portfolio/[token]/page.tsx` → `src/views/PublicClientPortfolio.tsx`.
- `signOut({scope:'local'})` then `fetchData()` (`:51-57`).
1. `rpc('validate_access_link', { token })` with a 15s abort timeout (`:65-73`). Requires `is_valid` (`:88-91`) **and** `link_type==='client'` with non-null `client_id` (`:101-104`), else "not a client portfolio link".
2. Visitor gate (`:97-99`, `:180-189`).
3. `rpc('get_public_portfolio', { p_token: token })` (`:107-108`).

RPC `get_public_portfolio(p_token text)` — `supabase/migrations/20260610113000_public_rpcs_phase1.sql:53-77`. `SECURITY DEFINER`, granted `anon, authenticated` (`:77`). Returns `NULL` if `_share_link` is null **or** `client_id IS NULL` (`:58-60`) — so a `site`-type token cannot read a portfolio. Payload: `settings`, `client`, and `sites[]` each with `total_subsections` and `open_snags` aggregate counts (`:61-74`). Note it returns no per-subsection detail — only site cards with counts.

Site images: the view post-processes `site_image_url` through `supabase.storage.from('site-images').createSignedUrl(path, 3600)` (`PublicClientPortfolio.tsx:127-145`). ⚠️ UNVERIFIED whether anon can mint signed URLs on `site-images`: that bucket was set `public=false` (`supabase/migrations/20251017094000...:8-10`) then a later blanket `UPDATE storage.buckets SET public = true` (`supabase/migrations/20251120083541...:20`) flipped **all** buckets public, and that same migration dropped all `storage.objects` policies and recreated authenticated-only ones (`:23-37`). With the bucket public, images resolve via public URL regardless of the signing attempt; if signing fails the code falls through to the original URL (`:141`). Effective live storage RLS for anon should be confirmed against the DB.

**Attacker with the URL can see:** the client's company name/logo, every site under that client, and per-site subsection + open-snag counts. **Cannot see:** drill-down detail from this RPC alone (must navigate into `/portfolio/{token}/site/{siteId}`, which re-validates scope); or any other client's portfolio (RPC keys strictly off `v_link.client_id`).

### `/portfolio/[token]/site/[siteId]` (portfolio → site drill-down)

- Route: `src/app/portfolio/[token]/site/[siteId]/page.tsx` → **same view** `PublicSiteReview`. `useParams` reads both `token` and `siteId` (`PublicSiteReview.tsx:113`); `targetSiteId = routeSiteId || link.site_id` (`:180`) is passed to `get_public_site_review`. The site-scope check in the RPC (`...130000...:28-35`) makes the URL-supplied `siteId` safe — a client-token holder can only reach sites under their `client_id`.

---

## Path 3 — `/public/subsections/[subsectionId]` (QR landing, no token)

- Routes (two paths, same view `src/views/PublicSubsection.tsx`):
  - `src/app/public/subsections/[subsectionId]/page.tsx`
  - `src/app/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx` (legacy nested QR URL; the view reads only `subsectionId` from params — `PublicSubsection.tsx:64` — so `clientId`/`siteId` are decorative).
- **No token.** Access is gated only by knowledge of the `subsectionId` UUID. This is the QR-code target (built as `{baseUrl}/public/subsections/{id}` in `src/lib/qrCodeGenerator.ts:31`, `src/components/SiteSummaryReport.tsx:139`, etc.).
- Read: `rpc('get_public_subsection', { p_subsection_id })` (`PublicSubsection.tsx:82-83`).

RPC `get_public_subsection(p_subsection_id uuid)` — `supabase/migrations/20260610113000_public_rpcs_phase1.sql:22-50`. `LANGUAGE sql STABLE SECURITY DEFINER`, granted `anon, authenticated` (`:50`). Returns `NULL` if the subsection does not exist (`:24-25`), else: `settings` (branding), `subsection` (`id, name, tenant_name` only), `site` (`id, name`), document `categories` with files, and `snags` (`:26-46`). This is a deliberately thinner payload than the token-gated subsection review — no meter serials, no inspection `json_data`, no CT ratio.

**Attacker with the URL (or who guesses/enumerates a UUID) can see:** the subsection name + tenant, parent site name, all document file URLs grouped by category, and all snags (title, description, status, risk). **Cannot see:** inspections, meter/CT detail, signatures, or any client PII beyond the site name. Because there is no token, **any** valid subsection UUID is viewable by anyone — the only protection is UUID unguessability. This was the path the tier-2 anon-read lockdown was designed to preserve: the prereq note (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:6-11`) requires this RPC to ship before anon table SELECT is closed, so QR scans keep working through the RPC rather than direct reads.

---

## Path 4 — `/download/[requestId]` (client-side download handoff)

- Route: `src/app/download/[requestId]/page.tsx` → `src/views/DownloadHandoff.tsx`.
- **No server token and no DB.** `requestId` keys a record in a browser IndexedDB store (`wm-download-handoff` / `requests`, `src/lib/downloadHandoff.ts:17-18`). The view polls IndexedDB up to 60×500ms (`DownloadHandoff.tsx:9-10,45-61`) for a `{ fileName, blob? , url? }` record, then auto-triggers a top-level download and deletes the record (`:84-103`).
- The record is purely local to the browser; the `requestId` is a `crypto.randomUUID()` (`downloadHandoff.ts:223`) and is meaningless on any other device.

> **Dead route in current code.** The writer `putDownloadRequest` (`downloadHandoff.ts:152`) is defined but **called nowhere in `src`** (verified by grep). The live report-download flow uses `createPendingDownloadHandoff()` → `window.open('','_blank')` + `document.write` (`downloadHandoff.ts:210-271`, used by `src/lib/fileDownload.ts:201` and `src/components/site/GenerateFinalReportButton.tsx:424`), which never navigates to `/download/[requestId]`. So as wired today, visiting `/download/{anything}` polls an empty store for 30s and shows "This download request expired before the file payload arrived" (`DownloadHandoff.tsx:58-60`). ⚠️ UNVERIFIED whether this route is reachable from any deployed/legacy producer; it appears to be a ported-but-unwired Next.js page (per commit `109e0ee`).

**Attacker with the URL can see:** nothing — there is no server state behind `requestId`; the only data is in the originating browser's IndexedDB.

---

## Path 5 — `qr-redirect` edge function

- File: `supabase/functions/qr-redirect/index.ts`. `verify_jwt = false` (`supabase/config.toml`, `[functions.qr-redirect]`) — anon-callable, no auth.
- Purpose: resolve a legacy/Firebase QR path or a bare UUID to the canonical `/public/subsections/{id}` page and 302-redirect. Hardcoded target origin `https://watsonmattheus.com` (`:32,61`).
- **Uses the service-role key, not anon** (`:56-58`), with a code comment that this is safe because it only resolves an id and 302-redirects — it never returns row data (`:53-55`). This was a deliberate fix (commit `9233c5e`) so the function keeps working after the tier-2 lockdown removed anon SELECT on `subsections`.

Resolution order:
1. Malformed `//public/subsections/{uuid}` or `/public/subsections/{uuid}` paths from old QR codes → cleaned and 302'd (`:27-43`).
2. Bare UUID → verifies `subsections` row exists, 302 to public page, else 404 (`:65-94`).
3. Firebase path → matches `subsections.firebase_id = cleanPath`, 302 or fall through (`:103-120`).
4. Name-structure fallback: `ilike` on subsection name + client/site name match (`:123-163`).
5. No match → 404 (`:165-169`).

**Attacker can:** enumerate which subsection UUIDs / firebase ids / name structures exist (a 302 vs 404 is an existence oracle), and be redirected to the public page. **Cannot:** read row contents from this function — it returns only `Location` headers and status codes. Any data exposure happens at the redirect *target* (Path 3), not here. The service-role key is held server-side and not exposed in responses.

---

## Path 6 — `oauth-token` edge function (machine-to-machine API auth)

- File: `supabase/functions/oauth-token/index.ts`. `verify_jwt = false` (`supabase/config.toml`, `[functions.oauth-token]`) — anon-reachable; auth is by client credentials in the body.
- **Uses the service-role key** to read/write the API token tables (`:16-18`).

Token store — separate from `client_access_links`. Migration `supabase/migrations/20260110172925_a9616e50-9aa9-4128-8fa1-4e8852cde733.sql`:
- `api_clients` (`:2-12`): `client_id DEFAULT gen_random_bytes(16)`, `client_secret DEFAULT gen_random_bytes(32)`, `scopes DEFAULT ['reports:read']`, `is_active`. RLS: `"Admins can manage API clients" FOR ALL` admin-only (`:48-53`). Created via admin UI `src/views/APIClients.tsx:71-79` (insert supplies only `name` + `created_by`; id/secret default server-side).
- `api_access_tokens` (`:15-25`): `access_token`/`refresh_token` default `gen_random_bytes(32)`, `expires_at DEFAULT now()+1h`, `refresh_expires_at DEFAULT now()+30 days`. RLS: service-role only (`:56-61`).
- `api_request_logs` (`:28-39`): audit trail; admin SELECT + service-role ALL (`:64-77`).

Grant flows (`oauth-token/index.ts`):
- `grant_type=client_credentials`: looks up `api_clients` by `client_id + client_secret + is_active` (`:34-40`); 401 `invalid_client` if no match (`:42-47`).
- `grant_type=refresh_token`: looks up `api_access_tokens` by `refresh_token` with `refresh_expires_at > now()` and active client (`:51-58`); deletes the old token (rotation) and reissues (`:65-67`).
- Issues a new access+refresh token pair (`crypto.randomUUID()`-derived, `:71-72`), inserts into `api_access_tokens` with 1h / 30d expiry (`:73-83`), logs the request (`:94-102`), returns `{ access_token, token_type:'Bearer', expires_in:3600, refresh_token, scope }` (`:104-113`).

Consumption: `api-reports` edge function validates the bearer access token by selecting `api_access_tokens` where `access_token = token AND expires_at > now()` and client `is_active`, then enforces the `reports:read` scope (`supabase/functions/api-reports/index.ts:10-35,58-62`). (There is also a DB function `validate_api_token` in the same migration, `:74-95`, but `api-reports` validates inline rather than calling it. ⚠️ UNVERIFIED whether any other caller uses `validate_api_token`.)

**Attacker without valid client credentials:** cannot mint a token — both grant types fail closed with 401 (`:42-47`, `:58-63`). Client secret comparison is a plain equality match in SQL (`:36-38`); ⚠️ not a constant-time compare, but the value is a 64-hex random secret. **Attacker with a leaked `access_token`:** can call `api-reports` for `reports:read` data until the 1h expiry; with a leaked `refresh_token`, can rotate for up to 30 days. Revocation = set `api_clients.is_active=false` (admin UI toggle, `APIClients.tsx:91-98`) — both validation queries require an active client, so this immediately invalidates all of that client's tokens.

---

## Residual anon table reads (post-lockdown gap)

Two components rendered inside the **token-gated** `/review/[token]` site page still read tables directly with the anon key rather than through the scoped RPC:

- `SchematicDiagram` (Schematic tab, `PublicSiteReview.tsx:473`) reads `site_schematics`, `schematic_blocks`, `subsections`, `inspections` directly by `siteId` (`src/components/site/SchematicDiagram.tsx:680,702,712,721`). `site_schematics` / `schematic_blocks` carry `"Anyone can view ... USING (true)"` anon SELECT policies (`supabase/migrations/20260120132425...:34-37,55-58`).
- `AssetVerification` (Assets tab, `PublicSiteReview.tsx:478`) reads `site_assets`, `inspections`, `subsections` directly (`src/components/site/AssetVerification.tsx:57,72,87`).

⚠️ UNVERIFIED post-lockdown state: the tier-2 script (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`) demotes all anon `USING(true)` SELECT policies to authenticated-only across all tables except `settings`. If applied to production it would have removed the `site_schematics`/`schematic_blocks` anon SELECT and any anon SELECT on `subsections`/`inspections`/`site_assets`, in which case these two tabs would now fail to load for an anon reviewer (the page renders but those tabs error/empty). Whether these reads still succeed for anon depends on the live policy set, which must be checked against `pg_policies`. The `siteId` is passed straight from the (DB-scope-checked) page, so this is a correctness/availability concern, not a new IDOR.

---

## Open questions

1. **`"Public can select access_links for validation"` policy** — does it still exist in production, or did the 2026-06-11 tier-2 anon-read lockdown drop it? Its name matches the lockdown's drop criteria. (Non-breaking either way, since validation runs `SECURITY DEFINER`.)
2. **Anon reads on schematic/asset tabs** — after the tier-2 lockdown, can an anonymous `/review/[token]` visitor still load `site_schematics`, `schematic_blocks`, `site_assets`, `subsections`, `inspections` directly? If not, those tabs are broken for public reviewers and should be repointed to a scoped RPC. Cannot be resolved from migrations alone because the lockdown SQL lives outside `supabase/migrations/` and was applied via the SQL editor.
3. **`site-images` signed-URL minting for anon** — the portfolio view calls `createSignedUrl` on `site-images` as anon; effective behaviour depends on the live `public` flag and `storage.objects` policies (conflicting migrations: private at `20251017094000`, then blanket-public at `20251120083541`). Confirm against the live storage config.
4. **`/download/[requestId]` reachability** — is there any deployed or legacy producer that calls `putDownloadRequest` and navigates to this route, or is it fully dead in production? Current `src` has no caller.
5. **`validate_api_token` usage** — `api-reports` validates inline; is the DB function `validate_api_token` called by any other (possibly non-checked-in) consumer?
6. **Visitor gate bypass** — the `VisitorRegistrationGate` is purely client-side (`sessionStorage`, `VisitorRegistrationGate.tsx:35-44`) and the scoped RPCs are called *before/independently of* registration in some flows; the gate does not actually withhold data from a scripted anon client that calls the RPCs directly. Confirm whether withholding the data behind registration is a requirement (if so, the gate must move server-side).
