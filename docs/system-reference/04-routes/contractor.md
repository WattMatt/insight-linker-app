# Routes — `(contractor)` group

Ground truth from code, 2026-06-11. Covers every route under the `(contractor)` route group:
`/contractor`, `/contractor/inspections/[inspectionId]`, `/contractor/subsections/[subsectionId]`.

For the group-wide auth/role/RLS model see
`docs/system-reference/03-auth-and-access/access-contexts-and-roles.md` §5 (contractor portal). This
file documents each route's view, its data reads/writes, and per-route security findings. RLS policy
names are cited from `docs/system-reference/02-data-model/rls-policies-0*.md`.

Line numbers are 1-based against the files as they exist 2026-06-11.

---

## Group layout & guard (applies to all three routes)

| Layer | File:line | Behaviour |
|---|---|---|
| Route group layout | `src/app/(contractor)/layout.tsx:15-21` | `Suspense` → `ContractorInner` → `ContractorProtectedRoute` wraps all children |
| Client guard | `src/components/ContractorProtectedRoute.tsx:9-32` | session + role gate (below) |
| Portal chrome | `src/components/ContractorPortalLayout.tsx` | rendered *inside each view*, not by the layout — single "Site Overview" nav item (`:28-30`), admin-preview banner (`:196-202`) |

`ContractorProtectedRoute` decision order (`src/components/ContractorProtectedRoute.tsx`):

1. `sessionLoading || roleLoading` → `<AuthLoading variant="skeleton" />` (`:17`)
2. `!session` → `<Navigate to="/auth/login" replace />` (`:18`)
3. **Admin-preview bypass:** `userRole === "Admin" && previewSiteId` (from `?preview=`) → render children, **skips role check, path check, onboarding, and the orphan modal** (`:19`)
4. `userRole !== "Contractor"` → `<Navigate to="/dashboard" replace />` (`:20`)
5. `!location.pathname.startsWith("/contractor")` → `<Navigate to="/contractor" replace />` (`:21`)
6. Render `OnboardingGate` (overlay only) → `OrphanResolutionModal` → children (`:23-30`)

`userRole` comes from `useUserRole` (`src/hooks/useUserRole.tsx:39-43`, `user_roles.role … .maybeSingle()`). The guard is **client-side only**; all server enforcement is Supabase RLS (no `middleware.ts` exists — see §03 doc).

**Server-side boundary for the whole group** (all `public`-role / `authenticated` policies; cited from `rls-policies-0*.md`):

| Table | Contractor's effective access | Policy / citation |
|---|---|---|
| `inspections` | SELECT all rows via `auth_read_inspections` (`USING(true)`); scoped SELECT redundant; **UPDATE + INSERT** limited to assigned sites | `rls-policies-04.md:58-59`; INSERT `:59`-adjacent (`20260219090420`); read-all caveat `rls-policies-02.md:234` |
| `subsections` | SELECT all rows via `auth_read_subsections` (`USING(true)`); contractor scoped-SELECT redundant; **no write path** | `rls-policies-05.md:135,145` |
| `sites` | SELECT (contractor `id IN user_sites` + any-authenticated read) | §03 doc §5.3; `rls-policies-05.md` sites section |
| `snags` | SELECT all via `auth_read_snags` (`USING(true)`); **no INSERT/UPDATE/DELETE path for Contractor** (only Admin & User) | `rls-policies-05.md:45,47,53` |
| `inspection_signatures` | **ALL (`true`/`true`) for any authenticated user** | `rls-policies-02.md:162`, `rls-policies-04.md:37` |
| `inspection_templates` | SELECT via `auth_read_inspection_templates` | `rls-policies-02.md` (tier-2) |
| `settings` | SELECT (excluded from tier-2 lockdown) | `rls-policies-04.md` settings section |
| `storage.objects` (`inspection-photos`, `site-images`) | **4 blanket `Anyone can …` policies, no bucket/role filter — anon read/write/delete on every bucket** | `triggers-enums-storage.md:124-172`; warning `rls-policies-05.md:80` |

Contractor becomes a contractor by `user_roles.role='Contractor'` + ≥1 row in `user_sites` (§03 doc §5.2).

---

## 1. `/contractor`

| Aspect | Value |
|---|---|
| Page | `src/app/(contractor)/contractor/page.tsx:1-3` — `"use client"`, renders `<ContractorPortal />` |
| View | `src/views/ContractorPortal.tsx` |
| Group / guard | `(contractor)` → `ContractorProtectedRoute` (above). View also wraps itself in `ContractorPortalLayout` (`:131`) |

### Access context
- Real contractor: site resolved from `user_sites` join (`useContractorSites`, `src/hooks/useContractorSites.tsx:52-69`); view assumes exactly one site (`site = sites?.[0]`, `ContractorPortal.tsx:21`).
- Admin preview (`?preview=<siteId>`): `useContractorSites` branches on `userRole === "Admin" && previewSiteId` and fetches the chosen site **directly from `sites`** under the admin's own (broader) policies, not the target contractor's RLS (`useContractorSites.tsx:36-49`). Preview param is propagated into every subsection link (`ContractorPortal.tsx:254`).

### Data reads
| Source | Op | File:line |
|---|---|---|
| `sites` (+ joined `clients`) | SELECT by id (admin-preview path) | `useContractorSites.tsx:37-41` |
| `user_sites` (+ nested `sites`,`clients`) | SELECT by `user_id` (contractor path) | `useContractorSites.tsx:52-55` |
| storage `site-images` | `createSignedUrl(path, 3600)` for site image | `useContractorSites.tsx:12-14` |
| `subsections` | SELECT `* WHERE site_id = siteId` | `ContractorPortal.tsx:28-32` |
| `inspections` | SELECT `* WHERE site_id = siteId` | `ContractorPortal.tsx:44-48` |
| `site_documents` | SELECT `* WHERE site_id = siteId` | `ContractorPortal.tsx:60-63` |

### Data writes / mutations
None. Read-only dashboard (overview stats + searchable subsection cards linking to `/contractor/subsections/[id]`).

### Security check
- **Cross-tenant read via permissive RLS:** `subsections`/`inspections` reads use `auth_read_*` (`USING(true)`) so the `.eq("site_id", siteId)` filter is the *only* tenant scoping, and it is client-supplied. A contractor on `/contractor` only ever passes their own `siteId` (from `user_sites`), so the dashboard itself is safe — but the underlying tables grant any authenticated user read of all rows (`rls-policies-02.md:234`, `rls-policies-05.md:145`). Flagged at the table level, not unique to this route.
- **Admin preview reads admin-scope data, not the contractor's RLS view** — by design but means the simulator/preview is not a faithful RLS reproduction (§03 doc §7.5). Not a contractor-reachable escalation.

---

## 2. `/contractor/inspections/[inspectionId]`

| Aspect | Value |
|---|---|
| Page | `src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx:1-3` — renders `<InspectionDetail />` |
| View | `src/views/InspectionDetail.tsx` (2885 lines; **shared** with admin `/inspections/...` and client routes) |
| Group / guard | `(contractor)` → `ContractorProtectedRoute` |

### Access context
`InspectionDetail` is a single shared view that distinguishes context purely by which route params are present: `isContractorPortal = !clientId && !siteId && !subsectionId` (`InspectionDetail.tsx:105`). On the contractor route only `inspectionId` is in the URL, so `isContractorPortal === true`; back-navigation targets `/contractor` (`:810-811`, `:831-832`, `:1900-1901`). There is **no contractor-specific data scoping inside the view** — it loads the inspection by id and relies entirely on RLS to deny inaccessible rows. Admin preview param threaded into nav links (`:104`, `:1933-1950`).

### Data reads
| Source | Op | File:line |
|---|---|---|
| `inspections` (+ nested `sites`→`clients`, `subsections`) | SELECT by id `.maybeSingle()` | `:769-790` |
| `inspection_templates` | SELECT by `template_id` | `:845-849` |
| `settings` | SELECT `company_logo_url` `.maybeSingle()` | `:258-261` |
| `snags` | SELECT by `subsection_id` | `:281-285` |
| storage `site-images` | `createSignedUrl(path,3600)` | `:891-893` |
| `inspection_signatures` | SELECT by `inspection_id` (via `InspectionSignatures`, rendered `:2524`) | `src/components/InspectionSignatures.tsx:35-38` |

### Data writes / mutations
| Target | Op | File:line | Contractor RLS verdict |
|---|---|---|---|
| `inspections` | UPDATE full record on Save | `:1499-1517` | **Allowed** for assigned sites (`Contractors can update inspections for assigned sites`, `rls-policies-04.md:59`) |
| `inspections.json_data` | UPDATE (tenant image auto-save) | `:553-559`, `:643-649` | Allowed (same policy) |
| `snags` | INSERT | `:321-322` | **DENIED for real contractor** — no contractor INSERT policy (`rls-policies-05.md:53`); succeeds only for Admin (preview) / User |
| `snags` | UPDATE (edit + status toggle) | `:354-355`, `:388-389` | **DENIED for real contractor** (same) |
| `snags` | DELETE | `:407-408` | **DENIED for real contractor** (same) |
| storage `inspection-photos` | `upload()` inspection item photos | `:1190-1192` | Allowed — blanket `Anyone can` storage policy |
| storage `inspection-photos` | `upload()` snag photos | `:680-682` | Allowed (storage blanket) |
| storage `inspection-photos` | `upload()` tenant images (`useImageUpload`) | `:491`, `:533` | Allowed (storage blanket) |
| storage `inspection-photos` | `remove()` deleted photos | `:1407`, tenant `deleteImage` `:623` | Allowed (storage blanket) |
| storage `inspection-photos` | `upload()` dynamic-field photos (`DynamicFieldManager`, rendered `:2092`) | `src/components/DynamicFieldManager.tsx:182-188` | Allowed (storage blanket) |
| `inspection_signatures` | `upsert()` / `delete()` (via `SignatureCapture`) | `src/components/SignatureCapture.tsx:159-160`, `:198-199` | **Allowed for ANY authenticated user** (`true`/`true`, `rls-policies-02.md:162`) |

### Security check
- **flag — snag CRUD UI exposed to contractors with no DB grant (client-guard / RLS mismatch).** The contractor portal renders create/edit/delete-snag controls (`:321`, `:354`, `:388`, `:407`) but no `snags` write policy admits the Contractor role (only Admin & User — `rls-policies-05.md:53`). For a *real* contractor the write fails at RLS (fail-closed, so not data exposure), but the UI silently offers an action the backend rejects. The same controls, reached by an **Admin in `?preview=` mode**, DO write (Admin has full snag rights) — i.e. an admin "previewing as contractor" can mutate snags through this screen. Severity LOW (fail-closed for the role in scope; preview is admin-only).
- **flag — `inspection_signatures` is full-CRUD for any authenticated principal.** `SignatureCapture` (reachable on this route, `:2524`) upserts/deletes signatures gated only by `auth.uid() IS NOT NULL`-equivalent `true`/`true` (`rls-policies-02.md:162`). Any authenticated user — including a contractor not assigned to the site, or any logged-in account — can write/delete sign-off signatures on *any* inspection by id. Severity MEDIUM (sign-off integrity).
- **flag — inspection load relies solely on RLS, no in-view site scoping.** The view selects the inspection by id with no `site_id` ownership check (`:769-790`); a contractor passing another site's `inspectionId` is stopped only by the contractor SELECT policy — but `auth_read_inspections` (`USING(true)`) grants every authenticated user SELECT on **all** inspection rows (`rls-policies-02.md:234`). So a contractor can READ any inspection by guessing/obtaining its UUID via `/contractor/inspections/<any-id>`. UPDATE is still site-scoped (write-blocked), but the read is not. Severity MEDIUM (cross-tenant inspection read).
- **flag — `inspection-photos` & `site-images` storage are anon-open.** Uploads/deletes here succeed under blanket `Anyone can …` storage policies with no bucket or role filter (`triggers-enums-storage.md:124-172`; anon-write warning `rls-policies-05.md:80`). Any caller (even unauthenticated) can read/overwrite/delete objects these routes write. Severity HIGH (table/bucket level, not unique to this route, but this route is a primary writer).

---

## 3. `/contractor/subsections/[subsectionId]`

| Aspect | Value |
|---|---|
| Page | `src/app/(contractor)/contractor/subsections/[subsectionId]/page.tsx:1-3` — renders `<ContractorSubsectionDetail />` |
| View | `src/views/ContractorSubsectionDetail.tsx` |
| Group / guard | `(contractor)` → `ContractorProtectedRoute`. View wraps itself in `ContractorPortalLayout` (`:107`) |

### Access context
Loads a single subsection by id and lists its inspections. No in-view tenant scoping — relies on RLS. Empty/denied state shows "Subsection not found or you don't have access to it." (`:99`). Admin-preview param only used to thread breadcrumb/inspection links (`:16`, `:112`, `:189`), not for data fetching.

### Data reads
| Source | Op | File:line |
|---|---|---|
| `subsections` (+ joined `sites`) | SELECT by id `.single()` | `:21-25` |
| `inspections` (+ `inspection_templates(name)`) | SELECT by `subsection_id` | `:35-39` |
| `inspections` (orphan match) | SELECT `WHERE site_id = subsection.site_id AND subsection_id IS NULL`, then client-side shop-number/name normalize-match | `:48-52`, filter `:53-59` |

### Data writes / mutations
None. Read-only list; rows link to `/contractor/inspections/[id]`.

### Security check
- **flag — subsection & inspection reads ride permissive `auth_read_*` policies.** Both `subsections` (`:21`) and `inspections` (`:35`, `:48`) are fetched by id/site_id with no ownership predicate in the query, and the effective table policies grant every authenticated user SELECT on all rows (`auth_read_subsections` `rls-policies-05.md:135`; `auth_read_inspections` `rls-policies-02.md:234`). A contractor can therefore open `/contractor/subsections/<any-id>` and read any subsection plus its inspections regardless of site assignment. Severity MEDIUM (cross-tenant read; consistent with route 2's read finding).
- **Orphan-match query (`:48-52`) widens exposure further:** it pulls *all* unlinked inspections for the subsection's `site_id` and filters them client-side by normalized shop number/name — so even loosely-matched orphan inspection summaries surface to the viewer. Read-only, but broadens the row set returned. Severity LOW (additive to the above).
- No writes → no mutation-escalation surface on this route.

---

## Cross-route notes

- **No route in this group has server-side *tenant* scoping for reads beyond the (now-redundant) role SELECT policies**, because the 2026-06-11 tier-2 lockdown replaced anon `USING(true)` policies with `authenticated USING(true)` (`auth_read_*`) rather than role/ownership predicates. Reads are gated to *logged-in* users but not to *assigned* contractors. Writes remain properly scoped only for `inspections` (assigned-site UPDATE/INSERT); `snags` writes are role-denied to contractors; `inspection_signatures` and storage are wide open.
- **Admin `?preview=<siteId>` bypass** (`ContractorProtectedRoute.tsx:19`) lets an Admin reach all three routes with no role/path/orphan check and fetch under admin policies — the only intended privileged entry, but it also means admin-preview can trigger the snag writes that the contractor UI exposes (route 2).
- **Orphan-resolution RPCs** (`resolve_my_orphan`/`archive_my_orphan`, called by the `OrphanResolutionModal` mounted by the guard) are not in this repo's migrations; their server-side guards cannot be verified here (§03 doc §5.2 open question 1).
