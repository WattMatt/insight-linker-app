# Components — Inspection-Report / PDF-Editor / PDF-Preview

Scope: per-symbol ground-truth docs for the three report-UI component directories — `src/components/inspection-report/` (WYSIWYG report pages), `src/components/pdf-editor/` (report-customization dialog + shared report types), and `src/components/pdf-preview/` (subsection card preview). **16 files covered.** Every entry cites `file:line`. Render/save behaviour cross-references [06-flows/pdf-report-pipeline.md](../06-flows/pdf-report-pipeline.md) (esp. §1 renderer table, §5 inspection path, §6 trust boundaries) — not re-derived here.

---

## Directory map / pipeline placement

| Dir | Strategy | Pipeline tie-in |
|---|---|---|
| `inspection-report/` | WYSIWYG **html2canvas → jsPDF** (`wysiwygPdfGenerator.ts`) | pdf-report-pipeline §1 "Inspection (WYSIWYG)" row — client blob only, **download, never persists**. The only fully-offline-capable render (§6 Offline). |
| `pdf-editor/` | UI only — produces a `ReportCustomization` object | `types.ts` is the **shared report-config schema** imported by the template gateway, render specs, and 14 settings/preview files (see callers). The `PDFReportEditor` dialog itself is reachable only from `SiteExport.tsx`. |
| `pdf-preview/` | React mirror of the pdfmake subsection card | `SubsectionCard`/`SubsectionGrid` duplicate `lib/pdfSubsectionRenderer.renderSubsectionGrid` layout; **no JSX caller found** (dead — see NOTES). |

---

## `src/components/inspection-report/`

WYSIWYG A4-page components. Each renders into a fixed `210mm × 297mm` white `div` (the page frames live in `InspectionReportPreview`), captured by `generatePdfFromPages`. All image tags use `crossOrigin="anonymous"` (needed for html2canvas/canvas taint) and most have an `onError` hide-on-broken handler.

### `index.ts`
Barrel re-export. Exports `InspectionReportPreview` + the 5 page components, and re-exports the 5 data types (`InspectionReportData`, `InspectionSection`, `InspectionTenant`, `InspectionSnag`, `InspectionSignature`) from `InspectionReportPreview` (`index.ts:6-20`).

### `InspectionReportPreview.tsx`
The orchestrator: assembles all pages, computes dashboard stats, drives PDF generation/download.

**Exported types** (`:18-69`):
| Type | Key fields |
|---|---|
| `InspectionSection` | `title`; `items[]` (`label, value, type?, notes?, photos?[]`) |
| `InspectionTenant` | `shopName, shopNumber?, meterSerialNumber?, breakerSize?, ctSizeAndRatio?, meterImage?, breakerImage?, ctRatioImage?` |
| `InspectionSnag` | `title, description?, status, riskLevel?, photos?[]` |
| `InspectionSignature` | `name, role, signatureUrl?, signedAt?` |
| `InspectionReportData` | top-level report payload: `templateName, subsectionName, siteName, clientName?, logoUrl?, inspectorName?, inspectionDate?, status?, qualityRating?, sections[], tenants?[], snags?[], signatures?[]` |

**`InspectionReportPreview({ data, onPdfGenerated? })`** (`:81`) — default export (`:323`) + named.
| Prop | Type | Meaning |
|---|---|---|
| `data` | `InspectionReportData` | full report content |
| `onPdfGenerated?` | `(result:{success,url?,blob?,error?})=>void` | callback after generate/download attempt |

- **State/refs:** `containerRef`, `pagesRef` (array of page `div`s), `isGenerating`, `imagesLoaded`.
- **`calculateStats()`** (`:88-111`) — local helper; tallies `totalItems / passedItems / failedItems / pendingItems / totalPhotos` by lowercasing `item.value` (`pass|passed|compliant` → passed; `fail|failed|non-compliant` → failed; non-`n/a` → pending). ⚠️ This pass/fail bucketing is **duplicated** in `QualityDashboard` (score) and `SectionPage` (badge) — three independent copies of the same value-string vocabulary.
- **Effect** (`:119-125`) — on `data` change, `waitForImages(containerRef)` → sets `imagesLoaded` (gates the download button).
- **`handleGeneratePdf`** (`:127-167`) — 500 ms settle, collect non-null `pagesRef`, `generatePdfFromPages(validPages, { scale:2, quality:0.95, onProgress })` (`wysiwygPdfGenerator.ts:26`); on success builds `Inspection_Report_{ISO-ts}.pdf` and `downloadBlob` (`fileDownload.ts`). Always fires `onPdfGenerated`. No upload / no DB write (matches pipeline §1: WYSIWYG persists nothing).
- **Renders:** Download button (disabled until `imagesLoaded`) + scrollable page stack: Cover → QualityDashboard → one `SectionPage` per section → optional `TenantSection` → optional `SnagSection` → SignaturePage. `pageIndex` (`:170`) increments per frame to register refs.
- **Callers:** `ComprehensiveInspectionReport.tsx:339` (the only one) → itself rendered by `InspectionDetail.tsx:1985` and `subsection-detail/InspectionsTab.tsx:204`.

### `CoverPage.tsx`
`CoverPage(props)` (`:18`) — report cover. Internal `MetadataRow` helper (`:85`, not exported).
| Prop | Type | Meaning |
|---|---|---|
| `logoUrl?` | `string\|null` | company logo; falls back to dashed `[Company Logo]` placeholder |
| `templateName` | `string` | main title (defaults to "Inspection Report" if empty) |
| `subsectionName` | `string` | subtitle |
| `siteName` | `string` | metadata row |
| `clientName?`, `inspectorName?`, `status?` | `string` | conditional metadata rows |
| `inspectionDate?` | `string` | formatted `dd MMMM yyyy` via date-fns; defaults to today |

Renders accent bars + logo + title block + left-bordered metadata. Colors hard-coded (`#1e3a5f`, `#0d9488`) — **not** driven by the template accent color. Caller: `InspectionReportPreview:215`.

### `QualityDashboard.tsx`
`QualityDashboard(props)` (`:15`) — score ring + KPI grid. Internal `KPICard` helper (`:113`).
| Prop | Type | Meaning |
|---|---|---|
| `qualityRating?` | `number` | explicit score; else computed `round(passed/max(total,1)*100)` (`:23`) |
| `totalItems`/`passedItems`/`failedItems`/`pendingItems`/`totalPhotos` | `number` | KPI counts (from `calculateStats`) |

- `getScoreColor()` (`:26-30`): ≥80 → green/"COMPLIANT", ≥60 → yellow/"PARTIAL", else red/"NON-COMPLIANT".
- Renders SVG donut (`strokeDasharray={score*2.83} 283`), 4 KPI cards, and a **hard-coded** "complies with SANS 10142-1" notice (`:101`). NOTE: the SANS-compliance statement is static text, unrelated to the computed score — a passing or failing report both display it.
- Caller: `InspectionReportPreview:238`.

### `SectionPage.tsx`
`SectionPage({ sectionNumber, title, items })` (`:20`) — one checklist section page. Internal types `SectionItem`/`SectionPageProps` (`:6-18`, not exported).
- `getStatusBadge(value)` (`:22-34`) — color by lowercased value (pass/compliant → green, fail/non-compliant → red, n/a → gray, else blue). Third copy of the value vocabulary (see Preview note).
- Renders numbered header + per-item card (label, status badge, optional notes, photo grid capped at **6** with "+N more"). Caller: `InspectionReportPreview:261` (mapped per section).

### `TenantSection.tsx`
`TenantSection({ tenants })` (`:21`) — meter/breaker/CT verification cards. Internal `TenantCard` helper (`:48`) + local `Tenant`/`TenantSectionProps` types.
- Returns `null` when no tenants (`:22`).
- Each card: shop name/number header, up-to-3 detail fields (meter serial / breaker / CT ratio), and up-to-3 verification photos (meter/breaker/CT). Caller: `InspectionReportPreview:281` (conditional).

### `SnagSection.tsx`
`SnagSection({ snags })` (`:18`) — defect cards. Local `Snag`/`SnagSectionProps` types.
- Returns `null` when empty (`:19`).
- `getRiskBadge(risk)` (`:23`): high/critical → red, medium → yellow, else green. `getStatusBadge(status)` (`:34`): resolved/complete/closed → green, in_progress → blue, else orange. ⚠️ This snag-status vocabulary differs from the pipeline's compliance definition (open = not `rectified|closed`, pipeline §3) — here `resolved`/`complete` also count as closed; presentational only.
- Renders header (count), numbered snag cards (risk + status badges, description, ≤4 photos). Caller: `InspectionReportPreview:297` (conditional).

### `SignaturePage.tsx`
`SignaturePage({ signatures, reportDate })` (`:19`) — sign-off page. Local `Signature`/`SignaturePageProps` types.
- `formatRole(role)` (`:20-28`): maps inspector/contractor/client/witness to display labels.
- If `signatures` present → grid of signature cards (image-or-"pending", name, signed-at `dd/MM/yyyy HH:mm`); else renders 4 **blank placeholder** role cards (Inspector/Contractor/Client/Witness). Footer = hard-coded SANS 10142-1 declaration with `reportDate`. Caller: `InspectionReportPreview:312`.

---

## `src/components/pdf-editor/`

The report-customization dialog. The **`types.ts` schema is the load-bearing export** of this directory — imported by the template gateway hooks, render spec, test runner, and many settings/preview-renderer files. The dialog UI itself is reachable from one screen.

### `index.ts`
Barrel: exports `PDFReportEditor`, `CoverPageEditor`, `SectionToggle`, `SectionEditor`, `ReportOptionsPanel`, and `export * from "./types"` (`:2-7`).

### `types.ts`
Shared report-config schema + the default config constant.
| Export | Kind | Shape / purpose |
|---|---|---|
| `TableColumn` | interface | `{id,label,field,visible,width?}` — table-section column config |
| `KPIItem` | interface | `{id,label,field,visible,color?}` — KPI card config (`color` ∈ blue/green/orange/red/purple/muted) |
| `ReportSection` | interface | `{id,title,type:'summary'\|'table'\|'kpi'\|'text'\|'chart',enabled,order,editable,data?:any,notes?,columns?,kpiItems?,textContent?}` — a report section + per-type config |
| `ReportCustomization` | interface | full editable report config: cover (`coverTitle/coverSubtitle/includeDate/includeReference`), `sections[]`, `accentColor`, `executiveSummary`, `customNotes`, doc options (`includeTableOfContents/includePageNumbers/includeWatermark/watermarkText`) |
| `EditableField` | interface | `{id,path,label,value,originalValue,type:'text'\|'number'\|'select'\|'textarea',options?,changed}` — ⚠️ imported by `SectionEditor` but **unused** there; appears dead (see NOTES) |
| `ReportPreviewState` | interface | `{loading,previewUrl,error}` — ⚠️ no in-dir consumer found |
| `DEFAULT_CUSTOMIZATION` | const | default `ReportCustomization` (`:80-93`): title "Site Report", accent `blue`, page numbers on, watermark off ("DRAFT"), `sections:[]` |

**Callers of `types.ts`** (18 import sites): `PDFReportEditor.tsx`, `SiteExport.tsx`, `SiteSummaryReport.tsx`, `settings/PDFWYSIWYGEditor.tsx`, `settings/PDFTemplateManager.tsx`, `settings/PDFTemplatePreview.tsx`, all `settings/preview-renderers/*`, `hooks/usePDFTemplate.ts`, `hooks/usePDFTemplateGateway.ts`, `lib/pdfTemplateTestRunner.ts`, `lib/siteSummaryRenderSpec.ts`. This is the canonical report-config type (consistent with pipeline §2 template gateway, whose `customization`/`sections` JSONB mirror these shapes).

### `PDFReportEditor.tsx`
`PDFReportEditor(props)` (`:48`, `React.FC`) — modal dialog to customize a report before generate/preview. Three tabs (Cover / Sections / Options).
| Prop | Type | Meaning |
|---|---|---|
| `open` / `onOpenChange` | `boolean` / `(b)=>void` | dialog visibility |
| `siteName` / `clientName` | `string` | passed to cover editor preview |
| `reportType` | `'site-summary'\|'asset-verification'\|'inspection'` | seeds default title/subtitle |
| `initialSections` | `ReportSection[]` | starting section list |
| `onGenerate` | `(c:ReportCustomization)=>Promise<void>` | required generate handler |
| `onPreview?` | `(c:ReportCustomization)=>Promise<string>` | optional preview handler |

- **State:** `customization` (seeded from `DEFAULT_CUSTOMIZATION` + `getDefaultTitle/Subtitle(reportType)` + `initialSections`), `editingSection`, `generating`, `previewing`, `hasChanges`.
- **Effect** (`:71-82`): re-seeds `customization` whenever `open`/`reportType`/`initialSections` change (resets edits on reopen).
- **Handlers:** `updateCustomization` (partial merge + dirty), `handleSectionToggle`, `handleSectionMove(up/down)` (swaps `order` values **and** array positions, `:99-119`), `handleSectionUpdate`, `handleReset` (toast "Reset to defaults"), `handlePreview` (calls `onPreview`, toast on error), `handleGenerate` (calls `onGenerate`, success toast, closes dialog).
- **Derived:** `sortedSections` (by `order`), `enabledCount`.
- **Renders:** dialog with unsaved-changes badge + "N of M sections" badge; tabs render `CoverPageEditor` / (`SectionEditor` when editing one, else mapped `SectionToggle`s) / `ReportOptionsPanel`; footer Reset / Preview / Generate buttons.
- **Module helpers** (not exported): `getDefaultTitle(reportType)` (`:314`), `getDefaultSubtitle(reportType)` (`:327`).
- **Caller:** `site/SiteExport.tsx:124` (only). `onGenerate={handleGenerateWithCustomization}` (`SiteExport.tsx:131`). Per pipeline §1 note, `SiteExport`'s `SiteSummaryReport` route is ⚠️ UNVERIFIED for the live button — the live Site-Summary button is `GenerateFinalReportButton` (server path), so this editor's reach in production is limited.

### `CoverPageEditor.tsx`
`CoverPageEditor({ customization, onChange, siteName, clientName })` (`:17`, `React.FC`) — cover-tab form.
- Edits `coverTitle`, `coverSubtitle`, `includeDate`, `includeReference` via `onChange(partial)`. Shows a small live cover preview (title/subtitle/site/client). Caller: `PDFReportEditor:230`.

### `SectionToggle.tsx`
`SectionToggle(props)` (`:21`, `React.FC`) — one row in the sections list: enable switch, title/type, edit/move-up/move-down (and optional delete) buttons.
| Prop | Type | Meaning |
|---|---|---|
| `section` | `ReportSection` | the section |
| `onToggle` | `(id,enabled)=>void` | enable switch |
| `onMoveUp?`/`onMoveDown?` | `()=>void` | reorder |
| `onEdit?` | `()=>void` | open editor (only when `section.editable`) |
| `onDelete?` | `()=>void` | delete (⚠️ never wired by `PDFReportEditor` — no delete prop passed; dead branch) |
| `canMoveUp?`/`canMoveDown?` | `boolean` | gate move buttons (default `true`) |
| `isEditing?` | `boolean` | ring highlight |

Grip icon is decorative only (no drag handler). Caller: `PDFReportEditor:247`.

### `SectionEditor.tsx`
`SectionEditor({ section, onUpdate, onClose })` (`:35`, `React.FC`) — inline editor for one section's data + notes.
- **Local state:** `editingField`, `tempValue`, `notes`, `editedData` (clone of `section.data`), `changes:Set<string>`.
- **`saveField(fieldId)`** (`:53-70`) / **`resetField`** (`:77-94`): write into `editedData` by **dot-path** (`rows.0.value`), update `changes`, call `onUpdate(section.id,{data})`. `handleNotesChange` → `onUpdate(..,{notes})`.
- **`renderTableEditor`** (`:101`): editable table (`section.data.columns/rows`), per-cell click-to-edit with Enter=save / Esc=cancel, changed-cell highlight + per-cell reset. **`renderTextEditor`** (`:202`): used for both `text` and `summary` section types (`:266-267`).
- **Renders:** card titled "Editing: {title}", change-count badge, Done button, the type-specific editor (table/text/summary only — `kpi`/`chart` render nothing), and a Section-Notes textarea.
- NOTE: imports `EditableField` (`:26`) but never uses it. Edits are in-memory on `customization` only; no persistence (the parent's `onGenerate` carries the config onward). Caller: `PDFReportEditor:240`.

### `ReportOptionsPanel.tsx`
`ReportOptionsPanel({ customization, onChange })` (`:30`, `React.FC`) — options tab.
- Module const `ACCENT_COLORS` (`:22`, not exported): blue/green/orange/red/purple swatches.
- Controls: accent-color picker, Table-of-Contents / Page-Numbers / Watermark switches (+ conditional watermark-text input), Executive-Summary and Custom-Notes textareas — each via `onChange(partial)`. Caller: `PDFReportEditor:267`.

---

## `src/components/pdf-preview/`

### `SubsectionCard.tsx`
React mirror of the pdfmake subsection card, built on the shared `lib/subsectionCardSpec.ts` (same `CARD_LAYOUT`, `STATUS_COLORS`, `RISK_COLORS`, `getCocStatusLabel`, `getComplianceLabel`, `generateSubsectionQRCode`) so the on-screen preview matches the PDF layout.

**`SubsectionCard({ data, accentColor?, logoUrl? })`** (`:27`) — one subsection card.
| Prop | Type | Meaning |
|---|---|---|
| `data` | `SubsectionCardData` (`lib/subsectionCardSpec.ts:17`) | subsection content |
| `accentColor?` | `string` | default `#3b82f6` — ⚠️ accepted but **never applied** in the JSX (dead prop) |
| `logoUrl?` | `string\|null` | embedded into the QR via `generateSubsectionQRCode` |

- **State/effect:** `qrCodeDataUrl`; effect (`:30-36`) regenerates the QR when `data.qrCodeUrl`/`logoUrl` change.
- **COC color mapping** (`:39-43`): normalizes `data.cocStatus` → `pass`/`fail`/`pending` (approved/valid/pass → pass; rejected/invalid/fail/failed → fail) → `STATUS_COLORS`. Compliance footer color from `data.isCompliant` tri-state (`:44-48`). NOTE: this COC vocabulary matches the pipeline compliance definition (pipeline §3 `Approved|Valid|Pass`).
- **Renders:** header (name/tenant/category) · info column (COC status badge, COC #, metering/meter-S-N/CT-ratio) · QR code (or "No QR" placeholder) · snags section · compliance footer.
- **Internal helpers** (not exported): `StatusBadge` (`:202`), `getStatusIcon` (`:218`), `SnagsSection` (`:231`, caps display at `CARD_LAYOUT.maxSnagsShown` with "+N more").

**`SubsectionGrid({ subsections, accentColor?, logoUrl? })`** (`:298`) — stacked full-width list of `SubsectionCard`s.

NOTE — **dead/duplicate**: neither `SubsectionCard` nor `SubsectionGrid` is imported anywhere in `src` (grep found no JSX caller). The live subsection grid in the Site-Summary PDF is produced by `lib/pdfSubsectionRenderer.renderSubsectionGrid` (`SiteSummaryReport.tsx:447`), a separate pdfmake implementation built on the same `subsectionCardSpec`. This React pair appears to be an orphaned preview mirror.

---

## NOTES (notable findings)

- **Dead component pair (pdf-preview):** `SubsectionCard` / `SubsectionGrid` (`pdf-preview/SubsectionCard.tsx:27,298`) have **no importer/JSX caller** in `src`. The PDF uses the parallel `lib/pdfSubsectionRenderer.renderSubsectionGrid` instead. Duplicate layout logic, orphaned. (Adds to the dead-code register alongside pipeline §7.)
- **Dead prop:** `SubsectionCard`'s `accentColor` (default `#3b82f6`) is accepted but never read in the render (`pdf-preview/SubsectionCard.tsx:27`). `SubsectionGrid` forwards it pointlessly.
- **Dead types:** `EditableField` and `ReportPreviewState` (`pdf-editor/types.ts:63,74`) — `EditableField` is imported by `SectionEditor.tsx:26` but unused; `ReportPreviewState` has no in-dir consumer.
- **Dead UI branch:** `SectionToggle`'s `onDelete` (`pdf-editor/SectionToggle.tsx:15,101`) is never passed by `PDFReportEditor`, so the delete button never renders. The grip-handle icon is decorative (no DnD).
- **Triplicated pass/fail vocabulary:** the `pass|passed|compliant` / `fail|failed|non-compliant` / `n/a` value buckets are independently re-implemented in `InspectionReportPreview.calculateStats` (`:99-104`), `QualityDashboard` (score, `:23`/`:60`), and `SectionPage.getStatusBadge` (`:22-34`). No shared constant.
- **Static SANS-compliance text:** `QualityDashboard.tsx:101` and `SignaturePage.tsx:99` both hard-code "complies with SANS 10142-1" / a sign-off declaration regardless of the computed score or any actual COC state — presentational, not evidence-backed. Consistent with pipeline §6 "compliance figures are only as trustworthy as the client that produced them."
- **WYSIWYG persists nothing:** `InspectionReportPreview.handleGeneratePdf` only downloads a blob — no storage upload, no `subsection_documents` insert (pipeline §1 WYSIWYG row, §6 Offline). So this report path leaves no DB/storage trace and is unaffected by the `documents`-bucket anon-write findings (pipeline §6 / G-SEC-14).
- **No client DB writes / secrets in this set:** none of the 16 files perform a Supabase write or read; the only network-ish side effect is `generateSubsectionQRCode` (QR image gen) and image `src` loads. No security-relevant client writes here (contrast the save paths in pipeline §4/§5).
- **`PDFReportEditor` reach:** wired only from `SiteExport.tsx:124`, whose live render route is ⚠️ UNVERIFIED per pipeline §1 (the production Site-Summary button is the server `GenerateFinalReportButton`, not this editor).
- **Hard-coded brand colors:** `inspection-report/*` use literal hex (`#1e3a5f`, `#0d9488`) and ignore the template `accentColor` from `ReportCustomization`; the WYSIWYG path is not template-gateway-driven (pipeline §1 "Reads template gateway? = no").
