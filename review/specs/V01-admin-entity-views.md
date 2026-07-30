# V01 — admin-entity-views

- Unit id: V01
- Slug: admin-entity-views
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 9 (matches `review/unit-files.json` key "V01")

## Unit header

**Unit purpose.** The nine top-level admin page bodies for the core entity hierarchy: dashboard, clients list/detail, sites list/detail, subsection detail, calendar, inspections list, and the inspection editor. Each file default-exports a zero-prop React component that a thin `src/app/**/page.tsx` wrapper renders; route parameters are read inside the view via `useParams`/`useSearchParams` from `@/lib/navigation` (L13).

**Module-level observations (cross-file facts).**
- All nine components talk to Supabase directly through the `supabase` singleton (`@/integrations/supabase/client`, L19) — there is no intermediate data layer; queries, inserts, updates, deletes, and storage calls are inline in the views.
- Two data-fetch styles coexist: `@tanstack/react-query` (Calendar.tsx:100,116; Clients.tsx via `usePaginatedList`, Clients.tsx:62) versus manual `useEffect` + `useState` + `loading` flag (ClientDetail.tsx:72-110, Dashboard.tsx:83-233, Inspections.tsx:72-162, Sites.tsx:55-120, SiteDetail.tsx:98-105, InspectionDetail.tsx:240-256).
- Two toast systems coexist: `useToast` from `@/hooks/use-toast` (H04) in Calendar.tsx:53,93; `toast` from `sonner` in the other seven mutation-bearing files (e.g. ClientDetail.tsx:10, Clients.tsx:15, Inspections.tsx:13, Sites.tsx:13, SiteDetail.tsx:6, InspectionDetail.tsx:13).
- Entity deletes are DB-row-only in the list views: Clients.tsx:333, Sites.tsx:160, and SiteDetail.tsx:387-404 delete rows without removing associated storage objects; the exceptions that do touch storage are Clients.tsx handleDeleteLogo (302-304), SiteDetail.tsx handleDeleteSiteDocument (522-525), and InspectionDetail.tsx image/document deletes (1522, 1558).
- The `site-images` bucket signed-URL rewrite (split on `/site-images/`, `createSignedUrl(path, 3600)`) is implemented three times: Sites.tsx:77-99, SiteDetail.tsx:450-466, InspectionDetail.tsx:885-904.
- Native `window.confirm` is used for destructive actions in Clients.tsx:330, Sites.tsx:157, Inspections.tsx:202, SiteDetail.tsx:317,358,591, InspectionDetail.tsx:405,464,617,1513; Calendar and ClientDetail use AlertDialog components instead (Calendar.tsx:1066, ClientDetail.tsx:506).
- COC compliance stats are computed with the shared `calculateCocComplianceStats` in both Dashboard.tsx:147 and SiteDetail.tsx:499 (L09), and site triage/deliverables with `summarizeSitesForTriage`/`computeSiteDeliverables` in Dashboard.tsx:229 and SiteDetail.tsx:687 (L17).
- No file in this unit has a `"use client"` directive (consistent with inventory/10-src-views.md:142).
- No test file imports any of the nine views (`git ls-files '*.test.*' | xargs grep -l '@/views/...'` → no hits).

**External contract.** The rest of the app consumes only the nine default exports, always propless, from route wrappers in A03 (top-level list pages), A04 (dynamic entity-detail pages, two parallel hierarchies `/sites/...` and `/clients/[clientId]/sites/...`), and A07 (contractor inspection route → InspectionDetail). Nothing else imports from these files (grep-verified per file below). The unit itself pulls in V06 (`SiteCocTab`) and V07 (`subsection-detail` barrel) as composition children.

---

## src/views/Calendar.tsx

- Purpose: Year-grid + agenda calendar of `calendar_events` for the current year with CRUD dialogs, site/status filters, a flat schedule table, and PDF export.
- Public surface: default export `Calendar()` — no props (Calendar.tsx:72, 1090). Internal only: `CalendarEvent` interface (58-68), `EVENT_TYPES` const (70), helpers `getEventsForDay`, `getPriorityColor`, `getStatusColor`, `getSiteColor`, `getStatusDotColor`, `exportToPDF` (155-437).
- Inputs & outputs:
  - In: none (props); current year defaults to `new Date().getFullYear()` (73).
  - Reads: `calendar_events` filtered to the year by `start_date` (103-108); `sites` id+name for the picker (119-122).
  - Writes: `calendar_events` insert (323-335, with `created_by: user?.id`), update (305-318, with `updated_by`), delete (359-362).
  - Stores: tables `calendar_events`, `sites`; no storage buckets, no localStorage.
- Dependencies: uses -> `@tanstack/react-query` `useQuery`; `supabase` (L19, src/integrations/supabase/client.ts); `date-fns`; `lucide-react`; shadcn ui kit (C01: button, card, badge, table, dialog, tooltip, input, label, textarea, select, tabs, popover, command, alert-dialog); `@/hooks/use-toast` (H04); `@/lib/utils` cn (L18); `generateCalendarPdf`/`CalendarReportData` from `@/lib/calendarReportGenerator` (L10); `downloadBlob` from `@/lib/fileDownload` (L12).
  used by <- A03 `src/app/(admin)/calendar/page.tsx:2` (grep-verified; sole importer).
- Side effects: Supabase reads/writes above; `supabase.auth.getUser()` on save (303); PDF generation + browser download via `downloadBlob` (427-430); react-query `refetch()` after mutations (342, 366).
- Error handling: query errors are thrown into react-query; grid shows explicit loading / error-with-Retry / empty states (521-535). Save: client-side validation toasts (283-298), catch toasts `error.message` (343-348). Delete: catch toasts a generic "Failed to delete event" (367-373). Export: `generateCalendarPdf` result checked and failure toasted (429-432), but the surrounding `try` has **no catch** — only `finally` (426-436), so a thrown (rather than returned) error propagates out of the click handler after resetting `isExporting`.
- Tests: none found (grep-verified; `src/lib/report/calendarRows.test.ts` covers L07 row-builders, not this view).
- Observed issues:
  1. The Schedule table renders unfiltered `events` (764) while the grid and agenda render `filteredEvents` (129-135) — the site/status filters affect only the upper card.
  2. `exportToPDF` uses try/finally with no catch (426-436); a rejection from `generateCalendarPdf` or `downloadBlob` escapes the handler.
  3. Three separate status→color mappings exist in one file: `getStatusColor` (189-200), `getStatusDotColor` (379-390), and inline ternary badge classes in the Schedule table (777-781); priorities likewise duplicated (176-187 vs 788-792).
- ASSUMED: `calendar_events.site_name` is a denormalized copy of the site name (written on save at 310/329 from the picker); not verified against schema. The `refetch` after save/delete presumably also invalidates the "calendar-sites" query indirectly — not verified (only `refetch` of the events query is called).

## src/views/ClientDetail.tsx

- Purpose: Client profile page showing contact info, client-logo management (upload/delete/legacy-URL cleanup), aggregate counts, and a nested sites → subsections/inspections/documents accordion.
- Public surface: default export `ClientDetail()` — no props (ClientDetail.tsx:60, 532). Internal interfaces `Client`, `Site`, `Subsection`, `Inspection`, `DocumentItem` (18-58).
- Inputs & outputs:
  - In: `clientId` route param (61).
  - Reads: one nested select `clients` → `sites(*, subsections(*, subsection_documents(*)), inspections(*))` by id, `.maybeSingle()` (83-87); site scores via `useSiteScores(sites.map(id))` (70).
  - Writes: `client-logos` bucket upload with upsert at `${clientId}/logo.<ext>` (116-117); `clients.logo_url` update with `?t=` cache-buster (119-121); `clients.logo_url = null` on delete (136) and on legacy-URL clear (173).
  - Stores: tables `clients` (nested read + update); bucket `client-logos`.
- Dependencies: uses -> `useParams`/`useNavigate` from `@/lib/navigation` (L13); `supabase` (L19); ui kit (C01: card, button, badge, tabs, alert-dialog); `getCategoryIcon`/`getCategoryColor` from `@/lib/subsectionCategories` (L18); `sonner`; `Breadcrumbs` (C11, src/components/Breadcrumb.tsx); `useCamera` (H02); `useSiteScores` (H03); `SiteHealthBadge` (C14).
  used by <- A04 `src/app/(admin)/clients/[clientId]/page.tsx:2` (grep-verified; sole importer).
- Side effects: nested Supabase read on mount/param change (72-76); logo capture via `useCamera.takePicture({ preferCamera: false })` + FileReader data-URL preview (144-162); storage upload; `clients` updates; navigation to `/clients/${clientId}/sites/${site.id}` on site-card header click (386).
- Error handling: fetch catch logs + toasts "Failed to fetch client data" (104-106); missing client toasts "Client not found" and leaves the not-found UI (89-92, 190-201). `handleLogoUpload` wraps in try/catch, but the awaited `storage.upload` and `clients.update` results are not destructured — supabase-js returns errors in the result object rather than throwing, so those failure paths fall through to the success toast (116-122). `clearLegacyUrl` has no error handling at all (171-176). Capture errors log and clear the preview (158-161).
- Tests: none found (grep-verified).
- Observed issues:
  1. `handleLogoUpload` ignores the error results of both the storage upload and the DB update (117-121): a failed upload still updates `logo_url` to the (nonexistent) public URL and toasts success.
  2. `clientError` from the query is destructured but never checked (83-87).
  3. `handleDeleteLogo` nulls `clients.logo_url` only; the object in `client-logos` is not removed (133-142) — unlike Clients.tsx:302-304 which does remove it.
  4. `Pencil` is imported (8) but never used (grep-verified within file).
- ASSUMED: `DocumentItem`/`Subsection.documents` maps to the nested `subsection_documents(*)` rows (the select at 85 aliases nothing; the code reads `sub.documents` at 206/441 — whether Supabase returns that key as `documents` or `subsection_documents` was not verified against the runtime payload; the totalDocuments count reads `sub.documents`).

## src/views/Clients.tsx

- Purpose: Server-paginated clients grid (24/page) with create/edit dialogs (zod-validated), logo upload with post-insert folder rename, logo delete, and client delete.
- Public surface: default export `Clients()` — no props (Clients.tsx:33, 747). Internal `Client` interface (20-31).
- Inputs & outputs:
  - In: none.
  - Reads: `clients` with `sites(id)` join, `count: "exact"`, ordered by name, `.range(from, to)` via `usePaginatedList` pageSize 24 (62-79).
  - Writes: `clients` insert (132-142, `created_by: user?.id`), update (259-265), delete (333); `client-logos` bucket: upload `new-client-<ts>/logo.<ext>` (115-121), download temp + re-upload `<clientId>/logo.<ext>` + remove temp (147-175), upload on edit (240-250), remove on logo delete (296-304); `clients.logo_url` updates with `?t=` cache-buster (137, 173, 263, 314).
  - Stores: tables `clients`, `sites` (joined ids only); bucket `client-logos`.
- Dependencies: uses -> `useNavigate` (L13); `supabase` (L19); `usePaginatedList` (H03); `ListPagination` (C16); ui kit (C01: button, card, input, label, dialog, dropdown-menu, badge, alert-dialog); `sonner`; `clientSchema` from `@/lib/validation-schemas` (L18); `zod`; `EmptyState` (C16).
  used by <- A03 `src/app/(admin)/clients/page.tsx:2` (grep-verified; sole importer).
- Side effects: paginated Supabase reads; `auth.getUser()` on create (105); storage upload/download/remove sequences; `refetch()` after every mutation (81, 190, 282, 322, 337); `URL.createObjectURL` for logo previews (547, 693); card click navigates to `/clients/${client.id}/sites` (384).
- Error handling: create/update validate with `clientSchema.safeParse`, map field errors into `formErrors`, and toast "Please fix the validation errors" (87-98, 220-231). Mutation catches log and toast generic messages (191-193, 283-285, 323-325, 338-340). Logo storage delete failure inside `handleDeleteLogo` is logged but does not abort the DB update (306-309). `handleDelete` gates on `window.confirm` (330).
- Tests: none found (grep-verified).
- Observed issues:
  1. `handleUpdate` spreads raw `formData` into the update (262), not `validation.data` — validation runs but its output is unused (contrast create, which inserts `validated`, 132-139).
  2. Object URLs from `URL.createObjectURL` (547, 693) are never revoked.
  3. `handleDelete` removes the `clients` row only; any logo object in `client-logos` remains (329-342).
  4. Create-with-logo is a 5-step sequence (upload temp → insert → download temp → upload final → remove temp → update URL, 112-176); if the intermediate `download(oldPath)` returns no data, the client keeps the `new-client-<ts>/...` URL and the temp file is never deleted (152-176).
- ASSUMED: `usePaginatedList` keys pages under `["clients-list", page]` or similar and drives `isFetching` — the hook's internals (H03) were not read for this spec; behavior stated from its call-site contract (54-79).

## src/views/Dashboard.tsx

- Purpose: Admin landing dashboard: entity/KPI stat cards (sites, subsections, clients, COC compliance, snags, QR scans 30d), sites-needing-attention triage, high-risk snag tracker, upcoming schedule, recent activity, and recent assignments.
- Public surface: default export `Dashboard()` — no props (Dashboard.tsx:62, 533). Internal interfaces `DashboardStats`, `ActivityLog`, `UpcomingEvent`, `HighRiskSnag` (15-60).
- Inputs & outputs:
  - In: none.
  - Reads (fetchDashboardData, one Promise.all, 92-133): `clients` count, `sites` count, `subsections` (id, coc_status, is_coc_required + count), `inspections` count, `snags` (id, status + count), `activity_logs` latest 5, `calendar_events` next 5 from today, `snags` High/Critical latest 10 with nested `subsections(sites(...))`, `qr_scans` count for last 30 days.
  - Reads (fetchTriageData, second Promise.all, 174-183): full-table selects of `sites`, `subsections` (8 columns), `snags`, `inspections`, `site_schematics`, `site_assets`, `site_documents`, `subsection_documents` with `document_categories(name)`.
  - Writes: none.
  - Stores: nine tables read; no buckets; no localStorage.
- Dependencies: uses -> `supabase` (L19); ui kit (C01: card, button, badge, progress); `date-fns`; `useNavigate` (L13); `RecentAssignmentsWidget` (C14); `calculateCocComplianceStats` from `@/lib/complianceCalculations` (L09); `SitesNeedingAttention` (C17, src/components/dashboard/SitesNeedingAttention.tsx); `summarizeSitesForTriage`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS`, types from `@/lib/siteDeliverables` (L17).
  used by <- A03 `src/app/(admin)/dashboard/page.tsx:2` (grep-verified; sole importer).
- Side effects: the two fetch batches on mount (83-86); navigation on buttons and row clicks (262-273, 377-380, 410-416: high-risk snag rows deep-link to `/clients/{clientId}/sites/{siteId}/subsections/{subsectionId}`).
- Error handling: `fetchDashboardData` has a single catch that logs (`console.error`) with no user-facing feedback (165-167); none of the nine Promise.all results has its `.error` field checked — a failed query silently yields `count || 0` / empty arrays (135-164). `fetchTriageData`'s catch logs only in development (230-232). No error UI states.
- Tests: none found for the view (grep-verified). `src/lib/siteDeliverables.test.ts` covers the triage functions it calls (L17), not this file.
- Observed issues:
  1. No query error is checked anywhere in either fetch (92-164, 174-227); failures render as zeros/empties.
  2. `totalSnags`/`totalSubsections` use the exact `count` while `openSnags`/`closedSnags` (141-142) and `calculateCocComplianceStats` (147) are computed from the returned rows array — two different sources for the same tables in the same cards.
  3. `subs` is cast `as any[]` with an in-code comment stating the generated Supabase types predate the `is_thermal_required` column (186-188).
  4. `assetCount` passed to triage is `assetSites.has(site.id) ? 1 : 0` (223) — a boolean-as-count — whereas SiteDetail passes a real head-count (SiteDetail.tsx:488, 493).
  5. The same global `thermalDocSubsectionIds` array is passed unchanged into every site's `SiteDeliverablesInput` (212-226).
  6. `fetchTriageData` selects entire tables with no filter, range, or pagination (174-183).
  7. `FileText`, `Plus`, and the alias `FileText as TemplateIcon` are imported (4) but never rendered (grep-verified within file).
- ASSUMED: PostgREST's default row cap bounds the un-ranged selects (relevant to issues 2 and 6); the actual configured max-rows for this project was not verified.

## src/views/InspectionDetail.tsx

- Purpose: The 3,102-LOC inspection editor: loads an inspection plus its template (normalizing array/object section shapes), renders per-section item tabs (status/notes/photos/documents), an image-gallery mode, EMB tenant management, a snag list, Site Drawing floor-plan mode, QR code with logo overlay, and full offline cache/queue support; shared by two admin routes and the contractor portal route.
- Public surface: default export `InspectionDetail()` — no props (InspectionDetail.tsx:101, 3102). Internal interfaces `InspectionTemplate`, `Tenant`, `InspectionData` (37-99); internal render helpers `renderGeneralInfo` (1702), `renderImageGallery` (1841), `renderInspectionItem` (1901); ~30 internal handlers.
- Inputs & outputs:
  - In: route params `clientId`, `siteId`, `subsectionId`, `inspectionId` (102); search param `?preview=` (105); contractor-portal mode inferred as `!clientId && !siteId && !subsectionId` (106).
  - Reads: `inspections` by id with nested `sites(clients(...))` and `subsections(id,name)` (771-792); `inspection_templates` by `template_id` (846-852); `settings.company_logo_url` (259-263); `snags` by subsection (283-288); offline cache via `getCachedInspection` (735, 757).
  - Writes: `inspections.json_data`+fields update on Save (1683-1686) and tenant-image auto-saves (555-561, 645-651); `snags` insert/update/delete/status-toggle (322-324, 355-365, 389-394, 408-411); storage `inspection-photos` uploads (682-684, 1231-1233, 493/535 via `useImageUpload`) and removes (1558, and via `deleteImage` 625); storage `documents` uploads under `inspections/{id}/...` (1460-1462) and removes (1522); offline: IndexedDB image blobs via `addOfflineImage` (1198) and queued full save via `queueFullInspectionSave` (1673).
  - Stores: tables `inspections`, `inspection_templates`, `settings`, `snags`; buckets `inspection-photos`, `documents`, `site-images` (signed URL read, 893-895); offline IndexedDB/localStorage via H01/H02 hooks.
- Dependencies: uses -> `@/lib/navigation` (L13); `templateSupportsTenants` from `@/lib/templateTenants` (L18); `qrRedirectUrl` from `@/lib/qrBaseUrl` (L16); ui kit (C01); `sonner`; `date-fns`; `qrcode`; `supabase` (L19); `ComprehensiveInspectionReport` (C14); `InteractiveFloorPlan` (C12); `DynamicFieldManager` (C15); `useCamera`, `useImageUpload` (H02); `RobustImage`, `FullscreenImageViewer` (C16); `Breadcrumbs` (C11); `generateInspectionImagePath`, `generateTenantImagePath`, `renameInspectionImages` from `@/lib/imageNaming` (L12); `InspectionOfflineBanner` (C13); `useOfflineInspectionDetail` (H02); `useOfflineSync` (H01).
  used by <- A04 `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx:2` and `src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx:2`; A07 `src/app/(contractor)/contractor/inspections/[inspectionId]/page.tsx:2` (grep-verified; three importers).
- Side effects: session check + `refreshSession` before fetch (747-768); retrying fetch (max 2, backoff, on PGRST000/network/timeout/not-found, 798-829); QR canvas generation encoding `qrRedirectUrl(subsection_id)` at 500px ECC H with white-boxed logo overlay (1079-1145); `cacheInspection` for offline (1066-1074); camera/gallery capture via hidden inputs and `useCamera`; per-tenant auto-save of `json_data`; navigation fallbacks to contractor portal / subsection / `/inspections` on load failure (812-818, 833-839) and to `/auth` after JWT-expiry detection (588-591, 715-717, 1296-1298).
- Error handling: multi-layered in `fetchInspectionData`: offline→cache-or-navigate-back (734-744); expired session→refresh→cache fallback→`/auth` (747-768); error-code-specific toasts (RLS/permission/42501, 804-810); retries; final catch toasts "Failed to load inspection data" (1146-1148). Upload handlers detect JWT expiry by message/status sniffing and re-check the session, else toast the message (578-594, 704-721, 1285-1302). Tenant auto-save failure downgrades to a warning toast telling the user to Save manually (563-566, 653-656). `handleDeleteDocument` treats storage-remove failure as non-fatal ("continuing", 1520-1526). Save validates quality-rating-before-Completed both at field level (1810-1813) and on Save (1634-1637); offline Save queues and toasts (1672-1680).
- Tests: none import this view (grep-verified). The offline machinery it depends on is tested in H01/H02: `src/hooks/useOfflineInspectionDetail.queueSave.test.tsx`, `useOfflineInspectionDetail.selfHeal.test.tsx`, `useOfflineSync.online.test.tsx`, `useOfflineSync.queueRaces.test.tsx`, `useOfflineSync.syncInspection.test.tsx` — these assert queue/save/sync behavior of the hooks, not this component's rendering or handlers.
- Observed issues:
  1. `handleRenameExistingImages` (1592-1628) is defined but never invoked (grep-verified: single occurrence); `renamingImages` state (140) therefore never changes.
  2. Inside that function, `siteData.siteName` is passed as **both** the `clientName` and `siteName` arguments (1603-1604) of `renameInspectionImages(inspectionId, clientName, siteName, subsectionName, jsonData)` (imageNaming.ts:157-162) — the clientName slot even carries the fallback string `'unknown-client'`.
  3. `ComprehensiveInspectionReport` receives `clientName={siteData?.siteName}` (2218) while `siteData.clientName` exists (907).
  4. Declared-but-unused: `migratingImages`/`setMigratingImages` (139), `queueMutation` (125), `cachedData` (114), `saveInspectionSection` (119), `isNative` (107) — each has no further reference in the file (grep-verified).
  5. The load effect's early-return branch reads `isOnline` and `initialLoadDone` to skip a "back online" refetch (240-256), but `isOnline` is not in the dependency array `[clientId, siteId, subsectionId, inspectionId]`, so the branch is only evaluated on route-param changes.
  6. `fetchCompanyLogo` and `fetchInspectionData` start in the same effect tick (249-250), and the QR logo overlay reads the `companyLogo` state captured in `fetchInspectionData`'s closure (1095) — on first load that value is `null`, so the branch at 1143-1144 renders the QR without a logo.
  7. `handleDeleteImage`/`handleDeleteDocument` remove the storage object immediately but only mutate local `jsonData` state (1512-1590); the DB `json_data` still references the deleted URL until the user presses Save.
  8. The tenant dialog persists tenants to local state only (`handleSaveTenant`, 439-456) — DB persistence happens on the next full Save or a tenant-image auto-save; meanwhile `breakerImage`/`ctRatioImage` in the dialog are plain "Paste image URL" text inputs (2804-2835) while `meterImage` gets a camera-capture flow (2867-2884), and the per-tenant cards outside the dialog have upload buttons for all three (2474-2612).
  9. The JWT-expiry detection block is duplicated verbatim in three handlers (578-591, 704-718, 1285-1299).
  10. Empty statement bodies: `if (success) { }` after `cacheInspection` (1071-1073) and an empty `else` in `handleRenameExistingImages` (1617-1618).
- ASSUMED: the 2000-line first read plus 1503-line second read cover the whole file (3102 lines total per `wc -l`) — no gap. The offline image upload executor appending URLs to `json_data` after sync (described in the comment at 1189-1194) lives in H01's `useOfflineSync`/`orderQueueForSync` and was not re-verified here.

## src/views/Inspections.tsx

- Purpose: Flat list of all inspections with client/site context, offline-aware creation and deletion via `useOfflineInspections`, and a link-to-subsection assignment dialog for unlinked inspections.
- Public surface: default export `Inspections()` — no props (Inspections.tsx:51, 508). Internal interfaces `Inspection` (20-41), `Site` (43-49).
- Inputs & outputs:
  - In: none.
  - Reads: `inspections` with nested `sites(clients)` and `subsections`, newest first (80-83); `sites` with `clients(name)` (84); when offline, unsynced inspections from `offlineDB.getUnsyncedInspections()` (94, 134).
  - Writes: create/delete routed through `useOfflineInspections.createInspection`/`deleteInspection` (173-179, 205); direct `inspections.subsection_id` update in the assign dialog (236-239); `subsections` read per site for the dialog (219-223).
  - Stores: tables `inspections`, `sites`, `subsections`; IndexedDB via `offlineDB` (L11) when offline.
- Dependencies: uses -> `useNavigate` (L13); `supabase` (L19); ui kit (C01: button, card, input, label, dialog, select, table, badge); `sonner`; `date-fns`; `inspectionSchema` from `@/lib/validation-schemas` (L18); `zod`; `useOfflineInspections` (H02); `offlineDB` from `@/lib/offlineDB` (L11).
  used by <- A03 `src/app/(admin)/inspections/page.tsx:2` (grep-verified; sole importer).
- Side effects: fetch on mount (72-74); `auth.getUser()` on create (171); row click navigates through the full hierarchy when linked (`/clients/{clientId}/sites/{siteId}/subsections/{subsectionId}/inspections/{id}`, 409-417), opens the assign dialog when unlinked (419), and toasts info for `offline_`-prefixed ids (404-407).
- Error handling: fetch catch logs and, if offline, falls back to IndexedDB-only data with an info toast, else toasts "Failed to fetch data" (128-158). Create: `ZodError` produces per-field toasts, other errors toast `error.message` (189-198). Delete gated by `confirm` and toasts on failure (201-211). Assign dialog: subsection-load failure and link failure each toast (226-229, 245-248).
- Tests: none found (grep-verified).
- Observed issues:
  1. In the offline merge branch, `sites.find(...)` (97) reads the `sites` **state** from the render closure — on the first fetch this is still `[]` because `setSites` runs later in the same function (127), so offline rows resolve to the "Unknown Site" fallback; additionally the mapped shape assigns the client *name* to `client_id` (`client_id: site.clients?.name || ''`, 109).
  2. New inspections are created without a `subsection_id` (formData has none, 57-62; insert payload 173-179) and immediately appear with the amber "Unlinked" badge (431-440) — creating and then linking are two separate user steps by design of this code.
- ASSUMED: `useOfflineInspections.createInspection` writes to Supabase when online and queues offline (H02 hook not re-read for this spec); the `status` field of offline rows renders nowhere in the table (no status column, 388-395) — presumed intentional display choice.

## src/views/SiteDetail.tsx

- Purpose: The site hub page: header + nine tabs (Dashboard KPIs/checklist, Schematic, Asset Verification, Documents, Subsections, Site COC, QR Codes, Fortress Checklist, Reports), site edit dialog, document category/file management, subsection deletion, and site-level inspection creation — mostly by composing C07/C08/C09/C14 components, V06's `SiteCocTab`, and L05 document mutations.
- Public surface: default export `SiteDetail()` — no props (SiteDetail.tsx:53, 893). Internal interfaces `SiteDocument` (40-43), `Inspection` (45-51).
- Inputs & outputs:
  - In: route params `clientId`, `siteId` (54); search params `tab`, `upload=thermal`, `generate=1` (68-71, 651-669, 851).
  - Reads: `settings.company_logo_url` (109-113); `site_documents` by site (125-129); `subsections` ids then `subsection_documents` with `document_categories(name)` (142-171); `inspection_templates` (196-199); `site_document_categories` by site (212-216); `sites` with `clients(id,name)` (416-420); `subsections` by site (424-428); `inspections` by site (432-436); `snags` by subsection ids (442-445); `site_schematics` existence + `site_assets` head-count (486-489); signed URL for `site-images` (450-466).
  - Writes: `site_document_categories` insert defaults ×6 (231-239), insert (264-272), rename (613), order swap (623-624), delete (297-300); `site_documents` delete by category/site/id (289-292, 327-330, 367-370, 527), insert on upload (564-567); `documents` bucket upload (561) and remove (525); `subsection_documents`/`inspection_items`/`snags`/`inspections`/`qr_scans`/`document_categories` deletes + `subsections` delete in `handleDeleteSubsection` (387-404); `sites` update (540); `inspections` insert (633-637); rename/move/delete documents via L05 `renameDocument`/`moveDocuments`/`deleteDocuments` (586, 592, 599).
  - Stores: 12 tables; buckets `documents`, `site-images` (signed read).
- Dependencies: uses -> `@/lib/navigation` (L13); `supabase` (L19); `sonner`; `date-fns` format (imported, see issues); C14 `ComplianceDashboard`, `FortressMarkingChecklist`; C15 `DocumentPreviewDialog`; `downloadFile` from `@/lib/fileDownload` (L12); `Site`/`Subsection`/`SiteStats` types from `@/types/site` (L22); C07 `SiteComplianceChecklist`, `AssetVerification`, `InspectionDialogs`; C09 `SubsectionList`, `QRCodeManager`, `QRScanActivity`, `SiteEditDialog`, `SchematicDiagram`; C08 `SiteDocuments`, `SiteReports`, `DocumentDialogs`, `MoveDocumentsDialog`, `DocumentHistoryDialog`; ui kit (C01); C11 `Breadcrumbs`; V06 `SiteCocTab` (src/views/site-coc/SiteCocTab.tsx); `calculateCocComplianceStats` (L09); `computeSiteDeliverables`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS` from `@/lib/siteDeliverables` (L17); `buildSiteKpiBlock` from `@/lib/siteCoc/reportKpis` (L03); `useUserRole` (H03); L05 `documentMutations` + `validateUploadFile` from `uploadConstraints`.
  used by <- A04 `src/app/(admin)/sites/[siteId]/page.tsx:2` and `src/app/(admin)/clients/[clientId]/sites/[siteId]/page.tsx:2` (grep-verified; two importers).
- Side effects: six fetches on mount/`siteId` change (98-105); deep-link effects for `?tab=` (651-654) and one-shot `?upload=thermal` (656-669, ref-guarded); silent refetch of site data + documents on entering the overview tab (676-682, per in-code comment about the server-side COC roll-up trigger); `auth.getUser()` on upload (554); navigation to subsection-create route (832) and to `?tab=inspections` after site-level inspection creation (642-643); `canManageDocuments` gate = role "Admin" (57-58).
- Error handling: every fetch catch logs only in development and stays silent to the user except `fetchSiteData` which toasts "Failed to fetch site data" (508-511). Mutations toast success/failure generically (e.g. 280-283, 304-311, 342-348, 406-411, 528-533, 542-547). Upload loop counts per-file ok/failed with a bare `catch { failed++ }` (556-571) after `validateUploadFile` pre-check (557-558). Rename/move/delete via L05 report per-result `ok` counts in toasts (585-604). Category rename away from "COC" requires a `window.confirm` (609-611). Bulk deletes are `window.confirm`-gated (317-321, 358-362, 591).
- Tests: none found (grep-verified).
- Observed issues:
  1. `handleCreateCategory`'s "current max order_index" is computed by parsing the leading number out of category **names** (`parseInt(cat.name.split(' ')[0])`, 260-262), not from `order_index`.
  2. `stats` is computed and set (501-507) but never read anywhere in the file (grep-verified: only the declaration at 65 and the setter at 501) — the `SiteStats` snapshot is dead state.
  3. The edit dialog initializer hardcodes `description: ''`, `status: 'Active'`, `location_lat: ''`, `location_lng: ''` instead of the site's stored values (722-724), and `handleUpdateSite` writes `{ ...editFormData }` verbatim (540) — every save writes those literals.
  4. `handleDeleteSubsection` deletes rows from six child tables plus the subsection (387-404) with no storage-object cleanup; likewise `handleDeleteCategory`/`handleBulkDeleteCategories`/`handleBulkDeleteDocumentsInCategory` delete `site_documents` rows without touching the `documents` bucket (286-380), while single-document delete does remove storage (522-525).
  5. `fetchDocumentCategories` performs inserts as a side effect of a read — six default categories are created whenever the site has none (220-243).
  6. `SiteDocument` interface (40-43) is unused; `siteDocuments`, `subsectionDocuments`, `documentCategories`, `availableTemplates` are all typed `any[]` (72-73, 84, 94).
  7. Unused imports: `format` from `date-fns` (7), `Badge` (23), and `Card`/`CardTitle`/`CardHeader`/`CardDescription` (21) have no render sites in the file (grep-verified: no `format(`, `<Badge`, `<Card` occurrences).
- ASSUMED: the "server-side COC roll-up trigger" referenced by the comment at 671-675 exists in a D-unit migration (not verified here). The `documents` bucket public-URL insert at 563-566 implies the bucket serves public URLs — bucket ACL not verified.

## src/views/Sites.tsx

- Purpose: Sites list (all sites, or one client's when routed under `/clients/[clientId]/sites`) as a card grid with signed site images, health badges, an add-site dialog (zod-validated), and delete.
- Public surface: default export `Sites()` — no props (Sites.tsx:39, 389). Internal interfaces `Site` (21-32), `Client` (34-37).
- Inputs & outputs:
  - In: optional `clientId` route param (40) — filters the query (64-66) and pre-fills the create form (111-113).
  - Reads: `sites` with `clients(name)` ordered by name (61); `clients` id+name (70); `site-images` signed URLs (85-87, 1-hour expiry); site scores via `useSiteScores` (53).
  - Writes: `sites` insert with `created_by` (131-136); `sites` delete (160).
  - Stores: tables `sites`, `clients`; bucket `site-images` (signed read only).
- Dependencies: uses -> `useParams`/`useNavigate` (L13); `supabase` (L19); ui kit (C01: button, card, input, label, dialog, select, dropdown-menu); C11 `Breadcrumbs`; `sonner`; `siteSchema` from `@/lib/validation-schemas` (L18); `zod`; `RobustImage` (C16); `EmptyState` (C16); `useSiteScores` (H03); `SiteHealthBadge` (C14).
  used by <- A03 `src/app/(admin)/sites/page.tsx:2` and A04 `src/app/(admin)/clients/[clientId]/sites/page.tsx:2` (grep-verified; two importers).
- Side effects: fetch on mount/`clientId` change (55-57); `auth.getUser()` on create (129); card click navigates to `/clients/{site.client_id}/sites/{site.id}` (322) — always the client-scoped detail route, even from the unscoped `/sites` list.
- Error handling: fetch catch logs + toasts "Failed to fetch data" (114-116); signed-URL failures are swallowed per-site with a console.error, leaving the original URL on the row (93-96). Create: `ZodError` → per-field toasts, otherwise `error.message` toast (144-152). Delete: `confirm`-gated, toasts on failure (156-168).
- Tests: none found (grep-verified).
- Observed issues:
  1. `handleDelete` removes the `sites` row only (160); site images in `site-images` and all dependent rows are left to whatever the database does (no cascade handling in this file).
- ASSUMED: the site-type Select values ("Commercial", "Industrial", "Residential", "Mall", "Office", 259-264) match what `siteSchema` accepts — the schema (L18) was not re-read for this spec.

## src/views/SubsectionDetail.tsx

- Purpose: Thin composition shell for the subsection page: calls V07's `useSubsectionDetail()` aggregate hook and wires its state/handlers into the five tabs (Overview, Inspections, Floor Plan, Documents, COC & Metering), the create-subsection form, a page-level delete-document AlertDialog, and the shared dialogs component.
- Public surface: default export `SubsectionDetail()` — no props (SubsectionDetail.tsx:19, 304).
- Inputs & outputs:
  - In: none directly — all route params, data, and handlers come from `useSubsectionDetail()` (20); the `"new"` sentinel value of `subsectionId` switches the page into creation mode (35-47).
  - Reads/Writes: none of its own; every data operation is delegated to the hook (V07) or to `InteractiveFloorPlan` (C12).
  - Stores: none touched directly in this file.
- Dependencies: uses -> ui kit (C01: button, tabs, alert-dialog); `getCategoryIcon`/`getCategoryColor` from `@/lib/subsectionCategories` (L18); C11 `Breadcrumbs`; C12 `InteractiveFloorPlan`; V07 barrel `./subsection-detail` (`useSubsectionDetail`, `OverviewTab`, `InspectionsTab`, `DocumentsTab`, `CocMeteringTab`, `CreateSubsectionForm`, `SubsectionDialogs`) (9-17).
  used by <- A04 `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx:2` and `src/app/(admin)/clients/[clientId]/sites/[siteId]/subsections/[subsectionId]/page.tsx:2` (grep-verified; two importers).
- Side effects: none of its own beyond rendering; navigation calls go through `hook.navigate` (56-58, and passed down as a prop to tabs, 151, 180).
- Error handling: renders loading (23-32) and not-found (50-64) states from hook flags; the delete-document AlertDialog is mounted at page level — the in-code comment (251-253) states this is because inactive tabs unmount, which previously made the COC tab's delete button do nothing. All actual failure handling lives in V07's hook.
- Tests: none found (grep-verified).
- Observed issues:
  1. The "Export Reports" button (106) has no `onClick` handler — it renders and does nothing.
- ASSUMED: the ~30 props threaded into each tab correspond to the return object of `useSubsectionDetail` (V07, 1,214 LOC) — the hook itself was not read for this spec; prop names are taken from the call sites (133-247).
