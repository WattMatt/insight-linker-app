# Inventory part 05 — src/lib/{fortress,data,auth} + src/integrations + src/types + src/test + src/index.css

Date: 2026-07-29

List command (authoritative file set):

```
$ git ls-files 'src/lib/fortress/*' 'src/lib/data/*' 'src/lib/auth/*' 'src/integrations/*' 'src/types/*' 'src/test/*' 'src/index.css'
src/index.css
src/integrations/supabase/client.ts
src/integrations/supabase/types.ts
src/lib/auth/initialInvite.test.ts
src/lib/auth/initialInvite.ts
src/lib/data/README.md
src/lib/data/queryKeys.ts
src/lib/data/signedUrls.ts
src/lib/data/sites.ts
src/lib/data/useSites.ts
src/lib/fortress/buildingCompliance.test.ts
src/lib/fortress/buildingCompliance.ts
src/lib/fortress/ppm.test.ts
src/lib/fortress/ppm.ts
src/lib/fortress/types.ts
src/test/online.ts
src/types/site.ts
$ ... | wc -l
17
```

LOC command:

```
$ git ls-files <same globs> | xargs wc -l
     159 src/index.css
      20 src/integrations/supabase/client.ts
    3342 src/integrations/supabase/types.ts
      41 src/lib/auth/initialInvite.test.ts
      74 src/lib/auth/initialInvite.ts
      37 src/lib/data/README.md
      75 src/lib/data/queryKeys.ts
      80 src/lib/data/signedUrls.ts
      59 src/lib/data/sites.ts
      35 src/lib/data/useSites.ts
      52 src/lib/fortress/buildingCompliance.test.ts
      58 src/lib/fortress/buildingCompliance.ts
      53 src/lib/fortress/ppm.test.ts
      50 src/lib/fortress/ppm.ts
      52 src/lib/fortress/types.ts
      10 src/test/online.ts
      42 src/types/site.ts
    4239 total
```

---

### src/index.css
- Type: source
- LOC: 159
- Public surface: none (global stylesheet). Structure: `@tailwind base/components/utilities` (lines 1–3); `@layer base` design tokens as HSL CSS custom properties — `:root` light theme (lines 10–58: `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius`, `--sidebar-*`, `--success`, `--warning`, `--info`) and `.dark` overrides (lines 60–105); second `@layer base` (lines 108–159) with `* { @apply border-border }`, body defaults, 44px min touch targets under 768px (lines 121–126), `.glass` / `.glass-card` glassmorphism utility classes (lines 129–135), smooth scrolling, custom webkit scrollbar styling.
- Notes: comment at line 5 declares this the definition of the design system ("All colors MUST be HSL").

### src/integrations/supabase/client.ts
- Type: source
- LOC: 20
- Public surface: `export const supabase` (line 15) — module-scope singleton from `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { storage: window.localStorage (browser only), persistSession: true, autoRefreshToken: true } })`.
- Notes: reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (lines 5–6); throws at import time if either is missing (lines 8–10). Header comment (line 1) claims "automatically generated. Do not edit it directly." This is the DB client seam for the whole app.

### src/integrations/supabase/types.ts
- Type: generated
- LOC: 3342
- Public surface: `export type Json` (line 1); `export type Database` (line 9) — schema tree with `__InternalSupabase.PostgrestVersion: "13.0.5"` (lines 12–14); helper types `Tables<>` (line 3222), `TablesInsert<>` (3251), `TablesUpdate<>` (3276), `Enums<>` (3301), `CompositeTypes<>` (3318); `export const Constants` (line 3335) with enum value arrays.
- Notes: `Database.public.Tables` contains 51 tables (command: `awk '/^    Tables: \{/,/^    Views: \{/' ... | grep -cE '^      [a-z_]+: \{'` → `51`): coc_file_pool, coc_import_batches, coc_db_schedule, coc_certificates, access_link_visitors, activity_logs, api_access_tokens, api_clients, api_request_logs, auth_events, calendar_events, client_access_links, clients, compliance_settings, compliance_settings_audit, contractor_coc_uploads, document_categories, file_sync_logs, floor_plan_pin_comments, floor_plan_pins, inspection_items, inspection_relink_audit, inspection_subsections, inspection_templates, inspections, offline_photos, pdf_report_templates, pending_user_invites, profiles, qr_codes, qr_scans, reports, schematic_blocks, settings, site_assets, site_document_categories, site_documents, site_marking_checklist, site_schematics, sites, snags, subsection_documents, subsection_floor_plans, subsections, temp_import, user_clients, user_policy_overrides, user_roles, user_sites, user_sites_history, user_storage_connections. Views (line 2951): inspection_orphan_summary, inspection_photo_refs, my_unresolved_orphans, orphan_photo_refs. Functions (line 3013): 33 RPCs incl. get_public_portfolio, get_public_site_register, get_public_subsection, validate_access_link, validate_api_token, has_role, rollup_subsection_coc_status, recompute_subsection_installation_status, contractor_has_site_access, debug_site_health_snapshot, cleanup_old_pending_invites. Enums (line 3208): `app_role: "Admin" | "User" | "Contractor" | "Moderator" | "Client"`, `asset_category: "electrical_meter" | "water_meter" | "equipment" | "other"`.

### src/lib/auth/initialInvite.test.ts
- Type: tests
- LOC: 41
- Public surface: none (vitest suite). 4 tests on `generateInitialPassword`: policy length, all four character classes present over 500 runs, only approved unambiguous alphabet (0/O/1/l/I excluded), 1000 draws all unique.

### src/lib/auth/initialInvite.ts
- Type: source
- LOC: 74
- Public surface: `export const INITIAL_PASSWORD_POLICY` (line 15) — `{ length: 16, lower, upper, digits, symbols } as const` with ambiguous chars excluded; `export function generateInitialPassword(): string` (line 65) — 16-char one-time password, ≥1 of each class, unbiased rejection-sampled Web Crypto randomness, Fisher–Yates shuffled.
- Notes: header (lines 1–13) states it's the canonical home for the invite one-time password; pure and runtime-agnostic (browser/Node 20+/Deno via `globalThis.crypto`). Imported by src/views/Users.tsx and supabase/functions/invite-user/index.ts (grep, see Runtime observations).

### src/lib/data/README.md
- Type: docs
- LOC: 37
- Public surface: n/a. Documents the data-access layer introduced by `docs/ARCHITECTURE_REVIEW_2026-07-07.md`; states the codebase has "621 inline `supabase.from()` calls across 130 files" (line 5); layer rules (views never call supabase.from directly, bounded lists, keys from queryKeys.ts, framework-free repositories, one select string per query shape); migration order Dashboard → InspectionDetail → SiteDetail → Sites/ClientPortalSites/AdminContractorPreview → rest.

### src/lib/data/queryKeys.ts
- Type: source
- LOC: 75
- Public surface: `export interface SiteListFilters` (line 16: `{ clientId?: string }`); `export interface InspectionListFilters` (line 20: `{ siteId?; subsectionId?; status?: string }`); `export const queryKeys` (line 26) — hierarchical TanStack Query key factory (TkDodo convention) with namespaces: clients (all/lists/detail), sites (all/lists/list(filters)/detail/assets/documents), subsections (all/bySite/detail), inspections (all/lists/list(filters)/detail/templates), snags (all/bySite/bySubsection), settings (all/company), profiles (all/current/detail), calendar (all/range(fromIso,toIso)), dashboard (all/stats/triage).

### src/lib/data/signedUrls.ts
- Type: source
- LOC: 80
- Public surface: `export const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600` (line 17); `export async function signPaths(bucket: string, paths: string[], expiresIn = DEFAULT_SIGNED_URL_TTL_SECONDS): Promise<Map<string, string>>` (line 23) — one `createSignedUrls` round trip per bucket, failed paths absent from map; `export async function withSignedUrls<T>(rows: T[], options: { bucket: string; getUrl: (row: T) => string | null | undefined; withUrl: (row: T, signedUrl: string) => T; expiresIn?: number }): Promise<T[]>` (line 53) — batch-resolves a URL field on rows, unresolvable rows keep original URL.
- Notes: imports `supabase` client, `extractStorageInfo` from `@/lib/imageUrlResolver`, and `logger` (`logger.child("signedUrls")`, line 15). Header says it replaces the per-row N+1 in Sites.tsx / ClientPortalSites.tsx / ClientPortalDashboard.tsx / AdminContractorPreview.tsx.

### src/lib/data/sites.ts
- Type: source
- LOC: 59
- Public surface: `export type SiteRow = Database["public"]["Tables"]["sites"]["Row"]` (line 17); `export type SiteWithClient = SiteRow & { clients: { name: string } | null }` (line 18); `export type ClientOption = Pick<...clients Row, "id" | "name">` (line 19); `export const SITE_LIST_LIMIT = 200` (line 21); `export async function fetchSites(options: { clientId?: string; limit?: number } = {}): Promise<SiteWithClient[]>` (line 29) — `sites` select with `clients(name)`, ordered by name, bounded, optional client filter, images batch-signed via `withSignedUrls` (bucket "site-images"); `export async function fetchClientOptions(): Promise<ClientOption[]>` (line 51) — bounded `clients` id/name list.
- Notes: header (lines 1–12) declares this the reference repository-pattern implementation; framework-free (no React imports).

### src/lib/data/useSites.ts
- Type: source
- LOC: 35
- Public surface: `export function useSitesList(options: { clientId?: string; enabled?: boolean } = {})` (line 17) — `useQuery` over `queryKeys.sites.list` / `fetchSites`, staleTime 5 min; `export function useClientOptions(options: { enabled?: boolean } = {})` (line 28) — `useQuery` over `queryKeys.clients.lists()` / `fetchClientOptions`, staleTime 5 min.
- Notes: React Query hooks over the sites repository; header names Sites.tsx / Dashboard.tsx / SiteDetail.tsx as the pattern being replaced.

### src/lib/fortress/buildingCompliance.test.ts
- Type: tests
- LOC: 52
- Public surface: none (vitest suite). 5 tests: weighted rollup with N/A excluded from denominator, null weight defaults to 1, 100% when nothing applicable, null answers ignored, per-section rollup.

### src/lib/fortress/buildingCompliance.ts
- Type: source
- LOC: 58
- Public surface: `export const DEFAULT_OHS_WEIGHT = 1` (line 9); `export interface BuildingComplianceSummary` (line 11: compliantWeight, applicableWeight, compliancePct, applicableCount, naCount — all numbers); `export function buildingCompliance(items: OhsComplianceItem[]): BuildingComplianceSummary` (line 22) — weighted compliance % = Σ(weight 'Y') / Σ(weight 'Y'|'N') × 100, 100 when none applicable; `export function complianceBySection(items: OhsComplianceItem[]): Record<string, BuildingComplianceSummary>` (line 45) — groups by `section`, null section → "Uncategorised".
- Notes: header declares it the single source of truth for the building-compliance % (screen and PDF both import it). Pure, no I/O.

### src/lib/fortress/ppm.test.ts
- Type: tests
- LOC: 53
- Public surface: none (vitest suite). 5 tests on `ppmSummary`: overdue/due-soon/scheduled classification, on-schedule %, today counts as due-soon not overdue, 30-day boundary inclusive, empty-schedule → 100%.

### src/lib/fortress/ppm.ts
- Type: source
- LOC: 50
- Public surface: `export const DUE_SOON_DAYS = 30` (line 9); `export interface PpmSummary` (line 11: scheduled, dueSoon, overdue, onSchedulePct — numbers); `export function ppmSummary(assets: BuildingAsset[], today: string, withinDays: number = DUE_SOON_DAYS): PpmSummary` (line 27) — classifies `next_service_date` against `today` (ISO yyyy-mm-dd param keeps it pure/deterministic; UTC date math).
- Notes: header declares it the single source of truth for PPM KPIs (screen + PDF).

### src/lib/fortress/types.ts
- Type: source
- LOC: 52
- Public surface: `export type AssetCondition = "Good" | "Fair" | "Poor" | "N/A"` (line 6); `export interface BuildingAsset` (line 9) — 24-field shape of `building_assets` incl. `next_service_date` and soft-delete `deleted_at`; `export type OhsAnswer = "Y" | "N" | "N/A"` (line 36); `export interface OhsComplianceItem` (line 39) — 12-field shape of `ohs_compliance_items` incl. `answer`, `weight`, `section`, `item_code`.
- Notes: header (lines 1–4) declares these hand-written PLACEHOLDER types faithful to migrations 20260612200000 + 210000, to be replaced by generated Supabase types once migrations are applied.

### src/test/online.ts
- Type: tests
- LOC: 10
- Public surface: `export function setOnline(value: boolean): void` (line 5) — redefines the `navigator.onLine` getter in jsdom so offline code paths can run in tests; caller dispatches 'online'/'offline' events.
- Notes: imported by 5 offline-sync test files (grep): src/hooks/useOfflineSync.queueRaces.test.tsx, useOfflineInspectionDetail.selfHeal.test.tsx, useOfflineSync.online.test.tsx, useOfflineInspectionDetail.queueSave.test.tsx, useOfflineSync.syncInspection.test.tsx.

### src/types/site.ts
- Type: source
- LOC: 42
- Public surface: `export interface Site` (line 1: 13 fields incl. embedded `clients: { id; name }`); `export interface Subsection` (line 20: 14 fields incl. coc_status, metering_status, is_compliant, coc_number, meter_serial_number, ct_ratio, qr_code_url); `export interface SiteStats` (line 36: totalSubsections, cocApprovedCount, cocRequiredCount, meteringInstalledCount, openSnags).
- Notes: hand-written view-model types imported by 9 files (grep): src/components/site/{SiteImages,SubsectionList,SiteEditDialog,QRCodeManager,QRScanActivity,SiteReports}.tsx, src/views/{SiteDetail,ClientPortalSiteDetail,PublicSiteReview}.tsx.

## Runtime observations
- src/integrations/supabase/client.ts:15 — app-wide Supabase client singleton created at module import; throws at import time when `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing (client.ts:8–10). Auth session persisted to `window.localStorage` with `autoRefreshToken: true` (client.ts:16–20). External service integration: Supabase (PostgREST + Auth).
- src/lib/data/signedUrls.ts:32 — Supabase Storage integration: `supabase.storage.from(bucket).createSignedUrls(...)` batch call.
- src/lib/data/sites.ts:30–34, 52–56 — Supabase DB reads on `sites` (with embedded `clients(name)`) and `clients` tables, both bounded at 200 rows.
- src/lib/auth/initialInvite.ts:65 — `generateInitialPassword` is imported by the `invite-user` Supabase edge function (supabase/functions/invite-user/index.ts, per grep) and src/views/Users.tsx, i.e. it runs in both browser and Deno edge runtime.
- src/integrations/supabase/types.ts:3013–3207 — declares 33 Postgres RPCs the app can call (incl. public-access surface: get_public_portfolio, get_public_site_register, get_public_subsection, get_public_subsection_review, validate_access_link, validate_api_token).
- No request handlers, background jobs, schedulers, or queues are defined in this slice.

## Oddities
- src/lib/data/* has zero importers outside its own directory: `grep -rln "lib/data/" src --include='*.ts' --include='*.tsx' | grep -v '^src/lib/data/'` returned nothing (exit 1). The repository layer exists (and self-describes as the reference implementation) but no view or hook consumes it yet; README.md lines 31–37 present it as a pending migration.
- src/lib/fortress/types.ts describes itself as a placeholder (lines 1–4), and its two tables are absent from the generated schema: `grep -c 'building_assets' src/integrations/supabase/types.ts` → 0, `grep -c 'ohs_compliance_items'` → 0. Fortress consumers (src/components/fortress/AssetRegister.tsx, AssetRegister.test.tsx, src/components/FortressMarkingChecklist.tsx per grep) therefore run on hand-written types not backed by the generated Database type.
- src/integrations/supabase/client.ts:1 claims "This file is automatically generated. Do not edit it directly." yet the file reads Next.js `NEXT_PUBLIC_*` env vars and guards `typeof window` (lines 5–6, 17), i.e. its content differs from the stock generator output it claims to be.
- src/types/site.ts hand-writes `Site`/`Subsection` interfaces in parallel with the generated `Database["public"]["Tables"]["sites"|"subsections"]["Row"]` types (both tables exist in src/integrations/supabase/types.ts); two type sources for the same entities, with 9 files importing the hand-written one.
- The repo has many untracked "`<name> 2.<ext>`" duplicate files (git status), but none inside this slice's directories (verified by `ls` of all six directories).

## ASSUMED
- src/integrations/supabase/types.ts is assumed to be output of `supabase gen types typescript` (inferred from its shape and the `__InternalSupabase.PostgrestVersion` marker); codegen was not re-run to confirm.
- src/integrations/supabase/client.ts is assumed to have been originally scaffolded by a generator (Lovable-style header/comments) and later hand-adapted for Next.js; the edit history was not inspected.
- Fortress consumers list is based on import-string grep for "lib/fortress"; dynamic imports or path aliases other than `@/lib/fortress` would not have been caught.
