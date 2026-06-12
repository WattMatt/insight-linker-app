# COC Manual Workflow — Design Spec

**Date:** 2026-06-11 · **Status:** approved-pending-review · **Owner:** Arno + Claude
**Branch:** `feature/coc-manual-workflow`

## 1. Problem / goal

The current COC (Certificate of Compliance) flow is a heavy automated pipeline: AI extraction
(`extract-coc`, Gemini) → a deterministic SANS 10142-1 validation engine (`validate-coc` + tunable
thresholds in `coc_validation_settings`) → `coc_validations` → a trigger sets `subsections.is_compliant`.
It is complex, can be **gamed** (GAPS G-SEC-16 — request-body thresholds can force a Pass), and Arno
wants it gone.

**Replace it with a simple manual workflow:** upload the COC document → a human records a **Pass/Fail
verdict** + the COC's number and dates → **if Fail, capture the failing items and generate a report**.
The verdict drives the subsection's COC status and `is_compliant`.

**Non-goals:** re-creating any automated validation; per-item SANS checking; COC version history.
The failure "items" are **free-text** (decided 2026-06-11: keep it simple), not a structured checklist.

## 2. The flow (approved)

1. **Upload** the COC document — unchanged: a file in `subsection_documents` (COC category).
2. **Mark it** at/after upload — the uploader records: **verdict** (`Pass` / `Fail`), **COC number**,
   **issue date**, **expiry date**, and (if Fail) **failure reasons** (free-text). **Staff can override**
   any of these later (gated by the staff RLS predicate, same as other admin-config writes).
3. **If Fail** → an **accompanying PDF report** is generated: COC number, issue/expiry dates, the verdict,
   and the listed failure reasons. Generated through the existing PDF pipeline, downloadable/savable.
4. The verdict becomes `subsections.coc_status`; `is_compliant` derives from it.

## 3. Data model changes

The COC state stays **per-subsection** (one current COC per subsection, matching today's model). The
COC file remains a row in `subsection_documents`.

**`subsections`** — already has `coc_status`, `coc_number`, `coc_issue_date`, `coc_type`,
`is_coc_required`, `is_compliant`. Add:
- `coc_expiry_date date NULL`
- `coc_failure_reasons text NULL` (free-text, only meaningful when `coc_status = 'Fail'`)
- `coc_reviewed_by uuid NULL` (the user who set/overrode the verdict)
- `coc_reviewed_at timestamptz NULL`

**`coc_status` vocabulary** — collapse the current messy set
(`Missing/Pending/Approved/Valid/Pass/Failed/Rejected`) to a clear one with a CHECK:
`'Missing'` (no COC), `'Pending'` (uploaded, not yet reviewed), `'Pass'`, `'Fail'`, `'N/A'` (not required).
Migration maps: `Approved|Valid|Pass → Pass`, `Failed|Rejected → Fail`, others unchanged.

**Compliance trigger** — replace `sync_coc_compliance_status` body with:
```sql
is_compliant := (NOT COALESCE(is_coc_required, false))
  OR (coc_status = 'Pass'
      AND (coc_expiry_date IS NULL OR coc_expiry_date >= current_date));
```
Trigger fires on INSERT/UPDATE of `coc_status` / `is_coc_required` / `coc_expiry_date`.

**Tables to DROP** (after data migration): `coc_validations`, `coc_extractions`,
`coc_validation_settings`, `coc_local_validations`. **Keep:** `coc_compliance_photos` (evidence photos),
`contractor_coc_uploads` (the upload table; now anon-locked per G-SEC-11).

**Data migration:** `coc_status` is already populated (the old trigger kept it in sync), so the main
work is the vocabulary remap above + adding the new nullable columns (existing rows get NULL
expiry/reasons). Then drop the 4 validation tables.

## 4. What gets removed (code)

- **Edge functions:** delete `validate-coc` and `extract-coc` from prod (via PAT) and the repo. (They
  were on the G-SEC-12 list; removing them closes G-SEC-16 and the extract-coc SSRF entirely.)
- **UI:** remove `src/components/compliance/InlineViolationOverrides.tsx`,
  `src/components/compliance/COCValidationLogCard.tsx`, the COC validation-settings screen, and strip the
  AI-extraction + validation guts out of `COCPreviewApproval.tsx` (2,209 lines) — replace with a focused
  **COC review form** (upload + verdict + number/dates + failure-reasons). Keep the COC card + upload.
- **lib:** remove COC-validation helpers no longer referenced. `complianceCalculations.calculateCocComplianceStats`
  stays (the COC informational card still shows pass/required counts) but reads the manual `coc_status`.
- **Settings:** remove the `coc_validation_settings` management UI from Settings.

## 5. New / changed components

- **`CocReviewForm`** (new, focused) — verdict radio (Pass/Fail), COC number, issue date, expiry date,
  failure-reasons textarea (shown when Fail), Save. Writes the subsection COC fields + `coc_reviewed_by/at`.
  Replaces the auto-validation UI in the subsection COC area.
- **COC card** — shows verdict, number, issue/expiry, an "expired/expiring" flag, and a **"COC report"**
  button (enabled when there's a verdict; emphasised on Fail).
- **COC report generator** — a small renderer (reuse the existing pdf pipeline, e.g. `pdfmake`/the
  client renderers) producing the per-COC PDF (number, dates, verdict, reasons). One focused module.

## 6. Marking / compliance interaction

This builds on the Site-Health redesign (separate branch) where COC is already **out of the operational
health score** and shown as its own card. Here, the COC card's status = the manual verdict, and
`is_compliant` (the legal flag) derives from §3. No change to the health score.

## 7. Error handling / edge cases

- Verdict `Fail` with empty reasons → allowed, but the report shows "No reasons recorded" and the UI
  nudges the reviewer to add them.
- Expiry date in the past → `is_compliant = false` even if verdict is Pass (expired COC).
- No COC uploaded but `is_coc_required` → `coc_status = 'Missing'`, not compliant.
- Staff override writes are gated by the staff RLS predicate (Admin/User, not Contractor/Client) — same
  as the admin-config lockdown already applied to prod.

## 8. Testing

- Unit tests (vitest) for the compliance derivation (`is_compliant` from `coc_status` + expiry) extracted
  into a pure helper, mirroring `siteHealth.ts`: Pass+future-expiry → compliant; Pass+past-expiry → not;
  Fail → not; not-required → compliant; Missing → not.
- Migration verification: post-migration `coc_status` ∈ the new allowed set; row counts preserved; a spot
  Pass and a spot Fail.
- Manual: upload → mark Fail with reasons → report renders the reasons; staff override flips Pass↔Fail.

## 9. Open items for planning
- Confirm the exact current `subsections` COC columns against the live schema before the migration (use
  the PAT / `types.ts`), since prod has drifted (G-OPS-01).
- Decide the report renderer (reuse `pdfmakeInspectionReport` patterns vs a small standalone) during planning.
- Sequence: DB migration + trigger first (behind the existing UI), then the new review form, then remove
  the old engine/UI, then the report — so the app stays working at each step.
