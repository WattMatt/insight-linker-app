# COC Per-Document Capture + Initial→Supplementary Hierarchy — Design Spec

**Date:** 2026-06-12 · **Status:** approved-pending-review · **Owner:** Arno + Claude

**Goal:** Record COC data **per uploaded certificate** (not one verdict per subsection), grouped as an Initial COC with its Supplementary COCs under the applicable DB/tenant (subsection), each with its own Pass/Fail. Show this grouped hierarchy in three places: the subsection COC tab (capture), a site-level view, and the client PDF report.

**Why this exists:** The 2026-06-12 manual-workflow rework ([[coc-manual-workflow]]) collapsed COC to a single verdict per subsection (`subsections.coc_status`), orphaning the richer per-document data. `subsection_documents` already stores `coc_number`, `coc_type` (Initial/Supplementary), `coc_issue_date`, `coc_status` per file (236 docs already carry numbers; `coc_type` already split Initial 168 / Supplementary 48 / Temporary 1). This design restores per-certificate granularity and adds the Initial→Supplementary grouping + roll-up, reusing the existing columns.

---

## Verified current state (prod, 2026-06-12)

- `subsection_documents` columns: `id, subsection_id, category_id, file_name, file_url, file_size, uploaded_at, uploaded_by, coc_number (text), coc_issue_date (date), coc_type (text), coc_status (text)`.
- `coc_type` values: `Initial` 168, `Supplementary` 48, `initial` 10, `Not Marked` 4, `Temporary` 1, else null. **Needs normalization.**
- `coc_status` values: `null` 1452, `rejected` 148, `approved` 70, `pending` 10, `Failed` 5, `Approved` 4. **Needs normalization** to `Pass | Fail | Pending | Missing`.
- COC certificate documents live in categories `01 COC` (591), `01_COC` (105), `COC` (24). **`COC Validation Reports` (8) is NOT a certificate** — exclude it.
- `subsections.coc_status` is read by the compliance gate `apply_subsection_recompute` (a required Fail → `is_compliant=false`). That gate stays; we change only what *feeds* `subsections.coc_status`.

---

## Architecture

### 1. Data model — reuse columns, add one, no new tables

- **Per-certificate facts stay on `subsection_documents`:** `coc_type`, `coc_number`, `coc_issue_date`, `coc_status` (existing) + **add `coc_expiry_date date`** (new). No parent-id column — the hierarchy is `subsection_id` (the DB/tenant group) + `coc_type` (Initial vs Supplementary) + `coc_issue_date` order.
- **Normalize existing values** in the migration:
  - `coc_type`: `initial`→`Initial`; `supplementary`→`Supplementary`; keep `Temporary`; blank/`Not Marked`/null → `Initial` if it is the subsection's only/earliest COC else `Supplementary` (deterministic by `coc_issue_date`/`uploaded_at`).
  - `coc_status`: `approved`/`Approved`/`Pass`→`Pass`; `rejected`/`Failed`/`Fail`→`Fail`; `pending`→`Pending`; null → `Pending` (uploaded, not yet marked).
- **`coc_status` constraint** on `subsection_documents`: `Pass | Fail | Pending | Missing | N/A` (permissive-tolerant during transition, same pattern as the subsection column).
- **`subsections.coc_status` becomes a DERIVED roll-up** (no longer hand-written). Other `subsections.coc_*` columns (`coc_number`, `coc_issue_date`, `coc_expiry_date`, `coc_failure_reasons`, `coc_reviewed_*`) become legacy/unused — left in place (out of scope to remove; avoids churn).

### 2. Roll-up trigger + compliance gate

- **New trigger** `trg_rollup_coc_from_documents` on `subsection_documents` (AFTER INSERT/UPDATE OF coc_status,coc_type,coc_expiry_date,category_id / DELETE) → function `rollup_subsection_coc_status(subsection_id)` that sets `subsections.coc_status` from its certificate documents:
  - gather the subsection's COC certificate docs (category in the COC set, excluding validation-reports);
  - a doc is **failing** if its `coc_status='Fail'`, OR (`coc_status='Pass'` AND `coc_expiry_date < current_date`);
  - **roll-up:** any failing doc → `Fail`; else any `Pass` → `Pass`; else any doc present → `Pending`; else (no docs) → `Missing`.
- The `UPDATE subsections SET coc_status=…` fires the existing `trg_recompute_subsection_defender` → `apply_subsection_recompute` → `is_compliant` (the `pg_trigger_depth()>1` guard prevents deeper recursion). **The gate keeps its existing rule** (required + `coc_status='Fail'` → non-compliant); expiry is now folded into the roll-up, so the gate's own expiry check becomes redundant but harmless — simplify it to key off the rolled-up `Fail` only.
- **Backfill:** run `rollup_subsection_coc_status` for every subsection after normalization so `is_compliant` reflects the per-doc truth.

### 3. Pure shared core — `src/lib/cocHierarchy.ts` (TDD)

Single source of truth used by all three surfaces so they cannot disagree.
- `normalizeCocType(raw): 'Initial'|'Supplementary'|'Temporary'` and `normalizeCocDocStatus(raw): 'Pass'|'Fail'|'Pending'|'Missing'`.
- `cocDocFails(doc, today): boolean` — Fail, or expired Pass (mirrors the DB roll-up exactly).
- `groupCocDocuments(docs): CocGroup[]` — one group per `coc_type` ordering: Initial first, then Supplementaries by `coc_issue_date`; returns `{ initial: CocDoc|null, supplementaries: CocDoc[] }`.
- `rollupStatus(docs, today): 'Pass'|'Fail'|'Pending'|'Missing'` — mirrors the DB roll-up. Unit-tested against the same cases as the SQL.

### 4. Capture UI — subsection COC tab (`CocMeteringTab`)

Replace the single subsection-level `CocReviewForm` with a **per-document COC list**. For each uploaded COC certificate, an inline editable row: **Type** (Initial/Supplementary/Temporary), **COC number**, **issue date**, **expiry date**, **Pass/Fail** verdict — written to that `subsection_documents` row. New uploads default Type = **Initial** if the subsection has no COC yet, else **Supplementary**. Layout shows Initial first with Supplementaries nested beneath (the mockup pattern). `CocReviewForm` (subsection-level) is removed; `cocCompliance.ts`'s `cocFailsGate` is superseded by `cocHierarchy.ts` (remove if unused).

### 5. Site-level view (`SiteDetail`)

A consolidated read-only COC section: every subsection (DB/tenant) on the site as a group — Initial COC + Supplementaries, each with number + Pass/Fail badge, and a per-group roll-up badge (Compliant / Non-compliant / No COC). Built from `cocHierarchy.ts` over the site's `subsection_documents`.

### 6. Client PDF report

Render the same grouped hierarchy into the site/client PDF (extend the existing site-summary report renderer), driven by `cocHierarchy.ts` so the PDF matches the on-screen view exactly.

---

## Rules & edge cases

- **DB/tenant label:** group header = subsection name + `tenant_name` (the mockup's "DB-01 · Shoprite").
- **Not-required subsections** (`is_coc_required=false`): roll-up still displays certs but the gate does not force non-compliant.
- **Multiple Initials:** if data has >1 Initial for a subsection after normalization, the earliest by `coc_issue_date` is the Initial; the rest are shown as Supplementary in the view (data stays as typed; only display orders them). Flagged subtly in the capture tab so staff can correct the type.
- **Temporary** certs are listed under the group like Supplementaries but tagged Temporary; they fail the roll-up the same way (a failing Temporary blocks compliance).

## Out of scope (YAGNI)

- Per-COC failure-reason text + the per-COC PDF report (the report was removed 2026-06-12 at Arno's request).
- A parent-id link column / multi-level supplementary chains (flat Initial→Supplementary only).
- Removing the now-legacy `subsections.coc_number/coc_issue_date/…` columns.
- The `contractor_coc_uploads` contractor-submission inbox (separate flow, untouched).

## Testing

- `cocHierarchy.test.ts` (vitest) — normalization, `cocDocFails` (incl. expired Pass), grouping order (Initial first), and `rollupStatus` for every combination (all-pass, any-fail, expired, pending-only, empty). These mirror the SQL roll-up cases 1:1.
- DB roll-up verified on live data: backfill before/after `is_compliant` counts; a scratch Fail on one supplementary flips its subsection non-compliant, then reverts.

## Build order (sequencing — each stage leaves the app working)

1. `cocHierarchy.ts` + tests (pure, no wiring).
2. DB: add `coc_expiry_date`, normalize, roll-up trigger + function, simplify gate, backfill (via PAT; record schema_migrations row — see [[prod-migration-drift]]).
3. Capture UI in `CocMeteringTab` (per-document rows).
4. Site-level grouped view.
5. Client PDF section.
6. Regenerate `types.ts`; verify.
