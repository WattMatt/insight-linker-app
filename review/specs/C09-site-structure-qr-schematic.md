# C09 — site-structure-qr-schematic

- Unit id: C09
- Slug: site-structure-qr-schematic
- Spec mode: full
- Date: 2026-07-29
- Files: 6 (matches ./review/unit-files.json "C09")

## Unit header

**Unit purpose (as-is).** C09 contains the site-detail page's structural building blocks: the subsection list with search/filter/group/view-mode controls (SubsectionList + SubsectionFilters), the per-site QR-code management card and 30-day scan-activity card (QRCodeManager + QRScanActivity), the electrical schematic PDF viewer/editor with subsection-linked overlay blocks (SchematicDiagram), and the site-edit dialog with self-contained site-image upload (SiteEditDialog).

**Module-level observations.**
- Every file in the unit is consumed by V01 `src/views/SiteDetail.tsx` (imports at SiteDetail.tsx:13, 15, 16, 18, 29), except SubsectionFilters, whose only consumer is SubsectionList inside this same unit (SubsectionList.tsx:11) — grep-verified.
- SchematicDiagram is the only file consumed outside the admin surface: V03 `src/views/ClientPortalSiteDetail.tsx:19` and V04 `src/views/PublicSiteReview.tsx:27`. It carries a three-mode contract (admin read/write, authenticated client portal read-only, anonymous token read-only via RPC).
- No test file anywhere in `src/` references any of the six components (grep for each component name across `src` and `supabase` returned only the consumers listed per file). The pure helpers SchematicDiagram delegates to are tested in L18 (`src/lib/schematicMatching.test.ts`), but that covers the helpers, not this component.
- Three files perform Supabase writes (SchematicDiagram: tables `site_schematics`/`schematic_blocks` + bucket `documents`; SiteEditDialog: table `sites` + bucket `site-images`; QRCodeManager: indirectly via L16 `generateAndUploadQRCode`). Two are pure presentation (SubsectionFilters, SubsectionList).
- Recurring pattern: several write paths `await` supabase calls without destructuring the in-band `{ error }` result (supabase-js does not throw on PostgREST/storage errors), so the surrounding try/catch cannot observe those failures — SiteEditDialog.tsx:60-64, 79, 109; SchematicDiagram.tsx:1279-1284.

**External contract.** The rest of the app gets five named React components: `SubsectionList` (filterable subsection table/grid with delete confirmation, delete itself delegated to a callback), `SubsectionFilters` (+ the `SubsectionFiltersState` type), `QRCodeManager` (bulk QR regenerate/download/sticker-sheet card), `QRScanActivity` (30-day `qr_scans` summary card), `SiteEditDialog` (site form dialog + image management), and `SchematicDiagram` (PDF schematic viewer/editor usable in admin, client-portal, and anonymous-token modes).

---

## src/components/site/QRCodeManager.tsx

- **Purpose:** Card that shows a labeled QR code per subsection and offers three bulk actions: regenerate-and-upload all QR PNGs, download all as a ZIP (PNGs + a pdfmake contact-sheet PDF), and download a sticker-sheet PDF.
- **Public surface:**
  - `QRCodeManager: React.FC<QRCodeManagerProps>` (QRCodeManager.tsx:25).
  - `QRCodeManagerProps` (14-23, not exported): `{ site: Site; subsections: Subsection[]; companyLogo: string | null; generatingAll: boolean; setGeneratingAll: (val: boolean) => void; downloadingAll: boolean; setDownloadingAll: (val: boolean) => void; fetchSiteData: () => void }`. Generate/download busy-state is lifted to the parent; only `printingSheet` is local state (35).
- **Inputs & outputs:**
  - In: `site`, `subsections`, `companyLogo` props (all data supplied by the parent; the component runs no reads of its own).
  - Out: `handleGenerateAll` calls `generateAndUploadQRCode` per subsection (46-51) — that L16 function performs the storage upload (`Promise<string | null>`, qrCodeGenerator.ts:12-17); afterwards calls `fetchSiteData()` (71). `handleDownloadAll` builds per-subsection labeled QR canvases in-browser (87-185), zips PNGs plus a pdfmake PDF (`generatePdfBlob`, 224) and triggers a browser download via an object-URL anchor click (228-233). `handlePrintStickerSheet` downloads `buildStickerSheetBlob` output the same way (248-258). Filenames sanitized with `replace(/[^a-zA-Z0-9.-]/g, '_')` (184, 225, 231, 256).
  - Stores: none directly in this file; storage writes happen inside L16.
- **Dependencies:**
  - uses -> `LabeledQRCode` (C16, src/components/LabeledQRCode.tsx) at line 5; `Site`, `Subsection` from `@/types/site` (L22) at 6; `generateAndUploadQRCode` (L16, qrCodeGenerator.ts:12) at 8; `qrRedirectUrl` (L16, qrBaseUrl.ts:41) at 9; `generatePdfBlob`, `DEFAULT_STYLES` (L14, pdfMakeUtils.ts) at 11; `buildStickerSheetBlob` (L16, qrStickerSheet.ts:12) at 12; shadcn card/button (C01) at 2-3; `jszip` (10); `sonner` (7); dynamic `import('qrcode')` (80).
  - used by <- V01 site-detail: src/views/SiteDetail.tsx:15 (import), :843 (render). No other hits (grep-verified).
- **Side effects:** Storage uploads via L16 per subsection (sequential loop, 44-61); canvas/image DOM element creation; cross-origin logo image load with `crossOrigin='anonymous'` (118); ZIP generation; anchor-click download + `URL.createObjectURL`/`revokeObjectURL` (229-233, 254-258); toasts on start/success/partial/failure; `fetchSiteData()` after regenerate (71).
- **Error handling:** Generate-all: per-subsection try/catch increments `failCount` and `console.error`s (57-60); final toast is `success` if `failCount === 0` else `warning` with both counts (65-69) — no throw escapes. Download-all: outer try/catch → `console.error` + `toast.error("Failed to generate download")` (236-238), `finally` clears busy flag (239-241); inner per-subsection catch logs and skips that subsection (186-188); missing canvas 2D context silently `continue`s (98); logo `img.onerror` resolves the promise silently, producing a QR without logo (145). Sticker sheet: try/catch → `toast.error` (261-263), `finally` clears `printingSheet`.
- **Tests:** none found (grep across `src`/`supabase` test files: zero hits).
- **Observed issues:**
  - The labeled-QR canvas rendering in `handleDownloadAll` (87-185: 500px QR, 40px padding, 140px text band, centered logo with white backing, `fitText` shrink-to-fit) is a second in-file implementation of the same layout that L16 `qrCodeGenerator.ts` draws for uploads (its head declares the same qrSize 500 / padding 40 / textHeight 140 constants, qrCodeGenerator.ts:27-30).
  - `handleGenerateAll` has no try/finally around the loop; `setGeneratingAll(false)` (63) runs only because the per-iteration catch swallows all errors.
  - `qrImagesPerRow: any[]` (193) and `docDefinition: any` (214).
  - `handleGenerateAll` toasts "Successfully regenerated 0 QR codes!" when `subsections` is non-empty but every call returns null — `result === null` counts as fail (52-56), but a zero-subsection guard exists only on the buttons (`disabled={... subsections.length === 0}`, 281, 289).
- **ASSUMED:** `generateAndUploadQRCode` writes the PNG to a Supabase storage bucket (verified only that it is async, takes `{subsectionId, siteName, subsectionName, logoUrl}`, and returns `Promise<string | null>` — qrCodeGenerator.ts:12-17; its body belongs to L16's spec). PDF page-flow of the contact sheet relies on pdfmake's default page breaking (no explicit page-break logic in the doc definition, 214-222).

## src/components/site/QRScanActivity.tsx

- **Purpose:** Card summarising the last 30 days of `qr_scans` rows for a site's subsections: three headline counts plus a per-subsection table sorted most-recently-scanned first.
- **Public surface:**
  - `QRScanActivity: React.FC<QRScanActivityProps>` (19); `QRScanActivityProps` (8-10, not exported): `{ subsections: Subsection[] }`.
  - Internal row shape `SubsectionScanRow` (12-17): `{ subsectionId: string; name: string; count30d: number; lastScannedAt: string | null }`.
- **Inputs & outputs:**
  - In: `subsections` prop; one Supabase read: `qr_scans` select `subsection_id, scanned_at` filtered `.in('subsection_id', ids)`, `.gte('scanned_at', <now - 30d>)`, ordered `scanned_at` desc (42-47).
  - Out: rendered card only. Derived client-side: per-subsection 30d count + last-scan timestamp from the same ordered result set (56-66); rows sorted no-scan-last / newest-first (76-81); headline totals (106-109). `scansCapped` set when the result is exactly 1000 rows, in which case the total renders as `"1000+"` (86, 107).
  - Stores: reads table `qr_scans` only.
- **Dependencies:**
  - uses -> `supabase` client (L19, src/integrations/supabase/client.ts) at 5; `Subsection` from `@/types/site` (L22) at 6; shadcn card/badge (C01) at 3-4; `date-fns` `formatDistanceToNow` (2).
  - used by <- V01 site-detail: src/views/SiteDetail.tsx:16 (import), :842 (render). No other hits (grep-verified).
- **Side effects:** one network read per change of the subsection-id set; stale-response guard via `cancelled` flag in the effect cleanup (34, 100-102). No writes, no subscriptions.
- **Error handling:** `fetchError` is thrown inside the try (49); catch logs `"Error fetching QR scan activity:"`, clears rows, sets `error` state which renders "Couldn't load scan activity" (87-92, 122-123); `finally` clears loading unless cancelled (93-95). Empty `subsections` short-circuits without querying (28-32).
- **Tests:** none found.
- **Observed issues:**
  - The effect dependency is the string `subsections.map((s) => s.id).join(",")` with an `eslint-disable react-hooks/exhaustive-deps` (103-104); the `subsections` array itself is not a dependency, so a name change without an id change does not refetch (names are read from the prop at map time, 68-73, so names still update on re-render).
  - Cap detection fires only when the row count is exactly 1000 (86); the in-code comment attributes this to PostgREST's default unbounded-select cap (84-85) — no explicit `.limit()` is set on the query.
  - `count30d` per row still renders raw numbers even when `scansCapped` is true; only the headline total switches to "1000+" (107, 159).
- **ASSUMED:** the 1000-row default cap is PostgREST/Supabase server configuration, asserted by the in-file comment (84-85) and not verified in this repo; RLS on `qr_scans` permits the authenticated admin read (not inspected here — migrations are D-unit scope).

## src/components/site/SchematicDiagram.tsx

- **Purpose:** 2,302-line viewer/editor that renders a site's schematic PDF (react-pdf) with percentage-positioned overlay "blocks" linked to subsections, supporting upload/replace/delete of the PDF, block CRUD with drag/resize/snap, size calibration, auto-matching blocks to subsections, pan/zoom (wheel, pinch, buttons), inspection asset-photo popovers, and click-through navigation to subsection pages in three routing modes.
- **Public surface:**
  - `SchematicDiagram: React.FC<SchematicDiagramProps>` (136); `SchematicDiagramProps` (68-74, not exported): `{ siteId: string; siteName: string; readOnly?: boolean; accessToken?: string; clientPortalMode?: boolean }`. `siteName` is accepted but never referenced in the body.
  - Local (non-exported) interfaces: `Subsection` (76-81 — its own trimmed shape, not L22's), `SchematicBlock` (83-95: percent-based `x_position/y_position/width/height`, `is_auto_matched`, optional `page_number`), `Schematic` (97-106 incl. calibration fields), `InspectionTenantMatch` (108-121). Constants `MIN_CONTAINER_HEIGHT = 400` (124), `SIZE_PRESETS` (127-134), `SNAP_THRESHOLD = 0.15` percent (181).
  - Module side effect: `pdfjs.GlobalWorkerOptions.workerSrc` set to `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs` at import time (66).
- **Inputs & outputs:**
  - Reads (admin / clientPortal mode): `site_schematics` select `*` by `site_id` `.maybeSingle()` (799-803); `schematic_blocks` select `*` by `schematic_id` ordered by `block_identifier` (821-825); `subsections` select `id, name, tenant_name, meter_serial_number` by `site_id` (831-835); `inspections` select `id, title, subsection_id, json_data` by `site_id` (840-843).
  - Reads (anonymous review, `readOnly && accessToken`): single RPC `get_public_site_review({ p_token, p_site_id })` whose payload supplies `schematic`, `schematic_blocks`, `subsections`, `inspections` (781-796); table reads are skipped entirely in this mode.
  - Writes: `schematic_blocks` — insert new block with `page_number` (1062-1075), position/size update on drag/resize end (744-752), field/link update (1160-1170), bulk size update by `schematic_id` (1209-1212), unlink (1249-1252), per-row auto-match updates (1279-1284), delete (1230-1233). `site_schematics` — insert first schematic (976-984), update `file_name/file_url` on replace (951-956), calibration set (1380-1387) and clear (1413-1420), delete row (1015-1018).
  - Storage: bucket `documents` — upload to `${siteId}/schematic-${Date.now()}.pdf` (937-940), `getPublicUrl` (944-946), best-effort `remove` of the replaced (971) or deleted (1023-1024) file via `parseStorageUrl`.
  - Out: navigation on linked-block click — `/review/${accessToken}/subsection/${id}` (1109), `/client-portal/subsections/${id}` (1112), or `/clients/${clientId}/sites/${siteId}/subsections/${id}` / `/sites/${siteId}/subsections/${id}` depending on `useParams().clientId` (1115-1118).
  - Derived: `inspectionMeterMatches` — map of normalized meter serial (`toUpperCase().replace(/[^A-Z0-9]/g,'')`, excluding `''`/`NA`/`TBC`) to the tenant entry from `inspections.json_data.tenants`, preferring entries that carry images (856-907); `getAssetPhotos` joins it via the subsection's `meter_serial_number` (910-918).
- **Dependencies:**
  - uses -> `useNavigate`, `useParams` from `@/lib/navigation` (L13) at 2; `supabase` (L19) at 3; shadcn card/button/badge/input/label/dialog/dropdown-menu/select (C01) at 4-29; `react-pdf` (`Document`, `Page`, `pdfjs`) at 30; `sonner` at 31; lucide icons at 32-56; `FullscreenImageViewer` (C16, src/components/FullscreenImageViewer.tsx) at 57; `parseStorageUrl`, `nextBlockIdentifier`, `computeAutoMatches`, `matchSubsectionId` from `@/lib/schematicMatching` (L18; declarations at schematicMatching.ts:30/50/87/69) at 58-63.
  - used by <- V01 site-detail: src/views/SiteDetail.tsx:29 (import), :792 (render, admin mode); V03 portal-views: src/views/ClientPortalSiteDetail.tsx:19, :353 (`readOnly clientPortalMode`); V04 public-and-entry-views: src/views/PublicSiteReview.tsx:27, :473 (`readOnly accessToken={token}`). Additionally name-referenced in a comment at src/lib/schematicMatching.ts:2 (L18). Grep-verified; no other consumers.
- **Side effects:** window `resize` listener + 50ms initial timeout for viewport measurement (215-222); window `keydown`/`keyup` Shift tracking (231-246); window `wheel` listener registered capture + non-passive, calling `preventDefault` for ctrl/meta-wheel inside the container (287-299); pointer-event pan/pinch tracking with refs (414-537); DB writes on every drag/resize end (731-764) including when the pointer leaves the container (523-528); native `window.confirm` before schematic delete (1011); `document` file-input interactions (upload at 923-1005); toasts throughout; navigation (1103-1121).
- **Error handling:** Uniform pattern in every async handler: try/catch, `if (process.env.NODE_ENV === 'development') console.error(...)`, then `toast.error(...)` — load (847-852, with `finally` clearing loading), block position update (755-758), upload (999-1004, uses `error.message` when present), schematic delete (1029-1032), add block (1096-1099), save block (1191-1194), size preset (1219-1222), block delete (1240-1243), unlink (1261-1264), auto-match (1292-1295), calibration save/clear (1399-1402, 1432-1435). Exception: `handleAutoMatch` awaits each `schematic_blocks` update **without destructuring the result** (1279-1284); supabase-js reports failures in-band, so per-row errors are invisible to the catch and local state is updated as if all rows succeeded (1286-1289). Storage `remove` calls are deliberately unchecked ("best-effort", comments at 968-969, 1022). Calibration rectangle below 1%×1% aborts with a toast and resets (1372-1377).
- **Tests:** none for this component. `src/lib/schematicMatching.test.ts` (L18) covers the four imported pure helpers only.
- **Observed issues:**
  - pdf.js worker is fetched from the unpkg CDN at module load (66) — the schematic viewer has a hard external-network dependency, in an app that ships a PWA/offline layer (L11/H01 exist in the manifest).
  - `inspections` state is `any[]` (147) and the RPC payload is cast `as any` (784); the RPC's block/subsection arrays are cast to local types unchecked (793-795).
  - Uncalibrated default block size is 8%×12% (1046-1047), which matches no `SIZE_PRESETS` entry — "medium" is 8×6 (129), "tall" is 6×12 (132).
  - `handleAutoMatch` ignores per-row update errors (1279-1284; see Error handling).
  - `handleApplySizePreset` updates all blocks for the schematic across **all pages** (filter is `schematic_id` only, 1209-1212), while rendering, snapping and add-block are page-scoped (`page_number ?? 1`, 568-570, 836, 1072).
  - The subsection `<Select>` filtering (exclude subsections already linked to another block) is duplicated verbatim between the Edit dialog (2108-2110) and Link dialog (2158-2160); both dialogs submit through the same `handleSaveBlock`.
  - Schematic delete uses native `window.confirm` (1011) while every other destructive flow in the unit uses dialog components; the confirm text promises deletion of "all its blocks" but the code deletes only the `site_schematics` row and clears local block state (1015-1027).
  - `handleMouseMove` ends with a no-op guard `if (!isEditMode) return;` followed by nothing (508-510).
  - `getPdfWrapperRect` locates the PDF wrapper by `querySelector('div.relative')` on the content ref (1323-1327) — a class-based DOM query into its own rendered tree.
  - Drag/resize mutate `blocks` state optimistically on every pointer move (696-700, 722-726); persistence happens once on end, and a failed persist leaves the moved position on screen (no revert in the catch, 755-758).
  - `handlePageRenderSuccess` grabs the rendered canvas via a 100ms `setTimeout` + `querySelector('canvas')` (376-381); the captured `pdfCanvasRef` is never read anywhere else in the file.
  - Block-identifier collision safety is delegated to `nextBlockIdentifier` (comment 1057-1058), but manual edits of `block_identifier` in the dialog are not uniqueness-checked (2079-2084, 1160-1170).
- **ASSUMED:** deleting a `site_schematics` row cascades to its `schematic_blocks` in the database (implied by the confirm text and by clearing local blocks, 1011/1026-1027; FK definition not inspected — D-unit scope). The `documents` bucket is publicly readable (the viewer feeds `getPublicUrl` output straight to react-pdf, 944-946/1817). The `get_public_site_review` RPC's payload shape is inferred solely from this consumer's casts (784-795); the function definition lives in migrations (D03 scope).

## src/components/site/SiteEditDialog.tsx

- **Purpose:** Controlled dialog that edits site form fields (submission delegated to the parent via `onSubmit`) and manages the site image inline — capture/upload, delete with confirmation, and clearing of "legacy" (non-Supabase) image URLs.
- **Public surface:**
  - `SiteEditDialog: React.FC<SiteEditDialogProps>` (40); `SiteEditDialogProps` (15-38, not exported): `{ open: boolean; onOpenChange: (open: boolean) => void; editFormData: { name; address; description; status; location_lat; location_lng: string }; setEditFormData: React.Dispatch<...same shape...>; onSubmit: (e: React.FormEvent) => void; site?: Site | null; siteId?: string; onImageChange?: () => void }`.
- **Inputs & outputs:**
  - In: fully controlled form state from the parent; `site.site_image_url` drives the image section (234-272); image file from `useCamera().takePicture({ preferCamera: false })` (89).
  - Out (form): `onSubmit` — the component performs no site-field persistence itself (131). Status options hardcoded: Active / Maintenance / Pending / Inactive (180-183); lat/lng are free-text inputs (192-206).
  - Out (image): storage bucket `site-images` upload to `${siteId}/site-image.${ext}` with `upsert: true` (59-60); `getPublicUrl` (61); table `sites` update `site_image_url` to the public URL **with a `?t=${Date.now()}` cache-buster appended and stored in the DB** (62-64); delete and legacy-clear both set `site_image_url: null` (79, 109). `onImageChange?.()` fires after each mutation (66, 81, 111).
  - Stores: bucket `site-images`, table `sites`.
- **Dependencies:**
  - uses -> shadcn dialog/button/input/label/select/badge/alert-dialog (C01) at 2-10; `Site` from `@/types/site` (L22) at 9; `supabase` (L19) at 11; `sonner` at 12; `useCamera` (H02, src/hooks/useCamera.ts; `takePicture(options?): Promise<File | null>` at useCamera.ts:177) at 13.
  - used by <- V01 site-detail: src/views/SiteDetail.tsx:18 (import), :855 (render, with `onImageChange={fetchSiteData}`). No other hits (grep-verified).
- **Side effects:** storage upload + `sites` row updates; FileReader data-URL preview during upload (91-98); toasts; `onImageChange` callback.
- **Error handling:** `handleImageUpload` wraps in try/catch → `console.error` + `toast.error('Failed to upload image')`, `finally` clears busy/preview (67-73) — but neither the storage `upload` nor the `sites` `update` result is destructured (60-64); supabase-js returns errors in-band without throwing, so on such failures the catch never runs and `toast.success("Site image uploaded")` fires regardless. `handleDeleteImage` has the same unchecked-result pattern inside its try/catch (79-84). `clearLegacyUrl` has no try/catch at all and also ignores the result (107-112). `onCaptureImage` catch logs `"Image capture error:"` and clears the preview, no toast (101-104). Guard: all three mutations no-op silently when `siteId` is absent (56, 77, 108).
- **Tests:** none found.
- **Observed issues:**
  - In-band supabase errors invisible to all three image mutations (see Error handling) — success toasts are unconditional once the promise resolves.
  - The cache-buster query string is persisted into `sites.site_image_url` rather than applied at render time (62-64).
  - `isLegacyUrl` classifies any URL not containing `'supabase.co/storage'` as legacy (114-119), which includes self-hosted/custom-domain Supabase storage URLs.
  - Latitude/longitude are plain text inputs with no numeric validation in this file (192-206); validation, if any, is the parent's concern via `onSubmit`.
  - The image upload path derives the extension from the original filename (`file.name.split('.').pop()`, 59); files named without a dot would produce an extension equal to the whole name.
- **ASSUMED:** the `site-images` bucket is publicly readable (the stored `getPublicUrl` output is rendered directly at 252). `takePicture({ preferCamera: false })` opens a file picker on desktop (H02's concern; verified only the signature and the `preferCamera` branch existence, useCamera.ts:80/177).

## src/components/site/SubsectionFilters.tsx

- **Purpose:** Controlled toolbar for subsection lists: text search, a popover of toggle-chip filters (COC status, compliance, metering, snags, category), a group-by select, a table/grid view-mode toggle, and an active-filter badge row.
- **Public surface:**
  - `export interface SubsectionFiltersState` (28-37): `{ search: string; cocStatus: string[]; compliance: string[]; snags: string[]; metering: string[]; category: string[]; groupBy: "none" | "category" | "cocStatus" | "compliance" | "snags"; viewMode: "table" | "grid" }`.
  - `export function SubsectionFilters({ filters, onFiltersChange, categories, totalCount, filteredCount }: SubsectionFiltersProps)` (71-77); `SubsectionFiltersProps` (39-45, not exported): `{ filters: SubsectionFiltersState; onFiltersChange: (filters: SubsectionFiltersState) => void; categories: string[]; totalCount: number; filteredCount: number }`.
  - Module constants (not exported): `COC_STATUS_OPTIONS` — Pass / Fail / Pending / Missing / N/A (47-53); `COMPLIANCE_OPTIONS` — compliant / non-compliant / pending (55-59); `METERING_OPTIONS` — installed / missing (61-64); `SNAG_OPTIONS` — has-snags / no-snags (66-69).
- **Inputs & outputs:** Pure controlled component — every interaction calls `onFiltersChange` with a new state object (88-133); `clearAllFilters` resets search and the five filter arrays but leaves `groupBy` and `viewMode` untouched (135-145). Only local state is the popover-open boolean (78). No stores, no network.
- **Dependencies:**
  - uses -> shadcn input/button/badge/select/popover/label/separator (C01) at 2-26; lucide icons at 12-19.
  - used by <- C09 (this unit): src/components/site/SubsectionList.tsx:11 (import), :397-403 (render). No consumers outside the unit (grep-verified).
- **Side effects:** none beyond invoking `onFiltersChange`.
- **Error handling:** n/a — no async paths, no throwing code.
- **Tests:** none found.
- **Observed issues:**
  - `activeFilterCount` counts filter *groups* with any selection (five booleans, 80-86), not individual selected chips; the badge on the Filters button therefore maxes at 5 (183-190).
  - The active-badge row renders raw values for metering (`Metering: {value}` prints "installed"/"missing", 421-427) and maps snags to labels inline (437-444), while compliance is label-mapped through `COMPLIANCE_OPTIONS` (413-420) — three different label strategies in one row.
  - The COC status vocabulary is hardcoded here (47-53) independently of the status helpers in L09 (`hasValidCocStatus`/`hasFailedCocStatus`) that the consuming list uses for badge coloring — the manifest's L09 note about multiple status vocabularies (manifest.md:18) is visible at this boundary.
  - `viewMode` and `groupBy` live inside the "filters" state object though they affect presentation, not filtering; `clearAllFilters` correspondingly skips them (135-145).
- **ASSUMED:** nothing — the file is self-contained.

## src/components/site/SubsectionList.tsx

- **Purpose:** Filterable, groupable table-or-grid listing of a site's subsections with per-row navigation and a delete-confirmation dialog whose actual deletion is delegated to the parent's `onDelete` callback; owns the `SubsectionFiltersState` and renders `SubsectionFilters`.
- **Public surface:**
  - `export function SubsectionList({ subsections, onDelete, clientId, siteId, snags = [] }: SubsectionListProps)` (38); `SubsectionListProps` (30-36, not exported): `{ subsections: Subsection[]; onDelete: (id: string, name: string) => void; clientId: string; siteId: string; snags?: Snag[] }`; local `Snag` (24-28): `{ id: string; subsection_id: string; status: string }`.
  - Module constant `COMPLIANCE_BADGE: Record<ComplianceState, { variant; short; long }>` mapping compliant→Pass/Compliant (default), non-compliant→Fail/Non-Compliant (destructive), pending→Pending (secondary) (18-22).
- **Inputs & outputs:**
  - In: `subsections` and `snags` props — no reads of its own. Filtering (72-116): search over `name`/`tenant_name`/`meter_serial_number`; COC status compared against `sub.coc_status || "Missing"`; compliance via `complianceState(sub.is_compliant)`; metering "installed" = `!!meter_serial_number || metering_status === "Installed"` (96); category defaulting to "General"; snags via open-snag counts (`isSnagOpen`, 55-63). Grouping (119-157) by category / raw `coc_status` / `COMPLIANCE_BADGE[...].long` / With Snags–No Snags, group keys sorted alphabetically.
  - Out: `navigate` to `/clients/${clientId}/sites/${siteId}/subsections/${sub.id}` on row/card click and the Eye button (199, 252, 287); `onDelete(id, name)` after dialog confirmation (493-498).
  - Stores: none.
- **Dependencies:**
  - uses -> shadcn card/table/badge/button/alert-dialog/collapsible (C01) at 2-12; `Subsection` from `@/types/site` (L22) at 7; `useNavigate` from `@/lib/navigation` (L13) at 8; `getCategoryIcon`, `getCategoryColor` from `@/lib/subsectionCategories` (L18; declarations at subsectionCategories.ts:105/109) at 9; `SubsectionFilters`, `SubsectionFiltersState` (C09, same unit) at 11; `hasFailedCocStatus`, `hasValidCocStatus` from `@/lib/complianceCalculations` (L09; declarations at complianceCalculations.ts:51/43) at 13; `complianceState`, `isSnagOpen`, `ComplianceState` from `@/lib/subsectionStatus` (L17; declarations at subsectionStatus.ts:12/22/5) at 14; lucide icons at 6.
  - used by <- V01 site-detail: src/views/SiteDetail.tsx:13 (import), :834 (render). Name also appears in a comment at src/views/subsection-detail/useSubsectionDetail.ts:156 (V07) — comment only, not an import. Grep-verified; no other consumers.
- **Side effects:** navigation calls and the `onDelete` callback; no I/O, no subscriptions.
- **Error handling:** none needed — no async code; missing group keys and unknown categories fall through to defaults ("General", gray group color at 382, `Layers` icon at 363).
- **Tests:** none found.
- **Observed issues:**
  - The expand-all effect depends on `groupedSubsections` (172-176), which is a fresh object on every filter/search change; any filter interaction while grouped resets `expandedGroups` to all-expanded, discarding manual collapses.
  - The delete dialog states the action "will permanently delete all associated inspections, documents, snags, and QR codes" (486-488), but this component only invokes `onDelete(id, name)` — the cascade claim is about behavior owned elsewhere (V01's `handleDeleteSubsection`).
  - `getGroupColor` for `cocStatus` grouping colors only "Pass"/"Fail"/"Pending" (372-383); "Missing", "N/A", and any other raw `coc_status` value fall to gray, and group names are raw DB values while badge text passes through the `hasValidCocStatus`/`hasFailedCocStatus` mapping (218-227) — the same value can group under one label and badge under another.
  - Navigation hardcodes the `/clients/{clientId}/...` route family (199, 252, 287); unlike SchematicDiagram there is no clientId-less fallback, so `clientId` is effectively required to be valid.
  - Both table and grid views duplicate the COC badge IIFE logic verbatim (218-227 vs 319-331).
  - `filters.viewMode`/`groupBy` state (43-52) persists only for the component's lifetime — nothing is written to localStorage or URL.
- **ASSUMED:** `Subsection.coc_status` values in practice overlap the SubsectionFilters vocabulary (Pass/Fail/Pending/Missing/N/A); the type is plain `string` (src/types/site.ts:25) and no runtime normalization happens in this file.
