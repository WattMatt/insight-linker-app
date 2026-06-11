# Flow: Access-Links Issuance + Visitor Capture

Ground truth from code, 2026-06-11. This is the Phase-3 coverage follow-up flagged in
`SECURITY-FINDINGS-phase3.md:47` — the `client_access_links` token-issuance + `VisitorRegistrationGate`
lead-capture write path, traced end-to-end as one flow. It joins three layers already documented
separately: the **token store + RPC mechanics** (`03-auth-and-access/token-systems.md`), the
**public route surface** (`04-routes/public-token-and-root.md`), and the **table/RLS ground truth**
(`02-data-model/tables-01.md`, `02-data-model/rls-policies-01.md`,
`02-data-model/rpcs-and-functions-02.md`). Where those docs hold the authoritative SQL bodies, this
doc cites them inline and does not re-derive.

**Two actors, two writes, one read-gate.**
1. An **admin** mints a share link (authenticated INSERT into `client_access_links` from the browser).
2. A **recipient** opens `/portfolio/{token}` or `/review/{token}`; an anon `SECURITY DEFINER` RPC
   validates the token and bumps tracking; a scoped anon RPC returns the data payload.
3. The recipient submits the **VisitorRegistrationGate** — an **anonymous public INSERT** into
   `access_link_visitors` — then sees the content. The data payload is fetched **before** the gate
   renders, so the gate gates nothing for a scripted client.

```
 ADMIN (authenticated, /portal-management)          RECIPIENT (anon, /portfolio|/review/{token})
 ─────────────────────────────────────────          ──────────────────────────────────────────────
 AccessLinkGenerator.tsx                              PublicClientPortfolio.tsx / PublicSiteReview.tsx
   │ INSERT client_access_links                         │ signOut({scope:'local'})           [clear stale session]
   │  (label,link_type,site_id,client_id,               │ rpc validate_access_link(token)    [bump access_count]
   │   expires_at,created_by)                           │   → {link_id, link_type, is_valid}
   │  access_token defaults server-side                 │ rpc get_public_portfolio / _site_review  ◄── DATA RETURNED HERE
   │ → token returned, URL built client-side            │   (full scoped payload into React state)
   │   link_type='client' → /portfolio/{token}          │ ── render VisitorRegistrationGate (only if no session) ──
   │   else               → /review/{token}             │      │ INSERT access_link_visitors  [anon WITH CHECK(true)]
   │ copy to clipboard                                  │      │ sessionStorage.visitor_session = {linkId,email}
   ▼                                                    ▼      ▼ onRegistered() → reveal already-fetched content
```

---

## Step 1 — Admin issues a client access link

**Where.** `AccessLinkGenerator.tsx` is mounted in the **Access Links** tab of `PortalManagement`
(`src/views/PortalManagement.tsx:6,39`), reachable at `/(admin)/portal-management`
(`src/app/(admin)/portal-management/page.tsx:2-3`) and aliased at `/(admin)/site-assignments`
(`src/app/(admin)/site-assignments/page.tsx:2-3`). Both sit under the `(admin)` route group, whose
`layout.tsx` wraps content in `<ProtectedRoute>` (`src/app/(admin)/layout.tsx:8,11`). So the
generator UI is reachable only by a logged-in user who clears `ProtectedRoute`.

**RLS on the write, not the UI.** The actual authorisation for the INSERT is
`"Admins can manage access links" FOR ALL USING (EXISTS … user_roles WHERE user_id=auth.uid() AND role='Admin')`
(`supabase/migrations/20260122090622_…:27-36`; doc `02-data-model/rls-policies-01.md:146-156`). The
route-group guard (`ProtectedRoute`) only checks for a session, **not** the `Admin` role — so a
non-Admin authenticated user who reaches the page has the INSERT rejected by RLS, not by the UI.

**The INSERT (client-side).** `createLinkMutation` inserts directly into `client_access_links` from
the browser with the anon/authenticated client (`AccessLinkGenerator.tsx:176-188`), supplying only:

| Field supplied | Source | Line |
|---|---|---|
| `label` | optional text input (`null` if blank) | `:179` |
| `link_type` | `'site'` or `'client'` from the dropdown (UI offers only these two — see below) | `:180` |
| `site_id` | `siteId` prop, or `formData.selectedSiteId`, or `null` | `:181` (`resolvedSiteId` `:150`) |
| `client_id` | `clientId` prop, or `formData.selectedClientId`, or `null` | `:182` (`resolvedClientId` `:151`) |
| `expires_at` | computed ISO string from `never \| 7d \| 30d \| 90d`, or `null` | `:183` (calc `:166-172`) |
| `created_by` | `supabase.auth.getUser()` user id | `:184` (`:174`) |

`access_token` is **not** supplied — it defaults server-side to
`encode(gen_random_bytes(32),'hex')` (64 hex chars) per the table DDL
(`supabase/migrations/20260122090622_…:4`; table doc `02-data-model/tables-01.md:189-210`). Same for
`is_active` (default `true`), `access_count` (default `0`), `created_at`. A pre-submit guard rejects
an empty target so dead/mis-scoped links can't be minted (`:159-164`, plus `targetMissing` disabling
the button `:152-153,398`).

**URL construction (client-side).** After insert, the share URL is built in the browser from the
returned `link_type` and `access_token`:
`linkType==='client' → /portfolio/{token}`, **else** `/review/{token}`
(`AccessLinkGenerator.tsx:204-205`), and the same mapping drives `copyLink`/`openLink`
(`:254-256`, `:261-264`). The link is auto-copied to the clipboard (`:205-207`). `window.location.origin`
is the host the admin minted from — there is no `APP_URL` normalisation here (a link minted from a
preview deployment embeds the preview host; same class of issue noted for invites in `00-INDEX.md:43`).

**Token lifecycle — all writes are client-side (no edge function).** Issuance, revocation, and
expiry-toggling are all browser-originated `client_access_links` mutations gated only by the Admin
RLS policy. There is no edge function in this flow (contrast `05-edge-functions/` — the QR
`qr-redirect` and `oauth-token` functions are a *separate* token system; see
`token-systems.md` Path 5/6):

| Lifecycle action | Op | Line |
|---|---|---|
| Issue | INSERT `client_access_links` | `:176-188` |
| Revoke (soft) | UPDATE `is_active=false` | `toggleActiveMutation :236-243` |
| Revoke (hard) | DELETE row (cascades visitors via FK) | `deleteLinkMutation :216-223` |
| List / view counts | SELECT `*` + joined client/site names | `:99-118` |

The UI computes `isValid = is_active && !isExpired` where
`isExpired = expires_at && new Date(expires_at) < now` (`:432-433`), mirroring the DB validity check
exactly (see Step 2).

> **`link_type='subsection'` is mintable in SQL but not in the UI.** The CHECK constraint allows
> `('client','site','subsection')` (`20260122090622_…:7`) and the drill-down RPCs handle
> `v_link.subsection_id`, but the generator dropdown offers only "Site Review" and "Client Portfolio"
> (`AccessLinkGenerator.tsx:318-319`). No app path mints a subsection-scoped link. (Cross-ref
> `token-systems.md:50-51`.)

---

## Step 2 — Recipient opens the link; token validated; payload fetched

The recipient lands on a public route with **no route group, no layout guard, no middleware** — the
only control is what the view does on mount plus Supabase RLS + `SECURITY DEFINER` RPCs (route doc
`04-routes/public-token-and-root.md:10-26`). All three token-gated views follow the same shape; the
portfolio view is shown, the two review views differ only in which scoped RPC they call.

**2a. Clear stale session.** On mount the view runs
`supabase.auth.signOut({ scope:'local' }).catch(()=>{}).finally(fetchData)`
(`PublicClientPortfolio.tsx:55`; `PublicSiteReview.tsx:137`; `PublicSubsectionReview.tsx:133`) so any
logged-in admin's session doesn't shadow the anon RPC path. The `.catch(()=>{})` swallows signOut
failures (custom-domain auth-bridge mismatch, per the inline comment `PublicSiteReview.tsx:136`).

**2b. Validate the token — `validate_access_link(token)`.** The anon-callable validator is called
first (`PublicClientPortfolio.tsx:71`; `PublicSiteReview.tsx:148`; `PublicSubsectionReview.tsx:144`).
Definition: `supabase/migrations/20260123052657_…:6-67`, `LANGUAGE plpgsql SECURITY DEFINER
SET search_path='public'`, **granted `anon` + `authenticated`** (`:65-66`); doc
`02-data-model/rpcs-and-functions-02.md:35`. Behaviour (verified against SQL):
1. Looks up the row by `access_token` (`:23-35`).
2. **If** found AND `is_active` AND (`expires_at IS NULL OR expires_at > now()`), it bumps
   `last_accessed_at = now()` and `access_count = access_count + 1` (`:38-47`). This UPDATE is the
   tracking write — it succeeds because `SECURITY DEFINER` runs as the function owner (postgres),
   which bypasses RLS (so it needs **no** anon UPDATE policy; the short-lived
   `"Allow tracking updates via token"` policy was dropped in `20260123052614:1`).
3. Returns one row `{link_id, link_type, client_id, site_id, subsection_id, is_valid}` where
   `is_valid = (is_active AND (expires_at IS NULL OR expires_at > now()))` (`:50-59`). It returns the
   row even when invalid; it returns **no rows** only when the token doesn't exist.

The views treat empty-result **or** `is_valid=false` as "invalid or expired"
(`PublicClientPortfolio.tsx:83-91`; `PublicSiteReview.tsx:156-159`). The portfolio view additionally
requires `link_type==='client'` with non-null `client_id` (`:101-104`); the site-review view
redirects a `client` link with no `routeSiteId` to `/portfolio/{token}` (`PublicSiteReview.tsx:164-167`).

> The portfolio view wraps the validate call in a 15s `AbortController` (`PublicClientPortfolio.tsx:65-67`)
> but never passes `controller.signal` to the RPC, so the timeout is **dead code** — the abort never
> fires (cross-ref `token-systems.md` Open Q #7; route doc §1 Notes).

**2c. Fetch the scoped payload (the read-gate that actually matters).** After validation, the view
calls the scoped `SECURITY DEFINER` RPC, all granted `anon, authenticated`
(`02-data-model/rpcs-and-functions-02.md:25-28`). Each enforces token→data scope **in SQL** via the
`_share_link(token)` helper (REVOKEd from PUBLIC, `20260610113000_…:9-19`), so the URL token is the
only credential and cross-tenant access is rejected server-side:

| Route | Scoped RPC | Returns | Scope rule |
|---|---|---|---|
| `/portfolio/{token}` | `get_public_portfolio(p_token)` `PublicClientPortfolio.tsx:108` | `settings`, `client`, `sites[]` with `total_subsections`/`open_snags` counts | `NULL` unless `_share_link` live AND `client_id IS NOT NULL` (`20260610113000_…:58-60`) |
| `/review/{token}` (+ `/site/{siteId}`) | `get_public_site_review(p_token, p_site_id)` `PublicSiteReview.tsx:184` | full single-site dataset: subsections (meter serials), snags, docs (`file_url`), inspections (`json_data`) | client-scoped → site's `client_id` must equal link's; site-scoped → `p_site_id` must equal link's; else `NULL` (`20260610130000_…:28-35`) |
| `/review/{token}/subsection/{subsectionId}` | `get_public_subsection_review(p_token, p_subsection_id)` `PublicSubsectionReview.tsx:169` | one subsection: meter/CT, docs, snags + rectification, inspections + signatures, floor plans | subsection's site/client must be inside the token scope; else `NULL` (`20260610130000_…:105-114`) |

Full RPC bodies, payloads, and attacker-visibility analysis: `token-systems.md` Path 1/Path 2 and
route doc `04-routes/public-token-and-root.md` §1-4. (The QR `/public/subsections/{id}` path is
token-**free** and out of scope for this flow — see `token-systems.md` Path 3.)

---

## Step 3 — VisitorRegistrationGate: anonymous lead-capture write

**Render condition (soft gate).** Each view sets `linkId = link.link_id` after validation, and sets
`visitorRegistered=true` if `getVisitorSession(link_id)` already matches this browser session
(`PublicClientPortfolio.tsx:94-99`; `PublicSiteReview.tsx:170-175`; `PublicSubsectionReview.tsx:161`).
The gate renders only when `!visitorRegistered && linkId && !error`
(`PublicClientPortfolio.tsx:180`; `PublicSiteReview.tsx:273`; `PublicSubsectionReview.tsx:317`).

**`getVisitorSession`** reads `sessionStorage["visitor_session"]` and returns `true` iff its stored
`linkId` matches the current link (`VisitorRegistrationGate.tsx:32-44`). `VISITOR_SESSION_KEY` is the
constant `"visitor_session"` (`:32`). Session scope = per-tab/per-link; a new tab re-prompts.

**The anonymous INSERT.** On submit the gate validates the form client-side (first/last name, email
regex, phone ≥7 chars, role required — `:62-81`) then inserts into `access_link_visitors`
(`VisitorRegistrationGate.tsx:89-97`):

| Column written | Source | Note |
|---|---|---|
| `access_link_id` | `accessLinkId` prop (= `link.link_id` from validate) | FK → `client_access_links(id)` ON DELETE CASCADE |
| `first_name`, `last_name` | form (trimmed) | NOT NULL |
| `email` | form, `.trim().toLowerCase()` | NOT NULL; indexed `idx_access_link_visitors_email` |
| `phone` | form (trimmed) | NOT NULL |
| `role` | dropdown (Property Manager … Other) | NOT NULL |
| `user_agent` | `navigator.userAgent` | optional |

Not written: `ip_address` (column exists, never populated client-side — `tables-01.md:13-31`),
`accessed_at` (DB default `now()`), `id` (DB default). Table DDL:
`supabase/migrations/20260217082506_…:3-15`.

On success it writes `sessionStorage.visitor_session = {linkId, email}` (`:106-109`) and calls
`onRegistered()`, which flips `visitorRegistered=true` and reveals the **already-fetched** content
(`:111`). On INSERT error it toasts and returns without revealing (`:99-103`) — but see the bypass note.

**This is an anon-write surface (tier-2 relevance).** The INSERT is authorised by
`"Anyone can register as visitor" FOR INSERT WITH CHECK (true)`
(`supabase/migrations/20260217082506_…:20-22`; doc `02-data-model/rls-policies-01.md:16`). Reads are
Admin-only (`"Admins can view visitors" FOR SELECT USING has_role(auth.uid(),'Admin')`, `:25-27`).
The 2026-06-11 tier-2 anon-read lockdown **does not touch this policy** — that lockdown demotes
anon/public `cmd='SELECT' qual='true'` policies only (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:22-39`),
and this is an **INSERT** policy. So the anon write remains wide open by design: any anonymous caller
can write arbitrary rows (any `access_link_id`, any PII strings) into `access_link_visitors` directly
via the REST endpoint, with no captcha, no rate-limit visible in code, and no validation that the
PII is real or that `access_link_id` corresponds to a token they hold. This is the lead-capture log,
not an access gate (see security_flags).

---

## The bypass: payload is fetched BEFORE the gate (gate withholds nothing)

In **every** token-gated view, the scoped payload RPC is awaited and stored in React state **inside**
the same `fetchData`/`validateAndFetchData` function, which the mount effect invokes — and that runs
to completion **before** the gate's render condition is evaluated on a later render:

- `PublicClientPortfolio.tsx`: `fetchData` calls `get_public_portfolio` at `:108` and `setSites(...)`
  at `:159`; the gate render guard is at `:180` (a subsequent render).
- `PublicSiteReview.tsx`: `validateAndFetchData` (invoked `:137`) calls `get_public_site_review` at
  `:184`; the gate render is at `:273`.
- `PublicSubsectionReview.tsx`: calls `get_public_subsection_review` at `:169`; the gate render is at
  `:317`.

Because the RPCs are `anon`-granted and self-contained (token in, payload out), a scripted anon
client can call `get_public_portfolio` / `get_public_site_review` / `get_public_subsection_review`
directly with just the token and never render — let alone submit — the gate. The gate is a UX /
lead-capture step backed only by `sessionStorage`; it is **not** an access control. (Authoritative
analysis: `token-systems.md:193-200` and Open Q #6; route doc §11 / Security summary item 3.)

---

## Cross-references

- **Token store, RLS, RPC bodies, scope SQL:** `03-auth-and-access/token-systems.md`
  (store §"Token store", validator §"Validation function", Path 1/2, Visitor gate §, Open Qs).
- **Public route surface + per-route reads/writes:** `04-routes/public-token-and-root.md` §1-4, §11.
- **Tables:** `02-data-model/tables-01.md` (`access_link_visitors` :13-31, `client_access_links` :189-213).
- **RLS:** `02-data-model/rls-policies-01.md` (`access_link_visitors` :16, `client_access_links` :146-163).
- **RPCs:** `02-data-model/rpcs-and-functions-02.md` (`validate_access_link` :35, scoped RPCs :25-28).
- **Edge functions:** none in this flow. The *separate* QR/API token systems are in
  `05-edge-functions/qr-offline-reports-misc.md` and `token-systems.md` Path 5/6.

---

## security_flags

- **security_flag (Medium):** Anonymous unbounded INSERT into `access_link_visitors`
  (`VisitorRegistrationGate.tsx:89-97`) under `"Anyone can register as visitor" WITH CHECK(true)`
  (`20260217082506_…:20-22`) — anon can write arbitrary PII rows for any `access_link_id` directly
  via REST, no captcha / rate-limit / token-ownership check; tier-2 lockdown is read-only and does
  not touch this write surface. Lead-capture log is spammable/poisonable.
- **security_flag (Medium):** VisitorRegistrationGate is not an access control — scoped payload RPCs
  (`get_public_portfolio`/`get_public_site_review`/`get_public_subsection_review`, all `anon`-granted)
  return the full dataset *before* the gate renders (e.g. `PublicSiteReview.tsx:184` vs gate `:273`),
  so a scripted anon client reads everything without registering. (Re-confirms `token-systems.md` Open Q #6.)
- **security_flag (Low/Info):** Client-side token lifecycle — issuance/revocation/expiry are all
  browser-originated `client_access_links` writes (`AccessLinkGenerator.tsx:176-243`) gated **only**
  by the Admin RLS policy (`20260122090622_…:27-36`), not by the `(admin)` `ProtectedRoute` guard
  (which only checks for a session, not role). The UI is reachable by any authenticated user; the
  INSERT is RLS-rejected for non-Admins — defence-in-depth gap, not an exploit.
- **security_flag (Low/Info):** Share URL host comes from `window.location.origin`
  (`AccessLinkGenerator.tsx:205`) with no `APP_URL` normalisation — a link minted from a preview
  deployment embeds the preview host (same class as the invite-redirect issue, `00-INDEX.md:43`).
- **security_flag (Low/Info):** `validate_access_link` bumps `access_count`/`last_accessed_at` on
  every call with a valid live token (`20260123052657_…:38-47`) and is `anon`-granted with no
  rate-limit — counters are inflatable by repeated anon RPC calls; `expires_at`/`is_active` are
  re-checked server-side so this is metrics noise, not an access bypass.

## Notes

- **`access_token` is server-minted**, never client-supplied (DDL default `encode(gen_random_bytes(32),'hex')`,
  `20260122090622_…:4`) — the generator INSERT omits it (`AccessLinkGenerator.tsx:176-188`). Good: no
  client control over token entropy.
- **`client_access_links` SELECT was closed to anon in prod** by tier-2 (dropped
  `"Public can select access_links for validation"`, added `auth_read_client_access_links`
  authenticated-only — `tables-01.md:213`, `rls-policies-01.md:156-163`). Non-breaking for this flow:
  `validate_access_link` / `_share_link` are `SECURITY DEFINER` and bypass RLS, so token validation
  never depended on an anon SELECT policy on this table.
- **Deleting a link cascades its visitors** (`access_link_visitors.access_link_id … ON DELETE CASCADE`,
  `20260217082506_…:5`) — hard-revoke also purges the lead-capture rows for that link.
- **`accessed_at` vs `last_accessed_at` are two different tracking signals:** the per-visitor
  `access_link_visitors.accessed_at` (DB-defaulted, one row per gate submission) vs the per-link
  `client_access_links.last_accessed_at`/`access_count` (bumped by every `validate_access_link` call,
  incl. scripted/un-gated ones). The link counter overcounts relative to actual registered visitors.
