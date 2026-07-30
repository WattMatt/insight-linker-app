# P03 — root-docs-and-import-scripts

- Unit id: P03
- Slug: root-docs-and-import-scripts
- Spec mode: full
- Date: 2026-07-29
- Files: 11 (README.md, AI_MODEL_CONFIGURATION.md, IMPROVEMENTS_IMPLEMENTED.md, MOBILE_OFFLINE_SETUP.md, OFFLINE_IMPLEMENTATION.md, OFFLINE_SUBSECTIONS_GUIDE.md, android-camera-setup.md, android-permissions.md, sql-import-scripts.md, insert-clients.sql, complete-import.sql)

## Unit header

**Unit purpose.** Repo-root prose documentation (project README plus seven feature/setup guides) and three one-off SQL data-import artifacts intended for manual execution in the Supabase SQL Editor. No file in this unit is imported, executed, or bundled by application code; the unit's content is human-facing text and copy-paste SQL.

**Module-level observations.**
- Six of the eight docs describe the pre-migration Vite + React Router application: they cite `src/App.tsx`, `src/pages/`, `src/main.tsx`, `vite.config.ts`, `index.html`, and `src/registerServiceWorker.ts`, none of which exist in the tracked tree (`git ls-files` returns nothing for each; verified 2026-07-29). The repo is Next.js App Router (`package.json:6` `"dev": "NODE_OPTIONS='--require ./server-polyfills.js' next dev"`; `next.config.mjs:163` `export default withPWA(nextConfig)`).
- README.md is the only in-unit hub: it links to AI_MODEL_CONFIGURATION.md (README.md:508), OFFLINE_IMPLEMENTATION.md (:509), MOBILE_OFFLINE_SETUP.md (:510), OFFLINE_SUBSECTIONS_GUIDE.md (:511), IMPROVEMENTS_IMPLEMENTED.md (:512), and android-camera-setup.md / android-permissions.md (:203).
- The three SQL-bearing files (sql-import-scripts.md, insert-clients.sql, complete-import.sql) have zero references anywhere in the tracked tree (grep-verified: `git grep -ln "<name>"` → no hits for each).
- README.md, AI_MODEL_CONFIGURATION.md and OFFLINE_SUBSECTIONS_GUIDE.md describe the COC AI-validation pipeline (`validate-coc`, `extract-coc`, `validation-chat` edge functions, `coc_validations` / `coc_compliance_photos` tables) that docs/system-reference/00-INDEX.md:19 records as removed 2026-06-12; `ls supabase/functions` (17 dirs) contains none of those functions.
- sql-import-scripts.md embeds eight real staff email addresses (one `@watsonmattheus.com`, seven `@wmeng.co.za`) with names and roles (sql-import-scripts.md:8-15).

**External contract.** The rest of the app gets nothing executable from this unit. What other files consume is limited to markdown links: README.md is linked-to by nothing in-repo (grep hits for "README.md" resolve to `src/lib/data/README.md` and `AUDIT_ORPHAN_PHOTOS_README.md`, not this file); AI_MODEL_CONFIGURATION.md is linked from docs/COC_REVIEW_PROCESS.md:676; MOBILE_OFFLINE_SETUP.md, android-camera-setup.md and android-permissions.md are named in docs/system-reference/01-architecture.md:83-84. The two `.sql` files and sql-import-scripts.md offer copy-paste SQL for a human operator against the tables `temp_import`, `clients`, `sites`, `inspections`.

---

## README.md
- Purpose: Top-level project overview for "WM Compliance Inspector" covering features, tech stack, structure, setup, database, edge functions, offline architecture, PDF generation, COC validation, auth/roles, mobile/PWA, routing, docs index, and deployment (README.md:1-539).
- Public surface: None (markdown document; section anchors listed in its own TOC, README.md:9-24).
- Inputs & outputs: Text only. Names env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` (README.md:212-214); names IndexedDB DB `wm_compliance_offline` "v3" with 7 stores plus localStorage key `offline_mutation_queue` (README.md:298-308); names 15 DB tables (README.md:229-243) and 16 edge functions (README.md:268-283).
- Dependencies: uses -> links to docs/COC_VALIDATION_SPEC.md, docs/COC_TEST_FRAMEWORK.md, docs/PDF_GENERATION_ROADMAP.md, docs/PDF_LAYOUT_STANDARDS.md, docs/PDF_TEMPLATE_GATEKEEPER_ARCHITECTURE.md (all tracked; X01 docs-toplevel-specs), AI_MODEL_CONFIGURATION.md, OFFLINE_IMPLEMENTATION.md, MOBILE_OFFLINE_SETUP.md, OFFLINE_SUBSECTIONS_GUIDE.md, IMPROVEMENTS_IMPLEMENTED.md (this unit) (README.md:503-512), android-camera-setup.md / android-permissions.md (README.md:203), and external lovable.dev project URLs (README.md:5, 193, 520, 524); used by <- none found for this root file (grep-verified; `git grep -ln "README.md"` hits are docs/ARCHITECTURE_REVIEW_2026-07-07.md:71,80,229 referring to `src/lib/data/README.md` (L19) and a comment naming `AUDIT_ORPHAN_PHOTOS_README.md`).
- Side effects: None (document). Its "Getting Started" instructs `git clone https://github.com/WattMatt/insight-linker-app.git` (README.md:183), which matches the actual origin remote (`git remote -v`).
- Error handling: N/A (document).
- Tests: None (grep-verified; no test file references README.md).
- Observed issues:
  - Tech stack says "Build | Vite 5 + PWA plugin" and "Routing | React Router 6" (README.md:80-81); the tracked build is Next.js (`package.json:6`, `next.config.mjs:163`), and PWA config lives in next.config.mjs:28-94, not the `vite.config.ts` claimed at README.md:436 (`git ls-files vite.config.ts` → none).
  - Project-structure tree cites `src/pages/` "~51 route pages", `src/App.tsx`, `src/utils/cocValidationEngine.ts`, `src/main.tsx` equivalents (README.md:98-149, 373); none are tracked (`git ls-files` → none for each); route views actually live in `src/views/` (V01–V07) and routes in `src/app/` (A01–A09).
  - Claims "26 edge functions" including `validate-coc`, `extract-coc`, `generate-pdf`, `generate-inspection-pdf`, `generate-docx-report`, `bulk-validate-coc`, `detect-schematic-regions` (README.md:153-164, 268-283); `ls supabase/functions` shows 17 directories and contains none of those seven. The listed `offline-review` is described as "Offline data export/review" (README.md:280); the tracked function is a Lovable AI Gateway code-review function (F05, supabase/functions/offline-review/index.ts, which is the sole `LOVABLE_API_KEY` consumer — grep-verified).
  - Claims "~130 migrations" (README.md:254); `ls supabase/migrations | wc -l` → 184.
  - Key-tables list includes `coc_validations` and `coc_compliance_photos` (README.md:238-239), both among the 9 tables recorded as deleted 2026-06-12 (docs/system-reference/00-INDEX.md:19).
  - Env vars use `VITE_` prefixes (README.md:212-214); the tracked `.env.example` uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PROJECT_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (.env.example:1-10).
  - "App will be available at `http://localhost:8080`" (README.md:189); the dev script is `next dev` with no port flag (package.json:6).
  - Offline section says IndexedDB "v3" with 7 stores (README.md:298-305); src/lib/offlineDB.ts:7 sets `DB_VERSION = 5` and creates 13 object stores (offlineDB.ts:167-260). Supported-mutations list of 5 (README.md:325) vs 17 `case` labels in src/hooks/useOfflineSync.ts:100-362.
  - Routing tables list `/coc-validation`, `/coc-documentation`, `/feedback-management` (README.md:480-483); no matching route exists under src/app (`git ls-files src/app | grep -i "coc\|feedback"` → none).
  - "Live" and deployment sections point to lovable.dev (README.md:5, 517-524); the tracked deploy config is Vercel (`vercel.json`, P01).
- ASSUMED: The README text predates the Vite→Next migration and the 2026-06-12 COC strip-out and was not updated afterward (inferred from the mismatches above; no dated header in the file).

## AI_MODEL_CONFIGURATION.md
- Purpose: Explains that all AI features use `google/gemini-3-pro-preview` via the Lovable AI gateway, covering configuration, model comparison, cost, migration path, monitoring, and troubleshooting for the `validate-coc` and `validation-chat` edge functions (AI_MODEL_CONFIGURATION.md:1-337).
- Public surface: None (markdown document).
- Inputs & outputs: Text only. Names endpoint `https://ai.gateway.lovable.dev/v1/chat/completions` (AI_MODEL_CONFIGURATION.md:76) and secret `LOVABLE_API_KEY` (:81); embeds Supabase dashboard log URLs containing project id `oltzgidkjxwsukvkomof` (:228, :231, :315).
- Dependencies: uses -> refers to `supabase/functions/validate-coc/index.ts:343` (:29) and `supabase/functions/validation-chat/index.ts:111` (:50); neither directory exists (`ls supabase/functions`); used by <- README.md:508 (P03) and docs/COC_REVIEW_PROCESS.md:676 (X01) (grep-verified).
- Side effects: None (document).
- Error handling: N/A; documents the functions' 429/402 handling as code snippets (AI_MODEL_CONFIGURATION.md:87-106).
- Tests: None (grep-verified).
- Observed issues:
  - Both documented functions (`validate-coc`, `validation-chat`) are absent from supabase/functions; docs/system-reference/00-INDEX.md:19 records `validate-coc`/`extract-coc` deleted 2026-06-12 along with `validation_conversations`/`validation_messages` tables. The only tracked consumer of `LOVABLE_API_KEY`/the Lovable gateway is supabase/functions/offline-review/index.ts (F05; grep-verified), a function this doc does not mention.
  - Line 5 states "All AI-powered features in this application now use Google Gemini 3 Pro" — with the two documented functions gone, the statement describes removed code.
  - The doc hardcodes the production Supabase project ref `oltzgidkjxwsukvkomof` in three URLs (:228, :231, :315).
- ASSUMED: The file is a point-in-time record of a model upgrade (Flash → 3 Pro) written before 2026-06-12; its "Expected Performance Improvements" percentages (:145-156) are projections, not measurements (the "Before/After" framing with "~" figures and no methodology suggests estimates).

## IMPROVEMENTS_IMPLEMENTED.md
- Purpose: "Phase 1" improvement log claiming five shipped quick wins (code splitting, file-upload validation, storage-quota management, error boundaries, standardized loading states) plus next-phase recommendations and usage examples (IMPROVEMENTS_IMPLEMENTED.md:1-280).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; documents `FILE_LIMITS` (50MB/10MB) and `ALLOWED_MIME_TYPES` config blocks (:239-254) and a storage-warning threshold of 80% (:259).
- Dependencies: uses -> names src/lib/fileValidation.ts, src/lib/storageQuota.ts (both L18 shared-utils; tracked), src/components/ErrorBoundary.tsx, src/components/LoadingState.tsx (both C16 ui-utility-primitives; tracked), src/hooks/useOfflineSubsections.ts, src/hooks/useOfflineInspections.ts (H02 offline-domain-hooks; tracked), and `src/App.tsx` (:14, :68 — not tracked); used by <- README.md:512 (P03) (grep-verified; sole hit).
- Side effects: None (document).
- Error handling: N/A.
- Tests: None cover this file (grep-verified).
- Observed issues:
  - Both integration points cite `src/App.tsx` ("Converted all route imports to lazy()" :14; "Wraps entire application" :68); no such file is tracked — routing is Next App Router (A01 root-shell).
  - The named library files and their exports do exist as documented: `validateFile`/`validateFiles`/`formatFileSize`/`isImageFile`/`isDocumentFile` (src/lib/fileValidation.ts:57,111,138,151,159; `FILE_LIMITS` :4, `ALLOWED_MIME_TYPES` :11) and `getStorageQuota`/`checkStorageAvailable`/`formatBytes`/`estimateIndexedDBUsage`/`clearOldOfflineData` (src/lib/storageQuota.ts:13,41,80,93,118).
  - Next-phase item "SubsectionDetail.tsx Refactor (3,725 lines → ~500 lines)" (:106) coexists with the shipped decomposition in src/views/subsection-detail/ (V07 per manifest), which the doc predates.
  - Performance metrics (:87-99) are labeled "(estimated)" and given as ranges; no measurement source is stated.
- ASSUMED: The five features were implemented against the Vite entry file and survived the migration in the lib/component files (inferred: the files exist; the App.tsx wiring described cannot be verified in the current tree).

## MOBILE_OFFLINE_SETUP.md
- Purpose: Completion summary of PWA + offline + mobile-responsiveness work (service worker, manifest, mutation queue, install page, responsive Issue Reports page) with testing instructions and next steps (MOBILE_OFFLINE_SETUP.md:1-145).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; names caching policies (NetworkFirst 24h for Supabase API, CacheFirst 7d for images) (:16-19) and an `/install` route (:30-35).
- Dependencies: uses -> names src/hooks/useOfflineSync.ts (H01; tracked), src/components/OfflineIndicator.tsx (C13; tracked), `src/pages/Install.tsx` (not tracked; tracked equivalents are src/views/Install.tsx (V04) and src/app/install/page.tsx (A09)), `src/registerServiceWorker.ts`, `public/manifest.json` (tracked, P04), `public/icon-192.png`/`icon-512.png` (tracked, P04), and modified files `vite.config.ts`, `index.html`, `src/App.tsx`, `src/main.tsx`, `src/pages/IssueReports.tsx` (:76-89); used by <- README.md:451,510 (P03) and docs/system-reference/01-architecture.md:84 (X02) (grep-verified).
- Side effects: None (document).
- Error handling: N/A.
- Tests: None (grep-verified).
- Observed issues:
  - Of the 6 "New Files" listed, `src/pages/Install.tsx` and `src/registerServiceWorker.ts` are not tracked; of the 5 "Modified Files", none exist under those paths (`vite.config.ts`, `index.html`, `src/App.tsx`, `src/main.tsx`, `src/pages/IssueReports.tsx` all absent from `git ls-files`). No `IssueReports` identifier appears anywhere in tracked src (`git grep -ln "IssueReports" -- src` → none); an untracked working-copy file `src/views/IssueReports 2.tsx` exists (git status).
  - Example code calls `queueMutation('save_inspection', { id, data })` (:98); no `save_inspection` case exists — the 17 case labels in src/hooks/useOfflineSync.ts:100-362 are upper-case (e.g. `CREATE_INSPECTION`). The destructured API `{ queueMutation, isOnline }` does match the hook's return (src/hooks/useOfflineSync.ts:560-567).
  - The caching policies it describes (NetworkFirst 24h, CacheFirst 7d) do match the current next.config.mjs runtimeCaching (next.config.mjs:47-67), although the doc attributes them to `vite.config.ts` (:85).
- ASSUMED: Written at PWA-feature completion in the Vite era; "Issue Reports page" responsiveness refers to a page that has since been removed or renamed (no tracked trace).

## OFFLINE_IMPLEMENTATION.md
- Purpose: Describes the offline-first inspection system — IndexedDB storage, sync hook, offline inspections hook, service-worker caching, and the Inspections page enhancements — with flows, limitations, testing, and integration guidance (OFFLINE_IMPLEMENTATION.md:1-277).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; names IndexedDB DB `wm_compliance_offline` with stores `inspections`/`images`/`mutations` (:9-15, :192), localStorage key `offline_mutation_queue` (:243), bucket `inspection-photos` (:93-99).
- Dependencies: uses -> names src/lib/offlineDB.ts (L11; tracked), src/hooks/useOfflineSync.ts (H01; tracked), src/hooks/useOfflineInspections.ts (H02; tracked); used by <- README.md:509 (P03) (grep-verified; sole hit).
- Side effects: None (document). Its debugging snippets instruct the reader to run `indexedDB.deleteDatabase('wm_compliance_offline')` and dispatch a synthetic `online` event from the console (:250-259).
- Error handling: N/A; documents "3 attempts with exponential backoff" retry behavior of the sync queue (:23, :138).
- Tests: None cover this file (grep-verified). (useOfflineSync itself has tests in H01 per manifest; they do not reference this doc.)
- Observed issues:
  - Describes 3 object stores (:11-14); src/lib/offlineDB.ts creates 13 stores at `DB_VERSION = 5` (offlineDB.ts:7, 167-260). The DB name matches (offlineDB.ts:2).
  - Lists 4 mutation types (:19-22); the hook has 17 case labels (src/hooks/useOfflineSync.ts:100-362). The 4 listed all exist (:100, :108, :118, :130).
  - The localStorage key matches, but is defined in src/lib/offlineQueue.ts:3 (`OFFLINE_QUEUE_KEY = 'offline_mutation_queue'`, L11) rather than in the hook.
  - Internal inconsistency: features list includes `UPDATE_INSPECTION` "Updates existing inspections" (:20), while Current Limitations state "Can't edit inspections offline (only create)" (:150).
- ASSUMED: The limitations section reflects an earlier build state than the features section (inferred from the internal contradiction; no dates in file).

## OFFLINE_SUBSECTIONS_GUIDE.md
- Purpose: Step-by-step integration guide (10 numbered steps with code snippets) for adding offline viewing/editing, document upload, and floor-plan upload to the SubsectionDetail page (OFFLINE_SUBSECTIONS_GUIDE.md:1-353).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; names IndexedDB DB `wm_compliance_offline` stores `subsections`/`documents`/`floor_plans` (:288-289), bucket `documents` (:299), blob-URL rendering of offline files (:189, :218).
- Dependencies: uses -> names `useOfflineSubsections` from src/hooks/useOfflineSubsections.ts (H02; tracked — its return `{ updateSubsection, uploadDocument, uploadFloorPlan, getOfflineData, isOnline }` at useOfflineSubsections.ts:222-228 matches the guide's destructure at :28), `getSubsectionDocuments`/`getSubsectionFloorPlans` from src/lib/offlineDBExtensions.ts:91,164 (L11; tracked), `OfflineSubsectionEnhancements`/`OfflineDocumentBadge` from src/components/OfflineSubsectionEnhancements.tsx:14,73 (C13; tracked), `UPLOAD_DOCUMENT` mutation (exists: src/hooks/useOfflineSync.ts:160, H01); used by <- README.md:511 (P03) (grep-verified; sole hit).
- Side effects: None (document); its "manual sync" snippet dispatches `window.dispatchEvent(new Event('online'))` (:174).
- Error handling: N/A; snippets show try/catch with `console.error` + `toast.error` per operation (:63-64, :96-97, :125-127, :154-156) and describe "retries up to 3 times… keeps in queue" for sync failures (:309-313).
- Tests: None (grep-verified).
- Observed issues:
  - `OfflineSubsectionEnhancements` has zero importers in tracked src (`git grep -ln "OfflineSubsectionEnhancements" -- src` → only the component file itself), i.e. the guide's step 7 banner was never wired into any tracked page. `useOfflineSubsections` is consumed (src/views/OfflineReview.tsx, src/views/subsection-detail/useSubsectionDetail.ts; plus a comment mention in src/hooks/useOnlineStatus.ts:6).
  - "What Requires Online" lists "COC validation — Requires AI processing" (:253), describing the AI pipeline removed 2026-06-12 (docs/system-reference/00-INDEX.md:19).
  - The guide targets a monolithic `SubsectionDetail` component with local state (`setSubsection`, `fetchSubsectionData`) (:74-101); the tracked SubsectionDetail is the decomposed src/views/subsection-detail/ module (V07).
- ASSUMED: The guide predates both the SubsectionDetail decomposition and the COC strip-out (inferred from the two mismatches; no date in file).

## android-camera-setup.md
- Purpose: Camera setup guide covering the HTML5 file-input camera flow for web browsers and the AndroidManifest/WebView configuration for a native Capacitor Android build, with build steps, troubleshooting, and a testing checklist (android-camera-setup.md:1-113).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; embeds XML permission blocks (`android.permission.CAMERA`, `READ_MEDIA_IMAGES`, `READ/WRITE_EXTERNAL_STORAGE` with maxSdkVersion) (:24-42) and Java WebView snippets (:47-56); instructs edits to `android/app/src/main/AndroidManifest.xml` (:21).
- Dependencies: uses -> none (self-contained instructions; references `npx cap add android` / `npx cap sync android` CLI steps :58-67); used by <- README.md:203 (P03) and docs/system-reference/01-architecture.md:83 (X02) (grep-verified).
- Side effects: None (document).
- Error handling: N/A; troubleshooting section lists manual remedies (:76-96).
- Tests: None (grep-verified).
- Observed issues: The guide's target directory does not exist — `git ls-files android` and `git ls-files ios` both return 0 files; capacitor.config.ts is tracked (P01) but no native project is. Step "1. Transfer project to GitHub" (:59) reflects a Lovable-hosted origin.
- ASSUMED: The `android/` project is expected to be generated locally by `npx cap add android` and intentionally untracked (inferred from the guide's own step order; .gitignore was not checked for an explicit `android/` entry in this pass).

## android-permissions.md
- Purpose: Shorter three-step checklist for adding camera permissions to AndroidManifest.xml and a FileProvider `file_paths.xml` after running `npx cap add android` (android-permissions.md:1-49).
- Public surface: None (markdown document).
- Inputs & outputs: Text only; XML permission/feature block (:9-19) and FileProvider paths XML (:25-31); instructs `npx cap sync android`, `npm run build`, `npx cap open android` (:37-39).
- Dependencies: uses -> none; used by <- README.md:203 (P03) and docs/system-reference/01-architecture.md:84 (X02) (grep-verified).
- Side effects: None (document).
- Error handling: N/A; final fallback is "make sure you've granted camera permissions in your device's app settings" (:49).
- Tests: None (grep-verified).
- Observed issues: Same as android-camera-setup.md — no `android/` directory is tracked (git ls-files → 0). Content overlaps android-camera-setup.md:24-42 (same permission set, phrased as a second standalone doc; the WRITE_EXTERNAL_STORAGE maxSdkVersion differs: 32 here (:13) vs 29 there (android-camera-setup.md:36)).
- ASSUMED: None.

## sql-import-scripts.md
- Purpose: Manual data-import runbook with copy-paste SQL: step 1 inserts 8 user records as JSONB into `temp_import`, step 2 creates a Fortress Fund client and 12 sites (with placeholder client id), step 3 inserts 12 inspections (with placeholder site ids), plus a generate_series-based quick-test alternative (sql-import-scripts.md:1-139).
- Public surface: None (markdown document containing SQL snippets).
- Inputs & outputs: Data in: literal user records — 8 real email addresses with full names and roles: `arno@watsonmattheus.com` plus `admin/alain/darren/dawie/ernst/estienne/michael@wmeng.co.za` (:8-15). Data out (when run by an operator): rows in `public.temp_import` (:7), `public.clients` (:24-27, :112-114), `public.sites` (:33-47, :117-119), `public.inspections` (:58-103, :122-131). Uses `auth.uid()` for `created_by`/`inspector_id` (:26, :70).
- Dependencies: uses -> targets tables created in D01 migrations: `temp_import` (supabase/migrations/20251014120224…sql:2-6; RLS allows any authenticated user to INSERT/SELECT, :12-22; never dropped — grep-verified), `clients`/`sites` (20251014114352…sql:11-32), `inspections` incl. `inspector_id` (20251014114352…sql:42) and `end_date`/`priority`/`assigned_to` (20251014120619…sql:3-5); used by <- none found (grep-verified).
- Side effects: None as a file; the embedded SQL mutates the four tables above when pasted into the Supabase SQL Editor (:139 "You can run these scripts in the Supabase SQL Editor").
- Error handling: N/A (no error handling in the snippets; step 2's client insert uses bare `ON CONFLICT DO NOTHING` with no conflict target (:26)).
- Tests: None (grep-verified).
- Observed issues:
  - Embeds 8 real staff emails, names, and role assignments in plaintext in a tracked repo file (:8-15).
  - `assigned_to` values are ad-hoc text identifiers `'user_dawie'`/`'user_ernst'` (:70-103); the doc itself notes "The assigned_to field stores user identifiers as text array" (:137) and that users must first be invited via Auth (:136).
  - Step 2 comment says `RETURNING id` after `ON CONFLICT DO NOTHING` (:27) while requiring the operator to manually copy `'YOUR_CLIENT_ID_HERE'` placeholders (:35-46) — the workflow is manual id transcription.
  - The Fortress Fund client email here is `info@fortress.co.za` (:25) vs `info@fortressfund.com` in complete-import.sql:23.
- ASSUMED: The scripts were used for the initial 2025 production data load and are retained as a record (inferred from the 2025 inspection dates :70-103 and zero in-repo references).

## insert-clients.sql
- Purpose: One-off Supabase SQL Editor script inserting 10 client organization names into `public.clients` with `ON CONFLICT (name) DO NOTHING`, followed by a verification SELECT (insert-clients.sql:1-21).
- Public surface: None (SQL script; not referenced by any code or pipeline).
- Inputs & outputs: Data in: 10 literal names — `Fortress_Fund`, `Moolman_Group`, `abland`, `atterbury`, `gmi_property_group`, `godrich_toyota`, `rejem_linton`, `resbublica`, `twin_city`, `watson_mattheus` (:5-14). Data out: rows in `public.clients`; then `SELECT id, name, created_at FROM public.clients ORDER BY name` (:18-20).
- Dependencies: uses -> `public.clients` (created 20251014114352…sql:11-20: `name TEXT NOT NULL`, no UNIQUE); used by <- none found (grep-verified).
- Side effects: Inserts into `public.clients` when manually executed (:2 "Run this script in your Supabase SQL Editor").
- Error handling: None in-script beyond the `ON CONFLICT (name) DO NOTHING` clause (:15).
- Tests: None (grep-verified).
- Observed issues:
  - The conflict target `(name)` has no matching unique constraint or index in any tracked migration (grep-verified: no `UNIQUE` on clients.name in supabase/migrations/*.sql; table definition at 20251014114352…sql:11-20 has none).
  - Only these inserts omit `created_by` (nullable per 20251014114352…sql:17), so rows created this way have no owner attribution.
  - Name spellings use underscores and apparent typos as literal client names (e.g. `resbublica`, `rejem_linton`) (:12, :11).
- ASSUMED: `ON CONFLICT (name)` would fail at runtime against the migration-defined schema unless a unique index on `clients(name)` was added directly in production outside migrations (behavioral inference from Postgres semantics; not executed).

## complete-import.sql
- Purpose: One-off "Complete Data Import Script" for the Supabase SQL Editor: a single PL/pgSQL DO block that creates one 'Fortress Fund' client, 12 named 'Shopping Mall' sites, and 12 audit inspections dated 2025-07-21 through 2025-12-05, followed by a row-count verification query (complete-import.sql:1-107).
- Public surface: None (SQL script; not referenced by any code or pipeline).
- Inputs & outputs: Data in: literals — client ('Fortress Fund', 'info@fortressfund.com', 'Admin') (:23), 12 site names (:28-73), 12 inspection rows with `status` 'In Progress'/'Scheduled', `priority` 'High', `assigned_to` `ARRAY['user_dawie']`/`ARRAY['user_ernst']`/NULL (:86-97). Data out: rows in `public.clients`, `public.sites`, `public.inspections`; `RAISE NOTICE 'Successfully imported 1 client, 12 sites, and 12 inspections'` (:99); verification UNION of COUNT(*) per table (:103-107).
- Dependencies: uses -> `public.clients(name,email,contact_person)` (20251014114352…sql:11-20), `public.sites(name,client_id,site_type)` (20251014114352…sql:23-32), `public.inspections(title,site_id,inspection_date,end_date,status,priority,assigned_to,description)` (base 20251014114352…sql:35-45; `priority`/`end_date`/`assigned_to` added 20251014120619…sql:3-5); used by <- none found (grep-verified).
- Side effects: Inserts 25 rows across three tables when manually executed (:2 "Run this in Supabase SQL Editor"); no transaction control beyond the implicit DO-block atomicity; no ON CONFLICT guards, so re-running duplicates the client/sites/inspections (`clients.name` has no unique constraint — grep-verified as above).
- Error handling: None (no EXCEPTION clause in the DO block; any failure aborts the block).
- Tests: None (grep-verified).
- Observed issues:
  - Overlaps sql-import-scripts.md steps 2-3 (same 12 sites, same 12 inspection rows) but with variable capture instead of manual id placeholders, and a different client email (`info@fortressfund.com` :23 vs `info@fortress.co.za` sql-import-scripts.md:25).
  - `created_by`/`inspector_id` are never set, unlike sql-import-scripts.md which uses `auth.uid()`; all rows land unattributed.
  - `assigned_to` again uses the free-text identifiers `'user_dawie'`/`'user_ernst'` (:86-97).
- ASSUMED: This is the later, self-contained revision of the import in sql-import-scripts.md (inferred from identical data plus removed manual-placeholder steps; no dates in either file).
