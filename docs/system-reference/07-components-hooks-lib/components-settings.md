# 07 — Components: `src/components/settings/`

**Scope:** Every exported symbol in `src/components/settings/` and its `preview-renderers/` subfolder — the admin **Settings** UI (auto-logout, image compression, SANS reference) and the **PDF report template editor** (WYSIWYG + 11 per-report-type preview renderers). **17 files covered** (6 top-level + 10 renderer components + 1 barrel `index.ts`).

Ground truth from code; `file:line` cited per export. Cross-refs: PDF generation flow is documented in `06-flows/` (the 5 PDF generators); the `ReportCustomization`/`ReportSection`/`TableColumn`/`KPIItem` types live in `src/components/pdf-editor/types`; data hooks (`useSampleReportData`, `useUnifiedSiteData`, `useAvailableSites`) are documented under hooks. The renderers in this folder are **previews only** — they mimic the PDF output but never produce a PDF.

> **Headline NOTES (detail inline):**
> - **5 dead `*Preview` exports.** `SiteSummaryPreview`, `InspectionPreview`, `FloorPlanPreview`, `AssetVerificationPreview`, `CompliancePreview` are re-exported only by `preview-renderers/index.ts`, and **nothing in `src/` imports that barrel** (verified: `grep -rn "from.*preview-renderers" src` → zero hits). They are unreferenced. The live editor uses the `*Renderer` variants + `InspectionTemplatePreview` + `SiteSummaryFullPreview`, all imported by direct path.
> - **`PDFTemplatePreview` is also a dead export** — defined but imported nowhere (`grep` → only its own file). Superseded by `PDFWYSIWYGEditor`/`SiteSummaryFullPreview`.
> - **Duplicated `PlaceholderBadge` helper** in 9 of the 10 renderer files (each defines its own local copy) — plus `EmptySectionPlaceholder` duplicated across the 4 `*Renderer` files. No shared module.
> - **Client-side admin writes:** `AutoLogoutSettings` and `PDFTemplateManager` write directly to `settings` / `pdf_report_templates` / `inspection_templates` from the browser via the anon Supabase client. Guarded only by RLS (see `03-auth-and-access`, `02-data-model/06-rls-policies`). `ImageCompressionManager` can invoke a **destructive** `batch-compress-images` edge function (overwrites storage originals) from the client.
> - **`console.log` left in prod render path** — `SiteSummaryFullPreview` logs received data + page groupings on every render (3 `console.log`/`console.warn` calls).

---

## Top-level files

### `AutoLogoutSettings.tsx`

Admin card to enable/schedule a daily forced logout for all users (writes the global `settings` row). Mounted in `src/views/Settings.tsx:328`.

| Export | Kind | Signature |
|---|---|---|
| `AutoLogoutSettings` | component | `() => JSX` (no props) |

- **State:** `settings` (loaded row), `loading`, `saving`, `enabled` (toggle), `logoutTime` (`HH:MM`), `currentTime` (display clock).
- **Effects:** on mount → `fetchSettings()` + a `setInterval` every 60s updating `currentTime` (en-ZA locale); cleared on unmount.
- **Data calls (anon client):**
  - `fetchSettings` — `supabase.from('settings').select('id, auto_logout_enabled, auto_logout_time').single()` (`:46-49`). ⚠️ NOTE: `.single()` assumes exactly one global `settings` row.
  - `handleSave` — `settings.update({ auto_logout_enabled, auto_logout_time: '${logoutTime}:00' }).eq('id', settings.id)` (`:71-77`). Converts `HH:MM`→`HH:MM:SS`.
  - `handleToggle(checked)` — immediate `settings.update({ auto_logout_enabled })` write; **reverts local state on error** (`:108`).
- **Renders:** loading skeleton card → Card with a Switch + (when enabled) a time `<input type=time>` + "Update Time" button + info panel showing live current time.
- **NOTE:** Local `interface AutoLogoutSettingsData` (`:11`). The actual enforcement of the schedule lives in **`SessionWatcher.tsx`** (which reads the same two columns and has its own unrelated local `interface AutoLogoutSettings` — name collision, not an import of this component).

### `ImageCompressionManager.tsx`

Admin card to run batch image compression over the `inspection-photos` storage bucket via an edge function; supports dry-run preview. Mounted in `src/views/Settings.tsx:334`.

| Export | Kind | Signature |
|---|---|---|
| `ImageCompressionManager` | component | `() => JSX` (no props) |

- **State:** `isRunning`, `isDryRun` (default `true`), `maxWidth` (800), `quality` (70), `minSizeKB` (150), `limit` (50), `result: BatchResult | null`.
- **Local helpers (not exported):** `runBatchCompression` (async), `formatBytes(bytes)→string`, `getStatusBadge(status)→Badge`.
- **Data call (client → edge):** `supabase.functions.invoke('batch-compress-images', { body: { bucket:'inspection-photos', maxWidth, quality, minSizeKB, dryRun, limit } })` (`:48-57`).
- **Renders:** settings grid (4 number inputs) + dry-run Switch + action button + (on result) a 5-stat summary grid + per-file list with status badges + a "run again to continue" hint when `continuationToken` present.
- **NOTE (security-relevant):** With `dryRun:false` this **overwrites storage originals** from the client. Edge-function auth model is in `05-edge-functions`. Local-only types `ProcessedFile`, `BatchResult` (`:13,21`).

### `PDFTemplateManager.tsx`

The main PDF-template admin screen: per-report-type tabs, a reference-project selector that feeds realistic preview data, inline preview via the per-type renderers, and a full WYSIWYG edit dialog. ~1005 lines. **No grep callers** other than a comment in `useUnifiedSiteData.ts` — ⚠️ UNVERIFIED whether `src/views/Settings.tsx` mounts it (it is *not* imported there; likely mounted from a PDF/templates settings tab elsewhere — not confirmed in this pass).

| Export | Kind | Signature | Notes |
|---|---|---|---|
| `PDFTemplateManager` | component | `() => JSX` (no props) | Default report-template editor |

**Module-level (non-exported) constants/helpers:**
- `REPORT_TYPES` (`:48`) — array of 5 report types `{id,label,icon,description}`: `site_summary`, `inspection`, `floor_plan`, `asset_verification`, `compliance`.
- `getDefaultTemplates()` (`:57`) — returns the full hard-coded default `customization`+`sections` per report type (used by **Reset**). This is the canonical default template spec embedded in the client.
- `convertInspectionToPreviewSections(template)` (`:314`) / `convertPreviewToInspectionSections(previewSections)` (`:332`) — map between DB inspection-template `sections` shape and `ReportSection[]`.
- `UnifiedPreviewWrapper` (`:354`, local FC) — picks the correct `*Renderer` for the selected report type, feeding it data from `useUnifiedSiteData(referenceSiteId)`; has its own `getAccentColors(color)` palette map; falls back to `PDFWYSIWYGEditor` for unknown types.

**`PDFTemplateManager` internals:**
- **State (16):** `templates`, `inspectionTemplates`, `loading`, `saving`, `selectedType`, `editingTemplate`, `editDialogOpen`, `customization`, `sections`, `hasChanges`, `referenceSiteId`, `selectedInspectionTemplateId`, `inspectionPreviewSections`, `inspectionHasChanges`, `savingInspection`. Reference sites from `useAvailableSites()`.
- **Effects:** auto-select first available site as reference (`:539`); on mount → `fetchTemplates` + `fetchInspectionTemplates`; rebuild inspection preview sections when selected template changes (`:551`).
- **Data calls (anon client):**
  - `fetchTemplates` — `pdf_report_templates.select('*').order('report_type')`; JSON-parses `customization`/`sections` (`:562`).
  - `fetchInspectionTemplates` — `inspection_templates.select('*')`, filters out any "site summary" named template (`:588-601`).
  - `handleSaveTemplate` — `pdf_report_templates.update({customization, sections}).eq('id', editingTemplate.id)` (`:628`). **Client write.**
  - `handleResetTemplate(template)` — overwrites a template with `getDefaultTemplates()[report_type]` (`:650`). **Client write.**
  - `handleSaveInspectionTemplate` — `inspection_templates.update({sections, sections_count, pages_count, updated_at}).eq('id', ...)` (`:680`). **Client write.**
- **Pure local handlers:** `handleEditTemplate`, `handleSectionToggle(sectionId)`, `handleSectionReorder(fromIndex, 'up'|'down')`.
- **Renders:** reference-project `<Select>` (badges shops/inspections/completeness) → 5-tab `Tabs` → per tab: template header (Reset/Edit buttons) + either the inspection template selector→`InspectionTemplatePreview`, or `UnifiedPreviewWrapper`. Edit dialog hosts the full `PDFWYSIWYGEditor`.
- **NOTE:** Local types `PDFTemplate` (`:36`), `InspectionFormTemplate` (`:303`), `UnifiedPreviewWrapperProps` (`:347`).

### `PDFTemplatePreview.tsx`

Lightweight horizontal-scroll thumbnail strip preview of a template (cover + TOC + per-section pages). **DEAD EXPORT** — imported nowhere (`grep` → only its own file). Superseded by `PDFWYSIWYGEditor` / `SiteSummaryFullPreview`.

| Export | Kind | Signature |
|---|---|---|
| `PDFTemplatePreview` | component | `({ customization, sections, reportType }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `customization` | `ReportCustomization` | cover title/subtitle, accent, TOC/watermark/page-number flags, exec summary, notes |
| `sections` | `ReportSection[]` | rendered in `enabled`+`order` order |
| `reportType` | `string` | unused in body |

- Module const `ACCENT_COLORS` (`:12`, record of 5 palettes). Renders hard-coded sample table/KPI/text/chart bodies by `section.type`. No state, no data calls.

### `PDFWYSIWYGEditor.tsx`

The interactive A4 WYSIWYG editor used inside `PDFTemplateManager`'s edit dialog (and as the fallback in `UnifiedPreviewWrapper`). Click-to-edit template fields, dashed "sample data" placeholders, zoom, page nav, add-column/add-KPI dialogs. ~1001 lines. **Caller:** `PDFTemplateManager.tsx`.

| Export | Kind | Signature |
|---|---|---|
| `PDFWYSIWYGEditor` | component | `({ customization, sections, reportType, referenceSiteId?, onCustomizationChange, onSectionsChange }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `customization` | `ReportCustomization` | live template chrome (cover, flags, exec summary, notes, accent) |
| `sections` | `ReportSection[]` | editable section/column/KPI model |
| `reportType` | `string` | passed to `useSampleReportData` |
| `referenceSiteId` | `string \| null` | optional reference site for real sample data |
| `onCustomizationChange` | `(Partial<ReportCustomization>) => void` | bubble field edits up |
| `onSectionsChange` | `(ReportSection[]) => void` | bubble section/column/KPI edits up |

- **Module constants:** `ACCENT_COLORS` (5), `KPI_COLOR_OPTIONS` (6), `KPI_FIELD_OPTIONS` (8 data-source fields), `A4_WIDTH=595`, `A4_HEIGHT=842`.
- **Internal (non-exported) components:** `PlaceholderData` (`:108`, amber dashed sample-data wrapper), `EditableCell` (`:142`, click-to-edit input/textarea cell with local `isEditing`/`tempValue`).
- **Data:** `useSampleReportData(reportType, referenceSiteId)` (`:219`). Builds `subsectionsData`/`assetsData`/`kpiValues` from sample data with hard-coded fallbacks (Evaton Mall / Fortress Fund Managers demo data); `lineShopsFromInspections` extracts meter data, `hasRealMeterData` flag toggles placeholder vs real rendering.
- **State:** `currentPage`, `zoom` (0.8, clamped 0.5–1.5), `addColumnDialog`/`addKPIDialog` (`{open,sectionId}`), `newColumnLabel`, `newKPILabel`, `newKPIField`, `newKPIColor`.
- **Edit handlers (all call `onSectionsChange` / `onCustomizationChange`):** `handleSectionTitleChange`, `handleColumnLabelChange`, `handleColumnVisibilityToggle`, `handleAddColumn`, `handleKPILabelChange`, `handleAddKPI`.
- **Page renderers (local):** `PageWrapper` (A4 frame w/ watermark + page number), `renderCoverPage`, `renderTOCPage`, `renderExecutiveSummaryPage`, `renderSubsectionsPage`, `renderAssetsPage`, `renderNotesPage` → assembled into a `pages[]` array.
- **Renders:** legend bar + toolbar (TOC/Page#/Watermark switches, zoom, page nav) + thumbnail sidebar + scrollable page view + Add-Column/Add-KPI dialogs.
- **NOTE:** Several `EditableCell`s are passed `onChange={() => {}}` (static labels rendered as faux-editable, e.g. assets header, signature labels) — visual affordance only, edits are dropped.

### `SANSReferenceTab.tsx`

Static, read-only reference panel for the SANS 10142-1:2020 electrical standard (mandatory/safety/additional clauses, COC types, test instruments, expiry guidelines, red-flag auto-fail conditions). **No grep callers** — ⚠️ UNVERIFIED where mounted (defined + exported, not referenced elsewhere in `src/`; possibly a dead/standalone tab).

| Export | Kind | Signature |
|---|---|---|
| `SANSReferenceTab` | component | `({ className? }) => JSX` |

- **Module data (non-exported, hard-coded):** `CLAUSE_REFERENCES` (`{mandatory[7], safety_critical[4], additional[4]}`), `COC_TYPES[3]`, `TEST_INSTRUMENTS[5]`, `EXPIRY_GUIDELINES[5]`.
- Pure presentational — no state, no effects, no data calls. Renders a header + 4 stat cards + a multi-`Accordion` of clause/COC/instrument/expiry/red-flag sections + a footer link to sabs.co.za.
- **Internal (non-exported) sub-components:** `ClauseCard({clause, type})`, `COCTypeCard({coc})`, `RedFlagItem({title, description, clause})`.
- Local type `SANSReferenceTabProps` (`:102`).

---

## `preview-renderers/`

Two families of components share this folder:

- **`*Renderer` (4 files)** — the **live**, data-driven previews used by `PDFTemplateManager` via `UnifiedPreviewWrapper`. Each takes `sections`, `customization`, `zoom`, `colors`, `siteName`, `clientName` plus its domain data from `useUnifiedSiteData` (Unified* types) and renders an A4 cover page + a content page iterating its `enabled` sections. Each **also has a `default` export** (the same component).
- **`*Preview` (5 files) + `SiteSummaryPreview`** — older single-section renderers (each takes one `section` + `zoom` + `colors`). **All re-exported only by `index.ts`, which nothing imports → dead.**
- **Exceptions:** `SiteSummaryFullPreview` (multi-page, used live) and `InspectionTemplatePreview` (used live) are imported by direct path, not the barrel.

Common pattern across all 10: a locally-redefined `PlaceholderBadge` (amber dashed wrapper meaning "sample data, replaced at generation"); status→colour switch maps; `slice(...)` row caps with "+N more" footers.

### `index.ts` — barrel

Re-exports `SiteSummaryPreview`, `SiteSummaryFullPreview`, `InspectionPreview`, `InspectionTemplatePreview`, `FloorPlanPreview`, `AssetVerificationPreview`, `CompliancePreview` (`:4-10`). **NOTE: the barrel itself is imported nowhere** — so the 5 `*Preview` re-exports are dead; the 2 live components (`SiteSummaryFullPreview`, `InspectionTemplatePreview`) are reached only via their direct file paths in `PDFTemplateManager`.

### `SiteSummaryFullPreview.tsx` — **LIVE**

True multi-page WYSIWYG site-summary preview matching PDF output, driven by the shared `src/lib/siteSummaryRenderSpec.ts` spec (the single source of truth shared with the actual generator). **Caller:** `PDFTemplateManager.tsx:28` (via `UnifiedPreviewWrapper`).

| Export | Kind | Signature |
|---|---|---|
| `SiteSummaryFullPreview` | component | `({ sections, customization, zoom, colors, siteName, clientName, siteAddress, clientLogoUrl, subsections, kpis, inspections?, cocValidations?, onSectionTitleChange? }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `sections` | `ReportSection[]` | section config (enabled/order/title) |
| `customization` | `ReportCustomization` | accent (via `getAccentPalette`), cover, date/page-# flags |
| `zoom` | `number` | scale factor (`scale = pt*zoom`) |
| `colors` | `{primary,light,text}` | **NOTE: prop accepted but ignored** — recomputed from `customization.accentColor` (`:98-99`) |
| `siteName`/`clientName`/`siteAddress`/`clientLogoUrl` | strings/null | cover-page identity |
| `subsections` | `SampleSubsection[]` | mapped to `SubsectionData` incl. snags |
| `kpis` | `SampleKPIs` | overrides computed metrics |
| `inspections?` | `SampleInspection[]` | inspections table |
| `cocValidations?` | `CocValidationData[]` | COC table (else synthesized from subsections) |
| `onSectionTitleChange?` | `(id,title)=>void` | declared but **unused** in body |

- **State/effects:** `qrCodeCache` (data-URL map) + `qrCodeCacheRef` mirror; `generateQRCodeDataUrl(subsectionId, logoUrl)` (memoized `useCallback`) renders a QR to canvas via the `qrcode` lib (`QRCode.toCanvas`), optionally overlays a center logo, caches the PNG data-URL. `useEffect` generates QR for every subsection on mount (`:160`). ⚠️ NOTE: QR target URL is hard-coded `https://example.com/public/subsections/${id}` (`:113`) — placeholder, not the real public host.
- **Data transforms:** `subsectionData` (map → `SubsectionData` w/ snags), `sampleCocValidations` (use real or synth), `metrics`=`calculateMetrics(...)` (overridden by `kpis`), `categoryHealth`=`calculateCategoryHealth(...)`, `enabledSections`=`getEnabledSections(...)`. All spec helpers from `siteSummaryRenderSpec`.
- **Internal sub-components:** `PlaceholderBadge`, `EmptySectionPlaceholder`, `PageBreakIndicator`, `PageWrapper` (uses `LAYOUT` spec), `SectionHeader`, `KpiCard`.
- **`renderSection(section)`** handles 8 section ids via `matchesSectionId`: `health-metrics`, `health-by-category`, `summary-statistics`, `subsection-details` (cards w/ live QR + snags), `subsection-qr-codes` (QR grid), `coc-validations`, `inspections`, `asset-verification` (synth metrics); unknown → warns + placeholder. Sections grouped into pages 2–5; cover is page 1.
- **NOTE:** 3 `console.log`/`console.warn` left in the render body (`:167, :224, :730, :761`).

### `InspectionTemplatePreview.tsx` — **LIVE**

Multi-page preview of an **inspection form template** (cover + one page per section as a checklist table + sign-off page). **Caller:** `PDFTemplateManager.tsx:27` (inspection tab).

| Export | Kind | Signature |
|---|---|---|
| `InspectionTemplatePreview` | component | `({ template, sampleData?, zoom, colors }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `template` | `{id,name,category,description,sections: InspectionSection[]}` | the inspection template being previewed |
| `sampleData?` | `{siteName?,clientName?,address?,inspectorName?,inspectionDate?,logoUrl?}` | cover/sign-off fill |
| `zoom` | `number` | scale factor |
| `colors` | `{primary,light,text}` | accent palette (here actually used) |

- Local types `InspectionSection`, `InspectionItem` (`:19,26`). Module helpers: `PlaceholderBadge`, `getItemTypeIcon(type)`, `sampleStatuses[8]` (canned pass/fail/n-a/pending statuses for preview rows).
- No state / no data calls — pure render from props. Cover page lists first 6 sections as a "Template Structure" grid; each section page renders its items as a table with sample status badges; final sign-off page with summary KPIs + signature blocks. Page numbers computed from section count.

### `SiteSummaryPreview.tsx` — **DEAD** (barrel-only)

Single-section site-summary renderer covering many section ids in one switch. Re-exported by `index.ts`; barrel unused → no live caller.

| Export | Kind | Signature |
|---|---|---|
| `SiteSummaryPreview` | component | `({ section, zoom, colors, sampleData }) => JSX` |

- Props: `section: ReportSection`, `zoom`, `colors`, `sampleData: { subsections[], kpis{…} }`. Local `PlaceholderBadge`. Branches on `section.id`: `health-metrics`/`compliance`, `health-by-category`, `documents-summary`, `summary-statistics`/`site-info`, `subsection-details`/`subsections`, `coc-validations`/`documents`, `subsection-qr-codes`, `inspections`, `asset-verification`/`asset-summary`, `fortress-checklist`; else fallback. All values hard-coded/derived from `kpis`. **NOTE:** superset of section ids vs `SiteSummaryFullPreview` (handles `documents-summary`, `fortress-checklist` which the live one doesn't) — but it is dead code.

### `InspectionPreview.tsx` — **DEAD** (barrel-only)

Single-section inspection-report renderer (details/findings/photos/signatures). Re-exported by `index.ts`; no live caller.

| Export | Kind | Signature |
|---|---|---|
| `InspectionPreview` | component | `({ section, zoom, colors, inspection? }) => JSX` |

- `inspection?: SampleInspection`. `hasRealData` derived from findings/lineShops. Branches: `inspection-details` (table), `findings` (icon+status rows from `inspection.findings`), `photos` (real images from findings/lineShops or placeholder grid), `signatures` (2 sig blocks); else fallback. Local `PlaceholderBadge`.

### `FloorPlanPreview.tsx` — **DEAD** (barrel-only)

Single-section floor-plan renderer. Re-exported by `index.ts`; no live caller.

| Export | Kind | Signature |
|---|---|---|
| `FloorPlanPreview` | component | `({ section, zoom, colors }) => JSX` |

- Branches: `floor-plan-image` (mock plan w/ coloured pins), `pins-summary` (3 KPI cards, hard-coded `{15,4,11}`), `pins-table` (3 sample pins); else fallback. Local `PlaceholderBadge`.

### `FloorPlanPreviewRenderer.tsx` — **LIVE**

Data-driven floor-plan preview (cover + content page). Has a `default` export too. **Caller:** `PDFTemplateManager.tsx:29`.

| Export | Kind | Signature |
|---|---|---|
| `FloorPlanPreviewRenderer` (named) + default | component | `({ sections, customization, zoom, colors, siteName, clientName, floorPlans, kpis }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `floorPlans` | `UnifiedFloorPlan[]` | per-plan thumbnails + pin counts |
| `kpis` | `UnifiedKPIs` | `totalPins`, `openPins`, `totalFloorPlans` |
| (shared) `sections`/`customization`/`zoom`/`colors`/`siteName`/`clientName` | — | as in family pattern |

- `scale(pt)=pt*zoom`; `enabledSections` filtered+sorted; local `PlaceholderBadge`, `EmptySectionPlaceholder`, `getStatusColor`. `renderSection` handles `floor-plan-image` (plan cards), `pins-summary` (4 KPI cards), `pins-table` (synthesizes up to 8 pins from `floorPlans[].pinCount`). Cover page uses `Map` icon.

### `AssetVerificationPreview.tsx` — **DEAD** (barrel-only)

Single-section asset-verification renderer that pulls real meter data from inspection `lineShops`. Re-exported by `index.ts`; no live caller.

| Export | Kind | Signature |
|---|---|---|
| `AssetVerificationPreview` | component | `({ section, zoom, colors, inspections?, kpis? }) => JSX` |

- Module helpers: `PlaceholderBadge`, `extractLineShops(inspections)→LineShopData[]`. `hasRealData` from extracted line shops. Branches: `asset-summary` (KPI cards from real/fallback counts), `electrical-meters` (real `lineShops` table), `water-meters` (sample), `equipment` (placeholder); else fallback.

### `AssetVerificationPreviewRenderer.tsx` — **LIVE**

Data-driven asset-verification preview (cover + content page). Named + `default` export. **Caller:** `PDFTemplateManager.tsx:30`.

| Export | Kind | Signature |
|---|---|---|
| `AssetVerificationPreviewRenderer` (named) + default | component | `({ sections, customization, zoom, colors, siteName, clientName, assets, subsections, kpis }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `assets` | `UnifiedAsset[]` | partitioned by `assetCategory` |
| `subsections` | `UnifiedSubsection[]` | (accepted; not heavily used) |
| `kpis` | `UnifiedKPIs` | `totalAssets`, `verifiedAssets`, `pendingAssets` |

- `scale`, `enabledSections`. Partitions assets into `electricalMeters` / `waterMeters` / `equipment` by `assetCategory` (`:58-60`). `renderSection`: `asset-summary` (4 KPI cards incl. computed verification rate), `electrical-meters` table, `water-meters` table, `equipment` table — each with `EmptySectionPlaceholder` fallback. Local `PlaceholderBadge`, `EmptySectionPlaceholder`, `getStatusColor`.

### `CompliancePreview.tsx` — **DEAD** (barrel-only)

Single-section compliance renderer with fully hard-coded sample values. Re-exported by `index.ts`; no live caller.

| Export | Kind | Signature |
|---|---|---|
| `CompliancePreview` | component | `({ section, zoom, colors }) => JSX` |

- Branches: `compliance-summary` (KPI cards via `getKPIValue` returning canned strings), `coc-status` (sample rows w/ status icon/colour helpers), `expiring-cocs` (2 samples), `non-compliant` (3 samples); else fallback. Local `PlaceholderBadge`.

### `CompliancePreviewRenderer.tsx` — **LIVE**

Data-driven compliance preview (cover + content page). Named + `default` export. **Caller:** `PDFTemplateManager.tsx:31`.

| Export | Kind | Signature |
|---|---|---|
| `CompliancePreviewRenderer` (named) + default | component | `({ sections, customization, zoom, colors, siteName, clientName, subsections, cocValidations, kpis }) => JSX` |

| Prop | Type | Meaning |
|---|---|---|
| `subsections` | `UnifiedSubsection[]` | COC-status table source; basis for expiry/non-compliant derivations |
| `cocValidations` | `UnifiedCocValidation[]` | (accepted) |
| `kpis` | `UnifiedKPIs` | `totalSubsections`, `cocPass`, `cocMissing`, `complianceRate` |

- `scale`, `enabledSections`. Derives `expiringCocs` (assumes **2-year validity** from `cocIssueDate`, ≤90 days out — `:63-70`) and `nonCompliant` (status Missing/Fail or required-but-unset — `:73`). `renderSection`: `compliance-summary` (4 KPI cards), `coc-status` (subsection table, capped 10), `expiring-cocs`, `non-compliant`. Local `PlaceholderBadge`, `EmptySectionPlaceholder`, `getStatusColor`.

---

## Notable findings (summary)

1. **Dead exports (6):** `PDFTemplatePreview` (no importers) and the 5 single-section `*Preview` components reachable only through the unused `preview-renderers/index.ts` barrel (`SiteSummaryPreview`, `InspectionPreview`, `FloorPlanPreview`, `AssetVerificationPreview`, `CompliancePreview`). The barrel `index.ts` is itself imported nowhere.
2. **Possible dead/unmounted components:** `SANSReferenceTab` and `PDFTemplateManager` have no `import`/JSX callers found in `src/` this pass (PDFTemplateManager only appears in a comment in `useUnifiedSiteData.ts`). ⚠️ UNVERIFIED — they may be lazy-mounted from a settings tab not grepped.
3. **Duplicated helpers:** `PlaceholderBadge` re-defined in ~9 renderer files; `EmptySectionPlaceholder` re-defined in the 4 `*Renderer` files. No shared component.
4. **Client-side admin writes (RLS-guarded only):** `AutoLogoutSettings` → `settings`; `PDFTemplateManager` → `pdf_report_templates`, `inspection_templates`; `ImageCompressionManager` invokes the destructive `batch-compress-images` edge fn (overwrites storage originals when `dryRun:false`).
5. **`SiteSummaryFullPreview` leaks debug logging** (3 `console.*` per render) and uses a **hard-coded placeholder QR host** (`example.com`); its `colors` prop is ignored (recomputed) and `onSectionTitleChange` is unused.
6. **`PDFWYSIWYGEditor`** renders several static labels as faux-editable cells (`onChange={() => {}}`) — edits silently dropped; ships a large block of hard-coded demo data (Evaton Mall / Fortress) as fallback.
7. **Embedded business rules in client code:** default PDF templates (`getDefaultTemplates`), the full SANS clause/red-flag dataset (`SANSReferenceTab`), and the "2-year COC validity / 90-day expiry" heuristic (`CompliancePreviewRenderer`) all live as hard-coded client constants.
