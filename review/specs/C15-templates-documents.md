# C15 — templates-documents

- Unit id: C15
- Slug: templates-documents
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 5 (matches `review/unit-files.json` "C15")

## Unit header

**Unit purpose (as-is).** Five standalone components directly under `src/components` covering three concerns: inspection-template authoring (TemplateBuilder — form/tab editor; PDFTemplateUploader — extract a template from an uploaded PDF; PDFTemplateExportDialog — render a template back out to PDF), an app-wide document preview dialog (DocumentPreviewDialog: PDF/image/DOCX viewer), and a per-inspection custom-field widget with image upload (DynamicFieldManager). The files do not import each other; they are grouped by theme, not by code dependency.

**Module-level observations (cross-file facts).**
- No intra-unit imports: none of the five files references another (verified by reading each file's import block).
- Two hard-coded, value-identical template-category lists: PDFTemplateUploader.tsx:23-31 (`{value,label}` objects) and TemplateBuilder.tsx:52-60 (plain strings) — both: General, Medium Voltage, Low Voltage, Generator, Solar, Progress, Site Drawing.
- Both writers to `inspection_templates` cast JSON payloads `as any`: PDFTemplateUploader.tsx:125-126 (`sections`, `cover_page`), TemplateBuilder.tsx:177-178 (`sections`, `tenants`).
- Export style split: PDFTemplateUploader (lines 33, 436) and PDFTemplateExportDialog (lines 32, 315) have dual named + default exports; DocumentPreviewDialog (49), TemplateBuilder (72), DynamicFieldManager (29) are named-only.
- Zero test coverage for the whole unit: `grep -rln "DocumentPreviewDialog|PDFTemplateUploader|PDFTemplateExportDialog|TemplateBuilder|DynamicFieldManager" --include='*.test.ts' --include='*.test.tsx' src` returns no hits.
- Four of five touch Supabase directly: table insert (PDFTemplateUploader.tsx:119), table insert/update (TemplateBuilder.tsx:186,195), storage upload + getPublicUrl (DynamicFieldManager.tsx:181-189), storage download (DocumentPreviewDialog.tsx:115-117). PDFTemplateExportDialog is purely client-side.
- An untracked duplicate view file `src/views/InspectionTemplates 2.tsx` (git status `??`, not in `git ls-files`) imports PDFTemplateUploader and PDFTemplateExportDialog at the same line numbers as the tracked view; it is not part of any manifest unit.

**External contract (what the rest of the app gets).**
- `DocumentPreviewDialog` — the app-wide file viewer: 13 rendering consumers across 8 units (C07, C08, C12, C14, V01, V03, V04, V06, V07; see per-file section).
- `TemplateBuilder` — the admin template editor, mounted solely via V02 `src/views/TemplateBuilderPage.tsx` (which A05 routes wrap).
- `PDFTemplateUploader` — the "import PDF as template" path on V02 `src/views/InspectionTemplates.tsx`.
- `PDFTemplateExportDialog` — template→PDF export dialog; currently import-only in V02, never rendered anywhere (grep-verified).
- `DynamicFieldManager` — custom-fields widget used only inside V01 `src/views/InspectionDetail.tsx`, gated to `templateCategory === "Progress"` (InspectionDetail.tsx:2314).

---

## src/components/DocumentPreviewDialog.tsx

- Purpose: Modal dialog that previews a file (PDF via react-pdf, images via `<img>`, DOCX via docx-preview) with zoom/rotate/pan/pagination controls, an optional standards-compliance side panel, a download button, and an optional "Save to Documents" action delegated to the parent.
- Public surface:
  - `export function DocumentPreviewDialog(props: DocumentPreviewDialogProps)` (line 49).
  - `DocumentPreviewDialogProps` (lines 34-47, interface not exported): `{ open: boolean; onOpenChange: (open: boolean) => void; fileUrl: string; fileName: string; downloadBlobData?: Blob; onSaveToDocuments?: () => Promise<void>; saveLocation?: 'site' | 'subsection'; contextName?: string; isSaving?: boolean (default false, line 58); complianceChecks?: PDFComplianceCheck }`.
  - Module-level side effect at import time: `pdfjs.GlobalWorkerOptions.workerSrc` set to protocol-relative `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs` (line 32).
- Inputs & outputs:
  - In: `fileUrl`/`fileName` props; file type decided purely by `fileName` extension (`.pdf` line 80, image regex line 81, `.docx` line 82). Optional `downloadBlobData` blob and `complianceChecks` map.
  - Storage read: if `fileUrl` matches `/storage/v1/object/(public|sign|authenticated)/<bucket>/<path>` (regex line 103), the PDF is re-downloaded via `supabase.storage.from(bucket).download(filePath)` (lines 115-117) — bucket is whatever the URL names; querystring stripped and path URI-decoded (line 110).
  - DOCX: `fetch(fileUrl)` → arrayBuffer → `renderAsync` into a DOM container (lines 160-183).
  - Out: rendered preview only; download via `downloadBlob(blob, fileName)` or `downloadFile(fileUrl, fileName)` with priority explicit blob → fetched pdf blob → remote URL (lines 572-579). No tables, no localStorage, no env vars.
- Dependencies:
  - uses -> `@/components/ui/{dialog,button,badge}` (C01); `lucide-react` (npm); `@/lib/fileDownload` `downloadBlob`/`downloadFile` (L12; both `async (…): Promise<void>`, fileDownload.ts:188,229); `react-pdf` ^10.2.0 (npm, package.json:78) + its two CSS files (lines 28-29); `@/lib/pdfEngine` `PDFComplianceCheck` (re-exported type, pdfEngine.ts:60) and `getComplianceCheckLabel` (pdfEngine.ts:962) (L14); `docx-preview` ^0.3.7 (npm, package.json:58); `@/integrations/supabase/client` (L19).
  - used by <- (grep-verified, 13 files):
    - C14 reports-dashboards: `src/components/ComprehensiveInspectionReport.tsx:6,248`; `src/components/SiteSummaryReport.tsx:7,689`; `src/components/FortressMarkingChecklist.tsx:10,411` (file assigned to C14 in unit-files.json).
    - C12 floor-plan-annotation: `src/components/InteractiveFloorPlan.tsx:9,710`.
    - C07 site-assets-inspections: `src/components/site/AssetComparisonTable.tsx:24,738`.
    - C08 site-documents-reports: `src/components/site/SiteReports.tsx:9,314`.
    - V01 admin-entity-views: `src/views/SiteDetail.tsx:9,821`.
    - V03 portal-views: `src/views/ClientPortalSiteDetail.tsx:21,447`; `src/views/ClientPortalSubsectionDetail.tsx:21,509`.
    - V04 public-and-entry-views: `src/views/PublicSubsectionReview.tsx:33,786`; `src/views/PublicSiteReview.tsx:29,557`.
    - V06 site-coc-tab: `src/views/site-coc/ReportSubTab.tsx:8,140`.
    - V07 subsection-detail-module: `src/views/subsection-detail/SubsectionDialogs.tsx:7,195`.
- Side effects: mutates global `pdfjs.GlobalWorkerOptions` at module load (line 32; worker fetched from unpkg CDN at runtime); Supabase Storage download + `URL.createObjectURL` (lines 115-127) with revoke in the effect cleanup (lines 132-138); `fetch(fileUrl)` for DOCX (line 160) and direct `innerHTML = ''` wipe of the container (line 157) before `renderAsync` mounts DOM into it; `ResizeObserver` on the scroll container (lines 90-92, disconnected on cleanup); `window.open(fileUrl, '_blank')` from the PDF-error fallback button (line 387); console logging at lines 113, 120, 127, 187, 190.
- Error handling: storage SDK download error → `console.error` + null blob state, so react-pdf silently falls back to the raw `fileUrl` (lines 119-122, 373); react-pdf load error → inline message + "Open in new tab" button (lines 384-390); DOCX fetch non-ok → `throw` → caught → `console.error` + static message "Failed to load document preview" and a Download button (lines 162, 189-192, 432-441); unsupported extension → "Preview not available" + Download button (lines 497-505). No toasts anywhere; save errors are the parent's problem (`onSaveToDocuments` awaited by the parent, only `isSaving` flows in).
- Tests: none found (grep-verified, no `*.test.*` references).
- Observed issues:
  - pdfjs worker loaded at runtime from a protocol-relative unpkg CDN URL (line 32); the sibling FloorPlanViewer uses the `https://` scheme for the same CDN (noted in inventory/09, verified there at FloorPlanViewer.tsx:12).
  - The DOCX effect's guard reads `docxContainerRef.current` (line 150) but the dependency array is `[open, isDocx, fileUrl]` (line 195), and the effect returns no cleanup — the `fetch` has no abort and late resolutions write into whatever the container then holds.
  - The open-reset effect clears `docxReady`/`docxError` only when `!isDocx` (lines 205-208); `docxLoading` is never reset there.
  - Wheel-zoom handler is attached only for non-PDF content (`onWheel={isPdf ? undefined : handleWheel}`, line 615); PDF zoom works only via the toolbar buttons, which scale `fitWidth` (line 398).
  - The transform pan/zoom wrapper is also disabled for PDFs (line 620), yet `handleMouseDown` still enters dragging state for any content when `scale > 1` (line 223), setting `position` that has no visual effect on PDFs.
- ASSUMED:
  - The storage-URL regex (line 103) matches all storage URL shapes callers actually pass — not verified against each of the 13 call sites.
  - `downloadBlobData` is supplied by callers that generate PDFs in memory — inferred from the prop comment (line 40), not traced per caller.

## src/components/PDFTemplateUploader.tsx

- Purpose: Drag-and-drop/browse card that runs an uploaded PDF through `extractTemplateFromPDF`, opens an edit dialog for the extracted structure (name, category, description, cover page, sections), offers a pdfmake preview in a new tab, and inserts the result into `inspection_templates`.
- Public surface:
  - `export const PDFTemplateUploader: React.FC<PDFTemplateUploaderProps>` (line 33) and `export default PDFTemplateUploader` (line 436).
  - `PDFTemplateUploaderProps` (lines 17-21, not exported): `{ onTemplateExtracted?: (template: ExtractedTemplate) => void; onTemplateSaved?: () => void; className?: string }`.
  - Module const `TEMPLATE_CATEGORIES` (lines 23-31, not exported).
- Inputs & outputs:
  - In: `File` from drop (`e.dataTransfer.files`, first `application/pdf`, lines 60-61) or file input (`accept=".pdf,application/pdf"`, line 235).
  - Processing: `extractTemplateFromPDF(file)` → `ExtractedTemplate` held in `extractedTemplate`/`editedTemplate` state (lines 86-88); edit operations mutate the copy (lines 146-167).
  - Out (table write): insert into `inspection_templates` with `{ name, category, description, sections: … as any, cover_page: … as any, sections_count: sections.length, pages_count: metadata.pageCount }` (lines 119-129).
  - Out (preview): `generateTemplatePreviewPDF(editedTemplate)` → Blob → `URL.createObjectURL` → `window.open(url, '_blank')` (lines 104-107).
- Dependencies:
  - uses -> `@/components/ui/{button,card,dialog,input,label,textarea,select,badge,scroll-area}` (C01); `sonner` `toast` (npm); `@/lib/utils` `cn` (L18); `@/lib/pdfTemplateExtractor` `extractTemplateFromPDF` (pdfTemplateExtractor.ts:74), `ExtractedTemplate` (:34), `generateTemplatePreviewPDF` (:413) (L15); `@/integrations/supabase/client` (L19); `lucide-react`.
  - used by <- V02 admin-ops-and-template-views: `src/views/InspectionTemplates.tsx:17` (default import), rendered at :461 behind a `showUploader` flag with only `onTemplateSaved` passed (lines 460-466 of that view) — `onTemplateExtracted` has no live caller. Also imported by the untracked duplicate `src/views/InspectionTemplates 2.tsx:17,459` (not in any unit).
- Side effects: Supabase insert (network); `window.open` new tab; `URL.createObjectURL` (line 105) with no revoke anywhere; sonner toasts on every path; `console.error` on failures (lines 93, 109, 139).
- Error handling: non-PDF drop/select → `toast.error('Please upload a PDF file')`, no processing (lines 63-66, 75-78); extraction failure → `console.error` + `toast.error('Failed to extract template from PDF')`, state untouched (lines 92-97); preview failure → `console.error` + `toast.error('Failed to generate preview')` (lines 108-111); insert error → `throw` inside try → `console.error` + `toast.error('Failed to save template')`, dialog stays open (lines 131, 138-143). Success paths toast and reset state (lines 90, 133-137).
- Tests: none found (grep-verified).
- Observed issues:
  - `previewUrl` state is set (line 106) but never read and the object URL is never revoked; the component works identically without it.
  - UI copy says "Supports PDF files up to 20MB" (line 231) but no size check exists anywhere in the file.
  - `handleDrop` is `useCallback` with an empty dependency array (lines 56-69) yet calls `processFile`, a per-render function; the memoized closure keeps the first render's `processFile` and therefore the first render's `onTemplateExtracted` prop.
  - `sections`/`cover_page` inserted with `as any` casts (lines 125-126).
  - `TEMPLATE_CATEGORIES` duplicates TemplateBuilder's list (values identical; see unit header).
- ASSUMED:
  - The `inspection_templates` columns `sections`/`cover_page` accept the extractor's JSON shape (casts bypass the generated types; column types not checked here).

## src/components/PDFTemplateExportDialog.tsx

- Purpose: Dialog with an Options/Preview tab pair that configures `ExportOptions` (content toggles, accent color, company name, watermark, report date, reference number) for a template and either previews the generated PDF in an iframe or triggers a download.
- Public surface:
  - `export const PDFTemplateExportDialog: React.FC<PDFTemplateExportDialogProps>` (line 32) and `export default PDFTemplateExportDialog` (line 315).
  - `PDFTemplateExportDialogProps` (lines 18-22, not exported): `{ open: boolean; onOpenChange: (open: boolean) => void; template: TemplateData | null }`.
  - Module const `ACCENT_COLORS` (lines 24-30, not exported): blue/green/orange/red/purple hex swatches.
- Inputs & outputs:
  - In: `template` prop (`TemplateData` from L15). Local `ExportOptions` state defaults (lines 41-51): all four include* toggles true, `accentColor: 'blue'`, `watermark: ''`, `companyName: 'Watson Mattheus'`, `reportDate: new Date()`, `referenceNumber: ''`.
  - Out (preview): `exportTemplateToPDF(template, options)` → `Promise<Blob>` (pdfTemplateExporter.ts:82-85) → object URL → `<iframe src>` (lines 62-64, 249-253).
  - Out (download): `downloadTemplatePDF(template, options)` (line 79) — a synchronous `void` function (pdfTemplateExporter.ts:125-129). No tables, storage, or localStorage.
- Dependencies:
  - uses -> `@/components/ui/{button,dialog,input,label,switch,tabs}` (C01); `@/lib/utils` `cn` (L18); `sonner`; `@/lib/pdfTemplateExporter` `exportTemplateToPDF`, `downloadTemplatePDF`, `TemplateData`, `ExportOptions` (L15); `lucide-react`.
  - used by <- import-only, never rendered (grep-verified: the only hits outside the file are the import lines `src/views/InspectionTemplates.tsx:18` (V02) and untracked `src/views/InspectionTemplates 2.tsx:18`; no `<PDFTemplateExportDialog` JSX exists anywhere in src).
- Side effects: pdfmake blob generation in-browser; `URL.createObjectURL` per preview (line 63), never revoked; `downloadTemplatePDF` triggers the browser download; toasts; `console.error` (lines 67, 83).
- Error handling: preview failure → `console.error` + `toast.error('Failed to generate preview')` (lines 66-69); download wrapped in try/catch → `console.error` + `toast.error('Failed to download PDF')` (lines 82-85); on the non-throwing path `toast.success('PDF downloaded successfully')` fires immediately after the synchronous call and the dialog closes (lines 80-81). Download button disabled when `!template` (line 296); `handlePreview`/`handleDownload` no-op silently if `template` is null (lines 58, 75).
- Tests: none found (grep-verified).
- Observed issues:
  - Dead component: no rendering consumer anywhere (only unused import statements).
  - `handleDownload` is `async` and gated by `isExporting`, but `downloadTemplatePDF` is synchronous (`export function …: void`, pdfTemplateExporter.ts:125), so the "Exporting…" spinner state resolves in the same tick.
  - Each preview click creates a fresh object URL without revoking the previous one (lines 62-64).
  - `reportDate` is round-tripped through `toISOString().split('T')[0]` for the date input (line 230) and reconstructed with `new Date(e.target.value)` (line 231).
- ASSUMED:
  - The component was wired to a "Export PDF" affordance in InspectionTemplates at some point — inferred from the surviving import, not verified in history.

## src/components/TemplateBuilder.tsx

- Purpose: Full editor for an inspection template — metadata card (name/category/description), a "Template Structure" tab of reorder-styled sections each holding typed fields, an optional "Tenants" tab for main-board templates, and a save that inserts or updates `inspection_templates`.
- Public surface:
  - `export const TemplateBuilder = ({ templateId, initialData, onSave }: TemplateBuilderProps)` (line 72).
  - `TemplateBuilderProps` (lines 40-50, not exported): `{ templateId?: string; initialData?: { name: string; category: string; description: string; sections: TemplateSection[]; tenants?: Tenant[] }; onSave?: () => void }`.
  - Internal, unexported shapes: `TemplateItem` (lines 15-21: id, name, type "text"|"textarea"|"number"|"image"|"document"|"checkbox"|"select", required, options?), `TemplateSection` (lines 23-28: id, name, order_index, items), `Tenant` (lines 30-38: id, shopNumber, shopName, breakerSize, breakerImage, ctSizeAndRatio, ctRatioImage).
  - Module consts `TEMPLATE_CATEGORIES` (52-60), `FIELD_TYPES` (62-70), not exported.
- Inputs & outputs:
  - In: `initialData` seeds all state once via `useState` initializers (lines 73-77).
  - Out (table write, lines 173-201): payload `{ name, category, description, sections: sections as any, tenants: (templateSupportsTenants({name}) && tenants.length > 0) ? tenants as any : undefined, sections_count: sections.length, pages_count: sections.length + 1, updated_at: new Date().toISOString() }`; `templateId` present → `update … eq("id", templateId)` (lines 186-189), else `insert` (lines 195-197), both on `inspection_templates`.
  - Out (callback): `onSave?.()` after either success (line 203).
- Dependencies:
  - uses -> `@/components/ui/{button,input,label,textarea,select,card,dialog,tabs}` (C01); `lucide-react`; `sonner`; `@/integrations/supabase/client` (L19); `@/lib/templateTenants` `templateSupportsTenants` (L18) — returns `name.toLowerCase().includes("main board")` (templateTenants.ts:13-17).
  - used by <- V02 admin-ops-and-template-views: `src/views/TemplateBuilderPage.tsx:5` (import), rendered at :105-109 with `templateId`, `initialData`, `onSave`. (The A05 route files `src/app/(admin)/inspection-templates/new/page.tsx` and `[templateId]/edit/page.tsx` mount the V02 view, not this component directly.) No other consumers (grep-verified).
- Side effects: `window.confirm` blocking dialogs before section/field/tenant deletion (lines 95, 130, 159); Supabase insert/update; toasts (lines 167, 192, 200, 206); `console.error` (line 205).
- Error handling: empty/whitespace template name → `toast.error("Please enter a template name")` and early return (lines 166-169); DB error → `throw` inside try → `console.error` + `toast.error("Failed to save template")` (lines 191, 199, 204-206); `finally` clears `saving` (lines 207-209). Confirm-cancel simply returns without change.
- Tests: none found (grep-verified).
- Observed issues:
  - Tenant-tab gating uses two different conditions: the `TabsTrigger` and `TabsList` column count use `templateSupportsTenants({ name: templateName })` ("main board" only; lines 259-261), while the `TabsContent` renders when the name includes "main board" **or** "shop board" (line 375). A "shop board" template gets the content markup but no trigger, and its tenants are dropped at save because line 178 also uses `templateSupportsTenants`.
  - `GripVertical` handles render with `cursor-move` (lines 285, 304) but the file contains no drag-and-drop wiring (grep-verified: no `onDragStart`/`draggable` in the file); reordering is not implemented and `order_index` is only set at creation (line 84) and never updated on delete.
  - `Dialog`, `DialogContent`, `DialogDescription`, `DialogHeader`, `DialogTitle`, `DialogTrigger` are imported (line 8) but unused (grep-verified: no `<Dialog` in the file).
  - `pages_count` is computed as `sections.length + 1` here (line 180) but as the extractor's real `metadata.pageCount` in PDFTemplateUploader (line 128) — two meanings for the same column.
  - Entity ids are `section_${Date.now()}` / `item_${Date.now()}` / `tenant_${Date.now()}` (lines 82, 103, 143).
  - The insert path includes `updated_at` (line 181) alongside the create.
  - Tenant image fields are free-text "Image URL or upload path" inputs (lines 441-444, 459-463); no upload mechanism in this file.
- ASSUMED:
  - `sections`/`tenants` columns tolerate `undefined` vs array (`as any` casts, lines 177-178); generated column types not checked here.
  - Category values must stay in sync with PDFTemplateUploader's list by convention only — no shared constant (inferred from duplication).

## src/components/DynamicFieldManager.tsx

- Purpose: Widget that lets an inspector add ad-hoc custom fields (text/textarea/number/image) to an inspection section, uploading images (with HEIC conversion and canvas compression) to the `inspection-photos` storage bucket and reporting every field change to the parent via callback.
- Public surface:
  - `export const DynamicFieldManager = ({ inspectionId, sectionKey, initialFields = [], onFieldsChange }: DynamicFieldManagerProps)` (lines 29-34).
  - `DynamicFieldManagerProps` (lines 22-27, not exported): `{ inspectionId: string; sectionKey: string; initialFields?: DynamicField[]; onFieldsChange?: (fields: DynamicField[]) => void }`.
  - Internal `DynamicField` (lines 14-20, not exported): `{ id: string; label: string; type: "text"|"textarea"|"number"|"image"; value: string; images?: Array<{ url: string; name: string }> }`.
- Inputs & outputs:
  - In: `initialFields` seeds local state (line 35); text/number/textarea edits update `value` (lines 66-72).
  - Storage write: `supabase.storage.from("inspection-photos").upload(filePath, finalFile)` with `filePath = ${inspectionId}/${sectionKey}/${Date.now()}-${finalFileName}` (lines 178-183); URL via `getPublicUrl` (lines 187-189). All uploads are renamed `*.jpg` with MIME `image/jpeg` (lines 175-176) regardless of source format.
  - Out: no table writes; the full fields array flows out through `onFieldsChange` on every mutation (lines 58, 71, 77, 202, 227). The sole consumer stores it in inspection `jsonData[`${sectionKey}_customFields`]` (InspectionDetail.tsx:2318-2325).
- Dependencies:
  - uses -> `@/components/ui/{button,input,label,textarea,card,dialog,select}` (C01); `lucide-react`; `sonner`; `@/integrations/supabase/client` (L19); `@/hooks/useCamera` (H02) — `isNative` = `Capacitor.isNativePlatform()` (useCamera.ts:174), `selectImages(options?): Promise<File[]>` (useCamera.ts:235); dynamic `import('heic2any')` (line 158; npm ^0.0.4, package.json:61).
  - used by <- V01 admin-entity-views: `src/views/InspectionDetail.tsx:19` (import), rendered at :2316-2319 only when `templateCategory === "Progress"` (:2314). No other consumers (grep-verified).
- Side effects: Supabase Storage upload + public-URL derivation; HEIC→JPEG conversion (quality 0.9, lines 158-165); canvas re-encode to JPEG (max width 800, quality 0.7, lines 98-133) with `console.log` of before/after sizes (line 125); `URL.createObjectURL`/`revokeObjectURL` around the probe image (lines 93, 96, 137); `navigator.userAgent` mobile-regex evaluated every render (line 230); programmatic `.click()` on hidden file inputs found via `document.getElementById` (lines 260-262, 293-295); toasts on add/remove/upload outcomes.
- Error handling: empty new-field label → `toast.error("Please enter a field label")` (lines 43-46); HEIC conversion failure → `console.error` + `toast.error` + `return` — the surrounding `finally` (lines 208-213) still clears the per-field uploading flag; upload error → `throw` → `console.error` + `toast.error("Failed to upload image")` + `finally` clears flag (lines 185, 204-213); native `selectImages` failure → `console.error` + `toast.error` + manual flag clear in catch (lines 247-255, 280-288); compression never rejects — every failure path resolves with the original file (lines 87-90, 113-116, 124-129, 136-139).
- Tests: none found (grep-verified).
- Observed issues:
  - Native zero-files path leaks the busy flag: `handleTakePhoto`/`handleAddPhotos` add `fieldId` to `uploadingImages` (lines 235, 268), but the `files.length === 0` early return (lines 239-242, 272-275) exits without removing it — removal happens only in the catch blocks or in `handleImageUpload`'s `finally` — leaving both buttons disabled and labeled "Uploading…".
  - `handleImageUpload` computes `updatedFields` from the render-time `fields` closure (`fields.map`, line 191) rather than a functional update; both web-path inputs fire it once per selected file without awaiting (lines 400-402, 412-414), and the native loop awaits sequentially but through the same captured closure (lines 244-246).
  - `removeImage` mutates local state only; the uploaded object stays in the `inspection-photos` bucket (lines 216-228).
  - `data` from the upload response is destructured and never used (line 181).
  - Two mobile detections coexist: `isMobileDevice` UA regex (line 230) gates the "Take Photo" button while `isNative` (Capacitor) picks the capture mechanism (lines 234, 267).
- ASSUMED:
  - The `inspection-photos` bucket is publicly readable — `getPublicUrl` output is rendered directly in `<img src>` (lines 187-189, 452) with no signing.
  - The compression comment's "~50-100KB" target (line 83) is aspirational; no size assertion exists in code.
