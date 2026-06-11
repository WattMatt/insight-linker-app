# Access contexts and roles

Ground truth from code, 2026-06-11. Scope: the role model (`app_role`, `user_roles`, `profiles`,
`user_clients`, `user_sites`), the three role-gated route groups (`(admin)`, `(client-portal)`,
`(contractor)`), the hooks/guards that route users into them, the assignment data model, and the
admin preview/simulator surfaces. Public/token contexts (`/public`, `/review/[token]`,
`/portfolio/[token]`, `/download/[requestId]`) exist as sibling route trees (directory listing of
`src/app/`) but are out of scope here.

**There is no Next.js middleware** — neither `middleware.ts` nor `src/middleware.ts` exists
(verified by `ls`, 2026-06-11). All route guarding is client-side React; the only server-side
enforcement is Supabase RLS and edge-function checks.

---

## 1. Role model

### 1.1 `app_role` enum

| Value | Added by |
|---|---|
| `Admin` | `supabase/migrations/20251014120311_94cc9de8-04df-4b7b-a1ba-bd725399d5a6.sql:2` |
| `User` | same migration, line 2 |
| `Contractor` | same migration, line 2 |
| `Moderator` | `supabase/migrations/20251014172237_cf2b6c0e-4e10-4df0-abc2-8a96d54ef0ab.sql:2` |
| `Client` | `supabase/migrations/20251017054230_bf53246a-a037-4e22-8a74-1f4cfc594269.sql:2` |

### 1.2 `user_roles` table

Verbatim DDL (`supabase/migrations/20251014120311_…sql:5-11`):

```sql
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, role)
);
```

Note the constraint is `UNIQUE(user_id, role)` — the schema permits **multiple roles per user**,
but every reader in the app assumes at most one (`.maybeSingle()` in
`src/hooks/useUserRole.tsx:43`, `src/views/auth/useRoleRedirect.ts:20`,
`supabase/functions/invite-user/index.ts:50`). A user with two role rows would make these calls
error. ⚠️ UNVERIFIED whether any multi-role rows exist in production data.

RLS policies on `user_roles` — created once and never altered by a later migration (grep of
`ON public.user_roles` across `supabase/migrations/` matches only this file),
`supabase/migrations/20251014120311_…sql:33-61`:

```sql
CREATE POLICY "Users can view their own roles"  ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles"       ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins can insert roles"         ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins can update roles"         ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
CREATE POLICY "Admins can delete roles"         ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));
```

### 1.3 `has_role()` — the DB-side role check

Verbatim (`supabase/migrations/20251014120311_…sql:17-30`):

```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;
```

This function is the predicate of nearly all role-conditional RLS policies (examples cited in
sections 3–5).

### 1.4 `profiles` linkage

`profiles.id` is a PK referencing `auth.users(id)`
(`supabase/migrations/20251014114352_f0238ce6-…sql:2-8`). Columns added later that matter to
access flow: `status text DEFAULT 'Active'`
(`supabase/migrations/20251014120311_…sql:64`) and `onboarding_completed boolean DEFAULT false`
(`supabase/migrations/20260214023114_a056bc18-…sql:2-4`).

`profiles` SELECT policies: own profile + admin-all
(`supabase/migrations/20251016064350_7ace660c-…sql:12-23`); contractors own-profile-only
(`supabase/migrations/20251119090820_296d33c0-…sql:263-269`).

### 1.5 How roles are assigned

| Path | Mechanism | Citation |
|---|---|---|
| Signup trigger | `on_auth_user_created` AFTER INSERT ON `auth.users` runs `handle_new_user()` | trigger created `supabase/migrations/20251014114352_…sql:193-196`, recreated `20251020093607_800422ff-…sql:33-37` |
| Default role | Effective `handle_new_user()` (latest of 3 definitions): first-ever user gets `Admin`, all others `User` | `supabase/migrations/20260214023114_…sql:7-32` |
| Admin invite | `invite-user` edge function (service-role client). Verifies caller's JWT, requires caller's `user_roles.role = 'Admin'`, then inserts/updates the target's role; requires `clientId` for `Client` and ≥1 `siteIds` for `Contractor` | `supabase/functions/invite-user/index.ts:45-54` (admin check), `:60-67` (validation), `:253-290` (role write), `:292-307` (user_clients mapping) |
| Admin edit in UI | Users page mutation updates/inserts `user_roles` directly from the browser; enforced only by the admin-only RLS policies above | `src/views/Users.tsx:389-413` (mutation), role dropdown offers Admin/Moderator/User/Contractor/Client `src/views/Users.tsx:718-722`, `:1155-1159` |

---

## 2. Client-side role plumbing

### 2.1 `useUserRole` — `src/hooks/useUserRole.tsx`

- Exposes `UserRole = "Admin" | "Client" | "Contractor" | null` (`:5`). The DB enum also
  contains `User` and `Moderator`; the hook returns the raw value cast `as UserRole` (`:46`), so
  `"User"`/`"Moderator"` flow through the system as strings outside the declared type and fail
  every equality check against `"Admin"`/`"Client"`/`"Contractor"`.
- Tracks the auth user id via `supabase.auth.getUser()` + `onAuthStateChange`; on user change it
  purges the `user-role`, `onboarding-status`, and `user-client-info` query caches (`:18-29`).
- Query: `from("user_roles").select("role").eq("user_id", userId).maybeSingle()` (`:39-43`),
  5-minute `staleTime` (`:49`).

Same file also exports `useClientInfo(previewClientId?)` (`:54-89`): for `Admin` +
`previewClientId` it loads the chosen client directly from `clients` (`:64-76`); otherwise it
loads the caller's `user_clients` mapping with the joined client record (`:79-86`).

### 2.2 `useRoleRedirect` — `src/views/auth/useRoleRedirect.ts`

Single post-auth landing decision (`:15-33`): reads `user_roles` for the given user id, then

- `Client` → `/client-portal` (`:26-27`)
- `Contractor` → `/contractor` (`:28-29`)
- everything else, including no role row → `/dashboard` (`:30-31`)

Callers: `src/views/auth/Login.tsx:41,67,106,174`, `src/views/auth/ResetPassword.tsx:27,84`,
`src/views/auth/SetPassword.tsx:26,93`. The root page `/`
(`src/app/page.tsx:2-3` → `src/views/Index.tsx:10-28`) duplicates the same logic inline:
session + role lookup → same three destinations; no session → `/auth`
(`src/app/auth/page.tsx` renders `src/views/Auth.tsx`).

### 2.3 Shared guard infrastructure

- `useAuthSession` — session + loading state from `onAuthStateChange`/`getSession`
  (`src/components/auth/useAuthSession.ts:14-31`).
- `useOnboardingStatus(enabled)` — reads `profiles.onboarding_completed` for the current user
  (`src/components/auth/useOnboardingStatus.ts:10-25`).
- `OnboardingGate` — shows `OnboardingWizard` when `onboarding_completed` is falsy and not yet
  dismissed, but **always renders children alongside it** — it is an overlay, not a hard block
  (`src/components/auth/OnboardingGate.tsx:15-31`).
- `AuthOnlyRoute` — session-only guard, no role check (`src/components/AuthOnlyRoute.tsx:8-11`).

---

## 3. Context: admin/staff portal — route group `(admin)`

### 3.1 Routes

Directory listing of `src/app/(admin)/`: `calendar`, `clients`, `dashboard`,
`development-skills`, `feedback-management`, `inspection-templates`, `inspections`,
`offline-review`, `offline-sync-test`, `pdf-template-tests`, `portal-management`, `profile`,
`qr-codes`, `settings`, `site-assignments`, `sites`, `users`, `validation-feedback`.

### 3.2 Who gets in (client-side guard)

`src/app/(admin)/layout.tsx:12` wraps every page in `ProtectedRoute`
(`src/components/ProtectedRoute.tsx`):

- no session → `/auth/login` (`:14`)
- role `Contractor` → `/contractor` (`:15`)
- role `Client` → `/client-portal` (`:16`)
- everyone else is admitted — i.e. roles `Admin`, `User`, `Moderator`, **and users with no role
  row** (`userRole === null` passes both checks). Children render inside `OnboardingGate`
  (`:18-22`).

So the `(admin)` group is a **staff** context, not an Admin-only context. The distinction
Admin-vs-other-staff is made per-feature, not at the layout.

### 3.3 Database-side enforcement

- Admin-only objects use `has_role(auth.uid(), 'Admin'::app_role)` — e.g. all `user_roles`
  write policies (§1.2), `user_clients`/`user_sites` management (§6), assignment history
  (`supabase/migrations/20251119091647_…sql:16-20`).
- The `User` role carries blanket `FOR ALL` "manage all" policies on operational tables (sites,
  subsections, inspections, site_documents, floor_plan_pins, subsection_floor_plans, …) —
  `supabase/migrations/20251120111033_1e66f4c9-…sql:4-38`.
- The 2026-06-10 write lockdown introduced a "staff" predicate that deliberately mirrors
  `ProtectedRoute`: `auth.uid() IS NOT NULL AND NOT has_role(…,'Contractor') AND NOT
  has_role(…,'Client')` on `clients` / `coc_validations` writes
  (`supabase/migrations/20260610120000_phase1_write_lockdown.sql:36-48`, rationale in its header
  comment `:14-20`).

### 3.4 Nav / feature surface

Layout: sidebar + header ("Electrical Compliance") + `GlobalSearch`
(`src/app/(admin)/layout.tsx:15-22`). Sidebar menu (`src/components/AppSidebar.tsx:45-56`),
filtered so `adminOnly` items only render when `useUserRole() === 'Admin'` (`:156`):

| Item | URL | adminOnly |
|---|---|---|
| Dashboard | `/dashboard` | no |
| Calendar | `/calendar` | no |
| Clients | `/clients` | no |
| QR Codes | `/qr-codes` | no |
| Inspection Templates | `/inspection-templates` | no |
| Validation Feedback | `/validation-feedback` | no |
| Development Skills | `/development-skills` | no |
| Platform Testing | `/offline-sync-test` | yes |
| Feedback Management | `/feedback-management` | yes |
| Settings | `/settings` | yes |

Footer: My Profile → `/profile`, Logout (audit event then `signOut`)
(`src/components/AppSidebar.tsx:209-232`, `:112-123`).

Routes not in the sidebar (`/sites`, `/inspections`, `/users`, `/portal-management`,
`/site-assignments`, …) are reached through in-page links, e.g. Dashboard → `/sites`
(`src/views/Dashboard.tsx:256`), Users page → `/portal-management`
(`src/views/Users.tsx:664`), RecentAssignmentsWidget → `/site-assignments`
(`src/components/RecentAssignmentsWidget.tsx:110`). There is **no client-side check stopping a
`User`/`Moderator` from typing an adminOnly URL** — the sidebar filter is cosmetic; protection
for those pages is whatever RLS denies their queries.

---

## 4. Context: client portal — route group `(client-portal)`

### 4.1 Routes

`/client-portal`, `/client-portal/calendar`, `/client-portal/sites`,
`/client-portal/sites/[siteId]`, `/client-portal/subsections/[subsectionId]` (directory listing
of `src/app/(client-portal)/client-portal/`).

### 4.2 Who gets in (client-side guard)

`src/app/(client-portal)/layout.tsx:10-11` wraps pages in `ClientProtectedRoute` then
`ClientPortalLayout`. `src/components/ClientProtectedRoute.tsx`:

- no session → `/auth/login` (`:16`)
- **admin preview bypass:** role `Admin` + `?preview=<clientId>` query param → children render
  with no role match and no onboarding gate (`:12`, `:19`)
- any other non-`Client` role → `/dashboard` (`:20`)
- `Client` → children inside `OnboardingGate` (`:22-26`)

A user becomes a Client by (a) `user_roles.role = 'Client'` and (b) a row in `user_clients`
(1:1, `UNIQUE(user_id)` **and** `UNIQUE(client_id)` —
`supabase/migrations/20251017054255_cd78a557-…sql:4-11`). The invite-user function creates both
together (`supabase/functions/invite-user/index.ts:61-62`, `:292-307`).

### 4.3 Database-side enforcement

Helper (`supabase/migrations/20251017054255_…sql:30-41`):

```sql
CREATE OR REPLACE FUNCTION public.get_user_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT client_id FROM public.user_clients WHERE user_id = auth.uid() LIMIT 1;
$$;
```

Client SELECT policies, all of the shape `has_role(auth.uid(),'Client') AND <row belongs to
get_user_client_id()>`, on: `sites` (`:46-53`), `subsections` (`:56-65`), `inspections`
(`:68-77`), `site_documents` (`:80-89`), `subsection_documents` (`:92-104`), `calendar_events`
(matched by `site_name` — `:107-116`), `snags` (`:119-131`). Write access for clients on
`clients`/`coc_validations` is explicitly excluded by the staff predicate
(`supabase/migrations/20260610120000_…sql:36-48`).

### 4.4 Nav / feature surface

`ClientPortalLayout` (`src/components/ClientPortalLayout.tsx`): sidebar with Dashboard / Sites /
Calendar, each propagating the `?preview=` param when present (`:41-45`); header "Client Portal"
(`:201`); branding from the mapped client's `logo_url`/`company_name` via
`useClientInfo(previewClientId)` (`:31`, `:97-114`). Footer: My Profile → `/profile` (`:173`),
and Logout which in admin-preview mode becomes "Exit Preview" → `/portal-management`
(`:74-79`, `:183`).

Dashboard view consumes the preview param the same way
(`src/views/ClientPortalDashboard.tsx:15-16`) and threads it through every internal link
(`:220-324`).

**Cross-context quirk:** the My Profile link targets `/profile`, which lives in the `(admin)`
group (`src/app/(admin)/profile/page.tsx`) behind `ProtectedRoute`; for a `Client` that guard
immediately redirects back to `/client-portal` (`src/components/ProtectedRoute.tsx:16`). Same
applies to contractors (`:15`). Net effect derived from these two verified files: portal users
cannot actually reach the profile page. ⚠️ UNVERIFIED whether intentional.

---

## 5. Context: contractor portal — route group `(contractor)`

### 5.1 Routes

`/contractor`, `/contractor/inspections/[inspectionId]`,
`/contractor/subsections/[subsectionId]` (directory listing of
`src/app/(contractor)/contractor/`).

### 5.2 Who gets in (client-side guard)

`src/app/(contractor)/layout.tsx:9` wraps pages in `ContractorProtectedRoute`
(`src/components/ContractorProtectedRoute.tsx`):

- no session → `/auth/login` (`:18`)
- **admin preview bypass:** role `Admin` + `?preview=<siteId>` → children render directly
  (`:14`, `:19`)
- any other non-`Contractor` → `/dashboard` (`:20`)
- pathname must start with `/contractor`, else redirect to `/contractor` (`:21`)
- children render inside `OnboardingGate`, preceded by `OrphanResolutionModal` — blocks the
  portal until the contractor resolves orphan inspections they own; server-side guards live in
  the `resolve_my_orphan` / `archive_my_orphan` RPCs (comment + render at `:25-29`).

A user becomes a Contractor by `user_roles.role = 'Contractor'` plus rows in `user_sites`
(many-to-many, `UNIQUE(user_id, site_id)` —
`supabase/migrations/20251017061634_0f314109-…sql:2-8`). Invites require ≥1 site
(`supabase/functions/invite-user/index.ts:66-67`).

### 5.3 Database-side enforcement

`user_sites` policies: admin manage-all, self SELECT
(`supabase/migrations/20251017061634_…sql:13-23`). Contractor data policies all follow
`has_role(auth.uid(),'Contractor') AND site_id IN (SELECT site_id FROM user_sites WHERE
user_id = auth.uid())`: `inspections` SELECT + UPDATE (`:26-50`), `subsections` SELECT
(`:53-64`), `sites` SELECT (`:67-78`). Further contractor-scoped policies (own profile, own
activity logs, inspection templates read) in
`supabase/migrations/20251119090820_296d33c0-…sql:255-280`. Contractor writes to
`clients`/`coc_validations` are blocked by the staff predicate
(`supabase/migrations/20260610120000_…sql:36-48`).

### 5.4 Nav / feature surface

`ContractorPortalLayout` (`src/components/ContractorPortalLayout.tsx`): single nav item "Site
Overview" → `/contractor` (`:28-30`), preview param propagated (`:47-50`); header "Contractor
Portal"; an admin-preview banner ("You are viewing the contractor portal as an admin…") when
`Admin` + `?preview=` (`:196-201`); footer My Profile → `/profile` and Logout, which in preview
mode exits to `/portal-management` (`:69-74`).

The portal home (`src/views/ContractorPortal.tsx:17-18`) feeds `?preview=` into
`useContractorSites(previewSiteId)` (`src/hooks/useContractorSites.tsx:26-49`): admins
previewing get the single chosen site fetched directly from `sites` (`:36-49`); real
contractors get their `user_sites` joins (`:52-55`). Subsection links keep the preview param
(`src/views/ContractorPortal.tsx:254`).

---

## 6. Site / client assignments (admin surface + data)

### 6.1 Data

| Object | Shape | Citation |
|---|---|---|
| `user_clients` | 1 user ↔ 1 client org (`UNIQUE(user_id)`, `UNIQUE(client_id)`); RLS: admin ALL, self SELECT | `supabase/migrations/20251017054255_…sql:4-27` |
| `user_sites` | user ↔ site many-to-many (`UNIQUE(user_id, site_id)`); RLS: admin ALL, self SELECT | `supabase/migrations/20251017061634_…sql:2-23` |
| `user_sites_history` | append-only log (`action IN ('assigned','removed')`, `performed_by`); RLS: admin SELECT, any-authenticated INSERT (`WITH CHECK (true)`) | `supabase/migrations/20251119091647_…sql:2-26` |
| `log_user_site_assignment()` | SECURITY DEFINER trigger fn; AFTER INSERT/DELETE triggers on `user_sites` write history rows with `auth.uid()` as performer | same migration `:29-58` |

### 6.2 View

`src/views/SiteAssignments.tsx` — three tabs (`:424-438`):

1. **Contractor → Sites** — picks from users whose `user_roles.role = 'Contractor'` (`:79-98`),
   inserts/deletes `user_sites` rows directly from the browser (`:302-342`); duplicates blocked
   client-side (`:368-376`); admin-only via the `user_sites` RLS.
2. **Sites → Clients** — read-only grouping of `sites` by owning client org (`:566-631`).
3. **Users → Clients** — picks users with role `Client` (`:101-120`), inserts/deletes
   `user_clients` rows (`:263-299`).

Plus a "Contractor Assignment History" panel reading the latest 50 `user_sites_history` rows
(`:221-260`).

Routing: **both** `/site-assignments` and `/portal-management` render the same
`PortalManagement` component (`src/app/(admin)/site-assignments/page.tsx`,
`src/app/(admin)/portal-management/page.tsx` — each is a 3-line wrapper importing
`@/views/PortalManagement`). `SiteAssignments` itself appears only as the "Assignments" tab
inside it. The Users page also manages a contractor's sites directly
(`src/views/Users.tsx:425+`, `updateContractorSitesMutation` deletes then re-inserts
`user_sites`).

---

## 7. Admin preview & simulator surfaces

### 7.1 PortalManagement hub

`src/views/PortalManagement.tsx:18-52` — four tabs: Access Links (`AccessLinkGenerator`,
`src/components/client-portal/AccessLinkGenerator.tsx`), Client Simulator, Contractor
Simulator, Assignments.

### 7.2 ClientAccessSimulator — `src/views/ClientAccessSimulator.tsx`

Selects a user with role `Client` (`:30-50`), looks up their `user_clients.client_id`
(`:59-63`), then computes accessible-vs-total counts for sites / subsections /
subsection_documents by **filtering on `client_id` under the admin's own session**
(`:76-120`). It does not impersonate the client or evaluate RLS as that user — it approximates
what client RLS would yield by replicating the filter. Renders per-category access cards and a
summary table (`:139-289` region).

### 7.3 ContractorAccessSimulator — `src/views/ContractorAccessSimulator.tsx`

Same pattern for contractors: role-filtered user list (`:30-54`), their `user_sites`
assignments rendered as a table (`:57-71`, `:193-239`), accessible-vs-total counts for sites /
subsections / inspections / site_documents / subsection_floor_plans derived from the assigned
site ids (`:74-136`). Flags 100% site access as a security risk and 0% as no-access
(`:293-312`). The on-screen claim "simulates contractor access based on RLS policies" (`:156`)
is a filter-based approximation, same caveat as above.

### 7.4 AdminClientPreview / AdminContractorPreview — orphaned views

- `src/views/AdminClientPreview.tsx` — client dropdown, then link
  `/client-portal?preview=<clientId>` opened in a new tab (`:116`).
- `src/views/AdminContractorPreview.tsx` — paginated site cards, "Preview as Contractor" button
  → `navigate("/contractor?preview=<siteId>")` (`:155`).

**Neither view is imported by any page or component** — grep for `AdminClientPreview` /
`AdminContractorPreview` across `src/` matches only the definition files (verified 2026-06-11).
They are the only code that *generates* preview URLs; the preview *consumers* (the
`?preview=` handling in `ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:19`,
`useClientInfo`, `useContractorSites`, both portal layouts, and the contractor-preview path in
`AdminContractorPreview`-less flows) remain live and reachable by manually constructing the URL
as an Admin.

### 7.5 Preview semantics

In preview mode the admin is **not** seeing the data through the target user's RLS. The guards
merely skip the role check (`ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:19`);
data hooks then branch on `userRole === "Admin" && previewId` and fetch the chosen
client/site directly under the admin's own (broader) policies
(`src/hooks/useUserRole.tsx:64-76`, `src/hooks/useContractorSites.tsx:36-49`). Anything a page
fetches without applying the preview filter shows admin-scope data. ⚠️ UNVERIFIED whether every
client-portal/contractor page consistently applies the preview filter (per-page audit belongs
to chapter 04).

---

## 8. Summary matrix

| Context | Landing rule | Client guard | DB boundary | Nav surface |
|---|---|---|---|---|
| `(admin)` staff portal | role ∉ {Client, Contractor} → `/dashboard` (`useRoleRedirect.ts:30-31`) | `ProtectedRoute` — bounces Client/Contractor out (`ProtectedRoute.tsx:15-16`) | `has_role('Admin')` policies; `User`-role manage-all (`20251120111033`); staff predicate (`20260610120000`) | `AppSidebar` 10 items, 3 Admin-only (`AppSidebar.tsx:45-56,156`) |
| `(client-portal)` | role = Client → `/client-portal` (`useRoleRedirect.ts:26-27`) | `ClientProtectedRoute` — non-Client → `/dashboard`; Admin+`?preview` bypass (`:19-20`) | `has_role('Client') AND get_user_client_id()` policies (`20251017054255`) | Dashboard / Sites / Calendar (`ClientPortalLayout.tsx:41-45`) |
| `(contractor)` | role = Contractor → `/contractor` (`useRoleRedirect.ts:28-29`) | `ContractorProtectedRoute` — non-Contractor → `/dashboard`; Admin+`?preview` bypass; path containment; orphan modal (`:19-28`) | `has_role('Contractor') AND site_id IN user_sites` policies (`20251017061634`) | Single "Site Overview" item (`ContractorPortalLayout.tsx:28-30`) |

---

## Open questions

1. **Orphaned preview views.** `AdminClientPreview.tsx` and `AdminContractorPreview.tsx` are
   unreferenced by any route or component. Are they pending deletion, or pending re-wiring into
   PortalManagement? Code alone cannot say. (Contractor preview URLs are now only constructible
   by hand; the consumer plumbing still works.)
2. **`Moderator` role purpose.** The enum value exists
   (`20251014172237`) and exactly one policy references it
   (`supabase/migrations/20260109105319_…sql:48`, joint with `User`); it is offered in the
   Users-page role dropdown (`src/views/Users.tsx:719`) but has no dedicated surface, guard, or
   policy set. Intended semantics unknown.
3. **`User` role scope.** `User` is the signup default (`20260214023114`) and holds blanket
   `FOR ALL` policies on core operational tables (`20251120111033`) while the sidebar hides
   only three items from them — is `User` meant to be near-Admin staff, and should the
   admin-only URLs (`/settings`, `/users`, `/portal-management`) have client-side or RLS
   protection beyond per-table policies? Cannot be resolved from code.
4. **Multi-role rows.** Schema allows several `user_roles` rows per user
   (`UNIQUE(user_id, role)`), but `useUserRole.tsx:43`, `useRoleRedirect.ts:20`, and
   `invite-user/index.ts:50` all use `maybeSingle()` and would error on duplicates. Is the
   1-role-per-user invariant enforced anywhere besides convention? No DB constraint found.
5. **`/profile` unreachable from portals.** Client/Contractor sidebars link to `/profile`,
   which sits in the `(admin)` group whose guard bounces them back (§4.4). Intended?
6. **No-role users in the staff portal.** A user whose `user_roles` row is missing passes
   `ProtectedRoute` (both redirect checks compare against specific roles) and lands in the
   staff layout with whatever RLS denies/allows. Is that intended fallback behavior?
7. **Production-state drift.** Effective DB state includes SQL applied outside
   `supabase/migrations/` (`docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`,
   applied 2026-06-11, demotes anon `USING (true)` SELECT policies to `authenticated`). It does
   not name role tables, but whether prod policies now exactly match the migration files cannot
   be verified from this repo.
8. **Preview filter coverage.** Whether every page under `(client-portal)`/`(contractor)`
   consistently applies the `?preview=` filter to all its queries (§7.5) needs the per-route
   audit in chapter 04.
