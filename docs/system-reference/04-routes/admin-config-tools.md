# Routes — admin config & tools `(admin)`

Ground truth from code, 2026-06-11. Covers the admin-group config/management/diagnostic routes:
inspection-templates (+ `/new`, `/[templateId]/edit`, `/validate`), qr-codes, settings,
pdf-template-tests, site-assignments, portal-management, development-skills, feedback-management,
validation-feedback, profile, users.

Cross-references: access model & guards in `03-auth-and-access/access-contexts-and-roles.md`;
RLS in `02-data-model/rls-policies-0{1..6}.md`; RPCs in `02-data-model/rpcs-and-functions-0{1,2}.md`.

## Shared access context (all routes below)

Every page lives under `src/app/(admin)/` and is wrapped by `src/app/(admin)/layout.tsx:12` in
`ProtectedRoute` (`src/components/ProtectedRoute.tsx`). The guard is a **staff** gate, not Admin-only:

- loading → spinner; no session → `/auth/login`; role `Contractor` → `/contractor`; role `Client`
  → `/client-portal`; **everyone else admitted** — `Admin`, `User`, `Moderator`, and users with **no
  role row** (`03-…/access-contexts-and-roles.md` §3.2, `ProtectedRoute.tsx:13-22`).
- Children render inside `OnboardingGate` (overlay, not a hard block — `access-contexts §2.3`).

**There is no Next.js middleware** (`access-contexts §intro`); the only server-side enforcement is
Supabase RLS / SECURITY DEFINER RPCs / edge-function JWT checks. The `AppSidebar` filters
`adminOnly` items (`Settings`, `Feedback Management`, `Platform Testing`) so they only *render* for
`useUserRole()==='Admin'` (`AppSidebar.tsx:155-156`), but **the filter is cosmetic** — a
`User`/`Moderator`/no-role staff member can reach any of these URLs by typing it; the only real
protection is whatever RLS denies their queries (`access-contexts §3.4`).

Each `page.tsx` is a thin `"use client"` wrapper rendering one view from `src/views/`.

---

## `/inspection-templates`

| | |
|---|---|
| Page | `src/app/(admin)/inspection-templates/page.tsx` (dynamic import, `ssr:false`) |
| View | `src/views/InspectionTemplates.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item, not adminOnly. |

**Data reads**
- `inspection_templates` SELECT all, ordered by category/name — `InspectionTemplates.tsx:312-316`.

**Data writes/mutations**
- Inline editor UPDATE of `inspection_templates` (`name/description/category/sections/sections_count/pages_count/updated_at`) — `InspectionTemplates.tsx:150-161`.
- Nav to `/inspection-templates/new`, `/inspection-templates/validate` — `:446-453`.
- "Import PDF" toggles `PDFTemplateUploader` (`:459`); "Download" → `useUnifiedPdfGeneration().generatePdf` (`:388`, client-side/edge PDF render). Preview renders `TemplatePreviewRenderer` (`:655`).

**DB-side enforcement / Security check**
- `inspection_templates` RLS effective policy: `All authenticated users full access to inspection_templates` — **ALL, USING/CHECK `(auth.uid() IS NOT NULL)`** (`rls-policies-02.md:202`), plus `auth_read_inspection_templates` SELECT (tier-2). **There is NO Admin/staff gate.** Any authenticated principal — including a `Contractor` or `Client` who reaches the table by any path — can read **and write/delete** every template. The route's client guard bounces Client/Contractor out of the page, but the table itself is wide open at the data layer. → security_flag.

---

## `/inspection-templates/new` and `/inspection-templates/[templateId]/edit`

| | |
|---|---|
| Pages | `src/app/(admin)/inspection-templates/new/page.tsx`; `…/[templateId]/edit/page.tsx` |
| View | both render `src/views/TemplateBuilderPage.tsx` → `src/components/TemplateBuilder.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Reached via in-page buttons, not sidebar. |

`TemplateBuilderPage` reads `templateId` from route params (`TemplateBuilderPage.tsx:11`); when
present it pre-loads the template (edit mode), else create mode.

**Data reads**
- (edit only) `inspection_templates` SELECT by id `.single()` — `TemplateBuilderPage.tsx:23-27`.

**Data writes/mutations** (`TemplateBuilder.tsx:163-208`)
- create: `inspection_templates` INSERT — `:193-195`.
- edit: `inspection_templates` UPDATE `.eq("id", templateId)` — `:184-187`.
- payload includes `sections`, conditional `tenants` (only when name contains "main board"/"shop board"), `sections_count`, `pages_count`, `updated_at` (`:171-180`).
- on save → `window.location.href = "/inspection-templates"` (`TemplateBuilderPage.tsx:71`).

**Security check** — same `inspection_templates` any-authenticated ALL policy as above: insert/update
not gated by role. → security_flag (shared with `/inspection-templates`).

---

## `/inspection-templates/validate`

| | |
|---|---|
| Page | `src/app/(admin)/inspection-templates/validate/page.tsx` |
| View | `src/views/TemplateValidator.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). |

**Data reads**
- RPC `validate_inspection_templates()` — `TemplateValidator.tsx:32`. Read-only diagnostic
  (RETURNS TABLE), `SECURITY DEFINER SET search_path=public`, granted to `authenticated`
  (`rpcs-and-functions-02.md:37,288-299`). Returns template integrity issues (structure / missing
  name / duplicate id).

**Data writes/mutations** — none on this page. "Edit Template" button navigates to
`/inspection-templates/edit/${template_id}` (`TemplateValidator.tsx:139`). ⚠️ Note this path
(`/inspection-templates/edit/<id>`) does not match the actual route segment
`/inspection-templates/[templateId]/edit` — the link order is reversed, so it likely 404s. ⚠️ UNVERIFIED at runtime.

**Security check** — the RPC is `authenticated`-callable (not Admin-only); it returns only template
metadata/issue strings (no sensitive data). No write surface. No flag.

---

## `/qr-codes`

| | |
|---|---|
| Page | `src/app/(admin)/qr-codes/page.tsx` |
| View | `src/views/QRCodes.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item, not adminOnly. |

**Data reads**
- `subsections` SELECT (id, name, qr_code_url, created_at, site_id, joined `sites(name, client_id, clients(name, company_name))`) where `qr_code_url IS NOT NULL` — `QRCodes.tsx:70-88`.
- `settings` SELECT `company_logo_url, qr_base_url` `.limit(1).maybeSingle()` — `QRCodes.tsx:47-51`.

**Data writes/mutations** — none. "Download QR" renders `LabeledQRCode` pointing at
`${qrBaseUrl || origin}/public/subsections/${subsection.id}` (`QRCodes.tsx:275`); "View Details"
navigates to `/clients/.../subsections/...` (`:131`).

**DB-side enforcement / Security check**
- `subsections` SELECT for staff is satisfied by `auth_read_subsections` (SELECT authenticated `true`) and `Users can manage all subsections` (`rls-policies-05.md:133-137`). Admins/User-role see all; Client/Contractor are scoped (but the route guard bounces them anyway).
- `settings` read of branding columns — fine.
- The generated public URL `/public/subsections/<id>` is the same token-free public subsection view that exists app-wide (out of scope here). No write surface on this route. No flag.

---

## `/settings`

| | |
|---|---|
| Page | `src/app/(admin)/settings/page.tsx` |
| View | `src/views/Settings.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item **adminOnly** (cosmetic only). |

Four tabs: **General** (branding/QR/integrations + `AutoLogoutSettings`), **Images**
(`ImageCompressionManager`), **Users** (embeds the full `Users` view — `Settings.tsx:14,337-339`),
**Portals** (embeds `PortalManagement` — `Settings.tsx:13,341-343`). So `/users` and
`/portal-management` functionality is reachable from `/settings` directly.

**Data reads**
- `settings` SELECT `.single()` — `Settings.tsx:38-41`.

**Data writes/mutations**
- Storage upload to bucket `company-logos` (logo / hero), `upsert:true` — `Settings.tsx:61-65`; then `settings` UPDATE `company_logo_url`/`login_hero_image_url` — `:75-78`.
- `settings` UPDATE `company_name` — `Settings.tsx:108-111`.
- `settings` UPDATE `qr_base_url` — `Settings.tsx:124-127`.
- Plus all writes of the embedded `Users` and `PortalManagement` views (see those entries).

**DB-side enforcement / Security check**
- `settings` RLS: SELECT for anyone (incl. anon via `Public can view branding only` USING `true`); **UPDATE and INSERT allowed to any authenticated principal** (`auth.role()='authenticated'`) — `rls-policies-04.md:136-145`. **No Admin gate on settings writes.** Any logged-in staff member (`User`/`Moderator`/no-role) — and, at the RLS layer, even a Client/Contractor session — can rewrite `company_name`, `qr_base_url`, and the branding image URLs. The `adminOnly` sidebar flag is the only thing nominally restricting this, and it is cosmetic. → security_flag.
- Storage bucket `company-logos` upload permissions not verified here (bucket-policy file not in scope). ⚠️ UNVERIFIED whether bucket write is Admin-scoped or open to any authenticated.

---

## `/pdf-template-tests`

| | |
|---|---|
| Page | `src/app/(admin)/pdf-template-tests/page.tsx` |
| View | `src/views/PDFTemplateTestDashboard.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Not in sidebar; reached by URL. |

Diagnostic dashboard: runs the PDF-template test suite and inspects template config.

**Data reads**
- `runPDFTemplateTests(reportType)` (`src/lib/pdfTemplateTestRunner.ts`) reads `pdf_report_templates` and templates — SELECTs at `pdfTemplateTestRunner.ts:612,633,660` (`id,name,report_type,is_default` / `id,name` / `id,name,sections`).
- `fetchPDFTemplate(reportType)` (`src/hooks/usePDFTemplateGateway.ts:236-237,361-362`) SELECTs `pdf_report_templates`.

**Data writes/mutations** — none observed in the dashboard or the gateway read path (read-only test/inspect tooling).

**DB-side enforcement / Security check** — reads only template-config tables; no mutation surface
on this route. ⚠️ UNVERIFIED: `pdf_report_templates` RLS policy details not enumerated here
(`rls-policies-03.md:18`); diagnostic reads are low-sensitivity. No flag.

---

## `/site-assignments` and `/portal-management`

| | |
|---|---|
| Pages | `src/app/(admin)/site-assignments/page.tsx`; `src/app/(admin)/portal-management/page.tsx` |
| View | **both** render `src/views/PortalManagement.tsx` (identical 3-line wrappers) |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). `/portal-management` not in sidebar; reached via in-page links (`access-contexts §6.2`). |

`PortalManagement` = 4 tabs (`PortalManagement.tsx:18-53`): **Access Links** (`AccessLinkGenerator`,
default), **Client Simulator** (`ClientAccessSimulator`), **Contractor Simulator**
(`ContractorAccessSimulator`), **Assignments** (`SiteAssignments`). `SiteAssignments` is the heavy
write surface; the simulators are read-only filter approximations (`access-contexts §7.2-7.3`).

### Access Links tab — `AccessLinkGenerator` (`src/components/client-portal/AccessLinkGenerator.tsx`)

**Reads**: `client_access_links` SELECT (joined clients/sites) `:100-107`; `sites` SELECT `:125`;
`clients` SELECT `:140-143`.
**Writes**: `client_access_links` INSERT (token row: label/link_type/site_id/client_id/expires_at/created_by) `:176-187`; UPDATE `is_active` (toggle) `:238-241`; DELETE `:218-221`. Generated links are `${origin}/review/<token>` (site) or `${origin}/portfolio/<token>` (client) `:204-205`.
**DB enforcement**: `client_access_links` writes gated by `Admins can manage access links` (FOR ALL,
USING `EXISTS(… user_roles … role='Admin')`) — `rls-policies-01.md:162`. So link create/toggle/delete
**only succeed for Admin**; a non-Admin staff member who opens this tab sees existing links
(`auth_read_client_access_links` SELECT authenticated `true`, `:163`) but cannot mutate them
(RLS-denied). The public token is resolved at view-time by the anon-granted SECURITY DEFINER
`validate_access_link(text)` RPC (`rls-policies-01.md:150,165`). Net: properly Admin-gated writes;
non-Admin staff get read-only visibility of all tenants' access tokens. ⚠️ token strings themselves
are visible to any authenticated staff via the table SELECT.

### Assignments tab — `SiteAssignments` (`src/views/SiteAssignments.tsx`)

**Reads**: `user_roles` (contractors `:82-85`, clients `:104-107`); `profiles` (`:90-93,112-115,169-172,204-207,239-242`); `clients` `:126-129`; `sites` `:140-143,245-248`; `user_sites` (joined) `:154-162`; `user_clients` (joined) `:190-198`; `user_sites_history` latest 50 `:224-228`.
**Writes**: `user_clients` INSERT `:265-267` / DELETE `:285-288`; `user_sites` INSERT `:304-306` / DELETE `:325-329`.
**DB enforcement**: `user_clients` & `user_sites` writes gated by admin `FOR ALL` policies
(`access-contexts §6.1`, `20251017054255` / `20251017061634`). `user_sites_history` is append-only
via the `log_user_site_assignment()` AFTER-trigger (admin-SELECT; any-authenticated INSERT `WITH
CHECK(true)` — `access-contexts §6.1`). Assignment writes are correctly Admin-only at the DB layer.

### Simulators (Client / Contractor)
`ClientAccessSimulator` / `ContractorAccessSimulator` — read-only. They select role-filtered users
and replicate the client/contractor filter **under the admin's own session** (do NOT impersonate
RLS) — `access-contexts §7.2-7.3`. No writes.

**Security check (route)** — assignment writes and access-link writes are Admin-gated at RLS. The
two visible exposures are (a) non-Admin staff can *view* all `client_access_links` token strings
across all tenants (`auth_read_client_access_links` SELECT authenticated `true`), and (b) the
simulators read cross-tenant role/assignment data under the admin session. (a) → security_flag.

---

## `/development-skills`

| | |
|---|---|
| Page | `src/app/(admin)/development-skills/page.tsx` |
| View | `src/views/DevelopmentSkills.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item, not adminOnly. |

Static reference content. `BASE_SKILLS` is a hard-coded in-file array
(`DevelopmentSkills.tsx:39-360`); the component filters/renders it as markdown.

**Data reads** — none from Supabase. (`import { supabase }` and `useQuery` are present at
`:2-3` but **unused**; the comment "In future, this could fetch from database" `:367` confirms
`skills = BASE_SKILLS` `:368`.)
**Data writes/mutations** — none.
**Security check** — no data access, no mutation. No flag. (Note: it re-renders its own
`AppSidebar`/`SidebarProvider` inside the admin layout — cosmetic, harmless.)

---

## `/feedback-management`

| | |
|---|---|
| Page | `src/app/(admin)/feedback-management/page.tsx` |
| View | `src/views/FeedbackManagement.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item **adminOnly** (cosmetic only). |

Three tabs: **Issue Reports** (`IssueReports`), **Suggestions** (`Suggestions`), **Verifications**
(`VerificationManagement`). The wrapper itself also computes verification stats.

**Data reads** (wrapper, `FeedbackManagement.tsx:17-20`)
- `issue_reports` SELECT (`status, fix_confidence_score, fix_test_run_at`).
- `suggestions` SELECT (same columns). 30s refetch (`:56`).
- (further reads/writes of `issue_reports`/`suggestions`/verification rows live in the embedded `IssueReports`, `Suggestions`, `VerificationManagement` views — not enumerated here.)

**Data writes/mutations** — none in the wrapper; tab views handle status changes.

**DB-side enforcement / Security check**
- `issue_reports`: SELECT own-row OR `has_role('Admin')`; INSERT own-row; UPDATE/DELETE **Admin-only** (`rls-policies-02.md:251-255`).
- `suggestions`: SELECT own-row OR `has_role('Admin')`; INSERT own-row; UPDATE/DELETE **Admin-only** (`rls-policies-05.md:156-160`).
- For a **non-Admin staff** member who opens this page: the stats `SELECT` returns only *their own* issue/suggestion rows (own-row SELECT policy), so the dashboard under-reports rather than leaking — and management UPDATE/DELETE actions in the tab views are RLS-denied. Properly Admin-gated at the DB layer. No flag. (The page is *reachable* by non-Admins via URL, but reads/writes are correctly scoped/denied.)

---

## `/validation-feedback`

| | |
|---|---|
| Page | `src/app/(admin)/validation-feedback/page.tsx` |
| View | `src/views/ValidationFeedback.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Sidebar item, not adminOnly. |

**Data reads**
- `validation_feedback` SELECT `*` ordered by created_at, optional `.eq('status', filter)` — `ValidationFeedback.tsx:38-47`.

**Data writes/mutations**
- `validation_feedback` UPDATE (`status`, `reviewed_by = session.user.id`, `reviewed_at`, `implementation_notes`) `.eq('id', …)` — `ValidationFeedback.tsx:66-74`. Triggered by "Mark Implemented / Reviewed / Reject" buttons (`:336-350`).

**DB-side enforcement / Security check**
- `validation_feedback` RLS: `All authenticated users full access to validation_feedback` — **ALL, USING/CHECK `auth.uid() IS NOT NULL`** (`rls-policies-06.md:60`). **No Admin gate.** Any authenticated principal can read every feedback row and update its review status/notes. The route guard bounces Client/Contractor from the page, but the table is open to any authenticated session at the data layer. → security_flag.

---

## `/profile`

| | |
|---|---|
| Page | `src/app/(admin)/profile/page.tsx` |
| View | `src/views/MyProfile.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Footer link in all three layouts; for Client/Contractor the guard bounces them back to their portal, so it is effectively staff-only and **unreachable from the portals** (`access-contexts §4.4`, open-q 6). |

Self-service profile of the **current** user only (all ops key on `auth.getUser().id`).

**Data reads**
- `profiles` SELECT `*` `.eq("id", user.id).single()` — `MyProfile.tsx:51-55` (+ merges auth email/created_at).

**Data writes/mutations**
- Storage upload to bucket `profile-images` at `${user.id}/avatar.<ext>`, `upsert:true` — `MyProfile.tsx:97-99`; then `profiles` UPDATE `avatar_url` `.eq("id", user.id)` — `:106`.
- `profiles` UPDATE own row (full_name, phone, job_title, department, company, address, city, country, postal_code, bio, avatar_url) `.eq("id", user.id)` — `MyProfile.tsx:121-136`.
- Password change: re-auth via `signInWithPassword` (`:163`), strength/breach gate (`evaluatePassword`, `:172`), then `supabase.auth.updateUser({ password })` (`:185`); audit `recordAuthEvent("password_changed")` (`:194`).

**DB-side enforcement / Security check**
- `profiles` UPDATE policy is `Users can update their own profile` USING `auth.uid() = id` (`rls-policies-03.md:64`). All writes here key on the caller's own id → permitted; cross-user write impossible. Password change goes through Supabase Auth. Self-scoped throughout. No flag.

---

## `/users`

| | |
|---|---|
| Page | `src/app/(admin)/users/page.tsx` |
| View | `src/views/Users.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Not in sidebar; reached via in-page links and the Settings → Users tab. |

User administration: list, invite, resend, edit role/sites/status/profile, delete.

**Data reads**
- `pending_user_invites` SELECT `*` — `Users.tsx:119-122`.
- `clients` SELECT `*` `:133-136`; `sites` SELECT `:146-149`; `user_sites` (grouped) `:159-174`.
- `profiles` SELECT `*` (all users) `:201-204`, then per-user `user_roles` `.maybeSingle()` `:211-215`, `user_clients` `:217-221`, `user_sites` `:223-226`.

**Data writes/mutations**
- Invite new user → edge fn `invite-user` `{email, fullName, role, isResend:false, temporaryPassword, clientId, siteIds}` — `Users.tsx:286-296`.
- Send invite to pending user → edge fn `invite-user` `{email, fullName}` — `:244-246`.
- Resend (existing user) → reads `user_clients`/`user_sites` then edge fn `invite-user` `isResend:true` — `:336-362`.
- `pending_user_invites` DELETE `.eq("id", …)` — `:267-270`.
- `user_roles` UPDATE-or-INSERT (`updateRoleMutation`: select existing `:392-396`, UPDATE `:400-403` else INSERT `:408-410`).
- `user_sites` DELETE-all-then-INSERT for a contractor (`updateContractorSitesMutation` `:429-440`).
- `profiles` UPDATE `status` `.eq("id", userId)` — `:461-464`.
- `profiles` UPDATE arbitrary profile fields `.eq("id", userId)` — `:480-483`.
- Avatar: storage `profile-images` remove old + upload new (`:586,589-591`), public URL `:595-597`.
- Delete user → edge fn `delete-user` `{userId}` — `:501-503`.

**DB-side / edge enforcement & Security check**
- **`invite-user`** (service-role client): verifies caller JWT, requires caller `user_roles.role = 'Admin'`, validates `clientId`/`siteIds`, writes role + mappings (`access-contexts §1.5`; admin check `index.ts:38-54`). Admin-gated server-side. Good.
- **`delete-user`** (`supabase/functions/delete-user/index.ts`): service-role client (`:16-25`); verifies `Authorization` JWT via `getUser(token)` `:35`; requires caller `user_roles.role === 'Admin'` `:42-50`; blocks self-deletion `:60-62`; calls `auth.admin.deleteUser` `:65`; best-effort `auth_events` audit `:77-81`. **Properly Admin-gated** — no create-user-admin-class bug. Good. (CORS `Access-Control-Allow-Origin: "*"` `:5` is broad but auth is enforced by JWT+role, not origin.)
- **`pending_user_invites`** writes/reads: all 4 policies are `has_role(auth.uid(),'Admin')` (`rls-policies-03.md:42-45`). The SELECT (`:119`) returns rows only for Admins → for a non-Admin staff member the pending-invites list is empty (RLS-filtered), and DELETE is denied. Good.
- **`user_roles`** UPDATE/INSERT: Admin-only write policies (`access-contexts §1.2`). A non-Admin staff member's role mutations are RLS-denied. Good. ⚠️ The edit dialog offers `Admin/Moderator/User/Contractor/Client` (`Users.tsx:718-722,1155-1159`) — an Admin can self-promote others to Admin from the browser; this is by design but is direct client→`user_roles` writing rather than going through the validated `invite-user` path (no client/site mapping validation on a plain role change).
- **`user_sites`** delete/insert (contractor sites): Admin `FOR ALL` (`access-contexts §6.1`). Good.
- **`profiles` UPDATE of OTHER users' rows** (`updateStatusMutation :463`, `updateProfileMutation :482`, avatar at `:586-591`): the only effective `profiles` UPDATE policy is `Users can update their own profile` USING `auth.uid() = id` (`rls-policies-03.md:64`). **There is no Admin UPDATE policy on `profiles`.** So an Admin editing *another* user's status/profile/avatar from this page targets `.eq("id", <otherUserId>)`, which RLS silently filters to zero rows — the update **does not persist** (PostgREST returns success with 0 rows affected; the UI toasts "updated"). This is a **functional gap / silent no-op**, not a privilege escalation. → flagged as a correctness/security-relevant finding (admin status-toggle does nothing at the DB layer). ⚠️ UNVERIFIED against production data, but follows directly from the policy set. → security_flag (low severity; integrity/no-op, not exposure).

---

## Summary — DB-side gate per route

| Route | Client guard | Writes gated server-side by | Verdict |
|---|---|---|---|
| `/inspection-templates` (+`/new`,`/edit`) | staff | **none — `inspection_templates` ALL = any-authenticated** | flag |
| `/inspection-templates/validate` | staff | read-only RPC (`authenticated`) | ok |
| `/qr-codes` | staff | no writes | ok |
| `/settings` | staff (adminOnly cosmetic) | **none — `settings` UPDATE/INSERT = any-authenticated** | flag |
| `/pdf-template-tests` | staff | no writes (read-only diagnostics) | ok |
| `/site-assignments` `/portal-management` | staff | assignments + access-links = **Admin** RLS; but `client_access_links` token SELECT = any-authenticated | flag (token read) |
| `/development-skills` | staff | no data access | ok |
| `/feedback-management` | staff (adminOnly cosmetic) | `issue_reports`/`suggestions` UPDATE/DELETE = Admin | ok |
| `/validation-feedback` | staff | **none — `validation_feedback` ALL = any-authenticated** | flag |
| `/profile` | staff (self-only) | `profiles` UPDATE = own-row | ok |
| `/users` | staff | invite/delete = Admin edge fn; `pending_user_invites`/`user_roles`/`user_sites` = Admin RLS; **`profiles` cross-user UPDATE = silent no-op (no admin policy)** | flag (no-op integrity) |

## Open questions

1. `TemplateValidator.tsx:139` links to `/inspection-templates/edit/<id>` but the route is
   `/inspection-templates/[templateId]/edit` — reversed path likely 404s. Runtime-unverified.
2. Storage bucket write policies (`company-logos`, `profile-images`) not in this scope — whether
   `company-logos` upload is Admin-scoped or open to any authenticated is unverified.
3. `pdf_report_templates` RLS not enumerated here (only that the PDF test dashboard reads it).
4. Whether the silent-no-op on admin `profiles` UPDATE (status toggle / profile edit of other users)
   is a known/intended limitation or a real bug — code says the page believes the update succeeds.
