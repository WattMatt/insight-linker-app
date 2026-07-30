# L12 — file-image-utils

- Unit id: L12
- Slug: file-image-utils
- Spec mode: full
- Date: 2026-07-29
- Files: 10 (matches unit-files.json "L12")

## Unit header

**Unit purpose.** Browser-side file and image plumbing: downloading blobs/URLs to the user's machine (with an iframe-aware "handoff window" mechanism), validating uploads, clearing app caches on auto-logout, and three separate repair/resolution utilities for photos in the `inspection-photos` Supabase Storage bucket, plus a pure photo-counter over inspection `json_data`.

**Module-level observations (cross-file, verified).**
- The direct-download URL builder (`new URL(url, origin)` + `searchParams.set('download', fileName)`) exists three times: `fileDownload.ts:153-157` (`getDirectDownloadUrl`, exported), `downloadHandoff.ts:20-24` (`buildDirectDownloadUrl`, private), and a third copy outside the unit in V04 (`src/views/DownloadHandoff.tsx:12-16`).
- Two independent Supabase-storage-URL parsers with different accepted access types: `fileDownload.ts:34` accepts `public|sign|authenticated`; `imageUrlResolver.ts:10-11` accepts `public|sign` only. A third, bucket-specific extractor exists at `imageNaming.ts:88` (matches only `inspection-photos/`).
- Three different filename conventions are assumed across the unit for the same bucket: `imageNaming.ts:43-49` generates `inspectionId/sectionKey/itemKey/<timestamp>_<index>.<ext>`; `imageUrlResolver.ts:47` matches filenames of the form `..._<d>_<d>_<d>_<d>.<ext>`; `imagePathFixer.ts:59` classifies URLs ending `/<digits>/<digits>/<digits>-<digits>.<ext>` as "broken".
- Exported-but-unconsumed symbols (grep-verified across src + supabase): all three exports of `imagePathFixer.ts`; `fileDownload.getDirectDownloadUrl`; `fileValidation.validateFiles`, `formatFileSize`, `isImageFile`, `isDocumentFile`, `ALLOWED_MIME_TYPES`; `imageUrlResolver.fetchImageWithFallback`, `fetchImageAsDataUrl`; `imageNaming.sanitizeForFileName`, `extractPathFromUrl`, `renameImage` (used internally only).
- Test coverage inside the unit: only `fileDownload.test.ts` (covers `downloadBlob` only) and `inspectionImages.test.ts`. Grep across `src/**/*.test.*` finds no other test file referencing any L12 module.

**External contract.** The rest of the app gets: `clearAllCaches` (C10 SessionWatcher), `downloadFile`/`downloadBlob` (10 view/component consumers across V01–V04, C03, C08, C15), the handoff-request IndexedDB read/delete API (V04 DownloadHandoff view), `validateFile` + `FILE_LIMITS` (H02 offline hooks), inspection/tenant image path generation + batch renaming (V01 InspectionDetail), storage-URL parsing and image-URL recovery (L19 signedUrls, C16 RobustImage), and photo counting/has-images predicates (C07 BulkInspectionReportGenerator, L17 siteHealth/siteDeliverables).

---

## src/lib/cacheUtils.ts
- Purpose: Clears IndexedDB, localStorage, service-worker caches, and SW registrations as one operation, built for the automatic daily logout (`cacheUtils.ts:1-3`).
- Public surface:
  - `async clearAllCaches(): Promise<void>` (`cacheUtils.ts:14`). Only export; four helpers (`clearIndexedDB`, `clearLocalStorage`, `clearServiceWorkerCaches`, `unregisterServiceWorkers`) are module-private (`cacheUtils.ts:39,66,90,104`).
- Inputs & outputs: no parameters; returns void. Stores touched: deletes IndexedDB databases `wm_compliance_offline` and `wm_floor_plan_offline` (`cacheUtils.ts:41-44`); removes every localStorage key not starting with `supabase.auth.token` (`cacheUtils.ts:6,71-78`); deletes all CacheStorage caches (`cacheUtils.ts:93-94`); unregisters all service workers (`cacheUtils.ts:107-108`).
- Dependencies: uses -> none (zero imports; browser APIs only). used by <- C10 route-guards-auth (`src/components/SessionWatcher.tsx:4`, invoked at `:54`) (grep-verified).
- Side effects: destructive deletion of client-side storage; console.log/warn/error progress lines (`cacheUtils.ts:15,27-29,33`).
- Error handling: `Promise.allSettled` over the four operations — a failed operation is console.error'd, the rest proceed, function never rejects (`cacheUtils.ts:17-31`). Blocked IndexedDB deletion warns and resolves anyway (`cacheUtils.ts:52-55`); localStorage failure warns and resolves (`cacheUtils.ts:80-83`); caches/SW helpers swallow into console.warn (`cacheUtils.ts:95-97,109-111`).
- Tests: none (grep-verified — no test file references `cacheUtils`).
- Observed issues:
  - The preserved-key prefix `supabase.auth.token` (`cacheUtils.ts:6`) does not appear anywhere else in src; the Supabase client is created with `storage: window.localStorage` and no custom `storageKey` (`src/integrations/supabase/client.ts:15-20`).
  - `wm_floor_plan_offline` appears only in this file (grep-verified across src and public); `offlineDB.ts:2` and `offlineInspectionDB.ts:2` (L11) both name their database `wm_compliance_offline`, and `offlineFloorPlanDB.ts` reuses `offlineDB`'s connection rather than opening its own database (`src/lib/offlineFloorPlanDB.ts:2-12`).
  - The 'wm-download-handoff' IndexedDB created by sibling file `downloadHandoff.ts` is not in the deletion list (`cacheUtils.ts:41-44`).
- ASSUMED: supabase-js v2's default localStorage key is `sb-<project-ref>-auth-token`, which the preserved prefix would not match — key-name convention taken from library knowledge, not verified in this repo.

## src/lib/downloadHandoff.ts
- Purpose: Opens a synchronously-created "handoff" browser tab that later receives a PDF download (via URL redirect or blob injection), plus an IndexedDB store for handoff requests.
- Public surface:
  - `interface PendingDownloadHandoff { id: string; windowRef: Window }` (`downloadHandoff.ts:7-10`)
  - `interface StoredDownloadHandoffRequest extends DownloadHandoffPayload { createdAt: number; id: string }` (`downloadHandoff.ts:12-15`; `DownloadHandoffPayload { fileName: string; blob?: Blob; url?: string }` is private, `:1-5`)
  - `async getDownloadRequest(id: string): Promise<StoredDownloadHandoffRequest | null>` (`:170`)
  - `async deleteDownloadRequest(id: string): Promise<void>` (`:192`)
  - `createPendingDownloadHandoff(): PendingDownloadHandoff | null` (`:210`)
  - `async completeDownloadHandoff(pendingRequest, payload): Promise<void>` (`:228`)
  - `async openDownloadHandoffWindow(payload): Promise<boolean>` (`:273`)
- Inputs & outputs: payloads of `{fileName, blob?, url?}`; outputs a populated new browser tab. Stores touched: IndexedDB database `wm-download-handoff` v1, object store `requests` keyed by `id` (`downloadHandoff.ts:17-18,133,142`).
- Dependencies: uses -> none (zero imports; window/indexedDB/crypto APIs). used by <- same-unit `fileDownload.ts:2` (`openDownloadHandoffWindow`); V04 public-and-entry-views (`src/views/DownloadHandoff.tsx:6` imports `deleteDownloadRequest`, `getDownloadRequest`, `StoredDownloadHandoffRequest`); mocked in same-unit `fileDownload.test.ts:11` (grep-verified).
- Side effects: `window.open('', '_blank')` (`:211`); `document.open/write/close` of a full inline HTML page into the handoff window (`:51-128`); `location.replace` to `url?download=<fileName>` for URL payloads (`:241`); programmatic `downloadLink.click()` after 120 ms and `URL.revokeObjectURL` after 60 s, both scheduled on the handoff window (`:264-270`); IndexedDB put/get/delete transactions with `db.close()` in `finally`/`oncomplete` (`:167,186,207`).
- Error handling: IDB open/put/get/delete reject with the request/transaction error or a fabricated `Error` (`:135-137,160-166,182-188,200-206`). `createPendingDownloadHandoff` returns `null` when the popup is blocked (`:213-215`). `completeDownloadHandoff` throws on missing blob+url (`:232-234`), on a closed handoff window (`:236-238`), and on a missing `#download-link` element after revoking the blob URL (`:256-259`). `openDownloadHandoffWindow` returns `false` on popup block, otherwise propagates `completeDownloadHandoff` rejections (`:273-281`).
- Tests: none directly; `fileDownload.test.ts:11` stubs the whole module.
- Observed issues:
  - `putDownloadRequest` (`:152-168`) — the only writer to the `requests` store — is module-private and never called (grep-verified: the only hits for `putDownloadRequest` and `wm-download-handoff` in src are its definition and the DB constant). The V04 DownloadHandoff view polls `getDownloadRequest` up to 60×500 ms (`src/views/DownloadHandoff.tsx:9-10,46-56`) against a store nothing in src writes to.
  - HTML injected via `document.write` escapes title/description/fileName through `escapeHtml` (`:26-33,44-46`).
  - The blob branch calls `URL.createObjectURL(payload.blob)` (`:245`) where `blob` is typed optional; reachability of a defined blob at that point follows from the guards at `:232-243`.
- ASSUMED: appending `?download=<name>` to a Supabase public storage URL makes the server respond with a content-disposition attachment — inferred from usage, not verified against Supabase behaviour here.

## src/lib/fileDownload.test.ts
- Purpose: Vitest (jsdom) suite asserting `downloadBlob` reports success/failure honestly across its three delivery strategies.
- Public surface: none (test file).
- Inputs & outputs: hoisted `toastMock` replacing `sonner` (`fileDownload.test.ts:6-9`); mocks `@/lib/downloadHandoff` (`:11`) and `@/integrations/supabase/client` (`:12`); stubs `URL.createObjectURL`/`revokeObjectURL` (`:28-29`).
- Dependencies: uses -> vitest; `./fileDownload` (same unit). used by <- none (test runner entry).
- Side effects: mutates `window.showSaveFilePicker`, `window.top`, spies on `window.open` and `HTMLAnchorElement.prototype.click` — restored per test (`:25,55-62,66-71`).
- Error handling: n/a.
- Tests (what is actually asserted):
  1. Picker available → `writable.write` called, success toast, no error toast (`:32-41`).
  2. Picker rejects with `AbortError` → `toast.dismiss` called, no success/error toast (`:43-51`).
  3. Framed (`window.top` overridden) + `window.open` returns null → error toast, no success toast (`:53-63`).
  4. Normal page → anchor `click` fired, success toast, no error toast (`:65-72`).
- Observed issues: only `downloadBlob` is imported (`:14`); `downloadFile`, `getDirectDownloadUrl`, and the storage-URL parsing path are untested.
- ASSUMED: none.

## src/lib/fileDownload.ts
- Purpose: Downloads a Blob or URL to the user's machine via a cascade (File System Access picker → anchor download → `window.open`), resolving Supabase storage URLs through the SDK, with toast feedback at every outcome.
- Public surface:
  - `getDirectDownloadUrl(url: string, fileName: string): string` (`fileDownload.ts:153`)
  - `async downloadBlob(blob: Blob, fileName: string): Promise<void>` (`:188`)
  - `async downloadFile(url: string, fileName: string): Promise<void>` (`:229`)
  - Private: `parseSupabaseStorageUrl` (`:31`), `getFileExtension`/`getMimeType` (`:44,49`), `buildSavePickerOptions` (`:79`), `resolveDownloadBlob` (`:104`), `isInIframe` (`:124`), `triggerAnchorDownload` (`:133`), `triggerWindowOpen` (`:146`), `isAbortError` (`:159`), `trySaveWithPicker` (`:166`), plus local structural types for the File System Access API (`:7-29`).
- Inputs & outputs: Blob or URL + filename in; a saved/downloaded/opened file out. Stores touched: Supabase Storage — `.from(bucket).download(path)` for any URL matching `/storage/v1/object/(public|sign|authenticated)/<bucket>/<path>` (`:34,108`); plain `fetch(url)` otherwise (`:115`).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, `:1`); `@/lib/downloadHandoff` (same unit, `:2`); `sonner` (`:3`). used by <- (grep-verified) C15 `src/components/DocumentPreviewDialog.tsx:23` (`downloadBlob`, `downloadFile`); C08 `src/components/site/SiteReports.tsx:12` (`downloadFile`); C03 `src/components/client-portal/ClientCocView.tsx:21` (`downloadBlob`); V03 `src/views/ClientPortalSubsectionDetail.tsx:22` and `src/views/ClientPortalSiteDetail.tsx:24` (`downloadFile`); V01 `src/views/Calendar.tsx:56` (`downloadBlob`) and `src/views/SiteDetail.tsx:10` (`downloadFile`); V04 `src/views/PublicSubsectionReview.tsx:34` and `src/views/PublicSiteReview.tsx:31` (`downloadFile`); V02 `src/views/InspectionTemplates.tsx:20` (`downloadBlob`).
- Side effects: toast loading/success/error/dismiss on every path (`:189,194,198,204,209,213,221,230,235,244,249`); DOM anchor creation + click (`:133-143`); `window.open` (`:148`); `showSaveFilePicker` write (`:170-174`); blob-URL creation with 60 s revocation timers (`:142,149`); console.warn/error (`:177,220,248`).
- Error handling: `trySaveWithPicker` maps `AbortError` → `'cancelled'` (silent dismiss) and any other failure → `'unavailable'` with console.warn fallback (`:175-179`). `downloadBlob`: popup blocked in an iframe → error toast telling the user to allow pop-ups (`:213`); other exceptions → console.error + "Failed to save" toast (`:220-221`). `downloadFile`: `resolveDownloadBlob` throws on storage error or non-ok fetch (`:109-118`), caught → console.error + "Failed to download" toast (`:248-249`); AbortError anywhere → toast.dismiss and return (`:215-218,243-246`).
- Tests: `src/lib/fileDownload.test.ts` (see above) — `downloadBlob` only.
- Observed issues:
  - `downloadFile` first calls `openDownloadHandoffWindow({url, fileName})` (`:233`); when the popup is allowed this returns true and the function ends with an "Opened download tab" toast — the picker/anchor cascade and the Supabase SDK blob path (`:239-241`) run only when the popup is blocked.
  - `getDirectDownloadUrl` (`:153-157`) has zero importers (grep-verified) and duplicates `downloadHandoff.ts:20-24`.
  - `parseSupabaseStorageUrl` accepts `authenticated` URLs (`:34`) unlike `imageUrlResolver.extractStorageInfo` (`imageUrlResolver.ts:10-11`).
- ASSUMED: none.

## src/lib/fileValidation.ts
- Purpose: Validates File objects against size limits, MIME allowlists, and a suspicious-filename blocklist, toasting each failure; plus small format/classify helpers.
- Public surface:
  - `const FILE_LIMITS = { MAX_SIZE: 50MB, MAX_IMAGE_SIZE: 10MB, MAX_DOCUMENT_SIZE: 50MB }` (`fileValidation.ts:4-8`)
  - `const ALLOWED_MIME_TYPES = { images: [...7], documents: [...7], cad: [...8] }` (`:11-40`)
  - `interface FileValidationOptions { maxSize?; allowedTypes?: string[]; category?: keyof typeof ALLOWED_MIME_TYPES }` (`:42-46`)
  - `interface FileValidationResult { valid: boolean; error?; file? }` (`:48-52`)
  - `validateFile(file: File, options?): FileValidationResult` (`:57`)
  - `validateFiles(files: FileList | File[], options?): { valid; validFiles: File[]; errors: string[] }` (`:111`)
  - `formatFileSize(bytes: number): string` (`:138`)
  - `isImageFile(file: File): boolean` (`:151`), `isDocumentFile(file: File): boolean` (`:159`)
- Inputs & outputs: File objects in; result objects out. No storage, network, or persistence.
- Dependencies: uses -> `sonner` (`:1`). used by <- (grep-verified) H02 offline-domain-hooks: `src/hooks/useOfflineInspections.ts:6` and `src/hooks/useOfflineSubsections.ts:13`, both importing only `validateFile` and `FILE_LIMITS`. No other symbol has an external consumer (grep-verified).
- Side effects: `toast.error` fired inside `validateFile` on each of the three failure classes (`:71,81,100`) — validation and user notification are coupled.
- Error handling: never throws; failures return `{valid:false, error}` after toasting. `validateFiles` collects `"name: error"` strings and reports `valid` only when zero errors (`:119-132`).
- Tests: none (grep-verified).
- Observed issues:
  - MIME check is exact `file.type` string membership (`:79`); the suspicious-name patterns include `/\.\./` which matches any consecutive dots anywhere in the name (`:88`).
  - `validateFiles` triggers one toast per failing file via the inner `validateFile` calls.
  - `MAX_IMAGE_SIZE`/`MAX_DOCUMENT_SIZE` and the `cad` allowlist are exported but unreferenced anywhere in src (grep-verified via `FILE_LIMITS.` and `ALLOWED_MIME_TYPES` searches).
- ASSUMED: none.

## src/lib/imageNaming.ts
- Purpose: Generates storage paths for inspection/tenant photos and batch-renames existing images in the `inspection-photos` bucket by copy-then-delete, rewriting URLs inside an inspection's `json_data`.
- Public surface:
  - `sanitizeForFileName(str: string): string` (`imageNaming.ts:11`)
  - `interface ImagePathOptions { clientName?; siteName?; subsectionName?; inspectionId; sectionKey; itemKey; index?; fileExtension }` (`:21-30`)
  - `generateInspectionImagePath(options: ImagePathOptions): string` (`:32`) → `` `${inspectionId}/${sectionKey}/${itemKey}/${timestamp}[_${index+1}].${ext}` `` (`:41-49`)
  - `interface TenantImagePathOptions { inspectionId; tenantId; field; fileExtension; clientName?; siteName?; subsectionName? }` (`:55-64`)
  - `generateTenantImagePath(options): string` (`:66`) → `` `${inspectionId}/tenants/${tenantId}/${field}/${timestamp}.${ext}` `` (`:74-80`)
  - `extractPathFromUrl(url: string): string | null` (`:85`) — regex `inspection-photos\/(.+?)(?:\?|$)` (`:88`)
  - `async renameImage(oldPath, newPath): Promise<{ success; newUrl?; error? }>` (`:99`)
  - `async renameInspectionImages(inspectionId, clientName, siteName, subsectionName, jsonData: any): Promise<{ updatedJsonData; renamedCount; failedCount }>` (`:157`)
- Inputs & outputs: naming options / inspection `json_data` in; storage paths and a rewritten `json_data` clone out. Stores touched: bucket `inspection-photos` — download (`:110-112`), upload with `cacheControl '3600'`, `upsert: false` (`:125-130`), `getPublicUrl` (`:137-139`), fire-and-forget `remove` (`:142-145`).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, `:6`). used by <- V01 admin-entity-views (`src/views/InspectionDetail.tsx:28-31` imports `generateInspectionImagePath`, `generateTenantImagePath`, `renameInspectionImages`) (grep-verified). `sanitizeForFileName`, `extractPathFromUrl`, `renameImage` have no external consumers (grep-verified).
- Side effects: storage download/upload/delete per renamed image; `console.error` per failed rename (`:216,268`); does not write the `inspections` table — callers receive `updatedJsonData` to persist.
- Error handling: `renameImage` returns `{success:false, error}` on download failure/missing file (`:119-122`), upload failure (`:132-134`), or thrown error (`:148-151`); old-file deletion errors are swallowed (`:145`). `renameInspectionImages` keeps the original URL and increments `failedCount` on any per-image failure (`:213-217,266-268`); `extractPathFromUrl` returns null on no-match (`:85-94`).
- Tests: none (grep-verified).
- Observed issues:
  - Both path generators accept `clientName`/`siteName`/`subsectionName` but never use them (`:33-39` destructures neither; comment at `:60-61` says "kept for backward compatibility but not used in path"), yet the "already renamed" checks look for `sanitizeForFileName(clientName)`/`(siteName)` substrings in the path (`:186-187`, tenant variant `:248`) — substrings the generators never emit, so paths produced by a prior run do not satisfy the skip check.
  - The 10 s timeout in `renameImage` rejects with a plain object `{success:false, error:'Download timeout'}` (`:105-107`); the race is cast `as any` (`:114-117`), and the object rejection lands in the catch where `error.message` is undefined, so a timeout reports `'Unknown error'` (`:148-151`). The `.then(() => ({data:null, error:{message:'Timeout'}}))` mapper on the timeout promise can never run because that promise only rejects (`:116`).
  - The rename copies bytes (download→upload) rather than using a storage move/copy API.
- ASSUMED: intent of the client/site-name checks (guarding re-runs of an older naming scheme) — inferred from the "Check if already has the new naming format" comment (`:185`), not from any observed generator that embeds those names.

## src/lib/imagePathFixer.ts
- Purpose: Repairs broken photo URLs in inspections' `json_data` by listing actual files in the `inspection-photos` bucket and substituting their public URLs, at single-inspection, subsection, and whole-database scope.
- Public surface:
  - `async fixInspectionImagePaths(inspectionId: string): Promise<{ fixed: boolean; updatedPaths: number; error? }>` (`imagePathFixer.ts:7`)
  - `async fixAllSubsectionImagePaths(subsectionId: string): Promise<{ inspectionsFixed; totalPathsFixed }>` (`:167`)
  - `async fixAllInspectionImagePaths(): Promise<{ inspectionsProcessed; inspectionsFixed; totalPathsFixed }>` (`:197`)
  - Private: `getStorageFilesMap(inspectionId): Promise<Record<string, string[]>>` (`:100`)
- Inputs & outputs: inspection/subsection ids in; fix counts out. Stores touched: table `inspections` — select `json_data` by id (`:14-18`), update `json_data` (`:79-82`), select ids by `subsection_id` (`:171-174`), select all ids with non-null `json_data` (`:202-205`); bucket `inspection-photos` — three-level `.list()` with `limit: 50` each (`:105-107,118-120,142-144`) and `getPublicUrl` per file (`:129-131,151-153`).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, `:1`). used by <- none found (grep-verified: no hits for the module path or any of the three function names outside this file).
- Side effects: mutates `inspections.json_data` rows in the database; `console.error` on update failure or thrown error (`:85,92`).
- Error handling: every failure returns a result object — fetch failure (`:20-22`), missing json (`:25-27`), empty storage (`:32-34`), update failure (`:84-87`), catch-all `String(err)` (`:91-94`); the batch functions return zero-counts on query error (`:176-178,207-209`) and ignore per-inspection errors (only `result.fixed` is read, `:184-188,214-218`).
- Tests: none (grep-verified).
- Observed issues:
  - Zero importers anywhere in src/supabase (grep-verified) — all three exports are dead externally.
  - "Broken" detection is the regex `/\/\d+\/\d+\/\d+-\d+\.(jpg|jpeg|png|webp)$/i` (`:59`) — numeric section/item folders and hyphenated `timestamp-index` filenames; paths generated by `imageNaming.generateInspectionImagePath` use string keys and underscore filenames (`imageNaming.ts:43-49`), so current-format URLs never classify as broken.
  - `getStorageFilesMap` stores files found directly under a section folder under the one-part key `section.name` (`:127-133`), but the consumer only looks up two-part `${sectionKey}/${itemKey}` keys (`:53-54`), so those entries are never read.
  - Sections named `tenants`/`observations` are skipped (`:43`); tenant images are never repaired by this module.
  - Replacement substitutes positionally: `matchingFiles.slice(0, photos.length)` (`:64`) — file-listing order stands in for original photo order; folder-detection relies on `id === null` marking folders (comment `:112`).
- ASSUMED: that Supabase Storage `.list()` returns folders with `id === null` — asserted only by the in-code comment (`:112`), not verified against SDK behaviour here.

## src/lib/imageUrlResolver.ts
- Purpose: Parses storage URLs, recovers the "correct" image URL by listing the containing folder when a stored URL 404s, and fetches/compresses images to base64 JPEG data-URLs for PDF embedding.
- Public surface:
  - `extractStorageInfo(url: string): { bucket; path; fileName } | null` (`imageUrlResolver.ts:6`)
  - `async findCorrectImageUrl(url: string): Promise<string | null>` (`:33`)
  - `async fetchImageWithFallback(url: string): Promise<Blob | null>` (`:93`)
  - `async fetchImageAsDataUrl(url: string, maxWidth = 800, quality = 0.6): Promise<string | null>` (`:197`)
  - Private: `compressImage(blob, maxWidth = 800, quality = 0.6): Promise<string | null>` (`:123`)
- Inputs & outputs: storage URLs in; parsed info, corrected public URLs, Blobs, or JPEG data-URLs out. Stores touched: whichever bucket the URL names — `.list(folderPath, { limit: 100, sortBy: created_at asc })` (`:50-52`) and `getPublicUrl` (`:68-70,77-79`); network `fetch` of image URLs (`:96,108`).
- Dependencies: uses -> `@/integrations/supabase/client` (L19, `:1`). used by <- (grep-verified) C16 ui-utility-primitives (`src/components/RobustImage.tsx:4`, `findCorrectImageUrl`); L19 supabase-data-access (`src/lib/data/signedUrls.ts:12`, `extractStorageInfo`). `fetchImageWithFallback` and `fetchImageAsDataUrl` have no consumers (grep-verified).
- Side effects: network fetches; canvas creation and JPEG re-encoding; blob-URL create/revoke (`:159,179-185`); `console.error` in `findCorrectImageUrl`'s catch (`:85`).
- Error handling: `extractStorageInfo` returns null on no-match or throw (`:23-26`); `findCorrectImageUrl` returns null on unparseable URL, empty folder, list error, index out of range with >1 file, or any throw (`:35,43,54,59,83,84-87`); `fetchImageWithFallback` swallows both fetch failures and returns null (`:100-117`); `compressImage` resolves null on image error or missing canvas context — it never rejects (`:144-147,156,178-182`).
- Tests: none (grep-verified).
- Observed issues:
  - `compressImage` assigns `img.onload` twice: the handler at `:128-154` is replaced at `:163-189` (after `img.src` is set at `:160`), making the first handler dead code; only the second revokes the object URL, and the `onerror` path (`:156`) resolves null without revoking the object URL created at `:159`.
  - The two URL patterns in `extractStorageInfo` (`:9-12`): any string matching the second (`supabase.co/storage/v1/object/...`) also matches the first, so the second never produces the match.
  - The recovery filename regex `_(\d+)_(\d+)_(\d+)_(\d+)\.(ext)$` (`:47`) does not match filenames produced by `imageNaming.generateInspectionImagePath` (`timestamp[_index].ext`, `imageNaming.ts:45-46`); for such URLs recovery relies solely on the single-image fallback (`:76-81`).
  - Positional matching maps the filename's 1-based index to the created_at-ordered listing (`:63-72`).
- ASSUMED: the `..._SECTION_ITEM_TIMESTAMP_INDEX` filename pattern documented at `:46-47` belongs to a legacy naming scheme — inferred from the mismatch with current generators, not from observed legacy data.

## src/lib/inspectionImages.test.ts
- Purpose: Vitest suite for the pure photo-counting helpers.
- Public surface: none (test file).
- Inputs & outputs: literal json_data fixtures in; count/boolean assertions out.
- Dependencies: uses -> vitest; `./inspectionImages` (same unit) (`inspectionImages.test.ts:1-2`). used by <- none (test runner entry).
- Side effects: none.
- Error handling: n/a.
- Tests (what is actually asserted): `countInspectionPhotos` — sums section-item `photos[]` (3 across two items, `:5-8`); counts tenant `meterImage`/`breakerImage`/`ctRatioImage` (3, `:9-12`); ignores `generalInfo` (`:13-16`); returns 0 for `{}`/null/undefined/string (`:17-22`); tolerates null entries in `tenants` (`:23-26`). `inspectionHasImages` — true at ≥1 image; false for empty/null json_data and null/undefined inspection (`:29-36`).
- Observed issues: none.
- ASSUMED: none.

## src/lib/inspectionImages.ts
- Purpose: Single source of truth for "does this inspection carry photos", counting section-item `photos[]` arrays plus tenant meter/breaker/ctRatio images, mirroring what the Reports tab counts (`inspectionImages.ts:1-7`).
- Public surface:
  - `countInspectionPhotos(jsonData: unknown): number` (`:8`)
  - `inspectionHasImages(inspection: { json_data?: unknown } | null | undefined): boolean` (`:29`)
- Inputs & outputs: raw `json_data` in; integer/boolean out. No stores, no I/O (pure — stated at `:6` and observed: no imports, no calls beyond Object/Array).
- Dependencies: uses -> none. used by <- (grep-verified) C07 site-assets-inspections (`src/components/site/BulkInspectionReportGenerator.tsx:3`, `countInspectionPhotos`); L17 site-scoring-compliance (`src/lib/siteHealth.ts:8` and `src/lib/siteDeliverables.ts:14`, `inspectionHasImages`).
- Side effects: none.
- Error handling: non-object/null input returns 0 (`:9`); tenant entries accessed with optional chaining (`:14-16`); `generalInfo` excluded (`:18`); no throw paths.
- Tests: `src/lib/inspectionImages.test.ts` (see above) — covers both exports including null/undefined/non-object edges.
- Observed issues: any truthy `meterImage`/`breakerImage`/`ctRatioImage` value counts as one photo each (`:14-16`); section items count `photos.length` regardless of element content (`:20-22`).
- ASSUMED: the claim that this mirrors BulkInspectionReportGenerator's counting (`:4-6`) — taken from the file's own comment; the C07 component was not re-derived line-by-line for this spec.
