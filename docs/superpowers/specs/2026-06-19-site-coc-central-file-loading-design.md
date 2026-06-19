# Site COC — centralised file loading (bulk auto-route)

**Date:** 2026-06-19
**Surface:** Site detail → **Site COC** tab
**Status:** Design (awaiting user review before plan)
**Builds on:** `2026-06-19-site-coc-system-design.md` (imported `coc_certificates`) + the per-subsection
COC documents/evaluation-reports feature (`subsection_documents`, categories `01 COC` /
`07 COC Evaluation Reports`, per-COC storage folders, `parent_document_id`).

## 1. Goal

Let the user load the actual COC certificate files **and** their evaluation reports from the Site
COC tab in bulk, instead of navigating into each subsection. The imported schedule
(`coc_certificates`) is the routing map: each row already knows the cert number → shop →
subsection. A dropped file is matched to its row by the COC number in its filename and routed into
the matched subsection's COC document store — so files flow into the per-subsection COC tab and
drive compliance (single source of truth).

## 2. Decisions (locked with user)

1. **Route into the subsection** — uploaded files land in the matched subsection's
   `subsection_documents` (same store as the per-subsection tab), not a site-only store.
2. **Bulk drop + auto-route** by the COC number in the filename; unmatched/ambiguous files are
   listed for a manual assign-to-shop fallback.
3. **COC + evaluation report** — both supported, paired like the per-subsection tab.

## 3. Dependencies / premise

- The site's **schedule must be imported first** (`coc_certificates` rows with `subsection_id`
  set) — that is the routing map. Cert rows that are `unmatched` (no subsection) cannot be routed.
- Reuses the per-subsection storage model: bucket `documents`, per-COC folder
  `{subsectionId}/COC/{coc-number}/…`, COC category `01 COC`, eval category
  `07 COC Evaluation Reports` (find-or-create per subsection), eval paired to COC via
  `parent_document_id`.

## 4. Flow (per dropped file)

1. **Classify** — `classifyCocFile(fileName)`: leading `PASS-`/`FAIL-` token **or** `.html`/`.htm`
   extension ⇒ `eval`; otherwise ⇒ `coc`.
2. **Extract** the COC number — `extractCocNumber(fileName)` (existing helper).
3. **Match** `normCert(number)` against this site's `coc_certificates.cert_no_norm` where
   `subsection_id is not null`:
   - exactly one → **routed** (gives `subsection_id`, cert row id, cert type);
   - none → **unmatched**;
   - more than one → **ambiguous**.
4. **Order** — plan/execute all `coc` files first, then `eval` files, so an evaluation report can
   pair to a COC loaded in the same batch.
5. **Route**:
   - **COC** → `uploadCocCertificate` into the matched subsection (`01 COC`, per-COC folder,
     `coc_number` filled, `coc_status: 'Pending'`). Stamp `coc_certificates.coc_document_id`.
   - **Eval** → find the COC `subsection_documents` row for that subsection + cert number (from this
     batch or already attached). If found → `uploadEvaluationReport` paired via
     `parent_document_id`, verdict pre-filled from the `PASS-`/`FAIL-` prefix; stamp
     `coc_certificates.eval_document_id`. If no COC present → **needs-COC** (not force-attached).
6. **Report** — a results panel: counts (routed / unmatched / ambiguous / needs-COC) + the leftover
   list with a manual **assign-to-shop** action (pick a subsection; routes that one file).

The import's per-cert `verdict` (the imported assessment) is unchanged and does **not** become the
routed COC's manual verdict (stays `Pending`, consistent with the per-subsection model).

## 5. Schema (small migration, via PAT)

Add to `public.coc_certificates`:
```sql
alter table public.coc_certificates
  add column if not exists coc_document_id uuid references public.subsection_documents(id) on delete set null,
  add column if not exists eval_document_id uuid references public.subsection_documents(id) on delete set null;
```
These record what's attached so the tab shows status and can open the file without fuzzy matching.
`on delete set null` so deleting the underlying document (in the subsection) clears the link
cleanly. Generated `types.ts` updated for the two columns.

## 6. Shared upload lib (DRY)

Extract the per-subsection upload logic (currently inline in
`src/views/subsection-detail/CocMeteringTab.tsx` and `handleUploadEvaluationReport` in
`useSubsectionDetail.ts`) into `src/lib/coc/uploadCocFiles.ts`:

- `uploadCocCertificate({ subsectionId, cocCategoryId, file }): Promise<{ id: string }>` — extracts
  number, uploads to the per-COC folder, inserts the `01 COC` `subsection_documents` row
  (`coc_number`, `coc_status: 'Pending'`), removes the blob on insert failure.
- `uploadEvaluationReport({ subsectionId, evalCategoryId, parentCocId, parentCocNumber, file }):
  Promise<{ id: string }>` — uploads to the parent COC's folder, inserts the eval row
  (`parent_document_id`, verdict from filename prefix), removes blob on failure.
- A `findOrCreateCategory(subsectionId, name)` helper (the per-subsection `ensureEvaluationCategory`
  generalised) for `01 COC` / `07 COC Evaluation Reports`.

Both the per-subsection tab and the new site uploader call these — one code path, no drift.
Per-subsection behaviour is preserved (the helper does exactly what the inline code did);
re-verified by build + the existing tests.

## 7. Routing engine

- **Pure** `planRouting(files: {name: string}[], certRows: CertRowLite[]): RoutePlanItem[]` where
  `RoutePlanItem = { name, kind: 'coc'|'eval', certNo: string|null, subsectionId: string|null,
  certRowId: string|null, status: 'routed'|'unmatched'|'ambiguous' }`. COCs ordered before evals.
  `CertRowLite = { id, cert_no_norm, subsection_id }`. Unit-tested.
- **Impure** executor consumes the plan, calls the shared lib, builds a subsection+cert →
  cocDocId map as COCs upload, pairs evals, stamps the link columns, and returns a summary.

## 8. UI

- **Dropzone** at the top of the Site COC tab (beside Import): "Load COC files & evaluation
  reports" — accepts multiple `.pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm`. On drop, run the plan +
  executor; show progress, then the **results panel**.
- **Results panel** — routed / unmatched / ambiguous / needs-COC counts; leftover files listed with
  a per-file **assign-to-shop** select (subsections of this site) that routes that single file.
- **Certificates sub-tab** gains an **Attached** column: `COC ✓` / `Eval ✓` pills (from the link
  columns), each opening a preview; empty when nothing attached.

## 9. Out of scope (YAGNI)

- Per-row "upload" buttons on every cert row (user chose bulk; assign-to-shop covers leftovers).
- Deduplication of re-dropped files (re-drop re-links to the newest; prior file remains in the
  subsection and is managed there).
- Editing the routed COC's manual verdict from the site tab (done per-subsection as today).

## 10. Testing

- Unit: `classifyCocFile` (PASS-/FAIL-/.html ⇒ eval; pdf ⇒ coc), `planRouting` (routed / unmatched /
  ambiguous; COC-before-eval ordering).
- Build + existing suite green (confirms the per-subsection refactor preserved behaviour).
- Manual runtime: drop the YARONA COC PDFs + eval reports on a site whose schedule is imported →
  routed counts correct; files appear in the right subsections' COC tabs; Attached column reflects
  it; leftovers assignable.

## 11. Phasing

1. Schema (link columns) + shared upload lib + classify/plan (pure, tested).
2. Dropzone UI + executor + results panel + Attached column.

## 12. Open items for review
1. Confirm the two link columns on `coc_certificates`.
2. Confirm classification rule (PASS-/FAIL-/.html ⇒ evaluation report).
3. Confirm extracting the per-subsection upload into a shared lib (light refactor of the existing
   per-subsection tab).
