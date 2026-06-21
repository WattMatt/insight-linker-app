# Components: `src/components/site/`

Scope: per-symbol ground truth for every file in `src/components/site/` (the building blocks of the
`(admin)` Site-Detail dashboard and its tabs). **20 files covered.** These are the child components
referenced as consumers in `04-routes/admin-sites-inspections.md §2` (the `SiteDetail` 9-tab view) and
in `06-flows/*`; this doc documents the components themselves. The host view `SiteDetail.tsx` and its
data reads/writes are in the route doc — **cited, not repeated** here.

**RLS context (applies to every client write below).** Per `04-routes/admin-sites-inspections.md` and
`03-auth-and-access/access-contexts-and-roles.md §3.3`, the `User` role holds blanket `FOR ALL`
manage-all policies on `sites`/`subsections`/`inspections`/`snags`/`site_assets`/`coc_validations`/
`schematic_blocks`/`site_schematics`/`site_documents`/`subsection_documents` — so any of the direct
`.update`/`.insert`/`.delete`/`.upload` calls noted below succeed for **any staff user, cross-client**.
Components are passed `readOnly?` from public/client-portal hosts to hide mutating controls (client-side
only — not a server guard).

**Caller map** (grep, `import` of `@/components/site/*`):
- `src/views/SiteDetail.tsx` imports: `AssetVerification`, `DocumentDialogs`, `InspectionDialogs`,
  `QRAnalytics`, `SchematicDiagram`, `SiteDocuments`, `SiteEditDialog`, `SiteLevelInspections`,
  `SiteOverview`, `SiteReports`, `SubsectionList`.
- `src/views/ClientPortalSiteDetail.tsx` + `src/views/PublicSiteReview.tsx` import `AssetVerification`,
  `SchematicDiagram` (the two cross-context, `readOnly`/portal-aware components).
- Intra-folder: `AssetVerification` → `AssetTable`, `AssetComparisonTable`, `MeterRegister`;
  `SiteReports` → `ReportSettingsDialog`, `GenerateFinalReportButton`, `BulkInspectionReportGenerator`;
  `GenerateFinalReportButton` → `ReportSettingsDialog` (type `ReportSection`); `SubsectionList` →
  `SubsectionFilters`.

> **⚠️ DEAD COMPONENTS:** `SiteImages.tsx` and `SiteExport.tsx` have **no importers anywhere** in
> `src/` (verified by grep). They are unused. See their entries below.

---

## AssetVerification.tsx — `AssetVerification`

Tab body for the Site-Detail "asset-verification" tab. Excel import → `site_assets`, plus three
sub-tabs (Verification / Meter Register / Electrical).

| Prop | Type | Meaning |
|---|---|---|
| `siteId` | `string` | scopes all queries/writes |
| `siteName` | `string` | display + passed to children |
| `readOnly?` | `boolean` | hides import/delete/edit controls |

- **Data reads** (`@tanstack/react-query`): `site_assets` (eq `site_id`, `:56-60`); `inspections`
  (`id,title,subsection_id,json_data`, eq `site_id`, not-null json, `:71-75`); `subsections`
  (`id,name`, `:86-89`).
- **Derived:** `inspectionMeterMatches` — `Map<normalizedSerial, InspectionTenantMatch>` built from
  `json_data.tenants[]`, normalizing serial via `toUpperCase().replace(/[^A-Z0-9]/g,'')`, skipping
  `NA`/`TBC`, preferring tenant rows with images (`:112-165`). **Duplicate of the matching logic also
  inlined in `AssetComparisonTable` and `GenerateFinalReportButton`** (3 copies).
- **`parseExcelFile(file)`** (`:168-304`) — client-side `xlsx` (SheetJS) parser. Walks rows, detects
  `ELECTRICAL`/`WATER` section markers + `Premises ID` header rows, fuzzy-maps columns to asset fields.
  Many `console.log` debug lines left in.
- **Writes (security-relevant, client-side):** `site_assets` INSERT of parsed rows (`created_by` = auth
  user, `import_batch_id` = `crypto.randomUUID()`, `:349`); `site_assets` DELETE by `site_id` ("Clear
  All", `:372`).
- **Renders:** header w/ Import/Refresh/Clear-All, two stat cards (both show `electricalAssets.length`
  — ⚠️ "Total Assets" card is mislabeled, water meters excluded), empty state, or a 3-tab `Tabs`
  (`AssetComparisonTable`, `MeterRegister`, `AssetTable`). `onDataUpdated` refetches + invalidates
  `site-inspections-tenants`.
- **Callers:** `SiteDetail`, `ClientPortalSiteDetail`, `PublicSiteReview`.

## AssetTable.tsx — `AssetTable`

Plain searchable table of one asset category; row delete.

| Prop | Type | Meaning |
|---|---|---|
| `assets` | `Asset[]` | rows to show |
| `type` | `"electrical" \| "water"` | column set + label |
| `onRefresh` | `() => void` | re-fetch after delete |
| `readOnly?` | `boolean` | hides delete column |

- State: `search`, `deleteAssetId`, `deleting`. Client-side filter on premises/trade/serial.
- **Write:** `site_assets` DELETE by `id` (`handleDeleteAsset`, `:64`) — `AlertDialog` confirm.
- `getMeterTypeBadge` maps meter_type string → colored badge (CT/3PH/1PH).
- Caller: `AssetVerification`.

## AssetComparisonTable.tsx — `AssetComparisonTable`

The "Verification" sub-tab: compares each electrical asset to its matched inspection tenant; inline
edit of both sides; PDF report generation.

| Prop | Type | Meaning |
|---|---|---|
| `assets` | `Asset[]` | electrical assets |
| `inspectionMeterMatches` | `Map<string, InspectionTenantMatch>` | serial→tenant (from parent) |
| `siteName` | `string` | report header |
| `companyLogoUrl?` | `string \| null` | report logo |
| `onDataUpdated?` | `() => void` | refetch after edit |
| `readOnly?` | `boolean` | hides edit/test controls |

- **Exported types:** `InspectionTenantMatch`, `ComparisonResult` (re-used elsewhere via import).
- `siteId` derived from `window.location.pathname` regex (`:125-129`) — ⚠️ brittle; no router param.
- Derived `comparisonResults` (match + CT/breaker compare → `match`/`mismatch`/`na`), `filteredResults`,
  `stats`. Helpers `normalizeMeterSerial`, `compareValues`.
- **Writes (security-relevant):** `site_assets` UPDATE of meter_serial/ct_ratio/breaker by asset id
  (`handleSaveAssetEdit`, `:254-257`); **`inspections` UPDATE** — fetches `json_data`, mutates the
  matching tenant in `tenants[]`, writes whole `json_data` back (`handleSaveInspectionEdit`, `:310-313`).
- PDF: `generateInspectionBasedReport` (lib) → preview in `DocumentPreviewDialog`; `savePDFToDocuments`
  persists to the `documents` category. `testPdfGeneration()` debug button (non-readOnly).
- Renders 5 filter stat-cards, search, results table with `renderEditableCell`, image dropdown →
  `RobustImage` dialog. Caller: `AssetVerification`.

## MeterRegister.tsx — `MeterRegister`

"Meter Register" sub-tab: consolidates meters from 3 sources (subsections, assets, inspection tenants)
into one table; flags discrepancies; CSV export. **Read-only — no table writes.**

| Prop | Type | Meaning |
|---|---|---|
| `siteId` | `string` | scopes queries |
| `siteName` | `string` | CSV filename |
| `readOnly?` | `boolean` | accepted, currently unused (no mutating UI) |

- **Reads** (`react-query`, each with `refetch`): `subsections` (meter+ct, not-null, `:57-61`);
  `site_assets` (`:72-76`); `inspections` (`id,title,json_data`, `:88-91`).
- Derived `consolidatedMeters`: `Map<serial, MeterEntry>` merging all 3 sources; sets `hasDiscrepancy`
  when only-one-source or CT-ratio mismatch (`:106-214`). `filteredMeters` by view tab + search; `stats`.
- `handleExportCSV` builds CSV client-side, `URL.createObjectURL` download (`:262-288`).
- Renders 5 clickable stat cards (view filters), table, image preview `Dialog` (`RobustImage`).
- Caller: `AssetVerification`. Exported interfaces are local (not re-imported).

## SchematicDiagram.tsx — `SchematicDiagram` (default + named export, ~2113 lines)

The "schematic" tab: upload a PDF site plan, render via `pdfjs`, place/drag/resize/link "blocks" onto
it that map to subsections; auto-match; calibration; pan/zoom. Largest file in the folder.

| Prop | Type | Meaning |
|---|---|---|
| `siteId` | `string` | scopes schematic + blocks |
| `siteName` | `string` | display |
| `readOnly?` | `boolean` | disables edit/upload/drag |
| `accessToken?` | `string` | public-review navigation context |
| `clientPortalMode?` | `boolean` | client-portal navigation context |

- Exports both `export const SchematicDiagram` (`:139`) and `export default SchematicDiagram` (`:2113`).
- Local interfaces: `Subsection`, `SchematicBlock`, `Schematic`, `DetectedRegion`,
  `InspectionTenantMatch`. Consts `MIN_CONTAINER_HEIGHT`, `SIZE_PRESETS`.
- Heavy local state (~40 `useState`): pdf page/scale/dimensions, pan offset, calibration rect, block
  drag/resize, edit/link/size dialogs, image viewer. `pdfjs` worker set from unpkg CDN (`:58`).
- **Reads:** `site_schematics` (latest for site, `:680`), `schematic_blocks` (`:702`), `subsections`
  (`:712`), `inspections` (`:721`).
- **Writes (all client-side, security-relevant):**
  - storage `documents` upload + `getPublicUrl` for the PDF (`:813-821`); `site_schematics` INSERT
    (`:824`), UPDATE (calibration/detected-regions, `:1239,1272`), DELETE (`:862`).
  - `schematic_blocks` INSERT (`:908`), UPDATE position/name/subsection link (`:646,1003,1052,1092,
    1139`), DELETE (`:1073`). `is_auto_matched` set on auto-link.
- Navigates to subsection detail (uses `accessToken`/`clientPortalMode` to pick public vs portal vs
  admin URL). Renders `FullscreenImageViewer` for tenant images.
- **Callers:** `SiteDetail`, `ClientPortalSiteDetail`, `PublicSiteReview`. ⚠️ PDF rendered via remote
  unpkg worker (`pdf.worker.min.mjs`) — external CDN dependency at runtime.

## SiteOverview.tsx — `SiteOverview` + `KPICard`

"Overview" tab: KPI dashboard (8 cards) + site/consultant info cards.

| `SiteOverview` Prop | Type | Meaning |
|---|---|---|
| `site` | `Site` | site record |
| `stats` | `SiteStats \| null` | precomputed compliance stats (from host); `null` ⇒ renders nothing |
| `onTabChange?` | `(tab) => void` | KPI cards deep-link to other tabs |

- **`KPICard`** (local, not exported): presentational card — `title`, `value`, `subtitle`, `icon`,
  `progress?`, `trend?`, `trendLabel?`, `status?` (success/warning/danger/info/purple), `onClick?`,
  `details?`, `delay?`. Pure styling, no data.
- **Reads:** one `react-query` `site-extended-stats` aggregating `subsections`, `site_documents`
  (count), `subsection_documents` (count), `subsection_floor_plans`+`floor_plan_pins`, `inspections`,
  `snags`, subsection metering (`:168-256`, `staleTime: 30000`).
- Derived rates: `cocComplianceRate`, `siteHealthRate`, `snagResolutionRate`; `getHealthStatus`.
- Caller: `SiteDetail`.

## SubsectionList.tsx — `SubsectionList`

"Subsections" tab: filterable/groupable table or grid of subsections; row → subsection detail; delete
delegated to parent.

| Prop | Type | Meaning |
|---|---|---|
| `subsections` | `Subsection[]` | rows |
| `onDelete` | `(id, name) => void` | parent handles cascading delete (see route doc §2) |
| `clientId` | `string` | nav URL |
| `siteId` | `string` | nav URL |
| `snags?` | `Snag[]` | for snag-count badges |

- **Read (own):** `coc_validations` (`subsection_id,status`, in subsection ids, `:58-61`) → builds
  `failedValidationsBySubsection` so a "Validation Failed" badge can override the primary `coc_status`.
- Local helpers `isSnagOpen` + `TERMINAL_SNAG_STATUSES` (`['rectified','closed']`) — **same pair
  duplicated in `GenerateFinalReportButton`**. Derived `snagCountBySubsection`, `categories`,
  `filteredSubsections`, `groupedSubsections`.
- ⚠️ Uses `useMemo` for a side-effect (`setExpandedGroups`, `:213-217`) — should be `useEffect`.
- Renders `SubsectionFilters`, table (`renderTableView`) or grid (`renderGridView`), grouped
  `Collapsible`s, delete `AlertDialog` (calls `onDelete`). Caller: `SiteDetail`.

## SubsectionFilters.tsx — `SubsectionFilters` + `SubsectionFiltersState`

Controlled filter/search/group/view-mode bar for `SubsectionList`.

- **Exported type `SubsectionFiltersState`**: `{ search; cocStatus[]; compliance[]; snags[]; metering[];
  category[]; groupBy: "none"|"category"|"cocStatus"|"compliance"|"snags"; viewMode: "table"|"grid" }`.

| Prop | Type | Meaning |
|---|---|---|
| `filters` | `SubsectionFiltersState` | current state |
| `onFiltersChange` | `(s) => void` | controlled update |
| `categories` | `string[]` | dynamic category chips |
| `totalCount` / `filteredCount` | `number` | "Showing X of Y" |

- Pure UI (one local `isFilterOpen`). Const option lists `COC_STATUS_OPTIONS`, `COMPLIANCE_OPTIONS`,
  `METERING_OPTIONS`, `SNAG_OPTIONS`. Toggle handlers per facet; `clearAllFilters`; active-filter chips.
- Caller: `SubsectionList`. (⚠️ several lucide icons imported but unused: `Filter`, `ChevronDown`, etc.)

## SiteReports.tsx — `SiteReports`

"Reports" tab: generate (Site-Summary / Bulk-Inspection) + list/preview/delete saved report documents.

| Prop | Type | Meaning |
|---|---|---|
| `site` | `Site` | site + nested `clients.name`, `client_logo_url` |
| `readOnly?` | `boolean` | hides generate tabs, refresh, delete |

- Const `REPORT_CATEGORIES` (6 names) filters which `site_documents` count as reports.
- **Reads:** `site_documents` (in REPORT_CATEGORIES, `:68-73`); `subsections` (+nested `snags`, `:92-115`
  — fetched into state but **not visibly consumed** in render; feeds nothing downstream here).
- **Write:** `handleDeleteReport` — `confirm()`, storage `documents` remove (path parsed from url),
  `site_documents` DELETE (`:143,147-150`).
- Renders generate `Tabs` (`GenerateFinalReportButton` + `ReportSettingsDialog`;
  `BulkInspectionReportGenerator`), saved-reports list with `DocumentPreviewDialog`, `downloadFile`.
  Caller: `SiteDetail`.

## ReportSettingsDialog.tsx — `ReportSettingsDialog`, `getDefaultReportSections`, `ReportSection`

Toggle dialog for which sections appear in the Site-Summary PDF.

- **`ReportSection`** (exported interface): `{ id; title; description; enabled; icon: ReactNode;
  category?: 'cover'|'overview'|'details'|'annexes' }`.
- **`ReportSettingsDialog`** props: `open`, `onOpenChange`, `sections: ReportSection[]`,
  `onSectionToggle: (id, enabled) => void`. Groups sections by category, renders `Switch` per row. Pure.
- **`getDefaultReportSections()`** → `ReportSection[]` (17 sections; only `coc-annexes` default-off).
- Callers: `SiteReports` (renders dialog + seeds defaults), `GenerateFinalReportButton` (imports the
  `ReportSection` type only).

## GenerateFinalReportButton.tsx — `GenerateFinalReportButton`

Button + dialog that gathers comprehensive site data and triggers server-side PDF generation.

| Prop | Type | Meaning |
|---|---|---|
| `site` | `SiteData` (`{id,name,address?,client?}`) | target site |
| `companyLogoUrl?` | `string` | report logo |
| `accentColor?` | `string` (default `#2563eb`) | report accent |
| `reportSections?` | `ReportSection[]` | which sections enabled |
| `onReportSaved?` | `() => void` | refresh list after save |

- Uses `useServerPdfGeneration()` hook (`generatePdf`, `isGenerating`, `progress`).
- Local `isSnagOpen` + `TERMINAL_SNAG_STATUSES` (**dup of SubsectionList**); `calculateSubsectionCompliance`.
- **`fetchComprehensiveData()`** (`:84-407`): one big read — `subsections`, then parallel `snags`,
  `settings`(single), `site_assets`, `site_marking_checklist`, `site_documents`, `subsection_documents`,
  `inspections`, `coc_validations`. Re-implements the **asset↔inspection meter-match normalize logic a
  third time** (`:265-338`) and the latest-validation-per-subsection map (mirrors ComplianceDashboard).
- `handleGenerate`: re-fetches data, conditionally fetches detailed `coc_validations` for COC annexes,
  calls `generatePdf({ reportType:'site-summary', ... })`, then `completeDownloadHandoff` /`downloadFile`.
  No direct write here — PDF persistence is server-side (see `06-flows/pdf-report-pipeline.md`).
- Caller: `SiteReports`.

## BulkInspectionReportGenerator.tsx — `BulkInspectionReportGenerator`

Card that batch-generates one inspection DOCX/PDF report per selected subsection.

| Prop | Type | Meaning |
|---|---|---|
| `siteId` | `string` | scopes subsection fetch |
| `siteName` | `string` | report header |
| `clientName?` | `string` | report header |
| `siteLogoUrl?` | `string \| null` | report logo |
| `onComplete?` | `() => void` | callback after run |

- Local types `GenerationResult`, `SubsectionWithInspection`.
- **`fetchSubsections()`** (`:79-177`): `subsections` (+nested `inspections`→`inspection_templates`,
  `:85-102`); `subsection_documents` `ilike '%Inspection%Report%'` to detect existing reports
  (`:109-113`). Counts photos in `json_data` (sections + tenants).
- **`generateSingleReport(sub)`** (`:210-380`): fetches full `inspections.single()`,
  `inspection_templates.single()`, `snags`, `inspection_signatures`; assembles `InspectionReportData`;
  calls `generateAndSavePdfShiftInspectionReport(...)` (lib → edge fn; persists server-side, see
  `06-flows/pdf-report-pipeline.md`). No direct table writes in this component.
- **`runBulkGeneration()`**: session check, applies skip-existing / only-with-photos filters, loops
  sequentially (500ms gap), supports cooperative stop (`shouldStop`). ⚠️ `shouldStop` is read from
  closure inside the loop — a known stale-closure pattern (stop may lag a tick).
- Renders options, progress, summary stats, selection list, results list (download links). Caller:
  `SiteReports`.

## SiteDocuments.tsx — `SiteDocuments` (+ local `UnifiedDocumentsList`, `EmptyDocumentsState`)

"Documents" tab: unified, searchable, group-by-category-or-subsection accordion of site + subsection
documents. **Pure presentation — all actions are callbacks; no direct Supabase calls.**

| Prop (subset) | Type | Meaning |
|---|---|---|
| `documents` | `SiteDocument[]` | site-level docs |
| `categories` | `SiteDocumentCategory[]` | category lookup |
| `subsectionDocuments?` / `subsections?` | arrays | merged into unified list |
| `onDeleteDocument`/`onPreview`/`onDownload` | `(…)=>void` | row actions (parent does the work) |
| `onUploadClick`/`onCreateCategory`/`onDeleteCategory` | callbacks | category/upload actions |
| `onBulkDeleteCategories?`/`onBulkDeleteDocumentsInCategory?` | callbacks | bulk ops |
| `canManage?` | `boolean` | Admin-only gate (`useUserRole() === 'Admin'`); when false the management UI is hidden (View + Download only) |
| `onRenameDocument`/`onMoveDocuments`/`onDeleteDocuments` | callbacks | per-row + bulk doc mutations |
| `onViewHistory` | callback | open per-document audit history |
| `onRenameCategory`/`onReorderCategory` | callbacks | inline category rename + up/down reorder (`order_index`) |

- Derived `unifiedDocuments` (tags each `source: "site"|"subsection"`), `filteredDocuments`,
  `groupedByCategory`, `groupedBySubsection`. The grouped list is rendered inline; `EmptyDocumentsState`
  is local (not exported). Caller: `SiteDetail`.
- **Management UI (admin only, gated by `canManage`)**: selection checkboxes + a bulk action bar (bulk
  Move to… / Delete; Move disabled when a selection mixes site-level and subsection docs — different
  category tables). Each row shows a metadata line (size · date · uploader, "—" when unknown) and a "⋮"
  overflow menu (Rename / Move to… / History / Delete). Each non-system category has its own "⋮" menu
  (Upload here / Rename / Move up / Move down / Empty / Delete category). Rename is inline for both docs
  and categories; system categories show a 🔒 badge and have no menu. Sibling components
  `MoveDocumentsDialog.tsx` + `DocumentHistoryDialog.tsx`; mutations live in core lib
  `src/lib/documents/`.

## DocumentDialogs.tsx — `DocumentDialogs`

Three controlled dialogs (create category / upload document / delete category) for the documents tab.
Pure — all submit/confirm handlers are passed-in callbacks; no Supabase. Props are the open-state +
form-value setters + `onCreateCategory`/`onUploadDocument`/`onDeleteCategory` + `categories` lookup.
Caller: `SiteDetail`.

## InspectionDialogs.tsx — `InspectionDialogs`

Single controlled "Create Site Inspection" dialog (template select + date). Pure — `handleCreateInspection`
is a passed-in callback; no Supabase. Props: open-state, `availableTemplates[]`, selected-template +
date getter/setters, `handleCreateInspection`. Caller: `SiteDetail`.

## SiteLevelInspections.tsx — `SiteLevelInspections`

Card listing site-wide (no-subsection) inspections; links into the inspections tab.

| Prop | Type | Meaning |
|---|---|---|
| `inspections` | `Inspection[]` | filtered to `!subsection_id` internally |
| `siteId` / `clientId?` | `string` | build nav URL |
| `onCreateClick` | `() => void` | open create dialog |

- Pure (no Supabase). `getInspectionUrl` builds `?tab=inspections&inspectionId=…` (admin vs client URL).
  Shows first 5 + "View all". ⚠️ Reads `inspection.json_data?.title`/`.status` (denormalized title in
  json, not a top-level column). Caller: `SiteDetail`.

## SiteEditDialog.tsx — `SiteEditDialog`

Edit-site dialog (form fields + site-image upload/capture/delete). Used directly for image writes.

| Prop (subset) | Type | Meaning |
|---|---|---|
| `open`/`onOpenChange` | dialog control | |
| `editFormData`/`setEditFormData` | controlled form (name/address/desc/status/lat/lng) | parent owns the field save (`onSubmit`) |
| `onSubmit` | `(e) => void` | parent saves text fields |
| `site?`/`siteId?` | `Site`/`string` | enables image section |
| `onImageChange?` | `() => void` | refresh after image op |

- Uses `useCamera()` (`takePicture`). **Writes (security-relevant, client-side):** storage `site-images`
  upload `{upsert:true}` + `getPublicUrl`, then `sites` UPDATE `site_image_url` (cache-busted, `:60-64`);
  `sites` UPDATE `site_image_url: null` on delete (`:79`) and on `clearLegacyUrl` (`:109`).
- `isLegacyUrl` flags Firebase/non-Supabase URLs → shows "Clear & Upload New". Caller: `SiteDetail`.

## QRAnalytics.tsx — `QRAnalytics`

"qr-analytics" tab: per-subsection QR grid; bulk regenerate + bulk download (ZIP of PNGs + a pdfmake PDF).

| Prop | Type | Meaning |
|---|---|---|
| `site` | `Site` | name + origin for QR URL |
| `subsections` | `Subsection[]` | one QR per subsection |
| `companyLogo` | `string \| null` | embedded in QR center |
| `generatingAll`/`setGeneratingAll` | `boolean`/setter | parent-owned busy flag |
| `downloadingAll`/`setDownloadingAll` | `boolean`/setter | parent-owned busy flag |
| `fetchSiteData` | `() => void` | refresh after regenerate |

- **Read:** `settings.qr_base_url` (`:39-44` and again `:96-99`) — the canonical QR base URL.
- `handleGenerateAll`: loops `generateAndUploadQRCode(...)` (lib → uploads to storage + updates
  `qr_code_url`) per subsection.
- `handleDownloadAll`: dynamic-imports `qrcode`, draws each QR to a canvas with logo + site/sub labels,
  zips PNGs (`JSZip`) + a pdfmake grid PDF (`generatePdfBlob`), triggers download. No table writes here.
- Renders `LabeledQRCode` per card; per-card download uses `subsection.qr_code_url`. URL pattern:
  `${base}/public/subsections/${id}` (matches `06-flows/qr-access.md`). Caller: `SiteDetail`.

## SiteImages.tsx — `SiteImages`  ⚠️ DEAD (no importers)

Card to manage site main image + client logo (preview/upload/delete, legacy-URL detection). Mirrors the
image section of `SiteEditDialog` but as a standalone tab card. Props: `site`, `siteId`, `imagePreview`
state + setter, `handleImageUpload`/`handleDeleteImage` (passed in), `uploadingImage`, `fetchSiteData`.
- The upload/delete logic is parent-supplied callbacks, BUT the legacy-URL "Clear & Upload New" buttons
  call `supabase.from('sites').update({ site_image_url: null })` / `{ client_logo_url: null }` **directly**
  (`:94-97,165-168`) — security-relevant client writes, though the component is unreferenced.
- **No importer in `src/`** — superseded by `SiteEditDialog`'s inline image section. Candidate for deletion.

## SiteExport.tsx — `SiteExport`  ⚠️ DEAD (no importers)

Card wrapping `PDFReportEditor` ("Customize Report"). `createDefaultSections()` builds 8 `ReportSection`
(from `@/components/pdf-editor`, a **different** `ReportSection` type than `ReportSettingsDialog`'s).
`handleGenerateWithCustomization` is a stub (just `console.log` + close — no generation wired).
Props: `site`. **No importer in `src/`** — superseded by `SiteReports` + `GenerateFinalReportButton`.
Candidate for deletion.
