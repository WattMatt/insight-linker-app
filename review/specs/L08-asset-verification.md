# L08 — asset-verification

- Unit id: L08
- Slug: asset-verification
- Spec mode: full
- Date: 2026-07-29
- Files: 6 (per `review/unit-files.json` key "L08")

## Unit header

**Unit purpose.** Pure logic and PDF reporting for the site "Asset Verification" tab: it parses an imported electrical asset register (XLSX row matrix), reconciles each register asset against tenant meter data captured inside inspection `json_data`, and renders the outcome as a branded landscape pdfmake report ("Asset Verification Report") in the same visual family as the COC report. The React components (unit C07) own all data fetching, Excel IO and rendering; this unit is deterministic apart from the generator's async branding/image/PDF calls.

**Module-level observations (cross-file, verified).**
- Four-layer split declared in the files' own header comments and confirmed by imports: pure core (`assetVerification.ts`) → pure view-model (`assetVerificationReportModel.ts`) → pure doc-def renderer (`assetVerificationReport.ts`) → async orchestrator (`assetVerificationReportGenerator.ts`, which is the only file doing IO) (assetVerification.ts:1-3, assetVerificationReportModel.ts:1-3, assetVerificationReport.ts:1-4, assetVerificationReportGenerator.ts:8-11).
- The model and renderer headers say they "mirror" the COC report modules `src/lib/siteCoc/cocReportModel.ts` / `siteCocReport.ts` (L03), but this is comment-level only: no file in the unit imports anything from `src/lib/siteCoc` (grep for `siteCoc` across the four source files hits only the two comments at assetVerificationReport.ts:1 and assetVerificationReportModel.ts:2). Phase 1 note `review/inventory/01-src-lib-siteCoc.md:218` lists these two files as siteCoc "consumers"; that grep matched the comments, not imports.
- The sentinel set `{"NA", "TBC"}` (assetVerification.ts:79) governs both serial identity matching (assetVerification.ts:132, 167) and CT/breaker value comparison (assetVerification.ts:98-100).
- Summary numbers and row lists come from two different inputs: `AvSummary` is built solely from caller-supplied `input.stats`, while the three row arrays are derived from `input.comparisonResults`; the model never recomputes or cross-checks one against the other (assetVerificationReportModel.ts:74-133).
- Two distinct meanings of "verified" coexist: `ComparisonResult.verified` means "has an inspection match at all" (assetVerification.ts:177) and drives the `verifiedRows` table (which therefore includes mismatch rows, assetVerificationReportModel.ts:87-88), whereas `AvSummary.verified` is `stats.verifiedNoDiscrepancy` (assetVerificationReportModel.ts:25, 80) and drives the cover's "N verified" count and the verification percentage (assetVerificationReport.ts:87; assetVerificationReportModel.ts:76).
- Tests cover only the two pure modules (`assetVerification.test.ts`, `assetVerificationReportModel.test.ts`); the renderer and generator have no test files (grep across `src/**/*.test.*` finds no other importer of the unit).
- The feature is explicitly electrical-only: water meters are excluded by type comment (assetVerification.ts:7) and by the section guard in the row parser (assetVerification.ts:210-215, 229).

**External contract.** The rest of the app gets: (1) pure matching/parsing primitives — `normalizeMeterSerial`, `compareValues`, `buildInspectionMeterMatches`, `buildComparisonResults`, `parseAssetRows` plus their types — consumed by C07 site components (`AssetVerification.tsx`, `AssetComparisonTable.tsx`, `MeterRegister.tsx`) and by L07's `subsectionAssetMatch.ts` (`normalizeMeterSerial` only); and (2) one async entry point, `generateInspectionBasedReport`, consumed solely by C07's `AssetComparisonTable.tsx`, returning `{ blob, filename, complianceChecks }` for the preview dialog. The model and renderer modules are internal to the unit (no external importers, grep-verified).

---

## src/lib/assetVerification.ts

- Purpose: Pure, deterministic core for the Asset Verification tab — serial normalization, CT/breaker value comparison, inspection-tenant match-map construction, register-vs-inspection reconciliation, and electrical-register row parsing (assetVerification.ts:1-3).
- Public surface:
  - `type MatchStatus = "match" | "mismatch" | "na"` (line 5)
  - `interface ParsedAsset { premises_id: string; trade_as: string; meter_serial_number: string; meter_type?; ct_ratio?; breaker_size?; reading_at_commissioning?; old_meter_serial_number?; last_meter_read_old?; comments?: string }` (lines 8-19)
  - `interface InspectionTenant { id?; shopName?; shopNumber?; meterSerialNumber?; ctSizeAndRatio?; breakerSize?; meterImage?; ctRatioImage?; breakerImage?: string }` (lines 21-31)
  - `interface InspectionRecord { id: string; title: string; subsection_id: string | null; json_data: unknown }` (lines 33-38)
  - `interface SubsectionNameRecord { id: string; name: string }` (lines 40-43)
  - `interface InspectionTenantMatch { inspectionId; inspectionTitle: string; subsectionId: string | null; subsectionName?; shopName?; shopNumber?: string; meterSerialNumber: string; ctSizeAndRatio?; breakerSize?; meterImage?; ctRatioImage?; breakerImage?: string }` (lines 45-58)
  - `interface AssetForComparison { id: string; premises_id: string; trade_as: string | null; meter_serial_number: string | null; ct_ratio: string | null; breaker_size: string | null; asset_category: string }` (lines 60-68)
  - `interface ComparisonResult { asset: AssetForComparison; inspectionMatch: InspectionTenantMatch | null; verified: boolean; ctMatch: MatchStatus; breakerMatch: MatchStatus; hasDiscrepancy: boolean }` (lines 70-77)
  - `normalizeMeterSerial(serial: string | null | undefined): string` (lines 82-84) — uppercase, strip all non-`[A-Z0-9]`.
  - `compareValues(assetValue, inspectionValue: string | null | undefined): MatchStatus` (lines 91-103) — uppercase, strip all but `[A-Z0-9/]` (slash kept for ratios); empty or sentinel (`NA`/`TBC`) on either side → `"na"`; else strict equality → `"match"`/`"mismatch"`.
  - `buildInspectionMeterMatches(inspections: InspectionRecord[], subsections: SubsectionNameRecord[]): Map<string, InspectionTenantMatch>` (lines 120-157) — keyed by normalized serial; first occurrence wins unless a later tenant has an image and the incumbent has none (lines 134-137); tenants with empty or sentinel serials skipped (lines 130-132).
  - `buildComparisonResults(assets: AssetForComparison[], inspectionMeterMatches: Map<string, InspectionTenantMatch>): ComparisonResult[]` (lines 160-183) — `verified = !!inspectionMatch`; `ctMatch`/`breakerMatch` via `compareValues` only when matched, otherwise `"na"`; `hasDiscrepancy` = either field mismatched (line 180); assets with empty/sentinel serials never match (lines 165-169).
  - `parseAssetRows(rows: (string | number)[][]): ParsedAsset[]` (lines 190-260) — stateful sweep over a worksheet row matrix: `ELECTRICAL`/`WATER` marker rows (checked in first two cells) set the current section and reset the header map (lines 201-215); any row containing a cell with substring "premises id" (case-insensitive) becomes the header, mapped by lowercased-alphanumeric header names (lines 217-226); data rows are emitted only inside the ELECTRICAL section with a header present (line 229); rows without a premises id or without a meter serial are skipped (lines 232-233, 242-243); columns resolved through alias lists per field (lines 242-255), premises-id column falls back to index 1 (line 231).
- Inputs & outputs: in — inspection records with opaque `json_data` (expects `{ tenants: InspectionTenant[] }`, lines 105-109), subsection id/name pairs, asset rows, worksheet matrices; out — match map, `ComparisonResult[]`, `ParsedAsset[]`. No stores, no env vars, no browser APIs.
- Dependencies: uses -> none (zero imports). used by <- C07 `src/components/site/AssetVerification.tsx:21` (`parseAssetRows`, `buildInspectionMeterMatches`, `buildComparisonResults`, types `ParsedAsset`, `InspectionRecord`, `SubsectionNameRecord`), C07 `src/components/site/AssetComparisonTable.tsx:35` (`normalizeMeterSerial`, `buildComparisonResults`, types `AssetForComparison as Asset`, `InspectionTenantMatch`, `ComparisonResult`), C07 `src/components/site/MeterRegister.tsx:13` (`normalizeMeterSerial`), L07 `src/lib/report/subsectionAssetMatch.ts:1` (`normalizeMeterSerial`); intra-unit: `assetVerificationReportModel.ts:5` (type `ComparisonResult`), `assetVerificationReportGenerator.ts:17` (type `ComparisonResult`), `assetVerification.test.ts:11`, `assetVerificationReportModel.test.ts:3` (all grep-verified).
- Side effects: none — pure functions, no IO, no mutation of arguments (new Map/arrays built).
- Error handling: never throws on the paths present. Malformed/absent `json_data` yields an empty tenant list via `readTenants` (lines 105-109); null/undefined serials normalize to `""` (line 83); unparseable worksheet rows are silently skipped (lines 199, 229, 233, 243). No logging.
- Tests: `src/lib/assetVerification.test.ts` (same unit) — see that file's section.
- Observed issues:
  - `parseAssetRows` header detection (lines 217-226) is section-independent: a row containing "premises id" sets `hasHeader = true` and rebuilds `columnMap` even inside the WATER section or before any section marker; the electrical-only guard is applied only at data-row emission (line 229).
  - The `premisesIdIdx` fallback `?? 1` (line 231) hardcodes column 1 when neither `premisesid` nor `premiseid` resolved, despite the header row having been detected via a "premises id" cell.
  - `compareValues` sentinel check runs after normalization, so `"N/A"` and `"T.B.C"` also count as sentinels (normalize to `NA`/`TBC`), while `buildInspectionMeterMatches`/`buildComparisonResults` check sentinels against the fully alphanumeric-normalized serial (lines 132, 167).
- ASSUMED:
  - The `json_data.tenants` shape (`InspectionTenant`) matches what inspection forms actually persist — inferred from the cast at lines 107-108; not verified against the `inspections` table contents.
  - The header-alias lists (lines 242-255) correspond to real register spreadsheet column headings; only the test fixture's headings were verified.

## src/lib/assetVerification.test.ts

- Purpose: Vitest spec for the five exported functions of `assetVerification.ts` (line 2-11 imports).
- Public surface: none (test file; two local fixture helpers `inspection(...)` at lines 48-53 and the `rows` matrix at lines 168-177).
- Inputs & outputs: none at runtime beyond vitest; no stores.
- Dependencies: uses -> `vitest` (line 1, external), `./assetVerification` (line 11, L08 internal). used by <- none found (grep-verified); executed by the vitest runner via the include glob `src/**/*.test.{ts,tsx}` (vitest.config.ts:24), node environment (vitest.config.ts:19).
- Side effects: none.
- Error handling: n/a.
- Tests: is the test. What it asserts, by describe block:
  - `normalizeMeterSerial` (lines 13-25): uppercases and strips non-alphanumerics (`"ab-12/3"` → `"AB123"`), strips spaces, returns `""` for null/undefined/empty.
  - `compareValues` (lines 27-46): both-empty → `"na"`; `NA`/`TBC` sentinels → `"na"`; one side missing → `"na"`; slash preserved and spacing/case ignored (`"1000/5"` vs `"1000 / 5"` → `"match"`); genuine mismatch flagged.
  - `buildInspectionMeterMatches` (lines 55-114): keys by normalized serial with subsection name attached; skips missing/NA/TBC serials; later tenant with images replaces earlier imageless one; first tenant kept when neither has images; tolerates `json_data` that is null, a string, or has non-array `tenants` (size 0).
  - `buildComparisonResults` (lines 116-164): serial match → `verified: true` with `ctMatch`/`breakerMatch` `"match"` and no discrepancy; CT mismatch → `hasDiscrepancy: true`; no match → `verified: false`, `ctMatch "na"`; asset serial `NA` never matches.
  - `parseAssetRows` (lines 167-204): parses 2 electrical rows from the mixed fixture with flexible headers; skips the row with no meter serial; ignores the WATER section entirely; returns `[]` for sheets without recognizable section/header.
- Observed issues: none noted beyond coverage facts (does not test `parseAssetRows` alias fallbacks other than those in the fixture, nor the `?? 1` premises-id fallback).
- ASSUMED: nothing.

## src/lib/assetVerificationReportModel.ts

- Purpose: Pure, I/O-free view-model builder that shapes comparison data plus caller-supplied stats into the typed `AvReportModel` the renderer consumes (lines 1-3).
- Public surface:
  - `interface AvReportInput { siteName: string; clientName?: string | null; generatedAt: string; referenceNumber: string; comparisonResults: ComparisonResult[]; stats: { total; verified; verifiedNoDiscrepancy; discrepancies; unverified; withImages: number } }` (lines 7-21)
  - `interface AvSummary { total; verified; discrepancies; unverified; withImages; verificationPct: number }` (lines 23-30) — `verified` documented as "verified with no discrepancy" (line 25).
  - `interface AvVerifiedRow { premisesId; tradeAs: string; mismatch: boolean; source; meterSerial; ctRatio: string; ctMismatch: boolean; breaker: string; breakerMismatch: boolean; meterImage; ctRatioImage; breakerImage: string | null }` (lines 32-46)
  - `interface AvDiscrepancyRow { premisesId; field; registerValue; inspectionValue: string }` (lines 48-53)
  - `interface AvUnverifiedRow { premisesId; tradeAs; meterSerial; ctRatio; breaker: string }` (lines 55-61)
  - `interface AvReportModel { cover: { siteName; clientName: string | null; generatedAt; referenceNumber }; summary: AvSummary; narrative: string; verifiedRows; discrepancyRows; unverifiedRows }` (lines 63-70)
  - `buildAssetVerificationReportModel(input: AvReportInput): AvReportModel` (lines 74-155).
- Inputs & outputs: in — `AvReportInput`; out — `AvReportModel`. `verificationPct = round(verifiedNoDiscrepancy / total * 100)`, 0 when `total` is 0 (line 76). `verifiedRows` = results with `verified: true`, `source` falling back subsectionName → shopName → `"Inspection"` (line 93), image URLs carried through as `?? null` (lines 99-101). `discrepancyRows` = up to two rows (CT ratio, Breaker size) per discrepant result (lines 104-123). `unverifiedRows` = results with `verified: false` (lines 125-133). `narrative` = English sentence with singular/plural switching (lines 135-140). Blank strings become `"—"` via `dash` (line 72). No stores, no env vars.
- Dependencies: uses -> `./assetVerification` (line 5, type-only `ComparisonResult`, L08 internal). used by <- L08 internal only: `assetVerificationReport.ts:8` (type `AvReportModel`), `assetVerificationReportGenerator.ts:18` (`buildAssetVerificationReportModel`), `assetVerificationReportModel.test.ts:2`; no consumers outside the unit (grep-verified).
- Side effects: none — pure.
- Error handling: no failure paths; divide-by-zero guarded at line 76; missing optionals fall back to `"—"` (dash) or `null`. Never throws, no logging.
- Tests: `src/lib/assetVerificationReportModel.test.ts` (same unit) — see that file's section.
- Observed issues:
  - `AvReportInput.stats.verified` (line 15) is declared but never read: the summary maps `verified: stats.verifiedNoDiscrepancy` (line 80) and nothing else touches `stats.verified`.
  - Summary counts and row arrays come from independent inputs (`stats` vs `comparisonResults`); nothing reconciles them (lines 76-85 vs 87-133).
  - `verifiedRows` includes rows where `hasDiscrepancy` is true (filter is `r.verified`, line 88), while `summary.verified` counts only no-discrepancy assets — the "verified" wording differs between the table and the counts.
- ASSUMED:
  - Callers pass `stats` internally consistent with `comparisonResults` (the sole caller, `AssetComparisonTable.tsx`, computes both from the same source per its lines 139-148 — read but that file belongs to C07 and was not spec'd here).

## src/lib/assetVerificationReportModel.test.ts

- Purpose: Vitest spec for `buildAssetVerificationReportModel` (line 2).
- Public surface: none (fixture factories `asset`, `result`, `stats` at lines 5-34).
- Inputs & outputs: none beyond vitest.
- Dependencies: uses -> `vitest` (line 1, external), `./assetVerificationReportModel` (line 2), `./assetVerification` (line 3, type-only) — both L08 internal. used by <- none found (grep-verified); executed via vitest include glob (vitest.config.ts:24).
- Side effects: none.
- Error handling: n/a.
- Tests: is the test. Six `it` blocks assert:
  - verificationPct = 75 from `verifiedNoDiscrepancy: 3 / total: 4`, `summary.verified` = 3, narrative contains "75%" (lines 37-45);
  - 0% (not NaN) when `total` is 0 (lines 47-52);
  - verified rows carry `mismatch`, per-field `ctMismatch`/`breakerMismatch` flags and `source: "Sub 1"` from subsectionName (lines 54-70);
  - image URLs carried onto verified rows, `null` when absent (lines 72-84);
  - CT + breaker double mismatch emits 2 discrepancy rows with field names "CT ratio" and "Breaker size" and register/inspection values (lines 86-104);
  - unverified assets listed with `"—"` fallback for blank `trade_as`/`ct_ratio` (lines 106-114).
- Observed issues: none noted beyond coverage facts (narrative pluralization branches and the `source` shopName/`"Inspection"` fallbacks are untested).
- ASSUMED: nothing.

## src/lib/assetVerificationReport.ts

- Purpose: Pure pdfmake doc-definition renderer for the Asset Verification report — landscape, branded cover, executive summary (narrative + tinted KPI cards + rate gauge), issues section, and three striped detail tables (lines 1-4).
- Public surface: `buildAssetVerificationReportDocDef(model: AvReportModel, logoDataUrl?: string | null, images?: Map<string, string>): TDocumentDefinitions` (lines 45-49). Module-private helpers: `hcell` (line 16), `stripeLayout(headerRows)` (lines 20-29), `cardGap` (lines 31-41), `tone(pct)` (line 43), and inside the builder `thumb`/`imagesCell` (lines 133-142) and the three table builders (lines 144-183).
- Inputs & outputs: in — the model, an optional logo data-URL, an optional Map of source-image-URL → data-URL thumbnails; out — a `TDocumentDefinitions` with `pageOrientation: "landscape"` (line 196), cover content (lines 62-95), KPI card row of four `tintedKpiCard`s (lines 97-111), executive summary + issues lists (lines 113-128), verified/discrepancy/unverified tables (lines 144-183), a footer "Watson Mattheus · Confidential" plus site/page counter (lines 199-205), and a `pageBreakBefore` that breaks on `headlineLevel === 1` only when the current page already has content (line 208). Logo fallback is a hardcoded two-line text block "WATSON MATTHEUS / CONSULTING ELECTRICAL ENGINEERS" (lines 55-60); "Prepared by" is hardcoded to the same firm (line 73). Colors are file-local hex constants (lines 10-14, 16, 43). No stores, no env vars.
- Dependencies: uses -> `./pdfMakeConfig` (line 6, type-only `Content`, `TDocumentDefinitions`; L14), `./pdfBars` (line 7, `tintedKpiCard`, `gaugeBar`, `toneForPct`; L14), `./assetVerificationReportModel` (line 8, type-only `AvReportModel`; L08 internal). used by <- L08 internal only: `assetVerificationReportGenerator.ts:19`; no other consumers (grep-verified).
- Side effects: none — builds a plain object; the footer and `pageBreakBefore` entries are functions evaluated later by pdfmake.
- Error handling: no throw paths of its own. Missing/unfetched images are skipped: `thumb` returns `null` when the URL is absent or not in the map (lines 134-137), `imagesCell` falls back to a `"—"` cell (line 141). Empty row arrays get single placeholder rows spanning the table ("No assets verified…", "No value mismatches.", "Every register asset has a matching inspection.") (lines 156, 168, 181). Missing client name renders `"—"` (line 72).
- Tests: none — no test file imports this module (grep-verified across `src/**/*.test.*`).
- Observed issues:
  - `model.summary.withImages` is never referenced anywhere in the renderer (grep: zero hits in this file), though the model populates it.
  - Two parallel pct→tone mappings with identical 80/50 thresholds coexist in the same render: the file-local `tone()` returning hex colors (line 43, used for the cover rate at lines 51, 82) and `toneForPct()` from pdfBars returning tone names (used for the "Verified" KPI card at line 103).
  - `hcell` and several cell builders return `any` (lines 16, 139, 156, 168, 181 casts), bypassing the `Content` typing the file otherwise imports.
  - Company identity (name, "Confidential" footer, brand fallback text) is hardcoded in this file; only the logo image comes from branding (lines 55-60, 73, 202).
- ASSUMED:
  - pdfmake honors `headlineLevel` as a passthrough custom property readable in `pageBreakBefore` — inferred from usage here and the comment at lines 206-207; not verified against pdfmake docs.
  - The comment "pdf.js mis-renders canvas-in-table-cell" (line 4) motivating pdfBars is taken as-is from the header; not reproduced.

## src/lib/assetVerificationReportGenerator.ts

- Purpose: Async orchestrator that resolves branding, builds the model, fetches/compresses reference thumbnails, renders the doc-def to a PDF blob, and returns blob + filename + a compliance-check object for the preview dialog (lines 1-11, 37-40).
- Public surface:
  - `interface InspectionGeneratorOptions { siteName: string; clientName?: string; comparisonResults: ComparisonResult[]; stats: { total; verified; verifiedNoDiscrepancy; discrepancies; unverified; withImages: number }; companyLogoUrl?: string | null }` (lines 22-35)
  - `generateInspectionBasedReport(options: InspectionGeneratorOptions): Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }>` (lines 41-85).
- Inputs & outputs: in — options above; out — `{ blob, filename, complianceChecks }`. Flow: logo = `imageUrlToBase64(companyLogoUrl)` when an explicit URL is given, else `loadCompanyBranding().logoDataUrl` (lines 47-49); model built with `generatedAt = formatPdfDate(new Date())` and `referenceNumber = generateReferenceNumber("AVR")` (lines 51-58); thumbnail URLs collected from every verified row's meter/CT/breaker images and resolved via `loadImagesSimple(urls, { compress: true, maxWidth: 240, quality: 0.55 })` — `undefined` when there are none (lines 62-67); blob via `generatePdfBlob(buildAssetVerificationReportDocDef(model, logoDataUrl, images))` (line 69); filename via `generateDocumentFilename("Asset_Verification", siteName)` (line 70). Stores touched indirectly through L14 helpers: `settings` table read by `loadCompanyBranding` (pdfBranding.ts:147-150), Supabase Storage bucket downloads / direct fetches by `loadImagesSimple` (simpleImageLoader.ts:122-147), plain `fetch` by `imageUrlToBase64` (pdfBranding.ts:94-97). No direct table/bucket/localStorage access in this file; no env vars.
- Dependencies: uses -> `./documentDesignStandards` (line 13, `generateDocumentFilename`; L10), `./pdfMakeConfig` (line 14, `generatePdfBlob`; L14), `./pdfBranding` (line 15, `loadCompanyBranding`, `imageUrlToBase64`, `formatPdfDate`, `generateReferenceNumber`; L14), `./pdfTemplates` (line 16, `PDFComplianceCheck`, `createComplianceResult`; L14), `./assetVerification` (line 17, type `ComparisonResult`; L08 internal), `./assetVerificationReportModel` (line 18; L08 internal), `./assetVerificationReport` (line 19; L08 internal), `./simpleImageLoader` (line 20, `loadImagesSimple`; L14). used by <- C07 `src/components/site/AssetComparisonTable.tsx:25` (`generateInspectionBasedReport`); no other consumers (grep-verified).
- Side effects: network reads (Supabase `settings` select, storage downloads, image fetches) and in-browser PDF generation via pdfmake — all through the imported L14 helpers; no writes to any store (saving the PDF is done by the caller via `pdfDocumentSaver`, AssetComparisonTable.tsx:22).
- Error handling: no try/catch in this file. Verified helper behavior: `imageUrlToBase64` catches everything and resolves `null` (pdfBranding.ts:85-122); `loadCompanyBranding` catches and falls back to cached/default branding (pdfBranding.ts:145-175); `loadImagesSimple` omits failed URLs from the returned Map (simpleImageLoader.ts:168-185; per-URL failures return `null`, simpleImageLoader.ts:110-162). `generatePdfBlob` throws on canvas-validation failure or missing fonts (pdfMakeConfig.ts:392-404); such a throw — and any other rejection — propagates to the caller (`AssetComparisonTable.tsx`).
- Tests: none — no test file imports this module (grep-verified).
- Observed issues:
  - Naming: the sole exported function is `generateInspectionBasedReport` and its options type `InspectionGeneratorOptions` (lines 22, 41) — neither mentions asset verification, unlike the sibling generators (also noted at review/inventory/03-src-lib.md:485; re-verified here).
  - `createComplianceResult` is called with eight of nine flags hardcoded `true`; only `logoPlacement: !!logoDataUrl` reflects runtime state (lines 72-82) — the compliance object asserts rather than measures.
  - `stats.verified` and `stats.withImages` are accepted here (lines 28, 32) and passed through, but (per the model/renderer sections) `stats.verified` is never read and `withImages` never rendered.
- ASSUMED:
  - The returned `complianceChecks` shape is what the preview dialog expects — inferred from the doc comment (line 39) and `AssetComparisonTable.tsx:26` importing `PDFComplianceCheck`; the dialog's actual consumption was not traced (C07/C08 territory).
