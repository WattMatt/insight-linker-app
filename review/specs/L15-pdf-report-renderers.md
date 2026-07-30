# L15 — pdf-report-renderers

- Unit id: L15
- Slug: pdf-report-renderers
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 8 (per review/unit-files.json key "L15")

## Unit header

**Unit purpose (as-is).** This unit contains the concrete client-side PDF renderers that sit on top of the L14 pdfmake foundation: the 1,598-line professional inspection report generator, the subsection compliance-card renderer with its shared card spec, and the site-summary render specification (layout constants + pure metric calculators) that both the React preview and the PDF generator consume. It also contains the PDF-template tooling pair (export a TemplateData structure to PDF; extract a template structure from an uploaded PDF via pdfjs-dist) and an in-app, non-vitest diagnostic test harness for the PDF template gateway.

**Module-level observations (cross-file facts inside the unit).**
- The unit splits into two clusters with no imports between them: (a) report rendering — pdfmakeInspectionReport.ts, pdfSubsectionRenderer.ts, subsectionCardSpec.ts, siteSummaryRenderSpec.ts (+ its test); (b) template tooling — pdfTemplateExporter.ts, pdfTemplateExtractor.ts, pdfTemplateTestRunner.ts. Cluster (b)'s test runner imports cluster (a)'s siteSummaryRenderSpec (pdfTemplateTestRunner.ts:14–28), which is the only in-unit link across the clusters.
- Two different exported constants named `STATUS_COLORS` exist inside the unit: siteSummaryRenderSpec.ts:37 (success/warning/error/info/muted hex strings) and subsectionCardSpec.ts:70 (pass/fail/pending/compliant/nonCompliant {bg,text,border} objects). subsectionCardSpec re-exports types from siteSummaryRenderSpec (subsectionCardSpec.ts:13) but defines its own colors.
- pdfmake content is untyped throughout: pdfmakeInspectionReport.ts:27 declares `type Content = any`; pdfSubsectionRenderer's two exports return `Promise<any>` (pdfSubsectionRenderer.ts:26, :422); pdfTemplateExporter/pdfTemplateExtractor build `any[]` content arrays (pdfTemplateExporter.ts:87, pdfTemplateExtractor.ts:418).
- Unused imports recur: pdfmakeInspectionReport.ts:15–18, :21 (5 symbols), pdfTemplateExporter.ts:10–16 (5 symbols), siteSummaryRenderSpec.ts:22 (`ReportCustomization`), pdfTemplateTestRunner.ts:12 (`ReportCustomization`) — each verified by grep to appear only in the import statement.
- Exactly one vitest file exists in the unit (siteSummaryRenderSpec.test.ts) and it covers only three calculator functions of siteSummaryRenderSpec.ts. The other six source files have no vitest coverage (grep across src/**/*.test.*); pdfTemplateTestRunner.ts instead ships a runtime test suite inside the app bundle.
- The `RISK_COLORS` map (subsectionCardSpec.ts:78–82) has lowercase keys `high/medium/low`, while `SnagData.riskLevel` is typed `'High' | 'Medium' | 'Low' | null` (siteSummaryRenderSpec.ts:296); both lookups against it inside the unit (pdfSubsectionRenderer.ts:284, subsectionCardSpec.ts:229) rely on a `|| RISK_COLORS.low` fallback.

**External contract (what the rest of the app gets from this unit).**
- Inspection report PDF generation + save-to-storage: `generateInspectionReportPdf` / `generateAndSaveInspectionReportPdfmake` consumed by C14 (src/components/ComprehensiveInspectionReport.tsx:11) and C07 (src/components/site/BulkInspectionReportGenerator.tsx:24).
- Subsection card grid content for the site-summary PDF: `renderSubsectionGrid` consumed by C14 (src/components/SiteSummaryReport.tsx:49).
- Shared WYSIWYG spec: siteSummaryRenderSpec constants/calculators consumed by C14 (SiteSummaryReport.tsx:47) and L14 (src/lib/pdfMakeUtils.ts:36); subsectionCardSpec constants/helpers consumed by C17 (src/components/pdf-preview/SubsectionCard.tsx:9–18).
- Template export/extract for the template-management UI: consumed by C15 (src/components/PDFTemplateExportDialog.tsx:12–16, src/components/PDFTemplateUploader.tsx:14).
- Runtime diagnostics: `runPDFTemplateTests` consumed by V02 (src/views/PDFTemplateTestDashboard.tsx:32).

---

## src/lib/pdfmakeInspectionReport.ts

- Purpose: Builds the "professional engineering-style" inspection report PDF (custom cover page, quality-score dashboard, section breakdown + general info, per-section photo grids, snag cards, tenant/meter verification, merged document appendix) and optionally saves it to document storage.
- Public surface:
  - `interface InspectionSection { title: string; items: Array<{label; value: string|boolean|number; type?; notes?; photos?: string[]}> }` (:44)
  - `interface InspectionSnag { title; description?; status; riskLevel?; photos?: string[] }` (:55)
  - `interface InspectionTenant { shopName; shopNumber?; meterSerialNumber?; breakerSize?; ctSizeAndRatio?; meterImage?; breakerImage?; ctRatioImage? }` (:63)
  - `interface ReportDocument { url: string; name: string; path?: string }` (:74)
  - `interface InspectionReportData { inspectionId; templateName?; inspectorName?; inspectionDate?; status?; qualityRating?; generalInfo?; sections?; tenants?; snags?; documents?; subsectionName? }` (:80)
  - `interface GenerateInspectionReportOptions { inspection; siteName; clientName?; siteLogoUrl?; accentColor?: 'blue'|'green'|'orange'|'red'|'purple' }` (:95)
  - `interface GenerateInspectionReportResult { success; blob?; previewUrl?; filename?; error? }` (:103)
  - `generateInspectionReportPdf(options: GenerateInspectionReportOptions): Promise<GenerateInspectionReportResult>` (:1446)
  - `generateAndSaveInspectionReportPdfmake(options: GenerateInspectionReportOptions & { subsectionId: string; siteId?: string }): Promise<{ success; documentId?; fileName?; fileUrl?; error? }>` (:1546)
- Inputs & outputs: In — inspection data with photo URLs, site/client names, optional site logo URL. Out — PDF Blob (+ filename sanitized at :1508; object-URL preview only in the appendix path, :1520). Stores touched: Supabase Storage bucket `documents` download for appendix docs with a `path` (:1360); plain `fetch(doc.url)` fallback (:1363); `supabase.auth.getUser()` gate in the save path (:1561); upload + document-row insert delegated to `savePDFToDocuments` with `categoryName: 'Inspection Reports'` (:1575–1580).
- Dependencies:
  - uses -> `./pdfEngine` (L14): `generateReport` used (:1500); `COLORS`, `CONTENT_WIDTH_PT`, `CoverPageOptions`, `createCoverPage` imported (:15–18) but unused. `./pdfMakeConfig` (L14): `mmToPt` imported (:21) but unused. `./simpleImageLoader` (L14): `loadImageSimple`, `loadImagesSimple`, `compressImageBlob` (:22). `./report/inspectionScore` (L07): `scorePercentage`, `isPassStatus`, `isFailStatus` (:23). `./pdfDocumentSaver` (L14): `savePDFToDocuments` (:24). `@/integrations/supabase/client` (L19) (:20). `pdf-lib` via dynamic import (:1379).
  - used by <- C14 reports-dashboards (src/components/ComprehensiveInspectionReport.tsx:11 — `generateInspectionReportPdf`, types); C07 site-assets-inspections (src/components/site/BulkInspectionReportGenerator.tsx:24 — `generateAndSaveInspectionReportPdfmake`, types). Grep-verified across src and supabase.
- Side effects: image fetches for every collected photo URL (compressed at 800px/0.6 JPEG per :117–119); storage download + HTTP fetch for appendix docs; pdf-lib document merge; `URL.createObjectURL` when documents are appended (:1520); console.log/console.error progress logging throughout (:1452–1524); storage upload + DB insert via `savePDFToDocuments`.
- Error handling: `generateInspectionReportPdf` wraps everything — any throw returns `{ success: false, error }` (:1533–1539). `fetchDocumentBytes` catches, console.errors, returns null (:1365–1368). `appendDocumentsToPdf` is best-effort: per-document PDF-merge or image-embed failures are console.error'd and skipped (:1406–1408, :1428–1430); a whole-appendix failure returns the body blob unchanged (:1436–1439). `generateAndSaveInspectionReportPdfmake`: unauthenticated → `{ success: false, error: 'User not authenticated' }` (:1561–1564); generation or save failure propagated as error result (:1568–1570, :1582–1584); outer catch-all (:1591–1597). Comment at :1572–1573 states the save is fail-closed (orphan blob deleted on DB-insert failure) — that behavior lives in pdfDocumentSaver (L14).
- Tests: none found — no `*.test.*` file imports this module (grep-verified; vitest include is `src/**/*.test.{ts,tsx}`, vitest.config line 22).
- Observed issues:
  - Five imported symbols are never referenced: `COLORS`, `CONTENT_WIDTH_PT`, `CoverPageOptions`, `createCoverPage` (:15–18) and `mmToPt` (:21); the file styles exclusively from its local `REPORT_COLORS` (:30).
  - `createEngineeringCoverPage`'s `accentColor` parameter (:269) is never read in its body, so the `accentColor` option accepted at :1449 has no effect on output; `createQualityDashboard`'s `qualityRating` parameter (:411) is likewise never read.
  - `generateAndSaveInspectionReportPdfmake` declares `documentId?` in its return type (:1553) but no code path sets it (:1586–1590 returns only `fileName`/`fileUrl`); the `siteId?` option (:1549) is accepted but never used (only `subsectionId` is destructured, :1558).
  - `previewUrl` in the result is populated only when `inspection.documents` is non-empty (created at :1520); `pdfEngine.generateReport` deliberately returns no previewUrl (pdfEngine.ts:804–806 comment), so `result.previewUrl` at :1516 is always undefined in the no-documents path. The object URL created at :1520 is not revoked inside this module.
- ASSUMED: exact storage bucket/table writes of `savePDFToDocuments` (bucket `documents`, site/subsection document-row inserts) are per pdfDocumentSaver.ts (L14; verified only its exported signature and `documentUrl` returns at pdfDocumentSaver.ts:14, :29, :122, :192). The appendix comment "fixes #5" (:1573) refers to an issue tracker not inspected.

## src/lib/pdfSubsectionRenderer.ts

- Purpose: Generates pdfmake content definitions for subsection compliance cards (header, COC certificate lines, metering row, snag list, installation/documentation footer, QR code) and a full-width stacked grid of 2 cards per page.
- Public surface:
  - `renderSubsectionCardToPDF(data: SubsectionCardData, accentColor: string = '#3b82f6', logoUrl?: string | null): Promise<any>` (:22) — returns an `unbreakable` pdfmake stack.
  - `renderSubsectionGrid(subsections: SubsectionCardData[], accentColor: string = '#3b82f6', logoUrl?: string | null): Promise<any>` (:418) — stacks cards with `pageBreak: 'before'` on every even index > 0 (:431).
- Inputs & outputs: In — `SubsectionCardData` rows (built by the caller) and an optional logo URL for QR embedding. Out — pdfmake content objects; no return of Blobs. Stores: none directly (QR data URLs come from subsectionCardSpec's in-memory cache).
- Dependencies:
  - uses -> `./subsectionCardSpec` (L15): `SubsectionCardData`, `SnagData`, `CARD_LAYOUT`, `STATUS_COLORS`, `RISK_COLORS`, `generateSubsectionQRCode` (:8–15); `./cocHierarchy` (L09): type `CocCardLine` (:16).
  - used by <- C14 reports-dashboards (src/components/SiteSummaryReport.tsx:49 — `renderSubsectionGrid` only). `renderSubsectionCardToPDF` has no external importers (grep-verified); it is called internally by `renderSubsectionGrid` (:428).
- Side effects: QR code generation (canvas/Image work inside subsectionCardSpec); `console.warn` on QR generation failure (:33). Otherwise pure content assembly.
- Error handling: QR generation wrapped in try/catch — on failure `qrCodeDataUrl` stays null (:29–35) and the card renders the "No QR Code" placeholder rectangle (:231–255). `createCocBlock` renders a synthetic `I — Missing` line when a COC-required subsection has no certificates (:138–140) and a "Not Required" badge when `isCocRequired === false` (:128–136). No other failure paths; functions do not throw on missing fields (N/A fallbacks at :188, :198–202).
- Tests: none found (grep-verified; no test file references this module).
- Observed issues:
  - The `accentColor` parameter is threaded through both exports and into `createCardHeader` (:24, :47, :77, :420, :428) but never referenced in any styling — every color in the card is hardcoded or comes from spec constants.
  - `RISK_COLORS[snag.riskLevel]` (:284) indexes a map with lowercase keys (subsectionCardSpec.ts:78–82) using a field typed `'High' | 'Medium' | 'Low' | null` (siteSummaryRenderSpec.ts:296); for capitalized values the `|| RISK_COLORS.low` fallback is what renders. `snag.riskLevel.toUpperCase()` (:292) is called on that same nullable field.
  - `cocLineStatusBadge` maps `'Missing'` to the fail colors (:118) even though the `missing: true` line path suppresses the badge entirely (:169), leaving the badge branch reachable only if a non-missing line carries status `'Missing'` — a value cocHierarchy.ts:21 documents as roll-up-only.
- ASSUMED: comment ":424–430" that ~320pt cards fit two per A4 page is a layout intent, not verified against rendered output.

## src/lib/subsectionCardSpec.ts

- Purpose: Declares the shared subsection-card layout constants, status/risk color palettes, QR-code generation (with optional centered logo overlay), and small label-formatting helpers used by both the React preview and the PDF renderer.
- Public surface:
  - Re-exported types `SnagData`, `SubsectionData` from ./siteSummaryRenderSpec (:13).
  - `interface SubsectionCardData extends SubsectionData { tenantName?; cocNumber?; cocIssueDate?; cocType?; breakerSize?; cocCertificates?: CocCardLine[]; installationReview?: boolean; documentation?: boolean; documentationRequired?: boolean }` (:18)
  - `const CARD_LAYOUT` (:37, `as const` — paddings, qrCodeSize 90, maxSnagsShown 3, badge sizes)
  - `const STATUS_COLORS` (:70) and `const RISK_COLORS` (:78), both `as const`.
  - `generateSubsectionQRCode(url: string, logoUrl?: string | null): Promise<string>` (:90) — returns a PNG data URL ('' on failure).
  - `getCocStatusLabel(status: string | null | undefined): string` (:205); `formatMeteringInfo(data: SubsectionCardData): string` (:215); `getComplianceLabel(isCompliant: boolean | null | undefined): string` (:222); `getRiskLevelColor(level: SnagData['riskLevel'])` (:228).
- Inputs & outputs: In — a URL to encode plus optional logo URL. Out — 500px-wide QR PNG data URL, ECC level 'H', with aspect-preserved logo + white backing at ~28% width when a logo is supplied (:101–124, :150–185). Stores: module-level `qrCodeCache` Map keyed `${url}-${logoUrl || 'no-logo'}` (:88), unbounded, process-lifetime.
- Dependencies:
  - uses -> `qrcode` npm package (:10); `./siteSummaryRenderSpec` (L15) types (:13–14); `./cocHierarchy` (L09) type `CocCardLine` (:15).
  - used by <- L15 pdfSubsectionRenderer.ts:8–15 (data types, layout, colors, QR); C14 reports-dashboards (src/components/SiteSummaryReport.tsx:50 — type `SubsectionCardData`); C17 single-file-subdirs (src/components/pdf-preview/SubsectionCard.tsx:9–18 — `SubsectionCardData`, `SnagData`, `CARD_LAYOUT`, `STATUS_COLORS`, `RISK_COLORS`, `getCocStatusLabel`, `getComplianceLabel`, `generateSubsectionQRCode`). Grep-verified.
- Side effects: DOM/canvas usage in `embedLogoInQR` (`document.createElement('canvas')` :135, `Image` loads with `crossOrigin='anonymous'` :158) — browser-only; mutation of the module cache.
- Error handling: `QRCode.toDataURL` failure → `console.error` + return `''` (:126–130). `embedLogoInQR` never rejects: missing canvas context resolves the un-logoed QR (:143–146); logo load error resolves the QR-only canvas (:187–189); QR image load error resolves the original data URL (:193–195).
- Tests: none found (grep-verified).
- Observed issues:
  - `getRiskLevelColor` (:228–230) indexes lowercase-keyed `RISK_COLORS` with the capitalized `SnagData['riskLevel']` union, so every capitalized input takes the `|| RISK_COLORS.low` fallback.
  - `formatMeteringInfo` and `getRiskLevelColor` have no importers outside this unit (grep-verified; src/views/PublicSubsection.tsx:246 defines its own local `getRiskLevelColor`).
  - Exports a second `STATUS_COLORS` under the same name as siteSummaryRenderSpec.ts:37 with a different shape (see unit header).
  - The header comment "SINGLE SOURCE OF TRUTH for subsection card layout" (:4–6) coexists with `SubsectionCardData` fields `cocNumber`/`cocIssueDate`/`cocType` (:22–24) that no file in the unit reads (grep in unit files: only the interface declaration).
- ASSUMED: qrcode library module-count math in the comment (:102–106) taken at face value; not re-derived.

## src/lib/siteSummaryRenderSpec.ts

- Purpose: Single-source-of-truth specification for the Site Summary report — accent palettes, section specs with legacy-ID mapping, KPI/stat-row/table-column/card-field declarations, A4 layout constants, and pure calculators for site metrics, category health, Fortress checklist progress, and document summaries.
- Public surface (all verified in-file):
  - Constants/types: `ACCENT_PALETTES` (:29), `STATUS_COLORS` (:37), `AccentColorKey` (:45), `getAccentPalette(color='blue')` (:47), `KpiCardSpec` (:55), `HEALTH_METRICS_CARDS` (:65), `SectionSpec` (:100), `SECTION_SPECS: Record<string, SectionSpec>` (:109, 9 sections incl. legacy ids `compliance`→health-metrics, `site-info`→summary-statistics, `subsections`→subsection-details, `documents`→coc-validations), `StatRowSpec` (:183), `SUMMARY_STAT_ROWS` (:189), `TableColumnSpec` (:202), `COC_VALIDATION_COLUMNS` (:209), `INSPECTION_COLUMNS` (:216), `CardFieldSpec` (:227), `SUBSECTION_CARD_FIELDS` (:235), `SiteSummaryMetrics` (:277), `SnagData` (:293), `SubsectionData` (:301), `CategoryHealthData` (:320), `CocValidationData` (:328), `InspectionData` (:335), `LAYOUT` (:346), `FortressSectionProgress` (:554), `FortressChecklistMetrics` (:566), `DocumentCategoryMetrics` (:685), `DocumentSummaryMetrics` (:691), `CalculateMetricsInputs` (:462).
  - Functions: `findSectionSpec(sectionId): SectionSpec | null` (:407), `getSectionTitle(section: ReportSection): string` (:423), `matchesSectionId(section, targetId): boolean` (:434), `sortSections(sections): ReportSection[]` (:444), `getEnabledSections(sections): ReportSection[]` (:458), `calculateMetrics(subsections: SubsectionData[], inputs: CalculateMetricsInputs): SiteSummaryMetrics` (:478), `calculateCategoryHealth(subsections, getCategoryAbbr, maxCategories?): CategoryHealthData[]` (:521), `calculateFortressMetrics(checklistItems: Array<{section_name; is_checked; status}>): FortressChecklistMetrics` (:596), `calculateDocumentMetrics(siteDocuments, subsectionDocuments): DocumentSummaryMetrics` (:701).
- Inputs & outputs: pure data in/data out; no I/O, no stores. Behavioral rules encoded: COC numerator is required-AND-approved only (:486–490); empty site forces every rate metric to 0 (:499–511); `overallHealth` is a required input with deliberately no local fallback (:467–472 comment); category health returns ALL categories sorted alphabetically unless `maxCategories` given (:517–544); Fortress progress excludes not-applicable items from denominators, empty-applicable section = 100% (:646–650), empty checklist = zeroed metrics (:603–612); document metrics group by joined category name with `'Uncategorized'` and `'(unnamed file)'` fallbacks (:713–727).
- Dependencies:
  - uses -> `@/components/pdf-editor/types` (C04): `ReportSection` used, `ReportCustomization` unused (:22); `@/lib/complianceCalculations` (L09): `cocComplianceRate`, `hasValidCocStatus` (:23).
  - used by <- C14 reports-dashboards (src/components/SiteSummaryReport.tsx:47 — 17-symbol import incl. all four calculators and `LAYOUT`); L14 pdf-engine-core (src/lib/pdfMakeUtils.ts:36 — `LAYOUT`, `ACCENT_PALETTES`); L15 pdfTemplateTestRunner.ts:14–28; L15 subsectionCardSpec.ts:13–14 (types); L15 siteSummaryRenderSpec.test.ts:2–7. Comment-only mention in src/components/SiteHealthBadge.tsx:5 (C14). Grep-verified.
- Side effects: none (pure module).
- Error handling: no throws; guards are numeric (Math.max denominator :483, clamp of snagFree :510, `|| 0` on percentage :541).
- Tests: src/lib/siteSummaryRenderSpec.test.ts (see its section) covers `calculateMetrics`, `calculateCategoryHealth`, `calculateDocumentMetrics` and cross-checks against L09 `calculateCocComplianceStats`. `calculateFortressMetrics` and the section-spec helpers have no vitest coverage; the section helpers (`matchesSectionId`, `getSectionTitle`, `getEnabledSections`) are exercised at runtime by pdfTemplateTestRunner (:386–455 of that file).
- Observed issues:
  - `ReportCustomization` is imported and never referenced (grep: only :22).
  - `SUBSECTION_CARD_FIELDS`' `coc-status` color logic (:240) special-cases only `'Approved'`/`'Pass'` rather than using L09's `VALID_COC_STATUSES` (`['Approved','Valid','Pass']`, complianceCalculations.ts:33), so `'Valid'` renders muted here.
  - `SECTION_SPECS` render priorities jump 6 → 8 (`inspections` :160, `fortress-checklist` :168); no section holds priority 7.
  - The metering rate counts `meteringStatus === 'Installed'` OR a serial number (:491–493), a different vocabulary from `SUBSECTION_CARD_FIELDS`' free-text `meteringStatus || 'Unknown'` display (:245–247).
- ASSUMED: the ASCII architecture diagram (:8–19) claim that preview and PDF both consume this spec is corroborated by the pdfMakeUtils and SiteSummaryReport imports above, but per-pixel WYSIWYG equivalence was not verified.

## src/lib/siteSummaryRenderSpec.test.ts

- Purpose: Vitest suite pinning the metric-calculator behavior of siteSummaryRenderSpec (COC-compliance semantics, empty-site zeros, category health, document grouping) including a cross-library consistency check against L09.
- Public surface: none (test module). Suites: "calculateMetrics — COC compliance is required-only (≤ 100%)" (:26), "cross-library COC consistency — report and dashboard can never disagree" (:54), "empty site — every rate metric is 0, never a fabricated 100%" (:84), "calculateCategoryHealth — shows ALL categories (no silent truncation)" (:95), "calculateDocumentMetrics — lists every filename per category" (:126).
- Inputs & outputs: builds `SubsectionData` fixtures via a `sub()` factory with `isCocRequired: true` default (:10–22); no stores, no network.
- Dependencies: uses -> `vitest` (:1); `./siteSummaryRenderSpec` (L15) (:2–7); `./complianceCalculations` (L09): `calculateCocComplianceStats` (:8).
- used by <- none found (grep-verified); executed by vitest via include pattern `src/**/*.test.{ts,tsx}` (vitest.config line 22).
- Side effects: none.
- Error handling: n/a (assertions only).
- Tests: this file IS the test. What it actually asserts: (1) numerator counts only required+approved — a not-required approved subsection cannot inflate `cocCompliant` or push `cocCompliance` past 100% (:27–38); (2) zero required COCs → vacuous 100% (:40–46); (3) `overallHealth` passes through unchanged (:48–51); (4) for two fixture sets, `calculateMetrics` and L09 `calculateCocComplianceStats` produce identical `cocCompliance`/`cocCompliant` (:68–81); (5) empty site → subsectionCount 0 and all four rate metrics 0 (:85–92); (6) 6 categories in → 6 entries out (previously capped at 4, per comment :107) with alphabetical membership (:96–110); (7) per-category percentage = compliant/total (:112–123); (8) site + subsection docs grouped under joined category names, filenames sorted, `(unnamed file)` placeholder (:127–151).
- Observed issues: covers 3 of the module's 9 exported functions; `calculateFortressMetrics`, `sortSections`/`getEnabledSections`/`matchesSectionId`/`findSectionSpec`/`getSectionTitle`, and `getAccentPalette` have no vitest assertions.
- ASSUMED: none.

## src/lib/pdfTemplateExporter.ts

- Purpose: Renders a `TemplateData` structure (inspection-template definition with sections, checklist items, and tenants) into a blank/fillable PDF with optional cover page, TOC, running header/footer, and watermark, as a Blob or direct download.
- Public surface:
  - `interface TemplateData { name; category; description?; sections: TemplateSection[]; cover_page?: {title; subtitle; company_name; logo_url?}; tenants?: TenantData[] }` (:18)
  - `interface TemplateSection { id; name; order_index; items?: TemplateItem[]; content?; type?: 'header'|'table'|'text'|'checklist'|'image' }` (:32)
  - `interface TemplateItem { id; name; type: 'text'|'checkbox'|'select'|'textarea'|'image'|'document'|'number'|'checklist'; value?; options?; required? }` (:41)
  - `interface TenantData { id; shopNumber; shopName; breakerSize?; ctSizeAndRatio? }` (:50)
  - `interface ExportOptions { includeHeader; includeFooter; includeCoverPage; includeTableOfContents; accentColor: 'blue'|'green'|'orange'|'red'|'purple'; watermark?; logoUrl?; companyName?; reportDate?; referenceNumber? }` (:58)
  - `exportTemplateToPDF(template, options): Promise<Blob>` (:82); `downloadTemplatePDF(template, options, filename?): void` (:125).
- Inputs & outputs: template + options in; PDF Blob out (or browser download via `downloadPdf`). Checklist items render as `☐` rows with `[ Pass / Fail / N/A ]` or blank-line placeholders (:346–353). Footer center text defaults to `'Watson Mattheus'` (:464). No stores, no network (logo is passed as `options.logoUrl` straight into the pdfmake `image` node, :188).
- Dependencies:
  - uses -> `./pdfMakeConfig` (L14): `createBaseDocDefinition`, `generatePdfBlob`, `downloadPdf`, `getStandardTableLayout` used; `COLORS`, `DEFAULT_STYLES`, `mmToPt`, `CONTENT_WIDTH_PT` imported but unused (:6–15). `./documentDesignStandards` (L10): `DOCUMENT_DESIGN_STANDARDS` imported but unused (:16).
  - used by <- C15 templates-documents (src/components/PDFTemplateExportDialog.tsx:12–16; calls at :62 and :79). Grep-verified.
- Side effects: PDF generation; `downloadPdf` triggers a browser download. Both entry points call `template.sections.sort(...)` (:100, :141), sorting the caller's array in place.
- Error handling: none — no try/catch anywhere; pdfmake or option errors propagate to the caller (PDFTemplateExportDialog handles them).
- Tests: none found (grep-verified).
- Observed issues:
  - Five unused imports (:10–16, listed above); the file styles from its own local `ACCENT_COLORS` (:71) instead.
  - `exportTemplateToPDF` and `downloadTemplatePDF` duplicate the same content-assembly sequence (:88–117 vs :131–155); the download variant omits the `subject` metadata field present in the blob variant (:113 vs :149–155).
  - TOC page numbers are the static expression `idx + 3` (:297), not derived from actual pagination.
  - `buildWatermark` sets a `rotation: 315` key on the background text node (:484); whether pdfmake honors a key of that name was not verified (its documented option elsewhere in the codebase is not used here).
- ASSUMED: pdfmake background/watermark key semantics (see last bullet).

## src/lib/pdfTemplateExtractor.ts

- Purpose: Parses an uploaded PDF file with pdfjs-dist into an `ExtractedTemplate` (cover-page info, heuristic section/checklist/table detection, category guess) and can render a quick preview PDF of the extraction via pdfMakeConfig.
- Public surface:
  - `interface ExtractedSection { id; name; order_index; type: 'header'|'table'|'text'|'image'|'list'; content?; items?; tableData?: {headers; rows} }` (:13)
  - `interface ExtractedItem { id; name; type: 'text'|'checkbox'|'select'|'textarea'|'image'|'number'; value?; required }` (:26)
  - `interface ExtractedTemplate { name; category; description; cover_page?; sections; metadata: {pageCount; extractedAt; sourceFileName} }` (:34)
  - `extractTemplateFromPDF(file: File): Promise<ExtractedTemplate>` (:74)
  - `generateTemplatePreviewPDF(template: ExtractedTemplate): Promise<Blob>` (:413)
- Inputs & outputs: a browser `File` in; structured template out. Heuristics: section headers = avg font > 12 + bold, numbered/`Section` prefixes, or ALL-CAPS lines of 4–49 chars (:149–152); checklist detection by leading bullet/number glyphs (:292–294); item-type inference from keywords (:309–319); category from keyword buckets Solar/Generator/Medium Voltage/Low Voltage/Progress/Site Drawing else `'General'` (:324–335); cover title/subtitle = two largest-font blocks on page 1 (:256–259), company matched by `/company|ltd|inc|llc|corp|pty|prepared by|watson|fortress/i` with fallback `'Watson Mattheus'` (:262–274); simple table parsing on `|`/tab/multi-space delimiters when ≥70% of lines look delimited (:374–407).
- Dependencies:
  - uses -> `pdfjs-dist` (:6); `./pdfMakeConfig` (L14) via dynamic import inside `generateTemplatePreviewPDF` (:416).
  - used by <- C15 templates-documents (src/components/PDFTemplateUploader.tsx:14 — all three exports; extraction call at :86, preview at :104). Grep-verified.
- Side effects: at module load (when `window` exists) sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a protocol-relative CDN URL `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js` (:8–11) — the worker script is fetched from an external origin at first parse. CPU-bound text extraction across all pages (:84–106).
- Error handling: none — no try/catch; pdfjs rejections (corrupt file, worker load failure) propagate to the caller. Structural fallback: if no sections are detected, a single `'General Information'` section containing all text is created (:192–201).
- Tests: none found (grep-verified).
- Observed issues:
  - External-CDN worker dependency (:10) ties runtime behavior to cdnjs availability and to the installed `pdfjs-dist` version string.
  - `ExtractedSection.type` admits `'header'`, `'image'`, and `'list'` (:17) but the code only ever assigns `'text'` (:165, :197) or `'table'` (:362); `ExtractedItem.type` `'select'` is only produced by keyword match (:314).
  - Block width is computed as `textItem.width * scaleX` (:98) while height/fontSize both reuse `Math.abs(scaleY)` (:99–101) — width and font-size use different bases from the same transform.
- ASSUMED: pdf.js `getTextContent` geometry semantics (whether `item.width` is pre-scaled) were not verified against the pdfjs-dist API docs.

## src/lib/pdfTemplateTestRunner.ts

- Purpose: In-app diagnostic test suite (not vitest) that validates the PDF template gateway fetch, spec completeness, section-rendering helpers, metric calculations, parameter flow, and `pdf_report_templates` database integration, returning a structured `TestSuiteResult` for display.
- Public surface:
  - `interface TestResult { id; name; status: 'pass'|'fail'|'warning'|'skipped'; message; details?; duration? }` (:34)
  - `interface TestSuiteResult { suiteName; startedAt; completedAt; totalTests; passed; failed; warnings; skipped; tests }` (:43)
  - `interface ParameterFlowTest { parameter; templateValue; previewValue; pdfValue; matches }` (:55)
  - `const SAMPLE_SUBSECTION_DATA: SubsectionData[]` (:67, 4 fixture rows)
  - `class PDFTemplateTestRunner` with `runAllTests(reportType: TemplateReportType = 'site_summary'): Promise<TestSuiteResult>` (:118, :163)
  - `runPDFTemplateTests(reportType = 'site_summary'): Promise<TestSuiteResult>` (:705)
- Inputs & outputs: report type in; TestSuiteResult out. Stores read: Supabase table `pdf_report_templates` — `id,name,report_type,is_default` limit 5 (:610–613), default-template lookup `.eq('report_type','site_summary').eq('is_default',true).single()` (:631–636), sections-JSON validation `.limit(1).single()` (:658–663). Also whatever `fetchPDFTemplate` reads (H04).
- Dependencies:
  - uses -> `@/integrations/supabase/client` (L19) (:11); `@/components/pdf-editor/types` (C04): `ReportSection` used, `ReportCustomization` unused (:12); `@/hooks/usePDFTemplateGateway` (H04): `fetchPDFTemplate`, `TemplateReportType` (:13); `@/lib/siteSummaryRenderSpec` (L15): 14 symbols (:14–28).
  - used by <- V02 admin-ops-and-template-views (src/views/PDFTemplateTestDashboard.tsx:32 — `runPDFTemplateTests`, `TestResult`, `TestSuiteResult`). The exported class, `SAMPLE_SUBSECTION_DATA`, and `ParameterFlowTest` have no external importers (grep-verified).
- Side effects: live Supabase queries and template-gateway fetches from the browser; `console.log` suite progress (:168, :194); `performance.now()` timing per test.
- Error handling: every test runs through `runTest`, which converts thrown exceptions into a `'fail'` result carrying the message and stack (:145–157) — the suite itself never throws. Supabase `PGRST116` (no rows) is downgraded to `'warning'` for the missing-default-template case (:638–643) and `'skipped'` for the sections-JSON case (:665–667); other query errors are `'fail'` (:615–619, :646, :669–671).
- Tests: this file is itself a runtime test harness; it has no vitest coverage (grep-verified). It exercises siteSummaryRenderSpec's spec constants and helper functions (:281–356, :366–455) and `calculateMetrics`/`calculateCategoryHealth` (:463–535) against `SAMPLE_SUBSECTION_DATA`.
- Observed issues:
  - `ReportCustomization` imported, never used (:12).
  - `SAMPLE_SUBSECTION_DATA` rows carry no `isCocRequired`, so `calculateMetrics` falls back to `cocStatus !== null` (siteSummaryRenderSpec.ts:486), making all 4 rows "required"; the `metrics-basic` test then asserts `metrics.cocCompliant` equals the count of rows with `isCompliant: true` (:470–473) — semantically different measures that both evaluate to 2 for this fixture (`VALID_COC_STATUSES = ['Approved','Valid','Pass']`, complianceCalculations.ts:33).
  - The header comment claims "4. SANS compliance checks are applied" (:8) but no test in the file references SANS (grep in-file: header only).
  - `gateway-fallback` requests report type `'compliance'` via an `as TemplateReportType` cast (:240), exercising the gateway with a value outside its declared union.
  - This 710-line harness plus its Supabase-querying tests ship in the production bundle (classified `source`; imported by an app view).
- ASSUMED: `fetchPDFTemplate` behavior (defaults/fallback shape) is per H04's usePDFTemplateGateway.ts:350, whose internals were not read beyond the signature.
