# Phase 4 Findings (components / hooks / lib) — 2026-06-11

Synthesis of the 106 notes from the Phase-4 per-symbol review. Full per-symbol detail (incl. inline
flags) lives in the sibling `*.md` batch docs; this is the actionable cross-cutting backlog.
Critic: 833 symbols documented, 8/8 spot-checks matched code exactly — docs are accurate.

## A. Dead code (deletion candidates — grep-verified zero callers)
A large, low-risk cleanup surface. Removing these shrinks the maintenance + attack surface.

**Dead components:** `COCReviewStatus`, `OfflineImageGallery`, `OfflinePhotoGallery`,
`OfflineSubsectionEnhancements`, `SiteDrawingInspection` (sibling `SiteDrawingReport` IS used),
`SiteImages` (superseded by SiteEditDialog inline), `SiteExport` (superseded by SiteReports +
GenerateFinalReportButton; its handler is a console.log stub), `PDFTemplatePreview`, the 5
single-section `*Preview` components (`SiteSummaryPreview`/`InspectionPreview`/`FloorPlanPreview`/
`AssetVerificationPreview`/`CompliancePreview`) + their `preview-renderers/index.ts` barrel (imported
nowhere), and `pdf-preview/SubsectionCard` + `SubsectionGrid` (orphaned React duplicate of the live
pdfmake `lib/pdfSubsectionRenderer`).

**Dead vendored shadcn ui/ primitives (0 callers):** aspect-ratio, breadcrumb, calendar, carousel,
chart, context-menu, drawer, hover-card, input-otp, menubar, navigation-menu, pagination, resizable,
**sonner** (the app uses Radix toaster, not Sonner — pick-one cleanup). Typical scaffold residue.

**Dead lib files / exports:** the **entire `src/lib/pdf/` OCR pipeline** (advancedProcessor,
imageExtractor, ocrEngine [a stub returning `[]`], textExtractor) — orphaned, zero importers;
`usePDFTemplate.ts` (superseded by usePDFTemplateGateway); `inspectionReportGenerator.generateAndSaveInspectionReport`
(superseded by pdfmake/pdfshift paths); `complianceReportGenerator.generateComplianceReport`;
`generateAssetVerificationReport`; `complianceCalculations.calculateComplianceWithValidations`; all of
`imagePathFixer.*`; `fileValidation.{validateFiles,formatFileSize,isImageFile,isDocumentFile}`;
`imageUrlResolver.{fetchImageAsDataUrl,fetchImageWithFallback,extractStorageInfo}`;
`documentDesignStandards.*` (6 unused helpers); `pdfMakeConfig.testPdfBlobGeneration`;
`pdfTemplates.{calculateComplianceScore,truncateText}`; `useUnifiedPdfGeneration.getReportCategory`;
several typed-but-unconsumed interfaces (`EditableField`, `ReportPreviewState`, dup `InspectionTemplateReportData`).

## B. Stubs / no-ops that MISLEAD (higher priority — they lie to the user) → G-SEC-19/G-OPS-03
- `storageQuota.clearOldOfflineData` toasts **"Old offline data cleared successfully"** but deletes
  NOTHING (console.logs only). `estimateIndexedDBUsage` returns a fabricated ~1KB/db estimate, not real usage.
- `ocrEngine.extractTextFromCanvas` always returns `[]` (stub) — anything relying on it silently gets nothing.
- **Diagnostic shipped to prod:** `pdfMakeConfig.testPdfGeneration` (downloads a hello-world PDF + `alert()`)
  is wired to an onClick in `components/site/AssetComparisonTable.tsx:565`.

## C. Duplicated logic (consolidation candidates)
- Asset/meter-match map rebuilt ~3× (AssetVerification, siteSummaryRenderSpec.calculateAssetMetrics +
  generateAssetSchedule). HEIC→JPEG + canvas compression re-implemented in 4 hooks
  (useCamera/useImageUpload/useOfflineInspectionDetail/useOfflinePhotos). Two QR generators
  (qrCodeGenerator vs subsectionCardSpec.generateSubsectionQRCode). Three `createStatusBadge` impls;
  three pass/fail status vocabularies (InspectionReportPreview/QualityDashboard/SectionPage). Two toast
  systems (Radix vs Sonner). Two sample-data generators (useSampleReportData vs useUnifiedSiteData).
  COC violation-override persistence duplicated (COCValidationLogCard vs InlineViolationOverrides).
  IssueReportDialog ≈ SuggestionDialog (same screenshot flow, stored inconsistently). Two ACCENT_COLORS
  palettes with different hex. Three overlapping report-type unions with mismatched casing.

## D. Security-relevant client writes — RE-CONFIRM existing gaps (no new gap)
Many components/hooks write directly to Supabase from the browser, gated only by RLS (→ **G-SEC-13**):
ComplianceDashboard, ComprehensiveInspectionReport, FortressMarkingChecklist, UserRLSPolicies,
InteractiveFloorPlan, VerificationDialog, TemplateBuilder/PDFTemplateUploader (inspection_templates),
SignatureCapture, AssetVerification/AssetComparisonTable, SchematicDiagram, AccessLinkGenerator,
the offline hooks. Uploads to PUBLIC buckets (→ **G-SEC-14**): DynamicFieldManager (inspection-photos),
BeforeAfterComparison (floor-plan-photos), useOfflinePhotos (coc-photos), pdfDocumentSaver/qrCodeGenerator.
Spoofable provenance (→ **G-SEC-17**): InteractiveFloorPlan sets `rectified_by = user?.email` client-side.
`CaptchaTurnstile` renders null when the key is unset (→ **G-SEC-02**). `ImageCompressionManager` invokes
the DESTRUCTIVE `batch-compress-images` edge fn (overwrites storage originals when dryRun=false).

## E. Correctness quirks / bugs (per-file, mostly minor)
AssetVerification "Total Assets" card is mislabeled (shows electrical-meters count, excludes water);
BulkInspectionReportGenerator Stop uses a stale closure (lags an iteration); SubsectionList uses
`useMemo` for a setState side-effect; WYSIWYG `generatePdfFromPages` CROPS pages taller than one A4
instead of paginating; `navigation.tsx` shim drops react-router history `state`/`isPending`;
pdfshift `embedAllImages` early-returns (image embedding is dead); `complianceReportGenerator` divides
by total with no zero-guard; `pdfDocumentSaver` category find-or-create is non-atomic (concurrent dup).

## F. Brand / hardcoding
Stale `'SiteWise'` company-name fallbacks (`AppSidebar:144`, `OnboardingWizard`); admin email
`arno@wmeng.co.za` hardcoded in `IssueReportDialog:96` + `SuggestionDialog:103`; several hardcoded
SANS clause datasets + a 2-year/90-day COC validity heuristic embedded in client code.

## G. Notable architecture (for the architecture chapter, Phase 5)
Offline = two IndexedDB singletons sharing one DB (v4) with cross-creating upgrade blocks (documented
fix for a prior VersionError); blobs persist UNENCRYPTED. `navigation.tsx` is a react-router→App-Router
compat shim (the only `.tsx` in lib). `utils.cn` is the most-imported symbol (69 files). pdf.js worker
loaded from CDN (unpkg/cdnjs) across all react-pdf consumers. **Good pattern:** `OrphanResolutionModal`
+ `useUnresolvedOrphans` delegate all authz to SECURITY DEFINER RPCs — the model the direct-write
components should follow.
