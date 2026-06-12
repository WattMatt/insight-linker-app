# lib-1 — `src/lib/*` (first third A–I) + `src/lib/pdf/*`

Scope: ground-truth, per-export docs for the first 14 of the 42 sorted top-level `src/lib/*.ts` files (alphabetical `assetVerificationReportGenerator` → `imageUrlResolver`) plus all 4 `src/lib/pdf/*.ts`. **Files covered: 18.** All citations are `path:line` of the key export. Cross-refs: see `02-data-model`, `03-auth-and-access`, `05-edge-functions`, `06-flows`.

> NOTE — big finding: the **entire `src/lib/pdf/` extraction pipeline is orphaned** (advancedProcessor, textExtractor, imageExtractor, ocrEngine). No file outside `src/lib/pdf/` imports any of them (verified: zero `@/lib/pdf/…`, `../pdf/…`, `./pdf/…` importers). Several other exports in this set are also dead — flagged inline and summarised at the bottom.

---

## `src/lib/assetVerificationReportGenerator.ts` (808 lines)

Generates Asset Register ↔ inspection-data verification PDFs via `pdfmake`, pulling styling/sections/branding from the **PDF Template Gateway** (`fetchPDFTemplate('asset_verification')`, `src/hooks/usePDFTemplateGateway` — see pdf-config doc).

| Export | Line | Kind | Notes |
|---|---|---|---|
| `ComparisonResult` | :74 | interface | `{ asset; inspectionMatch \| null; verified; ctMatch; breakerMatch; hasDiscrepancy }`. Mirror of `AssetComparisonTable.ComparisonResult`. |
| `InspectionComparisonResult` | :84 | type alias | `= ComparisonResult`. **Dead** — no importers. |
| `generateInspectionBasedReport(options)` | :140 | async fn | Primary generator. |
| `generateAssetVerificationReport(options)` | :466 | async fn | Legacy generator. **Dead** — no callers. |

**`generateInspectionBasedReport(options: InspectionGeneratorOptions)` → `Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }>`**
- Params: `options` = `{ siteName; clientName?; comparisonResults: ComparisonResult[]; stats{ total, verified, verifiedNoDiscrepancy, discrepancies, unverified, withImages }; companyLogoUrl? }`.
- Behavior: fetches template config; `console.log`s applied config; loads branding (`companyLogoUrl` → `imageUrlToBase64`, else `loadCompanyBranding`); builds cover page + KPI dashboard + summary stats table; conditionally renders (per `isSectionEnabled`) hand-built pdfmake tables — Verified (`electrical-meters`), Discrepancies (`water-meters`, repurposed), Unverified (`equipment`); mismatch cells get amber fill `#fef3c7`. Filename via `generateDocumentFilename('Asset_Verification', siteName)`. `complianceChecks` from `createComplianceResult({...})` for the preview dialog.
- Callers: `components/site/AssetComparisonTable.tsx`.
- ⚠️ NOTE: section ids are semantically mismatched to content (`water-meters` → discrepancies, `equipment` → unverified) — a template-gateway coupling quirk.

**`generateAssetVerificationReport(options: LegacyGeneratorOptions)` → `Promise<{ blob; filename }>`** (:466)
- Older shape using `matchType: 'matched'|'asset_only'|'subsection_only'`, `meterSerialMatch`/`ctRatioMatch`, `potentialAssetMatch`. Always renders all sections (no `isSectionEnabled` gating). **No callers.**

**`formatComparisonCell(assetValue, inspectionValue, matchStatus)` → `string`** (:447, internal): returns asset value, or `"<asset>\n(Insp: <inspection>)"` on mismatch.

---

## `src/lib/auth-audit.ts` (105 lines)

Thin client helper to log auth events to the `auth_events` table via the **`log-auth-event` Edge Function** (service-role write + JWT validation + per-IP rate-limit — see `05-edge-functions`). Fire-and-forget by design; failures are queued in `localStorage` (key `wm_auth_audit_retry_queue`, cap 50) and drained on next success and on module load.

| Export | Line | Kind |
|---|---|---|
| `AuthEventType` | :16 | union type — `login \| logout \| password_changed \| password_reset_requested \| magic_link_requested \| lockout \| mfa_enrolled \| mfa_unenrolled \| account_deleted \| account_email_changed \| user_created` |
| `AuthEventMetadata` | :29 | interface — `{ method?; reason?; error_code? }` |
| `recordAuthEvent(event_type, metadata={})` | :87 | fn (returns `void`) |

**`recordAuthEvent(event_type: AuthEventType, metadata?: AuthEventMetadata): void`**
- Side effects: invokes `supabase.functions.invoke("log-auth-event", { body })`; on success opportunistically drains the retry queue; on failure pushes `{event_type, metadata, queued_at}` to the localStorage queue (dev-only `console.warn`). Never throws / never blocks.
- Internals (module-private): `readQueue`/`writeQueue` (SSR-guarded, `slice(-50)`), `sendOne`, `drainQueue`. Module-load side effect at :83 drains the queue.
- Callers: `ClientPortalLayout`, `AppSidebar`, `SessionWatcher`, `ContractorPortalLayout`, `views/auth/{ResetPassword,SetPassword,Login,ForgotPassword}`, `views/MyProfile`.

---

## `src/lib/cacheUtils.ts` (113 lines)

Cache-clearing for the daily-logout flow.

| Export | Line | Signature | Purpose |
|---|---|---|---|
| `clearAllCaches()` | :14 | `→ Promise<void>` | Clears all app caches in parallel (`Promise.allSettled`), logging per-op success/failure. |

- `clearAllCaches` runs 4 private helpers concurrently: `clearIndexedDB` (deletes named DBs `wm_compliance_offline`, `wm_floor_plan_offline`; resolves on `onblocked`), `clearLocalStorage` (removes all keys except those starting with `supabase.auth.token`), `clearServiceWorkerCaches` (`caches.delete` all), `unregisterServiceWorkers`. Never rejects (each helper swallows).
- ⚠️ NOTE: `PRESERVED_KEYS` comment says auth token is cleared separately via `signOut`; the floor-plan offline DB name here (`wm_floor_plan_offline`) must stay in sync with `offlineFloorPlanDB.ts`.
- Caller: `components/SessionWatcher.tsx`.

---

## `src/lib/complianceCalculations.ts` (180 lines)

Single source of truth for COC compliance math (SANS 10142-1). Reads `coc_validations` directly via the browser supabase client.

| Export | Line | Kind |
|---|---|---|
| `SubsectionForCompliance` | :13 | interface — `{ id; is_coc_required?; coc_status?; metering_status?; meter_serial_number? }` |
| `ComplianceStats` | :21 | interface — `{ totalSubsections, cocRequiredCount, cocApprovedCount, meteringInstalledCount, cocComplianceRate, meteringComplianceRate }` |
| `VALID_COC_STATUSES` | :33 | const — `['Approved','Valid','Pass']` |
| `FAILED_VALIDATION_STATUSES` | :38 | const — `['Fail','Failed','Incomplete']` |
| `fetchFailedValidationsBySubsection(ids)` | :47 | async fn |
| `hasValidCocStatus(cocStatus)` | :88 | fn → `boolean` |
| `isSubsectionCocCompliant(subsection, failedSet)` | :103 | fn → `boolean` |
| `calculateCocComplianceStats(subsections, failedSet)` | :125 | fn → `ComplianceStats` |
| `calculateComplianceWithValidations(subsections)` | :172 | async fn |

- `fetchFailedValidationsBySubsection(ids: string[]) → Promise<Set<string>>`: queries `coc_validations` ordered by `validated_at` then `created_at` desc; keeps **only the most recent validation per subsection**; returns the set whose latest status ∈ `FAILED_VALIDATION_STATUSES`. Empty input → empty Set; on error logs + returns empty Set.
- `hasValidCocStatus(s)`: `false` for null/undefined, else membership in `VALID_COC_STATUSES`.
- `isSubsectionCocCompliant(sub, failedSet)`: not-required ⇒ `true`; in `failedSet` ⇒ `false`; else `hasValidCocStatus(coc_status)`.
- `calculateCocComplianceStats(subs, failedSet)`: COC rate = approved/required (100 if none required); metering installed if `metering_status==='Installed' || meter_serial_number` truthy; metering rate denominator is **`cocRequiredCount`** (not total). Pure.
- `calculateComplianceWithValidations(subs)` → `{ stats, failedValidationsBySubsection }`: convenience that fetches then computes. **Dead** — no callers.
- Callers: `ComplianceDashboard.tsx`, `views/Dashboard.tsx`, `views/SiteDetail.tsx` (stats); `isSubsectionCocCompliant` also in `views/PublicSubsection.tsx`.

---

## `src/lib/complianceReportGenerator.ts` (336 lines)

Regulatory compliance-overview PDF via pdfmake + Template Gateway (`fetchPDFTemplate('compliance')`).

| Export | Line | Kind |
|---|---|---|
| `ComplianceItem` | :36 | interface (`name, siteName?, cocNumber?, cocStatus?, cocType?, cocIssueDate?, expiryDate?, daysUntilExpiry?, isCompliant?, lastValidated?`) |
| `ComplianceReportData` | :50 | interface (`siteName?, clientName?, items[], stats{total,compliant,nonCompliant,expiringSoon,expired,pendingReview}, companyLogoUrl?`) |
| `ComplianceReportResult` | :65 | interface (`{ blob; filename }`) |
| `generateComplianceReport(data)` | :74 | async fn |

**`generateComplianceReport(data) → Promise<ComplianceReportResult>`**
- Loads branding via `loadCompanyBranding()` (ignores `data.companyLogoUrl`). Cover page; conditional sections via `isSectionEnabled`: `compliance-summary` (KPI dashboard + rate-colored text + stats table), `coc-status` (per-item table, only if `items.length>0`), `expiring-cocs` (items with `0 < daysUntilExpiry ≤ 90`, sorted asc, amber table, `URGENT` if ≤30), `non-compliant` (items with `isCompliant === false`, red table).
- Filename hand-built: `Compliance_Report_<site>_<YYYY-MM-DD>.pdf` (does **not** use `generateDocumentFilename`).
- ⚠️ NOTE: **Dead** — no callers found. Several percentage rows divide by `stats.total` without a zero guard (NaN%/Infinity% if `total===0`, though the summary section's `complianceRate` does guard).

---

## `src/lib/documentDesignStandards.ts` (478 lines)

Master design-standards constant object + report-geometry helpers. The constant is the de-facto style bible (logo sizing, A4 margins, type scale, colors, table/chart rules, export/preflight settings).

| Export | Line | Kind | Notes |
|---|---|---|---|
| `DOCUMENT_DESIGN_STANDARDS` | :9 | const object | Widely consumed: `pdfMakeUtils`, `pdfMakeConfig`, `pdfBranding`, `pdfEngine`, `pdfTemplates`, `pdfTemplateExporter`, `DocumentPreviewDialog`. Also `default` export (:478). |
| `getContentWidth()` | :330 | fn → `number` | `210 - left - right` (A4 mm). **No external callers.** |
| `getContentHeight()` | :338 | fn → `number` | A4 height minus margins/header/footer. **No external callers.** |
| `getSafeImageDimensions(w, h, maxW?, maxH?)` | :346 | fn → `{width,height}` | Aspect-preserving clamp. **No external callers.** |
| `shouldBreakPage(currentY, contentHeight, pageHeight=297)` | :372 | fn → `boolean` | **No external callers.** |
| `generateFooterText(currentPage, totalPages)` | :386 | fn → `string` | Fills `pageNumberFormat`. **No external callers.** |
| `generateDocumentFilename(documentType, siteName, date?)` | :396 | fn → `string` | `<type>_<site>_<YYYY-MM-DD>.pdf`, sanitized (`[^a-zA-Z0-9-_]→_`, 50-char cap). **Used** by `pdfMakeUtils`, `pdfEngine`, and `assetVerificationReportGenerator`. |
| `DESIGN_CHECKLIST` | :415 | const array | 12 design-task reference entries. **No external callers** (reference-only). |

---

## `src/lib/downloadHandoff.ts` (281 lines)

Opens a new top-level browser tab and hands off a PDF download to it — works around the in-app/iframe sandbox where the anchor `download` attribute is ignored. Also persists pending requests in a dedicated IndexedDB (`wm-download-handoff` / store `requests`) keyed by uuid, consumed by `views/DownloadHandoff.tsx`.

| Export | Line | Kind |
|---|---|---|
| `PendingDownloadHandoff` | :7 | interface — `{ id: string; windowRef: Window }` |
| `StoredDownloadHandoffRequest` | :12 | interface — payload + `{ createdAt; id }` |
| `getDownloadRequest(id)` | :170 | async fn → `StoredDownloadHandoffRequest \| null` |
| `deleteDownloadRequest(id)` | :192 | async fn → `void` |
| `createPendingDownloadHandoff()` | :210 | fn → `PendingDownloadHandoff \| null` |
| `completeDownloadHandoff(pending, payload)` | :228 | async fn → `void` |
| `openDownloadHandoffWindow(payload)` | :273 | async fn → `boolean` |

- `createPendingDownloadHandoff()`: `window.open('','_blank')`; null if pop-up blocked; renders a "Preparing…" spinner card; returns `{ id: crypto.randomUUID(), windowRef }`.
- `completeDownloadHandoff(pending, { fileName, blob?, url? })`: requires blob or url; throws if window already closed. URL path → `windowRef.location.replace(<url>?download=fileName)`. Blob path → renders "ready" card, sets `<a#download-link>` to a `createObjectURL` blob URL, auto-clicks after 120ms, revokes after 60s.
- `openDownloadHandoffWindow(payload) → boolean`: convenience = create + complete; `false` if pop-up blocked. **Only consumer is `fileDownload.downloadFile`** (no UI calls it directly).
- `getDownloadRequest` is called by `views/DownloadHandoff.tsx`; `deleteDownloadRequest`, `StoredDownloadHandoffRequest`, `putDownloadRequest` (private) appear write-paired but `putDownloadRequest` is **never invoked** — the IndexedDB store is read but never written here.
- Security NOTE: `renderHandoffWindow` HTML-escapes title/description/fileName (`escapeHtml`) before `document.write`, mitigating injection of the (developer-controlled) filename.

---

## `src/lib/fileDownload.ts` (219 lines)

Primary download entry points for generated PDFs / storage files. Resolves Supabase storage URLs via the SDK before downloading; routes through `downloadHandoff` for URL downloads. Uses `sonner` toasts.

| Export | Line | Signature | Purpose |
|---|---|---|---|
| `getDirectDownloadUrl(url, fileName)` | :140 | `→ string` | Appends `?download=<fileName>`. **Only used by `components/RobustImage.tsx`** (via `findCorrectImageUrl` path; actually RobustImage imports `findCorrectImageUrl`, not this — see note). |
| `downloadBlob(blob, fileName)` | :175 | `→ Promise<void>` | In-memory blob download. |
| `downloadFile(url, fileName)` | :197 | `→ Promise<void>` | URL download. |

- `downloadBlob(blob, fileName)`: shows loading toast; calls private `triggerBrowserDownload` which `window.open(blobUrl,'_blank')` then revokes after 60s. ⚠️ NOTE: despite the elaborate `showSaveFilePicker` (`saveBlobWithPicker`) and anchor helpers defined in the file, `downloadBlob` only uses `window.open` — `saveBlobWithPicker`, `buildSavePickerOptions`, `getMimeType` are **defined but unused** dead code.
- `downloadFile(url, fileName)`: first tries `openDownloadHandoffWindow({url,fileName})`; if handed off, done. Else `resolveDownloadBlob(url)` (private: parses `/storage/v1/object/(public|sign|authenticated)/...` → `supabase.storage.from(bucket).download(path)`, else plain `fetch`) then `downloadBlob`. Swallows `AbortError`.
- Callers (`downloadBlob`): `ComprehensiveInspectionReport`, `FortressMarkingChecklist`, `TemplateBasedReport`, `SiteDrawingReport`, `DocumentPreviewDialog`, `inspection-report/InspectionReportPreview`, `lib/wysiwygPdfGenerator`. Callers (`downloadFile`): `DocumentPreviewDialog`, `site/GenerateFinalReportButton`, `site/SiteReports`, `ClientPortalSiteDetail`, `SiteDetail`, `ClientPortalSubsectionDetail`, `PublicSubsectionReview`, `PublicSiteReview`.

---

## `src/lib/fileValidation.ts` (162 lines)

Client-side file size/type/name validation with `sonner` toasts on failure.

| Export | Line | Kind |
|---|---|---|
| `FILE_LIMITS` | :4 | const — `{ MAX_SIZE: 50MB, MAX_IMAGE_SIZE: 10MB, MAX_DOCUMENT_SIZE: 50MB }` |
| `ALLOWED_MIME_TYPES` | :11 | const — `{ images[], documents[], cad[] }` |
| `FileValidationOptions` | :42 | interface — `{ maxSize?; allowedTypes?; category? }` |
| `FileValidationResult` | :48 | interface — `{ valid; error?; file? }` |
| `validateFile(file, options={})` | :57 | fn → `FileValidationResult` |
| `validateFiles(files, options={})` | :111 | fn → `{ valid; validFiles[]; errors[] }` |
| `formatFileSize(bytes)` | :138 | fn → `string` |
| `isImageFile(file)` | :151 | fn → `boolean` |
| `isDocumentFile(file)` | :159 | fn → `boolean` |

- `validateFile`: checks size ≤ maxSize, MIME ∈ allowedTypes/category, and rejects suspicious filenames (regexes: `..`, `<script`, `.exe/.bat/.cmd/.com/.scr`). Each failure toasts + returns `{valid:false,error}`. ⚠️ NOTE: a client-side toast-driven check only — not a security boundary (no server enforcement here).
- `validateFiles`: maps over a FileList/array, aggregating valid files + per-file errors.
- Callers: `validateFile` in `hooks/useOfflineInspections.ts`, `hooks/useOfflineSubsections.ts`. `validateFiles`/`formatFileSize`/`isImageFile`/`isDocumentFile` — **no callers** (dead).

---

## `src/lib/floorPlanReportGenerator.ts` (448 lines)

Floor-plan inspection (pins/snags) PDF via pdfmake + Template Gateway (`fetchPDFTemplate('floor_plan')`).

| Export | Line | Kind |
|---|---|---|
| `FloorPlanReportResult` | :67 | interface — `{ blob; fileName; complianceChecks: PDFComplianceCheck }` |
| `generateFloorPlanReport(data)` | :77 | async fn |

**`generateFloorPlanReport(data: ReportData) → Promise<FloorPlanReportResult>`**
- `data` (private `ReportData`): `{ projectName, siteName, subsectionName, floorPlanUrl, pins: Pin[], canvasDataUrl? }`. `Pin` (:31) carries number/type/status/priority/title/notes/photos/contractor/comments/rectification fields.
- Behavior: splits pins into snags vs observations; computes status + priority + per-contractor breakdowns. Sections gated by `isSectionEnabled`: `pins-summary` (KPI row + status/priority/contractor tables), `floor-plan-image` (embeds `canvasDataUrl`), `pins-table` (summary table + one full detail page per pin: colored status header, info grid, before/after photo columns, description, notes, comments). `totalPins` floored at 1 to avoid /0.
- Builds doc via `buildDocument({...coverPage})` (no logo — `logoPlacement:false`); `logComplianceCheck('FloorPlanReport', …)`. Filename hand-built `Floor_Plan_Report_<subsection>_<date>.pdf`.
- Caller: `components/InteractiveFloorPlan.tsx`.

---

## `src/lib/fortressTemplate.ts` (361 lines)

Static factory returning the hard-coded "FORTRESS – Complete Compliance Inspection" template (8 sections, ~200 items) derived from `584_FORTRESS-SCOPE_OF_WORKS.docx`.

| Export | Line | Signature | Purpose |
|---|---|---|---|
| `generateFortressTemplate()` | :4 | `→ { name, category, description, sections[] }` | Returns the full template definition. Pure, no args, no I/O. |

- Each section: `{ id, name, order_index, items[] }`; each item: `{ id, name, type, required, options? }` where `type ∈ checkbox|textarea|number|text|image|select`. Sections: RMU, Miniature Substations, Main Distribution Boards, Earthing & Lightning, Electrical Meters, Line Shop Boards, Lighting & Power, Issue Resolution & Close-Out.
- Caller: `components/FortressMarkingChecklist.tsx`.
- NOTE: this is the template content companion to `pdfTemplates`/Template Gateway but is plain inspection-form scaffolding (not a PDF style template).

---

## `src/lib/imageNaming.ts` (278 lines)

Descriptive storage path builders + Supabase Storage rename/copy for inspection photos (bucket `inspection-photos`).

| Export | Line | Kind |
|---|---|---|
| `sanitizeForFileName(str)` | :11 | fn → `string` (strip specials, spaces→`_`, 50-char cap) |
| `ImagePathOptions` | :21 | interface |
| `generateInspectionImagePath(options)` | :32 | fn → `string` (`<inspId>/<sectionKey>/<itemKey>/<ts>[_<index+1>].<ext>`) |
| `TenantImagePathOptions` | :55 | interface |
| `generateTenantImagePath(options)` | :66 | fn → `string` (`<inspId>/tenants/<tenantId>/<field>/<ts>.<ext>`) |
| `extractPathFromUrl(url)` | :85 | fn → `string \| null` (matches `inspection-photos/(.+?)`) |
| `renameImage(oldPath, newPath)` | :99 | async fn → `{ success; newUrl?; error? }` |
| `renameInspectionImages(inspectionId, clientName, siteName, subsectionName, jsonData)` | :157 | async fn → `{ updatedJsonData; renamedCount; failedCount }` |

- `renameImage`: download (10s race timeout) → `upload(newPath, {upsert:false})` → `getPublicUrl` → fire-and-forget `remove(oldPath)`. Silent on missing files. ⚠️ Security NOTE: **direct client-side Storage copy/delete** — relies on bucket RLS; `as any` casts on the download race.
- `renameInspectionImages`: deep-clones `json_data`, walks sections/items renaming `photos[]` (skips already-renamed paths matching sanitized client+site), then walks `tenants[].{breakerImage,ctRatioImage,meterImage}`. Keeps original URL on failure.
- ⚠️ NOTE: comments/`ImagePathOptions` carry `clientName/siteName/subsectionName` but the **path builders ignore them** (only inspectionId/keys/timestamp used) — leftover from an abandoned descriptive-naming scheme.
- Callers: `generateInspectionImagePath` in `hooks/useOfflineSync.ts`, `views/InspectionDetail.tsx`; `renameInspectionImages` in `views/InspectionDetail.tsx`.

---

## `src/lib/imagePathFixer.ts` (226 lines)

Repairs broken `json_data` photo URLs by re-listing actual files in `inspection-photos` storage and **writing the corrected `json_data` back to the `inspections` table** (client-side update).

| Export | Line | Signature |
|---|---|---|
| `fixInspectionImagePaths(inspectionId)` | :7 | `→ Promise<{ fixed; updatedPaths; error? }>` |
| `fixAllSubsectionImagePaths(subsectionId)` | :167 | `→ Promise<{ inspectionsFixed; totalPathsFixed }>` |
| `fixAllInspectionImagePaths()` | :197 | `→ Promise<{ inspectionsProcessed; inspectionsFixed; totalPathsFixed }>` |

- `fixInspectionImagePaths`: fetch `json_data`; build section/item→URL map via private `getStorageFilesMap` (lists folders/subfolders, `id===null` heuristic for folders); for items whose current photos match a known-broken regex (`/\d+/\d+/\d+-\d+\.ext`), replace with listed files; if changed, `supabase.from('inspections').update({ json_data })`.
- `fixAllSubsectionImagePaths` / `fixAllInspectionImagePaths`: batch loops (the latter over all inspections with non-null `json_data`).
- ⚠️ NOTE: **All three exports are dead** (no callers). Security-relevant: a client-side bulk write across **all** inspections gated only by RLS — flagged for the security lens.

---

## `src/lib/imageUrlResolver.ts` (203 lines)

Resolve/repair Supabase storage image URLs and fetch-as-compressed-data-URL for PDF embedding.

| Export | Line | Signature | Notes |
|---|---|---|---|
| `extractStorageInfo(url)` | :6 | `→ { bucket; path; fileName } \| null` | Parses public/sign storage URLs. **No external callers.** |
| `findCorrectImageUrl(url)` | :33 | `→ Promise<string \| null>` | Lists folder, matches by `_<idx>` suffix (1-based) or falls back to sole image. **Used by `components/RobustImage.tsx`.** |
| `fetchImageWithFallback(url)` | :93 | `→ Promise<Blob \| null>` | `fetch` original; on fail try `findCorrectImageUrl`. **No external callers** (only internal). |
| `fetchImageAsDataUrl(url, maxWidth=800, quality=0.6)` | :197 | `→ Promise<string \| null>` | Fetch + canvas-compress to JPEG data URL. **No external callers** (dead). |

- ⚠️ NOTE: private `compressImage` (:123) is buggy — it sets `img.onload` **twice** (the first handler at :128 is immediately overwritten by the second at :163); harmless because the second wins, but the first block and the early `img.onerror` interplay are dead/confusing. Functionally it resizes to `maxWidth`, draws to canvas, returns `image/jpeg` data URL.

---

## `src/lib/pdf/advancedProcessor.ts` (371 lines) — ⚠️ ORPHANED MODULE

Unified PDF processing pipeline (pdfjs-dist worker from cdnjs CDN). **Nothing in the app imports it.**

| Export | Line | Kind |
|---|---|---|
| `ProcessingOptions` | :16 | interface (`maxPages?, enableOCR?, extractImages?, extractTables?, detectStructure?, ocrOptions?, imageOptions?`) |
| `DocumentSection` | :26 | interface (recursive sections) |
| `ProcessedDocument` | :36 | interface (pages, fullText, sections, tables, images, logo, ocrResults?, metadata, quality) |
| `processDocument(file, options?, onProgress?)` | :199 | async fn → `ProcessedDocument` |
| `quickExtractText(file, maxPages=10)` | :288 | async fn → `string` |
| `detectScannedDocument(file)` | :310 | async fn → `boolean` |
| `extractPageRange(file, start, end, options?)` | :344 | async fn → `PageTextContent[]` |
| re-exports (:369–371) | — | OCR/text/image types |

- `processDocument`: loads PDF → `extractDocumentContent` (text) → `extractMetadata` → optional per-page `processPageWithOCR` → optional `extractAllImages` + `extractCoverPageImages` (logo) → `detectSections` (private, header/bold heuristic by font size) → flatten tables → `calculateQualityMetrics`. Reports progress via `onProgress(stage, current, total)`.
- `quickExtractText`: raw `getTextContent().items.str` join, no structure.
- `detectScannedDocument`: samples up to 3 pages; "scanned" if text <100 chars + has paintImage ops on ≥ half.
- `extractPageRange`: dynamic-imports `extractPageContent` per page.

---

## `src/lib/pdf/imageExtractor.ts` (306 lines) — ⚠️ ORPHANED

Extract embedded images/logos from PDFs (pdfjs operator list + canvas). No external importers.

| Export | Line | Signature |
|---|---|---|
| `ExtractedImage` | :8 | interface (`id, pageNumber, dataUrl, width, height, x, y, type, sizeBytes, isLogo, isPhoto, isIcon`) |
| `ImageExtractionOptions` | :23 | interface |
| `extractImagesFromPage(page, pageNumber, options?)` | :122 | `→ Promise<ExtractedImage[]>` |
| `capturePageAsImage(page, pageNumber, scale=1.5)` | :206 | `→ Promise<ExtractedImage>` |
| `extractAllImages(pdf, options?, onProgress?)` | :247 | `→ Promise<ExtractedImage[]>` |
| `findDocumentLogo(pdf)` | :273 | `→ Promise<ExtractedImage \| null>` |
| `extractCoverPageImages(pdf)` | :292 | `→ Promise<{ logo; hero }>` |

- `extractImagesFromPage`: iterates `paintImageXObject`/`paintXObject` ops, fetches `page.objs.get(name)`, size-filters, classifies via private `classifyImage` (icon `<50px`, logo ≤300px + aspect 0.3–3, else photo if ≥200px), renders RGBA/RGB/grayscale → `imageDataToDataUrl` (canvas PNG). `x/y` always 0 (position not computed). `sizeBytes` approximated as `dataUrl.length*0.75`.
- `capturePageAsImage`: full-page `page.render` to canvas → PNG. `findDocumentLogo`/`extractCoverPageImages`: page-1 heuristics.

---

## `src/lib/pdf/ocrEngine.ts` (236 lines) — ⚠️ ORPHANED + STUBBED

Canvas-based OCR scaffolding. **No external importers** and the actual recognition is a **stub** (returns `[]`; comment says use Tesseract.js for production).

| Export | Line | Signature |
|---|---|---|
| `OCRResult` | :8 | interface (`text, confidence, boundingBox?`) |
| `OCRPageResult` | :19 | interface (`pageNumber, textBlocks[], fullText, processingTime`) |
| `OCROptions` | :26 | interface (`scale?, enhanceContrast?, removeNoise?, language?`) |
| `detectScannedPage(textContent, imageCount)` | :92 | fn → `boolean` (text <50 chars + has images) |
| `extractTextFromCanvas(canvas, options?)` | :104 | `→ Promise<OCRResult[]>` — **stub: always returns `[]`** after preprocessing |
| `renderPageToCanvas(page, scale=2)` | :131 | `→ Promise<HTMLCanvasElement>` |
| `processPageWithOCR(page, pageNumber, options?)` | :156 | `→ Promise<OCRPageResult>` |
| `batchProcessPagesWithOCR(pages, options?, onProgress?)` | :222 | `→ Promise<OCRPageResult[]>` |

- `processPageWithOCR`: prefers native text; if `detectScannedPage` true, renders + calls the stubbed `extractTextFromCanvas`, falling back to native text. Private preprocessing helpers: `convertToGrayscale`, `enhanceImageContrast`, `applyBinaryThreshold`.

---

## `src/lib/pdf/textExtractor.ts` (348 lines) — ⚠️ ORPHANED

Positional text extraction + table/column detection (pdfjs). No external importers.

| Export | Line | Signature |
|---|---|---|
| `TextBlock` | :8 | interface (text/x/y/w/h/fontSize/fontName/page/isHeader/isBold/column?) |
| `TextLine` | :22 | interface |
| `ExtractedColumn` | :29 | interface |
| `TableCell` | :36 | interface |
| `DetectedTable` | :44 | interface |
| `PageTextContent` | :52 | interface (blocks, lines, tables, columns, rawText, structuredText) |
| `extractTextBlocks(page, pageNumber)` | :70 | `→ Promise<TextBlock[]>` |
| `groupBlocksIntoLines(blocks)` | :104 | `→ TextLine[]` |
| `detectColumns(blocks)` | :171 | `→ ExtractedColumn[]` |
| `detectTables(lines)` | :219 | `→ DetectedTable[]` |
| `extractPageContent(page, pageNumber)` | :294 | `→ Promise<PageTextContent>` |
| `extractDocumentContent(pdf, maxPages?, onProgress?)` | :332 | `→ Promise<PageTextContent[]>` |

- `extractTextBlocks`: applies `pdfjsLib.Util.transform` to compute x/y/fontSize; `isHeader` if fontSize>14, `isBold` from fontName; sorts by y then x.
- `groupBlocksIntoLines`: groups by y within `LINE_TOLERANCE=3`; per-line `detectTableRow` (private: uniform gaps >20 + tabular pattern/≥3 cols).
- `detectColumns`: histogram of x starts, ≥2 significant columns. `detectTables`/`buildTable` (private): runs of ≥2 table rows → cell grid using first-row column boundaries (±10). `extractPageContent`: composes all + builds `structuredText` (column-aware if multi-column).

---

## Notable findings (NOTES lens)

- **Orphaned module set:** `src/lib/pdf/{advancedProcessor,imageExtractor,ocrEngine,textExtractor}.ts` — the entire PDF-ingestion/OCR pipeline has **zero importers** anywhere in `src/`. `ocrEngine.extractTextFromCanvas` is additionally a **stub** that always returns `[]`.
- **Dead exports (no callers):**
  - `assetVerificationReportGenerator`: `generateAssetVerificationReport` (legacy), `InspectionComparisonResult` type.
  - `complianceReportGenerator`: `generateComplianceReport` (entire module unused).
  - `complianceCalculations`: `calculateComplianceWithValidations`.
  - `fileValidation`: `validateFiles`, `formatFileSize`, `isImageFile`, `isDocumentFile`.
  - `imageUrlResolver`: `fetchImageAsDataUrl`, `fetchImageWithFallback`, `extractStorageInfo`.
  - `imagePathFixer`: **all three exports** (`fixInspectionImagePaths`, `fixAllSubsectionImagePaths`, `fixAllInspectionImagePaths`).
  - `documentDesignStandards`: `getContentWidth`, `getContentHeight`, `getSafeImageDimensions`, `shouldBreakPage`, `generateFooterText`, `DESIGN_CHECKLIST`.
- **Dead internal code:** `fileDownload` defines `saveBlobWithPicker`/`buildSavePickerOptions`/`getMimeType`/`getFileExtension` (File System Access path) but `downloadBlob` only `window.open`s them — the picker path is unreachable. `downloadHandoff.putDownloadRequest` is defined but never called (store is read-only here). `imageUrlResolver.compressImage` assigns `img.onload` twice.
- **Security-relevant client writes (gated only by RLS):** `imageNaming.renameImage`/`renameInspectionImages` (Storage copy+delete), `imagePathFixer.*` (bulk `inspections.json_data` update across all rows). `auth-audit` correctly routes through the `log-auth-event` Edge Function rather than writing `auth_events` directly. Heavy findings belong in `GAPS.md`/`SECURITY-FINDINGS`.
- **Template-gateway coupling quirk:** asset-verification report maps content to semantically-unrelated section ids (`water-meters`→discrepancies, `equipment`→unverified).
- **/0 guards:** `complianceReportGenerator` percentage rows divide by `stats.total` with no zero guard (NaN/Infinity if empty); `floorPlanReportGenerator` and `complianceCalculations` do guard.
- **Stale params:** `imageNaming` path builders accept `clientName/siteName/subsectionName` but ignore them.
