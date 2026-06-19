# Site COC — upload pool + assign (replaces fragile auto-route)

**Date:** 2026-06-19
**Surface:** Site COC tab
**Status:** Design (approved)
**Supersedes the bulk auto-route flow in:** `2026-06-19-site-coc-central-file-loading-design.md`

## Why
The drop-and-auto-route flow silently dropped files into unmatched/ambiguous/needs-COC buckets
(evidence: 17/25 attached, rest stuck) — opaque and fragile. Two-strike: redesign, not patch.

## Concept (locked with user)
Decouple **upload** from **routing**. Every dropped file uploads immediately to a per-site
**pool** — nothing is ever rejected. Files whose detected cert number **exactly** matches one
register cert (with a subsection) **auto-assign**; everything else stays **pending** in the pool
for manual assignment. Tables highlight what's covered. §8 tradeoff resolved: **reference-in-place**
(no re-upload/copy on assign).

## Data — new table `coc_file_pool` (migration via PAT)
```sql
create table public.coc_file_pool (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size int,
  detected_cert_no text,        -- extractCocNumber(name) normalized for display
  detected_kind text,           -- 'coc' | 'eval' (guess; editable on assign)
  status text not null default 'pending',  -- 'pending' | 'assigned'
  assigned_subsection_id uuid references public.subsections(id) on delete set null,
  assigned_document_id uuid references public.subsection_documents(id) on delete set null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index idx_coc_file_pool_site on public.coc_file_pool(site_id);
-- RLS: authenticated select/insert/update/delete (mirror other coc_* tables).
```
Generated `types.ts` updated.

## Flow

### Upload to pool
Drop files → for each: upload to `documents` bucket at `{siteId}/_pool/{ts}-{sanitized}`, insert a
`coc_file_pool` row with `detected_cert_no = extractCocNumber(name)` and
`detected_kind = classifyCocFile(name)`. Upload always succeeds (no routing decision here).

### Auto-assign (exact only)
After pooling a batch, for each pending file: if `normCert(detected_cert_no)` matches **exactly one**
`coc_certificates` row for the site **with a `subsection_id`**, assign it to that subsection
(see Assign). Otherwise leave `pending`.

### Assign (auto or manual) — `assignPoolFile(poolFile, subsectionId, kind)`
Reference-in-place: insert a `subsection_documents` row pointing at the pool file's existing
`file_url` (no re-upload):
- **COC:** category `01 COC` (find-or-create), `coc_number = detected_cert_no`, `coc_status 'Pending'`.
  Stamp `coc_certificates.coc_document_id` for the matching cert row (site + `cert_no_norm`) if one exists.
- **Eval:** category `07 COC Evaluation Reports`, `parent_document_id` = that subsection's COC doc with
  the same `coc_number` (else null), `coc_status` from `extractEvalVerdict(name) ?? 'Pending'`.
  Stamp `coc_certificates.eval_document_id` if a matching cert row exists.
Then set the pool row `status='assigned'`, `assigned_subsection_id`, `assigned_document_id`.

The shared lib (`uploadCocFiles.ts`) is refactored so the row-insert is separable from the upload:
`insertCocCertificateDoc(...)` / `insertEvaluationReportDoc(...)` (insert from a known file_url) +
`uploadCocCertificate`/`uploadEvaluationReport` (upload File → insert). Pool-assign uses the insert
functions; the per-subsection tab keeps using the upload functions.

### Manual assign + delete
The pool panel lists pending files: filename · detected cert no · **COC/eval toggle** ·
**subsection dropdown** (pre-suggested via the matcher when there's a single contains-match) ·
**Assign** · **Delete** (removes the pool row + its storage blob).

## UI
- `SiteCocLoadCard` repurposed: the dropzone now **uploads to the pool** (+ runs auto-assign), then
  shows the **pool panel** (pending files) instead of the old results/leftover panel.
- **Pool badge:** "N file(s) awaiting assignment."
- **Certificates** sub-tab keeps the Attached (COC ✓ / Eval ✓) column.
- **Schedule** sub-tab: add the same Attached indicators per row so coverage is visible end-to-end.

## What's removed / kept
- **Removed:** the old silent leftover panel (`useSiteCocLoad` results buckets) and the
  drop-then-route-or-fail behavior. `routeUpload.ts` `classifyCocFile`/`extractCocNumber` are **kept**
  (used for the pool's detected-kind/number suggestions + exact auto-assign).
- **Kept:** shared upload lib, `coc_certificates` link columns, the matcher (suggestions/exact only).

## Out of scope (YAGNI)
- Copy-on-assign to restore per-COC storage folder grouping (reference-in-place chosen).
- Bulk multi-select assign in the pool (assign per file; auto handles the clean ones).
- Editing the detected cert number in the pool (assign by picking subsection + kind).

## Testing
- Unit: pool auto-assign selection (exact-one-match → assign; 0 or >1 → pending) as a pure planner
  over `(poolFiles, certRows)`; reuse `classifyCocFile`/`extractCocNumber`.
- Build + suite green. Runtime: drop the YARONA folder → every file appears (pool or assigned),
  exact matches auto-assign, the rest assignable from the pool, tables highlight coverage.

## Deploy
Migration via Management API (PAT), then frontend deploy. Two-strike: verify on real data before
declaring done.
