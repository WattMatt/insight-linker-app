# Access contexts and roles

Ground truth from code, validated 2026-06-11. Scope: the role model (`app_role`, `user_roles`,
`profiles`, `user_clients`, `user_sites`), the three role-gated route groups (`(admin)`,
`(client-portal)`, `(contractor)`), the hooks/guards that route users into them, the assignment
data model, and the admin preview/simulator surfaces. Public/token contexts (`/public`,
`/review/[token]`, `/portfolio/[token]`, `/download/[requestId]`) exist as sibling route trees but
are out of scope here.

**There is no Next.js middleware** — neither `middleware.ts` nor `src/middleware.ts` exists
(verified by `ls`, 2026-06-11). All route guarding is client-side React; the only server-side
enforcement is Supabase RLS and edge-function checks.

**Citation note.** Migration filenames are abbreviated with `…` after the timestamp + leading hash
segment (e.g. `20251014120311_94cc9de8-…sql`); the full UUIDs are in
`supabase/migrations/`. Line numbers are 1-based against the files as they exist 2026-06-11.

---

## 1. Role model

### 1.1 `app_role` enum

| Value | Added by |
|---|---|
| `Admin` | `supabase/migrations/20251014120311_94cc9de8-…sql:2` (`CREATE TYPE … AS ENUM ('Admin','User','Contractor')`) |
| `User` | same line 2 |
| `Contractor` | same line 2 |
| `Moderator` | `supabase/migrations/20251014172237_cf2b6c0e-…sql:2` (`ALTER TYPE … ADD VALUE IF NOT EXISTS 'Moderator'`) |
| `Client` | `supabase/migrations/20251017054230_bf53246a-…sql:2` (`ALTER TYPE … ADD VALUE IF NOT EXISTS 'Client'`) |

Five enum values total. The TypeScript `UserRole` type only declares three of them (§2.1).

### 1.2 `user_roles` table

Verbatim DDL (`supabase/migrations/20251014120311_94cc9de8-…sql:5-11`):

```sql
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, role)
);
```

The constraint is `UNIQUE(user_id, role)` — the schema permits **multiple roles per user**, but
every reader assumes at most one (`.maybeSingle()` in `src/hooks/useUserRole.tsx:43`,
`src/views/auth/useRoleRedirect.ts:20`, `src/views/Index.tsx:17`,
`supabase/functions/invite-user/index.ts:50`). A user with two role rows would make those calls
error (PostgREST returns 406 on `.maybeSingle()` with >1 row). ⚠️ UNVERIFIED whether any multi-role
rows exist in production data.

RLS policies on `user_roles` — created once and never altered by a later migration (grep of
`ON public.user_roles` across `supabase/migrations/` matches only this file),
`supabase/migrations/20251014120311_94cc9de8-…sql:33-61`:

```sql
CREATE POLICY "Users can view their own roles"  ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);   -- :33-37
CREATE POLICY "Admins can view all roles"       ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'Admin'));        -- :39-43
CREATE POLICY "Admins can insert roles"         ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'Admin'));   -- :45-49
CREATE POLICY "Admins can update roles"         ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));        -- :51-55
CREATE POLICY "Admins can delete roles"         ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'Admin'));        -- :57-61
```

A non-Admin can read only their own `user_roles` row; only Admins can write any. There is **no
self-INSERT** policy — the only way an unprivileged user gets a role row is the signup trigger (§1.5).

### 1.3 `has_role()` — the DB-side role check

Verbatim (`supabase/migrations/20251014120311_94cc9de8-…sql:17-30`):

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

`SECURITY DEFINER` + `SET search_path` is the standard Supabase pattern to let any caller test a
role without granting them read access to all of `user_roles`. This function is the predicate of
nearly all role-conditional RLS policies (examples in §3–5).

### 1.4 `profiles` linkage

`profiles.id` is a PK referencing `auth.users(id) ON DELETE CASCADE`
(`supabase/migrations/20251014114352_f0238ce6-…sql:2-8`). Columns added later that matter to access
flow:

| Column | Default | Citation |
|---|---|---|
| `status text` | `'Active'` | `supabase/migrations/20251014120311_94cc9de8-…sql:64` |
| `onboarding_completed boolean` | `false` | `supabase/migrations/20260214023114_a056bc18-…sql:2-4` |

`profiles` SELECT policies:
- own profile + admin-all (`supabase/migrations/20251016064350_7ace660c-…sql:12-23`):
  `USING (auth.uid() = id)` and `USING (has_role(auth.uid(),'Admin'::app_role))`.
- contractors own-profile-only (`supabase/migrations/20251119090820_296d33c0-…sql:263-269`):
  `USING (has_role(auth.uid(),'Contractor') AND id = auth.uid())`.

The original base migration had a public `FOR SELECT USING (true)` on profiles
(`20251014114352_f0238ce6-…sql:77-79`), dropped and replaced by the 2025-10-16 lockdown above
(`20251016064350_7ace660c-…sql:9`).

### 1.5 How roles are assigned

| Path | Mechanism | Citation |
|---|---|---|
| Signup trigger | `on_auth_user_created` AFTER INSERT ON `auth.users` runs `handle_new_user()` | trigger created `20251014114352_f0238ce6-…sql:193-196`; dropped+recreated `20251020093607_800422ff-…sql:32-39` |
| Default role | **Effective** `handle_new_user()` is the latest of three definitions: first-ever user (`COUNT(*) FROM auth.users = 1`) gets `Admin`, all others get `User` | `20260214023114_a056bc18-…sql:7-32` (role CASE at `:24-27`) |
| Admin invite (new user) | `invite-user` edge function (service-role client). Verifies caller's JWT, requires caller's `user_roles.role = 'Admin'`, validates `clientId` for `Client` / `siteIds` for `Contractor`, then writes role + mappings | admin check `:38-54`, validation `:60-68`, new-user role write `:267-304`, `user_clients` insert `:307-321`, `user_sites` insert `:324-340` |
| Admin invite (resend / existing user) | Same function, `isResend` branch: updates/inserts role `:121-136`, updates/inserts `user_clients` `:139-157`, deletes+reinserts `user_sites` `:160-178` | `supabase/functions/invite-user/index.ts:90-178` |
| Admin edit in UI | Users page mutations update/insert `user_roles` directly from the browser; enforced only by the admin-only RLS policies in §1.2 | `src/views/Users.tsx:389-423` (`updateRoleMutation` upsert); role dropdowns offer Admin/Moderator/User/Contractor/Client at `:718-722` (invite dialog) and `:1155-1159` (edit dialog) |

**Default-role history (three `handle_new_user` definitions):**

| Migration | Default for non-first user | Note |
|---|---|---|
| `20251014114352_f0238ce6-…sql:175-190` | `Admin` (line 24, with a "change to Client/Contractor" comment) | original |
| `20251020093607_800422ff-…sql:1-30` | `Admin` (line 24, same comment) | recreated trigger |
| `20260214023114_a056bc18-…sql:7-32` | `User` (line 26) | "Fix … to assign 'User' role by default (not 'Admin')" — **current** |

The `invite-user` function defensively handles the case where the signup trigger already created a
role row (`:267-272` reads existing role; `:274-304` updates if different, else inserts).

---

## 2. Client-side role plumbing

### 2.1 `useUserRole` — `src/hooks/useUserRole.tsx`

- Exposes `export type UserRole = "Admin" | "Client" | "Contractor" | null` (`:5`). The DB enum also
  contains `User` and `Moderator`; the hook returns the raw DB value cast `as UserRole` (`:46`), so
  `"User"`/`"Moderator"` flow through the system as strings outside the declared union and fail
  every equality check against `"Admin"`/`"Client"`/`"Contractor"`.
- Tracks the auth user id via `supabase.auth.getUser()` + `onAuthStateChange` (`:11-32`); when the
  user id changes it purges the `user-role`, `onboarding-status`, and `user-client-info` query
  caches (`:21-28`).
- Query: `from("user_roles").select("role").eq("user_id", userId).maybeSingle()` (`:39-43`);
  `enabled: !!userId` (`:48`), `staleTime` 5 min (`:49`), `gcTime` 10 min (`:50`).

Same file also exports `useClientInfo(previewClientId?)` (`:54-89`):
- for `Admin` + `previewClientId` it loads the chosen client directly from `clients` (`:64-76`);
- otherwise it loads the caller's `user_clients` mapping with the joined client record (`:79-86`,
  `.maybeSingle()`).

### 2.2 `useRoleRedirect` — `src/views/auth/useRoleRedirect.ts`

Single post-auth landing decision (`redirectByRole`, `:15-33`): reads `user_roles` for the given
user id (`.maybeSingle()`, `:16-20`), then:

- `Client` → `/client-portal` (`:26-27`)
- `Contractor` → `/contractor` (`:28-29`)
- everything else, **including no role row** → `/dashboard` (`:30-31`)

Callers (grep, 2026-06-11): `src/views/auth/Login.tsx`, `src/views/auth/ResetPassword.tsx`,
`src/views/auth/SetPassword.tsx`. The root page `/` (`src/app/page.tsx` → `src/views/Index.tsx`)
duplicates the same landing logic inline (`Index.tsx:8-31`): `getSession` → role lookup → same three
destinations (`:19-25`); no session → `/auth` (`:27`). The auth route renders `src/views/Auth.tsx`
(`src/app/auth/page.tsx`).

### 2.3 Shared guard infrastructure

- `useAuthSession` — session + loading state from `onAuthStateChange` + `getSession`
  (`src/components/auth/useAuthSession.ts:14-31`).
- `useOnboardingStatus(enabled)` — reads `profiles.onboarding_completed` for the current user
  (`src/components/auth/useOnboardingStatus.ts:10-25`).
- `OnboardingGate` — shows `OnboardingWizard` when `onboarding_completed` is falsy and not yet
  locally dismissed, but **always renders `children` alongside it** — it is an overlay, not a hard
  block (`src/components/auth/OnboardingGate.tsx:15-32`).
- `AuthOnlyRoute` — session-only guard, no role check; no session → `/auth/login`
  (`src/components/AuthOnlyRoute.tsx:5-13`).

The three role guards (`ProtectedRoute`, `ClientProtectedRoute`, `ContractorProtectedRoute`) all
compose these same four primitives.

---

## 3. Context: admin/staff portal — route group `(admin)`

### 3.1 Routes

Directory listing of `src/app/(admin)/` (2026-06-11): `calendar`, `clients`, `dashboard`,
`development-skills`, `feedback-management`, `inspection-templates`, `inspections`, `offline-review`,
`offline-sync-test`, `pdf-template-tests`, `portal-management`, `profile`, `qr-codes`, `settings`,
`site-assignments`, `sites`, `users`, `validation-feedback` (18 segments), plus `layout.tsx`.

### 3.2 Who gets in (client-side guard)

`src/app/(admin)/layout.tsx:12` wraps every page in `ProtectedRoute`
(`src/components/ProtectedRoute.tsx`):

- loading → `<AuthLoading variant="spinner" />` (`:13`)
- no session → `/auth/login` (`:14`)
- role `Contractor` → `/contractor` (`:15`)
- role `Client` → `/client-portal` (`:16`)
- everyone else is admitted — i.e. roles `Admin`, `User`, `Moderator`, **and users with no role
  row** (`userRole === null` passes both equality checks). Children render inside `OnboardingGate`
  (`:18-22`).

So the `(admin)` group is a **staff** context, not an Admin-only context. The Admin-vs-other-staff
distinction is made per-feature, not at the layout.

### 3.3 Database-side enforcement

- Admin-only objects use `has_role(auth.uid(), 'Admin'::app_role)` — e.g. all `user_roles` write
  policies (§1.2), `user_clients`/`user_sites` management (§6), assignment-history SELECT
  (`20251119091647_56f5417f-…sql:16-20`).
- The `User` role carries blanket `FOR ALL` "manage all" policies on operational tables —
  `sites`, `subsections`, `inspections`, `site_documents`, `floor_plan_pins`,
  `subsection_floor_plans`, `document_categories`, `snags`, `inspection_items` (9 tables) —
  `supabase/migrations/20251120111033_1e66f4c9-…sql:4-56` (each policy `USING/​WITH CHECK
  has_role(auth.uid(),'User'::app_role)`).
- The 2026-06-10 write lockdown introduced a "staff" predicate that deliberately mirrors
  `ProtectedRoute`:

  ```sql
  auth.uid() IS NOT NULL
  AND NOT public.has_role(auth.uid(), 'Contractor'::app_role)
  AND NOT public.has_role(auth.uid(), 'Client'::app_role)
  ```

  applied (both `USING` and `WITH CHECK`) to `FOR ALL` write policies on `clients` (`:35-48`),
  `coc_validations` (`:56-69`), and `coc_extractions` (`:84-97`) —
  `supabase/migrations/20260610120000_phase1_write_lockdown.sql`; rationale in its header comment
  (`:13-25`), which explicitly states the predicate mirrors `src/components/ProtectedRoute.tsx`.

### 3.4 Nav / feature surface

Layout: sidebar + sticky header (`<h1>Electrical Compliance</h1>`) + `GlobalSearch`
(`src/app/(admin)/layout.tsx:15-22`). Sidebar = `src/components/AppSidebar.tsx`; `menuItems` array
(`:45-56`), filtered so `adminOnly` items only render when `useUserRole() === 'Admin'` (`:155-156`):

| Item | URL | adminOnly |
|---|---|---|
| Dashboard | `/dashboard` | no |
| Calendar | `/calendar` | no |
| Clients | `/clients` | no |
| QR Codes | `/qr-codes` | no |
| Inspection Templates | `/inspection-templates` | no |
| Validation Feedback | `/validation-feedback` | no |
| Development Skills | `/development-skills` | no |
| Platform Testing | `/offline-sync-test` | **yes** |
| Feedback Management | `/feedback-management` | **yes** |
| Settings | `/settings` | **yes** |

Footer (`:208-232`): My Profile → `/profile` (`:216`), Logout (`recordAuthEvent("logout")` then
`supabase.auth.signOut()` then `/auth/login`, handler `:112-123`). The sidebar header company name
falls back to `"SiteWise"` (`:144`) when no `settings.company_name`.

Routes not in the sidebar (`/sites`, `/inspections`, `/users`, `/portal-management`,
`/site-assignments`, `/clients`-detail, …) are reached through in-page links, e.g. Dashboard →
`/sites` (`src/views/Dashboard.tsx:256`), Users page → `/portal-management`
(`src/views/Users.tsx:664`), RecentAssignmentsWidget → `/site-assignments`
(`src/components/RecentAssignmentsWidget.tsx:110`). **There is no client-side check stopping a
`User`/`Moderator` from typing an `adminOnly` URL** — the sidebar filter is cosmetic; protection for
those pages is whatever RLS denies their queries.

---

## 4. Context: client portal — route group `(client-portal)`

### 4.1 Routes

`/client-portal`, `/client-portal/calendar`, `/client-portal/sites`,
`/client-portal/sites/[siteId]`, `/client-portal/subsections/[subsectionId]` (directory listing of
`src/app/(client-portal)/client-portal/`).

### 4.2 Who gets in (client-side guard)

`src/app/(client-portal)/layout.tsx:10-12` wraps pages in `ClientProtectedRoute` → `ClientPortalLayout`.
`src/components/ClientProtectedRoute.tsx`:

- loading → `<AuthLoading variant="skeleton" />` (`:15`)
- no session → `/auth/login` (`:16`)
- **admin preview bypass:** role `Admin` + `?preview=<clientId>` query param → `return <>{children}</>`
  with no role match and no onboarding gate (`:12`, `:19`)
- any other non-`Client` role → `/dashboard` (`:20`)
- `Client` → children inside `OnboardingGate` (`:22-26`)

A user becomes a Client by (a) `user_roles.role = 'Client'` and (b) a row in `user_clients` (1:1,
`UNIQUE(user_id)` **and** `UNIQUE(client_id)` — `20251017054255_cd78a557-…sql:4-11`). The
`invite-user` function creates role + mapping together (`index.ts:307-321` new-user path,
`:139-157` resend path).

### 4.3 Database-side enforcement

Helper (`20251017054255_cd78a557-…sql:30-41`):

```sql
CREATE OR REPLACE FUNCTION public.get_user_client_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT client_id FROM public.user_clients WHERE user_id = auth.uid() LIMIT 1;
$$;
```

Client SELECT policies, all of the shape `has_role(auth.uid(),'Client') AND <row belongs to
get_user_client_id()>`, in `20251017054255_cd78a557-…sql`:

| Table | Match predicate | Lines |
|---|---|---|
| `sites` | `client_id = get_user_client_id()` | `:46-53` |
| `subsections` | `site_id IN (SELECT id FROM sites WHERE client_id = get_user_client_id())` | `:56-65` |
| `inspections` | same site-scoping subquery | `:68-77` |
| `site_documents` | same site-scoping subquery | `:80-89` |
| `subsection_documents` | subsection→site→client subquery | `:92-104` |
| `calendar_events` | `site_name IN (SELECT name FROM sites WHERE client_id = get_user_client_id())` | `:107-116` |
| `snags` | subsection→site→client subquery | `:119-131` |

`user_clients` RLS: admin `FOR ALL` + self SELECT (`:17-27`). These are all **SELECT-only** for
Clients; there is no client write policy on any operational table. Client writes to
`clients`/`coc_validations`/`coc_extractions` are explicitly excluded by the staff predicate
(`20260610120000_phase1_write_lockdown.sql:35-97`).

⚠️ Note: `calendar_events` is matched by site **name** string equality (`:113`), not a foreign key —
fragile if two clients own sites with identical names. Not verified against production data.

### 4.4 Nav / feature surface

`ClientPortalLayout` (`src/components/ClientPortalLayout.tsx`): sidebar with Dashboard / Sites /
Calendar, each propagating the `?preview=` param when present (`menuItems`, `:41-45`); header
`<h1>Client Portal</h1>` (`:201`); branding from the mapped client's `logo_url`/`company_name` via
`useClientInfo(previewClientId)` (`:31`, header render `:97-114`). Footer: My Profile → `/profile`
(`:173`); Logout which in admin-preview mode is relabeled "Exit Preview" and navigates to
`/portal-management` instead of signing out (handler `:73-89`, label `:182-184`).

Dashboard view consumes the preview param the same way (`src/views/ClientPortalDashboard.tsx:14-16`)
and threads it through every internal link (`:189-324`).

**Cross-context quirk:** the My Profile link targets `/profile`, which lives in the `(admin)` group
(`src/app/(admin)/profile/page.tsx` → `@/views/MyProfile`) behind `ProtectedRoute`; for a `Client`
that guard immediately redirects back to `/client-portal` (`ProtectedRoute.tsx:16`). Same applies to
contractors (`:15`). Net effect derived from these verified files: portal users cannot actually
reach the profile page. ⚠️ UNVERIFIED whether intentional.

---

## 5. Context: contractor portal — route group `(contractor)`

### 5.1 Routes

`/contractor`, `/contractor/inspections/[inspectionId]`, `/contractor/subsections/[subsectionId]`
(directory listing of `src/app/(contractor)/contractor/`).

### 5.2 Who gets in (client-side guard)

`src/app/(contractor)/layout.tsx:9` wraps pages in `ContractorProtectedRoute`
(`src/components/ContractorProtectedRoute.tsx`):

- loading → `<AuthLoading variant="skeleton" />` (`:17`)
- no session → `/auth/login` (`:18`)
- **admin preview bypass:** role `Admin` + `?preview=<siteId>` → `return <>{children}</>` (`:14`, `:19`)
- any other non-`Contractor` → `/dashboard` (`:20`)
- pathname must start with `/contractor`, else redirect to `/contractor` (`:21`)
- children render inside `OnboardingGate`, preceded by `<OrphanResolutionModal />` (`:23-30`) — a
  force-at-login modal that blocks the portal until the contractor resolves orphan inspections
  (`inspection_id` with `subsection_id IS NULL`) they own.

A user becomes a Contractor by `user_roles.role = 'Contractor'` plus rows in `user_sites`
(many-to-many, `UNIQUE(user_id, site_id)` — `20251017061634_0f314109-…sql:2-8`). Invites require ≥1
site (`invite-user/index.ts:66-67`).

**Orphan-resolution RPCs — server contract is NOT in this repo's migrations.** The modal/hook call
`supabase.rpc("resolve_my_orphan", …)` (`src/hooks/useUnresolvedOrphans.ts:94`) and
`supabase.rpc("archive_my_orphan", …)` (`:113`); the view `public.my_unresolved_orphans` and both
RPCs (`SECURITY DEFINER`, `authenticated`) are documented in the file's server-contract comment
(`:4-20`) as living in the live Supabase project, with full SQL "see
docs/integrity-audit/force-at-login-resolution.md". The repo migration that touches orphans
(`20260519045946_ff0d3334-…sql`) defines **different** functions (`resolve_inspection_subsection`,
`inspections_auto_link_subsection`, `normalize_shop_key`) and a one-time backfill — not
`resolve_my_orphan`/`archive_my_orphan`. ⚠️ The comment in `ContractorProtectedRoute.tsx:27` ("Server-side
guards in resolve_my_orphan / archive_my_orphan RPCs") is therefore accurate in intent but the SQL
cannot be verified from this repo.

### 5.3 Database-side enforcement

`user_sites` policies: admin `FOR ALL` manage-all, self SELECT
(`20251017061634_0f314109-…sql:13-23`). Contractor data policies all follow
`has_role(auth.uid(),'Contractor') AND site_id IN (SELECT site_id FROM user_sites WHERE user_id =
auth.uid())`:

| Table | Op | Lines (`20251017061634_0f314109-…sql`) |
|---|---|---|
| `inspections` | SELECT | `:26-37` |
| `inspections` | UPDATE | `:39-50` |
| `subsections` | SELECT | `:53-64` |
| `sites` | SELECT (`id IN …`) | `:67-78` |

Further contractor-scoped policies — own profile (`:263-269`), own activity logs (`:274-280`),
inspection-templates read (`:255-258`) — in `20251119090820_296d33c0-…sql`. Contractors can also
read `site_assets` for assigned sites (`20260109105319_51c4643e-…sql:50-59`). Contractor writes to
`clients`/`coc_validations`/`coc_extractions` are blocked by the staff predicate
(`20260610120000_phase1_write_lockdown.sql:35-97`). Note the contractor `inspections` policy grants
**UPDATE** — the only operational write a portal role gets.

### 5.4 Nav / feature surface

`ContractorPortalLayout` (`src/components/ContractorPortalLayout.tsx`): single nav item "Site
Overview" → `/contractor` (`menuItems`, `:28-30`), preview param propagated (`:47-50`); header
`<h1>Contractor Portal</h1>` (`:193`); an admin-preview banner ("You are viewing the contractor
portal as an admin…") rendered when `Admin` + `?preview=` (`:196-202`); footer My Profile →
`navigate("/profile")` (`:159`) and Logout, which in preview mode navigates to `/portal-management`
instead of signing out (handler `:68-80`).

The portal home (`src/views/ContractorPortal.tsx:16-18`) feeds `?preview=` into
`useContractorSites(previewSiteId)` (`src/hooks/useContractorSites.tsx:26-72`): admins previewing
get the single chosen site fetched directly from `sites` (`:36-49`); real contractors get their
`user_sites` joins (`:52-69`). The view assumes a contractor has exactly one site (`site =
sites?.[0]`, `ContractorPortal.tsx:21`). Subsection links keep the preview param
(`ContractorPortal.tsx:254`).

---

## 6. Site / client assignments (admin surface + data)

### 6.1 Data

| Object | Shape | Citation |
|---|---|---|
| `user_clients` | 1 user ↔ 1 client org (`UNIQUE(user_id)`, `UNIQUE(client_id)`); RLS: admin `FOR ALL`, self SELECT | `20251017054255_cd78a557-…sql:4-27` |
| `user_sites` | user ↔ site many-to-many (`UNIQUE(user_id, site_id)`); RLS: admin `FOR ALL`, self SELECT | `20251017061634_0f314109-…sql:2-23` |
| `user_sites_history` | append-only log (`action IN ('assigned','removed')`, `performed_by`); RLS: admin SELECT, **any-authenticated INSERT** (`WITH CHECK (true)`) | `20251119091647_56f5417f-…sql:2-26` |
| `log_user_site_assignment()` | `SECURITY DEFINER` trigger fn; AFTER INSERT/DELETE triggers on `user_sites` write history rows with `auth.uid()` as performer | same migration `:29-58` |

The history INSERT policy is `WITH CHECK (true)` (`:22-26`) — write-open to any authenticated
principal; the trigger function is the only intended writer.

### 6.2 View

`src/views/SiteAssignments.tsx` — three tabs (`TabsList`, `:424-438`):

1. **Contractor → Sites** — picks users whose `user_roles.role = 'Contractor'` then joins
   `profiles` (`:79-98`), inserts/deletes `user_sites` rows directly from the browser
   (`:305`, `:327`); duplicates blocked client-side; admin-only via `user_sites` RLS.
2. **Sites → Clients** — read-only grouping of `sites` by owning client org.
3. **Users → Clients** — picks users with role `Client` (`:100-120`), inserts/deletes `user_clients`
   rows (`:266`, `:286`).

Plus a "Contractor Assignment History" panel reading the latest 50 `user_sites_history` rows
(`:225`, `.limit(50)` `:228`).

Routing: **both** `/site-assignments` and `/portal-management` render the same `PortalManagement`
component — each page file is a 3-line `"use client"` wrapper importing `@/views/PortalManagement`
(`src/app/(admin)/site-assignments/page.tsx`, `src/app/(admin)/portal-management/page.tsx`).
`SiteAssignments` itself appears only as the "Assignments" tab inside `PortalManagement` (§7.1). The
Users page also manages a contractor's sites directly (`src/views/Users.tsx:425+`,
`updateContractorSitesMutation` deletes then re-inserts `user_sites`).

---

## 7. Admin preview & simulator surfaces

### 7.1 PortalManagement hub

`src/views/PortalManagement.tsx:18-53` — four tabs, default `access-links`:

| Tab value | Label | Renders |
|---|---|---|
| `access-links` | Access Links | `AccessLinkGenerator` (`@/components/client-portal/AccessLinkGenerator`) — `:39` |
| `client` | Client Simulator | `ClientAccessSimulator` — `:43` |
| `contractor` | Contractor Simulator | `ContractorAccessSimulator` — `:47` |
| `assignments` | Assignments | `SiteAssignments` — `:51` |

### 7.2 ClientAccessSimulator — `src/views/ClientAccessSimulator.tsx`

Selects a user with role `Client` (role query `:32-50`), looks up their `user_clients.client_id`
(`:60-64`), then computes accessible-vs-total counts for `sites` / `subsections` /
`subsection_documents` by **filtering on `client_id` under the admin's own session** (`:76-123`). It
does **not** impersonate the client or evaluate RLS as that user — it replicates the client filter
under broader admin policies. Renders per-category access cards (`:188-278`) and a summary table
(`:288-319`). On-screen claim: "simulates client portal access to verify RLS policies are working
correctly" (`:146`) — a filter-based approximation.

### 7.3 ContractorAccessSimulator — `src/views/ContractorAccessSimulator.tsx`

Same pattern for contractors: role-filtered user list (`:30-54`), their `user_sites` assignments
rendered as a table (query `:57-71`, render `:193-239`), accessible-vs-total counts for `sites` /
`subsections` / `inspections` / `site_documents` / `subsection_floor_plans` derived from the
assigned site ids (`:74-136`). Flags 100% site access as a security risk and 0% as no-access
(`:293-312`). On-screen claim "simulates contractor access based on RLS policies" (`:156`) is a
filter-based approximation, same caveat.

### 7.4 AdminClientPreview / AdminContractorPreview — orphaned views

- `src/views/AdminClientPreview.tsx` — client dropdown, then `<a href="/client-portal?preview=<clientId>"
  target="_blank">` (`:116`).
- `src/views/AdminContractorPreview.tsx` — paginated (infinite-scroll) site cards, "Preview as
  Contractor" button → `navigate("/contractor?preview=<siteId>")` (`:155`).

**Neither view is imported by any page or component** — grep for `AdminClientPreview` /
`AdminContractorPreview` across `src/` matches only the two definition files (verified 2026-06-11).
They are the only code that *generates* preview URLs via a UI, but the preview *consumers* (the
`?preview=` handling in `ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:19`,
`useClientInfo`, `useContractorSites`, both portal layouts, and the per-view preview threading)
remain live and reachable by manually constructing the URL as an Admin.

### 7.5 Preview semantics

In preview mode the admin is **not** seeing data through the target user's RLS. The guards merely
skip the role check (`ClientProtectedRoute.tsx:19`, `ContractorProtectedRoute.tsx:19`); data hooks
then branch on `userRole === "Admin" && previewId` and fetch the chosen client/site directly under
the admin's own (broader) policies (`useUserRole.tsx:64-76`, `useContractorSites.tsx:36-49`).
Anything a page fetches without applying the preview filter shows admin-scope data. ⚠️ UNVERIFIED
whether every client-portal / contractor page consistently applies the preview filter (per-page
audit belongs to chapter 04).

---

## 8. Summary matrix

| Context | Landing rule | Client guard | DB boundary | Nav surface |
|---|---|---|---|---|
| `(admin)` staff portal | role ∉ {Client, Contractor} → `/dashboard` (`useRoleRedirect.ts:30-31`) | `ProtectedRoute` — bounces Client/Contractor out (`ProtectedRoute.tsx:15-16`) | `has_role('Admin')` policies; `User`-role manage-all 9 tables (`20251120111033:4-56`); staff predicate (`20260610120000`) | `AppSidebar` 10 items, 3 Admin-only (`AppSidebar.tsx:45-56,155-156`) |
| `(client-portal)` | role = Client → `/client-portal` (`useRoleRedirect.ts:26-27`) | `ClientProtectedRoute` — non-Client → `/dashboard`; Admin+`?preview` bypass (`:19-20`) | `has_role('Client') AND get_user_client_id()` SELECT-only policies (`20251017054255`) | Dashboard / Sites / Calendar (`ClientPortalLayout.tsx:41-45`) |
| `(contractor)` | role = Contractor → `/contractor` (`useRoleRedirect.ts:28-29`) | `ContractorProtectedRoute` — non-Contractor → `/dashboard`; Admin+`?preview` bypass; path containment; orphan modal (`:19-30`) | `has_role('Contractor') AND site_id IN user_sites` (SELECT + inspections UPDATE) (`20251017061634`) | Single "Site Overview" item (`ContractorPortalLayout.tsx:28-30`) |

---

## Open questions

1. **Orphan-resolution RPCs not in repo.** `resolve_my_orphan` / `archive_my_orphan` are called from
   `src/hooks/useUnresolvedOrphans.ts:94,113` and documented (`:4-20`) as `SECURITY DEFINER` RPCs in
   the live Supabase project, but their SQL is absent from `supabase/migrations/`. Their actual
   USING/CHECK predicates — the real server-side guard for the contractor force-at-login flow —
   cannot be verified from this repo. (See `docs/integrity-audit/force-at-login-resolution.md`,
   referenced but not cross-checked here.)
2. **Orphaned preview views.** `AdminClientPreview.tsx` and `AdminContractorPreview.tsx` are
   unreferenced by any route or component. Pending deletion, or pending re-wiring into
   `PortalManagement`? Code alone cannot say. (Preview URLs are still constructible by hand; the
   consumer plumbing works.)
3. **`Moderator` role purpose.** The enum value exists (`20251014172237`) and exactly one policy
   references it (`20260109105319_51c4643e-…sql:48`, jointly with `User` on `site_assets` SELECT);
   it is offered in both Users-page role dropdowns (`Users.tsx:719`, `:1156`) but has no dedicated
   surface, guard, or policy set. Intended semantics unknown.
4. **`User` role scope.** `User` is the signup default (`20260214023114`) and holds blanket `FOR
   ALL` policies on 9 core operational tables (`20251120111033:4-56`) while the sidebar hides only
   three items from non-Admins — is `User` meant to be near-Admin staff, and should the admin-only
   URLs (`/settings`, `/users`, `/portal-management`) have client-side or RLS protection beyond
   per-table policies? Cannot be resolved from code.
5. **Multi-role rows.** Schema allows several `user_roles` rows per user (`UNIQUE(user_id, role)`),
   but `useUserRole.tsx:43`, `useRoleRedirect.ts:20`, `Index.tsx:17`, and `invite-user/index.ts:50`
   all use `.maybeSingle()` and would error on duplicates. The 1-role-per-user invariant is enforced
   only by convention — no DB constraint found.
6. **`/profile` unreachable from portals.** Client/Contractor sidebars link to `/profile`, which
   sits in the `(admin)` group whose guard bounces them back (§4.4). Intended?
7. **No-role users in the staff portal.** A user whose `user_roles` row is missing passes
   `ProtectedRoute` (both redirect checks compare against specific roles) and lands in the staff
   layout. With the effective signup trigger (`20260214023114`) every new user gets a `User` row, so
   role-less users should only arise from manual deletion or trigger failure. Is the staff-layout
   fallback intended for that case?
8. **`calendar_events` matched by site name.** The client `calendar_events` SELECT policy
   (`20251017054255:107-116`) joins on site **name** string equality, not a foreign key — a
   collision risk if two clients own identically-named sites. Not checked against production data.
9. **Production-state drift.** Effective DB state includes SQL applied outside
   `supabase/migrations/` (e.g. `docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql`,
   applied 2026-06-11; the orphan RPCs in the live project). Whether prod policies now exactly match
   the migration files cannot be verified from this repo.
10. **Preview filter coverage.** Whether every page under `(client-portal)`/`(contractor)`
    consistently applies the `?preview=` filter to all its queries (§7.5) needs the per-route audit
    in chapter 04.
