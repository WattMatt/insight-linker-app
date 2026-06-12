# Existing-Docs Audit — Part 2 of 3

**Charter:** grade each pre-existing doc against code ground truth. Nothing assumed; every grade
cites a file/migration or an earlier system-reference chapter. Part 2 covers the **second third** of
the 23 non-`system-reference` `.md` docs (alphabetical by path, items 9–16).

**Method.** `find docs -maxdepth 2 -name '*.md' -not -path '*/system-reference/*' | sort` → 23 docs →
thirds of 8/8/7. This file = items 9–16.

**Grades:** ACCURATE · PARTLY-STALE · SUPERSEDED · ASPIRATIONAL (a plan/roadmap describing intended,
not-yet-built state — graded on whether its *premises* still hold, not on completion).

**MAP used (system-reference chapters cross-checked):**
[`06-flows/pdf-report-pipeline.md`](../06-flows/pdf-report-pipeline.md),
[`06-flows/templates.md`](../06-flows/templates.md),
[`02-data-model/tables-03.md`](../02-data-model/tables-03.md),
[`02-data-model/rls-policies-03.md`](../02-data-model/rls-policies-03.md),
[`05-edge-functions/pdf-generation.md`](../05-edge-functions/pdf-generation.md),
[`05-edge-functions/coc-and-templates.md`](../05-edge-functions/coc-and-templates.md),
[`GAPS.md`](../GAPS.md).

---

## Scoreboard (this third)

| # | Doc | Grade |
|---|-----|-------|
| 9 | `INSPECTION_TEMPLATES.md` | **ACCURATE** (with one editor-vs-data caveat) |
| 10 | `PARITY_GAP_ANALYSIS.md` | **PARTLY-STALE** (a CRITICAL premise is now false) |
| 11 | `PDF_GENERATION_ROADMAP.md` | **ASPIRATIONAL → PARTLY-STALE** |
| 12 | `PDF_LAYOUT_STANDARDS.md` | **PARTLY-STALE** |
| 13 | `PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md` | **ASPIRATIONAL / PARTLY-STALE** |
| 14 | `SITE_SUMMARY_REPORT_REVIEW.md` | **ASPIRATIONAL** (design wishlist; partially implemented) |
| 15 | `WEB_PARITY_PLAN.md` | **ASPIRATIONAL → PARTLY-STALE** (same broken premise as #10) |
| 16 | `incidents/2026-04-22-orphaned-inspections.md` | **ACCURATE** (historical; paths reorganised since) |

**Cross-cutting stale fact (affects #10, #11, #13, #15):** every PDF doc that lists report-generator
"integration status" predates the floor-plan + asset-verification generators being wired to the
template gateway. They now **do** call `fetchPDFTemplate` (`floorPlanReportGenerator.ts:79`,
`assetVerificationReportGenerator.ts:146/472`), matching `06-flows/pdf-report-pipeline.md:54-55`. The
"only Site Summary integrated / others 🔴 Not integrated" tables are stale.

**Cross-cutting stale fact #2 (affects #10, #15, #16):** the codebase moved `src/pages/*` →
`src/views/*`. Docs citing `src/pages/SiteDetail.tsx`, `src/pages/Inspections.tsx`, `src/pages/Calendar.tsx`
point at paths that no longer exist (`ls src/pages` → absent; files now at `src/views/SiteDetail.tsx`,
`src/views/Inspections.tsx`).

---

## 9. `INSPECTION_TEMPLATES.md` — **ACCURATE**

**What it claims.** A complete reference for "all 26 inspection templates" — names, categories, section
counts, per-field tables, plus an appendix mapping the 6 `pdf_report_templates` types.

**Basis (verified):**
- **The 26 template names are real and migration-grounded.** The names in the summary table match the
  seeded rows exactly. `grep` of seed migrations
  (`20251014161057`, `20251014161831` [8 INSERTs], `20251014162009` [3 INSERTs], `20251016030509`)
  yields exactly the 26 distinct names listed (Electrical Meter Inspection Report … Site Drawing
  Inspection). Cross-ref `06-flows/templates.md` System 1.
- **The field-type values in the per-template tables match the seeded JSONB.** Counting `"type"` values
  across the four seed migrations: `checklist` ×211, `text` ×33, `number` ×33, `select` ×28,
  `textarea` ×21, `image` ×19, `boolean` ×13, `date` ×2, `rating` ×1 — i.e. all 9 documented types
  actually occur in the data, with `checklist` dominant exactly as the doc shows.
- The PDF-report-templates appendix (`site_summary`/`inspection`/`floor_plan`/`asset_verification`/
  `compliance`/`coc_validation` with accent colours) matches `usePDFTemplateGateway.ts` `DEFAULT_TEMPLATES`
  and the 5 seeded rows of `pdf_report_templates` (migration `20260110132516`, per
  `06-flows/templates.md:209`). Note: 6 types are listed but only 5 rows are seeded — `coc_validation`
  exists in code defaults, not as a seeded DB row (consistent, not an error).

**What's stale / caveat (does not change the grade):**
- **Editor cannot reproduce the seeded field types.** The in-app builder offers only **6** types —
  `text|textarea|number|image|checkbox|select` (`src/components/TemplateBuilder.tsx:17,62-67`). The
  dominant seeded type `checklist` (and `boolean`/`date`/`rating`) is **not selectable** in the
  builder; it renders the `checkbox` label as "Checkbox (Pass/Fail)". So the doc accurately describes
  the *seeded data* but a reader should not infer those types are user-authorable. The richer
  `checklist|…|signature` union appears only in the read-side preview renderer
  (`src/components/settings/preview-renderers/InspectionTemplatePreview.tsx:29`).
- Section/page counts (e.g. "Sections: 4 | Pages: 6") were not re-counted field-by-field against each
  seeded `sections` array — ⚠️ UNVERIFIED at that granularity, but the spot-checked names/types hold.

**Verdict:** content-reference doc, faithful to migration-seeded data. **ACCURATE.**

---

## 10. `PARITY_GAP_ANALYSIS.md` — **PARTLY-STALE**

**What it claims.** A 34-dimension web↔iOS gap analysis (dated 2026-05-25), prioritised ADD/REALIGN
list, root-cause analysis, closure strategies, roadmap. Pipeline input to `WEB_PARITY_PLAN.md`.

**Basis / what still holds:**
- The web-only differentiator table (§2) maps cleanly to tables documented in `02-data-model/`
  (api_*, client_access_links, validation_*, pdf_report_templates, etc.) — structurally sound.
- `offlineDB.ts` vs `offlineInspectionDB.ts` drift (RE-6) is **still real** — both files present
  (`src/lib/offlineDB.ts`, `src/lib/offlineInspectionDB.ts`), un-consolidated.

**What's stale / wrong:**
- **CRITICAL premise broken — `inspection_items` is NOT a zero-reader orphan.** Dimensions #7/#9 and
  RE-1 assert the table is queried "0 explicit"/"0× on web" and is safe to drop. Two live readers exist
  today: `src/views/SiteDetail.tsx:364` and `src/views/subsection-detail/useSubsectionDetail.ts:1053`
  (both `.from('inspection_items').delete()...` in subsection-teardown). The headline architectural
  decision (RE-1: drop the table) rests on a now-false grep result. ⚠️ These are DELETEs in cascade
  cleanup, not SELECTs, but they are real `.from()` references that would break on a table drop.
- **Path drift:** §uses `src/pages/*`-era assumptions inherited from `AUDIT_BASELINE`; current tree is
  `src/views/*` (no `src/pages/` dir).
- It is a **planning snapshot**, not a state record — none of its ADD/RE work has shipped (see #15 for
  the build-status evidence). Read it as intent, not current state.
- Depends on an external `DATABASE_MAP.md` (in a sibling `ECompliance 2` repo) not present here, so all
  iOS-side coverage numbers and D-series drift items are ⚠️ UNVERIFIED from this repo.

**Verdict:** analytically structured and mostly still directionally valid, but the load-bearing RE-1
premise is factually stale. **PARTLY-STALE.**

---

## 11. `PDF_GENERATION_ROADMAP.md` — **ASPIRATIONAL → PARTLY-STALE**

**What it claims.** A 5-phase, 8-week roadmap (dated 2026-01-17, "Author: Lovable AI") to make
`pdf_report_templates` the "SINGLE SOURCE OF TRUTH" that every generator MUST fetch. Includes a
generator-integration status table and per-report task lists.

**Basis / what holds:**
- The infrastructure-complete table is broadly right: `pdfMakeConfig.ts`, `pdfMakeUtils.ts`,
  `pdfEngine.ts`, `documentDesignStandards.ts`, `PDFWYSIWYGEditor.tsx`, `PDFTemplateManager.tsx`,
  `usePDFTemplateGateway.ts` all exist (verified by `ls`). The hook's documented return shape
  (`customization`, `enabledSections`, `accentColors`, `isSectionEnabled`, `getSectionTitle`) matches
  `src/hooks/usePDFTemplateGateway.ts:204-209,289-339`.
- Correctly names the live hook as `usePDFTemplateGateway` (the older gatekeeper doc #13 mis-names it
  `usePDFTemplate`).

**What's stale:**
- **Generator-integration status table is out of date.** It marks Floor Plan and Asset Verification
  "🔴 Needs integration". Both are now integrated — they call `fetchPDFTemplate('floor_plan')`
  (`floorPlanReportGenerator.ts:79`) and `fetchPDFTemplate('asset_verification')`
  (`assetVerificationReportGenerator.ts:146,472`). Matches `06-flows/pdf-report-pipeline.md:54-55`.
- **`cocValidationPdfGenerator.ts` does not exist.** Listed as a file to modify and a "🔴 Needs
  integration" generator; `ls src/lib/cocValidationPdfGenerator.ts` → not found. The `coc_validation`
  report path was never created (consistent with `06-flows/pdf-report-pipeline.md:58` "no
  `cocValidationPdfGenerator.ts` file exists").
- **`ComprehensiveInspectionReport.tsx`** exists (`src/components/ComprehensiveInspectionReport.tsx`)
  but the roadmap's `comprehensive_inspection` template type is not among the seeded/default types.
- The "100% template coverage / MUST fetch" success criterion is **not enforced** anywhere — the gateway
  is fail-open to hard-coded `DEFAULT_TEMPLATES` (`usePDFTemplateGateway.ts:401-419`; analysed in
  `06-flows/pdf-report-pipeline.md:90-93` and `06-flows/templates.md:244-257`). The invariant is
  advisory, not a gate.

**Verdict:** a roadmap whose infra section is accurate but whose status table and file list have drifted
past the doc. **ASPIRATIONAL → PARTLY-STALE.**

---

## 12. `PDF_LAYOUT_STANDARDS.md` — **PARTLY-STALE**

**What it claims.** CSS/page-break standards (`page-break-before` only; `@page` margins; Browserless
`preferCSSPageSize`) for the HTML-based PDF generators, plus an "Affected Edge Functions" table.

**Basis / what holds:**
- The CSS-discipline content is implementation-agnostic guidance and is consistent with the
  HTML→headless-Chrome strategy that the live `generate-inspection-pdf` and `generate-pdf` functions use
  (`06-flows/pdf-report-pipeline.md:26-31`, `05-edge-functions/pdf-generation.md`). No contradiction
  found; not independently verified line-by-line against the HTML builders (⚠️ UNVERIFIED at that depth).

**What's stale:**
- **"Affected Edge Functions" table lists prod-deleted functions.** It rows `generate-pdf-browserless`
  ("Legacy fallback") and `generate-docx-report` ("N/A"). Both still have *source*
  (`supabase/functions/generate-pdf-browserless/index.ts`, `…/generate-docx-report/index.ts`) and
  `config.toml` stanzas (`config.toml:46,64`), but were **deleted from prod 2026-06-11** per
  `GAPS.md` G-SEC-12 progress and `06-flows/pdf-report-pipeline.md:10-13`. Treating them as
  review/fallback targets is outdated.
- Browserless is named as the renderer; the live site-summary path (`generate-pdf`) actually uses
  **PDFShift**, and only `generate-inspection-pdf` uses Browserless
  (`06-flows/pdf-report-pipeline.md:137,211`). The standards doc's Browserless-centric framing only
  fully applies to the inspection function.

**Verdict:** the layout rules are reasonable and uncontradicted, but the edge-function table references
deleted/mis-attributed functions. **PARTLY-STALE.**

---

## 13. `PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md` — **ASPIRATIONAL / PARTLY-STALE**

**What it claims.** The "Core Principle": *every PDF report MUST fetch its config from
`pdf_report_templates` before generation.* ASCII data-flow, a `usePDFTemplate` hook "Called by EVERY
report generator component", a Phase-3 integration status table, and schema/section reference.

**Basis / what holds:**
- The table + JSONB shape (`report_type`, `is_default`, `customization`, `sections`) is correct
  (`02-data-model/tables-03.md`, migration `20260110132516`). The schema-reference interfaces broadly
  match the gateway's types.

**What's stale / wrong:**
- **Wrong hook named.** It says the gatekeeper is `usePDFTemplate`, "Called by EVERY report generator".
  In reality generators call `usePDFTemplateGateway` / `fetchPDFTemplate`
  (`src/hooks/usePDFTemplateGateway.ts`); the thin `usePDFTemplate` hook (`src/hooks/usePDFTemplate.ts`)
  is used by the template-manager UI, **not** by the generators (`06-flows/pdf-report-pipeline.md:33-38,87`).
  The newer roadmap (#11) corrects this.
- **Integration status table stale + names a nonexistent file.** Marks Inspection/Floor Plan/Asset
  Verification "🔴 Not integrated" and lists `cocValidationPdfGenerator.ts`. Floor-plan and
  asset-verification are now integrated (see #11 evidence); `cocValidationPdfGenerator.ts` does not exist.
- **"MUST fetch / single source of truth" is not enforced.** The gateway fails open to defaults on any
  read error or missing row, so generation never blocks — the principle is a convention, not a gate
  (`usePDFTemplateGateway.ts:3` header is aspirational; behaviour at `:401-419`; analysed in
  `06-flows/pdf-report-pipeline.md:90-93`).

**Verdict:** an architecture-intent doc; the design goal is real but partially achieved and the
mechanics it describes (hook name, status, enforcement) have drifted from code. **ASPIRATIONAL /
PARTLY-STALE.**

---

## 14. `SITE_SUMMARY_REPORT_REVIEW.md` — **ASPIRATIONAL**

**What it claims.** A design-review of one generated PDF (`YARONA_CENTRE_Summary_Report.pdf`) against
`DOCUMENT_DESIGN_STANDARDS`: lists cover/health/subsection/typography/margin issues, proposes fixes,
estimates ~12.5h, and prescribes code changes to `src/components/SiteSummaryReport.tsx`.

**Basis / what holds:**
- The target file (`src/components/SiteSummaryReport.tsx`) and the referenced standards module
  (`src/lib/documentDesignStandards.ts`) both exist. The component is the client-pdfmake site-summary
  path documented in `06-flows/pdf-report-pipeline.md:50,159-192` (note: that path's *live* render route
  is ⚠️ UNVERIFIED — `SiteReports.tsx` renders `GenerateFinalReportButton`/the server path instead).
- A few items are self-marked ✅ done (dynamic card height, page-break logic, doc-list truncation) in
  the Phase-1 list; the rest are open proposals.

**Why ASPIRATIONAL:** it is a critique-and-wishlist tied to a specific exported PDF artifact, not a
description of current behaviour. The PDF it reviews is not in the repo, and the proposed fixes are
mostly unverified-as-applied. The standards constants it prescribes (type scale, margins, colour
tokens) were not diffed against the current `documentDesignStandards.ts` values — ⚠️ UNVERIFIED whether
the component already matches them. No factual claim about *current* system state to mark stale; it is a
plan document. **ASPIRATIONAL.**

---

## 15. `WEB_PARITY_PLAN.md` — **ASPIRATIONAL → PARTLY-STALE**

**What it claims.** A 13-week, 6-sprint plan (dated 2026-05-25) executing the 16 prioritised gaps from
`PARITY_GAP_ANALYSIS.md`: sprint breakdown, user stories, risks, decision log. The keystone decision
(RE-1) is "drop the orphan `inspection_items` table, canonical = `inspections.json_data`".

**Basis / what holds:**
- The gap-summary table faithfully reflects `PARITY_GAP_ANALYSIS.md` §3. The web-only-preserve framing
  is consistent with `02-data-model/`. The stack facts (Next.js 15 App Router, single Supabase project)
  match the repo.
- RE-6's premise (two IndexedDB modules) still holds — both files present.

**What's stale / wrong (build status — this is a plan that has NOT been executed):**
- **RE-1 / §3.3 / §6.8 / Decision-Log #2 premise is false now:** "Web grep confirms zero
  `.from('inspection_items')`." There are 2 readers (`src/views/SiteDetail.tsx:364`,
  `src/views/subsection-detail/useSubsectionDetail.ts:1053`). The "drop the table" decision is unsafe on
  current evidence. No drop migration exists (`grep` of `supabase/migrations/` for
  `DROP TABLE …inspection_items` / `_inspection_items_orphan` → none).
- **Sprint-0/1/2 deliverables not present:** `scripts/check-schema-drift.ts` (CI gate) — not created;
  `src/components/NotificationsBell.tsx` (ADD-3) — not created; `src/components/ActivityLogFeed.tsx`
  (ADD-2) — not created. So as a *status* it is entirely unstarted; as a *plan* it is intact but built
  on the broken RE-1 premise.
- **Path drift:** cites `src/pages/Calendar.tsx` etc.; current tree is `src/views/`.
- External `DATABASE_MAP.md` and `AUDIT_BASELINE.md` deferred-item numbering are ⚠️ UNVERIFIED from this
  repo (AUDIT_BASELINE is item #2 of the 23, in the first third; DATABASE_MAP is out-of-repo).

**Verdict:** a coherent sprint plan, unexecuted, whose central technical premise has drifted.
**ASPIRATIONAL → PARTLY-STALE.**

---

## 16. `incidents/2026-04-22-orphaned-inspections.md` — **ACCURATE**

**What it claims.** Post-incident write-up: 575/1,261 inspections were unreachable from their subsection
because `inspections.subsection_id` was NULL; root cause = two code paths inserting without
`subsection_id`; fixed in commit `cafb164`; 26 auto-relinked, rest discoverable via an "Unlinked" badge;
no data destroyed.

**Basis (verified):**
- **Commit is real:** `git log --oneline cafb164` → `cafb164 Fix orphan inspections + add UI to relink
  them`. Matches the doc's fix narrative.
- The cited hook `src/hooks/useOfflineInspections.ts` exists. The incident's diagnostic SQL and remediation
  (snapshot tables, no DELETE, rollback script) are internally consistent and plausible; the DB-state
  figures (575 orphans, dates) are historical and not re-queryable from the repo — ⚠️ UNVERIFIED but
  not contradicted.

**Caveat (does not change grade — it's a dated historical record):**
- **File paths are pre-reorg.** It cites `src/pages/SiteDetail.tsx:576-593` and `src/pages/Inspections.tsx`;
  the code now lives at `src/views/SiteDetail.tsx` / `src/views/Inspections.tsx` (no `src/pages/` dir).
  The corresponding logic (inspection insert with `subsection_id`/`shop_name`) is present in
  `src/views/SiteDetail.tsx`. As an incident record the original paths are correct for their date.

**Verdict:** faithful, commit-verified historical incident report. **ACCURATE** (paths are point-in-time).

---

## Net for the ledger

- **2 ACCURATE** (#9 INSPECTION_TEMPLATES, #16 orphaned-inspections incident).
- **3 PARTLY-STALE** (#10 PARITY_GAP_ANALYSIS, #12 PDF_LAYOUT_STANDARDS, #11/#13 the two gatekeeper docs
  which are aspirational-with-stale-status).
- **3 ASPIRATIONAL** plans/roadmaps (#11, #13, #14, #15) — graded on premise validity; #11/#13/#15 each
  carry stale facts (gateway integration status; the wrong hook name; the false zero-reader premise).
- **One stale fact recurs across the PDF docs:** floor-plan + asset-verification generators are now
  template-gateway-integrated (`floorPlanReportGenerator.ts:79`, `assetVerificationReportGenerator.ts:146`),
  contradicting every "only Site Summary integrated" status table.
- **One stale fact recurs across the parity + incident docs:** `src/pages/*` → `src/views/*` reorg.
- **One load-bearing premise is now false:** `inspection_items` has live `.from()` readers
  (`src/views/SiteDetail.tsx:364`, `src/views/subsection-detail/useSubsectionDetail.ts:1053`), breaking
  the RE-1 "safe to drop the orphan table" decision in both parity docs.
