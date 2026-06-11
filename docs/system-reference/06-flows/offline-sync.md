# Flow: Offline-Sync (offline-first capture, queue, and flush)

Ground-truth trace of the offline-first subsystem: the IndexedDB layer, the offline
React hooks, the localStorage mutation-queue engine, conflict handling, storage-quota
guards, and the (unrelated-to-sync) `offline-review` edge function. Every claim cites
`src/...:line`, a migration filename, or an earlier review chapter. Inferences that cannot
be confirmed in code are marked **⚠️ UNVERIFIED**.

Schema / RLS / storage / edge-fn facts are cited from the earlier chapters rather than
re-derived:
- Tables & RLS: [`02-data-model/tables-01.md`], [`tables-03.md`], [`tables-04.md`], [`tables-05.md`], [`rls-policies-02.md`], [`rls-policies-04.md`]
- Storage buckets & `storage.objects` policies: [`02-data-model/triggers-enums-storage.md`]
- `offline-review` edge fn: [`05-edge-functions/qr-offline-reports-misc.md`]
- Known gaps: [`GAPS.md`] G-PROD-01 (PR #11), G-PROD-03 (A3/A4/A5), G-TEST-10; [`SECURITY-FINDINGS-phase2.md`] §A

---

## 0. Architecture at a glance

Two cooperating persistence layers plus two independent "flush" engines:

| Layer | File | Role |
|---|---|---|
| Primary IndexedDB wrapper | `src/lib/offlineDB.ts` | DB name `wm_compliance_offline`, **v4** (`:2,:7`). Owns inspections/images/**mutations**/subsections/documents/floor_plans/floor_plan_pins/markups/measurements/coc_compliance_photos/offline_photos stores. |
| Subsection/doc/floor-plan ops | `src/lib/offlineDBExtensions.ts` | Free functions over the same DB; reach into `offlineDB['db']` via a `getDB()` helper (`:212-219`, `@ts-ignore` private access). |
| Floor-plan annotation ops | `src/lib/offlineFloorPlanDB.ts` | Pins/markups/measurements CRUD over the same DB (`getDB()` `:5-12`). |
| Inspection cache (parallel class) | `src/lib/offlineInspectionDB.ts` | **Same DB name, same v4** (`:2,:6`), separate class instance. Owns `inspection_cache`, `inspection_images`, `template_cache`. Re-creates the full store set idempotently on upgrade (`:91-178`) so neither module clobbers the other. |
| Storage-quota guard | `src/lib/storageQuota.ts` | `navigator.storage.estimate()` wrapper + pre-write space check. |

Two **separate** flush engines exist (they do not share queue state):
1. **Mutation queue engine** — `useOfflineSync.ts`, backed by **localStorage** key `offline_mutation_queue` (`:15`). Drives inspections, subsections, documents, floor-plan uploads, pins, markups, measurements.
2. **Photo sync engine** — `useOfflinePhotos.ts`, backed by the **IndexedDB** `offline_photos` store. Self-contained; never touches the localStorage queue.

The mutation engine is mounted app-wide: `OfflineIndicator` (which calls `useOfflineSync()`,
`OfflineIndicator.tsx:7`) is rendered globally in `src/app/providers.tsx:26`, so the
online→flush effect runs everywhere. **Each component that calls `useOfflineSync()` gets its
own hook instance with its own `isSyncing` state** but a shared localStorage queue (see
trust-boundaries §).

> **Note:** the `offline-review` edge function is an **AI code-review** helper, NOT part of
> the sync path. It is documented in §7 for completeness because the task names it, but no
> offline-sync code path invokes it.

---

## DB version-skew history (why v4)

`offlineDB.ts:3-7` and `offlineInspectionDB.ts:3-6` both pin `DB_VERSION = 4` and the same
`DB_NAME`. The header comments record that before v4, `offlineDB(v3)` and
`offlineInspectionDB(v2)` "fought over one db name with divergent schemas, causing
VersionError / missing object stores" (`offlineDB.ts:3-6`). Each `init()` also registers
`onversionchange` to close its handle if another module upgrades (`offlineDB.ts:176-179`,
`offlineInspectionDB.ts:75-78`). **⚠️ UNVERIFIED:** GAPS G-PROD-01 / the full-app-review memory
describe a PR #11 "queue_blobs IndexedDB **v5**" draft engine; the code on `main` is still v4,
so the v5 engine is **not** in this tree.

---

## 1. STEP SEQUENCE — write path (capture / edit while offline)

Actor for every write below: an **authenticated inspector/admin user** (the app is behind
auth; the offline hooks call `supabase.from(...)` which carries the user JWT when online).
Online-write attempts are gated by Supabase RLS; offline writes are gated by **nothing** until
flush.

### 1a. Create inspection
1. **Actor/trigger:** user submits new inspection → `useOfflineInspections.createInspection(data)` (`useOfflineInspections.ts:24`).
2. Generates a **client-side id** `offline_${Date.now()}_${Math.random()}` (`:25`).
3. **If `navigator.onLine`:** tries `supabase.from('inspections').insert(...).select().single()` (`:35-39`) → RLS on `inspections` applies. On success returns the row; on error **falls through to offline** (`:44-47`).
4. **Offline path:** `offlineDB.saveInspection({...,synced:false})` → IndexedDB `inspections` store (`offlineDB.ts:290`), then `queueMutation('CREATE_INSPECTION', inspectionData)` (`:58`).
5. **UI feedback:** toast "Inspection saved offline. Will sync when online." (`:59`).

### 1b. Update / delete inspection
- `updateInspection` (`:63`) / `deleteInspection` (`:84`): same online-first-then-fallback shape; offline path **only** queues `UPDATE_INSPECTION` / `DELETE_INSPECTION` (`:80`, `:101`) — note **update does not write the new values into IndexedDB**, it only enqueues the diff (no local read-back of the edited row).

### 1c. Inspection detail editing & images (separate cache)
1. **Cache for offline use:** `useOfflineInspectionDetail.cacheInspection(...)` snapshots a Supabase inspection (+ template + site + subsection) into `inspection_cache` via `offlineInspectionDB.cacheInspection` (`useOfflineInspectionDetail.ts:65-129` → `offlineInspectionDB.ts:187`). Templates cached separately into `template_cache` (`:104-114`). LRU eviction kicked in background: `evictOldInspections(50)` / `evictOldTemplates(20)` (`:121-122`).
2. **Edit a section offline:** `saveInspectionSection(sectionKey,itemKey,data)` deep-merges into `json_data` and calls `offlineInspectionDB.updateCachedInspectionData` (`:138-168` → `offlineInspectionDB.ts:259-269`), which sets `pending_changes=true, synced=false, last_modified=now` on the cached row.
3. **Add image offline:** `addOfflineImage(file,sectionKey,itemKey)` → compresses to JPEG ≤800px @0.7 via canvas (`compressImage`, `:313-358`), stores blob in `inspection_images` with `synced:false` (`:185-197` → `offlineInspectionDB.ts:315`). Returns a `URL.createObjectURL` blob URL for instant display (`:204`).
4. **Read-back:** `getSectionImages` merges online URLs from cached `json_data` with offline blob URLs (`:213-245`).

### 1d. Subsection edit / document / floor-plan upload
`useOfflineSubsections.ts`:
- `updateSubsection` (`:34`): online-first; offline path requires the subsection to **already be cached** (`getSubsection`, `:51`) — if not, toast "Subsection data not available offline" and abort (`:53-56`). Otherwise merges, `saveSubsection(synced:false)` (`:66`) and queues `UPDATE_SUBSECTION` (`:67`).
- `uploadDocument` (`:71`) / `uploadFloorPlan` (`:147`): both run `validateFile(...)` (`fileValidation`) and `checkStorageAvailable(file.size)` (`storageQuota.ts:41`) **before** anything. Online → upload to `documents` bucket + insert into `subsection_documents` / `subsection_floor_plans` ([`tables-05.md:145,:187`]). Offline → blob saved to IndexedDB `documents`/`floor_plans` store + queue `UPLOAD_DOCUMENT` / `UPLOAD_FLOOR_PLAN` with the **`File` object embedded in the queued mutation** (`:136-142`, `:208-213`).

### 1e. Floor-plan annotations (pins / markups / measurements)
`useOfflineFloorPlanAnnotations.ts`:
- `addPin` / `updatePin` / `deletePin` (`:36`,`:98`,`:158`): online-first against `floor_plan_pins` ([`tables-02.md:244`]; RLS [`rls-policies-02.md:95-104`]); offline → `saveOfflinePin` + queue `ADD/UPDATE/DELETE_FLOOR_PLAN_PIN` (`:92-93`,`:153-154`,`:175-176`). Pin photos travel as a `photo_blob` on the pin and as a `photo` File in the queued payload.
- `addMarkup` / `addMeasurement` (`:180`,`:220`): **local-only persistence.** Saved to IndexedDB `markups`/`measurements` (`saveMarkup`/`saveMeasurement`). A mutation is queued **only when online** (`synced:!isOnline`, so offline records are marked `synced:true` immediately — `:197`,`:243`). See §4 (never-uploaded).

### 1f. Unified offline photos (COC / inspection / site / floor-plan / document)
`useOfflinePhotos.ts` — separate from the mutation queue:
1. `capturePhoto(photoType,options)` (`:130`): camera via `useCamera`, adaptive compression (`compressImage`, aggressive on cellular — `:140-141,:57-86`), thumbnail (`:147,:36-55`), GPS with a 5s timeout (`getGPSCoordinates`, `:88-98`), `captured_by = (await supabase.auth.getUser()).user?.id || 'unknown'` (`:148,:163`).
2. Persists an `OfflinePhoto` (id = **`crypto.randomUUID()`** `:151`) with `synced:false` into IndexedDB `offline_photos` store (`offlineDB.ts:481`).
3. **UI:** toast "Photo captured and stored locally" (`:175`). Pending count + byte size tracked in `loadPhotos` (`:114-126`).

---

## 2. STEP SEQUENCE — flush path (when connectivity returns)

### 2a. Mutation queue engine (`useOfflineSync.ts`)
1. **Trigger:** `window 'online'` event → `handleOnline` sets `isOnline=true` + toast "Back online! Syncing..." (`:472-475`). A `useEffect` on `isOnline` then calls `processQueue` (`:494-498`). Also manually via the `OfflineIndicator` refresh button (`OfflineIndicator.tsx:27`).
2. **`processQueue`** (`:434`): guards `if (!isOnline || isSyncing) return` (`:435`); reads the localStorage queue (`getQueue`, `:25-32`); sets `isSyncing=true` (`:440`).
3. **Iterates the queue in order** (`:443`), calling `executeMutation(mutation)` per item. **The whole queue snapshot is iterated; failed items are collected into `failedMutations` and re-saved** (`:441,:451-457,:461`).
4. **`executeMutation`** (`:56-431`) — type switch. Each case performs the real network write and, on success, marks the local IndexedDB record synced:
   - `CREATE_INSPECTION` → `inspections` insert + `markInspectionSynced` (`:58-67`).
   - `UPDATE_INSPECTION` / `DELETE_INSPECTION` → `inspections` update/delete (`:69-89`).
   - `UPLOAD_IMAGE` → `supabase.storage.from(bucket).upload(path,file)` (`:91-107`) — note it then finds the matching unsynced image by `inspection_id` (`:100-104`), not by id (fragile if multiple).
   - `UPDATE_SUBSECTION` → `subsections` update + `markSubsectionSynced` (`:109-121`).
   - `UPLOAD_DOCUMENT` → storage `documents` upload → `getPublicUrl` → insert `subsection_documents` → `markDocumentSynced` (`:123-153`).
   - `UPLOAD_FLOOR_PLAN` → storage `documents` upload → insert `subsection_floor_plans` → `markFloorPlanSynced` (`:155-183`).
   - `ADD_FLOOR_PLAN_PIN` / `UPDATE_FLOOR_PLAN_PIN` → optional `inspection-photos` upload of pin photo → insert/update `floor_plan_pins` → `markPinSynced` (`:185-255`).
   - `DELETE_FLOOR_PLAN_PIN` → delete `floor_plan_pins` + `deleteOfflinePin` (`:257-266`).
   - `SAVE_INSPECTION_JSON` → `inspections.update({json_data,...})` + `offlineInspectionDB.markInspectionSynced` (`:296-311`).
   - `UPLOAD_INSPECTION_IMAGE` → builds a descriptive path via `generateInspectionImagePath` from the cached site/subsection names (`:313-339`), uploads to `inspection-photos`, **mutates cached `json_data` to append the public URL and re-updates the inspection** (`:354-377`), then `markImageSynced(imageId, publicUrl)` (`:380`).
   - `BATCH_UPLOAD_INSPECTION_IMAGES` → loop variant of the above (`:385-426`).
   - **`ADD_MARKUP` / `ADD_MEASUREMENT`** (`:268-292`): **NO network write.** Comment: "Markups/Measurements are stored locally only for now." They merely `markMarkupSynced`/`markMeasurementSynced` on the local record. `DELETE_MARKUP`/`DELETE_MEASUREMENT` just delete locally. → see §4.
   - `default` → `console.warn('Unknown mutation type')` (`:428-429`).
5. **Retry/error path** (`:447-458`): on throw, if `retries < MAX_RETRIES` (=3, `:16`) the mutation is re-queued with `retries+1`; otherwise a toast `Failed to sync <type> after 3 attempts` and **the item is dropped** (not re-queued → permanent loss of that mutation).
6. **Completion** (`:461-467`): `saveQueue(failedMutations)`. If nothing failed and the queue was non-empty → toast "Synced N offline action(s)" + `queryClient.invalidateQueries()` (full cache refresh).

### 2b. Photo sync engine (`useOfflinePhotos.ts`)
1. **Trigger:** `window 'online'` → `syncPhotos` (`:347-353`); also runs on mount if online (`:351`). Guarded by `syncingRef`, `navigator.onLine`, and `syncPaused` (`:187`).
2. Reads all unsynced from IndexedDB `offline_photos` (`getUnsyncedOfflinePhotos`, `:192`), **sorts by `SYNC_PRIORITY` (coc=0 … site=4, `:11-17,:196-198`)**, adaptive re-compression on cellular (`:200-216`).
3. Per photo: upload to **`coc-photos` bucket** (`PHOTOS_BUCKET`, `:8`) at `${context_type}/${context_id}/${photo_type}/${id}.jpg` with `upsert:true` (`:218-228`) → `getPublicUrl` (`:230-232`).
4. **DB record:** if `context_type==='coc'` → upsert `coc_compliance_photos` ([`tables-01.md:251`]); else upsert the **`offline_photos` server table** ([`tables-04.md:78`]) (`:234-275`). On success sets `synced=true, remote_url, sync_error=null` and re-saves locally (`:277-281`).
5. **Retry:** on error increments `photo.retry_count`, stores `sync_error`, re-saves; photos with `retry_count >= MAX_RETRIES` (=3, `:7`) are skipped (`:209,:282-288`). **No hard-drop** — failed photos remain in IndexedDB but are never retried after 3 fails (silent stall, not loss).
6. **UI:** toasts for N synced / N failed (`:291-297`). `pauseSync`/`resumeSync` (`:341-345`).

---

## 3. Storage-quota guard (`src/lib/storageQuota.ts`)
- `getStorageQuota()` (`:13`) wraps `navigator.storage.estimate()`; returns null if the API is unsupported.
- `checkStorageAvailable(requiredBytes)` (`:41`): adds a 10 MB buffer (`:52`); if `available < needed` → error toast and returns **false** (caller aborts the write — `useOfflineInspections.ts:122-124`, `useOfflineSubsections.ts:87-89,:162-164`). If unsupported, **returns true (assumes space)** (`:46-49`). Warns at >80% used (`:67-72`).
- `offlineInspectionDB.getStorageEstimate()` (`offlineInspectionDB.ts:473`) and `getCacheStats()` (`:484`) provide the dashboard numbers.
- **⚠️ UNVERIFIED gap:** `estimateIndexedDBUsage()` (`:93-113`) returns a fixed ~1 KB-per-database stub, and `clearOldOfflineData()` (`:118-135`) only `console.log`s ("This would need to be implemented in offlineDB", `:127`) then toasts success — it deletes nothing. Dead/placeholder utilities.

---

## 4. Never-uploaded paths (GAPS A3/A4/A5)

Per [`GAPS.md`] G-PROD-03 and the full-app-review memory, three offline write paths have
**no server destination** and so never reach Supabase:

| Path | Local store | Why it stalls | Evidence |
|---|---|---|---|
| **Markups (A4)** | IndexedDB `markups` (`offlineDB.ts:235`) | No `markups` server table exists ([data model has none — confirmed absent in `02-data-model`]). `ADD_MARKUP`/`DELETE_MARKUP` handlers only touch local IndexedDB. | `useOfflineSync.ts:268-279` ("stored locally only for now") |
| **Measurements (A5)** | IndexedDB `measurements` (`offlineDB.ts:242`) | No `measurements` server table. `ADD_MEASUREMENT`/`DELETE_MEASUREMENT` local-only. | `useOfflineSync.ts:281-292` |
| **Inspection images (A3)** | IndexedDB `inspection_images` (`offlineInspectionDB.ts:149`) | These flush **only** if a `UPLOAD_INSPECTION_IMAGE`/`BATCH_…` mutation is enqueued. `addOfflineImage` (`useOfflineInspectionDetail.ts:171`) saves the blob but **never calls `queueMutation`** — no enqueue site exists in this hook. So locally-added inspection-detail images are orphaned unless some other caller queues them. | `useOfflineInspectionDetail.ts:171-210` (no `queueMutation`); enqueue handlers exist only in `useOfflineSync.ts:313-426` |

Additionally, because markups/measurements are marked `synced:true` at creation when offline
(`useOfflineFloorPlanAnnotations.ts:197,:243`), they will **never** appear in
`getUnsyncedMarkups`/`getUnsyncedMeasurements` — i.e. there is no future retry hook even if a
table is later added. Schema decision required before wiring (G-PROD-03).

---

## 5. Conflict handling
- **No merge / no version vector / no last-write-wins reconciliation against the server.** Flush is a blind replay: `UPDATE_INSPECTION` sends the queued partial `updates` and overwrites whatever is on the server (`useOfflineSync.ts:69-77`); `SAVE_INSPECTION_JSON` overwrites the whole `json_data` (`:296-305`). If another device edited the same inspection in the interim, the offline replay **silently clobbers it** (last-flusher-wins).
- The cache's `pending_changes`/`last_modified` fields (`offlineInspectionDB.ts:259-269`) are local bookkeeping only; they are never compared to the server's `updated_at`.
- `UPLOAD_INSPECTION_IMAGE` reads the **cached** (possibly stale) `json_data`, appends a URL, and writes it back to the server (`useOfflineSync.ts:354-377`) — any server-side edits made after the cache snapshot are overwritten.
- Photo sync uses `upsert` by `id` (`useOfflinePhotos.ts:222,:238,:258`), so re-runs are idempotent **for photos only**.

---

## 6. Error & offline behaviour summary
- **Going offline:** `handleOffline` toast "You are offline. Changes will be synced…" (`useOfflineSync.ts:477-482`). `OfflineIndicator` shows a red "Offline Mode" badge with pending count (`OfflineIndicator.tsx:34-44`).
- **Online write fails (RLS, network):** every hook **catches and falls through to the offline queue** (`useOfflineInspections.ts:44-47`, etc.). A genuine RLS denial while *online* is therefore swallowed and re-queued as if it were an offline event — it will be retried up to 3 times then dropped with a toast.
- **Queue item exhausts retries:** dropped permanently (mutation engine, `:455-457`). Photos instead stall at `retry_count>=3` and remain in IndexedDB (`useOfflinePhotos.ts:209`).
- **DB unavailable / quota exceeded:** writes abort early via `checkStorageAvailable` (§3); IndexedDB `onerror` rejects the promise and the hook's `try/catch` toasts a failure (e.g. `addOfflineImage` `:205-208`).

---

## 7. `offline-review` edge function (NOT a sync path)
- **File:** `supabase/functions/offline-review/index.ts`. **Purpose:** AI code-review helper — posts user-supplied `codeFiles` to the Lovable AI Gateway and returns a structured review + dev prompt + quality score (`:34-173`).
- **Auth:** `verify_jwt = false`, **no in-handler auth** — straight from CORS to `req.json()` to the gateway call (`index.ts:8-14`; [`05-edge-functions/qr-offline-reports-misc.md:42-66`]).
- **Caller:** `src/views/OfflineReview.tsx:41` behind admin route `src/app/(admin)/offline-review/page.tsx` — but the route guard protects only the UI, not the function ([`qr-offline-reports-misc.md:64`]).
- Already recorded as a MEDIUM finding (unauthenticated paid-API/cost-DoS) in
  [`05-edge-functions/qr-offline-reports-misc.md:66`] and [`GAPS.md`] §A. Restated below as a
  security_flag for this flow's lens because the task scope names it.

---

## Data integrity / trust boundaries

1. **Offline writes cross into Supabase with zero per-row tenant scoping.** All flush targets
   touched by the queue — `inspections`, `subsections`, `floor_plan_pins`,
   `coc_compliance_photos`, `offline_photos` — have RLS reduced to
   `FOR ALL TO authenticated USING(true) WITH CHECK(true)` (migration `20260406131029`)
   ([`rls-policies-02.md:95-104`], [`rls-policies-04.md:70-77`], [`tables-01.md:274`],
   [`tables-04.md:104-108`]). The offline path inserts arbitrary `site_id`/`subsection_id`/
   `context_id` chosen on the client (`useOfflineInspections.ts:26`,
   `useOfflinePhotos.ts:155`); **the DB will accept any value from any authenticated user** —
   no FK back-stops `offline_photos` (`context_*` are unconstrained, [`tables-04.md:104`]).
   A user can write rows scoped to another tenant's site simply by flushing a crafted queue.

2. **Client-controlled identity fields.** `captured_by` comes from the client
   (`useOfflinePhotos.ts:163`, falling back to the literal `'unknown'`), and inspection/pin
   `created_by` is passed in from the caller (`useOfflineFloorPlanAnnotations.ts:87`). Because
   the COC/photo policies do not constrain these to `auth.uid()` (the original
   `auth.uid()`-scoped policies were dropped, [`tables-01.md:274`]), audit fields are
   spoofable.

3. **Public storage buckets.** `inspection-photos`, `documents`, and `coc-photos` are all
   `public=true` ([`triggers-enums-storage.md:106-116`]) and the effective `storage.objects`
   policy set is four blanket `Anyone can SELECT/INSERT/UPDATE/DELETE` policies with **no `TO`
   clause (→ role `public`, includes anon) and no `bucket_id` filter**
   ([`triggers-enums-storage.md:132-143`]). Net: every blob the sync engine uploads is
   anonymously readable, and anonymous callers can overwrite/delete them via the storage API.
   The descriptive image paths embed client/site/subsection names
   (`useOfflineSync.ts:327-335`, `generateInspectionImagePath`), leaking tenant identifiers in
   guessable public URLs.

4. **No conflict resolution → silent overwrite.** Blind replay of queued partial updates
   (§5) means a delayed flush from device A can clobber device B's newer server state. There is
   no `updated_at` guard.

5. **Permanent data loss on retry exhaustion.** Mutation-queue items are dropped after 3
   failures (`useOfflineSync.ts:455-457`); the captured edit/upload is gone with only a toast.

6. **Cross-instance queue races.** Multiple mounted `useOfflineSync()` instances share one
   localStorage queue but have independent `isSyncing` flags
   (`useOfflineSync.ts:21,:435`). Two instances can both pass the `isSyncing` guard and replay
   the same queue concurrently; `processQueue` reads, then `saveQueue(failedMutations)`
   overwrites — a classic read-modify-write race that can **duplicate inserts or lose items**.
   This is the concurrency-guard problem the (not-yet-merged) PR #11 engine targets
   ([`GAPS.md`] G-PROD-01 / G-TEST-10).

7. **Never-uploaded markups/measurements** (§4) are a silent data-completeness risk: the user
   sees "Markup saved" / "synced" toasts (`useOfflineFloorPlanAnnotations.ts:206,:252`) but the
   data never leaves the device.

8. **localStorage queue holds `File`/`Blob` payloads** for `UPLOAD_DOCUMENT`/`UPLOAD_FLOOR_PLAN`
   (`useOfflineSync.ts:136-142,:208-213`). `JSON.stringify` of a `File` yields `{}`
   (`saveQueue` `:35-38`), so **⚠️ UNVERIFIED but strongly implied:** offline document/floor-plan
   uploads serialize to an empty object and would fail to flush the file (the binary is lost on
   the localStorage round-trip). The image-blob paths route through IndexedDB instead and are
   not affected; only the two localStorage-File cases are suspect.

---

## Security flags
(See structured output below for the canonical list.)

- **HIGH** — flush targets (`inspections`/`subsections`/`floor_plan_pins`/`coc_compliance_photos`/`offline_photos`) — offline queue replays write client-chosen `site_id`/`context_id` into tables whose RLS is `USING(true) WITH CHECK(true)` for any authenticated user, with no FK on `offline_photos` context columns → cross-tenant write / IDOR (evidence: `useOfflinePhotos.ts:155-274`, [`rls-policies-04.md:70-77`], [`tables-04.md:104-108`], migration `20260406131029`).
- **HIGH** — storage buckets `inspection-photos`/`documents`/`coc-photos` — all `public=true` with blanket `storage.objects` policies granting anon SELECT/INSERT/UPDATE/DELETE on every bucket; sync-uploaded evidence is anon-readable and anon-deletable, and public paths leak client/site names (evidence: [`triggers-enums-storage.md:106-143`], `useOfflineSync.ts:327-335`).
- **MEDIUM** — `captured_by`/`created_by` audit fields — set from client input with `'unknown'` fallback and no `auth.uid()` constraint after the scoped policies were dropped → spoofable provenance on compliance photos (evidence: `useOfflinePhotos.ts:163`, `useOfflineFloorPlanAnnotations.ts:87`, [`tables-01.md:274`]).
- **MEDIUM** — `offline-review` edge fn (`supabase/functions/offline-review/index.ts`) — `verify_jwt=false`, no in-handler auth; any anon caller drives uncapped `LOVABLE_API_KEY` spend (cost-DoS). Not part of the sync path but named in scope (evidence: `offline-review/index.ts:8-14,:110-125`, [`qr-offline-reports-misc.md:66`]).
- **MEDIUM** — `useOfflineSync.processQueue` (`useOfflineSync.ts:434-468`) — multiple hook instances share one localStorage queue with per-instance `isSyncing`; read-modify-write of the queue under concurrent flush can duplicate inserts or drop mutations (no atomic guard) (evidence: `:21,:435,:461`; [`GAPS.md`] G-PROD-01).
- **LOW** — online-write failures swallowed into offline queue — a genuine RLS/auth denial while online is caught and re-queued as an "offline" event, then dropped after 3 retries with only a toast, masking authz errors as transient connectivity (evidence: `useOfflineInspections.ts:44-47`, `useOfflineSync.ts:447-457`).
