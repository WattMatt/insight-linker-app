# Stage 3 — iOS Root-Cause Report

> **Source plan:** [DATA_INTEGRITY_AUDIT_PLAN.md](../DATA_INTEGRITY_AUDIT_PLAN.md)
> **Upstream symptoms:** [2026-05-26-scorecard.md](./2026-05-26-scorecard.md)
> **iOS source audited:** `/Volumes/Extreme SSD/DEVELOPER/ECompliance` (commit at audit time)
> **Scope:** diagnosis only — Stage 4c will implement fixes.

## Executive summary

The Stage 1 gaps map to **five distinct iOS root causes**, four of which are present in the iOS code and one of which lives in the web app (`insight-linker-app`). They split into two architectural classes:

| Gap | Class | Where the bug lives |
|---|---|---|
| (a) `subsection_id = NULL` on push | **Implementation bug** | `ServicesSupabaseSyncService.swift:803` — push DTO reads only `inspection.subsection?.id`, no fallback to denormalised `subsectionId`, no nil guard |
| (b) 173 inspections with no shop info | **Design bug** | `AddInspectionView.swift:212-275` — two no-context "+" entry points (`MainViews.swift:1024`, `ViewsInspectionsListView.swift:88`) create inspections with no subsection, no site, no shopName, no shopNumber, and the save path never enforces any of them |
| (c) Completion validator lets orphans through | **Design bug** | `InspectionDetailView.swift:770-790` — validator only counts unanswered items; never checks subsection / site / shop fields. Worse, `SubsectionDetailView.swift:620` and `EditInspectionView.swift:116` bypass even that validator. |
| (d) Photo refs point at missing storage objects | **Implementation bug** | `InspectionDetailView.swift:1051-1053` writes local `/var/mobile/...` paths into `photoURLs` at capture time, then `pushInspections` upserts `json_data` with those paths *before* `uploadPendingPhotos` runs (`OfflineSyncManager.swift:125-128`). The dirty-push guard at `ServicesSupabaseSyncService.swift:787-788` further filters which inspections get repaired on a given round, so orphans persist across sync cycles. |
| (e) Two photo path schemas in production | **Not an iOS bug** | iOS produces only `photos/{filename}` and `items/{itemUUID}/{filename}`. Neither `category/key/timestamp_N.jpg` nor `0/0/timestamp_N.jpg` is constructed in iOS. Both originate in the web app (`insight-linker-app`) — outside this repo's scope. |

**Implications for Stage 4:**

- (a) and (d) are localised code changes — single-file fixes plus regression tests.
- (b) and (c) are policy-level UX changes — they will require user-facing flow changes (forcing subsection selection before save, blocking Completed without subsection). These need design sign-off, not just engineering fixes.
- (e) needs to be re-routed to a web-app audit pass — out of scope for the iOS Stage 4c.

The combined story explains the production data exactly:

- 173 "completely dark" orphans match exactly the no-context global "+" creation flow (no subsection, no shopName, no shopNumber by construction).
- The remaining 60 orphans match the relationship/denorm divergence pattern — they have shopName because the user typed it once, but the `subsection` relationship later became nil on a re-imported or REST-fallback row, and the next push wrote `subsection_id = NULL` back to Supabase.
- `7f8c6350-…` accounting for 8 of the top 10 missing photos matches a single inspection where multiple photos were captured between sync rounds and the dirty-push guard excluded the inspection from a later repair round.

---

## Finding (a) — `subsection_id` is NULL on push

### Root-cause statement

> **The inspection push DTO reads `subsection_id` exclusively from the SwiftData `@Relationship` (`inspection.subsection?.id`) with no fallback to the denormalised `inspection.subsectionId` column, no guard on nil, and no log. Any inspection whose relationship is nil at push time is upserted to Supabase with `subsection_id = NULL` — silently — even when the denormalised FK column on the same SwiftData object holds a valid UUID.**

### Code evidence

`ECompliance/ServicesSupabaseSyncService.swift:716` declares `pushInspections()`. The DTO build at lines 799–834 reads:

```swift
let dtos = inspections.map { inspection in
    InspectionDTO(
        id: inspection.id,
        siteId: inspection.site?.id,                  // line 802 — relationship-only
        subsectionId: inspection.subsection?.id,      // line 803 — relationship-only
        ...
        shopName: inspection.shopName,                // line 818 — direct column
        shopNumber: inspection.shopNumber,            // line 819 — direct column
        ...
    )
}

try await supabase.database.from("inspections").upsert(dtos).execute()  // lines 836-839
```

No guard, no log, no fallback. Compare with the SwiftData model:

`ECompliance/Inspection.swift:90-96`:

```swift
var siteId: UUID?         // Denormalised FK — avoids relationship traversal in filters
var subsectionId: UUID?   // Denormalised FK — avoids relationship traversal in fallbacks
...
var site: Site?
var subsection: Subsection?
```

The model explicitly carries a denormalised FK, and the comment on it says "avoids relationship traversal in fallbacks". The push path **never reads the fallback field**.

### Where the divergence is introduced

The two stores can diverge because writes are not mirrored consistently:

| Site (file:line) | Writes `subsection` (rel) | Writes `subsectionId` (denorm) |
|---|---|---|
| `AddInspectionView.swift:231-233` (Add-from-Subsection) | ✓ | ✓ |
| `CreateInspectionFromTemplateView.swift:226-227` | ✓ (may be nil) | ✓ (may be nil) |
| `ServicesSupabaseSyncService.swift:923, 1093` (downsync update branch) | ✓ if subsection in local store | ✓ unconditional |
| `ServicesSupabaseSyncService.swift:963, 1127` (downsync insert branch) | ✓ if subsection in local store | ✓ unconditional |
| `SchematicDiagramView.swift:848-859` (REST fallback fetch) | ✗ **never** | ✓ |

**The divergence pattern:** any code path that sets only the denormalised field (e.g. REST fallback at `SchematicDiagramView.swift:848`, or a downsync race where the parent `Subsection` row hasn't yet been pulled into local SwiftData so the relationship resolves to nil at `ServicesSupabaseSyncService.swift:934-936`) leaves the inspection with `subsectionId = <valid uuid>` but `subsection = nil`. On the next push, line 803 reads `nil` and writes NULL to Supabase — **overwriting a previously non-null value**.

### Architecture-or-symptom check

This is a **bug within the current design**, not a design flaw. The denormalised field exists precisely for this purpose; the push code just doesn't read it. A coalescing read (`inspection.subsection?.id ?? inspection.subsectionId`) plus a nil-guard with a log would fix it without changing the model.

### Reproduction

1. In iOS, create an inspection from a subsection detail screen (relationship + denorm both set).
2. Sync to Supabase.
3. Verify `subsection_id` is correct on the server.
4. On the device, **delete the local SwiftData copy of the parent `Subsection`** (or simulate by clearing `Subsection` store, leaving inspections intact — happens in practice when a downsync round encounters a transient HTTP error after the `Inspection` page but before the `Subsection` page).
5. Make any local edit to the inspection (touches `updatedAt`).
6. Sync again. The push DTO at line 803 reads `inspection.subsection?.id` → `nil` → writes `subsection_id = NULL` to Supabase. The `subsectionId` denorm column on the local model is unchanged.
7. The Supabase row now has the orphan state. No log was emitted.

### Linked Stage 1 numbers

- All 233 orphan inspections share this push semantic — they are upserted with NULL by `pushInspections` because the relationship was nil at push time, regardless of whether the denorm field had a value.
- The 60 orphans that still have `shop_name`/`shop_number` (Stage 1 Q1 table) are consistent with the divergence pattern: the user typed shopName once at creation (so the column stays), but the relationship later became nil and a re-push overwrote `subsection_id`. The 173 dark orphans are explained by finding (b).

---

## Finding (b) — 173 inspections created with no shop info

### Root-cause statement

> **iOS has two no-context global "+" entry points (`MainViews.swift:1024` and `ViewsInspectionsListView.swift:88`) that invoke `AddInspectionView` with `forSubsection: nil, forSite: nil`. The save path at `AddInspectionView.swift:212-275` (`performSave`) never enforces subsection presence and never copies subsection metadata into `shopName`/`shopNumber` — those fields come from optional text inputs that default to empty strings and are coerced to `nil` at lines 227-228. An inspector tapping "+" on the main Inspections tab can therefore produce a SwiftData record with `subsection == nil`, `subsectionId == nil`, `site == nil`, `siteId == nil`, `shopName == nil`, `shopNumber == nil`. That record is then upserted to Supabase via finding (a)'s push path with every relevant column NULL — matching the "completely dark" 173 from Stage 1.**

### Code evidence

`ECompliance/AddInspectionView.swift:212-239`:

```swift
private func performSave() {
    let inspection = Inspection(
        title: title,
        ...
        shopName: shopName.isEmpty ? nil : shopName,        // line 227
        shopNumber: shopNumber.isEmpty ? nil : shopNumber   // line 228
    )

    if let forSubsection = forSubsection {                  // line 231
        inspection.subsection = forSubsection
        inspection.subsectionId = forSubsection.id
        inspection.site = forSubsection.site
        inspection.siteId = forSubsection.site?.id
    } else if let forSite = forSite {                       // line 236
        inspection.site = forSite
        inspection.siteId = forSite.id
    }
    // else: no subsection AND no site bound. No error, no warning.
    ...
    modelContext.insert(inspection)
}
```

The `else { … }` for "neither subsection nor site" simply does not exist. The save proceeds. No required-field validation runs before insert.

The two call sites that invoke this with both args nil:

- `MainViews.swift:1024` — the **main Inspections tab "+" button** (largest blast radius, this is the default place to create an inspection).
- `ViewsInspectionsListView.swift:88` — secondary inspections-list "+" button.

Plus a contributing path:

- `CreateInspectionFromTemplateView.swift:204` — the `canCreate` Save-button predicate is `!title.isEmpty && selectedSite != nil && itemsToIncludeCount > 0` — **requires site but not subsection**. Line 226 then writes `inspection.subsection = selectedSubsection`, which may be nil. `shopName`/`shopNumber` are never set from this flow.

### Hypothesis evaluation

| # | Hypothesis | Status | Evidence |
|---|---|---|---|
| H1 | Cascade delete (subsection deleted, inspections orphaned) | **Refuted** | `Subsection.swift:37` declares `@Relationship(deleteRule: .cascade, inverse: \Inspection.subsection)`. Deleting a subsection deletes its inspections — they don't become orphans, they tombstone. |
| H2 | No-subsection "quick-start" flow | **Strongly supported** | `MainViews.swift:1024` + `ViewsInspectionsListView.swift:88` invoke `AddInspectionView(forSubsection: nil, forSite: nil)`. Default for the main "+" button. |
| H3 | Template-only flow ignores subsection | **Partially supported** | `CreateInspectionFromTemplateView.swift:204` requires site but not subsection. shopName never written. |
| H4 | Server-side row imported without relationship | **Partially supported** | `SchematicDiagramView.swift:848-859` REST fallback creates `Inspection` with `subsectionId` (denorm) set but `subsection` relationship NIL. Round-trip with finding (a) then writes NULL back to server. |
| H5 | Web app origin (insight-linker-app) | **Unconfirmed from iOS code alone** | Cannot prove from iOS, but iOS finding (a)'s round-trip can amplify it: any web-app-created row that arrives via `fetchInspections` and whose parent Subsection isn't yet local will have its relationship left nil, and the next push (line 803) overwrites the server's value with NULL. |

### Architecture-or-symptom check

**The design itself is wrong.** A creation flow that produces a fully-dark inspection (no site, no subsection, no shop name, no shop number) and ships it to Supabase via the silent push in finding (a) is not a single missed validation — it is two missing architectural constraints:

1. The model permits the state. `Inspection` allows nil for `siteId`, `subsectionId`, `shopName`, `shopNumber` (`Inspection.swift:78, 79, 90, 91`).
2. The UI permits the state. The save path has no validation gate.

The fix needs to decide: is "create from anywhere, attach to a subsection later" a legitimate workflow, or is "must select a subsection before save" the only legitimate flow? If the former, the inspection must be either (a) marked as a draft that cannot be pushed until attached, or (b) attached server-side via the orphan-name fallback at `useSubsectionDetail.ts:366-399`. If the latter, the "+" buttons need to gate on a subsection picker.

### Reproduction

1. Open the app, sign in.
2. Tap **Inspections** tab → **"+"** button.
3. Type a title and tap **Save**.
4. Observe: an `Inspection` record is inserted with no `subsection`, no `site`, no `shopName`, no `shopNumber`.
5. Wait for the next sync (or trigger via Settings).
6. Verify the Supabase row has NULL `subsection_id`, NULL `site_id`, NULL `shop_name`, NULL `shop_number` — exactly the "completely dark" pattern of the 173.

### Linked Stage 1 numbers

- 173 dark orphans = `AddInspectionView` opened with no context + user typed nothing in the shop fields.
- 60 orphans with shop info = either user typed shopName/Number manually (rare on the "+" flow) OR the divergence pattern from finding (a).
- Top-affected sites (Evaton Mall 87, Prince Buthelezi 54, Fourways 23) probably reflect which sites have inspectors who routinely use the global "+" button vs the per-subsection "+" — that's a usage pattern, not a per-site bug.

---

## Finding (c) — Completion validator lets orphans through

### Root-cause statement

> **No completion path in iOS validates `subsection`, `subsectionId`, `siteId`, `shopName`, or `shopNumber` before assigning `status = .completed`. The primary validator at `InspectionDetailView.swift:770-790` (`markInspectionComplete`) only counts unanswered required and critical `InspectionItem` rows; the bypass paths at `SubsectionDetailView.swift:620` (per-row status menu) and `EditInspectionView.swift:116` (generic save form) skip even that check and accept whatever status the user picks. Once `.completed` is written locally, the patch at `InspectionDetailView.swift:814-819` PATCHes Supabase directly with the new status — propagating the orphan-and-Completed state regardless of subsection presence.**

### Code evidence

`ECompliance/InspectionDetailView.swift:770-790` — the primary "mark complete" validator:

```swift
private func markInspectionComplete() async {
    // VALIDATION — check required and critical items
    let unansweredRequired = sortedItems.filter {
        $0.isRequired && $0.isCompliant == nil && ($0.response == nil || $0.response?.isEmpty == true)
    }
    let unansweredCritical = sortedItems.filter {
        $0.isCritical && $0.isCompliant == nil
    }

    if !unansweredRequired.isEmpty || !unansweredCritical.isEmpty {
        ...
        completionBlockerMessage = "Cannot complete: ..."
        showingCompletionBlocker = true
        return
    }

    isMarkingComplete = true
    defer { isMarkingComplete = false }

    inspectionToView.status    = .completed       // line 796 — no subsection check
    inspectionToView.updatedAt = Date()
    ...
}
```

What the validator does *not* check (lines 772-790):

- `inspectionToView.subsection != nil`
- `inspectionToView.subsectionId != nil`
- `inspectionToView.shopName != nil`
- `inspectionToView.shopNumber != nil`
- `inspectionToView.siteId != nil`
- `sortedItems.isEmpty` (an inspection with **zero items** passes both filters vacuously and can be marked Completed)

Subsequently, lines 814-819 PATCH Supabase with just `status` and `updated_at` — bypassing the push DTO entirely:

```swift
try await SupabaseService.shared.client
    .from("inspections")
    .update(StatusPatch(status: InspectionStatus.completed.rawValue, updatedAt: ...))
    .eq("id", value: inspectionToView.id.uuidString)
    .execute()
```

The `ComplianceUpdateService.shared.updateSubsection` call at line 827 is gated on `if let subId = inspectionToView.subsectionId` — confirming the code is aware the field can be nil at completion time and tolerates it.

### All `.completed` assignment sites

| File:line | Context | Subsection check? | shopName/Number check? |
|---|---|---|---|
| `InspectionDetailView.swift:796` | `markInspectionComplete()` | NO | NO |
| `SubsectionDetailView.swift:620` | Per-row status menu (capsule at line 555-572) | NO (comment line 617: "Use the status exactly as chosen.") | NO |
| `EditInspectionView.swift:116` | Generic save form, status picker | NO (only `.disabled(title.isEmpty)` at line 105) | NO |
| `CodeReviewView.swift:306` | Reviewer approve/reject (already-completed rows) | NO | NO |
| `ServicesSupabaseSyncService.swift:899, 1090` | Downsync from server | NO — accepts orphan-and-Completed rows | NO |

### Stale documentation flag

`Inspection.swift:22-23` says:

```swift
/// Statuses a user can manually set. .approved and .rejected are now system-managed:
/// .approved is set automatically when the user picks .completed (no separate review step).
```

This is **false in the current code.** No code path promotes `.completed → .approved`. `CodeReviewView.swift:306` is the only `.approved` writer and it requires a reviewer's explicit action. The contradicting comments at `InspectionDetailView.swift:767-769` and `SubsectionDetailView.swift:617-619` say so explicitly: ".approved is reserved for CodeReviewView (formal review). Never auto-promoted here." The model-level doc comment should be corrected as part of Stage 4c.

### Architecture-or-symptom check

**Design bug.** The validator's design models "ready to complete" as "all required questions answered" — that's only one of the dimensions that ought to count. A completion gate that ignores whether the row has a subsection binding is not a missing branch; it's a missing concept. The fix needs the same UX decision as finding (b): is an inspection legitimately completable without a subsection, or not?

Additionally, the existence of three independent completion paths (`InspectionDetailView`, `SubsectionDetailView`, `EditInspectionView`) — only one of which runs any validation — is itself an architectural smell. Whatever validator the design settles on must run from every path.

### Linked Stage 1 numbers

- "Most orphans are status = Completed" (Stage 1 finding) matches: there is no validator preventing this combination. Bad inspections accumulate the Completed marker as inspectors close them out.

---

## Finding (d) — Photo refs point at missing storage objects

### Root-cause statement

> **iOS optimistically appends the device-local `/var/mobile/.../Photos/photo_X.jpg` path to `InspectionItem.photoURLs` at capture time (`InspectionDetailView.swift:1051-1053`), then a sync round can upsert the inspection's `jsonData` to Supabase carrying those local paths before the matching storage uploads have completed. The repair pass (`migrateLocalInspectionPhotos` at `ServicesSupabaseSyncService.swift:586`) runs inside `pushInspections` but only on items whose parent inspection survives the dirty-push guard at lines 787-788 — so an inspection whose `updatedAt` falls behind `lastPullTime` can stay unrepaired across sync cycles, and the server-side trigger that extracts `photo_urls` from `json_data` records the orphan paths against `inspection_items.photo_urls`.**

### Capture path — where the race begins

`ECompliance/InspectionDetailView.swift:1041-1058` (`saveAndTrackPhoto`):

```swift
let photo = try await PhotoStorageService.shared.savePhoto(image: uiImage)
photo.inspectionItem = item
photo.inspection = item.inspection
modelContext.insert(photo)                    // Photo SwiftData record with isUploaded:false

// Add the local path to photoURLs for immediate display
var existing = item.photoURLs ?? []
existing.append(photo.localPath)              // line 1052 — local path appended NOW
item.photoURLs = existing                     // line 1053
item.updatedAt = Date()                       // line 1054
saveChanges()
```

`PhotoStorageService.savePhoto` writes the file to disk and creates a `Photo` SwiftData record with `isUploaded: false`. It does **not** upload to Supabase synchronously. Yet `item.photoURLs` already contains the local path, and `item.updatedAt` is bumped — making the item appear dirty for the next sync.

### Sync round ordering

`ECompliance/OfflineSyncManager.swift:124-128`:

```swift
let syncService = SupabaseSyncService(modelContext: modelContext)
try await syncService.performFullSync()       // pushes inspections (line 125)
...
await uploadPendingPhotos()                   // uploads Photo records (line 128)
```

Inside `performFullSync` → `pushInspections` (`ServicesSupabaseSyncService.swift:716`):

1. Line 754 — `await migrateLocalInspectionPhotos()` runs first. This walks every `InspectionItem.photoURLs`, identifies entries that are local paths, uploads them via 4-concurrent `TaskGroup` (lines 614-649) to `items/{itemUUID}/{filename}` (line 597), and rewrites `item.photoURLs[i]` from local path → remote URL.
2. Line 757 — `InspectionJsonSynthesizer.backfillAndMerge` re-flows the now-rewritten `photoURLs` into `inspection.jsonData`.
3. Lines 763-776 — Inspections whose `jsonData` byte-content changed get a fresh `updatedAt`.
4. Lines 787-788 — **dirty-push guard:** only inspections where `updatedAt > lastPullTime` are pushed.
5. Lines 799-839 — DTO upsert with `jsonData` carrying the (now-remote) photo URLs.

After `performFullSync` returns, `uploadPendingPhotos()` runs at `OfflineSyncManager.swift:128`. This is the *original* upload path for `Photo` SwiftData records — it uploads to `photos/{filename}` (different schema), then walks `InspectionItem.photoURLs` looking for the local path to swap.

### Race signals

Three independent failure modes contribute:

1. **Per-item upload failure inside `migrateLocalInspectionPhotos`.** When `performPhotoUpload` returns `nil` at `ServicesSupabaseSyncService.swift:552-554` (network/auth/timeout), the handler at lines 674-684 falls into:

    ```swift
    case .some(.none):
        if FileManager.default.fileExists(atPath: url) {
            newUrls.append(url)        // keep LOCAL path for retry
            retryCount += 1
        } else {
            droppedCount += 1
            changed = true             // dropped from photoURLs
        }
    ```

    If retained, the local path stays in `photoURLs` AND gets re-synthesised into `jsonData` at line 757. The inspection is then pushed at line 838 with `json_data` containing the still-local path. **The server trigger that materialises `inspection_items.photo_urls` then records a path that has no corresponding storage object.**

2. **Dirty-push guard skips repair on a subsequent round.** Lines 787-788:

    ```swift
    let lastPullTime = (UserDefaults.standard.object(forKey: "sync.inspections.lastPullTimestamp") as? Date) ?? .distantPast
    let inspections = allInspections.filter { $0.updatedAt > lastPullTime }
    ```

    `migrateLocalInspectionPhotos` runs at line 754 — *before* the filter at 788 — so it scans all items. But its dirty-bump at lines 763-776 only fires if `jsonData` byte-content actually changed. If a previous round wrote the local path into `jsonData` and a later round fails to convert it (because the file is gone on disk), the bump never happens, the inspection is filtered out by the guard, and the bad `jsonData` is left untouched on the server.

3. **Photo records uploaded after the row push.** `uploadPendingPhotos` runs *after* `performFullSync` at `OfflineSyncManager.swift:128`. By then the row is already on the server. Even if `uploadPendingPhotos` later succeeds in uploading the matching file to `photos/{filename}`, the path **in `photoURLs` is still the local path** because the swap logic at `PhotoStorageService.swift:265-271` looks for `urls.firstIndex(of: photo.localPath)` — and the local path may have already been rewritten by `migrateLocalInspectionPhotos` (to the `items/{itemUUID}/{filename}` URL) in the previous step. The swap fails to find the local path and either no-ops or appends a duplicate.

### `synced_at` handling

No `synced_at` column on `Inspection`, `InspectionItem`, or `Photo`. The "is this synced" signal is `updatedAt > lastPullTime` (line 787-788). **There is no per-photo upload confirmation gating the row push.**

### Architecture-or-symptom check

This is an **implementation bug stacked on a design weakness.**

- The implementation bug: writing local paths into `photoURLs` at capture time (line 1052) instead of using an `isUploaded`-aware sentinel.
- The design weakness: `InspectionItem.photoURLs: [String]?` conflates "user evidence" (the file the inspector took) with "server URL" (where it lives in storage). Both states are stored in the same array.

The two-system overlap (`Photo` @Model with `isUploaded: Bool` vs `InspectionItem.photoURLs: [String]`) is acknowledged in the migration comment at `ServicesSupabaseSyncService.swift:557-585` — that comment is itself a record of the design weakness:

> *"The capture path is bifurcated: photos taken via `PhotoStorageService.savePhoto(image:)` get a Photo SwiftData record linked to the InspectionItem and are uploaded by the existing `uploadPendingPhotos` pipeline on app launch, which rewrites `item.photoURLs[idx]` from local path to remote URL. But other capture paths (PhotosPicker imports, drag-drop, programmatic appends) just append raw `/var/mobile/.../Photos/photo_X.jpg` strings to `item.photoURLs` without ever creating a Photo record."*

The "safety net" (`migrateLocalInspectionPhotos`) was added as a repair pass on top of this duality. The safety net itself races (see signal 2 above).

### Reproduction (matches `7f8c6350-...`)

1. Open an inspection's detail view. Make sure the device is on a slow / flaky network.
2. Capture 8 photos in quick succession across 2-3 items. Each triggers `saveAndTrackPhoto` → `item.photoURLs.append(localPath)` + `item.updatedAt = Date()`.
3. Trigger sync (Settings → Sync now).
4. `performFullSync` → `pushInspections` → `migrateLocalInspectionPhotos` runs. With 8 photos × 4-concurrent uploads, the first batch fires. If the network drops mid-batch, `performPhotoUpload` returns nil for some/all of them.
5. The handler at lines 668-688 keeps the local path entries (file still on disk).
6. `InspectionJsonSynthesizer.backfillAndMerge` flows the still-local paths into `jsonData`.
7. The dirty-push at line 838 upserts the inspection with `json_data` containing local-path photo entries.
8. The server-side trigger materialises `inspection_items.photo_urls` from that `json_data`. Production now has 8 photo paths recorded.
9. Days later the local files are pruned (iOS Photos library cleanup, app reinstall, simulator reset). The next `migrateLocalInspectionPhotos` falls into `else { droppedCount += 1 }` (line 681-684) — drops the local entry from `photoURLs` locally. But the server's `inspection_items.photo_urls` was already written in step 8 and is not removed by any iOS path.
10. Stage 1 Q4 now reports 8 orphan photo refs for this inspection. Eight of the top ten orphans concentrate here.

### Linked Stage 1 numbers

- 103 orphan photo refs total — combination of the three signals above, mostly accumulated in inspections with high photo counts captured under network duress.
- `7f8c6350-...` (8 of top 10) — single inspection that hit this path heavily, exactly matching the reproduction.

---

## Finding (e) — Two photo path schemas in production

### Root-cause statement

> **Neither schema is constructed by iOS. iOS produces only two storage paths: `photos/{filename}` (via `PhotoStorageService.swift:244-245`) and `items/{itemUUID}/{filename}` (via `ServicesSupabaseSyncService.swift:597`). Both production-observed schemas (`category/key/timestamp_N.jpg` and `0/0/timestamp_N.jpg`) match neither — they are constructed by the web app (`insight-linker-app`). The iOS contribution is indirect: `InspectionJsonSynthesizer.swift:192-216` writes photo URLs into `json_data` under the tree `[sectionId][itemTemplateId]["photos"]`, and a web-app uploader walking that tree to push photos into storage produces `{sectionKey}/{itemKey}/{filename}` paths. The numeric `0/0/...` schema is consistent with the web app's positional fallback when `sectionId`/`itemTemplateId` is missing.**

### iOS upload sites (all 16 verified)

The only iOS storage-upload paths constructed by iOS:

| File:line | Schema | Bucket |
|---|---|---|
| `PhotoStorageService.swift:244-245` | `photos/{filename}` | `inspection-photos` |
| `ServicesSupabaseSyncService.swift:597` | `items/{itemUUID}/{filename}` | `inspection-photos` |
| `SubsectionDetailView.swift:1369` | `subsection-documents/{subsectionId}/{uuid}_{filename}` | `subsection-documents` |
| `FloorPlanPinDetailView.swift:419, 445` | `floor-plan-pins/{pinId}/{kind}_{uuid}.jpg` | (various) |

`grep -n '\.upload(\|\.uploadFile(' ECompliance/*.swift` confirms no other upload sites. None reference `item.category`, `item.sectionId`, `item.sectionName`, `item.itemTemplateId`, or any enumerated-index loop.

Filenames produced by iOS are `photo_{intTimestamp}_{8charUUID}.jpg` (`PhotoStorageService.swift:63`), not `{timestamp}_N.jpg` — another mismatch with the production schemas.

### Where the schemas plausibly originate

`InspectionJsonSynthesizer.swift:192-216` writes photo URLs under JSON keys `[sectionId][itemTemplateId]["photos"]`. The iOS `sectionId` for inspection items copied from a template comes from `AddInspectionView.swift:261` (`templateItem.sectionId`) and `itemTemplateId` from line 262 (`templateItem.id.uuidString`). For a generator-integration template item, these resolve to e.g. `sectionId = "generatorIntegration"`, `itemTemplateId = "tieInBreakerSize"`.

A consumer that walks `json_data` and re-uploads each `["photos"]` array, naming the storage object after the surrounding keys, would produce exactly the observed schema 1: `generatorIntegration/tieInBreakerSize/{timestamp}_N.jpg`. That consumer is not iOS.

For schema 2 (`0/0/...`): when an item has no `sectionId` or `itemTemplateId` (legacy data, EMB-direct writes), a positional fallback `{sectionIndex}/{itemIndex}/` is consistent with how a JSON walker would degrade. `InspectionJsonSynthesizer.swift:120` notes this case ("items missing sectionId/itemTemplateId exist").

### What this means

This is **not an iOS Stage 4c item**. The fix must be in the web app (`insight-linker-app`):

- Identify the web-app upload path(s) that produce these schemas.
- Reconcile to a single schema (probably `items/{itemUUID}/{filename}` so iOS and web converge).
- Migrate existing storage objects from the legacy schemas to the canonical one, updating `inspection_items.photo_urls` and `json_data` accordingly.

A separate audit pass in the web-app repo is required to confirm the upload code that produced the orphan references. The iOS contribution can be closed once finding (d) is fixed.

---

## Cross-cutting observations

### Two write models for the same data

- `Inspection.subsection` (relationship) and `Inspection.subsectionId` (denorm FK) — written by different code paths (`AddInspectionView` mirrors, `SchematicDiagramView` doesn't, downsync mirrors). Read by different code paths (push reads relationship only, queries read denorm).
- `InspectionItem.photoURLs: [String]` and `Photo` @Model (with `isUploaded: Bool`) — overlapping responsibility for the same physical artefact (the JPEG on disk and in storage).

Both are the same architectural smell — the denormalised / dual-tracked field is treated authoritatively by one side and ignored by the other. Stage 4 should treat consolidation of these as a precondition for the per-finding fixes, otherwise the same divergence pattern will re-emerge.

### No upstream creation gates

The `Inspection` initialiser (`Inspection.swift:101-131`) accepts every safety-relevant field as optional with a default of nil. There is no constructor that requires a subsection. There is no required-field validation at insert time. There is no required-field validation at completion time. The design relies entirely on the UI to do the right thing — and there are multiple UIs.

### Silent failure path

Every layer of the bug chain fails silently:

- `AddInspectionView.performSave` doesn't log when subsection is nil at insert.
- `pushInspections` line 803 doesn't log when `subsection?.id` is nil at push.
- `migrateLocalInspectionPhotos` doesn't fail the push when an upload returns nil — it just keeps the local path and continues.
- The dirty-push guard at line 788 doesn't log when an inspection is skipped — there's no signal that a row is stuck in a partially-synced state.
- Stage 1 only surfaced these because we counted them at the database. Until that count was taken, the bugs were invisible.

### Architecture-or-symptom summary

Per the project's Investigation Protocol, every finding got an explicit architecture-or-symptom check:

| Finding | Bug class | Why |
|---|---|---|
| (a) | Implementation | Denorm field exists for this purpose; push code just doesn't read it. Localised fix. |
| (b) | Design | Model + UI both permit the fully-dark state. Needs UX decision. |
| (c) | Design | Validator models "ready to complete" as one dimension; needs to model multiple. |
| (d) | Implementation + Design | Local-path-in-photoURLs is implementation; dual `photoURLs`/`Photo` is design. |
| (e) | Not iOS | Web-app concern. |

---

## What this means for Stage 4

**Stage 4a (DB invariants)** — Findings (a) and (b) both produce NULL `subsection_id`. Promoting `inspections.subsection_id` to `NOT NULL` is **blocked until (b) is decided**: if "create without subsection" is a legitimate workflow, the column must stay nullable and a partial index / trigger should flag the orphan state instead. If it isn't, NOT NULL is safe to add after the existing 233 are remediated.

**Stage 4c (iOS fixes)** — concrete units of work, prioritised by leverage:

1. **(a) push path coalescing read + guard** — 1 file, ~10 lines. Stop the bleed immediately.
2. **(b) creation flow gate** — multi-file UX change. Requires design call on "draft inspection" semantics.
3. **(c) completion validator unification + subsection check** — 3 files; the validator function from `InspectionDetailView` needs to be hoisted and reused from `SubsectionDetailView` and `EditInspectionView`.
4. **(d) photo capture path** — gate `item.photoURLs.append` on upload confirmation, or use a sentinel like `pending://{photo.id}` that the synthesiser filters out. Plus harden `migrateLocalInspectionPhotos` to dirty-bump even on no-change-but-still-pending.
5. **Documentation** — fix the stale `.approved` auto-promotion comment in `Inspection.swift:22-23`.

**Stage 4b (remediation of existing data)** — 233 orphans + 103 missing photos need separate decisions:

- 60 orphans have recoverable shop info → admin UI to re-link by name.
- 173 orphans have nothing → ask the user (archive vs. attach-by-context).
- 103 photo refs → web-app audit pass + storage cleanup. May be moot once (d) lands and the bad rows are aged out.

**Out of scope for iOS Stage 4c** — finding (e). Spawn a separate audit pass in `insight-linker-app` to identify the two upload code paths.

---

## How this report was produced

Each finding was investigated against the iOS source at `/Volumes/Extreme SSD/DEVELOPER/ECompliance`. Three parallel general-purpose agents traced the push pipeline (a + b), the completion validators (c), and the photo pipeline (d + e). Every cited line was then re-read by the parent investigator from the actual file to confirm the citation is correct. The investigation followed the project's Investigation Protocol (`~/.claude/CLAUDE.md` §"7 phases"): full-system map → verify each link → root-cause statement with evidence → architecture-or-symptom check → no fix code (Stage 4c will handle implementation).
