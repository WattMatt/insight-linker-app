# Routes: `(admin)` sites / inspections / offline tooling

Ground truth from code, 2026-06-11. Covers the `(admin)` site→subsection→inspection tree, the
flat `(admin)/inspections` list, and the two offline-tooling routes. All seven page files are
thin `"use client"` wrappers that render a view from `src/views/`; the view is where every read,
write, and upload lives.

**Group-wide guard (applies to all routes below).** Every route sits under
`src/app/(admin)/layout.tsx`, which wraps children in `ProtectedRoute`
(`src/app/(admin)/layout.tsx:8,12`). Per `03-auth-and-access/access-contexts-and-roles.md` §3.2,
`ProtectedRoute` (`src/components/ProtectedRoute.tsx`) admits **all staff** — roles `Admin`,
`User`, `Moderator`, and users with no `user_roles` row — and only bounces `Contractor` →
`/contractor` and `Client` → `/client-portal`. There is **no Next.js middleware** and **no
per-route `Admin`-only client guard** on any of these pages. None of these seven routes is in the
sidebar except `/offline-sync-test` (`adminOnly`, `AppSidebar.tsx`); the rest are reached via
in-page links. Server-side, the only enforcement is Supabase RLS (named below from
`02-data-model`) and, for `/offline-review`, an edge function.

**RLS reality for the operational tables these routes touch.** Per
`access-contexts-and-roles.md` §3.3: the `User` role holds blanket `FOR ALL` "manage all"
policies on `sites`, `subsections`, `inspections`, `site_documents`, `floor_plan_pins`,
`subsection_floor_plans`, `document_categories`, `snags`, `inspection_items`
(`20251120111033_1e66f4c9-…sql:4-56`). So any staff user (incl. role `User`) can read/write every
site, subsection, and inspection across all clients — these admin routes are **not tenant-scoped
at the DB layer**; scoping is by URL param only. `coc_validations`/`coc_extractions`/`clients`
writes are gated by the staff predicate (`20260610120000_phase1_write_lockdown.sql:35-97`), which
still admits every staff role.

---

## 1. `/sites` — `Sites` view

| | |
|---|---|
| Page | `src/app/(admin)/sites/page.tsx:2-3` → renders `@/views/Sites` |
| View | `src/views/Sites.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). No Admin-only check. |

The same `Sites` view also backs `/clients/[clientId]/sites` — it reads `clientId` from
`useParams()` (`Sites.tsx:38`) and, when present, filters by it (`:61-63`); on the bare `/sites`
route `clientId` is `undefined`, so **all sites across all clients** are listed (`:58`).

**Data reads**
| What | Table/bucket | Line |
|---|---|---|
| Sites (+`clients(name)` join), all or `client_id`-filtered | `sites` | `Sites.tsx:58,62` |
| Client list for the Add-Site dropdown | `clients` | `Sites.tsx:67` |
| Signed URL for each `site_image_url` (private bucket) | storage `site-images` `createSignedUrl(path, 3600)` | `Sites.tsx:82-84` |

**Data writes**
| What | Op | Line |
|---|---|---|
| Create site (`siteSchema.parse` first; `created_by = auth user`) | `sites` INSERT | `Sites.tsx:128-133` |
| Delete site (`confirm()` only) | `sites` DELETE | `Sites.tsx:157` |

DB gate: `sites` writes succeed for any staff user via the `User` manage-all policy
(`20251120111033:4-56`). Delete is a hard `DELETE` with no cascade handling in this view (orphans
left to FK/RLS).

---

## 2. `/sites/[siteId]` — `SiteDetail` view

| | |
|---|---|
| Page | `src/app/(admin)/sites/[siteId]/page.tsx:2-3` → `@/views/SiteDetail` |
| View | `src/views/SiteDetail.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Reads `siteId`, optional `clientId` from `useParams()` (`SiteDetail.tsx:49`); `?tab=` selects the active tab (`:60`). |

A 9-tab dashboard (overview / schematic / asset-verification / compliance / documents /
subsections / qr-analytics / fortress-checklist / reports). Tabs delegate to child components
(`SiteOverview`, `ComplianceDashboard`, `SchematicDiagram`, `AssetVerification`, `QRAnalytics`,
`SiteReports`, `FortressMarkingChecklist`, `SiteDocuments`, `SubsectionList`) — those add their
own reads not enumerated here.

**Data reads (this view)**
| What | Table/bucket | Line |
|---|---|---|
| Company logo | `settings` `.maybeSingle()` | `SiteDetail.tsx:94-98` |
| Site documents | `site_documents` (eq `site_id`) | `SiteDetail.tsx:110-114` |
| Subsection ids then their documents (+`document_categories(name)`) | `subsections`, `subsection_documents` | `SiteDetail.tsx:127-130,141-151` |
| Inspection templates | `inspection_templates` | `SiteDetail.tsx:171-175` |
| Site doc categories (defaults auto-created if none) | `site_document_categories` | `SiteDetail.tsx:187-191` |
| Site (+`clients(id,name)`), subsections, inspections, snags, coc_validations | `sites`, `subsections`, `inspections`, `snags`, `coc_validations` | `SiteDetail.tsx:392-396,400-404,408-412,418-421,428-432` |
| Signed URL for site image | storage `site-images` | `SiteDetail.tsx:455-457` |

**Data writes**
| What | Op | Line |
|---|---|---|
| Auto-create 6 default doc categories | `site_document_categories` INSERT | `SiteDetail.tsx:206-214` |
| Create doc category | `site_document_categories` INSERT | `SiteDetail.tsx:239-247` |
| Delete category + its docs | `site_documents` DELETE, `site_document_categories` DELETE | `SiteDetail.tsx:264-267,272-275` |
| Bulk-delete all categories + all site docs | `site_documents` DELETE (by `site_id`), `site_document_categories` DELETE | `SiteDetail.tsx:302-305,310-313` |
| Bulk-delete docs in a category | `site_documents` DELETE | `SiteDetail.tsx:342-345` |
| **Delete subsection (cascading)** — deletes from 7 child tables then the subsection | `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `coc_validations`, `document_categories`, then `subsections` | `SiteDetail.tsx:363-369,375-378` |
| Delete site document (+ storage object) | storage `documents` remove, `site_documents` DELETE | `SiteDetail.tsx:529,531` |
| Update site | `sites` UPDATE | `SiteDetail.tsx:543` |
| Upload site document (public URL) | storage `documents` upload + `getPublicUrl`, `site_documents` INSERT | `SiteDetail.tsx:559,561-565` |
| Create site-level inspection | `inspections` INSERT | `SiteDetail.tsx:581-585` |

Note: documents uploaded here go to the **`documents` bucket with `getPublicUrl`** (`:561`) — a
public URL, unlike site images which use signed URLs. ⚠️ Whether the `documents` bucket is
actually public is a storage-policy question (see `triggers-enums-storage.md`), not verified here.

**Documents tab — management layer (shipped 2026-06-21, commit `65f71ad`).** The `documents` tab
renders `SiteDocuments` (`src/components/site/SiteDocuments.tsx`); management is **Admin-only** —
all mutation UI is gated by `canManage`, set in the parent as
`canManageDocuments = useUserRole() === 'Admin'` (`SiteDetail.tsx:57`) and passed in (`:812`).
Non-admins see read-only (View + Download only). Mutation logic lives in `src/lib/documents/`
(`documentMutations.ts`, `paths.ts`, `reportCategories.ts`, `uploadConstraints.ts`); supporting
dialogs are `MoveDocumentsDialog.tsx`, `DocumentHistoryDialog.tsx`, and the upload dialog in
`DocumentDialogs.tsx`.
- **Per-document:** View, Download, and a `⋮` overflow menu with Rename (inline), Move to…,
  History, Delete. Each row shows a metadata line (size · date · uploader, "—" when unknown).
- **Selection + bulk bar:** checkboxes drive bulk Move to… / Delete; a selection mixing site-level
  and subsection docs disables Move (they live in different category tables).
- **Per-category `⋮` (admin, non-system):** Upload here, Rename (inline), Move up / Move down
  (reorder via `order_index`), Empty (delete all files), Delete category. **System categories**
  (app-managed report/COC categories) show a 🔒 badge and have **no menu**.
- **Multi-file upload with validation:** allowed types `pdf/doc/docx/xls/xlsx/png/jpg/jpeg/gif/webp/svg`,
  max **50 MB per file** (`uploadConstraints.ts`).
- **Audit trail:** rename/move/delete insert into `activity_logs` (`action` =
  `document_renamed | document_moved | document_deleted`, with `user_email`, `user_id`, details
  JSON-as-text — `documentMutations.ts:77,108,132`); the per-document History dialog reads
  `activity_logs` filtered by `document_id`.
- **Storage sync:** move/rename physically relocate the storage object via download→upload→remove
  (no `storage.copy/move` in repo), copy-then-delete with rollback; site docs keep the
  denormalized category text **and** `category_id` in sync.
- **Schema (migration `20260621120000_site_documents_management.sql`, applied to prod):**
  `site_documents` += `file_size` (bigint), `mime_type` (text), `uploaded_by`, `updated_by`
  (uuid→`auth.users`); `site_document_categories` and `document_categories` each += `is_system`
  (boolean NOT NULL default false). `is_system = true` locks report/COC categories from
  rename/move-target/delete. The two category tables are distinct: **site docs** →
  `site_document_categories` (per `site_id`); **subsection docs** → `document_categories`
  (per `subsection_id`).

---

## 3. `/sites/[siteId]/subsections/[subsectionId]` — `SubsectionDetail` view

| | |
|---|---|
| Page | `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/page.tsx:2-3` → `@/views/SubsectionDetail` |
| View | `src/views/SubsectionDetail.tsx` (presentation) + `src/views/subsection-detail/useSubsectionDetail.ts` (all data logic) |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). `useParams()` → `clientId?`, `siteId`, `subsectionId` (`useSubsectionDetail.ts:39`). `subsectionId === "new"` switches to the create form (`SubsectionDetail.tsx:34`). |

The view is a 5-tab shell (overview / inspections / floor-plan / documents / coc-metering); the
hook (`useSubsectionDetail.ts`) carries every read/write. It also derives `actualClientId` by
reading the parent site's `client_id` (`useSubsectionDetail.ts:332,349,441`) so links work when
the URL omits `clientId`.

**Data reads** (`useSubsectionDetail.ts`)
| What | Table | Line |
|---|---|---|
| Document categories | `document_categories` | `:123` |
| Subsection documents | `subsection_documents` | `:164` |
| Snags | `snags` | `:197` |
| COC validations / extractions | `coc_validations`, `coc_extractions` | `:215,234` |
| Linked / available templates | `inspection_templates` | `:293` |
| Subsection record + parent site (`client_id`) | `subsections`, `sites` | `:318,356,441` |
| Inspections for subsection | `inspections` | `:367,385` |
| Company logo | `settings` | `:463` |
| Signed URLs for COC docs | storage `documents` `createSignedUrl` | `:696,806` |

**Data writes** (`useSubsectionDetail.ts`)
| What | Op | Line |
|---|---|---|
| Create subsection | `subsections` INSERT | `:981-982` |
| Update / edit subsection | `subsections` UPDATE | `:1025-1026,1087,1107-1108,1167-1168` |
| **Delete subsection (cascading)** — 7 child tables then subsection | `subsection_documents`, `inspection_items`, `snags`, `inspections`, `qr_scans`, `coc_validations`, `document_categories`, then `subsections` | `:1052-1058,1063-1064` |
| Create / update / delete inspection; fix template links | `inspections` INSERT/UPDATE/DELETE | `:1502,1533,1548,1565,1604` |
| Create / delete doc category; auto-assign category | `document_categories` INSERT/DELETE, `subsection_documents` UPDATE | `:142,1246,1265,1459` |
| Upload subsection document (public URL) | storage `documents` upload + `getPublicUrl`, `subsection_documents` INSERT | `:1303,1313,1321` |
| Delete document (+ storage object) | storage `documents` remove, `subsection_documents` DELETE | `:1369,1377` |
| COC extraction/validation persistence | `subsections` / `subsection_documents` UPDATE | `:613,794,840,849,915` |

**Edge functions invoked** (from the hook, via `supabase.functions.invoke`):
- `validate-coc` (`:563,865`) — COC validation
- `extract-coc` (`:710`) — COC field extraction

These run under the caller's JWT; their auth/tenant model is documented in the edge-function
chapter, not here. ⚠️ Their internal guards not audited in this task.

DB gate: all subsection/inspection/snag writes succeed for any staff role via the `User`
manage-all policies (`20251120111033:4-56`). Not tenant-scoped at DB.

---

## 4. `/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]` — `InspectionDetail` view

| | |
|---|---|
| Page | `src/app/(admin)/sites/[siteId]/subsections/[subsectionId]/inspections/[inspectionId]/page.tsx:2-3` → `@/views/InspectionDetail` |
| View | `src/views/InspectionDetail.tsx` (2885 lines) |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). |

**Cross-context note.** The *same* `InspectionDetail` view also backs the contractor route
`/contractor/inspections/[inspectionId]`. It detects context purely from which params are present:
`isContractorPortal = !clientId && !siteId && !subsectionId` (`InspectionDetail.tsx:105`), and reads
`?preview=` (`:104`). Under the admin route all four params exist. The view itself applies **no
role check** — it relies on whichever layout guard wrapped it and on `inspections` RLS. It
explicitly handles RLS denials (`PGRST116`/`42501`) with a redirect + toast
(`InspectionDetail.tsx:802-816`).

**Data reads**
| What | Table/bucket | Line |
|---|---|---|
| Session validate + refresh on load | `auth.getSession` / `refreshSession` | `InspectionDetail.tsx:745,750` |
| Company logo | `settings` | `:258-261` |
| Snags for subsection | `snags` | `:281-285` |
| Inspection (+`sites`→`clients`, `subsections` joins) | `inspections` `.maybeSingle()` | `:769-790` |
| Template | `inspection_templates` `.maybeSingle()` | `:845-849` |
| Signed URL for site image | storage `site-images` | `:891-893` |

**Data writes**
| What | Op | Line |
|---|---|---|
| Save inspection (full field set + `json_data` incl. tenants) | `inspections` UPDATE | `:1499-1517` |
| Auto-save tenant image into `json_data` | `inspections` UPDATE | `:553-559` |
| Auto-save after tenant-image deletion | `inspections` UPDATE | `:643-649` |
| Create snag (`created_by = auth user`) | `snags` INSERT | `:320-322` |
| Update snag / toggle status | `snags` UPDATE | `:353,387` |
| Delete snag | `snags` DELETE | `:406-409` |
| Upload inspection photos (public URL) | storage `inspection-photos` upload + `getPublicUrl` | `:1190-1201` |
| Upload tenant images (public URL) | storage `inspection-photos` upload (via `useImageUpload`) | `:491,533` |
| Upload snag photos (public URL) | storage `inspection-photos` upload + `getPublicUrl` | `:680-688` |
| Delete inspection / tenant photos | storage `inspection-photos` remove | `:1407,623` |

Offline path: writes can be queued via `useOfflineSync` / `useOfflineInspectionDetail`
(`:33-34,123`) and reads served from IndexedDB cache (`getCachedInspection`, `:733,755`) when
offline. The full second half of this file (lines 1585-2885) is render JSX + report components
(`ComprehensiveInspectionReport`, `SiteDrawingReport`, `InspectionSignatures`); no additional
table writes were found beyond those above (verified by grep of `.from(`/`.update`/`.insert`/
`.delete`/`.upload` across the whole file). ⚠️ Lines 1585-2885 read by grep only, not line-by-line.

DB gate: `inspections` UPDATE is the one write a `Contractor` also gets (scoped to `user_sites`,
`20251017061634:39-50`); for staff it is the `User` manage-all policy. `snags` writes via `User`
manage-all (`20251120111033`).

---

## 5. `/inspections` — `Inspections` view (flat list)

| | |
|---|---|
| Page | `src/app/(admin)/inspections/page.tsx:2-3` → `@/views/Inspections` |
| View | `src/views/Inspections.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). No params; lists **all inspections across all clients/sites**. |

**Data reads**
| What | Table | Line |
|---|---|---|
| All inspections (+`sites`→`clients`, `subsections` joins) | `inspections` | `Inspections.tsx:82-84` |
| All sites (+`clients(name)`) for create dropdown | `sites` | `Inspections.tsx:85` |
| Unsynced offline inspections (when offline) | IndexedDB `offlineDB.getUnsyncedInspections()` | `Inspections.tsx:95,135` |
| Subsections for assign dialog | `subsections` (eq `site_id`) | `Inspections.tsx:222-226` |

**Data writes**
| What | Op | Line |
|---|---|---|
| Create inspection (`inspectionSchema.parse`; offline-aware) | via `useOfflineInspections.createInspection` → `inspections` INSERT (or IndexedDB queue) | `Inspections.tsx:174-181` |
| Delete inspection (offline-aware) | via `useOfflineInspections.deleteInspection` | `Inspections.tsx:208` |
| Link inspection to subsection | `inspections` UPDATE (`subsection_id`) | `Inspections.tsx:239-242` |

Row click navigates into the hierarchical inspection-detail route (`:443-451`) or opens the
assign dialog for unlinked inspections (`:453`). Offline rows (`id` starts `offline_`) show a toast
and don't navigate (`:438-440`).

---

## 6. `/offline-review` — `OfflineReview` view  ⚠ security-relevant

| | |
|---|---|
| Page | `src/app/(admin)/offline-review/page.tsx:2-3` → `@/views/OfflineReview` |
| View | `src/views/OfflineReview.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). Not in sidebar; reachable by typing the URL. |

A dev-tool: paste code into a textarea, get an AI code review. The only backend interaction is
`supabase.functions.invoke("offline-review", { body: { codeFiles } })`
(`OfflineReview.tsx:41-43`). No tables read or written.

**Edge function `offline-review`** (`supabase/functions/offline-review/index.ts`):
- **`verify_jwt = false`** in `supabase/config.toml:24-25`.
- **No auth check inside the function.** It reads `codeFiles` from the body, builds a prompt, and
  calls the Lovable AI Gateway with the server-held `LOVABLE_API_KEY`
  (`offline-review/index.ts:16,110-125`).
- **CORS `Access-Control-Allow-Origin: '*'`** (`:4`).

→ **Anyone who knows the function URL** (no login, no role) can invoke it, supply arbitrary text,
and burn the project's `LOVABLE_API_KEY` AI budget — an unauthenticated, billable side effect. The
client-side `ProtectedRoute` is cosmetic here; it gates the *page*, not the *function*. Recorded as
a security flag.

---

## 7. `/offline-sync-test` — `OfflineSyncTest` view

| | |
|---|---|
| Page | `src/app/(admin)/offline-sync-test/page.tsx:2-3` → `@/views/OfflineSyncTest` |
| View | `src/views/OfflineSyncTest.tsx` |
| Group / guard | `(admin)` / `ProtectedRoute` (staff). **Sidebar item flagged `adminOnly`** (`AppSidebar.tsx`, "Platform Testing") — but that only hides the *link*; a `User`/`Moderator` can still load the URL (no per-page Admin check). |

A diagnostic dashboard for the offline cache/sync pipeline. Most state lives in IndexedDB
(`offlineInspectionDB`).

**Data reads**
| What | Source | Line |
|---|---|---|
| Cached inspections + their offline images | IndexedDB `offlineInspectionDB` | `OfflineSyncTest.tsx:71,78` |
| Storage estimate | `navigator.storage` via `getStorageEstimate()` | `OfflineSyncTest.tsx:127` |
| Available inspections (+`sites!inner`→`clients!inner`) | `inspections` (limit 20) | `OfflineSyncTest.tsx:102-115` |
| Full inspection for caching (+templates/sites/subsections joins) | `inspections` `.single()` | `OfflineSyncTest.tsx:138-154` |

**Data writes** — all to **IndexedDB only**, no Supabase table writes:
| What | Target | Line |
|---|---|---|
| Cache inspection | IndexedDB | `OfflineSyncTest.tsx:186` |
| Save simulated test image (canvas blob) | IndexedDB | `OfflineSyncTest.tsx:252` |
| Delete cached inspections/images | IndexedDB | `OfflineSyncTest.tsx:318-319` |
| Queue + process sync mutations | `useOfflineSync.queueMutation` / `processQueue` | `OfflineSyncTest.tsx:280,296,304` |

Sync mutations (`UPLOAD_INSPECTION_IMAGE`, `SAVE_INSPECTION_JSON`) are dispatched through
`useOfflineSync` (`:43`); the actual Supabase writes happen inside that hook's queue processor, not
in this view. No direct table mutation in the view itself.

---

## Security summary (for this route set)

1. **`offline-review` edge function is unauthenticated + billable.** `verify_jwt = false`
   (`config.toml:24-25`), no in-function auth, CORS `*` (`offline-review/index.ts:4`). The page
   guard does not protect the function. → flag.
2. **No tenant scoping at the DB layer for any of these routes.** The `User` role's `FOR ALL`
   manage-all policies on `sites`/`subsections`/`inspections`/`snags`/… (`20251120111033:4-56`)
   mean every staff user reads/writes every client's data; `/sites`, `/inspections`, and the
   detail tree scope only by URL param, not by RLS. A non-Admin staff user (role `User`, the signup
   default) has full cross-client CRUD. → flag (architectural, mirrors `access-contexts` Open
   Q #4).
3. **`adminOnly` sidebar flag on `/offline-sync-test` is cosmetic.** No per-page Admin guard; the
   URL is loadable by any staff role. Its writes are IndexedDB-only, so impact is low, but it reads
   real inspection data cross-client. → flag (low severity).
4. **Hard cascading deletes from the browser** (`SiteDetail.tsx:363-378`,
   `useSubsectionDetail.ts:1052-1064`) issue 7+ `DELETE` statements client-side with only a
   `confirm()`; correctness depends entirely on each table's delete policy admitting the staff
   user. Not a privilege-escalation bug, but destructive and unguarded server-side beyond RLS.
</content>
</invoke>
