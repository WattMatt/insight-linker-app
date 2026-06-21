# Site Documents Tab — Management Features Design

- **Date:** 2026-06-21
- **Status:** ✅ SHIPPED to prod 2026-06-21 (origin/main 65f71ad; migration applied via Management API; Vercel deployed). Manual runtime verification pending.
- **Scope owner:** Arno Mattheus
- **Topic:** Rename documents, recategorize documents (single + bulk), category management (rename / reorder / empty / delete), audit trail, document metadata, multi-file upload, and upload validation on the Site Detail → Documents tab.

---

## 1. Summary

The Site Documents tab is today a **read-mostly browser**: a user can View, Download, and Delete documents, and Create / Delete / Bulk-delete categories. There is **no way to rename a document, move a document between categories, rename or reorder a category, or see who changed what.** This spec adds those management capabilities and a handful of closely-related additions, designed around the real hazards in the current data model.

The guiding constraints discovered during review (§3) are:
- Two **separate** category systems exist (site vs subsection) and must not be conflated.
- `site_documents` stores its category **twice** (`category` text + `category_id`) and both must stay in sync.
- Site-document **storage paths bake the category name**, so moving/renaming requires physically relocating the storage object (per the approved decision).
- **Report and COC categories are system-owned** — their names are load-bearing in code and must be locked from edits.
- COC documents carry **derived state** (`coc_number`, `coc_status`) that must be preserved, not recomputed, on move.

---

## 2. Goals & success criteria

A capability is "done" when it works end-to-end for an Admin, is gated off for non-Admins, keeps storage + DB consistent, and writes an audit record where applicable.

1. **Rename** a document's display name (extension auto-preserved); storage object physically renamed to match.
2. **Move** one document to another category, source-aware; DB (`category_id` + `category` text) and storage object both updated.
3. **Bulk move** a multi-selection (single source per operation).
4. **Bulk delete-in-category** (wire the existing dead-coded handler) + an **Empty** (bulk-move-out) escape hatch.
5. **Rename a category** (DB-only) and **reorder categories** (`order_index`), with system categories locked.
6. **Audit trail** for rename / move / delete, viewable as a per-document history.
7. **Metadata**: show size · date · uploader per document.
8. **Multi-file upload** with **type/size validation**.

---

## 3. Current state (review findings)

Primary files:
- `src/components/site/SiteDocuments.tsx` — unified list UI (group by category/subsection, search, location filter).
- `src/views/SiteDetail.tsx` — document state + all handlers (fetch, upload, delete, category CRUD).
- `src/components/site/DocumentDialogs.tsx` — create-category / upload / delete-category modals.
- `src/components/DocumentPreviewDialog.tsx` — viewer (PDF/DOCX/image, zoom/pan/rotate). Unchanged by this spec.

Key facts that shape the design:

| # | Fact | Source |
|---|------|--------|
| F1 | Two category tables: site docs → `site_document_categories` (codes 01–06, per-site); subsection docs → `document_categories` (codes 01–07, adds "07 COC Evaluation Reports"). | `SiteDetail.tsx`, `useSubsectionDetail.ts` |
| F2 | `site_documents` stores `category` (TEXT name) **and** `category_id` (FK). Both written on upload; snapshot/reports read the TEXT string. | `SiteDetail.tsx:539`, `snapshots/capture/route.ts` |
| F3 | `subsection_documents` stores `category_id` only (no text column). | `types.ts` |
| F4 | Site-doc storage path = `{siteId}/{category.name}/{ts}-{file}` (bakes category **name**). Subsection manual uploads use `{subsectionId}/{category.id}/...` (immutable id); subsection **generated** reports use the category **name**. → Always derive the old path from `file_url`, never reconstruct it. | `SiteDetail.tsx:535`, `useSubsectionDetail.ts:729`, `pdfDocumentSaver.ts` |
| F5 | `category_id` is `ON DELETE CASCADE`; deleting a category destroys its documents. `handleDeleteCategory` also app-deletes docs first. | migration `20251016021558:31` |
| F6 | UPDATE already works under prod RLS (`CocCertificateList.tsx` updates `subsection_documents`). Admins have `FOR ALL` on both tables → **no permission migration needed.** | `CocCertificateList.tsx:50,177` |
| F7 | Report categories are find-or-create keys hardcoded in `pdfDocumentSaver.ts` (`Site Summary Reports`, `Asset Verification Reports`, `Floor Plan Reports`, `Inspection Reports`, `COC Validation Reports`, `Site COC Reports`, `Marking Checklists`, `Generated Reports`). `SiteReports.tsx` filters by a hardcoded list. Renaming these breaks report generation + visibility. | `pdfDocumentSaver.ts:197`, `SiteReports.tsx` |
| F8 | COC derived state: `coc_number` parsed from filename; `coc_status` seeded three different ways (cert upload hardcodes 'Pending'; eval report parses verdict from filename; manual subsection upload auto-detects by `category.name.includes('coc')`). | `uploadCocFiles.ts`, `useSubsectionDetail.ts:762` |
| F9 | Eval reports link to a parent cert via `subsection_documents.parent_document_id` (independent of category). | `20260619120000_coc_evaluation_reports.sql` |
| F10 | `onBulkDeleteDocumentsInCategory` is fully wired through props with a working handler (`SiteDetail.tsx:331-360`) but **no UI control invokes it.** | `SiteDocuments.tsx`, `SiteDetail.tsx:737` |
| F11 | No audit trail for document mutations; `activity_logs` exists (`user_email`, `action`, `details`, `created_at`) but unused for docs. `site_documents` has no `uploaded_by`/`updated_by`. | `20251014132137` |
| F12 | Storage bucket `documents` is public + permissive (any authed user can write/delete any object). Out of scope to fix here; noted as known risk. | migration `20251120081347` |

The delete pattern to mirror for all new mutations: `SiteDetail.tsx:496-514` — route by `source`, extract path via `file_url.split('/documents/')[1].split('?')[0]`, best-effort remove object, delete row, refetch.

---

## 4. Scope

**In scope:** the eight goals in §2, applied to documents shown in the unified list (both `site_documents` and `subsection_documents`), and to **site-level categories** (`site_document_categories`).

**Out of scope (explicit):**
- Managing **subsection** categories (`document_categories`) from this tab — that remains in Subsection Detail. (Subsection *documents* can still be moved/renamed here; their move-target list is sourced from `document_categories`.)
- **Cross-source moves** (a site document becoming a subsection document, or vice-versa).
- Fixing the public-bucket storage RLS (F12) — tracked separately.
- Changes to `DocumentPreviewDialog` and the wired-but-unused compliance panel.

---

## 5. Approved decisions

| # | Decision |
|---|----------|
| D1 | **Permissions: Admins only.** All mutations gated in UI + handlers. No RLS migration. |
| D2 | **Storage physically synced on document move/rename** (copy → update → delete-old saga, §8). |
| D3 | **Category rename = DB-only** (cosmetic path staleness accepted; the baked category name is never re-parsed). Deliberate exception to D2 to avoid mass file relocation. |
| D4 | **Report/eval-report moves: warn-and-allow**, not hard-block. |
| D5 | **No SiteDetail refactor.** Document state/handlers stay in `SiteDetail.tsx`; new logic lives in extracted lib modules + new dialog components. |
| D6 | **Row action style B:** View + Download inline; Rename / Move / History / Delete in a `⋮` overflow menu. |
| D7 | **System categories locked** via a real `is_system` flag (not name-matching). |
| D8 | **COC fields preserved, not recomputed,** on move (warn only). |
| D9 | **Audit:** log rename/move/delete to `activity_logs`; view as per-document history. |

---

## 6. Permissions model (D1)

- A single `canManageDocuments` boolean (Admin role check, reusing the app's existing role hook) gates: checkboxes, the `⋮` menus (doc + category), the bulk action bar, Upload, and category-management controls.
- Non-Admins see the current read-only experience (View / Download / Preview only).
- No new RLS policies. Admin `FOR ALL` already permits the UPDATE/DELETE the handlers issue (F6). Storage `move`/`copy`/`remove` already permitted by the permissive bucket policy (F12).

---

## 7. Data model changes (one migration)

A single new migration adds nullable metadata + a system flag. No backfill of historical rows (they render "—").

**`site_documents`** — add:
- `file_size BIGINT NULL`
- `mime_type TEXT NULL`
- `uploaded_by UUID NULL` (set on new uploads)
- `updated_by UUID NULL` (set on each mutation)

**`site_document_categories`** and **`document_categories`** — add:
- `is_system BOOLEAN NOT NULL DEFAULT false`

**Seeding `is_system = true`:**
- In both category tables, set `is_system = true` for rows whose `name` matches the report-category set (F7) or the auto-created COC categories (`COC Certificates`, `07 Evaluation Reports` / `07 COC Evaluation Reports`).
- Going forward, `savePDFToDocuments()` (report find-or-create) and the COC upload find-or-create (`uploadCocFiles.ts`) set `is_system = true` when creating their categories.

**Sync obligations going forward:**
- New uploads populate `file_size`, `mime_type`, `uploaded_by` from the `File` object + session.
- Every document mutation sets `updated_by` and (via existing trigger) `updated_at`.
- Any move updates **both** `site_documents.category_id` and `site_documents.category` (F2).

**Deployment note (project history):** apply this migration to prod via the Supabase **Management API `database/query`** (not `db push`) due to known prod/schema-migration drift; reconcile drift first. Use `IF NOT EXISTS` on every column add so re-runs are safe.

---

## 8. Core architecture — document mutation library

New module **`src/lib/documents/documentMutations.ts`** centralizes every write so the orchestration + source-routing lives in one tested place. It is the single dependency the new handlers call.

### 8.1 Shared concepts
- **Source routing:** each function takes the document's `source` ('site' | 'subsection') and routes to the correct table (`site_documents` / `subsection_documents`) and column shape.
- **Old path:** always derived from the row's `file_url` (`split('/documents/')[1].split('?')[0]`) — never reconstructed (F4).
- **New path (move):** built to match the destination's upload convention — site: `{siteId}/{newCategory.name}/{ts}-{sanitized}`; subsection: `{subsectionId}/{newCategory.id}/{ts}-{sanitized}`.
- **New path (rename):** same folder as old path, filename `{ts}-{sanitizedNewName}{ext}`.
- **Public URL:** recomputed via `supabase.storage.from('documents').getPublicUrl(newPath)`.

### 8.2 The copy → update → delete-old saga (D2)
For move and rename of a single document:
1. `storage.copy(oldPath, newPath)`.
2. `update` the DB row: new `file_url`; for move also `category_id` (+ `category` text for site docs); for rename also `file_name`; always `updated_by`.
3. On step-2 success → `storage.remove([oldPath])` (best-effort; a leftover original is a harmless orphan, never a broken link).
4. On step-2 failure → `storage.remove([newPath])` (delete the copy) and surface the error. The original row + object are untouched → **no inconsistent state.**

`copy`-then-delete is chosen over `move` precisely so a failed DB update can't strand the row with a dead `file_url`.

### 8.3 Functions
- `renameDocument(doc, newName)` — §8.2 with a same-folder new path; preserves extension; rejects empty/whitespace names and names that only change case to the same value.
- `moveDocuments(docs, targetCategory)` — validates single-source (and that the target isn't `is_system`); runs §8.2 per doc; returns per-doc results so the UI can report partial success.
- `deleteDocuments(docs)` — mirrors the existing delete pattern per doc (best-effort storage remove → row delete).
- Each function writes an audit record (§10) on success.

### 8.4 Bulk behavior
- Bulk move/delete iterate per document and **accumulate results**; a failure on one does not abort the rest. The caller toasts "N moved, M failed" and refetches once at the end.
- Bulk move requires a **single source**; the UI disables "Move to…" for mixed selections with an explanatory tooltip.

---

## 9. UX / UI design

### 9.1 Row (D6)
`[checkbox] [type icon] [name + metadata line] … [👁 View] [⬇ Download] [⋮]`
- Metadata line: `size · date · uploader`, each omitted/"—" when null.
- `⋮` menu: **Rename**, **Move to…**, **History**, **Delete**.
- Checkbox + `⋮` shown only when `canManageDocuments`.

### 9.2 Bulk action bar
- Renders above the list when ≥1 row is selected: `N selected · [Move to…] [Download] [Delete] · Clear`.
- "Move to…" disabled (with tooltip) for mixed-source selections.

### 9.3 Category group header
`[▾] name · count … [⋮]` where `⋮` = **Rename**, **Move up**, **Move down**, **Empty**, **Delete**.
- System categories (`is_system`) render a 🔒 badge and a disabled `⋮` (locked from rename/reorder/empty/delete).

### 9.4 Dialogs / components (new, in `src/components/site/`)
- **MoveDocumentsDialog** — header "Move N document(s)"; shows source category; "Move to" select sourced from the correct table for the selection's source, **excluding `is_system` categories**; info note (single-source rule); amber warning when the selection contains COC docs (D8) or report/eval docs (D4). Confirm → `moveDocuments`.
- **Rename** — inline edit in the row (input + Save/Cancel), extension shown as a static suffix.
- **Category rename** — inline edit in the group header (DB-only, D3).
- **EmptyCategoryDialog / DeleteCategoryConfirm** — Empty opens MoveDocumentsDialog pre-targeted; Delete reuses existing confirm copy, extended to warn it destroys all documents (F5).
- **DocumentHistoryDialog** — per-document timeline from `activity_logs` (§10).
- **Upload dialog** (extend existing) — multi-file input + validation (§11).

### 9.5 Wiring
New handlers added to `SiteDetail.tsx` (no refactor, D5), each delegating to `documentMutations.ts` and refetching on completion:
`handleRenameDocument`, `handleMoveDocuments`, `handleRenameCategory`, `handleReorderCategory`, plus the already-present-but-unwired `handleBulkDeleteDocumentsInCategory` (F10) now invoked from the category `⋮` → Empty/Delete path.

---

## 10. Audit trail (D9)

- On rename / move / delete success, `documentMutations.ts` inserts into `activity_logs`:
  - `action`: `document_renamed` | `document_moved` | `document_deleted`.
  - `user_email`: current session email.
  - `details` (jsonb): `{ source, document_id, site_id, file_name, from_category, to_category, old_name, new_name }` (fields relevant to the action).
- **Viewing:** the row `⋮` → **History** opens `DocumentHistoryDialog`, querying `activity_logs` filtered by `details->>document_id`, newest first.
- Uploads/downloads are **not** logged (per chosen scope: rename/move/delete only).

---

## 11. Multi-file upload + validation

- Upload dialog accepts **multiple files**; each uploaded into the selected category, capturing `file_size`/`mime_type`/`uploaded_by`.
- Validation via a shared constant `src/lib/documents/uploadConstraints.ts`:
  - **Allowed types:** pdf, doc, docx, xls, xlsx, png, jpg/jpeg, gif, webp, svg (extension + MIME check).
  - **Max size:** 50 MB per file (single source of truth constant).
  - Rejections produce a clear per-file message; valid files in the same batch still upload.

---

## 12. COC / system-document guards

- **Move a COC document:** `coc_number` / `coc_status` are **preserved unchanged** (no recompute); MoveDocumentsDialog shows an amber warning (D8).
- **Move an evaluation report:** `parent_document_id` is category-independent and stays intact; warn that compliance grouping is unaffected (D4).
- **Move a report (`is_system`-category) document:** allowed, but warn it will drop off the Reports view (which filters by category). (Report *categories* themselves are locked, so a report doc can leave but cannot be moved *into* a system category — system categories are excluded as targets, §9.4.)
- **COC name-detection coupling (F8):** renaming a non-system category whose name currently triggers COC detection (`name.toLowerCase().includes('coc')`) shows a soft warning that future manual uploads there will no longer auto-seed `coc_status`. (Full removal of name-based detection is out of scope.)

---

## 13. Edge cases & failure handling

- **Storage copy fails** → abort before any DB change; toast error; nothing changed.
- **DB update fails after copy** → delete the copy (§8.2 step 4); original intact.
- **Storage delete-old fails** → log + continue; the row already points at the new path; orphan is harmless (a cleanup task is future work).
- **Name collision** → paths carry a fresh timestamp prefix, so display-name duplicates are allowed and never collide in storage.
- **Empty / whitespace-only rename** → rejected client-side.
- **Mixed-source bulk move** → "Move to…" disabled with tooltip.
- **Partial bulk result** → "N succeeded, M failed"; failed items remain selected.
- **Non-Admin reaching a mutation** (e.g. stale UI) → Admin RLS blocks the write; handler surfaces a friendly "Admins only" message.
- **Move target is a system category** → not offered in the list; defensively rejected in `moveDocuments`.

---

## 14. Testing plan

**Vitest unit tests** (no network; mock the supabase client):
- `documentMutations.test.ts`: source routing (site vs subsection table/columns); old-path derivation from assorted `file_url` shapes; new-path construction for move vs rename; saga compensation (DB-fail → copy removed); both `category_id` + `category` updated for site docs; audit record shape per action.
- `uploadConstraints.test.ts`: type + size acceptance/rejection.
- Category guard: `is_system` categories rejected as move targets and locked from rename/reorder/delete.

**Manual runtime verification checklist** (Admin then non-Admin):
1. Rename a site doc → name updates, file still opens/downloads, storage object renamed, history shows entry.
2. Move a site doc → appears under new category, `category` text + `category_id` both updated, file opens, old storage object gone.
3. Move a subsection doc → target list came from `document_categories`; COC fields unchanged; warning shown.
4. Bulk move (same source) → all moved; mixed-source selection disables Move.
5. Empty then Delete a non-system category; confirm system categories are locked.
6. Multi-file upload with one oversized + one bad-type file → valid ones upload, others rejected with messages.
7. Non-Admin sees read-only (no checkboxes/`⋮`/Upload).

Failure of any item returns to design, not a patch-on-patch (per investigation protocol).

---

## 15. File-by-file change list

**New**
- `src/lib/documents/documentMutations.ts` — rename/move/delete saga + audit writes.
- `src/lib/documents/uploadConstraints.ts` — allowed types + max size.
- `src/lib/documents/reportCategories.ts` — single source of truth for system report-category names (consumed by seeding + `pdfDocumentSaver.ts`).
- `src/components/site/MoveDocumentsDialog.tsx`, `DocumentHistoryDialog.tsx` (+ small Empty/confirm additions).
- `supabase/migrations/<ts>_site_documents_management.sql` — metadata columns + `is_system` + seeding.
- Test files under `src/lib/documents/`.

**Modified**
- `src/components/site/SiteDocuments.tsx` — checkbox column, metadata line, row `⋮` menu, bulk bar, category-header `⋮`, system 🔒 badge.
- `src/views/SiteDetail.tsx` — new handlers delegating to the mutation lib; wire `handleBulkDeleteDocumentsInCategory`; pass metadata + `is_system` through; capture metadata on upload.
- `src/components/site/DocumentDialogs.tsx` — multi-file upload + validation; category rename inline.
- `src/lib/pdfDocumentSaver.ts` — set `is_system=true` on report find-or-create; import names from `reportCategories.ts`.
- `src/lib/coc/uploadCocFiles.ts` — set `is_system=true` on COC find-or-create.
- `src/integrations/supabase/types.ts` — regenerate for new columns.

---

## 16. Out of scope / future work
- Storage bucket per-site RLS hardening (F12).
- Orphaned-storage-object cleanup task.
- Removing name-based COC detection in favor of a category-level flag (F8).
- Site-level Activity feed (beyond per-document history).
- Subsection category management from this tab.
