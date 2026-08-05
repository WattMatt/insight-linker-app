# C13 — offline-pwa

- Unit id: C13
- Slug: offline-pwa
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 6

## Unit header

**Unit purpose.** Six presentational/utility components for the PWA's offline story: two globally mounted singletons (a connectivity/queue indicator and a service-worker update applier), one props-driven offline status banner used by InspectionDetail, and three offline media/banner components (two image galleries and a subsection banner pair). All are client components; none defines its own data layer — data comes in via props or via the offline hooks in H01/H02 and the IndexedDB layer in L11.

**Module-level observations (cross-file, verified).**
- Consumption is split: OfflineIndicator and ServiceWorkerUpdater are mounted app-wide in `src/app/providers.tsx:21-22` (A01), which itself wraps the root layout (`src/app/layout.tsx:2,45`); InspectionOfflineBanner has exactly one consumer (`src/views/InspectionDetail.tsx:32,2237`, V01); the remaining three files — OfflineImageGallery.tsx, OfflinePhotoGallery.tsx, OfflineSubsectionEnhancements.tsx (both its exports) — have zero importers (grep-verified across `src` and `supabase`).
- No test file anywhere in the repo references any of the six components (grep for each component name against `*.test.*` returned nothing).
- Two toast mechanisms appear in the unit's dependency set: `toast` from the npm package `sonner` (OfflineImageGallery.tsx:8, ServiceWorkerUpdater.tsx:4; `sonner` at package.json:81) rendered by the `<Sonner />` mount at providers.tsx:20, while the rest of the app's shadcn toaster (`@/components/ui/toaster`, C01) is mounted alongside it at providers.tsx:19.
- Each component styles its offline/pending state with a different palette: destructive red (OfflineIndicator.tsx:15), destructive/primary tokens (InspectionOfflineBanner.tsx:63-66), amber (OfflinePhotoGallery.tsx:172,181), orange and blue raw Tailwind colors (OfflineSubsectionEnhancements.tsx:28,44).
- An untracked duplicate `src/app/providers 2.tsx` (git status `??`) also imports OfflineIndicator (its lines 9, 26) but not ServiceWorkerUpdater; the tracked `src/app/providers.tsx` is the canonical consumer.

**External contract.** The rest of the app gets: (1) an always-mounted bottom-right connectivity/queue pill wired to the H01 sync engine; (2) an always-mounted, render-null service-worker update watcher that toasts and/or reloads the page when a new deploy's worker is installed; (3) `InspectionOfflineBanner`, a pure-props status strip for the inspection editor; (4) three exported but currently unconsumed offline-media components (`OfflineImageGallery`, `OfflinePhotoGallery`, `OfflineSubsectionEnhancements` + `OfflineDocumentBadge`).

---

## src/components/OfflineIndicator.tsx

- Purpose: Fixed bottom-right pill showing offline state or pending-mutation queue size, with a manual sync trigger.
- Public surface: `export function OfflineIndicator(): JSX.Element | null` (line 6) — no props.
- Inputs & outputs: In — `{ isOnline, queueSize, isSyncing, processQueue }` from `useOfflineSync()` (line 7; hook return shape verified at src/hooks/useOfflineSync.ts:560-567). Out — renders `null` when online with empty queue (line 9); otherwise a fixed `z-50` pill (lines 12-45): online branch shows "Syncing..."/"N queued" plus a refresh Button calling `processQueue` (lines 18-33); offline branch shows "Offline Mode" and a "N pending" count (lines 34-43). Stores — none directly; the queue behind `queueSize` lives in localStorage under `OFFLINE_QUEUE_KEY` inside the hook (src/hooks/useOfflineSync.ts:6,61,70 — H01).
- Dependencies: uses -> `lucide-react` (line 1, external), `@/hooks/useOfflineSync` (line 2, H01), `@/components/ui/button` (line 3, C01), `@/lib/utils` `cn` (line 4, L18). used by <- A01 root-shell (`src/app/providers.tsx:8,22`); also the untracked duplicate `src/app/providers 2.tsx:9,26` (grep-verified; not in any manifest unit).
- Side effects: None of its own; clicking the refresh button invokes `processQueue` from H01 (line 27), which performs the network drain. H01's module-level comment names this component as one of the multi-mount cases coordinated by its synchronous drain lock (src/hooks/useOfflineSync.ts:19-21).
- Error handling: None in this file; no try/catch. `processQueue` errors are handled (or not) inside H01.
- Tests: none found (grep-verified — no `*.test.*` file references `OfflineIndicator`).
- Observed issues: None observed within the file.
- ASSUMED: none.

## src/components/InspectionOfflineBanner.tsx

- Purpose: Props-driven status strip for the inspection editor showing offline/cached/pending-changes state, last-sync time, pending image count, and a Sync Now button.
- Public surface: `export function InspectionOfflineBanner(props: InspectionOfflineBannerProps): JSX.Element` (line 18); props `{ isOnline: boolean; isCached: boolean; hasPendingChanges: boolean; lastSyncTime: Date | null; pendingImageCount?: number; onSyncNow?: () => void; isSyncing?: boolean }` (lines 8-16; defaults `pendingImageCount = 0`, `isSyncing = false`, lines 23-25).
- Inputs & outputs: In — props only; no hooks besides local `useState`/`useEffect`. Out — one of two renders: a compact "Available Offline" tooltip badge when `!isVisible && isCached && isOnline` (lines 34-58), else the full banner with three variants — offline (destructive, lines 62-64, 74-84), unsaved-changes (primary, lines 65-67, 85-89), online (muted, line 68, 90-95) — plus pending-image Badge (lines 97-101), last-synced clock via `date-fns` `format` (lines 103-108), a "Sync Now" button gated on `isOnline && hasPendingChanges && onSyncNow` (lines 112-132), and a "Changes will sync when connected" note when offline (lines 134-138). Stores — none.
- Dependencies: uses -> `lucide-react`, `date-fns` (lines 2, 6, external), `@/components/ui/{badge,button,tooltip}` (lines 3-5, C01). used by <- V01 admin-entity-views (`src/views/InspectionDetail.tsx:32`, rendered at `:2237-2245` with `isOnline/isCached/hasPendingChanges/lastSyncTime/pendingImageCount/onSyncNow={processQueue}/isSyncing`).
- Side effects: None. `useEffect` (lines 29-32) only sets local `isVisible` state from props.
- Error handling: None; pure rendering.
- Tests: none found (grep-verified).
- Observed issues:
  - `isVisible` gates only the compact branch (line 34), not the main return: with `isVisible === false`, `isOnline === true`, `isCached === false`, the full banner still renders in its "Online" variant (lines 90-95).
  - `isVisible` is derived from props inside a `useEffect` (lines 29-32) rather than during render, so the first render after mount (and the render immediately following any prop change) uses the previous state value; initial value is `false` (line 27).
- ASSUMED: none.

## src/components/OfflineImageGallery.tsx

- Purpose: Mixed gallery of synced (URL-based) and offline (blob-URL) images with camera capture, file upload, delete, fullscreen viewing, and sync-status badges.
- Public surface: `export function OfflineImageGallery(props: OfflineImageGalleryProps): JSX.Element` (line 28); props `{ onlineImages: string[]; offlineImages: OfflineImage[]; onAddImage: (file: File | Blob) => Promise<string | null>; onDeleteOfflineImage?: (imageId: string) => Promise<boolean>; onDeleteOnlineImage?: (imageUrl: string) => Promise<boolean>; isOnline: boolean; disabled?: boolean; maxImages?: number; title?: string }` (lines 16-26; defaults `disabled=false`, `maxImages=50`, `title='Images'`, lines 35-37). Local `OfflineImage` interface `{ id: string; blobUrl: string; synced: boolean }` (lines 10-14, not exported).
- Inputs & outputs: In — props plus `{ isNative, takePicture, selectImages }` from `useCamera()` (line 39; hook returns `{ isNative, isMobile, takePicture, selectImages, hasCamera }`, src/hooks/useCamera.ts:288-294). Out — header with count badge and "N pending sync" badge (lines 154-166), Take/Add Photo and Upload buttons (lines 168-196), hidden `<input type="file" accept="image/*" multiple capture="environment">` (lines 199-207), empty state (lines 209-216), grid of online images via `RobustImage` with Synced badge and zoom/delete overlay (lines 218-260) and offline images via plain `<img src={blobUrl}>` with Synced/Offline badge and zoom/delete overlay (lines 262-324), and `FullscreenImageViewer` when `viewingImage` is set (lines 328-333). All persistence flows out through the `onAddImage`/`onDelete*` callbacks. Stores — none directly.
- Dependencies: uses -> `lucide-react`, `sonner` (lines 2, 8, external), `@/components/ui/{button,badge}` (lines 3-4, C01), `@/components/RobustImage` and `@/components/FullscreenImageViewer` (lines 5-6, C16), `@/hooks/useCamera` (line 7, H02). used by <- none found (grep-verified).
- Side effects: `URL.revokeObjectURL` on unmount for blob URLs (lines 46-54); native camera capture via `takePicture()` (line 65); `toast.success/warning/error` calls (lines 68, 93, 101, 105, 123, 127, 144, 148); browser `confirm()` dialog before online delete (line 139); resets `fileInputRef.current.value` after selection (lines 109-111). Network/storage I/O happens only inside the caller-supplied callbacks.
- Error handling: All four handlers wrap in try/catch, `console.error` + `toast.error`, then reset busy state in `finally` (`handleCapture` lines 74-79, `handleFileSelect` lines 103-112, `handleDeleteOffline` lines 125-134, `handleDeleteOnline` lines 146-149). Per-image deletes track in-flight ids in a `deletingIds` Set (lines 43, 118, 129-133). File selection over the `maxImages` cap slices the list and warns (lines 89-94).
- Tests: none found (grep-verified).
- Observed issues:
  - `selectImages` is destructured from `useCamera()` (line 39) but never used anywhere in the file (grep-verified within the file).
  - The blob-URL cleanup effect (lines 46-54) has an empty dependency array while referencing `offlineImages`, so on unmount it revokes only the blob URLs present in the first render's `offlineImages` array.
  - Zero importers (grep-verified) — the component is exported but unconsumed.
  - On the web path, `handleCapture` sets `isUploading` true, synchronously triggers `fileInputRef.current?.click()`, then resets `isUploading` to false in `finally` (lines 62-79); the actual busy state for the upload is managed separately in `handleFileSelect` (lines 85, 106).
  - Online-image delete uses the browser-native `confirm()` dialog (line 139) rather than the app's dialog components.
- ASSUMED: the `OfflineImage` prop shape `{ id, blobUrl, synced }` is assumed to correspond to what the H02 offline image hooks produce — unverifiable from consumers, since no file imports this component.

## src/components/OfflinePhotoGallery.tsx

- Purpose: Card-based offline evidence-photo gallery bound to `useOfflinePhotos`, with typed capture, notes, pause/resume sync, retry-on-error, GPS/size metadata, and a fullscreen dialog viewer.
- Public surface: `export function OfflinePhotoGallery(props: OfflinePhotoGalleryProps): JSX.Element` (line 43); props `{ contextType: OfflinePhotoContextType; contextId: string; secondaryContextId?: string; photoTypes?: OfflinePhotoType[]; allowCapture?: boolean; maxPhotos?: number; onPhotoLinked?: (photoId: string, remoteUrl: string) => void; title?: string; description?: string }` (lines 31-41; defaults `allowCapture=true`, `maxPhotos=50`, `title='Evidence Photos'`, lines 48-51). Module constant `ALL_PHOTO_TYPE_LABELS: Record<string,string>` (lines 16-29, not exported).
- Inputs & outputs: In — `useOfflinePhotos(contextType, contextId)` supplying `photos, pendingCount, pendingSizeBytes, isSyncing, isCapturing, isOnline, syncPaused, capturePhoto, syncPhotos, deletePhoto, getPhotoPreviewUrl, pauseSync, resumeSync` (lines 54-68; hook return shape verified at src/hooks/useOfflinePhotos.ts:331-348). Photos are client-filtered by `secondaryContextId` and `photoTypes` (lines 71-80); per-context default type lists at lines 84-90 keyed by the 5 `OfflinePhotoContextType` values (type defined src/lib/offlineDB.ts:94). Out — pending badge (lines 171-175), offline Alert (lines 180-187), type Select + Capture button + notes Textarea (lines 190-226), Sync Now / Pause-Resume controls with pending byte size (lines 229-257), thumbnail grid with synced/error/pending badges and per-photo retry button (lines 260-298), and a Dialog viewer with delete, timestamp, GPS, size, sync status, notes, and sync-error alert (lines 306-365). `onPhotoLinked(photoId, remoteUrl)` fires once per newly-synced photo, deduplicated via a `useRef<Set>` (lines 127-136). Stores — IndexedDB: reads/writes flow through H02/L11; additionally `handleRetrySync` writes directly via `offlineDB.saveOfflinePhoto` (lines 149-150; method at src/lib/offlineDB.ts:388).
- Dependencies: uses -> `@/components/ui/{card,button,badge,select,textarea,dialog,alert}` (lines 2-8, C01), `lucide-react` (lines 9-12, external), `@/hooks/useOfflinePhotos` (line 13, H02), `@/lib/offlineDB` types `OfflinePhotoType`/`OfflinePhotoContextType`/`OfflinePhoto` (line 14, type-only) plus a dynamic runtime `import('@/lib/offlineDB')` (line 149) — both L11. used by <- none found (grep-verified).
- Side effects: `URL.createObjectURL` for the fullscreen view of unsynced photos with revoke on change/close (lines 100-113); preview-URL map built per render cycle and revoked in effect cleanup (lines 115-124; URLs are minted inside H02's `getPhotoPreviewUrl`, src/hooks/useOfflinePhotos.ts:306-310); `capturePhoto` triggers camera + compression + GPS + IndexedDB save inside H02 (line 142); `syncPhotos`/`deletePhoto`/`pauseSync`/`resumeSync` delegate to H02; direct IndexedDB write in `handleRetrySync` (lines 146-152); `onPhotoLinked` callback emission (lines 128-136).
- Error handling: None in this file — no try/catch; capture/sync/delete failures are handled inside H02. Per-photo sync errors arrive as data (`photo.sync_error`) and render as a "!" badge (line 278), a retry button (lines 288-295), and a dialog alert showing "Retry {retry_count}/3" (lines 355-361). `handleCapture` silently returns when `photos.length >= maxPhotos` (lines 139-141).
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers (grep-verified) — exported but unconsumed.
  - `handleRetrySync` mutates the `photo` object held in hook state in place (`photo.retry_count = 0; photo.sync_error = null`, lines 147-148) and persists it via a dynamically imported `offlineDB.saveOfflinePhoto` (lines 149-150), bypassing the H02 hook's own state management.
  - The preview-URL effect (lines 115-124) revokes and re-mints object URLs on every change of `photos` or `getPhotoPreviewUrl`; H02's `getPhotoPreviewUrl` creates a fresh `URL.createObjectURL` on each call for unsynced photos (src/hooks/useOfflinePhotos.ts:307-309).
  - `selectedType` is seeded once from `availableTypes[0]` via lazy `useState` initializer (line 94); subsequent changes to `contextType`/`photoTypes` do not reset it.
  - `pendingCount`/`pendingSizeBytes` come from the hook for the whole context, while the rendered `photos` list is filtered by `secondaryContextId`/`photoTypes` (lines 71-80) — the badges can count photos not shown in the grid; the `maxPhotos` cap likewise compares the filtered length (lines 139, 207).
  - Comments reference an external fix list ("FIX MEDIUM 5" line 99, "FIX MEDIUM 6" line 126) not present in the file.
- ASSUMED: the retry cap of 3 displayed at line 358 ("Retry {retry_count}/3") is assumed to match enforcement logic inside H02's sync loop; not re-verified in this pass.

## src/components/OfflineSubsectionEnhancements.tsx

- Purpose: Two banner/badge components for subsection screens — an offline/pending-sync alert strip and a small "Offline" badge for individual documents.
- Public surface: `export function OfflineSubsectionEnhancements(props): JSX.Element | null` (line 14); props `{ isOnline: boolean; offlineDocumentCount?: number; offlineFloorPlanCount?: number; onSyncClick?: () => void; isSyncing?: boolean }` (lines 6-12; defaults 0/0/false, lines 17-19). `export function OfflineDocumentBadge({ isOffline }: { isOffline: boolean }): JSX.Element | null` (line 73; props lines 69-71).
- Inputs & outputs: In — props only. Out — `OfflineSubsectionEnhancements` returns `null` when online with zero counts (lines 21-23); offline: orange Alert "You're offline..." with an "Offline Mode" badge (lines 27-41); online with pending counts: blue Alert "N document(s) and M floor plan(s) pending sync" with a Sync Now button calling `onSyncClick`, disabled while `isSyncing` (lines 43-64). `OfflineDocumentBadge` returns `null` when `!isOffline`, else a blue "Offline" badge (lines 74-81). Stores — none.
- Dependencies: uses -> `@/components/ui/{badge,alert,button}` (lines 1-2, 4, C01), `lucide-react` (line 3, external). used by <- none found for either export (grep-verified).
- Side effects: None; `onSyncClick` is caller-supplied.
- Error handling: None; pure rendering.
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers for both exports (grep-verified) — the file is entirely unconsumed.
- ASSUMED: none.

## src/components/ServiceWorkerUpdater.tsx

- Purpose: Renders nothing; watches the PWA service worker for a newly installed version and applies it via a persistent "Reload" toast or an automatic reload when the tab is hidden and no form field is focused.
- Public surface: `export function ServiceWorkerUpdater(): null` (line 22) — no props; `"use client"` directive (line 1).
- Inputs & outputs: In — browser APIs only: `navigator.serviceWorker` registration state (guarded by `"serviceWorker" in navigator`, line 28), `document.visibilityState`, `document.activeElement`. Out — a sonner toast "A new version is available" with `duration: Infinity` and a Reload action (lines 54-58), and `window.location.reload()` (line 33). Stores — none of its own; the service worker/Workbox precache it monitors is configured elsewhere (P01).
- Dependencies: uses -> `react` (line 3), `sonner` (line 4) — both external; no intra-repo imports. used by <- A01 root-shell (`src/app/providers.tsx:10,21`; grep-verified sole importer — the untracked `providers 2.tsx` does not import it).
- Side effects: Single mount effect (lines 27-114): reload guard ref (lines 30-34); update detection via `getRegistration()` then `reg.waiting`/`reg.installing`/`updatefound` (lines 77-89) with per-worker `statechange` listeners treating "installed while a controller exists" as update-ready (lines 64-73); on update-ready — immediate reload if hidden and not editing, else a one-time persistent toast (lines 44-60); `visibilitychange` listener that reloads a pending update when hidden (skipping if an INPUT/TEXTAREA/SELECT/contentEditable is focused, lines 37-42, 98-105) or calls `reg.update()` when foregrounded; 60-second `setInterval` polling `reg.update()` (lines 92-96, 107). Cleanup removes the visibility listener, the interval, and the `updatefound` listener (lines 109-113).
- Error handling: `getRegistration()` rejection swallowed with an empty catch commented "no registration yet" (lines 87-89); `checkForUpdate` rejections swallowed with `.catch(() => {})` (line 96); no other failure paths.
- Tests: none found (grep-verified).
- Observed issues:
  - The `duration: Infinity` toast (lines 54-58) is never dismissed by the effect cleanup; it and its `reload` closure outlive an unmount.
  - If the component unmounts before `getRegistration()` resolves, the `.then` callback (lines 79-86) still runs — assigning `registration` and attaching the `updatefound` listener after cleanup (lines 109-113) has already executed with `registration` undefined.
  - `statechange` listeners added in `watchInstalling` (lines 66-72) are never removed.
  - There is no `controllerchange` listener (grep-verified); reloads occur only through the toast action, the hidden-visibility path, or `onUpdateReady` firing while hidden.
- ASSUMED: the header comment's account of next-pwa/Workbox precache behavior (lines 8-21) — including that a reload is sufficient to activate the waiting worker — is taken as-is; the SW build configuration lives in `next.config.mjs` (P01) and was not verified in this pass.
