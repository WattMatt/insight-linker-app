# C12 — floor-plan-annotation

- Unit id: C12
- Slug: floor-plan-annotation
- Spec mode: full
- Date: 2026-07-29
- Files: 7

## Unit header

**Unit purpose (as-is).** Floor-plan viewing and annotation for a subsection: upload a PDF floor plan, place numbered snag/observation pins by clicking the rendered page, edit pin details (photos, priority, contractor, due date), record before/after rectification evidence, view a live stats dashboard, and generate/save a floor-plan PDF report. Two Supabase Realtime subscriptions (pins + floor plans) plus a third in the stats widget keep the UI in sync; pin CRUD delegates to the offline-capable H02 hook so pins survive offline use.

**Module-level observations (cross-file facts).**
- Component tree: `InteractiveFloorPlan` (container) → `FloorPlanViewer` (→ `FloorPlanMiniMap`), `FloorPlanPinsList` (×2 instances), `FloorPlanStatsWidget`, `FloorPlanPinModal` (→ `BeforeAfterComparison`). Only `InteractiveFloorPlan` is consumed outside the unit (grep-verified, see per-file "used by").
- The pin status union `'open' | 'in_progress' | 'finished' | 'closed' | 'resolved'` is re-declared locally in FloorPlanViewer.tsx:20, FloorPlanMiniMap.tsx:12, FloorPlanPinsList.tsx:26 and FloorPlanPinModal.tsx:21; there is no shared type. The container holds pins as `any[]` (InteractiveFloorPlan.tsx:32).
- No code path in this unit writes status `'resolved'`; it is only grouped/coloured as done (FloorPlanPinsList.tsx:81, FloorPlanViewer.tsx:288, FloorPlanMiniMap.tsx:44, FloorPlanStatsWidget.tsx:110).
- `getPinColor` is duplicated verbatim between FloorPlanViewer.tsx:287-291 and FloorPlanMiniMap.tsx:43-47.
- Photo storage is split across three buckets: floor-plan PDFs → `documents` (InteractiveFloorPlan.tsx:182-184); pin "before" photos → `inspection-photos` (via H02 `updatePin`, src/hooks/useOfflineFloorPlanAnnotations.ts:115-124); rectification "after" photos → `floor-plan-photos` (BeforeAfterComparison.tsx:73-74).
- `edit_history` rendered by FloorPlanStatsWidget is written by a DB trigger (supabase/migrations/20251120102352_9e71ab8f…sql:57, 20251120102409_a7bc6b71…sql:6), not by any TypeScript code (grep-verified: only reads at FloorPlanStatsWidget.tsx:159-160, floorPlanReportGenerator.ts:46, generated types).
- A single rectification save produces two identical "Rectification photo saved" toasts: BeforeAfterComparison.tsx:80 and InteractiveFloorPlan.tsx:384 (the former's `onSaveAfterPhoto` chains into the latter via FloorPlanPinModal.tsx:443-445).
- Console logging is inconsistent: InteractiveFloorPlan gates every `console.error` behind `process.env.NODE_ENV === 'development'` (e.g. :159, :211); FloorPlanPinModal (:143, :152), FloorPlanStatsWidget (:62, :198), FloorPlanViewer (:148) and BeforeAfterComparison (:52, :85, :99) log unconditionally.
- No test file anywhere in the repo references any of the seven components (grep-verified across `src` and `supabase` for all seven names, `*.test.*`/`*.spec.*`: zero hits).

**External contract.** The rest of the app gets exactly one component from this unit: `InteractiveFloorPlan({ subsectionId, projectName, siteName, subsectionName })`, mounted by V01 `src/views/InspectionDetail.tsx:2272` (for "Site Drawing" template inspections) and V01 `src/views/SubsectionDetail.tsx:185` (the subsection "floor-plan" tab). The other six files are internal wiring. C09 `src/components/site/SchematicDiagram.tsx:171,230` mentions FloorPlanViewer in comments only — no import.

---

## src/components/InteractiveFloorPlan.tsx
- Purpose: Container that loads/uploads a subsection's floor plan, orchestrates pin CRUD (online and offline), realtime refresh, quick-add / move / delete-with-undo flows, rectification updates, and floor-plan PDF report preview/save.
- Public surface: `export const InteractiveFloorPlan(props: InteractiveFloorPlanProps): JSX.Element` (line 25); `InteractiveFloorPlanProps { subsectionId: string; projectName: string; siteName: string; subsectionName: string }` (18-23). No other exports.
- Inputs & outputs:
  - Reads: `subsection_floor_plans` latest row for subsection (125-131); `floor_plan_pins` by `floor_plan_id` (140-144, 80-90); `floor_plan_pin_comments` per pin at report time (454-458); `supabase.auth.getUser()` (177, 248, 369); offline pins from IndexedDB via `getOfflineAnnotations` (149-155).
  - Writes: storage `documents` bucket upload at `${subsectionId}/${Date.now()}_${file.name}` (181-184) then `getPublicUrl` (189-191); `subsection_floor_plans` insert (194-203); `floor_plan_pins` update — position (225-231), rectification set (371-379), rectification clear (394-402), status (417-420); pin insert/update/delete via H02 hook (253, 280, 297, 343); report PDF to documents bucket + `site_documents`/`subsection_documents` via `savePDFToDocuments` (496-501).
  - `rectified_by` is written as `user?.email || 'Unknown'` (377).
- Dependencies: uses -> FloorPlanViewer, FloorPlanPinModal, FloorPlanPinsList, FloorPlanStatsWidget (C12-internal, lines 2-5); `ui/button`, `ui/badge` (C01, 6-7); DocumentPreviewDialog (C15, 9); `savePDFToDocuments`/`getReportCategoryName` from pdfDocumentSaver (L14, 10); supabase client (L19, 11); `generateFloorPlanReport` (L10, 13); `html2canvas` (external, 14 — imported, never called); `useOfflineFloorPlanAnnotations` (H02, 15); `useUndoStack`/`UndoAction` (H04, 16); sonner, lucide-react (external). used by <- V01 src/views/InspectionDetail.tsx:18,2272; V01 src/views/SubsectionDetail.tsx:7,185 (grep-verified).
- Side effects: subscribes two realtime channels — `floor-plan-pins-changes` on `floor_plan_pins` all events, filter `floor_plan_id=eq.<id>` only when `floorPlan?.id` is set (64-94), and `floor-plan-changes` on `subsection_floor_plans` filtered by subsection (97-111); both removed in effect cleanup (114-117). Toasts on nearly every action (success/info/error). Creates/revokes object URL for the report preview (480, 505, 714). 5-second `setTimeout` performing the actual server delete for quick-delete (341-351). Pin-change realtime callback re-queries pins and toasts "Floor plan updated" (80-90).
- Error handling: `loadFloorPlan` catch → dev-gated `console.error` + toast "Failed to load floor plan" (158-161). Upload catch → toast "Failed to upload floor plan" (210-213). Add/move pin catch → toast (239-242, 265-268). `handleSavePin` toasts nothing itself and rethrows (286-289) — FloorPlanPinModal catches and toasts. `handleDeletePin` rethrows (304-307). Quick-delete timeout failure → pin restored to local state + toast "Failed to delete pin" (345-350). Rectification save/remove and status change: toast then rethrow (385-389, 408-412, 432-436). Report generation catch → toast (483-485).
- Tests: none found (grep-verified).
- Observed issues:
  - On first mount `floorPlan` is null so the conditional spread at line 74 omits the filter — the pins channel subscribes to every `floor_plan_pins` event app-wide; in that generation the callback's closed-over `floorPlan` is null so the reload branch (79) never runs. When `floorPlan?.id` becomes set the effect re-runs (dep at 118) and re-subscribes filtered — which also re-invokes `loadFloorPlan()` (61), i.e. mount loads the floor plan twice.
  - `handleAddPin` in move mode only issues the DB update `if (isOnline)` (224-234); offline, the move performs no persistence and queues no mutation, yet still toasts "Pin moved successfully" (238).
  - A second quick-delete within the 5-second undo window clears the previous pin's timeout (327-329), so the first pin's server delete never executes although it stays removed from local state.
  - No unmount cleanup for `undoTimeoutRef` — effect cleanup (114-117) removes channels only; a pending delete timeout still fires after unmount.
  - `pendingUndo`, `popAction`, `canUndo` are destructured from `useUndoStack` (53, 55, 57) and never used.
  - `html2canvas` imported (14) but never invoked; the report screenshot uses `document.querySelector('canvas')` (464) — the first `<canvas>` in the entire document.
  - `floorPlan`, `pins`, `selectedPin` are typed `any`/`any[]` (31-33).
  - `newPinNumber` is computed client-side as `max(pin_number)+1` over currently loaded pins (251).
  - Two `FloorPlanPinsList` instances are mounted simultaneously (663-674 desktop, 676-687 mobile), one always CSS-hidden, each with independent filter/sheet state.
- ASSUMED: the `documents` bucket serves public URLs (code relies on `getPublicUrl`, 189-191 — bucket config not inspected); Supabase accepts the channel config with the filter key absent (the code's own comment at 72-74 asserts the unfiltered behaviour).

## src/components/FloorPlanViewer.tsx
- Purpose: Renders page 1 of the floor-plan PDF with zoom (wheel/pinch/buttons), pan (shift-drag/right-drag/touch), click-to-add pins, a zoom-aware clustered pin overlay, and an optional mini-map.
- Public surface: `export const FloorPlanViewer(props: FloorPlanViewerProps): JSX.Element` (35); `FloorPlanViewerProps { pdfUrl: string; pins: Pin[]; onAddPin: (x: number, y: number) => void; onPinClick: (pin: Pin) => void; addMode: 'snag' | 'observation' | null; onAddModeChange: (mode) => void; selectedPinId?: string | null; quickAddMode?: boolean }` (24-33); local `Pin` interface (14-22). Coordinates passed to `onAddPin` are percentages of the rendered page (159-160).
- Inputs & outputs: fetches the PDF from `pdfUrl` via react-pdf; loads `pdf.worker.min.mjs` from `https://unpkg.com/pdfjs-dist@<version>/...` at module scope (12). No store writes; all mutations delegate upward via callbacks.
- Dependencies: uses -> react-pdf `Document`/`Page`/`pdfjs` (external, 2); `ui/button` (C01, 3); sonner, lucide-react (external); `clusterPins`/`isCluster`/`getClusterColor`/`ClusteredPin` from `@/lib/pinClustering` (L18, 8); FloorPlanMiniMap (C12-internal, 9); react-pdf CSS (6-7). used by <- src/components/InteractiveFloorPlan.tsx:2,648 (C12-internal); C09 src/components/site/SchematicDiagram.tsx:171,230 comment-only references; no other importers (grep-verified).
- Side effects: window `resize` listeners ×2 (62-75, 94-105); window `keydown`/`keyup` for Shift tracking (77-92); non-passive `wheel` listener with `preventDefault` on the container (116-140); mutates global `pdfjs.GlobalWorkerOptions.workerSrc` at import time (12); toasts on load success (144), load error (149), cluster expand (296); suppresses the context menu (352).
- Error handling: `onDocumentLoadError` → `console.error` + toast + react-pdf `error` fallback UI (147-150, 381-388); no other failure paths (component performs no async work of its own).
- Tests: none found (grep-verified).
- Observed issues:
  - `addMode` and `onAddModeChange` are declared in props (29-30) but not destructured (35-42); the sole caller passes `addMode={null}` and a no-op (InteractiveFloorPlan.tsx:657-658).
  - `numPages` state is set (45, 143) and never read.
  - The wheel handler zooms and `preventDefault`s all non-ctrl/meta wheel events (117-133), so mouse-wheel scrolling of the `overflow-auto` container (346) is repurposed as zoom.
  - `handlePageClick` detects clicks on existing pins against the raw `pins` array with a 3%-radius test (163-170), independent of the rendered clustered overlay; rendered pins/clusters also have their own `onClick` with `stopPropagation` (428, 488-491), giving two separate hit paths.
  - Hover effects mutate `e.currentTarget.style.transform` directly (429-434, 492-497).
  - `toast.success("Floor plan loaded successfully")` fires on every document load (144), including re-renders that remount the Document.
  - Pin colour rules: resolved/closed/finished → `#9ca3af`, `priority === 'critical'` → `#dc2626`, snag → `#ef4444`, observation → `#3b82f6` (287-291).
- ASSUMED: nothing — all statements verified in-file.

## src/components/FloorPlanPinModal.tsx
- Purpose: Dialog for creating/editing a pin in two steps (snag/observation type selection, then details) with photo capture/upload, snag-only fields, a before/after rectification section, and status buttons with an admin-gated "Closed".
- Public surface: `export const FloorPlanPinModal(props: FloorPlanPinModalProps): JSX.Element` (57); props (33-43): `isOpen: boolean; onClose: () => void; onSave: (data: PinData, photo?: File) => Promise<void>; onSaveRectification?: (pinId, photoUrl, notes) => Promise<void>; onRemoveRectification?: (pinId) => Promise<void>; onDelete?: () => Promise<void>; onMove?: () => void; initialData?: PinData; pinNumber: number`; local `PinData` interface (14-31); module const `CONTRACTORS` — 9 hardcoded trade strings (45-55).
- Inputs & outputs: no direct store access — all persistence delegates to callbacks. Reads user role via `useUserRole` (69-70, `isAdmin = userRole === "Admin"`). Photo held as `File` + object-URL preview (81-82, 121, 133).
- Dependencies: uses -> `ui/dialog`, `ui/button`, `ui/input`, `ui/label`, `ui/textarea`, `ui/select` (C01, 2-7); lucide-react; `useCamera` (H02, 9 — `takePicture(): Promise<File | null>`, src/hooks/useCamera.ts:177); `useUserRole` (H03, 10); sonner; BeforeAfterComparison (C12-internal, 12). used by <- src/components/InteractiveFloorPlan.tsx:3,692 only (grep-verified).
- Side effects: `URL.createObjectURL` for previews (121, 133) — never revoked; `window.confirm` before delete (166); unconditional `console.log` of form data on save (143, 152).
- Error handling: photo capture failure → `console.error` + toast "Failed to capture photo" (123-126); empty title → toast "Please enter a title" and abort (145-148); `onSave` rejection → `console.error` + toast "Failed to save pin", `isSaving` reset in finally (155-160); delete rejection → `console.error` + toast (170-173).
- Tests: none found (grep-verified).
- Observed issues:
  - "New pin" is inferred from absence of a title (`isNewPin = !initialData?.title`, 73, 93) — an existing pin stored without a title reopens at the type-selection step.
  - The `type` step renders no footer (513 gates the footer on `step === 'details'`) — the only exits are picking a type or dismissing the dialog; the pin row already exists in the DB at this point (created by InteractiveFloorPlan.tsx:253 before the modal opens), so dismissal leaves an untitled pin.
  - Unconditional `console.log` including full form data at 143 and 152.
  - `PinData.status` includes `'resolved'` (21) but the status grid offers only open / in_progress / finished / closed (474-508); "Closed" is disabled for non-Admins (503-504).
  - Object URLs from previews are never revoked.
  - The rectification save path updates local `formData` after `onSaveRectification` (446-451) but does not set `rectified_by`, while the parallel DB write does (InteractiveFloorPlan.tsx:377) — local state diverges from the row until reload.
- ASSUMED: `useUserRole` returns the literal string "Admin" for admins (matching comparison at 70; hook internals in H03 not re-verified here).

## src/components/FloorPlanPinsList.tsx
- Purpose: Filterable list of pins with per-pin quick status toggle row and hover quick-delete, rendered as a Card sidebar on desktop and a floating-button bottom Sheet on mobile.
- Public surface: `export const FloorPlanPinsList(props: FloorPlanPinsListProps): JSX.Element` (48); props (33-39): `pins: Pin[]; onPinClick: (pin: Pin) => void; onQuickStatusChange?: (pinId: string, newStatus: Pin['status']) => Promise<void>; onQuickDelete?: (pin: Pin) => void; selectedPinId?: string | null`; local `Pin` interface (22-31); module const `STATUS_OPTIONS` — 4 entries, no `resolved` (41-46).
- Inputs & outputs: pure presentation over the `pins` prop; filter state (status/priority/type) local (58-60); no store access.
- Dependencies: uses -> `ui/card`, `ui/badge`, `ui/button`, `ui/scroll-area`, `ui/sheet` (C01); lucide-react; `cn` from `@/lib/utils` (L18, 17); `PinFilters` + `StatusFilter`/`PriorityFilter`/`TypeFilter` (C06, 18); `useIsMobile` (H04, 20). used by <- src/components/InteractiveFloorPlan.tsx:4,664,677 only (grep-verified).
- Side effects: none — all mutations delegate to the callbacks.
- Error handling: `handleQuickStatus` wraps `await onQuickStatusChange(...)` in try/finally with no catch (115-120) — `updatingPinId` is reset but a rejection propagates as an unhandled rejection (the parent's handler toasts before rethrowing, InteractiveFloorPlan.tsx:432-436). `handleQuickDelete` has no error path (123-128).
- Tests: none found (grep-verified).
- Observed issues:
  - Mounted twice by the parent (desktop + mobile copies), each holding independent filter and sheet state.
  - `finishedItems` groups `finished`, `closed` and `resolved` as "Done" (81) while the filter vocabulary (`StatusFilter`, C06 PinFilters.tsx:12) has no `resolved` option — a resolved pin can never be isolated by filter.
  - `.sort()` at 298 mutates the `useMemo` result array in place (297-300).
  - The mobile floating button badge shows `openItems.length` (321) while the sheet title shows `pins.length` (328).
- ASSUMED: none.

## src/components/FloorPlanMiniMap.tsx
- Purpose: Overview thumbnail of the floor-plan PDF with pin dots and a live viewport rectangle; clicking computes a new pan offset that centres the main view on that point.
- Public surface: `export const FloorPlanMiniMap(props: FloorPlanMiniMapProps): JSX.Element` (28); props (16-26): `pdfUrl: string; pins: Pin[]; scale: number; panOffset: { x: number; y: number }; containerWidth: number; containerHeight: number; pageWidth: number; onNavigate: (x: number, y: number) => void; onClose: () => void`; local `Pin` interface (6-14). `onNavigate` receives pixel pan offsets, not percentages (90-93).
- Inputs & outputs: renders page 1 of `pdfUrl` at fixed 200px width (121-129); pure UI otherwise; no store access.
- Dependencies: uses -> react-pdf `Document`/`Page` (external, 2 — relies on the global `workerSrc` set by FloorPlanViewer.tsx:12); lucide-react; `ui/button` (C01, 4). used by <- src/components/FloorPlanViewer.tsx:9,529 only (grep-verified).
- Side effects: none (no listeners, no subscriptions).
- Error handling: none — the `Document` at 121 has no `onLoadError`/`loading`/`error` props; a failed PDF load falls through to react-pdf defaults.
- Tests: none found (grep-verified).
- Observed issues:
  - Page height is approximated as `pageWidth * 1.414` ("Approximate A4 ratio", 53, 87) — the viewport rectangle and click-to-navigate math are computed against an assumed A4-portrait page regardless of the actual PDF aspect.
  - `miniMapHeight` state (41) stays at its initial 150 — `setMiniMapHeight` is never called; `miniMapWidth` is a setterless `useState(200)` (40).
  - `getPinColor` (43-47) duplicates FloorPlanViewer.tsx:287-291 exactly.
  - The viewport indicator carries a permanent `animate-pulse` class (170).
- ASSUMED: none.

## src/components/FloorPlanStatsWidget.tsx
- Purpose: Dashboard cards for a subsection's floor-plan pins — status and priority breakdowns, completion rate, overdue items grouped by contractor, and recent activity parsed from the DB-trigger-maintained `edit_history`.
- Public surface: `export const FloorPlanStatsWidget({ subsectionId }: FloorPlanStatsWidgetProps): JSX.Element` (44); props `{ subsectionId: string }` (40-42); internal `FloorPlanStats` shape (8-38).
- Inputs & outputs: reads `subsection_floor_plans` latest id for the subsection (80-86) and all `floor_plan_pins` for that floor plan ordered by `updated_at` desc (94-98). No writes, no storage, no localStorage.
- Dependencies: uses -> `ui/card`, `ui/badge`, `ui/progress` (C01, 2-3, 6); supabase client (L19, 4); lucide-react (5). used by <- src/components/InteractiveFloorPlan.tsx:5,624 only (grep-verified; rendered only when `pins.length > 0`, InteractiveFloorPlan.tsx:623).
- Side effects: realtime channel `floor-plan-stats-changes` on all `floor_plan_pins` events with **no filter** (52-67), removed on cleanup (70-72); `console.log` of every realtime payload (62); each event triggers a full `loadStats()` re-query.
- Error handling: `loadStats` catch → `console.error` only, no toast, previous `stats` retained (197-201); missing floor plan or null pins → `setStats(null)` → "No floor plan data available" card (88-91, 100-103, 214-223).
- Tests: none found (grep-verified).
- Observed issues:
  - The realtime subscription is unfiltered — a pin change on any floor plan anywhere in the app reloads this widget's stats.
  - Unconditional `console.log` of realtime payloads (62).
  - `statusBreakdown.closed` merges `closed` and `resolved` (110); `completionRate` counts only `closed` as complete, excluding `finished` (225-227).
  - Overdue logic (126-142) excludes only `closed`/`resolved` — `finished` pins with past due dates still count as overdue — and `dueDate < today` compares against the current instant, so an item counts overdue from the first moment of its due date.
  - The Status Breakdown legend colours `finished` blue (290) while FloorPlanViewer/MiniMap render finished pins gray (#9ca3af) and FloorPlanPinsList uses green for finished (44).
  - The widget independently re-queries the floor plan and pins its parent already loaded (80-98 vs InteractiveFloorPlan.tsx:125-144); combined with the parent's own two channels this puts three realtime channels on one screen.
  - `edit_history` entries are read as `any` (160) assuming the trigger's `{timestamp, changes:{status|priority|assigned_contractor:{from,to}}}` shape; entries whose tracked fields are all null produce no activity row (172).
- ASSUMED: the `edit_history` trigger installed by migrations 20251120102352/20251120102409 is active in the deployed database (schema state not queried).

## src/components/BeforeAfterComparison.tsx
- Purpose: Side-by-side before/after rectification photo panel with camera capture, file upload, notes entry, photo removal, and an expanded comparison dialog.
- Public surface: `export const BeforeAfterComparison(props: BeforeAfterComparisonProps): JSX.Element` (25); props (13-23): `beforePhotoUrl?: string; afterPhotoUrl?: string; afterNotes?: string` (default `""`); `rectifiedAt?: string; rectifiedBy?: string; onSaveAfterPhoto: (photoUrl: string, notes: string) => Promise<void>; onRemoveAfterPhoto?: () => Promise<void>; pinId?: string; readOnly?: boolean` (default `false`).
- Inputs & outputs: uploads the pending photo to storage bucket `floor-plan-photos` at `rectification/${pinId || Date.now()}_${Date.now()}.jpg` via `uploadImage(file, bucket, path)` from H02 (73-74; `uploadImage` returns `{ url, path } | null`, src/hooks/useImageUpload.ts:6-9, 123-129); the resulting public URL and notes are handed to `onSaveAfterPhoto` (77).
- Dependencies: uses -> `ui/dialog`, `ui/button`, `ui/label`, `ui/textarea` (C01, 2-5); lucide-react; `useCamera` (H02, 7); `useImageUpload` (H02, 8); sonner; `RobustImage` (C16, 10); supabase client (L19, 11 — imported, never referenced in the body). used by <- src/components/FloorPlanPinModal.tsx:12,436 only (grep-verified).
- Side effects: `URL.createObjectURL` for pending previews (49, 61) — never revoked; `window.confirm` before removal (93); network upload via `uploadImage`; toasts on save/remove/capture outcomes.
- Error handling: capture failure → `console.error` + toast "Failed to capture photo" (51-54); save with no pending file → toast and abort (66-69); `uploadImage` returning null/undefined `url` → `throw new Error("Upload failed")` caught by the same handler → toast "Failed to save photo", `isUploading` reset (82-89); remove rejection → `console.error` + toast (98-101).
- Tests: none found (grep-verified).
- Observed issues:
  - `supabase` imported at line 11 and never used.
  - `readOnly` and `pinId` are optional props but the only consumer (FloorPlanPinModal) always passes `pinId` and never passes `readOnly` (grep-verified) — the read-only rendering branches (188, 221-226) are unreachable from current callers.
  - Upload path hard-codes a `.jpg` extension regardless of the source file type (73); with `pinId` undefined the name degenerates to two timestamps.
  - `notes` state is initialised once from the `afterNotes` prop (40); later prop changes do not update it.
  - Success toast duplicates the parent's (see module-level observations).
- ASSUMED: `uploadImage`'s compression pipeline outputs JPEG, making the hard-coded `.jpg` extension accurate (H02 `COMPRESSION_CONFIG`, src/hooks/useImageUpload.ts:11-14, notes JPEG quality; full pipeline not re-traced).
