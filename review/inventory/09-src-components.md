# Inventory — src/components root-level files

- Slice: src/components root-level files (depth-1 files directly under `src/components/`)
- List command: `git ls-files 'src/components/*' | awk -F/ 'NF==3'`
- Output count: 48 files (verified; `| wc -l` of the same command)
- Total LOC: 12,239 (`git ls-files 'src/components/*' | awk -F/ 'NF==3' | xargs wc -l` → `12239 total`)
- Date: 2026-07-29

Classification summary: 47 source, 1 tests (SiteHealthBadge.test.tsx).

---

## Auth guards / session (proposed module: route-guards-auth)

### src/components/AuthOnlyRoute.tsx
- Type: source | LOC: 13
- Public surface: default export `AuthOnlyRoute({ children }: { children: React.ReactNode })` (line 13).
- Notes: session-only guard; redirects to `/auth/login` when no session (lines 8-10). Uses `useAuthSession`, `AuthLoading`.

### src/components/ProtectedRoute.tsx
- Type: source | LOC: 29
- Public surface: default export `ProtectedRoute({ children }: { children: React.ReactNode })` (line 29).
- Notes: staff guard; redirects Contractor role to `/contractor` and Client role to `/client-portal` (lines 18-19); appends `?next=` on login redirect (lines 15-17); wraps children in `OnboardingGate` (line 23).

### src/components/ClientProtectedRoute.tsx
- Type: source | LOC: 33
- Public surface: default export `ClientProtectedRoute({ children }: { children: React.ReactNode })` (line 33).
- Notes: Client-role guard with Admin preview bypass via `?preview` query param (lines 22-24); `OnboardingGate` wrap (line 27).

### src/components/ContractorProtectedRoute.tsx
- Type: source | LOC: 37
- Public surface: default export `ContractorProtectedRoute({ children }: { children: React.ReactNode })` (line 37).
- Notes: Contractor-role guard with Admin `?preview` bypass (line 23); forces path prefix `/contractor` (line 25); mounts `OrphanResolutionModal` inside the gate (line 31).

### src/components/SessionWatcher.tsx
- Type: source | LOC: 149
- Public surface: `export function SessionWatcher()` (line 20), no props.
- Notes: daily auto-logout watcher. Reads `settings.auto_logout_enabled/auto_logout_time` from supabase (lines 27-30); `setInterval` loops at lines 126 and 136 (`CHECK_INTERVAL_MS = 60000`, line 9); on trigger: `clearAllCaches()` (line 54), `supabase.auth.signOut()` (line 60), `recordAuthEvent("logout", …)` (line 57), `localStorage` dedupe key `wm_last_auto_logout_date` (lines 8, 51, 86).

### src/components/OrphanResolutionModal.tsx
- Type: source | LOC: 209
- Public surface: `export function OrphanResolutionModal()` (line 42), no props.
- Notes: blocking AlertDialog while inspector has orphan inspections (subsection_id IS NULL); uses `useUnresolvedOrphans` hook (lines 22-25); file docblock (lines 27-41) states enforcement is server-side via SECURITY DEFINER RPCs, component only surfaces rows and sends RPCs.

### src/components/VisitorRegistrationGate.tsx
- Type: source | LOC: 256
- Public surface: `export function getVisitorSession(linkId: string): boolean` (line 35); `export function VisitorRegistrationGate(props)` (line 46) with props `{ accessLinkId: string; companyLogoUrl?: string; companyName?: string; onRegistered: () => void }` (lines 17-22).
- Notes: public access-link visitor capture; inserts into `access_link_visitors` including `navigator.userAgent` (lines 89-96); persists visitor session in `sessionStorage` (lines 37, 106).

### src/components/OnboardingWizard.tsx
- Type: source | LOC: 330
- Public surface: `export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps)` (line 21); props `{ open: boolean; onComplete: () => void }` (lines 14-17).
- Notes: supabase queries + `supabase.storage` avatar upload (lines 85-91); `supabase.auth.getUser()` (lines 49, 79, 107).

### src/components/DoubleSlashRedirect.tsx
- Type: source | LOC: 28
- Public surface: `export const DoubleSlashRedirect = ({ children }: { children: React.ReactNode })` (line 8).
- Notes: normalizes `//` in `window.location.pathname` via `window.location.replace` preserving search/hash (lines 14-23).

---

## Layout / navigation (proposed module: layout-navigation)

### src/components/AppSidebar.tsx
- Type: source | LOC: 231
- Public surface: `export function AppSidebar()` (line 52), no props.
- Notes: main staff sidebar; supabase queries (lines 69, 86), `supabase.auth.getUser()` (line 83), `supabase.auth.signOut()` (line 110).

### src/components/ClientPortalLayout.tsx
- Type: source | LOC: 209
- Public surface: `export const ClientPortalLayout = ({ children }: { children: React.ReactNode })` (line 194).
- Notes: client-portal chrome; `supabase.auth.getUser()` (line 50), profile query (line 53), `signOut` (line 82).

### src/components/ContractorPortalLayout.tsx
- Type: source | LOC: 211
- Public surface: default export `ContractorPortalLayout` (line 211).
- Notes: contractor-portal chrome; `supabase.auth.getUser()` (line 55), profile query (line 58), `signOut` (line 77).

### src/components/Breadcrumb.tsx
- Type: source | LOC: 58
- Public surface: `export const Breadcrumbs = ({ items, className }: BreadcrumbProps)` (line 23); props `{ items: BreadcrumbItem[]; className?: string }` (lines 11-14).
- Notes: filename singular, export plural (see Oddities).

### src/components/GlobalSearch.tsx
- Type: source | LOC: 337
- Public surface: `export const GlobalSearch = ()` (line 36), no props.
- Notes: CommandDialog-based search UI; data via `useGlobalSearch` / `useSearchFilterOptions` hooks (line 33); no direct supabase calls in this file.

---

## Floor plan / pin annotation (proposed module: floor-plan-annotation)

### src/components/InteractiveFloorPlan.tsx
- Type: source | LOC: 727
- Public surface: `export const InteractiveFloorPlan` (line 25); props `{ subsectionId: string; projectName: string; siteName: string; subsectionName: string }` (lines 18-23).
- Notes: largest file in slice. Two Supabase Realtime channels — pins channel (line 64) and floor-plan channel (line 97), removed at lines 115-116; floor plan + pins queries (lines 125, 140).

### src/components/FloorPlanViewer.tsx
- Type: source | LOC: 543
- Public surface: `export const FloorPlanViewer` (line 35); props `{ pdfUrl: string; pins: Pin[]; onAddPin: (x, y) => void; onPinClick: (pin) => void; addMode: 'snag' | 'observation' | null; onAddModeChange: (mode) => void; selectedPinId?: string | null; quickAddMode?: boolean }` (lines 24-33).
- Notes: react-pdf render; pdfjs worker from `https://unpkg.com/pdfjs-dist@…` CDN (line 12); window resize/keydown/keyup listeners (lines 73-104).

### src/components/FloorPlanPinModal.tsx
- Type: source | LOC: 548
- Public surface: `export const FloorPlanPinModal` (line 57); props `{ isOpen; onClose; onSave: (data: PinData, photo?: File) => Promise<void>; onSaveRectification?; onRemoveRectification?; onDelete?; onMove?; initialData?: PinData; pinNumber: number }` (lines 33-43).
- Notes: create/edit pin dialog incl. rectification callbacks.

### src/components/FloorPlanPinsList.tsx
- Type: source | LOC: 351
- Public surface: `export const FloorPlanPinsList` (line 48); props `{ pins: Pin[]; onPinClick; onQuickStatusChange?: (pinId, newStatus) => Promise<void>; onQuickDelete?; selectedPinId?: string | null }` (lines 33-39).

### src/components/FloorPlanMiniMap.tsx
- Type: source | LOC: 189
- Public surface: `export const FloorPlanMiniMap` (line 28); props `{ pdfUrl; pins; scale; panOffset: {x,y}; containerWidth; containerHeight; pageWidth; onNavigate: (x, y) => void; onClose }` (lines 16-26).
- Notes: react-pdf (line 2).

### src/components/FloorPlanStatsWidget.tsx
- Type: source | LOC: 408
- Public surface: `export const FloorPlanStatsWidget = ({ subsectionId }: FloorPlanStatsWidgetProps)` (line 44); props `{ subsectionId: string }` (lines 40-42).
- Notes: Supabase Realtime channel (line 52, removed line 71); floor plan + pins queries (lines 80, 94).

### src/components/BeforeAfterComparison.tsx
- Type: source | LOC: 325
- Public surface: `export const BeforeAfterComparison` (line 25); props `{ beforePhotoUrl?; afterPhotoUrl?; afterNotes?; rectifiedAt?; rectifiedBy?; onSaveAfterPhoto: (photoUrl, notes) => Promise<void>; onRemoveAfterPhoto?: () => Promise<void>; pinId?: string; readOnly?: boolean }` (lines 13-23).
- Notes: pin-rectification before/after photo UI; imports supabase client (line 11).

---

## Offline / PWA (proposed module: offline-pwa)

### src/components/OfflineIndicator.tsx
- Type: source | LOC: 47
- Public surface: `export function OfflineIndicator()` (line 6), no props.
- Notes: fixed-position badge from `useOfflineSync` (`isOnline`, `queueSize`, `isSyncing`, `processQueue`).

### src/components/InspectionOfflineBanner.tsx
- Type: source | LOC: 142
- Public surface: `export function InspectionOfflineBanner(props)` (line 18); props `{ isOnline: boolean; isCached: boolean; hasPendingChanges: boolean; lastSyncTime: Date | null; pendingImageCount?: number; onSyncNow?: () => void; isSyncing?: boolean }` (lines 8-16).

### src/components/OfflineImageGallery.tsx
- Type: source | LOC: 336
- Public surface: `export function OfflineImageGallery(props)` (line 28); props `{ onlineImages: string[]; offlineImages: OfflineImage[]; onAddImage: (file: File | Blob) => Promise<string | null>; onDeleteOfflineImage?: (imageId) => Promise<boolean>; onDeleteOnlineImage?: (imageUrl) => Promise<boolean>; isOnline: boolean; disabled?; maxImages?; title? }` (lines 16-26).

### src/components/OfflinePhotoGallery.tsx
- Type: source | LOC: 369
- Public surface: `export function OfflinePhotoGallery(props)` (line 43); props `{ contextType: OfflinePhotoContextType; contextId: string; secondaryContextId?; photoTypes?: OfflinePhotoType[]; allowCapture?; maxPhotos?; onPhotoLinked?: (photoId, remoteUrl) => void; title?; description? }` (lines 31-41).

### src/components/OfflineSubsectionEnhancements.tsx
- Type: source | LOC: 82
- Public surface: `export function OfflineSubsectionEnhancements(props)` (line 14) with props `{ isOnline: boolean; offlineDocumentCount?; offlineFloorPlanCount?; onSyncClick?; isSyncing? }` (lines 6-12); second export `export function OfflineDocumentBadge({ isOffline }: OfflineDocumentBadgeProps)` (line 73, props line 69-71).

### src/components/ServiceWorkerUpdater.tsx
- Type: source | LOC: 117
- Public surface: `export function ServiceWorkerUpdater()` (line 22), no props.
- Notes: guards on `"serviceWorker" in navigator` (line 28); `window.location.reload()` on controller change (line 33); registration/waiting-worker handling (lines 69-93); update poll every 60 s via `window.setInterval` (line 107).

---

## Reports / dashboards / compliance (proposed module: reports-dashboards)

### src/components/ComplianceDashboard.tsx
- Type: source | LOC: 361
- Public surface: `export const ComplianceDashboard` (line 83); props `{ siteId: string; clientId: string; subsections: Sub[]; inspections: Array<{ id; subsection_id: string | null; inspection_date; json_data: any }>; deliverablesSummary: SiteDeliverablesSummary }` (lines 33-39).
- Notes: supabase query (line 100); snapshot query cast `(supabase as any)` (line 109).

### src/components/ComprehensiveInspectionReport.tsx
- Type: source | LOC: 260
- Public surface: `export const ComprehensiveInspectionReport` (line 38); props `{ inspectionData: any; siteName: string; subsectionName: string; templateId?: string | null; subsectionId?: string; siteLogoUrl?: string | null; inspectionId?: string; clientName?: string; snags?: Snag[] }` (lines 26-36).
- Notes: fetches template (line 59) and fresh inspection (line 80) from supabase.

### src/components/SiteSummaryReport.tsx
- Type: source | LOC: 701
- Public surface: `export const SiteSummaryReport = ({ siteId, siteName, clientName, onSaved }: SiteSummaryReportProps)` (line 84); props lines 53-58.
- Notes: parallel supabase reads over sites/subsections/inspections/site_documents/subsection_documents (incl. COC columns)/site_assets/site_marking_checklist (lines 226-246); `qrcode` import (line 9).

### src/components/FortressMarkingChecklist.tsx
- Type: source | LOC: 431
- Public surface: `export const FortressMarkingChecklist = ({ siteId, siteName }: FortressMarkingChecklistProps)` (line 30); props `{ siteId: string; siteName?: string }` (lines 25-28).
- Notes: reads/upserts `site_marking_checklist` rows via supabase (lines 49, 100, 146, 186); `supabase.auth.getUser()` (lines 91, 138).

### src/components/SiteHealthBadge.tsx
- Type: source | LOC: 69
- Public surface: `export function SiteHealthBadge({ score, isLoading, size = "sm", className }: SiteHealthBadgeProps)` (line 26) plus `export default SiteHealthBadge` (line 69); props `{ score: SiteScore | undefined; isLoading?; size?: "sm" | "lg"; className? }` (lines 13-20).

### src/components/SiteHealthBadge.test.tsx
- Type: tests | LOC: 54
- Public surface: none (no exports; verified via grep on `^export`).
- Notes: vitest + @testing-library/react, `@vitest-environment jsdom` pragma (lines 1-3); 6 test cases covering band thresholds, snapshot vs live source, pending and loading placeholders, and 0% rendering.

### src/components/RecentAssignmentsWidget.tsx
- Type: source | LOC: 145
- Public surface: `export const RecentAssignmentsWidget = ()` (line 33), no props.
- Notes: supabase reads of assignment history, profiles, sites (lines 39, 52, 57).

### src/components/UserRLSPolicies.tsx
- Type: source | LOC: 586
- Public surface: `export const UserRLSPolicies = ({ userRole, userId }: UserRLSPoliciesProps)` (line 68); props `{ userRole: string; userId?: string }` (lines 47-50).
- Notes: admin RLS-policy management UI; supabase reads/deletes/inserts/updates (lines 89-172); `supabase.rpc('get_rls_policies_for_role', …)` (line 194).

---

## Templates / documents / PDF (proposed module: templates-documents)

### src/components/DocumentPreviewDialog.tsx
- Type: source | LOC: 660
- Public surface: `export function DocumentPreviewDialog(props)` (line 49); props `{ open: boolean; onOpenChange: (open) => void; fileUrl: string; fileName: string; downloadBlobData?: Blob; onSaveToDocuments?: () => Promise<void>; saveLocation?: 'site' | 'subsection'; contextName?: string; isSaving?: boolean; complianceChecks?: PDFComplianceCheck }` (lines 34-46).
- Notes: react-pdf (line 24); pdfjs worker from protocol-relative `//unpkg.com/pdfjs-dist@…` CDN (line 32); `supabase.storage` (line 115); `fetch(fileUrl)` for download (line 160); `window.open(fileUrl)` fallback (line 387).

### src/components/PDFTemplateUploader.tsx
- Type: source | LOC: 436
- Public surface: `export const PDFTemplateUploader: React.FC<PDFTemplateUploaderProps>` (line 33) plus `export default` (line 436); props `{ onTemplateExtracted?: (template: ExtractedTemplate) => void; onTemplateSaved?: () => void; className?: string }` (lines 17-21).
- Notes: extraction delegated to `extractTemplateFromPDF` / `generateTemplatePreviewPDF` from `@/lib/pdfTemplateExtractor` (line 14); saves template via supabase (line 119); `window.open(url)` preview (line 107); hard-coded `TEMPLATE_CATEGORIES` list (lines 23-31).

### src/components/PDFTemplateExportDialog.tsx
- Type: source | LOC: 315
- Public surface: `export const PDFTemplateExportDialog: React.FC<PDFTemplateExportDialogProps>` (line 32) plus `export default` (line 315); props `{ open: boolean; onOpenChange: (open) => void; template: TemplateData | null }` (lines 18-22).

### src/components/TemplateBuilder.tsx
- Type: source | LOC: 481
- Public surface: `export const TemplateBuilder = ({ templateId, initialData, onSave }: TemplateBuilderProps)` (line 72); props `{ templateId?: string; initialData?: { name; category; description; sections: TemplateSection[]; tenants?: Tenant[] }; onSave?: () => void }` (lines 40-50).
- Notes: supabase insert/update of templates (lines 186, 195).

### src/components/DynamicFieldManager.tsx
- Type: source | LOC: 475
- Public surface: `export const DynamicFieldManager` (line 29); props `{ inspectionId: string; sectionKey: string; initialFields?: DynamicField[]; onFieldsChange?: (fields: DynamicField[]) => void }` (lines 22-27).
- Notes: `supabase.storage` upload + publicUrl (lines 181-187); mobile detection via `navigator.userAgent` regex (line 230).

---

## Shared UI primitives / utilities (proposed module: ui-utility-primitives)

### src/components/CaptchaTurnstile.tsx
- Type: source | LOC: 107
- Public surface: `export const CAPTCHA_ENABLED = Boolean(SITE_KEY)` (line 21, from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`); `export interface CaptchaTurnstileHandle { reset: () => void }` (lines 36-39); `export const CaptchaTurnstile = forwardRef<CaptchaTurnstileHandle, Props>` (line 45) with props `{ onTokenChange: (token: string | null) => void }` (lines 41-43).
- Notes: injects external script `https://challenges.cloudflare.com/turnstile/v0/api.js` (line 23); manipulates `window.turnstile` widget API (lines 57-97).

### src/components/ErrorBoundary.tsx
- Type: source | LOC: 96
- Public surface: `export class ErrorBoundary extends Component<Props, State>` (line 17).
- Notes: recovery actions `window.location.reload()` (line 38) and `window.history.back()` (line 72).

### src/components/EmptyState.tsx
- Type: source | LOC: 35
- Public surface: `export function EmptyState(props)` (line 12); props `{ icon: LucideIcon; title: string; description: string; actionLabel?: string; onAction?: () => void }` (lines 4-10).

### src/components/LoadingState.tsx
- Type: source | LOC: 52
- Public surface: `export function LoadingState(props)` (line 12); props `{ variant?: 'spinner' | 'skeleton' | 'full-page'; message?: string; skeletonCount?: number; className?: string }` (lines 5-10).

### src/components/ListPagination.tsx
- Type: source | LOC: 89
- Public surface: `export function ListPagination({ page, pageCount, onPageChange, disabled, className }: ListPaginationProps)` (line 26); props lines 17-24.

### src/components/RobustImage.tsx
- Type: source | LOC: 135
- Public surface: `export const RobustImage` (line 19); props `{ src: string; alt: string; className?; onError?: () => void; onClick?: () => void; retryCount?: number }` (lines 6-13).

### src/components/FullscreenImageViewer.tsx
- Type: source | LOC: 230
- Public surface: `export const FullscreenImageViewer = ({ src, alt = "Full size view", onClose }: FullscreenImageViewerProps)` (line 13); props `{ src: string | null; alt?: string; onClose: () => void }` (lines 7-11).
- Notes: global `keydown` listener (lines 130-131).

### src/components/LabeledQRCode.tsx
- Type: source | LOC: 207
- Public surface: `export const LabeledQRCode` (line 15); props `{ url: string; siteName: string; subsectionName: string; logoUrl?: string; onGenerated?: (dataUrl: string) => void }` (lines 7-13).
- Notes: `qrcode` library (line 2).

---

## Runtime observations

- SessionWatcher.tsx:126 and :136 — client-side schedulers (`setInterval`); 60 s cadence (`CHECK_INTERVAL_MS`, SessionWatcher.tsx:9) driving daily auto-logout: `clearAllCaches()` (line 54), `recordAuthEvent("logout", { reason: "session_expired" })` (line 57), `supabase.auth.signOut()` (line 60).
- ServiceWorkerUpdater.tsx:77-93 — `navigator.serviceWorker` registration/waiting handling; ServiceWorkerUpdater.tsx:107 — 60 s update-check interval; ServiceWorkerUpdater.tsx:33 — `window.location.reload()` after controller change.
- InteractiveFloorPlan.tsx:64 and :97 — Supabase Realtime channels (pins + floor plan), removed at lines 115-116.
- FloorPlanStatsWidget.tsx:52 — Supabase Realtime channel, removed at line 71.
- CaptchaTurnstile.tsx:23 — external script load from `challenges.cloudflare.com` (Cloudflare Turnstile).
- DocumentPreviewDialog.tsx:32 and FloorPlanViewer.tsx:12 — pdfjs worker fetched at runtime from unpkg.com CDN.
- VisitorRegistrationGate.tsx:89-96 — insert into `access_link_visitors` incl. `navigator.userAgent`.
- UserRLSPolicies.tsx:194 — `supabase.rpc('get_rls_policies_for_role', …)`.
- Direct supabase table access from many components: AppSidebar.tsx:69,86; FortressMarkingChecklist.tsx:49,100,146,186; SiteSummaryReport.tsx:226-246; RecentAssignmentsWidget.tsx:39-57; ComplianceDashboard.tsx:100,109; ComprehensiveInspectionReport.tsx:59,80; TemplateBuilder.tsx:186,195; OnboardingWizard.tsx:38-107; SessionWatcher.tsx:27.
- Supabase Storage writes: DynamicFieldManager.tsx:181-187; OnboardingWizard.tsx:85-91; storage read in DocumentPreviewDialog.tsx:115.
- Auth entry/exit surfaces: `supabase.auth.signOut()` in AppSidebar.tsx:110, ClientPortalLayout.tsx:82, ContractorPortalLayout.tsx:77, SessionWatcher.tsx:60.

## Oddities

- Untracked duplicate on disk: `src/components/CaptchaTurnstile 2.tsx` exists (visible in `ls src/components` and git status) but is not in `git ls-files`, alongside many other `"* 2.*"` untracked duplicates across the repo (git status).
- Breadcrumb.tsx (singular filename) exports `Breadcrumbs` (plural), line 23.
- SiteHealthBadge.test.tsx is the only test file among the 48 root-level component files.
- Dual export style (named + default) in three files: PDFTemplateExportDialog.tsx (32, 315), PDFTemplateUploader.tsx (33, 436), SiteHealthBadge.tsx (26, 69); most guards are default-only, most components named-only.
- ComplianceDashboard.tsx:109 uses `(supabase as any)` cast for a snapshots query.
- pdfjs worker CDN URL differs in scheme between files: protocol-relative `//unpkg.com/…` (DocumentPreviewDialog.tsx:32) vs `https://unpkg.com/…` (FloorPlanViewer.tsx:12).
- ComprehensiveInspectionReport.tsx props include `inspectionData: any` (line 27); ComplianceDashboard.tsx inspections prop includes `json_data: any` (line 37).

## ASSUMED

- Module groupings are inferred from names, props, and imports — not from a verified route/usage map. Actual mount points of guards/layouts (which app routes render them) were not traced in this slice.
- `useOfflineSync`, `useGlobalSearch`, `useUnresolvedOrphans`, `useUserRole`, `useOnboardingStatus` are assumed to encapsulate the actual data access for their components; the hooks themselves live outside this slice and were not opened.
- Public-surface extraction relied on `grep -n '^export'` per file plus targeted reads; non-exported internal helpers are intentionally not enumerated, and export lists are assumed complete on that basis (top-level `export` at column 0 is the repo convention observed in all opened files).
- "48 root-level shared components" treats the one `.test.tsx` file as part of the count; the task brief's "~48" matches exactly at 48.
