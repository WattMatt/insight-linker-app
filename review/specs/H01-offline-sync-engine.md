# H01 — offline-sync-engine

- Unit id: H01
- Slug: offline-sync-engine
- Spec mode: full
- Date: 2026-07-29
- Files: 5 (matches review/unit-files.json "H01"; printed list = useOfflineSync.ts, useOfflineSync.online.test.tsx, useOfflineSync.queueRaces.test.tsx, useOfflineSync.syncInspection.test.tsx, useOnlineStatus.ts)

## Unit header

**Unit purpose (as-is).** This unit is the client-side drain engine for the app's offline mutation queue: `useOfflineSync` reads a localStorage-persisted queue of typed mutations, executes each against Supabase (tables + storage buckets) when the browser is online, and manages retries, permanent discards, cross-instance drain locking, and orphaned-blob cleanup. It also maintains the in-app online/offline indicator state with a self-healing re-read of `navigator.onLine`. The fifth file, `useOnlineStatus.ts`, is a standalone `useSyncExternalStore`-based online-state hook with zero importers (grep-verified).

**Module-level observations (cross-file facts).**
- The queue's storage format, key, ordering, and merge helpers live in unit L11 (`src/lib/offlineQueue.ts`: `OFFLINE_QUEUE_KEY = 'offline_mutation_queue'` at offlineQueue.ts:3, `enqueueOfflineMutation` :13, `orderQueueForSync` :43, `mergeServerPhotos` :57); this unit contains the executor/drain side. Two enqueue paths write the same localStorage key with different id formats: `queueMutation` uses `` `${Date.now()}_${Math.random()}` `` (useOfflineSync.ts:78) while L11's `enqueueOfflineMutation` uses `crypto.randomUUID()` (offlineQueue.ts:30). Both dispatch the same-tab window event `offline-queue-updated` (useOfflineSync.ts:87; offlineQueue.ts:33).
- `executeMutation` has 17 `case` labels (useOfflineSync.ts:100–397) plus a `default` (:399). The manifest's H01 row says "16 mutation types" (review/manifest.md:32) — off by one against the observed case count (the 17 include the LEGACY `SAVE_INSPECTION_JSON` case at :324).
- Two same-named `getOnline` functions exist in the repo: `src/lib/onlineStatus.ts:5` (the one `useOfflineSync` imports at useOfflineSync.ts:7; guards `typeof navigator.onLine === 'boolean'`, onlineStatus.ts:7) and `src/hooks/useOnlineStatus.ts:28` (returns `navigator.onLine` directly when `navigator` is defined, :29). The hooks-file variant has no importers.
- All three test files opt into jsdom via a `@vitest-environment jsdom` docblock (each file, lines 1–3); the vitest default environment is `node` and the include pattern `src/**/*.test.{ts,tsx}` picks all three up (vitest.config.ts:18, :22). `vitest.setup.ts` provides dummy `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (vitest.setup.ts:7-8) so the real Supabase client module (which throws at import time on missing env, src/integrations/supabase/client.ts:8-10) can load in the un-mocked test, and installs a Map-backed `localStorage` when absent (vitest.setup.ts:15-42).
- The online-state listener block in `useOfflineSync` (useOfflineSync.ts:483-515) registers the same four events (`online`/`offline`/`focus`/`visibilitychange`) that `useOnlineStatus.ts`'s docstring (useOnlineStatus.ts:1-10) says that hook was written to replace across five hooks; the replacement is not wired up anywhere (zero importers, grep-verified).

**External contract.** The rest of the app gets one hook: `useOfflineSync(): { isOnline, queueSize, isSyncing, queueMutation, queueUpload, processQueue }` (useOfflineSync.ts:51, :560-568), consumed by the three offline domain hooks in H02, the connectivity indicator in C13, and the inspection detail view in V01 (file:line under the per-file section). It also participates in a same-tab window-event bus: it listens for `offline-queue-updated` (emitted by itself :87 and by L11 offlineQueue.ts:33) and both emits and consumes `offline-sync-state` (:32, :539). `useOnlineStatus.ts` exports `getOnline` and `useOnlineStatus` that nothing consumes.

---

## src/hooks/useOfflineSync.ts

- Purpose: React hook that tracks online/offline state, appends typed mutations (and blob uploads) to a localStorage queue, and drains that queue against Supabase with per-mutation retry/discard bookkeeping, a module-global drain lock shared across all mounted instances, and a once-per-session orphaned-blob sweep.

- Public surface:
  - `useOfflineSync(): { isOnline: boolean; queueSize: number; isSyncing: boolean; queueMutation: (type: string, data: any) => void; queueUpload: (type: string, data: Record<string, unknown>, file: Blob & { name?: string }) => Promise<void>; processQueue: () => Promise<void> }` (declaration :51, return object :560-568).
  - Module-private: `interface QueuedMutation { id: string; type: string; data: any; timestamp: number; retries: number }` (:9-15); `MAX_RETRIES = 3` (:17); module-level lock flags `isDraining` / `drainAgain` (:24-25); `announceSyncing(syncing: boolean)` (:30-34); `referencedBlobIds(queue): Set<string>` (:38-46); module-level `blobCleanupRan` (:49); `executeMutation(mutation: QueuedMutation)` defined inside the hook body (:98-402).

- Inputs & outputs:
  - Data in: localStorage key `offline_mutation_queue` (via `OFFLINE_QUEUE_KEY` import :6; read :61, JSON.parse :62); `navigator.onLine` (:406, :471, :486, :529); queued blobs from IndexedDB (`offlineDB.getQueuedBlob` :132, :162, :187, :224, :266); offline image records (`offlineDB.getUnsyncedImages` :138; `offlineInspectionDB.getInspectionImages` :367); current server `json_data` rows (select :349-351, :380-382).
  - Data out: Supabase table writes — `inspections` upsert/update/delete (:102, :110-113, :119-122, :326-329, :354-355, :391-392), `subsections` update (:148-151), `subsection_documents` insert (:170-176), `subsection_floor_plans` insert (:201-207), `floor_plan_pins` insert/update/delete (:233-252, :275, :284-287); storage uploads — caller-supplied `bucket` (:134), `documents` (:165, :190-192), `inspection-photos` (:227, :269, :374-375); public URLs read via `getPublicUrl` (:168, :196-198, :229, :271, :377); rewritten localStorage queue (:70); IndexedDB sync-markers and blob deletions (:104, :126, :140, :142, :156, :180-181, :212-213, :255-256, :277-278, :289, :296, :302, :309, :315, :332, :358, :395, :447-448); react-query invalidation (:465).
  - Stores touched: localStorage `offline_mutation_queue`; IndexedDB `queued_blobs` store (offlineDB v5, offlineDB.ts:7, :259-260) plus stores managed by `offlineDB`, `offlineDBExtensions`, `offlineFloorPlanDB`, `offlineInspectionDB`; Supabase tables `inspections`, `subsections`, `subsection_documents`, `subsection_floor_plans`, `floor_plan_pins`; buckets `documents`, `inspection-photos`, and the caller-supplied `bucket` field of `UPLOAD_IMAGE` (:131-134). No env vars read in this file.

- Dependencies:
  - uses -> `react` (`useState`/`useEffect`/`useCallback`/`useRef`, :1); `@tanstack/react-query` `useQueryClient` (:2); `sonner` `toast` (:3); `@/integrations/supabase/client` (L19, :4); `@/lib/offlineDB` (L11, :5); `@/lib/offlineQueue` — `OFFLINE_QUEUE_KEY`, `orderQueueForSync`, `mergeServerPhotos` (L11, :6); `@/lib/onlineStatus` — `getOnline` (L11, :7); dynamic imports inside executor cases: `@/lib/offlineDBExtensions` (L11, :155, :179, :211), `@/lib/offlineFloorPlanDB` (L11, :219, :262, :283, :294, :301, :307, :314), `@/lib/offlineInspectionDB` (L11, :331, :357, :364).
  - used by <- H02 offline-domain-hooks: src/hooks/useOfflineInspections.ts:2 (destructured :22), src/hooks/useOfflineSubsections.ts:2 (:32), src/hooks/useOfflineFloorPlanAnnotations.ts:2 (:35); C13 offline-pwa: src/components/OfflineIndicator.tsx:2 (:7); V01 admin-entity-views: src/views/InspectionDetail.tsx:34 (:125); in-unit test files useOfflineSync.online.test.tsx:9, useOfflineSync.queueRaces.test.tsx:44, useOfflineSync.syncInspection.test.tsx:43. Additionally the untracked working-tree file `src/views/OfflineSyncTest 2.tsx`:5 (:43) imports it — that file is not git-tracked and belongs to no manifest unit. (All grep-verified.)

- Side effects:
  - Network: all Supabase table/storage calls listed above; `SYNC_INSPECTION` performs a server read (select `json_data`) before its update to merge server photos via `mergeServerPhotos` (:348-352); `UPLOAD_INSPECTION_IMAGE` performs a server read-modify-write of `json_data` appending the uploaded public URL idempotently (:380-393).
  - Drain algorithm (`processQueue` :405-476): early-returns when `!navigator.onLine` (:406); synchronous module-global lock — a second caller sets `drainAgain = true` and returns (:409-410); broadcasts `offline-sync-state {syncing:true}` (:415); loops over an `orderQueueForSync`-sorted snapshot filtered to ids not yet attempted this cycle (:421, :428); on completion reconciles against the *current* queue so mid-drain enqueues survive (:458-461); coalesced re-pass only for genuinely-new ids (:470); lock release + `{syncing:false}` broadcast in `finally` (:472-475).
  - Events emitted: `offline-queue-updated` on enqueue (:87); `offline-sync-state` CustomEvent (:32).
  - Subscriptions/timers: window `online`/`offline`/`focus`, document `visibilitychange`, and a 15 s `setInterval` re-reading `navigator.onLine` (:502-506, cleanup :508-514); drain-on-online effect (:518-522); `offline-queue-updated` listener that refreshes `queueSize` and drains if online (:526-533); `offline-sync-state` listener mirroring the global drain state into local `isSyncing` (:537-541); queue-size-on-mount effect (:544-546); once-per-session orphaned-blob sweep, >24 h cutoff, gated by module flag `blobCleanupRan` (:551-558).
  - Toasts (sonner): info on enqueue (id `offline-action-queued`, :86); success "Back online! Syncing..." / warning "You are offline..." on genuine transitions only (:489-492); success "Synced N offline action(s)" (id `offline-sync-success`) + `queryClient.invalidateQueries()` only when a pass had zero retried and zero discarded and ≥1 succeeded (:463-466); error toast on permanent discard (:450).
  - Console: `console.error` on mutation failure (:441) and cleanup failure (:557); `console.warn` on unknown mutation type (:400); `console.log` when the sweep purges blobs (:556).

- Error handling:
  - `getQueue`: bare `catch` returns `[]` — corrupt/unreadable localStorage yields an empty queue silently (:60-65). `saveQueue`'s `localStorage.setItem` is not wrapped (:70).
  - `executeMutation`: each Supabase call's `error` is thrown (e.g. :103, :114, :123, :135, :152, :166, :177, :193, :208, :228, :253, :270, :276, :330, :356, :376, :382 via `readError`, :393) **except** `DELETE_FLOOR_PLAN_PIN`, whose delete result is not destructured or checked — a server-side failure still deletes the local offline pin and the mutation counts as succeeded (:284-289). Missing queued blobs throw typed `Error`s (:133, :163, :188, :225, :267) and a missing offline image throws (:369). `ADD_MARKUP`/`ADD_MEASUREMENT`/`DELETE_MARKUP`/`DELETE_MEASUREMENT` make no Supabase call at all — comments state markups/measurements are "stored locally only for now" (:293-317). Unknown types hit `default:` → `console.warn`, the promise resolves, and the mutation is treated as succeeded and removed from the queue (:399-400 with :438-439, :458-459).
  - `processQueue`: per-mutation `catch` logs (:441); `retries < MAX_RETRIES` → re-queued with `retries + 1` (:442-443); at the cap → any referenced `blobId`/`photoBlobId` blob deleted from IndexedDB, mutation discarded, error toast (:445-450). Failed items are never re-attempted within the same drain cycle (the `attempted` set, :421, :428, :469-470); they wait for the next external trigger. Lock cannot wedge: release is in `finally` (:472-475).
  - Orphan sweep: `.catch` → `console.error` only (:555-557).

- Tests: `useOfflineSync.online.test.tsx` (mount/transition behavior of `isOnline`), `useOfflineSync.queueRaces.test.tsx` (drain concurrency, mid-drain enqueue survival, retry-budget preservation, queueSize immediacy, cross-instance syncing broadcast), `useOfflineSync.syncInspection.test.tsx` (`SYNC_INSPECTION` full-record payload, legacy shape, server-photo merge). Assertion detail in each test file's own section below. No test exercises the upload cases (`UPLOAD_IMAGE`, `UPLOAD_DOCUMENT`, `UPLOAD_FLOOR_PLAN`, `UPLOAD_INSPECTION_IMAGE`), the floor-plan-pin cases, or the discard-at-MAX_RETRIES path (grep of the three test files: only `SYNC_INSPECTION` mutations are seeded/enqueued — queueRaces :57, :81, :115, :128; syncInspection :71, :90, :110).

- Observed issues:
  - 17 executor case labels vs the manifest H01 note "16 mutation types" (review/manifest.md:32).
  - `DELETE_FLOOR_PLAN_PIN` ignores the Supabase delete result; every other DB-touching case throws on `error` (:284-289).
  - `UPLOAD_IMAGE` marks as synced the *first* unsynced image whose `inspection_id` matches — lookup by inspection, not by image id (:138-140).
  - Two id formats coexist in the same queue: `Date.now()_Math.random()` (:78) vs `crypto.randomUUID()` (offlineQueue.ts:30).
  - `executeMutation` is recreated every render and referenced inside `processQueue`'s `useCallback` without appearing in its dependency array `[getQueue, saveQueue, queryClient]` (:98, :438, :476).
  - Success toast and `queryClient.invalidateQueries()` run only on an all-clean pass; a pass with any retried/discarded item invalidates no caches even for its succeeded mutations (:463-466).
  - Initial `isOnline` comes from L11's guarded `getOnline` (:52-53) but every runtime check reads `navigator.onLine` directly (:406, :471, :486, :529).
  - `mutation.data` and `queueMutation`'s `data` parameter are `any` (:12, :75).
  - Unknown mutation types are silently dropped from the queue (warn-and-succeed, :399-400).
  - `SAVE_INSPECTION_JSON` retained as a LEGACY case for old clients' queued mutations (comment :321-323).

- ASSUMED:
  - The named exports pulled from the three dynamically-imported L11 modules (`markSubsectionSynced`, `markDocumentSynced`, `markFloorPlanSynced`, `markPinSynced`, `deleteOfflinePin`, `markMarkupSynced`, `deleteMarkup`, `markMeasurementSynced`, `deleteMeasurement`, `offlineInspectionDB.*`) exist as used; I verified the modules are tracked in L11 and verified `offlineDB`'s methods directly (offlineDB.ts:292, :314, :339, :352, :450, :470, :480, :495) but did not open the other three files (outside this unit).
  - PR/issue references in comments (PR #20, I1/I2, C3/H10, C-1, H14) refer to real history; not verified.
  - "used by <-" grep excluded `src/graphify-out/` (generated cache JSON), treated as non-source.

## src/hooks/useOfflineSync.online.test.tsx

- Purpose: jsdom "harness smoke test" (its own words, :12-15) proving the real `useOfflineSync` hook renders under react-query + fake-indexeddb and that `isOnline` follows `navigator.onLine`.
- Public surface: none — no exports; two `it` blocks inside one `describe` (:21-50).
- Inputs & outputs: drives `navigator.onLine` via `setOnline` (:10, :23) and dispatches window `online`/`offline` events (:40, :46); clears localStorage per test (:24); reads `result.current.isOnline`. No network — but note it does **not** mock the Supabase client; the real module loads using the dummy env vars from vitest.setup.ts:7-8.
- Dependencies: uses -> `fake-indexeddb/auto` (:4), `vitest` (:5), `@testing-library/react` (:6), `@tanstack/react-query` (:7), `react` `createElement` (:8), `./useOfflineSync` (in-unit, :9), `@/test/online` `setOnline` (L22, :10). used by <- none found (grep-verified; the only textual mention of the sibling test names is a comment in H02's useOfflineInspectionDetail.queueSave.test.tsx:15).
- Side effects: jsdom DOM events and localStorage writes within the test run only.
- Error handling: n/a — assertions only.
- Tests: this is a test file; asserts (1) `isOnline === true` at mount when `navigator.onLine` is true (:27-31); (2) `isOnline` flips false on the `offline` event and back true on `online` (:33-49).
- Observed issues: the wrapper builds a new `QueryClient` per render call (:16-19); the file relies on the real Supabase client import chain rather than a mock, unlike its two sibling tests.
- ASSUMED: that the comment's claim this path "is the exact path behind the 'stuck on Offline' bug (PR #20)" (:13-14) matches real history; not verified.

## src/hooks/useOfflineSync.queueRaces.test.tsx

- Purpose: Race-safety tests for the drain engine — mid-drain enqueue survival, drain coalescing under the synchronous lock, immediate queueSize updates, retry-budget preservation across coalesced re-passes, and cross-instance syncing-state broadcast.
- Public surface: none — no exports; helpers `makeGate()` (:14-18), hoisted mock `state` (:19-21), `wrapper` (:46-49), `seed(...mutations)` writing `SYNC_INSPECTION` rows directly to `OFFLINE_QUEUE_KEY` (:51-64); five `it` blocks (:74-165).
- Inputs & outputs: `vi.mock('@/integrations/supabase/client')` replaces the client with an update-spy + awaitable gate; `.eq()` resolves `{error:{message:'boom'}}` when the payload's `status === 'fail'`, else `{error:null}` (:23-42); `select().eq().single()` returns `{json_data:{}}` (:38). Reads/writes localStorage `OFFLINE_QUEUE_KEY`; enqueues via L11's `enqueueOfflineMutation` (:81, :115, :128). Asserts on `state.updateSpy.mock.calls` and the persisted queue.
- Dependencies: uses -> `fake-indexeddb/auto` (:4), `vitest` (:5), `@testing-library/react` (:6), `@tanstack/react-query` (:7), `react` (:8), `@/test/online` `setOnline` (L22, :9), `@/lib/offlineQueue` `OFFLINE_QUEUE_KEY`/`enqueueOfflineMutation` (L11, :10), `./useOfflineSync` imported after the mock (in-unit, :44). used by <- none found (grep-verified).
- Side effects: localStorage and mocked-client calls within the test run only.
- Error handling: n/a — the 'fail' branch of the mock is the simulated server rejection (:32-34).
- Tests: this is a test file; asserts (1) a mutation enqueued during a gated drain is written and the queue fully drains — no clobber by `saveQueue` (:74-92); (2) two concurrent `processQueue()` calls process a seeded mutation exactly once (:94-107); (3) `queueSize` becomes 1 immediately after an offline enqueue (:109-119); (4) a failing mutation is attempted exactly once per cycle even when a mid-drain enqueue forces a re-pass, surviving with `retries === 1` while the new item syncs (labelled I1, :121-142); (5) `isSyncing` is true on **both** of two mounted hook instances during a drain and false on both after (labelled I2, :144-165).
- Observed issues: `seed()` writes queue rows whose `data.id` doubles as the inspection id and dedupe key (:58); the mock's `storage.from` returns bare `vi.fn()`s for `upload`/`getPublicUrl` (:40) that no seeded mutation type exercises.
- ASSUMED: the "(Phase 2)" in the describe title (:66) and I1/I2 labels refer to an internal remediation phase; not verified against history.

## src/hooks/useOfflineSync.syncInspection.test.tsx

- Purpose: Executor tests for the `SYNC_INSPECTION` case — full-record payload, legacy `{id, json_data}` shape, and the server-photo merge that prevents a full-save from clobbering a previously-drained photo.
- Public surface: none — no exports; hoisted `updateSpy`/`eqSpy`/`serverState` (:15-19), `wrapper` (:45-48), `seed(mutation)` (:50-52); three `it` blocks (:63-121).
- Inputs & outputs: `vi.mock('@/integrations/supabase/client')` captures `update(payload)` and `eq(col,val)` and serves `serverState.json_data` from `select().eq().single()` (:21-41). Writes one mutation to localStorage `OFFLINE_QUEUE_KEY` per test; asserts on the update payload, the `.eq('id', …)` arguments, and the emptied queue.
- Dependencies: uses -> `fake-indexeddb/auto` (:4), `vitest` (:5), `@testing-library/react` (:6), `@tanstack/react-query` (:7), `react` (:8), `@/test/online` `setOnline` (L22, :9), `@/lib/offlineQueue` `OFFLINE_QUEUE_KEY` (L11, :10), `./useOfflineSync` imported after the mock (in-unit, :43). used by <- none found as an import (grep-verified); referenced by name in a comment at H02's useOfflineInspectionDetail.queueSave.test.tsx:15.
- Side effects: localStorage and mocked-client calls within the test run only.
- Error handling: n/a — the mock always resolves `{error:null}` (:29).
- Tests: this is a test file; asserts (1) a `fields` payload (`status`, `quality_rating`, `project_name`, `json_data`) reaches `update` in full plus `updated_at`, targeted `.eq('id','insp-1')`, and the queue empties (labelled C3/H10, :63-85); (2) the legacy `{id, json_data}` mutation shape still produces an update containing that `json_data` (:87-98); (3) with a server-side photo pre-seeded in `serverState`, the synced payload's `photos` equals the server photo while the offline `notes` edit and `status` survive (labelled C-1, :100-121).
- Observed issues: test (1) and (2) each set `serverState.json_data = undefined` via `beforeEach` (:60), so their merge-read path receives `undefined` server json; only test (3) exercises a populated merge.
- ASSUMED: C3/H10 and C-1 labels correspond to a tracked bug list; not verified.

## src/hooks/useOnlineStatus.ts

- Purpose: A `useSyncExternalStore`-based single-source online/offline hook (plus a `getOnline` snapshot getter) whose docstring states it replaces the private online-state copies in five offline hooks.
- Public surface:
  - `getOnline(): boolean` (:28-30) — `true` when `typeof navigator === "undefined"`, else `navigator.onLine`.
  - `useOnlineStatus(): boolean` (:32-34) — `useSyncExternalStore(subscribe, getOnline, () => true)`; SSR snapshot is `true`.
  - Module-private `subscribe(onStoreChange)` registering window `online`/`offline`/`focus` and document `visibilitychange`, returning an unsubscriber (:13-26).
- Inputs & outputs: reads `navigator.onLine`; no storage, no network, no env vars.
- Dependencies: uses -> `react` `useSyncExternalStore` (:11). used by <- none found (grep-verified: `grep -rln "useOnlineStatus" src supabase` matches only this file and the generated cache JSON `src/graphify-out/cache/20113c6de5c7a3ab40821ee4639a5ea852a1a939d2bf94f7482efd3237f538cd.json`).
- Side effects: event-listener registration occurs only inside `subscribe`, which React calls only when the hook is mounted — with zero importers, none of this code executes at runtime.
- Error handling: none; the non-browser guard in `getOnline` returns `true` (:29).
- Tests: none — no test file imports this module (grep-verified). The similarly-named `src/lib/onlineStatus.ts` (L11) has its own test file (`src/lib/onlineStatus.test.ts`, listed under L11 in review/unit-files.json), which does not touch this hook.
- Observed issues:
  - Zero importers, while its docstring (:1-10) claims it "replaces" the per-hook listeners in `useOfflineSync`, `useOfflineInspectionDetail`, `useOfflinePhotos`, `useOfflineSubsections`, `useOfflineFloorPlanAnnotations` — all five still import `getOnline` from `@/lib/onlineStatus` and/or register their own listeners (e.g. useOfflineSync.ts:7, :502-506).
  - Duplicate `getOnline` name with divergent guards: this file returns `navigator.onLine` unchecked when `navigator` exists (:29); `src/lib/onlineStatus.ts:5-8` additionally verifies `typeof navigator.onLine === 'boolean'` before trusting it.
  - Unlike the listener block it was written to replace, `subscribe` has no 15 s interval self-heal (compare useOfflineSync.ts:506).
- ASSUMED: absence of importers assumes no string-concatenated dynamic imports (none observed anywhere in `src`).
