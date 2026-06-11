# Flow — PDF / Report Generation Pipeline

Ground-truth, code-cited trace of how reports are generated, where their config comes from, and where
the output lands. Every claim cites `src` path `:line`, an edge-function path, a migration, or an earlier
system-reference chapter. Inferred-but-unconfirmed points are marked **⚠️ UNVERIFIED**.

Scope: the client-side rendering path (`pdfEngine`, `siteSummaryRenderSpec`, `SiteSummaryReport`,
`GenerateFinalReportButton`, `wysiwygPdfGenerator`, `pdfmake*` / `pdfMakeConfig`, the `src/lib/*ReportGenerator`
generators) **and** the two surviving server-side edge functions (`generate-pdf`, `generate-inspection-pdf`).
The four other PDF/DOCX edge functions still have **source in the repo** but were **deleted from prod**
(GAPS [G-SEC-12 progress note](../GAPS.md), 2026-06-11: "7 dead anon-reachable fns DELETED" incl.
`generate-pdf-google/-browserless/-pdfmake`, `generate-docx-report`). Their behaviour is documented in
[05-edge-functions/pdf-generation.md](../05-edge-functions/pdf-generation.md) and not re-derived here.

---

## 0. Architecture in one paragraph

There are **two parallel rendering strategies** that both end up writing a PDF into the public `documents`
storage bucket and inserting a row into `site_documents` / `subsection_documents`:

1. **Client-side pdfmake** — the browser builds a pdfmake document definition and produces the `Blob`
   locally (`src/lib/pdfEngine.ts:884` `generateReport`; `src/lib/pdfMakeConfig.ts` for fonts/page config),
   then the client uploads it via `savePDFToDocuments` (`src/lib/pdfDocumentSaver.ts:20`). Used by Site
   Summary, Floor Plan, Asset Verification, and the (client) inspection generator.
2. **Server-side edge function** — the browser POSTs structured data to an edge function which builds HTML,
   renders it via an external headless-Chrome service (PDFShift / Browserless), uploads to `documents`, and
   (for site reports) inserts the document row **server-side with the service-role key** (RLS bypassed). Used by
   `GenerateFinalReportButton` (Site Summary → `generate-pdf` via `useServerPdfGeneration`),
   `useUnifiedPdfGeneration` (fortress-checklist / site-drawing / calendar / inspection-template → `generate-pdf`),
   and the inspection PDFShift path (`generate-inspection-pdf`).

A **template gateway** (`pdf_report_templates` table + `usePDFTemplateGateway`/`fetchPDFTemplate`) is meant to
be the single config source for every report (`docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md`). It controls
cover text, accent colour, and section visibility/order. The gateway is consulted by the *client-side*
generators; the two edge functions do **not** read `pdf_report_templates` (they take cover/accent fields in
the request body). There is a third, simpler `usePDFTemplate` hook (`src/hooks/usePDFTemplate.ts`) used by the
template-manager UI.

A third rendering strategy exists for one screen only: **WYSIWYG html2canvas → jsPDF**
(`src/lib/wysiwygPdfGenerator.ts`), used by the inspection-report preview.

---

## 1. Report types and their renderers (caller-verified)

| Report type | Renderer file | Strategy | Reads template gateway? | Output sink | Live caller(s) |
|---|---|---|---|---|---|
| **Site Summary** ("Generate Final Report") | `generate-pdf` edge fn (HTML→PDFShift) | server | no (body fields) | `documents` + `site_documents` (server) | `GenerateFinalReportButton.tsx:493` → `useServerPdfGeneration.ts:121` |
| **Site Summary** ("Generate PDF" preview) | `src/components/SiteSummaryReport.tsx:229` → `pdfEngine.generateReport` | client pdfmake | yes (`fetchPDFTemplate('site_summary')`, `:157`) | `documents` + `site_documents` (client, `savePDFToDocuments`) | `SiteReports.tsx:212` (renders `GenerateFinalReportButton`, not `SiteSummaryReport`) — see note |
| **Inspection** (PDFShift) | `generate-inspection-pdf` edge fn (HTML→Browserless) | server | no (body fields) | `documents` + `subsection_documents` (server) | `pdfshiftInspectionReport.ts:252` ← `TemplateBasedReport.tsx:231`, `BulkInspectionReportGenerator.tsx:346` |
| **Inspection** (client pdfmake) | `pdfmakeInspectionReport.ts:1547` `generateAndSaveInspectionReportPdfmake` | client pdfmake | ⚠️ UNVERIFIED (not via gateway hook) | `documents` + `subsection_documents` (client) | only via `inspectionReportGenerator.ts:198` — which has **no caller** (dead, see §7) |
| **Inspection** (WYSIWYG) | `wysiwygPdfGenerator.ts:26` `generatePdfFromPages` | html2canvas+jsPDF | no | client blob only (download) | `InspectionReportPreview.tsx:143` |
| **Floor Plan** | `floorPlanReportGenerator.ts:77` `generateFloorPlanReport` | client pdfmake | yes (`fetchPDFTemplate('floor_plan')`, `:79`) | `documents` + `subsection_documents` (client) | `InteractiveFloorPlan.tsx:472` |
| **Asset Verification** | `assetVerificationReportGenerator.ts:140` `generateInspectionBasedReport` | client pdfmake | yes (`fetchPDFTemplate('asset_verification')`, `:146`) | `documents` + `subsection_documents` (client) | `AssetComparisonTable.tsx:339` |
| **Compliance** | `complianceReportGenerator.ts:74` `generateComplianceReport` | client pdfmake | yes (`fetchPDFTemplate('compliance')`, `:78`) | n/a (returns blob; caller would save) | **no caller** in `src` (dead, see §7) |
| **Fortress Checklist / Site Drawing / Calendar / Inspection Template** | `generate-pdf` edge fn (HTML→PDFShift) | server | no (body fields) | `documents` (+`site_documents` only when `siteId` set) | `useUnifiedPdfGeneration.ts:245/291` ← `FortressMarkingChecklist.tsx:38`, `SiteDrawingReport.tsx:42`, `Calendar.tsx:259`, `InspectionTemplates.tsx:304` |
| COC Validation | (referenced by gateway as `coc_validation`) | — | — | — | no `cocValidationPdfGenerator.ts` file exists (gatekeeper doc lists it "Not integrated") |

**Note on the Site-Summary duplication:** `SiteReports.tsx:212` renders `GenerateFinalReportButton`
(server/`generate-pdf` path), **not** the `SiteSummaryReport` component. `SiteSummaryReport.tsx` (client pdfmake
path) is referenced only in a comment in `SiteExport.tsx:91` ("will be passed to SiteSummaryReport or called
directly"). So the *live* Site-Summary button is the server path; the client `SiteSummaryReport` component's
render route is **⚠️ UNVERIFIED** (no JSX caller found). Both are documented because both are complete code paths.

---

## 2. The template gateway (config source)

**Table.** `pdf_report_templates` — one default row per `report_type`; `customization` + `sections` are JSONB
holding the render config ([tables-03.md:245-281](../02-data-model/tables-03.md)). 9 call sites; representative
writer `PDFTemplateManager.tsx:563`.

**RLS** ([rls-policies-03.md:18-32](../02-data-model/rls-policies-03.md)):
- **anon** — no access (both policies gate via `auth.uid()`/`has_role`).
- **authenticated** — SELECT **all** rows (qual `auth.uid() IS NOT NULL`, **no tenant scoping**); writes only if `has_role(auth.uid(),'Admin')`.
- **service_role** — full (RLS bypass).
- Not touched by the 2026-06-11 tier-2 lockdown (SELECT qual is `auth.uid() IS NOT NULL`, not `true`).

**Read paths.**
- `usePDFTemplateGateway(reportType)` (`src/hooks/usePDFTemplateGateway.ts:225`) — hook form; queries
  `pdf_report_templates` filtered `report_type` + `is_default=true`, `.single()` (`:235-240`). On `PGRST116`
  (no row) or any error it falls back to the **hard-coded `DEFAULT_TEMPLATES`** map (`:80-194`, fallbacks at
  `:244-248`, `:280-294`).
- `fetchPDFTemplate(reportType)` (`:352`) — async/non-hook form, same query (`:360-365`); on error returns
  `DEFAULT_TEMPLATES` defaults (`:401-419`). This is the form the client generators call.
- `usePDFTemplate(reportType)` (`src/hooks/usePDFTemplate.ts:15`) — a third, thinner hook used by the
  template-manager UI; same query (`:26-31`).

**Net gateway behaviour:** the config is *advisory*. If the DB row is missing or the read fails (incl. an
unauthenticated context where the SELECT is RLS-denied → treated as error → defaults), generation **still
proceeds** with built-in defaults. There is no hard gate; the "MANDATORY entry point" in the file header
(`usePDFTemplateGateway.ts:3`) is a convention, not an enforced one.

**Write path (template authoring).** `PDFTemplateManager.tsx` updates `pdf_report_templates`
(`:629-630`, `:656-657`, `:682`). DB-side, only Admin can write (RLS above). The Manager route's
`adminOnly` UI flag is cosmetic only per [SECURITY-FINDINGS-phase2.md §B.3](../SECURITY-FINDINGS-phase2.md)
(`/pdf-template-tests` etc.), but the **RLS Admin gate on the table is real** — non-Admin writes are
DB-denied. (Contrast `settings`/`inspection_templates`, which are *not* Admin-gated — see G-SEC-12.)

---

## 3. Step sequence — Site Summary "Generate Final Report" (the LIVE button, server path)

Actor: an authenticated staff user (Admin or `User`; reachable from `SiteReports.tsx:212`).

1. **User clicks "Generate Final Report"** → opens dialog → `handleOpenDialog` (`GenerateFinalReportButton.tsx:409`)
   calls `fetchComprehensiveData()` to populate the preview stats.
2. **Client data fetch** (`fetchComprehensiveData`, `:84-407`) — under the **caller's session/RLS**, reads
   (all `.eq('site_id', site.id)` or `.in('subsection_id', …)`):
   - `subsections` (`:88`), `snags` (`:114`), `settings` (`:116` — `qr_base_url, company_logo_url, primary_color`),
     `site_assets` (`:117`), `site_marking_checklist` (`:118`), `site_documents` (`:119`),
     `subsection_documents` (`:121`), `inspections` (`:123`), `coc_validations` (`:126`).
   - Tables/RLS per [02-data-model](../02-data-model/) — note the tree is "any authenticated" readable post
     tier-2 (G-SEC-13), so this read is **not tenant-bounded at the DB**; the only scoping is the `.eq`/`.in`
     filters in this function.
3. **Client computes health/compliance** entirely in this function:
   - per-subsection compliance: `calculateSubsectionCompliance` (`:60-81`) — non-compliant if a required COC
     isn't `Approved|Valid|Pass`, or required+metering-missing, or any **open** snag (open = status not in
     `['rectified','closed']`, `:22-24`).
   - `summaryStats` (`:213-225`), `healthMetrics` (`:386-391` — overallHealth = compliant/total, cocCompliance,
     meteringData, snagFree), `categoryHealth` (`:238-242`), `assetVerification` (meter-serial matching vs
     `inspections.json_data.tenants`, `:301-356`), `fortressChecklist` (`:358-383`), `documentsSummary` (`:255-258`).
4. **User clicks "Generate PDF"** → `handleGenerate` (`:423`). Re-fetches data (`:427`), re-reads
   `settings.qr_base_url` (`:430-433`); if `coc-annexes` section enabled, fetches detailed `coc_validations`
   joined to `subsections` (`:447-468`).
5. **Sets up a download handoff** `createPendingDownloadHandoff()` (`:424`, `downloadHandoff.ts:210`) — a
   pre-opened tab/placeholder so the eventual download survives mobile/Capacitor async (offline-adjacent UX
   handling, not an offline queue).
6. **Calls the edge function** via `useServerPdfGeneration.generatePdf` (`:493`) →
   `supabase.functions.invoke('generate-pdf', { body: data })` (`useServerPdfGeneration.ts:121`). The body
   carries `reportType:'site-summary'`, `siteId`, `siteName`, computed `subsections`/`summaryStats`/`healthMetrics`/
   etc., `enabledSections`, optional `cocAnnexes`. `invoke` attaches the caller's session JWT (or anon key when
   logged out) but the handler ignores it (see §6).
7. **Edge function `generate-pdf`** (`supabase/functions/generate-pdf/index.ts`, handler `:2832`):
   - builds Site-Summary HTML (`switch` on `reportType`, default `generateSiteSummaryHTML`, `:2857-2934`);
   - POSTs to PDFShift `https://api.pdfshift.io/v3/convert/pdf` (`:2971`) with `PDFSHIFT_API_KEY` (`:2838`);
   - downloads referenced images from storage (service-role) to embed;
   - **uploads the PDF** to `documents` at `site-reports/{siteId}/{filename}` (`:3016-3026`, `upsert:false`);
   - **INSERTs `site_documents`** `{ site_id, file_name, file_url, category }` with `site_id` **taken verbatim
     from the request body**, service-role → RLS bypassed (`:3045-3052`); insert failure is logged, non-fatal (`:3054`);
   - returns `{ success, url, filename, storagePath, debugHtmlUrl }` (`:3062`).
   - (All edge-fn facts per [05-edge-functions/pdf-generation.md](../05-edge-functions/pdf-generation.md).)
8. **Client receives `result.url`** (`useServerPdfGeneration.ts:121-142`); progress → 100; toast "Report saved".
9. **Download** — `completeDownloadHandoff(pendingDownload, { fileName, url })` (`:517`) or
   `downloadFile(result.url, result.filename)` (`:522`). The URL is a **public** `documents` URL (bucket
   `public=true`), so it is world-readable.
10. **Refresh** — `onReportSaved()` (`:530`) re-queries the document list. The new `site_documents` row makes
    the report appear in `SiteReports.tsx`.

**Error paths.** Missing `PDFSHIFT_API_KEY` → edge fn 500 "service not configured"
([pdf-generation.md:80](../05-edge-functions/pdf-generation.md)). `invoke` error or no `url` →
`useServerPdfGeneration.ts:127-134` throws → toast "PDF generation failed". Data-fetch throw in `handleGenerate`
→ caught `:532`, logged, dialog stays. `site_documents` insert failure is **swallowed server-side** (`:3054`),
so the PDF can exist in storage with **no DB record** (orphaned file).

---

## 4. Step sequence — Site Summary client pdfmake path (`SiteSummaryReport.tsx`)

Actor: authenticated staff. (Render route ⚠️ UNVERIFIED — see §1 note.)

1. **`handlePreview`** (`SiteSummaryReport.tsx:735`) → `generatePdfDocument` (`:229`).
2. **Template gateway** `fetchTemplateConfig` → `fetchPDFTemplate('site_summary')` (`:157`); merges over
   `DEFAULT_CUSTOMIZATION`/`DEFAULT_SECTIONS` (`:159-160`). Reads `pdf_report_templates` under caller RLS.
3. **Data fetch** under caller RLS: `sites` (+`clients`) (`:251`), `subsections` (`:252`), `inspections`
   (`:262`), `site_documents` (`:263`), `subsection_documents` (`:266`), `settings.qr_base_url` (`:268`),
   `site_assets` (`:269`), `site_marking_checklist` (`:270`), `snags` (`:279`), `coc_validations` (`:284`).
4. **Compute metrics** via `siteSummaryRenderSpec.ts`: `calculateMetrics` (`:303`), `calculateAssetMetrics`
   (`:306`), `calculateFortressMetrics` (`:310`), `calculateCategoryHealth` (`:350`), `calculateDocumentMetrics`
   (`:369`). Same compliance definition (open snag = not rectified/closed, `:50-51`; strict multi-point check
   `:112-133`). `siteSummaryRenderSpec.ts` is the declared **single source of truth** shared between the live
   preview and the PDF (`:1-20`).
5. **Build pdfmake content** by iterating `getEnabledSections(sections)` (`:247`), switch per section id
   (`:333-688`) using spec constants (`HEALTH_METRICS_CARDS`, `SUMMARY_STAT_ROWS`, `COC_VALIDATION_COLUMNS`, …)
   and `pdfEngine`/`pdfMakeUtils` builders (`createSectionHeader`, `createKpiRow`, `createDataTable`, …).
   Subsection grid via `renderSubsectionGrid` (`pdfSubsectionRenderer.ts`, `:447`).
6. **Branding** `loadCompanyBranding()` (`:692`, `pdfBranding.ts`); client logo via `imageUrlToBase64`
   (`:697-701`).
7. **Render** `generateReport({ type:'site-summary', content, coverPage, options })` (`pdfEngine.ts:884`) →
   pdfmake `generatePdfBlob` (`pdfMakeConfig`) → returns `{ blob, filename, complianceChecks, previewUrl }`.
   `logComplianceCheck` here is **cosmetic** ("compliance" = PDF *layout* standards: cover page, margins,
   headers — `pdfEngine.ts:937-948`; not regulatory COC compliance).
8. **Preview** `DocumentPreviewDialog` shows the blob (`:800`). In-app viewer per memory note
   (esite-inapp-viewers) — opens in a contained modal, not a new tab.
9. **Save** `handleSaveToDocuments` (`:749`) → `savePDFToDocuments({ blob, fileName, siteId, categoryName })`
   (`pdfDocumentSaver.ts:20`):
   - find/create `site_document_categories` row (`:48-71`) under caller RLS;
   - **client upload** to `documents` at `{siteId}/{category}/{ts}-{file}` (`:78-83`);
   - `getPublicUrl` (`:87`);
   - **INSERT `site_documents`** `{ site_id, category_id, file_name, file_url, category }` (`:92-100`) under
     **caller RLS** (contrast the server path, which bypasses RLS).

---

## 5. Step sequence — Inspection PDFShift path (`generate-inspection-pdf`, live)

Actor: authenticated staff. Callers: `TemplateBasedReport.tsx:231` (single),
`BulkInspectionReportGenerator.tsx:346` (bulk, via `generateAndSavePdfShiftInspectionReport`).

1. **Caller assembles `InspectionReportData`** (sections/items/tenants/snags/signatures) and calls
   `generatePdfShiftInspectionReport(options)` (`pdfshiftInspectionReport.ts:199`).
2. **`supabase.auth.getUser()`** (`:207`) — fetches the current user id (used only to set `userId` in the body;
   no authorization decision is made client-side).
3. **Image embedding is intentionally skipped client-side** — `embedAllImages` early-returns the input
   unchanged (`:182-188`, "CRITICAL FIX: Skip client-side embedding to avoid 6MB payload limit"); the edge fn
   downloads/resizes images server-side.
4. **Builds payload** incl. `subsectionId` and **`userId: user?.id`** (`:227-248`) and calls
   `supabase.functions.invoke('generate-inspection-pdf', { body: payload })` (`:252`).
5. **Edge function `generate-inspection-pdf`** (handler `:1698`):
   - builds inspection HTML; POSTs to Browserless `https://chrome.browserless.io/pdf` (`:1556`) with
     `BROWSERLESS_API_KEY` (`:25`);
   - **uploads PDF** to `documents` at `inspection-reports/{fileName}` (`uploadToStorage`, `:1597-1622`, `upsert:true`);
   - if `subsectionId` present (`saveDocumentRecord`, `:1629-1692`): find/INSERT `document_categories`
     (`{subsection_id, name:'Inspection Reports', order_index:0}`, `:1641-1660`); INSERT `subsection_documents`
     `{subsection_id, category_id, file_name, file_url, uploaded_by: userId||null}` (`:1669-1677`) — all with
     **service-role** (RLS bypassed), `subsectionId` and `uploaded_by` **body-supplied**;
   - returns `{ success, url, fileName, documentId }` (`:1773`).
   - (Facts per [05-edge-functions/pdf-generation.md](../05-edge-functions/pdf-generation.md).)
6. **Client returns** `{ success, url, filename, previewUrl }` (`:275-281`). `generateAndSavePdfShiftInspectionReport`
   (`:295`) requires a logged-in user (`:310-313`) and relies entirely on the **server-side** document persistence
   (`:327`).

**Why server-side persistence:** comment at `:316-317` — "ensures the document is saved even if the client
connection times out." This is the deliberate reason the privileged insert lives in the edge fn.

---

## 6. Trust boundaries / data integrity

### Read boundary (client generators)
All client generators read the site/subsection tree under the **caller's** session, but post-tier-2 the tree
is `auth_read_* USING(true)` (any authenticated user reads any tenant — G-SEC-13). So a logged-in user can
generate a report for **any** `siteId`/`subsectionId` they name; the only scoping is the client-side
`.eq`/`.in` filters. The PDF then aggregates cross-tenant-readable data into a public file.

### Write boundary — two different models for the *same* sink
- **Client path** (`savePDFToDocuments`, `pdfmakeInspectionReport` saver, floor-plan/asset paths): the upload and
  the `site_documents`/`subsection_documents` INSERT run under the **caller's** session → subject to whatever
  RLS those tables have. `uploaded_by` is set to the real `user.id` (`pdfmakeInspectionReport.ts:1628`).
- **Server path** (`generate-pdf`, `generate-inspection-pdf`): upload + INSERT run with **service-role**, RLS
  bypassed, keyed on **body-supplied** `siteId`/`subsectionId`, and `uploaded_by`/attribution is
  **client-asserted** (`userId` from body, `generate-inspection-pdf:1676`). Anyone who can reach the function
  (no auth required — see below) can attach an arbitrary `file_url` to any site/subsection.

### Storage sink — public + anon read/write
All paths write the **`documents`** bucket, which is `public=true`
([triggers-enums-storage.md:112](../02-data-model/triggers-enums-storage.md)) and governed by blanket
`storage.objects` policies *"Anyone can view/upload/update/delete all storage"* `USING(true)` for role
`public`/anon (`triggers-enums-storage.md:137-140`; effective post-`20251120083932`). Net (GAPS G-SEC-14):
every report URL is **world-readable**, and any anon caller can **overwrite or delete** any report object. The
2026-06-11 tier-2 lockdown filtered `schemaname='public'` only and did **not** touch storage
(`triggers-enums-storage.md:172`).

### Template-config integrity
`pdf_report_templates` writes are Admin-gated at the DB (rls-policies-03.md:24, real gate), but **reads are
not tenant-scoped** (any authenticated user reads every template). Templates are global, not per-tenant — there
is no `client_id`/`site_id` on the table, so a single org-wide config is the design intent. Since the gateway
*falls back to hard-coded defaults* on any read failure, a deleted/missing template silently changes output
rather than blocking it.

### Compliance computation — where the "truth" is
- Site-Summary **health/compliance numbers are computed client-side** (`GenerateFinalReportButton.tsx:60-391`
  and `siteSummaryRenderSpec.ts`), then either (a) embedded in the body sent to `generate-pdf`, or (b) rendered
  directly by the client pdfmake path. The edge fn does **not** recompute compliance; it trusts the supplied
  numbers. So report compliance figures are only as trustworthy as the client that produced them.
- `pdfEngine.logComplianceCheck` (`pdfEngine.ts:937`) is **PDF layout** compliance (cover page, margins,
  headers), unrelated to SANS/COC compliance — easy to conflate.

### Offline behaviour
No PDF path has an offline queue. `GenerateFinalReportButton` uses a **download handoff**
(`downloadHandoff.ts:210/228`) to keep a pre-opened target alive across the async round-trip (a
mobile/Capacitor download reliability shim), but the edge-fn call itself requires network. The client pdfmake
paths build the blob locally (no render service) but still need network to **save** (storage upload + DB insert).
WYSIWYG (`wysiwygPdfGenerator.ts`) builds entirely client-side and only downloads — it is the only fully-offline-capable
render, but it does not persist.

---

## 7. Dead / orphaned code in this pipeline (for the register)

- **`generate-pdf-google` / `-browserless` / `-pdfmake`, `generate-docx-report`** — source still in
  `supabase/functions/` but **deleted from prod** (GAPS G-SEC-12 progress, 2026-06-11). No in-repo caller
  ([pdf-generation.md:50-58](../05-edge-functions/pdf-generation.md)). `pdfshiftInspectionReport.ts`'s header
  comment still describes a DOCX/PDFShift flow that no longer matches the deployed reality.
- **`complianceReportGenerator.generateComplianceReport`** (`complianceReportGenerator.ts:74`) — **no caller**
  in `src`. Fully built, gateway-integrated, unused.
- **`inspectionReportGenerator.generateAndSaveInspectionReport`** (`inspectionReportGenerator.ts:35`) — **no
  caller** in `src`. Its dependency `pdfmakeInspectionReport.generateAndSaveInspectionReportPdfmake` (the
  client pdfmake inspection saver, `:1547`) is reachable only through it, so that whole client-pdfmake
  inspection path is currently dead; the live inspection path is the PDFShift edge fn (§5).
- **`assetVerificationReportGenerator.generateAssetVerificationReport`** (`:466`) — a second exported entry
  alongside the live `generateInspectionBasedReport` (`:140`); **no caller** in `src` (only
  `generateInspectionBasedReport` is imported, by `AssetComparisonTable.tsx:32`). Dead.
- A duplicate `InspectionTemplateReportData` interface is declared twice in `useUnifiedPdfGeneration.ts`
  (`:174` and `:191`) — harmless redeclaration, flagged for the dead-code register (G-TEST-06).

---

## 8. Security flags (this flow)

See §6 for evidence. These overlap the Phase-2 inventory (re-cited, not re-derived):

- **HIGH** `generate-pdf` edge fn — anon-reachable (`verify_jwt=false`, config.toml:44), service-role
  `site_documents` INSERT keyed on **body-supplied `siteId`** with no caller authz; attach arbitrary PDF URL to
  any site (`generate-pdf/index.ts:3045`; [pdf-generation.md:92-96](../05-edge-functions/pdf-generation.md);
  GAPS G-SEC-12).
- **HIGH** `generate-inspection-pdf` edge fn — anon-reachable (`verify_jwt=false`, config.toml:74), service-role
  INSERT into `document_categories`/`subsection_documents` keyed on **body `subsectionId`**, and **`uploaded_by`
  spoofable** (body `userId`) (`index.ts:1654,1672,1676`; [pdf-generation.md:129-135](../05-edge-functions/pdf-generation.md)).
- **HIGH** `documents` storage bucket — `public=true` + blanket anon SELECT/INSERT/UPDATE/DELETE
  `storage.objects` `USING(true)`; every generated report is world-readable AND anon-overwritable/deletable; all
  six PDF functions and all client save paths write here (triggers-enums-storage.md:112,137-140; GAPS G-SEC-14).
- **MEDIUM** Trust-the-client compliance figures — Site-Summary health/compliance is computed in the browser
  (`GenerateFinalReportButton.tsx:60-391`) and the `generate-pdf` edge fn renders the supplied numbers without
  recomputation; a tampered client can emit a report showing any compliance rate.
- **MEDIUM** Cross-tenant report generation — post-tier-2 the site/subsection tree is `USING(true)` readable by
  any authenticated user (G-SEC-13), so a logged-in user can generate (and via the client save path, persist) a
  report for any tenant's `siteId`/`subsectionId`; the only scoping is client-side `.eq` filters
  (`GenerateFinalReportButton.tsx:88-127`).
- **LOW** Orphaned storage objects — `generate-pdf` swallows `site_documents` INSERT failures (`index.ts:3054`),
  leaving PDFs in the public bucket with no DB row and no cleanup.
- **LOW** Dead-but-source-present render fns (`complianceReportGenerator`, client inspection saver chain,
  `generate-*` edge sources) widen the maintenance/attack surface and contradict the deployed reality; the four
  `generate-*` edge sources remain in the repo though deleted from prod.
