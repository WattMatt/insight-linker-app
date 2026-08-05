# Inventory — src/lib/report + documents + pdf + coc (reporting/document generation libraries)

Date: 2026-07-29

List command:

```
git ls-files 'src/lib/report/*' 'src/lib/documents/*' 'src/lib/pdf/*' 'src/lib/coc/*'
```

Output count: **32 files** (`| wc -l` → `32`). Total LOC (`xargs wc -l`): **2880**.

Full command output:

```
src/lib/coc/assignPoolFile.ts
src/lib/coc/poolUpload.ts
src/lib/coc/reassignPool.ts
src/lib/coc/uploadCocFiles.ts
src/lib/documents/documentMutations.test.ts
src/lib/documents/documentMutations.ts
src/lib/documents/paths.test.ts
src/lib/documents/paths.ts
src/lib/documents/reportCategories.test.ts
src/lib/documents/reportCategories.ts
src/lib/documents/uploadConstraints.test.ts
src/lib/documents/uploadConstraints.ts
src/lib/pdf/advancedProcessor.ts
src/lib/pdf/imageExtractor.ts
src/lib/pdf/ocrEngine.ts
src/lib/pdf/textExtractor.ts
src/lib/report/calendarRows.test.ts
src/lib/report/calendarRows.ts
src/lib/report/complianceRows.test.ts
src/lib/report/complianceRows.ts
src/lib/report/fortressChecklistRows.test.ts
src/lib/report/fortressChecklistRows.ts
src/lib/report/inspectionScore.test.ts
src/lib/report/inspectionScore.ts
src/lib/report/inspectionTemplateRows.test.ts
src/lib/report/inspectionTemplateRows.ts
src/lib/report/reportKernel.test.ts
src/lib/report/reportKernel.ts
src/lib/report/siteSummaryRows.test.ts
src/lib/report/siteSummaryRows.ts
src/lib/report/subsectionAssetMatch.test.ts
src/lib/report/subsectionAssetMatch.ts
```

LOC per file from `git ls-files ... | xargs wc -l` (recorded in each entry below).

---

## src/lib/coc — COC file-pool upload/assignment (4 files, 228 LOC)

### src/lib/coc/assignPoolFile.ts
- Type: source
- LOC: 66
- Public surface:
  - `interface AssignablePoolFile` (line 7)
  - `async function assignPoolFile(siteId: string, file: AssignablePoolFile, subsectionId: string, kind: "coc" | "eval"): Promise<void>` (line 38)
- Notes: Supabase writes to `coc_certificates`, `subsection_documents`, `coc_file_pool` (lines 17–65). Imports category/doc-insert helpers from `./uploadCocFiles` (line 5), `normCert` from `@/lib/siteCoc/normalize`, `extractEvalVerdict` from `@/lib/cocFilename`, `docStatusFromVerdict` from `@/lib/siteCoc/verdictMap` (lines 1–4).

### src/lib/coc/poolUpload.ts
- Type: source
- LOC: 51
- Public surface:
  - `interface PoolRouteResult` (line 8)
  - `async function uploadFileToPool(siteId: string, file: File): Promise<{ poolId: string; detectedCertNo: string | null }>` (line 18)
  - `async function poolRouteFile(siteId: string, file: File): Promise<PoolRouteResult>` (line 39)
- Notes: Uploads to Supabase storage bucket `documents` (line 22), inserts into `coc_file_pool` (line 26), removes upload on insert failure (line 31). Calls `reassignPendingPoolFiles` from `./reassignPool` (line 4).

### src/lib/coc/reassignPool.ts
- Type: source
- LOC: 38
- Public surface:
  - `interface ReassignResult { assigned: number; pending: number }` (line 7)
  - `async function reassignPendingPoolFiles(siteId: string): Promise<ReassignResult>` (line 10)
- Notes: Reads `coc_file_pool` (status=pending) and `coc_certificates` (lines 12–13), delegates matching to `planPoolAssignment` from `@/lib/siteCoc/assignmentEngine` (line 2), assigns via `assignPoolFile` (line 3), updates `coc_file_pool` rows (lines 29, 32).

### src/lib/coc/uploadCocFiles.ts
- Type: source
- LOC: 73
- Public surface:
  - `async function findOrCreateCategory(subsectionId: string, name: string): Promise<{ id: string; name: string }>` (line 14)
  - `async function insertCocCertificateDoc(opts: { subsectionId: string; cocCategoryId: string; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; cocStatus?: "Pass" | "Fail" | "Pending" }): Promise<{ id: string }>` (line 27)
  - `async function uploadEvaluationReport(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string; parentCocNumber: string | null; file: File }): Promise<{ id: string }>` (line 40)
  - `async function insertEvaluationReportDoc(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string | null; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; verdict: string | null }): Promise<{ id: string }>` (line 63)
- Notes: Supabase tables `document_categories` (lines 16–21), `subsection_documents` (lines 30, 66); storage bucket `documents` upload/getPublicUrl/remove (lines 46–57).

---

## src/lib/documents — document CRUD + upload/path/category rules (8 files, 417 LOC)

### src/lib/documents/documentMutations.ts
- Type: source
- LOC: 146
- Public surface:
  - `interface DocRef` (line 6: id, source, file_name, file_url, site_id?, subsection_id?, category_id, coc_number?)
  - `interface TargetCategory { id: string; name: string }` (line 17)
  - `interface MutationResult { id: string; ok: boolean; error?: string }` (line 18)
  - `async function logDocumentActivity(action: string, details: Record<string, unknown>): Promise<void>` (line 29)
  - `async function renameDocument(doc: DocRef, newName: string, now: number = Date.now()): Promise<MutationResult>` (line 50)
  - `async function moveDocuments(docs: DocRef[], target: TargetCategory, now: number = Date.now()): Promise<MutationResult[]>` (line 116)
  - `async function deleteDocuments(docs: DocRef[]): Promise<MutationResult[]>` (line 139)
- Notes: `const BUCKET = 'documents'` (line 4). Copy-then-delete storage move via download/upload/getPublicUrl/remove (lines 42–46, comment line 40: "repo has no storage.copy/move"). Writes `activity_logs` (line 31); updates/deletes `site_documents` or `subsection_documents` via `tableFor(source)` (lines 20–22, 70, 101, 130). Uses `supabase.auth.getUser()` (line 25).

### src/lib/documents/documentMutations.test.ts
- Type: tests
- LOC: 93
- Public surface: none (vitest suite; mocks supabase client, line 1–35).
- Notes: Covers `renameDocument`, `moveDocuments`, `deleteDocuments`.

### src/lib/documents/paths.ts
- Type: source
- LOC: 48
- Public surface:
  - `type DocSource = 'site' | 'subsection'` (line 1)
  - `function storagePathFromUrl(url: string): string | null` (line 3)
  - `function splitNameExt(fileName: string): { base: string; ext: string }` (line 10)
  - `function sanitizeSegment(s: string): string` (line 17)
  - `function buildRenamePath(oldPath: string, newBase: string, ext: string, timestamp: number): string` (line 23)
  - `interface BuildMoveArgs` (line 30: source, siteId, subsectionId, targetCategoryId, targetCategoryName, fileName, timestamp)
  - `function buildMovePath(a: BuildMoveArgs): string` (line 42)
- Notes: Pure path builders. Comment line 16: sanitizer "Matches the existing upload sanitizer in SiteDetail.tsx handleUploadDocument". Site docs path folds category NAME; subsection docs use category ID (lines 42–47).

### src/lib/documents/paths.test.ts
- Type: tests
- LOC: 45
- Public surface: none (vitest suite for the five paths.ts exports, line 2).

### src/lib/documents/reportCategories.ts
- Type: source
- LOC: 19
- Public surface:
  - `const SYSTEM_REPORT_CATEGORIES` (line 5: 9 category names, `as const`)
  - `function isSystemReportCategory(name: string): boolean` (line 17)
- Notes: Header comment (lines 1–4): "Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts".

### src/lib/documents/reportCategories.test.ts
- Type: tests
- LOC: 16
- Public surface: none (vitest suite, line 2).

### src/lib/documents/uploadConstraints.ts
- Type: source
- LOC: 20
- Public surface:
  - `const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024` (line 1)
  - `const ALLOWED_EXTENSIONS` (line 3: pdf/doc/docx/xls/xlsx/png/jpg/jpeg/gif/webp/svg, `as const`)
  - `type UploadValidation = { ok: true } | { ok: false; reason: string }` (line 8)
  - `function validateUploadFile(file: File): UploadValidation` (line 10)

### src/lib/documents/uploadConstraints.test.ts
- Type: tests
- LOC: 30
- Public surface: none (vitest suite, line 2).

---

## src/lib/pdf — client-side PDF processing pipeline (4 files, 1261 LOC)

### src/lib/pdf/advancedProcessor.ts
- Type: source
- LOC: 371
- Public surface:
  - `interface ProcessingOptions` (line 16: maxPages?, enableOCR?, extractImages?, extractTables?, detectStructure?, ocrOptions?, imageOptions?)
  - `interface DocumentSection` (line 26)
  - `interface ProcessedDocument` (line 36: pages, fullText, sections, tables, images, logo, ocrResults?, metadata, quality)
  - `async function processDocument(file: File, options: ProcessingOptions = DEFAULT_OPTIONS, onProgress?: (stage: string, current: number, total: number) => void): Promise<ProcessedDocument>` (line 199)
  - `async function quickExtractText(file: File, maxPages: number = 10): Promise<string>` (line 288)
  - `async function detectScannedDocument(file: File): Promise<boolean>` (line 310)
  - `async function extractPageRange(file: File, startPage: number, endPage: number, options: ProcessingOptions = DEFAULT_OPTIONS): Promise<PageTextContent[]>` (line 344)
  - Re-exported types from siblings (lines 369–371).
- Notes: Sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a cdnjs.cloudflare.com URL when `window` exists (lines 12–14).

### src/lib/pdf/imageExtractor.ts
- Type: source
- LOC: 306
- Public surface:
  - `interface ExtractedImage` (line 8), `interface ImageExtractionOptions` (line 23)
  - `async function extractImagesFromPage(page: pdfjsLib.PDFPageProxy, pageNumber: number, options: ImageExtractionOptions = DEFAULT_OPTIONS): Promise<ExtractedImage[]>` (line 122)
  - `async function capturePageAsImage(page: pdfjsLib.PDFPageProxy, pageNumber: number, scale: number = 1.5): Promise<ExtractedImage>` (line 206)
  - `async function extractAllImages(pdf: pdfjsLib.PDFDocumentProxy, options?: ImageExtractionOptions, onProgress?: (current: number, total: number) => void): Promise<ExtractedImage[]>` (line 247)
  - `async function findDocumentLogo(pdf: pdfjsLib.PDFDocumentProxy): Promise<ExtractedImage | null>` (line 273)
  - `async function extractCoverPageImages(pdf: pdfjsLib.PDFDocumentProxy): Promise<{ logo: ExtractedImage | null; hero: ExtractedImage | null }>` (line 292)
- Notes: Browser-only (document.createElement('canvas'), line 213).

### src/lib/pdf/ocrEngine.ts
- Type: source
- LOC: 236
- Public surface:
  - `interface OCRResult` (line 8), `interface OCRPageResult` (line 19), `interface OCROptions` (line 26)
  - `function detectScannedPage(textContent: string, imageCount: number): boolean` (line 92)
  - `async function extractTextFromCanvas(canvas: HTMLCanvasElement, options: OCROptions = DEFAULT_OCR_OPTIONS): Promise<OCRResult[]>` (line 104)
  - `async function renderPageToCanvas(page: pdfjsLib.PDFPageProxy, scale: number = 2): Promise<HTMLCanvasElement>` (line 131)
  - `async function processPageWithOCR(page: pdfjsLib.PDFPageProxy, pageNumber: number, options: OCROptions = DEFAULT_OCR_OPTIONS): Promise<OCRPageResult>` (line 156)
  - `async function batchProcessPagesWithOCR(pages: pdfjsLib.PDFPageProxy[], options?: OCROptions, onProgress?: (current: number, total: number) => void): Promise<OCRPageResult[]>` (line 222)
- Notes: `extractTextFromCanvas` is a stub — preprocesses the canvas then always `return []`; comment lines 121–122: "actual OCR would require Tesseract.js or similar / This stub allows the architecture to be in place".

### src/lib/pdf/textExtractor.ts
- Type: source
- LOC: 348
- Public surface:
  - `interface TextBlock` (line 8), `interface TextLine` (line 22), `interface ExtractedColumn` (line 29), `interface TableCell` (line 36), `interface DetectedTable` (line 44), `interface PageTextContent` (line 52)
  - `async function extractTextBlocks(page: pdfjsLib.PDFPageProxy, pageNumber: number): Promise<TextBlock[]>` (line 70)
  - `function groupBlocksIntoLines(blocks: TextBlock[]): TextLine[]` (line 104)
  - `function detectColumns(blocks: TextBlock[]): ExtractedColumn[]` (line 171)
  - `function detectTables(lines: TextLine[]): DetectedTable[]` (line 219)
  - `async function extractPageContent(page: pdfjsLib.PDFPageProxy, pageNumber: number): Promise<PageTextContent>` (line 294)
  - `async function extractDocumentContent(pdf: pdfjsLib.PDFDocumentProxy, maxPages?: number, onProgress?: (current: number, total: number) => void): Promise<PageTextContent[]>` (line 332)

---

## src/lib/report — pure report row-builders and formatters (16 files, 974 LOC)

### src/lib/report/calendarRows.ts
- Type: source
- LOC: 123
- Public surface:
  - Interfaces: `CalendarEvent` (line 12), `CalendarStats` (line 23), `CalendarReportData` (line 30), `CalendarKpi` (line 39), `PriorityBreakdown` (line 44), `MonthGroup` (line 51), `CalendarEventRow` (line 57)
  - `function buildCalendarKpis(stats?: CalendarStats): CalendarKpi[]` (line 67)
  - `function buildPriorityBreakdown(events: CalendarEvent[]): PriorityBreakdown` (line 78)
  - `function groupEventsByMonth(events: CalendarEvent[]): MonthGroup[]` (line 91)
  - `function buildEventRows(events: CalendarEvent[]): CalendarEventRow[]` (line 110)
- Notes: Imports `formatDate` from `./reportKernel` (line 5).

### src/lib/report/calendarRows.test.ts
- Type: tests / LOC: 84 / vitest suite for calendarRows exports.

### src/lib/report/complianceRows.ts
- Type: source
- LOC: 29
- Public surface:
  - `interface ComplianceStats` (line 3), `interface ComplianceSummaryRow` (line 12)
  - `function buildComplianceSummaryRows(stats: ComplianceStats): ComplianceSummaryRow[]` (line 19)
- Notes: Uses `percent` from `./reportKernel` (line 1).

### src/lib/report/complianceRows.test.ts
- Type: tests / LOC: 26 / vitest suite.

### src/lib/report/fortressChecklistRows.ts
- Type: source
- LOC: 73
- Public surface:
  - `type StatusLevel = 'success' | 'warning' | 'error' | 'muted'` (line 11)
  - Interfaces: `FortressChecklistItem` (line 13), `FortressChecklistSection` (line 21), `FortressChecklistData` (line 27), `FortressKpi` (line 37), `FortressItemRow` (line 43)
  - `function progressLevel(progress: number): StatusLevel` (line 50)
  - `function buildFortressKpis(data: FortressChecklistData): FortressKpi[]` (line 57)
  - `function buildFortressItemRows(section: FortressChecklistSection): FortressItemRow[]` (line 67)

### src/lib/report/fortressChecklistRows.test.ts
- Type: tests / LOC: 97 / vitest suite.

### src/lib/report/inspectionScore.ts
- Type: source
- LOC: 33
- Public surface:
  - `function scorePercentage(passCount: number, failCount: number): number` (line 12) — % of assessed items passed; 100 when nothing assessed
  - `function isPassStatus(status: string): boolean` (line 20), `function isFailStatus(status: string): boolean` (line 23) — word lists
  - `function itemStatusKind(item: { value?: unknown }): 'pass' | 'fail' | 'pending'` (line 28)

### src/lib/report/inspectionScore.test.ts
- Type: tests / LOC: 40 / vitest suite.

### src/lib/report/inspectionTemplateRows.ts
- Type: source
- LOC: 59
- Public surface:
  - Interfaces: `TemplateItem` (line 6), `TemplateSection` (line 13), `InspectionTemplateData` (line 18), `TemplateItemRow` (line 28), `TemplateMetaRow` (line 35)
  - `function buildTemplateItemRows(section: TemplateSection): TemplateItemRow[]` (line 41)
  - `function buildTemplateMeta(data: InspectionTemplateData): TemplateMetaRow[]` (line 51)

### src/lib/report/inspectionTemplateRows.test.ts
- Type: tests / LOC: 61 / vitest suite.

### src/lib/report/reportKernel.ts
- Type: source
- LOC: 67
- Public surface:
  - `function formatDate(input?: Date | string | null, fallback = '—'): string` (line 28)
  - `function formatDateTime(input?: Date | string | null, fallback = '—'): string` (line 35)
  - `function localDateStamp(input?: Date | string | null): string` (line 42)
  - `function percent(numerator: number, denominator: number, fallback = '0%'): string` (line 48)
  - `function clampPageNumbers(currentPage: number, pageCount: number, skipFirstPage: boolean): { page: number; total: number }` (line 57)
- Notes: Header comment (lines 1–8): pure deterministic formatters shared by all report builders; explicit day-first dates, locale-independent.

### src/lib/report/reportKernel.test.ts
- Type: tests / LOC: 80 / vitest suite for all five kernel exports (line 2).

### src/lib/report/siteSummaryRows.ts
- Type: source
- LOC: 47
- Public surface:
  - Interfaces: `CocSubsectionInput` (line 3), `CocValidationRow` (line 9), `InspectionInput` (line 16), `InspectionRow` (line 22)
  - `function buildCocValidationRows(subsections: CocSubsectionInput[]): CocValidationRow[]` (line 30)
  - `function buildInspectionRows(inspections: InspectionInput[]): InspectionRow[]` (line 40)

### src/lib/report/siteSummaryRows.test.ts
- Type: tests / LOC: 38 / vitest suite.

### src/lib/report/subsectionAssetMatch.ts
- Type: source
- LOC: 61
- Public surface:
  - `interface MatchableAsset` (line 3: meter_serial_number?, premises_id?, trade_as?, breaker_size?)
  - `interface MatchableSubsection` (line 10: name?, meter_serial_number?)
  - `function matchAssetForSubsection<T extends MatchableAsset>(sub: MatchableSubsection, assets: T[]): T | undefined` (line 32)
- Notes: Uses `normalizeMeterSerial` from `@/lib/assetVerification` (line 1); doc comment says it mirrors the Asset Verification tab/report join (lines 20–31).

### src/lib/report/subsectionAssetMatch.test.ts
- Type: tests / LOC: 56 / vitest suite.

---

## Runtime observations

All files in this slice are libraries — no Next.js route handlers, API entry points, schedulers, queues, or background jobs are defined here. Runtime-relevant facts:

- External service: Supabase (client from `@/integrations/supabase/client`) used by all 4 `src/lib/coc` files and `src/lib/documents/documentMutations.ts` (import at src/lib/coc/assignPoolFile.ts:1, src/lib/coc/poolUpload.ts:1, src/lib/coc/reassignPool.ts:1, src/lib/coc/uploadCocFiles.ts:1, src/lib/documents/documentMutations.ts:1).
- Supabase storage bucket `documents`: src/lib/coc/poolUpload.ts:22, src/lib/coc/uploadCocFiles.ts:46, src/lib/documents/documentMutations.ts:4 (`const BUCKET = 'documents'`).
- Supabase tables touched: `coc_file_pool` (poolUpload.ts:26, reassignPool.ts:12, assignPoolFile.ts:65), `coc_certificates` (assignPoolFile.ts:17, reassignPool.ts:13), `subsection_documents` (uploadCocFiles.ts:30, assignPoolFile.ts:44, documentMutations.ts via tableFor:20), `site_documents` (documentMutations.ts:20), `document_categories` (uploadCocFiles.ts:16), `activity_logs` (documentMutations.ts:31).
- Supabase auth: `supabase.auth.getUser()` at src/lib/documents/documentMutations.ts:25.
- External CDN dependency: `pdfjsLib.GlobalWorkerOptions.workerSrc` set to `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/<version>/pdf.worker.min.js` at src/lib/pdf/advancedProcessor.ts:13 (guarded by `typeof window !== 'undefined'`, line 12).
- Browser-only APIs in src/lib/pdf: `document.createElement('canvas')` (imageExtractor.ts:213, ocrEngine.ts inside renderPageToCanvas), `performance.now()` (advancedProcessor.ts:203, ocrEngine.ts:161).
- Consumers (entry into this slice): `src/lib/report/*` is imported by report generators (`src/lib/pdfMakeUtils.ts:37`, `src/lib/calendarReportGenerator.ts:14`, `src/lib/fortressChecklistReportGenerator.ts:16`, `src/lib/inspectionTemplateReportGenerator.ts:15`, `src/lib/complianceReportGenerator.ts:35`, `src/lib/pdfmakeInspectionReport.ts:23`, `src/lib/pdfBranding.ts:12`, `src/lib/documentDesignStandards.ts:9`, `src/lib/siteCoc/reportKpis.ts:6`) and `src/components/SiteSummaryReport.tsx:12,25`. `src/lib/coc/*` is imported by `src/views/site-coc/useSiteCocPool.ts:4-6`, `src/views/site-coc/useSiteCoc.ts:5`, `src/views/site-coc/useSiteCocImport.ts:8`, `src/views/subsection-detail/CocMeteringTab.tsx:13`, `src/views/subsection-detail/useSubsectionDetail.ts:9`, `src/views/ContractorSubsectionDetail.tsx:14`. `src/lib/documents/*` is imported by `src/views/SiteDetail.tsx:35-36` and `src/components/site/MoveDocumentsDialog.tsx:6`.

## Oddities

- **src/lib/pdf has zero importers.** `grep -rn "from ['\"]@/lib/pdf/" src` (excluding src/lib/pdf itself) returns nothing, and grep for the module names `advancedProcessor|ocrEngine|textExtractor|imageExtractor|processDocument|quickExtractText|detectScannedDocument` outside src/lib/pdf also returns nothing. The 4 files (1261 LOC) reference each other only. (Earlier substring matches on "lib/pdf" were files importing `@/lib/pdfExport`, `@/lib/pdfDocumentSaver` etc. — different modules outside this slice.)
- **OCR is a stub.** src/lib/pdf/ocrEngine.ts:121-125 — `extractTextFromCanvas` preprocesses the canvas then always returns `[]`, with the comment "For now, return empty - actual OCR would require Tesseract.js or similar / This stub allows the architecture to be in place".
- **src/lib/pdf is the only sub-library with no tests**; report (8/8), documents (4/4) each pair every source file with a `.test.ts`, coc has none either (0 test files in src/lib/coc).
- Hard-coded third-party CDN URL for the pdf.js worker (src/lib/pdf/advancedProcessor.ts:13) rather than a bundled/local worker.
- Cross-library coupling documented in comments: src/lib/documents/reportCategories.ts:4 says "Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts" (a file outside this slice); src/lib/documents/paths.ts:16 says the sanitizer "Matches the existing upload sanitizer in SiteDetail.tsx handleUploadDocument" — two manual-sync invariants.
- src/lib/coc/uploadCocFiles.ts and src/lib/coc/poolUpload.ts implement near-identical upload+rollback sequences against the `documents` bucket (uploadCocFiles.ts:46-57, poolUpload.ts:22-31) — observed duplication of pattern, recorded factually.

## ASSUMED

- Classification of every `.test.ts` file as `tests` is based on vitest imports (`import { describe, it, expect } from 'vitest'` at line 1 of each) — assumed they run under the repo's vitest config; I did not run the test suite.
- "src/lib/pdf is dead code" is NOT claimed — only that no static import of it was found in `src/` via the greps recorded above. Dynamic imports by string concatenation, or usage from files outside `src/`, were not exhaustively ruled out (a grep for `import(` referencing lib/pdf found only an unrelated dynamic import in src/lib/pdfTemplateExtractor.ts:416 targeting `./pdfMakeConfig`).
- The four libraries' role descriptions ("row builders", "pool ingestion", etc.) are inferred from file/function names and doc comments, not from tracing every call site.
- LOC figures are raw `wc -l` line counts (include comments/blank lines).
