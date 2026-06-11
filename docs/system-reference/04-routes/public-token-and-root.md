# Routes: public / tokenized / root (no auth group)

Ground truth from code, 2026-06-11. Covers every route that lives **outside** the three
authenticated route groups (`(admin)`, `(client-portal)`, `(contractor)`) and is reachable
without a Supabase auth session: the token-gated review/portfolio pages, the token-free QR
landing pages, the local-only download handoff, the PWA install page, and the root `page.tsx`.

**No route group, no layout guard.** None of these routes sits under a parenthesised route
group, so none inherits a `ProtectedRoute` / role-gated `layout.tsx`. Verified: there is **no**
`layout.tsx` under `app/portfolio`, `app/public`, `app/review`, `app/download`, or `app/install`
(find returned nothing). The only layout in the chain is the global
`src/app/layout.tsx` (`:32-49`), which just wraps children in `Providers` (theme / query client /
auth context) and applies no access control. There is **no Next.js middleware** anywhere in the
app. So for every route below, client-side access control is whatever the **view** does on mount,
and server-side control is **Supabase RLS + `SECURITY DEFINER` RPCs only**.

**Every page file is a 3-line `"use client"` wrapper** that renders one view from `src/views/`
(verified for all 10 page files). The view is where every read, write, redirect, and gate lives.

**Token mechanics are documented once, authoritatively, in
`03-auth-and-access/token-systems.md`.** This route doc names the gate per route and cites the
view-side calls; for the full RPC bodies, scope-check SQL, RLS policy names, and the storage-
bucket analysis, defer to that file (cross-references inline). The token store is
`client_access_links`; the anon-callable validator is `validate_access_link(token)`
(`SECURITY DEFINER`, bumps tracking, granted `anon`); the scoped payload RPCs are all
`SECURITY DEFINER` granted `anon` and enforce token→data scope in SQL.

---

## 1. `/portfolio/[token]` — `PublicClientPortfolio` view

| | |
|---|---|
| Page | `src/app/portfolio/[token]/page.tsx:2-3` → renders `@/views/PublicClientPortfolio` |
| View | `src/views/PublicClientPortfolio.tsx` |
| Group / guard | **None** (no route group, no layout). Token-gated in-view only. |

**Access context & guard.** Public client-portfolio link. The URL token is the only credential.
- Client-side: on mount the view runs `supabase.auth.signOut({ scope:'local' }).catch(()=>{}).finally(fetchData)` (`PublicClientPortfolio.tsx:55`) to clear any stale session so the anon RPC runs cleanly. It calls `validate_access_link` (`:71`), requires a non-empty result with `is_valid` **and** `link_type === "client"` with non-null `client_id` (`:101`), else shows "not a client portfolio link". A `VisitorRegistrationGate` renders when `getVisitorSession(link_id)` is false (`:182`) — UX/lead-capture only, **not** an access control (see §11).
- Server-side: gated by `get_public_portfolio(p_token)` (`SECURITY DEFINER`, granted `anon`), which returns `NULL` unless `_share_link(token)` is live **and** the link's `client_id IS NOT NULL` — keying strictly off `v_link.client_id`. Full RPC body + scope SQL: `token-systems.md` §"Path 2". The anon-callable `validate_access_link` is `SECURITY DEFINER` and bypasses RLS; it does not depend on any anon SELECT policy on `client_access_links`.
- Attacker with the URL sees: client company name/logo, every site under that client, per-site subsection + open-snag aggregate counts, and (via the public `site-images` bucket) site images. Cannot see drill-down detail from this RPC, nor any other client's portfolio.

**Data reads**
| What | Table / RPC / bucket | Line |
|---|---|---|
| Token validation (bumps `last_accessed_at` / `access_count`) | `rpc('validate_access_link', { token })` | `PublicClientPortfolio.tsx:71` |
| Portfolio payload (settings, client, sites[] with counts) | `rpc('get_public_portfolio', { p_token })` | `PublicClientPortfolio.tsx:108` |
| Signed URL per `site_image_url` | storage `site-images` `createSignedUrl(path, 3600)` | `PublicClientPortfolio.tsx:135-136` |

**Data writes / mutations**
| What | Op | Line |
|---|---|---|
| Tracking bump (server-side, inside the RPC) | `client_access_links` UPDATE via `validate_access_link` | RPC body, see `token-systems.md` |
| Visitor registration row (only if the gate is submitted) | `access_link_visitors` INSERT (anon `WITH CHECK(true)`) | `VisitorRegistrationGate.tsx:89-97` |

No table writes originate in this view directly; the only inserts are inside the RPC and inside the gate component.

**Notes.** The `AbortController` 15s timeout (`:66`) is built but `controller.signal` is never passed to the RPC call, so it is dead (no timeout fires). Site-image visibility for anon depends on live `site-images` bucket `public` flag + storage policies — conflicting migrations; **⚠️ UNVERIFIED** against live storage (see `token-systems.md` Open Q #3).

---

## 2. `/portfolio/[token]/site/[siteId]` — `PublicSiteReview` view (portfolio drill-down)

| | |
|---|---|
| Page | `src/app/portfolio/[token]/site/[siteId]/page.tsx:2-3` → `@/views/PublicSiteReview` |
| View | `src/views/PublicSiteReview.tsx` (**same view** as route §3) |
| Group / guard | None. Token-gated in-view. |

**Access context & guard.** Renders the **same** `PublicSiteReview` view as `/review/[token]`; the
view reads both `token` and `siteId` from `useParams()` (`PublicSiteReview.tsx:113`). The
URL-supplied `siteId` is the drill-down target. It is **safe** because the server RPC re-checks
scope: `targetSiteId = routeSiteId || link.site_id` (`:180`) is passed to
`get_public_site_review`, whose scope check rejects any site outside the token's
`client_id`/`site_id` (closes the cross-tenant IDOR — `token-systems.md` §"Path 2" / Vuln 7). A
client-token holder can only reach sites under their `client_id`; guessing another `siteId`
returns `null`. See §3 for the full reads/writes (identical view).

---

## 3. `/review/[token]` — `PublicSiteReview` view (site review)

| | |
|---|---|
| Page | `src/app/review/[token]/page.tsx:2-3` → `@/views/PublicSiteReview` |
| View | `src/views/PublicSiteReview.tsx` |
| Group / guard | None. Token-gated in-view. |

**Access context & guard.** Public site-review link (`link_type='site'`, or a `client` link that
redirects).
- Client-side: mount runs `signOut({scope:'local'}).catch().finally(validateAndFetchData)` (`PublicSiteReview.tsx:137`). `validate_access_link` (`:148`); empty / `!is_valid` → "invalid or has expired". If `link_type==='client'` and no `routeSiteId`, **redirects** to `/portfolio/{token}` (`:164-165`). `VisitorRegistrationGate` renders if no visitor session (`:275`) — soft gate only.
- Server-side: `get_public_site_review(p_token, p_site_id)` (`SECURITY DEFINER`, granted `anon`). Scope SQL: if the link is client-scoped, the target site's `client_id` must equal `v_link.client_id`; if site-scoped, `p_site_id` must equal `v_link.site_id`; else `RETURN NULL`. Full body: `token-systems.md` §"Path 2".
- Attacker with the URL sees: the full compliance dataset for one in-scope site — site metadata, every subsection (incl. meter serials, metering status), all snags, all site + subsection documents (`file_url`), and every inspection's raw `json_data`. After the visitor gate, also the Schematic + Assets tabs (residual anon table reads — see Security check). Cannot see any site outside the token scope.

**Data reads**
| What | Table / RPC / bucket | Line |
|---|---|---|
| Token validation | `rpc('validate_access_link', { token })` | `PublicSiteReview.tsx:148` |
| Site payload (settings/site/client/subsections/snags/docs/inspections) | `rpc('get_public_site_review', { p_token, p_site_id })` | `PublicSiteReview.tsx:184` |
| **Schematic tab** — direct anon table reads (not via RPC) | `site_schematics`, `schematic_blocks`, `subsections`, `inspections` by `siteId` | `SchematicDiagram.tsx:679-723` (mounted at `PublicSiteReview.tsx:473`) |
| **Assets tab** — direct anon table reads (not via RPC) | `site_assets`, `inspections`, `subsections` via `useQuery` | `AssetVerification.tsx:56-90` (mounted at `PublicSiteReview.tsx:478`) |

**Data writes / mutations**
| What | Op | Line |
|---|---|---|
| Tracking bump (server-side) | `client_access_links` UPDATE via `validate_access_link` | RPC body |
| Visitor registration (gate submit only) | `access_link_visitors` INSERT | `VisitorRegistrationGate.tsx:89-97` |

No direct write originates from this view.

**Security check / notes.** `SchematicDiagram` is passed `accessToken={token}` (`PublicSiteReview.tsx:473`) but its `loadData()` ignores that prop and queries tables directly by `siteId` with the anon key (`SchematicDiagram.tsx:679-723`); `AssetVerification` likewise reads tables directly. These bypass the scoped RPC. They are **not** a new IDOR — `siteId` is the same DB-scope-checked id the page already resolved — but they depend on anon `USING(true)` SELECT policies on `site_schematics`/`schematic_blocks`/`subsections`/`inspections`/`site_assets`. If the 2026-06-11 tier-2 anon-read lockdown demoted those policies, these two tabs break (correctness/availability regression). **⚠️ UNVERIFIED** post-lockdown (see `token-systems.md` §"Residual anon table reads" and Open Q #2). → security_flag.

---

## 4. `/review/[token]/subsection/[subsectionId]` — `PublicSubsectionReview` view

| | |
|---|---|
| Page | `src/app/review/[token]/subsection/[subsectionId]/page.tsx:2-3` → `@/views/PublicSubsectionReview` |
| View | `src/views/PublicSubsectionReview.tsx` |
| Group / guard | None. Token-gated in-view. |

**Access context & guard.** Token-scoped subsection deep-link.
- Client-side: mount runs `signOut({scope:'local'}).catch().finally(validateAndFetchData)` when both `token` and `subsectionId` exist (`PublicSubsectionReview.tsx:130-133`). `validate_access_link` (`:144`) for gate/redirect; invalid → error. `VisitorRegistrationGate` at `:317`.
- Server-side: `get_public_subsection_review(p_token, p_subsection_id)` (`SECURITY DEFINER`, granted `anon`). Resolves the subsection's `site_id`+`client_id`, then requires it be inside the token's client / site / subsection scope, else `RETURN NULL` (closes Vuln 6). Full body: `token-systems.md` §"Path 1 → subsection review".
- Attacker with the URL sees: everything about one in-scope subsection — meter serial / CT ratio, every document `file_url`, all snags incl. rectification notes, and full inspection reports (embedded photos, tenant meter detail, signer names/types/dates). Cannot see any subsection whose site is outside the token scope.

**Data reads**
| What | Table / RPC | Line |
|---|---|---|
| Token validation | `rpc('validate_access_link', { token })` | `PublicSubsectionReview.tsx:144` |
| Subsection payload (incl. inspections with `json_data`, `template_sections`, `signatures`, floor_plans) | `rpc('get_public_subsection_review', { p_token, p_subsection_id })` | `PublicSubsectionReview.tsx:169` |

The view reshapes the inspection payload into the report dialog **purely client-side** with no second read (`:276-292`).

**Data writes / mutations**
| What | Op | Line |
|---|---|---|
| Tracking bump (server-side) | `client_access_links` UPDATE via `validate_access_link` | RPC body |
| Visitor registration (gate submit only) | `access_link_visitors` INSERT | `VisitorRegistrationGate.tsx:89-97` |

No direct write originates from this view.

---

## 5. `/public/subsections/[subsectionId]` — `PublicSubsection` view (QR landing, **no token**)

| | |
|---|---|
| Page | `src/app/public/subsections/[subsectionId]/page.tsx:2-3` → `@/views/PublicSubsection` |
| View | `src/views/PublicSubsection.tsx` |
| Group / guard | None. **No token at all** — gated only by knowledge of the `subsectionId` UUID. |

**Access context & guard.** This is the QR-code target, built as
`{baseUrl}/public/subsections/{id}` (`src/lib/qrCodeGenerator.ts:31`,
`src/components/SiteSummaryReport.tsx:139`, `:186`). There is **no** `client_access_links` token
here.
- Client-side: mount calls `fetchPublicData()` keyed on `subsectionId` (`PublicSubsection.tsx:73-76`). **No `signOut`, no visitor gate, no validation step.**
- Server-side: the only gate is `get_public_subsection(p_subsection_id)` (`SECURITY DEFINER`, REVOKEd from PUBLIC then granted `anon, authenticated`). Returns `NULL` for a non-existent subsection; otherwise a deliberately **thinner** payload than the token-gated subsection review: branding, subsection `id/name/tenant_name`, parent site `id/name`, document categories + `subsection_documents` (incl. `file_url`), and snags. **No** meter serials, CT ratio, inspection `json_data`, signatures, or floor plans. Full body: `token-systems.md` §"Path 3".
- Attacker with the URL (or who guesses/enumerates a UUID) sees: subsection name + tenant, parent site name, all document `file_url`s by category, and all snags. Because **there is no token**, any valid subsection UUID is viewable by anyone — the only protection is UUID unguessability.

**Data reads**
| What | Table / RPC | Line |
|---|---|---|
| Public subsection payload | `rpc('get_public_subsection', { p_subsection_id })` | `PublicSubsection.tsx:83` |

Verified: the view has **no** direct `.from()` table reads — only this single RPC call (grep). This is the post-lockdown design: QR scans resolve through the scoped RPC, not direct anon table reads.

**Data writes / mutations.** None.

**Security check.** Token-free by design. Exposure is bounded to the thin RPC payload above and gated only by UUID secrecy → security_flag (low: deliberate, thin payload, but document `file_url`s + tenant name leak to anyone with a UUID, no rate-limit visible in code).

---

## 6. `/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]` — `PublicSubsection` view (legacy nested QR URL)

| | |
|---|---|
| Page | `src/app/public/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx:2-3` → `@/views/PublicSubsection` |
| View | `src/views/PublicSubsection.tsx` (**same view** as §5) |
| Group / guard | None. No token. |

**Access context & guard.** Legacy nested QR URL shape. The view reads **only** `subsectionId`
from `useParams()` (`PublicSubsection.tsx:64`); `clientId` and `siteId` in the URL are
**decorative** — never read, never used in any query (verified: no `clientId`/`siteId` reference in
the view). So this route behaves **identically** to §5 and is gated identically by
`get_public_subsection`. The path params are not validated against the subsection, so a mismatched
`clientId`/`siteId` with a valid `subsectionId` still resolves the subsection. Same reads/writes/
exposure as §5.

---

## 7. `/download/[requestId]` — `DownloadHandoff` view (local-only handoff, **no server state**)

| | |
|---|---|
| Page | `src/app/download/[requestId]/page.tsx:2-3` → `@/views/DownloadHandoff` |
| View | `src/views/DownloadHandoff.tsx` |
| Group / guard | None. **No server token and no DB** — `requestId` keys a browser IndexedDB record only. |

**Access context & guard.** `requestId` (from `useParams()`, `DownloadHandoff.tsx:30`) keys a record
in a browser IndexedDB store (`wm-download-handoff` / `requests`, `src/lib/downloadHandoff.ts:17-18`).
The view polls IndexedDB up to `MAX_POLL_ATTEMPTS=60 × POLL_INTERVAL_MS=500ms`
(`DownloadHandoff.tsx:9-10`, loop `:46-55`) for a `{ fileName, blob?, url? }` record, then triggers
a top-level download and deletes the record (`:91`, `:102`). The record is purely local to the
originating browser and meaningless on any other device (producer keys are `crypto.randomUUID()`,
`downloadHandoff.ts:223`).

**Data reads.** IndexedDB only — `getDownloadRequest(requestId)` (`DownloadHandoff.tsx:47`). No Supabase, no table, no RPC.

**Data writes / mutations.** IndexedDB only — `deleteDownloadRequest` after consuming/expiring (`:91`, `:102`). No server mutation.

**Notes.** Effectively a **dead route** in current `src`: the IndexedDB writer `putDownloadRequest`
(`downloadHandoff.ts:152`) is **not exported** (verified — `getDownloadRequest`/`deleteDownloadRequest`/
`createPendingDownloadHandoff` are exported, `putDownloadRequest` is not) and called nowhere; no code
navigates to `/download/...`. The live download flow uses `createPendingDownloadHandoff()` +
`window.open` (`downloadHandoff.ts:210-271`) and never visits this route. Visiting
`/download/{anything}` therefore polls an empty store for ~30s and shows
"This download request expired before the file payload arrived" (`DownloadHandoff.tsx:59`).
**⚠️ UNVERIFIED** whether any legacy/deployed producer ever wrote here (see `token-systems.md` Open Q #4).

**Security check.** Attacker with the URL sees **nothing** — there is no server state behind `requestId`; the only data is the originating browser's IndexedDB. No flag.

---

## 8. `/install` — `Install` view (PWA install page)

| | |
|---|---|
| Page | `src/app/install/page.tsx:2-3` → `@/views/Install` |
| View | `src/views/Install.tsx` |
| Group / guard | None. Fully public, no token, **no backend interaction**. |

**Access context & guard.** A static PWA install-prompt page. No auth, no token, no DB. It listens
for the `beforeinstallprompt` event (`Install.tsx:35`), detects iOS / standalone display mode
(`:20-25`), and on button click calls `deferredPrompt.prompt()` (`:43`). All state is local
component state; renders platform-specific install instructions.

**Data reads.** None (no Supabase import).
**Data writes / mutations.** None.
**Security check.** No data path; nothing to expose. No flag.

---

## 9. Root `/` — `Index` view (auth-based redirect dispatcher)

| | |
|---|---|
| Page | `src/app/page.tsx:2-3` → `@/views/Index` |
| View | `src/views/Index.tsx` |
| Group / guard | None (root). Self-redirects based on session + role. |

**Access context & guard.** The root page is a client-side redirect dispatcher, not a content page.
On mount (`Index.tsx:8-31`):
1. `supabase.auth.getSession()` (`:10`).
2. **No session** → `navigate("/auth")` (`:27`).
3. **Session present** → reads the user's own role: `from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle()` (`:13-17`), then routes: `role==="Client"` → `/client-portal` (`:20`); `role==="Contractor"` → `/contractor` (`:22`); **else** (Admin / User / Moderator / no role row) → `/dashboard` (`:24`).

While resolving it renders a spinner only. This is a pure client-side router redirect; the **real**
access control lives in the destination route groups' layouts (`ProtectedRoute` etc. — see
`03-auth-and-access/access-contexts-and-roles.md`). It does not itself expose any tenant data.

**Data reads**
| What | Table | Line |
|---|---|---|
| Current session | `auth.getSession()` | `Index.tsx:10` |
| Own role (self `user_id` only) | `user_roles` `.maybeSingle()` | `Index.tsx:13-17` |

**Data writes / mutations.** None.

**Security check.** The `user_roles` read is scoped to `eq("user_id", session.user.id)` — own row
only — so it leaks no other user's role. RLS on `user_roles` governs the actual read (see
`02-data-model` / `03-auth-and-access`). The role-based redirect is **client-side only and not a
security boundary**: a user who manually navigates to `/dashboard` (or any group route) is gated by
that group's layout guard + RLS, not by this dispatcher. No new flag (the redirect is convenience,
not enforcement; the enforcement gap, if any, belongs to the destination layouts).

---

## 10. Global layout `src/app/layout.tsx`

Not a route, but the parent of all of the above. `RootLayout` (`layout.tsx:32-49`) renders
`<Providers>{children}</Providers>` (`:45`) and sets PWA metadata / viewport / icons (`:5-43`).
It applies **no** auth check, role check, or redirect. All access control is delegated to route-
group layouts (for the authenticated groups) or to the views themselves (for the public/token
routes documented here).

---

## Security summary (for this route set)

1. **`/public/subsections/[subsectionId]` (and its legacy nested form) is token-free.** Any valid
   subsection UUID is publicly readable via `get_public_subsection` — document `file_url`s, tenant
   name, and snags leak to anyone who knows/guesses a UUID, with no token and no rate-limit visible
   in code. Payload is deliberately thin (no inspections/meter/signatures), and the QR redirect
   path is an existence oracle, so severity is bounded — but it is an unauthenticated data read by
   design. → flag (low/info).
2. **Residual direct anon table reads on the `/review/[token]` Schematic + Assets tabs.**
   `SchematicDiagram` (`SchematicDiagram.tsx:679-723`) and `AssetVerification`
   (`AssetVerification.tsx:56-90`) query `site_schematics`/`schematic_blocks`/`site_assets`/
   `subsections`/`inspections` directly with the anon key instead of through the scoped RPC,
   bypassing `get_public_site_review`. Not a new IDOR (`siteId` is already scope-checked), but it
   depends on anon `USING(true)` SELECT policies the tier-2 lockdown targets; **⚠️ UNVERIFIED**
   whether these still resolve for anon post-lockdown (availability regression risk). → flag.
3. **Visitor registration gate is not an access control.** In all three token-gated views the
   scoped RPC payload is fetched and stored in state **before** the gate's render condition is
   evaluated, so a scripted anon client can call `get_public_portfolio` /
   `get_public_site_review` / `get_public_subsection_review` directly and never touch the gate
   (see `token-systems.md` §"Visitor registration gate"). The gate writes
   `access_link_visitors` (anon `INSERT WITH CHECK(true)`) and a `sessionStorage` flag only. → flag
   (the gate withholds nothing from a scripted client).
4. **Root `/` and `Index` role redirect is client-side convenience, not enforcement.** Server-side
   protection of destination routes lives in the route-group layouts + RLS, not here. Noted, not a
   standalone flag for this route.

All token RPC bodies, RLS policy names, the `site-images` bucket-public conflict, and the dead
`/download` route analysis are documented in full in
`03-auth-and-access/token-systems.md` — this doc cites the view-side calls and defers there for the
data-layer ground truth.
</content>
</invoke>
