# 07 · Components/Hooks/Lib — gap-fill (uncovered files)

**Scope:** Five files that fell through the alphabetical seams of the Phase-4 per-symbol pass and were never documented in `lib-1/2/3.md`, `hooks-1/2.md`, or the component chapters. Per-symbol ground-truth docs for the Site-Summary render spec, the live pdfmake inspection-report generator, the offline-sync orchestration hook, the PDFShift inspection-report sibling, and the react-router-dom→Next compat shim.
**Files covered: 5.**

Cross-refs: PDF generation flow in `06-flows/pdf-report-pipeline.md`; offline queue mechanics in `06-flows/offline-sync.md`; data model (`subsections`, `inspections`, `subsection_documents`, `document_categories`, `floor_plan_pins`, storage buckets) in `02-data-model`; RLS/anon-read posture in `03-auth-and-access`, `GAPS.md`, `SECURITY-FINDINGS-*.md`. Sibling pdfmake helpers (`pdfTemplates.ts`, `simpleImageLoader.ts`, `subsectionCardSpec.ts`) are in `lib-3.md`.

---

## `src/lib/siteSummaryRenderSpec.ts`

The **single source of truth** for the Site Summary report — shared verbatim by the HTML preview (`SiteSummaryReport.tsx`, `SiteSummaryFullPreview.tsx`) and the pdfmake generator so preview and PDF stay WYSIWYG-identical. Pure data + helpers; no I/O. See `06-flows/pdf-report-pipeline.md` for where the spec sits in the pipeline.
**Importers (5):** `components/SiteSummaryReport.tsx`, `components/settings/preview-renderers/SiteSummaryFullPreview.tsx`, `lib/subsectionCardSpec.ts` (re-exports `SnagData`/`SubsectionData`), `lib/pdfTemplateTestRunner.ts`, `lib/pdfMakeUtils.ts`.

### Consts / catalogs

| Export | Kind | Line | Shape / purpose |
|---|---|---|---|
| `ACCENT_PALETTES` | const (`as const`) | 28 | 5 accent themes (blue/green/orange/red/purple) → `{primary,light,dark,rgb}`. Used by `pdfMakeUtils.ts`, `getAccentPalette` |
| `STATUS_COLORS` | const (`as const`) | 36 | success/warning/error/info/muted hex |
| `HEALTH_METRICS_CARDS` | const `KpiCardSpec[]` | 62 | 4 KPI cards (Overall Health, COC Compliance, Metering Data, Snag Free) with `getValue`/`format` closures over `SiteSummaryMetrics` |
| `SECTION_SPECS` | const `Record<string,SectionSpec>` | 106 | 11 report sections keyed by id, each w/ `legacyIds`, `defaultTitle`, `type`, optional `pageBreakBefore`, `renderPriority` (note `documents-summary` priority `1.5`) |
| `SUMMARY_STAT_ROWS` | const `StatRowSpec[]` | 193 | 6 summary-stats rows w/ `getValue` closures |
| `COC_VALIDATION_COLUMNS` | const `TableColumnSpec[]` | 213 | 4 cols for COC table |
| `INSPECTION_COLUMNS` | const `TableColumnSpec[]` | 220 | 4 cols for inspections table |
| `ASSET_VERIFICATION_CARDS` | const `AssetKpiCardSpec[]` | 236 | 4 asset KPI cards over `AssetVerificationMetrics` |
| `SUBSECTION_CARD_FIELDS` | const `CardFieldSpec[]` | 279 | 6 subsection-card fields w/ `getValue`/optional `getColor`/`showIf` |
| `LAYOUT` | const (`as const`) | 392 | A4 point dimensions + per-element sizing (cover/sectionHeader/kpiCard/table/subsectionCard/footer). Imported by `pdfMakeUtils.ts`, `subsectionCardSpec.ts` |

### Interfaces / types

| Export | Line | Notes |
|---|---|---|
| `KpiCardSpec` | 54 | KPI card descriptor |
| `SectionSpec` | 97 | `type` must match `ReportSection` type union |
| `StatRowSpec` | 187 | summary-stat row |
| `TableColumnSpec` | 206 | table column |
| `AssetKpiCardSpec` | 228 | asset KPI card |
| `CardFieldSpec` | 271 | subsection-card field |
| `AccentColorKey` | 44 | `keyof typeof ACCENT_PALETTES` |
| `SiteSummaryMetrics` | 321 | 9 numeric site-health metrics |
| `AssetVerificationMetrics` | 334 | totalAssets/verified/discrepancies/unverified/verificationRate |
| `SnagData` | 343 | id/title/riskLevel/status — **re-exported via `subsectionCardSpec.ts`** |
| `SubsectionData` | 351 | per-subsection card input — **re-exported via `subsectionCardSpec.ts`** |
| `CategoryHealthData` | 366 | category health row |
| `CocValidationData` | 374 | COC table row |
| `InspectionData` | 381 | inspection table row |
| `AssetScheduleRow` | 612 | detailed asset-schedule row (status `verified`/`discrepancy`/`pending`) |
| `FortressSectionProgress` | 756 | per-section fortress progress |
| `FortressChecklistMetrics` | 768 | aggregate fortress metrics + `sections[]` |
| `DocumentCategoryMetrics` | 887 | `{categoryName,fileCount}` |
| `DocumentSummaryMetrics` | 892 | total + categories |

### Helper functions

| Export | Signature | Line | Purpose / key behavior | Callers |
|---|---|---|---|---|
| `getAccentPalette` | `(color='blue') → palette` | 46 | lookup w/ blue fallback | SiteSummaryReport, SiteSummaryFullPreview |
| `findSectionSpec` | `(sectionId) → SectionSpec\|null` | 453 | direct key, then scans `legacyIds` | SiteSummaryReport, SiteSummaryFullPreview, pdfTemplateTestRunner |
| `getSectionTitle` | `(section:ReportSection) → string` | 469 | user-override title or spec default or id | same 3 |
| `matchesSectionId` | `(section, targetId) → boolean` | 480 | id or legacy-id match | SiteSummaryFullPreview, pdfTemplateTestRunner |
| `sortSections` | `(sections) → ReportSection[]` | 490 | sort by `order`, tiebreak `renderPriority` (99 fallback) | internal (via `getEnabledSections`) |
| `getEnabledSections` | `(sections) → ReportSection[]` | 504 | filter `enabled` then `sortSections` | SiteSummaryReport, SiteSummaryFullPreview, pdfTemplateTestRunner |
| `calculateMetrics` | `(subsections, cocRequiredCount?, openSnagCount?) → SiteSummaryMetrics` | 511 | health/COC/metering/snag-free %; `safeDenominator=max(n,1)`; cocCompliant matches `Approved\|Valid\|Pass`; snagFree clamped 0–100. ⚠️ **No `overallHealthOverride` param exists** (see note) | SiteSummaryReport:303, SiteSummaryFullPreview:210, pdfTemplateTestRunner:464/510 |
| `calculateCategoryHealth` | `(subsections, getCategoryAbbr, maxCategories=4) → CategoryHealthData[]` | 549 | groups by `category` (`Uncategorized` fallback), `slice(0,max)`, % compliant | SiteSummaryReport, SiteSummaryFullPreview, pdfTemplateTestRunner |
| `calculateAssetMetrics` | `(assets, inspections) → AssetVerificationMetrics` | 628 | normalizes meter serials, matches against `inspection.json_data.tenants`, diff on CT/breaker → verified/discrepancy/unverified | SiteSummaryReport, SiteSummaryFullPreview |
| `generateAssetSchedule` | `(assets, inspections) → AssetScheduleRow[]` | 691 | per-asset detail rows (dup of the match logic in `calculateAssetMetrics`) | SiteSummaryReport |
| `calculateFortressMetrics` | `(checklistItems) → FortressChecklistMetrics` | 798 | groups by `section_name`, sorts by numeric prefix, per-section + overall % over applicable items | SiteSummaryReport |
| `calculateDocumentMetrics` | `(siteDocuments, subsectionDocuments) → DocumentSummaryMetrics` | 901 | counts both doc sources by joined category name (`Uncategorized` fallback), alpha-sorted | SiteSummaryReport |

**Privates:** `normalizeMeterSerial` (576), `compareValues` (583), `getShortenedSectionName` (780), plus `InspectionTenantData` interface (601).

**⚠️ Notes**
- **`calculateMetrics` signature mismatch vs brief:** the gap-fill task expected an optional `overallHealthOverride` param. **It is not present in the current source** (params are `subsections, cocRequiredCount?, openSnagCount?` — `siteSummaryRenderSpec.ts:511`). All 4 call sites pass ≤3 positional args. Either the param was reverted/never landed, or the override is applied downstream in `SiteSummaryReport.tsx`. Treat the 3-arg form as ground truth.
- **Duplicate match logic:** `calculateAssetMetrics` and `generateAssetSchedule` each independently rebuild the `inspectionMeterMatches` map and re-run `compareValues` — same algorithm, two copies. The header comment notes the logic deliberately mirrors the `AssetVerification` component, so there is a *third* copy elsewhere; consolidation candidate.
- `getSectionTitle` / `matchesSectionId` / `sortSections` are not flagged dead (each has ≥1 caller), but `sortSections` is only reached indirectly through `getEnabledSections`.

---

## `src/lib/pdfmakeInspectionReport.ts`

Client-side pdfmake generator for the full engineering **inspection report** (cover → quality dashboard → section breakdown → photo grids → snags → tenant verification → signatures). ~1650 lines, mostly private page-builders. Loads images via `simpleImageLoader.loadImagesSimple`/`loadImageSimple` (see `lib-3.md`) and delegates final assembly to `generateReport` (`pdfEngine`). See `06-flows/pdf-report-pipeline.md`.
**Importer:** `lib/inspectionReportGenerator.ts` only (aliased `pdfmakeGenerateAndSave`). **See live-caller note below.**

### Exported symbols

| Export | Kind | Line | Signature / shape | Notes |
|---|---|---|---|---|
| `InspectionSection` | interface | 42 | `{title; items:[{label,value,type?,notes?,photos?}]}` | — |
| `InspectionSnag` | interface | 53 | `{title; description?; status; riskLevel?; photos?}` | — |
| `InspectionSignature` | interface | 61 | `{name; role?; signatureUrl?; signedAt?}` | — |
| `InspectionTenant` | interface | 68 | shop + meter/breaker/CT + 3 image URLs | — |
| `InspectionReportData` | interface | 79 | full report input (id, template, inspector, sections, tenants, snags, signatures, …) | — |
| `GenerateInspectionReportOptions` | interface | 94 | `{inspection; siteName; clientName?; siteLogoUrl?; accentColor?:'blue'\|'green'\|'orange'\|'red'\|'purple'}` | **`accentColor` is a palette-key union** — differs from pdfshift's free-form hex string |
| `GenerateInspectionReportResult` | interface | 102 | `{success; blob?; previewUrl?; filename?; error?}` | — |
| `generateInspectionReportPdf` | async fn | 1456 | `(options) → Promise<GenerateInspectionReportResult>` | collects+loads images, builds 7 content blocks, calls `generateReport({includeCoverPage:false,...})`; filename sanitized `[^a-zA-Z0-9_.-]→_`; try/catch → `{success:false,error}` |
| `generateAndSaveInspectionReportPdfmake` | async fn | 1547 | `(options & {subsectionId; siteId?}) → Promise<{success; documentId?; fileName?; fileUrl?; error?}>` | requires auth user; uploads blob to **`documents` bucket** at `inspection-reports/<subsectionId>/<ts>_<file>`; finds/creates `document_categories` "Inspection Reports"; inserts `subsection_documents` row (`uploaded_by:user.id`) — **client-side writes** |

**Private page-builders (15):** `loadImagesAsDataUrls` (115, thin wrapper over `loadImagesSimple`), `collectImageUrls` (119), `getStatusColor`/`isPassStatus`/`isFailStatus` (155/169/174), `calculateStats` (200, → `InspectionStats` iface @183), `createEngineeringCoverPage` (274), `createQualityDashboard` (421), `createSectionBreakdownPage` (568), `createSectionWithPhotoGrid` (773), `createInspectionItemContent` (861), `createSnagsSection`/`createSnagCardContent` (1017/1078), `createTenantSection`/`createTenantCardContent` (1232/1284), `createSignaturesSection` (1371). `REPORT_COLORS` const @28.

**⚠️ Notes**
- **"LIVE" but caller chain is orphaned:** the *only* importer is `inspectionReportGenerator.ts`, whose own export `generateAndSaveInspectionReport` has **zero importers anywhere in `src/`** (verified by grep). So this pdfmake chain is reachable in principle but currently has **no live UI entry point** — the live inspection-report UI uses the PDFShift/Edge-Function path (`pdfshiftInspectionReport.ts`, below) instead. Confirm intended-but-dormant vs. dead before relying on "LIVE".
- **Client-side writes** to `documents` storage + `document_categories` + `subsection_documents` — relevant to the anon/RLS posture tracked in `GAPS.md`/`SECURITY-FINDINGS-*.md` (verify RLS on those tables/bucket allow the inspector role only).
- Verbose `console.log` throughout (not gated on `NODE_ENV`).

---

## `src/hooks/useOfflineSync.ts`

Offline-mutation queue orchestrator. Persists a mutation queue in **`localStorage`** (`offline_mutation_queue`), drains it on reconnect, retries ≤3×, marks records synced in IndexedDB. Queue mechanics, the localStorage-vs-IndexedDB split, and the per-store sync helpers are documented in `06-flows/offline-sync.md` — not re-derived here.
**Importers (7):** `components/OfflineIndicator.tsx`, `hooks/useOfflineInspections.ts`, `hooks/useOfflineSubsections.ts`, `hooks/useOfflineFloorPlanAnnotations.ts`, `views/OfflineSyncTest.tsx`, `views/OfflineReview.tsx`, `views/InspectionDetail.tsx`.

| Export | Signature | Line | Returns |
|---|---|---|---|
| `useOfflineSync` | `() → { isOnline; queueSize; isSyncing; queueMutation; processQueue }` | 18 | live online state, queue length, sync flag; `queueMutation(type,data)` enqueues + toasts; `processQueue()` drains |

**Internals**
- `QueuedMutation` `{id,type,data,timestamp,retries}`; queue capped by `MAX_RETRIES=3` (15/17).
- `getQueue`/`saveQueue` — localStorage read/write (25/35); `saveQueue` also updates `queueSize`.
- `executeMutation` (56) — large `switch` over **22 mutation types**: CREATE/UPDATE/DELETE_INSPECTION, UPLOAD_IMAGE, UPDATE_SUBSECTION, UPLOAD_DOCUMENT, UPLOAD_FLOOR_PLAN, ADD/UPDATE/DELETE_FLOOR_PLAN_PIN, ADD/DELETE_MARKUP, ADD/DELETE_MEASUREMENT, SAVE_INSPECTION_JSON, UPLOAD_INSPECTION_IMAGE, BATCH_UPLOAD_INSPECTION_IMAGES (+ default `console.warn`). Each case dynamic-imports its offline-DB helper (`offlineDBExtensions`, `offlineFloorPlanDB`, `offlineInspectionDB`, `imageNaming`).
- `processQueue` (434) — serial drain; failures re-queued w/ `retries+1` until `MAX_RETRIES`, then `toast.error`; success path `queryClient.invalidateQueries()`.
- Three `useEffect`s: online/offline listeners + reconnect toasts (471), re-drain on `isOnline` flip (494), initial `queueSize` (501).

**⚠️ Notes**
- **Direct client writes** on drain: inserts/updates/deletes against `inspections`, `subsections`, `subsection_documents`, `subsection_floor_plans`, `floor_plan_pins` and uploads to `inspection-photos`/`documents` buckets — all from the browser. Same RLS-posture concern as the report generators; cross-ref `GAPS.md`/`SECURITY-FINDINGS-*.md`.
- `ADD_MARKUP`/`ADD_MEASUREMENT` only mark the local record synced (comment: "stored locally only for now") — no server write, so these queue entries are no-ops server-side.
- `data:any` typing throughout the queue; `executeMutation` is not exported, so callers can only enqueue via opaque `(type,data)` strings — no compile-time check that `type` matches a handled case.

---

## `src/lib/pdfshiftInspectionReport.ts`

PDFShift sibling of `pdfmakeInspectionReport.ts`: builds the inspection payload and delegates rendering to the **`generate-inspection-pdf` Supabase Edge Function** (HTML → headless-Chrome/Browserless PDF; the file header still says "DOCX/PDFShift" but the body invokes the Edge Function). Server side handles image download/resize + document persistence. See `06-flows/pdf-report-pipeline.md`.
**Has live callers — YES (2):** `components/TemplateBasedReport.tsx:231` (`generatePdfShiftInspectionReport`) and `components/site/BulkInspectionReportGenerator.tsx:346` (`generateAndSavePdfShiftInspectionReport`). This is the path the live inspection-report UI actually uses.

| Export | Kind | Line | Signature / purpose |
|---|---|---|---|
| `InspectionSection` | interface | 20 | dup of pdfmake's (same shape) |
| `InspectionSnag` | interface | 31 | dup |
| `InspectionSignature` | interface | 39 | dup |
| `InspectionTenant` | interface | 46 | dup |
| `InspectionReportData` | interface | 57 | dup (imported by both live callers) |
| `GeneratePdfShiftReportOptions` | interface | 72 | `{inspection; siteName; clientName?; siteLogoUrl?; accentColor?:string (default '#2563eb'); subsectionId?}` — **free-form hex** vs pdfmake's union |
| `GenerateDocxReportResult` | interface | 82 | `{success; url?; filename?; previewUrl?; error?}` |
| `GeneratePdfShiftReportResult` | type alias | 91 | `= GenerateDocxReportResult` ("legacy alias") |
| `generatePdfShiftInspectionReport` | async fn | 199 | gets auth user, builds payload, `supabase.functions.invoke('generate-inspection-pdf')`; returns `{success,url,filename,previewUrl}`; logs gated on `NODE_ENV==='development'` |
| `generateAndSavePdfShiftInspectionReport` | async fn | 295 | `(options & {subsectionId; siteId?})`; requires auth user; delegates to the above (Edge Function persists the document server-side); returns `{success,documentId?,fileName?,fileUrl?,error?}` |

**Privates:** `imageToBase64` (105, canvas resize/compress — `MAX_IMAGE_WIDTH=800`, `JPEG_QUALITY=0.75`), `embedAllImages` (182).

**⚠️ Notes**
- **Dead code:** `embedAllImages` (182) early-returns `inspection` unmodified with a "CRITICAL FIX: skip client-side embedding" comment, then has a **second unreachable `return inspection;`** at line 188. The whole `imageToBase64` helper is consequently **dead** (only referenced by the bypassed branch of `embedAllImages`). Server now handles embedding.
- `documentId` is read off the result via `(result as any).documentId` (line 331) but `generatePdfShiftInspectionReport` never sets it — so `documentId` is effectively always `undefined` on the client return.
- vs. `pdfmakeInspectionReport.ts`: PDFShift path does NOT write to storage/DB from the client (Edge Function owns persistence) — the safer of the two report paths re: client writes.

---

## `src/lib/navigation.tsx`

react-router-dom → **Next.js App Router** compatibility shim. Every component that still imports router APIs imports from `@/lib/navigation` instead of `react-router-dom`, letting the original SPA components run unchanged under App Router. **Only `.tsx` file in `src/lib/`** (the rest are `.ts`) because it exports React components (`Link`/`NavLink`).
**Importers: 54 files** across `src/` (`@/lib/navigation`).

| Export | Kind | Line | Maps to / behavior |
|---|---|---|---|
| `useNavigate` | hook | 21 | returns `(to, {replace?,state?}) ⇒ …`; numeric `-1` → `router.back()`, other number → `router.forward()`; string → `router.push`/`replace` |
| `useParams` | hook | 42 | `useNextParams()` cast to `T extends Record<string,string>`; `{}` fallback |
| `useSearchParams` | hook | 51 | **RR-style tuple** `[URLSearchParams, setSearchParams]`; setter accepts object \| `URLSearchParams` \| updater fn, then `router.replace(pathname?qs)` |
| `useLocation` | hook | 86 | `{pathname,search,hash,state:null,key:'default'}`; `hash`/`state` are best-effort (no real RR history state) |
| `Link` | component (`forwardRef`) | 110 | RR `<Link to>` → Next `<Link href>`; passes `replace`, spreads props; `displayName='Link'` |
| `NavLink` | component (`forwardRef`) | 131 | adds active detection: `end` → exact `pathname===to`, else `startsWith`; `className`/`children` may be functions of `{isActive,isPending:false}` |
| `Navigate` | component | 165 | `<Navigate to replace?>`; effectful redirect via `router.push`/`replace` in `useEffect`; renders `null` |

**⚠️ Notes**
- `"use client"` at top — the shim and everything importing it are client components.
- **Fidelity gaps vs real react-router-dom:** `isPending` is hard-coded `false` (no transition tracking); `useLocation().state` is always `null` and `key` always `'default'` (RR history state is not emulated); `useNavigate`'s `options.state` is accepted but ignored. Components relying on RR navigation *state* will silently get nothing.

---

### Chapter notes (cross-file)

- **Dead / orphaned:** `pdfshiftInspectionReport.imageToBase64` + the second `return` in `embedAllImages` (dead); `pdfmakeInspectionReport.ts`'s entire chain is reachable only through `inspectionReportGenerator.generateAndSaveInspectionReport`, which has **no importers** — dormant or dead (the live path is PDFShift).
- **Two parallel inspection-report generators** with near-identical type surfaces (`InspectionSection`/`Snag`/`Signature`/`Tenant`/`ReportData` declared independently in both files): pdfmake (client-side render + client DB writes, palette-key accentColor) vs PDFShift/Edge-Function (server render + server persistence, hex accentColor). Only the PDFShift one is wired into the UI.
- **`calculateMetrics` has no `overallHealthOverride` param** in the current source despite the gap-fill brief expecting one — documented as 3-arg; flagged for reconciliation.
- **Client-side writes** worth re-checking against RLS: `pdfmakeInspectionReport.generateAndSaveInspectionReportPdfmake` (documents bucket + `document_categories` + `subsection_documents`), `useOfflineSync.executeMutation` (inspections/subsections/floor_plan_pins/documents + 2 storage buckets). See `GAPS.md`/`SECURITY-FINDINGS-*.md`.
- **Duplicate match logic** inside `siteSummaryRenderSpec.ts` (`calculateAssetMetrics` vs `generateAssetSchedule`), mirrored a third time in the `AssetVerification` component per its own comment.
