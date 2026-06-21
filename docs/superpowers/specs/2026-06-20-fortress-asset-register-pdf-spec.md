# Fortress Asset Register PDF — Build Spec

Date: 2026-06-20
Status: Spec (not yet implemented)
Author: engineering (research-grounded)

Scope: a new **Asset Register PDF export** for the Fortress building pack, modelled
architecturally on the COC site report (`src/lib/siteCoc/`) and delivered through the
existing shared persistence layer (`savePDFToDocuments` + `DocumentPreviewDialog`).

---

## 1. Feasibility verdict (read this first)

**Verdict: PARTIAL — frontend-only / seed-data slice is buildable now; the production
feature is BLOCKED on data wiring.** The PDF generator is the *last* step, not the first.

### Why it is not "buildable now" end-to-end

The blocker is data wiring, not the PDF. Three hard facts, all verified against the repo:

1. **The fortress tables are absent from the generated Supabase types.**
   `grep -c "building_assets|ppm_tasks|ohs_compliance_items" src/integrations/supabase/types.ts`
   returns `0`. The migration SQL exists on disk
   (`supabase/migrations/20260612200000_fortress_building_layer.sql` + `210000` + `220000`),
   but the "MIGRATED" status is **unverified against the live DB** and is contradicted by the
   types evidence. `src/lib/fortress/types.ts` self-describes (lines 1–4) as a *"PLACEHOLDER
   scaffold … once the migrations are applied to the DB, replace usages with the generated
   Supabase types"*. Prior project memory records the Fortress DB layer as "BLOCKED on prod
   access (PAT empty)". Treat "migrated" as **unproven** until a live `building_assets`
   existence query confirms it.

2. **There is no data path.** No `useBuildingAssets` hook exists anywhere — `grep -rln
   useBuildingAssets src/` matches only the scaffold comment inside
   `src/components/fortress/AssetRegister.tsx` (line 11). No code queries the table:
   `grep "from('building_assets')"` over `src/` returns nothing. `AssetRegister.tsx` takes
   `assets` via props only.

3. **The Supabase client is strongly typed.** `src/integrations/supabase/client.ts` calls
   `createClient<Database>`, and `Database` lacks `building_assets`. Any hook calling
   `supabase.from('building_assets')` is a **compile-time type error today** — it cannot be
   written cleanly until types are regenerated post-apply (or an unsafe cast is used).

4. **`AssetRegister.tsx` is mounted nowhere.** `grep -rln AssetRegister src/` matches only the
   component and its own test. There is no `/fortress` route — `find src/app -type d -iname
   "*fortress*"` is empty. Shipping requires net-new tab/route wiring, not just a PDF button.

### Does it duplicate `fortressChecklistReportGenerator.ts`? — **No.**

The existing `src/lib/fortressChecklistReportGenerator.ts`
(`generateFortressChecklistPdf(data, options)`, lines 73–115) renders the **Fortress Marking
Checklist** from `FortressChecklistData` — sections `{name, progress}` and items
`{status: 'Done'|'Pending'|'N/A'}` (see `src/lib/report/fortressChecklistRows.ts`). That data
shape has **zero asset-inventory fields** — no `make_model`, no `condition`, no
`next_service_date`. An Asset Register PDF over `building_assets` + PPM is **genuinely new
work**, not a copy. There is no shortcut to reuse the checklist generator.

### What *is* shippable today

If prod access is still blocked (PAT empty), the only honestly shippable artifact is a
**frontend demo over seed/mock data behind a flag** — explicitly NOT a production feature.
Seed data exists at `supabase/seeds/fortress_abaqulusi_seed.sql` (and a SQLite reference at
`docs/fortress-spec/abaqulusi_review.db`); production sites likely have **zero**
`building_assets` rows, so end-to-end runtime verification requires seeding a real site.

---

## 2. Data model — `BuildingAsset[]` → `AssetRegisterReportModel`

Mirror the COC report's **model/render split**: a pure builder produces an immutable,
fully-typed model with no I/O; the renderer consumes only that model. This is the single most
valuable pattern to lift from COC (`src/lib/siteCoc/cocReportModel.ts` →
`src/lib/siteCoc/siteCocReport.ts`).

### Source type — `BuildingAsset` (verified, `src/lib/fortress/types.ts:9–34`)

All 34 fields exist. The render-relevant subset:

| Field | Type | Use in report |
|---|---|---|
| `id` | `string` | row key |
| `site_id` | `string` | scope (not rendered) |
| `section_code` | `string \| null` | Annual-report section grouping (e.g. `'4.1'`) |
| `category` | `string` | **by-category aggregation** (Fire / Electrical / HVAC / Security / Fabric …) |
| `name` | `string` | asset table primary column |
| `make_model` | `string \| null` | asset table column |
| `quantity` | `string \| null` | asset table column |
| `service_freq` | `string \| null` | service-schedule column |
| `last_service` | `string \| null` | service-schedule column |
| `next_service_due` | `string \| null` | **raw text** as imported (display only) |
| `next_service_date` | `string \| null` | **parsed date (migration 210000)** — drives PPM buckets |
| `service_cost` | `number \| null` | optional cost rollup |
| `contractor` | `string \| null` | service-schedule column |
| `cost_recovery` | `string \| null` | `'OPS cost'` / `'Tenant'` / `'Tenant + OPS'` |
| `condition` | `'Good'\|'Fair'\|'Poor'\|'N/A' \| null` | **by-condition aggregation** + status colour |
| `as_built_available` | `boolean \| null` | asset table flag |
| `deleted_at` | `string \| null` | **reads MUST filter `deleted_at IS NULL`** |

### New module: `src/lib/fortress/assetRegisterReportModel.ts` (pure, no I/O)

```ts
export interface AssetRegisterBuildInput {
  siteName: string;
  generatedAt: string;          // ISO; injected, keeps builder pure (mirrors COC generatedAt)
  today: string;                // ISO yyyy-mm-dd; passed to ppmSummary, keeps it deterministic
  clientName?: string | null;
  address?: string | null;
  assets: BuildingAsset[];      // caller pre-filters deleted_at IS NULL
}

export interface AssetRegisterReportModel {
  siteName: string;
  generatedAt: string;
  cover: { clientName: string | null; address: string | null };

  summary: {                    // headline counts
    totalAssets: number;
    categories: number;
    withServiceSchedule: number;  // count where next_service_date != null
    asBuiltCoveragePct: number;   // % with as_built_available === true
  };

  ppm: PpmSummary;              // { scheduled, dueSoon, overdue, onSchedulePct } from ppm.ts

  byCondition: {                // condition rollup → KPI cards + bar
    good: number; fair: number; poor: number; na: number; unknown: number;
  };

  byCategory: AssetCategoryGroup[];   // [{ category, count, dueSoon, overdue }]

  serviceSchedule: ServiceScheduleRow[]; // assets with next_service_date, sorted ascending,
                                         // each tagged bucket: 'overdue'|'dueSoon'|'scheduled'

  assetRows: AssetTableRow[];   // flattened render rows for the main register table
}
```

### Aggregations the builder computes (no inline math in the renderer)

1. **By category** — group by `category`, count per group; within each group count
   `next_service_date < today` (overdue) and `today ≤ date ≤ today+30` (due-soon). Feeds the
   category summary table.
2. **By condition** — tally `condition` into `{good, fair, poor, na, unknown}` where
   `unknown` = `null`. Feeds the condition KPI cards and a stacked condition bar.
3. **PPM next-service-due buckets** — delegate to the **already-shipped pure module**
   `ppmSummary(assets, today, withinDays?)` (`src/lib/fortress/ppm.ts:27–50`), returning
   `{ scheduled, dueSoon, overdue, onSchedulePct }` (`DUE_SOON_DAYS = 30`). Do **not**
   re-implement this math — per the D7 convention it is the single source of truth, imported
   by both screen and PDF.

The model layer stays **pure and free of branding I/O** (the COC constraint). `logoDataUrl`
is a render-time parameter, never part of the model.

> **OHS compliance is out of scope for v1.** `buildingCompliance(items)`
> (`src/lib/fortress/buildingCompliance.ts:22–42`) is a sibling pure module but operates on
> `ohs_compliance_items`, a different table. Keep the Asset Register report focused on
> `building_assets` + PPM; an OHS section is a later extension (roadmap S2-1/S2-5).

---

## 3. Document structure

Landscape A4 (the register and service-schedule tables are wide), matching COC's choice
(`siteCocReport.ts:252` sets `pageOrientation: "landscape"`).

### New module: `src/lib/fortress/assetRegisterReport.ts`

```ts
export function buildAssetRegisterReportDocDef(
  model: AssetRegisterReportModel,
  logoDataUrl?: string | null,
): TDocumentDefinitions
```

Signature deliberately mirrors `buildSiteCocReportDocDef(model, logoDataUrl?)`
(`siteCocReport.ts:132`).

Page flow:

1. **Cover** — site name, client, address, generated date, optional logo. Use COC's
   **self-contained landscape cover** (its accent rect is tuned for landscape width, ~760pt).
   Do **not** route through the shared `createCoverPage` (see §4).
2. **KPI card row** — reuse COC's **pdf.js-safe nested-table tinted cards** (`cardCell`,
   `siteCocReport.ts:185–196`). Suggested cards:
   - Total assets
   - PPM on-schedule % (`ppm.onSchedulePct`) with a `gaugeBar` (`siteCocReport.ts:112`)
   - Overdue services (`ppm.overdue`) — tinted red when > 0
   - Due-soon (≤30d) (`ppm.dueSoon`)
   - Condition mix (Good/Fair/Poor) as a `verdictBar`-style stacked segment bar
     (`verdictBar`, `siteCocReport.ts:99`)
3. **By-category summary table** — `category`, count, due-soon, overdue. Small `miniBar`
   (`siteCocReport.ts:94`) per row for overdue proportion.
4. **Asset register table(s)** — the main inventory: `name`, `category`, `make_model`,
   `quantity`, `condition` (tinted cell), `next_service_due` (raw text), `contractor`,
   `as_built_available`. Optionally grouped by `section_code` with a section header per group.
5. **Service-schedule summary** — assets that have a `next_service_date`, sorted ascending,
   each row tagged `overdue` / `dueSoon` / `scheduled` with a tinted status cell. This is the
   actionable "what's coming due" view.
6. **Footer** — `"<company> · Confidential"` (left) and `"<siteName> · Page X of Y"` (right),
   matching COC's footer callback (`siteCocReport.ts:255–261`).

Use COC's **smart `pageBreakBefore`** (`siteCocReport.ts:264`) — break a section header to a
new page only when `getPreviousNodesOnPage().length > 0`, to avoid pdfmake's blank-page
artifact when a table fills the page exactly.

---

## 4. Shared helpers vs COC-style bespoke rendering

The decision rule follows the adversarial verification: **reuse the delivery layer and pure
KPI modules; copy COC's bespoke landscape rendering rather than forcing the shared
portrait/gateway helpers.**

### Reuse (shared, low-risk)

| Use | Source | Why |
|---|---|---|
| Persist the PDF | `savePDFToDocuments(options)` — `src/lib/pdfDocumentSaver.ts` | The one canonical save path; handles storage upload, category auto-create, orphan-blob cleanup, 413 handling. |
| Category name | `getReportCategoryName(reportType)` — `pdfDocumentSaver.ts:196–208` | Needs a **new** `"fortress-asset-register"` entry (see §5 — currently absent). |
| Preview/download/save UI | `DocumentPreviewDialog` — `src/components/DocumentPreviewDialog.tsx` | Same dialog COC and Asset Verification already use; zoom/rotate/fullscreen/download/save. |
| PPM math | `ppmSummary` — `src/lib/fortress/ppm.ts:27–50` | Single source of truth; do not re-implement. |
| Branding logo (optional) | `loadCompanyBranding()` / `imageUrlToBase64()` — `src/lib/pdfBranding.ts` | Fetch the logo **in the UI layer**, pass the base64 string into `buildAssetRegisterReportDocDef(model, logoDataUrl)`. Keep it out of the model. |
| pdfmake blob | `generatePdfBlob(docDef)` — `src/lib/pdfMakeConfig.ts:389` | Standard blob generation + canvas validation. |

### Copy COC-style bespoke rendering (do NOT use the shared gateway/portrait helpers)

| Element | Copy from | Why not the shared helper |
|---|---|---|
| Cover page | COC self-contained cover (`siteCocReport.ts` ~145) | Shared `createCoverPage` (`pdfMakeUtils.ts:96`) is hard-wired to A4 **portrait** widths (`A4_WIDTH_PT 595.28`); its accent-bar rects assume portrait. COC's cover accent rect is tuned for landscape (~760pt). |
| KPI cards | COC `cardCell` nested-table tinted cards (`siteCocReport.ts:185–196`) | COC's card is a richer nested **accent-bar + tint + miniBar** structure with no overlap to the flat shared cards. **Do NOT widen** `createKpiRow` (7 consumers) or `createKpiDashboard` (3 consumers) — add nothing to their signatures; copy COC's local pattern. |
| Bars / gauges | COC `miniBar` (`:94`), `verdictBar` (`:99`), `gaugeBar` (`:112`) | All **table-based, canvas-free** — pdf.js mispositions canvas inside table cells. The only shared canvas bar, `createProgressBar`, has **zero call sites** and is effectively dead. |
| Status/condition tone | COC `statusDisplay.ts` Tone mappers (`scheduleStatusTone`, `verdictTone`) | Same convention; write a small `assetConditionTone(condition)` / `ppmBucketTone(bucket)` mapper in the same pure style. |

### Explicitly do NOT do

- **Do NOT route through `fetchPDFTemplate` / `usePDFTemplateGateway`.** There is no
  `fortress-asset-register` (or `site_coc`) entry in the `TemplateReportType` union
  (`usePDFTemplateGateway.ts:20–27`) and no `DEFAULT_TEMPLATES` row. The Asset Register layout
  is a fixed bespoke structure that section-toggle / accent-colour customization cannot
  meaningfully drive. Forcing the gateway adds a config surface with nothing to configure —
  exactly the COC situation, which legitimately bypasses the gateway.
- **Do NOT modify the shared KPI helper signatures.** Add a new local card builder; never
  widen `createKpiRow` / `createKpiDashboard`.

> **Pre-existing divergence to be aware of (not this spec's job to fix):** `pdfTemplates.ts`
> (legacy) and `pdfMakeUtils.ts` (current) have overlapping cover/header/footer/KPI/badge
> functions. Asset Verification imports the *legacy* `pdfTemplates.ts`; SiteSummary uses
> `pdfMakeUtils.ts`. The Asset Register report sidesteps this entirely by copying COC's
> self-contained helpers and touching neither.

---

## 5. UI wiring

Flow mirrors the **canonical preview-save flow** already used by COC's `ReportSubTab.tsx` and
Asset Verification's `AssetComparisonTable.tsx`.

### 5a. Prerequisite — category mapping (one-line shared change)

`getReportCategoryName` (`src/lib/pdfDocumentSaver.ts:196–208`) currently maps
`asset-verification`, `site-coc`, `fortress-checklist`, and defaults to `"Generated Reports"`.
It has **no** `fortress-asset-register` entry. Add:

```ts
"fortress-asset-register": "Asset Registers",
```

### 5b. Export button in `AssetRegister.tsx`

`AssetRegister.tsx` is presentational and props-only today. Add an "Export PDF" button to its
`CardHeader` (alongside the existing search/filter controls). On click:

```ts
// 1. build the pure model (no I/O)
const model = buildAssetRegisterReportModel({
  siteName, today: todayIso(), clientName, address, generatedAt: new Date().toISOString(),
  assets: filteredOrAllAssets, // decide: export filtered view or full register (open question Q4)
});

// 2. optional branding (UI layer)
const { logoDataUrl } = await loadCompanyBranding();

// 3. render → blob
const docDef = buildAssetRegisterReportDocDef(model, logoDataUrl);
const blob = await generatePdfBlob(docDef);

// 4. preview
const url = URL.createObjectURL(blob);
setPreview({ url, blob, fileName: `${siteName} - Asset Register - ${dateStr}.pdf` });
```

### 5c. `DocumentPreviewDialog` → `savePDFToDocuments`

Render `DocumentPreviewDialog` with `fileUrl={preview.url}`, `downloadBlobData={preview.blob}`,
`fileName`, `saveLocation="site"`, and an `onSaveToDocuments` callback that calls:

```ts
await savePDFToDocuments({
  blob: preview.blob,
  fileName: preview.fileName,
  siteId,
  categoryName: getReportCategoryName("fortress-asset-register"), // "Asset Registers"
});
URL.revokeObjectURL(preview.url);
```

This routes to `saveToSiteDocuments` (storage path `siteId/<category>/timestamp-fileName`,
inserts a `site_documents` row, cleans up orphan blob on insert failure).

### 5d. Decide: fire-and-forget vs persistent list

- **v1 minimum:** fire-and-forget (the Asset Verification pattern — single save, no list).
  Simplest; ships fastest.
- **v2 / parity with COC:** persistent saved-reports list with `fetchSaved` (query
  `site_documents` by `siteId` + category) and `handleDelete` (extract storage path from
  `file_url`, remove the Supabase object, delete the row) — the full CRUD from
  `ReportSubTab.tsx:28–90`. Recommended once the register sees repeat use.

### 5e. Page/route wiring (prerequisite, currently missing)

`AssetRegister.tsx` is orphaned. Add a **Fortress tab** on `SiteDetail` (matching the COC tab
pattern) that mounts `AssetRegister` and feeds it data via a new `useBuildingAssets(siteId)`
hook. The export button lives inside that mounted component.

---

## 6. Tests

Follow the existing fortress pure-module test convention (`ppm.test.ts`,
`buildingCompliance.test.ts`).

1. **`assetRegisterReportModel.test.ts`** (pure, highest value):
   - by-category counts, including overdue/due-soon per category at a fixed `today`.
   - by-condition tally incl. `null → unknown`.
   - `summary.asBuiltCoveragePct` and `withServiceSchedule`.
   - PPM delegation: model `ppm` equals `ppmSummary(assets, today)` for the same input.
   - empty input → zero-count, no throw, `onSchedulePct === 100`.
   - assets with `deleted_at != null` are assumed pre-filtered by the caller — add a test
     asserting the builder does **not** itself silently include them if passed (decide and
     document the contract; see Q3).
2. **`assetRegisterReport.test.ts`** — `buildAssetRegisterReportDocDef(model)` returns a valid
   `TDocumentDefinitions`; `pageOrientation === "landscape"`; **no canvas elements** anywhere
   in the content tree (assert all bars are tables — the pdf.js-safety invariant); footer
   callback renders `Page X of Y`.
3. **`useBuildingAssets.test.ts`** (once the hook exists) — filters `deleted_at IS NULL`;
   respects membership RLS scope; returns typed `BuildingAsset[]`.
4. **`AssetRegister.test.tsx`** — extend the existing test: Export button present; clicking it
   invokes the generate path (mock `generatePdfBlob`) and opens the dialog.
5. **(v2) Parity test** — register-screen rows vs PDF `assetRows` count/identity match
   (the COC/checklist parity convention, roadmap S4-4).

---

## 7. Smallest shippable slice + open questions / blockers

### Smallest shippable slice (strict order — PDF is LAST)

1. **Confirm-or-apply the migration against prod FIRST.** Query the live DB for the existence
   of `public.building_assets` before writing any code. Do **not** trust the "migrated" claim
   or the roadmap HTML. If absent, apply `20260612200000` / `210000` / `220000` via the
   **Management API** (`database/query`, per the project's documented db-push-avoidance
   pattern — prod/`schema_migrations` drift), then **regenerate** `src/integrations/supabase/
   types.ts` (`supabase gen types typescript`) so `building_assets` is typed and the
   placeholder `src/lib/fortress/types.ts` can be retired.
2. **Write `useBuildingAssets(siteId)`** (TanStack Query) honouring `deleted_at IS NULL` and
   membership RLS, plus its test.
3. **Seed at least one real site** (`supabase/seeds/fortress_abaqulusi_seed.sql`) so the path
   is runtime-verifiable.
4. **Mount `AssetRegister.tsx`** in a new Fortress tab/route on `SiteDetail`; verify the
   **screen** renders live rows BEFORE touching the PDF.
5. **Only then** build `assetRegisterReportModel.ts` + `assetRegisterReport.ts`, add the
   `getReportCategoryName` entry, wire the export button → `DocumentPreviewDialog` →
   `savePDFToDocuments`, and write the model/render tests.

If prod access is still blocked (PAT empty), ship **step 5's renderer over seed/mock data
behind a flag** as a demo only — explicitly not the production feature.

### Open questions / blockers

- **Q1 — Is `building_assets` actually applied in prod?** Unverified; absent from generated
  types; prior memory says "BLOCKED on prod access (PAT empty)". This gates everything.
- **Q2 — Will the PAT be available** to apply migrations via the Management API and regenerate
  types? If not, only a flagged frontend demo is shippable.
- **Q3 — `deleted_at` contract:** does the builder assume the caller pre-filters
  `deleted_at IS NULL`, or should it filter defensively? Recommend: hook filters; builder
  documents the precondition. Confirm.
- **Q4 — Export scope:** does the PDF export the *filtered* view (current search/condition
  filter in `AssetRegister.tsx`) or the *full* register? Recommend full register for an
  auditable record; confirm with the user.
- **Q5 — Condition modelling (D4, deferred to S2-3):** `condition` is a soft enum on
  `building_assets` with no inspection linkage; a separate `building_condition_items` table is
  listed in the base migration. If the report must reflect *inspected* vs *declared*
  condition, the condition section may need rework. v1 uses the declared `condition` field
  only.
- **Q6 — `ppm_tasks` table:** the PPM KPIs in scope read `building_assets.next_service_date`
  only (via `ppmSummary`). If a richer per-task schedule is wanted, `ppm_tasks` would need its
  own hook + model section — out of scope for v1, flag as a v2 extension.
- **Q7 — Persistence depth:** fire-and-forget (v1) or full saved-list CRUD like COC (v2)?
  Default v1 to fire-and-forget.
