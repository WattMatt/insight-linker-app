# L18 — shared-utils

- Unit id: L18
- Slug: shared-utils
- Spec mode: full
- Date: 2026-07-29
- Files: 12 (9 source + 3 tests)

## Unit header

**Unit purpose.** Standalone helper modules under `src/lib` with no PDF-engine or scoring dependency: pure pagination math, client-side password strength + breach checking, floor-plan pin clustering, schematic block↔subsection matching, browser storage-quota helpers, a static subsection-category registry, the EMB-tenants template predicate, the shadcn `cn()` class merger, and the app's zod validation schemas. Three of the nine source modules are test-paired (pagination, schematicMatching, templateTenants).

**Module-level observations (cross-file facts inside the unit).**
- No intra-unit imports: none of the nine source modules imports another L18 module. Each module's externals are: pagination — none; password-strength — lazy `@zxcvbn-ts/*` (password-strength.ts:28-32); pinClustering — none; schematicMatching — none; storageQuota — `sonner` (storageQuota.ts:1) + dynamic `@/lib/offlineDB` (storageQuota.ts:120, L11); subsectionCategories — `lucide-react` (subsectionCategories.ts:1-9); templateTenants — none; utils — `clsx`/`tailwind-merge` (utils.ts:1-2); validation-schemas — `zod` (validation-schemas.ts:1).
- The only module performing network I/O is password-strength (HIBP range API, password-strength.ts:62). The only module reaching into another manifest unit at runtime is storageQuota (dynamic import of L11's offlineDB, storageQuota.ts:120).
- validation-schemas cross-references password-strength in a comment (validation-schemas.ts:93-96): min-length 8 lives in the schemas, entropy/breach checking in password-strength.ts.
- All three test files are discovered by `vitest.config.ts` (`include: ['src/**/*.test.{ts,tsx}']`, environment `node`; vitest.config.ts:18,22). No test file anywhere in `src` references password-strength, pinClustering, storageQuota, subsectionCategories, utils, or validation-schemas (grep-verified).
- Untracked working-tree duplicates touch this unit: `src/lib/password-strength 2.ts` is byte-identical to `src/lib/password-strength.ts` (`diff -q` exit 0; not in `git ls-files`); untracked view duplicates `src/views/Clients 2.tsx:14` (imports clientSchema), `src/views/Calendar 2.tsx` (imports cn), and `src/views/OfflineSyncTest 2.tsx:328` (local formatBytes re-implementation) sit outside the 936-file manifest.

**External contract.** The rest of the app gets: pagination math for the paginated-list hook (H03) and pagination control (C16); password evaluation for auth views (V05) and MyProfile (V02); pin clustering for the floor-plan viewer (C12); schematic matching for SchematicDiagram (C09); storage preflight checks for offline caching hooks (H02); the category registry for subsection UI (C09, C14, V01, V07); the tenants predicate for template editor/runtime/report surfaces (C07, C14, C15, C17, V01); `cn()` for 64 files across the component/view tree (dominated by C01); and zod schemas for admin entity forms (V01) and auth forms (V05).

---

## src/lib/pagination.ts

- Purpose: Pure pagination math shared by `usePaginatedList` (Supabase `.range`) and the `ListPagination` control, kept free of React/Supabase imports (pagination.ts:1-4).
- Public surface:
  - `interface PageRange { from: number; to: number }` — zero-based inclusive indices for Supabase `.range()` (pagination.ts:6-11).
  - `const ELLIPSIS = -1` — gap sentinel for the page-window (pagination.ts:14).
  - `getPageRange(page: number, pageSize: number): PageRange` (pagination.ts:22).
  - `getPageCount(total: number, pageSize: number): number` — always ≥ 1 (pagination.ts:30).
  - `clampPage(page: number, pageCount: number): number` (pagination.ts:37).
  - `getPageWindow(page: number, pageCount: number, maxButtons = 7): number[]` (pagination.ts:47).
  - Private `toPositiveInt(n, min)` coercion helper (pagination.ts:16-19).
- Inputs & outputs: numbers in, numbers/number-arrays out. No tables, buckets, browser storage, or env vars.
- Dependencies: uses -> none (zero imports). used by <- H03 (src/hooks/usePaginatedList.ts:11 — getPageRange, getPageCount, clampPage, PageRange type), C16 (src/components/ListPagination.tsx:14 — getPageWindow, ELLIPSIS), plus its own test (src/lib/pagination.test.ts:2). Grep-verified.
- Side effects: none; all functions pure.
- Error handling: no throws. Non-finite or below-minimum inputs are floored/coerced to the minimum by `toPositiveInt` (pagination.ts:16-19); `getPageCount` coerces non-finite/negative totals to 0, then returns at least 1 (pagination.ts:32-33); `getPageWindow` clamps `page` into range before building the window (pagination.ts:48-49).
- Tests: src/lib/pagination.test.ts — see that file's section.
- Observed issues: the `getPageWindow` doc comment says "shows `siblings` pages either side of current" (pagination.ts:44) but `siblings` is a hardcoded local `const = 1` (pagination.ts:55), not a parameter.
- ASSUMED: none.

## src/lib/pagination.test.ts

- Purpose: Vitest unit tests for the pagination math module.
- Public surface: none (test module; four `describe` blocks).
- Inputs & outputs: none beyond the test runner.
- Dependencies: uses -> `./pagination` (same unit; pagination.test.ts:2), `vitest` (pagination.test.ts:1). used by <- test runner only (matched by `vitest.config.ts:22` include glob).
- Side effects: none.
- Error handling: n/a.
- Tests: this is the test file. Asserts: zero-based inclusive ranges for page 1 and page 3 at size 20 (pagination.test.ts:5-10); coercion of page 0/-5 to page 1 and pageSize 0 to 1 (yielding `{from:1,to:1}` for page 2) (pagination.test.ts:11-15); ceil behaviour for partial pages and minimum page count 1 for 0/NaN/negative totals (pagination.test.ts:18-31); clamping above/below (pagination.test.ts:33-41); window shapes near start (`[1,2,3,…,10]`), middle (`[1,…,4,5,6,…,10]`), end (`[1,…,9,10]`), full listing when total ≤ maxButtons, and first/last always present (pagination.test.ts:43-61).
- Observed issues: none.
- ASSUMED: none.

## src/lib/password-strength.ts

- Purpose: Client-side password strength scoring (lazy-loaded zxcvbn-ts) plus HIBP Pwned Passwords breach check via k-anonymity; header states it was ported from ESITE.V1 to close EC-2 of the 2026-05-25 user-management gap analysis (password-strength.ts:4-5).
- Public surface:
  - `interface PasswordEvaluation { score: 0|1|2|3|4; warning: string; suggestions: string[]; pwned: boolean|null; pwnCount: number|null }` (password-strength.ts:15-21).
  - `checkPwned(password: string): Promise<number | null>` — breach count, or null on failure (password-strength.ts:57).
  - `evaluatePassword(password: string): Promise<PasswordEvaluation>` (password-strength.ts:77).
  - `strengthLabel(score: number): string` — 5-entry label array, "Unknown" fallback (password-strength.ts:90-92).
  - `strengthColor(score: number): string` — 5-entry hex array, `#6b7280` fallback (password-strength.ts:94-96).
  - Private: `loadZxcvbn()` with module-level `zxcvbnPromise` memo (password-strength.ts:23-42), `sha1Hex()` via Web Crypto (password-strength.ts:44-51).
- Inputs & outputs: password string in; `PasswordEvaluation`/count out. Network: GET `https://api.pwnedpasswords.com/range/<first-5-SHA1-chars>` with `Add-Padding: true` header — only the 5-char hash prefix leaves the browser (password-strength.ts:60-64). No Supabase tables/buckets, no localStorage, no env vars. Module-level state: the memoized zxcvbn promise (password-strength.ts:23).
- Dependencies: uses -> dynamic `@zxcvbn-ts/core`, `@zxcvbn-ts/language-common`, `@zxcvbn-ts/language-en` (password-strength.ts:28-32; declared package.json:51-53); `crypto.subtle.digest("SHA-1", …)` (password-strength.ts:46). used by <- V05 (src/views/auth/PasswordStrengthMeter.tsx:4-9 — evaluatePassword, strengthColor, strengthLabel, PasswordEvaluation type; src/views/auth/ResetPassword.tsx:15; src/views/auth/SetPassword.tsx:15 — evaluatePassword), V02 (src/views/MyProfile.tsx:4 — evaluatePassword). Grep-verified.
- Side effects: one fetch to the HIBP API per `checkPwned` call; dynamic-import chunk loads on first evaluation; sets global `zxcvbnOptions` (translations/graphs/dictionary) once (password-strength.ts:33-37).
- Error handling: `checkPwned` wraps hash+fetch+parse in try/catch and returns `null` on any throw and on non-OK responses (password-strength.ts:65,72-74); a matched suffix with an unparseable count resolves to 1 via `|| 1` (password-strength.ts:69); no match returns 0 (password-strength.ts:71). `evaluatePassword` maps a null count to `pwned: null` (password-strength.ts:85) but has no catch of its own — a rejected `loadZxcvbn()` propagates to the caller.
- Tests: none found (no test file in `src` references this module; grep-verified).
- Observed issues: `zxcvbnPromise` is assigned before the dynamic imports resolve and is never reset (password-strength.ts:26-40), so if the import chain rejects once, every later `loadZxcvbn()` call returns the same rejected promise. An untracked byte-identical duplicate `src/lib/password-strength 2.ts` exists in the working tree.
- ASSUMED: that `Add-Padding: true` produces the HIBP padded-response behaviour the header comment implies (not verified against the API).

## src/lib/pinClustering.ts

- Purpose: Greedy distance-based clustering of floor-plan pins as a function of zoom scale, plus a cluster colour picker based on member status/priority.
- Public surface:
  - `interface PinCluster { id: string; pins: Pin[]; x_position: number; y_position: number; isCluster: true }` (pinClustering.ts:11-17).
  - `type ClusteredPin = Pin | PinCluster` (pinClustering.ts:19).
  - `isCluster(item: ClusteredPin): item is PinCluster` (pinClustering.ts:33-35).
  - `clusterPins(pins: Pin[], scale: number, expandedClusterId: string | null = null): ClusteredPin[]` (pinClustering.ts:44-48).
  - `getClusterColor(pins: Pin[]): string` — hex colour (pinClustering.ts:114-123).
  - NOT exported: `interface Pin { id; pin_number; x_position; y_position; pin_type: 'snag'|'observation'; status: 'open'|'in_progress'|'finished'|'closed'|'resolved'; priority? }` (pinClustering.ts:1-9) and `getDistance()` (pinClustering.ts:24-28).
- Inputs & outputs: pins in percentage coordinates plus a zoom scale in; a mixed pin/cluster array out. No stores of any kind.
- Dependencies: uses -> none (zero imports). used by <- C12 (src/components/FloorPlanViewer.tsx:8 — clusterPins, isCluster, getClusterColor, ClusteredPin type). Grep-verified; no other consumers.
- Side effects: none; pure.
- Error handling: none — no validation, no throws. `scale > 1.5` short-circuits and returns the input array unchanged (pinClustering.ts:50-52).
- Behaviour as written: distance threshold is `3 + ((1.5 - scale) / 1.0) * 5` percent (pinClustering.ts:58-60); clustering is a single greedy pass — each unprocessed pin seeds a group and absorbs every later pin within threshold of the seed (distance is measured seed→candidate, not member→candidate) (pinClustering.ts:65-80); cluster id is `cluster-` plus the joined member pin ids (pinClustering.ts:84); if that id equals `expandedClusterId` the members are pushed individually instead of as a cluster (pinClustering.ts:87-88); cluster position is the member centroid (pinClustering.ts:91-98). `getClusterColor` precedence: `#dc2626` if any member is priority `critical` with status not resolved/closed; else `#9ca3af` if all members are resolved/closed/finished; else `#f59e0b` if any member is open/in_progress and not critical; else `#3b82f6` (pinClustering.ts:115-122).
- Tests: none found (grep-verified).
- Observed issues: the `pin_type` field is declared on `Pin` (pinClustering.ts:6) but never read by any function in this file. The cluster id is derived from the member set (pinClustering.ts:84), so the id a caller must supply as `expandedClusterId` only matches while the membership produced at the current scale is identical.
- ASSUMED: pin coordinates are 0–100 percentages (stated in the `getDistance` doc comment, pinClustering.ts:22; not verified against C12's data).

## src/lib/schematicMatching.ts

- Purpose: Pure helpers extracted from the SchematicDiagram component for storage-path parsing, unique DB-NNN identifier generation, and block→subsection matching (schematicMatching.ts:1-6).
- Public surface:
  - `interface BlockLike { id: string; block_identifier: string; subsection_id: string | null }` (schematicMatching.ts:8-12).
  - `interface SubsectionLike { id: string; name: string }` (schematicMatching.ts:14-17).
  - `normalizeToken(value: string | null | undefined): string` — uppercase, strip non-alphanumerics (schematicMatching.ts:20-22).
  - `parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null` — matches `/storage/v1/object/(public|sign)/<bucket>/<path>` (schematicMatching.ts:30-42).
  - `nextBlockIdentifier(blocks: Array<Pick<BlockLike, "block_identifier">>): string` — max existing DB-number + 1, zero-padded `DB-NNN` (schematicMatching.ts:50-59).
  - `matchSubsectionId(identifier: string, subsections: SubsectionLike[], excludeIds: Set<string> = new Set()): string | null` — exact match on normalized tokens (schematicMatching.ts:69-80).
  - `computeAutoMatches(blocks: BlockLike[], subsections: SubsectionLike[]): Array<{ blockId: string; subsectionId: string }>` — one subsection never assigned twice (schematicMatching.ts:87-104).
- Inputs & outputs: strings/arrays in, matches/identifiers out. No tables, buckets, browser storage, or env vars (parseStorageUrl only parses URL strings; it performs no I/O).
- Dependencies: uses -> none (zero imports). used by <- C09 (src/components/site/SchematicDiagram.tsx:63) and its own test (src/lib/schematicMatching.test.ts:10). Grep-verified.
- Side effects: none; pure.
- Error handling: `parseStorageUrl` returns null for falsy input, non-matching paths, and wraps `new URL()` in try/catch → null (schematicMatching.ts:34,37-41); `normalizeToken` coalesces null/undefined to `""` (schematicMatching.ts:21); `matchSubsectionId` returns null for an empty normalized identifier (schematicMatching.ts:74-75); no throws.
- Tests: src/lib/schematicMatching.test.ts — see that file's section.
- Observed issues: the file itself documents that `parseStorageUrl` "Mirrors parseSupabaseUrl in simpleImageLoader.ts" (schematicMatching.ts:28) — a private `parseSupabaseUrl(url): { bucket, path } | null` does exist at src/lib/simpleImageLoader.ts:14 (L14), i.e. the same parsing logic lives in two units. `decodeURIComponent` is applied to the path capture but not the bucket capture (schematicMatching.ts:38).
- ASSUMED: none.

## src/lib/schematicMatching.test.ts

- Purpose: Vitest unit tests for the schematic matching helpers.
- Public surface: none (test module; five `describe` blocks plus shared `subs` fixture at schematicMatching.test.ts:72-76).
- Inputs & outputs: none beyond the test runner.
- Dependencies: uses -> `./schematicMatching` (same unit; schematicMatching.test.ts:2-10), `vitest` (schematicMatching.test.ts:1). used by <- test runner only (vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a.
- Tests: this is the test file. Asserts: normalization uppercases/strips and handles null/undefined (schematicMatching.test.ts:12-19); public, signed(+query), and percent-encoded storage URLs parse to `{bucket, path}` while non-storage/invalid/empty/null inputs return null (schematicMatching.test.ts:21-49); identifier generation starts at DB-001, uses max+1 rather than count after deletions (DB-001+DB-003 → DB-004), ignores non-DB identifiers, and handles `DB050`/`DB-7` formats (schematicMatching.test.ts:51-70); matching is exact-normalized (case-insensitive), rejects short-substring near-matches ("DB-01" vs "DB-010"), and respects the exclude set (schematicMatching.test.ts:78-92); auto-matching links unlinked blocks, never reuses a subsection (duplicate identifiers get nothing), and skips already-linked blocks and already-consumed subsections (schematicMatching.test.ts:94-116).
- Observed issues: none.
- ASSUMED: none.

## src/lib/storageQuota.ts

- Purpose: Browser storage-quota inspection and preflight space checks (with sonner toasts) for the offline caching layer, plus byte formatting and a data-clearing entry point.
- Public surface:
  - `interface StorageQuotaInfo { usage: number; quota: number; available: number; percentUsed: number }` (storageQuota.ts:3-8).
  - `getStorageQuota(): Promise<StorageQuotaInfo | null>` (storageQuota.ts:13).
  - `checkStorageAvailable(requiredBytes: number): Promise<boolean>` (storageQuota.ts:41-43).
  - `formatBytes(bytes: number): string` (storageQuota.ts:80).
  - `estimateIndexedDBUsage(): Promise<number>` (storageQuota.ts:93).
  - `clearOldOfflineData(daysOld: number = 30): Promise<void>` (storageQuota.ts:118).
- Inputs & outputs: reads `navigator.storage.estimate()` (storageQuota.ts:20) and `window.indexedDB.databases()` (storageQuota.ts:97); dynamically imports `@/lib/offlineDB` and calls `offlineDB.init()` (storageQuota.ts:120-121). Emits toasts. No Supabase tables/buckets, no localStorage keys, no env vars.
- Dependencies: uses -> `toast` from `sonner` (storageQuota.ts:1); dynamic `@/lib/offlineDB` → L11 (storageQuota.ts:120). used by <- H02 (src/hooks/useOfflineSubsections.ts:14 and src/hooks/useOfflineInspections.ts:7 — `checkStorageAvailable` only). `getStorageQuota`, `formatBytes`, `estimateIndexedDBUsage`, `clearOldOfflineData`: no external consumers found (grep-verified; the `formatBytes` occurrences in src/components/settings/ImageCompressionManager.tsx:79 (C05) and untracked `src/views/OfflineSyncTest 2.tsx:328` are locally defined functions, not imports of this module).
- Side effects: `toast.error` when space is insufficient (storageQuota.ts:59-62); `toast.warning` when usage > 80% (storageQuota.ts:67-72); `toast.success`/`toast.error` in `clearOldOfflineData` (storageQuota.ts:130,133); `console.warn/error/log` (storageQuota.ts:15,33,109,128,132); IndexedDB open via `offlineDB.init()` (storageQuota.ts:121).
- Error handling: `getStorageQuota` returns null when the Storage API is missing (console.warn, storageQuota.ts:14-17) or on a caught throw (console.error, storageQuota.ts:32-35). `checkStorageAvailable` returns `true` when the quota is unreadable ("If we can't check, assume it's available", storageQuota.ts:46-49); otherwise compares against required+10MB buffer, toasting and returning false on shortfall (storageQuota.ts:52-64). `estimateIndexedDBUsage` catches everything → 0 (storageQuota.ts:109-112). `clearOldOfflineData` catches everything → console.error + `toast.error` (storageQuota.ts:131-134). Nothing throws to callers.
- Tests: none found (grep-verified).
- Observed issues: `clearOldOfflineData` deletes nothing — it computes the cutoff timestamp, logs it, and shows `toast.success('Old offline data cleared successfully')`; its own comment reads "This would need to be implemented in offlineDB" (storageQuota.ts:123-130). `estimateIndexedDBUsage` adds a flat 1024 bytes per database name while its comment says "~1KB per database entry" (storageQuota.ts:100-105). `formatBytes` indexes a 4-entry sizes array (`Bytes/KB/MB/GB`) with an uncapped exponent (storageQuota.ts:84-87).
- ASSUMED: none.

## src/lib/subsectionCategories.ts

- Purpose: Static registry of the six subsection categories (icon, tailwind colour classes, abbreviation) with lookup helpers.
- Public surface:
  - `interface SubsectionCategory { value: string; label: string; icon: LucideIcon; color: { bg; text; border }; abbreviation: string }` (subsectionCategories.ts:11-21).
  - `const SUBSECTION_CATEGORIES: SubsectionCategory[]` — six entries: Line Shop/LS, Electrical Equipment/EE, Solar/SOL, Metering/MTR, Lightning Protection/LP, Common Area/CA (subsectionCategories.ts:23-90).
  - `getCategoryConfig(category: string): SubsectionCategory` (subsectionCategories.ts:92-103).
  - `getCategoryIcon(category: string): LucideIcon` (subsectionCategories.ts:105-107).
  - `getCategoryColor(category: string)` — returns the `color` object (subsectionCategories.ts:109-111).
  - `getCategoryAbbreviation(category: string): string` (subsectionCategories.ts:113-115).
- Inputs & outputs: category string in (full value or abbreviation), config/icon/colour/abbreviation out. No stores, no env vars.
- Dependencies: uses -> `lucide-react` icons Store, Zap, Sun, Gauge, CloudLightning, Users + `LucideIcon` type (subsectionCategories.ts:1-9). used by <- C14 (src/components/SiteSummaryReport.tsx:6 — getCategoryAbbreviation), C09 (src/components/site/SubsectionList.tsx:9 — getCategoryIcon, getCategoryColor), V01 (src/views/ClientDetail.tsx:9 and src/views/SubsectionDetail.tsx:5 — getCategoryIcon, getCategoryColor), V07 (src/views/subsection-detail/SubsectionDialogs.tsx:6 — SUBSECTION_CATEGORIES; src/views/subsection-detail/CreateSubsectionForm.tsx:7 — SUBSECTION_CATEGORIES, getCategoryIcon). Grep-verified. No consumer imports `getCategoryConfig` directly.
- Side effects: none; static data + pure lookups.
- Error handling: lookup order is exact `value` match → `abbreviation` match → fall back to the first array entry (subsectionCategories.ts:94-102); never throws.
- Tests: none found (grep-verified).
- Observed issues: any unknown or empty category string silently resolves to the Line Shop config (subsectionCategories.ts:101-102).
- ASSUMED: that the six `value` strings correspond to the category values stored on subsection rows (not verified against the database or consumers' data in this pass).

## src/lib/templateTenants.ts

- Purpose: Single predicate deciding whether an inspection template has a Tenants tab/section — declared the single source of truth shared by template editor, inspection runtime, and report renderers (templateTenants.ts:1-12).
- Public surface: `templateSupportsTenants(template: { name?: string | null } | null | undefined): boolean` (templateTenants.ts:13-17).
- Inputs & outputs: a template object (only `name` read) in; boolean out — true iff the lowercased name contains the substring `"main board"` (templateTenants.ts:16). No stores, no env vars.
- Dependencies: uses -> none (zero imports). used by <- C14 (src/components/ComprehensiveInspectionReport.tsx:13), C15 (src/components/TemplateBuilder.tsx:13), C07 (src/components/site/BulkInspectionReportGenerator.tsx:25), C17 (src/components/templates/TemplatePreviewRenderer.tsx:3), V01 (src/views/InspectionDetail.tsx:3), plus its own test (src/lib/templateTenants.test.ts:2). Grep-verified.
- Side effects: none; pure.
- Error handling: null/undefined template or name coalesces to `""` → false (templateTenants.ts:16); never throws.
- Tests: src/lib/templateTenants.test.ts — see that file's section.
- Observed issues: the decision is a name-substring check, not a template id/flag check; the header comment records that this replaced per-surface contradictory string-matching rules that "leaked the Tenants tab onto non-EMB inspections" (templateTenants.ts:8-11).
- ASSUMED: none.

## src/lib/templateTenants.test.ts

- Purpose: Vitest unit tests pinning the EMB-only behaviour of `templateSupportsTenants`.
- Public surface: none (test module; one `describe` block).
- Inputs & outputs: none beyond the test runner.
- Dependencies: uses -> `./templateTenants` (same unit; templateTenants.test.ts:2), `vitest` (templateTenants.test.ts:1). used by <- test runner only (vitest.config.ts:22).
- Side effects: none.
- Error handling: n/a.
- Tests: this is the test file. Asserts: true for "Electrical Main Board (EMB) Inspection" (templateTenants.test.ts:7-9); false for an enumerated list of 13 template names described as "every non-EMB template currently in prod" — meter, site summary, generator FAT/installation, FAT, line shop handover, LV line shop board audit, mini-sub (x2), RMU, progress, site drawing, solar PV (templateTenants.test.ts:11-30); case-insensitive matching ("electrical MAIN BOARD inspection" → true, templateTenants.test.ts:32-34); false for null/undefined/empty names and null/undefined template objects (templateTenants.test.ts:36-42).
- Observed issues: the "currently in prod" template list is a hardcoded fixture in the test (templateTenants.test.ts:12-26); nothing in the test reads actual template data.
- ASSUMED: none.

## src/lib/utils.ts

- Purpose: Standard shadcn helper exposing `cn()`, which merges class values through clsx then tailwind-merge.
- Public surface: `cn(...inputs: ClassValue[]): string` (utils.ts:4-6; return type inferred from `twMerge`).
- Inputs & outputs: class values in, merged class string out. No stores, no env vars.
- Dependencies: uses -> `clsx` + `ClassValue` type (utils.ts:1; package.json:55), `tailwind-merge` (utils.ts:2; package.json:82). used by <- 64 files import `@/lib/utils` (grep-verified count): 44 in C01 (src/components/ui/*), C04 (SectionEditor.tsx, SectionToggle.tsx), C05 (PDFTemplatePreview.tsx, SANSReferenceTab.tsx), C11 (Breadcrumb.tsx, GlobalSearch.tsx), C12 (FloorPlanPinsList.tsx), C13 (OfflineIndicator.tsx), C14 (SiteHealthBadge.tsx), C15 (PDFTemplateUploader.tsx, PDFTemplateExportDialog.tsx), C16 (ListPagination.tsx, LoadingState.tsx), V01 (Calendar.tsx), V02 (PDFTemplateTestDashboard.tsx), V06 (ScheduleSubTab.tsx, CertificatesSubTab.tsx, StatusPill.tsx, VerificationSubTab.tsx), plus 1 untracked non-manifest file (`src/views/Calendar 2.tsx`).
- Side effects: none; pure.
- Error handling: none of its own; no throws in this file.
- Tests: none found (grep-verified).
- Observed issues: none.
- ASSUMED: none.

## src/lib/validation-schemas.ts

- Purpose: Central zod schema definitions for entity forms (client/site/inspection/profile/invite/document/subsection) and the auth flows.
- Public surface (all zod schemas unless noted):
  - `clientSchema` — name required ≤255; optional email/phone (regex `^\+?[0-9\s-()]{7,20}$`)/contact_person/company_name/primary_contact_email, empty-string literals allowed on email/phone fields (validation-schemas.ts:4-11).
  - `siteSchema` — name required; `client_id` required uuid; optional address/site_type/consultant fields/supply_authority/nominated_max_demand (validation-schemas.ts:14-24).
  - `inspectionSchema` — title required; `site_id` required uuid; optional date/status enum `['Pending','In Progress','Completed','Cancelled']`/priority enum/project/location/party/inspector/rep/consultant/contractor/shop fields (validation-schemas.ts:27-46).
  - `profileUpdateSchema` (validation-schemas.ts:49-60), `userInviteSchema` — role enum `['Admin','Client','Contractor']`, optional clientId uuid, optional temporaryPassword 8–72 (validation-schemas.ts:63-71), `documentUploadSchema` (validation-schemas.ts:74-78), `subsectionSchema` (validation-schemas.ts:81-90).
  - Auth: `signInSchema` + `type SignInInput` (validation-schemas.ts:98-102); `signUpSchema` (password 8–72) + `type SignUpInput` (validation-schemas.ts:104-109); `forgotPasswordSchema` + `type ForgotPasswordInput` (validation-schemas.ts:111-114); `setPasswordSchema` with `.refine` password===confirmPassword erroring on `confirmPassword` + `type SetPasswordInput` (validation-schemas.ts:116-125).
- Inputs & outputs: pure schema declarations; parsing happens at call sites. No stores, no env vars.
- Dependencies: uses -> `zod` (validation-schemas.ts:1; package.json:86). used by <- V01 (src/views/Clients.tsx:16 — clientSchema; src/views/Sites.tsx:14 — siteSchema; src/views/Inspections.tsx:15 — inspectionSchema), V05 (src/views/auth/Login.tsx:21 — signInSchema, forgotPasswordSchema + both input types; src/views/auth/ForgotPassword.tsx:19 — forgotPasswordSchema + type; src/views/auth/ResetPassword.tsx:16 and src/views/auth/SetPassword.tsx:16 — setPasswordSchema + SetPasswordInput). Untracked non-manifest `src/views/Clients 2.tsx:14` also imports clientSchema. Grep-verified.
- Side effects: none at module level.
- Error handling: none of its own — invalid data produces zod issues at whichever call site parses; the module never throws on import.
- Tests: none found (grep-verified).
- Observed issues: five exported schemas have zero consumers outside this file (grep-verified, 0 hits each): `profileUpdateSchema`, `userInviteSchema`, `documentUploadSchema`, `subsectionSchema`, `signUpSchema`; the `SignUpInput` type is likewise unreferenced. The `inspectionSchema` status comment states the enum is "retained for any legacy callers" after removal of status-driven compliance (validation-schemas.ts:32-35). The auth header comment lists `/signup` among the schema consumers (validation-schemas.ts:93) while `signUpSchema` has no importers.
- ASSUMED: that the field lists mirror the corresponding table columns (not checked against generated Supabase types in this pass).
