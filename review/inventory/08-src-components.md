# Inventory 08 — src/components domain subdirs (site, pdf-editor, client-portal, auth, settings, public, fortress, floor-plan)

Date: 2026-07-29

List command:

```
git ls-files 'src/components/site/*' 'src/components/pdf-editor/*' 'src/components/client-portal/*' 'src/components/auth/*' 'src/components/settings/*' 'src/components/public/*' 'src/components/fortress/*' 'src/components/floor-plan/*'
```

Output count (via `| wc -l`): **47** files.

LOC command: `git ls-files <same globs> | xargs wc -l` → total 12,925 (per-file numbers used below).

Classification totals: source 45, tests 2.

---

## src/components/auth (5 files)

### src/components/auth/AuthLoading.tsx
- Type: source
- LOC: 28
- Public surface: `AuthLoading({ variant?: "spinner" | "skeleton" })` (AuthLoading.tsx:9) — shared loading state for route protectors; two visual variants.
- Notes: `"use client"` directive. Comment states extraction from ProtectedRoute/AuthOnlyRoute/ClientProtectedRoute/ContractorProtectedRoute ("EC-7", AuthLoading.tsx:5-8).

### src/components/auth/OnboardingGate.tsx
- Type: source
- LOC: 32
- Public surface: `OnboardingGate({ onboardingStatus: { onboarding_completed: boolean | null } | null | undefined, onComplete: () => void, children: ReactNode })` (OnboardingGate.tsx:15).
- Notes: wraps children with `OnboardingWizard` when onboarding incomplete; local `dismissed` state.

### src/components/auth/useAuthSession.test.tsx
- Type: tests
- LOC: 26
- Public surface: none (vitest describe/it). Tests that `useAuthSession` fails CLOSED (session null, isLoading false) when `getSession` rejects (useAuthSession.test.tsx:20-26); mocks `@/integrations/supabase/client`.

### src/components/auth/useAuthSession.ts
- Type: source
- LOC: 39
- Public surface: `useAuthSession(): { session: Session | null, isLoading: boolean }` (useAuthSession.ts:14).
- Notes: subscribes to `supabase.auth.onAuthStateChange` and calls `getSession()` (useAuthSession.ts:19-33); fail-closed error path sets session null.

### src/components/auth/useOnboardingStatus.ts
- Type: source
- LOC: 25
- Public surface: `useOnboardingStatus(enabled: boolean)` returning a react-query result (useOnboardingStatus.ts:10).
- Notes: queries `profiles.onboarding_completed` for the current auth user (useOnboardingStatus.ts:17-21); queryKey `["onboarding-status"]`.

---

## src/components/client-portal (5 files)

### src/components/client-portal/AccessLinkGenerator.tsx
- Type: source
- LOC: 552
- Public surface: `AccessLinkGenerator({ siteId?: string, clientId?: string })` (AccessLinkGenerator.tsx:84); also `export default AccessLinkGenerator` (AccessLinkGenerator.tsx:553).
- Notes: CRUD on `client_access_links` table (lines 101, 177, 219, 239); reads `sites` (125) and `clients` (141); copies links via `navigator.clipboard.writeText` (206, 257).

### src/components/client-portal/ClientCocView.tsx
- Type: source
- LOC: 217
- Public surface: `ClientCocView({ siteId: string, siteName: string, onPreview: (url, name) => void })` (ClientCocView.tsx:33).
- Notes: parallel reads of `subsections`, `coc_db_schedule`, `coc_certificates` (lines 41-45) and `subsection_documents` (54); generates a site QR data-URL via `QRCode.toDataURL(qrSiteRedirectUrl(siteId))` (lines 22, 101).

### src/components/client-portal/ClientPortalDocuments.tsx
- Type: source
- LOC: 295
- Public surface: `ClientPortalDocuments({ siteDocuments: SiteDocument[], siteCategories: SiteDocumentCategory[], subsectionDocuments: SubsectionDocument[], subsections: {id,name}[], onPreview: (url,name)=>void, onDownload: (url,name)=>void })` (ClientPortalDocuments.tsx:51).
- Notes: presentational; data passed in via props, local search/filter state.

### src/components/client-portal/SiteOverviewCard.tsx
- Type: source
- LOC: 117
- Public surface: `SiteOverviewCard({ site: {id,name,address?,site_type?,site_image_url?}, stats: SiteStats, score?: SiteScore, scoreLoading?: boolean, linkPrefix?: string = "/client-portal/sites" })` (SiteOverviewCard.tsx:33); also `export default SiteOverviewCard` (SiteOverviewCard.tsx:118).

### src/components/client-portal/index.ts
- Type: source
- LOC: 1 (wc -l; contains 2 export statements — no trailing newline)
- Public surface: re-exports `AccessLinkGenerator`, `SiteOverviewCard` (index.ts:1-2). Does not re-export ClientCocView or ClientPortalDocuments.

---

## src/components/floor-plan (2 files)

### src/components/floor-plan/PinFilters.tsx
- Type: source
- LOC: 102
- Public surface: types `StatusFilter = 'all'|'open'|'in_progress'|'finished'|'closed'`, `PriorityFilter = 'all'|'critical'|'high'|'medium'|'low'`, `TypeFilter = 'all'|'snag'|'observation'` (PinFilters.tsx:12-14); `PinFilters({ statusFilter, priorityFilter, typeFilter, onStatusChange, onPriorityChange, onTypeChange, onClearFilters, activeFilterCount })` (PinFilters.tsx:27).

### src/components/floor-plan/index.ts
- Type: source
- LOC: 1
- Public surface: re-exports `PinFilters` plus the three filter types (index.ts:1).

---

## src/components/fortress (2 files)

### src/components/fortress/AssetRegister.test.tsx
- Type: tests
- LOC: 73
- Public surface: none (vitest). Renders `AssetRegister` with a `BuildingAsset` factory (AssetRegister.test.tsx:10-31); uses `@/lib/fortress/types`.

### src/components/fortress/AssetRegister.tsx
- Type: source
- LOC: 156
- Public surface: `AssetRegister({ assets: BuildingAsset[], loading?: boolean, error?: boolean, onRetry?: () => void })` (AssetRegister.tsx:30).
- Notes: presentational table for building assets; data via props.

---

## src/components/pdf-editor (7 files)

### src/components/pdf-editor/CoverPageEditor.tsx
- Type: source
- LOC: 88
- Public surface: `CoverPageEditor: React.FC<{ customization: ReportCustomization, onChange: (updates: Partial<ReportCustomization>) => void, siteName: string, clientName: string }>` (CoverPageEditor.tsx:17).

### src/components/pdf-editor/PDFReportEditor.tsx
- Type: source
- LOC: 338
- Public surface: `PDFReportEditor: React.FC<{ open: boolean, onOpenChange: (open) => void, siteName: string, clientName: string, reportType: "site-summary" | "asset-verification" | "inspection", initialSections: ReportSection[], onGenerate: (customization: ReportCustomization) => Promise<void>, onPreview?: (customization) => Promise<string> }>` (PDFReportEditor.tsx:48).
- Notes: orchestrator dialog composing the other pdf-editor components.

### src/components/pdf-editor/ReportOptionsPanel.tsx
- Type: source
- LOC: 162
- Public surface: `ReportOptionsPanel: React.FC<{ customization: ReportCustomization, onChange: (updates: Partial<ReportCustomization>) => void }>` (ReportOptionsPanel.tsx:30).

### src/components/pdf-editor/SectionEditor.tsx
- Type: source
- LOC: 287
- Public surface: `SectionEditor: React.FC<{ section: ReportSection, onUpdate: (sectionId, updates: Partial<ReportSection>) => void, onClose: () => void }>` (SectionEditor.tsx:35).

### src/components/pdf-editor/SectionToggle.tsx
- Type: source
- LOC: 114
- Public surface: `SectionToggle: React.FC<{ section: ReportSection, onToggle: (id, enabled) => void, onMoveUp?, onMoveDown?, onEdit?, onDelete?, canMoveUp?, canMoveDown?, isEditing? }>` (SectionToggle.tsx:21).

### src/components/pdf-editor/index.ts
- Type: source
- LOC: 7
- Public surface: barrel re-exporting PDFReportEditor, CoverPageEditor, SectionToggle, SectionEditor, ReportOptionsPanel, and `export * from "./types"` (index.ts:2-7).

### src/components/pdf-editor/types.ts
- Type: source
- LOC: 93
- Public surface: interfaces `TableColumn {id,label,field,visible,width?}` (types.ts:3), `KPIItem {id,label,field,visible,color?}` (types.ts:11), `ReportSection {id,title,type:'summary'|'table'|'kpi'|'text'|'chart',enabled,order,editable,data?,notes?,columns?,kpiItems?,textContent?}` (types.ts:19), `ReportCustomization {coverTitle,coverSubtitle,includeDate,includeReference,sections,accentColor,executiveSummary,customNotes,includeTableOfContents,includePageNumbers,includeWatermark,watermarkText}` (types.ts:39), `EditableField` (types.ts:63), `ReportPreviewState` (types.ts:74); const `DEFAULT_CUSTOMIZATION: ReportCustomization` (types.ts:80).

---

## src/components/public (2 files)

### src/components/public/PublicIssueReportDialog.tsx
- Type: source
- LOC: 168
- Public surface: `PublicIssueReportDialog({ subsectionId: string, trigger: React.ReactNode })` (PublicIssueReportDialog.tsx:38).
- Notes: `"use client"`. Unauthenticated "report an issue" dialog for QR landing pages; POSTs multipart FormData directly to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue` with no Supabase client/auth header (PublicIssueReportDialog.tsx:77-84, comments 26-30); uses `CaptchaTurnstile` / `CAPTCHA_ENABLED` (lines 20-24); MAX_PHOTOS = 3 (line 32).

### src/components/public/PublicVerdictCard.tsx
- Type: source
- LOC: 29
- Public surface: `PublicVerdictCard({ verdict: PublicVerdict | null })` (PublicVerdictCard.tsx:12).
- Notes: renders pass/pass-expiring/fail/pending/missing verdict via `presentVerdict` from `@/lib/publicVerdict`.

---

## src/components/settings (4 files)

### src/components/settings/AutoLogoutSettings.tsx
- Type: source
- LOC: 192
- Public surface: `AutoLogoutSettings()` — no props (AutoLogoutSettings.tsx:17).
- Notes: reads/updates a `settings` table row `{id, auto_logout_enabled, auto_logout_time}` (lines 47, 72, 98); 60s interval updating a current-time display (lines 25-41). Configures the auto-logout schedule only; the enforcement mechanism is not in this file.

### src/components/settings/ImageCompressionManager.tsx
- Type: source
- LOC: 257
- Public surface: `ImageCompressionManager()` — no props (ImageCompressionManager.tsx:32).
- Notes: invokes edge function `batch-compress-images` via `supabase.functions.invoke` (line 48) with dry-run/maxWidth/quality/minSizeKB/limit params; renders `BatchResult { processed, compressed, skipped, errors, totalSavings, files, continuationToken? }` (lines 21-30).

### src/components/settings/PDFTemplatePreview.tsx
- Type: source
- LOC: 285
- Public surface: `PDFTemplatePreview: React.FC<{ customization: ReportCustomization, sections: ReportSection[], reportType: string }>` (PDFTemplatePreview.tsx:20).
- Notes: consumes pdf-editor types (ReportCustomization/ReportSection).

### src/components/settings/SANSReferenceTab.tsx
- Type: source
- LOC: 517
- Public surface: `SANSReferenceTab({ className?: string })` (SANSReferenceTab.tsx:106).
- Notes: contains hard-coded SANS 10142-1:2020 reference data as in-file constants — `CLAUSE_REFERENCES` (mandatory/safety_critical/additional clause tables, lines 26-49) and `COC_TYPES` (line 51+). Static reference display; no data fetching observed.

---

## src/components/site (20 files)

### src/components/site/AssetComparisonTable.tsx
- Type: source
- LOC: 758
- Public surface: `AssetComparisonTable({ assets: Asset[], inspectionMeterMatches: Map<string, InspectionTenantMatch>, siteName: string, companyLogoUrl?: string | null, onDataUpdated?: () => void, readOnly?: boolean })` (AssetComparisonTable.tsx:56).
- Notes: reads `site_documents` (83), updates `site_assets` (199), reads/updates `inspections` (223, 255), deletes `site_documents` rows + `documents` storage objects (345-347); imports `savePDFToDocuments`/`getReportCategoryName` (@/lib/pdfDocumentSaver, line 22) and `generateInspectionBasedReport` (@/lib/assetVerificationReportGenerator, line 25).

### src/components/site/AssetTable.tsx
- Type: source
- LOC: 216
- Public surface: `AssetTable({ assets: Asset[], type: "electrical" | "water", onRefresh: () => void, readOnly?: boolean })` (AssetTable.tsx:45).
- Notes: mutates `site_assets` (64).

### src/components/site/AssetVerification.tsx
- Type: source
- LOC: 502
- Public surface: `AssetVerification({ siteId: string, siteName: string, readOnly?: boolean, accessToken?: string })` (AssetVerification.tsx:60).
- Notes: dual data path — with `accessToken` uses token-scoped RPC `get_public_site_review(p_token, p_site_id)` (82); otherwise direct reads of `site_assets` (98), `inspections` (114), `subsections` (130); bulk insert/update/delete of `site_assets` (197, 205, 273).

### src/components/site/BulkInspectionReportGenerator.tsx
- Type: source
- LOC: 755
- Public surface: `BulkInspectionReportGenerator({ siteId: string, siteName: string, clientName?: string, siteLogoUrl?: string | null, onComplete?: () => void })` (BulkInspectionReportGenerator.tsx:59).
- Notes: generates inspection report PDFs client-side via `generateAndSaveInspectionReportPdfmake` (@/lib/pdfmakeInspectionReport, line 24); in-file comment "Generate PDF client-side via pdfmake (no cloud engine / no data egress)" (line 326); also imports `countInspectionPhotos` (@/lib/inspectionImages, line 3) and `templateSupportsTenants` (@/lib/templateTenants, line 25).

### src/components/site/DocumentDialogs.tsx
- Type: source
- LOC: 147
- Public surface: `DocumentDialogs({ createCategoryOpen, setCreateCategoryOpen, newCategoryName, setNewCategoryName, onCreateCategory, uploadCategoryId, setUploadCategoryId, uploadFiles, setUploadFiles, onUploadDocument, deleteCategoryId, setDeleteCategoryId, onDeleteCategory, categories: {id,name}[] })` (DocumentDialogs.tsx:25).
- Notes: controlled dialogs; all mutations delegated to parent callbacks.

### src/components/site/DocumentHistoryDialog.tsx
- Type: source
- LOC: 53
- Public surface: `DocumentHistoryDialog({ open, onOpenChange, documentId: string | null, documentName: string })` (DocumentHistoryDialog.tsx:19).
- Notes: reads `activity_logs` (26).

### src/components/site/InspectionDialogs.tsx
- Type: source
- LOC: 81
- Public surface: `InspectionDialogs({ isCreateInspectionOpen, setIsCreateInspectionOpen, availableTemplates: {id,name,category}[], selectedTemplateId, setSelectedTemplateId, newInspectionDate, setNewInspectionDate, handleCreateInspection })` (InspectionDialogs.tsx:18).

### src/components/site/MeterRegister.tsx
- Type: source
- LOC: 572
- Public surface: `MeterRegister({ siteId: string, siteName: string, readOnly?: boolean })` (MeterRegister.tsx:49).
- Notes: reads `subsections` (59), `site_assets` (74), `inspections` (89); uses `normalizeMeterSerial` (@/lib/assetVerification, line 13).

### src/components/site/MoveDocumentsDialog.tsx
- Type: source
- LOC: 96
- Public surface: `interface MoveDoc { id, file_name, file_url, source: "site"|"subsection", site_id, subsection_id, category_id, category_name, coc_number }` (MoveDocumentsDialog.tsx:8); `MoveDocumentsDialog({ open, onOpenChange, docs: MoveDoc[], siteCategories: Cat[], onConfirm: (targetId, targetName) => void })` (MoveDocumentsDialog.tsx:29).
- Notes: reads `document_categories` (43).

### src/components/site/QRCodeManager.tsx
- Type: source
- LOC: 335
- Public surface: `QRCodeManager: React.FC<{ site: Site, subsections: Subsection[], companyLogo: string | null, generatingAll: boolean, setGeneratingAll, downloadingAll: boolean, setDownloadingAll, fetchSiteData: () => void }>` (QRCodeManager.tsx:25).
- Notes: bulk QR generation via `generateAndUploadQRCode` (@/lib/qrCodeGenerator, lines 8, 46); dynamic `import('qrcode')` and canvas rendering of `qrRedirectUrl(subsection.id)` for bulk download (lines 80, 107); renders `LabeledQRCode` (316).

### src/components/site/QRScanActivity.tsx
- Type: source
- LOC: 180
- Public surface: `QRScanActivity: React.FC<{ subsections: Subsection[] }>` (QRScanActivity.tsx:19).
- Notes: reads `qr_scans` (subsection_id, scanned_at) for the last 30 days (lines 40-45); tracks a "scansCapped" state.

### src/components/site/ReportSettingsDialog.tsx
- Type: source
- LOC: 271
- Public surface: `interface ReportSection { id, title, description, enabled, icon: React.ReactNode, category?: 'cover'|'overview'|'details'|'annexes' }` (ReportSettingsDialog.tsx:28); `ReportSettingsDialog: React.FC<{ open, onOpenChange, sections: ReportSection[], onSectionToggle: (sectionId, enabled) => void }>` (51); `getDefaultReportSections(): ReportSection[]` (135).

### src/components/site/SchematicDiagram.tsx
- Type: source
- LOC: 2302 (largest file in the slice)
- Public surface: `SchematicDiagram: React.FC<{ siteId: string, siteName: string, readOnly?: boolean, accessToken?: string, clientPortalMode?: boolean }>` (SchematicDiagram.tsx:136); also `export default SchematicDiagram` (2302).
- Notes: dual data path — token RPC `get_public_site_review` (782) vs direct reads; heavy table usage: `schematic_blocks` (745, 822, 1063, 1161, 1210, 1231, 1250, 1281), `site_schematics` (800, 952, 977, 1016, 1381, 1414), `subsections` (832), `inspections` (841), `documents` (939, 945); removes storage objects from dynamically-determined buckets (971, 1024); navigation via `useNavigate`/`useParams` from `@/lib/navigation` (2).

### src/components/site/SiteComplianceChecklist.tsx
- Type: source
- LOC: 113
- Public surface: `SiteComplianceChecklist({ summary: SiteDeliverablesSummary, clientId: string, siteId: string })` (SiteComplianceChecklist.tsx:45).
- Notes: renders deliverable statuses from `@/lib/siteDeliverables` (DELIVERABLE_ORDER, types, lines 6-11); builds action links via `buildActionHref` (12).

### src/components/site/SiteDocuments.tsx
- Type: source
- LOC: 497
- Public surface: `SiteDocuments({ documents: SiteDocument[], categories: SiteDocumentCategory[], subsectionDocuments?, subsections?, canManage?, onDeleteDocument, onPreview, onDownload, onUploadClick, onCreateCategory, onDeleteCategory, onBulkDeleteCategories?, onBulkDeleteDocumentsInCategory?, onRenameDocument, onMoveDocuments, onDeleteDocuments, onViewHistory, onRenameCategory, onReorderCategory })` — 19 props (SiteDocuments.tsx:97 with interface at 74-96).
- Notes: presentational; all data/mutations via props.

### src/components/site/SiteEditDialog.tsx
- Type: source
- LOC: 323
- Public surface: `SiteEditDialog: React.FC<{ open, onOpenChange, editFormData: {name,address,description,status,location_lat,location_lng}, setEditFormData, onSubmit, site?: Site | null, siteId?: string, onImageChange?: () => void }>` (SiteEditDialog.tsx:40).
- Notes: uploads to `site-images` storage bucket + getPublicUrl (60-61); updates `sites` (62, 79, 109).

### src/components/site/SiteImages.tsx
- Type: source
- LOC: 243
- Public surface: `SiteImages: React.FC<{ site: Site, siteId: string, imagePreview: {site_image?, client_logo?}, setImagePreview, handleImageUpload: (file, imageType: 'site_image'|'client_logo') => Promise<void>, handleDeleteImage, uploadingImage: 'site_image'|'client_logo'|null, fetchSiteData }>` (SiteImages.tsx:23).
- Notes: updates `sites` (95, 166).

### src/components/site/SiteReports.tsx
- Type: source
- LOC: 322
- Public surface: `SiteReports: React.FC<{ site: Site, readOnly?: boolean, autoOpenGenerate?: boolean }>` (SiteReports.tsx:53).
- Notes: reads/deletes `site_documents` (66, 102); removes `documents` storage objects (97); uses `downloadFile` (@/lib/fileDownload, line 12).

### src/components/site/SubsectionFilters.tsx
- Type: source
- LOC: 449
- Public surface: `interface SubsectionFiltersState { search: string, cocStatus: string[], compliance: string[], snags: string[], metering: string[], category: string[], groupBy: "none"|"category"|"cocStatus"|"compliance"|"snags", viewMode: "table"|"grid" }` (SubsectionFilters.tsx:28); `SubsectionFilters({ filters, onFiltersChange, categories: string[], totalCount, filteredCount })` (71).
- Notes: in-file option constants for COC status / compliance / metering / snags (47-69).

### src/components/site/SubsectionList.tsx
- Type: source
- LOC: 509
- Public surface: `SubsectionList({ subsections: Subsection[], onDelete: (id, name) => void, clientId: string, siteId: string, snags?: Snag[] })` (SubsectionList.tsx:38).
- Notes: presentational list/grid; no direct table access observed (grep for `.from(` matched only `Array.from`, line 68).

---

## Runtime observations

- **Public unauthenticated edge-function POST**: `src/components/public/PublicIssueReportDialog.tsx:77` — multipart POST to `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/report-issue` with no auth header (comments at lines 26-30 state server-side Turnstile verification happens in the edge function). Cloudflare Turnstile widget via `CaptchaTurnstile` import (lines 20-24).
- **Edge function invocation**: `src/components/settings/ImageCompressionManager.tsx:48` — `supabase.functions.invoke('batch-compress-images', ...)` with batching/continuation-token support (interface `BatchResult.continuationToken`, line 29).
- **Token-scoped public-review RPC**: `supabase.rpc("get_public_site_review", { p_token, p_site_id })` at `src/components/site/AssetVerification.tsx:82` and `src/components/site/SchematicDiagram.tsx:782` — components switch between anonymous-token RPC and authenticated table reads depending on the `accessToken` prop.
- **Supabase Storage integrations**: bucket `documents` removals (`src/components/site/AssetComparisonTable.tsx:345`, `src/components/site/SiteReports.tsx:97`); bucket `site-images` upload + getPublicUrl (`src/components/site/SiteEditDialog.tsx:60-61`); dynamic-bucket removals (`src/components/site/SchematicDiagram.tsx:971`, `:1024`).
- **Auth state listener**: `src/components/auth/useAuthSession.ts:19` — `supabase.auth.onAuthStateChange` subscription plus `getSession()` bootstrap (fail-closed on error, lines 27-33).
- **Client-side PDF generation**: `src/components/site/BulkInspectionReportGenerator.tsx:24,326` — pdfmake via `@/lib/pdfmakeInspectionReport` (comment: "no cloud engine / no data egress"); `src/components/site/AssetComparisonTable.tsx:22,25` — report generation via `@/lib/assetVerificationReportGenerator` and save-back via `@/lib/pdfDocumentSaver`.
- **QR code generation**: `src/components/site/QRCodeManager.tsx:80,107` — dynamic `import('qrcode')`, canvas render of `qrRedirectUrl(subsection.id)`; upload via `generateAndUploadQRCode` (`@/lib/qrCodeGenerator`, lines 8,46). `src/components/client-portal/ClientCocView.tsx:22,101` — `QRCode.toDataURL(qrSiteRedirectUrl(siteId))`.
- **Clipboard**: `src/components/client-portal/AccessLinkGenerator.tsx:206,257` — `navigator.clipboard.writeText`.
- **Timer**: `src/components/settings/AutoLogoutSettings.tsx:38` region — 60s `setInterval` for a clock display (UI only; the file configures `settings.auto_logout_enabled/auto_logout_time`, lines 47-98 — enforcement not in this slice).
- **Table access map** (component → tables, grep `.from(` excluding storage): AccessLinkGenerator → client_access_links, sites, clients; ClientCocView → subsections, coc_db_schedule, coc_certificates, subsection_documents; AssetComparisonTable → site_documents, site_assets, inspections; AssetVerification → site_assets, inspections, subsections; AssetTable → site_assets; MeterRegister → subsections, site_assets, inspections; SchematicDiagram → schematic_blocks, site_schematics, subsections, inspections, documents; QRScanActivity → qr_scans; DocumentHistoryDialog → activity_logs; MoveDocumentsDialog → document_categories; SiteEditDialog/SiteImages → sites; SiteReports → site_documents; AutoLogoutSettings → settings; useOnboardingStatus → profiles.

## Oddities

- Untracked duplicate files with " 2" suffixes exist on disk in `src/components/auth/` (`AuthLoading 2.tsx`, `OnboardingGate 2.tsx`, `useAuthSession 2.ts`, `useOnboardingStatus 2.ts`) — visible in `ls src/components/auth/` and in git status untracked list; not in `git ls-files` output, so excluded from this inventory's file set.
- Two distinct exported interfaces named `ReportSection` with different shapes: `src/components/pdf-editor/types.ts:19` (type/enabled/order/columns/kpiItems...) vs `src/components/site/ReportSettingsDialog.tsx:28` (description/icon/category). Both are consumed within the codebase under the same name.
- Three components export both a named and a default export of the same symbol: `AccessLinkGenerator` (AccessLinkGenerator.tsx:84,553), `SiteOverviewCard` (SiteOverviewCard.tsx:33,118), `SchematicDiagram` (SchematicDiagram.tsx:136,2302). Other components in the slice are named-export only.
- Barrel `index.ts` files exist only for client-portal, floor-plan, and pdf-editor; `client-portal/index.ts` re-exports only 2 of the 4 components in its directory (index.ts:1-2).
- `src/components/client-portal/index.ts` reports 1 line via `wc -l` but contains 2 export statements (missing trailing newline).
- `SchematicDiagram.tsx` is 2,302 LOC — 17.8% of the slice's total 12,925 LOC in a single file.
- Only 5 files in the slice carry a `"use client"` directive (the 4 tracked auth source files and PublicIssueReportDialog.tsx); the remaining 40 source files have none (verified via `grep -l '"use client"'`).
- `fortress/` and `floor-plan/` each contain only 2 tracked files.

## ASSUMED

- The `report-issue` and `batch-compress-images` edge functions live under `supabase/functions/` — inferred from invocation patterns; the functions themselves were not opened (outside this slice).
- `Asset`, `Site`, `Subsection`, `Snag`, `SiteDocument`, `SiteDocumentCategory`, `SubsectionDocument`, `BuildingAsset`, `SiteStats`, `SiteScore` types are defined in `@/types/*` and `@/lib/*` modules outside this slice — inferred from import paths, not opened.
- Auto-logout enforcement (acting on `settings.auto_logout_time`) is assumed to be implemented elsewhere in the app; only the settings UI is in this slice.
- The " 2" suffixed files are assumed to be Finder/copy artifacts given macOS naming convention; their content was not compared against the originals.
- Components with no `"use client"` directive are assumed to inherit client context from parent components/pages, since they use React hooks (would fail as server components) — not verified against the App Router wiring.
