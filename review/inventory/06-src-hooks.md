# Inventory — Slice 06: src/hooks (React hooks)

Date: 2026-07-29

List command (authoritative file set):

```
$ git ls-files 'src/hooks/*'
src/hooks/use-mobile.tsx
src/hooks/use-toast.ts
src/hooks/useCamera.ts
src/hooks/useContractorSites.tsx
src/hooks/useGlobalSearch.ts
src/hooks/useImageUpload.ts
src/hooks/useOfflineFloorPlanAnnotations.ts
src/hooks/useOfflineInspectionDetail.queueSave.test.tsx
src/hooks/useOfflineInspectionDetail.selfHeal.test.tsx
src/hooks/useOfflineInspectionDetail.ts
src/hooks/useOfflineInspections.ts
src/hooks/useOfflinePhotos.ts
src/hooks/useOfflineSubsections.ts
src/hooks/useOfflineSync.online.test.tsx
src/hooks/useOfflineSync.queueRaces.test.tsx
src/hooks/useOfflineSync.syncInspection.test.tsx
src/hooks/useOfflineSync.ts
src/hooks/useOnlineStatus.ts
src/hooks/usePDFTemplate.ts
src/hooks/usePDFTemplateGateway.ts
src/hooks/usePaginatedList.ts
src/hooks/useSiteScores.ts
src/hooks/useUndoStack.ts
src/hooks/useUnresolvedOrphans.ts
src/hooks/useUserRole.tsx

$ git ls-files 'src/hooks/*' | wc -l
      25
```

LOC command: `git ls-files 'src/hooks/*' | xargs wc -l` → 4690 total (per-file numbers below are from that output).

Classification counts: source 21, tests 4.

---

### src/hooks/use-mobile.tsx
- Type: source
- LOC: 19
- Public surface:
  - `useIsMobile(): boolean` (use-mobile.tsx:5) — matchMedia listener on a 768px breakpoint constant (use-mobile.tsx:3).
- Notes: No data access. Pure viewport hook.

### src/hooks/use-toast.ts
- Type: source
- LOC: 186
- Public surface:
  - `reducer(state: State, action: Action): State` (use-toast.ts:71) — exported toast reducer (ADD/UPDATE/DISMISS/REMOVE_TOAST).
  - `toast({...props}: Toast) -> { id, dismiss, update }` (use-toast.ts:137, exported at 186).
  - `useToast(): { toasts, toast, dismiss(toastId?) }` (use-toast.ts:166, exported at 186).
- Notes: Module-level singleton state (`memoryState`, `listeners`, `toastTimeouts`, use-toast.ts:53,124,126). shadcn-style toast store; TOAST_LIMIT=1, TOAST_REMOVE_DELAY=1000000 (use-toast.ts:5-6). Re-exported by `src/components/ui/use-toast.ts:1-3`. No network/DB access. Most other hooks in this slice use `sonner`'s `toast` instead (e.g. useImageUpload.ts:3).

### src/hooks/useCamera.ts
- Type: source
- LOC: 295
- Public surface:
  - `interface CameraOptions { quality?, allowEditing?, resultType?, source?, preferCamera?, multiple? }` (useCamera.ts:4-11).
  - `useCamera(): { isNative, isMobile, takePicture(options?: CameraOptions): Promise<File|null>, selectImages(options?: CameraOptions): Promise<File[]>, hasCamera }` (useCamera.ts:173, return 288-295).
- Notes: Capacitor Camera plugin on native (`Camera.getPhoto` useCamera.ts:203, `Camera.pickImages` useCamera.ts:260, permission requests 195-201, 252-258); hidden `<input type=file>` fallback on web (`capturePhotoWeb` useCamera.ts:65). HEIC→JPEG conversion via dynamically-imported `heic2any` (useCamera.ts:27). No Supabase access.

### src/hooks/useContractorSites.tsx
- Type: source
- LOC: 72
- Public surface:
  - `useContractorSites(previewSiteId?: string)` (useContractorSites.tsx:26) — returns a react-query result (queryKey `["contractor-sites", previewSiteId]`).
- Data touched: Supabase tables `sites` (useContractorSites.tsx:38, admin-preview branch), `user_sites` with embedded `sites(... clients(...))` (useContractorSites.tsx:53); storage bucket `site-images` via `createSignedUrl` (useContractorSites.tsx:12-14); `supabase.auth.getUser()` (useContractorSites.tsx:32). Depends on `useUserRole` (useContractorSites.tsx:3,27).

### src/hooks/useGlobalSearch.ts
- Type: source
- LOC: 265
- Public surface:
  - `type SearchResultType = "client" | "site" | "subsection" | "inspection"` (useGlobalSearch.ts:5).
  - `interface SearchResult { id, type, title, subtitle?, description?, url, metadata? }` (useGlobalSearch.ts:7-21).
  - `interface SearchFilters { clientIds?, siteTypes?, cocStatuses?, dateFrom?, dateTo? }` (useGlobalSearch.ts:23-29).
  - `useGlobalSearch(searchQuery: string, filters: SearchFilters = {})` (useGlobalSearch.ts:44) — react-query, enabled at query length >= 2 (useGlobalSearch.ts:231).
  - `useSearchFilterOptions(): { clients, siteTypes, cocStatuses }` (useGlobalSearch.ts:235).
- Data touched: Supabase tables `clients` (:60, :240), `sites` (:85, :251), `subsections` (:116), `inspections` (:167) via `.or(...ilike...)` filters; input sanitized by `sanitizeSearchQuery` (useGlobalSearch.ts:38-42). Builds app route URLs per result type.

### src/hooks/useImageUpload.ts
- Type: source
- LOC: 382
- Public surface:
  - `useImageUpload(): { uploadImage, deleteImage, refreshSignedUrl, getPathFromUrl, validateImageUrl, uploading }` (useImageUpload.ts:18, return 374-382).
    - `uploadImage(file: File, bucket: string, path: string, retries = 3, options?: { skipServerCompression?: boolean }): Promise<{url, path} | null>` (useImageUpload.ts:123-129) — HEIC convert + canvas compression (maxWidth 800 / quality 0.7, useImageUpload.ts:12-16), retry w/ exponential backoff, post-upload existence verification (:167-172).
    - `deleteImage(bucket, path): Promise<boolean>` (:265); `refreshSignedUrl(bucket, path): Promise<string|null>` (365-day signed URL, :288-292); `getPathFromUrl(url, bucket): string|null` (:309); `validateImageUrl(url, bucket): Promise<string|null>` (:330).
- Data touched: Supabase storage, caller-supplied `bucket` (upload :149-154, list :167-172/:343-345, getPublicUrl :179-181, remove :267-269, createSignedUrl :290-292). Edge function `compress-image` invoked fire-and-forget when bucket === 'inspection-photos' (useImageUpload.ts:193-194, 241-248).

### src/hooks/useOfflineFloorPlanAnnotations.ts
- Type: source
- LOC: 303
- Public surface:
  - `useOfflineFloorPlanAnnotations(): { addPin, updatePin, deletePin, addMarkup, removeMarkup, addMeasurement, removeMeasurement, getOfflineAnnotations, isOnline }` (useOfflineFloorPlanAnnotations.ts:34, return 292-303).
    - `addPin(floorPlanId, x, y, pinNumber, userId)` (:37); `updatePin(pinId, updates: PinData, photo?: File)` (:104); `deletePin(pinId)` (:169); `addMarkup(floorPlanId, markupType, vectorData, color='#ef4444', strokeWidth=2)` (:191); `addMeasurement(floorPlanId, startX, startY, endX, endY, value, unit='m', label?)` (:231); `removeMarkup(markupId)` (:221); `removeMeasurement(measurementId)` (:267); `getOfflineAnnotations(floorPlanId)` (:277).
- Data touched: online path — Supabase table `floor_plan_pins` (insert :49, update :130, delete :173), storage bucket `inspection-photos` (:116-124). Offline path — IndexedDB via `@/lib/offlineFloorPlanDB` (saveOfflinePin/getFloorPlanPins/saveMarkup/saveMeasurement etc., imports :4-15) and `offlineDB.putQueuedBlob` (:96, :161); queues mutation types ADD/UPDATE/DELETE_FLOOR_PLAN_PIN, ADD/DELETE_MARKUP, ADD/DELETE_MEASUREMENT through `useOfflineSync.queueMutation` (:99, :162-164, :187, :214, :225, :260, :271).

### src/hooks/useOfflineInspectionDetail.ts
- Type: source
- LOC: 422
- Public surface:
  - `useOfflineInspectionDetail({ inspectionId, autoCache = true }: UseOfflineInspectionDetailOptions)` (useOfflineInspectionDetail.ts:18) returning state `{ isOnline, isCached, isLoading, cachedData, offlineImages, hasPendingChanges, lastSyncTime }` and actions `{ cacheInspection, getCachedInspection, saveInspectionSection, queueFullInspectionSave, addOfflineImage, getSectionImages, deleteOfflineImage, getCacheStats, isAvailableOffline, clearCache }` (return :352-374).
    - `cacheInspection(inspectionData, templateData, siteData, subsectionData): Promise<boolean>` (:77) — caches inspection + template, LRU eviction (50 inspections / 20 templates, :134-135).
    - `saveInspectionSection(sectionKey, itemKey, data: {status?, notes?}): Promise<boolean>` (:151) — enqueues `SYNC_INSPECTION` deduped per inspection (:173).
    - `queueFullInspectionSave(fields: Record<string, any>): Promise<boolean>` (:191) — full-record offline save, `SYNC_INSPECTION` with `fields`, dedupeKey=inspectionId (:197).
    - `addOfflineImage(file, sectionKey, itemKey?): Promise<string|null>` (:228) — compresses, stores blob in offlineInspectionDB, enqueues `UPLOAD_INSPECTION_IMAGE` (:258-260).
- Data touched: IndexedDB `offlineInspectionDB` (cacheInspection/getCachedInspection/saveInspectionImage/markers, imports :4-9); localStorage queue via `enqueueOfflineMutation` from `@/lib/offlineQueue` (:10); online state via `getOnline` from `@/lib/onlineStatus` (:11) plus its own listeners + 15s self-heal interval (:35-52). Imports `supabase` (:3) but makes no direct Supabase call in this file. Private helper `compressImage` (:377).

### src/hooks/useOfflineInspections.ts
- Type: source
- LOC: 164
- Public surface:
  - `interface InspectionData { title, description?, status?, inspection_date?, site_id, inspector_id?, subsection_id?, shop_name?, shop_number? }` (useOfflineInspections.ts:9-19).
  - `useOfflineInspections(): { createInspection, updateInspection, deleteInspection, uploadImage, isOnline }` (:21, return 157-164).
    - `createInspection(data: InspectionData)` (:24) — online insert into `inspections` (:36) else offlineDB.saveInspection + queue `CREATE_INSPECTION` (:51-59).
    - `updateInspection(id, updates: Partial<InspectionData>)` (:64) — `inspections` update (:68) else queue `UPDATE_INSPECTION` (:81).
    - `deleteInspection(id)` (:85) — `inspections` delete (:89) else queue `DELETE_INSPECTION` (:102).
    - `uploadImage(bucket, path, file, inspectionId?)` (:106) — validateFile + checkStorageAvailable gates (:113-125), storage upload (:130-132) else offlineDB.saveImage + `queueUpload('UPLOAD_IMAGE', ...)` (:144-153).
- Data touched: Supabase table `inspections`, storage bucket = caller-supplied; IndexedDB `offlineDB`; queue via `useOfflineSync`.

### src/hooks/useOfflinePhotos.ts
- Type: source
- LOC: 348
- Public surface:
  - `useOfflinePhotos(contextType: OfflinePhotoContextType, contextId?: string)` (useOfflinePhotos.ts:101) returning `{ photos, pendingCount, pendingSizeBytes, isSyncing, isCapturing, isOnline, syncPaused, capturePhoto, syncPhotos, deletePhoto, getPhotoPreviewUrl, getPhotoFullUrl, pauseSync, resumeSync, loadPhotos }` (return :331-348).
    - `capturePhoto(photoType: OfflinePhotoType, options?: {notes?, secondaryContextId?}): Promise<OfflinePhoto|null>` (:131) — camera capture, connection-adaptive compression (:141-147), GPS tag (:89-99), thumbnail (:37), stored in offlineDB.
    - `syncPhotos()` (:187) — drains unsynced photos priority-ordered by context (coc>document>inspection>floor_plan>site, :12-18), max 3 retries (:8).
    - `deletePhoto(id)` (:289) — removes from storage + `offline_photos` row + local DB.
- Data touched: storage bucket `coc-photos` (`PHOTOS_BUCKET`, :9; upload :221-227, getPublicUrl :231-233, remove :294), Supabase table `offline_photos` (upsert :237-254, delete :295); IndexedDB `offlineDB` offline-photo store (:118, :174, :193, :260, :291, :297); `supabase.auth.getUser()` (:149); `useCamera` (:112). Auto-sync on window 'online' event + on mount when online (:324-329). Note: `isOnline` is a one-shot `getOnline()` call at render (:111), not a subscription.

### src/hooks/useOfflineSubsections.ts
- Type: source
- LOC: 229
- Public surface:
  - `useOfflineSubsections(): { updateSubsection, uploadDocument, uploadFloorPlan, getOfflineData, isOnline }` (useOfflineSubsections.ts:31, return 222-229).
    - `updateSubsection(id, updates: Partial<SubsectionData>)` (:34) — `subsections` update (:38) else merge into offline store + queue `UPDATE_SUBSECTION` (:51-67).
    - `uploadDocument(subsectionId, categoryId, file)` (:71) — storage `documents` upload + `subsection_documents` insert (:96-114) else saveDocument + `queueUpload('UPLOAD_DOCUMENT', ...)` (:126-136).
    - `uploadFloorPlan(subsectionId, file)` (:141) — storage `documents` upload + `subsection_floor_plans` insert (:165-181) else saveFloorPlan + `queueUpload('UPLOAD_FLOOR_PLAN', ...)` (:193-202).
    - `getOfflineData(subsectionId)` (:207) — reads subsection + documents + floor plans from offline store.
- Data touched: Supabase tables `subsections`, `subsection_documents`, `subsection_floor_plans`; storage bucket `documents`; IndexedDB via `@/lib/offlineDBExtensions` (imports :3-10); file gates from `@/lib/fileValidation` and `@/lib/storageQuota` (:13-14).

### src/hooks/useOfflineSync.ts
- Type: source
- LOC: 568
- Public surface:
  - `useOfflineSync(): { isOnline, queueSize, isSyncing, queueMutation(type, data), queueUpload(type, data, file), processQueue() }` (useOfflineSync.ts:51, return 560-568).
- Notes: THE offline mutation-queue drain engine. Queue persisted in localStorage under `OFFLINE_QUEUE_KEY` (:6, :59-72); blobs stored separately in IndexedDB `queued_blobs` via `offlineDB.putQueuedBlob` (:92-95). Module-global synchronous drain lock + coalescing re-pass (`isDraining`/`drainAgain`, :24-25, :405-476); drain state broadcast to all instances via `offline-sync-state` CustomEvent (:30-34, :537-541); per-cycle `attempted` set preserves retry budgets (:421, MAX_RETRIES=3 :17); reconciles against the live queue so mid-drain enqueues survive (:458-461); orphaned-blob sweep once per session, >24h cutoff (:551-558). Executor `executeMutation` (:98-402) handles mutation types: CREATE/UPDATE/DELETE_INSPECTION, UPLOAD_IMAGE, UPDATE_SUBSECTION, UPLOAD_DOCUMENT, UPLOAD_FLOOR_PLAN, ADD/UPDATE/DELETE_FLOOR_PLAN_PIN, ADD/DELETE_MARKUP, ADD/DELETE_MEASUREMENT, SAVE_INSPECTION_JSON (legacy, :324), SYNC_INSPECTION (with server-photo merge via `mergeServerPhotos`, :336-360), UPLOAD_INSPECTION_IMAGE (server read-modify-write of json_data, :362-397).
- Data touched: Supabase tables `inspections` (:102, :111, :120, :327, :350, :354, :381, :391), `subsections` (:149), `subsection_documents` (:170), `subsection_floor_plans` (:202), `floor_plan_pins` (:234, :275, :285); storage buckets: caller-supplied (:134), `documents` (:165, :191), `inspection-photos` (:227, :269, :374). IndexedDB: `offlineDB`, dynamic imports of `offlineDBExtensions`, `offlineFloorPlanDB`, `offlineInspectionDB`. Listens to window events `online`/`offline`/`focus`/`visibilitychange` + 15s interval self-heal (:483-515), `offline-queue-updated` (:526-533), `offline-sync-state` (:537-541). Invalidates all react-query caches after a clean drain (:465).

### src/hooks/useOnlineStatus.ts
- Type: source
- LOC: 34
- Public surface:
  - `getOnline(): boolean` (useOnlineStatus.ts:28).
  - `useOnlineStatus(): boolean` (useOnlineStatus.ts:32) — `useSyncExternalStore` over online/offline/focus/visibilitychange (:13-26).
- Notes: Docstring (:1-10) says it is intended to replace the per-hook online listeners in five offline hooks. See Oddities — no importers found.

### src/hooks/usePDFTemplate.ts
- Type: source
- LOC: 86
- Public surface:
  - `usePDFTemplate(reportType: ReportType): { template, loading, error, getCustomization(overrides?), sections }` (usePDFTemplate.ts:15, return 77-84).
  - `export type { PDFTemplate, ReportType }` (usePDFTemplate.ts:86); `ReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance'` (:13).
- Data touched: Supabase table `pdf_report_templates` (`report_type` + `is_default` filter, usePDFTemplate.ts:27-31).
- Notes: See Oddities — no importers found; overlaps usePDFTemplateGateway.

### src/hooks/usePDFTemplateGateway.ts
- Type: source
- LOC: 426
- Public surface:
  - `type TemplateReportType` — 7 report types incl. `coc_validation`, `comprehensive_inspection` (usePDFTemplateGateway.ts:20-27).
  - `interface PDFTemplateConfig` (:29-36); `interface AccentColors { primary, light, dark, rgb }` (:38-43); `interface UsePDFTemplateGatewayResult` (:194-217).
  - `usePDFTemplateGateway(reportType: TemplateReportType): UsePDFTemplateGatewayResult` (:223) — returns `{ template, loading, error, customization, enabledSections, accentColors, isSectionEnabled, getSectionTitle, getSectionOrder, getColumnVisibility, getKpiVisibility, mergeCustomization, refetch }` (:329-344).
  - `async fetchPDFTemplate(reportType): Promise<{ customization, sections, accentColors }>` (:350) — standalone non-hook variant with defaults-on-error fallback.
  - `getAccentColorPalette(colorName: string): AccentColors` (:424).
- Data touched: Supabase table `pdf_report_templates` (:234-238, :359-363). Contains hardcoded `ACCENT_COLOR_PALETTE` (:46-77) and `DEFAULT_TEMPLATES` per report type (:80-192). Header comment declares it "the MANDATORY entry point for all PDF report generation" (:4).

### src/hooks/usePaginatedList.ts
- Type: source
- LOC: 74
- Public surface:
  - `interface PaginatedPage<T> { rows, total }` (usePaginatedList.ts:13-16); `interface UsePaginatedListOptions<T> { queryKey, fetchPage, pageSize?, enabled? }` (:18-25); `interface UsePaginatedListResult<T>` (:27-40).
  - `usePaginatedList<T>(options): UsePaginatedListResult<T>` (:42) — react-query with `placeholderData: keepPreviousData`, default pageSize 20; page math from `@/lib/pagination` (:11).
- Notes: Data-agnostic; the caller's `fetchPage` runs the actual Supabase `.range()` query (docstring :1-8).

### src/hooks/useSiteScores.ts
- Type: source
- LOC: 72
- Public surface:
  - `useSiteScores(siteIds: string[] | undefined)` (useSiteScores.ts:14) — react-query returning `Map<string, SiteScore>`; queryKey `["site-scores", ids]`, staleTime 5 min.
- Data touched: Supabase tables `site_health_snapshots` (:26, 30-day window constant :7), and for sites without a usable snapshot: `subsections` (:41), `inspections` (:45), `snags` (:55). Score math delegated to `buildSiteScoreMap` from `@/lib/siteScores` (:3, :69).

### src/hooks/useUndoStack.ts
- Type: source
- LOC: 53
- Public surface:
  - `type UndoAction = { type: 'delete'|'add'|'move'|'status_change', pinId, previousData?, description, timestamp }` (useUndoStack.ts:3-9).
  - `useUndoStack(): { undoStack, pendingUndo, pushAction(action), popAction(), clearPendingUndo(), canUndo }` (:13, return 45-52). MAX_UNDO_STACK=10 (:11).
- Notes: Pure local state; used by floor-plan pin editing (consumer: src/components/InteractiveFloorPlan.tsx per grep). No data access.

### src/hooks/useUnresolvedOrphans.ts
- Type: source
- LOC: 132
- Public surface:
  - `interface OrphanCandidate` (:22), `interface OrphanBestGuess` (:27), `interface OrphanRow` (:33-44).
  - `ORPHANS_QUERY_KEY = ["unresolved-orphans"]` (:66).
  - `useUnresolvedOrphans(): { rows, isLoading, error, resolve({inspection_id, subsection_id}), archive({inspection_id, reason}), isMutating }` (:68, return 124-131).
- Data touched: Supabase view `my_unresolved_orphans` (:75, security_invoker per header comment :7-8); RPCs `resolve_my_orphan` (:94) and `archive_my_orphan` (:113), both SECURITY DEFINER per comment (:15-17). Uses a local `SupabaseUntyped` cast because view/RPCs are not yet in generated types (:46-64). References docs/integrity-audit/force-at-login-resolution.md (:19).

### src/hooks/useUserRole.tsx
- Type: source
- LOC: 95
- Public surface:
  - `type UserRole = "Admin" | "Client" | "Contractor" | null` (useUserRole.tsx:5).
  - `useUserRole()` (:7) — react-query on `["user-role", userId]`; userId seeded from `supabase.auth.getSession()` (offline-safe, comment :12-16) and tracked via `supabase.auth.onAuthStateChange` (:24), which also purges `user-role` / `onboarding-status` / `user-client-info` caches on user change (:29-31).
  - `useClientInfo(previewClientId?: string)` (:60) — react-query on `["user-client-info", previewClientId]`.
- Data touched: Supabase tables `user_roles` (:46), `clients` (:72, admin-preview branch), `user_clients` with embedded `clients(...)` (:86); `supabase.auth.getUser()` (:66).

---

## Test files (paired with their hooks)

### src/hooks/useOfflineInspectionDetail.queueSave.test.tsx
- Type: tests
- LOC: 90
- Pairs with: `useOfflineInspectionDetail.ts` (`queueFullInspectionSave`).
- Covers: full-record SYNC_INSPECTION enqueue with all fields (:22-43); per-inspection dedupe of repeated offline saves (:45-59); saved status/quality_rating reflected in the IndexedDB cache for offline reload (:61-89). Vitest + jsdom + fake-indexeddb + @testing-library renderHook (:2-10). No exports.

### src/hooks/useOfflineInspectionDetail.selfHeal.test.tsx
- Type: tests
- LOC: 37
- Pairs with: `useOfflineInspectionDetail.ts` (online self-heal effect).
- Covers: online read at mount (:17), transition events (:22), missed-transition recovery on focus (:30-36). No exports.

### src/hooks/useOfflineSync.online.test.tsx
- Type: tests
- LOC: 50
- Pairs with: `useOfflineSync.ts` (online/offline state).
- Covers: navigator.onLine at mount and offline/online event flips under a react-query wrapper (:27-49). Self-described "harness smoke test" (:12-15). No exports.

### src/hooks/useOfflineSync.queueRaces.test.tsx
- Type: tests
- LOC: 166
- Pairs with: `useOfflineSync.ts` (drain concurrency).
- Covers, with a mocked supabase client and a controllable gate (:14-42): mutation enqueued mid-drain is not clobbered (:74-92); concurrent drains coalesce via the synchronous lock (:94-107); queueSize updates immediately even offline (:109-119); failed mutation's retry budget not burned by coalesced re-passes (:121-142); syncing state broadcast to all mounted instances (:144-165). No exports.

### src/hooks/useOfflineSync.syncInspection.test.tsx
- Type: tests
- LOC: 122
- Pairs with: `useOfflineSync.ts` (`SYNC_INSPECTION` executor).
- Covers, with a mocked supabase client (:21-41): full-record field sync incl. updated_at (:63-85); legacy `{id, json_data}` shape support (:87-98); server-photo merge so a full-save cannot clobber an earlier drain's uploaded photo (:100-121). No exports.

---

## Runtime observations

- **Offline mutation queue drain (client-side background job):** `useOfflineSync.processQueue` (src/hooks/useOfflineSync.ts:405) drains a localStorage-persisted mutation queue against Supabase. Triggers: transition to online (useOfflineSync.ts:518-522), same-tab `offline-queue-updated` window event fired on every enqueue (useOfflineSync.ts:87, 526-533), and explicit calls from consumers. Module-global lock prevents concurrent drains across all mounted instances (useOfflineSync.ts:24-25, 409-410).
- **Polling/self-heal timers:** 15-second `setInterval` re-reading navigator.onLine in useOfflineSync.ts:506 and useOfflineInspectionDetail.ts:43.
- **Photo auto-sync job:** `useOfflinePhotos` auto-runs `syncPhotos()` on window 'online' and on mount when online (src/hooks/useOfflinePhotos.ts:324-329), uploading to bucket `coc-photos` and upserting table `offline_photos` (useOfflinePhotos.ts:221-254), priority-ordered by context type (useOfflinePhotos.ts:12-18, 197-199).
- **Supabase Edge Function integration:** `compress-image` invoked fire-and-forget after uploads to `inspection-photos` (src/hooks/useImageUpload.ts:241-248, gated at :193).
- **Supabase RPC integration:** `resolve_my_orphan` and `archive_my_orphan` (src/hooks/useUnresolvedOrphans.ts:94, :113); view `my_unresolved_orphans` (:75).
- **Auth event subscription:** `supabase.auth.onAuthStateChange` in useUserRole.tsx:24 with cache purge on user change (:29-31).
- **Session-once maintenance sweep:** orphaned queued-blob purge in IndexedDB, one run per page session, >24h age cutoff (src/hooks/useOfflineSync.ts:549-558).
- **Custom window events as an in-tab bus:** `offline-queue-updated` (emitted useOfflineSync.ts:87, also by src/lib/offlineQueue per test usage) and `offline-sync-state` (emitted useOfflineSync.ts:30-34, consumed :537-541).
- **Storage buckets touched by this slice:** `site-images` (useContractorSites.tsx:13), `inspection-photos` (useOfflineFloorPlanAnnotations.ts:117; useOfflineSync.ts:227,269,374; useImageUpload.ts:193), `documents` (useOfflineSubsections.ts:97,166; useOfflineSync.ts:165,191), `coc-photos` (useOfflinePhotos.ts:9), plus caller-supplied buckets (useImageUpload.ts:150; useOfflineInspections.ts:131; useOfflineSync.ts:134).
- **Tables touched by this slice:** inspections, subsections, subsection_documents, subsection_floor_plans, floor_plan_pins, offline_photos, clients, sites, user_sites, user_clients, user_roles, snags, site_health_snapshots, pdf_report_templates, view my_unresolved_orphans (file:line cited in per-file entries above).

## Oddities (factual only)

- **`useOnlineStatus.ts` has no importers.** `grep -rn "hooks/useOnlineStatus" src` matches only a generated graphify cache JSON (src/graphify-out/cache/...), no source imports. Its docstring (useOnlineStatus.ts:1-10) states it "replaces" the private online-state copies in five offline hooks, but those hooks import `getOnline` from the separate module `src/lib/onlineStatus.ts` (e.g. useOfflineSync.ts:7, useOfflineInspectionDetail.ts:11, useOfflinePhotos.ts:6) and still register their own listeners (useOfflineSync.ts:483-515, useOfflineInspectionDetail.ts:35-52). Two same-named `getOnline` implementations exist: src/hooks/useOnlineStatus.ts:28 and src/lib/onlineStatus.ts (tracked, with its own test file).
- **`usePDFTemplate.ts` has no importers.** `grep -rn "from ['\"]@/hooks/usePDFTemplate['\"]" src` returns nothing; all files matching the substring "usePDFTemplate" actually import `usePDFTemplateGateway`/`fetchPDFTemplate` (src/components/SiteSummaryReport.tsx, src/lib/floorPlanReportGenerator.ts, src/lib/complianceReportGenerator.ts, src/lib/pdfTemplateTestRunner.ts, src/views/PDFTemplateTestDashboard.tsx). Both hooks query the same `pdf_report_templates` table with the same filter (usePDFTemplate.ts:27-31 vs usePDFTemplateGateway.ts:234-238); the Gateway supports 7 report types vs 5.
- **Two toast systems coexist.** `use-toast.ts` (shadcn-style store, consumers: LabeledQRCode.tsx, ui/toaster.tsx, ui/use-toast.ts re-export, views/Calendar.tsx, views/QRCodes.tsx) alongside `sonner`'s `toast`, which is what the offline hooks in this same slice use (useImageUpload.ts:3, useOfflineSync.ts:3, useOfflinePhotos.ts:2, etc.).
- **Duplicate compression/HEIC helpers.** Private canvas `compressImage` implementations exist in three files (useImageUpload.ts:25-86, useOfflineInspectionDetail.ts:377-422, useOfflinePhotos.ts:58-87) and HEIC→JPEG conversion in two (useCamera.ts:16-43 `convertHeicToJpeg`, useImageUpload.ts:91-115 `convertHeicToJpg`), with similar but not identical parameters.
- **`useOfflinePhotos.isOnline` is a one-shot read.** `const isOnline = getOnline()` at render (useOfflinePhotos.ts:111) with no subscription for that returned value; the file's reactive online handling is a separate 'online' listener used only to trigger sync (:324-329).
- **Unused import:** `supabase` is imported in useOfflineInspectionDetail.ts:3 but no `supabase.` call appears in that file (grep for `.from(|.storage|.rpc(|functions.invoke` returns no hits there).
- **`isLoading` in useOfflineInspectionDetail** is returned (:356) but its setter `setIsLoading` (:24) is never called in the file — the value is constant `false`.
- **Naming convention split:** two kebab-case files (use-mobile.tsx, use-toast.ts — shadcn imports) vs camelCase for the other 19 source files; two hooks with non-offline concerns use .tsx extension without JSX (useContractorSites.tsx, useUserRole.tsx contain no JSX).
- **Legacy queue case retained deliberately:** `SAVE_INSPECTION_JSON` executor kept for old clients' queued mutations, marked LEGACY (useOfflineSync.ts:321-334).

## ASSUMED (inferred, not directly verified)

- The `.tsx` extension on useContractorSites.tsx / useUserRole.tsx is assumed historical (no JSX observed in either file); I did not verify git history.
- "No importers" claims for useOnlineStatus/usePDFTemplate are based on repo-wide grep of `src/` for import paths and identifier usage; dynamic imports by string concatenation would not be caught (none observed).
- The pairing of test files to hooks is stated in the tests' own imports and comments; PR references in comments (PR #20, C3/H10, H14, I1/I2, C-1) were not verified against actual PR history.
- `offline-queue-updated` being emitted by `src/lib/offlineQueue.enqueueOfflineMutation` is inferred from the comment at useOfflineSync.ts:524-525 and test behavior (queueRaces.test.tsx:81 relies on it); I did not open src/lib/offlineQueue.ts (outside this slice).
- Classification of all non-`.test.tsx` files as `source` assumes none are generated; no generation markers were observed.
