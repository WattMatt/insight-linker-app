# L17 — site-scoring-compliance

- Unit id: L17
- Slug: site-scoring-compliance
- Spec mode: full
- Date: 2026-07-29
- Files: 14 (7 source + 7 co-located tests)

## Unit header

**Unit purpose.** Pure, I/O-free calculators for site- and subsection-level scoring and compliance presentation: the weighted site health score and readiness counts (siteHealth.ts), snapshot-vs-live score merging (siteScores.ts), the 8-deliverable per-site read-model and cross-site triage ranking (siteDeliverables.ts), the snapshot-row mapping for the nightly capture job (snapshotMetrics.ts), the public QR verdict card presentation (publicVerdict.ts), the two-dimension subsection verdict (subsectionCompliance.ts), and shared compliance/snag display-state helpers (subsectionStatus.ts).

**Module-level observations (cross-file facts inside the unit).**
- Every source file has a same-named co-located `.test.ts`; all are picked up by vitest's include pattern `src/**/*.test.{ts,tsx}` (vitest.config.ts:22). None of the 7 source files performs I/O or imports Supabase — all exports are pure functions/constants/types.
- Internal dependency chain: siteHealth.ts is imported by siteScores.ts (siteScores.ts:13-18), siteDeliverables.ts (siteDeliverables.ts:9-12) and snapshotMetrics.ts (snapshotMetrics.ts:4, type-only); snapshotMetrics.ts also imports siteDeliverables.ts (snapshotMetrics.ts:3, type-only). publicVerdict.ts, subsectionCompliance.ts and subsectionStatus.ts import nothing from within the unit.
- The snag terminal-status vocabulary is declared twice inside the unit: `RESOLVED_SNAG_STATUSES = ['Rectified', 'Closed']` (siteHealth.ts:35) and lowercase `TERMINAL_SNAG_STATUSES = ["rectified", "closed"]` (subsectionStatus.ts:20). Both are compared case-insensitively at their use sites (siteHealth.ts:44-45, subsectionStatus.ts:23,33).
- The COC "pass" vocabulary appears in publicVerdict.ts:20 (`PASS = new Set(["Pass", "Approved", "Valid"])`), duplicating `VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass']` in L09 (src/lib/complianceCalculations.ts:33); a third, lowercase fail/pending vocabulary lives in siteDeliverables.ts:138-139 (`cocItemCopy`).
- Two different metering predicates coexist: siteHealth.isMetered passes only on `metering_status === 'Installed'` or a serial number (siteHealth.ts:38-40), while subsectionCompliance's installation dimension fails metering only on `meteringStatus === "Missing"` with no serial (subsectionCompliance.ts:31-32).
- Case handling is mixed in both siteHealth.ts and siteDeliverables.ts: snag *resolution* is case-insensitive (siteHealth.ts:44-45), but snag *blocking* checks compare `status === 'Open'` and risk levels with exact case (siteHealth.ts:53-55, siteDeliverables.ts:160).

**External contract.** The rest of the app gets: the canonical health formula and readiness counts consumed by the nightly snapshot capture route (A02 src/app/api/snapshots/capture/route.ts:3-6) and dashboards (C14); snapshot/live score merging consumed by H03 useSiteScores; the deliverables/triage read-model consumed by A02, V01 (Dashboard, SiteDetail), C07, C14, C17, and type-only by L13 buildActionHref; the snapshot row mapper consumed by A02; the public verdict presentation consumed by C06 and V04; the subsection verdict consumed by C14 and V07; and status/bucket helpers consumed by A02, C09, C14, L03, L09, V03 and V07.

## src/lib/siteHealth.ts

- Purpose: Single source of truth for operational site health (metering + snags + inspections; COC excluded per header comment lines 2-7) — factor percentages, weighted score, per-subsection readiness, and band cutoffs.
- Public surface:
  - Interfaces: `SubsectionForHealth { id: string; metering_status?: string|null; meter_serial_number?: string|null; is_inspection_required?: boolean|null }` (10-15); `SnagForHealth { subsection_id: string; status?: string|null; risk_level?: string|null }` (16-20); `InspectionForHealth { subsection_id?: string|null; status?: string|null; json_data?: unknown }` (21-25); `FactorScores { metering: number; snags: number; inspections: number }` (26); `HealthWeights { snags: number; inspections: number; metering: number }` (27); `ReadinessResult { ready: number; total: number; failing: { metering: number; snags: number; inspection: number } }` (28-32); `SiteHealthResult { score: number; factors: FactorScores }` (85).
  - Constants: `DEFAULT_WEIGHTS = { snags: 0.40, inspections: 0.35, metering: 0.25 }` (34); `RESOLVED_SNAG_STATUSES = ['Rectified', 'Closed']` (35); `BLOCKING_RISK_LEVELS = ['Critical', 'High']` (36).
  - Functions: `isMetered(s: SubsectionForHealth): boolean` (38-40); `isSnagResolved(snag: SnagForHealth): boolean` (41-46, case-insensitive); `isInspectionCompleted(i: InspectionForHealth): boolean` (50-52, returns `!!i`); `factorScores(subsections, snags, inspections): FactorScores` (57-77); `siteHealthScore(factors: FactorScores, weights: HealthWeights = DEFAULT_WEIGHTS): number` (79-83); `computeSiteHealth(subsections, snags, inspections): SiteHealthResult` (95-102); `readiness(subsections, snags, inspections): ReadinessResult` (104-125); `getHealthBand(score: number): 'success'|'warning'|'danger'` (127-131, cutoffs ≥80 / ≥50).
- Inputs & outputs: in — arrays of subsection/snag/inspection row shapes already loaded by callers; out — numbers/records. No stores, tables, buckets, storage keys or env vars touched.
- Dependencies: uses -> `inspectionHasImages` from `./inspectionImages` (line 8; L12 file-image-utils). used by <- (grep-verified) A02 src/app/api/snapshots/capture/route.ts:4 (`computeSiteHealth`, `readiness`); C14 src/components/SiteHealthBadge.tsx:1 (`getHealthBand`), src/components/ComplianceDashboard.tsx:13 (`readiness`, `computeSiteHealth`), src/components/SiteSummaryReport.tsx:48 (`computeSiteHealth`); L09 src/lib/kpiMetrics.ts:4 (`BLOCKING_RISK_LEVELS`); L03 src/lib/siteCoc/reportKpis.ts:4 (`BLOCKING_RISK_LEVELS`); V07 src/views/subsection-detail/OverviewTab.tsx:13 and src/views/subsection-detail/useSubsectionDetail.ts:10 (`isInspectionCompleted`); within-unit: siteScores.ts:13-18, siteDeliverables.ts:9-12, snapshotMetrics.ts:4 (type ReadinessResult), siteScores.test.ts:3.
- Side effects: none (pure; header comment lines 6 states "Pure functions, no I/O").
- Error handling: no throw paths; null/undefined fields are coalesced (`(snag.status || "")` line 44, `.filter(Boolean)` lines 70/111); zero-subsection input returns all-zero factors (line 66) rather than dividing by zero; zero snags returns 100 (line 68); zero inspection-required subsections returns 100 (line 74).
- Tests: src/lib/siteHealth.test.ts (this unit) — see its section. Additionally C14 src/components/SiteHealthBadge.test.tsx:29-36 asserts badge colors "follow getHealthBand thresholds (80 green / 50 amber / below red)" through the component, not by calling getHealthBand directly.
- Observed issues:
  - `isBlockingOpenSnag` (53-55) compares `snag.status === 'Open'` and `BLOCKING_RISK_LEVELS.includes(snag.risk_level)` with exact case, while `isSnagResolved` (44-45) lowercases specifically because "prod data carries mixed casing" (comment 42-43). A snag with status `"open"` or risk `"critical"` does not block readiness.
  - `isInspectionCompleted` (50-52) returns `!!i` — true for any non-null argument. Its three external call sites all pass a freshly built object literal (`{ status: insp?.status }` at OverviewTab.tsx:100, OverviewTab.tsx:279, useSubsectionDetail.ts:1104), so `!isInspectionCompleted(...)` evaluates to `false` at each of them. The comment at 47-49 states the existence-based model is deliberate.
  - Two different notions of "inspected" in one file: `factorScores`/`readiness` require a photo (`inspectionHasImages`, lines 69-71 and 110-112) while the exported `isInspectionCompleted` is existence-based (50-52).
- ASSUMED: the comments citing product history ("40 of 76 production sites read as perfect", line 65; "product decision 2026-07-08", line 92) are taken at face value — not verifiable from code.

## src/lib/siteHealth.test.ts

- Purpose: Vitest suite for every export of siteHealth.ts, including the empty-site-scores-0 rule and the inspection waiver.
- Public surface: none (test module). Helpers: `sub(id, over)` (line 8), `PHOTO_JSON` (11), `withPhoto(subsection_id, over)` (12-13).
- Inputs & outputs: in — literal fixtures; out — vitest assertions. No stores.
- Dependencies: uses -> `./siteHealth` (2-6); vitest (1). used by <- none found (grep-verified); executed by vitest via include `src/**/*.test.{ts,tsx}` (vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts: `isMetered` on status/serial/neither (16-24); `isSnagResolved` exact and lowercase statuses plus null (25-34); `isInspectionCompleted` true for any object (35-38); `factorScores` per-factor percentages 67/67/67 (41-54), snags 100 when empty (55-57), all-zero for zero subsections (58-61), dedupe of multiple inspections per subsection (62-65), image-less inspection not counted (66-70); `siteHealthScore` weighted 87/61/80→74 (74-76) and weights sum to 1 (77-80); `readiness` ready/failing counts (84-94), only Critical/High open snags block (95-102), resolved critical doesn't block (103-108), image-less inspection fails (109-115); `getHealthBand` cutoffs at 80/50 (119-124); `computeSiteHealth` empty site scores 0 (128-130), composition equality (131-137), all-waived populated site scores 100 (138-142); waiver: waived subsection excluded from denominator (146-155), all-waived inspections factor 100 (157-160), waived not counted as failing in readiness (162-170).
- Observed issues: none noted.
- ASSUMED: none.

## src/lib/siteScores.ts

- Purpose: Pure merge of nightly `site_health_snapshots` rows with live-computed fallback scores into a per-site `SiteScore` map for portal site cards.
- Public surface:
  - `interface SiteScore { siteId: string; healthScore: number; capturedAt: string|null; source: "snapshot"|"live" }` (20-27).
  - `interface SnapshotScoreRow { site_id: string; health_score: number|null; total_subsections: number|null; captured_at: string }` (29-34).
  - `isUsableSnapshotRow(row: SnapshotScoreRow): boolean` (38-40) — true when `health_score !== null || total_subsections === 0`.
  - `interface LiveScoreInputs { coveredSiteIds: Iterable<string>; subsections: Array<SubsectionForHealth & { site_id: string }>; snags: SnagForHealth[]; inspections: Array<InspectionForHealth & { site_id?: string|null }> }` (42-50).
  - `latestSnapshotPerSite(rows: SnapshotScoreRow[]): Map<string, SnapshotScoreRow>` (53-61).
  - `buildSiteScoreMap(siteIds: string[], snapshotRows: SnapshotScoreRow[], live: LiveScoreInputs): Map<string, SiteScore>` (63-122).
- Inputs & outputs: in — snapshot rows (shape of the `site_health_snapshots` table per header comment lines 5-6) and live row arrays; out — `Map<string, SiteScore>`. The file itself touches no stores ("Fetching lives in useSiteScores", line 11).
- Dependencies: uses -> `computeSiteHealth` + types from `./siteHealth` (13-18; same unit). used by <- (grep-verified) H03 src/hooks/useSiteScores.ts:3 (`buildSiteScoreMap`, `isUsableSnapshotRow`, `LiveScoreInputs`, `SiteScore`); C14 src/components/SiteHealthBadge.tsx:2 and src/components/SiteHealthBadge.test.tsx:7 (type `SiteScore` only); C03 src/components/client-portal/SiteOverviewCard.tsx:5 (type `SiteScore` only).
- Side effects: none (pure).
- Error handling: no throw paths. Unusable snapshot rows are skipped (line 56). A snapshot with `total_subsections === 0` is served as score 0 regardless of stored `health_score` (line 103). Sites neither snapshotted nor in `coveredSiteIds` are omitted from the result map (line 109, "caller renders a pending state"). Snags whose `subsection_id` is not in `live.subsections` are dropped (81-82); inspections with neither `site_id` nor a resolvable `subsection_id` are dropped (89-90).
- Tests: src/lib/siteScores.test.ts — see its section.
- Observed issues:
  - `latestSnapshotPerSite` orders rows by lexicographic string comparison `row.captured_at > current.captured_at` (58); `captured_at` is typed plain `string` (33) while the `SiteScore.capturedAt` doc comment says "yyyy-mm-dd" (25).
  - Non-null assertion `snapshot.health_score!` (103); reachable only after `isUsableSnapshotRow` filtering (56) and the `total_subsections === 0` ternary on the same line.
  - Attribution drops are silent (no logging): lines 82, 90.
- ASSUMED: that the "nightly capture job" and "2AM capture" mentioned in comments (lines 5, 10 of the header comment block) describe A02's actual schedule — scheduling is not verifiable from this unit.

## src/lib/siteScores.test.ts

- Purpose: Vitest suite for latestSnapshotPerSite and buildSiteScoreMap, centered on snapshot preference, live-fallback formula identity, and the empty-site-is-0 rule.
- Public surface: none. Helpers: `snap(site_id, captured_at, health_score, total_subsections = 5)` (5-6), `noLive` (8).
- Inputs & outputs: fixtures in, assertions out. No stores.
- Dependencies: uses -> `./siteScores` (2), `factorScores`/`siteHealthScore` from `./siteHealth` (3), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: asserts newest scored row wins per site regardless of order (11-20); a null-score row for a populated site cannot mask an older scored row (22-29); a `total_subsections=0` row is itself the latest answer (31-37); snapshot preferred with capture date and `source: 'snapshot'` (41-49); live fallback equals `siteHealthScore(factorScores(...))` exactly (51-73); covered empty site scores 0 live (75-81); legacy snapshot storing 100 or NULL with `total_subsections=0` served as 0 (83-90); uncovered site absent from the map (92-95); snag attribution via subsection and inspection attribution via subsection when `site_id` missing (97-116).
- Observed issues: none noted.
- ASSUMED: none.

## src/lib/siteDeliverables.ts

- Purpose: Per-site deliverables read-model — derives 8 deliverable statuses (snags, coc, inspections, metering, schematic, asset_register, thermal, summary_report) from already-loaded data, plus outstanding-item lists, aggregate summary, and a cross-site triage ranking.
- Public surface:
  - Types: `DeliverableKey` (16-18, 8-member union); `DeliverableStatus = 'complete'|'outstanding'|'not_required'` (20); `Severity = 'critical'|'high'|'medium'|'low'|'none'` (21); `SubsectionForDeliverables extends SubsectionForHealth, SubsectionForCompliance { id; name?; is_thermal_required? }` (23-27); `SnagForDeliverables extends SnagForHealth { id; title? }` (28-31); `InspectionForDeliverables = InspectionForHealth` (32); `OutstandingItem { id; category: DeliverableKey; label; actionLabel?; severity: Severity; blocking: boolean; subsectionId?; subsectionName? }` (34-47); `DeliverableResult { key; label; kind: 'count'|'binary'; done: number; total: number; status; blocking; outstandingItems }` (49-58); `SiteDeliverablesInput { siteId; siteName; subsections; snags; inspections; hasSchematic: boolean; assetCount: number; documentCategories: (string|null|undefined)[]; thermalDocSubsectionIds?: string[] }` (60-73); `SiteDeliverablesSummary { siteId; siteName; deliverables; completeCount; applicableCount; completionPct; outstandingCount; blockingCount; band; nextTasks }` (75-86); `SiteTriageRow { siteId; siteName; band; blockingCount; outstandingCount; completionPct; byCategory }` (88-96).
  - Constants: `DELIVERABLE_LABELS: Record<DeliverableKey, string>` (98-107); `DELIVERABLE_ORDER: DeliverableKey[]` (109-111); `THERMAL_CATEGORY_PATTERNS` = /thermal/i,/thermo/i,/infrared/i,/thermograph/i (116); `SUMMARY_CATEGORY_PATTERNS` = /site summary/i,/summary report/i (117).
  - Functions: `categoryMatches(categories: (string|null|undefined)[], patterns: readonly RegExp[]): boolean` (119-124); `computeSiteDeliverables(input: SiteDeliverablesInput): SiteDeliverablesSummary` (298-324); `summarizeSitesForTriage(inputs: SiteDeliverablesInput[]): SiteTriageRow[]` (326-344, sorted by blocking desc, outstanding desc, completion asc, lines 339-343).
  - Private: `BINARY_ACTION_LABELS` (126-130), `cocItemCopy` (136-141), `SEVERITY_RANK` (143), `severityFromRisk` (145-153), `buildSnags` (155-177), `cocResolved` (182-184, = `hasValidCocStatus(s.coc_status)`), `buildCoc` (186-208), `buildInspections` (210-232), `buildMetering` (234-252), `buildThermal` (254-275), `buildBinary` (277-288), `compareItems` (290-296).
- Inputs & outputs: in — one `SiteDeliverablesInput` per site (all data pre-loaded by callers); out — summary/triage records. No stores touched (header line 7: "Pure functions, no I/O").
- Dependencies: uses -> `isMetered`, `isSnagResolved`, `getHealthBand`, `BLOCKING_RISK_LEVELS` + types from `./siteHealth` (9-12; same unit); `hasValidCocStatus`, type `SubsectionForCompliance` from `./complianceCalculations` (13; L09); `inspectionHasImages` from `./inspectionImages` (14; L12). used by <- (grep-verified) A02 src/app/api/snapshots/capture/route.ts:3 (`computeSiteDeliverables`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS`, type `SiteDeliverablesInput`); V01 src/views/Dashboard.tsx:13 (`summarizeSitesForTriage`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS`, types) and src/views/SiteDetail.tsx:32 (`computeSiteDeliverables`, `categoryMatches`, `THERMAL_CATEGORY_PATTERNS`); C07 src/components/site/SiteComplianceChecklist.tsx:6-11 (`DELIVERABLE_ORDER` + types); C14 src/components/ComplianceDashboard.tsx:17-19 (types only); C17 src/components/dashboard/SitesNeedingAttention.tsx:4 (type `SiteTriageRow`); L13 src/lib/buildActionHref.ts:7 and src/lib/buildActionHref.test.ts:3 (type `OutstandingItem`); within-unit snapshotMetrics.ts:3 (type `SiteDeliverablesSummary`).
- Side effects: none (pure).
- Error handling: no throw paths. Missing subsection names fall back to `'Subsection'` (299, 195, 222, 241, 264); missing snag title to `'Untitled'` (164); absent `thermalDocSubsectionIds` treated as empty (258); null/undefined categories skipped by `categoryMatches` (123).
- Tests: src/lib/siteDeliverables.test.ts — see its section. buildActionHref.test.ts (L13) uses only the `OutstandingItem` type.
- Observed issues:
  - Blocking-snag test at 160 (`s.status === 'Open' && BLOCKING_RISK_LEVELS.includes(s.risk_level || '')`) is exact-case on both fields, while resolution filtering two lines up uses case-insensitive `isSnagResolved` (157-158) and `severityFromRisk` lowercases (146). A snag with status `"open"` risk `"Critical"` is listed outstanding with label "Open snag" but `blocking: false`.
  - `cocItemCopy`'s default branch (140) labels any status not in {fail, failed, rejected, pending} — including unknown strings — as "COC missing"/"Upload COC".
  - Every outstanding COC item is emitted with fixed `severity: 'high', blocking: true` (196).
  - Zero-total asymmetry: `buildSnags` returns `'complete'` for 0 snags (173) while coc/inspections/metering/thermal return `'not_required'` for total 0 (204, 229, 249, 272). The test at siteDeliverables.test.ts:236 documents this ("snags(0/0 complete)").
  - The `applicableCount === 0 ? 100` guard (313) is unreachable: `buildSnags` never returns `'not_required'` and `buildBinary` returns only complete/outstanding (281), so `applicableCount` is always ≥ 4.
  - `THERMAL_CATEGORY_PATTERNS` is exported (116) but `computeSiteDeliverables` itself only uses `SUMMARY_CATEGORY_PATTERNS` (308); thermal completeness comes from caller-supplied `thermalDocSubsectionIds` (258), and the thermal pattern matching is performed by consumers (route.ts:3, Dashboard.tsx:13, SiteDetail.tsx:32 all import `categoryMatches` + `THERMAL_CATEGORY_PATTERNS`).
- ASSUMED: the "Phase 1 / Phase 2" roadmap in comments (lines 4-6, 44-45, 115) reflects planning documents not verified here; `documentCategories`/`thermalDocSubsectionIds` are assumed to be sourced from site documents / `subsection_documents` per comments (69-71) — actual sourcing lives in the callers.

## src/lib/siteDeliverables.test.ts

- Purpose: Vitest suite for category matching, constants sync, computeSiteDeliverables counts/binaries/thermal/waivers/COC copy/aggregation/ordering, and summarizeSitesForTriage ranking.
- Public surface: none. Helpers: `baseInput(over)` (35-40), `get(summary, key)` (41-42), `PHOTO_JSON` (45).
- Inputs & outputs: fixtures in, assertions out. No stores.
- Dependencies: uses -> `./siteDeliverables` (2-5, 33, 275), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts: thermal patterns match "05 Thermal Reports"/"Infrared scan"/"Thermographic survey" and reject "IR test results" (8-16); summary patterns (17-20); 8 ordered deliverables and LABELS/ORDER key-set sync (24-30); snags counts + blocking on Critical open (48-62); COC register-truth — only Pass counts done, Missing/Pending/Failed outstanding, Fail stays outstanding, non-required → not_required (64-89); image-based inspections done/outstanding (91-115); metering excludes "Not Required" (117-129); binary schematic/asset/summary presence with "Upload schematic" label (132-146); thermal not_required without flags even when a site-level thermal category exists (150-157), per-subsection counting (159-175), complete when all required have docs (177-183); inspection waiver drops from count and outstanding list (186-200), all-waived → not_required (202-207); COC copy Missing/Pending/Fail label+actionLabel triplets (210-228); aggregation on an empty site (1/4 complete, 25%, danger band, 3 outstanding, 0 blocking) (231-242) and all-complete → 100% success (244-251); nextTasks orders blocking first then severity (254-272); triage ranks blocking > outstanding-count > completion-asc with two explicit tiebreak cases (277-337).
- Observed issues: none noted.
- ASSUMED: none.

## src/lib/snapshotMetrics.ts

- Purpose: Pure mapping from the live read-models (deliverables summary + readiness + score + open-snag count) to a `site_health_snapshots` row for the daily capture job.
- Public surface: `interface SnapshotInput { siteId: string; capturedAt: string; summary: SiteDeliverablesSummary; readiness: ReadinessResult; healthScore: number; openSnags: number }` (6-14); `interface SnapshotRow { site_id; captured_at; health_score; completion_pct; outstanding_count; blocking_count; open_snags; ready_count; total_subsections }` (all number/string, 16-26); `toSnapshotRow(i: SnapshotInput): SnapshotRow` (28-40).
- Inputs & outputs: in — one SnapshotInput; out — one SnapshotRow whose field names mirror `site_health_snapshots` columns (header comment lines 1-2). Reads only `summary.completionPct/outstandingCount/blockingCount` and `readiness.ready/total`. No stores touched by this file.
- Dependencies: uses -> type `SiteDeliverablesSummary` from `./siteDeliverables` (3) and type `ReadinessResult` from `./siteHealth` (4) — both same-unit, type-only. used by <- (grep-verified) A02 src/app/api/snapshots/capture/route.ts:6 (import) and route.ts:89 (call).
- Side effects: none (pure).
- Error handling: none — straight field mapping, no validation, no throw paths.
- Tests: src/lib/snapshotMetrics.test.ts — see its section.
- Observed issues: none in the source file.
- ASSUMED: that `SnapshotRow` field names match the actual `site_health_snapshots` table columns — the table definition (D-era migrations) was not inspected for this spec.

## src/lib/snapshotMetrics.test.ts

- Purpose: Single-case vitest suite verifying the field mapping of toSnapshotRow.
- Public surface: none.
- Inputs & outputs: one literal fixture; one `toEqual` assertion (14-24).
- Dependencies: uses -> `./snapshotMetrics` (2), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts the complete output row for `{siteId: "s1", capturedAt: "2026-06-16", completionPct: 63, outstandingCount: 31, blockingCount: 4, ready: 12, total: 18, healthScore: 71, openSnags: 14}` (5-25).
- Observed issues: `summary` and `readiness` fixtures are cast with `as any` (lines 9-10), supplying only the three/two fields the mapper reads.
- ASSUMED: none.

## src/lib/publicVerdict.ts

- Purpose: Presentation mapping from a public COC verdict record to the QR verdict card's kind/headline/sub copy, with expiry as a display-only hint on Pass.
- Public surface: `interface PublicVerdict { coc_required: boolean; status: string|null; cert_number: string|null; issue_date: string|null; expiry_date: string|null }` (4-10); `type VerdictKind = "pass"|"pass-expiring"|"fail"|"pending"|"missing"|"none"` (12); `interface VerdictPresentation { kind: VerdictKind; headline: string; sub: string|null }` (14-18); `presentVerdict(v: PublicVerdict|null, today: Date): VerdictPresentation` (24-44). Private: `PASS = Set{"Pass","Approved","Valid"}` (20), `FAIL = Set{"Fail","Failed","Rejected"}` (21), `EXPIRY_HINT_DAYS = 30` (22).
- Inputs & outputs: in — a verdict record (or null) plus a caller-supplied `today` Date; out — a presentation record. No stores.
- Dependencies: uses -> nothing (zero imports). used by <- (grep-verified) C06 src/components/public/PublicVerdictCard.tsx:1 (`presentVerdict`, type `PublicVerdict`); V04 src/views/PublicSubsection.tsx:10 (same symbols).
- Side effects: none (pure).
- Error handling: no throw paths. Null verdict, `coc_required` false, status `"N/A"` or null all collapse to `kind: "none"` with empty headline (25-27). Any status not in PASS/FAIL and not "Missing" falls through to `"pending"` (43). `new Date(v.expiry_date)` on an unparseable date yields NaN days, and `NaN < 30` is false, so the result is plain `"pass"` (33-38).
- Tests: src/lib/publicVerdict.test.ts — see its section.
- Observed issues:
  - `PASS` (20) re-declares the same three strings as `VALID_COC_STATUSES` in L09 (src/lib/complianceCalculations.ts:33); `FAIL` overlaps the lowercase list in siteDeliverables.ts:138 — three parallel status vocabularies.
  - The `days < EXPIRY_HINT_DAYS` check (34) is also true for negative days, so a Pass whose expiry is already past renders `kind: "pass-expiring"`, headline "Compliant", sub "COC expiry date approaching — re-verification pending" (35) — past expiry is worded as "approaching". Header comment (2-3) states expiry "can add a hint to a Pass, never change the verdict".
  - `cert_number` and `issue_date` are declared in `PublicVerdict` (7-8) but never read by `presentVerdict`.
  - Day arithmetic divides raw ms difference by 86,400,000 without normalizing time-of-day (33) — the 30-day boundary depends on the clock time inside `today`.
- ASSUMED: consumers render cert details from the fields `presentVerdict` ignores (PublicVerdictCard was not read for this spec beyond its import line).

## src/lib/publicVerdict.test.ts

- Purpose: Vitest suite for every VerdictKind branch of presentVerdict, pinned to a fixed `today` of 2026-07-27T00:00:00Z.
- Public surface: none. Fixtures: `base` PublicVerdict (4-7), `today` (8).
- Inputs & outputs: fixtures in, assertions out. No stores.
- Dependencies: uses -> `./publicVerdict` (2), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts: null → none (11-13); Pass → pass/"Compliant" (14-18); expiry 2026-08-10 (14 days out) → pass-expiring with "re-verification" sub (19-23); expiry 2026-09-27 (62 days out) → plain pass (24-26); Fail → fail, "Not compliant", "remedial work in progress" sub (27-32); Pending → pending (33-35); Missing → missing (36-38); "N/A" and `coc_required: false` → none (39-42); synonyms Approved→pass, Rejected→fail (43-46).
- Observed issues: the expired-Pass case (negative days) is not exercised.
- ASSUMED: none.

## src/lib/subsectionCompliance.ts

- Purpose: Two-dimension subsection verdict — Installation (no open snags, metering not explicitly Missing without serial) and Documentation (Initial COC doc with Pass verdict when required) — combined into an overall boolean.
- Public surface: `interface SubsectionVerdict { installation: boolean; documentationRequired: boolean; documentation: boolean; overall: boolean }` (3-8); `interface VerdictInput { isCocRequired: boolean; openSnagCount: number; meteringStatus: string|null|undefined; meterSerialNumber: string|null|undefined; cocDocs: CocDoc[]; today: string }` (10-17); `computeSubsectionVerdict(input: VerdictInput): SubsectionVerdict` (29-42).
- Inputs & outputs: in — a per-subsection VerdictInput (COC docs already loaded); out — a 4-boolean verdict. No stores.
- Dependencies: uses -> `CocDoc` type and `cocDocFails` from `./cocHierarchy` (1; L09 coc-compliance-calcs). used by <- (grep-verified) C14 src/components/SiteSummaryReport.tsx:13; V07 src/views/subsection-detail/OverviewTab.tsx:15.
- Side effects: none (pure).
- Error handling: no throw paths; nullish metering fields are handled by the explicit `=== "Missing"` / falsy-serial checks (31-32); empty `cocDocs` with COC required yields `documentation: false` via `find` returning undefined (37-38).
- Tests: src/lib/subsectionCompliance.test.ts — see its section.
- Observed issues:
  - `input.cocDocs.find(d => d.cocType === "Initial")` (37) evaluates only the first Initial-typed doc in array order; further Initial docs are ignored.
  - The documentation check `initial.cocStatus === "Pass" && !cocDocFails(initial, input.today)` (38) — `cocDocFails` is `d.cocStatus === 'Fail'` with `_today` unused (src/lib/cocHierarchy.ts:52-54), so when `cocStatus === "Pass"` the `!cocDocFails(...)` clause is always true and cannot change the result. The `today` parameter of `VerdictInput` (16) therefore has no effect on the output.
  - Installation's metering clause (fails only on `"Missing"` + no serial, 31-32) is a different predicate from siteHealth.isMetered (passes only on `'Installed'` or serial, siteHealth.ts:38-40): e.g. `meteringStatus: "Pending"` with no serial is installation-compliant here but unmetered in siteHealth.
- ASSUMED: the doc-comment claim that this uses "Same source as the I/S card line (cocHierarchy), so the two never disagree" (26-27) — the I/S card consumer was not verified for this spec.

## src/lib/subsectionCompliance.test.ts

- Purpose: Vitest suite for computeSubsectionVerdict covering both dimensions and their combinations.
- Public surface: none. Fixtures: `TODAY = "2026-06-22"` (5), `doc(over): CocDoc` (6-9), `base` (10).
- Inputs & outputs: fixtures in, assertions out. No stores.
- Dependencies: uses -> `./subsectionCompliance` (2), type `CocDoc` from `./cocHierarchy` (3; L09), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts: clean install + Initial Pass → all true (13-16); missing Initial → documentation false (17-22); Initial Pending → false (23-26); Initial Fail → false (27-30); Initial Pass with past expiry (2020-01-01) still passes — "register-truth: expiry is display-only" (31-34); Supplementary-only → false (35-38); open snag → installation false regardless of docs (39-43); metering Missing + empty serial → installation false (44-47); not-required → documentation true with no docs, overall = installation (48-51); not-required + open snag → overall false (52-57).
- Observed issues: none noted.
- ASSUMED: none.

## src/lib/subsectionStatus.ts

- Purpose: Shared display-state helpers — maps the server-owned `is_compliant` flag to a three-way compliance state and buckets snag statuses case-insensitively so list, detail and dashboards agree.
- Public surface: `type ComplianceState = "compliant"|"non-compliant"|"pending"` (5); `complianceState(isCompliant: boolean|null|undefined): ComplianceState` (12-16); `isSnagOpen(status: string|null|undefined): boolean` (22-24); `type SnagBucket = "open"|"inProgress"|"closed"` (26); `snagStatusBucket(status: string|null|undefined): SnagBucket` (31-36). Private: `TERMINAL_SNAG_STATUSES = ["rectified", "closed"]` (20).
- Inputs & outputs: in — scalar status values; out — string literals. No stores.
- Dependencies: uses -> nothing (zero imports). used by <- (grep-verified) A02 src/app/api/snapshots/capture/route.ts:5 (`isSnagOpen`); C14 src/components/ComplianceDashboard.tsx:15 (`snagStatusBucket`) and src/components/SiteSummaryReport.tsx:51 (`isSnagOpen`); C09 src/components/site/SubsectionList.tsx:14 (`complianceState`, `isSnagOpen`, type `ComplianceState`); L09 src/lib/kpiMetrics.ts:3 (`snagStatusBucket`); L03 src/lib/siteCoc/reportKpis.ts:3 (`snagStatusBucket`); V03 src/views/ClientPortalDashboard.tsx:12 (`isSnagOpen`); V07 src/views/subsection-detail/useSubsectionDetail.ts:7 (`isSnagOpen`).
- Side effects: none (pure).
- Error handling: no throw paths; null/undefined/empty status coalesces to `""` and reads as open (23, 32-35); `complianceState` maps null/undefined to `"pending"` — doc comment states rendering it as Fail "misrepresents an unknown state" (8-11).
- Tests: src/lib/subsectionStatus.test.ts — see its section.
- Observed issues: `TERMINAL_SNAG_STATUSES` (20) encodes the same terminal set as `RESOLVED_SNAG_STATUSES` in the same unit (siteHealth.ts:35), in different casing and unexported; the two are not derived from each other.
- ASSUMED: `is_compliant` is "server-owned" (recompute-produced) as the comment says (8-9) — the recompute mechanism is outside this unit.

## src/lib/subsectionStatus.test.ts

- Purpose: Vitest suite for complianceState, isSnagOpen and snagStatusBucket including case-insensitivity.
- Public surface: none.
- Inputs & outputs: literal scalars in, assertions out. No stores.
- Dependencies: uses -> `./subsectionStatus` (2), vitest (1). used by <- none found (grep-verified); run via vitest.config.ts:22 include.
- Side effects: none.
- Error handling: n/a.
- Tests: is itself the test file. Asserts: complianceState true→compliant, false→non-compliant, null/undefined→pending (5-15); isSnagOpen false for Rectified/closed/CLOSED, true for Open/"In Progress"/""/null (18-28); snagStatusBucket closed for Closed/closed/Rectified/rectified, inProgress for "In Progress"/"in_progress", open for Open/"whatever"/""/null (32-47).
- Observed issues: none noted.
- ASSUMED: none.
