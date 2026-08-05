# Inventory: src/lib/siteCoc — site COC domain library

- Date: 2026-07-29
- List command: `git ls-files 'src/lib/siteCoc/*'` → **34 files** (verified: `git ls-files 'src/lib/siteCoc/*' | wc -l` → `34`)
- LOC command: `wc -l src/lib/siteCoc/*.ts` → **1978 total** (per-file numbers below are from that output)
- Test-case count: `grep -n 'it(' src/lib/siteCoc/*.test.ts | wc -l` → `90`
- 18 implementation files (source) + 16 co-located `*.test.ts` files (tests). Every implementation file except `types.ts` and `siteCocReport.ts` has a matching test file; `cocReportModel.test.ts` exercises the model that `siteCocReport.ts` renders.

## Implementation files

### src/lib/siteCoc/assignmentEngine.ts
- Type: source
- LOC: 50
- Public surface:
  - `interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null }` (assignmentEngine.ts:3)
  - `interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null }` (assignmentEngine.ts:4)
  - `type AssignOutcome = "assigned" | "ambiguous_cert" | "cert_has_no_subsection" | "cert_not_found" | "no_cert_detected"` (assignmentEngine.ts:6-11)
  - `interface PoolClassification { poolId; outcome; certId?; subsectionId?; candidateCertIds?; candidateSubsectionIds? }` (assignmentEngine.ts:13-20)
  - `planPoolAssignment(files: PoolFileLite[], certs: CertRowLite[]): PoolClassification[]` (assignmentEngine.ts:23)
- Notes: pure classification of pooled files against register certs, keyed on `normCert`.

### src/lib/siteCoc/clientCocSummary.ts
- Type: source
- LOC: 77
- Public surface:
  - `interface ClientCocSubsection` (id, name, tenant_name, is_coc_required, coc_status, coc_expiry_date) (clientCocSummary.ts:4-11)
  - `interface ClientCocDoc` (subsection_id, file_name, file_url, coc_type, category_name) (clientCocSummary.ts:13-19)
  - `interface ClientCocRow` (subsectionId, name, cocRequired, statusLabel, tone, expiry, viewUrl, viewName) (clientCocSummary.ts:21-30)
  - `cocStatusTone(status: string | null | undefined, required: boolean): Tone` (clientCocSummary.ts:32)
  - `cocStatusLabel(status: string | null | undefined, required: boolean): string` (clientCocSummary.ts:43)
  - `buildClientCocSummary(subsections: ClientCocSubsection[], cocDocs: ClientCocDoc[]): ClientCocRow[]` (clientCocSummary.ts:49-52)
- Notes: imports `isCocCertificateCategory`, `normalizeCocType` from `@/lib/cocHierarchy` and `Tone` from `@/lib/siteCoc/statusDisplay` (clientCocSummary.ts:1-2).

### src/lib/siteCoc/cocReportModel.ts
- Type: source
- LOC: 154
- Public surface:
  - `type VerdictKind = "pass" | "fail" | "review" | "cv" | "pending"` (cocReportModel.ts:3)
  - `interface ReportCert` (cocReportModel.ts:5-9), `interface ReportTenant` (10-15), `interface ScheduleTableRow` (16-19), `interface VerificationRow` (20), `interface FileRegisterRow` (21-24), `interface CocReportModel` (25-36)
  - `interface BuildInput { siteName; generatedAt; lastImport; clientName?; address?; subsections: SubRow[]; certificates: CertRow[]; schedule: SchedRow[]; siteKpis?: SiteKpiBlock }` (cocReportModel.ts:49) — `SubRow`/`CertRow`/`SchedRow` are non-exported (38-48)
  - `verdictKind(verdict: string, rules: Record<string, string> | null): VerdictKind` (cocReportModel.ts:51)
  - `buildCocReportModel(input: BuildInput): CocReportModel` (cocReportModel.ts:66)
- Notes: pure model builder for the PDF report; imports `SiteKpiBlock` type from `./reportKpis` (cocReportModel.ts:1).

### src/lib/siteCoc/coverage.ts
- Type: source
- LOC: 16
- Public surface:
  - `assignedSubsectionIds(rows: { subsection_id: string | null }[]): Set<string>` (coverage.ts:1)
  - `unassignedCocRequired<T extends { id: string; is_coc_required?: boolean | null }>(...)` (coverage.ts:5)
  - `liveMatchCounts(rows: { subsection_id: string | null }[]): { matched: number; unmatched: number }` (coverage.ts:12)

### src/lib/siteCoc/ingest.ts
- Type: source
- LOC: 82
- Public surface:
  - `matchSubsection(row: { shop_no_raw: string; trading_name: string }, subs: SubsectionLite[]): string | null` (ingest.ts:28) — exact-normalised match first, then longest whole-word contains fallback on trading name; ambiguous → null
  - `interface ScheduleInsertRow extends ParsedScheduleRow { site_id; import_batch_id; subsection_id; match_status: "matched" | "unmatched" }` (ingest.ts:54-56)
  - `interface CertificateInsertRow extends ParsedCertificate { ... same fields }` (ingest.ts:57-59)
  - `assembleScheduleRows(parsed: ParsedScheduleRow[], subs: SubsectionLite[], siteId: string, batchId: string): ScheduleInsertRow[]` (ingest.ts:61)
  - `assembleCertificateRows(certs: ParsedCertificate[], scheduleRows: ScheduleInsertRow[], siteId: string, batchId: string): CertificateInsertRow[]` (ingest.ts:69)
  - `summarize(schedule: { match_status: string }[], certs: { match_status: string }[]): ImportSummary` (ingest.ts:78)

### src/lib/siteCoc/normalize.ts
- Type: source
- LOC: 35
- Public surface:
  - `normShop(s: string | null | undefined): string` (normalize.ts:1)
  - `normCert(s: string | null | undefined): string` (normalize.ts:6)
  - `normCertType(s): "Initial" | "Supplementary" | "Unclear"` (normalize.ts:11)
  - `parseFilesCount(v: unknown): number | null` (normalize.ts:18)
  - `parseIssuedDate(v: unknown): string | null` (normalize.ts:24)

### src/lib/siteCoc/parseWorkbooks.ts
- Type: source
- LOC: 140
- Public surface (all take `Grid = unknown[][]`, a non-exported alias at parseWorkbooks.ts:5):
  - `findHeader(rows: Grid): { idx: number; col: Record<string, number> } | null` (parseWorkbooks.ts:9)
  - `parseDbSchedule(rows: Grid): ParsedScheduleRow[]` (parseWorkbooks.ts:31)
  - `parseCertificateDetail(rows: Grid): ParsedCertificate[]` (parseWorkbooks.ts:54)
  - `parseVerification(rows: Grid): ParsedCertificate[]` (parseWorkbooks.ts:82)
  - `mergeCertificates(detail: ParsedCertificate[], verification: ParsedCertificate[]): ParsedCertificate[]` (parseWorkbooks.ts:124)
- Notes: sheet-grid parsers for the three import workbooks (DB Schedule, Certificate Detail, Verification).

### src/lib/siteCoc/poolAssign.ts
- Type: source
- LOC: 16
- Public surface:
  - re-export: `export type { PoolFileLite, CertRowLite } from "./assignmentEngine"` (poolAssign.ts:3)
  - `interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval" }` (poolAssign.ts:5)
  - `planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[]` (poolAssign.ts:8) — filters `planPoolAssignment` results to outcome `"assigned"`.

### src/lib/siteCoc/rankCandidates.ts
- Type: source
- LOC: 56
- Public surface:
  - `interface RankInput { id: string; name: string; tenant_name?: string | null }` (rankCandidates.ts:3)
  - `interface RankedCandidate { id: string; name: string; score: number }` (rankCandidates.ts:4)
  - `rankSubsectionCandidates(query: string, subs: RankInput[], topN = 3): RankedCandidate[]` (rankCandidates.ts:44)

### src/lib/siteCoc/reimport.ts
- Type: source
- LOC: 20
- Public surface:
  - `applyPriorMatches<T extends { shop_no_raw; subsection_id; match_status: "matched" | "unmatched" | "manual" }>(newRows: T[], priorMap: Map<string, { id: string; status: "matched" | "manual" }>, validSubsectionIds: Set<string>): T[]` (reimport.ts:9-11)
- Notes: carries prior manual/auto match resolutions across a re-import (doc comment reimport.ts:3-8).

### src/lib/siteCoc/reportKpis.ts
- Type: source
- LOC: 70
- Public surface:
  - `interface SiteKpiBlock` (readinessPct, snagsOpen, snagsHighRisk, snagsClosed, oldestOpenDays, inspectionPassPct, inspectionPass, inspectionFail, meteringDone, meteringTotal, expiry buckets) (reportKpis.ts:8-20)
  - `inspectionPassRate(inspections: { json_data?: { sections?: { items?: { value?: unknown }[] }[] } }[]): { pass; fail; pct }` (reportKpis.ts:23-24)
  - `buildSiteKpiBlock(input: { deliverablesSummary; snags; subsections; inspections; today }): SiteKpiBlock` (reportKpis.ts:41-47)
- Notes: imports shared helpers from `../subsectionStatus`, `../siteHealth`, `../kpiMetrics`, `../report/inspectionScore` (reportKpis.ts:3-6). Header comment states "Pure; no I/O" (reportKpis.ts:1-2).

### src/lib/siteCoc/routeUpload.ts
- Type: source
- LOC: 31
- Public surface:
  - `type FileKind = "coc" | "eval"` (routeUpload.ts:4)
  - `classifyCocFile(fileName: string): FileKind` (routeUpload.ts:6) — `pass-`/`fail-` prefix or `.htm(l)` → eval, else coc
  - `interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null }` (routeUpload.ts:13)
  - `interface RoutePlanItem { name; kind; certNo; subsectionId; certRowId; status: "routed" | "unmatched" | "ambiguous" }` (routeUpload.ts:14-18)
  - `planRouting(files: { name: string }[], certRows: CertRowLite[]): RoutePlanItem[]` (routeUpload.ts:20)
- Notes: imports `extractCocNumber` from `@/lib/cocFilename` (routeUpload.ts:1).

### src/lib/siteCoc/sansRules.ts
- Type: source
- LOC: 37
- Public surface:
  - `type RuleResult = "PASS" | "FAIL" | "CV" | "N/A"` (sansRules.ts:1)
  - `interface SansRule { code: string; label: string; group: "A" | "B" | "C" }` (sansRules.ts:2)
  - `const COC_SANS_RULES: SansRule[]` (sansRules.ts:4) — SANS 10142-1 rule catalogue
  - `ruleCodeFromHeader(header: string): string | null` (sansRules.ts:31)
  - `isKnownRuleCode(code: string): boolean` (sansRules.ts:37)

### src/lib/siteCoc/siteCocReport.ts
- Type: source
- LOC: 290 (largest file in the slice)
- Public surface:
  - `buildSiteCocReportDocDef(model: CocReportModel, logoDataUrl?: string | null, qrCodeDataUrl?: string | null): TDocumentDefinitions` (siteCocReport.ts:132) — sole export
- Notes: pdfmake document-definition builder (landscape COC status report: cover with optional QR "Scan to verify" block at siteCocReport.ts:146-165, KPI cards, schedule/verification/file-register tables, footer with page numbers at 278-284, `pageBreakBefore` handler at 287-288). Only type-level import from `pdfmake/interfaces` (siteCocReport.ts:1). No test file of its own; the model it renders is covered by cocReportModel.test.ts.

### src/lib/siteCoc/statusDisplay.ts
- Type: source
- LOC: 44
- Public surface:
  - `type Tone = "green" | "red" | "amber" | "slate"` (statusDisplay.ts:1)
  - `scheduleStatusTone(status: string | null | undefined): Tone` (statusDisplay.ts:4)
  - `verdictTone(verdict: string | null | undefined): Tone` (statusDisplay.ts:13)
  - `ruleTone(v: string | null | undefined): Tone` (statusDisplay.ts:22)
  - `const TONE_PILL: Record<Tone, string>` (statusDisplay.ts:31), `const TONE_CELL: Record<Tone, string>` (statusDisplay.ts:39) — CSS-class maps

### src/lib/siteCoc/types.ts
- Type: source
- LOC: 43
- Public surface (types only, no functions):
  - `interface ParsedScheduleRow` (types.ts:4-15)
  - `interface ParsedCertificate` (types.ts:18-34) — `rules: Record<string, RuleResult>` imported from `./sansRules`
  - `interface SubsectionLite { id; name; tenant_name? }` (types.ts:36)
  - `interface ImportSummary { shops_imported; certs_imported; matched_count; unmatched_count }` (types.ts:38-43)

### src/lib/siteCoc/uploadQueue.ts
- Type: source
- LOC: 35
- Public surface:
  - `type FileOutcome = { name; state: "uploaded"; poolId; detectedCertNo } | { name; state: "failed"; error }` (uploadQueue.ts:1-3)
  - `interface UploadSummary { total: number; uploaded: number; failed: number }` (uploadQueue.ts:5)
  - `async mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item, index) => Promise<R>, onProgress?: (done, total) => void): Promise<R[]>` (uploadQueue.ts:8-13)
  - `summarizeUpload(outcomes: FileOutcome[]): UploadSummary` (uploadQueue.ts:31)

### src/lib/siteCoc/verdictMap.ts
- Type: source
- LOC: 12
- Public surface:
  - `docStatusFromVerdict(verdict: string | null | undefined): "Pass" | "Fail" | "Pending"` (verdictMap.ts:7)

## Test files

All 17 are Vitest-style unit tests (`describe`/`it`) co-located with the unit they cover. `describe` blocks verified via `grep -n 'describe(' src/lib/siteCoc/*.test.ts`.

| File | Type | LOC | Covers (describe blocks) |
|---|---|---|---|
| assignmentEngine.test.ts | tests | 49 | `planPoolAssignment` |
| clientCocSummary.test.ts | tests | 66 | `cocStatusTone`, `cocStatusLabel`, `buildClientCocSummary` |
| cocReportModel.test.ts | tests | 92 | `verdictKind`, `buildCocReportModel` (+ data tables, KPIs + cover) |
| coverage.test.ts | tests | 35 | `liveMatchCounts`, `assignedSubsectionIds`, `unassignedCocRequired` |
| ingest.test.ts | tests | 110 | `matchSubsection`, `assembleScheduleRows`, `assembleCertificateRows`, `summarize` |
| normalize.test.ts | tests | 52 | `normShop`, `normCert`, `normCertType`, `parseFilesCount`, `parseIssuedDate` |
| parseWorkbooks.test.ts | tests | 61 | `parseDbSchedule`, `parseCertificateDetail`, `parseVerification`, `mergeCertificates` |
| poolAssign.test.ts | tests | 31 | `planPoolAutoAssign` |
| rankCandidates.test.ts | tests | 31 | `rankSubsectionCandidates` |
| reimport.test.ts | tests | 39 | `applyPriorMatches` |
| reportKpis.test.ts | tests | 57 | `inspectionPassRate`, `buildSiteKpiBlock` |
| routeUpload.test.ts | tests | 38 | `classifyCocFile`, `planRouting` |
| sansRules.test.ts | tests | 21 | `COC_SANS_RULES`, `ruleCodeFromHeader` |
| statusDisplay.test.ts | tests | 32 | `scheduleStatusTone`, `verdictTone`, `ruleTone` |
| uploadQueue.test.ts | tests | 35 | `mapWithConcurrency`, `summarizeUpload` |
| verdictMap.test.ts | tests | 21 | `docStatusFromVerdict` |

Verified split (commands and real output):

```
$ git ls-files 'src/lib/siteCoc/*.test.ts' | wc -l
      16
$ git ls-files 'src/lib/siteCoc/*' | grep -cv '\.test\.ts'
18
```

**18 source files, 16 test files, 34 total.** Every source file has a co-located `.test.ts` sibling except `types.ts` (pure type declarations) and `siteCocReport.ts` (pdfmake layout; its input model is covered by cocReportModel.test.ts).

## Runtime observations

- No entry points, request handlers, background jobs, schedulers, or queues are defined in this slice. Every file is a pure module: no network, filesystem, database, or Supabase calls anywhere in `src/lib/siteCoc/` (verified: the only non-relative imports in the slice are `@/lib/cocHierarchy` at clientCocSummary.ts:1, `@/lib/cocFilename` at routeUpload.ts:1, `pdfmake/interfaces` type-only at siteCocReport.ts:1, and shared lib helpers at reportKpis.ts:3-6).
- `mapWithConcurrency` (uploadQueue.ts:8) is the only async function in the slice — a generic bounded-concurrency runner used by upload flows; it performs no I/O itself.
- External library surface: `siteCocReport.ts:1` imports `TDocumentDefinitions`/`Content` types from `pdfmake/interfaces` (type-only; the pdfmake runtime is invoked by consumers, not here).
- Consumers outside the slice (via `grep -rln 'siteCoc/' src` excluding the slice): `src/views/site-coc/*` (SiteCocTab.tsx, useSiteCoc.ts, useSiteCocImport.ts, useSiteCocPool.ts, AssignSubTab.tsx, CertificatesSubTab.tsx, ReportSubTab.tsx, ScheduleSubTab.tsx, VerificationSubTab.tsx, StatusPill.tsx), `src/views/SiteDetail.tsx`, `src/components/client-portal/ClientCocView.tsx`, `src/lib/coc/assignPoolFile.ts`, `src/lib/coc/poolUpload.ts`, `src/lib/coc/reassignPool.ts`, `src/lib/assetVerificationReport.ts`, `src/lib/assetVerificationReportModel.ts`, `src/lib/pdfBars.ts`.

## Oddities

- `CertRowLite` is defined twice with an identical shape: assignmentEngine.ts:4 and routeUpload.ts:13 (`{ id: string; cert_no_norm: string; subsection_id: string | null }`). poolAssign.ts:3 re-exports the assignmentEngine one.
- `SubsectionLite` in types.ts:36 and `RankInput` in rankCandidates.ts:3 have the same field shape (`id`, `name`, `tenant_name?`) under different names.
- Two overlapping verdict-mapping functions exist: `verdictKind` (cocReportModel.ts:51, five-state) and `docStatusFromVerdict` (verdictMap.ts:7, three-state); the latter's doc comment (verdictMap.ts:1-6) says it deliberately matches `verdictTone()` prefixes.
- siteCocReport.ts contains layout workaround comments documenting pdf.js/pdfmake rendering constraints (bars as tables not canvases, siteCocReport.ts:90-92 and 110-111; no fixed card heights, 205-207) — behaviour-explaining comments, recorded here as context.
- `siteCocReport.ts:35` uses an `as any` cast for a colSpan placeholder row; `stripeLayout` (siteCocReport.ts:126) types a pdfmake node parameter as `any`.

## ASSUMED

- Test framework is Vitest: inferred from `describe`/`it`/`expect` style and this being a Next.js app; I did not open the vitest/jest config to confirm which runner executes these files.
- The "17 impl + 17 tests" phrasing in the task brief is assumed to be approximate; verified actual split is 18 source + 16 tests (commands recorded above).
- That consumers listed under Runtime observations use this library at app runtime (browser/client side) is inferred from their location (`src/views`, `src/components`) — I did not trace each import to confirm client vs server execution context.
- `pdfmake` runtime invocation happening in consumers (not in this slice) is inferred from the type-only import at siteCocReport.ts:1; I did not open the consumer files to confirm where `pdfMake.createPdf` is called.
