# H04 — ui-and-pdf-template-hooks

- Unit id: H04
- Slug: ui-and-pdf-template-hooks
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 5 (src/hooks/use-mobile.tsx, src/hooks/use-toast.ts, src/hooks/useUndoStack.ts, src/hooks/usePDFTemplate.ts, src/hooks/usePDFTemplateGateway.ts)

## Unit header

**Unit purpose.** Five standalone React hooks in `src/hooks` with no offline/sync involvement: three UI utilities (viewport breakpoint, singleton toast store, bounded undo stack) and two overlapping hooks that load PDF report template configuration from the Supabase table `pdf_report_templates`.

**Module-level observations (cross-file facts inside the unit).**
- No file in this unit imports any other file in this unit (each file's import block verified: use-mobile.tsx:1, use-toast.ts:1-3, useUndoStack.ts:1, usePDFTemplate.ts:1-3, usePDFTemplateGateway.ts:15-17).
- The two PDF hooks issue the same query — `from("pdf_report_templates").select("*").eq("report_type", reportType).eq("is_default", true).single()` — at usePDFTemplate.ts:26-31, usePDFTemplateGateway.ts:233-238, and usePDFTemplateGateway.ts:358-363. usePDFTemplate supports 5 report types (usePDFTemplate.ts:13); the Gateway supports 7 (usePDFTemplateGateway.ts:20-27).
- Consumption is skewed: `usePDFTemplate.ts` has zero importers, and within `usePDFTemplateGateway.ts` only the standalone `fetchPDFTemplate` and two types are imported anywhere — the React hook `usePDFTemplateGateway` and `getAccentColorPalette` have no callers (all grep-verified; details per file below).
- `use-toast.ts` is one of two toast systems in the repo: 82 files import from `sonner` (grep `from ['"]sonner['"]` across src, count 82; e.g. src/hooks/useImageUpload.ts:3, src/components/ui/sonner.tsx:2), while this store has 5 tracked importer files (listed per file below).
- Naming split: two kebab-case files (use-mobile.tsx, use-toast.ts) vs camelCase for the other three.
- No vitest test file references any of the five files (grep for `use-toast|useIsMobile|useUndoStack|usePDFTemplate` across `src --include=*.test.ts --include=*.test.tsx` returns no hits).

**External contract.** The rest of the app gets: `useIsMobile()` (3 consumer files), the module-singleton toast store `useToast`/`toast` (rendered app-wide via `src/components/ui/toaster.tsx`, which is mounted in `src/app/providers.tsx:5,19` — A01), `useUndoStack` (1 consumer, floor-plan pins), and `fetchPDFTemplate` + `AccentColors`/`TemplateReportType` types (5 consumer files across C14, L10, L15, V02). Only backend store touched by the unit: Supabase table `pdf_report_templates` (present in generated types at src/integrations/supabase/types.ts:1574).

---

## src/hooks/use-mobile.tsx

- Purpose: Reports whether the viewport is narrower than a 768px breakpoint, updating on media-query change events.
- Public surface:
  - `useIsMobile(): boolean` (use-mobile.tsx:5). Module-private constant `MOBILE_BREAKPOINT = 768` (use-mobile.tsx:3).
- Inputs & outputs: reads `window.matchMedia("(max-width: 767px)")` (use-mobile.tsx:9) and `window.innerWidth` (use-mobile.tsx:11,14). Internal state is `boolean | undefined`, returned as `!!isMobile` (use-mobile.tsx:6,18). No tables, buckets, localStorage, or env vars.
- Dependencies: uses -> `react` (use-mobile.tsx:1) only. used by <- C12 ui-kit consumer set (grep-verified): src/components/FloorPlanPinsList.tsx:20 (C12 floor-plan-annotation), src/components/ui/sidebar.tsx:6 (C01 ui-kit-shadcn), src/views/ClientPortalSiteDetail.tsx:17 (V03 portal-views).
- Side effects: adds a `change` listener to the MediaQueryList on mount, removes it on unmount (use-mobile.tsx:13,15); one synchronous `setIsMobile` on mount (use-mobile.tsx:14).
- Error handling: none — no try/catch, no failure branches. The effect only runs client-side (React useEffect), so `window` access does not execute during SSR rendering of the initial state.
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - Initial state is `undefined`, coerced to `false` at return (use-mobile.tsx:6,18) — the first render always reports non-mobile regardless of actual width.
  - The media query is `max-width: 767px` while the change handler compares `window.innerWidth < 768` (use-mobile.tsx:9-11) — two different width sources for the same boolean.
- ASSUMED: file is shadcn/ui-vendored in origin (kebab-case name matching the vendored kit convention); not verified against upstream.

## src/hooks/use-toast.ts

- Purpose: Module-singleton toast store (reducer + listeners pattern) exposing an imperative `toast()` creator and a `useToast()` subscription hook.
- Public surface:
  - `reducer(state: State, action: Action): State` (use-toast.ts:71, exported).
  - `toast(props: Toast): { id: string; dismiss(): void; update(props: ToasterToast): void }` (use-toast.ts:137-164, exported at 186). `Toast = Omit<ToasterToast, "id">` (use-toast.ts:135, not exported).
  - `useToast(): { toasts: ToasterToast[]; toast; dismiss(toastId?: string): void }` (use-toast.ts:166-184, exported at 186).
  - `ToasterToast = ToastProps & { id; title?; description?; action? }` (use-toast.ts:8-13, not exported). Constants `TOAST_LIMIT = 1`, `TOAST_REMOVE_DELAY = 1000000` (use-toast.ts:5-6, module-private).
- Inputs & outputs: state lives in module-level `memoryState` (use-toast.ts:126) with a module-level `listeners` array (use-toast.ts:124) and `toastTimeouts` Map (use-toast.ts:53). Type-only input from `@/components/ui/toast` (`ToastProps`, `ToastActionElement`, use-toast.ts:3). No network, tables, buckets, localStorage, or env vars.
- Dependencies: uses -> `react` (use-toast.ts:1); type import from src/components/ui/toast.tsx (C01 ui-kit-shadcn, use-toast.ts:3). used by <- (grep-verified) src/components/ui/use-toast.ts:1 (C01; pure re-export of `useToast`/`toast`, which itself has zero importers — grep for `ui/use-toast` outside that file returns nothing), src/components/ui/toaster.tsx:1 (C01; renders the store, mounted app-wide via src/app/providers.tsx:5,19 — A01), src/components/LabeledQRCode.tsx:5 (C16 ui-utility-primitives), src/views/Calendar.tsx:53 (V01 admin-entity-views), src/views/QRCodes.tsx:11 (V02 admin-ops-and-template-views). An untracked working-tree duplicate `src/views/Calendar 2.tsx:33` also matches (not in git; `git ls-files` returns nothing for it). The `reducer` export has no consumers outside the file (grep-verified).
- Side effects: `DISMISS_TOAST` schedules a `setTimeout` per toast id for `TOAST_REMOVE_DELAY` ms that later dispatches `REMOVE_TOAST` (use-toast.ts:55-69) — a side effect inside the reducer, flagged by its own comment (use-toast.ts:88-89); every `dispatch` synchronously notifies all registered listeners (use-toast.ts:128-133); `useToast` pushes/splices its `setState` into the module `listeners` array in an effect (use-toast.ts:169-177).
- Error handling: none — no failure paths, no try/catch; the reducer's switch covers all four action types with no default.
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - `TOAST_LIMIT = 1` (use-toast.ts:5): `ADD_TOAST` slices to one toast (use-toast.ts:76), so a new toast displaces any visible one.
  - `TOAST_REMOVE_DELAY = 1000000` ms ≈ 16.7 minutes (use-toast.ts:6): dismissed toasts stay in state (with `open: false`) for that long before removal; scheduled timeouts are never cancelled anywhere in the file.
  - The `useToast` subscription effect lists `[state]` as its dependency (use-toast.ts:177), so the listener is spliced out and re-pushed on every state change rather than once per mount.
  - Coexists with the `sonner` toast system used by 82 other files (see unit header).
- ASSUMED: shadcn/ui origin of the file (naming + pattern); not verified against upstream.

## src/hooks/useUndoStack.ts

- Purpose: In-memory bounded (10-entry) undo stack of pin actions, with a `pendingUndo` slot the consumer can surface in a toast.
- Public surface:
  - `type UndoAction = { type: 'delete' | 'add' | 'move' | 'status_change'; pinId: string; previousData?: any; description: string; timestamp: number }` (useUndoStack.ts:3-9, exported).
  - `useUndoStack(): { undoStack: UndoAction[]; pendingUndo: UndoAction | null; pushAction(action: Omit<UndoAction, 'timestamp'>): void; popAction(): UndoAction | undefined; clearPendingUndo(): void; canUndo: boolean }` (useUndoStack.ts:13, return 45-52). Module-private `MAX_UNDO_STACK = 10` (useUndoStack.ts:11).
- Inputs & outputs: pure per-instance React state (two `useState`, useUndoStack.ts:14-15); `pushAction` stamps `Date.now()` (useUndoStack.ts:20). No tables, buckets, localStorage, or env vars.
- Dependencies: uses -> `react` (useUndoStack.ts:1) only. used by <- src/components/InteractiveFloorPlan.tsx:16 (C12 floor-plan-annotation; imports both the hook and the `UndoAction` type) — sole consumer (grep-verified).
- Side effects: none beyond local state updates.
- Error handling: none. `popAction` on an empty stack destructures an empty array and returns `undefined` with no guard (useUndoStack.ts:32-37); `setUndoStack(rest)` still runs, setting the stack to `[]`.
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - `popAction`'s `useCallback` depends on `undoStack` (useUndoStack.ts:37), so its identity changes on every push/pop, unlike the stable `pushAction`/`clearPendingUndo` (useUndoStack.ts:30,41).
  - `previousData` is typed `any` (useUndoStack.ts:6).
  - The stack silently drops the oldest entry past 10 (`slice(0, MAX_UNDO_STACK)`, useUndoStack.ts:24).
- ASSUMED: the "toast" purpose of `pendingUndo` is taken from the in-file comment "Set as pending undo for toast" (useUndoStack.ts:28); actual toast wiring lives in the consumer and was not traced.

## src/hooks/usePDFTemplate.ts

- Purpose: Fetches the default `pdf_report_templates` row for one of five report types and exposes it plus a customization-merge helper.
- Public surface:
  - `usePDFTemplate(reportType: ReportType): { template: PDFTemplate | null; loading: boolean; error: string | null; getCustomization(overrides?: Partial<ReportCustomization>): ReportCustomization; sections: ReportSection[] }` (usePDFTemplate.ts:15, return 77-83).
  - `interface PDFTemplate { id: string; name: string; report_type: string; customization: ReportCustomization; sections: ReportSection[] }` (usePDFTemplate.ts:5-11, exported as type at 86).
  - `type ReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance'` (usePDFTemplate.ts:13, exported as type at 86).
- Inputs & outputs: reads Supabase table `pdf_report_templates` with `.eq("report_type", reportType).eq("is_default", true).single()` (usePDFTemplate.ts:26-31); parses `customization`/`sections` when they arrive as JSON strings (usePDFTemplate.ts:43-51). Output is the parsed template plus merged customization; `getCustomization` layers `template.customization || DEFAULT_CUSTOMIZATION`, then `sections`, then caller overrides (usePDFTemplate.ts:66-75). No other stores.
- Dependencies: uses -> `@/integrations/supabase/client` (L19 supabase-data-access, usePDFTemplate.ts:2); `ReportCustomization`, `ReportSection`, `DEFAULT_CUSTOMIZATION` from `@/components/pdf-editor/types` (C04 pdf-editor, usePDFTemplate.ts:3). used by <- none found (grep-verified: `grep -rn "from ['\"]@/hooks/usePDFTemplate['\"]"` across src and supabase returns nothing; every "usePDFTemplate" substring hit is the Gateway module).
- Side effects: one Supabase select per `reportType` change (effect at usePDFTemplate.ts:20-63); `console.error("Error fetching PDF template:", err)` on failure (usePDFTemplate.ts:55).
- Error handling: fetch error code `PGRST116` → `template = null` and early return, no error state (usePDFTemplate.ts:33-38); any other error is thrown to the catch, which logs and sets `error = err.message` (usePDFTemplate.ts:54-56); `loading` cleared in `finally` (usePDFTemplate.ts:57-59). On the null-template path `getCustomization` falls back to `DEFAULT_CUSTOMIZATION` and `[]` (usePDFTemplate.ts:67-68).
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - Zero importers (grep-verified) while duplicating the Gateway's query verbatim (usePDFTemplate.ts:26-31 vs usePDFTemplateGateway.ts:233-238) with a 5-type subset of the Gateway's 7 report types.
  - In `getCustomization`, `sections` is spread before `...overrides` (usePDFTemplate.ts:70-74), so an `overrides.sections` value would replace the template's sections.
- ASSUMED: `PGRST116` is treated per the in-file comment "If no template found, use defaults" (usePDFTemplate.ts:34); the PostgREST semantics of that code were not independently verified.

## src/hooks/usePDFTemplateGateway.ts

- Purpose: Self-described "MANDATORY entry point for all PDF report generation" (usePDFTemplateGateway.ts:4) — loads per-report-type template config from `pdf_report_templates`, layering hardcoded defaults and an accent-color palette, in both hook and standalone-async forms with section/column/KPI visibility helpers.
- Public surface:
  - `type TemplateReportType = 'site_summary' | 'inspection' | 'floor_plan' | 'asset_verification' | 'compliance' | 'coc_validation' | 'comprehensive_inspection'` (usePDFTemplateGateway.ts:20-27).
  - `interface PDFTemplateConfig { id: string; name: string; reportType: TemplateReportType; customization: ReportCustomization; sections: ReportSection[]; isDefault: boolean }` (usePDFTemplateGateway.ts:29-36).
  - `interface AccentColors { primary: string; light: string; dark: string; rgb: string }` (usePDFTemplateGateway.ts:38-43).
  - `interface UsePDFTemplateGatewayResult` — template/loading/error, computed `customization`, `enabledSections`, `accentColors`, helpers `isSectionEnabled(sectionId)`, `getSectionTitle(sectionId)`, `getSectionOrder(sectionId)`, `getColumnVisibility(sectionId, columnId)`, `getKpiVisibility(sectionId, kpiId)`, `mergeCustomization(overrides)`, `refetch()` (usePDFTemplateGateway.ts:194-217).
  - `usePDFTemplateGateway(reportType: TemplateReportType): UsePDFTemplateGatewayResult` (usePDFTemplateGateway.ts:223, return 329-344).
  - `async fetchPDFTemplate(reportType: TemplateReportType): Promise<{ customization: ReportCustomization; sections: ReportSection[]; accentColors: AccentColors }>` (usePDFTemplateGateway.ts:350).
  - `getAccentColorPalette(colorName: string): AccentColors` (usePDFTemplateGateway.ts:424-426).
  - Module-private data: `ACCENT_COLOR_PALETTE` (5 colors, usePDFTemplateGateway.ts:46-77) and `DEFAULT_TEMPLATES` (per-type cover titles, accent colors, section lists for all 7 types, usePDFTemplateGateway.ts:80-192).
- Inputs & outputs: reads Supabase table `pdf_report_templates` (`report_type` + `is_default=true` + `.single()`; hook at usePDFTemplateGateway.ts:233-238, standalone at 358-363). Customization merge order in both paths: `DEFAULT_CUSTOMIZATION` < `DEFAULT_TEMPLATES[reportType].customization` < db row customization, with `sections` taken db-first then defaults (usePDFTemplateGateway.ts:278-283, 377-382). `enabledSections` = enabled, sorted by `order` (usePDFTemplateGateway.ts:286-289). Unknown accent names resolve to blue (usePDFTemplateGateway.ts:292, 388, 425). No other stores.
- Dependencies: uses -> `@/integrations/supabase/client` (L19, usePDFTemplateGateway.ts:16); `ReportCustomization`, `ReportSection`, `DEFAULT_CUSTOMIZATION` from `@/components/pdf-editor/types` (C04, usePDFTemplateGateway.ts:17). used by <- (grep-verified, all importing `fetchPDFTemplate` and/or types, none importing the hook): src/components/SiteSummaryReport.tsx:24 (C14 reports-dashboards; calls `fetchPDFTemplate('site_summary')` at :115), src/lib/floorPlanReportGenerator.ts:25 (L10 pdf-report-generators; `fetchPDFTemplate('floor_plan')` at :79, also imports `AccentColors`), src/lib/complianceReportGenerator.ts:34 (L10; `fetchPDFTemplate('compliance')` at :79), src/lib/pdfTemplateTestRunner.ts:13 (L15 pdf-report-renderers; also imports `TemplateReportType`), src/views/PDFTemplateTestDashboard.tsx:33 (V02 admin-ops-and-template-views; also imports `TemplateReportType`). The React hook `usePDFTemplateGateway(` and `getAccentColorPalette` have zero callers outside the file (grep-verified).
- Side effects: Supabase select on mount and on `reportType` change (usePDFTemplateGateway.ts:273-275), re-runnable via `refetch` (usePDFTemplateGateway.ts:342); console.log diagnostics in the no-template hook path (usePDFTemplateGateway.ts:243) and throughout `fetchPDFTemplate` (fetch announce :355, db result :370-375, final config :391-396, defaults notice :410); `console.error` on failure in both paths (usePDFTemplateGateway.ts:266, 400).
- Error handling: hook — `PGRST116` → `template = null` plus "using defaults" log, no error state (usePDFTemplateGateway.ts:240-246); other errors → `error = err.message` (usePDFTemplateGateway.ts:265-267), while the computed `customization`/`sections` still fall back to `DEFAULT_TEMPLATES` (usePDFTemplateGateway.ts:278-286); `loading` cleared in `finally` (usePDFTemplateGateway.ts:268-270). Standalone — `PGRST116` swallowed (usePDFTemplateGateway.ts:365-367); any thrown error is caught and full defaults are returned with the blue palette (`DEFAULT_TEMPLATES[reportType] || DEFAULT_TEMPLATES.site_summary`, usePDFTemplateGateway.ts:399-417) — the promise never rejects. Section helpers default to visible/`true` when a section/column/KPI id is unknown (usePDFTemplateGateway.ts:295-320); `getSectionOrder` returns `999` for unknown ids (usePDFTemplateGateway.ts:307).
- Tests: no vitest test file references this module (grep-verified, see unit header). Runtime-only coverage exists in the in-app harness src/lib/pdfTemplateTestRunner.ts (L15), which calls `fetchPDFTemplate` and checks its returned structure/fallbacks (pdfTemplateTestRunner.ts:213-215, 240, 255, 363, 542), surfaced by src/views/PDFTemplateTestDashboard.tsx:139 (V02); these are not part of the vitest suite.
- Observed issues:
  - The header mandate "Every report generator MUST use this hook" (usePDFTemplateGateway.ts:4-6) vs zero callers of the hook itself; production consumers use only the standalone `fetchPDFTemplate`, and only for 3 of the 7 report types (`site_summary`, `floor_plan`, `compliance` — SiteSummaryReport.tsx:115, floorPlanReportGenerator.ts:79, complianceReportGenerator.ts:79).
  - In `fetchPDFTemplate`, `customization.sections` is assigned the raw `data?.sections` value (usePDFTemplateGateway.ts:381) without the string→JSON parse that the separately returned `sections` value receives (usePDFTemplateGateway.ts:384-386): if the column arrives as a JSON string, the two returned section representations differ.
  - Duplicates usePDFTemplate.ts's query and role (see unit header).
- ASSUMED: `PGRST116` handling follows the in-file comment "If no template found, use defaults - this is not an error" (usePDFTemplateGateway.ts:241-242); PostgREST semantics not independently verified. Whether `pdf_report_templates.customization`/`sections` are ever actually delivered as strings (vs jsonb objects) was not verified against the live schema — the string-parse branches (usePDFTemplateGateway.ts:256-261, 380-386; usePDFTemplate.ts:43-51) are defensive code whose live behavior was not observed.
