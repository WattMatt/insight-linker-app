# Phase 2 — Workflow Bug Sweep (Full-App Review, 2026-06-10)

Functional/logic bugs (security covered in Phase 1). Four parallel sweeps: inspection lifecycle, offline-first data layer, admin CRUD/management, client+contractor portals + report generation. Each finding was disprove-first verified against the cited code. Severities: **High** = data loss / silent failure / wrong data shipped / crash; **Medium** = wrong result or broken flow with a workaround; **Low** = minor.

Recommended fix order at the bottom.

---

## A. Offline-first data layer (highest risk — multiple data-loss paths)

Most of these stem from the **legacy localStorage-backed queue** (`src/hooks/useOfflineSync.ts`). The newer IndexedDB pattern in `src/hooks/useOfflinePhotos.ts` is correct and is the migration target.

### A1 — Two IndexedDB classes open the same DB with conflicting versions — **High**
`src/lib/offlineDB.ts:2-3` (`wm_compliance_offline` v3) vs `src/lib/offlineInspectionDB.ts:2-3` (same name, v2). IndexedDB allows one version per DB name; whichever opens second throws `VersionError`, and `init()` has no catch → every cached-inspection/image read or write rejects. No `onblocked`/`onversionchange` handlers either. **Fix:** consolidate to one DB module + version + `onupgradeneeded`; add blocked/versionchange handlers.

### A2 — Sync queue stores `Blob`/`File` in localStorage via `JSON.stringify` → image bytes destroyed — **High**
`src/hooks/useOfflineSync.ts:35-38` (`saveQueue`) / `:25-32` (`getQueue`). `JSON.stringify(blob)` → `{}`. Any queued image/document/pin-photo upload loses its binary payload on reload. **Fix:** keep binaries in IndexedDB (as `useOfflinePhotos` does), store only the key in the queue, re-read at flush time.

### A3 — Offline inspection images never synced (no production caller) — **High**
`getUnsyncedImages()` / `BATCH_UPLOAD_INSPECTION_IMAGES` are only called from the admin `OfflineSyncTest.tsx`; `InspectionDetail` saves via `addOfflineImage` but nothing reads them back to upload. Photos stay `synced:false` forever and are LRU-evicted (`offlineInspectionDB.ts:264-286`). **Fix:** wire a production reconnect sync that reads `getUnsyncedImages()` and uploads.

### A4 — Offline subsections/documents/floor-plans/pins/markups have orphaned unsynced readers — **High**
`src/lib/offlineDBExtensions.ts:30,78,151` and `src/lib/offlineFloorPlanDB.ts:52,125,198` define `getUnsynced*` with **no callers**. Sync depends solely on the fragile localStorage queue; if a queue entry is lost (A2/A7), the IndexedDB copy is never reconciled. **Fix:** reconnect reconciliation sweep over `getUnsynced*` with id dedupe.

### A5 — Floor-plan markups/measurements marked `synced` but never uploaded — **High**
`src/hooks/useOfflineFloorPlanAnnotations.ts:197,243` set `synced: !isOnline` and only queue when online; handlers `useOfflineSync.ts:268-292` are no-ops ("stored locally only"); no server table exists. Offline annotations are silently lost. **Fix:** persist `synced:false` offline + real upload path + server persistence.

### A6 — `updatePin` offline lookup uses wrong key → offline pin edits always fail — **Medium**
`src/hooks/useOfflineFloorPlanAnnotations.ts:139` calls `getFloorPlanPins(pinId)` (queries the `floor_plan_id` index) with a pin id → always empty → "Pin not available offline", edit discarded. **Fix:** use `getOfflinePin(pinId)` (already exists).

### A7 — `processQueue` retry rebuilds queue from a stale snapshot → concurrent writes dropped — **High**
`src/hooks/useOfflineSync.ts:434-468`: reads `getQueue()` then `saveQueue(failedMutations)`, clobbering any mutation enqueued mid-flush. **Fix:** read-modify-write keyed by id (remove only processed ids), don't snapshot-replace. (Also guards on `isSyncing` React state — stale-closure-prone; use a ref like `useOfflinePhotos`.)

### A8 — Non-idempotent retries → duplicate rows/photos — **High**
`useOfflineSync.ts` `UPLOAD_DOCUMENT` (:123-153), `UPLOAD_FLOOR_PLAN` (:155-183), `UPLOAD_INSPECTION_IMAGE` (:313-383) do storage upload then a plain `insert`/array-push with no idempotency. A retry after partial success duplicates rows or re-pushes photo URLs into `json_data`; storage `upload` without `upsert` gets stuck on "already exists". **Fix:** deterministic ids + `upsert`, `storage.upload(..., {upsert:true})`, dedupe before pushing into `json_data`.

### A9 — `SAVE_INSPECTION_JSON` is blind last-write-wins — **High**
`useOfflineSync.ts:296-311` overwrites the whole server `json_data` with the local blob, no version/`updated_at` check. Concurrent edits from another device are silently lost on reconnect. **Fix:** optimistic concurrency check or section/item-level merge.

### A10 — Native HEIC photos stored/uploaded as `.jpg` with HEIC bytes → broken images — **High**
`src/hooks/useCamera.ts:203-223` (native path never calls `convertHeicToJpeg`; only web path does, :119). `useOfflinePhotos.compressImage` falls back to the original blob on `<img>` decode failure (:83) then forces `file_name:…jpg` + `mime_type:'image/jpeg'` (:158,162). iOS camera evidence photos become unviewable; thumbnails null. **Fix:** convert HEIC in the native path before compression; only relabel jpeg after a successful canvas re-encode.

### A11 — Object-URL leak in `getSectionImages` — **Medium**
`src/hooks/useOfflineInspectionDetail.ts:236-242` mints a new `URL.createObjectURL` per image per call, never revoked. Long inspection sessions leak memory → images stop loading on mobile. **Fix:** cache stable URLs per image id, revoke on unmount.

---

## B. Inspection lifecycle

### B1 — Compliance score silently ignores snags (wrong `json_data` shape read) — **High**
`src/components/ComplianceDashboard.tsx:447-457` and `:501-513` read `jsonData.sections[].items[]`, but the canonical shape is the nested map `jsonData[sectionKey][itemKey] = {status,…}` (written by `InspectionDetail.handleItemChange:1093-1115`, read by `ComprehensiveInspectionReport.tsx:143`). `jsonData.sections` is always undefined, so failed items never count → compliance % systematically inflated (every inspected subsection treated as fully passed). **Fix:** iterate the object map (guarding non-item keys `tenants`, `*_customFields`, `siteDrawing*`), or derive from the `snags` table.

### B2 — `handleSave` re-fetch discards concurrent unsaved edits — **High**
`src/views/InspectionDetail.tsx:1477-1480`: after update it calls `fetchInspectionData()` which `setInspection(dbRow)`, overwriting any field typed during the save round-trip; `toast.success` fires regardless. The effect at :238-254 added to prevent exactly this is bypassed. **Fix:** trust optimistic local state after a successful save; don't full-refetch user-editable fields.

### B3 — `format(new Date(date))` throws on non-ISO date strings — **Medium**
`src/views/InspectionDetail.tsx:1522` and `:1920`. `inspection.date` truthiness guard catches only `''`; a non-parseable synced/orphan `inspection_date` yields Invalid Date and date-fns throws `RangeError`, crashing render. **Fix:** `const d=new Date(x); isNaN(d.getTime())?'':format(d,…)`.

### B4 — Manual COC field save can demote subsection `coc_status` to empty — **Medium**
`src/views/subsection-detail/useSubsectionDetail.ts:1117-1158` writes `coc_status: docData.cocStatus` (often `''`) to the parent `subsections` row, clearing a previously-Approved status. **Fix:** only propagate non-empty valid statuses to the parent.

### B5 — Inconsistent empty-value clearing across COC save vs validate paths — **Medium**
`useSubsectionDetail.ts:1124-1129` nulls empties; `handleApproveAndVerify`/`handleManualValidation` (:895-913) only set when present → same field cleared or preserved depending on path. **Fix:** one merge policy (don't clobber with empty).

### B6 — `cocStatus` blanked on approve-path error — **Medium**
`useSubsectionDetail.ts:852-860`: optimistic `cocStatus: prev?.cocStatus || ''` for a new doc → blank; if `validate-coc` errors (:871) the blanked state persists. **Fix:** don't pre-write blank status; roll back optimistic writes on error.

### B7 — Tenant dialog meter-photo capture bypasses Save/Cancel and orphans the image for new tenants — **Medium**
`src/views/InspectionDetail.tsx:456-459`/`437-454` + `handleTenantImageUpload` (used at :2605): writes to the list + DB immediately; for a not-yet-saved tenant `newTenant.id` isn't in `tenants`, so the uploaded URL is dropped (orphaned in storage). **Fix:** capture into `newTenant` state, persist on dialog Save.

### B8 — Snag/tenant photo uploads orphaned on dialog cancel — **Low**
`src/views/InspectionDetail.tsx:649-653` (+ tenant path): photos upload to storage but are only referenced in dialog state; closing before submit orphans the objects. **Fix:** cleanup on cancel or defer upload to submit.

---

## C. Admin CRUD & management

### C1 — New-client logo upload broken folder-rename (mismatched `Date.now()`) — **High**
`src/views/Clients.tsx:153-189`: re-derives `oldPath` with a fresh `Date.now()` (:162) that never matches the upload timestamp (:125), so `storage.download(oldPath)` returns null and the logo is never moved to `${clientId}/logo.ext`; the `.eq("logo_url", …).single()` lookup also misses (URL was cache-busted with `?t=`). Success toast still fires. **Fix:** compute the folder timestamp once and reuse; match the inserted row by returned id.

### C2 — Editing a user's name (no avatar change) deletes their avatar — **High**
`src/views/Users.tsx:574` (`avatarUrl = full_name ? selectedUser.avatar_url : null`) and the `:598-603` removal branch keyed on `avatarPreview` truthiness. Clearing the name (or preview not populated) nukes the stored avatar. **Fix:** gate avatar deletion on an explicit "remove avatar" intent, decoupled from `full_name`.

### C3 — Access-link creation has no validation → broken/mis-scoped public links — **High**
`src/components/client-portal/AccessLinkGenerator.tsx:383-388`/`151-177`: no guard; a "Site Review" with no site selected inserts `site_id:null`, still copies the URL and toasts success → dead link (`PublicSiteReview` targetSiteId null). **Fix:** validate the appropriate target id before mutating; disable the button until chosen. (Related to Phase-1 Vuln 7 — also tightens link integrity.)

### C4 — Admin QR download/preview ignores configured `qr_base_url` → wrong domain printed — **High**
`src/views/QRCodes.tsx:271` and `src/components/site/QRAnalytics.tsx:286` hard-code `window.location.origin`, while the persisted PNG and "Download All" correctly use `settings.qr_base_url`. Printing from these surfaces on staging encodes the staging origin. **Fix:** pass `qr_base_url` (origin fallback) to `LabeledQRCode` in both places.

### C5 — React Query key collision `["site-assignments"]` holds two incompatible shapes — **Medium**
`src/views/Users.tsx:157` (grouped-by-site) vs `src/views/SiteAssignments.tsx:152` (flat). Mutual invalidation pushes the wrong shape into the other view → blank/wrong rows (possible crash). **Fix:** distinct keys.

### C6 — Calendar `upcomingCount` mixes UTC and local date parsing — **Medium**
`src/views/Calendar.tsx:264` uses `new Date("yyyy-MM-dd")` (UTC midnight) vs `parseISO` (local) elsewhere → today's events mis-bucketed in the exported PDF stats. **Fix:** use `parseISO` consistently.

### C7 — `Sites.tsx` Add-Site `required` on Radix Select not enforced — **Low**
`src/views/Sites.tsx:219-223`,`247-251`: relies on `siteSchema.parse`; weak inline validation. **Fix:** gate submit on `client_id` / surface zod errors inline.

---

## D. Portals & report generation

### D1 — Client subsection view compares status with wrong case → "Completed" count always 0, all badges in-progress — **Medium**
`src/views/ClientPortalSubsectionDetail.tsx:213,468,471,497,498,500` use lowercase `"completed"`; canonical status is `"Completed"` (every other view, incl. sibling `ClientPortalSiteDetail.tsx:194` which uses `.toLowerCase()`). **Fix:** case-insensitive compare.

### D2 — Reports count contractor-"Closed" snags as still-open (and not resolved) — **High**
`src/components/SiteSummaryReport.tsx:298`, `src/components/site/GenerateFinalReportButton.tsx:150,206,76`, `src/components/site/SubsectionList.tsx:80` exclude only `rectified`/`Rectified`, never `Closed`. The contractor UI closes snags as `status:'Closed'` (`InspectionDetail.tsx:384`). Official reports overstate open snags and understate resolved. Client dashboard does it right (`ClientPortalDashboard.tsx:77,122`). **Fix:** exclude all terminal states `['rectified','Rectified','closed','Closed']` consistently across the report layer.

### D3 — Site Summary prints "Total Subsections: 1" for a zero-subsection site — **Medium**
`src/lib/siteSummaryRenderSpec.ts:516` clamps `subsectionCount = Math.max(len,1)` (divide-by-zero guard) but returns the clamped value as the displayed count (:533,194). **Fix:** keep the clamp only as a local divisor; report the true length.

---

## Recommended fix order

1. **Offline data-loss cluster (A1, A2, A7, A8, A9, A10)** — silent loss/duplication/overwrite of field data and evidence photos. Highest user impact. Some (A3, A4, A5) are unfinished sync wiring — confirm intended scope before building.
2. **Wrong data shipped (B1 compliance %, D2 closed-snags, C4 QR domain)** — incorrect figures/artifacts reaching clients.
3. **Silent admin data loss (C1 logo, C2 avatar, C3 dead links)** — quick, high-value fixes.
4. **Crashes / wrong UI (B2, B3, D1, C5, C6, D3)**.
5. **COC edit-path consistency (B4, B5, B6, B7)** and **Low (B8, C7, A11, A6)**.

Note: the offline layer's right pattern already exists (`useOfflinePhotos.ts`, IndexedDB + idempotent upsert + ref-guarded flush) — most A-fixes are migrating the legacy `useOfflineSync` queue onto it rather than inventing new infra.
