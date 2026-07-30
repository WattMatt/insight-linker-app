# H03 — query-data-hooks

- Unit id: H03
- Slug: query-data-hooks
- Spec mode: full
- Date: 2026-07-29
- Files: 6

## Unit header

**Unit purpose.** Six read-mostly react-query hooks over Supabase tables, one view, and two RPCs: the signed-in user's role and client mapping (`useUserRole.tsx`), a contractor's assigned sites (`useContractorSites.tsx`), cross-entity global search (`useGlobalSearch.ts`), site health scores with snapshot-first/live-fallback (`useSiteScores.ts`), the inspector's unresolved orphan inspections plus resolve/archive mutations (`useUnresolvedOrphans.ts`), and a data-agnostic server-side pagination wrapper (`usePaginatedList.ts`). All six import the Supabase client singleton from `@/integrations/supabase/client` (L19) except `usePaginatedList.ts`, which touches no data source itself.

**Module-level observations (cross-file).**
- Intra-unit dependency: `useContractorSites.tsx` imports `useUserRole` from `./useUserRole` (useContractorSites.tsx:3); no other file in the unit imports another H03 file (grep-verified).
- Two files repeat the same admin-preview pattern: the query branches on `userRole === "Admin" && preview<X>Id` to fetch an arbitrary record instead of the user's own mapping (useUserRole.tsx:70, useContractorSites.tsx:36), and in both the `userRole` value feeds the queryFn but is absent from the queryKey (useUserRole.tsx:64, useContractorSites.tsx:30).
- Error-handling styles differ per file: `useGlobalSearch.ts` discards every Supabase `error` (destructures `{ data }` only, useGlobalSearch.ts:69, 97, 129, 188, 243, 254); the other data hooks `throw error` into react-query error state (useUserRole.tsx:51, 77, 91; useContractorSites.tsx:43, 57; useSiteScores.ts:30, 49-50, 59; useUnresolvedOrphans.ts:77, 98, 117).
- No test file in the repo references any H03 hook (grep over `src/**/*.test.ts{,x}` returned zero hits).
- Two untracked working-copy duplicates, `src/views/ClientPortalSites 2.tsx` and `src/views/ContractorPortal 2.tsx` (untracked per `git ls-files`), also reference these hooks; they and the generated `src/graphify-out/cache/*.json` hit are excluded from all "used by" lists below.
- File extensions are mixed: `useUserRole.tsx` and `useContractorSites.tsx` use `.tsx` but contain no JSX; the other four are `.ts`.

**External contract.** The rest of the app gets: `useUserRole`/`useClientInfo` (consumed by route guards C10, layout/nav C11, floor-plan C12, and views V01–V04 — the app's role-routing source of truth, including a cache purge of `user-role`/`onboarding-status`/`user-client-info` on auth-user change); `useContractorSites` (V03 contractor pages); `useGlobalSearch`/`useSearchFilterOptions` (C11 GlobalSearch); `useSiteScores` (V01/V03 site lists and dashboards); `useUnresolvedOrphans` + `ORPHANS_QUERY_KEY` (C10 OrphanResolutionModal); `usePaginatedList` (V01 Clients, V02 Users list pages).

---

## src/hooks/useUserRole.tsx

- Purpose: Resolves the signed-in user's role from `user_roles` (offline-tolerant via cached session) and, separately, the client record a client-portal user belongs to, with an admin-preview override.
- Public surface:
  - `type UserRole = "Admin" | "Client" | "Contractor" | null` (useUserRole.tsx:5).
  - `useUserRole(): UseQueryResult` — react-query result on key `["user-role", userId]`; queryFn returns `data?.role as UserRole` (useUserRole.tsx:40-57); `enabled: !!userId` (:54), `staleTime` 5 min (:55), `gcTime` 10 min (:56).
  - `useClientInfo(previewClientId?: string): UseQueryResult` — key `["user-client-info", previewClientId]`; data is `{ client_id, clients: {id, name, logo_url, company_name} }` (admin-preview branch, :78-81) or the `user_clients` mapping row (:85-92) or `null` when signed out (:67).
- Inputs & outputs: In — `supabase.auth.getSession()` for the initial userId (:16, reads the persisted session; comment :12-15 states this works offline), `supabase.auth.onAuthStateChange` (:24), `supabase.auth.getUser()` in `useClientInfo` (:66). Tables — `user_roles` select `role` by `user_id` `.maybeSingle()` (:45-49); `clients` select by id `.single()` (:71-75); `user_clients` select with embedded `clients(...)` by `user_id` `.maybeSingle()` (:85-89). Out — role string or client-mapping object via react-query caches. No storage buckets; no direct localStorage keys.
- Dependencies: uses -> `@tanstack/react-query` (:1), `@/integrations/supabase/client` (L19, :2), `react` (:3). used by <- (grep-verified) C10 (ProtectedRoute.tsx:2, ClientProtectedRoute.tsx:2, ContractorProtectedRoute.tsx:2, OnboardingWizard.tsx:12), C11 (AppSidebar.tsx:40, ClientPortalLayout.tsx:23 — also `useClientInfo`, ContractorPortalLayout.tsx:7), C12 (FloorPlanPinModal.tsx:10), H03 (useContractorSites.tsx:3), V01 (SiteDetail.tsx:34), V02 (MyProfile.tsx:16), V03 (`useClientInfo`: ClientPortalCalendar.tsx:5, ClientPortalDashboard.tsx:5, ClientPortalSiteDetail.tsx:14, ClientPortalSites.tsx:6, ClientPortalSubsectionDetail.tsx:16), V04 (PublicSubsection.tsx:12).
- Side effects: Subscribes to `supabase.auth.onAuthStateChange` in a `useEffect` per mounted instance and unsubscribes on cleanup (:24-37). When the user id changes, calls `queryClient.removeQueries` for keys `["user-role"]`, `["onboarding-status"]`, `["user-client-info"]` (:29-31) — `onboarding-status` is populated elsewhere by C02 `src/components/auth/useOnboardingStatus.ts:12`. Network reads as listed.
- Error handling: `getSession()` rejection → `console.error` + `setUserId(null)` (:18-21). `user_roles` error → `throw` (:51) → react-query error state. `useClientInfo`: signed-out → returns `null` (:67); `clients` `.single()` error → `throw` (:77); `user_clients` error → `throw` (:91).
- Tests: none found (grep-verified).
- Observed issues:
  - When `user_roles` has no row for the user, `.maybeSingle()` yields `data = null` and the queryFn resolves to `undefined` via `data?.role` (:52); the project uses `@tanstack/react-query` `^5.83.0` (package.json:49).
  - `useClientInfo` branches on `userRole` inside its queryFn (:70) but the queryKey holds only `previewClientId` (:64), and the key also omits the user id — cross-user cache separation relies on the `removeQueries` purge (:29-31), which only fires while a component mounting `useUserRole` is on screen.
  - `useClientInfo` uses `supabase.auth.getUser()` (network) (:66) while `useUserRole` deliberately avoids it for offline operation (comment :12-15).
  - `.tsx` extension with no JSX in the file.
- ASSUMED: react-query v5's documented behavior of rejecting a queryFn that resolves `undefined` applies to the no-role path above (not observed at runtime here). That `["onboarding-status"]` purge targets only C02's hook (only other grep hit for that key is useOnboardingStatus.ts:12).

## src/hooks/useContractorSites.tsx

- Purpose: Fetches the sites assigned to the signed-in contractor (or one arbitrary site when an admin previews), replacing each `site_image_url` with a 1-hour signed URL.
- Public surface:
  - `useContractorSites(previewSiteId?: string): UseQueryResult` — key `["contractor-sites", previewSiteId]` (useContractorSites.tsx:26-71); data is an array of site rows `{id, name, address, site_type, site_image_url, client_id, clients: {name, company_name, logo_url}}` with `site_image_url` swapped for a signed URL (:48, :65).
  - Module-private `generateSignedUrl(siteImageUrl: string | null): Promise<string | null>` (:5-24).
- Inputs & outputs: In — `supabase.auth.getUser()` (:32); `useUserRole()` data (:27). Tables — `sites` select by id `.single()` with embedded `clients(...)` (admin-preview, :37-41); `user_sites` select `site_id, sites(... clients(...))` by `user_id` (:52-55). Storage — bucket `site-images` `createSignedUrl(path, 3600)` (:12-14); the path is derived by splitting the stored URL on `'/site-images/'` and stripping the query string (:9-11). Out — site array via react-query.
- Dependencies: uses -> `@tanstack/react-query` (:1), `@/integrations/supabase/client` (L19, :2), `./useUserRole` (H03, :3). used by <- (grep-verified) V03 (ContractorPortal.tsx:3,18; ContractorSites.tsx:3,14; ContractorDashboard.tsx:2,11).
- Side effects: network reads and signed-URL creation only; no mutations, no subscriptions.
- Error handling: signed-out → `[]` (:33). Admin branch: `.single()` error → `throw` (:43); `!site` → `[]` (:44). Contractor branch: `user_sites` error → `throw` (:57). `generateSignedUrl` failures: `catch` → `console.error` → returns the original URL (:20-23); a URL not containing `'/site-images/'` also falls through to return the original URL (:10, :23).
- Tests: none found (grep-verified).
- Observed issues:
  - queryKey `["contractor-sites", previewSiteId]` (:30) omits both the user id (:32) and `userRole` (:36) that determine the queryFn's result.
  - `site: any` cast in the signed-URL mapping (:62).
  - Signed-URL path extraction assumes the stored URL embeds the literal segment `/site-images/` (:9).
  - `.tsx` extension with no JSX in the file.
- ASSUMED: nothing beyond the above.

## src/hooks/useGlobalSearch.ts

- Purpose: Runs a four-entity (clients, sites, subsections, inspections) `ilike` search against Supabase and flattens matches into route-linked `SearchResult`s, plus a companion hook supplying filter dropdown options.
- Public surface:
  - `type SearchResultType = "client" | "site" | "subsection" | "inspection"` (useGlobalSearch.ts:5).
  - `interface SearchResult { id, type, title, subtitle?, description?, url, metadata?: { clientId?, siteId?, subsectionId?, cocStatus?, status? } }` (:7-21).
  - `interface SearchFilters { clientIds?: string[], siteTypes?: string[], cocStatuses?: string[], dateFrom?: Date, dateTo?: Date }` (:23-29).
  - `useGlobalSearch(searchQuery: string, filters: SearchFilters = {}): UseQueryResult<SearchResult[]>` — key `["global-search", searchQuery, filters]` (:48-49), `enabled: searchQuery.length >= 2` (:231) plus an in-queryFn guard returning `[]` (:51-53).
  - `useSearchFilterOptions(): { clients: {id,name}[], siteTypes: string[], cocStatuses: string[] }` (:235-265).
  - Module-private `sanitizeSearchQuery(raw: string): string` (:38-42) — strips `, ( )` and backslash-escapes `% _` before interpolation into `.or(...ilike...)` filter strings (docstring :31-37 states malformed filters produce "PostgREST 400 -> silent empty results").
- Inputs & outputs: In — `searchQuery` (lowercased :56) and `filters`. Tables — `clients` (`name/company_name/email` ilike, limit 10, optional `.in("id", clientIds)`, :59-67; and `id, name` ordered list :239-242), `sites` (`name/address` ilike, limit 10, optional client/site_type `.in`, :84-95; and `site_type` distinct-by-Set :250-256), `subsections` (`name/tenant_name/coc_number/meter_serial_number` ilike with embedded `sites(name, client_id)`, limit 10, optional `.in("coc_status", ...)`, :115-127), `inspections` (`title/description` ilike with embedded `sites(name, client_id)`, limit 10, optional `inspection_date` gte/lte from `Date.toISOString().split("T")[0]`, :166-186). Out — `SearchResult[]` with per-type URLs: `/clients/:id` (:78), `/clients/:clientId/sites/:id` or `/sites/:id` (:106), subsection detail paths (:141-143), inspection detail or `?tab=inspections` site paths (:202-211). No storage, localStorage, or env vars.
- Dependencies: uses -> `react` (`useState`, :1), `@tanstack/react-query` (:2), `@/integrations/supabase/client` (L19, :3). used by <- (grep-verified) C11 (GlobalSearch.tsx:33 imports `useGlobalSearch`, `useSearchFilterOptions`, `SearchFilters`; usage :39-43).
- Side effects: network reads only.
- Error handling: every one of the six Supabase queries destructures `{ data }` only — errors are discarded and the entity contributes zero results silently (:69, :97, :129, :188, :239-243, :250-256); `data` falsy → skipped via optional chaining/`|| []` (:71, :99, :131, :190, :243, :255).
- Tests: none found (grep-verified).
- Observed issues:
  - `useState` is imported (:1) but never used in the file.
  - `clientIds` filtering for subsections and inspections happens client-side after fetch (:132-138, :191-197; comment "can't do nested filtering" :132), after the server-side `limit(10)` (:123, :172) has already been applied.
  - `cocStatuses` filter options are hardcoded as `["Valid", "Expired", "Missing", "Pending"]` (:263) while the other two option lists are fetched live.
  - `useSearchFilterOptions`'s site-types query selects `site_type` for every non-null row and dedupes in JS (:250-256).
- ASSUMED: react-query's structural hashing of the `filters` object (including `Date` values via their JSON serialization) in the queryKey (:49) behaves per library documentation; not exercised here.

## src/hooks/useSiteScores.ts

- Purpose: Returns health scores for a set of sites as a `Map`, preferring `site_health_snapshots` rows within a 30-day window and computing live from subsections/inspections/snags for sites without a usable snapshot.
- Public surface:
  - `useSiteScores(siteIds: string[] | undefined): UseQueryResult<Map<string, SiteScore>>` (useSiteScores.ts:14) — key `["site-scores", ids]` where `ids` is a sorted copy of the input (:15, :18); `enabled: ids.length > 0` (:19); `staleTime` 5 min (:20). `SiteScore` is re-exported from L17 (`{ siteId, healthScore, capturedAt, source: "snapshot"|"live" }`, src/lib/siteScores.ts:20-27).
  - Module-private constant `SNAPSHOT_WINDOW_DAYS = 30` (:7).
- Inputs & outputs: In — site id array. Tables — `site_health_snapshots` select `site_id, health_score, total_subsections, captured_at` `.in("site_id", ids).gte("captured_at", since)` where `since` is today minus 30 days as `yyyy-mm-dd` (:22-29); for sites lacking a usable snapshot (usability test `isUsableSnapshotRow`, :32-34): `subsections` (:40-43) and `inspections` (:44-47) in parallel, then `snags` by the fetched subsection ids (:53-58, skipped when there are no subsections). Out — `buildSiteScoreMap(ids, snapshotRows ?? [], live)` (:69; L17 src/lib/siteScores.ts:63). The unfiltered snapshot rows are passed through; `buildSiteScoreMap` re-filters non-usable rows itself via `latestSnapshotPerSite` (src/lib/siteScores.ts:53-57). Header comment states RLS scopes every query (:11-12).
- Dependencies: uses -> `@tanstack/react-query` (:1), `@/integrations/supabase/client` (L19, :2), `@/lib/siteScores` (L17, :3 — `buildSiteScoreMap` :63, `isUsableSnapshotRow` :38, `LiveScoreInputs` :42, `SiteScore` :20, all verified exports). used by <- (grep-verified) V01 (Sites.tsx:18, ClientDetail.tsx:14), V03 (ClientPortalSiteDetail.tsx:25, ClientPortalSites.tsx:7, ClientPortalDashboard.tsx:13).
- Side effects: network reads only.
- Error handling: each of the four queries' errors is thrown (`snapshotError` :30, `subsRes.error` :49, `inspRes.error` :50, `snagsRes.error` :59) → react-query error state; no catch, no toast.
- Tests: none found for the hook (grep-verified). The delegated score math in `@/lib/siteScores` is covered by L17's paired tests (per manifest.md:26, "each test-paired"); those test files do not import this hook.
- Observed issues: none beyond what is described above.
- ASSUMED: the RLS-scoping claim in the header comment (:11-12) — the policies live in D01-D03 migrations and were not verified here.

## src/hooks/useUnresolvedOrphans.ts

- Purpose: Lists the signed-in inspector's orphaned inspections from the `my_unresolved_orphans` view and exposes `resolve`/`archive` mutations backed by SECURITY DEFINER RPCs.
- Public surface:
  - `interface OrphanCandidate { id, name }` (useUnresolvedOrphans.ts:22-25); `interface OrphanBestGuess { id, name, similarity }` (:27-31); `interface OrphanRow { inspection_id: string, inspection_title: string|null, inspection_status: string|null, created_at: string, site_id: string|null, site_name: string|null, shop_name_orphan: string|null, shop_number_orphan: string|null, candidate_subsections: OrphanCandidate[]|null, best_guess: OrphanBestGuess|null }` (:33-44).
  - `ORPHANS_QUERY_KEY = ["unresolved-orphans"] as const` (:66).
  - `useUnresolvedOrphans(): { rows: OrphanRow[], isLoading: boolean, error: Error|null, resolve: (args: {inspection_id: string, subsection_id: string}) => Promise<void>, archive: (args: {inspection_id: string, reason: string|null}) => Promise<void>, isMutating: boolean }` (:68-132) — query `staleTime` 30 s, `gcTime` 5 min (:82-83); `resolve`/`archive` are `mutateAsync` references (:128-129).
- Inputs & outputs: In/out — view `my_unresolved_orphans` `select("*")` (:74-76; header comment :7-13 documents it as security_invoker scoped to `inspector_id = auth.uid()`); RPC `resolve_my_orphan(p_inspection_id, p_subsection_id)` (:94-97); RPC `archive_my_orphan(p_inspection_id, p_reason)` (:113-116). All Supabase calls go through a local `SupabaseUntyped` cast (`from`/`rpc` returning `Promise<{data: unknown, error: Error|null}>`, :54-64) with an explanatory comment (:46-53). References `docs/integrity-audit/force-at-login-resolution.md` (:19).
- Dependencies: uses -> `@tanstack/react-query` (:1), `@/integrations/supabase/client` (L19, :2). used by <- (grep-verified) C10 (OrphanResolutionModal.tsx:23-25, hook calls :43 and :75).
- Side effects: the two RPCs mutate server state (inspection-to-subsection linking and archival, executed server-side per comment :15-17); each mutation's `onSuccess` invalidates `ORPHANS_QUERY_KEY` (:100-102, :119-121).
- Error handling: view select error → `throw` (:77) → react-query error state, surfaced as `error: query.error as Error | null` (:127); RPC errors → `throw` inside `mutationFn` (:98, :117), which rejects the caller's `mutateAsync` promise — no toast or catch in the hook.
- Tests: none found (grep-verified).
- Observed issues:
  - The comment at :46-49 states the view and RPCs are "not yet in the generated `Database` type", but `src/integrations/supabase/types.ts` now contains `my_unresolved_orphans` (types.ts:2977), `archive_my_orphan` (types.ts:3042), and `resolve_my_orphan` (types.ts:3158); the `SupabaseUntyped` cast (:54-64) bypasses those generated types.
  - Hand-written `OrphanRow` declares `inspection_id: string` and `created_at: string` as non-nullable (:34, :37) while the generated view Row declares every column nullable, including `inspection_id: string | null` and `created_at: string | null` (types.ts:2979-2988).
- ASSUMED: the server-side properties asserted in comments — view scoping (:7-8), SECURITY DEFINER on both RPCs (:15-17), pg_trgm best-guess (:13) — belong to D-unit migrations and were not verified here.

## src/hooks/usePaginatedList.ts

- Purpose: Generic react-query wrapper that owns 1-based page state and page-count math for server-side paginated Supabase lists, keeping the previous page visible during fetches.
- Public surface:
  - `interface PaginatedPage<T> { rows: T[], total: number }` (usePaginatedList.ts:13-16).
  - `interface UsePaginatedListOptions<T> { queryKey: unknown[], fetchPage: (args: PageRange & { page: number, pageSize: number }) => Promise<PaginatedPage<T>>, pageSize?: number, enabled?: boolean }` (:18-25).
  - `interface UsePaginatedListResult<T> { rows, total, page, pageSize, pageCount, setPage(page), isLoading, isFetching, isError, error, refetch() }` (:27-40).
  - `usePaginatedList<T>(options): UsePaginatedListResult<T>` (:42-74) — key `[...options.queryKey, 'page', page, pageSize]` (:47), default `pageSize` 20 (:43), `placeholderData: keepPreviousData` (:52), `enabled: options.enabled ?? true` (:53).
- Inputs & outputs: In — the caller's `fetchPage` runs the actual data access; this file performs no Supabase/storage/localStorage access itself (docstring :1-8: caller runs `.range(from, to)` with `{ count: 'exact' }`). Range math delegated to `getPageRange` (:49; L18 src/lib/pagination.ts:22), `getPageCount` (:57; pagination.ts:30 — returns at least 1), `clampPage` (:65; pagination.ts:37). Out — `rows` (`?? []` :60), `total` (`?? 0` :56), page state.
- Dependencies: uses -> `react` (:9), `@tanstack/react-query` incl. `keepPreviousData` (:10), `@/lib/pagination` (L18, :11 — `getPageRange`, `getPageCount`, `clampPage`, `PageRange`, all verified exports). used by <- (grep-verified) V02 (Users.tsx:4, :213), V01 (Clients.tsx:4, :62). Comment-only mentions (not imports): C16 ListPagination.tsx:2, L18 pagination.ts:2.
- Side effects: none beyond the react-query fetch of the caller-supplied `fetchPage`; no subscriptions, no events.
- Error handling: no catch; `isError`/`error` pass through from react-query (:68-69); `refetch` discards its promise (`void query.refetch()`, :70-72).
- Tests: none found for the hook (grep-verified). The delegated math has L18's paired test `src/lib/pagination.test.ts` (asserts range/count/clamp/window behavior); that test does not import this hook.
- Observed issues:
  - `page` state is not reset when `options.queryKey` changes (:44) — a caller that changes its base key (e.g. a new filter) keeps the current page number, and `setPage` clamps against the `pageCount` computed from the currently loaded data (:57, :65).
- ASSUMED: nothing beyond the above.
