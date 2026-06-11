# Hooks Inventory — Part 1 (`src/hooks/*`, A–O)

**Scope:** First half (alphabetical) of `src/hooks/` — 11 files, from `use-mobile.tsx` through `useOfflineSubsections.ts`. Part 2 (`hooks-2.md`) covers `useOfflineSync` onward. Per-symbol deep docs: signature, returns, side effects, callers.

**Files covered:** 11. Common deps across these hooks: `@/integrations/supabase/client` (browser anon Supabase client — see [03-auth-and-access](../03-auth-and-access/)), `sonner` `toast`, `@tanstack/react-query`, Capacitor, and the IndexedDB libs in `@/lib/offline*` (documented in the lib chapters). The offline-write hooks all follow the same **"online-first, fall back to IndexedDB + queue mutation"** pattern via `useOfflineSync` ([hooks-2.md]).

Callers below come from grep over `src/**/*.{ts,tsx}` (excluding the defining file).

---

## `use-mobile.tsx`

### `useIsMobile(): boolean`
- **Purpose:** Reactive viewport check — true when width < 768px (`MOBILE_BREAKPOINT`).
- **Returns:** `boolean` (coerces the internal `boolean | undefined` with `!!`, so SSR/first-paint returns `false`).
- **State/effects:** `useState<boolean|undefined>`; effect subscribes to `window.matchMedia(max-width:767px)` `change` event, sets initial value from `window.innerWidth`, cleans up listener on unmount.
- **Callers:** `components/FloorPlanPinsList.tsx`, `components/ui/sidebar.tsx`, `views/ClientPortalSiteDetail.tsx`.
- **NOTES:** Re-exported as `useMobile` via `components/ui/use-toast.ts`? No — that's the toast shim; this hook stands alone. Reads `window` in effect only (SSR-safe).

---

## `use-toast.ts`

Vendored shadcn toast store (module-level reducer + listener pattern, `TOAST_LIMIT = 1`, `TOAST_REMOVE_DELAY = 1_000_000` ms). Separate from the app's primary `sonner` toasts which most hooks use directly.

### `reducer(state, action): State`
- Exported pure reducer for the toast store (`ADD_TOAST`/`UPDATE_TOAST`/`DISMISS_TOAST`/`REMOVE_TOAST`). `DISMISS_TOAST` has a documented side effect (`addToRemoveQueue`).
- **NOTES:** **Exported but no external callers** — only consumed internally via module-level `dispatch`. Effectively a dead export (test seam at most).

### `toast(props: Omit<ToasterToast,"id">)`
- **Signature:** `toast({ title?, description?, action?, ...ToastProps }) → { id, dismiss, update }`.
- **Purpose:** Imperative fire of a toast; dispatches `ADD_TOAST` with generated id, wires `onOpenChange` to auto-dismiss.
- **Side effects:** mutates module-level `memoryState`, notifies all `listeners`.
- **Callers:** `views/QRCodes.tsx`, `views/Calendar.tsx`, `components/LabeledQRCode.tsx`, re-exported by `components/ui/use-toast.ts` and consumed by `components/ui/toaster.tsx`.

### `useToast(): State & { toast, dismiss }`
- **Returns:** `{ toasts, toast, dismiss(toastId?) }`.
- **State/effects:** subscribes `setState` to module `listeners` on mount; effect dep is `[state]` (re-subscribes each state change — harmless but unusual).
- **Callers:** `components/ui/toaster.tsx` (renders the toast list); `LabeledQRCode`, `QRCodes`, `Calendar` via the `ui/use-toast` shim.

---

## `useCamera.ts`

Capacitor/web photo-capture abstraction. Module-private helpers: `convertHeicToJpeg` (dynamic-imports `heic2any`, falls back to original on error), `isMobileDevice` (UA sniff), `capturePhotoWeb` (hidden `<input type=file>` with iOS-Safari workarounds: off-screen DOM insertion, `visibilitychange`/`focus` cancel-detection, `capture=environment` when `preferCamera`).

### `useCamera()`
- **Signature:** `useCamera() → { isNative, isMobile, takePicture, selectImages, hasCamera }`.
- **Returns:**
  | Member | Type | Meaning |
  |---|---|---|
  | `isNative` | `boolean` | `Capacitor.isNativePlatform()` |
  | `isMobile` | `boolean` | UA-based mobile detection |
  | `takePicture(options?)` | `(CameraOptions?) => Promise<File\|null>` | single photo; native → `Camera.getPhoto` (checks/requests perms, `CameraResultType.Uri`, fetch→Blob→File, HEIC→JPEG); web → `capturePhotoWeb` single. Returns `null` on cancel. |
  | `selectImages(options?)` | `(CameraOptions?) => Promise<File[]>` | multi-pick; native → `Camera.pickImages` (limit 10); web → `capturePhotoWeb` multiple (or camera if `preferCamera`+mobile). |
  | `hasCamera` | `() => Promise<boolean>` | `enumerateDevices` videoinput probe, falls back to `isMobileDevice()`. **Returned but no caller uses it.** |
- **`CameraOptions`** (exported interface): `quality?`, `allowEditing?`, `resultType?`, `source?`, `preferCamera?`, `multiple?`.
- **Side effects:** permission prompts (native), DOM input element (web), dynamic `heic2any` import, `fetch()` on webPath, console logging.
- **Callers (10):** `views/InspectionDetail.tsx`, `views/ClientDetail.tsx`, `hooks/useOfflinePhotos.ts`, `components/{OfflineImageGallery,DynamicFieldManager,SiteDrawingInspection,FloorPlanPinModal,BeforeAfterComparison}.tsx`, `components/site/{SiteEditDialog,SiteImages}.tsx`.

---

## `useContractorSites.tsx`

### `useContractorSites(previewSiteId?: string)`
- **Purpose:** React Query hook returning the sites a contractor is assigned to (or a single previewed site for Admins).
- **Returns:** `UseQueryResult<Site[]>`; query key `["contractor-sites", previewSiteId]`.
- **Behavior:**
  - Reads `userRole` via `useUserRole`.
  - If `userRole === "Admin"` && `previewSiteId` → fetches that one `sites` row (with `clients(...)` join).
  - Else → joins `user_sites` ⋈ `sites` filtered by `user.id`.
  - Each site's `site_image_url` is replaced with a 1-hour signed URL via module-private `generateSignedUrl` (splits on `/site-images/`, `storage.createSignedUrl(path, 3600)`; falls back to original URL on failure).
- **Side effects:** `supabase.auth.getUser()`, storage signed-URL creation per site.
- **Callers:** `views/ContractorPortal.tsx`, `views/ContractorSites.tsx`, `views/ContractorDashboard.tsx`.
- **NOTES:** Admin preview branch trusts a client-passed `previewSiteId`; access is governed by RLS on `sites` (see [03-auth-and-access](../03-auth-and-access/)).

---

## `useGlobalSearch.ts`

Cross-entity search over clients/sites/subsections/inspections. Exports types `SearchResultType`, `SearchResult`, `SearchFilters`. Module-private `sanitizeSearchQuery` strips PostgREST `.or` delimiters `,()` and backslash-escapes LIKE wildcards `%_` (guards against malformed-filter 400s).

### `useGlobalSearch(searchQuery, filters = {})`
- **Signature:** `(searchQuery: string, filters?: SearchFilters) → UseQueryResult<SearchResult[]>`.
- **Returns:** flat `SearchResult[]` (each: `id,type,title,subtitle?,description?,url,metadata?`). Query key `["global-search", searchQuery, filters]`; `enabled` only when `searchQuery.length >= 2`.
- **Behavior:** runs four sequential `ilike`/`.or` queries (clients, sites, subsections, inspections), each `.limit(10)`; applies `filters` (clientIds/siteTypes/cocStatuses/inspectionStatuses/dateFrom/dateTo); builds nav URLs (client-scoped vs site-scoped). Client filter on subsections/inspections is applied **in JS** (nested join can't filter server-side).
- **Callers:** `components/GlobalSearch.tsx`.

### `useSearchFilterOptions()`
- **Returns:** `{ clients[], siteTypes[], cocStatuses[], inspectionStatuses[] }`. Two queries (all clients `id,name`; distinct non-null `site_type`); `cocStatuses`/`inspectionStatuses` are hardcoded literal arrays.
- **Callers:** `components/GlobalSearch.tsx`.

---

## `useImageUpload.ts`

Client-side image pipeline (HEIC→JPG, Canvas compression to ~100KB) + Supabase Storage upload with retry. Module const `COMPRESSION_CONFIG` (maxWidth 800, quality 0.7, target 100KB). Uses `sonner` toast.

### `useImageUpload()`
- **Returns:** `{ uploadImage, deleteImage, refreshSignedUrl, getPathFromUrl, validateImageUrl, uploading }`.

| Member | Signature | Behavior |
|---|---|---|
| `uploading` | `boolean` (state) | upload-in-progress flag |
| `uploadImage` | `(file, bucket, path, retries=3, options?) → Promise<UploadResult\|null>` | HEIC→JPG (`convertHeicToJpg`, private) → Canvas compress (`compressImageForUpload`, private) → forces `.jpg` path → `storage.upload(upsert:false)` with exp-backoff retry; on duplicate, re-tries with timestamped name; verifies via `.list`; returns **public** URL; fires server `compress-image` edge fn (non-blocking) when `bucket==='inspection-photos'`. Toasts on JWT-expiry vs generic failure. |
| `deleteImage` | `(bucket, path) → Promise<boolean>` | `storage.remove([path])`; toast on error |
| `refreshSignedUrl` | `(bucket, path) → Promise<string\|null>` | `createSignedUrl(path, 31536000)` (365 days). **NOTES: no callers — dead export.** |
| `getPathFromUrl` | `(url, bucket) → string\|null` | regex-extracts storage path from signed/public URL |
| `validateImageUrl` | `(url, bucket) → Promise<string\|null>` | lists folder, returns exact or most-recent-image public URL. **NOTES: no callers — dead export.** |

- Private helper `triggerServerCompression(path, bucket)` — fire-and-forget `supabase.functions.invoke('compress-image', ...)`.
- **Side effects:** Canvas/DOM, dynamic `heic2any` import, Supabase Storage writes, edge-function invoke, toasts.
- **Callers:** `views/InspectionDetail.tsx` (uses `uploadImage,deleteImage,getPathFromUrl`), `components/BeforeAfterComparison.tsx`.
- **NOTES:** uploads to **public** buckets via the browser anon client; `refreshSignedUrl` + `validateImageUrl` are unused. Duplicate of the HEIC-convert + Canvas-compress logic also present in `useCamera.ts` and `useOfflinePhotos.ts` / `useOfflineInspectionDetail.ts` (compression duplicated across ≥4 files).

---

## `useOfflineFloorPlanAnnotations.ts`

Online-first CRUD for floor-plan pins/markups/measurements, falling back to IndexedDB (`@/lib/offlineFloorPlanDB`) + `queueMutation`. Private type `PinData`.

### `useOfflineFloorPlanAnnotations()`
- **Returns:** `{ addPin, updatePin, deletePin, addMarkup, removeMarkup, addMeasurement, removeMeasurement, getOfflineAnnotations, isOnline }`. All actions are `useCallback`-memoized on `[isOnline, queueMutation]`.

| Action | Signature | Behavior |
|---|---|---|
| `addPin` | `(floorPlanId, x, y, pinNumber, userId) → Promise<pin>` | online: insert `floor_plan_pins` (type `snag`, status `open`); offline: `saveOfflinePin` + queue `ADD_FLOOR_PLAN_PIN` |
| `updatePin` | `(pinId, updates: PinData, photo?: File) → Promise<void>` | online: optional photo upload to `inspection-photos` (**public URL**), then update row; offline: merge into IndexedDB pin + queue `UPDATE_FLOOR_PLAN_PIN` |
| `deletePin` | `(pinId) → Promise<void>` | online delete or offline `deleteOfflinePin` + queue `DELETE_FLOOR_PLAN_PIN` |
| `addMarkup` | `(floorPlanId, markupType, vectorData, color='#ef4444', strokeWidth=2) → markup` | saves to IndexedDB always; queues `ADD_MARKUP` when online |
| `removeMarkup` | `(markupId) → void` | `deleteMarkup` + queue `DELETE_MARKUP` (online) |
| `addMeasurement` | `(floorPlanId, startX, startY, endX, endY, value, unit='m', label?) → measurement` | IndexedDB save + queue `ADD_MEASUREMENT` (online) |
| `removeMeasurement` | `(measurementId) → void` | `deleteMeasurement` + queue `DELETE_MEASUREMENT` |
| `getOfflineAnnotations` | `(floorPlanId) → { pins, markups, measurements }` | parallel reads from offlineFloorPlanDB |

- **NOTES:** markup/measurement `synced` flag is set to `!isOnline` (i.e. when offline they're marked synced=true, when online synced=false then queued) — inverted-looking convention worth flagging. On online failure all ops `console.error` but silently fall through to offline.
- **Callers:** `components/InteractiveFloorPlan.tsx`, `views/OfflineReview.tsx`.

---

## `useOfflineInspectionDetail.ts`

Local cache + offline-edit layer for a single inspection, backed by `@/lib/offlineInspectionDB`. Module-private `compressImage(file, maxWidth=800, quality=0.7)` (Canvas).

### `useOfflineInspectionDetail({ inspectionId, autoCache=true })`
- **Params:** `UseOfflineInspectionDetailOptions { inspectionId: string; autoCache?: boolean }`.
- **State:** `isOnline` (from `navigator.onLine` + online/offline listeners), `isCached`, `isLoading`, `cachedData: CachedInspection|null`, `offlineImages: OfflineInspectionImage[]`, `hasPendingChanges`, `lastSyncTime`.
- **Effects:** (1) window online/offline listeners; (2) on `inspectionId` change → checks cache, loads cached row + images.
- **Returns (actions):**
  | Action | Signature | Behavior |
  |---|---|---|
  | `cacheInspection` | `(inspectionData, templateData, siteData, subsectionData) → Promise<bool>` | writes `CachedInspection` (+ separate `CachedTemplate`) to IndexedDB; background LRU evict (50 inspections / 20 templates) |
  | `getCachedInspection` | `() → Promise<CachedInspection\|null>` | passthrough read |
  | `saveInspectionSection` | `(sectionKey, itemKey, {status?,notes?}) → Promise<bool>` | deep-merges into `json_data`, marks `pending_changes` |
  | `addOfflineImage` | `(file\|blob, sectionKey, itemKey?) → Promise<blobUrl\|null>` | compresses, stores blob in IndexedDB, returns object URL for preview |
  | `getSectionImages` | `(sectionKey) → { onlineImages[], offlineImages[] }` | merges cached `json_data` photo URLs with offline blobs |
  | `deleteOfflineImage` | `(imageId) → Promise<bool>` | removes from IndexedDB + state |
  | `getCacheStats` | `() → stats` | passthrough |
  | `isAvailableOffline` | `(id?) → Promise<bool>` | cache-presence check |
  | `clearCache` | `() → Promise<bool>` | deletes cached inspection + its images |
- **`autoCache` param: accepted but never read** — caching is driven by explicit `cacheInspection` calls (NOTE: misleading/unused param).
- **Side effects:** IndexedDB reads/writes, `URL.createObjectURL` (preview URLs not revoked here), toasts on image failure.
- **`autoCache`/`isLoading`:** `isLoading` is declared but never set to `true` anywhere.
- **Callers:** `views/InspectionDetail.tsx`.

---

## `useOfflineInspections.ts`

Online-first inspection create/update/delete + image upload, IndexedDB fallback (`@/lib/offlineDB`). Exports `InspectionData` interface.

### `useOfflineInspections()`
- **Returns:** `{ createInspection, updateInspection, deleteInspection, uploadImage, isOnline }` (all `useCallback` on `[isOnline, queueMutation]`).

| Action | Signature | Behavior |
|---|---|---|
| `createInspection` | `(data: InspectionData) → Promise<inspection>` | online: insert `inspections`; offline: `offlineDB.saveInspection` + queue `CREATE_INSPECTION`. Generates `offline_<ts>_<rand>` id. |
| `updateInspection` | `(id, updates: Partial<InspectionData>) → Promise<void>` | online update or queue `UPDATE_INSPECTION` |
| `deleteInspection` | `(id) → Promise<void>` | online delete or queue `DELETE_INSPECTION` |
| `uploadImage` | `(bucket, path, file, inspectionId?) → Promise<void>` | `validateFile` (`@/lib/fileValidation`, `MAX_IMAGE_SIZE`) + `checkStorageAvailable` quota guard; online `storage.upload`; offline `offlineDB.saveImage` + queue `UPLOAD_IMAGE` |
- **NOTES:** offline `updateInspection`/`deleteInspection` only queue the mutation — they do **not** mutate any locally-cached copy, so an offline edit won't reflect in offline reads until sync.
- **Callers:** `views/Inspections.tsx`, `views/OfflineReview.tsx`.

---

## `useOfflinePhotos.ts`

Full offline photo-capture + adaptive-sync engine for COC and other contexts. Bucket `coc-photos` (`PHOTOS_BUCKET`), `MAX_RETRIES = 3`, `SYNC_PRIORITY` map (coc<document<inspection<floor_plan<site). Private helpers: `getConnectionQuality` (navigator.connection), `generateThumbnail` (200px), `compressImage` (standard 800/0.7 vs aggressive 500/0.5), `getGPSCoordinates` (5s-timeout geolocation).

### `useOfflinePhotos(contextType, contextId?)`
- **Params:** `contextType: OfflinePhotoContextType`, `contextId?: string`.
- **State:** `photos`, `pendingCount`, `pendingSizeBytes`, `isSyncing`, `isCapturing`, `syncPaused`, `isOnline` (snapshot of `navigator.onLine`). `syncingRef` guards re-entrancy.
- **Effects:** load photos on `[loadPhotos]`; auto-sync on `online` event + on mount when online and not paused.
- **Returns (actions):**
  | Action | Behavior |
  |---|---|
  | `loadPhotos` | reads `getOfflinePhotosByContext`, sorts desc, recomputes pending count/size |
  | `capturePhoto(photoType, options?)` | `useCamera().takePicture` → adaptive compress + thumbnail + GPS + `auth.getUser()`; `id: crypto.randomUUID()`; saves `OfflinePhoto` to IndexedDB |
  | `syncPhotos` | uploads all unsynced (priority-sorted) to `coc-photos` (**public URL**); writes DB row to `coc_compliance_photos` for `coc` context else `offline_photos`; increments `retry_count`/`sync_error` on failure; re-compresses on cellular |
  | `deletePhoto(id)` | removes storage object + DB row (if synced) then IndexedDB |
  | `getPhotoPreviewUrl` / `getPhotoFullUrl` | remote URL or object URL (thumbnail vs full) |
  | `pauseSync` / `resumeSync` | toggle `syncPaused`; resume triggers a sync |
- **Side effects (security-relevant):** browser anon client **writes** to Storage (`coc-photos`, `upsert:true`) and to tables `coc_compliance_photos` / `offline_photos`; public URLs generated. GPS captured into rows. Governed by RLS — cross-ref [GAPS.md](../GAPS.md) / [SECURITY-FINDINGS-phase2](../SECURITY-FINDINGS-phase2.md).
- **Callers:** `components/OfflinePhotoGallery.tsx`.

---

## `useOfflineSubsections.ts`

Online-first subsection update + document/floor-plan upload, IndexedDB fallback (`@/lib/offlineDBExtensions`). Private `SubsectionData` interface.

### `useOfflineSubsections()`
- **Returns:** `{ updateSubsection, uploadDocument, uploadFloorPlan, getOfflineData, isOnline }`.

| Action | Signature | Behavior |
|---|---|---|
| `updateSubsection` | `(id, updates: Partial<SubsectionData>) → Promise<void>` | online: update `subsections`; offline: merge into IndexedDB subsection (must already exist) + queue `UPDATE_SUBSECTION` |
| `uploadDocument` | `(subsectionId, categoryId, file) → Promise<void>` | `validateFile`(`MAX_DOCUMENT_SIZE`,documents) + quota; online: `storage.upload('documents')` (**public URL**) + insert `subsection_documents`; offline: `saveDocument` blob + queue `UPLOAD_DOCUMENT` |
| `uploadFloorPlan` | `(subsectionId, file) → Promise<void>` | same as above but `images` category + insert `subsection_floor_plans`; queue `UPLOAD_FLOOR_PLAN` |
| `getOfflineData` | `(subsectionId) → { subsection, documents, floorPlans }` | parallel IndexedDB reads |
- **Side effects (security-relevant):** browser anon client writes to `documents` bucket (public URLs) and inserts into `subsection_documents` / `subsection_floor_plans`.
- **Callers:** `views/OfflineReview.tsx`, `views/subsection-detail/useSubsectionDetail.ts`.

---

## Cross-cutting NOTES

- **Dead exports:** `reducer` (`use-toast.ts`), `refreshSignedUrl` + `validateImageUrl` (`useImageUpload.ts`), `hasCamera` (returned by `useCamera` but never consumed). `autoCache` param of `useOfflineInspectionDetail` is accepted but unused; its `isLoading` state is never set true.
- **Duplicated image logic:** HEIC→JPEG conversion and Canvas-based compression are re-implemented in `useCamera.ts`, `useImageUpload.ts`, `useOfflineInspectionDetail.ts`, and `useOfflinePhotos.ts` (4 copies, slightly differing params).
- **Security-relevant client writes (browser anon client):** `useOfflinePhotos` (Storage `coc-photos` + tables `coc_compliance_photos`/`offline_photos`, with GPS), `useOfflineSubsections` (Storage `documents` + `subsection_documents`/`subsection_floor_plans`), `useOfflineFloorPlanAnnotations`/`useOfflineInspections` (Storage + `floor_plan_pins`/`inspections`), `useImageUpload`/`useContractorSites` (Storage public/signed URLs). All rely on RLS — see [03-auth-and-access](../03-auth-and-access/), [GAPS.md](../GAPS.md), [SECURITY-FINDINGS-phase2.md](../SECURITY-FINDINGS-phase2.md).
- **Offline-update gap:** `useOfflineInspections.updateInspection`/`deleteInspection` only queue mutations offline without updating any local cache (contrast `useOfflineSubsections`/`useOfflineFloorPlanAnnotations` which merge locally).
