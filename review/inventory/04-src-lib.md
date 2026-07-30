# Inventory — src/lib root files, second half (alphabetical 55–107)

- Date: 2026-07-29
- List command: `git ls-files 'src/lib/*' | awk -F/ 'NF==3' | sed -n '55,107p'`
- Real output count: 53 files (verified; full `src/lib/*` root set is 107 files via `git ls-files 'src/lib/*' | awk -F/ 'NF==3' | wc -l` → 107)
- LOC command: `git ls-files 'src/lib/*' | awk -F/ 'NF==3' | sed -n '55,107p' | xargs wc -l` → 11,767 total
- Classification counts: source 35, tests 18

## Per-file entries

### src/lib/pagination.test.ts
- Type: tests
- LOC: 61
- Public surface: none (vitest suite for `./pagination`; imports getPageRange, getPageCount, clampPage, getPageWindow, ELLIPSIS — pagination.test.ts:2)
- Notes: pairs with pagination.ts.

### src/lib/pagination.ts
- Type: source
- LOC: 65
- Public surface: `interface PageRange` (:6); `const ELLIPSIS = -1` (:14); `getPageRange(page: number, pageSize: number): PageRange` (:22); `getPageCount(total: number, pageSize: number): number` (:30); `clampPage(page: number, pageCount: number): number` (:37); `getPageWindow(page: number, pageCount: number, maxButtons = 7): number[]` (:47)
- Notes: pure functions, no imports beyond stdlib.

### src/lib/password-strength.ts
- Type: source
- LOC: 96
- Public surface: `interface PasswordEvaluation { score: 0|1|2|3|4; warning; suggestions; pwned: boolean|null; pwnCount: number|null }` (:15); `checkPwned(password: string): Promise<number | null>` (:57); `evaluatePassword(password: string): Promise<PasswordEvaluation>` (:77); `strengthLabel(score: number): string` (:90); `strengthColor(score: number): string` (:94)
- Notes: lazy-loads `@zxcvbn-ts/core` (:23–25); header comment says ported from ESITE.V1 (:1–13). External call: HIBP Pwned Passwords range API (:62).

### src/lib/pdfBars.test.ts
- Type: tests
- LOC: 89
- Public surface: none (vitest suite for `./pdfBars` — pdfBars.test.ts:2)
- Notes: pairs with pdfBars.ts.

### src/lib/pdfBars.ts
- Type: source
- LOC: 116
- Public surface: `type Tone = "green"|"amber"|"red"|"slate"` (:20); `const TONE_TINT: Record<Tone, {bg; accent; label; value; track}>` (:23); `toneForPct(pct: number): Tone` (:31); `miniBar(pct, color, opts?: {width?; track?}): Content` (:47); `segmentedBar(segments: Array<{value; color}>, opts?: {width?; height?}): Content` (:64); `gaugeBar(pct, color, opts?): Content` (:82); `tintedKpiCard(opts: {label; value; sub?; tone: Tone; barPct?; contentWidth?}): Content` (:102)
- Notes: pdfmake canvas-drawing primitives; imports only `Content` type from pdfMakeConfig (:1).

### src/lib/pdfBranding.dates.test.ts
- Type: tests
- LOC: 17
- Public surface: none (vitest suite for formatPdfDate/formatPdfDateTime — pdfBranding.dates.test.ts:2)
- Notes: pairs with pdfBranding.ts (dates only).

### src/lib/pdfBranding.ts
- Type: source
- LOC: 357
- Public surface: `const BRANDING` (:20); `clearBrandingCache(): void` (:56); `getCachedBranding(): {logoDataUrl: string|null; organizationName: string}` (:63); `imageUrlToBase64(url: string): Promise<string|null>` (:85); `loadCompanyBranding()` (:133); `loadClientBranding(clientId: string)` (:181); `loadSiteBranding(siteId: string)` (:215) — each returning `Promise<{logoDataUrl...; organizationName...}>`-shaped objects; `createImageContent(...)` (:269); `createHeaderLogo(logoDataUrl: string|null, orgName: string): Content` (:295); `createCoverLogo(logoDataUrl, orgName): Content` (:314); `formatPdfDate(date?: Date|string): string` (:338); `formatPdfDateTime(date?)` (:346); `generateReferenceNumber(prefix = 'REF'): string` (:353)
- Notes: Supabase reads: `settings` (:147), `clients` (:187), `sites` (:222); logo fetched via `fetch(url)` (:95). Delegates date formatting to `./report/reportKernel` (:12).

### src/lib/pdfDocumentSaver.test.ts
- Type: tests
- LOC: 67
- Public surface: none (vitest; mocks `@/integrations/supabase/client` — pdfDocumentSaver.test.ts:9–10)
- Notes: pairs with pdfDocumentSaver.ts.

### src/lib/pdfDocumentSaver.ts
- Type: source
- LOC: 210
- Public surface: `savePDFToDocuments(options: {blob: Blob; fileName: string; siteId?; subsectionId?; categoryName: string}): Promise<{success: boolean; error?; documentUrl?}>` (:29); `getReportCategoryName(reportType: string): string` (:198)
- Notes: routes to site vs subsection save based on which id is present (:34–40). Supabase storage bucket `documents` (upload :94/:164, public URL :103/:173, orphan cleanup remove :20); tables `site_document_categories` (:63,:74), `document_categories` (:133,:144), `site_documents` (:108), `subsection_documents` (:178). Detects 413/too-large upload errors and rewrites the message (:44–50).

### src/lib/pdfEngine.ts
- Type: source
- LOC: 975
- Public surface: re-exports from pdfMakeConfig/pdfMakeUtils (createCoverPage, createPageHeader, createPageFooter, createSectionHeader, createDataTable, createInfoTable, createKpiRow, createStatusBadge, getStatusType, logComplianceCheck, COLORS, PAGE_CONFIG, CONTENT_WIDTH_PT, A4_WIDTH_PT, A4_HEIGHT_PT, mmToPt, generateDocumentFilename) (:40–58) plus types CoverPageOptions, TableColumn, PDFComplianceCheck (:60). Own exports: `type ReportType` (10-member union) (:70); `interface ReportGeneratorOptions {type; title; content; coverPage?; options?: {includeCoverPage?; skipCoverPageInHeaderFooter?; skipFirstPageHeaderFooter?; logoDataUrl?; organizationName?; filename?; pageOrientation?; pageMargins?}}` (:82); `interface GenerateReportResult {blob; filename; complianceChecks; previewUrl?}` (:101); `loadImageAsDataUrl(url): Promise<string|null>` (:214); `createImage(...)` (:298); `createImageGrid(...)` (:352); `interface SnagData` (:391); `createSnagCard(snag: SnagData): Content` (:405); `createSnagsSummary(snags, title?)` (:483); `createQRCode(...)` (:527); `createQRCodeGrid(...)` (:565); `interface ChecklistItem` (:612); `interface ChecklistSection` (:619); `createChecklistTable(sections): Content[]` (:627); `interface CalendarEvent` (:683); `createCalendarTable(events): Content` (:695); `generateReport(opts: ReportGeneratorOptions): Promise<GenerateReportResult>` (:732); `downloadReport(docDefinition, filename): void` (:817); `openReportInNewWindow(docDefinition): void` (:824); `createParagraph(...)` (:835); `createBulletList(...)` (:860); `createNumberedList(...)` (:878); `createDivider(margin?)` (:896); `createPageBreak()` (:916); `createSpacer(height = 10)` (:923); `getDefaultComplianceChecks()` (:934); `createComplianceChecks(passedChecks)` (:951); `getComplianceCheckLabel(key)` (:962)
- Notes: header comment declares it the "UNIFIED PDF ENGINE / Single entry point for all PDF generation" (:1–7). Locally aliases `Content = any` and `TDocumentDefinitions = any` (:63–64). Image fetches at :223 and :238. Importers include src/components/SiteSummaryReport.tsx, src/components/DocumentPreviewDialog.tsx, src/lib/pdfmakeInspectionReport.ts, src/lib/fortressChecklistReportGenerator.ts, src/lib/inspectionTemplateReportGenerator.ts, src/lib/calendarReportGenerator.ts (grep-verified).

### src/lib/pdfMakeConfig.margins.test.ts
- Type: tests
- LOC: 15
- Public surface: none (vitest for PAGE_CONFIG — pdfMakeConfig.margins.test.ts:2)
- Notes: pairs with pdfMakeConfig.ts (margins only).

### src/lib/pdfMakeConfig.ts
- Type: source
- LOC: 546
- Public surface: `mmToPt(mm): number` / `ptToMm(pt): number` (:52–53); `const PAGE_CONFIG` (:55); `A4_WIDTH_PT = 595.28` / `A4_HEIGHT_PT = 841.89` (:68–69); `CONTENT_WIDTH_PT` (:72); `const COLORS` (:80); `const DEFAULT_STYLES: StyleDictionary` (:114); `getStandardTableLayout(): TableLayout` (:238); `getLightTableLayout()` (:259); `getKpiTableLayout()` (:273); `createBaseDocDefinition(...)` (:289); `generatePdfBlob(docDefinition): Promise<Blob>` (:389); `generatePdfDataUrl(docDefinition): Promise<string>` (:457); `downloadPdf(docDefinition, filename): void` (:466); `openPdfInNewWindow(docDefinition): void` (:474); `testPdfGeneration(): Promise<void>` (:487); `testPdfBlobGeneration(): Promise<Blob>` (:526); re-export `pdfMake` (:545) and types TDocumentDefinitions/Content/StyleDictionary/TableLayout (:546)
- Notes: imports pdfmake build + vfs_fonts (:9–10); foundation module for the pdfmake stack.

### src/lib/pdfMakeUtils.footer.test.ts
- Type: tests
- LOC: 42
- Public surface: none (vitest for createPageFooter — pdfMakeUtils.footer.test.ts:2)
- Notes: pairs with pdfMakeUtils.ts (footer only).

### src/lib/pdfMakeUtils.ts
- Type: source
- LOC: 760
- Public surface: re-export block (:40); `const ACCENT_COLORS: Record<string, {primary; light; text}>` (:72); `interface CoverPageOptions` (:76); `createCoverPage(options: CoverPageOptions): Content[]` (:96); `createSectionHeader(...)` (:379); `createPageHeader(title: string, skipFirstPage = true): (currentPage, pageCount) => Content` (:418); `createPageFooter(skipFirstPage = true): (currentPage, pageCount) => Content` (:452); `interface TableColumn` (:498); `createDataTable(...)` (:509); `createInfoTable(data: [string, string][]): Content` (:563); `createStatusBadge(...)` (:594); `getStatusType(status): 'success'|'warning'|'error'|'info'` (:631); `createKpiCard(...)` (:646); `createKpiRow(...)` (:675); `interface PDFComplianceCheck` (:695); `logComplianceCheck(...)` (:710); `buildDocument(options: {...})` (:737)
- Notes: imports LAYOUT/ACCENT_PALETTES from siteSummaryRenderSpec (:36) and clampPageNumbers/formatDate from report/reportKernel (:37).

### src/lib/pdfSubsectionRenderer.ts
- Type: source
- LOC: 445
- Public surface: `renderSubsectionCardToPDF(data: SubsectionCardData, accentColor = '#3b82f6', logoUrl?: string|null): Promise<any>` (:22); `renderSubsectionGrid(subsections: SubsectionCardData[], accentColor = '#3b82f6', logoUrl?: string|null): Promise<any>` (:418)
- Notes: grid renders 2 cards per page (:424–430 comments); uses CocCardLine type from cocHierarchy (:16); calls generateSubsectionQRCode from subsectionCardSpec (:31).

### src/lib/pdfTemplateExporter.ts
- Type: source
- LOC: 487
- Public surface: `interface TemplateData` (:18); `interface TemplateSection` (:32); `interface TemplateItem` (:41); `interface TenantData` (:50); `interface ExportOptions` (:58); `exportTemplateToPDF(template: TemplateData, options: ExportOptions): Promise<Blob>` (:82); `downloadTemplatePDF(template: TemplateData, options: ExportOptions, filename?: string): void` (:125)
- Notes: builds blank inspection-template PDFs; uses ACCENT_COLORS + DOCUMENT_DESIGN_STANDARDS (:16).

### src/lib/pdfTemplateExtractor.ts
- Type: source
- LOC: 478
- Public surface: `interface ExtractedSection` (:13); `interface ExtractedItem` (:26); `interface ExtractedTemplate` (:34); `extractTemplateFromPDF(file: File): Promise<ExtractedTemplate>` (:74); `generateTemplatePreviewPDF(template: ExtractedTemplate): Promise<Blob>` (:413)
- Notes: parses uploaded PDFs with `pdfjs-dist` (:6); preview generation dynamically imports pdfMakeConfig (:416).

### src/lib/pdfTemplateTestRunner.ts
- Type: source
- LOC: 710
- Public surface: `interface TestResult` (:34); `interface TestSuiteResult` (:43); `interface ParameterFlowTest` (:55); `const SAMPLE_SUBSECTION_DATA: SubsectionData[]` (:67); `class PDFTemplateTestRunner` (:118); `runPDFTemplateTests(reportType: TemplateReportType = 'site_summary'): Promise<TestSuiteResult>` (:705)
- Notes: in-app diagnostic test harness (not vitest) — classified source because it ships in the app bundle and is invoked from src/views/PDFTemplateTestDashboard.tsx (grep-verified). Queries Supabase `pdf_report_templates` (:611, :632, :659); uses fetchPDFTemplate from hooks/usePDFTemplateGateway (:13).

### src/lib/pdfTemplates.ts
- Type: source
- LOC: 604
- Public surface: `interface CoverPageData` (:33); `createCoverPage(...)` (:48); `createPageHeader(...)` (:179); `createPageFooter(customLeftText?): DynamicContent` (:239); `interface KpiItem` (:285); `createKpiDashboard(kpis: KpiItem[]): Content` (:295); `createSectionHeader(...)` (:337); `interface TableColumn` (:387); `createDataTable<T extends Record<string, any>>(...)` (:398); `type StatusType` (:461); `createStatusBadge(...)` (:466); `getStatusType(status): StatusType` (:489); `interface PDFComplianceCheck` (:511); `createComplianceResult(...)` (:526); `calculateComplianceScore(checks): number` (:545); `createParagraph(...)` (:558); `createBulletList(items: string[]): Content` (:572); `createSpacer(heightMm = 10): Content` (:582); `createDivider(): Content` (:589); `truncateText(text, maxLength = 50): string` (:601)
- Notes: only importer found is src/lib/assetVerificationReportGenerator.ts (grep-verified). Export names overlap heavily with pdfMakeUtils.ts (see Oddities).

### src/lib/pdfmakeInspectionReport.ts
- Type: source
- LOC: 1598 (largest file in slice)
- Public surface: `interface InspectionSection` (:44); `interface InspectionSnag` (:55); `interface InspectionTenant` (:63); `interface ReportDocument` (:74); `interface InspectionReportData` (:80); `interface GenerateInspectionReportOptions` (:95); `interface GenerateInspectionReportResult` (:103); `generateInspectionReportPdf(options: GenerateInspectionReportOptions): Promise<GenerateInspectionReportResult>` (:1446); `generateAndSaveInspectionReportPdfmake(options: GenerateInspectionReportOptions & {subsectionId: string; siteId?: string}): Promise<{success; documentId?; fileName?; fileUrl?; error?}>` (:1546)
- Notes: downloads attached docs from Supabase storage `documents` bucket with fetch fallback (:1360, :1363); `supabase.auth.getUser()` (:1561); saves via savePDFToDocuments (:24); scoring helpers from report/inspectionScore (:23).

### src/lib/pinClustering.ts
- Type: source
- LOC: 123
- Public surface: `interface PinCluster` (:11); `type ClusteredPin = Pin | PinCluster` (:19); `isCluster(item: ClusteredPin): item is PinCluster` (:33); `clusterPins(...)` (:44); `getClusterColor(pins: Pin[]): string` (:114)
- Notes: `Pin` interface is module-local, not exported (:1–9); no external imports.

### src/lib/publicVerdict.test.ts
- Type: tests
- LOC: 47
- Public surface: none (vitest for presentVerdict — publicVerdict.test.ts:2)
- Notes: pairs with publicVerdict.ts.

### src/lib/publicVerdict.ts
- Type: source
- LOC: 44
- Public surface: `interface PublicVerdict` (:4); `type VerdictKind = "pass"|"pass-expiring"|"fail"|"pending"|"missing"|"none"` (:12); `interface VerdictPresentation` (:14); `presentVerdict(v: PublicVerdict | null, today: Date): VerdictPresentation` (:24)
- Notes: pure presentation logic for the public QR landing verdict.

### src/lib/qrBaseUrl.test.ts
- Type: tests
- LOC: 51
- Public surface: none (vitest; manipulates process.env.NEXT_PUBLIC_SUPABASE_URL — qrBaseUrl.test.ts:12,:25)
- Notes: pairs with qrBaseUrl.ts.

### src/lib/qrBaseUrl.ts
- Type: source
- LOC: 51
- Public surface: `const DEFAULT_QR_ORIGIN = "https://insight-linker-app.vercel.app"` (:14); `resolveQrBaseUrl(configured?: string|null): string` (:17); `publicSubsectionUrl(subsectionId: string, configured?: string|null): string` (:22); `qrRedirectUrl(subsectionId: string): string` (:41); `qrSiteRedirectUrl(siteId: string): string` (:48)
- Notes: qrRedirectUrl/qrSiteRedirectUrl target the Supabase `qr-redirect` edge function (`${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qr-redirect?path=` / `?site=`) rather than the app domain, per in-file rationale about printed QR permanence (:30–39).

### src/lib/qrCodeGenerator.ts
- Type: source
- LOC: 181
- Public surface: `generateAndUploadQRCode({subsectionId, siteName, subsectionName, logoUrl?}: GenerateQRCodeOptions): Promise<string | null>` (:12)
- Notes: renders a labelled QR PNG on a canvas (qrcode npm lib :1); uploads to Supabase storage bucket `inspection-photos` (:147–158) and writes the URL to the `subsections` table (:163). Encodes qrRedirectUrl, not the app URL (:23–24 comment).

### src/lib/qrStickerSheet.ts
- Type: source
- LOC: 35
- Public surface: `buildStickerSheetBlob(siteName: string, subsections: StickerSubsection[]): Promise<Blob>` (:12)
- Notes: composes buildLabeledQrSvg + qrRedirectUrl + generatePdfBlob (:1–3).

### src/lib/qrSvg.test.ts
- Type: tests
- LOC: 27
- Public surface: none (vitest for buildLabeledQrSvg — qrSvg.test.ts:2)
- Notes: pairs with qrSvg.ts.

### src/lib/qrSvg.ts
- Type: source
- LOC: 25
- Public surface: `buildLabeledQrSvg({url, siteName, subsectionName}: LabeledQrOptions): Promise<string>` (:12)
- Notes: qrcode npm lib (:1); returns SVG markup string.

### src/lib/schematicMatching.test.ts
- Type: tests
- LOC: 116
- Public surface: none (vitest; exercises Supabase storage URL parsing with public/sign/percent-encoded fixtures — schematicMatching.test.ts:25–39)
- Notes: pairs with schematicMatching.ts.

### src/lib/schematicMatching.ts
- Type: source
- LOC: 104
- Public surface: `interface BlockLike` (:8); `interface SubsectionLike` (:14); `normalizeToken(value: string|null|undefined): string` (:20); `parseStorageUrl(...)` (:30); `nextBlockIdentifier(...)` (:50); `matchSubsectionId(...)` (:69); `computeAutoMatches(...)` (:87)
- Notes: pure matching/parsing helpers for schematic blocks vs subsections; no runtime I/O.

### src/lib/simpleImageLoader.ts
- Type: source
- LOC: 186
- Public surface: `interface ReportImageOptions {compress?; maxWidth?; quality?}` (:55); `compressImageBlob(blob: Blob, maxWidth = 800, quality = 0.6): Promise<Blob>` (:68); `loadImageSimple(url: string, opts?: ReportImageOptions): Promise<string | null>` (:110); `loadImagesSimple(urls: string[], opts?: ReportImageOptions): Promise<Map<string, string>>` (:168)
- Notes: downloads via Supabase storage (:124) with plain fetch fallback (:138); canvas-based JPEG re-encode.

### src/lib/siteDeliverables.test.ts
- Type: tests
- LOC: 337
- Public surface: none (vitest for computeSiteDeliverables :33 and summarizeSitesForTriage :275)
- Notes: pairs with siteDeliverables.ts.

### src/lib/siteDeliverables.ts
- Type: source
- LOC: 344
- Public surface: `type DeliverableKey` (:16); `type DeliverableStatus = 'complete'|'outstanding'|'not_required'` (:20); `type Severity` (:21); `interface SubsectionForDeliverables extends SubsectionForHealth, SubsectionForCompliance` (:23); `interface SnagForDeliverables extends SnagForHealth` (:28); `type InspectionForDeliverables = InspectionForHealth` (:32); `interface OutstandingItem` (:34); `interface DeliverableResult` (:49); `interface SiteDeliverablesInput` (:60); `interface SiteDeliverablesSummary` (:75); `interface SiteTriageRow` (:88); `const DELIVERABLE_LABELS` (:98); `const DELIVERABLE_ORDER` (:109); `const THERMAL_CATEGORY_PATTERNS` / `SUMMARY_CATEGORY_PATTERNS` (:116–117); `categoryMatches(...)` (:119); `computeSiteDeliverables(input: SiteDeliverablesInput): SiteDeliverablesSummary` (:298); `summarizeSitesForTriage(inputs: SiteDeliverablesInput[]): SiteTriageRow[]` (:326)
- Notes: composes complianceCalculations + inspectionImages + siteHealth types (:13–14); pure computation.

### src/lib/siteHealth.test.ts
- Type: tests
- LOC: 171
- Public surface: none (vitest for siteHealth)
- Notes: pairs with siteHealth.ts.

### src/lib/siteHealth.ts
- Type: source
- LOC: 131
- Public surface: `interface SubsectionForHealth` (:10); `interface SnagForHealth` (:16); `interface InspectionForHealth` (:21); `interface FactorScores {metering; snags; inspections}` (:26); `interface HealthWeights` (:27); `interface ReadinessResult` (:28); `const DEFAULT_WEIGHTS = {snags: 0.40, inspections: 0.35, metering: 0.25}` (:34); `const RESOLVED_SNAG_STATUSES = ['Rectified','Closed']` (:35); `const BLOCKING_RISK_LEVELS = ['Critical','High']` (:36); `isMetered(s)` (:38); `isSnagResolved(snag)` (:41); `isInspectionCompleted(i)` (:50); `factorScores(...)` (:57); `siteHealthScore(factors, weights = DEFAULT_WEIGHTS): number` (:79); `interface SiteHealthResult` (:85); `computeSiteHealth(...)` (:95); `readiness(...)` (:104); `getHealthBand(score): 'success'|'warning'|'danger'` (:127)
- Notes: pure scoring; imports inspectionHasImages (:8).

### src/lib/siteScores.test.ts
- Type: tests
- LOC: 117
- Public surface: none (vitest for siteScores, also imports siteHealth helpers — siteScores.test.ts:2–3)
- Notes: pairs with siteScores.ts.

### src/lib/siteScores.ts
- Type: source
- LOC: 122
- Public surface: `interface SiteScore` (:20); `interface SnapshotScoreRow` (:29); `isUsableSnapshotRow(row): boolean` (:38); `interface LiveScoreInputs` (:42); `latestSnapshotPerSite(rows): Map<string, SnapshotScoreRow>` (:53); `buildSiteScoreMap(...)` (:63)
- Notes: pure; merges snapshot rows with live inputs.

### src/lib/siteSummaryRenderSpec.test.ts
- Type: tests
- LOC: 152
- Public surface: none (vitest; also imports calculateCocComplianceStats from complianceCalculations :8)
- Notes: pairs with siteSummaryRenderSpec.ts.

### src/lib/siteSummaryRenderSpec.ts
- Type: source
- LOC: 744
- Public surface: `const ACCENT_PALETTES` (:29); `const STATUS_COLORS` (:37); `type AccentColorKey` (:45); `getAccentPalette(color = 'blue')` (:47); `interface KpiCardSpec` (:55); `const HEALTH_METRICS_CARDS: KpiCardSpec[]` (:65); `interface SectionSpec` (:100); `const SECTION_SPECS: Record<string, SectionSpec>` (:109); `interface StatRowSpec` (:183); `const SUMMARY_STAT_ROWS` (:189); `interface TableColumnSpec` (:202); `const COC_VALIDATION_COLUMNS` (:209); `const INSPECTION_COLUMNS` (:216); `interface CardFieldSpec` (:227); `const SUBSECTION_CARD_FIELDS` (:235); `interface SiteSummaryMetrics` (:277); `interface SnagData` (:293); `interface SubsectionData` (:301); `interface CategoryHealthData` (:320); `interface CocValidationData` (:328); `interface InspectionData` (:335); `const LAYOUT` (:346); `findSectionSpec(sectionId): SectionSpec|null` (:407); `getSectionTitle(section: ReportSection): string` (:423); `matchesSectionId(section, targetId): boolean` (:434); `sortSections(sections): ReportSection[]` (:444); `getEnabledSections(sections): ReportSection[]` (:458); `interface CalculateMetricsInputs` (:462); `calculateMetrics(...)` (:478); `calculateCategoryHealth(...)` (:521); `interface FortressSectionProgress` (:554); `interface FortressChecklistMetrics` (:566); `calculateFortressMetrics(...)` (:596); `interface DocumentCategoryMetrics` (:685); `interface DocumentSummaryMetrics` (:691); `calculateDocumentMetrics(...)` (:701)
- Notes: declarative spec + metric calculators shared by site-summary PDF rendering; imports pdf-editor types (:22) and complianceCalculations (:23).

### src/lib/snapshotMetrics.test.ts
- Type: tests
- LOC: 26
- Public surface: none (vitest for toSnapshotRow)
- Notes: pairs with snapshotMetrics.ts.

### src/lib/snapshotMetrics.ts
- Type: source
- LOC: 40
- Public surface: `interface SnapshotInput` (:6); `interface SnapshotRow` (:16); `toSnapshotRow(i: SnapshotInput): SnapshotRow` (:28)
- Notes: adapter from SiteDeliverablesSummary/ReadinessResult (type-only imports :3–4) to a snapshot row shape.

### src/lib/storageQuota.ts
- Type: source
- LOC: 135
- Public surface: `interface StorageQuotaInfo` (:3); `getStorageQuota(): Promise<StorageQuotaInfo | null>` (:13); `checkStorageAvailable(requiredBytes: number): Promise<boolean>` (:41); `formatBytes(bytes: number): string` (:80); `estimateIndexedDBUsage(): Promise<number>` (:93); `clearOldOfflineData(daysOld = 30): Promise<void>` (:118)
- Notes: browser APIs `navigator.storage.estimate()` (:20) and `window.indexedDB.databases()` (:97); shows toasts via sonner (:1).

### src/lib/subsectionCardSpec.ts
- Type: source
- LOC: 230
- Public surface: re-exports `SnagData`, `SubsectionData` types from siteSummaryRenderSpec (:13); `interface SubsectionCardData extends SubsectionData` (:18); `const CARD_LAYOUT` (:37); `const STATUS_COLORS` (:70); `const RISK_COLORS` (:78); `generateSubsectionQRCode(...)` (:90); `getCocStatusLabel(status): string` (:205); `formatMeteringInfo(data: SubsectionCardData): string` (:215); `getComplianceLabel(isCompliant): string` (:222); `getRiskLevelColor(level: SnagData['riskLevel'])` (:228)
- Notes: qrcode npm lib (:10); CocCardLine type from cocHierarchy (:15).

### src/lib/subsectionCategories.ts
- Type: source
- LOC: 115
- Public surface: `interface SubsectionCategory` (:11); `const SUBSECTION_CATEGORIES: SubsectionCategory[]` (:23); `getCategoryConfig(category: string): SubsectionCategory` (:92); `getCategoryIcon(category: string): LucideIcon` (:105); `getCategoryColor(category)` (:109); `getCategoryAbbreviation(category): string` (:113)
- Notes: static category registry with lucide-react icons (:1–9).

### src/lib/subsectionCompliance.test.ts
- Type: tests
- LOC: 58
- Public surface: none (vitest for computeSubsectionVerdict; CocDoc type from cocHierarchy :3)
- Notes: pairs with subsectionCompliance.ts.

### src/lib/subsectionCompliance.ts
- Type: source
- LOC: 42
- Public surface: `interface SubsectionVerdict` (:3); `interface VerdictInput` (:10); `computeSubsectionVerdict(input: VerdictInput): SubsectionVerdict` (:29)
- Notes: pure; consumes CocDoc/cocDocFails from cocHierarchy (:1).

### src/lib/subsectionStatus.test.ts
- Type: tests
- LOC: 48
- Public surface: none (vitest for complianceState, isSnagOpen, snagStatusBucket)
- Notes: pairs with subsectionStatus.ts.

### src/lib/subsectionStatus.ts
- Type: source
- LOC: 36
- Public surface: `type ComplianceState = "compliant"|"non-compliant"|"pending"` (:5); `complianceState(isCompliant: boolean|null|undefined): ComplianceState` (:12); `isSnagOpen(status: string|null|undefined): boolean` (:22); `type SnagBucket = "open"|"inProgress"|"closed"` (:26); `snagStatusBucket(status: string|null|undefined): SnagBucket` (:31)
- Notes: pure status classifiers.

### src/lib/templateTenants.test.ts
- Type: tests
- LOC: 43
- Public surface: none (vitest for templateSupportsTenants)
- Notes: pairs with templateTenants.ts.

### src/lib/templateTenants.ts
- Type: source
- LOC: 17
- Public surface: `templateSupportsTenants(template: {name?: string|null} | null | undefined): boolean` (:13) — returns true when template name contains "main board" (case-insensitive) (:16)
- Notes: header comment declares it the single source of truth for the EMB Tenants tab across editor/runtime/renderers (:1–12).

### src/lib/utils.ts
- Type: source
- LOC: 6
- Public surface: `cn(...inputs: ClassValue[])` (:4) — clsx + tailwind-merge
- Notes: standard shadcn/ui helper.

### src/lib/validation-schemas.ts
- Type: source
- LOC: 125
- Public surface: zod schemas `clientSchema` (:4), `siteSchema` (:14), `inspectionSchema` (:27), `profileUpdateSchema` (:49), `userInviteSchema` (:63), `documentUploadSchema` (:74), `subsectionSchema` (:81), `signInSchema` (:98), `signUpSchema` (:104), `forgotPasswordSchema` (:111), `setPasswordSchema` (:116); inferred types `SignInInput` (:102), `SignUpInput` (:109), `ForgotPasswordInput` (:114), `SetPasswordInput` (:125)
- Notes: pure zod definitions (:1).

## Runtime observations

- External API: HIBP Pwned Passwords k-anonymity range endpoint `https://api.pwnedpasswords.com/range/<prefix>` — src/lib/password-strength.ts:62.
- Supabase Postgres reads: `settings` (src/lib/pdfBranding.ts:147), `clients` (src/lib/pdfBranding.ts:187), `sites` (src/lib/pdfBranding.ts:222), `pdf_report_templates` (src/lib/pdfTemplateTestRunner.ts:611,632,659), `site_document_categories` (src/lib/pdfDocumentSaver.ts:63,74), `document_categories` (src/lib/pdfDocumentSaver.ts:133,144).
- Supabase Postgres writes: `site_documents` insert (src/lib/pdfDocumentSaver.ts:108), `subsection_documents` insert (src/lib/pdfDocumentSaver.ts:178), `subsections` update with QR URL (src/lib/qrCodeGenerator.ts:163).
- Supabase Storage: bucket `documents` upload/getPublicUrl/remove (src/lib/pdfDocumentSaver.ts:20,94,103,164,173), bucket `documents` download (src/lib/pdfmakeInspectionReport.ts:1360; src/lib/simpleImageLoader.ts:124), bucket `inspection-photos` upload + getPublicUrl for QR PNGs (src/lib/qrCodeGenerator.ts:147–158).
- Supabase Auth: `supabase.auth.getUser()` (src/lib/pdfmakeInspectionReport.ts:1561).
- Supabase Edge Function dependency: QR codes encode `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/qr-redirect?path=<id>` / `?site=<id>` (src/lib/qrBaseUrl.ts:41–50); default frontend origin constant `https://insight-linker-app.vercel.app` (src/lib/qrBaseUrl.ts:14).
- Plain HTTP fetches for images/docs: src/lib/pdfBranding.ts:95, src/lib/pdfEngine.ts:223,238, src/lib/simpleImageLoader.ts:138, src/lib/pdfmakeInspectionReport.ts:1363.
- Browser storage APIs: `navigator.storage.estimate()` (src/lib/storageQuota.ts:20), `window.indexedDB.databases()` (src/lib/storageQuota.ts:97).
- In-app diagnostics entry points: `runPDFTemplateTests()` (src/lib/pdfTemplateTestRunner.ts:705) invoked from src/views/PDFTemplateTestDashboard.tsx; `testPdfGeneration()`/`testPdfBlobGeneration()` (src/lib/pdfMakeConfig.ts:487,526).
- PDF generation entry chain: pdfMakeConfig.ts (pdfmake + fonts :9–10) → pdfMakeUtils/pdfBars/pdfTemplates primitives → pdfEngine.generateReport (src/lib/pdfEngine.ts:732) → savePDFToDocuments (src/lib/pdfDocumentSaver.ts:29). pdfEngine importers: src/components/SiteSummaryReport.tsx, src/components/DocumentPreviewDialog.tsx, src/lib/pdfmakeInspectionReport.ts, src/lib/fortressChecklistReportGenerator.ts, src/lib/inspectionTemplateReportGenerator.ts, src/lib/calendarReportGenerator.ts (grep-verified).
- Third-party libs in slice: pdfmake (pdfMakeConfig.ts:9–10), pdfjs-dist (pdfTemplateExtractor.ts:6), qrcode (qrCodeGenerator.ts:1, qrSvg.ts:1, subsectionCardSpec.ts:10), zod (validation-schemas.ts:1), @zxcvbn-ts/core lazy import (password-strength.ts:23), sonner (storageQuota.ts:1), lucide-react (subsectionCategories.ts:1), clsx/tailwind-merge (utils.ts:1–2).

## Oddities

- Overlapping export surfaces across three PDF helper modules: `pdfMakeUtils.ts` and `pdfTemplates.ts` both export createCoverPage, createPageHeader, createPageFooter, createSectionHeader, createDataTable, createStatusBadge, getStatusType, `TableColumn`, and `PDFComplianceCheck` (pdfMakeUtils.ts:96,418,452,379,509,594,631,498,695 vs pdfTemplates.ts:48,179,239,337,398,466,489,387,511); `pdfEngine.ts` additionally exports its own createParagraph/createBulletList/createDivider/createSpacer (pdfEngine.ts:835,860,896,923) which also exist in pdfTemplates.ts (:558,:572,:589,:582).
- `pdfTemplates.ts` (604 LOC) has exactly one importer in src/: src/lib/assetVerificationReportGenerator.ts (grep-verified); every other report generator imports pdfEngine/pdfMakeUtils instead.
- `pdfEngine.ts` declares "Single entry point for all PDF generation" (:3) yet locally aliases `type Content = any` and `type TDocumentDefinitions = any` (:63–64) while pdfMakeConfig.ts exports the real pdfmake types (:546).
- Duplicate exported names across modules: `SnagData` interface exported from both pdfEngine.ts:391 and siteSummaryRenderSpec.ts:301 area (:293); `STATUS_COLORS` exported from both siteSummaryRenderSpec.ts:37 and subsectionCardSpec.ts:70; `TableColumn` from pdfMakeUtils.ts:498, pdfTemplates.ts:387, and TableColumnSpec variant in siteSummaryRenderSpec.ts:202.
- Untracked Finder-style duplicate files on disk in src/lib (present in `ls`, absent from `git ls-files`): `auth-audit 2.ts`, `navigation 2.tsx`, `password-strength 2.ts` (all dated May 28).
- `pdfTemplateTestRunner.ts` (710 LOC) is a test harness that lives in src/lib and ships with the app (imported by src/views/PDFTemplateTestDashboard.tsx), not a vitest suite; similarly pdfMakeConfig.ts exports `testPdfGeneration`/`testPdfBlobGeneration` diagnostics (:487,:526) from the production config module.
- QR PNGs are uploaded to the `inspection-photos` storage bucket, not a QR-specific bucket (src/lib/qrCodeGenerator.ts:147–148).
- Test pairing: 18 of the 35 source files have an adjacent `.test.ts` in this slice; the five largest files (pdfmakeInspectionReport.ts 1598, pdfEngine.ts 975, pdfMakeUtils.ts 760 — footer-only test, pdfTemplateTestRunner.ts 710, siteSummaryRenderSpec.ts 744 — has test) are tested only partially or not at all within the slice. (Factual pairing note per slice instructions, not a quality judgment.)
- Three test files test a narrow aspect of a large source file, reflected in their names: pdfBranding.dates.test.ts (17 LOC vs 357), pdfMakeConfig.margins.test.ts (15 LOC vs 546), pdfMakeUtils.footer.test.ts (42 LOC vs 760).

## ASSUMED

- All non-`.test.ts` files classified as `source`: inferred from their imports and browser-API usage; none showed config/build characteristics. `pdfTemplateTestRunner.ts` was classified `source` rather than `tests` because it is bundled app code invoked from a view, not a vitest suite — a judgment call.
- The `qr-redirect` Supabase edge function referenced by qrBaseUrl.ts is assumed to exist under supabase/functions/ (outside this slice; not opened).
- `SubsectionCardData`'s base `SubsectionData` re-export chain (subsectionCardSpec.ts:13) assumed to make pdfSubsectionRenderer depend on siteSummaryRenderSpec transitively; not traced further.
- Companion modules referenced but outside this slice (first-half agent's territory): cocHierarchy, complianceCalculations, inspectionImages, documentDesignStandards, report/reportKernel, report/inspectionScore, assetVerificationReportGenerator, fortressChecklistReportGenerator, inspectionTemplateReportGenerator, calendarReportGenerator — existence inferred from import statements only.
- Proposed module groupings are theme-based inferences from import graphs and naming, not verified architectural boundaries.
