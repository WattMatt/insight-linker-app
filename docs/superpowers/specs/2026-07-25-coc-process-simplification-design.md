# COC Process Simplification — "One truth, one pipe"

**Date:** 2026-07-25
**Status:** Approved by Arno (brainstorming session, 2026-07-25)
**Branch:** `feat/coc-register-truth` (off `origin/main`)

## 1. Problem statement

The app has two parallel COC systems that overlap but do not agree:

1. **Register-driven (Site COC tab):** DB Schedule + Verification workbooks are imported per site (`coc_import_batches`, `coc_db_schedule`, `coc_certificates`); uploaded files land in a pool (`coc_file_pool`) and auto-assign by exact cert-number match against the register. Certificate verdicts come from the Verification workbook and are read-only in the app.
2. **Evidence-driven (subsection CoC/Metering tab):** files are uploaded directly to a subsection (`subsection_documents`), default to `Pending`, and require a manual per-document Verdict + row-level Save to affect anything. That status rolls up to `subsections.coc_status` via a DB trigger and gates `is_compliant`.

Consequences found in the process review:

- **Two verdicts of truth that can disagree.** Clients see the imported `coc_certificates.verdict`; internal and contractor views see the rolled-up manual `subsection_documents.coc_status`. Nothing reconciles them.
- **Upload ≠ done.** Matched files still sit at Pending until someone re-enters a verdict the workbook already recorded.
- **Stranded files.** Files whose filename yields no cert number, or whose cert is not in the register, sit in the Assign tab with no in-place fix (the `updateCertNo` helper exists in `useSiteCocPool.ts` but is not wired into any UI).
- **Silent expiry auto-fail.** A hand-typed, optional expiry date flips a Pass to Fail; the register has no expiry concept.
- **Vocabulary sprawl with a live bug.** The flow writes `"Pass"` but contractor-portal badge styling only greens `"Valid"`, so a passing COC renders grey.
- Side-door uploads: direct subsection uploads never appear in the site pool UI.

## 2. Decisions (confirmed with product owner)

| Question | Decision |
|---|---|
| Authoritative source of a COC's Pass/Fail | **The Verification workbook (Excel).** Imported verdicts are final. |
| Files arriving before any workbook covers them | **Does not happen — workbooks always come first.** A non-matching file is an exception/error to flag, never a verdict to invent. |
| Approach | **One truth, one pipe** (consolidate on the register; single ingestion pipeline; delete the manual verdict system). |
| Expiry auto-fail | **Drop it.** Only workbook verdicts set Pass/Fail. Expiry dates, where present, are display-only. Re-verification via new imports invalidates old certs. |
| Existing data | **Full backfill.** Stamp all register-linked docs from their cert verdict; reset unlinked COC docs to Pending / "Awaiting verification". Some subsection statuses will change — accepted. |

## 3. Design

### A. Verdict propagation (data flow)

`subsection_documents.coc_status` stops being user-set. It is stamped from the linked register verdict — mapping `PASS → Pass`, `FAIL → Fail`, `CV`/blank → `Pending` — at three moments:

1. **On assignment:** when a pool file is assigned to a cert (auto via `reassignPendingPoolFiles`/`assignPoolFile`, or manual via the Exceptions queue), the inserted document row takes the cert's verdict instead of hard-coded `Pending` (`src/lib/coc/uploadCocFiles.ts`, `src/lib/coc/assignPoolFile.ts`).
2. **On re-import:** after the existing document re-link step in `useSiteCocImport.ts`, re-stamp every re-linked document from the new batch's verdicts.
3. **One-time backfill migration:** stamp every `subsection_documents` COC row linked to a `coc_certificates` row (via `coc_document_id` / `eval_document_id` or `normCert(coc_number)` match) from that cert's verdict; reset unlinked COC-category docs to `Pending`.

Unchanged and reused as-is: the rollup trigger (`rollup_subsection_coc_status`, any Fail → Fail, else any Pass → Pass, else Pending, none → Missing), the compliance gate on `is_compliant`, `is_coc_required`/N/A semantics, and the exclusion of COC from the health score. All portals inherit consistency by construction; `ClientCocView`'s register remains sourced from `coc_certificates`.

A document with no matching register row displays as **"Awaiting verification"** (status value stays `Pending`).

### B. One ingestion pipe

- **Subsection dropzone stays but routes through the pool.** `CocMeteringTab` upload calls the same pool pipeline as the site-level card: file → `coc_file_pool` → match → assign. If the detected cert matches a register cert on *this* subsection → attaches immediately; matches a cert on a *different* subsection → attaches there and notifies the user; no match → Exceptions queue with this subsection pre-suggested. No more uploads invisible to the site view.
- **Subsection COC list becomes read-only evidence** (`CocCertificateList.tsx`): shows file, cert number, type, issued date and verdict badge from the register (via the linked cert where available, else stored doc fields). Removed: the Verdict dropdown, row-level Save, editable type/number/issue/expiry fields, and the separate eval-verdict selector. Kept: preview, download, delete/replace.
- Metering editing on the CoC/Metering tab is out of scope and unchanged (including its "Save Metering Details" button).

### C. Exceptions queue (Assign tab reframed)

Rename **Assign → Exceptions**. Every failure reason gets an in-place fix:

| Reason | Fix offered |
|---|---|
| No cert number detected | Editable cert-number field (wires the existing `updateCertNo` in `useSiteCocPool.ts`), re-runs matching on save |
| Cert not in register | Same editable field + message "Not in the latest imported register — check the workbook or fix the number" |
| Cert found, shop not matched | "Fix in Schedule" deep link (resolving the shop already re-runs pool assignment via `resolveShop`) |
| Ambiguous cert (multiple subsections) | Candidate subsections (already stored by `planPoolAssignment`) shown as one-click pick buttons instead of the generic dropdown |
| Assignment failed | Retry (existing) |

Also:
- **Pre-import guard:** if the site has no import batch, the pool upload card shows "Import the register first" and the Exceptions tab explains the dependency.
- **Bulk assign reports per-file failures** (filenames), not just a success count.
- The manual full-subsection dropdown remains as last-resort fallback.

### D. Vocabulary and downstream fixes

- Canonical status values: **Pass / Fail / Pending / Missing / N/A**. One shared status-tone helper used by internal, contractor and client surfaces. Legacy values (`Valid`, `Approved`, `Failed`, `Rejected`) remain tolerated on read (as `complianceCalculations.ts` already does) but are no longer written.
- Fixes the contractor-portal bug where `getStatusColor` greens only `"Valid"`/`"Completed"` so a passing COC renders grey (`ContractorSiteDetail.tsx`, `ContractorSubsectionDetail.tsx`).
- Dashboard deliverables (`siteDeliverables.ts`): a recorded Fail currently clears the COC to-do even though the compliance gate still blocks; change to keep a "Review failed COC" action item open. Copy for Pending becomes "awaiting verification" (workbook), not "set verdict".

### E. Expiry

- Remove the expired-Pass → Fail branches from `cocDocFails` (`src/lib/cocHierarchy.ts`) and from the DB rollup/gate functions (`20260612140000_coc_per_document_rollup.sql` logic; superseding migration required).
- `coc_expiry_date` columns are kept for display/history but drive no status.

### F. Backfill migration

One-time SQL migration, deployed with the code that stops manual writes:

1. For each `subsection_documents` row in a COC category linked to a `coc_certificates` row → `coc_status :=` mapped verdict.
2. Unlinked COC-category docs → `coc_status := 'Pending'`.
3. Re-run the rollup for affected subsections (trigger or explicit recompute) so `subsections.coc_status` and `is_compliant` reflect the new truth.

Expected and accepted: subsections whose manual Pass had no register backing will drop to Pending/Missing.

### G. Out of scope

- Health-score composition (COC stays excluded).
- Metering workflow.
- Contractor/client upload rights (staff-only writes stay as per RLS in `20260623120000_coc_client_read_and_leak_fix.sql`).
- The legacy `contractor_coc_uploads` table (anon-locked, unused) — flagged separately for cleanup.
- Report generation content/layout (it now simply reads consistent data).

## 4. Error handling

- Assignment/stamping is idempotent: re-running reassign or re-import re-stamps to the same values.
- Storage-upload-then-insert rollback pattern in `uploadCocFiles.ts` is preserved.
- Import validation and insert-new-then-delete-old batch replacement are unchanged (already safe).
- Per-file error surfacing in bulk operations (Section C).

## 5. Test plan

**Unit (Vitest/Jest, pure TS):**
- Verdict mapping (PASS/FAIL/CV/blank/odd-case → Pass/Fail/Pending).
- Stamping on assign: document row gets cert verdict, not Pending.
- `cocDocFails` no longer fails an expired Pass.
- Exceptions grouping incl. candidate shortlist for ambiguous certs.
- Regression: `complianceCalculations` counts unchanged for Pass/Valid/Approved reads.

**Migration verification (staging/local):**
- Backfill changes only COC-category docs; linked docs match register verdicts; rollup recompute updates `subsections.coc_status` and `is_compliant` consistently.

**Manual E2E (one site):**
1. Import both workbooks → schedule matched, verdicts visible.
2. Drop a batch of PDFs: exact-match file lands on its subsection with the register verdict, no manual step; ambiguous file shows candidate buttons; garbage-named file shows editable cert field, fixing it assigns.
3. Subsection CoC tab shows read-only evidence with correct verdict; no save controls.
4. Contractor portal: passing COC badge renders green; client portal register agrees with internal status for the same cert.
5. Re-import with a changed verdict → document and subsection status follow.

## 6. Diagnostics shipped with first deploy

- Toasts/logs on stamping (n docs stamped per import/assign run).
- Exceptions queue is itself the diagnostic surface for non-matching files (count badge retained).
- Backfill migration logs affected-row counts (NOTICE) for post-deploy verification.
