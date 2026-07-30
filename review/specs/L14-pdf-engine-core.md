# L14 — pdf-engine-core

- Unit id: L14
- Slug: pdf-engine-core
- Spec mode: full
- Date: 2026-07-29
- Files: 13 (8 source + 5 test)

## Unit header

**Unit purpose (as-is).** This unit is the pdfmake foundation layer for every client-side PDF the app generates: it initialises pdfmake with its bundled Roboto VFS fonts (src/lib/pdfMakeConfig.ts:24-41), defines page geometry / colours / styles / table layouts (pdfMakeConfig), provides reusable content builders (pdfMakeUtils, pdfTemplates, pdfBars), an orchestrating `generateReport` entry point (pdfEngine), branding/logo loading from Supabase (pdfBranding), image-to-dataURL loading (simpleImageLoader plus private helpers in pdfEngine), and a save-to-documents persister (pdfDocumentSaver).

**Module-level observations (cross-file, verified).**
- Layering inside the unit: pdfMakeConfig is the root (imports only pdfmake + L10 documentDesignStandards); pdfMakeUtils, pdfBranding, pdfBars, pdfEngine, pdfTemplates all import from it (pdfMakeUtils.ts:15-33, pdfBranding.ts:11, pdfBars.ts:1, pdfEngine.ts:9-21, pdfTemplates.ts:14-21). pdfTemplates additionally imports pdfBranding (pdfTemplates.ts:22-26); pdfEngine additionally imports pdfMakeUtils (pdfEngine.ts:22-36).
- Two parallel builder vocabularies exist: pdfMakeUtils and pdfTemplates both export `createCoverPage`, `createPageHeader`, `createPageFooter`, `createSectionHeader`, `createDataTable`, `createStatusBadge`, `getStatusType`, `PDFComplianceCheck`, `TableColumn` — 9 same-named symbols with different signatures and different rendering (e.g. pdfMakeUtils.createCoverPage takes a `CoverPageOptions` object with accent bars and emoji info rows, pdfMakeUtils.ts:96-370; pdfTemplates.createCoverPage takes `(data, logoDataUrl?)` and renders a text-divider layout, pdfTemplates.ts:48-170). pdfEngine re-exports the pdfMakeUtils family (pdfEngine.ts:40-58) and also defines its own `createParagraph`/`createBulletList`/`createSpacer`/`createDivider` (pdfEngine.ts:835-925) which collide by name with pdfTemplates' versions (pdfTemplates.ts:558-596). The only external consumer of pdfTemplates' builder functions is L10 complianceReportGenerator (src/lib/complianceReportGenerator.ts:18-24).
- Three image-to-dataURL implementations coexist in the unit: pdfEngine's private `loadImageViaElement`/`compressImageBlob`/exported `loadImageAsDataUrl` (pdfEngine.ts:123-293, config 1200px/quality 0.80, pdfEngine.ts:113-118), pdfBranding's `imageUrlToBase64` (pdfBranding.ts:85-123, plain fetch, no compression), and simpleImageLoader's `loadImageSimple`/exported `compressImageBlob` (simpleImageLoader.ts:68-162, Supabase storage-API download first, default 800px/quality 0.6). `compressImageBlob` is defined twice in the unit under the same name (pdfEngine.ts:162 private; simpleImageLoader.ts:68 exported) with different defaults.
- Footer/date behaviour is split: pdfMakeUtils.createPageFooter delegates page-number clamping and date format to the L07 report kernel (pdfMakeUtils.ts:37,453,460); pdfTemplates.createPageFooter prints raw `currentPage`/`pageCount` with no clamping and hard-skips page 1 (pdfTemplates.ts:240-262).
- pdfBars is deliberately canvas-free (tables with fillColor only) because pdf.js mis-renders canvas nodes (pdfBars.ts:10-16); pdfMakeConfig.generatePdfBlob independently validates canvas nodes before generating (pdfMakeConfig.ts:391-395).
- pdfmake dependency is `^0.3.2` (package.json:71); the code paths use pdfmake 0.3 Promise-based `getStream`/`getBlob`/`getDataUrl` (pdfMakeConfig.ts:410,440,460).
- Test pairing: 5 of 8 source files have a sibling test (pdfMakeConfig, pdfMakeUtils, pdfBars, pdfBranding, pdfDocumentSaver). pdfEngine.ts, pdfTemplates.ts and simpleImageLoader.ts have no test file anywhere in src (grep of `*.test.ts{,x}` for those module names returns only the five in-unit tests).

**External contract.** The rest of the app gets: (1) `generatePdfBlob(docDefinition)` — the single blob generator used directly by C03, V06, L08, L15, L16, and via re-export by every L10 generator; (2) the pdfMakeUtils builder set + constants (COLORS, DEFAULT_STYLES, PAGE_CONFIG, mmToPt, CONTENT_WIDTH_PT) used by L10/L15/C09; (3) `generateReport(opts)` in pdfEngine — the orchestrated cover+header+footer path used by C14, L10, L15; (4) branding loaders `loadCompanyBranding`/`imageUrlToBase64` and date formatters used by C14, L08, L10, V06; (5) `savePDFToDocuments`/`getReportCategoryName` used by C07, C12, C14, L15, V06; (6) `loadImageSimple`/`loadImagesSimple` used by L08/L15; (7) pdfBars primitives used by L08.

---

## src/lib/pdfMakeConfig.ts
- Purpose: Initialises pdfmake (VFS fonts, font map) and exports page geometry, colour palette, default styles, table layouts, base doc-definition factory, and blob/dataURL/download/open generation functions.
- Public surface:
  - `mmToPt(mm: number): number`, `ptToMm(pt: number): number` (lines 52-53)
  - `PAGE_CONFIG: { pageSize: 'A4'; pageMargins: [number,number,number,number]; pageOrientation: 'portrait' }` (lines 55-65)
  - `A4_WIDTH_PT = 595.28`, `A4_HEIGHT_PT = 841.89`, `CONTENT_WIDTH_PT` (lines 68-72)
  - `COLORS: Record<string,string>` (lines 80-106); `DEFAULT_STYLES: StyleDictionary` (lines 114-229)
  - `getStandardTableLayout(): TableLayout` (238), `getLightTableLayout(): TableLayout` (259), `getKpiTableLayout(): TableLayout` (273)
  - `createBaseDocDefinition(content: Content[], options?: { title?; author?; subject?; header?; footer?; pageMargins?; background? }): TDocumentDefinitions` (289-329)
  - `generatePdfBlob(docDefinition): Promise<Blob>` (389-452); `generatePdfDataUrl(docDefinition): Promise<string>` (457-461); `downloadPdf(docDefinition, filename): void` (466-469); `openPdfInNewWindow(docDefinition): void` (474-477)
  - `testPdfGeneration(): Promise<void>` (487-521); `testPdfBlobGeneration(): Promise<Blob>` (526-539)
  - Re-exports: `pdfMake` value; types `TDocumentDefinitions`, `Content`, `StyleDictionary`, `TableLayout` — all four are `any` aliases (lines 13-16, 545-546).
- Inputs & outputs: In — pdfmake doc definitions from callers; DOCUMENT_DESIGN_STANDARDS (margins/colors/typography/tables) from L10 (line 17). Out — Blob (`application/pdf`), data URL string, browser download, new window. No tables/buckets/localStorage. Reads `process.env.NODE_ENV` to gate dev logging (394, 448, 518).
- Dependencies: uses -> `pdfmake/build/pdfmake`, `pdfmake/build/vfs_fonts` (npm); `./documentDesignStandards` (L10, line 17). used by <- (grep-verified) in-unit: pdfBars.ts:1, pdfMakeUtils.ts:33, pdfEngine.ts:21, pdfTemplates.ts:21, pdfBranding.ts:11, pdfMakeConfig.margins.test.ts:2; external: C03 src/components/client-portal/ClientCocView.tsx:20 (`generatePdfBlob`), L15 src/lib/pdfmakeInspectionReport.ts:21 (`mmToPt`), L15 src/lib/pdfTemplateExporter.ts:6-15 (`createBaseDocDefinition, generatePdfBlob, downloadPdf, COLORS, DEFAULT_STYLES, getStandardTableLayout, mmToPt, CONTENT_WIDTH_PT`), L10 src/lib/complianceReportGenerator.ts:25-28 (`createBaseDocDefinition, Content`), L08 src/lib/assetVerificationReportGenerator.ts:14 (`generatePdfBlob`), L08 src/lib/assetVerificationReport.ts:6 (types), V06 src/views/site-coc/ReportSubTab.tsx:6 (`generatePdfBlob`).
- Side effects: Module import mutates the pdfmake singleton — assigns `vfs` via a three-way fallback (24-31) and `fonts` map (34-41). `downloadPdf`/`openPdfInNewWindow`/`testPdfGeneration` trigger browser download / window.open / DOM anchor click + `alert()` (466-521).
- Error handling: `generatePdfBlob` throws on canvas-validation failure (395) and on empty VFS ("PDF fonts not loaded…", 403); primary path is `getStream()` + manual chunk assembly (410-433); on stream failure it silently catches (`streamError` unused, 435), re-creates the generator and falls back to `getBlob()` (439-440), throwing "Generated PDF is empty" for a zero-size blob (445) or rethrowing the blob error after a dev-only console.error (448-449). `generatePdfDataUrl`/`downloadPdf`/`openPdfInNewWindow` have no error handling. `testPdfGeneration` catches everything and shows `alert(...)` (517-520).
- Tests: src/lib/pdfMakeConfig.margins.test.ts — asserts `PAGE_CONFIG.pageMargins[1]` is between 50 and 90 pt (excluding the historical mmToPt(50)≈141pt value) and `pageMargins[3]` is between 60 and 120 pt (lines 5-14).
- Observed issues:
  - All four exported pdfmake types are `any` aliases (13-16), so the whole unit's `Content`/`TDocumentDefinitions` typing is untyped.
  - `base64ToBlob` (338-346) is module-private and referenced nowhere else in the file (single grep hit = its definition).
  - The comment at line 60 records a prior unit bug ("was mmToPt(50)≈141pt; unit bug"); top margin is a raw `64` while the other three margins go through `mmToPt`.
  - `generatePdfBlob` constructs `pdfMake.createPdf(docDefinition)` twice on the fallback path (406 and 439).
  - The stream-failure catch swallows `streamError` without logging it (435).
  - `testPdfGeneration`, `testPdfBlobGeneration`, `generatePdfDataUrl`, `openPdfInNewWindow` have zero consumers outside this file (grep-verified); `testPdfGeneration` uses `alert()` (516, 519).
- ASSUMED: none.

## src/lib/pdfMakeConfig.margins.test.ts
- Purpose: Regression-pins PAGE_CONFIG's top and bottom page margins to ranges that exclude the historical mm/pt-confusion value.
- Public surface: none (vitest `describe`/`it` only).
- Inputs & outputs: imports `PAGE_CONFIG` from ./pdfMakeConfig (line 2); no stores.
- Dependencies: uses -> vitest; `./pdfMakeConfig` (L14). used by <- none found (grep-verified; test file, run via vitest include `src/**/*.test.{ts,tsx}`, vitest.config.ts:24).
- Side effects: importing the module under test runs pdfMakeConfig's module-level pdfmake VFS/fonts assignment.
- Error handling: n/a (assertions only).
- Tests: is itself the test; asserts top margin in (50, 90) and bottom in (60, 120) (lines 5-14).
- Observed issues: none.
- ASSUMED: none.

## src/lib/pdfMakeUtils.ts
- Purpose: The self-described "PRIMARY utility library for PDF generation" (line 5): re-exports the whole pdfMakeConfig surface and adds cover-page, header/footer, table, badge, KPI and compliance-log builders that use shared LAYOUT constants for WYSIWYG preview matching.
- Public surface:
  - Re-exports from pdfMakeConfig (lines 40-59): `pdfMake, generatePdfBlob, generatePdfDataUrl, downloadPdf, openPdfInNewWindow, createBaseDocDefinition, COLORS, DEFAULT_STYLES, PAGE_CONFIG, CONTENT_WIDTH_PT, A4_WIDTH_PT, A4_HEIGHT_PT, mmToPt, ptToMm, getStandardTableLayout, getLightTableLayout, getKpiTableLayout` plus `generateDocumentFilename` (from L10).
  - `ACCENT_COLORS: Record<string, { primary; light; text }>` derived from L15 `ACCENT_PALETTES` (72-74)
  - `interface CoverPageOptions { title; subtitle?; siteName; clientName?; reportType?; logoDataUrl?; organizationName?; reportDate?; referenceNumber?; preparedBy?; qrCodeDataUrl?; accentColor?: 'blue'|'green'|'orange'|'red'|'purple'; siteAddress? }` (76-90)
  - `createCoverPage(options: CoverPageOptions): Content[]` (96-370)
  - `createSectionHeader(title: string, style?: 'primary'|'secondary'|'muted', options?: { noTopMargin?: boolean }): Content` (379-413)
  - `createPageHeader(title: string, skipFirstPage = true): (currentPage, pageCount) => Content` (418-446)
  - `createPageFooter(skipFirstPage = true): (currentPage, pageCount) => Content` (452-492)
  - `interface TableColumn { header; field; width?; alignment?; format? }` (498-504); `createDataTable(columns, data, options?: { zebra?; headerStyle? }): Content` (509-558); `createInfoTable(data: [string,string][]): Content` (563-585)
  - `createStatusBadge(status, type?: 'success'|'warning'|'error'|'info'): Content` (594-626); `getStatusType(status: string)` (631-637)
  - `createKpiCard(value, label, color?): Content` (646-670); `createKpiRow(kpis): Content` (675-689)
  - `interface PDFComplianceCheck` (9 booleans, 695-705); `logComplianceCheck(reportName, checks): PDFComplianceCheck` (710-728)
  - `buildDocument(options: { title; coverPage?; content; skipCoverPageInHeaderFooter? }): TDocumentDefinitions` (737-760)
- Inputs & outputs: In — report data from callers; LAYOUT/ACCENT_PALETTES (L15, line 36); DOCUMENT_DESIGN_STANDARDS typography/margins/footers (L10, lines 34, 61); kernel `clampPageNumbers`/`formatDate` (L07, line 37). Out — pdfmake Content trees and doc definitions. No stores.
- Dependencies: uses -> `./pdfMakeConfig` (L14), `./documentDesignStandards` (L10), `./siteSummaryRenderSpec` (L15), `./report/reportKernel` (L07). used by <- (grep-verified) in-unit: pdfEngine.ts:22-36, pdfMakeUtils.footer.test.ts:2; external: C09 src/components/site/QRCodeManager.tsx:11 (`generatePdfBlob, DEFAULT_STYLES`), L10 src/lib/calendarReportGenerator.ts:5, L10 src/lib/floorPlanReportGenerator.ts:10-23 (`generatePdfBlob, buildDocument, createSectionHeader, createDataTable, createInfoTable, createKpiRow, logComplianceCheck, COLORS, mmToPt, A4_WIDTH_PT, CONTENT_WIDTH_PT, PDFComplianceCheck`), L10 src/lib/fortressChecklistReportGenerator.ts:8, L10 src/lib/inspectionTemplateReportGenerator.ts:8, L10 src/lib/complianceReportGenerator.ts:10-17, L16 src/lib/qrStickerSheet.ts:3 (`generatePdfBlob`).
- Side effects: `createCoverPage` logs a debug object on every call (`console.log('[createCoverPage] Template Applied:'…`, 119-133); `logComplianceCheck` logs a score line and a `console.warn` for missing checks (718-725). No I/O or network.
- Error handling: none anywhere in the file — all functions are pure builders; unknown `accentColor` falls back to `ACCENT_COLORS.blue` (114); `createDataTable` renders missing fields as `''` (530).
- Tests: src/lib/pdfMakeUtils.footer.test.ts — covers `createPageFooter` only (skip-cover behaviour, clamped page numbers, kernel date format; see that file's section).
- Observed issues:
  - `ACCENT_COLORS` has no importers outside this file (grep-verified: the four other `ACCENT_COLORS` occurrences — src/components/PDFTemplateExportDialog.tsx:24, src/components/settings/PDFTemplatePreview.tsx:12, src/components/pdf-editor/ReportOptionsPanel.tsx:22, src/lib/pdfTemplateExporter.ts:71 — are each locally defined constants of the same name, not imports).
  - Emoji characters (`🏢`, `👤`, `📍`) are emitted as pdfmake text content in the cover page (176, 223, 235, 246) while the only configured font is Roboto (pdfMakeConfig.ts:34-41).
  - `createPageFooter` computes `formattedDate` once when the factory is called, not per page render (453) — the same date string is stamped on all pages.
  - The debug `console.log` in `createCoverPage` (119) is unconditional (not NODE_ENV-gated, unlike pdfMakeConfig's logging).
  - `buildDocument` has exactly one external consumer (L10 floorPlanReportGenerator.ts:12,416); all other generators go through pdfEngine.generateReport instead.
- ASSUMED: the file-header claim that this library "completely replaces the legacy pdfUtils.ts (jsPDF)" (line 12) — no `pdfUtils.ts` exists to verify against (not in unit-files.json's L14 set; not checked elsewhere).

## src/lib/pdfMakeUtils.footer.test.ts
- Purpose: Tests `createPageFooter`'s cover-skip, clamped page numbering, and kernel day-first date format.
- Public surface: none; two local helpers `pageText(content)` / `dateText(content)` extract `columns[1].text` / `columns[2].text` (7-15).
- Inputs & outputs: imports `createPageFooter` (line 2) and kernel `formatDate` (line 3).
- Dependencies: uses -> vitest; `./pdfMakeUtils` (L14); `./report/reportKernel` (L07). used by <- none found (grep-verified; run via vitest include).
- Side effects: none beyond module import.
- Error handling: n/a.
- Tests: asserts footer(1,5) with skip returns `''` (19-21); footer(2,5)/footer(5,5) → "Page 1 of 4"/"Page 4 of 4" (22-26); footer(1,1) with skip returns `''` (27-31); footer(1,3) without skip → "Page 1 of 3" (32-35); date text contains no `/` and equals `formatDate(new Date())` (36-41).
- Observed issues: the test titled "never renders Page 0 of 0" (27) only asserts the skipped-page-1 empty string; it never invokes a case where clamping itself produces the displayed number.
- ASSUMED: none.

## src/lib/pdfEngine.ts
- Purpose: "Single entry point for all PDF generation" (line 3): orchestrates cover page + header/footer + content into a doc definition, generates the blob, derives a filename, and logs compliance; also bundles image loading/compression helpers and snag/QR/checklist/calendar content builders.
- Public surface:
  - Re-exports (40-60): `createCoverPage, createPageHeader, createPageFooter, createSectionHeader, createDataTable, createInfoTable, createKpiRow, createStatusBadge, getStatusType, logComplianceCheck, COLORS, PAGE_CONFIG, CONTENT_WIDTH_PT, A4_WIDTH_PT, A4_HEIGHT_PT, mmToPt, generateDocumentFilename`; types `CoverPageOptions, TableColumn, PDFComplianceCheck`.
  - `type ReportType = 'inspection'|'site-summary'|'coc-validation'|'floor-plan'|'calendar'|'checklist'|'qr-sheet'|'comprehensive-inspection'|'site-drawing'|'generic'` (70-80)
  - `interface ReportGeneratorOptions { type; title; content; coverPage?; options?: { includeCoverPage?; skipCoverPageInHeaderFooter?; skipFirstPageHeaderFooter?; logoDataUrl?; organizationName?; filename?; pageOrientation?; pageMargins? } }` (82-99); `interface GenerateReportResult { blob; filename; complianceChecks; previewUrl? }` (101-106)
  - `loadImageAsDataUrl(url: string): Promise<string | null>` (214-293)
  - `createImage(dataUrl, options?): Content` (298-347); `createImageGrid(images, columnsPerRow?, imageWidth?): Content` (352-385)
  - `interface SnagData` (391-400); `createSnagCard(snag): Content` (405-478); `createSnagsSummary(snags, title?): Content[]` (483-517)
  - `createQRCode(dataUrl, options?): Content` (527-560); `createQRCodeGrid(qrCodes, columnsPerRow?): Content` (565-606)
  - `interface ChecklistItem`, `interface ChecklistSection` (612-622); `createChecklistTable(sections): Content[]` (627-677)
  - `interface CalendarEvent` (683-690); `createCalendarTable(events): Content` (695-722)
  - `generateReport(opts: ReportGeneratorOptions): Promise<GenerateReportResult>` (732-812)
  - `downloadReport(docDefinition, filename): void` (817-819); `openReportInNewWindow(docDefinition): void` (824-826)
  - `createParagraph(text, options?): Content` (835-855); `createBulletList(items, options?): Content` (860-873); `createNumberedList(items, options?): Content` (878-891); `createDivider(margin?): Content` (896-911); `createPageBreak(): Content` (916-918); `createSpacer(height?): Content` (923-925)
  - `getDefaultComplianceChecks(): PDFComplianceCheck` (934-946); `createComplianceChecks(passed): PDFComplianceCheck` (951-957); `getComplianceCheckLabel(key): string` (962-975)
- Inputs & outputs: In — report content/options from callers; image URLs. Out — `GenerateReportResult` with Blob + filename + compliance checks; explicitly no object URL (comment lines 804-806). No tables/buckets/localStorage.
- Dependencies: uses -> `./pdfMakeConfig` (L14), `./pdfMakeUtils` (L14), `./documentDesignStandards` (L10). used by <- (grep-verified): C14 src/components/SiteSummaryReport.tsx:15-21 (`generateReport, createSectionHeader, createInfoTable, createDataTable, createKpiRow, COLORS`), C15 src/components/DocumentPreviewDialog.tsx:25 (`PDFComplianceCheck, getComplianceCheckLabel`), L15 src/lib/pdfmakeInspectionReport.ts:14-19 (incl. `generateReport` at :1500), L10 src/lib/calendarReportGenerator.ts:6, L10 src/lib/fortressChecklistReportGenerator.ts:9, L10 src/lib/inspectionTemplateReportGenerator.ts:9 (all `generateReport`).
- Side effects: `loadImageAsDataUrl` performs up to two `fetch` calls plus an `Image`-element load with cache-busting query `_t=${Date.now()}` (155), canvas draw + JPEG re-encode; console.log/warn/error throughout (232-290). `generateReport` logs start/finish lines (745, 802) and calls `logComplianceCheck` (790). `downloadReport`/`openReportInNewWindow` trigger browser download/window.open.
- Error handling: `loadImageViaElement` resolves `null` on any failure incl. tainted canvas (134-156). `compressImageBlob` (private) rejects on canvas-context failure or image load error (187-206). `loadImageAsDataUrl` runs a 3-strategy chain (cors fetch → plain fetch → Image element), each failure caught with a console.warn, returns `null` when all fail (260-263); compression failure falls back to uncompressed FileReader encode (280-288); outer catch returns `null` (289-292). `generateReport` itself has no try/catch — `generatePdfBlob` failures propagate to the caller. Snag/QR/checklist builders have no error paths.
- Tests: none (no test file references pdfEngine; grep-verified).
- Observed issues:
  - The compliance check passed to `logComplianceCheck` hardcodes seven of nine booleans to `true` regardless of the document actually built (791-800); only `hasCoverPage` and `logoPlacement` are computed.
  - `loadImageAsDataUrl`, `createImage`, `createImageGrid`, `createSnagCard`, `createSnagsSummary`, `createQRCode`, `createQRCodeGrid`, `createChecklistTable`, `createCalendarTable`, `createNumberedList`, `createPageBreak`, `downloadReport`, `openReportInNewWindow`, `getDefaultComplianceChecks`, `createComplianceChecks` have zero consumers outside this file (grep-verified).
  - Strategy-1 fetch uses `cache: 'force-cache'` (226) while the Image-element fallback appends a cache-busting timestamp (153-155) — opposite caching intents in the same loader.
  - Private `compressImageBlob` (162) duplicates the name of simpleImageLoader's exported `compressImageBlob` (simpleImageLoader.ts:68) with different defaults (1200px/0.80 vs 800px/0.6).
  - `createSnagCard`/`createCalendarTable` format dates with `toLocaleDateString('en-GB')` (443-444, 699-705), not the L07 kernel formatter used by pdfMakeUtils' footer.
  - Comment at line 121 says the Image-element path "works for public URLs with proper CORS headers" — strategy comment only; no Supabase storage-API path exists here (unlike simpleImageLoader).
- ASSUMED: none.

## src/lib/pdfBars.ts
- Purpose: Canvas-free (table-only) bar/card primitives — mini bar, segmented bar, gauge bar, tinted KPI card — lifted from the COC site report so pdf.js renders them correctly.
- Public surface:
  - `type Tone = "green" | "amber" | "red" | "slate"` (20)
  - `TONE_TINT: Record<Tone, { bg; accent; label; value; track }>` (23-28)
  - `toneForPct(pct: number): Tone` (31-33) — >=80 green, >=50 amber, else red
  - `miniBar(pct: number, color: string, opts?: { width?; track? }): Content` (47-58)
  - `segmentedBar(segments: Array<{ value; color }>, opts?: { width?; height? }): Content` (64-76)
  - `gaugeBar(pct: number, color: string, opts?: { width?; height? }): Content` (82-93)
  - `tintedKpiCard(opts: { label; value; sub?; tone: Tone; barPct?; contentWidth? }): Content` (102-116)
- Inputs & outputs: pure functions; numbers/colours in, pdfmake table Content out. No stores, no env.
- Dependencies: uses -> `./pdfMakeConfig` (L14, type-only import, line 1). used by <- (grep-verified): L08 src/lib/assetVerificationReport.ts:7 (`tintedKpiCard, gaugeBar, toneForPct`); in-unit pdfBars.test.ts:2. `segmentedBar` and `TONE_TINT` have no consumers outside the unit's own files (grep-verified).
- Side effects: none (pure).
- Error handling: input clamping only — pct clamped to [0,100] (50, 84), fill/track widths floored at 1-2pt (51-52, 85-86), zero-value segments dropped with an all-grey fallback track (67-70).
- Tests: src/lib/pdfBars.test.ts — see its section.
- Observed issues:
  - The header comment states these primitives were "Lifted from … siteCocReport.ts" (5); src/lib/siteCoc/siteCocReport.ts still contains its own private `miniBar` (:94) and `gaugeBar` (:112) rather than importing these (grep-verified) — the implementations exist twice.
  - `Tone` here duplicates the name of `Tone` in src/lib/siteCoc/statusDisplay.ts:1 (different ordering, same four members).
- ASSUMED: the "best-engineered PDF in the codebase" characterisation (5-6) is the author's comment, not verified.

## src/lib/pdfBars.test.ts
- Purpose: Tests the pdfBars primitives, centrally asserting that no node tree ever contains a `canvas` key.
- Public surface: none; local recursive helper `hasCanvas(node)` (6-13).
- Inputs & outputs: imports all six pdfBars exports (line 2).
- Dependencies: uses -> vitest; `./pdfBars` (L14). used by <- none found (grep-verified; run via vitest include).
- Side effects: none.
- Error handling: n/a.
- Tests (what is asserted): `toneForPct` threshold table incl. boundary values 80/79/50/49 (16-23); `miniBar` is table-based/no canvas (27-31), widths [50,50] at 50% of width 100, clamping at 150 and -10 (32-39), fill/track colours in cell order (40-44); `segmentedBar` drops zero segments and keeps colour order (48-57), single grey `#ECECEC` track when all zero (58-62); `gaugeBar` widths [25,75] and no canvas (66-70); `tintedKpiCard` uses TONE_TINT bg + accent cell, no canvas (74-79), stack has 2 entries without bar/sub (80-84), widths [4,113] for custom contentWidth (85-88).
- Observed issues: none.
- ASSUMED: none.

## src/lib/pdfBranding.ts
- Purpose: Loads company/client/site branding (logo + name) from Supabase with a 5-minute in-module cache, converts image URLs to base64, and provides logo Content helpers and kernel-delegating date formatters.
- Public surface:
  - `BRANDING: { logoWidth; logoHeight; coverLogoWidth; coverLogoHeight; headerLogoWidth; headerLogoHeight; defaultOrgName: 'Asset Management System'; confidentialityText }` (20-38)
  - `clearBrandingCache(): void` (56-58); `getCachedBranding(): { logoDataUrl: string|null; organizationName: string }` (63-74)
  - `imageUrlToBase64(url: string): Promise<string | null>` (85-123)
  - `loadCompanyBranding(): Promise<{ logoDataUrl: string|null; organizationName: string }>` (133-176)
  - `loadClientBranding(clientId: string): Promise<{ logoDataUrl; clientName }>` (181-210)
  - `loadSiteBranding(siteId: string): Promise<{ logoDataUrl; siteName; clientName }>` (215-256)
  - `createImageContent(dataUrl, options?): ContentImage` (269-290); `createHeaderLogo(logoDataUrl, orgName): Content` (295-309); `createCoverLogo(logoDataUrl, orgName): Content` (314-329)
  - `formatPdfDate(date?: Date|string): string` (338-340); `formatPdfDateTime(date?: Date|string): string` (346-348); `generateReferenceNumber(prefix = 'REF'): string` (353-357)
- Inputs & outputs: In — Supabase tables `settings` (columns `company_logo_url, company_name`, lines 146-150), `clients` (`name, logo_url`, 187-190), `sites` (join `clients(name, logo_url)` + `client_logo_url`, 221-232); image URLs fetched over HTTP. Out — base64 data URLs, org/site/client names, pdfmake Content. Store touched: module-level mutable `brandingCache` (50) with `CACHE_TTL_MS = 5min` (51) — memory only, no localStorage.
- Dependencies: uses -> `@/integrations/supabase/client` (L19, line 9), `./documentDesignStandards` (L10, line 10), `./pdfMakeConfig` (L14, line 11), `./report/reportKernel` (L07, line 12). used by <- (grep-verified) in-unit: pdfTemplates.ts:22-26, pdfBranding.dates.test.ts:2; external: C14 src/components/SiteSummaryReport.tsx:22 (`loadCompanyBranding, imageUrlToBase64`), L10 src/lib/inspectionTemplateReportGenerator.ts:10, L10 src/lib/fortressChecklistReportGenerator.ts:10, L10 src/lib/complianceReportGenerator.ts:29-33 (`loadCompanyBranding, generateReferenceNumber, formatPdfDate`), L08 src/lib/assetVerificationReportGenerator.ts:15 (`loadCompanyBranding, imageUrlToBase64, formatPdfDate, generateReferenceNumber`), L10 src/lib/calendarReportGenerator.ts:7, V06 src/views/site-coc/ReportSubTab.tsx:12 (`imageUrlToBase64`).
- Side effects: Supabase reads on the three loaders; HTTP fetch of logo images (`mode: 'cors', cache: 'force-cache'`, 95-98); writes the module cache (165-169); console.warn on all failure paths.
- Error handling: everything is fail-soft, never throws: `imageUrlToBase64` returns `null` on non-OK response, FileReader error, or thrown fetch error, each with console.warn (100-122); `loadCompanyBranding` returns `getCachedBranding()` on query error or exception (152-155, 172-175) — which, when the cache is expired/empty, is `{ logoDataUrl: null, organizationName: 'Asset Management System' }` (70-73); `loadClientBranding`/`loadSiteBranding` return `'Unknown Client'`/`'Unknown Site'` placeholders on error (194, 236, 254).
- Tests: src/lib/pdfBranding.dates.test.ts — date formatters only (see its section). Cache, loaders, and logo helpers are untested.
- Observed issues:
  - `loadClientBranding`, `loadSiteBranding`, `clearBrandingCache`, `getCachedBranding`, `createHeaderLogo`, `createCoverLogo`, `formatPdfDateTime` have zero consumers outside the unit (grep-verified). `createImageContent`'s only consumer is in-unit pdfTemplates.ts:24 — where it is imported but never called in the body (grep of pdfTemplates.ts shows only the import line).
  - `loadCompanyBranding` reads the `settings` table with `.limit(1).maybeSingle()` and no filter (146-150) — first-row-wins, single-tenant assumption.
  - A failed logo conversion (`logoDataUrl: null`) is cached for the full 5-minute TTL (160-169).
  - `site.clients` is cast `as any` twice to read the joined row (240, 250).
- ASSUMED: none.

## src/lib/pdfBranding.dates.test.ts
- Purpose: Pins `formatPdfDate`/`formatPdfDateTime` to the L07 kernel's day-first output and em-dash fallback.
- Public surface: none.
- Inputs & outputs: imports the two formatters (line 2).
- Dependencies: uses -> vitest; `./pdfBranding` (L14). used by <- none found (grep-verified; run via vitest include).
- Side effects: importing pdfBranding pulls in the supabase client module.
- Error handling: n/a.
- Tests: `formatPdfDate(new Date(2026,5,13))` → `'13 June 2026'` (5-7); `formatPdfDate('garbage')` → `'—'` (8-10); `formatPdfDate('')` → `'—'` ("no longer defaults to today", 11-13); `formatPdfDateTime(new Date(2026,5,13,14,30))` → `'13 Jun 2026, 14:30'` (14-16).
- Observed issues: none.
- ASSUMED: none.

## src/lib/pdfTemplates.ts
- Purpose: A second, older-style set of "standardized templates" — cover page, page header/footer, KPI dashboard, section headers, data tables, status badges, compliance scoring, and text utilities — parallel to pdfMakeUtils.
- Public surface:
  - `interface CoverPageData { title; subtitle?; siteName; clientName?; reportType; reportDate?; referenceNumber?; preparedBy?; address? }` (33-43); `createCoverPage(data: CoverPageData, logoDataUrl?: string|null): Content[]` (48-170)
  - `createPageHeader(title: string, logoDataUrl?, orgName?): DynamicContent` (179-230); `createPageFooter(customLeftText?: string): DynamicContent` (239-279)
  - `interface KpiItem { value; label; color?; icon? }` (285-290); `createKpiDashboard(kpis: KpiItem[]): Content` (295-328)
  - `createSectionHeader(title, style?: 'primary'|'secondary'|'muted'): Content` (337-381)
  - `interface TableColumn { header; dataKey; width?; align?; format? }` (387-393); `createDataTable<T>(columns, data, options?: { headerRows?; dontBreakRows?; zebraStripe?; title? }): Content[]` (398-455)
  - `type StatusType = 'success'|'warning'|'error'|'info'|'neutral'` (461); `createStatusBadge(text, status: StatusType): Content` (466-484); `getStatusType(status: string): StatusType` (489-505)
  - `interface PDFComplianceCheck` (9 booleans, 511-521); `createComplianceResult(checks: Partial<PDFComplianceCheck>): PDFComplianceCheck` (526-540); `calculateComplianceScore(checks): number` (545-549)
  - `createParagraph(text, style?: keyof typeof DEFAULT_STYLES): Content` (558-567); `createBulletList(items: string[]): Content` (572-577); `createSpacer(heightMm = 10): Content` (582-584); `createDivider(): Content` (589-596); `truncateText(text, maxLength = 50): string` (601-604)
- Inputs & outputs: pure builders; data in, Content out. `createCoverPage`/`createPageFooter` call `formatPdfDate` (146, 268); no stores.
- Dependencies: uses -> `./pdfMakeConfig` (L14, lines 14-21), `./pdfBranding` (L14, lines 22-26: `BRANDING, createImageContent, formatPdfDate`), `./documentDesignStandards` (L10, line 27). used by <- (grep-verified): C07 src/components/site/AssetComparisonTable.tsx:26 (`PDFComplianceCheck` type only), L08 src/lib/assetVerificationReportGenerator.ts:16 (`PDFComplianceCheck, createComplianceResult`), L10 src/lib/complianceReportGenerator.ts:18-24 (`createCoverPage, createPageHeader, createPageFooter, createKpiDashboard, createSpacer`).
- Side effects: none (pure; no logging).
- Error handling: none; `createDataTable` renders missing values as `''` (426); `getStatusType` falls through to `'neutral'` (504).
- Tests: none (grep-verified — no test file imports pdfTemplates).
- Observed issues:
  - Nine export names collide with pdfMakeUtils (see unit header); `PDFComplianceCheck` is declared identically in three files (pdfMakeUtils.ts:695, pdfTemplates.ts:511, re-export in pdfEngine.ts:60).
  - `createImageContent` is imported (24) but never used in the file body.
  - `createPageHeader`/`createPageFooter` hard-code the page-1 skip (`if (currentPage === 1) return null`, 185, 241) with no opt-out parameter, and the footer prints raw `Page ${currentPage} of ${pageCount}` with no clamping (262) — unlike pdfMakeUtils' kernel-clamped version.
  - Divider and header/footer rules are drawn with box-drawing character strings (`'━━━…'` line 98, `'────…'` line 591) and with `border` array properties on plain text nodes outside any table (222-227, 247-251).
  - `createPageFooter` prints `formatPdfDate()` with no argument (268); the kernel formatter's no-arg behaviour returns the fallback `'—'` (src/lib/report/reportKernel.ts:28, default `fallback = '—'`) — the footer date renders as an em dash.
  - `calculateComplianceScore`, `truncateText`, `getStatusType`, `createStatusBadge`, `createSectionHeader`, `createDataTable`, `createParagraph`, `createBulletList`, `createDivider` have zero consumers outside the unit (grep-verified).
- ASSUMED: none.

## src/lib/pdfDocumentSaver.ts
- Purpose: Uploads a generated PDF blob to the `documents` storage bucket and records it in `site_documents` or `subsection_documents`, creating the document category on demand, with orphan-blob cleanup on insert failure.
- Public surface:
  - `savePDFToDocuments(options: { blob: Blob; fileName: string; siteId?: string; subsectionId?: string; categoryName: string }): Promise<{ success: boolean; error?: string; documentUrl?: string }>` (29-53)
  - `getReportCategoryName(reportType: string): string` (198-210) — maps 8 report types to category display names, default `'Generated Reports'`.
  - (private) `saveToSiteDocuments` (55-123), `saveToSubsectionDocuments` (125-193), `removeUploadedBlob` (18-24).
- Inputs & outputs: In — PDF blob + context ids. Stores touched: tables `site_document_categories` (select/insert, 62-84), `site_documents` (insert with `site_id, category_id, file_name, file_url, category`, 107-115), `document_categories` (132-155), `subsection_documents` (insert with `subsection_id, category_id, file_name, file_url, file_size`, 177-185); storage bucket `documents` (upload `contentType: application/pdf` at paths `{siteId}/{Category}/{ts}-{name}` or `subsections/{subsectionId}/{Category}/{ts}-{name}`, 89-98/159-169; `getPublicUrl` 102-104/171-174; `remove` on rollback 21). Out — `SaveResult` with the public URL.
- Dependencies: uses -> `@/integrations/supabase/client` (L19, line 1). used by <- (grep-verified): C14 src/components/ComprehensiveInspectionReport.tsx:12, C12 src/components/InteractiveFloorPlan.tsx:10, C14 src/components/FortressMarkingChecklist.tsx:12, C14 src/components/SiteSummaryReport.tsx:8, C07 src/components/site/AssetComparisonTable.tsx:22, L15 src/lib/pdfmakeInspectionReport.ts:24, V06 src/views/site-coc/ReportSubTab.tsx:7; in-unit pdfDocumentSaver.test.ts:31.
- Side effects: storage upload, up to two table inserts, compensating storage `remove` when the document insert fails (118-120, 187-189); console.error/warn on failures.
- Error handling: private helpers throw on category-insert or upload error (84, 99, 154, 169) and on document-insert error after removing the uploaded blob (117-120, 187-192); `savePDFToDocuments` catches everything, detects size errors via regex `/exceeded the maximum allowed size|payload too large|413/i` and returns a friendly "Report file is too large to save (N MB)…" message, otherwise the raw message (41-52); missing both ids returns `{ success: false, error: "Either siteId or subsectionId must be provided" }` (39). `removeUploadedBlob` swallows its own failure with console.warn (20-23).
- Tests: src/lib/pdfDocumentSaver.test.ts — see its section.
- Observed issues:
  - When both `subsectionId` and `siteId` are provided, subsection wins silently (34-38).
  - Category find-or-create is a select followed by an insert with no conflict handling (62-84, 132-155); created categories get `order_index: 999, is_system: true` (78-79, 148-149).
  - The site-documents insert writes both `category_id` and a denormalised `category` name column (111-114); the subsection insert records `file_size` (184) but the site insert does not.
  - The category-select errors are discarded — only `data` is destructured (62-66, 132-136); a failed select falls through to the insert path.
  - `file_url` stores a public URL from `getPublicUrl` on the `documents` bucket (102-113, 171-183).
- ASSUMED: that the `documents` bucket is publicly readable (the code stores `publicUrl` unconditionally; bucket config not inspected in this unit).

## src/lib/pdfDocumentSaver.test.ts
- Purpose: Tests the site-documents save path's fail-closed behaviour: orphan-blob removal on DB insert failure, no removal on success, and one category-name mapping.
- Public surface: none; `vi.hoisted` spies `removeSpy`/`insertResult` (4-7) and a full `vi.mock` of `@/integrations/supabase/client` (9-29) that returns an existing category, a fixed upload path, a fixed public URL, and a switchable insert result.
- Inputs & outputs: none beyond the mock; no real network.
- Dependencies: uses -> vitest; `./pdfDocumentSaver` (L14); mocks L19's module path. used by <- none found (grep-verified; run via vitest include).
- Side effects: none (fully mocked).
- Error handling: n/a.
- Tests: `getReportCategoryName('site-coc')` → `'Site COC Reports'` (33-37); insert failure → `success: false`, error truthy, `removeSpy` called once with `['sites/site-1/cat/123-file.pdf']` (52-59); insert success → `success: true`, remove not called (61-66).
- Observed issues: only the site path with a pre-existing category is exercised; the subsection path, category-creation path, upload-failure path, and the size-error message mapping are not covered.
- ASSUMED: none.

## src/lib/simpleImageLoader.ts
- Purpose: Loads images as base64 data URLs for PDF embedding by parsing Supabase storage URLs and using the authenticated storage `download()` API (bypassing CORS), with a plain-fetch fallback and optional canvas-based JPEG compression.
- Public surface:
  - `interface ReportImageOptions { compress?: boolean; maxWidth?: number; quality?: number }` (55-62)
  - `compressImageBlob(blob: Blob, maxWidth = 800, quality = 0.6): Promise<Blob>` (68-103)
  - `loadImageSimple(url: string, opts?: ReportImageOptions): Promise<string | null>` (110-162)
  - `loadImagesSimple(urls: string[], opts?: ReportImageOptions): Promise<Map<string, string>>` (168-186)
  - (private) `parseSupabaseUrl(url)` (14-35) — matches `/storage/v1/object/(public|sign)/BUCKET/PATH`; `blobToDataUrl(blob)` (40-53).
- Inputs & outputs: In — arbitrary image URLs (data URLs passed through, 114-116). Stores touched: any Supabase storage bucket named in the URL via `supabase.storage.from(bucket).download(path)` (124-126) — file header names `client-logos, site-images, inspection-photos, documents` (line 5). Out — base64 data URL, or a Map of url→dataURL with failed URLs omitted (177-181). Reads `process.env.NODE_ENV` to gate all logging.
- Dependencies: uses -> `@/integrations/supabase/client` (L19, line 8). used by <- (grep-verified): L15 src/lib/pdfmakeInspectionReport.ts:22 (`loadImageSimple, loadImagesSimple, compressImageBlob`), L08 src/lib/assetVerificationReportGenerator.ts:20 (`loadImagesSimple`).
- Side effects: Supabase storage download; fallback HTTP `fetch`; canvas creation + object-URL create/revoke during compression (75-101); `loadImagesSimple` fires all downloads in parallel with `Promise.all` and no concurrency bound (176-183).
- Error handling: fail-soft throughout — `parseSupabaseUrl` returns `null` on unparseable URLs (30-34); storage-download error logs (dev only) and falls through to plain fetch (128-133); fetch non-OK or throw logs and leaves `blob` null (135-147); all-methods-failed returns `null` (149-151); `compressImageBlob` resolves with the original blob on non-image type, missing canvas context, `toBlob` null, or image-load error (73, 88-92, 95, 97-100); `blobToDataUrl` resolves `null` on FileReader error (47-51); outer catch returns `null` (158-161).
- Tests: none (grep-verified — no test file imports simpleImageLoader).
- Observed issues:
  - Exported `compressImageBlob` shares its name with pdfEngine's private version (pdfEngine.ts:162) with different defaults (800/0.6 vs 1200/0.80).
  - Signed URLs (`/object/sign/`) are parsed (21) and then downloaded via the authenticated API, discarding the signature token.
  - `loadImagesSimple` silently drops failed URLs from the result Map (178-180); callers cannot distinguish "no URL" from "load failed".
- ASSUMED: none.
