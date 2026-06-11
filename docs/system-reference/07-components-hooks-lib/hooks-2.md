# Hooks — Part 2 of 2

Scope: per-symbol reference for the **second half** of `src/hooks/*.ts*` (alphabetical, files 12–22). Covers 10 files. Part 1 (`hooks-1.md`) covers files 1–11 (use-mobile … useOfflineSync). Offline-queue mechanics live in `06-flows/offline-sync.md`; PDF pipeline in `06-flows/pdf-report-pipeline.md`; the two template systems in `06-flows/templates.md`.

Every entry cites `src/hooks/<file>:line` for the key export. Callers verified by grep.

---

## `usePDFTemplate.ts` — ⚠️ DEAD FILE (no importers)

> **NOTE:** Grep finds **zero** importers of `usePDFTemplate`, `PDFTemplate`, or `ReportType` from this module. Superseded by `usePDFTemplateGateway.ts`, which duplicates the same `pdf_report_templates` fetch + JSON-parse logic with more report types and helpers. Safe-to-delete candidate (not deleting per charter).

### `usePDFTemplate(reportType)` — `:15`
- One-line: Fetch the single default `pdf_report_templates` row for a report type; expose merged customization.
- Param: `reportType: ReportType` (`'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance'`).
- Returns: `{ template: PDFTemplate | null, loading, error, getCustomization(overrides?), sections }`.
- Data: `supabase.from("pdf_report_templates").select("*").eq("report_type",…).eq("is_default",true).single()`. `PGRST116` (no row) → `template=null`, not an error. JSON-parses `customization`/`sections` if stored as strings.
- `getCustomization(overrides?)`: merges `template.customization` (or `DEFAULT_CUSTOMIZATION`) + `sections` + overrides.
- Callers: **none**.

### Exported types `:86`
- `PDFTemplate` — `{ id, name, report_type, customization: ReportCustomization, sections: ReportSection[] }`.
- `ReportType` — 5-member union (above). ⚠️ Distinct from the 7-member `TemplateReportType` in the gateway file (snake_case) and the 7-member `ReportType` in `useUnifiedPdfGeneration.ts` (kebab-case). Three overlapping report-type unions exist across these hooks.

---

## `usePDFTemplateGateway.ts` — the canonical template gateway

Header comment declares this the **MANDATORY entry point** for all PDF report generation (branding / section visibility / accent colors / SANS enforcement). See `06-flows/templates.md` and `06-flows/pdf-report-pipeline.md`.

### Module consts (internal)
- `ACCENT_COLOR_PALETTE: Record<string, AccentColors>` `:46` — 5 named palettes (blue/green/orange/red/purple), each `{ primary, light, dark, rgb }` hex/rgb strings. Default fallback = `blue`.
- `DEFAULT_TEMPLATES: Record<TemplateReportType, {customization, sections}>` `:80` — hardcoded fallback customization + section list for each of the 7 report types (used when DB has no row). These are the source of truth for default section IDs/order/enabled flags.

### `usePDFTemplateGateway(reportType)` — `:225`
- One-line: Fetch default template config for a report type; return template data + computed helpers + per-section/column/KPI visibility lookups.
- Param: `reportType: TemplateReportType`.
- Returns `UsePDFTemplateGatewayResult` `:196`:
  | field | type | meaning |
  |---|---|---|
  | `template` | `PDFTemplateConfig \| null` | DB row (null → defaults used) |
  | `loading`, `error` | `boolean`, `string\|null` | fetch state |
  | `customization` | `ReportCustomization` | `DEFAULT_CUSTOMIZATION` ◀ `DEFAULT_TEMPLATES[type]` ◀ DB, with `sections` resolved |
  | `enabledSections` | `ReportSection[]` | `sections.filter(enabled).sort(order)` |
  | `accentColors` | `AccentColors` | palette for `customization.accentColor` |
  | `isSectionEnabled(id)` | `(string)=>boolean` | default `true` if section unknown |
  | `getSectionTitle(id)` | `(string)=>string` | falls back to `id` |
  | `getSectionOrder(id)` | `(string)=>number` | `999` if unknown |
  | `getColumnVisibility(sectionId, columnId)` | `=>boolean` | default `true` |
  | `getKpiVisibility(sectionId, kpiId)` | `=>boolean` | default `true` |
  | `mergeCustomization(overrides)` | `=>ReportCustomization` | runtime override merge |
  | `refetch()` | `()=>Promise<void>` | re-runs `fetchTemplate` |
- Data: identical query to `usePDFTemplate` (`is_default=true`, `.single()`, `PGRST116`→defaults). `fetchTemplate` is a `useCallback` keyed on `reportType`; `useEffect` re-fetches on change.
- Callers: `SiteSummaryReport.tsx`, `lib/assetVerificationReportGenerator.ts`, `lib/complianceReportGenerator.ts`, `lib/floorPlanReportGenerator.ts`, `lib/pdfTemplateTestRunner.ts`, `views/PDFTemplateTestDashboard.tsx`. (In practice the generators call the standalone `fetchPDFTemplate` below, not the hook.)

### `fetchPDFTemplate(reportType)` — `:352`
- One-line: Non-hook async equivalent of the gateway, for use inside report generators / async contexts.
- Param → Return: `TemplateReportType` → `Promise<{ customization, sections, accentColors }>`.
- Behavior: same query + same `DEFAULT_TEMPLATES` merge; on **any** error returns `DEFAULT_TEMPLATES[type]` (or `site_summary` default). Verbose `console.log` instrumentation at each step (`[fetchPDFTemplate] …`).
- Callers: the same generator/lib files listed above — this is the actually-used entry point for server-bound PDF generation.

### `getAccentColorPalette(colorName)` — `:426`
- `(string) => AccentColors` — palette lookup with blue fallback. ⚠️ Exported but **no external callers** (grep-clean); only `ACCENT_COLOR_PALETTE` consumed internally.

### Exported types
- `TemplateReportType` `:20` — 7-member snake_case union (adds `coc_validation`, `comprehensive_inspection` over the older `ReportType`).
- `PDFTemplateConfig` `:29`, `AccentColors` `:38`, `UsePDFTemplateGatewayResult` `:196`.

---

## `usePendingVerifications.ts`

### `usePendingVerifications()` — `:5`
- One-line: Poll the count/list of CoC verifications awaiting the current user.
- Params: none. Returns: React-Query result of `get_pending_verifications` rows (`data ?? []`).
- Side effects: `supabase.auth.getUser()` in `useEffect` to capture `userId`; query `enabled: !!userId`; **`refetchInterval: 30000`** (polls every 30s).
- Data: `supabase.rpc('get_pending_verifications', { user_uuid: userId })`.
- Callers: `components/HelpButton.tsx` (badge/indicator).

---

## `useSampleReportData.ts` — preview data (sample + real-site)

Powers PDF-template **preview renderers**. Generates fully-synthetic sample data when no reference site is chosen, else hydrates from real tables. ⚠️ Overlaps heavily with `useUnifiedSiteData.ts` (both generate 12 sample subsections / 10 assets / 5 inspections with the same tenant/category constants) — two parallel sample-data generators.

### Internal sample generators (not exported)
`generateCompleteSampleSubsections` `:155`, `…CocValidations` `:192`, `…Inspections` `:203`, `…Assets` `:226`, `…KPIs` `:238`, `generateCompleteSampleData` `:259`. Use module consts `SAMPLE_CATEGORIES`/`SAMPLE_COC_STATUSES`/`SAMPLE_TENANT_NAMES`/`SAMPLE_SNAG_TITLES` and `Math.random()` for doc counts/dates.

### `useAvailableSites()` — `:293`
- One-line: List all sites with a computed data-quality "completeness" score, for the reference-site picker.
- Returns: `{ sites: SiteWithStats[], loading }`, sorted by `completenessScore` desc.
- Data: `sites` join `clients!inner`, then per-site **N+1** count queries (`subsections`, `inspections` head/exact counts via `Promise.all`). Score heuristic (`:327`): +30/+20 subsections, +20/+15 inspections, +15 logo (max 100).
- Callers: `components/settings/PDFTemplateManager.tsx`.

### `useSampleReportData(reportType, referenceSiteId?)` — `:362`
- One-line: Build a full `SampleReportData` bundle (site/subsections/assets/inspections/cocValidations/kpis) for previews — real data if `referenceSiteId` given, else synthetic.
- Params: `reportType: ReportType` (unused for branching — only in dep array), `referenceSiteId?: string`.
- Returns `SampleReportData` `:122`: `{ site, subsections, assets, inspections, cocValidations, kpis, loading, error }`.
- Behavior (`useEffect` keyed on `[reportType, referenceSiteId]`):
  - No `referenceSiteId` → `generateCompleteSampleData()`.
  - With site → fetch `sites`(+client), all `subsections` (per-sub N+1 for doc count, open-snag count, snag details limit 5, `qr_code_url`), `coc_validations` (fallback to synthesizing from `coc_status`), `site_assets`, `inspections` with `json_data` parsed into `lineShops` + `findings` (recursive section/item walk `:608`), and 3 count queries for KPIs.
  - Any error / empty site / empty subsections → falls back to sample data (multiple fallback branches).
- Callers: `PDFTemplateManager.tsx` imports only `useAvailableSites`; **`useSampleReportData` itself** is used by `preview-renderers/{AssetVerificationPreview,InspectionPreview,SiteSummaryFullPreview}.tsx` and `PDFWYSIWYGEditor.tsx`.

### Exported types
`SampleSite`, `SiteWithStats`, `SampleSnag`, `SampleSubsection`, `SampleAsset`, `LineShopData`, `InspectionFinding`, `SampleInspection`, `SampleKPIs`, `SampleCocValidation`, `SampleReportData` (`:4`–`:131`). `LineShopData`/`InspectionFinding` model image maps `{ downloadURL, originalFilename }` extracted from inspection `json_data`.

---

## `useServerPdfGeneration.ts` — ⚠️ likely superseded by `useUnifiedPdfGeneration`

> **NOTE:** Functionally a subset of `useUnifiedPdfGeneration` (same `generate-pdf` edge-function call, narrower `ReportData` typing). Only one caller remains.

### `useServerPdfGeneration()` — `:109`
- One-line: Invoke the `generate-pdf` edge function with a site-report payload; track progress + toast.
- Returns: `{ generatePdf(data), isGenerating, progress }`.
- `generatePdf(data: ReportData)` → `Promise<{ url, filename } | null>`: sets progress 10→30→80→100; `supabase.functions.invoke('generate-pdf', { body: data })`; `sonner` toasts info/success/error; throws if no `result.url`; returns `null` on failure.
- Local interfaces `:5`–`:107` (`SubsectionData`, `SummaryStats`, `HealthMetrics`, `COCAnnexData`, `ReportData`, etc.) — none exported.
- Callers: `components/site/GenerateFinalReportButton.tsx`.

---

## `useUndoStack.ts` — floor-plan pin undo

### `useUndoStack()` — `:13`
- One-line: In-memory LIFO undo stack (cap 10) for floor-plan pin actions; tracks a single "pending" action for toast-based undo.
- Returns:
  | field | type | meaning |
  |---|---|---|
  | `undoStack` | `UndoAction[]` | most-recent-first |
  | `pendingUndo` | `UndoAction \| null` | last pushed, for "Undo" toast |
  | `pushAction(action)` | `(Omit<UndoAction,'timestamp'>)=>void` | stamps `Date.now()`, prepends, slices to `MAX_UNDO_STACK=10`, sets pending |
  | `popAction()` | `()=>UndoAction` | returns + removes top, clears pending |
  | `clearPendingUndo()` | `()=>void` | dismiss pending |
  | `canUndo` | `boolean` | `undoStack.length > 0` |
- State only — no network/storage; lost on unmount. `pushAction`/`clearPendingUndo` memoized; `popAction` depends on `undoStack`.
- `UndoAction` `:3` — `{ type: 'delete'|'add'|'move'|'status_change', pinId, previousData?, description, timestamp }`.
- Callers: `components/InteractiveFloorPlan.tsx`.

---

## `useUnifiedPdfGeneration.ts` — canonical client→edge PDF generator

Single hook fronting the `generate-pdf` edge function for 7 report types. See `06-flows/pdf-report-pipeline.md`.

> **NOTE:** `InspectionTemplateReportData` is **declared twice** verbatim (`:174` and `:191`) — duplicate interface, harmless but a copy-paste artifact.

### `useUnifiedPdfGeneration()` — `:233`
- One-line: Generate a report via `generate-pdf` edge fn (download flow) or fetch its blob (preview flow); track progress + toast.
- Returns: `{ generatePdf, generatePdfForPreview, isGenerating, progress }`.
- `generatePdf(data: UnifiedReportData)` → `Promise<GenerationResult>`: invoke `generate-pdf` (body=data); progress 10→30→80→100; toasts via `getReportTypeName`; returns `{ success, url, filename }` or `{ success:false, error }`.
- `generatePdfForPreview(data)` `:284` → `Promise<GenerationResult>`: invokes with `{ ...data, returnBlob: true }`, then `fetch(result.url)` → `blob` added to result; **no success toast**.
- `GenerationResult` `:221` — `{ success, url?, filename?, blob?, error? }`.
- Callers: `components/FortressMarkingChecklist.tsx`, `components/SiteDrawingReport.tsx`, `views/Calendar.tsx`, `views/InspectionTemplates.tsx`.

### `getReportCategory(reportType)` — `:357`
- `(ReportType) => string` — maps report type → save-folder category name. ⚠️ **Exported but no callers** — consumers instead use `getReportCategoryName` from `lib/pdfDocumentSaver.ts` (a near-duplicate). Dead export.

### Internal helper
`getReportTypeName(reportType)` `:343` — type→display-name map; used only by `generatePdf` toast.

### Exported types
`ReportType` `:9` (7-member **kebab-case** union — distinct from the gateway's snake_case set), `BaseReportData`, `COCValidationReportData`, `InspectionReportData`, `SiteDrawingReportData`, `FortressChecklistReportData`, `CalendarReportData`, `InspectionTemplateReportData` (×2), `UnifiedReportData` union `:208`.

---

## `useUnifiedSiteData.ts` — single source for template-manager previews

Header comment: "SINGLE source of data for PDF Template Manager previews." Seeds with sample data, swaps to real data when a site is selected. ⚠️ Parallel/duplicate of `useSampleReportData` sample generators (same constants, similar shapes; different exported type names).

### Internal sample generators (not exported)
`generateSampleSubsections` `:177`, `generateSampleAssets` `:200`, `generateSampleInspections` `:215`, `generateSampleFloorPlans` `:241`, `calculateKPIs` `:248`, `generateSampleData` `:286`. `calculateKPIs` derives ~24 metrics incl. heuristic `openSnags = floor(total*0.3)`, `verifiedAssets = floor(len*0.8)` (sample-only estimates).

### `useUnifiedSiteData(siteId)` — `:327`
- One-line: Return the full data bundle (site/subsections/assets/inspections/floorPlans/cocValidations/kpis) for a site, with sample fallback and refetch.
- Param: `siteId: string | null`.
- Returns `UnifiedSiteData` `:153`: `{ site, subsections, assets, inspections, floorPlans, cocValidations, kpis, loading, error, refetch() }`. Initial state = `generateSampleData()` (lazy initializer).
- Behavior (`fetchData` `useCallback` on `siteId`, run in `useEffect`):
  - `null` siteId → sample data, no loading.
  - else: fetch `sites`(+`clients!inner`, consultant/supply fields), `subsections` (per-sub **N+1** doc + open-snag counts), `site_assets`, `inspections`(+template/subsection names, `json_data`), `subsection_floor_plans` (per-plan **N+1** `floor_plan_pins` status counts; open = `open|in_progress`, resolved = `closed|resolved`), `coc_validations`(+doc coc_number, subsection name). Then `calculateKPIs` on **real** arrays.
  - Any error → `setError` + fallback to `generateSampleData()`.
- Callers: `components/settings/PDFTemplateManager.tsx` (primary data source — line 361) and preview renderers `AssetVerificationPreviewRenderer`, `CompliancePreviewRenderer`, `FloorPlanPreviewRenderer`.

### Exported types
`UnifiedSiteInfo`, `UnifiedSubsection`, `UnifiedAsset`, `UnifiedInspection`, `UnifiedFloorPlan`, `UnifiedCocValidation`, `UnifiedKPIs`, `UnifiedSiteData` (`:34`–`:164`). Richer than the `Sample*` set (adds consultant/supply-authority site fields, floor-plan + per-status pin metrics).

---

## `useUnresolvedOrphans.ts` — orphan-inspection resolution

Backs the forced-at-login orphan-resolution modal. Server contract documented in the file header (Supabase view + 2 SECURITY DEFINER RPCs); see `docs/integrity-audit/force-at-login-resolution.md`.

> **NOTE:** View + RPCs are newer than the generated `Database` type, so the module casts the client to a local `SupabaseUntyped` (`ut`, `:64`) via `as unknown as`. The header argues this is safe because the runtime contract is enforced server-side by SECURITY DEFINER guards (writes can't corrupt data from a client mistake). The two RPCs (`resolve_my_orphan`, `archive_my_orphan`) are client-invoked **writes** — flagged for the security lens, but mitigated by definer-side scoping to `auth.uid()`.

### `useUnresolvedOrphans()` — `:68`
- One-line: Fetch the current user's unresolved orphan inspections and expose resolve/archive mutations.
- Returns:
  | field | type | meaning |
  |---|---|---|
  | `rows` | `OrphanRow[]` | from view `my_unresolved_orphans` |
  | `isLoading` | `boolean` | query loading |
  | `error` | `Error \| null` | query error |
  | `resolve({inspection_id, subsection_id})` | `mutateAsync` | RPC `resolve_my_orphan` |
  | `archive({inspection_id, reason})` | `mutateAsync` | RPC `archive_my_orphan` |
  | `isMutating` | `boolean` | either mutation pending |
- Query: `ut.from("my_unresolved_orphans").select("*")`; `staleTime 30s`, `gcTime 5m`. Both mutations `invalidateQueries(ORPHANS_QUERY_KEY)` on success.
- Callers: `components/OrphanResolutionModal.tsx`.

### Exports
- `ORPHANS_QUERY_KEY` `:66` — `["unresolved-orphans"] as const`. ⚠️ Exported but only used internally (no external grep hits).
- Types `OrphanCandidate` `:22`, `OrphanBestGuess` `:27` (`{id,name,similarity}` from pg_trgm), `OrphanRow` `:33`.

---

## `useUserRole.tsx` — role + client-mapping resolution

Core auth/role hook; see `03-auth-and-access`. Most-used hook in this set (15 callers).

### `useUserRole()` — `:7`
- One-line: Resolve the signed-in user's role from `user_roles`, reactively re-fetching on auth changes.
- Returns: React-Query result → `UserRole` (`"Admin" | "Client" | "Contractor" | null`).
- Side effects (`useEffect`): captures `userId` via `getUser()`; subscribes to `onAuthStateChange` — **on user change, `removeQueries` for `["user-role"]`, `["onboarding-status"]`, `["user-client-info"]`** (prevents stale-role leakage across sessions). Unsubscribes on cleanup.
- Data: `user_roles.select("role").eq("user_id",userId).maybeSingle()`; `enabled: !!userId`; `staleTime 5m`, `gcTime 10m`.
- Callers (15): `AppSidebar`, `ClientPortalLayout`, `ClientProtectedRoute`, `ContractorPortalLayout`, `ContractorProtectedRoute`, `FloorPlanPinModal`, `OnboardingWizard`, `ProtectedRoute`, `hooks/useContractorSites`, `views/ClientPortal{Calendar,Dashboard,SiteDetail,Sites,SubsectionDetail}`, `views/MyProfile`.

### `useClientInfo(previewClientId?)` — `:54`
- One-line: Resolve the user's client record (or, for Admins, a previewed client) incl. logo/company.
- Param: `previewClientId?: string` (Admin-only preview override).
- Returns: React-Query result → `{ client_id, clients } | mapping | null`.
- Behavior: if `userRole === "Admin"` **and** `previewClientId` → fetch that `clients` row directly; else fetch `user_clients` mapping (`client_id, clients(...)`) for `auth.uid()` via `maybeSingle()`. Depends on `useUserRole()`. ⚠️ No `enabled` guard / no `userId` in queryKey beyond `previewClientId` — keyed only on `["user-client-info", previewClientId]` (relies on the `useUserRole` auth-change cache purge for correctness on user switch).
- Callers (6): `ClientPortalLayout`, `views/ClientPortal{Calendar,Dashboard,SiteDetail,Sites,SubsectionDetail}`.

### `UserRole` type `:5` — `"Admin" | "Client" | "Contractor" | null`.
