# L20 — fortress-kpis

- Unit id: L20
- Slug: fortress-kpis
- Spec mode: full
- Date: 2026-07-29
- Files: 5 (per review/unit-files.json key "L20")

## Unit header

**Unit purpose.** `src/lib/fortress/` holds pure KPI math for the Fortress building-pack dashboard: a weighted OHS building-compliance rollup (buildingCompliance.ts), a PPM (planned preventative maintenance) due/overdue summariser (ppm.ts), and hand-written placeholder row types for the two Supabase tables the math consumes (types.ts). The two calculators are self-described as the "single source of truth" for their KPIs, to be shared by screen and PDF (buildingCompliance.ts:1-3, ppm.ts:1-3).

**Module-level observations (cross-file).**
- Both calculators are pure functions with no I/O, no Supabase client, and no imports beyond `./types` (buildingCompliance.ts:7, ppm.ts:7).
- Both use the same empty-denominator convention: 100% when nothing is applicable/scheduled (buildingCompliance.ts:40, ppm.ts:48). `src/lib/complianceCalculations.ts:69` references this convention in a comment ("empty-denominator convention in siteHealth.ts, inspectionScore.ts and buildingCompliance.ts") without importing anything from this unit.
- Each calculator file is test-paired 1:1 (buildingCompliance.test.ts, ppm.test.ts); types.ts has no dedicated test but is imported by both test files.
- Header comments in both calculators reference plan identifiers ("S2-1", "S2-2", "S1-5", "D7"); those identifiers occur in docs/fortress-spec files (grep-verified: docs/fortress-spec/BUILD-PROMPT.md, 01-gap-analysis-and-dashboard.html, 02-build-roadmap.html, linear-import-26-tasks.csv).
- Grep-verified consumer picture: only `types.ts` has non-test consumers inside the app (src/components/fortress/AssetRegister.tsx:8 and AssetRegister.test.tsx:8, unit C06). The two calculator modules are imported by nothing except their own test files.

**External contract.** The rest of the app gets: `BuildingAsset` / `OhsComplianceItem` row shapes plus the `AssetCondition` / `OhsAnswer` literal unions (types.ts); `buildingCompliance(items)` and `complianceBySection(items)` returning `BuildingComplianceSummary` records (buildingCompliance.ts); `ppmSummary(assets, today, withinDays?)` returning a `PpmSummary` (ppm.ts); and the tunable constants `DEFAULT_OHS_WEIGHT` and `DUE_SOON_DAYS`. As of this spec only the types half of that contract is actually consumed (grep-verified above).

---

## src/lib/fortress/types.ts

- Purpose: Hand-written TypeScript row types for the Fortress tables `building_assets` and `ohs_compliance_items`, self-described as a "PLACEHOLDER scaffold" to be replaced with generated Supabase types once the migrations are applied (types.ts:1-4).
- Public surface:
  - `type AssetCondition = "Good" | "Fair" | "Poor" | "N/A"` (types.ts:6).
  - `interface BuildingAsset` — 24 fields mirroring `building_assets`: `id: string`, `site_id: string`, `section_code/make_model/quantity/install_date/service_freq/last_service/next_service_due/next_service_date/contractor/cost_recovery/inspection_freq/general_comment/created_by/deleted_at: string | null`, `category: string`, `name: string`, `service_cost: number | null`, `condition: AssetCondition | null`, `as_built_available: boolean | null`, `meta: Record<string, unknown> | null`, `created_at: string`, `updated_at: string` (types.ts:9-34).
  - `type OhsAnswer = "Y" | "N" | "N/A"` (types.ts:36).
  - `interface OhsComplianceItem` — 12 fields mirroring `ohs_compliance_items`: `id: string`, `site_id: string`, `period/section/item_code/evidence_url/comment: string | null`, `question: string`, `answer: OhsAnswer | null`, `weight: number | null`, `created_at: string`, `updated_at: string` (types.ts:39-52).
- Inputs & outputs: type-only module — no runtime values, no data flow, no stores. Field-level comments bind the shapes to migrations `20260612200000` (base) and `20260612210000` (hardening) (types.ts:1-2); both migration files exist and create/alter those tables (supabase/migrations/20260612200000_fortress_building_layer.sql:53,105; 20260612210000_fortress_layer_hardening.sql:29,42).
- Dependencies: uses -> none (zero imports). used by <- (grep-verified `fortress/types`): src/lib/fortress/buildingCompliance.ts:7, ppm.ts:7, buildingCompliance.test.ts:3, ppm.test.ts:3 (this unit); src/components/fortress/AssetRegister.tsx:8 and AssetRegister.test.tsx:8 (C06 public-fortress-floorplan). Also mentioned (as text, not an import) in docs/superpowers/specs/2026-06-20-fortress-asset-register-pdf-spec.md (X03).
- Side effects: none — type declarations only.
- Error handling: n/a — no runtime code.
- Tests: no dedicated test file; buildingCompliance.test.ts and ppm.test.ts import the types to build fixture factories (buildingCompliance.test.ts:3,5-6; ppm.test.ts:3,5-6).
- Observed issues:
  - The two tables are absent from the generated Supabase types: `grep -c "building_assets" src/integrations/supabase/types.ts` → 0, `grep -c "ohs_compliance_items"` → 0 — so all Fortress consumers run on these hand-written shapes, not on the generated `Database` type (L19).
  - The migration set creates five Fortress tables (`building_assets`, `ppm_tasks`, `ohs_compliance_items`, `building_condition_items`, `utilities_readings` — 20260612200000_fortress_building_layer.sql:53,84,105,130 and the list at 20260612210000_fortress_layer_hardening.sql:52); types.ts covers only two of them, consistent with its own "Kept minimal to what the scaffolded UI consumes" note (types.ts:4).
  - `OhsComplianceItem.period` is typed `string | null` with comment "reporting month" (types.ts:42) while the column is `date` in SQL (20260612200000:108); `BuildingAsset` date-ish fields (`install_date`, `last_service`, `next_service_due`) are `text` in SQL (20260612200000:61-64) and `string | null` here — the shapes match the columns; only `next_service_date` is a parsed `date` column (20260612210000:29).
  - `deleted_at` carries the comment "reads MUST filter deleted_at IS NULL" (types.ts:33); enforcement is left to callers (see ppm.ts observed issues).
- ASSUMED:
  - That the migrations have not been applied to the environment whose generated types are committed (inferred from the zero grep hits in src/integrations/supabase/types.ts; I did not query a live database).

## src/lib/fortress/buildingCompliance.ts

- Purpose: Pure weighted OHS building-compliance rollup — compliance % = Σ(weight of 'Y') / Σ(weight of 'Y'|'N') × 100, with 'N/A' and null answers excluded from the denominator (buildingCompliance.ts:1-5).
- Public surface:
  - `const DEFAULT_OHS_WEIGHT = 1` (buildingCompliance.ts:9).
  - `interface BuildingComplianceSummary { compliantWeight: number; applicableWeight: number; compliancePct: number; applicableCount: number; naCount: number }` (buildingCompliance.ts:11-17).
  - `function buildingCompliance(items: OhsComplianceItem[]): BuildingComplianceSummary` (buildingCompliance.ts:22).
  - `function complianceBySection(items: OhsComplianceItem[]): Record<string, BuildingComplianceSummary>` (buildingCompliance.ts:45).
  - Module-private: `weightOf(item)` — returns `item.weight` when it is a non-NaN number, else `DEFAULT_OHS_WEIGHT` (buildingCompliance.ts:19-20).
- Inputs & outputs: in — an in-memory array of `OhsComplianceItem`; out — plain summary object(s). No stores, tables, buckets, browser storage, or env vars touched.
- Data behavior details: items with `answer === "N/A"` increment `naCount` and are skipped (buildingCompliance.ts:29-32); any answer other than `"Y"`/`"N"` (i.e. null) is skipped entirely (line 33); `compliancePct` is `Math.round`-ed and forced to 100 when `applicableWeight === 0` (line 40). `complianceBySection` groups by `item.section || "Uncategorised"` — null and empty-string sections both land in "Uncategorised" (line 48) — then runs `buildingCompliance` per group (lines 53-56).
- Dependencies: uses -> `import type { OhsComplianceItem } from "./types"` (buildingCompliance.ts:7; same unit). used by <- src/lib/fortress/buildingCompliance.test.ts:2 only (grep-verified on `buildingCompliance`, `complianceBySection`, `BuildingComplianceSummary`, `DEFAULT_OHS_WEIGHT` across src and supabase); no non-test consumer found.
- Side effects: none — pure computation, no I/O, no mutation of inputs.
- Error handling: none present. No throw/try/catch; malformed weights fall back to `DEFAULT_OHS_WEIGHT` via the `typeof`/`Number.isNaN` guard (buildingCompliance.ts:19-20); passing a non-array would throw a TypeError at the `for...of` (line 28) — nothing catches it.
- Tests: src/lib/fortress/buildingCompliance.test.ts (this unit, detailed below) — asserts weighting, N/A exclusion, null-weight default, empty/all-N/A → 100%, null-answer exclusion, and per-section grouping.
- Observed issues:
  - The header states "screen and PDF both import it" (buildingCompliance.ts:2); grep finds no screen, PDF, or any non-test importer.
  - Negative or fractional `weight` values pass the `weightOf` guard unchanged (buildingCompliance.ts:19-20); no clamping exists.
- ASSUMED:
  - That "S2-1"/"S2-2"/"D7" (buildingCompliance.ts:1,44) refer to the Fortress build-roadmap screen/decision IDs in docs/fortress-spec (identifiers grep-hit those files; I did not map each ID to its definition).

## src/lib/fortress/buildingCompliance.test.ts

- Purpose: Vitest unit tests for `buildingCompliance` and `complianceBySection`.
- Public surface: none (test module). Fixture factory `item(over: Partial<OhsComplianceItem>): OhsComplianceItem` — spreads defaults `{ id:"i", site_id:"s", question:"q", answer:"Y", weight:1, section:null }` and casts with `as OhsComplianceItem` (buildingCompliance.test.ts:5-6).
- Inputs & outputs: in-memory fixtures only; no stores, network, or env.
- Dependencies: uses -> `vitest` (`describe/it/expect`, line 1), `./buildingCompliance` (line 2), `./types` (type-only, line 3) — all within L20. used by <- none found (grep-verified; test files are discovered by the vitest glob `src/**/*.test.{ts,tsx}`, vitest.config.ts:23, and run in the default `node` environment, vitest.config.ts:19).
- Side effects: none beyond test-runner registration.
- Error handling: n/a — failing expectations fail the suite.
- Tests (what it asserts):
  - Weighted math: Y(w3)+N(w1)+N/A(w5) → compliantWeight 3, applicableWeight 4, compliancePct 75, naCount 1, applicableCount 2 (lines 9-21).
  - Null weight defaults to 1: two null-weight items → applicableWeight 2, 50% (lines 23-27).
  - Empty array and all-N/A input both yield compliancePct 100 (lines 29-32).
  - Null answers excluded: null-answer item with weight 9 does not enter the denominator (lines 34-38).
  - `complianceBySection` groups per section: "1 Building" 50%, "2 Equipment" 100% (lines 41-52).
- Observed issues:
  - The factory's `as OhsComplianceItem` cast (line 6) produces records missing `created_at`/`updated_at`/`item_code`/`period`/`evidence_url`/`comment` relative to the interface (types.ts:39-52); the calculator never reads those fields.
  - No test covers `weightOf`'s NaN branch (buildingCompliance.ts:20) or negative weights.
- ASSUMED: none.

## src/lib/fortress/ppm.ts

- Purpose: Pure PPM rollup that classifies `building_assets.next_service_date` values into scheduled / due-soon / overdue counts and an on-schedule percentage, with `today` passed in for determinism (ppm.ts:1-5).
- Public surface:
  - `const DUE_SOON_DAYS = 30` (ppm.ts:9).
  - `interface PpmSummary { scheduled: number; dueSoon: number; overdue: number; onSchedulePct: number }` (ppm.ts:11-16).
  - `function ppmSummary(assets: BuildingAsset[], today: string, withinDays: number = DUE_SOON_DAYS): PpmSummary` (ppm.ts:27-31).
  - Module-private: `addDays(iso: string, days: number): string` — UTC date arithmetic returning `yyyy-mm-dd` (ppm.ts:19-23); `asDate(v)` — truthy check then `slice(0, 10)`, else null (ppm.ts:25).
- Inputs & outputs: in — `BuildingAsset[]`, `today` as ISO `yyyy-mm-dd`, optional window; out — `PpmSummary`. No stores, network, browser storage, or env vars.
- Data behavior details: assets whose `next_service_date` is null/empty are skipped (ppm.ts:38-39); classification is lexicographic string comparison — `date < today` → overdue, else `date <= horizon` → dueSoon where `horizon = addDays(today, withinDays)` (ppm.ts:32,41-45); a date equal to `today` counts as dueSoon, and the horizon boundary is inclusive. `onSchedulePct = Math.round((scheduled - overdue) / scheduled × 100)`, forced to 100 when `scheduled === 0` (ppm.ts:48) — dueSoon and beyond-horizon assets both count as on-schedule.
- Dependencies: uses -> `import type { BuildingAsset } from "./types"` (ppm.ts:7; same unit). used by <- src/lib/fortress/ppm.test.ts:2 only (grep-verified on `ppmSummary`, `PpmSummary`, `DUE_SOON_DAYS` across src and supabase); no non-test consumer found.
- Side effects: none — pure computation.
- Error handling: none present. A `today` string that does not parse (`new Date("…T00:00:00Z")` → Invalid Date) makes `addDays` throw a RangeError from `toISOString()` (ppm.ts:19-23) — uncaught. Malformed `next_service_date` strings are not validated: `asDate` just slices 10 characters (ppm.ts:25) and the lexicographic comparisons run on whatever remains.
- Tests: src/lib/fortress/ppm.test.ts (this unit, detailed below) — asserts classification, on-schedule %, today-is-dueSoon, inclusive 30-day boundary, and the empty-schedule case.
- Observed issues:
  - The header states "both the screen and the PDF import it; no inline KPI math elsewhere" (ppm.ts:2-3); grep finds no screen, PDF, or any non-test importer.
  - `ppmSummary` does not filter `deleted_at` even though types.ts:33 states "reads MUST filter deleted_at IS NULL"; soft-deleted assets passed in are counted.
- ASSUMED:
  - That "S1-5"/"D7" (ppm.ts:1-2) refer to the Fortress build-roadmap IDs in docs/fortress-spec (identifiers grep-hit those files; individual definitions not traced).

## src/lib/fortress/ppm.test.ts

- Purpose: Vitest unit tests for `ppmSummary` and the `DUE_SOON_DAYS` constant.
- Public surface: none (test module). Fixture factories: `a(over: Partial<BuildingAsset>): BuildingAsset` — defaults `{ id:"x", site_id:"s", category:"Fire", name:"Asset", next_service_date:null, deleted_at:null }` cast with `as BuildingAsset` (ppm.test.ts:5-6); `withDate(id, date)` wrapper (line 8); fixed `TODAY = "2026-06-14"` (line 10).
- Inputs & outputs: in-memory fixtures only; no stores, network, or env.
- Dependencies: uses -> `vitest` (line 1), `./ppm` (line 2), `./types` (type-only, line 3) — all within L20. used by <- none found (grep-verified; discovered by the vitest glob `src/**/*.test.{ts,tsx}`, vitest.config.ts:23, node environment).
- Side effects: none beyond test-runner registration.
- Error handling: n/a.
- Tests (what it asserts):
  - Classification: overdue (2026-05-01), dueSoon (2026-06-20), dueFar (2026-09-01), unscheduled (null) → scheduled 3, overdue 1, dueSoon 1 (lines 13-24).
  - onSchedulePct = (scheduled − overdue) / scheduled: 1 overdue of 4 → 75 (lines 26-33).
  - `today` itself is dueSoon, not overdue (lines 36-40).
  - Boundary date `today + 30` (2026-07-14) is dueSoon-inclusive, and `DUE_SOON_DAYS === 30` (lines 42-47).
  - Nothing scheduled → `{ scheduled: 0, overdue: 0, dueSoon: 0, onSchedulePct: 100 }` via `toMatchObject` (lines 49-52).
- Observed issues:
  - The factory's `as BuildingAsset` cast (line 6) produces records missing most interface fields (types.ts:9-34); `ppmSummary` reads only `next_service_date`.
  - No test covers the custom `withinDays` parameter (ppm.ts:30), timestamp-formatted `next_service_date` values (the `slice(0,10)` path, ppm.ts:25), or an invalid `today` string.
- ASSUMED: none.
