# Site-level "Generate all reports" — Design

**Date:** 2026-10-06
**Status:** Approved (brainstorm), pending spec review

## Problem

Each site has five kinds of generated report, each produced from a different tab, one at a time:

| Report | Scope | Generator today | Cost |
|---|---|---|---|
| Inspection report | per inspection (subsection) | `generateInspectionReportPdf` (`src/lib/pdfmakeInspectionReport.ts`) | High — every photo downloaded, HEIC-converted, re-compressed |
| Asset Verification | site | `generateInspectionBasedReport` (`src/lib/assetVerificationReportGenerator.ts`) | Medium — asset thumbnails |
| Site COC report | site | `buildCocReportModel` + `buildSiteCocReportDocDef` (`src/lib/siteCoc/`) | Low |
| Fortress Marking Checklist | site | `generateFortressChecklistPdf` (`src/lib/fortressChecklistReportGenerator.ts`) | Low |
| Site Summary | site | `generateSiteSummaryPdf` (`src/lib/report/siteSummaryPdf.ts`) | Medium — sequential per-subsection cards + QR |

Generating a full set for a site means visiting every tab and every subsection. We want one place per site that lists every possible report, shows which are missing or out of date, and generates the selected ones in one run — keeping the existing rule that only the current copy of each report remains in the database.

## Decisions (locked)

1. **Runs in the browser** (option A). The user keeps the site tab open; no server jobs/queue. Interrupted runs resume naturally via status.
2. **Inspection reports are one per inspection.** A subsection with three inspections keeps three current reports; regenerating an inspection replaces only that inspection's report.
3. **Per-run checklist** (option C). Every possible report is listed with status *missing / out of date / current*; missing and out-of-date are pre-ticked; the user can tick/untick anything.
4. **Legacy unlinked inspection reports** (saved before this change, no inspection link) count as out of date, and are removed by the replace rule the first time any inspection in that subsection is regenerated.

## Out of scope

- Server-side/background generation.
- Photo caching / pipeline speed-ups (possible follow-up).
- A per-subsection COC PDF (none exists; COC certificates remain uploaded files).
- Changing the dedupe identity for site-level reports (stays `site_id + category`).

## Architecture

### 1. Report registry — `src/lib/reports/registry/`

One module per report type, all implementing:

```ts
interface ReportTarget {
  key: string;                 // "inspection:<id>" | "asset-verification" | "site-coc" | "fortress-checklist" | "site-summary"
  type: ReportType;
  label: string;               // e.g. "DB-3 · Tenant DB inspection"
  subsectionId?: string;
  inspectionId?: string;
  sourceUpdatedAt: string | null;   // max updated_at across the report's inputs
  existing: { id: string; createdAt: string; linked: boolean } | null;
}

interface ReportModule {
  type: ReportType;
  listTargets(ctx: SiteContext): Promise<ReportTarget[]>;
  generateAndSave(target: ReportTarget, ctx: SiteContext): Promise<GenerateResult>;
}

type GenerateResult =
  | { ok: true; durationMs: number; photoCount?: number; bytes: number; superseded: number; supersedeBlocked: number }
  | { ok: false; durationMs: number; error: string };
```

`SiteContext` carries `siteId`, site name, client name, logos/branding loaded once per run, and the current user.

**Status** is computed by one shared pure function, `reportStatus(target)`:
- `missing` — `existing` is null.
- `out-of-date` — `existing.linked === false`, or `sourceUpdatedAt > existing.createdAt`.
- `current` — otherwise.

**Source timestamps per type:**
- Inspection: max(`inspections.updated_at`, `snags.updated_at` for that inspection's subsection).
- Asset Verification: max(`site_assets.updated_at`, `inspections.updated_at`) for the site.
- Site COC: max(`coc_db_schedule.updated_at`, `coc_certificates.updated_at`, `subsections.updated_at`) for the site.
- Fortress checklist: max(`site_marking_checklist.updated_at`) for the site.
- Site Summary: max over sites, subsections, inspections, snags, site_assets and site_documents for the site.

**Known limitation:** a hard-deleted source row bumps no timestamp, so its report can show *current* while stale. The user can tick it manually. The UI shows the "last generated" time next to every row.

**Required extractions.** These keep one generator per type, shared by the tab UI and the registry:
- `loadAssetComparison(siteId)` — the comparison data now built inside `AssetVerification.tsx` / `AssetComparisonTable.tsx` becomes a plain async function. Both components call it.
- `loadSiteCocData(siteId)` — the data loading in `useSiteCoc` becomes a plain async function; the hook wraps it.
- The existing tab buttons call the registry module's `generateAndSave`, or the same underlying functions, so output is identical either way.

### 2. Data model and replace rule

**Migration** (targeted, applied to prod via the management endpoint, never `db push`):

```sql
alter table public.subsection_documents
  add column if not exists source_inspection_id uuid
    references public.inspections(id) on delete set null;
create index if not exists subsection_documents_source_inspection_idx
  on public.subsection_documents (source_inspection_id);
```

**`savePDFToDocuments`** gets an optional `sourceInspectionId`:
- It is written on insert.
- **When set**, `supersedePreviousReports` targets older rows where `subsection_id = S AND category_id = C AND (source_inspection_id = I OR source_inspection_id IS NULL)`, excluding the new row. This replaces that inspection's previous report plus any legacy unlinked reports.
- **When not set**, behaviour is unchanged.

Consequence of the legacy rule: in a subsection with inspections X and Y and one legacy report, regenerating X removes the legacy report. Y then shows *missing* in the same checklist, so a full run ends clean.

The single-inspection flow (`ComprehensiveInspectionReport`, `generateAndSaveInspectionReportPdfmake`) also passes `sourceInspectionId`. Otherwise, saving one inspection's report would wipe its siblings under the old subsection+category rule.

Delete ordering is unchanged: delete rows first, confirm via `.select()`, then remove blobs only for confirmed rows. `supersedePreviousReports` now also returns the count of rows it attempted but RLS blocked, so the UI can surface them.

### 3. "All reports" panel — `src/components/site/AllReportsGenerator.tsx`

- New first tab in `SiteReports.tsx`, labelled **All reports**. It replaces the "Bulk Inspection Reports" tab; `BulkInspectionReportGenerator.tsx` is deleted once parity is confirmed.
- On open, it calls `listTargets` for every module in parallel and shows rows grouped by type. Each row has a checkbox, label, status badge and last-generated time. Each group has select-all/none, and there is a global "Select out of date & missing" control.
- **Run:**
  - Sequential loop over ticked rows, ordered cheapest first: Site COC → Fortress → Site Summary → Asset Verification → inspections (by subsection name).
  - Overall progress bar and per-row state (queued, generating, saved, failed + message).
  - Stop button: finishes the current row, then halts. `beforeunload` warning while running; `mountedRef` guard as in the existing bulk tools.
  - A failure does not abort the run. At the end there is a summary (saved / failed / skipped) and a **Retry failed** button.
  - After the run, targets are re-listed so statuses refresh, and the Saved Reports list below reloads.
- Gated to the same roles that can generate reports today. Clients and contractors do not see the tab.

### 4. Diagnostics (ship in first deploy)

- Per row, `console.info("[reports]", { key, durationMs, photoCount, bytes, superseded, supersedeBlocked })`.
- Per run, a summary line with totals and total duration.
- `supersedeBlocked > 0` is shown on the row as a warning: "Old copy kept — no permission to remove it". It is never silent.
- Each failure keeps its error message in the row and in the end-of-run summary.

## Error handling

- Generation or save errors are caught per row; the run continues.
- If the upload succeeds but the row insert fails, the existing `removeUploadedBlob` path still cleans up.
- If the report is too large, the existing friendly size message is shown on the row.
- If `listTargets` fails for one module, that group shows an error with a Retry button; the other groups still work.

## Testing

**Unit (vitest):**
- `reportStatus`: missing, legacy-unlinked, stale, current, null `sourceUpdatedAt`.
- Supersede query selection with and without `sourceInspectionId`, including the legacy NULL arm. Supabase client is mocked.
- Run ordering, and stop-after-current behaviour of the runner loop. The loop is extracted as a pure async function with injectable modules.

**Manual E2E on one real site** with ≥1 subsection having ≥2 inspections and existing legacy reports:
1. The panel lists every inspection plus the 4 site reports; legacy-covered inspections show *out of date*.
2. A full run saves every report. Afterwards, each inspection has exactly one linked report, there are no unlinked inspection reports in those subsections, and each site report has exactly one row.
3. Reopening the panel shows everything *current*.
4. Editing one snag makes exactly the reports for that subsection's inspections, and Site Summary, *out of date*.
5. Saving a single inspection report from the inspection page leaves its sibling inspection's report intact.

## Deploy

1. Apply the migration to prod. It is additive and nullable, so it is safe ahead of the code.
2. Merge to `main`; Vercel deploys `watsonmattheus.com`.
3. Run the E2E above on prod.

The round trip is one Vercel build (~3–5 min). Verification needs a real site with existing reports, so it happens on prod after deploy, with diagnostics already in place.
