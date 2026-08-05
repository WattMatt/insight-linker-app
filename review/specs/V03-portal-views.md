# V03 — portal-views

- Unit id: V03
- Slug: portal-views
- Spec mode: full (per-file)
- Date: 2026-07-29
- File count: 14 (matches ./review/unit-files.json "V03")

## Unit header

**Unit purpose (as-is).** Page-body components for the two authenticated portals: the client portal (dashboard, sites list, site detail, subsection detail, calendar) and the contractor portal (single-site overview, subsection detail with COC upload). The unit also contains two admin-side "preview picker" views and two admin-side "access simulator" views; none of those four, nor three of the contractor views, is imported anywhere in tracked source (grep-verified below).

**Module-level observations (cross-file facts).**
- Import status: 7 of 14 files have live route consumers; the other 7 have zero importers in `src` and `supabase` (command: `grep -rn "views/<Name>" src supabase --include='*.ts' --include='*.tsx'`, excluding untracked `" 2."` files): AdminClientPreview.tsx, AdminContractorPreview.tsx, ClientAccessSimulator.tsx, ContractorAccessSimulator.tsx, ContractorDashboard.tsx, ContractorSiteDetail.tsx, ContractorSites.tsx.
- `?preview=` search param carries two different meanings: client-portal views pass it to `useClientInfo` as a **client id** (ClientPortalDashboard.tsx:17-18, ClientPortalSites.tsx:18-19, ClientPortalSiteDetail.tsx:32-33, ClientPortalSubsectionDetail.tsx:29-30, ClientPortalCalendar.tsx:14-15), while contractor views pass it to `useContractorSites` as a **site id** (ContractorPortal.tsx:17-18, ContractorDashboard.tsx:10-11, ContractorSites.tsx:13-14, ContractorSubsectionDetail.tsx:20). The producers match: AdminClientPreview links `/client-portal?preview=<clientId>` (AdminClientPreview.tsx:116), AdminContractorPreview navigates `/contractor?preview=<siteId>` (AdminContractorPreview.tsx:155).
- The private-bucket signed-URL block for `site-images` (`split('/site-images/')` → `createSignedUrl(path, 3600)`) is repeated near-verbatim in 4 files: AdminContractorPreview.tsx:42-53, ClientPortalDashboard.tsx:133-147, ClientPortalSites.tsx:40-54, ClientPortalSiteDetail.tsx:54-68; the same logic also lives inside the `useContractorSites` hook (src/hooks/useContractorSites.tsx:8-14, unit H03) that the contractor views consume.
- `getStatusColor` for COC status badges is triplicated: ContractorPortal.tsx:67-83, ContractorSiteDetail.tsx:78-99, ContractorSubsectionDetail.tsx:110-131. The ContractorPortal copy lacks the `"Pass"`, `"Approved"`, `"Fail"`, `"Failed"`, `"Rejected"` cases present in the other two.
- The orphan-inspection fallback matcher (normalize name → pull site inspections with `subsection_id IS NULL` → match `json_data.generalInfo.shopNumber/shopName`) is duplicated in ClientPortalSubsectionDetail.tsx:85-102 and ContractorSubsectionDetail.tsx:52-70.
- Layout convention split: all five contractor views wrap their own output in `ContractorPortalLayout` (C11), e.g. ContractorPortal.tsx:113; the five client-portal views render bare content (no layout import) — their chrome comes from the `(client-portal)` route-group layout (unit A06).
- No `"use client"` directive in any of the 14 files (all rely on the consuming page wrappers; see ASSUMED entries).

**External contract.** The rest of the app consumes this unit only as default-exported, prop-less page bodies mounted by thin `src/app/**/page.tsx` wrappers: 5 client-portal routes (unit A06) and 2 contractor routes (unit A07). All route parameters arrive via `useParams`/`useSearchParams` from `@/lib/navigation` (L13). The 7 unimported files export the same shape but are referenced by nothing.

---

## src/views/AdminClientPreview.tsx

- Purpose: Admin picker that selects a client from a dropdown and opens `/client-portal?preview=<clientId>` in a new browser tab.
- Public surface: default export `AdminClientPreview: () => JSX.Element` — no props (AdminClientPreview.tsx:11, export :148).
- Inputs & outputs: reads table `clients` (full select, ordered by `company_name`, :17-20; single row :35-39) and a head-count of `sites` filtered by `client_id` (:30-33). Renders selection UI and an `<a target="_blank">` link (:115-125). No writes, no storage, no localStorage.
- Dependencies: uses -> `react` (useState), `@tanstack/react-query` (useQuery), `@/integrations/supabase/client` (L19), `@/components/ui/{card,button,select,alert}` (C01), `lucide-react`, `@/lib/navigation` `Link` (L13 — imported :9, never used). used by <- none found (grep-verified).
- Side effects: two Supabase reads. Navigation is a plain anchor with `target="_blank" rel="noopener noreferrer"` (:115-118), not the app navigate helper.
- Error handling: `clients` query throws on error (:21) and the view renders a destructive Alert with `clientsError.message` (:52-60); in the `clientInfo` query both the sites count and the `.single()` client fetch discard their `error` fields (:30, :35) — a failed client fetch yields `client: null` and rendering `clientInfo.client.company_name` (:98) would dereference null.
- Tests: none found (no `*.test.*` in src references this file; grep-verified).
- Observed issues: (1) zero importers anywhere in tracked src/supabase — dead file by grep; (2) `Link` (:9) and `ArrowLeft` (:8) imported but unused; (3) `clientInfo` queryFn ignores both Supabase `error` results, and `clientInfo.client` is dereferenced without a null guard (:98); (4) opens the preview via raw `<a href>` while the sibling AdminContractorPreview uses `navigate()` (AdminContractorPreview.tsx:155).
- ASSUMED: superseded admin-preview mechanism (naming plus the fact that `useClientInfo` still honours a `preview` param suggests the flow moved elsewhere); not verified in git history.

## src/views/AdminContractorPreview.tsx

- Purpose: Admin picker showing an infinite-scroll grid of all sites, each with a button navigating to `/contractor?preview=<siteId>`.
- Public surface: default export `AdminContractorPreview: () => JSX.Element` — no props (:12, export :188). Module constant `SITES_PER_PAGE = 12` (:10).
- Inputs & outputs: reads table `sites` paged 12-at-a-time with exact count and embedded `clients(name, company_name)` (:29-33); rewrites each `site_image_url` to a 1-hour signed URL from private bucket `site-images` (:46-48). Output: card grid + programmatic navigation.
- Dependencies: uses -> `react` (useEffect/useRef), `@tanstack/react-query` (useInfiniteQuery), `@/integrations/supabase/client` (L19), `@/components/ui/{card,button,skeleton}` (C01), `lucide-react`, `@/lib/navigation` `useNavigate` (L13). used by <- none found (grep-verified).
- Side effects: paged Supabase reads; per-site `storage.createSignedUrl` calls (:46-48); an `IntersectionObserver` on a sentinel div drives `fetchNextPage` (:72-92, cleaned up in the effect return); `navigate()` on click (:155).
- Error handling: page query throws on error (:35) and the view renders an inline error card with `error.message` (:108-116); signed-URL failures are caught and logged via `console.error`, falling back to the raw stored URL (:54-56).
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep; (2) `Briefcase` imported (:7) but unused; (3) signed-URL generation duplicates the block in three client-portal views and the `useContractorSites` hook (see unit header).
- ASSUMED: same superseded-preview inference as AdminClientPreview; not verified.

## src/views/ClientAccessSimulator.tsx

- Purpose: Admin tool that, for a selected Client-role user, compares row counts accessible under that user's `client_id` against system-wide totals to eyeball RLS scoping.
- Public surface: default export `function ClientAccessSimulator(): JSX.Element` — no props (:24). Internal interfaces `Client { id; email; full_name }` (:12-16) and `AccessStats { sites; subsections; documents: { accessible: number; total: number } }` (:18-22).
- Inputs & outputs: reads tables `user_roles` (role = "Client", :32-35), `profiles` (:43-46), `user_clients` (:60-64), plus counts/id-lists over `sites`, `subsections`, `subsection_documents` (:77-117). Renders stat cards, a summary table, and interpretation alerts. No writes.
- Dependencies: uses -> `react`, `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,select,badge,alert,table,skeleton}` (C01), `lucide-react`. used by <- none found (grep-verified).
- Side effects: Supabase reads only. All queries run under the **current admin session**; "accessible" is computed by filtering on the target user's `client_id` (:90-117), not by authenticating as that user.
- Error handling: `user_roles`/`profiles` errors throw (:37, :48) leaving react-query in error state (no error UI rendered for it); every query in the stats queryFn destructures only `data`/`count` and discards `error` (:60, :77-117) — failures silently read as 0. Missing `user_clients` row returns an all-zeros AccessStats (:66-72).
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep; (2) empty-id-list guard uses a `['']` sentinel in `.in()` filters (:105, :110, :117); (3) `getAccessLevel` maps both 0% and 100% to the `destructive` badge variant (:135-139) — labels differ ("No Access"/"Full Access"); (4) `Users` icon imported (:10) but unused; (5) all stats-query Supabase errors are discarded, so a failed query is indistinguishable from zero rows.
- ASSUMED: the tool's counts reflect what the *admin's* session can see filtered by the client's id rather than the client's true RLS view — inferred from the query pattern; not proven against the RLS policies themselves.

## src/views/ClientPortalCalendar.tsx

- Purpose: Client-portal schedule page merging the client's inspections and calendar events into Upcoming/Past groups with a client-facing status vocabulary.
- Public surface: default export `ClientPortalCalendar: () => JSX.Element` — no props (:12, export :256). Internal helpers `getClientStatus(status?) => "Completed" | "Scheduled"` (:80-81), `getStatusColor` (:83-89), `renderGroup(heading, items)` (:176-253, function declaration inside the component body after the return).
- Inputs & outputs: reads `?preview=` (client id) via `useSearchParams` (:13-14); tables `sites` (id/name by `client_id`, :22-25, :54-57), `inspections` (`.in("site_id", …)`, :33-37), `calendar_events` (`.in("site_id", …)`, :66-70). Renders grouped event cards. No writes.
- Dependencies: uses -> `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,badge,alert}` (C01), `lucide-react`, `@/hooks/useUserRole` `useClientInfo` (H03), `date-fns` (format/parseISO/isValid), `@/lib/navigation` `useSearchParams` (L13). used by <- A06 client-portal-routes (src/app/(client-portal)/client-portal/calendar/page.tsx:2).
- Side effects: Supabase reads only, gated on `clientInfo?.client_id` (`enabled`, :19, :51).
- Error handling: `inspections`/`calendar_events` errors throw into react-query error state (:39, :72) with no error UI (the view only branches on `isLoading`); the two `sites` sub-queries discard `error` (:22, :54) — null data short-circuits to `[]`. Invalid/missing dates are guarded (`parseISO` + `isValid`, :120-123) and sort to the end/start per comments (:130-136).
- Tests: none found (grep-verified).
- Observed issues: (1) internal status values are deliberately collapsed to a two-word client vocabulary ("Completed"/"Scheduled", :77-81 with explanatory comment) — a third `getStatusColor` default branch (:87) is unreachable given that projection; (2) events scoped by `site_id` with an in-code comment explaining why name-matching was rejected (:63-65).
- ASSUMED: nothing beyond the module-level "use client" assumption.

## src/views/ClientPortalDashboard.tsx

- Purpose: Client-portal landing page showing portfolio stats (sites, open snags), up to four site overview cards with health scores, and quick-action links.
- Public surface: default export `ClientPortalDashboard: () => JSX.Element` — no props (:15, export :345).
- Inputs & outputs: reads `?preview=` (client id, :16-17); tables: `sites` count + id list by `client_id` (:27-35), `subsections` count + id list (:49-58), `inspections` counts (total and upcoming `status = "Scheduled"` from today, :60-70), `snags` rows for open-count (:73-78), and a 4-site select with embedded `subsections(id)` (:97-107) plus per-subsection `snags` (:116-119); storage bucket `site-images` via `createSignedUrl` (:137-139). Renders stats, `SiteOverviewCard` grid, quick actions; all links propagate `?preview=` (:222, :228, :275, :289, :304, :316, :328).
- Dependencies: uses -> `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,alert,button}` (C01), `lucide-react`, `@/hooks/useUserRole` `useClientInfo` (H03), `@/lib/navigation` (L13), `@/components/client-portal/SiteOverviewCard` (C03), `@/lib/subsectionStatus` `isSnagOpen` (L17), `@/hooks/useSiteScores` (H03). used by <- A06 client-portal-routes (src/app/(client-portal)/client-portal/page.tsx:2).
- Side effects: Supabase reads; per-site signed-URL storage calls; no writes.
- Error handling: `sitesWithStats` throws on the sites select error (:109); the stats queryFn destructures only `count`/`data` and discards every `error` (:27-76) — failures render as zeros; signed-URL failures log `console.error` and fall back to the stored URL (:144-146).
- Tests: none found (grep-verified).
- Observed issues: (1) open-snag counting fetches all snag rows for all client subsections and filters in JS with `isSnagOpen` (:73-78) rather than counting server-side; (2) all stats-query errors silently coerce to 0; (3) the "Your Sites" section caps at 4 sites via `.limit(4)` (:107) with a "View all" link — cap is uncommunicated in the UI copy.
- ASSUMED: "use client" via consuming page wrapper (not present in this file).

## src/views/ClientPortalSiteDetail.tsx

- Purpose: Client-portal site page with six tabs — dashboard KPIs, read-only schematic, read-only asset verification, documents browser, subsection list, and COC view — plus a document preview dialog.
- Public surface: default export `ClientPortalSiteDetail: () => JSX.Element` — no props (:29, export :457).
- Inputs & outputs: reads `siteId` from `useParams` (:30) and `?preview=` (:31-32); tables: `sites` single row with embedded `clients(*)` filtered by both `id` and `client_id` (:44-49), `subsections` by `site_id` (:79-83), `site_documents` (:94-98), `site_document_categories` (:109-113), `subsection_documents` with embedded `document_categories(name)` (:125-131), `inspections` by `site_id` (:145-149); storage `site-images` signed URL (:58-60). Renders tabbed UI; passes preview-preserving links (:199, :415).
- Dependencies: uses -> `react`, `@/lib/navigation` (useParams/Link/useSearchParams, L13), `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,button,alert,tabs,input}` (C01), `lucide-react`, `@/hooks/useUserRole` `useClientInfo` (H03), `@/hooks/use-mobile` `useIsMobile` (H04), `@/components/Breadcrumb` `Breadcrumbs` (C11), `@/components/site/SchematicDiagram` (C09 — rendered `readOnly clientPortalMode`, :353), `@/components/site/AssetVerification` (C07 — `readOnly`, :358), `@/components/DocumentPreviewDialog` (C15), `@/components/client-portal/ClientPortalDocuments` (C03), `@/components/client-portal/ClientCocView` (C03), `@/lib/fileDownload` `downloadFile` (L12), `@/hooks/useSiteScores` (H03), `@/components/SiteHealthBadge` (C14), `@/types/site` `Site`/`Subsection` (L22). used by <- A06 client-portal-routes (src/app/(client-portal)/client-portal/sites/[siteId]/page.tsx:2).
- Side effects: Supabase reads; signed-URL storage call; `downloadFile` triggers a browser download (:157-158); no table writes.
- Error handling: site query throws on error (:51) → `site` undefined → "Site not found" card with back link (:173-184); the five child queries throw into react-query error state with no dedicated error UI (defaults `= []` keep rendering, :75, :90, :105, :120, :141); `handleDownload` catches and only `console.error`s (:159-161); signed-URL failure logs and falls through to raw data (:66-68).
- Error handling addendum: the `sites` query is the only one scoped by `client_id`; nothing downstream re-checks ownership (see Observed issues).
- Tests: none found (grep-verified).
- Observed issues: (1) `isMobile` computed (:37) but never referenced again (single occurrence in file); (2) child queries (`subsections`, `site_documents`, `site_document_categories`, `inspections`) are `enabled: !!siteId` only — they run and render regardless of whether the client-scoped `sites` query matched, filtering by `site_id` alone (:75-118, :141-154); data exposure is bounded only by RLS, not by this view; (3) download failures produce no user feedback (console only).
- ASSUMED: RLS actually restricts those child tables per client — asserted by comments elsewhere in the unit (ClientPortalSites.tsx:26-27) but not verified against migrations in this spec.

## src/views/ClientPortalSites.tsx

- Purpose: Client-portal list of the client's sites with client-side search and a health badge per site.
- Public surface: default export `ClientPortalSites: () => JSX.Element` — no props (:16, export :179).
- Inputs & outputs: reads `?preview=` (:17-18); table `sites` full select by `client_id` (:28-32); storage `site-images` signed URLs (:44-46). Search filters in-memory on name/address/site_type (:76-83). Links to `/client-portal/sites/<id>` preserving preview (:164).
- Dependencies: uses -> `react`, `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,button,alert,input}` (C01), `lucide-react`, `@/hooks/useUserRole` `useClientInfo` (H03), `@/hooks/useSiteScores` (H03), `@/components/SiteHealthBadge` (C14), `@/lib/navigation` (L13). used by <- A06 client-portal-routes (src/app/(client-portal)/client-portal/sites/page.tsx:2).
- Side effects: Supabase reads and signed-URL calls only.
- Error handling: sites query throws on error (:34) into react-query error state — no error UI branch (only `isLoading` skeletons :66-74 and empty states :114-127); signed-URL failures log `console.error` and keep the stored URL (:52-54).
- Tests: none found (grep-verified).
- Observed issues: (1) comment documents the defense-in-depth intent ("RLS policy ensures… Additional client_id filter", :26-27); (2) fourth copy of the signed-URL block (see unit header).
- ASSUMED: nothing file-specific.

## src/views/ClientPortalSubsectionDetail.tsx

- Purpose: Client-portal subsection page with overview stats, category-grouped documents accordion, inspection list, and a read-only inspection-detail dialog.
- Public surface: default export `ClientPortalSubsectionDetail: () => JSX.Element` — no props (:25, export :575).
- Inputs & outputs: reads `subsectionId` from `useParams` (:26) and `?preview=` (:27-29); tables: `subsections` single row with embedded `sites(name,id,client_id,address)` (:41-45), `subsection_documents` with `document_categories(name)` (:61-65), `inspections` linked by `subsection_id` plus an orphan fallback matched by normalized `json_data.generalInfo.shopNumber/shopName`/`shop_number`/`shop_name` (:76-102), `subsection_floor_plans` with `floor_plan_pins(*)` (:110-113), and on-demand `inspections` single row with `inspection_templates(name, sections)` (:124-131). Renders header card, stats, tabs, two dialogs.
- Dependencies: uses -> `react` (useState/useEffect), `@/lib/navigation` (useParams/Link/useSearchParams/useNavigate, L13), `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,button,badge,alert,tabs,accordion,dialog,scroll-area}` (C01), `lucide-react`, `@/hooks/useUserRole` `useClientInfo` (H03), `@/components/DocumentPreviewDialog` (C15), `@/lib/fileDownload` `downloadFile` (L12), `date-fns`. used by <- A06 client-portal-routes (src/app/(client-portal)/client-portal/subsections/[subsectionId]/page.tsx:2).
- Side effects: Supabase reads; `downloadFile` browser download (:156-157); `navigate()` back to the parent site (:163-167); no writes.
- Error handling: ownership is enforced client-side — after fetching, `data?.sites?.client_id !== clientInfo!.client_id` throws `new Error("Access denied")` (:49-51), which lands in react-query error state and renders the generic "Subsection not found" card (:179-192); dependent queries are `enabled: !!subsection` so they stay off when the check fails (:59, :74, :108); orphan query discards its `error` (:90-94); `fetchInspectionDetails` catches everything and only `console.error`s (:133-143), leaving the dialog on "Unable to load inspection details" (:563-568); `handleDownload` catch is console-only (:158-160).
- Tests: none found (grep-verified).
- Observed issues: (1) the inspection dialog selects `inspection_templates (name, sections)` (:128) but renders only date, inspector, and description (:539-560) — the `sections` payload is fetched and unused; (2) orphan-matcher duplicated with ContractorSubsectionDetail (see unit header); (3) `selectedInspection`/`inspectionDetails` are `any`-typed local state (:33-34) managed by a manual `useEffect` fetch rather than a query (:147-153).
- ASSUMED: server-side RLS also blocks cross-client subsection reads (the client-side "Access denied" throw would otherwise be the only gate); not verified here.

## src/views/ContractorAccessSimulator.tsx

- Purpose: Admin tool that, for a selected Contractor-role user, lists their `user_sites` assignments and compares accessible vs total counts across five resource types, with a security verdict alert.
- Public surface: default export `function ContractorAccessSimulator(): JSX.Element` — no props (:26). Internal interfaces `Contractor` (:12-16) and `AccessStats` with `sites/subsections/inspections/documents/floorPlans` (:18-24).
- Inputs & outputs: reads tables `user_roles` (role = "Contractor", :34-37), `profiles` (:45-48), `user_sites` twice (:62-65, :90-93), totals via `Promise.all` head-counts over `sites`, `subsections`, `inspections`, `site_documents`, `subsection_floor_plans` (:80-87), accessible counts filtered by assigned site ids (:98-125). Renders assignment table, per-resource access rows, verdict alert (:293-312). No writes.
- Dependencies: uses -> `react`, `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,select,badge,alert,table,skeleton}` (C01), `lucide-react`. used by <- none found (grep-verified).
- Side effects: Supabase reads only, under the current admin session.
- Error handling: `user_roles`/`profiles`/`user_sites` errors throw (:39, :50, :67); every count query in the stats queryFn discards `error` (results read `.count || 0`, :128-133) — failures render as 0 and can flip the verdict alert to the "no assignments" message.
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep; (2) `Shield` imported (:10) but unused; (3) unlike ClientAccessSimulator, empty `accessibleSiteIds` arrays are passed to `.in()` with no sentinel (:103, :107, :111, :118) — the two simulators handle the empty case differently; (4) `getAccessLevel` maps both 0% and 100% to `destructive` (:145-149); (5) same session-context caveat as ClientAccessSimulator.
- ASSUMED: same as ClientAccessSimulator regarding whose RLS context the counts reflect.

## src/views/ContractorDashboard.tsx

- Purpose: Contractor landing page showing an assigned-sites count card and a list of assigned sites.
- Public surface: default export `ContractorDashboard: () => JSX.Element` — no props (:8, export :98).
- Inputs & outputs: reads `?preview=` (site id, :9-10); data exclusively via `useContractorSites(previewSiteId || undefined)` (:11) — tables `sites`/`user_sites` and bucket `site-images` are touched inside that hook (H03), not in this file. Renders count + site rows; site rows are not links (no navigation from this view).
- Dependencies: uses -> `@/lib/navigation` `useSearchParams` (L13), `@/hooks/useContractorSites` (H03), `@/components/ui/{card,skeleton}` (C01), `lucide-react`, `@/components/ContractorPortalLayout` (C11). used by <- none found (grep-verified).
- Side effects: none directly (all I/O inside the hook).
- Error handling: none in-file — only `sitesLoading` skeletons (:13-26) and an empty-state message (:86-90); a hook error leaves `sites` undefined, rendering the empty state.
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep (the live `/contractor` route mounts ContractorPortal instead, src/app/(contractor)/contractor/page.tsx:2); (2) `ClipboardList` imported (:5) but unused; (3) site rows render `site: any` (:62).
- ASSUMED: superseded by ContractorPortal (both render the contractor's site list under the same layout); inferred from route wiring only.

## src/views/ContractorPortal.tsx

- Purpose: Live contractor home page: shows the contractor's single assigned site with Overview KPIs (subsections, compliant COCs, missing/expired COCs, documents) and a searchable subsection list.
- Public surface: default export `ContractorPortal: () => JSX.Element` — no props (:14, export :251). Internal `getStatusColor(status: string) => string` (:67-83).
- Inputs & outputs: reads `?preview=` (site id, :16-17); `useContractorSites` supplies sites, of which only `sites?.[0]` is used (comment "Contractors only have one assigned site", :21); tables `subsections` by `site_id` (:28-32) and `site_documents` by `site_id` (:44-47). KPI derivations: compliant = `coc_status` in ("Valid","Approved","Pass") (:61), missing/expired = ("Missing","Expired") (:62-64). Clicking a subsection navigates to `/contractor/subsections/<id>` preserving preview (:213).
- Dependencies: uses -> `react`, `@/lib/navigation` (useNavigate/useSearchParams, L13), `@/hooks/useContractorSites` (H03), `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,badge,tabs,input}` (C01), `lucide-react`, `@/components/ContractorPortalLayout` (C11). used by <- A07 contractor-routes (src/app/(contractor)/contractor/page.tsx:2).
- Side effects: Supabase reads; `navigate()` on card click.
- Error handling: `subsections`/`documents` queries throw on error (:34, :49) into react-query error state — no error UI (loading skeletons and empty states only); missing site renders "No site assigned" card (:100-110).
- Tests: none found (grep-verified).
- Observed issues: (1) single-site assumption hardcoded via `sites?.[0]` (:21) while the sibling (unimported) ContractorSites/ContractorSiteDetail views handle multiple sites; (2) `getStatusColor` here lacks "Pass"/"Approved" cases (:67-83), so a subsection whose `coc_status` is "Pass" or "Approved" is counted compliant (:61) yet badge-colored by the default gray branch (:81); (3) COC status vocabulary (Valid/Approved/Pass/Missing/Expired/…) is compared with raw string literals in-view rather than via the L09/L17 status helpers.
- ASSUMED: nothing file-specific beyond the module-level "use client" assumption.

## src/views/ContractorSiteDetail.tsx

- Purpose: Contractor-facing site detail page (image, header, Overview KPIs, searchable subsection list) for a `siteId` route param.
- Public surface: default export `ContractorSiteDetail: () => JSX.Element` — no props (:14, export :277). Internal `getStatusColor` (:78-99).
- Inputs & outputs: reads `siteId` from `useParams` (:15) and `?preview=` (:17-18); tables `sites` single row with `clients(name, company_name, logo_url)` (:24-28), `subsections` by `site_id` (:38-42), `site_documents` by `site_id` (:53-56). Same KPI derivations as ContractorPortal (:71-76). Navigates to `/contractor/subsections/<id>` (:239) and `navigate(-1)` for Back (:129).
- Dependencies: uses -> `react`, `@/lib/navigation` (useParams/useNavigate/useSearchParams, L13), `@tanstack/react-query`, `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,badge,button,tabs,input}` (C01), `lucide-react`, `@/components/ContractorPortalLayout` (C11). used by <- none found (grep-verified).
- Side effects: Supabase reads; navigation.
- Error handling: all three queries throw on error into react-query error state; a failed/empty site query renders "Site not found or you don't have access to it." (:112-122); no other error UI.
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep; there is also no `(contractor)/contractor/sites/[siteId]` route directory that could mount it (ls-verified: `src/app/(contractor)/contractor/` contains only `inspections`, `subsections`, `page.tsx`); (2) `Calendar` imported (:8) but unused; (3) the `sites` query has no `enabled` guard (:21-33) while the other two queries have `enabled: !!siteId` (:47, :61); (4) `site_image_url` is rendered raw (:136-144) — no signed-URL conversion, unlike every live view that renders this column; (5) third copy of `getStatusColor` (full 5-extra-case variant).
- ASSUMED: dead code superseded by ContractorPortal's single-site flow; inferred from route wiring.

## src/views/ContractorSites.tsx

- Purpose: Contractor-facing "My Sites" grid with client-side search, navigating to a per-site detail route.
- Public surface: default export `ContractorSites: () => JSX.Element` — no props (:10, export :110).
- Inputs & outputs: reads `?preview=` (site id, :12-13); data via `useContractorSites` only (H03). In-memory search over name/address/site_type (:17-21). Card click navigates to `/contractor/sites/<id>` preserving preview (:64).
- Dependencies: uses -> `react`, `@/lib/navigation` (useNavigate/useSearchParams, L13), `@/hooks/useContractorSites` (H03), `@/components/ui/{card,skeleton,input}` (C01), `lucide-react`, `@/components/ContractorPortalLayout` (C11). used by <- none found (grep-verified).
- Side effects: none directly (I/O inside the hook); navigation on click.
- Error handling: none in-file — loading skeletons (:23-36) and empty-state text (:96-104) only.
- Tests: none found (grep-verified).
- Observed issues: (1) zero importers — dead file by grep; (2) its click target `/contractor/sites/<id>` has no page route in the app tree (ls-verified, see ContractorSiteDetail) — even if mounted, the navigation would 404; (3) sites iterated as `site: any` (:17, :60).
- ASSUMED: dead code; part of the same superseded multi-site contractor flow as ContractorDashboard/ContractorSiteDetail.

## src/views/ContractorSubsectionDetail.tsx

- Purpose: Live contractor subsection page: metadata card, conditional COC upload panel routed through the COC pool-ingestion pipeline, and an inspection list (linked plus orphan-matched).
- Public surface: default export `ContractorSubsectionDetail: () => JSX.Element` — no props (:16, export :299). Internal `handleCocUpload()` (:84-108), `getStatusColor` (:110-131).
- Inputs & outputs: reads `subsectionId` from `useParams` (:17), `?preview=` and `?tab=upload` (:19, :76); tables `subsections` single row with `sites(id, name, address)` (:31-35), `inspections` with `inspection_templates(name)` linked by `subsection_id` plus the orphan fallback (:44-70); writes via `poolRouteFile(siteId, file)` (:91) which uploads to storage bucket `documents` and inserts/updates `coc_file_pool` (src/lib/coc/poolUpload.ts:22-31, unit L04). File input accepts `.pdf,.html,.doc,.docx,.jpg,.jpeg,.png`, multiple (:230-233). After upload, invalidates query `["contractor-subsection", subsectionId]` (:102). Inspection rows navigate to `/contractor/inspections/<id>` preserving preview (:266).
- Dependencies: uses -> `react`, `@/lib/navigation` (L13), `@tanstack/react-query` (useQuery/useQueryClient), `@/integrations/supabase/client` (L19), `@/components/ui/{card,skeleton,badge,button,input}` (C01), `lucide-react`, `@/components/ContractorPortalLayout` (C11), `@/components/Breadcrumb` `Breadcrumbs` (C11), `sonner` `toast`, `@/lib/coc/poolUpload` `poolRouteFile` (L04). used by <- A07 contractor-routes (src/app/(contractor)/contractor/subsections/[subsectionId]/page.tsx:2).
- Side effects: Supabase reads; storage upload + `coc_file_pool` mutation per selected file (sequential `for…of`, :89-101); toasts per file (success "assigned" / info with pending reason / error, :92-99); query invalidation (:102); `scrollIntoView` when `?tab=upload` (:75-82); resets file input and state in `finally` (:104-107).
- Error handling: `subsections` query error throws → "Subsection not found or you don't have access to it." card (:144-154); orphan query discards `error` (:58-62); per-file upload failures are caught individually — `console.error` only in development (:98), then `toast.error` with the message (:99) — and the loop continues with remaining files; upload UI disables during `uploading` (:233, :238).
- Tests: none found (grep-verified). (The pool pipeline it calls is test-covered in units L01/L02/L04 per manifest, not this view.)
- Observed issues: (1) post-upload invalidation refreshes only the subsection query, not `["contractor-subsection-inspections", …]` (:102); (2) second copy of the orphan-inspection matcher (see unit header); (3) third copy of `getStatusColor`; (4) `subsection` fields accessed through repeated `(subsection as any)` casts (:43, :56-57, :61, :86).
- ASSUMED: nothing file-specific beyond the module-level "use client" assumption.

---

## Unit-level ASSUMED (applies to multiple files)

- None of the 14 files carries a `"use client"` directive; they use client-only hooks throughout, so they are assumed to inherit client-component status from their `src/app/**/page.tsx` wrappers (wrappers not individually opened here; consistent with inventory/10-src-views.md:156).
- The 7 unimported files are assumed unreachable at runtime; a template-string dynamic import could evade the greps used, though none was observed.
- The four Admin*/Simulator views and the three unimported Contractor* views are assumed to be superseded flows (naming, the still-honoured `?preview=` params, and the live routes mounting different views) — inferred, not verified in git history.
