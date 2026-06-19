# Subsection COC tab — per-COC evaluation reports + COC-number auto-extraction

**Date:** 2026-06-19
**Surface:** Subsection detail → "COC Docs & Metering Data" tab
**Status:** Design (awaiting user review before plan)

## 1. Goal

On the subsection COC tab, support a manual record-keeping workflow where, per subsection,
the user uploads COC certificates (Initial + Supplementary), and **each COC is paired with
an evaluation/verification report**. Both the COC and its evaluation report carry a manual,
editable Pass/Fail verdict. The COC number is auto-extracted from the uploaded file's name
and pre-populated. The COC certificate and its evaluation report are grouped together in a
dedicated storage folder per COC.

This is a manual process — no automated verification engine. The app only stores files,
records verdicts, and keeps things organised.

## 2. Decisions (locked with user)

1. **Two manual verdicts per COC**, each a Pass/Fail/Pending selector, both editable:
   - the COC certificate's own verdict (already exists today), and
   - the evaluation report's verdict (new).
2. **Only the COC verdict gates compliance** (`is_compliant`). The evaluation report is
   **supporting documentation** — recorded but never affecting compliance.
3. **The evaluation report is also a standalone document** — its own `subsection_documents`
   row in its own category, so it appears in the Documents tab and is available to any
   document-driven feature. On the COC tab it is nested under its COC.
4. **COC number auto-extracted from the filename** — capture the letter prefix immediately
   in front of the digit run (not hardcoded to "B"), normalised like `B-1612744`. The field
   stays editable.
5. **Storage: a dedicated folder per COC** holding both the COC file and its evaluation
   report(s): `{subsectionId}/COC/{coc-folder}/…`.

## 3. Current state (verified in code)

- Tab: `src/views/subsection-detail/CocMeteringTab.tsx`; certificate rows:
  `src/components/coc/CocCertificateList.tsx`; grouping lib: `src/lib/cocHierarchy.ts`.
- COC docs live in `subsection_documents` (category `01 COC`); per-doc fields
  `coc_type / coc_number / coc_issue_date / coc_expiry_date / coc_status`.
- Compliance rollup (`rollup_subsection_coc_status`, migration
  `supabase/migrations/20260612140000_coc_per_document_rollup.sql`) classifies docs whose
  category `ILIKE '%coc%' AND NOT ILIKE '%validation%' AND NOT ILIKE '%report%'`. The COC
  verdict on those rows drives `subsections.coc_status` → `apply_subsection_recompute` →
  `is_compliant`.
- The frontend COC list filter mirrors this: `includes('coc') && !includes('validation') && !includes('report')`
  (`useSubsectionDetail.ts:588`).
- Document categories are seeded per subsection (`useSubsectionDetail.ts:96`):
  `01 COC, 02 Manuals, 03 Line Diagram, 04 Metering, 05 Thermal Reports, 06 Other`.
- The Documents tab (`DocumentsTab.tsx:99`) renders every category as an accordion and lists
  docs by `category_id` — a new category surfaces there automatically with no new code.
- COC upload `accept` is `.pdf,.doc,.docx,.jpg,.jpeg,.png` (no HTML). The sample evaluation
  report is `.html`, so the eval upload must additionally allow HTML.

## 4. Data model

### 4.1 Categories
- New per-subsection category **`07 COC Evaluation Reports`**.
  - Name contains "coc" and "report" ⇒ **excluded** from the compliance rollup
    (`NOT ILIKE '%report%'`) and from the frontend COC list (`!includes('report')`). This is
    what keeps eval reports non-gating without any change to the compliance engine.
  - Added to the default seed list (for new subsections) **and** find-or-created on first
    eval upload (for existing subsections that were seeded before this change).

### 4.2 Linking eval report → COC
- New nullable column on `subsection_documents`:
  ```sql
  parent_document_id uuid REFERENCES public.subsection_documents(id) ON DELETE CASCADE
  ```
  An evaluation-report row sets `parent_document_id = <its COC row id>`.
  - **Why FK over coc-number pairing:** an explicit link survives a later edit of the COC
    number and makes deletion unambiguous. (Migration-free alternative: pair by matching
    `coc_number`. Recommendation is the FK; flag at review if you'd rather avoid the migration.)
- The evaluation report's verdict reuses the existing `coc_status` column on its own row
  (Pass/Fail/Pending). No new verdict column. Because the eval row lives in a "report"
  category, this `coc_status` is excluded from the rollup and is record-keeping only.
- `coc_number` on the eval row is set to the same extracted number (useful for the Documents
  tab and search).

### 4.3 Migration
`supabase/migrations/<ts>_coc_evaluation_reports.sql`:
```sql
ALTER TABLE public.subsection_documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid
  REFERENCES public.subsection_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subsection_documents_parent
  ON public.subsection_documents(parent_document_id);

NOTIFY pgrst, 'reload schema';
```
No data backfill required. No change to rollup / recompute functions.

## 5. Storage layout

- Dedicated folder per COC: `{subsectionId}/COC/{cocFolder}/{timestamp}-{sanitizedFileName}`
  where `cocFolder` = the sanitized extracted COC number (e.g. `B-1612744`), falling back to
  the COC's row id when no number is available.
- The COC certificate and all its evaluation reports go in that same folder.
- Bucket unchanged (`documents`, public). `file_url` (public URL) remains the source of truth
  for reads, so existing COCs uploaded under the old `01 COC/` path keep working; only new
  uploads use the per-COC folder.

## 6. COC-number extraction

New pure, unit-tested helper, e.g. `src/lib/cocFilename.ts`:

```
extractCocNumber(fileName: string): string | null
```

Algorithm:
1. Drop the file extension.
2. Strip a leading verdict token `PASS`/`FAIL` (+ separator) if present.
3. Match the first `([A-Za-z]+)[-_ ]?(\d+)` token (letters immediately before digits).
4. Normalise to `PREFIX-DIGITS` (uppercase prefix, hyphen, digits).

Expected results:
- `B-1612744_SHOP-002-SHOPRITE-LIQUOR-SH_I.pdf` → `B-1612744`
- `PASS-B-1612744-SHOP-002-SHOPRITE-LIQUOR-SHOP.html` → `B-1612744`
- `B1612744 - SHOP K4 MZANSI BILLS.pdf` → `B-1612744`
- `something-with-no-number.pdf` → `null`

Optional convenience helper `extractEvalVerdict(fileName)`: returns `'Pass'`/`'Fail'` when the
name begins `PASS-`/`FAIL-`, else `null`. Used only to pre-select the eval verdict selector —
the value stays manually editable. (Flag at review if eval verdict should always default to
Pending.)

On upload, the extracted number pre-populates the editable COC-number field for both COC and
eval uploads.

## 7. UI changes

### 7.1 `CocCertificateList.tsx` (per-COC row)
- Keep current fields (Type / COC number / Issue / Expiry / **COC verdict** — gates compliance).
- Add an **Evaluation report** sub-slot below the COC fields:
  - If a linked eval report exists: show its file name with preview / download / delete, plus
    an **Eval verdict** selector (Pass/Fail/Pending, manual, editable; saved to the eval row's
    `coc_status`).
  - If none yet: an **"Upload evaluation report"** button.
- Pair eval reports to each COC via `parent_document_id`.

### 7.2 `CocMeteringTab.tsx`
- COC upload: after extracting the number, store it on the inserted COC row (`coc_number`) and
  upload the file to the per-COC folder.
- Provide the eval category (find-or-create) and the eval upload handler to the list.
- Eval upload `accept`: `.html,.pdf,.doc,.docx,.jpg,.jpeg,.png` (and matching MIME allow-list
  incl. `text/html`).

### 7.3 `DocumentsTab.tsx`
- No code change. The `07 COC Evaluation Reports` category appears automatically.

### 7.4 `useSubsectionDetail.ts`
- `fetchSupabaseDocuments` select: add `parent_document_id`.
- Add `07 COC Evaluation Reports` to the default seed list.
- Add a find-or-create helper for the eval category.
- Add an eval-report upload handler (storage → insert row with `category_id` = eval category,
  `parent_document_id` = COC id, `coc_number` = extracted, `coc_status` = chosen/derived verdict).
- Extend the COC delete handler: before deleting a COC, remove its child eval reports' storage
  blobs; the FK cascade removes their rows. (The COC's own storage blob + row deletion is
  unchanged; the shared parent-mounted delete dialog stays.)

### 7.5 `types.ts`
- Add `parent_document_id?: string | null` to `SupabaseDocument`.

## 8. Compliance behavior

Unchanged and verified: only `01 COC`-category rows feed the rollup; the eval category is
excluded by the `%report%` filter. `is_compliant` continues to be driven solely by the COC
verdict (plus the existing installation/metering logic).

## 9. Out of scope (YAGNI)

- Wiring evaluation reports into generated PDF report appendices. Making them standalone docs
  *enables* this later; no report code is changed in this work.
- Migrating existing COC files into per-COC folders.

## 10. Testing plan

- Unit: `extractCocNumber` and `extractEvalVerdict` across the sample filenames + null cases.
- Unit: eval reports are excluded from COC roll-up classification (category-filter predicate).
- Manual runtime verify on the tab:
  1. Upload `B-1612744_…_I.pdf` → COC number auto-fills `B-1612744`, row appears as Initial.
  2. Upload `PASS-B-1612744-….html` as its eval report → nests under the COC, verdict
     pre-selects Pass, editable; appears in Documents tab under `07 COC Evaluation Reports`.
  3. Both files live in `…/COC/B-1612744/` in the bucket.
  4. Set COC verdict Fail → subsection non-compliant; set eval verdict Fail → no compliance
     change.
  5. Delete the COC → its eval report (row + storage blob) is removed too.

## 11. Deployment notes

- DB: apply the migration to prod via the Supabase Management API SQL endpoint (not
  `db push`), per known prod-migration drift. One column + index + schema reload.
- Frontend: standard Vercel deploy of `insight-linker-app`.

## 12. Open items for review

1. Confirm `parent_document_id` FK vs migration-free coc-number pairing.
2. Confirm eval-verdict pre-fill from `PASS-`/`FAIL-` filename prefix (vs always Pending).
3. Confirm category name `07 COC Evaluation Reports`.
