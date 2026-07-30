# C07 — site-assets-inspections

- Unit id: C07
- Slug: site-assets-inspections
- Spec mode: full
- Date: 2026-07-29
- Files: 7

## Unit header

**Unit purpose.** Site-tab components for the electrical asset register and its verification against inspection data: an orchestrator (`AssetVerification`) that imports an Excel asset register and hosts three sub-tabs (comparison table, consolidated meter register, raw asset table), plus a bulk PDF report generator for subsection inspections, a create-inspection dialog, and a site compliance checklist card. All data access goes through the Supabase browser client directly from the components (react-query in three files, ad-hoc async in the other two data-touching files).

**Module-level observations (cross-file facts).**
- Three of the seven files form one feature tree: `AssetVerification` is the only importer of `AssetComparisonTable`, `AssetTable`, and `MeterRegister` (AssetVerification.tsx:11-13). The other four files are consumed from outside the unit.
- The row shape is duplicated rather than shared: `AssetTable` declares a local `Asset` interface (AssetTable.tsx:21-36) and `AssetVerification` declares `SiteAssetRow` (AssetVerification.tsx:41-56) with the identical 14 fields; `AssetComparisonTable` instead aliases `AssetForComparison` from `@/lib/assetVerification` (AssetComparisonTable.tsx:32).
- Meter identity is normalized consistently via `normalizeMeterSerial` from L08 in both `AssetComparisonTable` (line 238) and `MeterRegister` (line 114).
- Public/token mode is only plumbed into `AssetVerification` (prop `accessToken`, line 37); the children it renders in that mode — `AssetComparisonTable` (saved-reports fetch, AssetComparisonTable.tsx:80-90) and `MeterRegister` (all three queries, MeterRegister.tsx:55-97) — issue direct table reads with no token and no `enabled` gate tied to public mode.
- Two different delete-confirmation mechanisms in the same feature: `AssetTable` uses the shadcn `AlertDialog` (AssetTable.tsx:194-213) while `AssetComparisonTable` uses `window.confirm` (AssetComparisonTable.tsx:340).
- No test file in the repo references any of the seven components (grep-verified; the only textual match, `src/lib/assetVerificationReportModel.test.ts`, tests the L08 report model, not these components).

**External contract.** The rest of the app gets: `AssetVerification` (the whole asset-verification tab, mounted by V01 `SiteDetail`, V03 `ClientPortalSiteDetail`, V04 `PublicSiteReview`); `BulkInspectionReportGenerator` (mounted by C08 `SiteReports`); `InspectionDialogs` and `SiteComplianceChecklist` (both mounted by V01 `SiteDetail`). The three inner tables are unit-internal.

---

## src/components/site/AssetComparisonTable.tsx

- Purpose: Renders the asset-vs-inspection comparison table with stat-card filters, inline editing of asset and inspection values, inspection photo viewing, and generation/preview/save/delete of the Asset Verification PDF report.
- Public surface:
  - `AssetComparisonTable({ assets: Asset[], inspectionMeterMatches: Map<string, InspectionTenantMatch>, siteName: string, companyLogoUrl?: string | null, onDataUpdated?: () => void, readOnly?: boolean }): JSX.Element` (props interface lines 40-47; `Asset` is `AssetForComparison` aliased from `@/lib/assetVerification`, line 32).
  - Internal-only types: `SavedReport` (line 37), `EditingCell` (lines 49-54).
- Inputs & outputs:
  - In: `assets` + `inspectionMeterMatches` from the parent; `siteId` self-derived from `window.location.pathname` via regex `/sites\/([a-f0-9-]+)/`, computed once with `useMemo(..., [])` (lines 69-73).
  - Out: renders table/cards; writes to tables `site_assets` (update, lines 198-201), `inspections` (`json_data` read-modify-write, lines 222-257), `site_documents` (read lines 82-87, delete line 347); storage bucket `documents` (remove, line 345; upload indirectly via `savePDFToDocuments`, lines 315-320). Report category name comes from `getReportCategoryName("asset-verification")` (module const line 38, and again inline at line 319).
- Dependencies:
  - uses -> `@/lib/pdfDocumentSaver` (`savePDFToDocuments`, `getReportCategoryName`) [L14]; `@/lib/pdfTemplates` (`PDFComplianceCheck` type) [L14]; `@/lib/assetVerificationReportGenerator` (`generateInspectionBasedReport`) [L08]; `@/lib/assetVerification` (`normalizeMeterSerial`, `buildComparisonResults`, types) [L08]; `@/components/RobustImage` [C16]; `@/components/DocumentPreviewDialog` [C15]; `@/integrations/supabase/client` [L19]; `@/components/ui/*` [C01]; `sonner`, `lucide-react` (external).
  - used by <- C07 site-assets-inspections only (src/components/site/AssetVerification.tsx:12, 429). No other consumers (grep-verified).
- Side effects: Supabase reads/updates/deletes listed above; `URL.createObjectURL` for the generated PDF (line 290) with revocation in a `useEffect` cleanup (lines 99-103), on save (line 324), and on dialog close (line 742); `window.confirm` prompt (line 340); toasts throughout.
- Error handling:
  - `fetchSavedReports` destructures only `data`; a query error is silently swallowed and `savedReports` becomes `[]` (lines 82-88).
  - Asset edit save: `throw` on Supabase error → `console.error` + `toast.error("Failed to update asset")` (lines 203-213).
  - Inspection edit save: fetch error thrown; tenant-not-found → `toast.error("Could not find matching tenant in inspection")` and early return (lines 243-246); update error thrown; catch logs + `toast.error` (lines 264-269).
  - PDF preview generation failure: `console.error` + `toast.error("Failed to generate preview")` (lines 298-303).
  - Save-to-documents: missing blob/siteId → `toast.error("Unable to save: missing context")` (lines 307-310); `savePDFToDocuments` failure surfaces `result.error` or generic toast (lines 327-329); thrown errors caught with toast (lines 330-333).
  - Saved-report delete: storage removal is best-effort (only attempted when `file_url` contains `supabase.co/storage`, path parsed by `split("/documents/")`, lines 343-345); row-delete error thrown → toast "Could not delete the report" (lines 352-355).
- Tests: none found (grep-verified). The comparison/normalization logic it delegates to is tested in L08 (`src/lib/assetVerification.test.ts`), and the report model in `src/lib/assetVerificationReportModel.test.ts`; neither imports this component.
- Observed issues:
  - `siteId` is derived from the URL, not props; on routes without a `sites/<uuid>` path segment (e.g. the public review route `src/app/review/[token]`) it is `undefined`, so saved-report fetch no-ops (line 81) and save-to-documents errors with "missing context" (line 307).
  - The "Generate PDF" button (lines 539-551) is not gated by `readOnly`; only inline editing and saved-report deletion are (lines 412/418/441, 573).
  - `editingCell` identifies the row by its index in `filteredResults` (`idx` passed at lines 639-666); `filteredResults` recomputes on search/filter change (lines 106-134), so the same stored `rowIndex` maps to whichever row then occupies that index.
  - The blob-revocation `useEffect` (lines 99-103) calls `URL.revokeObjectURL` on `pdfPreview.url` without checking `isObjectUrl` (a no-op for saved reports' https URLs), while the close handler (line 742) and save handler (line 324) do check it.
  - `getReportCategoryName("asset-verification")` is called both at module scope (line 38) and inline in the save handler (line 319).
  - Saved-report deletion is confirmed via `window.confirm` (line 340), unlike `AssetTable`'s `AlertDialog` in the same unit.
  - `stats.verified` (matched incl. discrepancies, line 144) is computed and passed to the PDF generator, but the visible "Verified" card shows `verifiedNoDiscrepancy` (line 484).
- ASSUMED:
  - That direct `site_documents` reads and `inspections`/`site_assets` writes are permitted/denied by RLS according to the caller's session; no policy was inspected here.
  - That `InspectionTenantMatch.inspectionId` always identifies an inspection whose `json_data.tenants` array contains the matched tenant (the not-found toast at line 244 is the fallback).

## src/components/site/AssetTable.tsx

- Purpose: Renders a searchable, category-aware (electrical/water columns) read table of site assets with per-row delete behind a confirmation dialog.
- Public surface: `AssetTable({ assets: Asset[], type: "electrical" | "water", onRefresh: () => void, readOnly?: boolean }): JSX.Element` (props lines 38-43; local `Asset` interface lines 21-36 with 14 fields incl. `tag`, `mbus_gateway_index`).
- Inputs & outputs:
  - In: `assets` array from the parent; client-side search on `premises_id` / `trade_as` / `meter_serial_number` (lines 50-57).
  - Out: table UI; deletes rows from table `site_assets` by id (line 64); calls `onRefresh()` after a successful delete (line 70).
- Dependencies:
  - uses -> `@/integrations/supabase/client` [L19]; `@/components/ui/*` incl. `alert-dialog` [C01]; `sonner`, `lucide-react` (external).
  - used by <- C07 site-assets-inspections only (src/components/site/AssetVerification.tsx:11, 446). No other consumers (grep-verified).
- Side effects: one Supabase delete (line 64); toasts on success/failure.
- Error handling: delete error is thrown, caught, logged, and surfaced as `toast.error("Failed to delete asset")`; `deleting` flag reset in `finally` (lines 66-76).
- Tests: none found (grep-verified).
- Observed issues:
  - The `type === "water"` rendering branch (columns Tag / M-Bus Index, lines 127-132, 161-166) has no live caller: the only mount passes `type="electrical"` (AssetVerification.tsx:446, grep-verified).
  - The local `Asset` interface duplicates `AssetVerification`'s `SiteAssetRow` field-for-field (AssetTable.tsx:21-36 vs AssetVerification.tsx:41-56).
  - `reading_at_commissioning`, `old_meter_serial_number`, and `last_meter_read_old` are declared in the interface but never rendered (no column uses them, lines 114-186).
- ASSUMED: nothing beyond the above.

## src/components/site/AssetVerification.tsx

- Purpose: Orchestrates the Asset Verification tab: loads assets/inspections/subsections (directly, or via a token-scoped RPC in public mode), imports an Excel asset register with replace-on-confirm semantics, shows summary cards, and hosts the Verification / Meter Register / Electrical Meters sub-tabs.
- Public surface: `AssetVerification({ siteId: string, siteName: string, readOnly?: boolean, accessToken?: string }): JSX.Element` (props lines 33-38). Internal types: `SiteAssetRow` (lines 41-56); const `MAX_IMPORT_BYTES = 10MB` (line 58).
- Inputs & outputs:
  - In: `siteId`/`siteName` props; public mode is `readOnly && !!accessToken` (line 70). Public data comes from RPC `get_public_site_review(p_token, p_site_id)` (lines 81-84); otherwise direct reads of `site_assets` (`select *` ordered by `premises_id`, lines 97-101), `inspections` (`id, title, subsection_id, json_data` where `json_data` not null, lines 113-117), `subsections` (`id, name`, lines 129-132). Excel file parsed via `XLSX.read` + `parseAssetRows` (lines 165-171).
  - Out: inserts into `site_assets` with `asset_category: "electrical_meter"`, `created_by` from `supabase.auth.getUser()`, and a fresh `import_batch_id` (`crypto.randomUUID()`, lines 176-198); replace-mode cleanup deletes prior electrical rows via `.or(\`import_batch_id.is.null,import_batch_id.neq.${importBatchId}\`)` (lines 203-210); "Clear All" deletes every `site_assets` row for the site (line 273). React-query cache keys touched: `public-site-review-assets`, `site-assets`, `site-inspections-tenants`, `site-subsections-names`; `onDataUpdated` invalidates `site-inspections-tenants` (lines 434-437).
- Dependencies:
  - uses -> `@/lib/assetVerification` (`parseAssetRows`, `buildInspectionMeterMatches`, `buildComparisonResults`, types) [L08]; `./AssetTable`, `./AssetComparisonTable`, `./MeterRegister` [C07]; `@/integrations/supabase/client` [L19]; `@/components/ui/*` [C01]; `@tanstack/react-query`, `xlsx`, `sonner`, `lucide-react` (external).
  - used by <- V01 admin-entity-views (src/views/SiteDetail.tsx:27, 796), V03 portal-views (src/views/ClientPortalSiteDetail.tsx:20, 358 — `readOnly`), V04 public-and-entry-views (src/views/PublicSiteReview.tsx:28, 478 — `readOnly accessToken={token}`). Grep-verified.
- Side effects: Supabase RPC/reads/inserts/deletes above; file input reads (`file.arrayBuffer()`, line 166); toasts; two hidden `<input type="file">` elements (`excel-upload` line 323, `excel-upload-empty` line 396).
- Error handling:
  - Query errors are thrown into react-query; the UI collapses them to a single retry card ("Unable to load assets") driven by `isError` from the assets query or the RPC only (lines 145-147, 358-373) — inspections/subsections query errors are not surfaced.
  - Upload: wrong extension → toast (line 236); >10MB → toast (line 240); parse failure → `console.error` + toast "Could not read that Excel file" (lines 249-253); zero parsed rows → toast (lines 257-259).
  - Insert: insert error thrown → toast "Failed to import assets"; in replace mode the parsed rows are restored to `pendingImport` "for one-click retry" (line 224). Replace-cleanup failure does not throw: `console.error` + `toast.warning` about possible duplicates (lines 210-213).
  - Delete-all error → `console.error` + toast (lines 280-284).
- Tests: none found (grep-verified); the parsing/matching functions it calls are covered by `src/lib/assetVerification.test.ts` [L08].
- Observed issues:
  - "Clear All" deletes with only `.eq("site_id", siteId)` — no `asset_category` filter (line 273) — while the dialog copy says "delete all {electricalAssets.length} electrical meters" (lines 456-459).
  - `verifiedCount` recomputes `buildComparisonResults` over all assets (lines 158-163), duplicating the computation `AssetComparisonTable` performs on the same inputs (AssetComparisonTable.tsx:93-96).
  - In public mode `MeterRegister` is rendered with no token (line 442); its direct table queries run regardless (see MeterRegister entry).
  - The two upload `Button asChild` wrappers pass `disabled={uploading}` to a `<span>` (lines 316-321, 389-394); the actual gating is the `disabled` attribute on the hidden inputs (lines 329, 402).
  - `insertAssets` always calls `refetch()` of the direct `site-assets` query (line 220), which is `enabled: !isPublic` — consistent, since imports are only reachable when `!readOnly`.
- ASSUMED:
  - That the RPC payload keys `site_assets`, `inspections`, `subsections` (lines 140-144) match what `get_public_site_review` returns (RPC defined in D03-era migrations; not inspected here).
  - That RLS restricts the direct reads for the authenticated client-portal (`readOnly`, no token) case; V03 passes no token, so that mode uses the direct queries.

## src/components/site/BulkInspectionReportGenerator.tsx

- Purpose: Lists a site's subsections with their latest templated inspection, lets the user select a subset, and sequentially generates + saves an inspection PDF report per subsection with progress, stop, and per-row result reporting.
- Public surface: `BulkInspectionReportGenerator({ siteId: string, siteName: string, clientName?: string, siteLogoUrl?: string | null, onComplete?: () => void }): JSX.Element` (props lines 51-57). Internal types: `GenerationResult` (lines 27-37, `status: 'success' | 'failed' | 'skipped' | 'no-inspection'`), `SubsectionWithInspection` (lines 39-49).
- Inputs & outputs:
  - In: table `subsections` with nested `inspections(id, template_id, status, json_data, inspection_templates(id, name))` (lines 87-104); `subsection_documents` filtered `ilike('file_name', '%Inspection%Report%')` to flag existing reports (lines 111-115); per-run: `inspections` full row (lines 207-211), `inspection_templates` full row (lines 218-222), `snags` by subsection (lines 229-233); auth session check (line 375).
  - Out: per-subsection PDF generated and persisted via `generateAndSaveInspectionReportPdfmake({ inspection, siteName, clientName, siteLogoUrl, subsectionId, siteId })` (lines 329-336), which returns `{ success, documentId?, fileName?, fileUrl?, error? }` (pdfmakeInspectionReport.ts:1546-1557); result rows with download links (`target="_blank"`, line 732).
- Dependencies:
  - uses -> `@/lib/inspectionImages` (`countInspectionPhotos`) [L12]; `@/lib/pdfmakeInspectionReport` (`generateAndSaveInspectionReportPdfmake`, `InspectionReportData`, `ReportDocument`) [L15]; `@/lib/templateTenants` (`templateSupportsTenants`) [L18]; `@/integrations/supabase/client` [L19]; `@/components/ui/*` [C01]; `sonner`, `lucide-react` (external).
  - used by <- C08 site-documents-reports (src/components/site/SiteReports.tsx:8, 176). Also named in a comment in L12 (src/lib/inspectionImages.ts:5). Grep-verified; no other consumers.
- Side effects: Supabase reads above; PDF generation + storage/table writes inside L15's `generateAndSaveInspectionReportPdfmake`; `console.log` diagnostic per report (line 327); toasts for load failure, run start, stop, completion (with success/photo/failed counts, lines 432-434), and run failure; 500 ms `setTimeout` delay between generations (lines 421-423); calls `onComplete?.()` after a run (line 436).
- Error handling:
  - `fetchSubsections`: subsections query error thrown with message; caught → `setError` + `toast.error('Failed to load subsections')` (lines 106-157). The `subsection_documents` query error is silently ignored (only `data` destructured, line 111).
  - `generateSingleReport`: any failure (fetch inspection/template, generation `success: false`) is converted to a `status: 'failed'` result row carrying `error` (lines 353-362) — the run continues.
  - `runBulkGeneration`: no session → thrown "You must be logged in"; empty filtered set → `toast.info` and return (lines 393-399); outer catch sets `error` state + toast (lines 438-441); `finally` resets running flags (lines 442-446).
- Tests: none found (grep-verified). `countInspectionPhotos` is tested in `src/lib/inspectionImages.test.ts` [L12].
- Observed issues:
  - The "latest inspection" sort compares `new Date(b.created_at || 0)` (lines 125-127), but `created_at` is not among the selected inspection columns (lines 92-100), so every comparator operand is `new Date(0)` and the pick is effectively the first templated inspection in returned order.
  - The stop mechanism reads the `shouldStop` state binding captured by the render in which `runBulkGeneration` was invoked (line 407); `handleStop`'s `setShouldStop(true)` (line 450) updates state for subsequent renders but does not change that captured constant, and no ref is used.
  - `status: 'skipped'` is declared, counted (line 460), icon/badge-handled (lines 472, 485), but never assigned anywhere — filtered-out subsections produce no result row at all.
  - Existing-report detection is a filename pattern match (`%Inspection%Report%`, line 115) on `subsection_documents`, not a category/type field.
  - `getStatusBadge` renders the photo badge behind `result.photoCount && result.photoCount > 0 &&` (line 494) — a `photoCount` of `0` short-circuits to `0`, which React does not render, so no visible defect; noted as a truthiness-guard fact.
- ASSUMED:
  - That `subsection_documents.file_name` values produced by L15 always contain "Inspection…Report" so the skip flag matches its own output (naming produced inside L15; not verified here).
  - That the nested `inspections` relation returns rows in an order that makes "first templated inspection" acceptable to callers (see sort observation).

## src/components/site/InspectionDialogs.tsx

- Purpose: A fully-controlled dialog for creating a site-wide inspection: template select + date input, with all state and the create action owned by the parent.
- Public surface: `InspectionDialogs({ isCreateInspectionOpen: boolean, setIsCreateInspectionOpen: (open: boolean) => void, availableTemplates: Array<{ id: string, name: string, category: string }>, selectedTemplateId: string, setSelectedTemplateId: (id: string) => void, newInspectionDate: string, setNewInspectionDate: (date: string) => void, handleCreateInspection: () => void }): JSX.Element` (props lines 7-16).
- Inputs & outputs: In: the eight props. Out: UI only; invokes the parent's setters and `handleCreateInspection` (line 74). No stores touched.
- Dependencies:
  - uses -> `@/components/ui/{dialog,button,input,label,select}` [C01] only.
  - used by <- V01 admin-entity-views (src/views/SiteDetail.tsx:20, 879). Grep-verified; no other consumers.
- Side effects: none beyond invoking the passed callbacks.
- Error handling: none — no failure paths exist in this file; validation and error handling live with the parent's `handleCreateInspection`.
- Tests: none found (grep-verified).
- Observed issues:
  - The Cancel button resets `selectedTemplateId` and `newInspectionDate` to `""` (lines 67-73); closing via the dialog overlay/escape (`onOpenChange`, line 29) closes without resetting them.
  - The Create button does not close the dialog or disable itself; both are left to the parent (lines 74-76).
  - Despite the plural name `InspectionDialogs`, the file renders exactly one dialog.
- ASSUMED: nothing.

## src/components/site/MeterRegister.tsx

- Purpose: Builds a consolidated register of meters found in subsections, the asset register, and inspection tenant data, keyed by normalized serial, with cross-source discrepancy flags, filter cards, image preview, and CSV export.
- Public surface: `MeterRegister({ siteId: string, siteName: string, readOnly?: boolean }): JSX.Element` (props lines 15-19). Internal types: `InspectionTenant` (21-30), `InspectionSource` (32-36), `MeterEntry` (38-47).
- Inputs & outputs:
  - In: tables `subsections` (`id, name, meter_serial_number, ct_ratio`, non-null serials, lines 58-64), `site_assets` (`id, premises_id, trade_as, meter_serial_number, ct_ratio, asset_category`, non-null serials, lines 73-79), `inspections` (`id, title, json_data` non-null, lines 88-94). React-query keys: `meter-register-subsections|assets|inspections` scoped by `siteId`.
  - Out: UI; CSV file download named `{siteName with _}_meter_register.csv` built client-side via Blob + anchor click (lines 250-276). No writes to any store.
- Dependencies:
  - uses -> `@/lib/assetVerification` (`normalizeMeterSerial`) [L08]; `@/components/RobustImage` [C16]; `@/integrations/supabase/client` [L19]; `@/components/ui/*` [C01]; `@tanstack/react-query`, `sonner`, `lucide-react` (external).
  - used by <- C07 site-assets-inspections only (src/components/site/AssetVerification.tsx:13, 442). Grep-verified; no other consumers.
- Side effects: three Supabase reads; `URL.createObjectURL`/`revokeObjectURL` + synthetic anchor click for CSV (lines 269-274); toasts on refresh and export.
- Error handling: each query throws its Supabase error into react-query; any of the three `isError` flags replaces the whole body with a retry card ("Unable to load the meter register") whose button refetches all three and toasts "Meter register refreshed" (lines 99-104, 278-296).
- Tests: none found (grep-verified). `normalizeMeterSerial` is tested in `src/lib/assetVerification.test.ts` [L08].
- Observed issues:
  - `readOnly` is accepted and defaulted but never read in the body (only lines 18 and 49 mention it); Refresh and Export CSV render in all modes.
  - The queries have no `enabled` gate and no token path; when the parent runs in public/token mode this component still issues direct authenticated-style table reads (parent mount at AssetVerification.tsx:442 passes no token).
  - Serial values normalizing to `"NA"` or `"TBC"` are excluded from the register entirely (line 115).
  - Inspection-source selection overwrites a previously stored inspection source whenever a later tenant has any image (`!entry.sources.inspection || (tenant.meterImage || tenant.ctRatioImage)`, line 161) — including replacing one image-bearing source with another.
  - Discrepancy logic covers exactly two cases: single-source presence (lines 176-186) and subsection-vs-asset CT-ratio mismatch (lines 187-196); the inspection tenant's `ctSizeAndRatio` is displayed (line 487-491) but never compared.
  - CSV export wraps every cell in double quotes without escaping embedded quotes (line 267), so a value containing `"` produces a malformed row; export always uses `consolidatedMeters`, not the filtered view (line 252).
  - The "matched" filter's first clause `(m.sources.subsection || m.sources.asset || m.sources.inspection)` (line 211) is subsumed by the following `>= 2` sources check.
  - Table row `key` is the raw first-seen serial (line 441); uniqueness holds because the map is keyed by normalized serial.
- ASSUMED:
  - That `json_data.tenants` elements conform to `InspectionTenant` (cast at line 155; no runtime validation).

## src/components/site/SiteComplianceChecklist.tsx

- Purpose: Renders the "Get this site compliant" card: a progress bar plus deliverables sorted blocking-first, each expandable into outstanding items that navigate to a deep-linked action.
- Public surface: `SiteComplianceChecklist({ summary: SiteDeliverablesSummary, clientId: string, siteId: string }): JSX.Element` (props lines 39-43). Module-internal: `ACTION_VERB: Record<DeliverableKey, string>` (lines 14-23), `statusBadge(d: DeliverableResult)` (25-30), `bucket(d: DeliverableResult): number` (32-37).
- Inputs & outputs: In: precomputed `SiteDeliverablesSummary` (shape from L17: `deliverables`, `blockingCount`, `completeCount`, `applicableCount`, `completionPct`, …; siteDeliverables.ts:75-87) plus route context ids. Out: UI; on item click calls `navigate(buildActionHref(item, { clientId, siteId }))` (line 90). No stores touched; no data fetching.
- Dependencies:
  - uses -> `@/lib/navigation` (`useNavigate`) [L13]; `@/lib/siteDeliverables` (`DELIVERABLE_ORDER`, types) [L17]; `@/lib/buildActionHref` (`buildActionHref`) [L13]; `@/components/ui/{card,badge,progress}` [C01]; `lucide-react` (external).
  - used by <- V01 admin-entity-views (src/views/SiteDetail.tsx:12, 786). Grep-verified; no other consumers.
- Side effects: client-side navigation only.
- Error handling: none — pure presentation over a precomputed summary; no failure paths in this file.
- Tests: none found for the component (grep-verified). Its inputs and href targets are covered by `src/lib/siteDeliverables.test.ts` [L17] and `src/lib/buildActionHref.test.ts` [L13].
- Observed issues:
  - Sort order is `bucket` (blocking → outstanding → not_required → complete) then `DELIVERABLE_ORDER` index (lines 47-49); `bucket` returns 0 for any `blocking` deliverable regardless of status (line 33).
  - Item action label falls back from `item.actionLabel` to the category verb in `ACTION_VERB` (line 100), matching the fallback contract documented in L17 (siteDeliverables.ts:38-40).
  - Status badges use literal glyph strings "✓" / "✕" inside `Badge` (lines 26, 29).
- ASSUMED: nothing.
