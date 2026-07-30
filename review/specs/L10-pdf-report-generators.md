# L10 — pdf-report-generators

- Unit id: L10
- Slug: pdf-report-generators
- Spec mode: full
- Date: 2026-07-29
- Files: 8

## Unit header

**Unit purpose.** This unit is the set of standalone client-side PDF report generators that sit between UI callers (views/components) and the pdfmake foundation (L14): calendar report, compliance overview, floor-plan pins report, Fortress close-out checklist, and blank inspection-template report. It also carries the document design-standards constants module (`documentDesignStandards.ts`, consumed across L14/L15/L08) plus its filename test, and a hardcoded Fortress inspection-template data object (`fortressTemplate.ts`).

**Module-level observations (cross-file facts inside the unit).**
- Two distinct assembly styles coexist. `calendarReportGenerator.ts`, `fortressChecklistReportGenerator.ts` and `inspectionTemplateReportGenerator.ts` delegate to `generateReport` from `pdfEngine` (L14), keep pure row logic in `src/lib/report/*Rows.ts` (L07), use relative `./` imports, and return `{success, blob?, filename?, previewUrl?, error?}` result objects (calendarReportGenerator.ts:76, fortressChecklistReportGenerator.ts:88, inspectionTemplateReportGenerator.ts:75). `complianceReportGenerator.ts` and `floorPlanReportGenerator.ts` instead assemble their own doc definitions via `createBaseDocDefinition`/`buildDocument` + `generatePdfBlob`, use `@/lib/...` absolute imports (complianceReportGenerator.ts:10–35) or mixed (floorPlanReportGenerator.ts:10–25), fetch DB-driven template config through `fetchPDFTemplate` (H04) (complianceReportGenerator.ts:79, floorPlanReportGenerator.ts:79), have no try/catch, and return `{blob, filename}` / `{blob, fileName, complianceChecks}` directly.
- The three pdfEngine-based generators each return `previewUrl: result.previewUrl` (calendarReportGenerator.ts:96, fortressChecklistReportGenerator.ts:108, inspectionTemplateReportGenerator.ts:95), but `generateReport` returns only `{blob, filename, complianceChecks}` with an explicit comment that it intentionally does not create an object URL (src/lib/pdfEngine.ts:806–814); the `previewUrl` field is therefore always `undefined` at runtime, though `GenerateReportResult` types it as optional (src/lib/pdfEngine.ts:105).
- Filename dates diverge from the unit's own standard: `generateDocumentFilename` stamps the LOCAL date via `localDateStamp` (documentDesignStandards.ts:406) and the unit's only test asserts exactly that (documentDesignStandards.filename.test.ts:5–10), but three generators build filenames with the UTC ISO date `new Date().toISOString().split('T')[0]` (complianceReportGenerator.ts:327, floorPlanReportGenerator.ts:445, fortressChecklistReportGenerator.ts:104). All five generators pass explicit filenames, so pdfEngine's default `generateDocumentFilename` path (pdfEngine.ts:784–787) is bypassed by every generator in this unit.
- The gateway-driven generators share an identical `isSectionEnabled` helper that defaults to `true` when a section id is absent from the fetched config (complianceReportGenerator.ts:88–91, floorPlanReportGenerator.ts:88–91), and both `console.log` their applied template config unconditionally (complianceReportGenerator.ts:81–86, floorPlanReportGenerator.ts:81–85).
- Three files locally alias `type Content = any` instead of importing pdfmake types (calendarReportGenerator.ts:16, floorPlanReportGenerator.ts:29, fortressChecklistReportGenerator.ts:18); complianceReportGenerator imports `Content` from pdfMakeConfig (complianceReportGenerator.ts:27).
- `fortressTemplate.ts` and `fortressChecklistReportGenerator.ts` are consumed by the same single component, `src/components/FortressMarkingChecklist.tsx` (C14) (its lines 9 and 11).

**External contract.** The rest of the app gets five async generator entry points — `generateCalendarPdf`, `generateComplianceReport`, `generateFloorPlanReport`, `generateFortressChecklistPdf`, `generateInspectionTemplatePdf` — each producing a PDF `Blob` + filename in-browser; the `DOCUMENT_DESIGN_STANDARDS` constants object + `generateDocumentFilename` helper (consumed by L14 foundation modules, L15's exporter, and L08's asset-verification generator); and `generateFortressTemplate`, a hardcoded checklist-template object literal. `generateComplianceReport` currently has no consumers (grep-verified).

---

## src/lib/calendarReportGenerator.ts

- Purpose: Client-side pdfmake generator for the Calendar report (events grouped by month), replacing a former server PDFShift path (calendarReportGenerator.ts:1–4).
- Public surface:
  - Re-export `type { CalendarReportData, CalendarEvent, CalendarStats } from './report/calendarRows'` (:18).
  - `interface CalendarPdfResult { success: boolean; blob?: Blob; filename?: string; previewUrl?: string; error?: string }` (:20–26).
  - `async generateCalendarPdf(data: CalendarReportData): Promise<CalendarPdfResult>` (:71).
  - Non-exported: `buildContent(data: CalendarReportData): Content[]` (:28).
- Inputs & outputs: In — `CalendarReportData` (title/subtitle/year/events/stats, defined in src/lib/report/calendarRows.ts:30). Out — `CalendarPdfResult` with a PDF `Blob` and filename `Calendar_Report_${data.year}.pdf` (:92). Stores touched indirectly: `settings` table via `loadCompanyBranding` (:73; src/lib/pdfBranding.ts:147). No direct table/bucket/localStorage access in this file.
- Dependencies: uses -> `createKpiRow, createDataTable, createSectionHeader, COLORS` from `./pdfMakeUtils` (:5, L14); `generateReport` from `./pdfEngine` (:6, L14); `loadCompanyBranding` from `./pdfBranding` (:7, L14); `buildCalendarKpis, buildPriorityBreakdown, groupEventsByMonth, buildEventRows` + types from `./report/calendarRows` (:8–14, L07). used by <- V01 admin-entity-views (src/views/Calendar.tsx:55 import, :427 call) (grep-verified).
- Side effects: network reads via `loadCompanyBranding` (Supabase `settings` select + logo fetch, pdfBranding.ts:147, :85) and pdfmake blob rendering inside `generateReport`; `console.error` only when `NODE_ENV === 'development'` (:98–100). No mutations, no events, no subscriptions.
- Error handling: whole body in try/catch (:72–102); on any failure returns `{success: false, error: message}` with dev-only console.error — no throw, no toast (:97–102). Empty `data.events` is handled with an italic "No events scheduled for {year}." paragraph (:41–48).
- Tests: none directly (grep-verified: only src/lib/documentDesignStandards.filename.test.ts exists in this unit). The row logic it delegates to is tested in src/lib/report/calendarRows.test.ts (L07).
- Observed issues:
  - `previewUrl: result.previewUrl` (:96) forwards a field that `generateReport` never returns (pdfEngine.ts:810–814), so it is always `undefined` despite `CalendarPdfResult.previewUrl?: string` (:24).
  - `type Content = any` (:16) discards pdfmake typing.
- ASSUMED: none.

## src/lib/complianceReportGenerator.ts

- Purpose: Generates a multi-section regulatory-compliance overview PDF (KPI dashboard, COC status, expiring certificates, non-compliant items) whose styling/sections come from the DB-driven PDF Template Gateway (complianceReportGenerator.ts:1–8).
- Public surface:
  - `interface ComplianceItem { id: string; name: string; siteName?; cocNumber?; cocStatus?; cocType?; cocIssueDate?; expiryDate?; daysUntilExpiry?; isCompliant?; lastValidated? }` (:37–49).
  - `interface ComplianceReportData { siteName?; clientName?; items: ComplianceItem[]; stats: { total; compliant; nonCompliant; expiringSoon; expired; pendingReview }; companyLogoUrl?: string | null }` (:51–64).
  - `interface ComplianceReportResult { blob: Blob; filename: string }` (:66–69).
  - `async generateComplianceReport(data: ComplianceReportData): Promise<ComplianceReportResult>` (:75–77).
- Inputs & outputs: In — `ComplianceReportData`. Out — `{blob, filename}` where filename is `` `Compliance_Report_${siteName||'All_Sites'}_${UTC date}.pdf` `` (:327). Stores touched indirectly: `pdf_report_templates` table via `fetchPDFTemplate('compliance')` (:79; src/hooks/usePDFTemplateGateway.ts:359) and `settings` table via `loadCompanyBranding` (:94). `data.companyLogoUrl` (:63) is declared but never read in the body.
- Dependencies: uses -> `generatePdfBlob, createSectionHeader, createDataTable, createKpiRow, COLORS, DEFAULT_STYLES` from `@/lib/pdfMakeUtils` (:10–17, L14); `createCoverPage, createPageHeader, createPageFooter, createKpiDashboard, createSpacer` from `@/lib/pdfTemplates` (:18–24, L14); `createBaseDocDefinition, Content` from `@/lib/pdfMakeConfig` (:25–28, L14); `loadCompanyBranding, generateReferenceNumber, formatPdfDate` from `@/lib/pdfBranding` (:29–33, L14); `fetchPDFTemplate` from `@/hooks/usePDFTemplateGateway` (:34, H04); `buildComplianceSummaryRows` from `@/lib/report/complianceRows` (:35, L07). used by <- none found (grep-verified: no import of the file path nor of `generateComplianceReport`/`ComplianceReportData`/`ComplianceReportResult` outside the file itself).
- Side effects: Supabase reads via `fetchPDFTemplate` (:79) and `loadCompanyBranding` (:94); unconditional `console.log` of the applied template config (:81–86); pdfmake blob rendering (:326). No mutations, no events.
- Error handling: no try/catch anywhere; a rejection from `generatePdfBlob` or an unexpected throw propagates to the caller. `fetchPDFTemplate` itself swallows its own errors and returns built-in defaults (usePDFTemplateGateway.ts:399–420), and `loadCompanyBranding` catches and returns cached/default branding (pdfBranding.ts:152–175). Sections missing from config render anyway because `isSectionEnabled` defaults to `true` (:90). Zero-division guarded: `complianceRate` is 0 when `stats.total === 0` (:99).
- Tests: none (grep-verified).
- Observed issues:
  - Zero consumers anywhere in src/ or supabase/ (grep-verified) — an exported generator with no call site.
  - `createKpiRow` (:14) and `DEFAULT_STYLES` (:16) are imported but never used in the body (grep-verified: only import-line hits).
  - Filename uses the UTC ISO date (:327), whereas the unit's own `generateDocumentFilename` + test mandate local-date stamping (documentDesignStandards.ts:406; documentDesignStandards.filename.test.ts:5–10).
  - `data.companyLogoUrl` field (:63) is accepted but unused; branding comes solely from `loadCompanyBranding` (:94–96).
  - Expiring/non-compliant tables bypass the shared `createDataTable` and hand-build pdfmake tables with hardcoded hex colors (`#fef3c7`, `#92400e`, `#fee2e2`, `#b91c1c`, `#fcd34d`, `#fecaca`) (:212–258, :272–310).
- ASSUMED: the generator is dead code retained from the former server-side path — inferred from zero consumers plus the "Replaces the server generate-pdf (PDFShift) path" pattern documented in sibling generators; no doc in this file states it.

## src/lib/documentDesignStandards.filename.test.ts

- Purpose: Vitest for `generateDocumentFilename`, asserting local-date stamping and character sanitization (documentDesignStandards.filename.test.ts:1–15).
- Public surface: none (test module).
- Inputs & outputs: constructs `new Date(2026, 5, 13)` (local midnight, :7) and site names with unsafe characters (:12); asserts the filename contains `2026-06-13` (:8), ends with `.pdf` (:9), and contains no `/ * ?` characters (:13).
- Dependencies: uses -> `describe, it, expect` from vitest (:1); `generateDocumentFilename` from `./documentDesignStandards` (:2, this unit). used by <- none found (grep-verified; test files are consumed only by the vitest runner — `include: ['src/**/*.test.{ts,tsx}']`, vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a (assertions throw on failure under vitest).
- Tests: is itself the unit's only test file.
- Observed issues: none.
- ASSUMED: none.

## src/lib/documentDesignStandards.ts

- Purpose: Master constants object ("design standards") for all PDF reports/exports — logo, margins, typography, colors, images, tables, cards, page breaks, headers/footers, export settings — plus filename/layout helper functions and a reference checklist (documentDesignStandards.ts:1–7).
- Public surface:
  - `const DOCUMENT_DESIGN_STANDARDS` — ~310-line nested constants object with keys `logo, margins, grid, typography, colors, images, tables, charts, cards, icons, bullets, pageBreaks, headers, footers, export, preflight` (:11–323); also the default export (:480).
  - `getContentWidth(): number` — 210 minus left/right margins (:332–335).
  - `getContentHeight(): number` — 297 minus margins/header/footer heights (:340–343).
  - `getSafeImageDimensions(originalWidth: number, originalHeight: number, maxWidth?: number, maxHeight?: number): { width: number; height: number }` (:348–369).
  - `shouldBreakPage(currentY: number, contentHeight: number, pageHeight = 297): boolean` (:374–383).
  - `generateFooterText(currentPage: number, totalPages: number): string` (:388–393).
  - `generateDocumentFilename(documentType: string, siteName: string, date?: Date): string` — sanitizes to `[a-zA-Z0-9-_]`, truncates each part to 50 chars, stamps local date, appends `.pdf` (:398–412).
  - `const DESIGN_CHECKLIST` — 12-entry `{id, task, details}` reference array (:417–478).
- Inputs & outputs: pure module; only external data is `localDateStamp(date)` (:406). No tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `localDateStamp` from `./report/reportKernel` (:9, L07; defined reportKernel.ts:42). used by <- L14 pdf-engine-core (src/lib/pdfEngine.ts:37 and src/lib/pdfMakeUtils.ts:34, both importing `DOCUMENT_DESIGN_STANDARDS, generateDocumentFilename`; src/lib/pdfTemplates.ts:27, src/lib/pdfBranding.ts:10, src/lib/pdfMakeConfig.ts:17 importing `DOCUMENT_DESIGN_STANDARDS`); L15 pdf-report-renderers (src/lib/pdfTemplateExporter.ts:16, `DOCUMENT_DESIGN_STANDARDS`); L08 asset-verification (src/lib/assetVerificationReportGenerator.ts:13, `generateDocumentFilename`); L10 internal (src/lib/floorPlanReportGenerator.ts:24, `DOCUMENT_DESIGN_STANDARDS`; documentDesignStandards.filename.test.ts:2, `generateDocumentFilename`). All grep-verified.
- Side effects: none (pure constants + pure functions).
- Error handling: none — no failure paths; `getSafeImageDimensions` performs unguarded division (`originalWidth / originalHeight`, :358), yielding `NaN`/`Infinity` dimensions for zero-height input rather than an error.
- Tests: src/lib/documentDesignStandards.filename.test.ts covers `generateDocumentFilename` only (local-date stamp, `.pdf` suffix, sanitization). No test touches the constants object or the other five exports.
- Observed issues:
  - Five of the seven named exports have zero importers anywhere: `getContentWidth`, `getContentHeight`, `getSafeImageDimensions`, `shouldBreakPage`, `generateFooterText`, plus `DESIGN_CHECKLIST` (grep-verified across src and supabase); only `DOCUMENT_DESIGN_STANDARDS` and `generateDocumentFilename` are consumed. The default export (:480) likewise has no default-import consumers (grep-verified).
  - Several declared standards are aspirational metadata with no enforcement mechanism in code (e.g. `minDPI: 300` :26, `preflight.checks` :311–322, `export.tagged: true` :303); nothing reads these keys (they exist only inside the object consumed wholesale).
- ASSUMED: the "mm" unit comments on constants (:17–41 etc.) describe intent; actual consumers convert selectively (e.g. `mmToPt` usage in L14) — whether every consumer treats these values as mm was not verified beyond floorPlanReportGenerator (:273–274).

## src/lib/floorPlanReportGenerator.ts

- Purpose: pdfmake generator for floor-plan inspection reports (executive summary, annotated plan image, per-pin detail pages with before/after photos and comments), configured via the DB PDF Template Gateway (floorPlanReportGenerator.ts:1–8).
- Public surface:
  - `interface FloorPlanReportResult { blob: Blob; fileName: string; complianceChecks: PDFComplianceCheck }` (:67–71).
  - `const generateFloorPlanReport = async (data: ReportData): Promise<FloorPlanReportResult>` (:77).
  - Non-exported: `interface Pin` (pin_number, pin_type 'snag'|'observation', status 'open'|'in_progress'|'finished'|'closed'|'resolved', priority?, title?, notes?, detailed_description?, photo_url?, assigned_contractor?, stakeholders?, package?, due_date?, created_at?, updated_at?, edit_history?, rectification_* fields, comments?) (:31–56); `interface ReportData { projectName; siteName; subsectionName; floorPlanUrl; pins: Pin[]; canvasDataUrl? }` (:58–65).
- Inputs & outputs: In — `ReportData` with pins and an optional pre-rendered `canvasDataUrl`; pin `photo_url`/`rectification_photo_url` are embedded directly as pdfmake `image` values (:312, :318, :352). Out — `{blob, fileName, complianceChecks}`; fileName `` `Floor_Plan_Report_${subsectionName}_${UTC date}.pdf` `` (:445). Stores touched indirectly: `pdf_report_templates` via `fetchPDFTemplate('floor_plan')` (:79). No `loadCompanyBranding` call — cover `organizationName` comes from `data.projectName` (:423).
- Dependencies: uses -> `generatePdfBlob, buildDocument, createSectionHeader, createDataTable, createInfoTable, createKpiRow, logComplianceCheck, COLORS, mmToPt, A4_WIDTH_PT, CONTENT_WIDTH_PT, PDFComplianceCheck` from `./pdfMakeUtils` (:10–23, L14); `DOCUMENT_DESIGN_STANDARDS` from `./documentDesignStandards` (:24, this unit; `margins` destructured :27); `fetchPDFTemplate, AccentColors` from `@/hooks/usePDFTemplateGateway` (:25, H04). used by <- C12 floor-plan-annotation (src/components/InteractiveFloorPlan.tsx:13 import, :470 call) (grep-verified).
- Side effects: Supabase read via `fetchPDFTemplate` (:79); unconditional `console.log` of template config (:81–85); `logComplianceCheck` console output (:433–443); pdfmake blob rendering (:430). Mutation of caller data: `data.pins.sort(...)` (:231, :242) sorts the caller's array in place, twice.
- Error handling: no try/catch; any throw (including pdfmake image errors for unreachable `photo_url` values) propagates to the caller. `fetchPDFTemplate` internally falls back to defaults on error (usePDFTemplateGateway.ts:399–420). Division-by-zero guarded via `totalPins = data.pins.length || 1` (:110) and `snagTotal = snags.length || 1` (:151). Missing `canvasDataUrl` silently skips the floor-plan-image section (:205).
- Tests: none (grep-verified).
- Observed issues:
  - `A4_WIDTH_PT` (:20) and `AccentColors` (:25) are imported but never used (grep-verified: import-line hits only).
  - `ReportData.floorPlanUrl` (:62) is declared required but never referenced in the function body (grep-verified: single hit at its declaration).
  - In-place `sort` of `data.pins` mutates the caller's array (:231, :242).
  - Photos are given fixed width AND height (200×150 before/after :312/:318, 300×200 single :352–354), which pdfmake applies without preserving aspect ratio; the unit's own standards declare `maintainAspectRatio: true` (documentDesignStandards.ts:143).
  - Compliance self-report passes `logoPlacement: false` (:435) — the report has no logo path at all (no `loadCompanyBranding`).
  - `fileName` uses UTC ISO date (:445) vs the unit's local-date standard (documentDesignStandards.ts:406).
  - Per-pin detail pages render only inside the `pins-table` section gate (:218–413), so disabling the `pins-table` template section also removes all pin detail pages — the two blocks are not independently gated (single `if` spans :218–413).
- ASSUMED: pin photo URLs are expected to be data URLs or fetchable images by pdfmake at render time; caller-side preparation was not inspected (InteractiveFloorPlan.tsx internals are C12's spec).

## src/lib/fortressChecklistReportGenerator.ts

- Purpose: Client-side pdfmake generator for the Fortress Site Close-Out Checklist, replacing the server PDFShift path; thin assembly + branding glue over unit-tested row logic in L07 (fortressChecklistReportGenerator.ts:1–7).
- Public surface:
  - Re-export `type { FortressChecklistData } from './report/fortressChecklistRows'` (:20).
  - `interface FortressChecklistPdfResult { success: boolean; blob?: Blob; filename?: string; previewUrl?: string; error?: string }` (:22–28).
  - `async generateFortressChecklistPdf(data: FortressChecklistData, options: { siteLogoUrl?: string | null } = {}): Promise<FortressChecklistPdfResult>` (:73–76).
  - Non-exported: `LEVEL_COLOR: Record<StatusLevel, string>` (:30–35); `buildContent(data): Content[]` (:37–71).
- Inputs & outputs: In — `FortressChecklistData` (title/siteName/sections, src/lib/report/fortressChecklistRows.ts:27) and optional `siteLogoUrl`. Out — `FortressChecklistPdfResult`; filename `` `Fortress_Checklist_${sanitized site}_${UTC date}.pdf` `` (:104). Stores touched indirectly: `settings` table via `loadCompanyBranding` (:78); arbitrary image URL fetch via `imageUrlToBase64(options.siteLogoUrl)` (:81).
- Dependencies: uses -> `createKpiRow, createDataTable, createSectionHeader, COLORS` from `./pdfMakeUtils` (:8, L14); `generateReport` from `./pdfEngine` (:9, L14); `loadCompanyBranding, imageUrlToBase64` from `./pdfBranding` (:10, L14); `buildFortressKpis, buildFortressItemRows` + types from `./report/fortressChecklistRows` (:11–16, L07). used by <- C14 reports-dashboards (src/components/FortressMarkingChecklist.tsx:11 import, :258 call) (grep-verified).
- Side effects: network reads (branding settings select; site-logo image fetch when `siteLogoUrl` given; pdfmake render via `generateReport` with type `'checklist'` :89). Dev-only `console.error` on failure (:110–112). No mutations, no events.
- Error handling: whole body in try/catch (:77–114); failure returns `{success:false, error: message}` (:113). A failed site-logo conversion degrades silently: `imageUrlToBase64` returns `null` on error (pdfBranding.ts:85, catch → null) and the company logo is kept (:81–83). Empty `data.sections` renders an italic "No checklist items recorded." paragraph (:46–53).
- Tests: none directly; the KPI/row logic is tested in src/lib/report/fortressChecklistRows.test.ts (L07).
- Observed issues:
  - `previewUrl: result.previewUrl` (:108) is always `undefined` — `generateReport` never returns that field (pdfEngine.ts:810–814).
  - Filename uses UTC ISO date (:104) vs the unit's local-date standard (documentDesignStandards.ts:406).
  - `type Content = any` (:18).
- ASSUMED: none.

## src/lib/fortressTemplate.ts

- Purpose: Returns a hardcoded "FORTRESS - Complete Compliance Inspection" template object (8 sections, ~230 item definitions) transcribed from document 584_FORTRESS-SCOPE_OF_WORKS.docx (fortressTemplate.ts:1–2).
- Public surface: `const generateFortressTemplate = () => {...}` (:4) — no parameters; returns a fresh object literal `{ name, category: "General", description, sections: [{ id, name, order_index, items: [{ id, name, type, required, options? }] }] }` (:5–360). Item `type` values used: `checkbox`, `textarea`, `number`, `text`, `image`, `select` (e.g. :17, :18, :38, :51, :42, :106); `select` items carry an `options` string array (:106, :185).
- Inputs & outputs: no inputs; output is the pure data object. Section ids: `rmu_compliance` (:12), `miniature_substations` (:59), `main_distribution_boards` (:128), `earthing_lightning` (:179), `electrical_meters` (:196), `line_shop_boards` (:226), `lighting_power` (:278), `issue_resolution` (:326). No stores, env vars, or persistence.
- Dependencies: uses -> nothing (zero imports). used by <- C14 reports-dashboards (src/components/FortressMarkingChecklist.tsx:9 import, :56 `const template = generateFortressTemplate()`) (grep-verified).
- Side effects: none — pure function returning a new literal each call.
- Error handling: none — cannot fail.
- Tests: none (grep-verified).
- Observed issues:
  - Data-in-code: ~360 lines of checklist content live in source rather than in the `inspection templates` storage the app otherwise manages (factual: this is a function-wrapped literal with a single consumer).
  - The returned shape (`sections[].items[].{id,name,type,required}`) is structurally similar to `InspectionTemplateData` (src/lib/report/inspectionTemplateRows.ts:18) but uses `name` where that type uses `title`/`label`; no shared type ties them (this file declares no types at all).
- ASSUMED: none.

## src/lib/inspectionTemplateReportGenerator.ts

- Purpose: Client-side pdfmake generator for a blank Inspection Template structure report (template meta + per-section field tables) — a report type that previously fell through to a generic site summary on the server (inspectionTemplateReportGenerator.ts:1–7).
- Public surface:
  - Re-export `type { InspectionTemplateData } from './report/inspectionTemplateRows'` (:19).
  - `interface InspectionTemplatePdfResult { success: boolean; blob?: Blob; filename?: string; previewUrl?: string; error?: string }` (:21–27).
  - `async generateInspectionTemplatePdf(data: InspectionTemplateData): Promise<InspectionTemplatePdfResult>` (:67–69).
  - Non-exported: `buildContent(data): Content[]` (:29).
- Inputs & outputs: In — `InspectionTemplateData` (templateName/title/subtitle/category/description/sections, src/lib/report/inspectionTemplateRows.ts:18). Out — `InspectionTemplatePdfResult`; filename `` `${sanitized templateName}_Template.pdf` `` (:91, no date component). Stores touched indirectly: `settings` table via `loadCompanyBranding` (:71).
- Dependencies: uses -> `createInfoTable, createDataTable, createSectionHeader, COLORS` from `./pdfMakeUtils` (:8, L14); `generateReport` from `./pdfEngine` (:9, L14, invoked with type `'generic'` :76); `loadCompanyBranding` from `./pdfBranding` (:10, L14); `buildTemplateMeta, buildTemplateItemRows` + type from `./report/inspectionTemplateRows` (:11–15, L07). used by <- V02 admin-ops-and-template-views (src/views/InspectionTemplates.tsx:19 import, :391 call) (grep-verified).
- Side effects: network reads via `loadCompanyBranding`; pdfmake blob render via `generateReport`; dev-only `console.error` on failure (:97–99). No mutations, events, or subscriptions.
- Error handling: whole body in try/catch (:70–101); failure returns `{success:false, error: message}` (:100). Empty/missing `data.sections` renders "This template has no sections defined." (:39–47); missing section title falls back to `'Section'` (:50).
- Tests: none directly; row/meta logic tested in src/lib/report/inspectionTemplateRows.test.ts (L07).
- Observed issues:
  - `previewUrl: result.previewUrl` (:95) is always `undefined` — `generateReport` never returns that field (pdfEngine.ts:810–814).
  - `type Content = any` (:17).
  - Unlike the four sibling generators, the filename carries no date (:91).
- ASSUMED: none.
