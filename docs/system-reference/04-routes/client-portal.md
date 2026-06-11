# Routes — `(client-portal)` group

Scope: every route under `src/app/(client-portal)/`. All five pages are thin `"use client"` wrappers
that render a view from `src/views/`. The route group's `layout.tsx` wraps every page in
`ClientProtectedRoute` → `ClientPortalLayout`.

> **Citations** use `path:line`. Migration / SQL facts are named from
> `docs/system-reference/02-data-model/` (RLS) and `docs/system-reference/03-auth-and-access/`.
> Anything not verifiable in code is tagged **⚠️ UNVERIFIED**.

---

## 0. Shared access context (applies to all five routes)

### 0.1 Group layout & client-side guard

| Concern | Mechanism | Citation |
|---|---|---|
| Route-group layout | `(client-portal)/layout.tsx` → `<Suspense>` → `ClientProtectedRoute` → `ClientPortalLayout` | `src/app/(client-portal)/layout.tsx:8-24` |
| Session present | `useAuthSession()`; `!session` → `<Navigate to="/auth/login" replace />` | `src/components/ClientProtectedRoute.tsx:9,16` |
| Role gate | `useUserRole()`; **admin-preview bypass** `userRole === "Admin" && previewClientId` → renders children; else `userRole !== "Client"` → `<Navigate to="/dashboard" replace />` | `src/components/ClientProtectedRoute.tsx:10,19-20` |
| Onboarding | children wrapped in `OnboardingGate` (shows `OnboardingWizard` while `onboarding_completed` falsy) | `src/components/ClientProtectedRoute.tsx:23-26`; `src/components/auth/OnboardingGate.tsx:15-32` |

`useUserRole()` reads the caller's role from `user_roles` filtered by `auth.uid()` via
`.eq("user_id", userId).maybeSingle()` (`src/hooks/useUserRole.tsx:39-44`). The guard is **purely
client-side** — it controls *rendering*, not data access. `Navigate` is a Next.js
`router.replace`/`push` shim that fires in a `useEffect` after first render
(`src/lib/navigation.tsx:165-177`), so non-Client users briefly mount the page before redirect.

### 0.2 Client identity resolution — `useClientInfo`

Every view resolves "which client am I" through `useClientInfo(previewClientId?)`
(`src/hooks/useUserRole.tsx:54-89`):

- **Admin preview branch** (`userRole === "Admin" && previewClientId`): loads the chosen client
  directly — `supabase.from("clients").select("id, name, logo_url, company_name").eq("id", previewClientId).single()` (`:64-71`). Returns `{ client_id, clients }`.
- **Normal Client branch**: `supabase.from("user_clients").select("client_id, clients(id, name, logo_url, company_name)").eq("user_id", user.id).maybeSingle()` (`:79-83`).

`clientInfo.client_id` is then used as the `.eq("client_id", …)` filter in every downstream query.
**This `client_id` value is the only tenant boundary the data queries enforce** (see §0.4).

### 0.3 Admin preview mode (`?preview=<clientId>`)

All routes read `searchParams.get("preview")` and propagate it through every internal link. An Admin
visiting `/client-portal/...?preview=<clientId>` bypasses the `userRole === "Client"` check
(`ClientProtectedRoute.tsx:19`) and views the portal as that client. A blue "Admin Preview Mode"
banner renders when `previewClientId` is set (e.g. `ClientPortalDashboard.tsx:189-197`). Logout in
preview mode is relabeled "Exit Preview" and navigates to `/portal-management` instead of signing out
(`src/components/ClientPortalLayout.tsx:73-79,182-184`).

### 0.4 Server-side data gating — **post-tier-2 reality**

The auth docs describe *intended* Client-scoped RLS (`get_user_client_id()`-based policies on
`sites`, `subsections`, `inspections`, `snags`, `site_documents`, `subsection_documents`,
`subsection_floor_plans`, created `20251120110544` / `20251017054255`;
`03-auth-and-access/access-contexts-and-roles.md:310-322`). **These narrowing policies are no longer
the effective read gate.** The tier-2 lockdown (`APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`)
created `auth_read_<table>` policies = `FOR SELECT TO authenticated USING (true)` on every table that
previously had an anon `qual='true'` SELECT policy. RLS is permissive (OR-combined), so the broadest
grant wins:

| Table | Effective authenticated SELECT policy | Citation (02-data-model) |
|---|---|---|
| `sites` | `auth_read_sites` (`USING true`) — Client/Contractor scoped reads now redundant | `rls-policies-05.md:26,32` |
| `subsections` | `auth_read_subsections` (`USING true`) | `rls-policies-05.md:137,145` |
| `inspections` | `auth_read_inspections` (`USING true`) | `rls-policies-04.md:61,66`; `rls-policies-02.md:230,234` |
| `snags` | `auth_read_snags` (`USING true`) | `rls-policies-05.md:47,53` |
| `site_documents` | `auth_read_site_documents` (`USING true`) | `rls-policies-04.md:201,206` |
| `subsection_documents` | `auth_read_subsection_documents` (`USING true`) | `rls-policies-05.md:95,101` |
| `subsection_floor_plans` | `auth_read_subsection_floor_plans` (`USING true`) | `rls-policies-05.md:116` |
| `floor_plan_pins` | `auth_read_floor_plan_pins` (`USING true`) + blanket FOR-ALL | `rls-policies-03.md:274,280` |
| `clients` | `auth_read_clients` (`USING true`) | `rls-policies-03.md:107,115`; `rls-policies-01.md:193,199` |
| `document_categories` | `auth_read_document_categories` (`USING true`) + blanket FOR-ALL | `rls-policies-03.md:233,241` |
| `inspection_templates` | `auth_read_inspection_templates` (`USING true`) | `rls-policies-02.md:203` |
| `inspection_signatures` | `All authenticated users full access (inspection_signatures)` (FOR ALL, `true`/`true`) | `rls-policies-02.md:162` |
| `site_document_categories` | `All authenticated users full access to site_document_categories` (FOR ALL, `auth.uid() IS NOT NULL`) | `rls-policies-04.md:179` |
| `calendar_events` | `All authenticated users full access to calendar_events` (FOR ALL, `auth.uid() IS NOT NULL`) | `rls-policies-01.md:135,137` |
| `user_clients` | `All authenticated users full access to user_clients` (FOR ALL, `auth.uid() IS NOT NULL`) | `rls-policies-05.md:194,196` |

**Net effect:** a logged-in `Client` (or any authenticated user) can `SELECT` **all rows** of these
tables regardless of `client_id`. The `.eq("client_id", clientInfo.client_id)` filters in the views
are client-controlled query parameters, **not** a DB-enforced boundary. Cross-tenant data is one
crafted query away. This is documented once here and referenced per-route as **SF-CP-1**.

Storage: the `site-images` bucket is **public=true** (`triggers-enums-storage.md:110`,
set `20251120083541`) and the effective `storage.objects` policies are the four **blanket** policies
from `20251120083932` with no per-bucket/per-role scoping (`triggers-enums-storage.md:130`). The
`createSignedUrl('site-images', …)` calls in the views therefore add no confidentiality (the bucket
serves public URLs); any authenticated user could read any site image, and the public bucket exposes
images by path to anon. Referenced as **SF-CP-2**.

---

## 1. `/client-portal` — Dashboard

| | |
|---|---|
| Page | `src/app/(client-portal)/client-portal/page.tsx:2-3` → `ClientPortalDashboard` |
| View | `src/views/ClientPortalDashboard.tsx` |
| Group / guard | `(client-portal)` group (§0.1). Client-side only. |

### Data reads

| Source | Query | Citation |
|---|---|---|
| `clients` / `user_clients` | `useClientInfo()` (§0.2) | `ClientPortalDashboard.tsx:16` |
| `sites` | count `head:true .eq("client_id", clientId)` | `:25-28` |
| `sites` | `select("id").eq("client_id", clientId)` (→ `siteIds`) | `:30-33` |
| `subsections` | count `.in("site_id", siteIds)` | `:47-50` |
| `subsections` | `select("id").in("site_id", siteIds)` | `:53-56` |
| `inspections` | count `.in("site_id", siteIds)` | `:58-61` |
| `inspections` | count `.in("site_id", siteIds).gte("inspection_date", today).eq("status","Scheduled")` | `:63-69` |
| `snags` | `select("id,status,subsection_id").in("subsection_id", …)` | `:71-74` |
| `sites` (+nested `subsections(id)`) | `.eq("client_id", clientId).order("name").limit(4)` | `:97-107` |
| `snags` | `.in("subsection_id", allSubsectionIds)` | `:116-119` |
| `storage` `site-images` | `createSignedUrl(path, 3600)` for each site image | `:137-139` |

`SiteOverviewCard` (`src/components/client-portal/SiteOverviewCard.tsx`) renders the cards; the
dashboard computes all stats inline, no RPC.

### Data writes / mutations

None. Read-only dashboard.

### Security check

- **SF-CP-1** (cross-tenant read): the `subsections`/`inspections`/`snags` lookups scope by
  `siteIds`/`subsectionIds` *derived from the client's own sites* — so even though `auth_read_*`
  allows reading all rows, the dashboard only requests its own. **However** the boundary is the
  client-supplied filter, not RLS; a modified query returns other tenants' rows. Carried as a
  cross-cutting flag, not unique to this route.
- **SF-CP-2** (public site-images bucket): signed URLs are cosmetic; bucket is public.
- No mutations → no write-side exposure.

---

## 2. `/client-portal/calendar` — Inspection Calendar

| | |
|---|---|
| Page | `src/app/(client-portal)/client-portal/calendar/page.tsx:2-3` → `ClientPortalCalendar` |
| View | `src/views/ClientPortalCalendar.tsx` |
| Group / guard | `(client-portal)` group (§0.1). Client-side only. |

### Data reads

| Source | Query | Citation |
|---|---|---|
| `clients` / `user_clients` | `useClientInfo()` | `ClientPortalCalendar.tsx:15` |
| `sites` | `select("id,name").eq("client_id", clientInfo.client_id)` | `:22-25` |
| `inspections` | `select("*").in("site_id", siteIds).order("inspection_date", desc)` | `:33-37` |
| `sites` (2nd query) | `select("id,name").eq("client_id", clientInfo.client_id)` | `:54-57` |
| `calendar_events` | `select("*").in("site_name", siteNames).order("start_date", desc)` | `:64-68` |

### Data writes / mutations

None. Read-only.

### Security check

- **SF-CP-3 — calendar_events name-based filtering.** `calendar_events` has **no `site_id` column
  join here**; the view filters `.in("site_name", siteNames)` where `siteNames` is the client's own
  site *names* (`:61,67`). `calendar_events` RLS is a blanket `auth.uid() IS NOT NULL` FOR-ALL policy
  (`rls-policies-01.md:135`), so any authenticated user can read **all** calendar events. Two
  different clients with a site of the same name (e.g. "Head Office", "Warehouse") would each see the
  other's events for that name — the filter keys on a non-unique display string, not a tenant id. The
  inline comment at `:53` ("First verify client ownership of sites…") overstates the guarantee: the
  ownership check only narrows `siteNames`, and name collisions defeat it. Instance of SF-CP-1 with an
  extra collision hazard.
- **SF-CP-1 / SF-CP-2** apply as in §0.4.

---

## 3. `/client-portal/sites` — Sites list

| | |
|---|---|
| Page | `src/app/(client-portal)/client-portal/sites/page.tsx:2-3` → `ClientPortalSites` |
| View | `src/views/ClientPortalSites.tsx` |
| Group / guard | `(client-portal)` group (§0.1). Client-side only. |

### Data reads

| Source | Query | Citation |
|---|---|---|
| `clients` / `user_clients` | `useClientInfo()` | `ClientPortalSites.tsx:17` |
| `sites` | `select("*").eq("client_id", clientInfo.client_id).order("name")` | `:26-30` |
| `storage` `site-images` | `createSignedUrl(path, 3600)` per site image | `:42-44` |

The inline comments at `:24-25` ("RLS policy ensures client can only see their own sites … Additional
client_id filter for defense in depth") are **stale** post-tier-2: the RLS *narrowing* policy is
superseded by `auth_read_sites` (`USING true`), so the `.eq("client_id", …)` filter is now the
**primary** (and only) scoping, not "defense in depth". Search filtering (`:72-79`) is client-side
over already-fetched rows.

### Data writes / mutations

None. Read-only list.

### Security check

- **SF-CP-1** — the `.eq("client_id", …)` is the sole tenant boundary; RLS no longer narrows. Code
  comment misrepresents the actual enforcement.
- **SF-CP-2** — public site-images bucket; signed URLs cosmetic.

---

## 4. `/client-portal/sites/[siteId]` — Site detail

| | |
|---|---|
| Page | `src/app/(client-portal)/client-portal/sites/[siteId]/page.tsx:2-3` → `ClientPortalSiteDetail` |
| View | `src/views/ClientPortalSiteDetail.tsx` |
| Route param | `siteId` via `useParams()` (`:27`) |
| Group / guard | `(client-portal)` group (§0.1). Client-side only. |

### Data reads

| Source | Query | Citation |
|---|---|---|
| `clients` / `user_clients` | `useClientInfo()` | `ClientPortalSiteDetail.tsx:30` |
| `sites` (+ `clients(*)`) | `.eq("id", siteId).eq("client_id", clientInfo.client_id).single()` | `:40-45` |
| `storage` `site-images` | `createSignedUrl(path, 3600)` | `:54-56` |
| `subsections` | `select("*").eq("site_id", siteId).order("name")` — **no `client_id` filter** | `:75-79` |
| `site_documents` | `select("*").eq("site_id", siteId).order("created_at", desc)` — **no `client_id` filter** | `:91-94` |
| `site_document_categories` | `select("id,name").eq("site_id", siteId).order("order_index")` | `:105-109` |
| `subsection_documents` (+ `document_categories(name)`) | `.in("subsection_id", subsectionIds)` | `:121-127` |
| `inspections` | `select("*").eq("site_id", siteId).order("created_at", desc)` — **no `client_id` filter** | `:141-145` |

Tab components reached from this view perform further reads (each receives `siteId`):
- `SchematicDiagram siteId … readOnly clientPortalMode` (`:348`) — `src/components/site/SchematicDiagram.tsx`.
- `AssetVerification siteId … readOnly` (`:353`) — `src/components/site/AssetVerification.tsx`.
- `ClientPortalDocuments` (`:365-372`) — renders the already-fetched `site_documents` /
  `subsection_documents`; download via `downloadFile` (`src/lib/fileDownload.ts`).
- `DocumentPreviewDialog` (`:433-438`) — in-app document viewer.

(SchematicDiagram / AssetVerification internal queries are out of this route's direct scope; they
read site-scoped schematic/asset tables — see their own files for exact `:line`. **⚠️ UNVERIFIED** in
this doc's scope.)

### Data writes / mutations

None from this view. `readOnly` / `clientPortalMode` flags are passed to child components
(`:348,353`) — ⚠️ UNVERIFIED whether those children honour read-only at the DB level vs. just hiding
write UI.

### Security check

- **SF-CP-4 — only the top `sites` query is tenant-scoped; child queries are not.** The `sites` fetch
  filters `.eq("client_id", clientInfo.client_id).single()` (`:43-44`) and returns nothing (→ "Site
  not found", `:169-180`) if the site isn't the caller's. But `subsections` (`:76-78`),
  `site_documents` (`:92-93`) and `inspections` (`:142-143`) filter **only** by `siteId`, not by
  ownership. Because `auth_read_*` allows reading all rows (§0.4), a malicious authenticated user can
  navigate to `/client-portal/sites/<foreign-siteId>` — the `sites` query 404s the page **client-side
  only** (`enabled: !!siteId && !!clientInfo?.client_id`, `:38`), yet the subsections/documents/
  inspections queries are independently `enabled: !!siteId` (`:73,88,103,139`) and **execute
  regardless** of the ownership-check result, returning the foreign site's children. The "not found"
  guard is cosmetic; the underlying data was already fetched. This is the closest analogue to the
  create-user-admin class in this group.
- **SF-CP-1 / SF-CP-2** apply.

---

## 5. `/client-portal/subsections/[subsectionId]` — Subsection detail

| | |
|---|---|
| Page | `src/app/(client-portal)/client-portal/subsections/[subsectionId]/page.tsx:2-3` → `ClientPortalSubsectionDetail` |
| View | `src/views/ClientPortalSubsectionDetail.tsx` |
| Route param | `subsectionId` via `useParams()` (`:26`) |
| Group / guard | `(client-portal)` group (§0.1). Client-side only. |

### Data reads

| Source | Query | Citation |
|---|---|---|
| `clients` / `user_clients` | `useClientInfo()` | `ClientPortalSubsectionDetail.tsx:30` |
| `subsections` (+ `sites(name,id,client_id,address)`) | `.eq("id", subsectionId).single()`; then **in-JS** `data.sites.client_id !== clientInfo.client_id` → `throw "Access denied"` | `:41-51` |
| `subsection_documents` (+ `document_categories(name)`) | `.eq("subsection_id", subsectionId).order("uploaded_at", desc)` | `:61-65` |
| `inspections` | `.eq("subsection_id", subsectionId).order("created_at", desc)` | `:76-80` |
| `inspections` (orphan fallback) | `.eq("site_id", subsection.site_id).is("subsection_id", null)` then JS-match on `json_data.generalInfo.shopNumber/shopName` etc. | `:90-101` |
| `subsection_floor_plans` (+ `floor_plan_pins(*)`) | `.eq("subsection_id", subsectionId)` | `:110-113` |
| `inspections` (detail dialog) | `.select("*, inspection_templates(name,sections), inspection_signatures(signer_name,signer_type,signed_at)").eq("id", inspectionId).single()` | `:124-132` |

### Data writes / mutations

None. Read-only; document download via `downloadFile` (`:156-162`), in-app preview via
`DocumentPreviewDialog` (`:529-534`) and inspection report `Dialog` (`:537-623`).

### Security check

- **SF-CP-5 — ownership check is in-JavaScript, post-fetch, and only on the *parent* query.** The
  subsection query has **no `client_id`/`site_id` filter** — it fetches the subsection by id, joins
  `sites.client_id`, and throws `"Access denied"` in the query function if it mismatches
  (`:49-51`). This is better than §4 (it does compare ownership) but: (a) the comparison runs **after**
  the row is fetched from the DB, and `auth_read_subsections`/`auth_read_sites` permit the fetch
  regardless (§0.4) — the data crossed the trust boundary into the client before the check; (b) the
  *child* queries (`subsection_documents` `:62`, `inspections` `:77`, `subsection_floor_plans`
  `:112`) are `enabled: !!subsectionId && !!subsection` — they only run once `subsection` resolves
  truthy, so the throw does gate them; but the throw is a client-side control, not RLS. A direct
  Supabase call from the browser console with the same JWT bypasses the JS check entirely and reads
  any subsection's documents/inspections/floor-plans. Instance of SF-CP-1.
- **SF-CP-6 — inspection-signature read exposure.** The detail dialog joins `inspection_signatures`
  (`:128`), whose effective policy is `All authenticated users full access` (`true`/`true`,
  `rls-policies-02.md:162`). Any authenticated user can read all signers' names/types/timestamps for
  any inspection. Within the route this is reached only for the client's own subsection's inspections,
  but the underlying grant is global.
- **Orphan-inspection fallback** (`:90-101`) reads *all* null-subsection inspections on the same site
  and JS-matches by normalized shop name. It scopes by `subsection.site_id` (already ownership-checked
  via the parent throw), so no additional cross-tenant exposure beyond SF-CP-1, but it surfaces
  inspection `json_data` to the client. **⚠️ UNVERIFIED** whether `json_data` may contain fields not
  intended for client view.

---

## 6. Mutation summary

**No route in the `(client-portal)` group performs any INSERT / UPDATE / DELETE / upload.** The portal
is read-only by construction. The only state changes are: `supabase.auth.signOut()` on logout
(`ClientPortalLayout.tsx:82`) and storage `createSignedUrl` reads (no writes). All "write-class"
exposure for these tables (e.g. `subsection_documents` INSERT open to any authenticated user,
`rls-policies-05.md:101`) is reachable from the browser but **not surfaced by these routes** — recorded
in the data-model docs, not here.
