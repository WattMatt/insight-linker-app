# COC Validation/Review Strip-Out — Tracked Inventory

**Created:** 2026-06-12. **Status:** ✅ COMPLETE + DEPLOYED 2026-06-12 (main @ 96b746c). Validation engine fully removed; manual COC verdict gates is_compliant; 9 tables dropped; edge fns deleted; G-SEC-16 dissolved. Plus removed the dependent ValidationFeedback cluster (validation_feedback/conversations/messages) exposed by the FK CASCADE.
**Goal:** remove the entire COC *auto-validation + review/approval/extraction* engine. Keep COC as a **manual** record (upload + Pass/Fail verdict + failure report). See `specs/2026-06-11-coc-manual-workflow-design.md` + `plans/2026-06-11-coc-manual-workflow.md`.

**Two groups — do not conflate:**
- **STRIP** = the validation engine, AI extraction, review/approve/violation-override UI, validation tables.
- **KEEP** = `coc_status` / `coc_number` / dates as a simple manual field, shown in lists/filters/KPIs/PDF. These keep working with a hand-entered verdict.

All facts below VERIFIED against the codebase and prod DB on 2026-06-12 (not from prior notes — prior notes undercounted the tables).

---

## A. STRIP — Edge functions (delete whole)
- [ ] `supabase/functions/validate-coc/` (index.ts 1813 lines + prompt.ts) — SANS-10142 deterministic validation engine. Writes `coc_status='Approved'/'Failed'` at ~index.ts:1565,1635. **DEPLOYED live.**
- [ ] `supabase/functions/extract-coc/` (index.ts 1382 lines) — AI extraction of COC fields from images. **DEPLOYED live.**
- [ ] Undeploy both from prod (`supabase functions delete validate-coc extract-coc --project-ref oltzgidkjxwsukvkomof`).

## B. STRIP — Dedicated UI components (delete whole)
- [ ] `src/components/COCPreviewApproval.tsx` (2208) — review & approve dialog; invokes extract-coc (335,409,449)
- [ ] `src/components/COCPreviewDialog.tsx` (649) — extracted-data preview
- [ ] `src/components/COCReviewStatus.tsx` (286) — review-state badge
- [ ] `src/components/compliance/COCValidationLogCard.tsx` (502) — validation history + **"Review COC" button (line 483)**
- [ ] `src/components/compliance/InlineViolationOverrides.tsx` (273) — override failed validations; writes `coc_validations` (89-90,121-122)
- [ ] `src/lib/complianceCalculations.ts` (181) — validation-driven compliance calc; queries `coc_validations`

## C. STRIP — Review/validation logic mixed into kept files (surgical)
- [ ] `src/components/ComplianceDashboard.tsx` — **this is the "Compliance tab" mounted at `SiteDetail.tsx:656`**. Remove: COC imports (42-44), review state (155-159), `handleReviewCoc` (243), extract-coc invoke (293), validate-coc invoke (370), legacy `coc_status='Approved'/'Failed'` write (390-392), realtime validation subscription (438), render of dialog/log-card (923,939-969,701 gate). Decide: does the whole dashboard go, or just the COC parts? (It also shows non-COC compliance.)
- [ ] `src/views/subsection-detail/CocMeteringTab.tsx` (606) — **second "Review COC" button (198)** + extract/validate. Replace with the manual `CocReviewForm` (plan Task 3), keep the metering half.
- [ ] `src/views/subsection-detail/useSubsectionDetail.ts` — remove validate-coc (563,865) + extract-coc (710) invokes and legacy `coc_status='Approved'/'Failed'` writes (253,607-608,772,791,909). Keep loading/saving the manual `coc_status`.
- [ ] `src/views/subsection-detail/SubsectionDialogs.tsx` (7-8) — remove COCPreviewApproval/Dialog imports + render.
- [ ] `src/views/SiteDetail.tsx:424,656` — remove failed-validation fetch + decide ComplianceDashboard fate.
- [ ] `src/components/site/GenerateFinalReportButton.tsx:141,197` — drops "latest validation per subsection" logic; switch to manual `coc_status`.

## D. KEEP (display of manual coc_status) — audit each, edit only if it reads validation tables
`SubsectionList.tsx`, `SubsectionFilters.tsx`, `SiteOverview.tsx`, `GlobalSearch.tsx`/`useGlobalSearch.ts`, `Dashboard.tsx`, `ContractorPortal.tsx`, `ContractorSiteDetail.tsx`, `ContractorSubsectionDetail.tsx`, all `settings/preview-renderers/*`, `PDFTemplateManager.tsx`, `PDFWYSIWYGEditor.tsx`, `SiteSummaryReport.tsx`, `pdf*` lib renderers, `siteHealth.ts`, `types/site.ts`, `subsection-detail/types.ts`, offline DB/photo hooks. → These reference `coc_status` for display; they STAY but must not call validation tables/edge fns. (~50 files — most are no-change once the engine is gone.)

## E. STRIP — Database (prod, VERIFIED 2026-06-12)
Tables LIKE `coc%` and live row counts:
- [ ] `coc_validations` — **239 rows** ⚠ data
- [ ] `coc_extractions` — **53 rows** ⚠ data
- [ ] `coc_validation_settings` — 1 row
- [ ] `coc_local_validations` — 0 rows (68 cols)
- [ ] `coc_compliance_photos` — 0 rows
- [ ] `coc_compliance_photos_snap_20260421` — 0 rows (snapshot)
- [ ] Housekeeping triggers `update_coc_*_updated_at` drop with their tables.
- [ ] **DECISION:** `trg_sync_coc_compliance` → `sync_coc_compliance_status` on `subsections` (from migration 160000). If COC verdict is **informational**, DROP this trigger — `is_compliant` stays owned by the inspection-driven `trg_recompute_from_subsections_defender`. (See `coc-manual-workflow` memory.)
- [ ] KEEP columns on `subsections`: `coc_status, coc_number, coc_issue_date, coc_expiry_date, coc_failure_reasons, coc_reviewed_by, coc_reviewed_at, is_coc_required`. KEEP `subsection_documents.coc_*`.
- [ ] ⚠ `coc_validations`/`coc_extractions` hold real data → snapshot before DROP (pattern already used: `*_snap_YYYYMMDD`).

## F. Other edge fns that READ coc (KEEP — they only read coc_status for reports)
`api-reports`, `templates`, `generate-pdf` reference `coc` — confirm read-only, leave intact.

## G. Replacement (manual workflow)
- [x] `cocCompliance` helper (TDD)
- [x] `CocReviewForm` — upload + Pass/Fail + COC number + issue/expiry + failure reasons
- [x] ~~per-COC failure report (`cocReport.ts`)~~ — **REMOVED 2026-06-12 per Arno:** the "Download COC report" button + `cocReport.ts` were deleted (report deliverable dropped). COC card now shows verdict + form only.
- [x] Regenerate `src/integrations/supabase/types.ts` after table drops.

---

**Order matters:** build G (manual replacement) BEFORE removing the C/B review UI, so COC capture never has a dead gap. Then strip A/B/C, then E (snapshot→drop), then types regen + verify.
