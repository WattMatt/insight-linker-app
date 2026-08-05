# V02 — admin-ops-and-template-views

- Unit id: V02
- Slug: admin-ops-and-template-views
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 13 (per review/unit-files.json key "V02")

## Unit header

**Unit purpose (as-is).** V02 contains the admin-facing operational view bodies mounted by the `(admin)` route group: user/invite administration, application settings, QR-code database and scan activity, portal-access management (simulators + assignments), the inspection-template list/builder/validator pages, and two in-app diagnostic dashboards (a PDF-template test runner and an AI code-review page). Every file default-exports a single React component taking no props; all data access goes directly through the shared Supabase client (`src/integrations/supabase/client.ts`, L19) from inside the component.

**Module-level observations (cross-file, verified).**
- Nested mounting: Settings.tsx imports and mounts Users (Settings.tsx:14, 338) and PortalManagement (Settings.tsx:13, 342) as tabs, while both also have standalone routes (`(admin)/users/page.tsx:2`, `(admin)/portal-management/page.tsx:2`). PortalManagement in turn mounts SiteAssignments as its fourth tab (PortalManagement.tsx:5, 51). Users, PortalManagement, and SiteAssignments therefore each render at two or more mount points.
- Manifest discrepancy: the manifest V02 note says "SiteAssignments unimported", but `grep -rn "from ['\"]./SiteAssignments['\"]" src` finds PortalManagement.tsx:5 importing it via relative path. The Phase-1 grep pattern (`views/<Name>`) missed relative imports. APIClients.tsx remains genuinely importer-free (grep for `APIClients` across src+supabase excluding the file itself: zero hits).
- No test coverage: `grep -rln` for every V02 view name across `*.test.*`/`*.spec.*` in src returns nothing; no V02 file has a paired test.
- Two toast systems: QRCodes.tsx uses `useToast` from `@/hooks/use-toast` (H04) (QRCodes.tsx:11); every other toasting file in the unit uses `sonner` directly.
- Edge-function invocations from this unit: `invite-user` (Users.tsx:261, 303, 373), `delete-user` (Users.tsx:522) — both F01; `offline-review` (OfflineReview.tsx:41) — F05.
- Storage buckets touched: `profile-images` (MyProfile.tsx:97-103; Users.tsx:607, 610-618, 626), `company-logos` (Settings.tsx:61-71, 95, 102).
- Route consumption pattern: 9 files are wrapped by A03 thin pages, 3 by A05 pages; InspectionTemplates is the only view loaded via `next/dynamic` with `ssr:false` (`(admin)/inspection-templates/page.tsx:4`).

**External contract.** The rest of the app receives 13 no-prop default components. A03 (admin-shell-and-list-routes) mounts MyProfile, OfflineReview, PDFTemplateTestDashboard, PortalManagement (twice: `/portal-management` and `/site-assignments`), QRActivity, QRCodes, Settings, and Users; A05 (admin-template-routes) mounts InspectionTemplates (dynamic), TemplateBuilderPage (new + edit), and TemplateValidator. SiteAssignments is exported only into PortalManagement's tab; APIClients is exported to no one.

---

## src/views/APIClients.tsx

- Purpose: Admin screen to create/toggle/delete OAuth2 API clients, view recent external API request logs, and display static integration documentation for the reports API.
- Public surface: default `APIClients: () => JSX.Element`, no props (APIClients.tsx:38, 484). Local interfaces `APIClient` (18-26, includes `client_secret: string`) and `APILog` (28-36); not exported.
- Inputs & outputs: reads `api_clients` (all columns, ordered created_at desc; 48-51) and `api_request_logs` (limit 100; 60-64); inserts `api_clients` with `{name, created_by: auth user id}` (72-77); updates `is_active`/`updated_at` (94-97); deletes by id (108). Data out: rendered cards/tables; clipboard writes of client_id/client_secret (117-119). No localStorage/env; hardcoded `supabaseUrl = "https://oltzgidkjxwsukvkomof.supabase.co"` used in the docs tab (122, 411, 435, 451, 467).
- Dependencies: uses -> `@/integrations/supabase/client` (L19), `@tanstack/react-query`, C01 ui primitives (button/card/input/label/badge/switch/dialog/alert-dialog/table/tabs), `sonner`, `date-fns`, `lucide-react`. Used by <- none found (grep-verified: no import of `views/APIClients`, `./APIClients`, or the bare name anywhere in src/supabase).
- Side effects: 4 Supabase table operations plus `supabase.auth.getUser()` (72); `navigator.clipboard.writeText` (118); react-query cache invalidation of `["api-clients"]` (82, 101, 112); toasts.
- Error handling: query fns `throw error` — react-query holds it; the UI renders only `isLoading` for clients and nothing for logs errors (232, 363), so a failed query shows the empty state. createMutation has onError toast (87-89); toggleMutation and deleteMutation define no onError (92-104, 106-115) — a failure surfaces nowhere in the UI.
- Tests: none (grep-verified).
- Observed issues: (1) zero importers — unreachable from any route. (2) `client_secret` is selected with `*` and rendered in plaintext in the list via an eye toggle (273, 283-291), while the creation card states "This is the only time you'll see the client secret" (177). (3) Supabase project URL hardcoded (122) though the app client reads `NEXT_PUBLIC_SUPABASE_URL` from env (src/integrations/supabase/client.ts:5). (4) toggle/delete mutation failures produce no user feedback. (5) The docs tab describes endpoints owned by F03 (`oauth-token`, `api-reports`).
- ASSUMED: RLS on `api_clients`/`api_request_logs` restricts reads to admins (not verified here; policy files belong to D-era units).

## src/views/InspectionTemplates.tsx

- Purpose: Admin list of inspection templates with category tabs, pagination, inline "Tweak" editor, PDF preview dialog, PDF import, and template-PDF download.
- Public surface: default `InspectionTemplates: () => JSX.Element`, no props (295, 680). Internal (unexported): `InlineTemplateEditor({ template: InspectionTemplate; onSave: () => void; onCancel: () => void })` (78-293); interfaces `TemplateSection` (22-33), `Tenant` (35-43), `InspectionTemplate` (45-61); consts `ITEMS_PER_PAGE = 9` (63), `TEMPLATE_CATEGORIES` (8 entries, 66-75).
- Inputs & outputs: reads `inspection_templates` (all columns ordered category then name; 314-318), normalising `sections`/`tenants` from array-or-JSON-string (323-346); updates `inspection_templates` on inline save with `sections`, `sections_count = sections.length`, `pages_count = sections.length + 1`, `updated_at` (151-162). Output: `generateInspectionTemplatePdf(reportData)` → `downloadBlob` (391-394).
- Dependencies: uses -> L19 client (3), L13 `useNavigate` (2), C17 `TemplatePreviewRenderer` (16), C15 `PDFTemplateUploader` (17), C15 `PDFTemplateExportDialog` (18 — imported, never rendered), L10 `generateInspectionTemplatePdf`/`InspectionTemplateData` (19), L12 `downloadBlob` (20), C01 ui, `sonner`. Used by <- A05 `(admin)/inspection-templates/page.tsx:4` via `next/dynamic` with `ssr: false` (grep-verified; the only dynamic-loaded view in src/views).
- Side effects: fetch on mount (308-310); DB update on inline save; client-side PDF generation and blob download; navigation to `/inspection-templates/new` and `/inspection-templates/validate` (448, 452).
- Error handling: fetch catch → `console.error` + toast "Failed to fetch templates" (362-364); JSON.parse failures for sections/tenants caught with `console.error` and silently default to `[]` (329-334, 340-346); inline save catch → toast "Failed to save template" (166-168); `generatePDF` uses try/finally with no catch (390-400) — a thrown error from the generator propagates as an unhandled rejection after `isGenerating` resets; a returned `{success:false}` gets a toast (395-397).
- Tests: none (grep-verified).
- Observed issues: (1) `PDFTemplateExportDialog` imported (18) but never used. (2) `exportTemplate`/`setExportTemplate` state declared (303) and never referenced again. (3) `isGenerating` value is never read — only its setter is called (306, 389, 399); the download buttons stay enabled during generation. (4) Pagination is computed once from `filteredTemplates` (409-412) but the same `currentTemplates` block is rendered inside all 8 `TabsContent` panels (486-628). (5) `tenants` accessed via `(template as any).tenants` (338-345) although the generated types declare the column (src/integrations/supabase/types.ts:1140).
- ASSUMED: the `Tenant` interface (35-43) matches the stored `tenants` JSON shape (never rendered in this file, so unverifiable here).

## src/views/MyProfile.tsx

- Purpose: Self-service profile page for the signed-in user: personal details form, avatar upload, and password change with strength/breach gating.
- Public surface: default `MyProfile: () => JSX.Element`, no props (19, 396).
- Inputs & outputs: query `["my-profile"]` → `supabase.auth.getUser()` then `profiles` row by user id, merged with `auth_email`/`created_at_auth` (46-59). Writes: storage upload to `profile-images` at `${user.id}/avatar.${ext}` with upsert + `getPublicUrl` + immediate `profiles.update({avatar_url})` (96-106); `profiles` update of 11 fields (121-136); `auth.signInWithPassword` re-auth check (163-166); `auth.updateUser({password})` (185). Role badge from `useUserRole()` (21, 256).
- Dependencies: uses -> L19 client (2), L13 `recordAuthEvent` (3), L18 `evaluatePassword` (4), H03 `useUserRole` (16), `@tanstack/react-query`, C01 ui, `sonner`, `date-fns`. Used by <- A03 `(admin)/profile/page.tsx:2` (grep-verified).
- Side effects: storage upload; three table/auth mutations; `recordAuthEvent("password_changed", { method: "self" })` fire-and-forget (194); query invalidations of `["current-user-profile"]` (107, 138) and `["my-profile"]` (139); toasts.
- Error handling: profile query throws to react-query — UI renders only a spinner for `isLoading` (206-212), never an error state. Photo upload catch → toast (109-110); the immediate `profiles.update` after upload is awaited but its error result is not checked (106). Save catch → toast (141-142). Password flow: each gate (length < 8, mismatch, wrong current password, zxcvbn score < 2, HIBP pwned) returns early with a toast (152-183); `updateUser` errors get message-sniffed branches for weak/pwned (187-192); outer catch → toast (199-200).
- Tests: none (grep-verified).
- Observed issues: (1) new-password input has `minLength={6}` (372) while the handler enforces a minimum of 8 (152-155; comment at 150-151 says it was synced to 8). (2) Error from the avatar-url `profiles.update` is silently ignored (106) while `toast.success("Photo updated!")` still fires (108). (3) Password verification is performed by an actual `signInWithPassword` call (163-166), which is a real auth sign-in as the side channel for "check current password".
- ASSUMED: `profiles` columns `phone/job_title/department/company/address/city/country/postal_code/bio` exist as typed (update payload compiles against generated types; individual columns not re-verified in migrations).

## src/views/OfflineReview.tsx

- Purpose: Admin page that sends pasted code to the `offline-review` edge function for an AI review and renders the returned markdown.
- Public surface: default `OfflineReview: () => JSX.Element`, no props (11).
- Inputs & outputs: textarea state `customCode`; invokes edge fn `offline-review` with body `{ codeFiles: [{ path: "offline-functionality.ts", content: customCode }] }` (36-43); renders `data.review` via ReactMarkdown with custom component renderers (147-192). The `offlineFiles` array (16-24) is static display text listing 7 recommended files.
- Dependencies: uses -> L19 client (7), C01 ui (button/card/textarea/alert), `react-markdown`, `sonner`, `lucide-react`. Used by <- A03 `(admin)/offline-review/page.tsx:2` (grep-verified). The edge function itself is unit F05.
- Side effects: one network call per run; no storage or table writes; toasts.
- Error handling: empty input → toast.error and early return (27-30); invoke error → `console.error`, then message substring-sniffing: "429" → rate-limit toast, "402" → quota toast, else generic (45-55); thrown exceptions → `console.error` + generic toast (59-62); `finally` resets loading (62-64).
- Tests: none (grep-verified).
- Observed issues: (1) UI copy says the analysis is by "Gemini 3 Pro" (72, 122, 142) — a hardcoded model label in view text. (2) `data.review` is accessed without a null/shape check (57); if the function returns 200 without `review`, `setReview(undefined)` renders nothing (guarded by `{review && ...}` at 134).
- ASSUMED: the response shape `{ review: string }` matches what F05 returns (not verified in this unit).

## src/views/PDFTemplateTestDashboard.tsx

- Purpose: In-app test-runner dashboard that executes the PDF-template test suite for a chosen report type and inspects the live template configuration.
- Public surface: default `PDFTemplateTestDashboard: () => JSX.Element`, no props (250). Internal (unexported): `StatusIcon` (45), `StatusBadge` (58), `TestResultItem` (73), `SummaryCard` (115), `TemplateInspector({ reportType: TemplateReportType })` (132); const `REPORT_TYPES` (6 entries; 36-43).
- Inputs & outputs: `runPDFTemplateTests(selectedReportType)` → `TestSuiteResult` with `tests/passed/failed/warnings/skipped/startedAt/completedAt/suiteName` consumed at 267-272, 330-357, 412-428; `TemplateInspector` calls `fetchPDFTemplate(reportType)` on mount and on report-type change (136-150) and renders `template.customization`, `template.sections`, `template.accentColors` (166-245). Test results grouped by the prefix before `-` in `test.id` (267-272) against a fixed category map (274-281).
- Dependencies: uses -> L15 `runPDFTemplateTests`/`TestResult`/`TestSuiteResult` (32), H04 `fetchPDFTemplate`/`TemplateReportType` (33), L18 `cn` (31), C01 ui (card/button/badge/tabs/scroll-area/collapsible/select), `lucide-react`. Used by <- A03 `(admin)/pdf-template-tests/page.tsx:2` (grep-verified).
- Side effects: whatever network/DB access L15's runner and H04's `fetchPDFTemplate` perform (initiated from this UI); no direct Supabase calls in this file.
- Error handling: `runTests` catch → `console.error('Test run failed:', error)` only — no toast, no error UI (260-262); `TemplateInspector.fetchTemplate` catch → `console.error` (141-143) and the UI shows "No template loaded" (161). No error boundaries.
- Tests: none (grep-verified) — the file *is* a test harness UI, routed under `(admin)` with production views.
- Observed issues: (1) A test-runner dashboard lives in the production route tree (`/pdf-template-tests`). (2) `template` state is `any` (133) and section entries are `any` in the sort/map (206-207). (3) A failed test-suite run is indistinguishable from "never ran" in the UI (results stays null, placeholder card shows; 400-409).
- ASSUMED: `TestResult.id` values always contain a `-` so `split('-')[0]` yields a meaningful category (268; id format defined in L15, not re-verified here).

## src/views/PortalManagement.tsx

- Purpose: Four-tab container combining the access-link generator, client and contractor portal simulators, and the assignments manager.
- Public surface: default `PortalManagement(): JSX.Element`, no props (8).
- Inputs & outputs: none of its own — purely composes children; static headings/copy.
- Dependencies: uses -> C01 tabs, `lucide-react`, V03 `ClientAccessSimulator` (3), V03 `ContractorAccessSimulator` (4), V02 `SiteAssignments` (5, relative import), C03 `AccessLinkGenerator` (6). Used by <- A03 `(admin)/portal-management/page.tsx:2`, A03 `(admin)/site-assignments/page.tsx:2`, and V02 Settings.tsx:13 (all grep-verified).
- Side effects: none directly; children perform their own queries when their tab content mounts.
- Error handling: none (no data access).
- Tests: none (grep-verified).
- Observed issues: (1) The `(admin)/site-assignments` route mounts this whole container, not SiteAssignments — SiteAssignments is reachable only as the fourth tab (page.tsx:2 imports PortalManagement; manifest's "SiteAssignments unimported" note is contradicted by line 5 here). (2) This container is itself nested inside Settings' "Portals" tab (Settings.tsx:342), so the simulators can render inside Settings.
- ASSUMED: Radix `TabsContent` mounts inactive tab content lazily or keeps it mounted per C01's tabs implementation — which children query on page load was not verified.

## src/views/QRActivity.tsx

- Purpose: Read-only dashboard of QR scan activity across the platform for the last 30 days (three stat cards + recent-scans table).
- Public surface: default `QRActivity: () => JSX.Element`, no props (21, 165). Local interface `QRScanEntry` (8-19).
- Inputs & outputs: reads `qr_scans` (`subsection_id, scanned_at, source`, joined `subsections(name, site_id, sites(name))`), `scanned_at >= now-30d`, ordered desc, `limit(500)` (31-38). Derived: total/distinct-subsection/distinct-site counts, each labelled with a `+` suffix when the 500 cap is hit (50-57). Source column maps `"redirect"` → "Scan" badge, `"landing"` → "Signed-in" badge, else raw value (145-151).
- Dependencies: uses -> L19 client (3), C01 card/badge, `date-fns` `formatDistanceToNow` (2), `lucide-react`. Used by <- A03 `(admin)/qr-activity/page.tsx:2` (grep-verified).
- Side effects: one read query on mount (25-27); no writes.
- Error handling: catch → `console.error` + `setScans([])` — no toast; the page then shows the "No scans recorded yet" empty state, indistinguishable from a real empty result (42-47, 119-126).
- Tests: none (grep-verified).
- Observed issues: (1) Query result is coerced with `as any as QRScanEntry[]` (41). (2) Fetch failure renders as the success-path empty state (see above). (3) Table row key is `${subsection_id}-${scanned_at}-${index}` (140) — index-dependent.
- ASSUMED: `qr_scans` RLS permits authenticated admin reads (table created in D01 migration 20251014140001; policy not re-read).

## src/views/QRCodes.tsx

- Purpose: Searchable database of all subsection QR codes with an active/retired toggle and a label-download dialog.
- Public surface: default `QRCodes: () => JSX.Element`, no props (32, 345). Local interface `QRCodeEntry` (15-30).
- Inputs & outputs: reads `subsections` (id, name, qr_code_url, created_at, site_id, qr_disabled + nested `sites(name, client_id, clients(name, company_name))`) where `qr_code_url` is not null, ordered created_at desc (68-89); reads `settings.company_logo_url` via `limit(1).maybeSingle()` (50-54); updates `subsections.qr_disabled` per toggle (141-144). Client-side substring search across client/company/site/subsection names (106-128). Download dialog renders `LabeledQRCode` with `url = qrRedirectUrl(selectedQR.id)` (331-336).
- Dependencies: uses -> L19 client (2), L13 `useNavigate` (10), H04 `useToast` (11), C16 `LabeledQRCode` (12), L16 `qrRedirectUrl` (13), C01 ui, `lucide-react`. Used by <- A03 `(admin)/qr-codes/page.tsx:2` (grep-verified).
- Side effects: two reads on mount (43-46); per-toggle table update with in-place local-state patch on success (148-152); navigation to `/clients/{clientId}/sites/{siteId}/subsections/{id}` (132); toasts (via the H04 toast store, not sonner).
- Error handling: QR fetch catch → `console.error` + destructive toast "Failed to load QR codes" (94-100); logo fetch catch → `console.error` only (59-61); toggle catch → `console.error` + destructive toast; local state is only mutated on success so no revert is needed (148-166); `finally` clears the per-row `togglingIds` lock (167-173).
- Tests: none (grep-verified). (L16's `qrBaseUrl.test.ts` covers `qrRedirectUrl`, not this view.)
- Observed issues: (1) `ExternalLink` imported but unused (9). (2) The download dialog builds the QR from `qrRedirectUrl(id)` at render time; the stored `qr_code_url` column is used only as a not-null filter and never displayed (88, 332). (3) The only view in the unit using the H04 toast store while sibling files use sonner.
- ASSUMED: `qrRedirectUrl` output matches the URL encoded in the stored PNGs (L16 behaviour; not re-verified here).

## src/views/Settings.tsx

- Purpose: Admin settings hub — branding (logo/hero/company name/QR base URL), plus tabs embedding image-compression management, the Users view, and PortalManagement.
- Public surface: default `Settings: () => JSX.Element`, no props (25, 349). Local `interface Settings` (16-23) sharing the identifier with the component const.
- Inputs & outputs: reads the `settings` table with `.select("*").single()` (38-41); uploads images to bucket `company-logos` as `${type}-${Date.now()}.${ext}` with upsert (54-66); updates `settings.company_logo_url` / `login_hero_image_url` (73-80), `company_name` (108-111), `qr_base_url` (122-127), each keyed by `settings!.id`.
- Dependencies: uses -> L19 client (7), C05 `ImageCompressionManager` (11), C05 `AutoLogoutSettings` (12), V02 `PortalManagement` (13), V02 `Users` (14), C01 ui, `sonner`, `lucide-react`. Used by <- A03 `(admin)/settings/page.tsx:2` (grep-verified).
- Side effects: storage uploads + `getPublicUrl`; three settings-table update paths, each followed by a full `fetchSettings()` refetch (83, 115, 131); toasts. "Link Google Drive" and backup buttons only fire `toast.info("... coming soon")` (138-144).
- Error handling: initial fetch catch → `console.error` only — no toast; `settings` stays null and the page renders with empty inputs (47-51); each update/upload catch → `console.error` + `toast.error(error.message || fallback)` (84-89, 116-119, 132-135).
- Tests: none (grep-verified).
- Observed issues: (1) `.single()` on `settings` (41) errors when the table has 0 or >1 rows. (2) Non-null assertions `settings!.id` in three handlers (78, 111, 126) — if the initial fetch failed, clicking Update throws before any request. (3) `primary_color` exists in the local interface (21) but is never read or edited. (4) Full Users and PortalManagement views mount inside Settings tabs while both also have standalone routes — the same admin surfaces exist at `/settings` (tabs), `/users`, `/portal-management`, and `/site-assignments`. (5) Static "No file chosen" captions under both upload buttons never reflect a chosen file (222-224, 258-260). (6) `handleBackupToGoogleDrive` (142-144) is defined but not referenced by any rendered element.
- ASSUMED: `settings` is a single-row table by convention (QRCodes.tsx:52 reads it with `limit(1).maybeSingle()`, this file with `.single()`; the row-count invariant itself was not verified).

## src/views/SiteAssignments.tsx

- Purpose: Three-tab assignment manager for contractor→site (`user_sites`), site→client grouping (read-only), and client-user→organization (`user_clients`), with a contractor-assignment history feed.
- Public surface: default `SiteAssignments: () => JSX.Element`, no props (71, 826). Local interfaces `User` (13-17), `Client` (19-23), `Site` (25-34), `Assignment` (36-45), `HistoryEntry` (47-69).
- Inputs & outputs: seven queries — contractors (`user_roles` role=Contractor, then `profiles.in(...)`; 79-98), client users (role=Client; 101-120), `clients` orgs (123-134), `sites` with nested clients (137-148), `user_sites` + separate `profiles` fetch stitched via Map (151-184), `user_clients` + profile stitch (187-218), `user_sites_history` limit 50 with separately fetched profiles and sites stitched in (221-260). Four mutations — insert/delete `user_clients` (263-299), insert/delete `user_sites` (302-342). Both add paths run a client-side duplicate pre-check before mutating (350-357, 368-375).
- Dependencies: uses -> L19 client (3), `@tanstack/react-query`, C01 ui (button/card/select/badge/alert/tabs), `sonner`, `lucide-react`. Used by <- V02 PortalManagement.tsx:5 (relative import; grep-verified — no other consumer).
- Side effects: table inserts/deletes; invalidations of `["client-assignments"]`, `["site-assignments-flat"]`, `["site-assignment-history"]`, and `["recent-site-assignments"]` (313, 336 — the latter key belongs to `src/components/RecentAssignmentsWidget.tsx:37`); toasts.
- Error handling: query fns `throw` to react-query; the UI gates the whole page on a combined `isLoading` of all seven queries (380-388) and renders no error state — a failed query leaves its data `undefined`, which downstream renders as empty lists. Mutation onError → `toast.error(error.message || fallback)` (277-279, 296-298, 318-320, 339-341). History profile/site sub-fetches ignore their errors entirely (`{ data }` destructuring only; 239-248).
- Tests: none (grep-verified).
- Observed issues: (1) Only reachable through PortalManagement's fourth tab despite an admin route named `/site-assignments` existing (that route mounts PortalManagement; `(admin)/site-assignments/page.tsx:2`). (2) The "Sites → Clients" tab is display-only — copy says "Manage which client organization owns each site" (570) but no mutation exists for it. (3) History section is titled "Contractor Assignment History" and reads only `user_sites_history` (221-228, 761-763); client-org assignment changes are not recorded/displayed. (4) Loading gate blocks the entire page until all seven queries settle (380).
- ASSUMED: `user_sites_history` rows are written by a DB trigger (table created in migration 20251119091647; the trigger itself was not read).

## src/views/TemplateBuilderPage.tsx

- Purpose: Route body for creating a new inspection template or editing an existing one, delegating the actual builder UI to `TemplateBuilder`.
- Public surface: default `TemplateBuilderPage: () => JSX.Element`, no props (9, 114); reads `templateId` from `useParams()` (11).
- Inputs & outputs: when `templateId` is present, reads that `inspection_templates` row (23-27); converts legacy object-shaped `sections` (keyed objects) into the array shape, defaulting `type:"text"`/`required:false` (31-52); passes `{name, category, description, sections, tenants}` to `TemplateBuilder` as `initialData` (54-60, 105-109). `onSave` performs `window.location.href = "/inspection-templates"` — a full page reload (69-72).
- Dependencies: uses -> L13 `useNavigate`/`useParams` (1), L19 client (6), C15 `TemplateBuilder` (5), C01 button, `sonner`, `lucide-react`. Used by <- A05 `(admin)/inspection-templates/new/page.tsx:2` and `.../[templateId]/edit/page.tsx:2` (grep-verified).
- Side effects: one read when editing; navigation (`navigate("/inspection-templates")` back button at 88; hard reload on save at 71). All writes happen inside C15's TemplateBuilder.
- Error handling: fetch catch → `console.error` + toast "Failed to load template" (61-63); `templateData` stays null so TemplateBuilder receives `initialData: null` while the page still renders in edit mode.
- Tests: none (grep-verified).
- Observed issues: (1) `templateData` typed `any` (13). (2) Save handoff bypasses the router with `window.location.href` (71), commented as "Force a page reload to fetch fresh data" (70). (3) `tenants` read via `(data as any).tenants` (59) although generated types declare the column (types.ts:1140).
- ASSUMED: `TemplateBuilder` tolerates `initialData: null` in edit mode after a failed fetch (C15 behaviour, not verified).

## src/views/TemplateValidator.tsx

- Purpose: Runs the `validate_inspection_templates` DB function and lists structural issues found in inspection templates, with per-issue edit shortcuts.
- Public surface: default `TemplateValidator(): JSX.Element`, no props (19). Local interface `TemplateIssue { template_id; template_name; issue_type; issue_description }` (12-17).
- Inputs & outputs: `supabase.rpc('validate_inspection_templates')` on mount and on the Re-validate button (25-27, 32, 88); issues rendered in a table with type badges (Structure → destructive, Missing Name → orange, Duplicate ID → yellow, else secondary; 52-63); static "About" card describing the three checks (153-187).
- Dependencies: uses -> L13 `useNavigate` (2), L19 client (3), C01 ui, `sonner`, `lucide-react`. Used by <- A05 `(admin)/inspection-templates/validate/page.tsx:2` (grep-verified). The RPC is defined in D01 migration 20251120045114 (grant to `authenticated` at its line 72).
- Side effects: one RPC call per validation; success/warning toast every run, including the automatic on-mount run (38-42); navigation.
- Error handling: catch → `console.error` + toast "Failed to validate templates" (43-45); `finally` clears both loading flags (46-49).
- Tests: none (grep-verified).
- Observed issues: (1) "Edit Template" navigates to `` `/inspection-templates/edit/${issue.template_id}` `` (139) but the only edit route directory is `(admin)/inspection-templates/[templateId]/edit/page.tsx` (URL shape `/inspection-templates/<id>/edit`) — the segment order in the navigate target matches no page directory (find over the route dir returns only page.tsx, validate, new, `[templateId]/edit`). (2) Validation auto-runs on mount and fires a toast each time the page is opened (25-27, 38-42).
- ASSUMED: the RPC's result-set column names match `TemplateIssue` (the migration's RETURNS TABLE shape was located but not read column-by-column).

## src/views/Users.tsx

- Purpose: Full admin user-management screen: paginated user list with role/status/site data, invite flow (magic link, temp password, or emailed credentials), pending Firebase-migration invites, per-user edit/reset/delete dialogs, an RLS-policy viewer, and a sites-by-contractor overview.
- Public surface: default `Users: () => JSX.Element`, no props (80, 1548). Local interfaces `UserProfile` (52-69), `PendingInvite` (71-78).
- Inputs & outputs: queries — `pending_user_invites` (122-133), `clients` (136-146), `sites` (149-159), `user_sites` grouped by site with joined profiles (162-201), and server-side-paginated `profiles` via `usePaginatedList` (pageSize 20, count exact) with three follow-up lookups per profile row (`user_roles`, `user_clients`+clients, `user_sites`+sites; 206-256). Mutations — `invite-user` edge fn for pending-invite send (261-263), fresh invite with `{email, fullName, role, isResend:false, temporaryPassword, deliverByEmail, clientId, siteIds}` (303-314), and resend/reset with `isResend:true` after refetching the user's client/site mappings (348-383); `pending_user_invites` delete (284-287); `user_roles` check-then-update-or-insert (410-434, both writes cast `as any`); `user_sites` delete-all-then-insert for contractor site edits (447-464); `profiles` status update (481-487) and profile-fields update (500-506); `delete-user` edge fn (521-524). Avatar path in `handleSaveEdit`: optional storage remove of the old object, upload `${id}/avatar.${ext}` upsert, `getPublicUrl`, or explicit-removal branch (delete + `avatar_url: null`) (595-628), then three mutations in `Promise.all` (630-643). `generateInitialPassword()` (L21) supplies an initial password when "email login details" is checked and none typed (664-668).
- Dependencies: uses -> L19 client (2), H03 `usePaginatedList` (4), L21 `generateInitialPassword` (5), C16 `ListPagination` (6), C14 `UserRLSPolicies` (50), C01 ui (12 modules), `@tanstack/react-query`, `sonner`, `lucide-react`. Used by <- A03 `(admin)/users/page.tsx:2` and V02 Settings.tsx:14 (grep-verified).
- Side effects: two edge functions (`invite-user` ×3 call sites: 261, 303, 373; `delete-user`: 522); storage remove/upload on `profile-images` (607, 610-618, 626); invalidations of `["users"]` (prefix-matched per comment at 203-205), `["pending-invites"]`, `["site-assignments-grouped"]`, `["current-user-profile"]`; toasts, including ones that print the temporary password for 10 s (325-328, 391-394); external link `<a href="/portal-management" target="_blank">` (692).
- Error handling: every mutation has onError → `toast.error(error.message || fallback)`; edge-fn wrappers additionally throw when `data.success` is false (266-268, 317, 386); `handleSaveEdit` wraps the avatar+3-mutation sequence in try/catch → toast (644-646), but the two `supabase.storage.remove` calls ignore their results (607, 626); `handleInvite` validates Client/Contractor selections with toasts before mutating (652-662); paginated query errors surface as react-query state — the table shows only the loading row or "No users found" (956-1060).
- Tests: none (grep-verified).
- Observed issues: (1) Temporary passwords are displayed in success toasts (325-328, 391-394). (2) Role cast in `handleEditUser` omits `"Client"` from the union (547: `as "Admin" | "Moderator" | "User" | "Contractor"`) while the state type includes it (93). (3) N+1 pattern — 3 extra queries per profile per page, acknowledged in the code comment (203-205, 226-252). (4) Temp-password inputs use `minLength={6}` (818, 1376) versus the 8-character minimum enforced in MyProfile's change flow (MyProfile.tsx:152). (5) Contractor site edit is delete-all-then-insert across two non-atomic requests (450-464). (6) `user_roles` writes are cast `as any` (423, 431). (7) When rendered inside Settings' Users tab, the page renders its own full-page header and invite dialog inside a tab panel (Settings.tsx:338).
- ASSUMED: the `invite-user` edge function (F01) implements `deliverByEmail`/`temporaryPassword`/`isResend` semantics matching the UI copy (invite dialog text at 708-711, 820-841); `pending_user_invites.firebase_id` implies a Firebase-migration origin (UI copy at 864-866) — function/table semantics not re-verified in this unit.
