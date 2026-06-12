# Lib Inventory — Part 2 (`src/lib/*.ts`, second third)

**Scope:** The middle third (alphabetical) of `src/lib/*.ts` — files 15–28 of 42: `inspectionReportGenerator` → `pdfTemplateExtractor`. This slice is dominated by the **pdfmake PDF stack** (config → utils → engine → branding → savers/exporters/extractors) plus the **IndexedDB offline layer** (`offlineDB` + 3 satellite modules) and the standalone `password-strength` util. Per-symbol docs: signature, purpose, behavior, callers (grep over `src/**/*.{ts,tsx}`, excluding the defining file).

**Files covered:** 14.

**PDF stack dependency order (ground truth from imports):** `documentDesignStandards` → `pdfMakeConfig` (fonts/colors/page/doc-def/blob-gen) → `pdfMakeUtils` (cover/header/footer/table/badge/KPI builders) → `pdfEngine` (image loading + high-level `generateReport`) ; `pdfBranding` (logo loading) and the renderers/exporters sit alongside. All re-export a common subset from `pdfMakeConfig`/`pdfMakeUtils`, so many symbols below are **re-exports, not originals** — flagged inline. PDF data model context: reports land in the `documents` storage bucket + `site_documents`/`subsection_documents` tables (see [02-data-model/tables-*](../02-data-model/), [GAPS.md](../GAPS.md) G-SEC storage notes).

---

## `inspectionReportGenerator.ts`

Thin orchestration wrapper: fetches inspection + template + snags + signatures from Supabase, reshapes into `InspectionReportData`, delegates to `pdfmakeInspectionReport`.

### `generateAndSaveInspectionReport(options): Promise<GenerateReportResult>` — :35
- **Params (`GenerateAndSaveReportOptions`):** `inspectionId, subsectionId, siteName, subsectionName: string`; `clientName?, templateId?, siteLogoUrl?`.
- **Returns:** `{ success, documentId?, fileName?, fileUrl?, error? }`.
- **Behavior:** (1) `inspections` select `.single()` → fail if missing; (2) resolve template via `templateId || inspection.template_id` from `inspection_templates` — **hard-fails if no template**; (3) reads `json_data`, maps `template.sections`→items extracting `photos` arrays; (4) extracts `tenants` supporting both **array (current)** and **object-map (legacy)** shapes; (5) maps `snags`/`inspection_signatures`; (6) calls `generateAndSaveInspectionReportPdfmake` (aliased `pdfmakeGenerateAndSave`).
- **Reads:** `inspections`, `inspection_templates`, `snags` (by `subsection_id`), `inspection_signatures` (by `inspection_id`).
- **Callers:** **NONE** (grep finds only the definition + its import of the pdfmake fn).
- **NOTES:** ⚠️ **Dead export** — no caller anywhere in `src`. The live report path calls `generateAndSaveInspectionReportPdfmake` (in `pdfmakeInspectionReport.ts`) directly. Verbose `console.log` instrumentation throughout (always-on, not dev-gated).

---

## `password-strength.ts`

Client-side password scoring (zxcvbn-ts lazy-loaded) + HIBP breach check via k-anonymity. Ported from ESITE.V1 to close gap EC-2 (header comment).

### `interface PasswordEvaluation` — :15
`{ score: 0|1|2|3|4; warning: string; suggestions: string[]; pwned: boolean|null; pwnCount: number|null }`. `pwned`/`pwnCount` are `null` when the breach check failed (network) — explicitly "unknown, not safe".

### `checkPwned(password): Promise<number|null>` — :57
- **Purpose:** HIBP Pwned Passwords k-anonymity lookup; returns breach count or `null` on failure.
- **Behavior:** SHA-1 the password (`crypto.subtle`), send only first 5 hex chars to `api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true`; scan response lines for the suffix. Returns `0` if not found, count if found, `null` on any throw or non-ok. **Only the hash prefix leaves the browser.**
- **Callers:** `views/auth/PasswordStrengthMeter.tsx` (and indirectly via `evaluatePassword`).

### `evaluatePassword(password): Promise<PasswordEvaluation>` — :77
- **Purpose:** Combined zxcvbn score + feedback + HIBP check into one `PasswordEvaluation`.
- **Behavior:** awaits `loadZxcvbn()` (lazy dynamic-import of core + language-common + language-en, memoized in module-level `zxcvbnPromise`), runs it, then `checkPwned`. `pwned = pwnCount===null ? null : pwnCount>0`.
- **Callers:** `views/auth/PasswordStrengthMeter.tsx`, `views/auth/SetPassword.tsx`, `views/auth/ResetPassword.tsx`, `views/MyProfile.tsx`; referenced in `lib/validation-schemas.ts`.

### `strengthLabel(score): string` — :90
Maps 0–4 → `Very weak / Weak / Fair / Strong / Very strong` (`Unknown` out of range). Callers: PasswordStrengthMeter and auth/profile views.

### `strengthColor(score): string` — :94
Maps 0–4 → hex colors (`#ef4444`…`#10b981`); `#6b7280` fallback. Same callers.

- **NOTES:** Internal-only `loadZxcvbn` and `sha1Hex` are not exported. HIBP failures are non-blocking by design (header doc).

---

## `pdfBranding.ts`

Logo/branding asset loading + image→base64 for PDF embedding, with a 5-min module-level cache. Companion to the pdfmake stack.

### `const BRANDING` — :19
Branding constants derived from `DOCUMENT_DESIGN_STANDARDS.logo` via `mmToPt`: `logoWidth/Height`, `coverLogoWidth/Height`, `headerLogoWidth/Height`, `defaultOrgName`, `confidentialityText`.

### `clearBrandingCache(): void` — :55
Nulls the module-level `brandingCache`. Call on settings change. Callers: (grep) imported via `pdfBranding` consumers — used to invalidate after branding edits.

### `getCachedBranding(): { logoDataUrl, organizationName }` — :62
Returns cached branding if within `CACHE_TTL_MS` (5 min), else `{ null, defaultOrgName }`. Used as the fallback return inside `loadCompanyBranding` on error.

### `imageUrlToBase64(url): Promise<string|null>` — :84
- **Purpose:** Fetch an image URL → base64 data URL for pdfmake embedding.
- **Behavior:** pass through `data:` URLs unchanged; else `fetch(url, {mode:'cors', cache:'force-cache'})` → `FileReader.readAsDataURL`. Returns `null` on any failure (warns).
- **NOTES:** Functionally overlaps `pdfEngine.loadImageAsDataUrl` (which adds compression + multi-strategy fallback). This is the simpler/older variant — **duplicate-logic** across the two modules.

### `loadCompanyBranding(): Promise<{ logoDataUrl, organizationName }>` — :132
Cache-first; else select `company_logo_url, company_name` from `settings` (`.limit(1).maybeSingle()`), convert logo via `imageUrlToBase64`, populate cache. Falls back to `getCachedBranding()` on error.

### `loadClientBranding(clientId): Promise<{ logoDataUrl, clientName }>` — :180
Selects `name, logo_url` from `clients` by id; converts logo. No cache. Returns `Unknown Client` on miss.

### `loadSiteBranding(siteId): Promise<{ logoDataUrl, siteName, clientName }>` — :214
Selects site `name, client_logo_url` + nested `clients(name, logo_url)`; logo priority = **site `client_logo_url` > client `logo_url`**. Returns `Unknown Site/Client` on miss. No cache.

### `createImageContent(dataUrl, options?): ContentImage` — :268
Builds a pdfmake image object, conditionally setting `width/height/fit/alignment/margin`.

### `createHeaderLogo(logoDataUrl, orgName): Content` — :294
Logo `fit`-sized for header (right-aligned), or styled `orgName` text fallback.

### `createCoverLogo(logoDataUrl, orgName): Content` — :313
Logo `fit`-sized for cover (centered), or `coverSubtitle`-styled text fallback.

### `formatPdfDate(date?): string` — :337
`en-GB` `DD Month YYYY`. Defaults to now.

### `formatPdfDateTime(date?): string` — :349
`en-GB` `DD Mon YYYY HH:mm`. Defaults to now.

### `generateReferenceNumber(prefix='REF'): string` — :363
`{prefix}-{base36 timestamp}-{4-char base36 random}`, uppercased.

- **Callers (file-level imports):** `components/SiteSummaryReport.tsx`, `lib/assetVerificationReportGenerator.ts`, `lib/complianceReportGenerator.ts`, `lib/pdfTemplates.ts`.
- **Reads:** `settings`, `clients`, `sites` (all via anon browser client — branding is intentionally anon-readable per GAPS tier-2 note on `settings` SELECT).

---

## `pdfDocumentSaver.ts`

Uploads a generated PDF blob to the `documents` bucket and inserts a metadata row, branching on site- vs subsection-scope.

### `savePDFToDocuments(options): Promise<SaveResult>` — :20
- **Params (`SavePDFOptions`):** `blob: Blob; fileName, categoryName: string; siteId?, subsectionId?`.
- **Returns:** `{ success, error?, documentUrl? }`.
- **Behavior:** routes to `saveToSubsectionDocuments` if `subsectionId` present, else `saveToSiteDocuments` if `siteId`, else error.
- **Callers:** `components/InteractiveFloorPlan.tsx`, `components/SiteSummaryReport.tsx`, `components/TemplateBasedReport.tsx`, `components/site/AssetComparisonTable.tsx`.

#### `saveToSiteDocuments` (internal, :41) / `saveToSubsectionDocuments` (internal, :107)
Both: find-or-create category (`site_document_categories` / `document_categories`, `order_index: 999`) → upload to `documents` bucket at `{siteId}/{cat}/{ts}-{file}` or `subsections/{subsectionId}/{cat}/{ts}-{file}` (`contentType: application/pdf`) → `getPublicUrl` → insert `site_documents` / `subsection_documents` row. `subsection` variant also stores `file_size: blob.size`. Throws on any upload/insert error (caught upstream).

### `getReportCategoryName(reportType): string` — :176
Maps report-type slugs → display category names (`site-summary`→`Site Summary Reports`, `fortress-checklist`→`Marking Checklists`, …); default `Generated Reports`.

- **NOTES:** ⚠️ **Security-relevant client write** — all writes use the anon browser client and `getPublicUrl` (world-readable). The `documents` bucket is `public=true` with blanket anon CRUD `storage.objects` policies, and `site_documents`/`subsection_documents`/category tables are not tenant-scoped at the DB. See [GAPS.md](../GAPS.md) G-SEC storage gap. Category find-or-create is **not atomic** (read-then-insert) — concurrent saves can create duplicate categories.

---

## `offlineDB.ts`

Core IndexedDB wrapper (`wm_compliance_offline`, **DB_VERSION = 4**). Singleton class + exported instance. v4 unified the schema with `offlineInspectionDB` so both modules open the same db at the same version with the **same complete store set** (header comment documents the prior VersionError fight).

**Exported interfaces (record shapes for stores):** `OfflineInspection` (:9), `OfflineImage` (:21), `OfflineSubsection` (:30), `OfflineDocument` (:48), `OfflineFloorPlan` (:58), `OfflineFloorPlanPin` (:67), `OfflineCOCPhoto` (:96), `OfflinePhoto` (:117), `OfflineMarkup` (:139), `OfflineMeasurement` (:150). **Exported type unions:** `COCPhotoType` (:90), `OfflinePhotoType` (:92), `OfflinePhotoContextType` (:94). All `synced: boolean` carry an index for unsynced-query.

### `class OfflineDatabase` (internal) → `export const offlineDB` — :539
Singleton instance. Private `db: IDBDatabase`. `onversionchange` closes the handle so other tabs/modules can upgrade.

- **`init(): Promise<void>` (:167):** opens db; `onupgradeneeded` idempotently creates **all** stores: `inspections, images, mutations, subsections, documents, floor_plans, floor_plan_pins, markups, measurements, coc_compliance_photos, offline_photos` + the `offlineInspectionDB`-owned trio `inspection_cache, inspection_images, template_cache` (v4 cross-creation).
- **Inspections:** `saveInspection`, `getUnsyncedInspections` (synced index = false), `markInspectionSynced`, `deleteInspection`.
- **Images:** `saveImage`, `getUnsyncedImages`, `markImageSynced`, `deleteImage`.
- **COC photos:** `saveCOCPhoto`, `getCOCPhotosForSubsection`, `getCOCPhotosForValidation`, `getUnsyncedCOCPhotos`, `deleteCOCPhoto`, `getCOCPhoto`.
- **Unified offline photos:** `saveOfflinePhoto`, `getOfflinePhoto`, `getOfflinePhotosByContext(contextType, contextId)` (queries `context_id` index then filters by `context_type`), `getUnsyncedOfflinePhotos`, `deleteOfflinePhoto`.
- All methods are the same promisified `transaction → store → request` pattern; lazy `if (!this.db) await this.init()`.
- **Callers:** `components/OfflinePhotoGallery.tsx`, `hooks/useOfflineFloorPlanAnnotations.ts`, `hooks/useOfflineInspections.ts`, `hooks/useOfflinePhotos.ts`, `hooks/useOfflineSync.ts`, `views/Inspections.tsx`; the `db` handle is also reused by the three satellite modules below.
- **NOTES:** `coc_compliance_photos` predates the unified `offline_photos` store — both coexist (the COC store is legacy; new code targets `offline_photos`). All photo blobs live unencrypted in IndexedDB.

---

## `offlineDBExtensions.ts`

Free-function CRUD for the `subsections`, `documents`, `floor_plans` stores. Reuses `offlineDB`'s open handle via a private `getDB()` helper.

### `getDB(): Promise<IDBDatabase>` (internal, :212)
- `if (!offlineDB['db']) await offlineDB.init()` then returns `offlineDB['db']`. ⚠️ Accesses `offlineDB`'s **private `db`** via bracket index with `@ts-ignore` — tight coupling / encapsulation break. Same pattern duplicated in `offlineFloorPlanDB.ts`.

### Subsections — `saveSubsection` (:6), `getSubsection` (:18), `getUnsyncedSubsections` (:30), `markSubsectionSynced` (:43)
### Documents — `saveDocument` (:66), `getUnsyncedDocuments` (:78), `getSubsectionDocuments(subsectionId)` (:91), `markDocumentSynced` (:104), `deleteDocument` (:126)
### Floor plans — `saveFloorPlan` (:139), `getUnsyncedFloorPlans` (:151), `getSubsectionFloorPlans(subsectionId)` (:164), `markFloorPlanSynced` (:177), `deleteFloorPlan` (:199)

All standard promisified IDB ops; `mark*Synced` is get→set `synced=true`→put.
- **Callers:** `hooks/useOfflineSubsections.ts`.

---

## `offlineFloorPlanDB.ts`

Free-function CRUD for `floor_plan_pins`, `markups`, `measurements`. Same `getDB()` private-handle reuse (`@ts-ignore`, :5).

### Pins — `saveOfflinePin` (:15), `getOfflinePin` (:27), `getFloorPlanPins(floorPlanId)` (:39), `getUnsyncedPins` (:52), `markPinSynced` (:65), `deleteOfflinePin` (:87)
### Markups — `saveMarkup` (:100), `getFloorPlanMarkups(floorPlanId)` (:112), `getUnsyncedMarkups` (:125), `markMarkupSynced` (:138), `deleteMarkup` (:160)
### Measurements — `saveMeasurement` (:173), `getFloorPlanMeasurements(floorPlanId)` (:185), `getUnsyncedMeasurements` (:198), `markMeasurementSynced` (:211), `deleteMeasurement` (:233)

All standard promisified IDB CRUD; `mark*Synced` = get→set→put.
- **Callers:** `hooks/useOfflineFloorPlanAnnotations.ts`.
- **NOTES:** Duplicates the `getDB()` helper + `@ts-ignore` private access from `offlineDBExtensions.ts`.

---

## `offlineInspectionDB.ts`

Second IndexedDB singleton on the **same db + version** (`wm_compliance_offline` v4) owning the cache stores. Adds an `initPromise` guard (de-dupes concurrent `init`).

**Exported interfaces:** `CachedInspection` (:8 — full inspection snapshot incl. denormalized `site_data`/`subsection_data`, `pending_changes` flag), `OfflineInspectionImage` (:36 — blob + `section_key`/`item_key` + `uploaded_url`), `CachedTemplate` (:48).

### `class OfflineInspectionDatabase` (internal) → `export const offlineInspectionDB` — :512
- **`init()` (:60):** `initPromise`-guarded; `onupgradeneeded` creates the **full** store set (same idempotent block as `offlineDB`) so neither module clobbers the other.
- **Inspection cache:** `cacheInspection`, `getCachedInspection`, `getAllCachedInspections`, `getCachedInspectionsBySite(siteId)`, `getUnsyncedInspections` (queries `pending_changes` index = true), `markInspectionSynced` (sets `synced=true, pending_changes=false`), `updateCachedInspectionData(id, jsonData)` (sets `last_modified`, `pending_changes=true`, `synced=false`), `deleteCachedInspection`, `isInspectionCached`, `evictOldInspections(maxCount=50)` (LRU by `cached_at` desc, only evicts non-pending; also deletes associated images).
- **Inspection images:** `saveInspectionImage`, `getInspectionImages(inspectionId, sectionKey?)`, `getUnsyncedImages`, `markImageSynced(id, uploadedUrl)`, `deleteInspectionImage`, `deleteInspectionImages(inspectionId)` (bulk by parent).
- **Template cache:** `cacheTemplate`, `getCachedTemplate`, `getAllCachedTemplates`, `deleteCachedTemplate`, `evictOldTemplates(maxCount=20)` (LRU by `cached_at`).
- **Quota/stats:** `getStorageEstimate()` (uses `navigator.storage.estimate()` → `{used, quota, percentage}`), `getCacheStats()` (counts inspections/images/templates + pending/unsynced — iterates all inspections to count images, O(n) reads).
- **Callers:** `hooks/useOfflineInspectionDetail.ts`, `hooks/useOfflineSync.ts`, `components/PlatformCapabilityTester.tsx`, `views/OfflineSyncTest.tsx`; instance referenced from `offlineDB.ts` comments.
- **NOTES:** Two singletons (`offlineDB` + this) deliberately share one db; the v4 cross-creation of stores in both `onupgradeneeded` blocks is the fix for the prior schema fight (well-documented inline). `pending_changes` is the unsynced-query key here, vs `synced` index used by `offlineDB` — inconsistent conventions across the two.

---

## `pdfMakeConfig.ts`

pdfmake bootstrap: VFS fonts, page geometry, color palette, default styles, table layouts, doc-definition + blob-generation primitives. **Foundation of the whole PDF stack.**

### Unit/geometry: `mmToPt` (:52), `ptToMm` (:53), `PAGE_CONFIG` (:55), `A4_WIDTH_PT`/`A4_HEIGHT_PT` (:68/69), `CONTENT_WIDTH_PT` (:72)
A4 in points; margins from `DOCUMENT_DESIGN_STANDARDS.margins`. `1mm = 2.83465pt`.

### `COLORS` (:80) / `DEFAULT_STYLES` (:114)
Brand palette + named styles (h1–h4, body, caption, footer, table, badges, cover) sourced from `DOCUMENT_DESIGN_STANDARDS`.

### Table layouts: `getStandardTableLayout` (:238, zebra + branded header), `getLightTableLayout` (:259, no zebra), `getKpiTableLayout` (:273, borderless)
pdfmake layout factory objects.

### `createBaseDocDefinition(content, options?): TDocumentDefinitions` — :289
Assembles a full pdfmake doc-def: page size/orientation/margins, `info` metadata, `defaultStyle` (Roboto), `styles: DEFAULT_STYLES`, optional `header/footer/background`. The canonical doc-def builder used by all generators.

### `generatePdfBlob(docDefinition): Promise<Blob>` — :389
- **Behavior:** runs `validateCanvasElements` (recursive guard — throws if any `canvas` prop isn't a proper array of objects); verifies VFS fonts loaded; `pdfMake.createPdf(...).getStream()` → reads stream chunks → `Blob`. On stream error, **falls back to `getBlob()`** (pdfmake 0.3). Dev-gated `console.error` on validation/blob failures.
- **Callers:** `assetVerificationReportGenerator`, `complianceReportGenerator`, `floorPlanReportGenerator`, `pdfTemplateExporter`, `pdfTemplateExtractor`, `wysiwygPdfGenerator`, `components/site/QRAnalytics.tsx` + re-exported via `pdfMakeUtils`/`pdfEngine`.

### `generatePdfDataUrl(docDefinition): Promise<string>` — :457
`createPdf(...).getDataUrl()`.

### `downloadPdf(docDefinition, filename): void` — :466
`createPdf(...).download(filename)`.

### `openPdfInNewWindow(docDefinition): void` — :474
`createPdf(...).open()`.

### `testPdfGeneration(): Promise<void>` — :487
Downloads a hello-world PDF + `alert()` on success/failure. **Dev/diagnostic.** Caller: `components/site/AssetComparisonTable.tsx:565` (wired to an onClick — a test button shipped in a real component).

### `testPdfBlobGeneration(): Promise<Blob>` — :526
Returns a test blob via `generatePdfBlob`. **NOTES:** ⚠️ no callers — dead diagnostic export.

### Re-exports: `pdfMake` (:545) + `type { TDocumentDefinitions, Content, StyleDictionary, TableLayout }` (:546)

- **NOTES:** Internal-only `base64ToBlob` (:338) is defined but **never called** within the file (dead helper). `validateCanvasElements` (:351) is internal. VFS assignment (:24-31) has three fallbacks for pdfmake module-shape variance.

---

## `pdfMakeUtils.ts`

The **primary reusable builder library** (header comment) — cover page, headers/footers, tables, badges, KPIs, compliance logging. Uses shared `LAYOUT`/`ACCENT_PALETTES` from `siteSummaryRenderSpec` for WYSIWYG preview↔PDF parity. Re-exports the whole `pdfMakeConfig` surface (:39-58) for convenience.

### `ACCENT_COLORS` (:71)
Record built from `ACCENT_PALETTES` → `{primary, light, text}` per accent key.

### `interface CoverPageOptions` (:75) / `createCoverPage(options): Content[]` — :95
- **Purpose:** Full branded cover page (top/bottom accent bars, logo-or-placeholder, title/subtitle, left-border site-info box, optional QR, metadata, confidentiality notice).
- **Behavior:** all dimensions pulled from `LAYOUT.cover.*` for WYSIWYG; always-on `console.log('[createCoverPage] Template Applied', …)` debug; ends with `pageBreak: 'after'`.
- **Callers:** `SiteSummaryReport`, `assetVerificationReportGenerator`, `complianceReportGenerator`, `floorPlanReportGenerator`, `pdfSubsectionRenderer`, `pdfTemplates`, `pdfmakeInspectionReport` (also re-exported via `pdfEngine`).

### `createSectionHeader(title, style?, options?): Content` — :378
Filled-bar section header; `primary` = brand-color bg/white text, else header-gray. `noTopMargin` option.

### `createPageHeader(title, skipFirstPage=true): fn(page, count) => Content` — :417
Returns a pdfmake header function; blank on page 1 when skipping (cover-page case).

### `createPageFooter(skipFirstPage=true): fn(page, count) => Content` — :451
3-column footer (confidentiality / `Page X of Y` / date); adjusts page numbering when first page is skipped.

### `interface TableColumn` (:498) / `createDataTable(columns, data, options?): Content` — :509
Styled data table with header row, zebra striping, per-column `format`/`alignment`/`width`. The workhorse table builder.

### `createInfoTable(data: [string,string][]): Content` — :563
2-column key-value table (zebra).

### `createStatusBadge(status, type='info'): Content` — :594
Filled pill badge (success/warning/error/info → COLORS).

### `getStatusType(status): 'success'|'warning'|'error'|'info'` — :631
Maps status strings to a badge type (pass/approved/valid/complete/compliant→success; fail/rejected/invalid/critical→error; pending/in_progress/incomplete→warning; else info).

### `createKpiCard(value, label, color?): Content` — :646
Single centered KPI (big value + small label). **NOTES:** no standalone callers — only used internally by `createKpiRow`.

### `createKpiRow(kpis): Content` — :675
Equal-width columns of `createKpiCard`. Callers: `pdfEngine` (`createSnagsSummary`) + report generators.

### `interface PDFComplianceCheck` (:695) / `logComplianceCheck(reportName, checks): PDFComplianceCheck` — :710
Logs `passed/total (%)` to console, warns on missing checks, returns the checks unchanged (pass-through for chaining).

### `buildDocument(options): TDocumentDefinitions` — :737
Convenience: prepends optional cover page, wires header/footer, calls `createBaseDocDefinition`. Caller: `floorPlanReportGenerator.ts:416`.

- **Re-exports (:39-58):** `pdfMake, generatePdfBlob, generatePdfDataUrl, downloadPdf, openPdfInNewWindow, createBaseDocDefinition, COLORS, DEFAULT_STYLES, PAGE_CONFIG, CONTENT_WIDTH_PT, A4_WIDTH_PT, A4_HEIGHT_PT, mmToPt, ptToMm, getStandardTableLayout, getLightTableLayout, getKpiTableLayout, generateDocumentFilename` — all originate in `pdfMakeConfig`/`documentDesignStandards`. Consumers often import these from here rather than the origin.
- **NOTES:** Header comment notes this "completely replaces the legacy pdfUtils.ts (jsPDF)".

---

## `pdfEngine.ts`

"Unified PDF Engine" — the high-level entry point layering image loading, content-block builders (image/QR/signature/snag/checklist/calendar/progress), and `generateReport` on top of `pdfMakeUtils`. Re-exports a large slice of `pdfMakeUtils` + `pdfMakeConfig` (:40-60).

### `type ReportType` (:70) / `interface ReportGeneratorOptions` (:82) / `interface GenerateReportResult` (:98)
Report-type union (inspection, site-summary, coc-validation, floor-plan, calendar, checklist, qr-sheet, comprehensive-inspection, site-drawing, generic) + generator I/O shapes.

### `loadImageAsDataUrl(url): Promise<string|null>` — :211
- **Purpose:** Robust image fetch → compress → base64 for embedding.
- **Behavior:** **3 fetch strategies** (cors → plain fetch → `loadImageViaElement` canvas with cache-bust); skips compression for SVG / <5KB; else `compressImageBlob` (canvas resize to max 1200px, JPEG q0.80). Returns `null` on total failure.
- **Callers:** report generators (`SiteSummaryReport`, `pdfmakeInspectionReport`, etc.).
- **NOTES:** Overlaps `pdfBranding.imageUrlToBase64` but adds compression + resilience — the preferred image loader.

### `createImage(dataUrl, options?): Content` — :295
Sized image block (explicit `width/height` or `maxWidth/maxHeight` capped to content width), optional caption stack.

### `createImageGrid(images, columnsPerRow=2, imageWidth?): Content` — :349
Borderless table grid of captioned images; pads short rows.

### `createProgressBar(percentage, options?): Content` — :391
Canvas bar; fill color by threshold (≥80 success, ≥50 warning, else error); label `right`/`below`/`inside`.

### `interface SignatureData` (:465) / `createSignatureSection(signatures, title='Signatures'): Content[]` — :476
Section header + signature-image/`[Signature on file]` rows with signer name/type/email/date. Empty-state message.

### `interface SnagData` (:543) / `createSnagCard(snag): Content` (:557) / `createSnagsSummary(snags, title?): Content[]` (:635)
Snag card with status badge + left accent bar by status, optional risk/rectification info; summary adds a `createKpiRow` (total/open/resolved) + per-snag cards.

### `createQRCode(dataUrl, options?): Content` (:679) / `createQRCodeGrid(qrCodes, columnsPerRow=3): Content` (:717)
Single QR (+label) / bordered grid of labeled QR codes.

### `interface ChecklistItem`/`ChecklistSection` (:764/771) / `createChecklistTable(sections): Content[]` — :779
Per-section checklist table (✓/○ marker, item, status, notes).

### `interface CalendarEvent` (:835) / `createCalendarTable(events): Content` — :847
`createDataTable` of events (event/site/start/end/status/priority).

### `generateReport(opts): Promise<GenerateReportResult>` — :884
- **Purpose:** **Primary PDF entry point.** Assembles cover + content, builds doc-def via `createBaseDocDefinition` (+ header/footer), generates blob, names file (`generateDocumentFilename`), runs `logComplianceCheck`, returns `{blob, filename, complianceChecks, previewUrl}` (object URL).
- **Callers:** `components/SiteSummaryReport.tsx`, `lib/pdfmakeInspectionReport.ts`.

### `downloadReport(docDef, filename)` (:966) / `openReportInNewWindow(docDef)` (:973)
Thin wrappers over `downloadPdf`/`openPdfInNewWindow`.

### Content helpers: `createParagraph` (:984), `createBulletList` (:1009), `createNumberedList` (:1027), `createDivider` (:1045), `createPageBreak` (:1065), `createSpacer` (:1072)
Simple pdfmake primitives.

### Compliance helpers: `getDefaultComplianceChecks` (:1083), `createComplianceChecks(passedChecks)` (:1100), `getComplianceCheckLabel(key)` (:1111)
Build/label `PDFComplianceCheck` objects.

- **Re-exports (:40-60):** `createCoverPage, createPageHeader, createPageFooter, createSectionHeader, createDataTable, createInfoTable, createKpiRow, createStatusBadge, getStatusType, logComplianceCheck, COLORS, PAGE_CONFIG, CONTENT_WIDTH_PT, A4_WIDTH_PT, A4_HEIGHT_PT, mmToPt, generateDocumentFilename` + types `CoverPageOptions, TableColumn, PDFComplianceCheck`.
- **NOTES:** Internal `loadImageViaElement` (:120) / `compressImageBlob` (:159) not exported. Largest file in this slice (1124 lines).

---

## `pdfSubsectionRenderer.ts`

Renders subsection compliance cards to pdfmake content using `subsectionCardSpec` (shared layout constants for WYSIWYG). Async because it generates QR codes per card.

### `renderSubsectionCardToPDF(data, accentColor='#3b82f6', logoUrl?): Promise<any>` — :23
- **Purpose:** One bordered subsection card (header + body + snags + footer), `unbreakable: true`.
- **Behavior:** generates a per-card QR via `generateSubsectionQRCode(data.qrCodeUrl, logoUrl)` (warns on failure); composes via the internal `createCardHeader/Body/SnagsSection/Footer`.
- **Callers:** `components/SiteSummaryReport.tsx`.

### `renderSubsectionGrid(subsections, accentColor='#3b82f6', logoUrl?): Promise<any>` — :358
- **Purpose:** Stacks cards, **2 per page** (page-break before every even index >0), 10pt gap.
- **Behavior:** awaits `renderSubsectionCardToPDF` per item in a loop (sequential QR generation).
- **Callers:** `components/SiteSummaryReport.tsx`.

- **Internal helpers (not exported):** `createCardHeader` (:78), `createCardBody` (:116, COC status/breaker/metering + QR or empty placeholder), `createSnagsSection` (:223, capped at `CARD_LAYOUT.maxSnagsShown` + "N more"), `createCardFooter` (:305), `createStatusBadge` (:326).
- **NOTES:** Local `createStatusBadge` here is **distinct from** `pdfMakeUtils.createStatusBadge` (takes a `{bg,text,border}` color object, not a type enum) — a third badge implementation in the codebase. Colors hardcoded as hex literals rather than `COLORS`.

---

## `pdfTemplateExporter.ts`

Generates a customizable PDF directly from a template object (cover/TOC/sections/tenants/header/footer/watermark). Self-contained — does **not** use `pdfMakeUtils` cover/section builders (its own private versions).

### Interfaces: `TemplateData` (:18), `TemplateSection` (:32), `TemplateItem` (:41), `TenantData` (:50), `ExportOptions` (:58)
Template structure + export toggles (`includeHeader/Footer/CoverPage/TableOfContents`, `accentColor`, `watermark`, `logoUrl`, `companyName`, `reportDate`, `referenceNumber`).

### `exportTemplateToPDF(template, options): Promise<Blob>` — :82
- **Purpose:** Build doc (cover → TOC → sorted sections → tenants) + header/footer/watermark, return blob via `generatePdfBlob`.
- **Callers:** `components/PDFTemplateExportDialog.tsx`.

### `downloadTemplatePDF(template, options, filename?): void` — :125
- **Purpose:** Same assembly as `exportTemplateToPDF` but `downloadPdf` with a sanitized filename.
- **NOTES:** ⚠️ **Duplicate assembly logic** — lines 130-158 re-implement the cover/TOC/section/tenant push sequence from `exportTemplateToPDF` verbatim rather than sharing it. Callers: (grep finds only via the export dialog importing the module).

- **Internal builders (not exported):** `buildCoverPage` (:164), `buildTableOfContents` (:286), `buildSection` (:311), `buildTenantsSection` (:378, uses `getStandardTableLayout`), `buildHeader` (:435), `buildFooter` (:455, defaults company to `'Watson Mattheus'`), `buildWatermark` (:475, rotated 315° low-opacity text).
- Local module-level `ACCENT_COLORS` (:71) is a **separate copy** from `pdfMakeUtils.ACCENT_COLORS` (different hex values).

---

## `pdfTemplateExtractor.ts`

Reverse direction: parses an **uploaded PDF** (via `pdfjs-dist`) into an editable `ExtractedTemplate` (heuristic structure detection) and can render a preview PDF back out.

### Interfaces: `ExtractedSection` (:13), `ExtractedItem` (:26), `ExtractedTemplate` (:34)
Output shapes (sections with optional `items`/`tableData`, cover-page guess, metadata).

### `extractTemplateFromPDF(file: File): Promise<ExtractedTemplate>` — :74
- **Purpose:** Read all pages' text items with positions → `analyzeStructure`.
- **Behavior:** `pdfjsLib.getDocument` → per page `getTextContent` + viewport; builds `TextBlock[]` with inverted-Y coords, font size from transform scale, bold inferred from `fontName`.
- **Callers:** `components/PDFTemplateUploader.tsx`.
- **NOTES:** Worker configured from a CDN URL (`cdnjs.cloudflare.com/.../pdf.worker.min.js`) — external network dependency, version-pinned to `pdfjsLib.version` (:10).

### `generateTemplatePreviewPDF(template): Promise<Blob>` — :413
- **Purpose:** Render an `ExtractedTemplate` back to a preview PDF (cover + sections/tables/checklists).
- **Behavior:** **dynamic import** of `pdfMakeConfig` (`generatePdfBlob`, `createBaseDocDefinition`) — lazy-loaded to keep the extractor light.
- **Callers:** `components/PDFTemplateUploader.tsx` (via module import).

- **Internal heuristics (not exported):** `analyzeStructure` (:117), `groupBlocksIntoLines` (:223), `extractCoverPageInfo` (:254), `cleanSectionTitle` (:282), `isChecklistItem` (:292), `cleanChecklistText` (:299), `detectItemType` (:309), `detectCategory` (:324, regex→Solar/Generator/MV/LV/Progress/Site Drawing/General), `cleanFileName` (:340), `detectTables` (:351), `hasTabularStructure` (:374), `parseSimpleTable` (:389).
- **NOTES:** Heuristic-heavy (font-size/regex/whitespace) — best-effort extraction; default company fallback hardcoded `'Watson Mattheus'`. Pure client-side (no Supabase).

---

## Cross-cutting NOTES (this slice)

- **Dead exports:** `inspectionReportGenerator.generateAndSaveInspectionReport` (zero callers; superseded by `…Pdfmake`), `pdfMakeConfig.testPdfBlobGeneration` (zero callers), `pdfMakeConfig.base64ToBlob` (internal, never called), `pdfMakeUtils.createKpiCard` (only internal use).
- **Duplicate logic:** image→base64 in `pdfBranding.imageUrlToBase64` vs `pdfEngine.loadImageAsDataUrl`; `getDB()` private-handle helper in `offlineDBExtensions` + `offlineFloorPlanDB`; cover/section assembly duplicated inside `pdfTemplateExporter` (export vs download); **three** distinct `createStatusBadge` implementations (`pdfMakeUtils`, `pdfSubsectionRenderer`, plus the report generators); two separate `ACCENT_COLORS` palettes (`pdfMakeUtils` vs `pdfTemplateExporter`).
- **Security-relevant client writes:** `pdfDocumentSaver.savePDFToDocuments` writes to the `documents` bucket + `*_documents`/category tables via the anon browser client with `getPublicUrl` (world-readable, no DB tenant-scope). See [GAPS.md](../GAPS.md) G-SEC storage/RLS gaps.
- **Diagnostic shipped to prod:** `testPdfGeneration` is wired to an `onClick` in `components/site/AssetComparisonTable.tsx`.
- **Offline data at rest:** all `offline*` modules persist photo/document blobs unencrypted in IndexedDB; two singletons (`offlineDB`, `offlineInspectionDB`) deliberately share db `wm_compliance_offline` v4.
