# V07 — subsection-detail-module

- Unit id: V07
- Slug: subsection-detail-module
- Spec mode: full
- Date: 2026-07-29
- Files: 9 (src/views/subsection-detail/)

## Unit header

**Unit purpose (as-is).** This unit is the decomposition of the admin SubsectionDetail page: one aggregate hook (`useSubsectionDetail`, 1,214 LOC) that owns all state, data fetching, realtime subscriptions, and mutation handlers for a single subsection, plus four tab bodies (Overview, Inspections, Documents, COC & Metering), a full-page create form, a dialogs component, a shared types file, and a barrel. The composition itself — tab shell, header, breadcrumbs, the shared delete-document dialog — lives outside the unit in `src/views/SubsectionDetail.tsx` (V01), which is the unit's only mount point.

**Module-level observations.**
- Single consumer: every runtime export is consumed exclusively through the barrel by V01 `src/views/SubsectionDetail.tsx:9-17` (grep-verified; the only other cross-unit reference is C17 `src/components/coc/CocCertificateList.tsx:5`, which imports `types.ts` directly by path, bypassing the barrel). Grep hits for the string `subsection-details` in `src/components/SiteSummaryReport.tsx:400`, `src/hooks/usePDFTemplateGateway.ts:93`, `src/lib/siteSummaryRenderSpec.ts:131-132`, and `src/lib/pdfTemplateTestRunner.ts:390` are PDF-section-id string literals, not imports of this unit.
- The delete-document confirmation dialog is NOT in this unit: `DocumentsTab` and `CocMeteringTab` only set `deleteDocumentId`; the confirm dialog is mounted at page level in V01 `SubsectionDetail.tsx:254-283`, with a comment explaining that inactive tabs unmount (`SubsectionDetail.tsx:251-253`).
- The tab components are mostly prop-fed, but two of them do their own network I/O: `OverviewTab` issues three direct `subsections` updates (requirement toggles), and `CocMeteringTab` contains two complete upload flows (pool routing via `poolRouteFile` and an inline metering upload straight to Storage + `subsection_documents`).
- Three different COC status/category rule sets coexist in the unit: `isCocCertificateCategory` from L09 (`useSubsectionDetail.ts:615`, `OverviewTab.tsx:69`), an inline category predicate (`useSubsectionDetail.ts:771-772`), and a local lowercase status vocabulary in `CocMeteringTab.tsx:92-95` distinct from `hasValidCocStatus` (L09) used in `OverviewTab.tsx:248,257,269`.
- Two storage-path conventions for the same `documents` bucket: the hook keys upload paths on the immutable category id (`useSubsectionDetail.ts:748-750`, with a comment giving the rationale), while `CocMeteringTab`'s inline metering upload keys on the category name (`CocMeteringTab.tsx:296`).
- No test file anywhere in the repo references any file in this unit (grep-verified over `*.test.ts`/`*.test.tsx`).

**External contract.** Via the barrel, the rest of the app (in practice, only V01) gets: `useSubsectionDetail()` returning an ~80-key state/handler object; the six components `OverviewTab`, `InspectionsTab`, `DocumentsTab`, `CocMeteringTab`, `CreateSubsectionForm`, `SubsectionDialogs`; and all types from `types.ts`. C17 additionally consumes the `SupabaseDocument` type directly.

---

## src/views/subsection-detail/index.ts

- Purpose: barrel that re-exports the unit's hook, six components, and all types.
- Public surface: named re-exports `useSubsectionDetail`, `OverviewTab`, `InspectionsTab`, `DocumentsTab`, `CocMeteringTab`, `CreateSubsectionForm`, `SubsectionDialogs` (index.ts:1-7) and `export type * from "./types"` (index.ts:8).
- Inputs & outputs: none of its own; pure re-export module. No stores touched.
- Dependencies: uses -> the eight sibling files only (index.ts:1-8). used by <- V01 admin-entity-views (`src/views/SubsectionDetail.tsx:17`, `from "./subsection-detail"`) — sole consumer (grep-verified).
- Side effects: none.
- Error handling: n/a.
- Tests: none found (grep-verified).
- Observed issues: none.
- ASSUMED: nothing.

## src/views/subsection-detail/types.ts

- Purpose: hand-written interfaces shared by the unit's hook and components.
- Public surface: seven exported interfaces — `SubsectionData` (types.ts:1-21, camelCase view-model incl. `inspections?: Record<string, any>`, `files?`, `snags?: any[]`), `SiteData` (23-26: `siteName`, `clientInfo?`), `CocDocData` (28-33), `SupabaseDocument` (35-47, snake_case row shape incl. `parent_document_id`), `DocumentCategory` (49-52: `id`, `name`), `EditFormData` (54-59: `name`, `tenant_name`, `category`, `is_coc_required`), `PendingDocumentForVerification` (61-65).
- Inputs & outputs: type-only; no runtime data, no stores.
- Dependencies: uses -> nothing (no imports). used by <- all seven sibling runtime files (`useSubsectionDetail.ts:12-18`, `OverviewTab.tsx:16`, `InspectionsTab.tsx:13`, `DocumentsTab.tsx:10`, `CocMeteringTab.tsx:14`, `CreateSubsectionForm.tsx:8`, `SubsectionDialogs.tsx:8`, `index.ts:8`) and C17 single-file-subdirs (`src/components/coc/CocCertificateList.tsx:5` imports `SupabaseDocument` via `@/views/subsection-detail/types`) — grep-verified.
- Side effects: none.
- Error handling: n/a.
- Tests: none found (grep-verified).
- Observed issues:
  - `CocDocData` (types.ts:28) and `PendingDocumentForVerification` (types.ts:61) have zero consumers anywhere in `src/` — the repo-wide grep matched only their declarations.
  - `SupabaseDocument` mixes snake_case row fields with optional COC columns, while `SubsectionData` is camelCase; both shapes are hand-maintained, parallel to the generated types in L19.
- ASSUMED: nothing.

## src/views/subsection-detail/useSubsectionDetail.ts

- Purpose: aggregate hook owning all state, fetching, realtime subscriptions, and mutation handlers for one subsection's detail page, keyed off route params.
- Public surface: `useSubsectionDetail(): object` (useSubsectionDetail.ts:20) — no parameters; returns an object of ~80 keys (useSubsectionDetail.ts:1108-1213) grouped as: route params (`clientId`, `siteId`, `subsectionId`, `navigate`), core data (`subsection`, `setSubsection`, `siteData`, `loading`, `activeTab`, `setActiveTab`, `actualClientId`, `isOnline`), document getters (`getSupabaseCocDocuments`, `getSupabaseEvaluationDocuments`, `getSupabaseMeteringDocuments`), metering state, documents/category state (incl. `previewDocument`), inspections state, edit-dialog state, delete-subsection state, snags (`snags`, `openSnagsCount`), computed flags (`hasSnags`, `hasIncompleteInspections`, `isNotCompliant`), `companyLogo`, and 17 handlers (`handleOpenEditDialog`, `handleCreateSubsection`, `handleSaveEdit`, `handleDeleteSubsection`, `handleSaveMeteringDetails`, `handleCreateCategory`, `handleDeleteCategory`, `handleDocumentUpload`, `handleDeleteDocument`, `handleUploadEvaluationReport`, `handleDownloadDocument`, `handleFixCategories`, `handleCreateInspection`, `handleDeleteInspection`, `handleFixTemplateLinks`, `fetchSupabaseDocuments`, `fetchSubsectionData`).
- Inputs & outputs:
  - In: route params `clientId`/`siteId`/`subsectionId` (21); query params `tab` (27), `create` (401); `File` objects from tab components; offline data via `useOfflineSubsections().getOfflineData(subsectionId)` (74).
  - Tables read: `subsections` (181-204 joined with `inspection_templates`, `sites`, `clients`; 219-223 full row; 412-416; 566-570), `inspections` (230-234; orphan fallback 248-252; 1053-1057), `sites` (297-301; 994), `document_categories` (89-93; 942-945), `subsection_documents` (131-135; 695-698; 842-846; 865-868; 930-934), `snags` (147-151), `settings` (`company_logo_url`, 319-322), `inspection_templates` (164-168).
  - Tables written: `subsections` insert/update/delete (439-451, 489-497, 542-545, 587-590), `document_categories` insert/delete (108-116, 640-644, 675-679, 713), `subsection_documents` insert/update/delete (774-784, 711, 883-886, 960-963), `inspections` insert/update/delete (1003-1017, 1035-1038, 1075-1078), and bulk child deletes across `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `document_categories` (531-537).
  - Storage: bucket `documents` — upload (752-754), getPublicUrl (763), remove (707, 789, 857, 880).
  - Auth: `supabase.auth.getUser()` (766).
  - Raw `fetch()` of a document URL for blob download (908).
  - No localStorage/IndexedDB keys touched directly (offline data goes through H02's hook); no env vars beyond `process.env.NODE_ENV` gating console output (used throughout, e.g. 83, 125, 140).
- Dependencies: uses -> `@/lib/navigation` (L13, line 2), `@/integrations/supabase/client` (L19, line 3), `sonner` + `date-fns` (external, 4-5), `@/lib/qrCodeGenerator` `generateAndUploadQRCode` (L16, line 6; def qrCodeGenerator.ts:12), `@/lib/subsectionStatus` `isSnagOpen` (L17, line 7), `@/lib/cocHierarchy` `isCocCertificateCategory` (L09, line 8), `@/lib/coc/uploadCocFiles` `uploadEvaluationReport` (L04, line 9; def uploadCocFiles.ts:40), `@/lib/siteHealth` `isInspectionCompleted` (L17, line 10), `@/hooks/useOfflineSubsections` (H02, line 11), `./types` (12-18). used by <- `index.ts:1` (barrel) → V01 `src/views/SubsectionDetail.tsx:10,20` (grep-verified; no other consumers).
- Side effects:
  - On mount (non-"new" id): sequential fetch chain `fetchSubsectionData → fetchCompanyLogo → fetchTemplates → fetchDocumentCategories → fetchSupabaseDocuments → fetchSnags` (341-349); if offline, `loadOfflineData()` with an info toast per available offline docs (75-78).
  - Subscribes three Supabase realtime channels — `snags-{id}`, `inspections-{id}`, `documents-{id}` — each refetching on any postgres_changes event (355-380); all removed in the effect cleanup (382-386).
  - `fetchDocumentCategories` inserts seven default categories when the subsection has none (97-120) — a read path that writes.
  - QR PNG regeneration fire-and-forget on create (457-464) and on rename (506-515) via L16.
  - Blob-URL creation + `window.open` + 60 s delayed revoke in `handleDownloadDocument` (910-916).
  - Toasts (sonner) on nearly every handler outcome.
- Error handling: uniform pattern — try/catch with `console.error` gated behind `NODE_ENV === 'development'` plus a sonner error toast; the read helpers (`fetchDocumentCategories` 124-126, `fetchSupabaseDocuments` 139-141, `fetchSnags` 158-160, `fetchTemplates` 172-174, `fetchCompanyLogo` 332-334, `loadOfflineData` 82-84) swallow errors silently in production (dev-only log, no toast, state left as-is). `fetchSubsectionData` toasts "Subsection not found" / "Failed to load subsection details" and returns early (206-228). `handleDocumentUpload` deletes the just-uploaded blob if the DB insert fails (786-790) and surfaces `error.message`/`error_description` in the toast (797-803). `handleDeleteDocument` warns (not errors) if the storage removal fails but the row delete proceeds (858-861), and refetches on overall failure (899). `handleDeleteSubsection` throws on the first failed child-table delete (539-540). `handleSaveMeteringDetails` surfaces `findError.message` in a toast (574).
- Tests: none found (grep-verified).
- Observed issues:
  - `qrCodeUrl` state (28) is set to `""`, then `null as any` (395), then the literal string `'generated'` via `generateQRCode` (404-406); it is never read and never returned from the hook (absent from 1108-1213).
  - `offlineDocuments`/`offlineFloorPlans` state (62-63) is populated by `loadOfflineData` (76, 80) but never returned from the hook; the only observable effect is the info toast (77).
  - `updateSubsection`, `uploadDocument`, `uploadFloorPlan` are destructured from `useOfflineSubsections()` (67) and never used anywhere else in the file (grep-verified in-file).
  - `handleDeleteSubsection` (526-558) deletes rows from six child tables plus `subsections` but removes no Storage objects; by contrast `handleDeleteCategory` (694-709) and `handleDeleteDocument` (853-881) remove blobs before/alongside row deletes.
  - Two different COC-category predicates in one file: `isCocCertificateCategory` (615) vs the inline `catName.includes('coc') && !catName.includes('validation') && !catName.includes('report')` (771-772).
  - `fetchSubsectionData` reads the same `subsections` row twice (joined select 181-204, then `select('*')` 219-223).
  - Orphan-inspection fallback (243-260) fetches every null-`subsection_id` inspection for the site and matches client-side on a normalized shop-number string.
  - Effect deps are `[subsectionId, isOnline]` (391): a connectivity flip re-runs the entire six-fetch chain and re-subscribes all three realtime channels.
  - `handleCreateInspection` fabricates a `firebase_id` locally (1001: `-${Date.now().toString(36)}${Math.random()...}`) and hardcodes `status: 'Pending'`, `priority: 'Medium'` (1012-1013).
  - `handleSaveMeteringDetails` performs an existence-check select before the update of the same id (566-577).
  - `handleFixCategories` (924-979) and `handleFixTemplateLinks` (1050-1096) update rows one-by-one in for-loops with per-row error logging only; the success toast in `handleFixCategories` reports the total scanned count (`documentsToFix.length`, 970), not the number actually matched/updated.
  - Untyped casts around columns absent from generated types: `(fullSubsection as any).coc_expiry_date`, `.coc_failure_reasons`, `.is_thermal_required`, `.is_inspection_required` (282-283, 288-289); `linkedTemplate` set via `as any` (216).
  - `handleDownloadDocument` (905-922) opens a blob URL in a new tab (`window.open`, 913) rather than downloading; the toast says "Downloading {fileName}" (917). The in-code comment states anchor download is blocked in iframe sandboxes (912).
  - `ensureEvaluationCategory` (633-651) and `handleCreateCategory` (671-673) both derive the next `order_index` by parsing the leading integer out of category names (`parseInt(cat.name.split(' ')[0])`).
- ASSUMED: the queried tables (`subsections`, `snags`, `qr_scans`, `inspection_items`, etc.) and the `documents` bucket exist with the referenced columns in the deployed schema (not re-verified against D01-D03 migrations in this pass); RLS outcomes for these authenticated queries were not verified.

## src/views/subsection-detail/OverviewTab.tsx

- Purpose: overview tab body — compliance alert, subsection detail card with inline requirement toggles and status badges, snag list with deep-link highlight, and preview cards for inspections, documents, and the COC.
- Public surface: named component `OverviewTab(props: OverviewTabProps): JSX.Element` (OverviewTab.tsx:39); `OverviewTabProps` (18-37) takes 18 props: `subsection`, `setSubsection`, `siteData`, `inspectionArray: [string, any][]`, `hasSnags`, `hasIncompleteInspections`, `isNotCompliant`, `openSnagsCount`, `snags: any[]`, `supabaseDocuments: any[]`, `subsectionId`, `siteId`, `clientId`, `actualClientId`, `editFormData`, `setEditFormData`, `setActiveTab`, `navigate`.
- Inputs & outputs: renders from props plus query param `snag` (59-60) used to scroll/highlight a snag row (74-81). Writes: three inline `supabase.from('subsections').update(...)` calls toggling `is_coc_required` (137-140), `is_thermal_required` (187-190), `is_inspection_required` (219-222), each followed by local `setSubsection` patching (144, 194, 226). Computes a two-dimension verdict via `computeSubsectionVerdict` (63-72). No storage buckets, no localStorage, no env vars beyond `NODE_ENV` log gating (148, 197, 229).
- Dependencies: uses -> C01 ui-kit (`badge`, `card`, `button`, `alert`, `tooltip`, lines 2-6), `lucide-react`/`date-fns`/`sonner` (external, 7-10), `@/lib/navigation` `useSearchParams` (L13, line 11), `@/lib/complianceCalculations` `hasValidCocStatus` (L09, line 12), `@/lib/siteHealth` `isInspectionCompleted` (L17, line 13), `@/lib/cocHierarchy` `isCocCertificateCategory`, `toCocDoc` (L09, line 14), `@/lib/subsectionCompliance` `computeSubsectionVerdict` (L17, line 15), L19 supabase client (line 9), `./types` (16). used by <- `index.ts:2` → V01 `SubsectionDetail.tsx:11,133-152` (grep-verified).
- Side effects: the three toggle mutations above (network writes from a presentational tab); DOM manipulation for the snag highlight — `querySelector`, `scrollIntoView`, add/remove `ring-2 ring-primary` classes with a 2.5 s timeout (76-80); success/error toasts per toggle.
- Error handling: each toggle wraps in try/catch → dev-only `console.error` + error toast; state is not patched on failure (147-150, 196-199, 228-231). No other failure paths — everything else is pure render.
- Tests: none found (grep-verified).
- Observed issues:
  - The verdict's `cocDocs` input filters `supabaseDocuments` on `d.category` (69), but the rows produced by `fetchSupabaseDocuments` carry `category_id` and no `category` field (useSubsectionDetail.ts:133), so rows from that fetch never pass the filter and `cocDocs` is `[]` for them.
  - The inspections preview badge hardcodes the label "Completed" for every inspection (421-423) regardless of `inspection.status`.
  - `FileText` is imported (7) and never used in the file (grep-verified in-file).
  - Two distinct compliance presentations render in the same card: the `computeSubsectionVerdict` badges (158-172) and a separate hand-rolled "Overall Status" IIFE chain (238-301) using `hasValidCocStatus` + metering + snags + inspections.
  - The COC card displays a synthesized filename `{subsection.name}.pdf` (470), not an actual document's `file_name`.
  - The `is_thermal_required` and `is_inspection_required` update payloads are cast `as any` (189, 221).
  - Snag list shows all snags when `highlightSnagId` is present, otherwise the first 5 (350, 374-376); the row status badge treats only the literal `'Open'` as red (367) while open-count logic elsewhere uses `isSnagOpen` (useSubsectionDetail.ts:157).
- ASSUMED: `computeSubsectionVerdict`'s semantics (installation/documentation dimensions) are as documented in L17 — its internals were not re-read in this pass beyond confirming the export signature (subsectionCompliance.ts:29).

## src/views/subsection-detail/InspectionsTab.tsx

- Purpose: inspections tab body — list of the subsection's inspections with per-row PDF report trigger and delete, a create-inspection dialog, and a "Fix Template Links" action.
- Public surface: named component `InspectionsTab(props: InspectionsTabProps): JSX.Element` (InspectionsTab.tsx:42); `InspectionsTabProps` (15-40) takes 24 props incl. `inspectionArray: [string, any][]`, `availableTemplates`, `linkedTemplate`, dialog open/date/template-selection state + setters, `fixingTemplates`, and handlers `handleCreateInspection`, `handleDeleteInspection`, `handleFixTemplateLinks`, plus `navigate`.
- Inputs & outputs: pure prop-driven render; no direct network or store access. Row click navigates to `.../inspections/{id}` with client-scoped or site-scoped base path (166-169). Passes filtered snags (non-`rectified`/`closed`, 200) and inspection metadata into `ComprehensiveInspectionReport` (187-201).
- Dependencies: uses -> C01 ui-kit (`button`, `card`, `badge`, `alert`, `input`, `label`, `dialog`, `select`, `alert-dialog`, lines 1-9), `lucide-react`/`date-fns` (external, 10-11), C14 reports-dashboards `ComprehensiveInspectionReport` (line 12), `./types` (13). used by <- `index.ts:3` → V01 `SubsectionDetail.tsx:12,156-181` (grep-verified).
- Side effects: none of its own — all mutations delegated to hook handlers; `e.stopPropagation()` wrappers isolate the report button and delete button from the row's navigation click (186, 206-208).
- Error handling: none locally; the delete confirm dialog invokes `handleDeleteInspection` (231) whose failure handling lives in the hook.
- Tests: none found (grep-verified).
- Observed issues:
  - `Badge` is imported (3) and never used in the file (grep-verified in-file).
  - Row title resolution prefers the template's name over the inspection's own title (175-178: `template?.name || inspection.title || inspection.type || 'Inspection'`).
  - The dialog's template `Select` displays `selectedTemplateId || linkedTemplate?.id` (106) — the linked template shows as selected even when `selectedTemplateId` is empty, matching the fallback in `handleCreateInspection` (useSubsectionDetail.ts:985).
  - The snag filter for the report compares lowercased status to `'rectified'`/`'closed'` inline (200) rather than using `isSnagOpen` (L17) used by the hook (useSubsectionDetail.ts:157).
- ASSUMED: `ComprehensiveInspectionReport`'s prop contract (accepting `inspectionData`, `snags`, `siteLogoUrl`, etc.) is as declared in C14 — not re-read in this pass.

## src/views/subsection-detail/DocumentsTab.tsx

- Purpose: documents tab body — category accordion with per-category document lists, upload dialog, create-category dialog, delete-category confirm, and "Fix Categories" action.
- Public surface: named component `DocumentsTab(props: DocumentsTabProps): JSX.Element` (DocumentsTab.tsx:37); `DocumentsTabProps` (12-35) takes 23 props: `supabaseDocuments`, `documentCategories`, upload state (`uploadingFile`, `uploadCategoryId`, `uploadFile` + setters), `setDeleteDocumentId`, `deletingDocumentId`, category-dialog state, `fixingCategories`, `setPreviewDocument`, and handlers `handleFixCategories`, `handleCreateCategory`, `handleDeleteCategory`, `handleDocumentUpload`, `handleDownloadDocument`.
- Inputs & outputs: pure prop-driven render; groups `supabaseDocuments` by `category_id` per category (100); no direct network or store access; upload dialog restricts file picker to `.pdf,.doc,.docx,.jpg,.jpeg,.png` (247).
- Dependencies: uses -> C01 ui-kit (`button`, `card`, `badge`, `input`, `label`, `accordion`, `dialog`, `alert-dialog`, lines 1-8), `lucide-react` (9), `./types` (10). used by <- `index.ts:4` → V01 `SubsectionDetail.tsx:13,194-217` (grep-verified).
- Side effects: none of its own; upload/create/delete all delegate to hook handlers; the delete-category confirm resolves the category name from props before calling `handleDeleteCategory` (285-288).
- Error handling: none locally; the create-category and upload forms are native `<form onSubmit>` wired to hook handlers that `preventDefault` (useSubsectionDetail.ts:662, 729).
- Tests: none found (grep-verified).
- Observed issues:
  - Delete-document has no confirm dialog in this file — the trash button only calls `setDeleteDocumentId(doc.id)` (173); the confirm lives in V01 `SubsectionDetail.tsx:254-283` (per the comment there about inactive tabs unmounting).
  - The accordion opens every category by default (`defaultValue={documentCategories.map(cat => cat.id)}`, 97).
  - The upload dialog's file input sets `required={!uploadFile}` (248) — required only until a file is chosen.
- ASSUMED: nothing.

## src/views/subsection-detail/CocMeteringTab.tsx

- Purpose: COC & metering tab body — plain-English COC status banner, per-certificate list with evaluation-report upload, pool-routed COC upload, metering serial/CT-ratio fields, metering document list, and an inline metering upload.
- Public surface: named component `CocMeteringTab(props: CocMeteringTabProps): JSX.Element` (CocMeteringTab.tsx:52); `CocMeteringTabProps` (24-50) takes 26 props incl. the three document getters (`getSupabaseCocDocuments`, `getSupabaseEvaluationDocuments`, `getSupabaseMeteringDocuments`, each `() => SupabaseDocument[]`), `onUploadEvaluationReport(parentCoc: {id, coc_number}, file: File): Promise<void>`, `setUploadingFile`, metering state + setters, `handleSaveMeteringDetails`, `fetchSupabaseDocuments`, `refetchSubsection`. Module-level constant `POOL_REASON_TEXT` (16-22, not exported).
- Inputs & outputs:
  - In: props; query param `focus=meter` focuses and scrolls to the meter input (81-86).
  - Out/stores: COC upload calls `poolRouteFile(siteId, file)` (145) — L04 handles the upload/routing; the metering upload writes directly to Storage bucket `documents` at path `{subsectionId}/{category.name}/{timestamp}-{sanitized}` (294-300) and inserts a `subsection_documents` row (310-319) with `uploaded_by: user?.id` from `supabase.auth.getUser()` (308).
- Dependencies: uses -> C01 ui-kit (`button`, `card`, `badge`, `alert`, `input`, `label`, lines 2-7), `lucide-react`/`sonner` (8-9), L19 supabase client (10), C17 `CocCertificateList` (11), L13 `useSearchParams` (12), L04 `poolRouteFile` (13; def poolUpload.ts:39, returns `{assignedSubsectionId, reason, ...}` per poolUpload.ts:12-14), `./types` (14). used by <- `index.ts:5` → V01 `SubsectionDetail.tsx:14,221-247` (grep-verified).
- Side effects: two upload flows with network I/O (pool route 138-160; direct metering upload 282-336); focus/scroll DOM effect (81-86); toasts throughout — pool routing distinguishes attached-here / attached-elsewhere / unmatched-with-reason via `POOL_REASON_TEXT` (146-152); resets `e.target.value` after both uploads (159, 327); triggers `fetchSupabaseDocuments()` and `refetchSubsection()` after pool upload (153-154).
- Error handling: pool upload catch toasts `error?.message || "Failed to upload COC document"` for 5 s and always clears `uploadingFile` + input value in `finally` (155-160). Metering upload catch dev-logs and toasts a generic "Failed to upload metering document" (328-330), clearing `uploadingFile` in `finally` (331-333); a storage-upload or insert error is thrown to that catch (302, 321).
- Tests: none found (grep-verified).
- Observed issues:
  - The metering upload silently does nothing when no category named exactly `'04 Metering'` exists — `if (meteringCategory)` has no else branch (285-334): the chosen file is discarded without any toast.
  - Its storage path is keyed on the category *name* (296) whereas the hook's `handleDocumentUpload` keys on the category *id* with a comment explaining renames would orphan name-keyed files (useSubsectionDetail.ts:748-750).
  - It inserts `uploaded_by: user?.id` without a null check (308, 318), unlike the hook's upload which throws "User not authenticated" (useSubsectionDetail.ts:766-767).
  - Neither upload in this file enforces a size cap; the hook's `handleDocumentUpload` enforces 50 MB (useSubsectionDetail.ts:734-737).
  - The metering flow sets then clears the shared `uploadCategoryId`/`uploadFile` dialog state as scratch space (287-288, 324-325) even though no dialog is involved.
  - `cocSummary` defines its own lowercase status vocabularies — `["pass","approved","valid"]`, `["fail","failed","rejected"]`, `"pending"` (92-94) — independent of `hasValidCocStatus` (L09) used in OverviewTab.
  - The metering inputs display `meterSerialNumber || subsection.meterSerialNumber || ''` (187) and `ctRatio || subsection.ctRatio || ''` (196): clearing the field to empty string falls back to showing the stored value.
  - `Trash2`/`Loader2` delete buttons only set `deleteDocumentId` (246); the confirm dialog is in V01 (`SubsectionDetail.tsx:254-283`).
- ASSUMED: `poolRouteFile`'s internal upload/assignment behavior (bucket, `coc_pool_files` flow) is as specified in L04 — only its exported signature and result shape were re-verified here (poolUpload.ts:12-14, 39).

## src/views/subsection-detail/CreateSubsectionForm.tsx

- Purpose: full-page creation form rendered when the route's subsection id is `"new"` — name, tenant, category picker, COC-required checkbox, create/cancel.
- Public surface: named component `CreateSubsectionForm(props: CreateSubsectionFormProps): JSX.Element` (CreateSubsectionForm.tsx:20); `CreateSubsectionFormProps` (10-18): `editFormData: EditFormData`, `setEditFormData`, `saving: boolean`, `clientId`, `siteId`, `handleCreateSubsection: () => void`, `navigate: (path: string) => void`.
- Inputs & outputs: pure prop-driven render; edits flow into the shared `editFormData` state; back/cancel navigate to `/clients/{clientId}/sites/{siteId}` or `/sites/{siteId}` (33-34, 119-120). No stores touched.
- Dependencies: uses -> C01 ui-kit (`button`, `card`, `input`, `label`, `select`, lines 1-5), `lucide-react` (6), L18 shared-utils `SUBSECTION_CATEGORIES`, `getCategoryIcon` (line 7; defs subsectionCategories.ts:23, 105), `./types` (8). used by <- `index.ts:6` → V01 `SubsectionDetail.tsx:15,35-47` (rendered when `hook.subsectionId === "new"`) — grep-verified.
- Side effects: none; creation is delegated to `handleCreateSubsection` (hook), which also fires QR generation and navigates to the new record (useSubsectionDetail.ts:456-468).
- Error handling: none locally; required-field validation happens inside `handleCreateSubsection` via toasts (useSubsectionDetail.ts:433-435) — the Create button is disabled only while `saving` (111), not on empty fields.
- Tests: none found (grep-verified).
- Observed issues:
  - Reuses the edit-dialog's `EditFormData` shape for creation; the same shared state instance backs both this form and the edit dialog (V01 passes `hook.editFormData` to both, SubsectionDetail.tsx:38, 290).
  - The COC-required control is a raw `<input type="checkbox">` (96-102) rather than a C01 checkbox component.
- ASSUMED: nothing.

## src/views/subsection-detail/SubsectionDialogs.tsx

- Purpose: page-level dialogs — edit-subsection dialog (category grid, name, tenant, COC-required radios), delete-subsection confirm, and the document preview dialog.
- Public surface: named component `SubsectionDialogs(props: SubsectionDialogsProps): JSX.Element` (SubsectionDialogs.tsx:28); `SubsectionDialogsProps` (10-26): `subsection`, edit-dialog state (`isEditDialogOpen`, `setIsEditDialogOpen`, `editFormData`, `setEditFormData`, `saving`, `handleSaveEdit`), delete-dialog state (`deleteSubsectionDialogOpen`, `setDeleteSubsectionDialogOpen`, `handleDeleteSubsection`), preview state (`previewDocument: {file_name, file_url} | null`, `setPreviewDocument`).
- Inputs & outputs: pure prop-driven render; the category picker renders `SUBSECTION_CATEGORIES` as hand-built radio-style buttons using each category's `icon` and `color` fields (59-80); COC-required is a hand-built yes/no radio pair (117-151); preview is delegated to `DocumentPreviewDialog` with `fileUrl`/`fileName` (195-200). No stores touched.
- Dependencies: uses -> C01 ui-kit (`button`, `input`, `label`, `dialog`, `alert-dialog`, lines 1-5), L18 `SUBSECTION_CATEGORIES` (6), C15 templates-documents `DocumentPreviewDialog` (7), `./types` (8). used by <- `index.ts:7` → V01 `SubsectionDetail.tsx:16,286-299` (grep-verified).
- Side effects: none; save/delete delegate to hook handlers.
- Error handling: none locally. Save is disabled when `saving` or `name`/`category` is empty (165); delete confirm calls `handleDeleteSubsection` directly (185).
- Tests: none found (grep-verified).
- Observed issues:
  - The delete confirmation text promises deletion of "all associated inspections, documents, snags, and QR codes" (179); the handler deletes rows in `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `document_categories`, and `subsections` (useSubsectionDetail.ts:531-545) and removes no Storage objects (document blobs or the QR PNG).
  - This edit dialog validates via disabled button (165), while the hook's `handleSaveEdit` re-validates with toasts (useSubsectionDetail.ts:478-479) — the create form takes the opposite approach (toast-only).
- ASSUMED: `DocumentPreviewDialog`'s prop contract (`open`, `onOpenChange`, `fileUrl`, `fileName`) is as declared in C15 — not re-read in this pass.
