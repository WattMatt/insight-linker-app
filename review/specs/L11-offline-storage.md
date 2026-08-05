# L11 — offline-storage

- Unit id: L11
- Slug: offline-storage
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 13 (per review/unit-files.json "L11")

## Unit header

**Unit purpose (as-is).** This unit is the browser-side offline persistence layer: two IndexedDB connection managers (`offlineDB`, `offlineInspectionDB`) that both open the same database `wm_compliance_offline` at version 5 (src/lib/offlineDB.ts:2,7; src/lib/offlineInspectionDB.ts:2,7), two function-module extensions that borrow `offlineDB`'s private connection for subsection/document/floor-plan and floor-plan-annotation stores, a localStorage-backed mutation-queue helper (`offlineQueue.ts`), and a defensive `navigator.onLine` reader (`onlineStatus.ts`). Six vitest files pin specific regressions (version parity, blob round-trip, orphan cleanup, eviction of pending changes, init retry, queue ordering/merging).

**Module-level observations (cross-file facts).**
- Both DB managers hardcode `DB_NAME = 'wm_compliance_offline'` and `DB_VERSION = 5` independently (offlineDB.ts:2,7; offlineInspectionDB.ts:2,7), and each `onupgradeneeded` handler creates the identical complete set of 14 object stores so schema is complete regardless of which module opens first (offlineDB.ts:162–262; offlineInspectionDB.ts:84–183). The store-creation code is duplicated between the two files; comments in both instruct keeping them in sync (offlineDB.ts:3–6; offlineInspectionDB.ts:3–6, 92). src/lib/offlineDB.versionParity.test.ts exists specifically to catch drift.
- The 14 stores: `inspections`, `images`, `mutations`, `subsections`, `documents`, `floor_plans`, `floor_plan_pins`, `markups`, `measurements`, `offline_photos`, `inspection_cache`, `inspection_images`, `template_cache`, `queued_blobs`.
- The `mutations` object store is created by both upgrade handlers (offlineDB.ts:180–183; offlineInspectionDB.ts:104–107) but no code in the repo reads or writes it (grep for `objectStore('mutations')` hits only the two creation sites). The actual mutation queue is the localStorage key `offline_mutation_queue` (offlineQueue.ts:3).
- `offlineDBExtensions.ts` and `offlineFloorPlanDB.ts` do not open their own connections; each has a private `getDB()` that reads `offlineDB['db']` — a private class field — via `@ts-ignore` (offlineDBExtensions.ts:211–219; offlineFloorPlanDB.ts:5–12).
- Outside the unit, src/lib/cacheUtils.ts:42 (L12) lists `wm_compliance_offline` among databases it deletes via `indexedDB.deleteDatabase`; it also lists `wm_floor_plan_offline` (cacheUtils.ts:43), a name no file in this unit opens.
- Write-acknowledgement style is mixed inside each manager: `putQueuedBlob`, `cleanupOrphanedBlobs` (offlineDB.ts:464–465, 516–517) and `cacheInspection`, `saveInspectionImage` (offlineInspectionDB.ts:209–210, 340–341) resolve on `tx.oncomplete`/reject on `tx.onabort`; all other writes in the unit resolve on the request's `onsuccess` only.
- Test environment: vitest.config.ts sets default `environment: 'node'` with `fake-indexeddb` imported per-file (`import 'fake-indexeddb/auto'`); onlineStatus.test.ts opts into jsdom via a `@vitest-environment jsdom` docblock (onlineStatus.test.ts:1–3). vitest.setup.ts installs a Map-backed localStorage when absent.
- Untracked " 2"-suffixed duplicates exist beside this unit's consumers (git status): `src/views/OfflineSyncTest 2.tsx` imports `offlineInspectionDB` and has **no tracked original** (`git ls-files` has no OfflineSyncTest.tsx); `src/views/OfflineReview 2.tsx` duplicates the tracked OfflineReview.tsx. Grep hits in " 2" files are excluded from "used by" lists below.

**External contract.** The rest of the app gets: (1) the `offlineDB` singleton for inspections/images/offline-photos CRUD and the queued-blob store that keeps File/Blob payloads out of the localStorage queue (used by H01 useOfflineSync, H02 offline hooks, C13 OfflinePhotoGallery, V01 Inspections, L18 storageQuota); (2) the `offlineInspectionDB` singleton for full-inspection caching, inspection images, template caching, LRU eviction, and storage-quota stats (used by H01, H02); (3) subsection/document/floor-plan and pin/markup/measurement CRUD functions (used by H01, H02); (4) `enqueueOfflineMutation`/`OFFLINE_QUEUE_KEY`/`orderQueueForSync`/`mergeServerPhotos` for the shared localStorage queue drained by H01 useOfflineSync; (5) `getOnline()` as the SSR-safe connectivity read (used by H01, H02).

---

## src/lib/offlineDB.ts

- Purpose: Defines the shared IndexedDB schema (`wm_compliance_offline` v5, 14 stores) and a singleton class wrapper with CRUD for inspections, images, unified offline photos, and queued upload blobs.
- Public surface:
  - Interfaces: `OfflineInspection` (L9), `OfflineImage` (L21), `OfflineSubsection` (L30), `OfflineDocument` (L48), `OfflineFloorPlan` (L58), `OfflineFloorPlanPin` (L67), `OfflinePhoto` (L96), `OfflineMarkup` (L118), `OfflineMeasurement` (L129).
  - Types: `COCPhotoType` (L90), `OfflinePhotoType` (L92), `OfflinePhotoContextType` = `'coc' | 'inspection' | 'floor_plan' | 'site' | 'document'` (L94).
  - `export const offlineDB = new OfflineDatabase()` (L522) — the class itself is not exported. Methods:
    - `init(): Promise<void>` (L146)
    - `saveInspection(inspection: OfflineInspection): Promise<void>` (L267); `getUnsyncedInspections(): Promise<OfflineInspection[]>` (L279); `markInspectionSynced(id: string): Promise<void>` (L292); `deleteInspection(id: string): Promise<void>` (L314)
    - `saveImage(image: OfflineImage): Promise<void>` (L327); `getUnsyncedImages(): Promise<OfflineImage[]>` (L339); `markImageSynced(id: string): Promise<void>` (L352); `deleteImage(id: string): Promise<void>` (L374)
    - `saveOfflinePhoto(photo: OfflinePhoto): Promise<void>` (L388); `getOfflinePhoto(id: string): Promise<OfflinePhoto | undefined>` (L399); `getOfflinePhotosByContext(contextType: OfflinePhotoContextType, contextId: string): Promise<OfflinePhoto[]>` (L409); `getUnsyncedOfflinePhotos(): Promise<OfflinePhoto[]>` (L424); `deleteOfflinePhoto(id: string): Promise<void>` (L435)
    - `putQueuedBlob(blob: Blob, meta?: { fileName?: string; fileType?: string }): Promise<string>` (L450, returns a `crypto.randomUUID()` id, L452); `getQueuedBlob(id: string): Promise<Blob | undefined>` (L470); `deleteQueuedBlob(id: string): Promise<void>` (L480); `cleanupOrphanedBlobs(referencedIds: Set<string>, olderThanIso: string): Promise<number>` (L495)
- Inputs & outputs: reads/writes IndexedDB database `wm_compliance_offline` version 5 (L2,7). `onupgradeneeded` creates all 14 stores idempotently, including three stores the file comments describe as "owned by offlineInspectionDB" (`inspection_cache`, `inspection_images`, `template_cache`, L237–255) and `queued_blobs` with no indexes (L259–261). `getUnsynced*` queries use the `synced` index with `IDBKeyRange.only(false)` (L285, 345, 429). No network, no localStorage, no env vars.
- Dependencies: uses -> none (zero imports). used by <- H01 (src/hooks/useOfflineSync.ts:5), H02 (src/hooks/useOfflineInspections.ts:3; src/hooks/useOfflineFloorPlanAnnotations.ts:3,18; src/hooks/useOfflinePhotos.ts:4), C13 (src/components/OfflinePhotoGallery.tsx:14 type-only, :149 dynamic import), V01 (src/views/Inspections.tsx:18), L18 (src/lib/storageQuota.ts:120 dynamic import), L11-internal (src/lib/offlineDBExtensions.ts:2–3; src/lib/offlineFloorPlanDB.ts:2–3; the three offlineDB.*.test.ts files). V02 OfflineReview.tsx:21 contains the string `"src/lib/offlineDB.ts"` in a file-path array, not an import. (grep-verified)
- Side effects: opens an IndexedDB connection on first use (`if (!this.db) await this.init()` guards every method); `onversionchange` closes and nulls the handle (L155–158); `putQueuedBlob` generates a UUID via `crypto.randomUUID()` (L452); `cleanupOrphanedBlobs` cursor-deletes records that are both unreferenced and older than the ISO cutoff, counting deletions (L503–514). No events emitted.
- Error handling: every method returns a Promise that rejects with the IDB `request.error`; `init()` rejects on open error (L150). `putQueuedBlob` and `cleanupOrphanedBlobs` additionally resolve only on `tx.oncomplete` and reject on `tx.onabort` with the transaction error or a fallback `Error` (L464–465, 516–517); all other writes resolve on `request.onsuccess` before commit. `markInspectionSynced`/`markImageSynced` resolve silently when the record is absent (L306–307, 366–367). No catches, no toasts, no logging.
- Tests: offlineDB.queuedBlobs.test.ts (blob round-trip), offlineDB.cleanupBlobs.test.ts (orphan cleanup), offlineDB.versionParity.test.ts (shared-db open order) — see their sections.
- Observed issues:
  - Unlike `offlineInspectionDB.init()`, `init()` does not cache an in-flight promise: concurrent callers each run `indexedDB.open` and the later `onsuccess` overwrites `this.db` (L146–160).
  - The `mutations` store is created (L180–183) but never read or written anywhere in the repo.
  - `getOfflinePhotosByContext` fetches all rows for `context_id` via index then filters `context_type` in JS (L414–418), although a `context_type` index exists (L230).
  - Most write methods resolve on `request.onsuccess` rather than transaction commit; the file's own comments (L462–463) describe why commit-resolution matters for `putQueuedBlob`.
  - `OfflineSubsection`, `OfflineDocument`, `OfflineFloorPlan`, `OfflineFloorPlanPin`, `OfflineMarkup`, `OfflineMeasurement` interfaces are declared here but all their store CRUD lives in offlineDBExtensions.ts / offlineFloorPlanDB.ts.
- ASSUMED: none.

## src/lib/offlineDB.cleanupBlobs.test.ts

- Purpose: Locks in `offlineDB.cleanupOrphanedBlobs` behaviour — orphaned old blobs are deleted, referenced or fresh blobs survive.
- Public surface: none (test file; one `describe` at L7 with two `it` cases).
- Inputs & outputs: uses `fake-indexeddb/auto` (L1) against the real `offlineDB` singleton (L3). No other stores.
- Dependencies: uses -> vitest, fake-indexeddb, `./offlineDB` (L11). used by <- none found (grep-verified; test file).
- Side effects: writes blobs into fake-IndexedDB `queued_blobs` via `putQueuedBlob` (L9–10, 22).
- Error handling: none beyond vitest assertion failure.
- Tests: is itself a test. Asserts (a) with a future cutoff, an unreferenced blob is deleted (`deleted === 1`) while the referenced one remains fetchable (L14–18); (b) with a past cutoff, a fresh orphan is kept and `deleted === 0` (L25–29).
- Observed issues: none.
- ASSUMED: none.

## src/lib/offlineDB.queuedBlobs.test.ts

- Purpose: Verifies the queued_blobs "file-loss fix" — a mutation payload carries only a `blobId` through a JSON round-trip and the original bytes remain recoverable from IndexedDB.
- Public surface: none (test file; one `describe` at L5, one `it`).
- Inputs & outputs: `fake-indexeddb/auto` (L1); real `offlineDB` singleton (L3).
- Dependencies: uses -> vitest, fake-indexeddb, `./offlineDB` (L11). used by <- none found (grep-verified; test file).
- Side effects: puts/gets/deletes a 5-byte JPEG-typed Blob in `queued_blobs` (L7–25).
- Error handling: none beyond assertions.
- Tests: is itself a test. Asserts `putQueuedBlob` returns a string id (L9–10); `JSON.parse(JSON.stringify(...))` preserves `blobId` and carries no `file` key (L14–16); the recovered blob's bytes equal `[1,2,3,4,5]` (L19–22); after `deleteQueuedBlob` the blob is gone (L24–25).
- Observed issues: none.
- ASSUMED: none.

## src/lib/offlineDB.versionParity.test.ts

- Purpose: Guards DB_VERSION parity between `offlineDB` and `offlineInspectionDB` by initialising both against the shared db in app mount order and checking both schemas coexist.
- Public surface: none (test file; one `describe` at L13, one `it`).
- Inputs & outputs: `fake-indexeddb/auto` (L1); both singletons (L3–4); re-opens `wm_compliance_offline` versionless to inspect `objectStoreNames` (L21–25).
- Dependencies: uses -> vitest, fake-indexeddb, `./offlineDB` (L11), `./offlineInspectionDB` (L11). used by <- none found (grep-verified; test file).
- Side effects: creates the fake db at v5; closes the inspection handle (L28).
- Error handling: none beyond assertions.
- Tests: is itself a test. Asserts `offlineDB.init()` then `offlineInspectionDB.init()` both resolve (L15–18) and that `queued_blobs` and `inspection_cache` both exist in the single db (L26–27). Comment L9–12 records the prod regression it guards (offlineDB at v5 first → offlineInspectionDB at v4 → VersionError).
- Observed issues: none.
- ASSUMED: none.

## src/lib/offlineDBExtensions.ts

- Purpose: Function-module CRUD over the `subsections`, `documents`, and `floor_plans` stores of the shared db, reusing `offlineDB`'s private connection.
- Public surface (all `async`, all obtain the db via private `getDB()`):
  - Subsections: `saveSubsection(subsection: OfflineSubsection): Promise<void>` (L6); `getSubsection(id: string): Promise<OfflineSubsection | null>` (L18); `getUnsyncedSubsections(): Promise<OfflineSubsection[]>` (L30); `markSubsectionSynced(id: string): Promise<void>` (L43).
  - Documents: `saveDocument(document: OfflineDocument): Promise<void>` (L66); `getUnsyncedDocuments(): Promise<OfflineDocument[]>` (L78); `getSubsectionDocuments(subsectionId: string): Promise<OfflineDocument[]>` (L91); `markDocumentSynced(id: string): Promise<void>` (L104); `deleteDocument(id: string): Promise<void>` (L126).
  - Floor plans: `saveFloorPlan(floorPlan: OfflineFloorPlan): Promise<void>` (L139); `getUnsyncedFloorPlans(): Promise<OfflineFloorPlan[]>` (L151); `getSubsectionFloorPlans(subsectionId: string): Promise<OfflineFloorPlan[]>` (L164); `markFloorPlanSynced(id: string): Promise<void>` (L177); `deleteFloorPlan(id: string): Promise<void>` (L199).
- Inputs & outputs: reads/writes the `subsections`, `documents`, `floor_plans` stores; `getUnsynced*` via `synced` index `only(false)` (L36, 84, 157); by-parent lookups via `subsection_id` index (L96–97, 169–170). No network/localStorage/env.
- Dependencies: uses -> `./offlineDB` value + types (L2–3, L11). used by <- H01 (src/hooks/useOfflineSync.ts:155, 179, 211 — dynamic imports of `markSubsectionSynced`, `markDocumentSynced`, `markFloorPlanSynced`), H02 (src/hooks/useOfflineSubsections.ts:3–10 — `saveSubsection`, `saveDocument`, `saveFloorPlan`, `getSubsection`, `getSubsectionDocuments`, `getSubsectionFloorPlans`). V02 OfflineReview.tsx:22 contains the path only as a string literal. (grep-verified)
- Side effects: `getDB()` calls `offlineDB.init()` when the private `offlineDB['db']` is null, accessed through two `@ts-ignore` lines (L212–218). All writes are single-store readwrite transactions.
- Error handling: every promise rejects with the IDB `request.error`; `markSubsectionSynced`/`markDocumentSynced`/`markFloorPlanSynced` resolve silently when the record doesn't exist (L57–59, 118–120, 191–193). All writes resolve on `request.onsuccess`, not commit. No catches or logging.
- Tests: none found (grep-verified — no test file imports `offlineDBExtensions`).
- Observed issues:
  - Reaches into `offlineDB`'s private `db` field via `@ts-ignore` (L212–218).
  - Five exports have zero callers outside this file (grep-verified, excluding untracked " 2" files): `getUnsyncedSubsections`, `getUnsyncedDocuments`, `deleteDocument`, `getUnsyncedFloorPlans`, `deleteFloorPlan`.
- ASSUMED: none.

## src/lib/offlineFloorPlanDB.ts

- Purpose: Function-module CRUD over the `floor_plan_pins`, `markups`, and `measurements` stores of the shared db, reusing `offlineDB`'s private connection.
- Public surface (all `async`):
  - Pins: `saveOfflinePin(pin: OfflineFloorPlanPin): Promise<void>` (L15); `getOfflinePin(id: string): Promise<OfflineFloorPlanPin | null>` (L27); `getFloorPlanPins(floorPlanId: string): Promise<OfflineFloorPlanPin[]>` (L39); `getUnsyncedPins(): Promise<OfflineFloorPlanPin[]>` (L52); `markPinSynced(id: string): Promise<void>` (L65); `deleteOfflinePin(id: string): Promise<void>` (L87).
  - Markups: `saveMarkup(markup: OfflineMarkup): Promise<void>` (L100); `getFloorPlanMarkups(floorPlanId: string): Promise<OfflineMarkup[]>` (L112); `getUnsyncedMarkups(): Promise<OfflineMarkup[]>` (L125); `markMarkupSynced(id: string): Promise<void>` (L138); `deleteMarkup(id: string): Promise<void>` (L160).
  - Measurements: `saveMeasurement(measurement: OfflineMeasurement): Promise<void>` (L173); `getFloorPlanMeasurements(floorPlanId: string): Promise<OfflineMeasurement[]>` (L185); `getUnsyncedMeasurements(): Promise<OfflineMeasurement[]>` (L198); `markMeasurementSynced(id: string): Promise<void>` (L211); `deleteMeasurement(id: string): Promise<void>` (L233).
- Inputs & outputs: reads/writes `floor_plan_pins`, `markups`, `measurements`; by-plan lookups via `floor_plan_id` index (L44–45, 117–118, 190–191); `getUnsynced*` via `synced` index `only(false)` (L57–58, 130–131, 203–204). No network/localStorage/env.
- Dependencies: uses -> `./offlineDB` value + types (L2–3, L11). used by <- H01 (src/hooks/useOfflineSync.ts:219, 262, 283, 294, 301, 307, 314 — dynamic imports of `markPinSynced`, `deleteOfflinePin`, `markMarkupSynced`, `deleteMarkup`, `markMeasurementSynced`, `deleteMeasurement`), H02 (src/hooks/useOfflineFloorPlanAnnotations.ts:4–15 — `saveOfflinePin`, `getOfflinePin`, `getFloorPlanPins`, `deleteOfflinePin`, `saveMarkup`, `getFloorPlanMarkups`, `deleteMarkup`, `saveMeasurement`, `getFloorPlanMeasurements`, `deleteMeasurement`). V02 OfflineReview.tsx:23 contains the path only as a string literal. (grep-verified)
- Side effects: `getDB()` (L5–12) mirrors offlineDBExtensions — `@ts-ignore` access to `offlineDB['db']`, calling `offlineDB.init()` when null.
- Error handling: promises reject with the IDB `request.error`; `mark*Synced` resolve silently when the record is missing (L79–81, 152–154, 225–227). Writes resolve on `request.onsuccess`. No catches or logging.
- Tests: none found (grep-verified — no test file imports `offlineFloorPlanDB`).
- Observed issues:
  - Same `@ts-ignore` private-field access pattern as offlineDBExtensions.ts (L6–11).
  - Three exports have zero external callers (grep-verified): `getUnsyncedPins`, `getUnsyncedMarkups`, `getUnsyncedMeasurements`.
  - File header says "offline floor plan annotations" but the `wm_floor_plan_offline` database named in cacheUtils.ts:43 is not opened here — this module uses the shared `wm_compliance_offline` connection.
- ASSUMED: none.

## src/lib/offlineInspectionDB.ts

- Purpose: Second connection manager over the same shared db, providing full-inspection caching (`inspection_cache`), inspection image storage (`inspection_images`), template caching (`template_cache`), LRU eviction, and storage-quota reporting.
- Public surface:
  - Interfaces: `CachedInspection` (L9 — includes `json_data: any`, `template: any | null`, nested `site_data`/`subsection_data` objects, `cached_at`, `last_modified`, `synced`, `pending_changes`), `OfflineInspectionImage` (L38), `CachedTemplate` (L50).
  - `export const offlineInspectionDB = new OfflineInspectionDatabase()` (L531). Methods:
    - `init(): Promise<void>` (L62) — caches `initPromise`, drops it on rejection (L186–194).
    - Cache: `cacheInspection(inspection: CachedInspection): Promise<void>` (L199); `getCachedInspection(id: string): Promise<CachedInspection | null>` (L215); `getAllCachedInspections(): Promise<CachedInspection[]>` (L227); `getCachedInspectionsBySite(siteId: string): Promise<CachedInspection[]>` (L239); `getUnsyncedInspections(): Promise<CachedInspection[]>` (L252 — queries the `pending_changes` index `only(true)`, L257–258); `markInspectionSynced(id: string): Promise<void>` (L265); `updateCachedInspectionData(id: string, jsonData: any): Promise<void>` (L275); `deleteCachedInspection(id: string): Promise<void>` (L287); `isInspectionCached(id: string): Promise<boolean>` (L299); `evictOldInspections(maxCount: number = 50): Promise<number>` (L305).
    - Images: `saveInspectionImage(image: OfflineInspectionImage): Promise<void>` (L331); `getInspectionImages(inspectionId: string, sectionKey?: string): Promise<OfflineInspectionImage[]>` (L346); `getUnsyncedImages(): Promise<OfflineInspectionImage[]>` (L365); `markImageSynced(id: string, uploadedUrl: string): Promise<void>` (L378); `deleteInspectionImage(id: string): Promise<void>` (L401); `deleteInspectionImages(inspectionId: string): Promise<void>` (L413).
    - Templates: `cacheTemplate(template: CachedTemplate): Promise<void>` (L422); `getCachedTemplate(id: string): Promise<CachedTemplate | null>` (L434); `getAllCachedTemplates(): Promise<CachedTemplate[]>` (L446); `deleteCachedTemplate(id: string): Promise<void>` (L458); `evictOldTemplates(maxCount: number = 20): Promise<number>` (L471).
    - Quota: `getStorageEstimate(): Promise<{ used: number; quota: number; percentage: number }>` (L492); `getCacheStats(): Promise<{ inspectionCount; imageCount; templateCount; pendingChanges; unsyncedImages }>` (L503).
- Inputs & outputs: same IndexedDB `wm_compliance_offline` v5 (L2,7); its `onupgradeneeded` recreates the full 14-store set idempotently (L84–183). `getStorageEstimate` reads `navigator.storage.estimate()` (L493–494). No network/localStorage/env.
- Dependencies: uses -> none (zero imports). used by <- H01 (src/hooks/useOfflineSync.ts:331, 357, 364 — dynamic imports for `markInspectionSynced`, `getInspectionImages`, `markImageSynced`), H02 (src/hooks/useOfflineInspectionDetail.ts:5–9 and call sites at 59, 69, 115, 126, 134–135, 147, 324; src/hooks/useOfflineInspectionDetail.queueSave.test.tsx:8, 70, 84), L11-internal (offlineDB.versionParity.test.ts:4; offlineInspectionDB.eviction.test.ts:3; offlineInspectionDB.initRetry.test.ts:3). Untracked `src/views/OfflineSyncTest 2.tsx` calls `getStorageEstimate` (line 127) but has no tracked counterpart. offlineDB.ts mentions this module only in comments (offlineDB.ts:3, 237). (grep-verified)
- Side effects: opens an IndexedDB connection; logs `Upgrading IndexedDB from version X to 5` on upgrade (L88); `onversionchange` closes and nulls the handle (L77–80). `evictOldInspections` deletes evicted inspections and their images sequentially (L320–324); `evictOldTemplates` deletes surplus templates (L482–485).
- Error handling: `init()` logs `console.error('Failed to open IndexedDB:', ...)` and rejects (L69–72); on rejection the cached `initPromise` is nulled (identity-guarded) so a later `init()` retries (L186–194). `cacheInspection` and `saveInspectionImage` resolve on `tx.oncomplete` and reject on `tx.onabort` with fallback errors (L209–211, 340–342); other operations resolve on `request.onsuccess` and reject with `request.error`. `markInspectionSynced`, `updateCachedInspectionData`, `markImageSynced` no-op silently when the record is absent (L268, 278, 393–394). `getStorageEstimate` returns zeros when the Storage API is unavailable (L500).
- Tests: offlineInspectionDB.eviction.test.ts (pending-changes never evicted), offlineInspectionDB.initRetry.test.ts (transient open failure recoverable), offlineDB.versionParity.test.ts (shared-db coexistence); src/hooks/useOfflineInspectionDetail.queueSave.test.tsx (H02) exercises `cacheInspection`/`getCachedInspection` as a consumer.
- Observed issues:
  - `evictOldInspections` computes `const toKeep = allInspections.slice(0, maxCount)` (L317) and never uses it.
  - Eviction semantics: `toEvict` filters out `pending_changes` (L318), so the cache can permanently exceed `maxCount` while pending items exist; the count returned is post-filter.
  - `markInspectionSynced` and `updateCachedInspectionData` are read-modify-write across two separate transactions (`getCachedInspection` then `cacheInspection`, L267–272, 277–284), unlike the single-transaction pattern used by `markImageSynced` (L383–397).
  - `getCacheStats` issues one `getInspectionImages` query per cached inspection in a loop (L515–519).
  - `deleteInspectionImages` deletes images one-by-one, each in its own transaction (L413–418).
  - `mutations` and other stores it creates in `onupgradeneeded` are never accessed by this class's methods (it only touches `inspection_cache`, `inspection_images`, `template_cache`).
- ASSUMED: none.

## src/lib/offlineInspectionDB.eviction.test.ts

- Purpose: Locks in that `evictOldInspections` never evicts inspections with `pending_changes`, recording the refuted C2/H13 sweep finding.
- Public surface: none (test file; helper `makeCached(id, cachedAt, pending)` at L8; one `describe` at L31, one `it`).
- Inputs & outputs: `fake-indexeddb/auto` (L1); real `offlineInspectionDB` singleton and `CachedInspection` type (L3).
- Dependencies: uses -> vitest, fake-indexeddb, `./offlineInspectionDB` (L11). used by <- none found (grep-verified; test file).
- Side effects: caches three inspections dated 2026-06-13 / 2026-06-01 / 2026-05-01 (L33–35) and evicts with `maxCount = 1` (L37).
- Error handling: none beyond assertions.
- Tests: is itself a test. Asserts `evicted === 1`, the recent and old-pending inspections survive, and only `old-synced` is deleted (L39–42).
- Observed issues: none.
- ASSUMED: none.

## src/lib/offlineInspectionDB.initRetry.test.ts

- Purpose: Verifies the C4 fix — a transiently failing `indexedDB.open` does not permanently cache a rejected `initPromise`; a later `init()` succeeds.
- Public surface: none (test file; helper `failNextOpenOnce()` at L11 monkey-patches `indexedDB.open` to error exactly once via a stub request whose `onerror` fires on a microtask, L15–23; one `describe` at L26, one `it`).
- Inputs & outputs: `fake-indexeddb/auto` (L1); real `offlineInspectionDB` singleton (L3).
- Dependencies: uses -> vitest, fake-indexeddb, `./offlineInspectionDB` (L11). used by <- none found (grep-verified; test file).
- Side effects: temporarily replaces `indexedDB.open` and restores it on first call (L18).
- Error handling: the simulated failure is a `DOMException('simulated transient failure', 'UnknownError')` (L20).
- Tests: is itself a test. Asserts the first `init()` rejects (L31) and the second resolves (L34).
- Observed issues: none.
- ASSUMED: none.

## src/lib/offlineQueue.ts

- Purpose: Standalone append/ordering/merge helpers for the localStorage offline mutation queue that H01's `useOfflineSync` drains.
- Public surface:
  - `export const OFFLINE_QUEUE_KEY = 'offline_mutation_queue'` (L3).
  - `enqueueOfflineMutation(type: string, data: unknown, opts?: { dedupeKey?: string }): void` (L13).
  - `orderQueueForSync<T extends { type: string }>(queue: T[]): T[]` (L43) — stable sort moving `UPLOAD_INSPECTION_IMAGE` entries after everything else (rank 1 vs 0, L44–45); returns a new array.
  - `mergeServerPhotos(serverJson: any, clientJson: any): any` (L57) — unions `json_data[sectionKey][itemKey].photos` arrays from server into client (`new Set([...clientPhotos, ...serverPhotos])`, L80), leaving non-object/array top-level values (e.g. `tenants`) untouched (L58, 63).
  - Interface `QueuedMutation` (L5 — `id`, `type`, `data`, `timestamp`, `retries`) is module-private, not exported.
- Inputs & outputs: reads/writes localStorage key `offline_mutation_queue` (L20, 31). Enqueue appends `{ id: crypto.randomUUID(), type, data, timestamp: Date.now(), retries: 0 }` (L30); with `dedupeKey`, first removes entries where `m.type === type && m.data.id === opts.dedupeKey` (L25–29).
- Dependencies: uses -> none. used by <- H01 (src/hooks/useOfflineSync.ts:6 — `OFFLINE_QUEUE_KEY` aliased `QUEUE_KEY`, `orderQueueForSync` used at :428, `mergeServerPhotos` at :351; src/hooks/useOfflineSync.queueRaces.test.tsx:10; src/hooks/useOfflineSync.syncInspection.test.tsx:10), H02 (src/hooks/useOfflineInspectionDetail.ts:10 — `enqueueOfflineMutation`; src/hooks/useOfflineInspectionDetail.queueSave.test.tsx:10). (grep-verified)
- Side effects: `enqueueOfflineMutation` writes localStorage and dispatches `window.dispatchEvent(new Event('offline-queue-updated'))` when `window` exists (L32–34).
- Error handling: corrupt/missing stored JSON is caught and replaced with an empty queue (L19–24); `localStorage.setItem` (L31) is not guarded — a storage exception propagates to the caller. `orderQueueForSync` and `mergeServerPhotos` are pure; `mergeServerPhotos` returns `clientJson` unchanged when `serverJson` is null/non-object/array (L58).
- Tests: src/lib/offlineQueue.test.ts (all three functions); H01/H02 hook tests consume `OFFLINE_QUEUE_KEY` to assert queue contents.
- Observed issues:
  - Dedupe matches on `data.id`, not on the `dedupeKey` value directly — callers must pass a `dedupeKey` equal to `data.id` for the filter to hit (L27).
  - `crypto.randomUUID()` is called unconditionally (L30) with no fallback.
- ASSUMED: none.

## src/lib/offlineQueue.test.ts

- Purpose: Tests the three offlineQueue exports — enqueue shape/dedupe, drain ordering, and server-photo merging.
- Public surface: none (test file; local `mockLocalStorage()` at L4 replaces `globalThis.localStorage` with a Map-backed mock; three `describe` blocks at L14, L40, L73).
- Inputs & outputs: mock localStorage only; no IndexedDB.
- Dependencies: uses -> vitest, `./offlineQueue` (L11). used by <- none found (grep-verified; test file).
- Side effects: reassigns `globalThis.localStorage` before each enqueue test (L15).
- Error handling: none beyond assertions.
- Tests: is itself a test. `enqueueOfflineMutation`: appends a well-formed mutation (`type`, `data`, `retries: 0`, string `id`, L17–23); dedupeKey collapses repeated saves to the latest (L25–31); distinct items without dedupeKey both persist (L33–37). `orderQueueForSync`: moves `UPLOAD_INSPECTION_IMAGE` after others preserving relative order `['s1','c1','u1','u2']` (L44–53); no-op without uploads (L55–61); does not mutate input (L63–70). `mergeServerPhotos`: preserves server photo missing from client while client's `notes` edit wins (L74–80); unions without duplicates `['b','c','a']` (L82–86); adds untouched server sections (L88–94); passes top-level `tenants` array through with client winning (L96–102); returns client snapshot for null/undefined server (L104–107).
- Observed issues: none.
- ASSUMED: none.

## src/lib/onlineStatus.ts

- Purpose: Single defensive connectivity reader that returns true unless the environment positively reports offline.
- Public surface: `getOnline(): boolean` (L5).
- Inputs & outputs: reads `navigator.onLine`; returns `true` when `navigator` is undefined or `onLine` is not a boolean (L6–7). No stores.
- Dependencies: uses -> none. used by <- H01 (src/hooks/useOfflineSync.ts:7), H02 (src/hooks/useOfflinePhotos.ts:6; src/hooks/useOfflineInspectionDetail.ts:11), L11-internal (onlineStatus.test.ts:5). (grep-verified)
- Side effects: none (pure read).
- Error handling: none needed; the type guards are the whole behaviour. Header comment (L1–4) documents the Node-`navigator`-without-`onLine` false-offline case it defends against.
- Tests: src/lib/onlineStatus.test.ts.
- Observed issues: none. (Manifest H01 notes a separate `useOnlineStatus` hook exists in src/hooks; this module is independent of it.)
- ASSUMED: none.

## src/lib/onlineStatus.test.ts

- Purpose: Tests `getOnline` under jsdom — boolean pass-through and non-boolean default-online.
- Public surface: none (test file; `@vitest-environment jsdom` docblock L1–3; helper `defineOnLine(value)` redefines the `navigator.onLine` getter, L7–9; one `describe` at L11).
- Inputs & outputs: jsdom `navigator` only.
- Dependencies: uses -> vitest, `./onlineStatus` (L11). used by <- none found (grep-verified; test file).
- Side effects: redefines `navigator.onLine` per test; `afterEach` restores it to `true` (L12).
- Error handling: none beyond assertions.
- Tests: is itself a test. Asserts `getOnline()` mirrors boolean `navigator.onLine` values false/true (L14–19) and returns `true` when `onLine` is `undefined` (L21–24).
- Observed issues: none.
- ASSUMED: none.
