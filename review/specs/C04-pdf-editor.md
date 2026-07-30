# C04 — pdf-editor

- Unit id: C04
- Slug: pdf-editor
- Spec mode: full (per-file)
- Date: 2026-07-29
- Files: 7 (matches `review/unit-files.json` key "C04")

## Unit header

**Unit purpose.** A self-contained report-customization UI: a dialog (`PDFReportEditor`) that lets a user edit cover-page fields, toggle/reorder/edit report sections, and set document options before handing a `ReportCustomization` object to caller-supplied `onGenerate`/`onPreview` callbacks. The unit also defines the shared `ReportCustomization`/`ReportSection` type model in `types.ts`.

**Module-level observations (cross-file, verified).**
- Internal wiring: `PDFReportEditor.tsx` imports the other four components (PDFReportEditor.tsx:27-30) and the types (PDFReportEditor.tsx:31-35); every component imports `./types`; `index.ts` re-exports all five components plus `export * from "./types"` (index.ts:2-7).
- External consumption is types-only: exactly six files outside the unit import from this directory, and all six import `@/components/pdf-editor/types` — none imports the barrel `@/components/pdf-editor` or any component file (grep `pdf-editor` over `src` and `supabase`: only the six `/types` import lines plus intra-unit files).
- Consequently the five component files, including the top-level `PDFReportEditor` dialog, have zero importers outside the unit (grep-verified) — the editor UI is not mounted anywhere in the app.
- No test file anywhere in the repo references `pdf-editor` (grep over `src` including `*.test.*`: zero hits).
- `SectionEditor.tsx` uses Tailwind classes `bg-warning/10` (SectionEditor.tsx:128, 252), `ring-warning` (:231), and `text-warning-foreground` (:252); `tailwind.config.ts` defines no `warning` color token (colors block tailwind.config.ts:16-60; sole plugin `tailwindcss-animate` tailwind.config.ts:90), although CSS variables `--warning`/`--warning-foreground` exist in src/index.css:53-54, 101.
- All UI primitives come from `@/components/ui/*` (unit C01); `cn` comes from `src/lib/utils.ts` (unit L18).

**External contract.** What the rest of the app actually gets from C04 (all grep-verified):
- `ReportCustomization`, `ReportSection` types and `DEFAULT_CUSTOMIZATION` constant, imported by:
  - C14 `src/components/SiteSummaryReport.tsx:23`
  - C05 `src/components/settings/PDFTemplatePreview.tsx:2`
  - H04 `src/hooks/usePDFTemplate.ts:3` (incl. `DEFAULT_CUSTOMIZATION`)
  - H04 `src/hooks/usePDFTemplateGateway.ts:17` (incl. `DEFAULT_CUSTOMIZATION`)
  - L15 `src/lib/pdfTemplateTestRunner.ts:12`
  - L15 `src/lib/siteSummaryRenderSpec.ts:22`
- Nothing else: no component, no barrel, no other type is consumed externally.

---

## src/components/pdf-editor/CoverPageEditor.tsx

- Purpose: Card-based form for the cover-page fields of a `ReportCustomization` (title, subtitle, date/reference toggles) with a static inline text preview.
- Public surface: `CoverPageEditor: React.FC<CoverPageEditorProps>` (CoverPageEditor.tsx:17); props `{ customization: ReportCustomization; onChange: (updates: Partial<ReportCustomization>) => void; siteName: string; clientName: string }` (:10-15). `CoverPageEditorProps` itself is not exported.
- Inputs & outputs: reads `customization.coverTitle/.coverSubtitle/.includeDate/.includeReference` (:36, :46, :56, :67); emits `onChange` partials for those four keys (:37, :47, :57, :68). Preview block renders `coverTitle || 'Report Title'`, `coverSubtitle`, `siteName`, `clientName` (:79-82). No stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/components/ui/{card,input,label,textarea,switch}` (C01), `lucide-react` (`FileText`), `./types` (:8). used by <- `PDFReportEditor.tsx:27` (C04, intra-unit); re-exported by `index.ts:3`; none found outside the unit (grep-verified).
- Side effects: none; pure controlled component invoking the `onChange` prop.
- Error handling: none — no failure paths in the component.
- Tests: none found (grep-verified; no test file references this component).
- Observed issues:
  - `Textarea` is imported (:5) but never used in the component body.
- ASSUMED: none.

## src/components/pdf-editor/PDFReportEditor.tsx

- Purpose: Modal dialog orchestrating the whole customization flow — cover tab, section toggle/reorder/edit tab, options tab — and invoking caller-supplied generate/preview callbacks with the assembled `ReportCustomization`.
- Public surface: `PDFReportEditor: React.FC<PDFReportEditorProps>` (PDFReportEditor.tsx:48); props `{ open: boolean; onOpenChange: (open: boolean) => void; siteName: string; clientName: string; reportType: "site-summary" | "asset-verification" | "inspection"; initialSections: ReportSection[]; onGenerate: (customization: ReportCustomization) => Promise<void>; onPreview?: (customization: ReportCustomization) => Promise<string> }` (:37-46). Module-private helpers `getDefaultTitle(reportType: string): string` (:314-325) and `getDefaultSubtitle(reportType: string): string` (:327-338).
- Inputs & outputs: props in; state out through `onGenerate(customization)` (:162) and `onPreview(customization)` (:151). Local state: `customization` (seeded from `DEFAULT_CUSTOMIZATION` + per-reportType title/subtitle + `initialSections`, :58-63), `editingSection`, `generating`, `previewing`, `hasChanges` (:65-68). A `useEffect` re-seeds all of it whenever `open`, `reportType`, or `initialSections` changes while open (:71-82). No stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/components/ui/{button,badge,scroll-area,tabs,separator,dialog}` (C01), `lucide-react`, `sonner` (`toast`, :25), intra-unit `./CoverPageEditor`, `./SectionToggle`, `./SectionEditor`, `./ReportOptionsPanel`, `./types` (:27-35). used by <- none found outside the unit (grep-verified); re-exported by `index.ts:2`, which also has no external importers.
- Side effects: `sonner` toasts — `toast.info("Reset to defaults")` (:143), `toast.error("Failed to generate preview")` (:153), `toast.success("Report generated successfully")` (:163), `toast.error("Failed to generate report")` (:166). Closes the dialog via `onOpenChange(false)` after a successful generate (:164). No network or storage of its own; all I/O is delegated to the callbacks.
- Error handling: `handlePreview` — try/catch, error object unused, toast.error, `previewing` reset in `finally` (:150-156). `handleGenerate` — try/catch, error object unused, toast.error, dialog stays open on failure, `generating` reset in `finally` (:161-169). `handleSectionMove` silently returns previous state if the id is not found or the move is out of range (:103, :106). No errors are rethrown or logged.
- Tests: none found (grep-verified).
- Observed issues:
  - Zero external importers (grep-verified): the dialog is not mounted anywhere in the app.
  - `Check` is imported from `lucide-react` (:21) but never used.
  - `onPreview` is typed `Promise<string>` (:45) but its resolved value is discarded — `await onPreview(customization)` (:151); nothing consumes the returned string.
  - `handleSectionMove` copies the sections array (:101) but writes `sections[index].order = …` on the section objects themselves (:109-111), mutating objects also referenced by the previous state value.
  - `SectionToggle` is rendered without an `onDelete` prop (:247-261), so the delete button inside `SectionToggle` (SectionToggle.tsx:101-110) is unreachable from this, its only in-repo caller.
  - The Tabs default is `"sections"` (:210) while the tab list is ordered Cover Page / Sections / Options (:213-224).
- ASSUMED: toast calls display only if a sonner `<Toaster>` is mounted elsewhere in the tree (not verified from this unit).

## src/components/pdf-editor/ReportOptionsPanel.tsx

- Purpose: "Options" tab content — accent-color swatch picker, table-of-contents/page-number/watermark switches, and executive-summary/report-notes textareas.
- Public surface: `ReportOptionsPanel: React.FC<ReportOptionsPanelProps>` (ReportOptionsPanel.tsx:30); props `{ customization: ReportCustomization; onChange: (updates: Partial<ReportCustomization>) => void }` (:17-20). Module-private `ACCENT_COLORS` const of 5 entries `{ value, label, color }` (:22-28) whose `value`s match the `accentColor` union in types.ts:50.
- Inputs & outputs: reads `accentColor`, `includeTableOfContents`, `includePageNumbers`, `includeWatermark`, `watermarkText`, `executiveSummary`, `customNotes`; emits `onChange` partials for each (:56, :82, :95, :109, :116, :136, :154). Watermark text input renders only while `includeWatermark` is true (:113-120). No stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/components/ui/{card,label,switch,input,textarea,select}` (C01), `lucide-react`, `./types` (:15). used by <- `PDFReportEditor.tsx:30` (C04, intra-unit); re-exported by `index.ts:6`; none found outside the unit (grep-verified).
- Side effects: none; pure controlled component.
- Error handling: none — no failure paths.
- Tests: none found (grep-verified).
- Observed issues:
  - `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` are imported (:7-13) but never used.
  - The swatch `<button>` elements have no `type` attribute (:49-58), so they default to `type="submit"`.
- ASSUMED: none.

## src/components/pdf-editor/SectionEditor.tsx

- Purpose: Inline editor for one `ReportSection` — cell-by-cell table editing over `section.data.rows`, a click-to-edit text block for `section.data.content`, and a per-section notes textarea.
- Public surface: `SectionEditor: React.FC<SectionEditorProps>` (SectionEditor.tsx:35); props `{ section: ReportSection; onUpdate: (sectionId: string, updates: Partial<ReportSection>) => void; onClose: () => void }` (:29-33).
- Inputs & outputs: reads `section.title` (:248), `section.type` (:265-267), `section.data` (rows/columns/content, :43-44, :102, :109, :116, :203), `section.notes` (:42). Emits `onUpdate(section.id, { data })` after each field save/reset (:69, :93) and `onUpdate(section.id, { notes })` on every notes keystroke (:96-99). Local state: `editingField`, `tempValue`, `notes`, `editedData` (seeded from `section.data || {}`), `changes: Set<string>` (:40-46). No stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/components/ui/{card,input,label,textarea,button,badge,scroll-area,separator,table}` (C01), `lucide-react`, `./types` (`ReportSection`, `EditableField`, :26), `@/lib/utils` `cn` (L18, :27). used by <- `PDFReportEditor.tsx:29` (C04, intra-unit); re-exported by `index.ts:5`; none found outside the unit (grep-verified).
- Side effects: none beyond the `onUpdate`/`onClose` callbacks; keyboard handling saves on Enter and cancels on Escape while editing a cell (:138-141).
- Error handling: none — no try/catch anywhere. `renderTableEditor` returns `null` when `section.data?.rows` is absent (:102); `resetField` dereferences intermediate path segments without guards (`current = current[parts[i]]`, :81-83), so a missing intermediate would throw a TypeError at runtime. Section types `"kpi"` and `"chart"` match no render branch (:265-267), producing an empty editing area.
- Tests: none found (grep-verified).
- Observed issues:
  - `EditableField` is imported (:26) but never used.
  - `saveField` shallow-copies only the top level (`{ ...editedData }`, :54) then writes through nested references (:58-63), mutating row objects that are shared with the original `section.data` passed in via props.
  - `resetField` reads the "original" value from `section.data?.rows?.[rowIdx]?.[key]` (:173) — the same structure the shared-reference writes in `saveField` can already have mutated.
  - Saved cell values are always strings: `current[parts[parts.length - 1]] = tempValue` where `tempValue` is `String(currentValue || "")` (:50, :63), regardless of the original value's type.
  - Table headers come from `section.data.columns` (:109) while body cells iterate `Object.entries(row)` (:118); nothing aligns the two, so header count and cell count agree only if every row's key count equals `columns.length`.
  - Row/column `key`s are array indices (:110, :117, :125).
  - Uses `warning` Tailwind classes with no `warning` color token configured (see unit header; :128, :231, :252).
- ASSUMED: none.

## src/components/pdf-editor/SectionToggle.tsx

- Purpose: One row in the sections list — enable/disable switch, title and type caption, and edit / move-up / move-down / delete buttons.
- Public surface: `SectionToggle: React.FC<SectionToggleProps>` (SectionToggle.tsx:21); props `{ section: ReportSection; onToggle: (id: string, enabled: boolean) => void; onMoveUp?: () => void; onMoveDown?: () => void; onEdit?: () => void; onDelete?: () => void; canMoveUp?: boolean; canMoveDown?: boolean; isEditing?: boolean }` with defaults `canMoveUp = true`, `canMoveDown = true`, `isEditing = false` (:9-19, :28-30).
- Inputs & outputs: reads `section.id/.enabled/.title/.type/.editable`; emits `onToggle(section.id, checked)` (:49) and the optional callbacks from their buttons. Disabled sections render at reduced opacity (:37-38); `isEditing` adds a primary ring (:39). No stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> `@/components/ui/{switch,label,button}` (C01), `lucide-react`, `@/lib/utils` `cn` (L18, :6), `./types` (:7). used by <- `PDFReportEditor.tsx:28` (C04, intra-unit); re-exported by `index.ts:4`; none found outside the unit (grep-verified).
- Side effects: none; pure controlled component.
- Error handling: none. Edit button renders only when `section.editable && onEdit` (:68) and is disabled while the section is disabled (:74); move buttons are disabled via `canMoveUp`/`canMoveDown` (:86, :95); delete button renders only when `onDelete` is provided (:101).
- Tests: none found (grep-verified).
- Observed issues:
  - The grip handle has `cursor-grab` styling (:42-44) but no drag handlers — reordering happens only through the chevron buttons.
  - `onDelete` is never passed by the component's only in-repo caller (PDFReportEditor.tsx:247-261), so the delete branch (:101-110) is dead in the current app.
- ASSUMED: none.

## src/components/pdf-editor/index.ts

- Purpose: Barrel re-exporting the five components and everything in `types.ts`.
- Public surface: named re-exports `PDFReportEditor`, `CoverPageEditor`, `SectionToggle`, `SectionEditor`, `ReportOptionsPanel` (index.ts:2-6) and `export * from "./types"` (:7).
- Inputs & outputs: none — pure re-export module.
- Dependencies: uses -> the six sibling files (all C04). used by <- none found (grep-verified: no import of `@/components/pdf-editor` without a `/types` or component suffix exists in `src` or `supabase`; external consumers import `@/components/pdf-editor/types` directly).
- Side effects: none.
- Error handling: n/a.
- Tests: none found (grep-verified).
- Observed issues:
  - Zero importers of the barrel (grep-verified); the only externally consumed module in the directory (`types.ts`) is reached by direct path, bypassing this file.
- ASSUMED: none.

## src/components/pdf-editor/types.ts

- Purpose: Type model for the report-customization feature plus the `DEFAULT_CUSTOMIZATION` seed constant.
- Public surface:
  - `interface TableColumn { id: string; label: string; field: string; visible: boolean; width?: number }` (types.ts:3-9)
  - `interface KPIItem { id: string; label: string; field: string; visible: boolean; color?: 'blue'|'green'|'orange'|'red'|'purple'|'muted' }` (:11-17)
  - `interface ReportSection { id: string; title: string; type: 'summary'|'table'|'kpi'|'text'|'chart'; enabled: boolean; order: number; editable: boolean; data?: any; notes?: string; columns?: TableColumn[]; kpiItems?: KPIItem[]; textContent?: string }` (:19-37)
  - `interface ReportCustomization { coverTitle: string; coverSubtitle: string; includeDate: boolean; includeReference: boolean; sections: ReportSection[]; accentColor: 'blue'|'green'|'orange'|'red'|'purple'; executiveSummary: string; customNotes: string; includeTableOfContents: boolean; includePageNumbers: boolean; includeWatermark: boolean; watermarkText: string }` (:39-61)
  - `interface EditableField { id: string; path: string; label: string; value: string|number; originalValue: string|number; type: 'text'|'number'|'select'|'textarea'; options?: string[]; changed: boolean }` (:63-72)
  - `interface ReportPreviewState { loading: boolean; previewUrl: string|null; error: string|null }` (:74-78)
  - `const DEFAULT_CUSTOMIZATION: ReportCustomization` — coverTitle 'Site Report', coverSubtitle 'Comprehensive Analysis', includeDate/includeReference true, `sections: []`, accentColor 'blue', empty summary/notes, TOC false, page numbers true, watermark off with text 'DRAFT' (:80-93).
- Inputs & outputs: pure declarations + one constant; no stores, tables, buckets, storage keys, or env vars.
- Dependencies: uses -> nothing (zero imports). used by <- (all grep-verified) intra-unit: all five component files (CoverPageEditor.tsx:8, PDFReportEditor.tsx:31-35, ReportOptionsPanel.tsx:15, SectionEditor.tsx:26, SectionToggle.tsx:7) and `index.ts:7`; external: C14 `src/components/SiteSummaryReport.tsx:23`, C05 `src/components/settings/PDFTemplatePreview.tsx:2`, H04 `src/hooks/usePDFTemplate.ts:3`, H04 `src/hooks/usePDFTemplateGateway.ts:17`, L15 `src/lib/pdfTemplateTestRunner.ts:12`, L15 `src/lib/siteSummaryRenderSpec.ts:22`. External imports are limited to `ReportCustomization`, `ReportSection`, and `DEFAULT_CUSTOMIZATION`.
- Side effects: none.
- Error handling: n/a.
- Tests: none found (grep-verified); consumers' behavior around these types is exercised elsewhere (e.g. `pdfTemplateTestRunner.ts` builds `ReportSection` fixtures at :410, :436) but no test asserts anything about this file itself.
- Observed issues:
  - `TableColumn`, `KPIItem`, `EditableField`, and `ReportPreviewState` have no importers outside the unit (grep-verified), and inside the unit `EditableField` is imported yet unused (SectionEditor.tsx:26) while `TableColumn`/`KPIItem`/`ReportPreviewState` are referenced only by `ReportSection`'s optional fields or not at all.
  - Two other exported interfaces named `TableColumn` with different shapes exist: `src/lib/pdfMakeUtils.ts:498` and `src/lib/pdfTemplates.ts:387` (both L14).
  - A second exported `ReportSection` with a different shape exists at `src/components/site/ReportSettingsDialog.tsx:28` (C08), which also exports `getDefaultReportSections()` (:135) — same names, unrelated structures, both consumed in the codebase.
  - `ReportSection.data` is typed `any` (:26); all of `SectionEditor`'s table/text editing flows through it untyped.
  - `DEFAULT_CUSTOMIZATION.sections` is `[]` (:85); every consumer that spreads it must supply its own sections.
- ASSUMED: none.
