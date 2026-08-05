# Inventory part 03 — src/lib root files, first half (alphabetical 1-54)

Date: 2026-07-29

List command (authoritative file set):

```
git ls-files 'src/lib/*' | awk -F/ 'NF==3' | sed -n '1,54p'
```

Output: 54 files (the full `NF==3` set is 107 files; this slice is the first 54).
LOC command: `... | xargs wc -l` → 7727 total lines across the slice.

Classification counts: source 35, tests 19.

---

## Per-file entries

### src/lib/assetVerification.test.ts
- Type: tests
- LOC: 204
- Public surface: none (vitest spec for assetVerification.ts)
- Notes: pairs with assetVerification.ts.

### src/lib/assetVerification.ts
- Type: source
- LOC: 260
- Public surface (all verified at cited lines):
  - `type MatchStatus = "match" | "mismatch" | "na"` (L5)
  - `interface ParsedAsset` (L8), `interface InspectionTenant` (L21), `interface InspectionRecord` (L33), `interface SubsectionNameRecord` (L40), `interface InspectionTenantMatch` (L45), `interface AssetForComparison` (L60), `interface ComparisonResult` (L70)
  - `normalizeMeterSerial(serial: string | null | undefined): string` (L82)
  - `compareValues(assetValue: string | null | undefined, inspectionValue: string | null | undefined): MatchStatus` (L91)
  - `buildInspectionMeterMatches(inspections: InspectionRecord[], subsections: SubsectionNameRecord[]): Map<string, InspectionTenantMatch>` (L120)
  - `buildComparisonResults(assets: AssetForComparison[], inspectionMeterMatches: Map<string, InspectionTenantMatch>): ComparisonResult[]` (L160)
  - `parseAssetRows(rows: (string | number)[][]): ParsedAsset[]` (L190)
- Notes: pure comparison/normalization logic for meter-asset verification.

### src/lib/assetVerificationReport.ts
- Type: source
- LOC: 210
- Public surface: `buildAssetVerificationReportDocDef(model: AvReportModel, logoDataUrl?: string | null, images?: Map<string, string>): TDocumentDefinitions` (L45)
- Notes: pdfmake doc-definition renderer; header comment (L1-4) says it mirrors src/lib/siteCoc/siteCocReport.ts and uses shared src/lib/pdfBars.ts.

### src/lib/assetVerificationReportGenerator.ts
- Type: source
- LOC: 85
- Public surface:
  - `interface InspectionGeneratorOptions` (L22)
  - `async generateInspectionBasedReport(options: InspectionGeneratorOptions): Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }>` (L41)
- Notes: orchestrator that resolves branding logo then builds/renders the asset-verification PDF.

### src/lib/assetVerificationReportModel.test.ts
- Type: tests
- LOC: 115
- Public surface: none
- Notes: pairs with assetVerificationReportModel.ts.

### src/lib/assetVerificationReportModel.ts
- Type: source
- LOC: 155
- Public surface:
  - `interface AvReportInput` (L7), `interface AvSummary` (L23), `interface AvVerifiedRow` (L32), `interface AvDiscrepancyRow` (L48), `interface AvUnverifiedRow` (L55), `interface AvReportModel` (L63)
  - `buildAssetVerificationReportModel(input: AvReportInput): AvReportModel` (L74)
- Notes: pure view-model builder for the asset-verification report.

### src/lib/auth-audit.ts
- Type: source
- LOC: 105
- Public surface:
  - `type AuthEventType` (L16), `interface AuthEventMetadata` (L29)
  - `recordAuthEvent(event_type: AuthEventType, metadata: AuthEventMetadata = {}): void` (L87) — fire-and-forget async
- Notes: invokes Supabase Edge Function `log-auth-event` (L62); failed sends queued in localStorage (L44-54, key with MAX_QUEUE cap), drained opportunistically on next success.

### src/lib/buildActionHref.test.ts
- Type: tests
- LOC: 30
- Public surface: none
- Notes: pairs with buildActionHref.ts.

### src/lib/buildActionHref.ts
- Type: source
- LOC: 32
- Public surface:
  - `interface ActionHrefContext` (L9)
  - `buildActionHref(item: OutstandingItem, ctx: ActionHrefContext): string` (L14)
- Notes: pure deep-link URL builder; imports `OutstandingItem` from ./siteDeliverables (L7); header cites docs/superpowers/specs/2026-06-13-site-compliance-checklist-design.md.

### src/lib/cacheUtils.ts
- Type: source
- LOC: 113
- Public surface: `async clearAllCaches(): Promise<void>` (L14)
- Notes: deletes IndexedDB databases (L48 `indexedDB.deleteDatabase`), clears localStorage except preserved keys (`supabase.auth.token`, L6), clears service-worker caches and unregisters service workers (L25 operations list).

### src/lib/calendarReportGenerator.ts
- Type: source
- LOC: 103
- Public surface:
  - re-export `type { CalendarReportData, CalendarEvent, CalendarStats } from './report/calendarRows'` (L18)
  - `interface CalendarPdfResult` (L20)
  - `async generateCalendarPdf(data: CalendarReportData): Promise<CalendarPdfResult>` (L71) — loads company branding first (L73)
- Notes: PDF generator delegating row building to src/lib/report/calendarRows.

### src/lib/cocCompliance.test.ts
- Type: tests
- LOC: 39
- Public surface: none
- Notes: pairs with cocCompliance.ts.

### src/lib/cocCompliance.ts
- Type: source
- LOC: 33
- Public surface:
  - `const COC_STATUSES = ['Missing', 'Pending', 'Pass', 'Fail', 'N/A'] as const` (L1); `type CocStatus` (L2)
  - `interface CocGateInput` (L9)
  - `isExpired(cocExpiryDate: string | null | undefined, today: string): boolean` (L15)
  - `cocFailsGate(s: CocGateInput, today: string): boolean` (L27)
- Notes: pure COC gating rules.

### src/lib/cocFilename.test.ts
- Type: tests
- LOC: 38
- Public surface: none
- Notes: pairs with cocFilename.ts.

### src/lib/cocFilename.ts
- Type: source
- LOC: 24
- Public surface:
  - `extractCocNumber(fileName: string): string | null` (L7)
  - `extractEvalVerdict(fileName: string): "Pass" | "Fail" | null` (L19)
- Notes: pure filename parsing (COC number normalised to PREFIX-DIGITS; PASS/FAIL verdict token).

### src/lib/cocHierarchy.test.ts
- Type: tests
- LOC: 164
- Public surface: none
- Notes: pairs with cocHierarchy.ts.

### src/lib/cocHierarchy.ts
- Type: source
- LOC: 123
- Public surface:
  - `isCocCertificateCategory(name: string): boolean` (L7)
  - `type CocType = 'Initial' | 'Supplementary' | 'Temporary'` (L12); `type CocDocStatus = 'Pass' | 'Fail' | 'Pending' | 'Missing'` (L13)
  - `interface CocDoc` (L15), `interface CocGroup` (L26), `interface CocCardLine` (L91)
  - `normalizeCocType(raw: string | null | undefined): CocType` (L32)
  - `normalizeCocDocStatus(raw: string | null | undefined): CocDocStatus` (L39)
  - `cocDocFails(d: CocDoc, _today: string): boolean` (L52)
  - `rollupStatus(docs: CocDoc[], today: string): CocDocStatus` (L56)
  - `groupCocDocuments(docs: CocDoc[], today: string): CocGroup` (L63)
  - `toCocDoc(d: {...}): ...` (L70, object-literal param)
  - `buildCocCardLines(docs: CocDoc[]): CocCardLine[]` (L108)
- Notes: pure COC document grouping/rollup logic.

### src/lib/complianceCalculations.test.ts
- Type: tests
- LOC: 78
- Public surface: none
- Notes: pairs with complianceCalculations.ts.

### src/lib/complianceCalculations.ts
- Type: source
- LOC: 103
- Public surface:
  - `interface SubsectionForCompliance` (L12), `interface ComplianceStats` (L20)
  - `const VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass'] as const` (L33); `const FAILED_COC_STATUSES = ['Fail', 'Failed', 'Rejected'] as const` (L38)
  - `hasValidCocStatus(cocStatus: string | null | undefined): boolean` (L43)
  - `hasFailedCocStatus(cocStatus: string | null | undefined): boolean` (L51)
  - `isSubsectionCocCompliant(subsection: SubsectionForCompliance): boolean` (L60)
  - `cocComplianceRate(approvedCount: number, requiredCount: number): number` (L71)
  - `calculateCocComplianceStats(...)` (L79)
- Notes: pure compliance-rate calculations.

### src/lib/complianceReportGenerator.ts
- Type: source
- LOC: 330
- Public surface:
  - `interface ComplianceItem` (L37), `interface ComplianceReportData` (L51), `interface ComplianceReportResult` (L66)
  - `async generateComplianceReport(data: ComplianceReportData): Promise<ComplianceReportResult>` (L75)
- Notes: fetches DB-driven template config via `fetchPDFTemplate('compliance')` (L79, from @/hooks/usePDFTemplateGateway).

### src/lib/documentDesignStandards.filename.test.ts
- Type: tests
- LOC: 15
- Public surface: none
- Notes: tests `generateDocumentFilename` local-date stamping only; pairs with documentDesignStandards.ts.

### src/lib/documentDesignStandards.ts
- Type: source
- LOC: 480
- Public surface:
  - `const DOCUMENT_DESIGN_STANDARDS = {...}` (L11, ~320-line constants object)
  - `getContentWidth(): number` (L332), `getContentHeight(): number` (L340)
  - `getSafeImageDimensions(originalWidth: number, originalHeight: number, maxWidth?: number, maxHeight?: number): { width: number; height: number }` (L348)
  - `shouldBreakPage(currentY: number, contentHeight: number, pageHeight: number = 297): boolean` (L374)
  - `generateFooterText(currentPage: number, totalPages: number): string` (L388)
  - `generateDocumentFilename(documentType: string, siteName: string, date?: Date): string` (L398)
  - `const DESIGN_CHECKLIST = [...]` (L417)
  - `export default DOCUMENT_DESIGN_STANDARDS` (L480)
- Notes: shared PDF layout constants + helpers; both named and default export of the same object.

### src/lib/downloadHandoff.ts
- Type: source
- LOC: 281
- Public surface:
  - `interface PendingDownloadHandoff { id: string; windowRef: Window }` (L7)
  - `interface StoredDownloadHandoffRequest extends DownloadHandoffPayload` (L12; DownloadHandoffPayload is a non-exported local interface `{ fileName: string; blob?: Blob; url?: string }`, L1-5)
  - `async getDownloadRequest(id: string): Promise<StoredDownloadHandoffRequest | null>` (L170)
  - `async deleteDownloadRequest(id: string): Promise<void>` (L192)
  - `createPendingDownloadHandoff(): PendingDownloadHandoff | null` (L210)
  - `async completeDownloadHandoff(pendingRequest: PendingDownloadHandoff, payload: DownloadHandoffPayload): Promise<void>` (L228)
  - `async openDownloadHandoffWindow(payload: DownloadHandoffPayload): Promise<boolean>` (L273)
- Notes: own IndexedDB database `wm-download-handoff`, store `requests` (L17-18, opened at L133); opens a popup window and drives it via `windowRef.setTimeout` (L264-268); builds escaped HTML for the handoff window (L44-47).

### src/lib/fileDownload.test.ts
- Type: tests
- LOC: 73
- Public surface: none
- Notes: mocks @/integrations/supabase/client storage (L12); pairs with fileDownload.ts.

### src/lib/fileDownload.ts
- Type: source
- LOC: 251
- Public surface:
  - `getDirectDownloadUrl(url: string, fileName: string): string` (L153)
  - `async downloadBlob(blob: Blob, fileName: string): Promise<void>` (L188)
  - `async downloadFile(url: string, fileName: string): Promise<void>` (L229)
- Notes: downloads via `supabase.storage.from(bucket).download(path)` (L108) with `fetch(url)` fallback (L115); revokes blob URLs after 60 s (L142, L149).

### src/lib/fileValidation.ts
- Type: source
- LOC: 162
- Public surface:
  - `const FILE_LIMITS` (L4), `const ALLOWED_MIME_TYPES` (L11)
  - `interface FileValidationOptions` (L42), `interface FileValidationResult` (L48)
  - `validateFile(...)` (L57), `validateFiles(...)` (L111)
  - `formatFileSize(bytes: number): string` (L138)
  - `isImageFile(file: File): boolean` (L151), `isDocumentFile(file: File): boolean` (L159)
- Notes: pure client-side file validation.

### src/lib/floorPlanReportGenerator.ts
- Type: source
- LOC: 448
- Public surface:
  - `interface FloorPlanReportResult` (L67)
  - `const generateFloorPlanReport = async (data: ReportData): Promise<FloorPlanReportResult>` (L77; `ReportData` is a non-exported local interface, L58)
- Notes: pdfmake-based; header (L1-8) documents "TEMPLATE GATEWAY INTEGRATION" — config fetched from DB via `fetchPDFTemplate` (@/hooks/usePDFTemplateGateway, imported L25); uses shared ./pdfMakeUtils helpers (L10-23).

### src/lib/fortressChecklistReportGenerator.ts
- Type: source
- LOC: 115
- Public surface:
  - re-export `type { FortressChecklistData } from './report/fortressChecklistRows'` (L20)
  - `interface FortressChecklistPdfResult` (L22)
  - `async generateFortressChecklistPdf(data: FortressChecklistData, options: { siteLogoUrl?: string | null } = {}): Promise<FortressChecklistPdfResult>` (L73)
- Notes: loads company branding (L78).

### src/lib/fortressTemplate.ts
- Type: source
- LOC: 361
- Public surface: `const generateFortressTemplate = () => {...}` (L4) — returns a hardcoded template object (name/category/description/sections literal).
- Notes: data-in-code; header comment (L2): "Based on Document: 584_FORTRESS-SCOPE_OF_WORKS.docx".

### src/lib/imageNaming.ts
- Type: source
- LOC: 278
- Public surface:
  - `const sanitizeForFileName = (str: string): string` (L11)
  - `interface ImagePathOptions` (L21), `interface TenantImagePathOptions` (L55)
  - `const generateInspectionImagePath = (options: ImagePathOptions): string` (L32)
  - `const generateTenantImagePath = (options: TenantImagePathOptions): string` (L66)
  - `const extractPathFromUrl = (url: string): string | null` (L85)
  - `const renameImage = async (oldPath: string, newPath: string): Promise<{ success: boolean; newUrl?: string; error?: string }>` (L99)
  - `const renameInspectionImages = async (inspectionId: string, clientName: string, siteName: string, subsectionName: string, jsonData: any): Promise<{ updatedJsonData: any; renamedCount: number; failedCount: number }>` (L157)
- Notes: Supabase Storage download/upload/getPublicUrl/remove for renames (L110-142); 10 s download timeout (L106).

### src/lib/imagePathFixer.ts
- Type: source
- LOC: 226
- Public surface:
  - `async fixInspectionImagePaths(inspectionId: string): Promise<{...}>` (L7)
  - `async fixAllSubsectionImagePaths(subsectionId: string): Promise<{...}>` (L167)
  - `async fixAllInspectionImagePaths(): Promise<{...}>` (L197)
- Notes: data-repair utilities; Supabase DB reads/updates (L14, L79) and Storage list/getPublicUrl walks (L105-151).

### src/lib/imageUrlResolver.ts
- Type: source
- LOC: 203
- Public surface:
  - `extractStorageInfo(url: string): { bucket: string; path: string; fileName: string } | null` (L6)
  - `async findCorrectImageUrl(url: string): Promise<string | null>` (L33)
  - `async fetchImageWithFallback(url: string): Promise<Blob | null>` (L93)
  - `async fetchImageAsDataUrl(url: string, maxWidth: number = 800, quality: number = 0.6): Promise<string | null>` (L197)
- Notes: parses supabase.co storage URLs (regex L11), Storage list/getPublicUrl (L50-77), fetch fallbacks (L96, L108).

### src/lib/inspectionImages.test.ts
- Type: tests
- LOC: 37
- Public surface: none
- Notes: pairs with inspectionImages.ts.

### src/lib/inspectionImages.ts
- Type: source
- LOC: 33
- Public surface:
  - `countInspectionPhotos(jsonData: unknown): number` (L8)
  - `inspectionHasImages(inspection: { json_data?: unknown } | null | undefined): boolean` (L29)
- Notes: pure JSON walkers.

### src/lib/inspectionTemplateReportGenerator.ts
- Type: source
- LOC: 102
- Public surface:
  - re-export `type { InspectionTemplateData } from './report/inspectionTemplateRows'` (L19)
  - `interface InspectionTemplatePdfResult` (L21)
  - `async generateInspectionTemplatePdf(data: InspectionTemplateData): Promise<InspectionTemplatePdfResult>` (L67)
- Notes: loads company branding (L71).

### src/lib/kpiMetrics.test.ts
- Type: tests
- LOC: 36
- Public surface: none
- Notes: pairs with kpiMetrics.ts.

### src/lib/kpiMetrics.ts
- Type: source
- LOC: 66
- Public surface:
  - `interface SubsectionForExpiry` (L10), `interface CocExpiryBuckets { expired: number; within30: number; within90: number }` (L14)
  - `cocExpiryBuckets(subs: SubsectionForExpiry[], today: string): CocExpiryBuckets` (L18)
  - `interface SnagForAging` (L31), `interface SnagAging { criticalOpen: number; oldestOpenDays: number | null; medianResolveDays: number | null }` (L37)
  - `snagAging(snags: SnagForAging[], today: string): SnagAging` (L49)
- Notes: pure KPI calculations.

### src/lib/logger.ts
- Type: source
- LOC: 68
- Public surface:
  - `interface ErrorReporter` (L16) — captureException/captureMessage shape
  - `installErrorReporter(instance: ErrorReporter): void` (L24)
  - `interface Logger { debug/info/warn/error(...args): void; child(scope: string): Logger }` (L50)
  - `const logger: Logger` (L68)
- Notes: console sink; debug suppressed in production (NODE_ENV, L28-31); error level forwards to installed reporter; safe in browser, Node, and Capacitor WebView per header (L11).

### src/lib/loginNext.test.ts
- Type: tests
- LOC: 35
- Public surface: none
- Notes: pairs with loginNext.ts.

### src/lib/loginNext.ts
- Type: source
- LOC: 24
- Public surface: `safeNext(raw: string | null | undefined): string | null` (L8)
- Notes: open-redirect guard for `?next=`; allow-listed prefixes `/contractor, /clients, /client-portal, /dashboard, /sites, /qr-codes, /qr-activity` (L6); resolves dot-segments via URL normalization (header comment L1-5).

### src/lib/navigation.tsx
- Type: source
- LOC: 177
- Public surface:
  - `useNavigate()` (L21)
  - `useParams<T extends Record<string, string> = Record<string, string>>(): T` (L42)
  - `useSearchParams(): [URLSearchParams, (params: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams)) => void]` (L51)
  - `useLocation()` (L86)
  - `const Link = React.forwardRef<HTMLAnchorElement, LinkProps>` (L110)
  - `const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>` (L131)
  - `Navigate({ to, replace = false }: { to: string; replace?: boolean })` (L165)
- Notes: "use client" (L1); React Router DOM compatibility layer mapping to next/navigation + next/link (header L3-7).

### src/lib/offlineDB.cleanupBlobs.test.ts
- Type: tests
- LOC: 31
- Public surface: none
- Notes: pairs with offlineDB.ts (cleanupOrphanedBlobs).

### src/lib/offlineDB.queuedBlobs.test.ts
- Type: tests
- LOC: 27
- Public surface: none
- Notes: pairs with offlineDB.ts; verifies queued upload survives localStorage JSON round-trip without losing the blob (L6-12).

### src/lib/offlineDB.ts
- Type: source
- LOC: 522
- Public surface:
  - Interfaces: `OfflineInspection` (L9), `OfflineImage` (L21), `OfflineSubsection` (L30), `OfflineDocument` (L48), `OfflineFloorPlan` (L58), `OfflineFloorPlanPin` (L67), `OfflinePhoto` (L96), `OfflineMarkup` (L118), `OfflineMeasurement` (L129)
  - Types: `COCPhotoType` (L90), `OfflinePhotoType` (L92), `OfflinePhotoContextType` (L94)
  - `const offlineDB = new OfflineDatabase()` (L522) — class itself (L143) is NOT exported. Instance methods (verified): init (L146), saveInspection (L267), getUnsyncedInspections (L279), markInspectionSynced (L292), deleteInspection (L314), saveImage (L327), getUnsyncedImages (L339), markImageSynced (L352), deleteImage (L374), saveOfflinePhoto (L388), getOfflinePhoto (L399), getOfflinePhotosByContext (L409), getUnsyncedOfflinePhotos (L424), deleteOfflinePhoto (L435), putQueuedBlob (L450), getQueuedBlob (L470), deleteQueuedBlob (L480), cleanupOrphanedBlobs (L495)
- Notes: `indexedDB.open(DB_NAME, DB_VERSION)` at L148; DB_NAME `wm_compliance_offline` (L2), DB_VERSION 5 (L7, "+ queued_blobs store"); blobs kept out of localStorage queue by id-reference (L446, L257).

### src/lib/offlineDB.versionParity.test.ts
- Type: tests
- LOC: 30
- Public surface: none
- Notes: guards DB_VERSION parity between offlineDB.ts and offlineInspectionDB.ts — comment L7: if the constants drift, the lower-versioned module's indexedDB.open() throws.

### src/lib/offlineDBExtensions.ts
- Type: source
- LOC: 219
- Public surface (all async, operating on the shared offlineDB): `saveSubsection(subsection: OfflineSubsection)` (L6), `getSubsection(id)` (L18), `getUnsyncedSubsections()` (L30), `markSubsectionSynced(id)` (L43), `saveDocument(document: OfflineDocument)` (L66), `getUnsyncedDocuments()` (L78), `getSubsectionDocuments(subsectionId)` (L91), `markDocumentSynced(id)` (L104), `deleteDocument(id)` (L126), `saveFloorPlan(floorPlan: OfflineFloorPlan)` (L139), `getUnsyncedFloorPlans()` (L151), `getSubsectionFloorPlans(subsectionId)` (L164), `markFloorPlanSynced(id)` (L177), `deleteFloorPlan(id)` (L199)
- Notes: function-per-operation wrapper over offlineDB stores (subsections, documents, floor plans).

### src/lib/offlineFloorPlanDB.ts
- Type: source
- LOC: 243
- Public surface (all async): `saveOfflinePin(pin: OfflineFloorPlanPin)` (L15), `getOfflinePin(id)` (L27), `getFloorPlanPins(floorPlanId)` (L39), `getUnsyncedPins()` (L52), `markPinSynced(id)` (L65), `deleteOfflinePin(id)` (L87), `saveMarkup(markup: OfflineMarkup)` (L100), `getFloorPlanMarkups(floorPlanId)` (L112), `getUnsyncedMarkups()` (L125), `markMarkupSynced(id)` (L138), `deleteMarkup(id)` (L160), `saveMeasurement(measurement: OfflineMeasurement)` (L173), `getFloorPlanMeasurements(floorPlanId)` (L185), `getUnsyncedMeasurements()` (L198), `markMeasurementSynced(id)` (L211), `deleteMeasurement(id)` (L233)
- Notes: same wrapper pattern as offlineDBExtensions, for pins/markups/measurements.

### src/lib/offlineInspectionDB.eviction.test.ts
- Type: tests
- LOC: 44
- Public surface: none
- Notes: pairs with offlineInspectionDB.ts (evictOldInspections/Templates).

### src/lib/offlineInspectionDB.initRetry.test.ts
- Type: tests
- LOC: 36
- Public surface: none
- Notes: pairs with offlineInspectionDB.ts; makes indexedDB.open error exactly once to test init retry (L10-18).

### src/lib/offlineInspectionDB.ts
- Type: source
- LOC: 531
- Public surface:
  - `interface CachedInspection` (L9), `interface OfflineInspectionImage` (L38), `interface CachedTemplate` (L50)
  - `const offlineInspectionDB = new OfflineInspectionDatabase()` (L531) — class (L58) NOT exported. Methods: init (L62), cacheInspection (L199), getCachedInspection (L215), getAllCachedInspections (L227), getCachedInspectionsBySite (L239), getUnsyncedInspections (L252), markInspectionSynced (L265), updateCachedInspectionData (L275), deleteCachedInspection (L287), isInspectionCached (L299), evictOldInspections(maxCount = 50) (L305), saveInspectionImage (L331), getInspectionImages(inspectionId, sectionKey?) (L346), getUnsyncedImages (L365), markImageSynced(id, uploadedUrl) (L378), deleteInspectionImage (L401), deleteInspectionImages (L413), cacheTemplate (L422), getCachedTemplate (L434), getAllCachedTemplates (L446), deleteCachedTemplate (L458), evictOldTemplates(maxCount = 20) (L471), getStorageEstimate (L492), getCacheStats (L503)
- Notes: opens the SAME database name/version as offlineDB.ts — DB_NAME `wm_compliance_offline` (L2), DB_VERSION 5 (L7), open at L67; uses `navigator.storage.estimate()` (L493-494).

### src/lib/offlineQueue.test.ts
- Type: tests
- LOC: 108
- Public surface: none
- Notes: stubs globalThis.localStorage (L6); pairs with offlineQueue.ts.

### src/lib/offlineQueue.ts
- Type: source
- LOC: 88
- Public surface:
  - `const OFFLINE_QUEUE_KEY = 'offline_mutation_queue'` (L3)
  - `enqueueOfflineMutation(...)` (L13)
  - `orderQueueForSync<T extends { type: string }>(queue: T[]): T[]` (L43)
  - `mergeServerPhotos(serverJson: any, clientJson: any): any` (L57)
- Notes: localStorage-backed mutation queue (L20-31); header comment (L1): same key that useOfflineSync drains.

### src/lib/onlineStatus.test.ts
- Type: tests
- LOC: 25
- Public surface: none
- Notes: pairs with onlineStatus.ts.

### src/lib/onlineStatus.ts
- Type: source
- LOC: 8
- Public surface: `getOnline(): boolean` (L7)
- Notes: `navigator.onLine` with default-online fallback for SSR/Node (comment L3-5).

---

## Runtime observations

- src/lib/auth-audit.ts:62 — external service call: Supabase Edge Function `log-auth-event` via `supabase.functions.invoke`; localStorage retry queue at L44-54 (client-side background retry drain after each success, L87-95).
- src/lib/fileDownload.ts:108 — Supabase Storage `.download()`; L115 raw `fetch(url)` fallback; L142/L149 delayed `URL.revokeObjectURL` via `window.setTimeout` (60 s).
- src/lib/imageNaming.ts:110-142 — Supabase Storage download/upload/getPublicUrl/remove (image rename flow); L106 10 s timeout race.
- src/lib/imagePathFixer.ts:14, 79 — Supabase Postgres reads/updates; L105-151 Storage bucket list traversal.
- src/lib/imageUrlResolver.ts:50-77 — Supabase Storage list/getPublicUrl; L96, L108 `fetch` fallbacks.
- src/lib/offlineDB.ts:148 and src/lib/offlineInspectionDB.ts:67 — both `indexedDB.open('wm_compliance_offline', 5)` (DB_NAME/DB_VERSION at lines 2/7 of each file): two connection managers over one shared IndexedDB database.
- src/lib/offlineInspectionDB.ts:493-494 — `navigator.storage.estimate()` for quota reporting.
- src/lib/offlineQueue.ts:20-31 — localStorage mutation queue under key `offline_mutation_queue` (L3); per header L1 drained by useOfflineSync (hook outside this slice).
- src/lib/downloadHandoff.ts:133 — separate IndexedDB `wm-download-handoff` (L17); L273 `openDownloadHandoffWindow` opens a popup window; L264-268 drives it with `windowRef.setTimeout`.
- src/lib/cacheUtils.ts:48 — `indexedDB.deleteDatabase`; clears service-worker caches and unregisters service workers (operations list L25); preserves `supabase.auth.token` localStorage key (L6).
- src/lib/complianceReportGenerator.ts:79 and src/lib/floorPlanReportGenerator.ts:25 — PDF template configuration fetched from the database via `fetchPDFTemplate` (@/hooks/usePDFTemplateGateway).
- src/lib/navigation.tsx:1 — "use client" module; compatibility shim over next/navigation + next/link (L10-16).
- src/lib/logger.ts:24 — pluggable error reporter injection point (`installErrorReporter`); console output sink; debug muted when NODE_ENV=production (L28).
- src/lib/onlineStatus.ts:7 — `navigator.onLine` probe.

No HTTP request handlers, cron/schedulers, or server entry points exist in this slice; all files are client-side libraries.

## Oddities

- Shared IndexedDB, two owners: offlineDB.ts (L2, L7, L148) and offlineInspectionDB.ts (L2, L7, L67) both define DB_NAME `wm_compliance_offline` and DB_VERSION 5 and open it independently; src/lib/offlineDB.versionParity.test.ts (L7) exists specifically to catch version drift between them.
- Untracked " 2"-suffixed duplicates sit on disk beside tracked files: `src/lib/auth-audit 2.ts` (3007 bytes) and `src/lib/navigation 2.tsx` (6209 bytes), both dated May 28 (ls verified); they are not in git ls-files and match the wider " 2" pattern in git status.
- Three distinct COC status vocabularies coexist: cocCompliance.ts L1 `['Missing','Pending','Pass','Fail','N/A']`; cocHierarchy.ts L13 `'Pass'|'Fail'|'Pending'|'Missing'`; complianceCalculations.ts L33/L38 `['Approved','Valid','Pass']` valid / `['Fail','Failed','Rejected']` failed.
- documentDesignStandards.ts exports DOCUMENT_DESIGN_STANDARDS both as a named export (L11) and as the default export (L480).
- assetVerificationReportGenerator.ts's sole generator function is named `generateInspectionBasedReport` (L41) — name does not mention asset verification, unlike its siblings.
- fortressTemplate.ts is a 361-line hardcoded data literal transcribed from a specific customer document (comment L2: `584_FORTRESS-SCOPE_OF_WORKS.docx`).
- downloadHandoff.ts and floorPlanReportGenerator.ts keep key input types non-exported (`DownloadHandoffPayload` L1, `ReportData` L58) even though exported functions take them as parameters.
- Test coverage in this slice is concentrated on pure-logic files; the Supabase-touching utilities (imageNaming, imagePathFixer, imageUrlResolver, cacheUtils, downloadHandoff) have no adjacent tests, while fileDownload does (fileDownload.test.ts mocks the Supabase client, L12).

## ASSUMED

- offlineQueue.ts header (L1) says useOfflineSync drains the queue — the hook itself is outside this slice and was not opened; the drain relationship is taken from the comment.
- The report generators are presumed invoked from view components; importers were not traced (outside slice scope).
- fortressTemplate.ts classified as `source` (it is executable TS), though it functions as embedded seed/template data.
- The `" 2"` duplicate files are presumed macOS/Finder or sync-conflict copies based on the naming pattern and git-status cluster; their content was not diffed against the originals.
- The two offline DB classes are presumed to require coordinated schema migrations because they open the same database; runtime interaction between them was not executed, only read (offlineDB.versionParity.test.ts documents the constraint).
