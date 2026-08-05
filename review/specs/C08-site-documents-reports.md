# C08 — site-documents-reports

- Unit id: C08
- Slug: site-documents-reports
- Spec mode: full
- Date: 2026-07-29
- Files: 7

## Unit header

**Unit purpose (as-is).** This unit is the Documents/Reports/Images presentation layer of the admin Site Detail page: a unified site+subsection document browser with category grouping and bulk selection (SiteDocuments), three companion dialogs for create-category/upload/delete-category (DocumentDialogs), per-document history (DocumentHistoryDialog) and move-to-category (MoveDocumentsDialog), a saved-reports list with embedded report generators (SiteReports), a site image / client logo manager (SiteImages), and a report-section toggle dialog (ReportSettingsDialog). Five of the seven files are controlled components whose mutations live in the parent view; four files also hit Supabase directly from the component.

**Module-level observations (cross-file, all grep-verified).**
- The only importer of any file in this unit is `src/views/SiteDetail.tsx` (V01 admin-entity-views): it mounts SiteDocuments (SiteDetail.tsx:14, 800), SiteReports (17, 851), DocumentDialogs (19, 857), MoveDocumentsDialog + `MoveDoc` type (37, 865), DocumentHistoryDialog (38, 872).
- Two files have zero importers anywhere in `src`/`supabase`: `ReportSettingsDialog.tsx` and `SiteImages.tsx` (grep-verified; see per-file sections).
- Two report-category name lists coexist: `SiteReports.tsx:43-51` hardcodes 7 names (including `'Compliance Reports'`), while the L05 single-source list `src/lib/documents/reportCategories.ts:5-15` has 9 names (no `'Compliance Reports'`; adds `'Site Drawing Reports'`, `'Marking Checklists'`, `'Generated Reports'`). MoveDocumentsDialog consumes the L05 helper (MoveDocumentsDialog.tsx:6); SiteReports uses its own local list.
- Two exported interfaces named `ReportSection` exist in the codebase with different shapes: `src/components/site/ReportSettingsDialog.tsx:28` (this unit) and `src/components/pdf-editor/types.ts:19` (C04). Every `ReportSection` import in the codebase resolves to the C04 one (grep-verified); the C08 one is imported nowhere.
- Direct Supabase access from this presentational unit: `activity_logs` read (DocumentHistoryDialog.tsx:26), `document_categories` read (MoveDocumentsDialog.tsx:43), `sites` update (SiteImages.tsx:94-97, 165-168), `site_documents` read+delete and storage bucket `documents` remove (SiteReports.tsx:65-70, 97, 101-104).
- No test file anywhere references any of the 7 components (grep across `*.test.ts`/`*.test.tsx`: zero hits).

**External contract.** The rest of the app (concretely: V01 SiteDetail) gets: a props-driven document browser emitting 14 callbacks for all mutations; three fully controlled dialogs for the category/upload/delete flows; a self-fetching history dialog keyed on `documentId`; a move dialog that resolves the target category itself and emits `(targetId, targetName)`; a self-fetching reports tab that embeds C14 SiteSummaryReport, C07 BulkInspectionReportGenerator and C15 DocumentPreviewDialog; and (currently unmounted) a site-image manager and a report-section settings dialog.

---

## src/components/site/DocumentDialogs.tsx

- Purpose: Renders the three modal flows for site-document category management — create category, upload documents to a category, and confirm category deletion — with all state and submission owned by the parent.
- Public surface:
  - `DocumentDialogs(props: DocumentDialogsProps): JSX.Element` (DocumentDialogs.tsx:25). Props (8-23): `createCategoryOpen: boolean`, `setCreateCategoryOpen(open: boolean)`, `newCategoryName: string`, `setNewCategoryName(name: string)`, `onCreateCategory(e: React.FormEvent)`, `uploadCategoryId: string | null`, `setUploadCategoryId(id: string | null)`, `uploadFiles: File[]`, `setUploadFiles(files: File[])`, `onUploadDocument(e: React.FormEvent)`, `deleteCategoryId: string | null`, `setDeleteCategoryId(id: string | null)`, `onDeleteCategory(id: string, name: string)`, `categories: Array<{id: string, name: string}>`.
  - `DocumentDialogsProps` interface itself is not exported (8).
- Inputs & outputs: All data in via props; outputs are callback invocations only. Upload dialog opens when `uploadCategoryId !== null` (76); delete AlertDialog opens when `deleteCategoryId !== null` (123). File input accepts `.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg`, multiple (94-95), `required` only while `uploadFiles` is empty (97). No tables, buckets, storage keys, or env vars touched.
- Dependencies: uses -> `@/components/ui/{dialog,alert-dialog,button,input,label}` (C01, lines 1-5), `lucide-react` (6). used by <- V01 admin-entity-views (`src/views/SiteDetail.tsx:19` import, `:857` mount) — only consumer (grep-verified).
- Side effects: None in this file; forms submit to parent handlers (`onSubmit={onCreateCategory}` 50, `onSubmit={onUploadDocument}` 87). Closing the upload dialog resets both `uploadCategoryId` and `uploadFiles` via the setters (76-81, 107-110).
- Error handling: None — no async code, no try/catch. The delete action looks up the category and calls `onDeleteCategory` only if found (135-136); if not found, the click does nothing.
- Tests: none found (grep-verified; no test file references `DocumentDialogs`).
- Observed issues:
  - Upload dialog copy states "max 50 MB each" (85) but this file performs no size check; the parent's `handleUploadDocument` validates per file via `validateUploadFile` (SiteDetail.tsx:557), backed by `FILE_LIMITS.MAX_SIZE = 50 * 1024 * 1024` (src/lib/fileValidation.ts:5, L12).
  - Delete confirm uses the non-null assertion `deleteCategoryId!` (136) inside a `category &&` guard keyed on the same id (135); when the id is absent from `categories` the confirm silently no-ops while the dialog closes via `onOpenChange` (123).
  - The upload dialog never shows which category is being uploaded to; `uploadCategoryId` is used only as the open flag (76).
- ASSUMED: The intent link between the "50 MB" copy and the L12 constant (both values verified individually; the copy is hardcoded text, not derived from the constant).

## src/components/site/DocumentHistoryDialog.tsx

- Purpose: Self-fetching dialog that lists rename/move/delete audit entries for one document by substring-matching the `activity_logs.details` column.
- Public surface: `DocumentHistoryDialog({ open, onOpenChange, documentId, documentName }): JSX.Element` (19); props interface (5-10): `open: boolean`, `onOpenChange(open: boolean)`, `documentId: string | null`, `documentName: string`. Local (unexported) `LogRow` (11) and `ACTION_LABEL` map (13-17) covering `document_renamed`/`document_moved`/`document_deleted`.
- Inputs & outputs: In: `documentId` + `open` trigger the fetch (23-31). Out: rendered rows `{action label, user_email, created_at}` (43-48). Stores: reads table `activity_logs` — `select("id, action, user_email, created_at, details")`, `.ilike("details", '%"document_id":"<documentId>"%')`, ordered `created_at` desc (26-29). No writes.
- Dependencies: uses -> `react` (1), `@/components/ui/dialog` (C01, 2), `@/integrations/supabase/client` (L19, 3). used by <- V01 admin-entity-views (`src/views/SiteDetail.tsx:38` import, `:872` mount) — only consumer (grep-verified).
- Side effects: One Supabase network read per `open`/`documentId` change while open (23-31). `loading` state toggled around it. No cleanup/cancellation of the in-flight promise.
- Error handling: The `.then` destructures only `{ data }` (30); a query error yields `data == null` → `rows = []` and the UI shows "No recorded changes." (42). No throw, no toast.
- Tests: none found (grep-verified).
- Observed issues:
  - Query errors are indistinguishable from an empty history — error object never read (30), failure renders as "No recorded changes." (42).
  - `details` is selected (27) but never rendered (43-48).
  - Matching is a text `ilike` over a JSON fragment with `documentId` interpolated straight into the pattern (28). The rows it matches are written by L05 `documentMutations.ts` — `logDocumentActivity` inserts into `activity_logs` (documentMutations.ts:31) with actions `document_renamed`/`document_moved`/`document_deleted` (77, 108, 132), exactly the three keys in `ACTION_LABEL` (13-17).
- ASSUMED: That `activity_logs.details` is a text/JSON-string column in the live schema (inferred from the `ilike` usage and the L05 insert; column type not checked in migrations).

## src/components/site/MoveDocumentsDialog.tsx

- Purpose: Dialog for moving one or more selected documents to another non-system category, self-loading subsection categories when the selection is subsection-scoped and blocking mixed selections.
- Public surface:
  - `export interface MoveDoc` (8-18): `{ id: string; file_name: string; file_url: string; source: "site" | "subsection"; site_id: string | null; subsection_id: string | null; category_id: string | null; category_name: string; coc_number: string | null }`.
  - `MoveDocumentsDialog({ open, onOpenChange, docs, siteCategories, onConfirm }): JSX.Element` (29); props (21-27): `open: boolean`, `onOpenChange(open: boolean)`, `docs: MoveDoc[]`, `siteCategories: Cat[]` where `Cat = { id; name; is_system? }` (19, unexported), `onConfirm(targetId: string, targetName: string)`.
- Inputs & outputs: In: `docs` + `siteCategories`. Out: `onConfirm(targetId, targetName)` then closes (88-91). Stores: reads table `document_categories` (`id, name, is_system`) filtered by `subsection_id`, ordered `order_index`, only when open with a single-subsection selection (40-44). Target options exclude `is_system` categories for both sources (49-52).
- Dependencies: uses -> `react` (1), `@/components/ui/{dialog,button,select}` (C01, 2-4), `@/integrations/supabase/client` (L19, 5), `isSystemReportCategory` from `@/lib/documents/reportCategories` (L05, 6). used by <- V01 admin-entity-views (`src/views/SiteDetail.tsx:37` — imports both the component and `type MoveDoc`; mount at `:865`) — only consumer (grep-verified).
- Side effects: One Supabase read per effect run when `open && source === "subsection" && subsectionIds.size === 1` (38-45); `setTargetId("")` runs on every effect execution (39). Warning banners computed from selection: COC warning when any doc has `coc_number` or `/coc/i` matches `category_name` (54, 80); report warning when any `category_name` is a system report category (55, 81). `blocked` (mixed source or multiple subsections, 34-36, 56) replaces the picker with an explanatory message (66-71) and disables Move (87).
- Error handling: Category fetch destructures only `{ data }` with `?? []` fallback (44) — errors silently produce an empty option list. Move button no-ops if the chosen target id is no longer in `options` (89-90).
- Tests: none found (grep-verified).
- Observed issues:
  - Effect deps are `[open, source]` with `react-hooks/exhaustive-deps` disabled (46-47); `subCats` from a previous open persists until the next fetch resolves, and a fetch error leaves options empty with no signal (44).
  - The COC warning heuristic fires for any category whose name matches `/coc/i` (54), independent of `coc_number`.
- ASSUMED: That the parent enforces the same single-source/single-subsection constraint at execution time (blocking here is render-level only; `docs` arrive pre-selected from the parent).

## src/components/site/ReportSettingsDialog.tsx

- Purpose: Dialog of grouped on/off switches for Site Overview Report sections, plus a factory returning the default 16-section configuration.
- Public surface:
  - `export interface ReportSection` (28-35): `{ id: string; title: string; description: string; enabled: boolean; icon: React.ReactNode; category?: 'cover' | 'overview' | 'details' | 'annexes' }`.
  - `export const ReportSettingsDialog: React.FC<ReportSettingsDialogProps>` (51); props (37-42): `open: boolean`, `onOpenChange(open: boolean)`, `sections: ReportSection[]`, `onSectionToggle(sectionId: string, enabled: boolean)`.
  - `export const getDefaultReportSections = (): ReportSection[]` (135) — returns 16 entries: 6 `cover`, 4 `overview`, 4 `details`, 2 `annexes`; all `enabled: true` except `coc-annexes` (`enabled: false`, 267).
- Inputs & outputs: Purely props in / `onSectionToggle` out. Sections are grouped by `category` with fallback `'overview'` (58-63) and rendered in fixed order `cover, overview, details, annexes` (65, 82). No tables, buckets, storage, or env vars.
- Dependencies: uses -> `react` (1), `@/components/ui/{dialog,switch,label,scroll-area,separator}` (C01, 2-12), `lucide-react` (13-26). used by <- none found (grep-verified: no file imports `ReportSettingsDialog`, `getDefaultReportSections`, or this file's `ReportSection`; every `ReportSection` import in the codebase resolves to `src/components/pdf-editor/types.ts:19`, C04).
- Side effects: None. No network, no storage, no subscriptions.
- Error handling: None present; nothing can fail beyond React rendering.
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers for all three exports (grep-verified) — the whole file is unconsumed.
  - The exported `ReportSection` name collides with the differently-shaped C04 interface (`src/components/pdf-editor/types.ts:19`: `type/enabled/order/...`), and only the C04 one is consumed elsewhere. (Phase 1 note `review/inventory/08-src-components.md:335` states "Both are consumed"; grep in this pass finds no consumer of the C08 one.)
  - Each default section embeds a rendered JSX element as `icon` (e.g. 142, 150), so the default config carries React elements rather than serializable data.
  - Comment at 134 cites `SITE_SUMMARY_REPORT_REVIEW.md`; the file exists at `docs/SITE_SUMMARY_REPORT_REVIEW.md` (verified via find).
- ASSUMED: Nothing — all statements grep/file-verified.

## src/components/site/SiteDocuments.tsx

- Purpose: Presentational browser that merges site-level and subsection documents into one filterable, groupable, multi-selectable accordion list with inline rename for documents and categories, delegating every mutation to callback props.
- Public surface:
  - `SiteDocuments(props: SiteDocumentsProps): JSX.Element` (97). Props interface (64-84), 19 props total: data — `documents: SiteDocument[]`, `categories: SiteDocumentCategory[]`, `subsectionDocuments?: SubsectionDocument[]` (default `[]`), `subsections?: {id; name}[]` (default `[]`), `canManage?: boolean` (default `false`); callbacks (14) — `onDeleteDocument(id, name, source: "site"|"subsection")`, `onPreview(url, name)`, `onDownload(url, name)`, `onUploadClick(categoryId)`, `onCreateCategory()`, `onDeleteCategory(id, name)`, `onBulkDeleteCategories?()`, `onBulkDeleteDocumentsInCategory?(categoryId, categoryName)`, `onRenameDocument(doc: UnifiedDocument, newName)`, `onMoveDocuments(docs: UnifiedDocument[])`, `onDeleteDocuments(docs: UnifiedDocument[])`, `onViewHistory(doc: UnifiedDocument)`, `onRenameCategory(categoryId, newName)`, `onReorderCategory(categoryId, direction: "up"|"down")`.
  - Local unexported interfaces: `SiteDocument` (13-23), `SubsectionDocument` (25-37), `SiteDocumentCategory` (39-44), `UnifiedDocument` (47-62), plus private `EmptyDocumentsState` (485) and `formatMeta` (86-95).
- Inputs & outputs: In: the four data arrays. Out: callback invocations carrying `UnifiedDocument` values built at 128-172 (site docs get `subsection_name: "Site-Level"`, `subsection_id: null`, `coc_number: null` at 139-146; subsection docs get `site_id: null` at 161). Local UI state only (`useState` at 118-125): search, subsection filter, groupBy, `selectedIds: Set<string>`, inline-edit ids/values. No tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `react` (1), `@/components/ui/{card,button,input,accordion,badge,checkbox,dropdown-menu,select,toggle-group}` (C01, 2-11), `lucide-react` (5). used by <- V01 admin-entity-views (`src/views/SiteDetail.tsx:14` import as `SiteDocumentsComponent`, `:800` mount) — only consumer (grep-verified; `siteDocuments` hits in `src/views/PublicSiteReview.tsx:122,207` are a local state variable, not this component — no import present).
- Side effects: None outside React state. Behavior facts: search matches file name, category name, or subsection name (178-184); the subsection filter has `all` / `site-level` / per-subsection options (299-311); grouping is by `category_name` or `subsection_name` with "Site-Level" sorted first in subsection mode (223-227); bulk bar shows when `canManage` and selection non-empty (341), Move disabled for mixed site/subsection selections (344-346), Delete clears selection after invoking (350) while Move does not (346); per-category kebab menu (upload/rename/reorder/empty/delete) renders only when `canManage`, grouped by category, and the category is not `is_system` (398); system categories show a lock badge (392-394); accordion `defaultValue={[]}` — all groups start collapsed (359).
- Error handling: None — no async work. `commitRename` ignores empty/whitespace names (255-259); category rename likewise trims and skips empty (372, 375).
- Tests: none found (grep-verified).
- Observed issues:
  - `UnifiedDocument` is module-private (47) yet is the parameter type of four callback props (78-81); external code cannot import the type it must handle.
  - Grouping and the system-badge lookup key by category NAME (`category_name` at 204, `categoryByName` map at 236); two categories sharing a name merge into one group/map entry.
  - `startRename` strips the extension (251-252) and `commitRename` emits the base name only (255-257); nothing in this file re-appends the extension (the parent routes it to L05 `renameDocument`, SiteDetail.tsx:585-586).
  - `selectedIds` is never pruned when the document arrays change; stale ids simply stop matching in `selectedDocs` (244-247) but remain in the set.
- ASSUMED: That extension preservation happens inside L05 `renameDocument` (parent call verified at SiteDetail.tsx:586; the L05 implementation itself not re-read in this pass).

## src/components/site/SiteImages.tsx

- Purpose: Card UI for viewing, capturing/uploading, and deleting a site's main image and client logo, with inline "legacy URL" detection that clears non-Supabase URLs directly in the `sites` table.
- Public surface: `export const SiteImages: React.FC<SiteImagesProps>` (23); props (12-21): `site: Site`, `siteId: string`, `imagePreview: { site_image?: string; client_logo?: string }`, `setImagePreview: React.Dispatch<...>`, `handleImageUpload(file: File, imageType: 'site_image' | 'client_logo'): Promise<void>`, `handleDeleteImage(imageType): Promise<void>`, `uploadingImage: 'site_image' | 'client_logo' | null`, `fetchSiteData(): void`.
- Inputs & outputs: In: `site.site_image_url` / `site.client_logo_url` (L22 `Site`, src/types/site.ts:12-13) and the preview map. Out: calls to `handleImageUpload`/`handleDeleteImage`/`fetchSiteData`/`setImagePreview`. Stores: UPDATE on table `sites` setting `site_image_url = null` (94-97) or `client_logo_url = null` (165-168) for the legacy-URL "Clear & Upload New" buttons. No storage-bucket access in this file (upload/delete delegated to props).
- Dependencies: uses -> `react` (1), `@/components/ui/{card,button,badge,alert-dialog}` (C01, 2-7), `Site` from `@/types/site` (L22, 6), `@/integrations/supabase/client` (L19, 8), `toast` from `sonner` (9), `useCamera` from `@/hooks/useCamera` (H02, 10 — `takePicture(options): Promise<File | null>`, useCamera.ts:177). used by <- none found (grep-verified: no file imports `SiteImages` or `components/site/SiteImages`).
- Side effects: `onCaptureImage` (36-58) calls `takePicture({ preferCamera: false })`, builds a data-URL preview via `FileReader`, stores it in `imagePreview`, then awaits `handleImageUpload`. Legacy-clear buttons issue the `sites` UPDATE, fire `toast.success`, and call `fetchSiteData` (94-100, 165-171). Delete goes through a confirm AlertDialog (217-240) then `handleDeleteImage` (228-233).
- Error handling: `onCaptureImage` try/catch logs `console.error` and removes the preview entry for that type (50-57). The two `sites` UPDATE awaits never check the returned `error`; `toast.success("Legacy URL removed…")` fires unconditionally (94-99, 165-170).
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers (grep-verified) — the component is unmounted app-wide.
  - Legacy detection is asymmetric: site image is "legacy" if the URL contains `firebasestorage.googleapis.com`, `storage.googleapis.com`, or does NOT contain `supabase.co/storage` (84-86); client logo is "legacy" only for `firebasestorage.googleapis.com` (157), and its delete button renders only when the URL contains `supabase.co/storage` (184).
  - DB update outcomes unchecked; success toast regardless of result (94-99, 165-170).
  - Receives both `site` (which has `id`, src/types/site.ts:2) and a separate `siteId` prop (13-14); the UPDATEs use `siteId` (97, 168).
- ASSUMED: That upload/delete storage side effects (bucket, path) live in the parent's `handleImageUpload`/`handleDeleteImage` (props are opaque here; no parent currently exists since the file has no importers).

## src/components/site/SiteReports.tsx

- Purpose: Reports tab combining two embedded generators (site summary, bulk inspection) with a self-fetching, searchable list of saved report documents supporting preview, download, and delete.
- Public surface: `export const SiteReports: React.FC<SiteReportsProps>` (53); props (28-32): `site: Site`, `readOnly?: boolean` (default `false`), `autoOpenGenerate?: boolean`. Local unexported: `SavedReport` (34-40), `REPORT_CATEGORIES` (43-51), `getCategoryColor` (127-135).
- Inputs & outputs: In: `site` (uses `site.id`, `site.name`, `site.clients?.name`, `site.client_logo_url` at 166-180). Out: rendered list; passes `fetchReports` as refresh callback to both generators (`onSaved` 169, `onComplete` 181). Stores: reads table `site_documents` (`id, file_name, file_url, category, created_at`) where `site_id = site.id` AND `category IN REPORT_CATEGORIES`, ordered `created_at` desc (65-70); delete removes the storage object from bucket `documents` when `file_url` contains `supabase.co/storage` (path = segment after `/documents/`, query-string stripped, 94-98) then deletes the `site_documents` row (101-104).
- Dependencies: uses -> `react` (1), `@/components/ui/{card,button,badge,input,tabs}` (C01, 2-6), `SiteSummaryReport` (C14, 7), `BulkInspectionReportGenerator` (C07, 8), `DocumentPreviewDialog` (C15, 9 — takes `open/onOpenChange/fileUrl/fileName`, DocumentPreviewDialog.tsx:34-38), `Site` from `@/types/site` (L22, 10), `@/integrations/supabase/client` (L19, 11), `downloadFile` from `@/lib/fileDownload` (L12, 12 — `downloadFile(url, fileName): Promise<void>`, fileDownload.ts:229), `sonner` (13), `date-fns` (14), `lucide-react` (15-26). used by <- V01 admin-entity-views (`src/views/SiteDetail.tsx:17` import, `:851` mount passing `autoOpenGenerate={searchParams.get('generate') === '1'}`); comment-only mention in V06 site-coc-tab (`src/views/site-coc/ReportSubTab.tsx:84` "Mirrors SiteReports.handleDeleteReport."). No other consumers (grep-verified).
- Side effects: Fetch on mount and on `site.id` change (82-84); manual Refresh button re-fetches (200-210, hidden when `readOnly`). Delete flow: `window.confirm` (87), storage remove (97), row delete (101-104), success toast, optimistic list filter (108-109). Preview opens C15 dialog (275, 314-319); download delegates to L12 (285). `readOnly` hides generator tabs (140), refresh (200), and delete (290).
- Error handling: `fetchReports` try/catch — `console.error` + `toast.error("Failed to load reports")`, `loading` cleared in `finally` (74-79). `handleDeleteReport` try/catch — `console.error` + `toast.error("Failed to delete report")`, `deleting` cleared in `finally` (110-115); the storage `remove` result at 97 is not inspected (supabase storage calls resolve `{data, error}` — a storage failure does not enter the catch), so the row delete proceeds regardless.
- Tests: none found (grep-verified).
- Observed issues:
  - `autoOpenGenerate` is declared (31) and supplied by SiteDetail.tsx:851 but never destructured or read — the component body binds only `site` and `readOnly` (53).
  - Local `REPORT_CATEGORIES` (43-51) diverges from L05 `SYSTEM_REPORT_CATEGORIES` (reportCategories.ts:5-15): it contains `'Compliance Reports'` (absent from L05) and omits `'Site Drawing Reports'`, `'Marking Checklists'`, `'Generated Reports'` — documents saved under those three L05 names do not match the `.in()` filter (69) and never appear in this view.
  - Filtering is on the text `category` column, not `category_id` (68-69).
  - Delete uses `window.confirm` (87) while the unit's other delete flows use AlertDialog (DocumentDialogs.tsx:123, SiteImages.tsx:217); the storage-object removal result is ignored (97) and the DB row is deleted regardless.
- ASSUMED: That `pdfDocumentSaver.ts` (L14) writes generated reports into these category names (comment lineage in reportCategories.ts:4 references `getReportCategoryName()` there; not re-verified in this pass).
