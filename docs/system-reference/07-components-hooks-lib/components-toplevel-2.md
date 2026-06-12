# 07 · Top-level components — part 2 (I–V)

**Scope:** Per-symbol reference for the SECOND HALF of `src/components/*.tsx` (top-level only) — the 30 files sorting from `InteractiveFloorPlan.tsx` through `VisitorRegistrationGate.tsx`. Ground-truth from code; callers grepped across `src/`. Cross-references: data model → `02-data-model`, auth/RLS → `03-auth-and-access`, routes → `04-routes`, edge functions → `05-edge-functions`, flows → `06-flows`.

**Files covered:** 30. **Exported symbols documented:** 33 (28 default-component files + `OfflineSubsectionEnhancements` exports 2, `VisitorRegistrationGate` exports 2; several files also `export default`).

> Convention: each entry = one-line purpose · props table · key state/effects/data calls · renders · callers. Trivial helpers get one line. Notes flagged inline.

---

## InteractiveFloorPlan.tsx → `InteractiveFloorPlan`
Full floor-plan workspace: upload PDF plan, place/move/delete numbered pins, quick-status, rectification photos, undo, live realtime sync, PDF report export.

| prop | type | meaning |
|---|---|---|
| subsectionId | string | owning subsection |
| projectName / siteName / subsectionName | string | report header context |

- **State:** `floorPlan`, `pins[]`, `selectedPin`, `isModalOpen`, `isLoading/isUploading/isGeneratingReport`, `pdfPreview`, `moveMode` (pin id being repositioned), `quickAddMode`, `undoTimeoutRef`.
- **Hooks:** `useOfflineFloorPlanAnnotations` (addPin/updatePin/deletePin/getOfflineAnnotations/isOnline), `useUndoStack`.
- **Effects:** on mount/`subsectionId`/`floorPlan?.id` — `loadFloorPlan()` + two realtime channels (`floor_plan_pins` all-events, `subsection_floor_plans` filtered by subsection) → reload + toast; cleanup `removeChannel`.
- **Data calls (direct client):** `subsection_floor_plans` select/insert; `floor_plan_pins` select/update (move, rectify, status, remove-rectify); `floor_plan_pin_comments` select for report; `storage.documents` upload + `getPublicUrl`; `auth.getUser`; lib `generateFloorPlanReport`, `savePDFToDocuments`, `html2canvas`.
- **Renders:** loading spinner → empty-upload state → header (Quick Add/Replace/Preview) + `FloorPlanStatsWidget` + `FloorPlanViewer` + `FloorPlanPinsList` (desktop & mobile) + `FloorPlanPinModal` + `DocumentPreviewDialog`.
- **Callers:** `views/InspectionDetail.tsx`, `views/SubsectionDetail.tsx`.
- **Notes:** ⚠️ security-relevant client writes — direct `update` on `floor_plan_pins` (status/rectification/move) and direct `subsection_floor_plans` insert with client-supplied `publicUrl`; relies on RLS (see `03-auth-and-access`). `rectified_by` is set to `user?.email || 'Unknown'` client-side (spoofable label). Empty `useEffect` at L117-120 is dead.

## IssueReportDialog.tsx → `IssueReportDialog`
Modal to file a bug/issue report with auto-captured screenshot + browser info; inserts row and emails admin.

| prop | type | meaning |
|---|---|---|
| open | boolean | dialog visibility |
| onOpenChange | (open)=>void | close handler |
| screenshot | string\|null | data-URL captured by caller |

- **State:** description, severity (low/medium/high/critical), category, isSubmitting.
- **Data calls:** `auth.getUser`; `profiles` select; `storage.issue-screenshots` upload + `getPublicUrl`; `issue_reports` insert (reporter, email, browser_info, page_url, status `'new'`); `functions.invoke('send-email')` → hardcoded `to: 'arno@wmeng.co.za'`.
- **Renders:** Dialog with screenshot preview, description Textarea, severity/category Selects, submit.
- **Caller:** `components/HelpButton.tsx`.
- **Notes:** hardcoded admin email recipient. Direct client insert into `issue_reports`.

## LabeledQRCode.tsx → `LabeledQRCode`
Renders a QR code (errorCorrection H) on a `<canvas>` with site/subsection text labels + optional centered logo overlay; offers PNG download.

| prop | type | meaning |
|---|---|---|
| url | string | encoded target |
| siteName / subsectionName | string | drawn text labels |
| logoUrl? | string | center overlay (crossOrigin anonymous) |
| onGenerated? | (dataUrl)=>void | fires with PNG data-URL |

- **State:** generatedUrl, isGenerating; `canvasRef`. **Effect:** regenerate on any prop change. Uses `qrcode` lib + manual canvas drawing (`fitText` shrinks font to width). `useToast` for feedback.
- **Renders:** canvas + "Download QR Code" button.
- **Callers:** `components/site/QRAnalytics.tsx`, `views/QRCodes.tsx`.
- **Notes:** several `console.log` left in the generate path.

## LoadingState.tsx → `LoadingState`
Generic loading placeholder with three variants.

| prop | type | meaning |
|---|---|---|
| variant? | 'spinner'\|'skeleton'\|'full-page' | default 'spinner' |
| message? | string | caption text |
| skeletonCount? | number | rows for skeleton (default 3) |
| className? | string | wrapper class |

- Pure presentational (no state/effects). Renders spinner / `Skeleton` rows / centered full-page spinner.
- **Callers (5):** contractor/client-portal/admin layouts, `inspection-templates/page.tsx`, `views/Auth.tsx`.

## NotificationListener.tsx → `NotificationListener`
Background poller that surfaces unread "issue resolved" notifications one at a time in a dialog.

- No props. **Query:** `unread-notifications` → `auth.getUser` then `notifications` where `user_id` + `read=false`, `refetchInterval 30000`, `retry:false`. **Mutation:** mark `read=true`, invalidates query.
- **Effect:** when notifications arrive and none shown, set first as current.
- **Actions:** Dismiss (mark read) / View Resolved Issue → fetches `issue_reports.page_url` then `window.location.href` redirect.
- **Caller:** `app/providers.tsx` (global).
- **Notes:** hard navigation via `window.location.href` (full reload).

## OfflineImageGallery.tsx → `OfflineImageGallery`
Grid gallery mixing synced online image URLs + local offline blobs; capture/upload/delete with sync badges.

| prop | type | meaning |
|---|---|---|
| onlineImages | string[] | synced URLs |
| offlineImages | {id,blobUrl,synced}[] | local blobs |
| onAddImage | (File\|Blob)=>Promise<string\|null> | parent persists |
| onDeleteOfflineImage? / onDeleteOnlineImage? | (id\|url)=>Promise<boolean> | delete hooks |
| isOnline | boolean | gates online delete |
| disabled? / maxImages? (50) / title? ('Images') | — | — |

- **State:** isUploading, viewingImage, deletingIds(Set). **Hook:** `useCamera` (isNative/takePicture/selectImages). **Effect:** revoke `blob:` URLs on unmount.
- **Renders:** header with counts + pending-sync badge, capture/upload buttons, grid of `RobustImage` (online) + `<img>` (offline) with hover zoom/delete, `FullscreenImageViewer`.
- **Notes:** ⚠️ **dead export** — no importer found in `src/`. `handleDeleteOnline` uses native `confirm()`.

## OfflineIndicator.tsx → `OfflineIndicator`
Fixed bottom-right pill showing offline state / queued-mutation count with a manual sync button.

- No props. **Hook:** `useOfflineSync` (isOnline/queueSize/isSyncing/processQueue). Returns `null` when online & queue empty. Renders Wifi/WifiOff + count + refresh.
- **Caller:** `app/providers.tsx` (global).

## OfflinePhotoGallery.tsx → `OfflinePhotoGallery`
Rich offline-first photo capture/sync gallery scoped by context (coc/inspection/floor_plan/site/document), with per-photo type, notes, retry, pause/resume sync.

| prop | type | meaning |
|---|---|---|
| contextType | OfflinePhotoContextType | drives default photo-type set |
| contextId | string | primary scope |
| secondaryContextId? | string | extra filter |
| photoTypes? | OfflinePhotoType[] | restrict capture types |
| allowCapture? (true) / maxPhotos? (50) | — | — |
| onPhotoLinked? | (photoId,remoteUrl)=>void | fires once per synced photo |
| title? / description? | string | header |

- **Hook:** `useOfflinePhotos(contextType, contextId)` → photos, pendingCount/SizeBytes, isSyncing/isCapturing/isOnline/syncPaused + capturePhoto/syncPhotos/deletePhoto/getPhotoPreviewUrl/pause/resume.
- **Memos:** filter photos by secondary id + types; `availableTypes` from context defaults. **Effects:** manage full-size viewer object-URL with cleanup; build preview-url map with `blob:` revoke; track already-reported synced ids in `useRef` Set to avoid duplicate `onPhotoLinked` (comments cite "FIX MEDIUM 5/6"). Retry does dynamic `import('@/lib/offlineDB')` to reset retry_count.
- **Renders:** Card with offline banner, type Select + capture, notes, sync controls (pause/resume), photo grid with status badges (✓/!/⏳) + retry, full-size Dialog with EXIF-ish meta (captured_at, lat/long, size, notes, sync_error).
- **Notes:** ⚠️ **dead export** — no importer found in `src/`. `ALL_PHOTO_TYPE_LABELS` map duplicates label vocabulary defined in `offlineDB` types.

## OfflineSubsectionEnhancements.tsx → `OfflineSubsectionEnhancements`, `OfflineDocumentBadge`
Two pure presentational banners/badges for offline subsection state.

**`OfflineSubsectionEnhancements`**
| prop | type | meaning |
|---|---|---|
| isOnline | boolean | toggles banner |
| offlineDocumentCount? / offlineFloorPlanCount? (0) | number | pending counts |
| onSyncClick? | ()=>void | manual sync |
| isSyncing? | boolean | spinner |

Returns `null` when online with nothing pending; else shows offline alert or "N pending sync + Sync Now".

**`OfflineDocumentBadge`** — `{ isOffline: boolean }` → small "Offline" badge or `null`. Caller: `OfflineSubsectionEnhancements` co-file imports it.
- **Notes:** ⚠️ `OfflineSubsectionEnhancements` is a **dead export** — no importer found in `src/`. `OfflineDocumentBadge` only referenced inside the same file region (verify usage).

## OnboardingWizard.tsx → `OnboardingWizard`
4-step modal (Welcome → Profile → Photo → Overview) that finalizes a user profile and sets `onboarding_completed`.

| prop | type | meaning |
|---|---|---|
| open | boolean | shown by gate |
| onComplete | ()=>void | called after save |

- **State:** step, loading, full_name/phone/job_title/company/bio/avatarUrl, uploading. **Hooks:** `useUserRole`. **Queries:** `company-settings` (`settings.company_name/company_logo_url`), `onboarding-profile` (`auth.getUser` + `profiles` select; seeds form).
- **Writes:** `storage.profile-images` upload(upsert) + `getPublicUrl`; `profiles` update (+ `onboarding_completed:true`) then invalidate `current-user-profile`/`onboarding-profile`.
- **Renders:** progress bar, role-aware overview copy, non-dismissible Dialog (`onPointerDownOutside` prevented, close button hidden).
- **Caller:** `components/auth/OnboardingGate.tsx`.
- **Notes:** Welcome fallback brand string is "SiteWise" (vs app brand "WM Compliance") — stale placeholder.

## OrphanResolutionModal.tsx → `OrphanResolutionModal` (+ internal `OrphanRowCard`)
Blocking alert dialog forcing a contractor to attach/archive orphan inspections (`subsection_id IS NULL`). Security enforced server-side via SECURITY DEFINER RPC.

- **`OrphanResolutionModal`**: no props. `useUnresolvedOrphans()` → rows/isLoading; returns `null` while loading or zero rows; else open AlertDialog listing `OrphanRowCard` per row.
- **`OrphanRowCard({ row })`**: per-row pick-shop Select (pre-selects `best_guess` if similarity ≥0.6), Save → `resolve({inspection_id,subsection_id})`, "Not mine" → archive dialog with optional reason → `archive({inspection_id,reason})`. busy guards + toasts.
- **Caller:** `components/ContractorProtectedRoute.tsx`.
- **Notes:** good example of server-side-enforced model (RPC), client just surfaces rows — see `06-flows`. `OrphanRowCard` not exported.

## PDFTemplateExportDialog.tsx → `PDFTemplateExportDialog` (default + named)
Configurable PDF export dialog for a report template (cover/TOC/header/footer toggles, accent color, watermark, company/date/reference) with in-iframe preview.

| prop | type | meaning |
|---|---|---|
| open / onOpenChange | — | dialog control |
| template | TemplateData\|null | source data |

- **State:** isExporting, previewUrl, activeTab, `options: ExportOptions` (defaults incl. `companyName:'Watson Mattheus'`). `updateOption` generic setter.
- **Lib:** `exportTemplateToPDF` (→ blob → object-URL preview), `downloadTemplatePDF` from `@/lib/pdfTemplateExporter`.
- **Renders:** Tabs Options/Preview, switches + color buttons + inputs, iframe preview, footer Cancel/Preview/Download.
- **Caller:** `views/InspectionTemplates.tsx`. Exports both named const and `export default`.

## PDFTemplateUploader.tsx → `PDFTemplateUploader` (default + named)
Drag-drop PDF importer that extracts a template structure, lets the user edit it, and saves to `inspection_templates`.

| prop | type | meaning |
|---|---|---|
| onTemplateExtracted? | (ExtractedTemplate)=>void | extraction callback |
| onTemplateSaved? | ()=>void | post-save callback |
| className? | string | — |

- **State:** isDragging, isProcessing, extractedTemplate, showEditDialog, editedTemplate, isSaving, previewUrl. Drag handlers + file input → `extractTemplateFromPDF` (lib). Edit dialog mutates name/category/description/cover_page/sections (update/remove section helpers). Preview → `generateTemplatePreviewPDF` → `window.open`.
- **Write:** `inspection_templates` insert (name, category, description, sections, cover_page, sections_count, pages_count).
- **Caller:** `views/InspectionTemplates.tsx`. Named + default export.
- **Notes:** direct client insert into `inspection_templates`; casts `sections`/`cover_page` to `any`.

## PlatformCapabilityTester.tsx → `PlatformCapabilityTester`
Diagnostics panel: detects platform/browser/PWA and runs 8–11 real capability tests (IndexedDB read/write/verify, production offline DB init, storage quota, persistent storage, service worker, background sync, camera, HEIC, network info, Blob, Cache API) with score + recommendations.

- No props. **State:** platformInfo, capabilities[], storageResult, syncResult, isTesting, testComplete.
- **Local interfaces:** `PlatformInfo`, `CapabilityTest`, `StorageTestResult`, `SyncTestResult` (file-private). Each `test*` fn returns a `CapabilityTest`. `testProductionOfflineDB` exercises real `offlineInspectionDB.init/getCacheStats/getStorageEstimate`. iOS-specific quota/background-sync warnings.
- **Renders:** Card with platform header + Run All, score Progress, per-test list, storage details, recommendations, sync grid.
- **Caller:** `views/OfflineSyncTest.tsx`.
- **Notes:** writes/deletes throwaway `_capability_test_db` IndexedDB + `_capability_test` cache; dynamic `import('heic2any')` to probe availability.

## ProtectedRoute.tsx → `ProtectedRoute` (default)
Admin-area route guard: blocks unauthenticated, redirects Contractor/Client to their portals, else renders children behind onboarding gate.

| prop | type | meaning |
|---|---|---|
| children | ReactNode | protected subtree |

- **Hooks:** `useAuthSession`, `useUserRole`, `useOnboardingStatus(!!session)`. Loading → `AuthLoading`; no session → `Navigate /auth/login`; role Contractor → `/contractor`; Client → `/client-portal`; else wrap in `OnboardingGate`.
- **Callers:** admin layout + auth helper files. See `03-auth-and-access` / `04-routes`.

## RecentAssignmentsWidget.tsx → `RecentAssignmentsWidget`
Dashboard card listing the 10 most recent contractor site assign/remove events, joined client-side to profiles + sites.

- No props. **Query** `recent-site-assignments`: `user_sites_history` (limit 10) then batched `profiles` + `sites` (with `clients`) lookups, manually mapped into `HistoryEntry`. Row click → `navigate('/site-assignments')`.
- **Caller:** `views/Dashboard.tsx`.
- **Notes:** N+1 avoided via `.in()` batch; local `HistoryEntry` interface mirrors join shape.

## RobustImage.tsx → `RobustImage`
Image with loading/error states + self-healing: on error tries `findCorrectImageUrl` (storage filename mismatch), then cache-bust retries, then manual retry UI.

| prop | type | meaning |
|---|---|---|
| src | string | image URL |
| alt | string | alt text |
| className? | string | wrapper |
| onError? | ()=>void | final-failure callback |
| onClick? | ()=>void | click (adds cursor) |
| retryCount? (2) | number | cache-bust attempts |

- **State:** imageState (loading/loaded/error), retries, imageSrc, hasAttemptedFix; `mountedRef`. Effect resets all on `src` change. `handleError` two-strategy recovery; `handleManualRetry` re-resolves.
- **Lib:** `findCorrectImageUrl` from `@/lib/imageUrlResolver`.
- **Callers (10):** OfflineImageGallery, FullscreenImageViewer, BeforeAfterComparison, site/MeterRegister, site/AssetComparisonTable, views/Sites, etc.

## SessionWatcher.tsx → `SessionWatcher`
Headless watcher that triggers a daily auto-logout (+ cache clear + audit) at an admin-configured time. Renders `null`.

- No props. **Refs:** settingsRef, warningShownRef. Const `LAST_LOGOUT_KEY='wm_last_auto_logout_date'`, `CHECK_INTERVAL_MS=60000`. Local `AutoLogoutSettings` interface.
- **Behavior:** `fetchSettings` reads `settings.auto_logout_enabled/auto_logout_time`; `checkLogoutTime` every 60s — skips if disabled/no session/already-done-today, warns 30s before, then `performLogout`. `performLogout`: localStorage flag → `clearAllCaches()` → `recordAuthEvent('logout',{reason:'session_expired'})` **before** `auth.signOut()` → `navigate('/auth/login')` + toast. Settings refreshed every 5 min.
- **Caller:** `app/providers.tsx` (global).
- **Notes:** audit recorded before JWT invalidation (intentional, commented). See `03-auth-and-access`.

## SignatureCapture.tsx → `SignatureCapture`
Canvas signature pad in a Card→Dialog; upserts a signature row keyed by inspection+signer type.

| prop | type | meaning |
|---|---|---|
| inspectionId | string | FK |
| signerType | 'inspector'\|'contractor'\|'client'\|'witness' | upsert conflict key |
| title | string | card/dialog heading |
| onSignatureSaved? | (SignatureData)=>void | callback |
| existingSignature? | SignatureData\|null | preload |

- **State:** isDrawing, hasSignature, isDialogOpen, signerName/Email, isSaving, signature. `canvasRef` mouse+touch drawing handlers; `initCanvas` sizes + white-fills.
- **Write:** `inspection_signatures` upsert `onConflict:'inspection_id,signer_type'` with base64 `signature_data`; delete by id. Local `SignatureData` interface.
- **Renders:** signed preview (img + name/date + delete) OR "Tap to Sign" → Dialog with name/email inputs + canvas + clear/save.
- **Caller:** `components/InspectionSignatures.tsx`.
- **Notes:** stores signature image as base64 in DB column.

## SiteDrawingInspection.tsx → `SiteDrawingInspection`
Heavy PDF annotation editor: renders a PDF (react-pdf + pdfjs worker), overlays a Fabric.js canvas for draw/shape/text/eraser tools + numbered pins with images. Reports state up via `onDataChange`.

| prop | type | meaning |
|---|---|---|
| inspectionId | string | scope for uploads |
| initialPdfUrl? | string | preload plan |
| initialPins? | Pin[] | preload pins |
| initialCanvasData? | string | serialized fabric JSON |
| onDataChange? | (pdfUrl,pins,canvasData?)=>void | lifts state to parent |

- **State:** pdfUrl/pdfFile, numPages/currentPage, pins[], selectedPin, activeTool (`DrawingTool` union), scale, uploading, drawingColor, fabricCanvas. Refs for page/canvas/pdf containers. **Hook:** `useCamera`.
- **Effects:** push state via `onDataChange` on change; init/dispose Fabric canvas on pdfUrl; reconfigure brush/selection per `activeTool`.
- **Writes:** `storage.documents` upload + `getPublicUrl` (PDF); `storage.inspection-photos` upload + `getPublicUrl` (pin images).
- **Local types:** `Pin`, `DrawingTool` (file-private).
- **Notes:** ⚠️ **dead export** — no importer found in `src/` (its sibling `SiteDrawingReport` IS used by `InspectionDetail`). pdfjs worker pinned to unpkg CDN URL by version.

## SiteDrawingReport.tsx → `SiteDrawingReport`
Button that assembles `SiteDrawingReportData` and generates a site-drawing PDF for preview via the unified PDF hook.

| prop | type | meaning |
|---|---|---|
| inspectionData | any | source (reads jsonData.generalInfo + fallbacks) |
| siteName / subsectionName / subsectionId | string | context |
| pdfUrl | string | base plan |
| pins | Pin[] | numbered pins (id/x/y/number/title/description/images) |
| canvasData? | string | annotation JSON |

- **State:** previewOpen/Url/FileName/Blob. **Hook:** `useUnifiedPdfGeneration` (`generatePdfForPreview`, isGenerating). Maps pins → report data, builds `generalInfo` with multi-key fallbacks.
- **Renders:** "Preview Report" button + `DocumentPreviewDialog` (saveLocation 'subsection').
- **Caller:** `views/InspectionDetail.tsx`. Local `Pin` interface.

## SiteSummaryReport.tsx → `SiteSummaryReport`
Generates the comprehensive multi-section site-summary PDF (health KPIs, subsection grid, COC validations, inspections, assets, fortress marking, documents) with template overrides + QR; preview + save.

| prop | type | meaning |
|---|---|---|
| siteId / siteName / clientName | string | report scope |

- **State:** generating, saving, previewData. Local interfaces `TemplateConfig`; consts `TERMINAL_SNAG_STATUSES`, `isSnagOpen`, `DEFAULT_SECTIONS` (from `SECTION_SPECS`), `DEFAULT_CUSTOMIZATION`.
- **Data (parallel `Promise.all`):** `sites` (+clients), `subsections`, `inspections`, `site_documents` (+categories), `subsection_documents`, `settings.qr_base_url`, `site_assets` (electrical_meter), `site_marking_checklist`, `snags`, `coc_validations`. Template via `fetchPDFTemplate` (usePDFTemplateGateway). Branding via `loadCompanyBranding`/`imageUrlToBase64`. Render via `@/lib/pdfEngine` + `siteSummaryRenderSpec` + `pdfSubsectionRenderer`. QR via `qrcode`. Save via `savePDFToDocuments`.
- **Caller:** `components/site/SiteExport.tsx`.
- **Notes:** the heaviest report component; most logic delegated to `lib/siteSummaryRenderSpec` ("single source of truth"). Snag open/closed logic duplicated here (`TERMINAL_SNAG_STATUSES`) vs spec helpers — verify consistency.

## SuggestionDialog.tsx → `SuggestionDialog`
Modal form to submit a feature/improvement suggestion with optional screenshot; inserts row + emails admin. Near-duplicate structure of `IssueReportDialog`.

| prop | type | meaning |
|---|---|---|
| open / onOpenChange | — | dialog control |
| screenshot | string\|null | captured data-URL |

- **State:** title, description, priority (low/medium/high), category (feature/improvement/ui/performance/other), isSubmitting.
- **Data:** `auth.getUser`; `profiles` select; `storage.suggestion-screenshots` upload (stores `uploadData.path`, not public URL); `suggestions` insert; `functions.invoke('send-email')` → hardcoded `to: 'arno@wmeng.co.za'`.
- **Caller:** `components/HelpButton.tsx`.
- **Notes:** duplicate of IssueReportDialog flow; hardcoded admin email; screenshot stored as storage path (vs IssueReportDialog's public URL) — inconsistent.

## TemplateBasedReport.tsx → `TemplateBasedReport`
Pick an inspection template, fill per-item status/notes/photos, generate a PDFShift-rendered inspection report; preview + save.

| prop | type | meaning |
|---|---|---|
| subsectionId / subsectionName / siteName | string | scope |
| clientName? / siteLogoUrl? | string | branding |

- **State:** templates[], selectedTemplate, reportData (nested section→item→{status,notes,photos}), loading, preview Open/Url/FileName/Blob, saving, isGenerating. Local interfaces `TemplateSection`, `InspectionTemplate`, `ReportData`.
- **Data:** `inspection_templates` select; `storage.documents` upload + `getPublicUrl` (photo evidence); generate via `generatePdfShiftInspectionReport` (`@/lib/pdfshiftInspectionReport`); save via `savePDFToDocuments`.
- **Caller:** none — ⚠️ **dead export** (no importer found in `src/`).

## TemplateBuilder.tsx → `TemplateBuilder`
Form/tabs editor to build or edit an inspection template (sections + typed items; optional Tenants tab for board templates).

| prop | type | meaning |
|---|---|---|
| templateId? | string | edit mode if present |
| initialData? | {name,category,description,sections,tenants?} | preload |
| onSave? | ()=>void | post-save callback |

- **State:** templateName, category, description, sections[], tenants[], saving. Local interfaces `TemplateItem` (type union text/textarea/number/image/checkbox/select), `TemplateSection`, `Tenant`. Consts `TEMPLATE_CATEGORIES`, `FIELD_TYPES`.
- **Behavior:** add/update/remove section + item + tenant helpers. Tenants tab only shown when name includes "main board"/"shop board". Save → `inspection_templates` update (if `templateId`) or insert; `tenants` cast to `any`.
- **Caller:** `views/TemplateBuilderPage.tsx`.
- **Notes:** direct client insert/update into `inspection_templates`. Tenant gating keyed on template-name substring (fragile string match).

## UserRLSPolicies.tsx → `UserRLSPolicies`
Admin panel showing the RLS policies that apply to a role and managing per-user policy overrides (grant/deny) + changing a user's role.

| prop | type | meaning |
|---|---|---|
| userRole | string | initial selected role |
| userId? | string | target user for overrides |

- **State:** policies[], loading, groupedPolicies, selectedRole, hasChanges, showAddOverride, newOverride{table_name,operation,permission_type,condition,reason}. Local interfaces `RLSPolicy`, `PolicyOverride`. Consts `commandIcons`, `commandColors`.
- **Data/Mutations:** query `policy-overrides` ← `user_policy_overrides`; `rpc('get_rls_policies_for_role')`; mutations — `updateUserRole` (`user_roles` delete+insert), `addOverride` / `deleteOverride` (`user_policy_overrides`).
- **Caller:** `views/Users.tsx`.
- **Notes:** ⚠️ security-relevant — client mutates `user_roles` and `user_policy_overrides` directly; effectiveness depends entirely on RLS/RPC guards (see `03-auth-and-access`, GAPS). Reads RLS metadata via SECURITY DEFINER RPC.

## VerificationDashboardWidget.tsx → `VerificationDashboardWidget`
Admin card summarizing pending user-verification counts + recent verified/rejected feedback across issues & suggestions.

- No props. **Queries:** `pending-verifications-count` (parallel head-counts on `issue_reports` + `suggestions` where `needs_user_verification` & `verification_status='pending'`, refetch 30s); `recent-verification-feedback` (last verified/rejected from both tables, merged+sorted, refetch 60s).
- **Caller:** `views/Dashboard.tsx`.

## VerificationDialog.tsx → `VerificationDialog`
Asks a reporter to confirm/reject a fix; on reject captures full-page screenshot and reopens the item.

| prop | type | meaning |
|---|---|---|
| verification | PendingVerification\|null | item under review (renders null if absent) |
| open / onClose / onVerified | — | dialog + lifecycle |

- **State:** isVerifying, rejectionReason, showRejectionForm. Local `PendingVerification` interface.
- **Verify:** update `issue_reports`/`suggestions` → `verification_status:'verified'`, verified_at/by, `needs_user_verification:false`. **Reject:** `html2canvas(document.body)` → upload `storage.issue-screenshots` → update with `verification_status:'rejected'`, rejection_reason/screenshot, and status moved back (`'in-progress'` for issues / `'in_progress'` for suggestions — divergent vocab, commented).
- **Caller:** `components/VerificationListener.tsx`.
- **Notes:** ⚠️ direct client writes to `issue_reports`/`suggestions`. Status-string vocabulary differs per table by design.

## VerificationListener.tsx → `VerificationListener`
Headless: on mount fetches pending verifications for the user and walks them one-by-one through `VerificationDialog`.

- No props. **Effect:** `auth.getUser` → `rpc('get_pending_verifications',{user_uuid})` → queue + open first. `handleVerified` advances queue. Local `PendingVerification` interface (mirrors dialog).
- **Caller:** `app/providers.tsx` (global). Renders `VerificationDialog`.

## VisitorRegistrationGate.tsx → `VisitorRegistrationGate`, `getVisitorSession`
Gate for public portals: collects visitor details before granting access; records to `access_link_visitors`. Plus a session-check helper.

**`getVisitorSession(linkId): boolean`** — reads `sessionStorage['visitor_session']`, returns true if stored `linkId` matches (try/catch → false). Callers: the three public review views + the gate itself.

**`VisitorRegistrationGate`**
| prop | type | meaning |
|---|---|---|
| accessLinkId | string | link being accessed (FK) |
| companyLogoUrl? / companyName? | string | branding |
| onRegistered | ()=>void | unlock callback |

- **State:** form{firstName,lastName,email,phone,role}, submitting, errors. Local interfaces `VisitorForm`; const `VISITOR_SESSION_KEY`. `validate()` checks required + email regex + phone length. **Write:** `access_link_visitors` insert (names/email lowercased/phone/role/user_agent) → store session → `onRegistered()`.
- **Callers:** `views/PublicClientPortfolio.tsx`, `PublicSiteReview.tsx`, `PublicSubsectionReview.tsx`.
- **Notes:** ⚠️ anonymous/public client insert into `access_link_visitors` (anon write surface — see `03-auth-and-access` anon-read/write lockdown notes). Session persistence is browser-session only (cleared on close).

---

## NOTES roll-up (notable findings)

- **Dead exports (no importer in `src/`):** `OfflineImageGallery`, `OfflinePhotoGallery`, `OfflineSubsectionEnhancements` (its co-export `OfflineDocumentBadge` only referenced in-file), `SiteDrawingInspection`, `TemplateBasedReport`.
- **Hardcoded admin email** `arno@wmeng.co.za` in `IssueReportDialog` and `SuggestionDialog` (`send-email` invoke).
- **Duplicate logic / near-duplicates:** `IssueReportDialog` ↔ `SuggestionDialog` (same report-with-screenshot flow; screenshot stored as public URL vs storage path — inconsistent). Snag open/closed status logic in `SiteSummaryReport` duplicates `siteSummaryRenderSpec` helpers.
- **Security-relevant client writes (RLS-dependent):** `UserRLSPolicies` (`user_roles`, `user_policy_overrides`), `InteractiveFloorPlan` (`floor_plan_pins`, `subsection_floor_plans`), `VerificationDialog` (`issue_reports`/`suggestions`), `TemplateBuilder`/`PDFTemplateUploader` (`inspection_templates`), `VisitorRegistrationGate` (anon insert to `access_link_visitors`), `SignatureCapture` (`inspection_signatures`).
- **Spoofable client labels:** `InteractiveFloorPlan` sets `rectified_by` from `user.email` client-side.
- **Stale brand placeholder:** `OnboardingWizard` welcome fallback "SiteWise".
- **Server-side-enforced good pattern:** `OrphanResolutionModal` delegates all guards to SECURITY DEFINER RPCs (`useUnresolvedOrphans`).
- **Leftover `console.log`:** `LabeledQRCode` generate path.
- **Divergent status vocab by table (intentional, commented):** `VerificationDialog` uses `'in-progress'` for issues vs `'in_progress'` for suggestions.
