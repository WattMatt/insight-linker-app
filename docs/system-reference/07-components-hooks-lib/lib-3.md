# 07 · Components/Hooks/Lib — lib (part 3 of 3)

**Scope:** Final third of `src/lib/*.ts` (alphabetical, files 29–42). Per-symbol ground-truth docs for PDF template helpers, PDF test runner, pin clustering, QR generation, image loading, storage-quota utilities, subsection card/category specs, the `cn` helper, Zod validation schemas, and the WYSIWYG html2canvas→jsPDF generator.
**Files covered: 14.**

Cross-refs: `siteSummaryRenderSpec.ts` is documented in `uncovered-gapfill.md` (this directory); `subsectionCardSpec.ts`, PDF config/branding helpers and `usePDFTemplateGateway` are documented in the other lib/hooks chapters and in 06-flows. Data model (`subsections`, `settings`, `pdf_report_templates`, storage buckets) is in 02-data-model; RLS/anon-read posture in 03-auth-and-access and GAPS.md.

---

## `pdfTemplateTestRunner.ts`
In-app test harness that validates the PDF template gateway end-to-end (gateway fetch → spec consistency → rendering → metrics → param flow → DB). Pure read-only diagnostics.
**Caller:** `src/views/PDFTemplateTestDashboard.tsx` only.

| Symbol | Kind | Signature / shape | Notes |
|---|---|---|---|
| `TestResult` | interface | `{ id; name; status:'pass'\|'fail'\|'warning'\|'skipped'; message; details?; duration? }` | one test outcome |
| `TestSuiteResult` | interface | `{ suiteName; startedAt; completedAt; totalTests; passed; failed; warnings; skipped; tests:TestResult[] }` | aggregate |
| `ParameterFlowTest` | interface | `{ parameter; templateValue; previewValue; pdfValue; matches }` | ⚠️ declared but never used internally |
| `SAMPLE_SUBSECTION_DATA` | const | `SubsectionData[]` (4 fixtures: 2×EE, 2×LS) | test fixture, hard-coded |
| `PDFTemplateTestRunner` | class | `runAllTests(reportType='site_summary') → Promise<TestSuiteResult>` | private `runTest` wrapper times each test + catches exceptions; private suite methods run the 6 groups below |
| `runPDFTemplateTests` | fn | `(reportType?='site_summary') → Promise<TestSuiteResult>` | convenience: `new PDFTemplateTestRunner().runAllTests()` |

**6 suite groups** (all private): `runTemplateGatewayTests` (calls `fetchPDFTemplate`, checks customization/sections/accentColors keys), `runSpecConsistencyTests` (validates `SECTION_SPECS`, `HEALTH_METRICS_CARDS`, COC/INSPECTION columns, `SUBSECTION_CARD_FIELDS`), `runSectionRenderingTests` (legacy-id matching, title override, enabled+sort), `runMetricsCalculationTests` (`calculateMetrics`, `calculateCategoryHealth`, KPI getters), `runParameterFlowTests` (accent color → hex, enabled states, page breaks, custom titles), `runDatabaseIntegrationTests` (queries `pdf_report_templates`).
**Data calls:** `supabase.from('pdf_report_templates').select(...)` (read-only) + `fetchPDFTemplate` (gateway). **Notes:** writes to `console.log`; depends entirely on `siteSummaryRenderSpec` exports.

---

## `pdfTemplates.ts`
Reusable pdfmake content builders (cover/header/footer/KPI/table/badge/etc.). All return loosely-typed `Content` (`type Content = any` locally — pdfmake types stubbed). Pulls `COLORS/DEFAULT_STYLES/mmToPt/...` from `pdfMakeConfig`, `BRANDING/createImageContent/formatPdfDate` from `pdfBranding`, `DOCUMENT_DESIGN_STANDARDS`.

| Export | Signature | Purpose / behavior | Callers |
|---|---|---|---|
| `CoverPageData` | interface | cover-page input (`title, subtitle?, siteName, clientName?, reportType, reportDate?, referenceNumber?, preparedBy?, address?`) | — |
| `createCoverPage` | `(data:CoverPageData, logoDataUrl?:string\|null) → Content[]` | logo/org name, report-type badge, title, divider, site/client/address, metadata table, trailing `pageBreak:'after'` | 5 generators incl. complianceReportGenerator, floorPlanReportGenerator, pdfmakeInspectionReport, pdfEngine |
| `createPageHeader` | `(title, logoDataUrl?, orgName?) → DynamicContent` | returns `(currentPage,pageCount)`; skips page 1 (cover); title left + logo/org right | 4 |
| `createPageFooter` | `(customLeftText?) → DynamicContent` | skips page 1; confidentiality text / `Page X of Y` / date | 4 |
| `KpiItem` | interface | `{ value; label; color?; icon? }` | — |
| `createKpiDashboard` | `(kpis:KpiItem[]) → Content` | equal-width KPI card row, `getKpiTableLayout()` | 2 |
| `createProgressBar` | `(percentage, options?{width,height,color,showLabel}) → Content` | canvas rect bg + filled rect, clamps 0–100, optional `%` label | 2 |
| `createSectionHeader` | `(title, style='primary'\|'secondary'\|'muted') → Content` | filled-table header (primary/secondary) or plain bold text (muted) | 6 |
| `TableColumn` | interface | `{ header; dataKey; width?; align?; format?(value,row) }` | — |
| `createDataTable` | `<T>(columns, data:T[], options?{headerRows,dontBreakRows,zebraStripe,title}) → Content[]` | header row + body rows, per-col `format`, zebra striping (default on), `getStandardTableLayout()` | 6 |
| `StatusType` | type | `'success'\|'warning'\|'error'\|'info'\|'neutral'` | — |
| `createStatusBadge` | `(text, status:StatusType) → Content` | uppercased colored text (no real badge box) | 4 |
| `getStatusType` | `(status:string) → StatusType` | maps status strings (pass/fail/pending/...) to a `StatusType` via lowercase lists | 3 |
| `PDFComplianceCheck` | interface | 9 boolean design-compliance flags | — |
| `createComplianceResult` | `(checks:Partial<PDFComplianceCheck>) → PDFComplianceCheck` | fills defaults (`?? false`) | 1 (assetVerificationReportGenerator) |
| `calculateComplianceScore` | `(checks:PDFComplianceCheck) → number` | `round(passed/total*100)` | **⚠️ 0 callers — dead export** |
| `createParagraph` | `(text, style?) → Content` | body paragraph w/ design-standard spacing | 2 |
| `createBulletList` | `(items:string[]) → Content` | `ul` of body items | 1 |
| `createSpacer` | `(heightMm=10) → Content` | vertical gap | 3 |
| `createDivider` | `() → Content` | centered em-dash rule | 1 |
| `truncateText` | `(text, maxLength=50) → string` | ellipsis-truncate | **⚠️ 0 callers — dead export** |

**Notes:** Header/footer borders are stubbed as empty-text `border:` cells (canvas rules intentionally avoided per inline comments — may render no visible line). `createImageContent` imported but unused here.

---

## `pinClustering.ts`
Distance-based clustering of floor-plan pins by zoom scale. Pure (no I/O).
**Caller:** `src/components/FloorPlanViewer.tsx` only.

| Export | Signature | Purpose / behavior |
|---|---|---|
| `Pin` (local, not exported) | interface | `{ id; pin_number; x_position; y_position; pin_type:'snag'\|'observation'; status; priority? }` |
| `PinCluster` | interface | `{ id; pins:Pin[]; x_position; y_position; isCluster:true }` |
| `ClusteredPin` | type | `Pin \| PinCluster` |
| `isCluster` | `(item:ClusteredPin) → item is PinCluster` | type guard on `isCluster===true`; used at FloorPlanViewer.tsx:402 |
| `clusterPins` | `(pins:Pin[], scale:number, expandedClusterId:string\|null=null) → ClusteredPin[]` | scale>1.5 → no clustering; threshold = `3 + ((1.5-scale)/1)*5` (%); greedy O(n²) grouping; expanded cluster returns its pins individually; cluster center = mean x/y; clusterId = `cluster-<joined ids>` |
| `getClusterColor` | `(pins:Pin[]) → string` | precedence: critical-unresolved → `#dc2626`, all resolved → `#9ca3af`, any open → `#f59e0b`, else `#3b82f6` |

`getDistance` is a private Euclidean helper. **Note:** statuses `'finished'` count as resolved in `getClusterColor` but the `Pin.status` union doesn't fully overlap the strings checked (`'finished'` only in `allResolved`).

---

## `qrCodeGenerator.ts`
Generates a branded QR PNG (QR + logo overlay + site/subsection text), uploads it to storage, and writes the URL back to the subsection. **Client-side write.**
**Callers:** `views/subsection-detail/useSubsectionDetail.ts`, `components/site/QRAnalytics.tsx`.

| Export | Signature | Purpose |
|---|---|---|
| `generateAndUploadQRCode` | `({subsectionId, siteName, subsectionName, logoUrl?}) → Promise<string\|null>` | full pipeline below; returns public URL or `null` on any error (try/catch) |

**Behavior / data calls:**
1. `supabase.from('settings').select('qr_base_url').single()` → base URL; falls back to `window.location.origin`, else hard-coded `https://insight-linker-app.vercel.app`.
2. Builds target `${baseUrl}/public/subsections/${subsectionId}` (public route — see 04-routes).
3. Renders via `<canvas>`: white bg, border, `QRCode.toCanvas` (errorCorrectionLevel `'H'`), optional center logo (aspect-fit, white pad), site name (uppercase, auto-fit ≥16px) + subsection name.
4. `supabase.storage.from('inspection-photos').upload('qr-codes/<id>.png', blob, {upsert:true})`.
5. `getPublicUrl` → **`supabase.from('subsections').update({qr_code_url}).eq('id', ...)`** (client write).

**⚠️ NOTES:** (a) browser-only — uses `document.createElement('canvas')`/`Image`; will throw under SSR. (b) Verbose `console.log` of settings + URLs. (c) Client write to `subsections.qr_code_url` and storage upload — relevant to the anon/client-write posture tracked in GAPS/SECURITY-FINDINGS (verify RLS on `subsections` UPDATE and `inspection-photos` insert).

---

## `simpleImageLoader.ts`
Loads images as base64 data URLs for PDF embedding, bypassing CORS via Supabase Storage native `download()`.
**Caller:** `src/lib/pdfmakeInspectionReport.ts`.

| Export | Signature | Purpose / behavior |
|---|---|---|
| `loadImageSimple` | `(url:string) → Promise<string\|null>` | passthrough for `data:` URLs; parses Supabase storage URL (private `parseSupabaseUrl`, regex on `/storage/v1/object/(public\|sign)/BUCKET/PATH`) and `storage.from(bucket).download(path)`; fallback to plain `fetch`; blob→dataURL via `FileReader`; returns `null` on total failure |
| `loadImagesSimple` | `(urls:string[]) → Promise<Map<string,string>>` | dedupes (Set), loads all in parallel (`Promise.all`), maps original URL → data URL (skips failures) |

Privates: `parseSupabaseUrl`, `blobToDataUrl`. **Note:** all logging gated behind `NODE_ENV==='development'`.

---

## `storageQuota.ts`
Browser StorageManager quota helpers + toast warnings. Uses `sonner` `toast`.
**Callers:** `views/OfflineSyncTest.tsx`, `components/settings/ImageCompressionManager.tsx`, `hooks/useOfflineSubsections.ts`, `hooks/useOfflineInspections.ts`.

| Export | Signature | Purpose / behavior |
|---|---|---|
| `StorageQuotaInfo` | interface | `{ usage; quota; available; percentUsed }` |
| `getStorageQuota` | `() → Promise<StorageQuotaInfo\|null>` | `navigator.storage.estimate()`; `null` if API unsupported/error |
| `checkStorageAvailable` | `(requiredBytes:number) → Promise<boolean>` | adds 10MB buffer; toast.error if insufficient (returns false); toast.warning at >80% used; returns `true` if quota unknown |
| `formatBytes` | `(bytes:number) → string` | human-readable (Bytes/KB/MB/GB) |
| `estimateIndexedDBUsage` | `() → Promise<number>` | ⚠️ crude: `indexedDB.databases()` × ~1KB each — a placeholder estimate, not real size |
| `clearOldOfflineData` | `(daysOld=30) → Promise<void>` | dynamic-imports `offlineDB`, computes cutoff, **but only `console.log`s + toasts success — actual deletion is a no-op (comment: "would need to be implemented in offlineDB")** |

**⚠️ NOTE:** `clearOldOfflineData` claims success via toast without deleting anything (TODO-shaped). `estimateIndexedDBUsage` is a stub estimate.

---

## `subsectionCardSpec.ts`
Single-source-of-truth layout constants + QR/data helpers shared by React preview and pdfmake. Re-exports `SnagData`/`SubsectionData` from `siteSummaryRenderSpec`.
**Callers:** `PublicSubsection.tsx`, `siteSummaryRenderSpec.ts`, `SiteSummaryReport.tsx`, `pdfSubsectionRenderer.ts`, `pdf-preview/SubsectionCard.tsx`, `SiteSummaryFullPreview.tsx`.

| Export | Kind | Purpose |
|---|---|---|
| `SubsectionCardData` | interface | extends `SubsectionData` + `tenantName?, cocNumber?, cocIssueDate?, cocType?, breakerSize?` |
| `CARD_LAYOUT` | const (`as const`) | card/header/QR/badge/snag/footer dimension constants |
| `STATUS_COLORS` | const | pass/fail/pending/compliant/nonCompliant `{bg,text,border}` |
| `RISK_COLORS` | const | high/medium/low `{bg,text}` |
| `generateSubsectionQRCode` | `(url, logoUrl?) → Promise<string>` | module-level `Map` cache keyed `url-logo`; `QRCode.toDataURL` (2× retina, ecc `'M'`); embeds logo via private `embedLogoInQR`; returns `''` on error |
| `getCocStatusLabel` | `(status?) → string` | normalizes to Valid/Invalid/Pending/Missing, else passthrough |
| `formatMeteringInfo` | `(data:SubsectionCardData) → string` | `S/N: … \| CT: …` or `'No metering data'` |
| `getComplianceLabel` | `(isCompliant?) → string` | Compliant / Non-Compliant / Unknown |
| `getRiskLevelColor` | `(level:SnagData['riskLevel']) → {bg,text}` | from `RISK_COLORS`, defaults low |

Private `embedLogoInQR` draws QR + white circle + center logo on a `<canvas>` (browser-only; resolves to plain QR on logo error). **Note:** module-level QR cache persists for app lifetime.

---

## `subsectionCategories.ts`
Static catalog of the 6 subsection categories with icon/color/abbreviation, plus lookup helpers. Imports lucide icons.
**Callers (10+):** SubsectionDetail, ClientDetail, CreateSubsectionForm, SubsectionDialogs, SiteSummaryReport, SiteReports, SubsectionList, GenerateFinalReportButton, TemplatePreviewRenderer, SiteSummaryFullPreview.

| Export | Kind | Purpose |
|---|---|---|
| `SubsectionCategory` | interface | `{ value; label; icon:LucideIcon; color{bg,text,border}; abbreviation }` |
| `SUBSECTION_CATEGORIES` | const array | 6 entries: Line Shop(LS), Electrical Equipment(EE), Solar(SOL), Metering(MTR), Lightning Protection(LP), Common Area(CA) |
| `getCategoryConfig` | `(category) → SubsectionCategory` | match by `value`, then `abbreviation`, else **defaults to `[0]` (Line Shop)** |
| `getCategoryIcon` | `(category) → LucideIcon` | `.icon` of config |
| `getCategoryColor` | `(category) → {bg,text,border}` | `.color` of config |
| `getCategoryAbbreviation` | `(category) → string` | `.abbreviation` of config |

**Note:** unknown categories silently map to Line Shop — could mislabel data.

---

## `utils.ts`
| Export | Signature | Purpose | Callers |
|---|---|---|---|
| `cn` | `(...inputs:ClassValue[]) → string` | Tailwind class merge (`twMerge(clsx(...))`) — the standard shadcn helper | 69 `.tsx` files import from `@/lib/utils` |

---

## `validation-schemas.ts`
Zod schemas for forms/entities. No runtime side effects.
**Callers (entity):** Clients.tsx, Sites.tsx, Inspections.tsx. **(auth):** Login, ForgotPassword, ResetPassword, SetPassword.

| Export | Kind | Key constraints |
|---|---|---|
| `clientSchema` | schema | name req ≤255; email/phone optional-or-empty; contact/company/primary_contact_email |
| `siteSchema` | schema | name req; **`client_id` required uuid**; consultant/supply-authority fields optional |
| `inspectionSchema` | schema | title req; **`site_id` required uuid**; `status` enum Pending/In Progress/Completed/Cancelled; `priority` enum optional |
| `profileUpdateSchema` | schema | all optional; phone regex; bio ≤1000 |
| `userInviteSchema` | schema | email, fullName req; `role` enum Admin/Client/Contractor; `clientId?` uuid; `temporaryPassword?` 8–72 |
| `documentUploadSchema` | schema | file_name, category req; `file_url` valid url ≤1000 |
| `subsectionSchema` | schema | name req; coc/meter/ct fields optional |
| `signInSchema` + `SignInInput` | schema+type | email + password(min 1) |
| `signUpSchema` + `SignUpInput` | schema+type | fullName, email, password 8–72 |
| `forgotPasswordSchema` + `ForgotPasswordInput` | schema+type | email |
| `setPasswordSchema` + `SetPasswordInput` | schema+type | password 8–72, confirm must match (`.refine`) |

**Note:** header comment states entropy + breach check (EC-2) is layered on at submit time via `password-strength.ts` (separate file). Min-length 8 here is the floor, not the full policy.

---

## `wysiwygPdfGenerator.ts`
Captures rendered HTML pages with `html2canvas` and assembles them into a jsPDF A4 document. Browser-only.
**Caller:** `components/inspection-report/InspectionReportPreview.tsx` (imports `generatePdfFromPages`, `waitForImages`).

| Export | Signature | Purpose / behavior |
|---|---|---|
| `PdfGeneratorResult` | interface | `{ success; blob?; url?; error? }` |
| `GeneratePdfOptions` | interface | `{ filename?; scale?; quality?; onProgress? }` |
| `generatePdfFromPages` | `(pages:HTMLElement[], options={}) → Promise<PdfGeneratorResult>` | scale=2, quality=0.95; per page: `html2canvas` (useCORS+allowTaint, white bg, full scrollH/W) → JPEG → `pdf.addImage` fitting A4 width; `onProgress(i+1,total)`; returns blob + objectURL; try/catch → `{success:false,error}` |
| `waitForImages` | `(container:HTMLElement) → Promise<void>` | awaits all `<img>` load/error before capture (resolves on error to avoid blocking) |
| `downloadPdf` | `(blob, filename) → Promise<void>` | dynamic-imports `@/lib/fileDownload` `downloadBlob` and delegates | **⚠️ no callers found — likely dead export** (consumers use fileDownload directly) |

**⚠️ NOTES:** (a) `finalHeight = min(imgHeight, pageHeight)` clamps tall pages to A4 height, so content taller than one A4 page is **cropped, not paginated** (see inline TODO comment). (b) Verbose `console.log` throughout. (c) `downloadPdf` appears unused.

---

### Chapter notes (cross-file)
- **Dead/unused exports:** `pdfTemplates.calculateComplianceScore`, `pdfTemplates.truncateText`, `wysiwygPdfGenerator.downloadPdf`; `ParameterFlowTest` interface (declared, never used).
- **Stub/TODO behavior:** `storageQuota.clearOldOfflineData` toasts success without deleting; `estimateIndexedDBUsage` returns a fabricated ~1KB/db estimate; `wysiwyg` tall-page cropping.
- **Client-side writes:** `qrCodeGenerator.generateAndUploadQRCode` uploads to `inspection-photos` and updates `subsections.qr_code_url` from the browser — relevant to the anon/RLS posture in GAPS/SECURITY-FINDINGS.
- **Duplicate-ish QR logic:** `qrCodeGenerator.ts` (canvas + storage upload, ecc `'H'`) vs `subsectionCardSpec.generateSubsectionQRCode` (data-URL only, cached, ecc `'M'`) — two separate QR generators with overlapping logo-overlay code.
- **Browser-only modules** that will throw under SSR: `qrCodeGenerator`, `subsectionCardSpec` (embedLogoInQR), `wysiwygPdfGenerator`, `storageQuota`.
