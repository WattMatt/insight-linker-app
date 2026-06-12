# Routes: admin core — dashboard, calendar, clients tree

Ground truth from code, validated 2026-06-11. Scope: the `(admin)` route group's Dashboard,
Calendar, and the full Clients drill-down tree
(`/clients` → `/clients/[clientId]` → `…/sites` → `…/sites/[siteId]` →
`…/subsections/[subsectionId]` → `…/inspections/[inspectionId]`), plus the inline `new` pseudo-routes
those views handle.

Every page under `src/app/(admin)/` is a 3-line `"use client"` wrapper that renders a view from
`src/views/`. The wrapper carries no logic, no params parsing, no guard — guarding is the shared
layout, data access is the view + its hooks. Citations below name the wrapper, the view, and the
data layer.

**RLS policy names** are taken from `docs/system-reference/02-data-model/rls-policies-0*.md` (the
effective post-tier-2 state, 2026-06-11) rather than re-derived. **Access-context primitives**
(`ProtectedRoute`, role hooks, the staff predicate) are from
`docs/system-reference/03-auth-and-access/access-contexts-and-roles.md`.

---

## 0. Shared access context for the whole group

All eight routes live in route group `(admin)`. The group layout
(`src/app/(admin)/layout.tsx:12`) wraps every page in `ProtectedRoute`
(`src/components/ProtectedRoute.tsx`):

- loading → spinner (`ProtectedRoute.tsx:13`)
- no session → `/auth/login` (`:14`)
- role `Contractor` → `/contractor` (`:15`); role `Client` → `/client-portal` (`:16`)
- **everyone else admitted**: `Admin`, `User`, `Moderator`, **and users with no `user_roles` row**
  (both equality checks fail open). Children render inside `OnboardingGate`, which is an overlay,
  not a hard block (`:18-22`).

So `(admin)` is a **staff** context, not Admin-only. There is **no Next.js middleware** and **no
server component** in these routes; the only server-side boundary is Supabase RLS evaluated under the
caller's JWT. **Every data read/write below runs under the logged-in staff user's own session** via
the singleton browser client `src/integrations/supabase/client.ts` (anon key + the user JWT).

**The dominant DB boundary for this tree:** the operational tables these routes touch fall into three
RLS shapes (all from the data-model docs):

| Shape | Tables (in this tree) | Effective grant to authenticated |
|---|---|---|
| `Admin`/`User` role-gated `FOR ALL` | `sites`, `subsections`, `inspections`, `snags`, `site_documents` | full CRUD only if `has_role('Admin')` **or** `has_role('User')`; SELECT-all for any authenticated via `auth_read_*` (sites has Client/Contractor scoped SELECT too) |
| Blanket `FOR ALL` "All authenticated users full access" | `calendar_events`, `document_categories`, `floor_plan_pins`, `floor_plan_pin_comments`, `subsection_floor_plans`, `inspection_items`, `inspection_templates`, `site_document_categories` ⚠️, `subsection_documents` (INSERT) | **any** authenticated user — read AND write, no role/site scoping |
| Staff predicate `FOR ALL` (`auth.uid() IS NOT NULL AND NOT Contractor AND NOT Client`) | `clients`, `coc_validations`, `coc_extractions` | any non-portal (staff) user — read AND write |

Citations for those policy names appear inline per route. The practical consequence, recorded as
security_flags below: a `User`-role or no-role staff user — admitted by the layout — gets near-Admin
write access to the entire client/site/subsection/inspection graph, and **any** authenticated user
(including a logged-in `Client` or `Contractor` who manually navigates) can read/write the blanket-FOR-ALL
tables (calendar, floor plans, document categories, inspection items).

⚠️ `site_document_categories` and `qr_scans` are referenced by code in this tree but have **no
tracked migration / RLS policy** in `02-data-model` — see §11 (open questions).

---

## 1. `/dashboard`

| | |
|---|---|
| Wrapper | `src/app/(admin)/dashboard/page.tsx:2-3` → renders `Dashboard` |
| View | `src/views/Dashboard.tsx` (`const Dashboard`, `:70`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Data reads** — one `Promise.all` of nine queries in `fetchDashboardData` (`Dashboard.tsx:98-143`),
all unscoped (tenant-wide aggregate counts), under the staff session:

| Source | Op | Line | RLS gate |
|---|---|---|---|
| `clients` | count head | `:113` | staff predicate SELECT / `auth_read_clients` |
| `sites` | count head | `:114` | `auth_read_*` (any authenticated reads all) |
| `subsections` | select+count | `:115` | `auth_read_subsections` |
| `inspections` | select+count | `:116` | `auth_read_*` / role-manage |
| `snags` | select+count | `:117` | `auth_read_snags` |
| `activity_logs` | select latest 5 | `:118` | "Users can view their own activity logs" + "Admins can view all activity logs" → **non-Admin staff see only their own rows**; Admin sees all |
| `calendar_events` | select upcoming 5 | `:119` | blanket `FOR ALL` `auth.uid() IS NOT NULL` |
| `snags` (high-risk, joined `subsections`→`sites`) | select limit 10 | `:120-140` | `auth_read_snags` + nested SELECTs |
| `coc_validations` | select all | `:142` | `Staff manage coc_validations` (SELECT side) |

Plus `fetchFailedValidationsBySubsection(subsectionIds)` (`:167`) — helper in
`src/lib/complianceCalculations.ts` that itself queries `coc_validations`.

**Data writes/mutations**: none. Dashboard is read-only. Navigation buttons go to `/clients`,
`/sites`, `/qr-codes` (`:252-263`) and high-risk snag rows deep-link to
`/clients/{clientId}/sites/{siteId}/subsections/{subsection_id}` (`:521`).

**Security check**: read-only; the only context-sensitivity is `activity_logs` (Admins see all,
others see own) which is correctly RLS-gated. No mutation, no flag specific to this route.

---

## 2. `/calendar`

| | |
|---|---|
| Wrapper | `src/app/(admin)/calendar/page.tsx:2-3` → renders `Calendar` |
| View | `src/views/Calendar.tsx` (`const Calendar`, `:48`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Data reads**: `calendar_events` for the current year (`useQuery` `queryFn`, `Calendar.tsx:69-82`,
`from("calendar_events").select("*")` `:72-77`).

**Data writes/mutations** — all directly on `calendar_events` under the staff session:

| Action | Op | Line |
|---|---|---|
| Create event | `calendar_events.insert(...)` | `:211-221` |
| Update event | `calendar_events.update(...).eq("id", editingEvent.id)` | `:195-206` |
| Delete event | `calendar_events.delete().eq("id", eventId)` (after `confirm()`) | `:242-245` |
| Export PDF | `useUnifiedPdfGeneration().generatePdf(reportData)` (`:259`, `:293`) — generates a calendar report; downloads via anchor click (`:296-300`) |

**DB gate**: `calendar_events` has a single **blanket `FOR ALL` policy**
`All authenticated users full access to calendar_events` (USING/CHECK `auth.uid() IS NOT NULL`,
`rls-policies-01.md:135`). No role or site scoping survives.

**Security check** → **security_flag**. Events are keyed to a site by **free-text `site_name`**
(`Calendar.tsx:213-220`, the form has a plain text `Input` for `site_name`, `:576-583`), not a FK.
Combined with the blanket `FOR ALL` policy, **any authenticated user** — including a logged-in
`Client` or `Contractor` who manually requests `/calendar` data (the layout would bounce them from the
UI, but the RLS policy is the only real boundary) — can create/edit/delete calendar events for any
site, and the data-model doc already flags the client-portal calendar SELECT joins on site-name string
equality (cross-tenant collision risk). The mutation here is not scoped to the staff user's tenant in
any way.

---

## 3. `/clients`

| | |
|---|---|
| Wrapper | `src/app/(admin)/clients/page.tsx:2-3` → renders `Clients` |
| View | `src/views/Clients.tsx` (`const Clients`, `:31`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Data reads**: `clients` with nested `sites(id)` for the per-card site count
(`fetchSupabaseClients`, `Clients.tsx:71-94`, `from("clients").select("*, sites(id)")` `:72-74`),
sorted client-side.

**Data writes/mutations**:

| Action | Op | Line | Notes |
|---|---|---|---|
| Create client | validate with `clientSchema` (`:100`); upload logo to `client-logos` bucket (`:130-134`); `clients.insert([{...validated, created_by: user?.id}])` (`:145-155`) | | `created_by` set from `supabase.auth.getUser()` (`:118`) |
| Logo folder rename | download + re-upload + remove in `client-logos`, then `clients.update({logo_url})` (`:165-187`) | | uses inserted client id |
| Update client | optional logo upload to `client-logos` (`:257-261`); `clients.update({...formData, logo_url}).eq("id", editingClient.id)` (`:272-278`) | | |
| Delete logo | `client-logos.remove([filePath])` (`:315-317`) + `clients.update({logo_url:null})` (`:325-328`) | | |
| Delete client | `clients.delete().eq("id", id)` after `confirm()` (`:346`) | | no cascade handled here |

**DB gate**: writes hit `clients`, gated by **`Staff manage clients`** — the phase-1 staff predicate
`auth.uid() IS NOT NULL AND NOT has_role('Contractor') AND NOT has_role('Client')`
(`20260610120000_phase1_write_lockdown.sql`; superseded the earlier blanket policy per
`rls-policies-03.md:100`). SELECT is also served by `auth_read_clients` (any authenticated). The
`client-logos` storage bucket gate is in `02-data-model/triggers-enums-storage.md` (not re-derived
here).

**Security check**: writes correctly require staff (not Client/Contractor). `created_by` is
client-supplied from the session, not server-enforced (any staff user can set their own id; cannot
forge another's because `getUser()` returns the JWT subject). No privileged-escalation flag, but note
`clients.delete()` is staff-reachable with no tenant scoping (any staff user deletes any client) —
inherent to the single-tenant staff model. ⚠️ Client deletion does **not** clean up child
`sites`/`subsections`/etc. here; relies on DB cascade (not verified in this doc).

---

## 4. `/clients/[clientId]` — client detail

| | |
|---|---|
| Wrapper | `src/app/(admin)/clients/[clientId]/page.tsx:2-3` → renders `ClientDetail` |
| View | `src/views/ClientDetail.tsx` (`const ClientDetail`, `:58`) — reads `clientId` from `useParams()` (`:59`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Data reads**: one deeply-nested query in `fetchClientData`
(`ClientDetail.tsx:80-84`):
`clients.select("*, sites(*, subsections(*, subsection_documents(*)), inspections(*))").eq("id", clientId).maybeSingle()`
— pulls the full client→sites→subsections→documents and client→sites→inspections graph in one round
trip. RLS gates each nested table (`auth_read_clients`, `auth_read_subsections`,
`auth_read_subsection_documents`, role-manage `inspections`).

**Data writes/mutations** (all on `clients` + `client-logos` bucket):

| Action | Op | Line |
|---|---|---|
| Upload logo (camera/file) | `client-logos.upload(path, file, {upsert})` (`:114`) + `clients.update({logo_url}).eq('id', clientId)` (`:116-118`) |
| Delete logo | `clients.update({logo_url:null}).eq('id', clientId)` (`:133`) |
| Clear legacy URL | `clients.update({logo_url:null}).eq('id', clientId)` (`:170`) |

**DB gate**: same as §3 — `clients` writes gated by `Staff manage clients`.

**Security check**: read-only graph fetch + logo mutations, staff-gated by RLS. No flag.
Note: `clientId` from the URL is used directly in `.eq("id", clientId)` — RLS (not the param) is the
authorization boundary; a staff user can view any client by id (expected in single-tenant staff
model).

---

## 5. `/clients/[clientId]/sites` — site list (filtered by client)

| | |
|---|---|
| Wrapper | `src/app/(admin)/clients/[clientId]/sites/page.tsx:2-3` → renders `Sites` |
| View | `src/views/Sites.tsx` (`useParams()` → `clientId`, `:38`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

This is the **same `Sites` view** used by the sidebar `/sites` route, but here `clientId` is present so
it scopes to one client.

**Data reads**:
- `sites.select("*, clients(name)").order("name")` then `.eq("client_id", clientId)` **only when
  `clientId` present** (`Sites.tsx:58-62`) — so on this nested route the list is filtered to the URL
  client; on bare `/sites` it lists all sites.
- `clients.select("id, name").order("name")` (`:67`) for the create-site dropdown / breadcrumb.
- `site-images` bucket `createSignedUrl` per site image (`:82-83`).
- Breadcrumb renders client name + link `/clients/{clientId}` when filtering (`:181-185`).

**Data writes/mutations**:

| Action | Op | Line |
|---|---|---|
| Create site | `sites.insert([...])` — when `clientId` present, `client_id` is pre-filled from the URL (`:108-109`, insert `:128`) |
| Delete site | `sites.delete().eq("id", id)` (`:157`) |

**DB gate**: `sites` writes require `Admins can manage all sites` **or** `Users can manage all sites`
(`has_role('Admin')` / `has_role('User')`, `rls-policies-05.md:22,25`). SELECT via `auth_read_sites`
(any authenticated) + Client/Contractor scoped SELECTs.

**Security check** → see security_flag for `User`-role write breadth (a no-role staff user is admitted
by the layout but `sites` writes require Admin or User role, so a truly role-less user's insert/delete
would be **denied by RLS** — the one place the layout's fail-open is caught by the DB). The
client-side `clientId` only pre-fills `client_id`; nothing stops a staff user inserting a site for a
different `client_id` (RLS is role-gated, not tenant-gated).

---

## 6. `/clients/[clientId]/sites/[siteId]` — site detail

| | |
|---|---|
| Wrapper | `src/app/(admin)/clients/[clientId]/sites/[siteId]/page.tsx:2-3` → renders `SiteDetail` |
| View | `src/views/SiteDetail.tsx` (`useParams()` → `clientId, siteId`, `:49`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. Reads `?tab=` from `useSearchParams()` (`:60`). |

A 9-tab hub (Dashboard, Schematic, Asset Verification, Compliance, Documents, Subsections, QR Codes,
Fortress Checklist, Reports — `:621-658`). Heavy data layer.

**Data reads** (all `.eq("site_id", siteId)` / `.eq("id", siteId)` scoped):

| Source | Op | Line |
|---|---|---|
| `settings.company_logo_url` | select limit 1 maybeSingle | `:94-98` |
| `site_documents` | select by site | `:110-114` |
| `subsections` (ids) then `subsection_documents` (+ `document_categories(name)`) | select | `:127-151` |
| `inspection_templates` | select all | `:171-174` |
| `site_document_categories` | select by site (⚠️ untracked table) | `:187-191` |
| `sites` (+ `clients(id,name)`) | select by id maybeSingle | `:392-396` |
| `subsections` | select by site | `:400-404` |
| `inspections` | select by site | `:408-412` |
| `snags` | select by subsection ids | `:418-421` |
| `coc_validations` | select by subsection ids (latest-per-subsection) | `:428-432` |
| `site-images` bucket | createSignedUrl (private bucket) | `:455-457` |

**Data writes/mutations**:

| Action | Op | Line |
|---|---|---|
| Auto-seed default doc categories | `site_document_categories.insert([6 defaults])` if none exist | `:206-214` |
| Create doc category | `site_document_categories.insert({...})` | `:239-247` |
| Delete doc category | `site_documents.delete().eq('category_id')` + `site_document_categories.delete().eq('id')` | `:264-275` |
| Bulk delete all categories | `site_documents.delete().eq('site_id')` + `site_document_categories.delete().eq('site_id')` (after `confirm()`) | `:302-313` |
| Bulk delete docs in category | `site_documents.delete().eq('category_id')` (after `confirm()`) | `:342-345` |
| **Delete subsection (cascade)** | parallel deletes on `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `coc_validations`, `document_categories` (`:363-369`) then `subsections.delete().eq('id')` (`:375-378`) | `:357-388` |
| Delete site document | look up `file_url`, remove from `documents` bucket (`:529`), `site_documents.delete().eq('id')` (`:531`) | `:524-537` |
| Update site | `sites.update({...editFormData}).eq('id', site.id)` | `:543` |
| Upload site document | `documents` bucket upload (`:559`) + `site_documents.insert({...})` (`:562-565`) | `:553-574` |
| Create inspection | `inspections.insert({site_id, template_id, title, shop_name:"Site-wide: …", status:'Pending'})` (`:581-585`), then navigates to `?tab=inspections` (`:591`) | `:576-595` |

Sub-components rendered per tab carry their own data layers (e.g. `SchematicDiagram`,
`AssetVerification`, `ComplianceDashboard`, `FortressMarkingChecklist`, `QRAnalytics`, `SiteReports`,
`SiteEditDialog` — `:660-721`) — out of scope for this entry but they inherit the same staff session.

**DB gates**: `sites`/`subsections`/`inspections`/`snags`/`site_documents` → Admin/User role-manage
(`rls-policies-05.md`, `-04.md`). `document_categories` → blanket `FOR ALL` (any authenticated).
`subsection_documents` DELETE → Admin or original uploader only (`rls-policies-05.md:101`). `qr_scans`
and `site_document_categories` → **no tracked policy** (§11).

**Security check** → **security_flag**. The subsection-delete cascade (`:357-388`) and bulk-delete
operations issue raw `DELETE` across seven child tables under the staff session. For a `User`-role
user this is permitted by the role-manage policies; the blanket-`FOR ALL` tables (`document_categories`)
accept the delete from **any** authenticated user. There is no tenant/ownership check in code — the
`siteId`/`subsectionId` come from the URL and are trusted; authorization is entirely RLS-role based.
The `site_document_categories` auto-seed/insert/delete (`:206-214`, `:239`, `:264`, `:302`) hit a
table with no tracked RLS — actual enforcement **unverifiable from this repo** (§11).

---

## 7. `/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]` — subsection detail (+ `new`)

| | |
|---|---|
| Wrapper | `…/subsections/[subsectionId]/page.tsx:2-3` → renders `SubsectionDetail` |
| View | `src/views/SubsectionDetail.tsx` — delegates all logic to `useSubsectionDetail()` (`:19`) |
| Hook (data layer) | `src/views/subsection-detail/useSubsectionDetail.ts` (1769 lines; `useParams()` → `clientId, siteId, subsectionId`, `:39`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Inline `new` pseudo-route.** There is **no physical `subsections/new` page directory**; `SiteDetail`
navigates to `…/subsections/new` (`SiteDetail.tsx:703`), which matches the `[subsectionId]` segment
with `subsectionId === "new"`. `SubsectionDetail` branches on that and renders `CreateSubsectionForm`
instead of the detail (`SubsectionDetail.tsx:34-46`).

**`actualClientId` resolution (notable).** The hook does **not** trust the URL `clientId`. It resolves
the real client from the DB by joining subsection→site→client
(`useSubsectionDetail.ts:317-349`, `setActualClientId(supabaseSubsection.sites.clients.id)` `:348-349`)
and uses `actualClientId` for all breadcrumb/navigation links. The URL `clientId` is cosmetic.

**Data reads** (subsection-scoped, under staff session):

| Source | Op | Line(s) |
|---|---|---|
| `document_categories` | select by subsection (+ auto-seed defaults if empty, insert `:141-148`) | `:123-148` |
| `subsection_documents` | select COC fields by subsection | `:164-165` |
| `snags` | select by subsection | `:197-198` |
| `coc_validations` | select by subsection | `:215-216` |
| `coc_extractions` | select by subsection | `:234-235` |
| `inspection_templates` | select all | `:293-294` |
| `subsections` (+ nested `inspection_templates`, `sites!inner`→`clients!inner`) | select by id maybeSingle | `:317-340` |
| `subsections` | select `*` by id single | `:356-359` |
| `inspections` | select by subsection | `:366-368`, `:385-386` |
| `sites` (+ `clients(name)`) | select name/address | `:441-442` |
| `settings.company_logo_url` | select | `:463-464` |
| `documents` bucket | createSignedUrl (3600s) for COC/document preview | `:696-698`, `:806-808` |

**Data writes/mutations**:

| Action | Op | Line(s) |
|---|---|---|
| Create subsection (`new`) | `subsections.insert({...})` (`:981-991`) | |
| Update subsection | `subsections.update({...}).eq` | `:1025-1026`, `:1107-1108`, `:1167-1168` |
| **Delete subsection (cascade)** | parallel deletes on `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `coc_validations`, `document_categories` (`:1052-1058`) then `subsections.delete()` (`:1063-1064`) | |
| **COC validation** (edge function) | `supabase.functions.invoke('validate-coc', {...})` (`:563`, `:865`) after `auth.getSession()` (`:556`) | |
| **COC extraction** (edge function) | `supabase.functions.invoke('extract-coc', {...})` (`:710`) after `auth.getUser()` (`:708`) | |
| Persist validation result | `subsections.update(updateData)` (`:613-614`, `:840`); `subsection_documents.update(...)` (`:794`, `:849`, `:915`); insert validation report JSON to `documents` bucket + `subsection_documents.insert` (`:643-648`) | |
| Create COC doc category | `document_categories.insert({subsection_id, name, order_index})` | `:1245-1247` |
| Delete category | `subsection_documents.delete().eq('category_id')` + `document_categories.delete().eq('id')` | `:1263-1265` |
| Upload document | `documents` bucket upload (`:1302-1304`) + `subsection_documents.insert({...})` with `uploaded_by` from `getUser()` (`:1316-1321`) | |
| Delete document | look up `file_url`, `documents.remove([filePath])` (`:1369`) + `subsection_documents.delete()` (`:1376-1377`) | |
| Re-bucket docs to categories | `subsection_documents.update({category_id})` | `:1458-1459` |
| Create inspection | `inspections.insert({...})` (`:1501-1502`) → navigates to inspection detail | |
| Update inspection status | `inspections.update({status}).eq` | `:1547-1548` |
| Delete inspection | `inspections.delete().eq` | `:1564-1565` |
| Fix template links | `inspections.update({template_id})` | `:1603-1604` |

**Floor Plan tab** renders `InteractiveFloorPlan` (`SubsectionDetail.tsx:186`,
`src/components/InteractiveFloorPlan.tsx`), which:
- reads `subsection_floor_plans` (`:128`) + `floor_plan_pins` (`:78-80`, `:143-145`),
- subscribes to Supabase **realtime** channels on `floor_plan_pins` and `subsection_floor_plans`
  (`:65-66`, `:95-96`),
- uploads floor-plan images to `documents` bucket (`:184-186`) + `subsection_floor_plans.insert`
  (`:197-198`),
- updates/inserts pins on `floor_plan_pins` (`:228-229`, `:374-421`) and reads/writes
  `floor_plan_pin_comments` (`:457`).

**DB gates**:
- `subsections`/`inspections`/`snags` → Admin/User role-manage.
- `subsection_documents` → INSERT any authenticated; DELETE Admin or original uploader; UPDATE Admin
  only (`rls-policies-05.md:101`).
- `coc_validations`/`coc_extractions` → `Staff manage *` predicate (`rls-policies-03.md:185`, extractions
  block). The `validate-coc`/`extract-coc` edge functions write via **service_role** (RLS bypass) —
  their auth model is documented in the edge-functions chapter, not here.
- `document_categories`, `floor_plan_pins`, `floor_plan_pin_comments`, `subsection_floor_plans` →
  **blanket `FOR ALL` "All authenticated users full access"** (`rls-policies-02.md:103,123`,
  `-03.md:273`, `-05.md:118`). Any authenticated user reads AND writes these — no role or site scoping.
- `inspection_items` → blanket `FOR ALL` (`rls-policies-03.md:293`); the cascade delete at `:1054`
  hits it.

**Security check** → **security_flag**. (a) The floor-plan and pin tables (`floor_plan_pins`,
`subsection_floor_plans`, `floor_plan_pin_comments`, `document_categories`) accept reads and writes
from **any authenticated user** including logged-in `Client`/`Contractor` accounts — the
blanket-`FOR ALL` policies impose no tenant scoping, so a portal user who obtains a `subsectionId` can
manipulate another tenant's floor-plan pins via the same client API this view uses. (b) The
subsection cascade delete (`:1052-1064`) issues raw DELETE on `qr_scans` — a table with **no tracked
RLS policy** (§11); enforcement unverifiable. (c) `validate-coc`/`extract-coc` are invoked with the
user JWT but write via service_role; whether those functions re-check the caller's role/tenant is an
edge-function concern (cross-reference the functions chapter — out of scope here, flagged for the
orchestrator).

---

## 8. `…/subsections/[subsectionId]/inspections/[inspectionId]` — inspection detail

| | |
|---|---|
| Wrapper | `…/inspections/[inspectionId]/page.tsx:2-3` → renders `InspectionDetail` |
| View | `src/views/InspectionDetail.tsx` (2884 lines; `useParams()` → `clientId, siteId, subsectionId, inspectionId`, `:101`) |
| Group / guard | `(admin)` → `ProtectedRoute` (staff). No per-page guard. |

**Shared with the contractor portal — important.** `InspectionDetail` is rendered by **both** this
admin route and `(contractor)/contractor/inspections/[inspectionId]`. It distinguishes them purely by
the presence of URL params: `isContractorPortal = !clientId && !siteId && !subsectionId`
(`InspectionDetail.tsx:105`), and reads `?preview=` into `previewSiteId` (`:104`). On the admin route all
three params are present, so `isContractorPortal === false`. Error/redirect paths branch on this
(`:810-816`, `:831-837`). **The same data reads/writes below execute regardless of which group rendered
the view; the only boundary between admin and contractor is the layout guard + RLS, not the view.**

**Offline-first.** The view wraps `useOfflineInspectionDetail` (`:110-121`) and `useOfflineSync`
(`:123`); reads can come from cache (`cachedData.json_data`, `:189-205`) and writes are queued for
sync when offline. The online paths are below.

**Data reads**:

| Source | Op | Line(s) |
|---|---|---|
| `settings.company_logo_url` | select | `:259-260` |
| `snags` | select by inspection/subsection | `:282-283` |
| `inspections` (+ nested `sites`→`clients`, `subsections`) | select by id maybeSingle | `:769-790` |
| `inspection_templates` | select by `template_id` maybeSingle | `:845-849` |
| `site-images` bucket | createSignedUrl (private) | `:891-893` |

The main inspection payload is stored as a single JSON column `inspections.json_data`
(read at `:859`, mapped to form state `:861-876`).

**Data writes/mutations**:

| Action | Op | Line(s) |
|---|---|---|
| Add snag | `getUser()` (`:306`) then `snags.insert(snagData)` (`:321-322`) — `created_by`/`reported_by` from session |
| Update snag | `snags.update({...}).eq` | `:354-355` |
| Toggle snag status | `snags.update({status}).eq` | `:388-389` |
| Delete snag | `snags.delete().eq` | `:407-408` |
| **Save inspection section** | `inspections.update({ json_data: jsonDataWithTenants, ... }).eq` | `:554-555`, `:644-645`, `:500-502`, `:1500-1514` |
| Upload inspection photo | `auth.getSession()`/`refreshSession()` (`:583`,`:710`,`:745-750`) then `inspection-photos` bucket upload (`:680-682`, `:1190-1192`) + getPublicUrl (`:686-688`, `:1199-1201`); URLs stored inside `json_data` | |
| Delete inspection photo | `inspection-photos.remove([filePath])` (`:1407`) | |

**DB gates**:
- `inspections` → `Admins can manage all inspections` / `Users can manage all inspections`
  (`has_role('Admin')`/`has_role('User')`, `rls-policies-04.md:55-56`); plus Client/Contractor scoped
  SELECT and a **Contractor UPDATE** policy (added `20260219090420`, `rls-policies-04.md:49`) — this is
  how the shared view also works for contractors editing their own site's inspections.
- `snags` → Admin/User role-manage for writes (`rls-policies-05.md:43,46`); no Client/Contractor write
  path (they get scoped SELECT only).
- `inspection-photos`, `site-images` buckets → storage policies in
  `02-data-model/triggers-enums-storage.md` (not re-derived).

**Security check** → **security_flag (cross-context surface)**. Because the **same component** serves
admin and contractor routes and gates only on URL-param presence, the security boundary rests entirely
on (1) the layout guard of whichever group rendered it and (2) RLS. A contractor reaching this view via
`/contractor/inspections/[inspectionId]` writes through the Contractor UPDATE policy on `inspections`;
a staff user via the admin route writes through Admin/User role-manage. The risk is that `snags`
writes here require Admin/User role — a contractor (who only has inspection-UPDATE) calling the
snag-insert path (`:321`) would be **denied by RLS**, but the UI exposes the control regardless; a
role-less staff user admitted by the layout would also be denied `inspections.update` (needs Admin or
User role) — i.e. the layout fail-open is caught by RLS for these tables, *unlike* the blanket-FOR-ALL
tables in §7. No privileged action is reachable here without the corresponding role/policy, so this is
a defense-in-depth note, not a confirmed escalation.

---

## 9. Summary: routes covered

| # | Route | View | Mutating? | Notable DB boundary |
|---|---|---|---|---|
| 1 | `/dashboard` | `Dashboard` | no | read-only aggregates; activity_logs Admin-vs-own |
| 2 | `/calendar` | `Calendar` | yes | blanket `FOR ALL` calendar_events (any authenticated) |
| 3 | `/clients` | `Clients` | yes | `Staff manage clients` + client-logos bucket |
| 4 | `/clients/[clientId]` | `ClientDetail` | yes (logo) | full client graph read; `Staff manage clients` |
| 5 | `/clients/[clientId]/sites` | `Sites` | yes | sites Admin/User role-manage |
| 6 | `…/sites/[siteId]` | `SiteDetail` | yes (heavy) | site/subsection cascade deletes; untracked `site_document_categories` |
| 7 | `…/subsections/[subsectionId]` (+ inline `new`) | `SubsectionDetail` / `useSubsectionDetail` | yes (heavy) | blanket-`FOR ALL` floor-plan/pin/category tables; validate-coc/extract-coc edge fns; untracked `qr_scans` |
| 8 | `…/inspections/[inspectionId]` | `InspectionDetail` | yes | shared with contractor portal; json_data on `inspections`; inspection-photos bucket |

8 routes documented (plus the inline `subsections/new` pseudo-route handled within #7).

---

## 10. Cross-cutting observations

- **No server-side route guard anywhere.** Confirmed by §0 + the access-contexts doc: no
  `middleware.ts`, no server components in these pages. The client `ProtectedRoute` only bounces
  Client/Contractor; `User`/`Moderator`/no-role staff pass. The actual data boundary is RLS evaluated
  under the user JWT for every read/write listed above.
- **The layout fail-open is *partially* caught by RLS.** For role-gated tables
  (`sites`/`subsections`/`inspections`/`snags`/`clients`/`coc_*`) a no-role user's writes are denied
  (needs Admin/User/staff predicate). For **blanket `FOR ALL`** tables (`calendar_events`,
  `document_categories`, `floor_plan_pins`, `floor_plan_pin_comments`, `subsection_floor_plans`,
  `inspection_items`, `inspection_templates`) **any authenticated user**, including portal roles,
  reads and writes freely — these are the real exposure.
- **URL ids are never the authorization boundary.** Every `.eq("id", param)` / `.eq("site_id", param)`
  trusts the URL; only RLS decides. `SubsectionDetail` even re-derives the true `client_id` from the
  DB rather than the URL (`useSubsectionDetail.ts:348`).
- **Two views are shared across route groups:** `Sites` (admin `/sites` and `/clients/[clientId]/sites`)
  and `InspectionDetail` (admin and contractor). The latter is the more sensitive sharing.

---

## 11. Open questions / unverified

1. **`qr_scans` has no tracked schema.** `SiteDetail.tsx:367` and `useSubsectionDetail.ts:1056` issue
   `qr_scans.delete().eq('subsection_id', …)` inside the subsection cascade, but `02-data-model`
   records **no CREATE TABLE and no RLS policy** for `qr_scans` (`rls-policies-04.md`, "No such table
   exists … within ground-truth DDL it is absent"). Either the delete silently errors/no-ops, or the
   table exists only in the live project (created via dashboard). Cannot be verified from the repo.
2. **`site_document_categories` has no tracked RLS.** `SiteDetail.tsx` reads/auto-seeds/inserts/deletes
   this table (`:187`, `:206`, `:239`, `:264`, `:302`) but it is not in the data-model policy docs (the
   subsection-level analogue is `document_categories`, which *is* documented). Whether
   `site_document_categories` has RLS at all — and thus whether these staff writes are bounded — is
   unverifiable here. ⚠️ UNVERIFIED.
3. **`validate-coc` / `extract-coc` server auth.** Invoked from `useSubsectionDetail.ts:563,710,865`
   with the user JWT but write via service_role. Whether these functions re-validate the caller's role
   and tenant (the create-user-admin class) must be confirmed in the edge-functions chapter — out of
   scope for this routes doc, flagged for the orchestrator.
4. **Client/site deletion cascade.** `Clients.tsx:346` and `Sites.tsx:157` issue bare
   `clients.delete()` / `sites.delete()` with no app-level child cleanup; whether DB FKs cascade (vs.
   orphaning children or erroring) is not verified in this doc.
5. **Blanket-`FOR ALL` exposure to portal roles.** §7/§10 assert that a logged-in Client/Contractor can
   read/write `floor_plan_pins` etc. via the same supabase-js client. This follows from the policy
   definitions (USING/CHECK `true`) but was **not** empirically tested against a live portal session.
