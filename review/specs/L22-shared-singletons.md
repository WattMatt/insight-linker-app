# L22 — shared-singletons

- Unit id: L22
- Slug: shared-singletons
- Spec mode: full
- Date: 2026-07-29
- Files: 3 (src/types/site.ts, src/test/online.ts, src/index.css)

## Unit header

**Unit purpose.** Three unrelated single-file modules grouped as the repo's shared singletons: a hand-written entity-type module for the site domain (`src/types/site.ts`), a jsdom test helper that overrides `navigator.onLine` (`src/test/online.ts`), and the app's single global stylesheet holding the Tailwind layer directives and the HSL design-token variables (`src/index.css`). None of the three imports anything from application code; each is a leaf that other units consume.

**Module-level observations (cross-file, verified).**
- The three files have no relationship to each other: no file in this unit imports or references another file in this unit (verified by reading all three in full — src/types/site.ts has zero imports, src/test/online.ts has zero imports, src/index.css references only Tailwind directives/utilities).
- All consumption is via the `@/*` → `./src/*` path alias (tsconfig.json:18): `@/types/site`, `@/test/online`, `@/index.css`.
- Each file is the sole occupant of its directory role: `src/test/` contains only `online.ts` (verified `ls src/test/`), `src/index.css` is the only tracked `.css` file under `src/` (verified `find src -name "*.css"`).

**External contract.** The rest of the app gets: (1) `Site`, `Subsection`, `SiteStats` interfaces imported by 9 view/component files across units C08, C09, V01, V03, V04; (2) `setOnline(value: boolean)` imported by 5 offline-hook test suites across H01 and H02; (3) the design-token CSS variables that tailwind.config.ts:17-64 maps into Tailwind color/radius utilities, imported exactly once at the app root (src/app/layout.tsx:3) and registered as the shadcn stylesheet (components.json:8).

---

## src/types/site.ts

- Purpose: Hand-written TypeScript interfaces for the site domain — a `Site` row shape with an embedded `clients {id,name}` join, a partial `Subsection` row shape, and a `SiteStats` counters bag.
- Public surface:
  - `export interface Site` (site.ts:1-18): `id: string; name: string; address: string | null; site_type: string | null; client_id: string; supply_authority: string | null; nominated_max_demand: string | null; consultant_name: string | null; consultant_company: string | null; consultant_contact: string | null; site_image_url: string | null; client_logo_url: string | null; clients: { id: string; name: string }`.
  - `export interface Subsection` (site.ts:20-34): `id: string; name: string; description: string | null; category: string | null; coc_status: string; metering_status: string; is_compliant: boolean | null; is_coc_required: boolean; tenant_name: string | null; coc_number: string | null; meter_serial_number: string | null; ct_ratio: string | null; qr_code_url: string | null`.
  - `export interface SiteStats` (site.ts:36-42): `totalSubsections: number; cocApprovedCount: number; cocRequiredCount: number; meteringInstalledCount: number; openSnags: number`.
- Inputs & outputs: Type declarations only; no runtime values, no stores, no env vars. Erased at compile time.
- Dependencies:
  - uses -> nothing (zero import statements; site.ts:1-42 is self-contained).
  - used by <- (grep-verified, `grep -rn "types/site" src supabase`, 9 files):
    - C09 site-structure-qr-schematic: src/components/site/QRScanActivity.tsx:6 (`Subsection`), src/components/site/SiteEditDialog.tsx:9 (`Site`), src/components/site/SubsectionList.tsx:7 (`Subsection`), src/components/site/QRCodeManager.tsx:6 (`Subsection, Site`).
    - C08 site-documents-reports: src/components/site/SiteReports.tsx:10 (`Site`), src/components/site/SiteImages.tsx:6 (`Site`).
    - V01 admin-entity-views: src/views/SiteDetail.tsx:11 (`Site, Subsection, SiteStats` — the only importer of `SiteStats`).
    - V03 portal-views: src/views/ClientPortalSiteDetail.tsx:27 (`Site, Subsection`).
    - V04 public-and-entry-views: src/views/PublicSiteReview.tsx:32 (`Site, Subsection`).
    - No consumers under supabase/ (grep-verified, zero hits).
- Side effects: None (type-only module).
- Error handling: Not applicable — no runtime code, no failure paths.
- Tests: None. No `*.test.ts(x)` file imports `types/site` (grep-verified, zero hits).
- Observed issues (factual):
  - Parallel type source: generated Supabase types define the same tables — `sites` Row at src/integrations/supabase/types.ts:2262-2280 and `subsections` Row at src/integrations/supabase/types.ts:2556-2586 (unit L19). Nine files import the hand-written shapes instead of the generated ones.
  - Nullability differs from the generated Row: hand-written `Subsection.coc_status: string` and `metering_status: string` (site.ts:25-26) vs generated `string | null` (types.ts:2565, 2579); hand-written `is_coc_required: boolean` (site.ts:28) vs generated `boolean | null` (types.ts:2576).
  - Shape differs from the generated Row: hand-written `Site` embeds a `clients: { id; name }` join object (site.ts:14-17) that does not exist on the `sites` Row; it omits Row columns `created_at`, `created_by`, `firebase_id`, `updated_at` (types.ts:2270-2272, 2279). Hand-written `Subsection` omits Row columns including `site_id` (types.ts:2583), `qr_disabled` (types.ts:2582), `deleted_at` (types.ts:2569), `coc_expiry_date`/`coc_issue_date`/`coc_type`/`coc_reviewed_at`/`coc_reviewed_by` (types.ts:2559-2566), `installation_score`/`installation_status` (types.ts:2574-2575), and `inspection_template_id` (types.ts:2573).
  - Further same-named local re-definitions exist outside this file (grep-verified): `interface Subsection` at src/components/site/SchematicDiagram.tsx:76 and src/views/ClientDetail.tsx:37; `interface Site` at src/views/Sites.tsx:21, src/views/SiteAssignments.tsx:25, src/views/ClientDetail.tsx:28, src/views/Inspections.tsx:43; `interface SiteStats` at src/components/client-portal/SiteOverviewCard.tsx:14 — i.e. three type sources for these entities: generated (L19), this file, and per-file locals.
- ASSUMED:
  - The `clients: { id, name }` field models the result shape of a Supabase select with an embedded `clients(id, name)` join; the individual consumer queries were not inspected in this pass.
  - The non-null `coc_status`/`metering_status`/`is_coc_required` narrowing reflects DB defaults assumed by the author; the column defaults in migrations were not checked in this pass.

## src/test/online.ts

- Purpose: Test-only helper that replaces jsdom's read-only `navigator.onLine` getter so offline code paths can be exercised.
- Public surface:
  - `export function setOnline(value: boolean): void` (online.ts:5-10) — redefines `navigator.onLine` as a configurable getter returning `value`.
- Inputs & outputs: `value: boolean` in; no return value. Mutates the global `navigator` object of the jsdom environment via `Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })` (online.ts:6-9). No tables, buckets, storage keys, or env vars.
- Dependencies:
  - uses -> nothing (zero imports; relies only on globals `navigator` and `Object`).
  - used by <- (grep-verified, `grep -rn "test/online" src`, 5 test files):
    - H01 offline-sync-engine: src/hooks/useOfflineSync.online.test.tsx:10, src/hooks/useOfflineSync.queueRaces.test.tsx:9, src/hooks/useOfflineSync.syncInspection.test.tsx:9.
    - H02 offline-domain-hooks: src/hooks/useOfflineInspectionDetail.selfHeal.test.tsx:8, src/hooks/useOfflineInspectionDetail.queueSave.test.tsx:9.
    - Not referenced by vitest.config.ts or its setup file (setupFiles is `./vitest.setup.ts` only, vitest.config.ts:21; grep for `src/test` in vitest.config* had no hits).
- Side effects: Permanently overrides the `navigator.onLine` property descriptor for the remainder of the jsdom environment; provides no restore/teardown function. Does NOT dispatch `online`/`offline` events — the header comment (online.ts:1-4) states callers must dispatch the matching event themselves, and consumers do (e.g. useOfflineInspectionDetail.selfHeal.test.tsx:24-26 pairs `setOnline(false/true)` with `window.dispatchEvent(new Event('offline'/'online'))`).
- Error handling: None — no try/catch. If `Object.defineProperty` failed (non-configurable property), the TypeError would propagate to the calling test.
- Tests: No test file targets online.ts itself. It is exercised by the 5 consumer suites, which assert: initial online state read on mount (useOfflineSync.online.test.tsx:27, useOfflineInspectionDetail.selfHeal.test.tsx:17), offline flip on transition events (useOfflineSync.online.test.tsx:33, selfHeal.test.tsx:22), self-heal of a missed transition on window focus (selfHeal.test.tsx:30), queue-race safety during drains (useOfflineSync.queueRaces.test.tsx:74-144), full-record SYNC_INSPECTION sync semantics (useOfflineSync.syncInspection.test.tsx:63-100), and offline queue-save/dedupe behaviour (useOfflineInspectionDetail.queueSave.test.tsx:22-61).
- Observed issues (factual):
  - The override is one-way: each `setOnline` call installs a new getter but nothing ever restores jsdom's original descriptor within a test file's lifetime (online.ts:5-10 is the entire module).
- ASSUMED:
  - jsdom's built-in `navigator.onLine` descriptor is configurable (the redefinition is asserted to work by the comment at online.ts:1-4 and by the consuming suites, but this pass did not run the test suites).

## src/index.css

- Purpose: The app's single global stylesheet — Tailwind's three layer directives plus the HSL design-token custom properties for light and `.dark` themes and a small set of base-layer global styles (touch targets, glassmorphism helpers, smooth scroll, custom scrollbar).
- Public surface (CSS, not JS):
  - `@tailwind base; @tailwind components; @tailwind utilities;` (index.css:1-3).
  - `:root` token block (index.css:10-58): `--background, --foreground, --card(-foreground), --popover(-foreground), --primary(-foreground), --secondary(-foreground), --muted(-foreground), --accent(-foreground), --destructive(-foreground), --border, --input, --ring, --radius, --sidebar-{background,foreground,primary,primary-foreground,accent,accent-foreground,border,ring}, --success(-foreground), --warning(-foreground), --info(-foreground)` — all colors as bare HSL triplets.
  - `.dark` token block (index.css:60-106): same variable set with dark values.
  - Base-layer globals (index.css:109-159): universal `border-border` (110-112); `body` background/foreground + font smoothing (114-118); ≤768px minimum 44px touch targets on `button, a, [role="button"]` (121-126); `.glass` and `.glass-card` utility classes (129-135); `html { scroll-behavior: smooth }` (138-140); webkit scrollbar styling (143-158).
- Inputs & outputs: No data flow; token variables are read by tailwind.config.ts, which maps them into utilities via `hsl(var(--…))` for border/input/ring/background/foreground/primary/secondary/destructive/muted/accent/popover/card/sidebar (tailwind.config.ts:17-59) and `var(--radius)` for borderRadius (tailwind.config.ts:62-64). No tables, buckets, storage, or env vars.
- Dependencies:
  - uses -> Tailwind directives and `@apply` utilities only (resolved by the Tailwind/PostCSS toolchain, unit P02); `.glass`/`.glass-card` `@apply` core utilities plus config-mapped colors (`bg-background/60`, `bg-card/70`, `border-border/50`).
  - used by <- (grep-verified, `grep -rn "index.css" src`):
    - A01 root-shell: src/app/layout.tsx:3 (`import "@/index.css";`) — the only tracked importer.
    - P02 tooling-config: components.json:8 declares `"css": "src/index.css"` as the shadcn stylesheet.
    - P02 tooling-config: tailwind.config.ts:17-64 consumes the variables (mapping, not an import).
    - Untracked working-tree duplicate `src/app/layout 2.tsx:3` also imports it (file is in git status as untracked and belongs to no manifest unit).
- Side effects: Global document styling once bundled; none at JS runtime.
- Error handling: Not applicable (declarative CSS).
- Tests: None (no test references index.css; grep-verified).
- Observed issues (factual):
  - `--success`, `--warning`, `--info` (and their `-foreground` pairs) are defined in both themes (index.css:50-57, 98-105) but tailwind.config.ts defines no `success`/`warning`/`info` color entries (its color map is exactly tailwind.config.ts:17-59), and no `var(--success…)`/`var(--warning…)`/`var(--info…)` usage exists anywhere in src outside index.css (grep-verified). Meanwhile Tailwind-style classes referencing those names do appear in source: `text-success`/`bg-success/10` (src/views/Calendar.tsx:183, 192), `bg-info/10 text-info` (src/views/Calendar.tsx:196), `bg-warning/10` and `text-warning-foreground` (src/components/pdf-editor/SectionEditor.tsx:128, 252).
  - The `.dark` values for `--success/--warning/--info` are byte-identical to the light values (index.css:98-105 vs 50-57).
  - A full `.dark` theme block exists (index.css:60-106) and Tailwind is set to `darkMode: ["class"]` (tailwind.config.ts:4), but grep found no code that adds or toggles a `dark` class on the document root and no `ThemeProvider` anywhere in tracked src; the only next-themes reference is `useTheme` in src/components/ui/sonner.tsx:1 (unit C01).
  - The file's header comment mandates "All colors MUST be HSL" (index.css:5-7); all variables in the file comply (bare HSL triplets throughout 10-106).
- ASSUMED:
  - Because no tracked code toggles the `dark` class, the `.dark` block is presumed inert at runtime except insofar as sonner's `useTheme` affects its own component; runtime behaviour was not observed in a browser during this pass.
  - The `bg-warning/10`-style classes in Calendar.tsx/SectionEditor.tsx are presumed to generate no CSS given the absent config entries; the compiled CSS output was not built and inspected in this pass.
