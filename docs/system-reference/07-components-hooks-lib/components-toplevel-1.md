# 07 · Top-level components (part 1 of 2)

**Scope:** Per-symbol ground-truth docs for the FIRST HALF of `src/components/*.tsx` (top-level, maxdepth 1), sorted A→Z, items 1–30: `AppSidebar` → `InspectionSignatures`. **Files covered: 30.** Part 2 covers `InteractiveFloorPlan` → `VisitorRegistrationGate`.

Conventions: each entry cites `file:line` for the key export. Cross-refs to earlier chapters (02-data-model, 03-auth-and-access, 04-routes, 05-edge-functions, 06-flows, GAPS.md) are cited, not re-derived. NOTES flag dead exports / dup logic / client-side security-relevant writes — the heavy security findings live in GAPS.md / SECURITY-FINDINGS.

---

## 1. AppSidebar.tsx
`AppSidebar()` — [AppSidebar.tsx:58](../../../src/components/AppSidebar.tsx#L58)

Admin/staff app shell sidebar (logo, role-filtered nav, user profile, logout).

- **Props:** none.
- **State/hooks:** `useSidebar()` (collapse/mobile state); `useNavigate`; `useUserRole()` (hooks); two `useQuery`s — `["company-settings"]` selects `settings.company_logo_url, company_name` via `.single()`; `["current-user-profile"]` selects `profiles.full_name, avatar_url, email` for `auth.getUser()` id.
- **Key consts:** `menuItems` (:45) — static array; `adminOnly` items (`/offline-sync-test`, `/feedback-management`, `/settings`) filtered out unless `userRole === 'Admin'` (:156).
- **Effects/handlers:** `handleNavClick` closes mobile drawer; `handleLogout` (:112) calls `recordAuthEvent("logout")` **before** `supabase.auth.signOut()` (comment: JWT invalidated after signOut so user_id can't be inferred), toasts, navigates `/auth/login`; `getInitials` derives avatar fallback.
- **Renders:** `Sidebar` with header (logo or `Zap` + company name), nav menu, footer (profile card + My Profile + Logout).
- **Callers:** `src/app/(admin)/layout.tsx`, `src/views/DevelopmentSkills.tsx`.
- **NOTES:** company name fallback is `"SiteWise"` (:144) — stale brand vs "WM Compliance". `settings` SELECT relies on permissive RLS (see GAPS G-SEC-13).

## 2. AuthOnlyRoute.tsx
`AuthOnlyRoute({ children })` — default export, [AuthOnlyRoute.tsx:5](../../../src/components/AuthOnlyRoute.tsx#L5)

Minimal auth gate: session required, **no role check**.

- **Props:** `children: ReactNode`.
- **Behavior:** `useAuthSession()` → loading: `<AuthLoading variant="spinner"/>`; no session: `<Navigate to="/auth/login" replace/>`; else renders children. (vs `ProtectedRoute`/`ClientProtectedRoute` which add role + onboarding.) See 03-auth-and-access.
- **Callers:** grep returned none under `src` other than the auth-helper imports it pulls in; used via route layouts — verify in 04-routes. ⚠️ UNVERIFIED caller list (no direct JSX usage found by name grep).

## 3. BeforeAfterComparison.tsx
`BeforeAfterComparison(props)` — [BeforeAfterComparison.tsx:25](../../../src/components/BeforeAfterComparison.tsx#L25)

Side-by-side before/after rectification-photo capture + notes for a floor-plan pin.

| Prop | Type | Meaning |
|---|---|---|
| beforePhotoUrl | string? | original snag photo |
| afterPhotoUrl | string? | saved rectification photo |
| afterNotes | string | rectification notes (default "") |
| rectifiedAt / rectifiedBy | string? | audit display |
| onSaveAfterPhoto | (url, notes)=>Promise | persist callback |
| onRemoveAfterPhoto | ()=>Promise? | remove callback |
| pinId | string? | used in storage path |
| readOnly | boolean | hide capture controls |

- **State:** `isExpanded`, `isUploading`, `notes`, `previewUrl`, `pendingFile`.
- **Hooks:** `useCamera()` (`takePicture`), `useImageUpload()` (`uploadImage`, `uploading`).
- **Data write:** `handleSave` (:65) uploads to **`floor-plan-photos`** bucket at `rectification/${pinId||Date.now()}_${Date.now()}.jpg` via `uploadImage`, then calls `onSaveAfterPhoto(url, notes)`.
- **Renders:** grid before/after; capture+upload buttons; notes textarea; expand `Dialog`. Uses `RobustImage`.
- **Callers:** `FloorPlanPinModal`.
- **NOTES:** imports `supabase` but never uses it directly (dead import). Client-side storage upload to a public bucket (see GAPS G-SEC-14).

## 4. Breadcrumb.tsx
`Breadcrumbs({ items, className })` — [Breadcrumb.tsx:23](../../../src/components/Breadcrumb.tsx#L23)  *(note: file is `Breadcrumb.tsx`, export is plural `Breadcrumbs`)*

Breadcrumb nav, always prefixed with a Home→`/dashboard` link.

- **Props:** `items: BreadcrumbItem[]` (`{label, href?, icon?: "home"|"client"|"site"|"subsection"}`), `className?`.
- **Const:** `iconMap` maps icon keys → lucide icons (:16).
- **Renders:** `<nav>` of `Link` (when `href`) or plain `<span>` (current page) with chevron separators, truncation.
- **Callers (8+):** `Sites`, `SiteDetail`, `SubsectionDetail`, `ClientDetail`, `InspectionDetail`, `ClientPortalSiteDetail`, `ContractorSubsectionDetail`, `DevelopmentSkills`.

## 5. COCPreviewApproval.tsx
`COCPreviewApproval(props)` — [COCPreviewApproval.tsx:223](../../../src/components/COCPreviewApproval.tsx#L223). Also exports nothing else (large 2209-line single component). Internal type `ExtractedData` (:31) and `FIELD_DISPLAY_NAMES` const (:21) are file-local (not exported).

Split-pane COC review: react-pdf preview (left) + editable ECA-format COC form (right) with AI re-extraction.

| Prop | Type | Meaning |
|---|---|---|
| extractedData | ExtractedData\|null | AI-extracted COC fields |
| documentName / documentUrl | string | source PDF |
| onApprove | (data)=>void | approve+verify callback |
| onReject | ()=>void | reject |
| isProcessing | boolean? | disables actions |
| onExtract | ()=>void? | trigger initial AI extraction |
| onDataUpdate | (data)=>void? | (declared, lightly used) |

- **State:** `editedData` (seeded + normalized from `extractedData`); PDF viewer state (`numPages`, `pageNumber`, `scale`, `pan`, `isDragging`, `pdfLoadError`); `retryingFields[]`, `isRetryingAll`.
- **Effects:** sync `editedData` on `extractedData` change while **preserving user-selected `cocType`** (:274 — explicitly avoids AI overwriting manual selection).
- **Helpers/logic:** `normalizeCocType` (:234) maps free-text type → `Initial|Supplementary|Temporary|Not Marked`; `getMissingFields`/`validateCompleteness` (:304,:563) — required: cocNumber, cocType, issueDate, physicalAddress, registeredPerson, registrationNumber; conditional: `initialCertificateNo` (Supp/Temp), `expiryDate` (Temp).
- **Data calls:** `handleRetryField`, `handleRetryAllMissing`, `handleForceReExtractAll` all `supabase.functions.invoke('extract-coc', …)` with `retryFields` / `forceReextract` (note lowercase `e`, :413). See 05-edge-functions/extract-coc + 06-flows COC validation.
- **Renders:** `pdfjs` worker from unpkg CDN (:16); react-pdf `Document`/`Page` with manual zoom/pan/wheel; large form (Certificate Details, Installation Identification, Registered Person, Test Report, Installation Details). Per-field `renderRetryButton` shows "Re-extract" when empty.
- **Callers:** `ComplianceDashboard`, `views/subsection-detail/SubsectionDialogs.tsx`.
- **NOTES:** pdf.worker pinned to `//unpkg.com/pdfjs-dist@${version}` (external CDN dependency — repeated across COC*/Document/FloorPlan components). `onDataUpdate` prop accepted but barely wired.

## 6. COCPreviewDialog.tsx
`COCPreviewDialog({ open, onClose, document, validation })` — [COCPreviewDialog.tsx:62](../../../src/components/COCPreviewDialog.tsx#L62). File-local helpers: `extractPageFromSection` (:40), `normalizeClauseId` (:47), const `defaultClausePages` (:53) — not exported.

Two-panel COC viewer: PDF/image left + SANS 10142-1 violations list right, click-a-clause-to-navigate.

| Prop | Type | Meaning |
|---|---|---|
| open / onClose | boolean / ()=>void | dialog control |
| document | `{id,file_name,file_url,uploaded_at}`\|null | the COC file |
| validation | `{status, violations[], report_data?}`\|null | verification result |

- **State:** `numPages`, `pageNumber`, `scale`, `highlightedClause`, `highlightedSection`, `isPanning`+pan/scroll refs, `showPageIndicator`.
- **Key logic:** `getClauseLocation` (:110) — large map of SANS clause IDs + deterministic check IDs (`EARTH-001`, `RCD-001`, `COC-TYPE-001`, …) → human "Section/Item" label + page number; `handleClauseClick` (:168) navigates to target page (section-string page > default map > 1) and flashes a banner.
- **Behavior:** download via `fetch`→blob anchor (fallback `window.open`); wheel zoom (Ctrl/Cmd), drag-pan via scroll container; `customTextRenderer` returns raw text (no keyword highlight — comment "unreliable").
- **Renders:** PDF (react-pdf) / image / unsupported fallback; right panel: Pass state, violations cards (clause badge, risk, description, reason, clickable location, action, evidence), extracted-data summary, legend.
- **Callers:** `ComplianceDashboard`, `views/subsection-detail/SubsectionDialogs.tsx`.
- **NOTES:** clause→location map duplicates location semantics also referenced in COC flow docs (06-flows). Read-only viewer (no writes).

## 7. COCReviewStatus.tsx
`COCReviewStatus(props)` — [COCReviewStatus.tsx:63](../../../src/components/COCReviewStatus.tsx#L63)

Summary card of a COC's extraction + validation status with re-extract/re-validate actions.

| Prop | Type | Meaning |
|---|---|---|
| documentId / documentName | string | the COC |
| extraction | `{id, extracted_data, confidence?, extraction_method?, extracted_at, extracted_by?}`\|null | extraction record |
| validation | `{id,status,validated_at,violations?,report_data?}`\|null | validation record |
| onViewFullReport / onReExtract / onReValidate / onEditExtraction | ()=>void | action callbacks |
| onViewHistory | ()=>void? | optional history |
| isReExtracting / isReValidating | boolean? | spinners |

- **Behavior:** pure presentational. Two states: "Not Yet Extracted" empty card, or summary (extracted fields grid, violations preview slice(0,3), metadata dates via `date-fns format`, action buttons).
- **Callers:** **none found** (grep returned no importers).
- **NOTES:** ⚠️ **Dead/unused export** — no callers in `src`. Candidate for removal.

## 8. CaptchaTurnstile.tsx
`CaptchaTurnstile` (forwardRef) — [CaptchaTurnstile.tsx:45](../../../src/components/CaptchaTurnstile.tsx#L45); also exports `const CAPTCHA_ENABLED` (:21) and type `CaptchaTurnstileHandle` (:36).

Cloudflare Turnstile widget wrapper. `"use client"`.

- **Props:** `{ onTokenChange: (token|null)=>void }`; ref handle exposes `reset()`.
- **`CAPTCHA_ENABLED`** = `Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)` — when unset the component **renders null and consumers proceed with no captcha** (silent degrade).
- **Effects:** loads Turnstile script once, renders widget, wires `callback`/`expired-callback`, cleanup `remove`. `useImperativeHandle` exposes `reset` (single-use token must be reset after a failed submit).
- **Callers + `CAPTCHA_ENABLED`:** `views/auth/Login.tsx`, `views/auth/ForgotPassword.tsx`.
- **NOTES:** **Security-relevant** — silent no-captcha fallback is GAPS **G-SEC-02**; the header comment itself notes Supabase project-level captcha enforcement is the real gate (client is defense-in-depth only).

## 9. ClientPortalLayout.tsx
`ClientPortalLayout({ children })` — [ClientPortalLayout.tsx:194](../../../src/components/ClientPortalLayout.tsx#L194). Internal `ClientSidebar()` (:25) is file-local.

Client-portal shell (sidebar + sticky header). Supports admin **preview** mode via `?preview=<clientId>`.

- **`ClientSidebar`** state/hooks: `useSidebar`, `useSearchParams` (reads `preview`), `useClientInfo(previewClientId)`, `useUserRole`, `useQuery(["current-user-profile"])` selecting `profiles.full_name,avatar_url,email`.
- **menuItems** (:41) computed with preview query-param appended: Dashboard, Sites, Calendar under `/client-portal`.
- **`handleLogout` (:73):** if `Admin && previewClientId` → navigate `/portal-management` ("Exited preview"); else `recordAuthEvent("logout")` + `signOut()` + navigate login.
- **Renders:** logo from `clientInfo.clients.logo_url`, company name fallback "Client Portal"; `SidebarProvider defaultOpen={false}`.
- **Callers:** `src/app/(client-portal)/layout.tsx`.
- **NOTES:** preview mode lets an Admin view another tenant's portal (intended); client scoping is client-side (`useClientInfo`) — tenant isolation gap is GAPS G-SEC-13.

## 10. ClientProtectedRoute.tsx
`ClientProtectedRoute({ children })` — default export, [ClientProtectedRoute.tsx:8](../../../src/components/ClientProtectedRoute.tsx#L8)

Route guard for the Client portal.

- **Hooks:** `useAuthSession`, `useUserRole`, `useSearchParams` (`preview`), `useOnboardingStatus(!!session)`.
- **Gate order:** loading → `AuthLoading variant="skeleton"`; no session → `/auth/login`; `Admin && preview` → render children (admin preview bypass, :19); `role !== 'Client'` → `/dashboard`; else wrap children in `OnboardingGate`.
- **Callers:** `src/app/(client-portal)/layout.tsx`.
- **NOTES:** see 03-auth-and-access for the 5 access contexts. Admin-preview branch grants access without role match (by design).

## 11. ComplianceDashboard.tsx
`ComplianceDashboard({ siteId, subsections, inspections })` — [ComplianceDashboard.tsx:140](../../../src/components/ComplianceDashboard.tsx#L140). File-local helper `hasOpenInspectionItems` (:51) + several local types (`CategoryScore`, `TrendDataPoint`, `ValidationRecord`) — not exported.

Site-level compliance analytics + COC validation log + inline re-extract/re-validate.

| Prop | Type | Meaning |
|---|---|---|
| siteId | string | site scope |
| subsections | array | `{id,name,category,coc_status,metering_status,is_compliant,is_coc_required}` |
| inspections | array | `{id,subsection_id,inspection_date,json_data}` |

- **State:** `trendData`, `snagCounts`, `loading`, `failedValidationsBySubsection` (Set), `failedValidations`, `allValidations`, preview-doc/validation/open, and "review COC" state (`reviewingDocId`, `cocPreviewData`, `showCocPreview`, `pendingReviewDoc`).
- **Helpers/lib:** imports `fetchFailedValidationsBySubsection`, `calculateCocComplianceStats`, `hasValidCocStatus`, `VALID_COC_STATUSES` from `@/lib/complianceCalculations`. `hasOpenInspectionItems` walks the nested `jsonData[section][item].status` map (mirrors InspectionDetail's write shape) returning true if any item ≠ Pass/N/A.
- **Data calls (writes — security-relevant):**
  - `extract-coc` invoke (:290) and `validate-coc` invoke (:367) — edge functions (see 05/06).
  - `supabase.from('subsections').update(...)` (:355) — writes COC status back to subsection.
  - `supabase.from('subsection_documents').update(...)` (:364, :389) — writes doc `coc_status`.
- **Renders:** recharts `LineChart` (trend) + `PieChart`; category cards; `COCValidationLogCard`; `COCPreviewDialog` + `COCPreviewApproval` dialogs.
- **Callers:** `views/SiteDetail.tsx`, `components/site/GenerateFinalReportButton.tsx`.
- **NOTES:** client-side writes to `subsections` / `subsection_documents` rely on permissive RLS (GAPS G-SEC-13). COC stats logic shared with lib `complianceCalculations` (documented in lib chapter).

## 12. ComprehensiveInspectionReport.tsx
`ComprehensiveInspectionReport(props)` — [ComprehensiveInspectionReport.tsx:60](../../../src/components/ComprehensiveInspectionReport.tsx#L60). Also exports types `GenerateReportOptions` (:19) and `GenerateReportResult` (:29) for external use.

"Preview Report" button → fetches template + signatures + inspection JSON, renders WYSIWYG `InspectionReportPreview`, can save generated doc.

| Prop | Type | Meaning |
|---|---|---|
| inspectionData | any | inspection row / json |
| siteName / subsectionName | string | report header |
| templateId | string\|null? | inspection template |
| subsectionId / inspectionId | string? | identifiers |
| siteLogoUrl | string\|null? | branding |
| clientName | string? | header |
| snags | Snag[] | findings (default []) |

- **State:** `previewOpen`, `reportData: InspectionReportData|null`, `isLoading`.
- **`handlePreviewReport` (:75):** fetches `inspection_templates` by id (`.maybeSingle()`); aborts with toast if no template; fetches `inspection_signatures` for inspection id; resolves `jsonData` from props or fresh `inspections` fetch when empty.
- **Data writes:** `.insert(...)` (:287) and `supabase.from('subsection_documents').insert(...)` (:299) — persists the generated report document.
- **Renders:** `Button` (Eye) + `Dialog` wrapping `InspectionReportPreview`. Uses `downloadBlob` from `@/lib/fileDownload`.
- **Callers:** `views/InspectionDetail.tsx`, `views/subsection-detail/InspectionsTab.tsx`, `ComplianceDashboard`.
- **NOTES:** client-side `subsection_documents` INSERT (RLS-dependent, GAPS G-SEC-13/14). Report-generation flow detailed in 06-flows (PDF generation).

## 13. ContractorPortalLayout.tsx
`ContractorPortalLayout({ children })` — default export, [ContractorPortalLayout.tsx:181](../../../src/components/ContractorPortalLayout.tsx#L181). Internal `ContractorSidebar` (:32) file-local.

Contractor-portal shell. Supports admin preview via `?preview=<siteId>`.

- **menuItems (:28):** single "Site Overview" → `/contractor` (preview param appended).
- **Sidebar hooks:** `useSidebar`, `useSearchParams`, `useUserRole`, `useQuery(["current-user-profile"])` selecting full `profiles.*`.
- **`handleLogout` (:68):** `Admin && previewSiteId` → exit to `/portal-management`; else `recordAuthEvent("logout")` + `signOut()` + login.
- **Layout body:** shows blue admin-preview `Alert` when `Admin && previewSiteId` (:196).
- **Callers:** `views/ContractorPortal.tsx`, `ContractorDashboard`, `ContractorSites`, `ContractorSiteDetail`, `ContractorSubsectionDetail`.
- **NOTES:** profile query selects `*` (over-fetch). Tenant scoping client-side.

## 14. ContractorProtectedRoute.tsx
`ContractorProtectedRoute({ children })` — default export, [ContractorProtectedRoute.tsx:9](../../../src/components/ContractorProtectedRoute.tsx#L9)

Route guard for Contractor portal; also mounts the orphan-resolution gate.

- **Gate order:** loading → skeleton; no session → login; `Admin && preview` → children; `role !== 'Contractor'` → `/dashboard`; path not under `/contractor` → redirect `/contractor` (:21); else `OnboardingGate` wrapping `<OrphanResolutionModal/>` + children.
- **`OrphanResolutionModal` (:28):** "Stage 4b force-at-login" — blocks app until orphan inspections owned by user are resolved; server-side guards in `resolve_my_orphan`/`archive_my_orphan` RPCs (see 02-data-model RPCs).
- **Callers:** `src/app/(contractor)/layout.tsx`.

## 15. DocumentPreviewDialog.tsx
`DocumentPreviewDialog(props)` — [DocumentPreviewDialog.tsx:49](../../../src/components/DocumentPreviewDialog.tsx#L49)

Universal in-app document viewer (PDF / image / DOCX) with zoom/rotate/pan, optional compliance panel + save-to-documents.

| Prop | Type | Meaning |
|---|---|---|
| open / onOpenChange | dialog control | |
| fileUrl / fileName | string | source doc |
| downloadBlobData | Blob? | preferred download source |
| onSaveToDocuments | ()=>Promise? | save callback |
| saveLocation | 'site'\|'subsection'? | save target label |
| contextName | string? | site/subsection name |
| isSaving | boolean? | spinner |
| complianceChecks | PDFComplianceCheck? | standards checks (from `@/lib/pdfEngine`) |

- **State:** scale, rotation, numPages/currentPage, drag position, fullscreen, compliance-panel toggle, DOCX load state, **PDF blob state** (`pdfBlobUrl`, `pdfBlobData`, `pdfLoading`).
- **Effects:** for Supabase-storage PDFs, downloads via `supabase.storage.from(bucket).download(path)` to a blob URL (:103) — avoids CORS/encoding issues (regex parses `/storage/v1/object/(public|sign|authenticated)/bucket/path`). DOCX rendered with `docx-preview renderAsync` (:156). Reset on open.
- **Renders:** `react-pdf` PDF, `<img>`, DOCX WYSIWYG container with injected `<style>`; header toolbar (zoom/rotate/fullscreen/download/save), compliance side-panel (`getComplianceCheckLabel`), pagination.
- **Callers:** `SiteDrawingReport`, `TemplateBasedReport`, `FortressMarkingChecklist`, `InteractiveFloorPlan`, `SiteSummaryReport`.
- **NOTES:** in-app viewer (matches MEMORY note "esite in-app viewers" — never new tabs). pdf.worker via unpkg CDN.

## 16. DoubleSlashRedirect.tsx
`DoubleSlashRedirect({ children })` — [DoubleSlashRedirect.tsx:8](../../../src/components/DoubleSlashRedirect.tsx#L8)

Cleans malformed `//` URLs (from legacy QR codes) by collapsing slashes and `window.location.replace`ing.

- **Effect (on `location.pathname`):** if `window.location.pathname` contains `//`, collapse `\/+/g`→`/` and replace URL (preserving search+hash). `console.log`s the redirect.
- **Callers:** **none found** by name grep. ⚠️ UNVERIFIED — likely mounted high in an app provider/layout; confirm in app shell.
- **NOTES:** ties to QR redirect flow (05-edge-functions/qr-redirect, 06-flows QR).

## 17. DynamicFieldManager.tsx
`DynamicFieldManager(props)` — [DynamicFieldManager.tsx:29](../../../src/components/DynamicFieldManager.tsx#L29)

Add/edit/delete custom inspection fields (text/textarea/number/image) with photo upload.

| Prop | Type | Meaning |
|---|---|---|
| inspectionId | string | storage path scope |
| sectionKey | string | storage path scope |
| initialFields | DynamicField[]? | seed (default []) |
| onFieldsChange | (fields)=>void? | parent sync |

- **State:** `fields`, new-field dialog (`newFieldOpen`, `newFieldLabel`, `newFieldType`), `uploadingImages: Set`.
- **Hooks:** `useCamera()` (`isNative`, `selectImages`).
- **Helpers:** `compressImageForUpload` (:85) — Canvas resize to ≤800px @ 0.7 jpeg; HEIC/HEIF→JPEG via dynamic `heic2any` import (:157).
- **Data write:** `handleImageUpload` (:145) uploads to **`inspection-photos`** bucket at `${inspectionId}/${sectionKey}/${Date.now()}-name.jpg`, then `getPublicUrl`. Native vs web capture branches (`handleTakePhoto`/`handleAddPhotos`).
- **Renders:** Add-Field dialog; per-field card (input/textarea/number/image grid with hidden camera + gallery `<input>`s).
- **Callers:** none found by name grep (used inside inspection detail subtree — ⚠️ UNVERIFIED exact caller).
- **NOTES:** client-side upload to public `inspection-photos` bucket (GAPS G-SEC-14). Image-compression logic duplicated across several components (also DynamicField, compress-image edge fn).

## 18. EmptyState.tsx
`EmptyState({ icon, title, description, actionLabel?, onAction? })` — [EmptyState.tsx:12](../../../src/components/EmptyState.tsx#L12)

Trivial presentational empty-state placeholder (dashed card, icon, optional action button). Props: `icon: LucideIcon`, `title`, `description`, optional `actionLabel`+`onAction`. No state. Callers: various views (generic). 

## 19. ErrorBoundary.tsx
`ErrorBoundary` (class) — [ErrorBoundary.tsx:17](../../../src/components/ErrorBoundary.tsx#L17)

React class error boundary.

- **Props:** `children`, `fallbackMessage?`.
- **State:** `hasError`, `error`, `errorInfo`.
- **Lifecycle:** `getDerivedStateFromError` flips `hasError`; `componentDidCatch` `console.error`s + stores info; `handleReset` clears + `window.location.reload()`.
- **Renders fallback:** Card with message, error `toString()`, Reload/Go Back buttons, dev-only `componentStack` details (`process.env.NODE_ENV === 'development'`).
- **Callers:** app providers/shell (generic). 

## 20. FloorPlanMiniMap.tsx
`FloorPlanMiniMap(props)` — [FloorPlanMiniMap.tsx:28](../../../src/components/FloorPlanMiniMap.tsx#L28)

200px overview mini-map of a floor-plan PDF with pin dots + viewport indicator; click to navigate.

| Prop | Type | Meaning |
|---|---|---|
| pdfUrl | string | thumbnail source |
| pins | Pin[] | `{id,pin_number,x_position,y_position,pin_type,status,priority?}` |
| scale / panOffset | number / {x,y} | viewer transform |
| containerWidth/Height, pageWidth | number | viewport math |
| onNavigate | (x,y)=>void | pan callback |
| onClose | ()=>void | close mini-map |

- **Logic:** `getViewportRect` (:50) computes visible-region rectangle as % of page (assumes A4 1.414 ratio); `handleMiniMapClick` (:77) converts click% → target pan offset (centers viewport); `getPinColor` by status/priority/type.
- **Renders:** react-pdf single-page thumbnail, absolute pin dots, pulsing viewport rect, zoom% footer.
- **Callers:** `FloorPlanViewer`.

## 21. FloorPlanPinModal.tsx
`FloorPlanPinModal(props)` — [FloorPlanPinModal.tsx:57](../../../src/components/FloorPlanPinModal.tsx#L57). File-local const `CONTRACTORS` (:45), type `PinData` (:14).

Two-step (type → details) create/edit modal for a floor-plan snag/observation pin, with photo + before/after rectification.

| Prop | Type | Meaning |
|---|---|---|
| isOpen / onClose | dialog control | |
| onSave | (data:PinData, photo?:File)=>Promise | persist pin |
| onSaveRectification | (pinId,url,notes)=>Promise? | save after-photo |
| onRemoveRectification | (pinId)=>Promise? | remove after-photo |
| onDelete | ()=>Promise? | delete pin |
| onMove | ()=>void? | re-position |
| initialData | PinData? | edit seed |
| pinNumber | number | display |

- **State:** `step` ('type'\|'details'), `formData: PinData`, `photoFile`, `photoPreview`, `isSaving`.
- **Hooks:** `useCamera()`, `useUserRole()` → `isAdmin`.
- **Effects:** seed `formData`/`step`/`photoPreview` from `initialData` on open.
- **Behavior:** type select → details form (title, notes, priority, status, assigned_contractor from `CONTRACTORS`, due_date, etc.); `handleSave` calls `onSave(formData, photoFile)` (no direct DB write — parent persists). Embeds `BeforeAfterComparison` wired to `onSaveRectification`.
- **Callers:** `InteractiveFloorPlan`.
- **NOTES:** persistence delegated to parent (`InteractiveFloorPlan`) — no Supabase call here.

## 22. FloorPlanPinsList.tsx
`FloorPlanPinsList(props)` — [FloorPlanPinsList.tsx:48](../../../src/components/FloorPlanPinsList.tsx#L48). File-local const `STATUS_OPTIONS` (:41).

Filterable list of floor-plan pins; desktop Card / mobile bottom-Sheet, with quick status toggle + delete.

| Prop | Type | Meaning |
|---|---|---|
| pins | Pin[] | items |
| onPinClick | (pin)=>void | open pin |
| onQuickStatusChange | (pinId,status)=>Promise? | inline status change |
| onQuickDelete | (pin)=>void? | inline delete |
| selectedPinId | string\|null? | highlight |

- **State:** `updatingPinId`, `showFilters`, `statusFilter`/`priorityFilter`/`typeFilter`, `isBottomSheetOpen`.
- **Hooks:** `useIsMobile()`; uses `PinFilters` (`@/components/floor-plan/PinFilters`).
- **Logic:** `filteredPins` (useMemo); status/priority icon+color maps; quick-status handler stops propagation + spins `updatingPinId`.
- **Renders:** stats badges (open/in-progress/done counts), filter panel, sorted pin rows with quick-status button strip; mobile FAB + Sheet.
- **Callers:** `InteractiveFloorPlan`.

## 23. FloorPlanStatsWidget.tsx
`FloorPlanStatsWidget({ subsectionId })` — [FloorPlanStatsWidget.tsx:44](../../../src/components/FloorPlanStatsWidget.tsx#L44)

Live floor-plan analytics: totals, status/priority breakdown, overdue-by-contractor, recent activity.

- **Props:** `subsectionId: string`.
- **State:** `stats: FloorPlanStats|null`, `isLoading`.
- **Effect:** `loadStats()` + **Realtime subscription** to `floor_plan_pins` (channel `floor-plan-stats-changes`, all events) → reloads on change; cleanup `removeChannel`.
- **`loadStats` (:75):** fetches latest `subsection_floor_plans` row for subsection, then all `floor_plan_pins` for that floor plan; derives status/priority counts, overdue (`due_date < today` & not closed/resolved) grouped by `assigned_contractor`, and recent activity parsed from each pin's `edit_history` jsonb (status/priority/assignment changes).
- **Renders:** grid of Cards (overview + completion `Progress`, status, priority, overdue, recent-activity timeline).
- **Callers:** `InteractiveFloorPlan`.
- **NOTES:** reads `floor_plan_pins`/`subsection_floor_plans` — Realtime + RLS (G-SEC-13 floor_plan tables flagged).

## 24. FloorPlanViewer.tsx
`FloorPlanViewer(props)` — [FloorPlanViewer.tsx:35](../../../src/components/FloorPlanViewer.tsx#L35)

Interactive PDF floor-plan canvas: zoom/pan, pin placement, clustering, mini-map.

| Prop | Type | Meaning |
|---|---|---|
| pdfUrl | string | floor plan PDF |
| pins | Pin[] | rendered pins |
| onAddPin | (x,y)=>void | place pin (% coords) |
| onPinClick | (pin)=>void | open pin |
| addMode | 'snag'\|'observation'\|null | placement mode |
| onAddModeChange | (mode)=>void | toggle |
| selectedPinId | string\|null? | highlight |
| quickAddMode | boolean? | rapid placement |

- **State (many):** `numPages`, `scale`, `panOffset`, `isPanning`/`panStart`, `isShiftPressed`, `pageWidth`, `touchStart` (pinch), `expandedClusterId`, `showMiniMap`, `containerSize`, `isAnimating`.
- **Logic:** `clusterPins(pins, scale, expandedClusterId)` from `@/lib/pinClustering` (`isCluster`, `getClusterColor`, `ClusteredPin`); container-size + page-width tracking effects; Shift-key tracking for pan; cluster reset when `scale > 1.5`.
- **Renders:** react-pdf `Document/Page`, absolute pin/cluster markers, zoom/minimap toolbar, embedded `FloorPlanMiniMap`.
- **Callers:** `InteractiveFloorPlan`, `components/site/SchematicDiagram.tsx`.
- **NOTES:** pdf.worker via unpkg CDN (`https://unpkg.com/...`, :12). Clustering logic lives in lib `pinClustering` (lib chapter).

## 25. FortressMarkingChecklist.tsx
`FortressMarkingChecklist({ siteId, siteName? })` — [FortressMarkingChecklist.tsx:29](../../../src/components/FortressMarkingChecklist.tsx#L29)

Per-site "Fortress" labelling/marking checklist (template-seeded), persisted per item, with PDF export.

- **Props:** `siteId`, `siteName?`.
- **State:** `checklistItems`, `loading`, `updating`, preview state (`previewOpen/Url/FileName/Blob`).
- **Hooks:** `useUnifiedPdfGeneration()` (`generatePdfForPreview`, `isGenerating`) + `FortressChecklistReportData` type.
- **`initializeChecklist` (:44):** reads `site_marking_checklist` for site, merges with `generateFortressTemplate()` (`@/lib/fortressTemplate`) → full item list (existing or default).
- **Data writes:** `toggleCheckbox` (:86) `upsert` to `site_marking_checklist` (onConflict `site_id,item_id`, sets `checked_by`=user.id/null, `checked_at`, `status`); also `.upsert` (:146) for notes and `.delete()` (:186).
- **Renders:** Card with `Progress`, section-grouped `Checkbox` rows, Preview/Export buttons → `DocumentPreviewDialog`.
- **Callers:** `views/SiteDetail.tsx`.
- **NOTES:** client-side upsert/delete on `site_marking_checklist` (RLS-dependent). Template defined in lib `fortressTemplate`.

## 26. FullscreenImageViewer.tsx
`FullscreenImageViewer({ src, alt?, onClose })` — [FullscreenImageViewer.tsx:13](../../../src/components/FullscreenImageViewer.tsx#L13)

Full-screen image lightbox with zoom/pan, mouse+touch+keyboard.

- **Props:** `src: string|null` (null → dialog closed), `alt?`, `onClose`.
- **State:** `scale` (0.5–5), `position`, `isDragging`, `dragStart`.
- **Behavior:** wheel zoom, drag/touch pan (only when scale>1), double-click toggle 1×/2×, keyboard `Esc`/`+`/`-`/`0`. Resets on `src` change.
- **Renders:** black-overlay `Dialog`, control bar (zoom/reset), close button, pan hint, `RobustImage`.
- **Callers:** `views/InspectionDetail.tsx`, `OfflineImageGallery`, `components/site/SchematicDiagram.tsx`.

## 27. GlobalSearch.tsx
`GlobalSearch()` — [GlobalSearch.tsx:36](../../../src/components/GlobalSearch.tsx#L36)

Command-palette global search (Cmd/Ctrl+K) across clients/sites/subsections/inspections with filters.

- **Props:** none.
- **State:** `open`, `searchQuery`, `filters: SearchFilters`.
- **Hooks:** `useGlobalSearch(searchQuery, filters)` + `useSearchFilterOptions()` (from `@/hooks/useGlobalSearch`); `useNavigate`.
- **Effect:** global `keydown` listener toggles palette on Cmd/Ctrl+K.
- **Behavior:** `handleSelect(url)` closes + navigates; `getIcon(type)` maps result type → icon; result grouping by entity type; filter `Popover` with checkboxes + date `Calendar`.
- **Renders:** `CommandDialog` (search input, grouped `CommandItem`s, empty state) + filter popover.
- **Callers:** `src/app/(admin)/layout.tsx`.
- **NOTES:** all query/data logic lives in hook `useGlobalSearch` (hooks chapter) — this is the UI shell.

## 28. HelpButton.tsx
`HelpButton()` — [HelpButton.tsx:17](../../../src/components/HelpButton.tsx#L17)

Floating help FAB → screenshot-capture → Report Issue / Submit Suggestion dialogs; pulses red when verifications pending.

- **Props:** none.
- **State:** `issueDialogOpen`, `suggestionDialogOpen`, `screenshot`, `isCapturing`.
- **Hooks:** `usePendingVerifications()` → `hasPendingVerifications`.
- **`captureScreenshot(type)` (:26):** hides the FAB, runs `html2canvas(document.body, {useCORS, allowTaint, …})`, stores base64, opens the matching dialog (falls back to opening dialog even if capture fails).
- **Renders:** fixed `DropdownMenu` FAB (red+pulse + dot badge when pending) → `IssueReportDialog` + `SuggestionDialog` (passing `screenshot`).
- **Callers:** `src/app/providers.tsx` (global).

## 29. InspectionOfflineBanner.tsx
`InspectionOfflineBanner(props)` — [InspectionOfflineBanner.tsx:18](../../../src/components/InspectionOfflineBanner.tsx#L18)

Status banner for offline/cached/pending-changes state of an inspection.

| Prop | Type | Meaning |
|---|---|---|
| isOnline | boolean | connectivity |
| isCached | boolean | available offline |
| hasPendingChanges | boolean | unsynced edits |
| lastSyncTime | Date\|null | last sync |
| pendingImageCount | number? | queued images (default 0) |
| onSyncNow | ()=>void? | manual sync |
| isSyncing | boolean? | spinner |

- **State/effect:** `isVisible` set when offline / pending changes / pending images.
- **Behavior:** when cached+online+nothing-pending → subtle "Available Offline" tooltip badge; else variant-styled banner (offline / unsaved / online) with pending-image badge, last-sync time, "Sync Now" button.
- **Callers:** `views/InspectionDetail.tsx`.
- **NOTES:** part of offline-sync flow (06-flows offline sync); pure presentational (no sync logic here).

## 30. InspectionSignatures.tsx
`InspectionSignatures({ inspectionId, onSignaturesChange? })` — [InspectionSignatures.tsx:22](../../../src/components/InspectionSignatures.tsx#L22)

Four-up signature sign-off panel (inspector / contractor / client / witness).

- **Props:** `inspectionId`, `onSignaturesChange?: (SignatureData[])=>void`.
- **State:** `signatures: SignatureData[]`, `loading`.
- **Effect:** `fetchSignatures` on mount reads `inspection_signatures` where `inspection_id = inspectionId`.
- **Behavior:** `handleSignatureSaved` replaces any existing signature of the same `signer_type` and bubbles up via `onSignaturesChange`; `getSignatureByType` resolves the existing signature per slot.
- **Renders:** Card with 2×2 grid of `SignatureCapture` (one per signer type) wired with `existingSignature`.
- **Callers:** `views/InspectionDetail.tsx`.
- **NOTES:** persistence handled inside child `SignatureCapture` (part 2); reads `inspection_signatures` (RLS-flagged in G-SEC-13).

---

### Part-1 notable findings (summary)
- **Dead export:** `COCReviewStatus` (#7) — zero callers in `src`.
- **Dead/unused imports:** `BeforeAfterComparison` (#3) imports `supabase` but never calls it.
- **Possibly-unmounted-by-name:** `AuthOnlyRoute` (#2), `DoubleSlashRedirect` (#16), `DynamicFieldManager` (#17) — no name-grep callers; mounted via layouts/dynamic subtrees (⚠️ UNVERIFIED exact mount point).
- **Client-side security-relevant writes (RLS-dependent, GAPS G-SEC-13/14):** `ComplianceDashboard` (#11, `subsections`/`subsection_documents` UPDATE), `ComprehensiveInspectionReport` (#12, `subsection_documents` INSERT), `FortressMarkingChecklist` (#25, `site_marking_checklist` upsert/delete), `DynamicFieldManager` (#17) + `BeforeAfterComparison` (#3) upload to public storage buckets (`inspection-photos`, `floor-plan-photos`).
- **Captcha silent-degrade:** `CaptchaTurnstile` (#8) → GAPS **G-SEC-02**.
- **Duplicated logic:** image-compression-to-JPEG (#17 and others); pdf.worker pinned to unpkg CDN across all react-pdf consumers (#5,#6,#15,#20,#24); COC clause→location map (#6) overlaps COC flow docs.
- **Stale brand:** `AppSidebar` (#1) default company name `"SiteWise"`.
