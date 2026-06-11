# Flow: QR-code public access (token-free subsection landing)

Ground truth from code, 2026-06-11. Traces the full QR-access path: an admin generates a labelled
QR image for a subsection → the QR encodes a **token-free** public URL → an anonymous phone scan
resolves (directly, or via the `qr-redirect` edge function) to `/public/subsections/[subsectionId]`
→ the `PublicSubsection` view renders a deliberately thin payload from the `get_public_subsection`
RPC. Includes the legacy nested URL shape, the `qr-redirect` name-fallback enumeration oracle, the
related token-gated public pages that share the public-RPC mechanism, and the **dead** scan-tracking
table.

Schema / route / RPC / edge-fn facts are cited from the earlier chapters rather than re-derived:
- `04-routes/public-token-and-root.md` (§5 `/public/subsections`, §6 legacy nested, §1–4 token pages)
- `05-edge-functions/qr-offline-reports-misc.md` (`qr-redirect`)
- `03-auth-and-access/token-systems.md` (Path 3 QR landing, Path 5 `qr-redirect`)
- `02-data-model/tables-04.md` / `rls-policies-04.md` (`qr_codes`, `qr_scans`)

---

## Actors & trust boundaries (one line each)

| Actor | Credential | Reaches |
|---|---|---|
| **Admin / authenticated user** | Supabase session, `ProtectedRoute`-gated `(admin)` group | QR generation + the QRCodes admin view |
| **Anonymous scanner** | none — only knowledge of a subsection UUID (printed in the QR) | `qr-redirect` edge fn + `/public/subsections/[id]` page + `get_public_subsection` RPC |
| **`qr-redirect` edge fn** | **service-role key** (RLS-bypassing), `verify_jwt = false` | `subsections` (+joined `sites`/`clients`) reads; returns only 302 / status strings |
| **`get_public_subsection` RPC** | `SECURITY DEFINER`, granted `anon`, RLS-bypassing | `settings`, `subsections`, `sites`, `document_categories`, `subsection_documents`, `snags` |

**Two trust boundaries are crossed token-free:** (1) the public QR page is reachable by anyone with a
UUID — there is **no `client_access_links` token** on this path (contrast Paths 1–4 below); (2) the
`qr-redirect` function runs RLS-bypassing service-role with no in-handler auth gate (output is bounded
to redirects). Both are by design; the residual risk is UUID-enumeration of subsection metadata +
document URLs (see Security flags).

---

## Phase A — QR generation (admin, authenticated)

### Step A1 — Trigger: subsection created, or "Generate All" pressed
- **On subsection create:** `useSubsectionDetail.ts:998-1005` calls
  `generateAndUploadQRCode({ subsectionId, siteName, subsectionName, logoUrl })` fire-and-forget
  (errors swallowed, dev-only log) right after the `subsections` INSERT (`:991-994`).
- **Bulk regen:** `QRAnalytics.tsx:58-63` loops every subsection on the site and calls the same
  `generateAndUploadQRCode` (`handleGenerateAll`, `:49-84`).
- **Actor/gate:** both callers live under the `(admin)` route group, which wraps children in
  `ProtectedRoute` (`src/app/(admin)/layout.tsx:11`). So generation is authenticated-only at the UI
  layer; the writes below are further gated by `subsections`/storage RLS (authenticated).

### Step A2 — Resolve the QR base URL
- `qrCodeGenerator.ts:19-22` reads `settings.qr_base_url` (`.single()`).
- Base URL precedence (`:27`): `settings.qr_base_url` → else `window.location.origin` → else hard-coded
  fallback `https://insight-linker-app.vercel.app`. Trailing slash stripped.
- **Reads:** `settings` (one row). ⚠️ note the production QR target is whatever `qr_base_url` holds;
  the `qr-redirect` edge fn separately hard-codes `https://watsonmattheus.com` (Step B3) — two
  independent sources of the public origin.

### Step A3 — Build the encoded URL (the load-bearing line)
- `qrCodeGenerator.ts:31`: `const qrTargetUrl = \`${baseUrl}/public/subsections/${subsectionId}\``.
- This is the **only** thing the QR encodes — a token-free `/public/subsections/<uuid>` URL. No token,
  no client/site nesting, no signature. Same construction in every QR surface:
  - `SiteSummaryReport.tsx:139` (`generateQRCodeBase64`) and `:186`
    (`sub.qr_code_url || \`${qrBaseUrl}/public/subsections/${sub.id}\``).
  - `QRCodes.tsx:275` (download dialog), `QRAnalytics.tsx:126` (zip/PDF) and `:301` (per-card preview),
    all `\`${baseUrl}/public/subsections/${id}\``.
  - `LabeledQRCode.tsx:66` renders whatever `url` prop it receives onto a canvas (`QRCode.toCanvas`).

### Step A4 — Render canvas (QR + logo overlay + site/subsection text labels)
- `qrCodeGenerator.ts:34-152`: 500px QR (`errorCorrectionLevel:'H'`), optional centred logo
  (`:70-118`), site name (uppercased, bold) + subsection name text below (`:120-144`), → PNG `Blob`.

### Step A5 — Upload PNG to storage, write back the public URL
- Upload: `qrCodeGenerator.ts:156-161` → bucket **`inspection-photos`**, path `qr-codes/<subsectionId>.png`,
  `upsert:true`.
- Public URL: `getPublicUrl('qr-codes/<file>')` (`:166-168`).
- **Write-back:** `subsections.update({ qr_code_url })` where `id = subsectionId` (`:171-174`).
- **Tables/storage touched:** storage bucket `inspection-photos` (write); `subsections.qr_code_url`
  (UPDATE).
- **Failure path:** any throw → caught (`:180-190`), logged, returns `null`; the bulk caller counts it
  as a fail and toasts a partial-success summary (`QRAnalytics.tsx:77-81`). The create-path caller
  ignores the failure entirely (subsection still created; QR simply absent until regenerated).

> **The generated PNG is the artifact; `subsections.qr_code_url` is the pointer.** There is **no**
> `qr_codes` table row written here — see "qr_codes table is orphaned" below. The QR image is stored
> in the public `inspection-photos` bucket, so the image itself (and the URL it encodes) is publicly
> fetchable by anyone with the storage URL.

### Step A6 — Admin QRCodes view (the "QRCodes view" / database)
- Route: `src/app/(admin)/qr-codes/page.tsx` → `QRCodes` view (`ProtectedRoute`-gated via `(admin)` layout).
- `QRCodes.tsx:68-92` lists subsections **with a non-null `qr_code_url`** (`from('subsections')
  …not('qr_code_url','is',null)`), joined to `sites`/`clients` for labels — i.e. it reads the
  `subsections` table directly (authenticated RLS), **not** a `qr_codes` table.
- Download dialog re-derives the encoded URL client-side (`:275`) and re-renders via `LabeledQRCode`.
- **This view is the only "QR database" surface; it shows generation/listing, not scans.**

---

## Phase B — Anonymous scan & resolution

A printed QR encodes one of two shapes. The current generator only ever produces shape (1); shapes
(2)/(3) exist to resolve **legacy** Firebase-era QR codes via the edge function.

### Step B1 — Scanner opens the encoded URL
1. **Current QR →** `https://<qr_base_url>/public/subsections/<uuid>` — resolves **directly** to the
   Next.js public page (Phase C). The `qr-redirect` edge fn is **not** in this path.
2. **Legacy / malformed QR →** points at the `qr-redirect` edge function (e.g. a Firebase
   `clients/Client/Site/Subsection` path, or a double-slashed `//public/subsections/<uuid>`), which
   302-redirects onto the public page.

### Step B2 — `qr-redirect` edge function entry (legacy path only)
- File: `supabase/functions/qr-redirect/index.ts`. **Auth:** `verify_jwt = false`
  (`supabase/config.toml:9-10`) → anon-reachable, **no in-handler auth check** of any kind
  (cf. `05-edge-functions/qr-offline-reports-misc.md` §qr-redirect).
- `OPTIONS` → CORS preflight short-circuit (`:11-13`); CORS is `Access-Control-Allow-Origin: '*'` (`:5`).
- Input `path`: query `?path=` preferred, else URL path with `/qr-redirect` prefix stripped (`:17`).
- **Client:** service-role — `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (`:56-58`). RLS-bypassing.
  Rationale comment (`:52-55`): tier-2 removed anon SELECT on `subsections`; this fn never returns row
  data, only an id for the redirect.

### Step B3 — Path classification → `subsections` lookup → 302
Hard-coded redirect origin `appOrigin = 'https://watsonmattheus.com'` (`:32`, `:61`, `:85`, `:111`, `:153`).
| Branch | Match | Reads | Result |
|---|---|---|---|
| Malformed `//public/subsections/<uuid>` | prefix + UUID regex (`:27-31`) | none | 302 → `/public/subsections/<uuid>` (`:33-41`) |
| Missing/empty path | `:45` | none | `400 "Missing path parameter"` |
| UUID | regex `:23`,`:65` | `subsections.select('id').eq('id',…).single()` (`:70-74`) | 302 if found (`:85-93`); `404 "Subsection not found"` if not (`:76-82`) |
| Firebase id | `:103-107` | `subsections.select('id,name,site_id, sites(name,client_id,clients(name))').eq('firebase_id',cleanPath).single()` | 302 → `/public/subsections/<id>` (`:111-119`) |
| **Name fallback** | `pathParts.length ≥ 3` (`:123`) | `subsections.select(...).ilike('name','%<subsectionName>%')` then JS filter on joined site/client names (`:130-149`) | 302 on match (`:151-161`); `404` on no match (`:165-168`); `500` on query error (`:135-140`) |
| Uncaught throw | `:171-178` | — | `500 {error}` JSON |

- **Side effects:** reads `subsections` (3 query shapes) only. **No writes, no storage, no scan log,
  no other fn.** Returns only `Location` headers / plain-text status — **no subsection row body is ever
  serialized** (cf. `token-systems.md` Path 5).
- **Enumeration oracle:** the name-fallback `ilike` scans **all** subsections via the service-role key
  and the 302-vs-404 outcome (plus the redirect target UUID) lets an unauthenticated caller probe
  which subsections exist by name/site/client and learn a valid `subsection_id`
  (`qr-offline-reports-misc.md` §qr-redirect Security check; `token-systems.md` Path 5).

### Step B4 — Browser lands on the public page
Either directly (B1.1) or after the 302 (B3) the browser is now at
`/public/subsections/<subsectionId>` → Phase C. Note B3 always redirects to the **`watsonmattheus.com`**
origin regardless of which origin issued the original QR.

---

## Phase C — `PublicSubsection` view renders (token-free)

### Step C1 — Route → view, no guard, no token
- Page: `src/app/public/subsections/[subsectionId]/page.tsx` → `PublicSubsection` view
  (3-line `"use client"` wrapper, `04-routes/public-token-and-root.md` §5).
- **No route group, no `layout.tsx`, no middleware** → no auth guard, no `ProtectedRoute`. The only gate
  is the server RPC (`04-routes/public-token-and-root.md` §preamble + §5).
- **Legacy nested form** `/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]`
  (`04-routes` §6) renders the **same** view; the `clientId`/`siteId` path params are **decorative** —
  the view reads only `subsectionId` (`PublicSubsection.tsx:64`), so a mismatched client/site with a
  valid subsection id still resolves. Identical exposure to §5.

### Step C2 — Mount: single RPC, no signOut, no visitor gate
- `PublicSubsection.tsx:72-76` → `fetchPublicData()` keyed on `subsectionId`. **No `auth.signOut`, no
  `VisitorRegistrationGate`, no `validate_access_link`** (contrast the token pages, §below).
- `:82-83`: `supabase.rpc('get_public_subsection', { p_subsection_id: subsectionId })`. Verified the
  view has **no direct `.from()` table reads** — only this RPC (`04-routes` §5; `token-systems.md` Path 3).

### Step C3 — `get_public_subsection` RPC executes (the server gate)
- Definition: `supabase/migrations/20260610113000_public_rpcs_phase1.sql:22-50`.
  `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`; `REVOKE ALL … FROM PUBLIC` then
  `GRANT EXECUTE … TO anon, authenticated` (`:49-50`). RLS-bypassing by `SECURITY DEFINER`.
- Returns `NULL` if no subsection with that id exists (`:24-25`), else `jsonb_build_object` of:
  - `settings` → `{company_name, company_logo_url}` (branding only) (`:27-28`)
  - `subsection` → **`{id, name, tenant_name}` only** (`:29-30`) — no meter serial, no CT ratio, no
    coc fields, no metering status
  - `site` → **`{id, name}` only** (`:31-32`) — no address, no client PII
  - `categories[]` → `document_categories` each with `subsection_documents[]` incl. **`file_url`**
    (`:33-41`)
  - `snags[]` → `{id, title, description, status, risk_level, created_at}` (`:42-45`)
- **Deliberately thinner than the token-gated subsection review** (no inspection `json_data`, no
  signatures, no floor plans, no meter/CT detail) — `token-systems.md` Path 3.

### Step C4 — Render
- `PublicSubsection.tsx:95-122` maps the payload into state: branding (`:97-99`), subsection/site
  (`:101-102`), documents grouped by category filtering empty categories (`:104-114`), snags (`:116`).
- UI (`:195-374`): hero (site + subsection name), status card with open-snag severity breakdown
  (client-side `normalizeSnagStatus`, `:170-183`), document categories with **View** (`window.open(url)`,
  `:124-126`) and **Download** (`fetch(url)` → blob, `:128-144`) buttons, company-branded footer.
- **`file_url`s are rendered as live links** — anyone on the page can open/download every document.

### Step C5 — Error / empty / offline paths
- RPC error → `console.error`, returns early, `loading=false` (`:85-88`).
- `data === null` (subsection absent, or RPC returned NULL) → `console.error`, early return → the
  `!subsection || !siteData` branch shows a plain **"Subsection not found"** card (`:90-93`, `:157-167`).
  (This is also the response shape for an anonymous caller hitting a non-existent UUID — a soft 200 page,
  not a 404.)
- While the RPC is in flight → spinner (`:146-155`).
- **Offline:** no offline handling in this view — it is an online-only public web page (no service-worker
  data cache referenced here; the RPC call simply fails → "Subsection not found"). ⚠️ UNVERIFIED whether
  the app-level PWA service worker caches this route.

---

## Scan tracking — present in schema, **dead in code**

The task names `qr_scans` + "QRAnalytics" as the scan-tracking surface. Ground truth: **scan tracking
is not wired up.**

- **Table exists:** `qr_scans` is CREATEd in `supabase/migrations/20251014140001_…sql:2-10`
  (`id, subsection_id, scanned_at, scanned_by, ip_address, user_agent, created_at`), RLS enabled
  (`:12`), with policies **`Authenticated users can view scans`** (`FOR SELECT USING auth.role()=
  'authenticated'`, `:14-16`) and **`Anyone can insert scans`** (`FOR INSERT WITH CHECK(true)`, no
  `TO` clause → public incl. anon, `:18-20`). Documented in `tables-04.md` §`public.qr_scans` /
  `rls-policies-04.md`.
- **No code ever inserts a scan.** Repo-wide grep: the only `qr_scans` references in app code are two
  **DELETE-on-teardown** cascades (`SiteDetail.tsx:367`, `useSubsectionDetail.ts:1056`,
  `delete().eq('subsection_id', …)`). No `.insert('qr_scans')` anywhere in `src`; the `qr-redirect`
  edge fn writes nothing; `PublicSubsection` writes nothing. So the "Anyone can insert scans" policy is
  never exercised — **scan counts are always zero**.
- **`QRAnalytics.tsx` does not read scans.** Despite the name, the component (`src/components/site/
  QRAnalytics.tsx`) only generates/downloads QR images (Generate All / Download All zip+PDF). It has
  **no `qr_scans` read** and shows no scan analytics. There is no scan-count UI anywhere in code.

> **Doc cross-check / discrepancy.** `rls-policies-04.md:102-104` states "**No such table exists** …
> within ground-truth DDL it is absent" and marks `qr_scans` ⚠️ UNVERIFIED. That is **contradicted** by
> migration `20251014140001_…sql:2-20`, which I read directly — the table and both policies *do* exist
> in the tracked migrations, consistent with `tables-04.md:275-300`. Ground truth here is the migration.
> (Recorded as an open question for the GAPS owner to reconcile the two data-model docs.)

## `qr_codes` table is orphaned

- The `qr_codes` table appears in generated `types.ts:2105-2161` (`id, client_id, site_id,
  subsection_id, label, qr_code_url, created_by, …`) and is described in `tables-04.md` /
  `rls-policies-04.md`, **but no `CREATE TABLE public.qr_codes` exists in any tracked migration**
  (grep of `supabase/migrations` returns nothing) and **no app code reads or writes it** (grep of
  `src` for `from('qr_codes')` returns nothing — only the `types.ts` type def). The live QR pointer is
  `subsections.qr_code_url`, not a `qr_codes` row. ⚠️ UNVERIFIED whether `qr_codes` was created directly
  in the dashboard; within tracked DDL + app code it is unused/orphaned.

---

## Related public pages that share the public-RPC mechanism (token-GATED, for contrast)

These are **not** the QR path (the QR path is token-free), but they share the
`SECURITY DEFINER` + `GRANT anon` public-RPC pattern and are documented here so the QR path's *absence*
of a token is unambiguous. Full detail: `04-routes/public-token-and-root.md` §1–4, `token-systems.md`
Paths 1–2.

| Route | View | Server gate (RPC) | Token store |
|---|---|---|---|
| `/portfolio/[token]` | `PublicClientPortfolio` | `validate_access_link` + `get_public_portfolio(p_token)` (`public_rpcs_phase1.sql:53-77`) | `client_access_links` (`link_type='client'`) |
| `/portfolio/[token]/site/[siteId]` & `/review/[token]` | `PublicSiteReview` | `get_public_site_review(p_token,p_site_id)` (scope re-checked server-side) | `client_access_links` |
| `/review/[token]/subsection/[subsectionId]` | `PublicSubsectionReview` | `get_public_subsection_review(p_token,p_subsection_id)` | `client_access_links` |

- Each of these calls `validate_access_link(token)` on mount (bumps `last_accessed_at`/`access_count`),
  runs `signOut({scope:'local'})` to clear stale sessions, and renders a `VisitorRegistrationGate`
  (lead-capture only, **not** an access control — the scoped payload is fetched before the gate renders;
  `token-systems.md` §"Visitor registration gate", `04-routes` §Security summary #3).
- **The QR page (`/public/subsections/[id]`) does NONE of these** — no token, no `validate_access_link`,
  no `signOut`, no visitor gate. Its scope is fixed to the single `subsectionId` in the URL and its
  payload is the thinner `get_public_subsection` (no inspections/meter/signatures), so it is both
  weaker-gated (no token) and lower-exposure (thinner payload) than the token pages.

---

## Data integrity / trust boundaries

1. **Token-free read crossing.** `/public/subsections/[id]` (and its legacy nested form) is gated
   **only by knowledge of the subsection UUID** — there is no `client_access_links` token on this path
   (`PublicSubsection.tsx:72-83`; RPC granted `anon`, `public_rpcs_phase1.sql:50`). A leaked/guessed/
   enumerated UUID exposes the thin payload (subsection name+tenant, parent site name, **all document
   `file_url`s**, all snags) to anyone, with no rate-limit visible in code.
2. **Service-role with no auth gate (`qr-redirect`).** The function runs RLS-bypassing service-role and
   `verify_jwt=false` with no in-handler check (`index.ts:56-58`, `config.toml:9-10`). Output is bounded
   to 302/status strings (no row body), so the privilege does not directly leak data — but the
   name-fallback `ilike` over **all** subsections (`index.ts:130-149`) is an unauthenticated enumeration
   oracle (existence + valid UUID).
3. **Document URLs are public objects.** `file_url`s returned by the RPC and the QR PNG itself
   (`inspection-photos/qr-codes/<id>.png`, public bucket, `qrCodeGenerator.ts:166-168`) are
   directly fetchable; once a UUID is known, document confidentiality depends on the storage object URLs
   not being further protected. ⚠️ UNVERIFIED storage-object access policy for `subsection_documents`
   `file_url`s post-lockdown (defer to `02-data-model/triggers-enums-storage.md`).
4. **No scan audit.** Because nothing inserts `qr_scans`, there is **no audit trail of who scanned what**
   — the IP/user-agent capture the table was designed for is never populated. Any claim of "scan
   analytics" in the product is unbacked by code.
5. **Two public-origin sources can diverge.** QR encodes `settings.qr_base_url`
   (`qrCodeGenerator.ts:27`) while `qr-redirect` 302s to hard-coded `watsonmattheus.com`
   (`index.ts:32`). If `qr_base_url` ≠ `watsonmattheus.com`, current QR codes and legacy-redirected QR
   codes land on different origins (correctness, not security).
6. **Non-existent UUID returns a soft 200 page, not a 404** (`PublicSubsection.tsx:90-93,157-167`) —
   the only hard 404 in the flow is from `qr-redirect` (`index.ts:78,166`). Differentiating existence
   from outside is still possible via the redirect oracle (point 2).

---

## security_flags

(Severity ordering: LOW/INFO — the QR path is deliberately token-free with a thin payload; the dominant
risk is enumeration, not privilege escalation. The `create-user-admin` class — privileged write reachable
without auth — is **absent** here: every write path (`qr_code_url`, storage) is authenticated-only, and
the anon-reachable surfaces are read/redirect only.)

1. **LOW/INFO — `/public/subsections/[id]` (`PublicSubsection.tsx:82-83` + `get_public_subsection`,
   `public_rpcs_phase1.sql:22-50`):** unauthenticated, **token-free** data read. Any valid subsection
   UUID exposes subsection name+tenant, parent site name, all document `file_url`s, and all snags to
   anyone — no token, no rate-limit in code. Bounded by thin payload + UUID unguessability (by design;
   matches `04-routes` §Security summary #1).
2. **LOW — `qr-redirect` name-fallback enumeration oracle (`index.ts:130-149`):** service-role `ilike`
   scan across **all** subsections + 302-vs-404 outcome lets an anonymous caller probe subsection/site/
   client existence and learn a valid `subsection_id`. Unauthenticated enumeration over the full table
   via a privileged key (matches `qr-offline-reports-misc.md` §qr-redirect).
3. **LOW — service-role edge fn with no in-handler auth (`index.ts:56-58`, `config.toml:9-10`):**
   `qr-redirect` runs RLS-bypassing with `verify_jwt=false` and zero in-handler gate. Mitigated: every
   code path returns only `Location`/status (no row body). Flagged as a trust-boundary note, not an
   active leak.
4. **INFO — public QR image + document objects in public storage (`qrCodeGenerator.ts:156-168`):** QR
   PNGs and `subsection_documents.file_url`s are publicly fetchable; once a UUID is known, document
   confidentiality rests on the storage URLs. ⚠️ UNVERIFIED storage object policy post-lockdown.
5. **INFO — dead scan tracking (`qr_scans` migration `20251014140001:2-20`; no inserts repo-wide):** the
   `Anyone can insert scans` anon-INSERT policy exists but is never exercised; no audit trail of scans is
   produced. Not exploitable, but a control the schema implies and the code never delivers.
6. **INFO — orphaned `qr_codes` table (`types.ts:2105-2161`; no CREATE migration, no app reads/writes):**
   present in generated types but absent from tracked DDL and unused by code. ⚠️ UNVERIFIED whether it
   exists in the live DB.
