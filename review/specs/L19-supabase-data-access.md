# L19 — supabase-data-access

- Unit id: L19
- Slug: supabase-data-access
- Spec mode: full
- Date: 2026-07-29
- Files: 7 (`src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `src/lib/data/README.md`, `src/lib/data/queryKeys.ts`, `src/lib/data/signedUrls.ts`, `src/lib/data/sites.ts`, `src/lib/data/useSites.ts`)

## Unit header

**Unit purpose.** Two sub-modules: `src/integrations/supabase` holds the browser Supabase client singleton and the generated `Database` schema types (55 tables, 4 views, 32 functions, 2 enums); `src/lib/data` is a repository/data-access layer introduced by the 2026-07-07 architecture review (README.md:3-4) consisting of a query-key factory, a batched signed-URL helper, a `sites` repository, and React Query hooks over it.

**Module-level observations (cross-file).**
- The only edge between the two sub-modules is `src/lib/data/sites.ts` importing the client (sites.ts:13) and the `Database` type (sites.ts:14); `src/lib/data/signedUrls.ts` also imports the client (signedUrls.ts:11).
- The `src/lib/data` layer is internally closed and externally unconsumed: `queryKeys.ts` is imported only by `useSites.ts:14`, `signedUrls.ts` only by `sites.ts:15`, `sites.ts` only by `useSites.ts:15`, and `useSites.ts` (exports `useSitesList`, `useClientOptions`) by nothing at all (grep-verified across `src` and `supabase`, excluding the untracked `" 2."` duplicate files).
- By contrast the client singleton has 128 importing files under `src` (grep `integrations/supabase/client`, excluding `" 2."` duplicates), i.e. the app's data access overwhelmingly bypasses this unit's repository layer. Measured 2026-07-29: 469 `supabase.from(` call sites across 97 files plus 130 `.storage.from(` call sites (multi-line-aware regex over files containing "supabase", excluding `" 2."` duplicates).
- No file in this unit has a dedicated test. Six test files `vi.mock` the client module (see client.ts section).

**External contract.** What the rest of the app actually consumes from this unit is: (1) the `supabase` singleton (auth, PostgREST, storage, realtime entry point for 128 files), and (2) the `Database` generated types — though the latter only via `src/lib/data/sites.ts` and `client.ts` itself; no other file imports `@/integrations/supabase/types` (grep-verified). The repository/hook layer (`fetchSites`, `useSitesList`, `queryKeys`, `withSignedUrls`) is exported but has no external callers; the README positions it as the intended future contract (README.md:19-29).

## src/integrations/supabase/client.ts

- Purpose: Creates and exports the app-wide typed Supabase browser client singleton from `NEXT_PUBLIC_*` env vars.
- Public surface:
  - `supabase: SupabaseClient<Database>` (client.ts:15) — created via `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { storage, persistSession: true, autoRefreshToken: true } })`.
- Inputs & outputs:
  - In: env vars `process.env.NEXT_PUBLIC_SUPABASE_URL` (client.ts:5) and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` (client.ts:6; both listed in `.env.example:1-2`).
  - Out: one module-level client instance typed against `Database` (client.ts:3, 15).
  - Stores touched: auth session persistence uses `window.localStorage` when `window` exists, else `undefined` (client.ts:17). No storage key override — supabase-js default key applies.
- Dependencies: uses -> `@supabase/supabase-js` (`createClient`, external, client.ts:2); `./types` (`Database`, L19, client.ts:3). used by <- 128 files across `src` (grep `integrations/supabase/client`, `" 2."` dupes excluded): 47 files in `src/views` (V01–V04, V06, e.g. `src/views/Sites.tsx` — V01; `src/views/ClientPortalSites.tsx` — V03), 6 in `src/views/auth` (V05), 3 in `src/views/subsection-detail` (V07), 17 hook files (H01–H03, e.g. `src/hooks/useOfflineSync.ts` — H01), 39 component files (C02–C17, e.g. 12 in `src/components/site`), 14 `src/lib` files (L04 ×4, L05 ×2, L12, L13, L14, L15, L16), and `src/lib/data/{sites,signedUrls}.ts` (L19).
- Side effects: module-load side effects only — env validation throw (client.ts:8-10) and client construction (client.ts:15-21), which under `persistSession`/`autoRefreshToken` starts supabase-js session persistence and token auto-refresh in the browser. No calls issued by this file itself.
- Error handling: if either env var is falsy the module throws `Error("Missing Supabase environment variables. Check your .env file.")` at import time (client.ts:8-10), which fails every one of the 128 importing modules at load.
- Tests: no test targets this file. Six test files replace it via `vi.mock`: `src/components/auth/useAuthSession.test.tsx:9`, `src/lib/documents/documentMutations.test.ts:16`, plus `src/hooks/useOfflineSync.queueRaces.test.tsx`, `src/hooks/useOfflineSync.syncInspection.test.tsx`, `src/lib/fileDownload.test.ts`, `src/lib/pdfDocumentSaver.test.ts` (grep-verified importers with `.test.` extension). Those tests assert behavior of their own subjects against the mock, not this file's behavior.
- Observed issues:
  - Header comment states "This file is automatically generated. Do not edit it directly." (client.ts:1), yet no script in `package.json` regenerates it (only the `@supabase/supabase-js` dependency at package.json:48 mentions supabase), and the file contains Next-specific SSR guarding (client.ts:17).
  - Env-var absence is a hard module-load crash rather than a handled condition (client.ts:8-10).
- ASSUMED: that the file originated from Lovable/Supabase scaffolding (inferred from the header comment style; no generator config found).

## src/integrations/supabase/types.ts

- Purpose: Generated TypeScript mirror of the Supabase `public` schema — Row/Insert/Update/Relationships per table, plus views, function signatures, enums, and lookup helper generics.
- Public surface:
  - `type Json` (types.ts:1-7).
  - `type Database` (types.ts:9-3216) with `__InternalSupabase.PostgrestVersion: "13.0.5"` (types.ts:12-14); `public.Tables` — 55 tables (types.ts:16-2950): coc_file_pool, coc_import_batches, coc_db_schedule, coc_certificates, access_link_visitors, activity_logs, api_access_tokens, api_clients, api_request_logs, auth_events, calendar_events, client_access_links, clients, compliance_settings, compliance_settings_audit, contractor_coc_uploads, document_categories, file_sync_logs, floor_plan_pin_comments, floor_plan_pins, inspection_items, inspection_relink_audit, inspection_subsections, inspection_templates, inspections, inspections_snap_20260421, inspections_snap_20260422_pre_relink, offline_photos, offline_photos_snap_20260421, pdf_report_templates, pending_user_invites, profiles, qr_codes, qr_scans, reports, schematic_blocks, settings, site_assets, site_document_categories, site_documents, site_marking_checklist, site_schematics, sites, snags, subsection_documents, subsection_floor_plans, subsections, subsections_snap_20260421, temp_import, user_clients, user_policy_overrides, user_roles, user_sites, user_sites_history, user_storage_connections.
  - `public.Views` — 4 (types.ts:2951-3012): inspection_orphan_summary, inspection_photo_refs, my_unresolved_orphans, orphan_photo_refs.
  - `public.Functions` — 32 RPC signatures (types.ts:3013-3207): _share_link, apply_subsection_recompute, archive_my_orphan, audit_orphan_photo_refs, classify_field_status, cleanup_old_pending_invites, contractor_has_site_access, debug_site_health_snapshot, get_compliance_setting_bool, get_compliance_setting_numeric, get_compliance_settings, get_pending_verifications, get_public_portfolio, get_public_site_register, get_public_site_review, get_public_subsection, get_public_subsection_review, get_rls_policies_for_role, get_user_client_id, has_role, normalize_shop_key, prune_orphan_photo_urls, recompute_subsection_installation_status, resolve_inspection_subsection, resolve_my_orphan, rollup_subsection_coc_status, set_compliance_setting, show_limit, show_trgm, validate_access_link, validate_api_token, validate_inspection_templates.
  - `public.Enums` — `app_role: "Admin" | "User" | "Contractor" | "Moderator" | "Client"`, `asset_category: "electrical_meter" | "water_meter" | "equipment" | "other"` (types.ts:3208-3211).
  - Helper generics `Tables<...>`, `TablesInsert<...>`, `TablesUpdate<...>`, `Enums<...>`, `CompositeTypes<...>` (types.ts:3222-3333) and runtime `export const Constants` with enum value arrays (types.ts:3335-3342).
- Inputs & outputs: types only plus the one runtime `Constants` object; no I/O, no stores.
- Dependencies: uses -> nothing (zero imports). used by <- `src/integrations/supabase/client.ts:3` (L19, `import type { Database } from './types'`) and `src/lib/data/sites.ts:14` (L19). No other file imports this module and no file outside it uses the `Tables<`/`TablesInsert<`/`TablesUpdate<` helpers or `Constants` (grep-verified).
- Side effects: none (type declarations; `Constants` is an inert `as const` object).
- Error handling: n/a (no runtime logic).
- Tests: none found (grep-verified — no test file references this module).
- Observed issues:
  - 3,342 lines of schema types are consumed by exactly two files, both inside this unit; the 97 files doing inline `supabase.from(` calls get their row typing only implicitly through the client generic.
  - The generated schema includes four snapshot/backup tables (`inspections_snap_20260421`, `inspections_snap_20260422_pre_relink`, `offline_photos_snap_20260421`, `subsections_snap_20260421`, types.ts:1286, 1376, 1520, 2664) and a `temp_import` table (types.ts:2733) in the `public` schema.
  - `api_clients.client_secret` (types.ts:429) and `api_access_tokens.access_token`/`refresh_token` (types.ts:384, 391) are modeled as plain string columns; `user_storage_connections` likewise carries `access_token`/`refresh_token` strings (types.ts:2904, 2912).
  - The helper generics section resolves table/view names for `Tables<>` but is unused app-wide (grep-verified), as is `Constants`.
- ASSUMED: generated by `supabase gen types typescript` or Lovable's equivalent (no generation script exists in `package.json`); that it reflects the remote schema as of its last regeneration rather than the current migration set (not verified against `supabase/migrations`).

## src/lib/data/README.md

- Purpose: Documents the intent, structure, rules, and migration order for the `src/lib/data` data-access layer.
- Public surface: n/a (documentation).
- Inputs & outputs: n/a. States the codebase "currently has 621 inline `supabase.from()` calls across 130 files" (README.md:5-6) and cites `docs/ARCHITECTURE_REVIEW_2026-07-07.md` (README.md:4; that file exists).
- Dependencies: uses -> references `queryKeys.ts`, `signedUrls.ts`, `sites.ts`, `useSites.ts` (README.md:12-15, all L19) and a `usePaginatedList` rule (README.md:22). used by <- no code references; the phrase "data-access layer" appears in `docs/ARCHITECTURE_REVIEW_2026-07-07.md` and `docs/PARITY_GAP_ANALYSIS.md` (X01) (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: n/a.
- Observed issues:
  - Rule 1 "Views never call `supabase.from()` directly" (README.md:19-21) does not describe the current code: 469 `supabase.from(` call sites across 97 files measured 2026-07-29 (multi-line-aware count, `" 2."` dupes excluded), and the README's own baseline figure (621/130) differs from that measurement.
  - The migration order (README.md:33-37) lists `Dashboard.tsx`, `InspectionDetail.tsx`, `SiteDetail.tsx` (V01), `Sites.tsx` (V01), `ClientPortalSites.tsx`, `AdminContractorPreview.tsx` (V03); each of the four views named for the signed-URL N+1 still contains a `createSignedUrl(` call (grep-verified, 1 occurrence each in Sites.tsx, ClientPortalSites.tsx, ClientPortalDashboard.tsx, AdminContractorPreview.tsx) and none imports `lib/data`.
- ASSUMED: the 621/130 figure was accurate when written (2026-07-07 review date per README.md:4); the difference from today's 469/97 is presumed to reflect drift in either the codebase or counting method, not verified.

## src/lib/data/queryKeys.ts

- Purpose: Central hierarchical query-key factory for TanStack Query, following the TkDodo `all`/`lists`/`list(filters)`/`detail(id)` convention (queryKeys.ts:11-13).
- Public surface:
  - `interface SiteListFilters { clientId?: string }` (queryKeys.ts:16-18).
  - `interface InspectionListFilters { siteId?: string; subsectionId?: string; status?: string }` (queryKeys.ts:20-24).
  - `const queryKeys` (queryKeys.ts:26-75), `as const`, with entity groups: `clients` (all/lists/detail), `sites` (all/lists/list(filters)/detail/assets/documents), `subsections` (all/bySite/detail), `inspections` (all/lists/list(filters)/detail/templates), `snags` (all/bySite/bySubsection), `settings` (all/company), `profiles` (all/current/detail), `calendar` (all/range(fromIso,toIso)), `dashboard` (all/stats/triage). All members return readonly tuples.
- Inputs & outputs: pure key construction from string ids and serialisable filter objects; no stores, no env.
- Dependencies: uses -> nothing (zero imports). used by <- `src/lib/data/useSites.ts:14` (L19) only (grep-verified; no other file in `src` references the `queryKeys` symbol).
- Side effects: none.
- Error handling: n/a (no failure paths).
- Tests: none found (grep-verified).
- Observed issues:
  - `queryKeys.inspections.templates()` returns `["inspection-templates"]` (queryKeys.ts:50), a root not derived from `queryKeys.inspections.all` (`["inspections"]`, queryKeys.ts:46), so it sits outside the inspections hierarchy the file's own doc-comment describes (queryKeys.ts:8-9).
  - `queryKeys.calendar.all` is `["calendar-events"]` (queryKeys.ts:67) — the only entity whose root string differs from its factory name.
  - Of the nine entity groups, only `sites.list` and `clients.lists` are exercised anywhere (via useSites.ts:19, 30); the remaining keys have no callers (grep-verified).
- ASSUMED: none.

## src/lib/data/signedUrls.ts

- Purpose: Batches Supabase Storage signed-URL creation (one `createSignedUrls` round trip per bucket) as a replacement for per-row N+1 signing in four views (signedUrls.ts:4-6).
- Public surface:
  - `DEFAULT_SIGNED_URL_TTL_SECONDS = 3600` (signedUrls.ts:17).
  - `signPaths(bucket: string, paths: string[], expiresIn: number = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<Map<string, string>>` (signedUrls.ts:23-41).
  - `withSignedUrls<T>(rows: T[], options: { bucket: string; getUrl: (row: T) => string | null | undefined; withUrl: (row: T, signedUrl: string) => T; expiresIn?: number }): Promise<T[]>` (signedUrls.ts:53-80).
- Inputs & outputs:
  - In: bucket name, storage paths or URL-bearing rows; row URLs are parsed via `extractStorageInfo(url)` which returns `{ bucket, path, fileName } | null` (imageUrlResolver.ts:6).
  - Out: `signPaths` returns a path→signedUrl map (paths that fail to sign are absent, signedUrls.ts:21-22); `withSignedUrls` returns a new row array where only rows whose URL parsed to the requested bucket and signed successfully are replaced (signedUrls.ts:75-79) — rows with other buckets or unparseable URLs are returned unchanged (signedUrls.ts:66-70).
  - Stores touched: Supabase Storage bucket passed by caller (network); no tables, no localStorage.
- Dependencies: uses -> `@/integrations/supabase/client` (L19, signedUrls.ts:11); `@/lib/imageUrlResolver` (`extractStorageInfo`, L12, signedUrls.ts:12); `@/lib/logger` (L13, signedUrls.ts:13; scoped child logger "signedUrls", signedUrls.ts:15). used by <- `src/lib/data/sites.ts:15` (L19) only (grep-verified).
- Side effects: one network call per invocation — `supabase.storage.from(bucket).createSignedUrls(unique, expiresIn)` (signedUrls.ts:32) after dedup/empty-filter (signedUrls.ts:29); a `log.warn` on batch failure (signedUrls.ts:34).
- Error handling: batch error → warn log and empty map returned (signedUrls.ts:33-36), so callers silently keep original (unsigned) URLs; entries lacking `signedUrl` or `path` are skipped (signedUrls.ts:38); empty/zero-path input short-circuits without a network call (signedUrls.ts:30, 71). No throws.
- Tests: none found (grep-verified — no test references `signPaths` or `withSignedUrls`).
- Observed issues:
  - The docstring names four views whose N+1 it "replaces" (signedUrls.ts:4-6); all four still contain their own `createSignedUrl(` call and none imports this file (grep-verified), so the replacement has a single consumer: `fetchSites` (sites.ts:43).
- ASSUMED: none.

## src/lib/data/sites.ts

- Purpose: Framework-free repository for the `sites` entity — the self-described "reference implementation" of the layer's repository pattern (sites.ts:2-3).
- Public surface:
  - `type SiteRow = Database["public"]["Tables"]["sites"]["Row"]` (sites.ts:17).
  - `type SiteWithClient = SiteRow & { clients: { name: string } | null }` (sites.ts:18).
  - `type ClientOption = Pick<...clients Row, "id" | "name">` (sites.ts:19).
  - `SITE_LIST_LIMIT = 200` (sites.ts:21).
  - `fetchSites(options: { clientId?: string; limit?: number } = {}): Promise<SiteWithClient[]>` (sites.ts:29-48).
  - `fetchClientOptions(): Promise<ClientOption[]>` (sites.ts:51-59).
- Inputs & outputs:
  - In: optional `clientId` filter and `limit` override.
  - Out: `fetchSites` — `sites` rows with embedded `clients(name)`, ordered by name asc, bounded to `limit ?? 200` (sites.ts:30-34), with `site_image_url` rewritten to a signed URL for bucket `site-images` in one batch (sites.ts:43-47). `fetchClientOptions` — `{id, name}` rows from `clients`, ordered by name, limited to 200 (sites.ts:52-56).
  - Stores touched: tables `sites`, `clients` (read); storage bucket `site-images` (signed-URL creation via `withSignedUrls`).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, sites.ts:13); `@/integrations/supabase/types` (`Database`, L19, sites.ts:14); `@/lib/data/signedUrls` (`withSignedUrls`, L19, sites.ts:15). used by <- `src/lib/data/useSites.ts:15` (L19) only (grep-verified).
- Side effects: two read-only PostgREST queries plus one storage signing call per `fetchSites`; no mutations, no events.
- Error handling: both functions `throw error` on a non-null PostgREST error (sites.ts:41, 57); signing failures inside `withSignedUrls` degrade silently to original URLs (see signedUrls.ts section); `data ?? []` guards null data (sites.ts:43, 58).
- Tests: none found (grep-verified — no test references `fetchSites`/`fetchClientOptions`), despite the file's own claim that the layer is "unit-testable with a mocked client" (sites.ts:10).
- Observed issues:
  - The join result is cast `(data ?? []) as SiteWithClient[]` (sites.ts:43) rather than typed from the select string.
  - `fetchClientOptions` bounds the `clients` query with the sites constant `SITE_LIST_LIMIT` (sites.ts:56).
  - The query it says it mirrors (docstring, sites.ts:25) remains inlined in `src/views/Sites.tsx` (V01), which does not import this repository (grep-verified).
- ASSUMED: existence of the `site-images` storage bucket (referenced sites.ts:44; not verified against the Supabase project).

## src/lib/data/useSites.ts

- Purpose: React Query hooks over the sites repository, presented as the pattern views should adopt instead of `useEffect` + inline `supabase.from()` (useSites.ts:2-4).
- Public surface:
  - `useSitesList(options: { clientId?: string; enabled?: boolean } = {})` → `useQuery` result for `SiteWithClient[]` (useSites.ts:17-26).
  - `useClientOptions(options: { enabled?: boolean } = {})` → `useQuery` result for `ClientOption[]` (useSites.ts:28-35).
- Inputs & outputs:
  - In: optional `clientId` filter, `enabled` flag (default true, useSites.ts:21, 32).
  - Out: React Query cache entries keyed `queryKeys.sites.list({ clientId })` (useSites.ts:19) and `queryKeys.clients.lists()` (useSites.ts:30), both with `staleTime: 5 * 60 * 1000` chosen against the 3600 s signed-URL TTL (comment, useSites.ts:22-24).
  - Stores touched: TanStack Query in-memory cache only (indirectly the tables/bucket listed under sites.ts).
- Dependencies: uses -> `@tanstack/react-query` (`useQuery`, external, useSites.ts:13); `@/lib/data/queryKeys` (L19, useSites.ts:14); `@/lib/data/sites` (`fetchClientOptions`, `fetchSites`, L19, useSites.ts:15). used by <- none found (grep-verified: `lib/data/useSites`, `useSitesList`, `useClientOptions` match only this file).
- Side effects: query execution via React Query (network as per sites.ts); no subscriptions, no mutations.
- Error handling: delegated entirely to React Query — repository throws surface as the hook's `error` state; no catch, no toast in this file.
- Tests: none found (grep-verified).
- Observed issues:
  - Both exported hooks have zero consumers app-wide (grep-verified), including the views the docstring names as the pattern being replaced (useSites.ts:3-4).
  - `useSitesList` passes only `clientId` to `fetchSites` (useSites.ts:20), so the repository's `limit` parameter is unreachable through the hook layer.
- ASSUMED: none.
