# L04 — coc-pool-ingestion

- Unit id: L04
- Slug: coc-pool-ingestion
- Spec mode: full
- Date: 2026-07-29
- Files: 4 (src/lib/coc/assignPoolFile.ts, src/lib/coc/poolUpload.ts, src/lib/coc/reassignPool.ts, src/lib/coc/uploadCocFiles.ts)

## Unit header

**Unit purpose (as-is).** `src/lib/coc/` is the Supabase-side ingestion layer for the site COC file pool: it uploads raw files into the `documents` storage bucket and a `coc_file_pool` table row (`poolUpload.ts`), re-runs classification of all pending pool rows for a site against the `coc_certificates` register (`reassignPool.ts`, delegating the pure classification to L02's `planPoolAssignment`), and materialises an assigned pool file into a `subsection_documents` row with register-derived status, cert linkage, and pool-row bookkeeping (`assignPoolFile.ts`). `uploadCocFiles.ts` holds the shared low-level insert/upload primitives (category find-or-create, COC doc insert, evaluation-report upload/insert).

**Module-level observations (cross-file facts).**
- Internal call chain: `poolUpload.poolRouteFile` → `reassignPool.reassignPendingPoolFiles` → `assignPoolFile.assignPoolFile` → `uploadCocFiles.{findOrCreateCategory, insertCocCertificateDoc, insertEvaluationReportDoc}` (poolUpload.ts:4,41; reassignPool.ts:3,25; assignPoolFile.ts:5,41,50,57). All pure classification and filename logic is imported from other units (L01/L02/L03/L09); this unit is exclusively the Supabase I/O side.
- `sanitize` is defined twice with the identical body `s.replace(/[^a-zA-Z0-9.-]/g, "_")` — poolUpload.ts:6 and uploadCocFiles.ts:4.
- File validation (`MAX_BYTES` 50MB, `ALLOWED_EXT` pdf/doc/docx/jpg/jpeg/png/html — uploadCocFiles.ts:5-11) is invoked only inside `uploadEvaluationReport` (uploadCocFiles.ts:42); the pool upload path `uploadFileToPool` performs its storage upload with no size or extension check (poolUpload.ts:18-35).
- No file in this unit checks the `error` member of read (`select`) responses; every read destructures `data` only (e.g. assignPoolFile.ts:17,21,32,44,54; poolUpload.ts:42; reassignPool.ts:11-13). Several writes also discard errors (assignPoolFile.ts:25,61,65; reassignPool.ts:29,32-34).
- Tables touched by the unit: `coc_file_pool`, `coc_certificates`, `subsection_documents`, `document_categories`. Storage: bucket `documents`. No localStorage/IndexedDB. Env: `process.env.NODE_ENV` (reassignPool.ts:28) only.
- No test file anywhere in `src/` imports `lib/coc/` (grep `lib/coc` over `*.test.*`/`*.spec.*`: zero hits), matching the manifest note "no tests in dir" (manifest.md:13).

**External contract.** The rest of the app gets four entry points: `uploadFileToPool` + `poolRouteFile` (upload/one-pipe ingestion — used by V06, V03, V07), `reassignPendingPoolFiles` (site-wide re-classification — used by V06), `assignPoolFile` (manual assignment of one pool row — used by V06), and `uploadEvaluationReport` (direct eval-report upload outside the pool — used by V07). Exported types `AssignablePoolFile`, `PoolRouteResult`, `ReassignResult` are not imported by name anywhere outside `src/lib/coc` (grep-verified, zero hits).

## src/lib/coc/assignPoolFile.ts

- Purpose: Materialises one pooled COC/eval file into a `subsection_documents` row (deduped by filename+category), stamps the matching register cert's document-id column, and marks the pool row assigned (file doc-comment at assignPoolFile.ts:37).
- Public surface:
  - `interface AssignablePoolFile { id: string; file_name: string; file_url: string; file_size: number | null; detected_cert_no: string | null }` (assignPoolFile.ts:7-13).
  - `async function assignPoolFile(siteId: string, file: AssignablePoolFile, subsectionId: string, kind: "coc" | "eval"): Promise<void>` (assignPoolFile.ts:38).
  - Module-private: `stampCert(siteId, subsectionId, certKey, col: "coc_document_id" | "eval_document_id", docId)` (assignPoolFile.ts:15) and `lookupRegisterVerdict(siteId, subsectionId, certKey): Promise<string | null>` (assignPoolFile.ts:30).
- Inputs & outputs: Inputs are the site id, a pool-row projection, target subsection id, and file kind. Output is `Promise<void>`; all results are persisted as DB writes. Tables read: `coc_certificates` (assignPoolFile.ts:17,21,32), `subsection_documents` (dupe check :44, eval-parent lookup :54). Tables written: `subsection_documents` (via uploadCocFiles inserts :50,57, or `coc_status` re-stamp :61), `coc_certificates` (`coc_document_id`/`eval_document_id` :25), `coc_file_pool` (status "assigned", `assigned_subsection_id`, `assigned_document_id` :65), `document_categories` (via `findOrCreateCategory` :41 — categories "01 COC" or "07 COC Evaluation Reports"). No storage, no browser storage, no env vars.
- Dependencies: uses -> `supabase` from `@/integrations/supabase/client` (L19, :1); `normCert` from `@/lib/siteCoc/normalize` (L01, :2); `extractEvalVerdict` from `@/lib/cocFilename` (L09, :3); `docStatusFromVerdict` from `@/lib/siteCoc/verdictMap` (L03, :4); `findOrCreateCategory`, `insertCocCertificateDoc`, `insertEvaluationReportDoc` from `@/lib/coc/uploadCocFiles` (L04, :5). used by <- L04 `src/lib/coc/reassignPool.ts:3`; V06 site-coc-tab `src/views/site-coc/useSiteCocPool.ts:4` (called at :78 and :90) (grep-verified).
- Side effects: 4-7 sequential Supabase PostgREST calls per invocation (reads at :17/:21/:32/:44/:54, writes at :25/:50 or :57 or :61/:65). No events, no subscriptions, no storage-bucket I/O (file bytes are already in storage; only the existing `file_url` is copied into the doc row).
- Error handling: No try/catch anywhere in the file. Read errors are silently discarded by destructuring `data` only — a failed `lookupRegisterVerdict` read yields `null` → `docStatusFromVerdict(null)` → status "Pending" (assignPoolFile.ts:32-34,42); a failed dupe-check read (:44) makes `docId` undefined and the flow proceeds to insert. The `uploadCocFiles` inserts throw on failure (uploadCocFiles.ts:29,35,65,71) and the throw propagates to the caller uncaught. Write results at :25, :61 and :65 are not checked, so a failed cert stamp, status re-stamp, or pool-row update is silent. `stampCert` returns early when `certKey` is empty (:16).
- Tests: none found (grep `lib/coc` across `*.test.*`/`*.spec.*`: zero hits).
- Observed issues:
  - The eval-parent lookup filters `subsection_documents.coc_number` with the raw `certNo` (`.eq("coc_number", certNo)`, assignPoolFile.ts:54), while every other cert comparison in the file uses the normalised `certKey` (`normCert(certNo)`, :40; :18,:22,:33).
  - `stampCert` prefers a cert row whose target column is NULL (:17-18) and otherwise overwrites the first matching cert (:21-25); only one row is updated even when several certs share `cert_no_norm` on the subsection.
  - On the dupe path with `kind === "eval"` (:59-62), only the pool row and cert stamp are updated; the existing eval doc row itself is not touched (the coc dupe path re-stamps `coc_status`, :61).
  - `assignPoolFile` inserts the doc row before stamping the cert and pool row (:48-65); if `stampCert` or the pool update fails silently (unchecked), the doc row exists with no pool/cert linkage.
- ASSUMED:
  - The "COC rollup" mentioned in the doc-comment (:37) is a database trigger on `subsection_documents`; no trigger code was inspected for this spec.
  - `coc_certificates.verdict` values fit the vocabulary `docStatusFromVerdict` maps from (verdictMap.ts:7 signature verified; its body not re-read here).

## src/lib/coc/poolUpload.ts

- Purpose: Uploads a single file into a site's COC pool (storage object + `coc_file_pool` row) and, in the one-pipe variant, immediately runs site-wide auto-assignment and reports where the file landed (doc-comments poolUpload.ts:17,37-38).
- Public surface:
  - `interface PoolRouteResult { poolId: string; detectedCertNo: string | null; assignedSubsectionId: string | null; reason: string | null }` (poolUpload.ts:8-15; null `assignedSubsectionId` documented as "still pending in the Exceptions queue", :11).
  - `async function uploadFileToPool(siteId: string, file: File): Promise<{ poolId: string; detectedCertNo: string | null }>` (poolUpload.ts:18).
  - `async function poolRouteFile(siteId: string, file: File): Promise<PoolRouteResult>` (poolUpload.ts:39).
  - Module-private: `sanitize` (:6).
- Inputs & outputs: Inputs are a site id and a browser `File`. `uploadFileToPool` writes the file bytes to storage bucket `documents` at path `` `${siteId}/_pool/${Date.now()}-${sanitize(file.name)}` `` (:21-22), reads the current auth user (:19), derives `detected_cert_no` via `extractCocNumber(file.name)` (:25) and `detected_kind` via `classifyCocFile(file.name)` (:28), and inserts a `coc_file_pool` row with `site_id, file_name, file_url (public URL), file_size, detected_cert_no, detected_kind, uploaded_by` (:26-29). `poolRouteFile` additionally re-reads the pool row's `status, reason, assigned_subsection_id` (:42-43) after reassignment. No browser storage, no env vars.
- Dependencies: uses -> `supabase` (L19, :1); `extractCocNumber` from `@/lib/cocFilename` (L09, :2); `classifyCocFile` from `@/lib/siteCoc/routeUpload` (L02, :3); `reassignPendingPoolFiles` from `@/lib/coc/reassignPool` (L04, :4). used by <- V03 portal-views `src/views/ContractorSubsectionDetail.tsx:14` (`poolRouteFile` called at :91); V06 site-coc-tab `src/views/site-coc/useSiteCocPool.ts:5` (`uploadFileToPool` called at :40); V07 subsection-detail-module `src/views/subsection-detail/CocMeteringTab.tsx:13` (`poolRouteFile` called at :145) (grep-verified).
- Side effects: `supabase.auth.getUser()` (:19); storage upload to bucket `documents` (:22); public-URL derivation (:24, no network); `coc_file_pool` insert (:26-29); on insert failure, compensating `storage.remove([up.path])` (:31). `poolRouteFile` additionally triggers the full reassignment pass for the whole site (:41 — every pending pool row for the site is re-classified, not just the new one) and one follow-up select (:42-43).
- Error handling: `uploadFileToPool` throws `new Error(upErr?.message ?? "upload error")` on storage failure (:23) and `new Error(error?.message ?? "insert error")` on row-insert failure after removing the just-uploaded object (:30-33); the `remove` result is not checked. `poolRouteFile` has no try/catch: a throw from `uploadFileToPool` or `reassignPendingPoolFiles` propagates; the final select's error is discarded (`data` only, :42), in which case `assigned` is false and both `assignedSubsectionId` and `reason` come back null (:44-50).
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - No size/extension validation on this upload path — `validate` (50MB cap, extension allowlist) lives in uploadCocFiles.ts:8-11 and is not called here (:18-35).
  - `poolRouteFile` reports on the uploaded file by re-reading its row after a site-wide pass (:41-43); the returned `reason`/`assignedSubsectionId` reflect whatever that pass persisted, and a failed final read is indistinguishable from "pending with no reason" (both yield `assignedSubsectionId: null, reason: null`).
  - `detected_kind` is persisted from `classifyCocFile` (:28), but the file-kind decision at assignment time re-derives from the pool row's `detected_kind === "eval"` (reassignPool.ts:25), treating every non-"eval" value as "coc".
- ASSUMED:
  - The `documents` bucket serves public URLs (the code stores `getPublicUrl(...).publicUrl` as `file_url`, :24-27); bucket configuration was not inspected.
  - `coc_file_pool.status` defaults to "pending" at insert (the insert at :26-29 sets no status, and reassignPool.ts:12 queries `status = "pending"`); the table DDL was not inspected.

## src/lib/coc/reassignPool.ts

- Purpose: Re-classifies all pending pool files of a site against the register certs, assigns the assignable ones, and persists the failure reason plus candidate subsections on the rest (doc-comment reassignPool.ts:9).
- Public surface:
  - `interface ReassignResult { assigned: number; pending: number }` (reassignPool.ts:7).
  - `async function reassignPendingPoolFiles(siteId: string): Promise<ReassignResult>` (reassignPool.ts:10).
  - Module-private: `interface PoolRow extends PoolFileLite, AssignablePoolFile {}` (:5).
- Inputs & outputs: Input is a site id. Reads: `coc_file_pool` full rows where `site_id` matches and `status = "pending"` (:12), and `coc_certificates` (`id, cert_no_norm, subsection_id`) for the site (:13), fetched in parallel via `Promise.all` (:11). Writes: per non-assigned classification, `coc_file_pool.reason` = outcome (`"ambiguous_cert" | "cert_has_no_subsection" | "cert_not_found" | "no_cert_detected"`, per L02's `AssignOutcome`, assignmentEngine.ts:6-11) and `candidate_ids` = `candidateSubsectionIds ?? []` (:32-34); per assignment failure, `reason: "assign_failed", candidate_ids: []` (:29); assignments themselves write via `assignPoolFile` (:25). Returns `{ assigned, pending: classifications.length - assigned }` (:37). Env: `process.env.NODE_ENV` gates the dev-only console.error (:28).
- Dependencies: uses -> `supabase` (L19, :1); `planPoolAssignment`, types `CertRowLite`/`PoolFileLite` from `@/lib/siteCoc/assignmentEngine` (L02, :2); `assignPoolFile`, type `AssignablePoolFile` from `@/lib/coc/assignPoolFile` (L04, :3). used by <- L04 `src/lib/coc/poolUpload.ts:4` (called at :41); V06 site-coc-tab `src/views/site-coc/useSiteCoc.ts:5` (called at :71), `src/views/site-coc/useSiteCocImport.ts:8` (called at :139), `src/views/site-coc/useSiteCocPool.ts:6` (called at :50 and :67) (grep-verified).
- Side effects: Two parallel reads (:11-14), then a strictly sequential `await` loop over classifications (:20-36): each assigned file triggers `assignPoolFile`'s 4-7 DB calls; each non-assigned file triggers one `coc_file_pool` update. `console.error` in development on assignment failure (:28). No events or subscriptions.
- Error handling: Only `assignPoolFile` is wrapped in try/catch (:24-30); on throw the pool row gets `reason: "assign_failed"` and the loop continues. The two initial reads discard errors (`data` only) — a failed pool read yields zero files (no-op returning `{assigned: 0, pending: 0}`), a failed certs read classifies every file as `cert_not_found` or `no_cert_detected` via `planPoolAssignment` with an empty cert list. The reason-persisting updates (:29, :32-34) are unchecked. A throw outside the catch (none present in the loop body) would propagate.
- Tests: none found (grep-verified). L02's `assignmentEngine` (the pure classification) has its own tests, but they do not import this file.
- Observed issues:
  - The returned `pending` counts every non-assigned classification, including `assign_failed` files (:37) — `pending` = classified minus successfully assigned, not "rows still in status pending" per the DB.
  - `files` is produced by a double cast `(poolRows ?? []) as unknown as PoolRow[]` from a `select("*")` (:12,15); no field of `PoolRow` is validated against the row shape.
  - `candidate_ids` is populated with `candidateSubsectionIds` (:33) — subsection ids, not cert ids — while `PoolClassification` also carries `candidateCertIds` (assignmentEngine.ts:18), which is never persisted.
  - Kind selection at :25 maps any `detected_kind` other than the exact string `"eval"` (including null) to `"coc"`.
- ASSUMED:
  - `coc_file_pool.candidate_ids` is an array-typed column accepting `string[]`; DDL not inspected.
  - Rows updated with a `reason` remain `status = "pending"` (nothing in this file changes status except via `assignPoolFile`); trigger-level status changes were not ruled out.

## src/lib/coc/uploadCocFiles.ts

- Purpose: Low-level COC document primitives — find-or-create a subsection document category, insert COC-certificate and evaluation-report `subsection_documents` rows for already-stored files, and upload+insert an evaluation report paired to a COC (doc-comments uploadCocFiles.ts:13,26,39,62).
- Public surface:
  - `async function findOrCreateCategory(subsectionId: string, name: string): Promise<{ id: string; name: string }>` (uploadCocFiles.ts:14).
  - `async function insertCocCertificateDoc(opts: { subsectionId: string; cocCategoryId: string; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; cocStatus?: "Pass" | "Fail" | "Pending" }): Promise<{ id: string }>` (:27).
  - `async function uploadEvaluationReport(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string; parentCocNumber: string | null; file: File }): Promise<{ id: string }>` (:40).
  - `async function insertEvaluationReportDoc(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string | null; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; verdict: string | null }): Promise<{ id: string }>` (:63).
  - Module-private: `sanitize` (:4), `MAX_BYTES` = 50MB (:5), `ALLOWED_EXT` = `/\.(html?|pdf|docx?|jpe?g|png)$/i` (:6), `validate(file)` (:8-11).
- Inputs & outputs: `findOrCreateCategory` reads `document_categories` case-insensitively by name (`ilike`, :16) and on miss inserts `{ subsection_id, name, order_index: maxNumericPrefix + 1, is_system: true }`, deriving the order from the numeric prefix of existing category names (:18-21). Both insert functions read the auth user (:28, :64) and insert a `subsection_documents` row; the COC variant sets `coc_status` = `opts.cocStatus ?? "Pending"` (:33), the eval variant sets `parent_document_id` and `coc_status` = `opts.verdict ?? "Pending"` (:67-69). `uploadEvaluationReport` validates the file, uploads to bucket `documents` at `` `${subsectionId}/COC/${sanitize(parentCocNumber || parentCocId)}/${Date.now()}-${sanitize(file.name)}` `` (:44-46), then delegates to `insertEvaluationReportDoc` with `cocNumber` = `parentCocNumber || extractCocNumber(file.name)` and `verdict` = `extractEvalVerdict(file.name)` (:50-55). No browser storage, no env vars.
- Dependencies: uses -> `supabase` (L19, :1); `extractCocNumber`, `extractEvalVerdict` from `@/lib/cocFilename` (L09, :2). used by <- L04 `src/lib/coc/assignPoolFile.ts:5` (`findOrCreateCategory`, `insertCocCertificateDoc`, `insertEvaluationReportDoc`); V07 subsection-detail-module `src/views/subsection-detail/useSubsectionDetail.ts:9` (`uploadEvaluationReport`, aliased `libUploadEvaluationReport`) (grep-verified). No other importer of any symbol (grep-verified).
- Side effects: PostgREST reads/inserts on `document_categories` (:15-16,18,20-21) and `subsection_documents` (:30-34,:66-70); `supabase.auth.getUser()` (:28,:64); storage upload (:46) and compensating `storage.remove` on post-upload insert failure (:57). No events, no subscriptions.
- Error handling: All four exports throw on failure: `findOrCreateCategory` throws `` `Could not resolve category "${name}": ${error?.message}` `` on insert failure (:22) but discards errors on both reads (:15-18 — a failed lookup read falls through to the insert path); both insert functions throw `"Not authenticated"` without a user (:29,:65) and `` `Save failed: ${error?.message}` `` on insert failure (:35,:71); `uploadEvaluationReport` throws from `validate` (:9-10), throws `` `Upload failed: ...` `` on storage failure (:47), and on insert failure removes the uploaded object then rethrows (:56-59, remove result unchecked). Nothing is caught-and-swallowed except the read errors noted.
- Tests: none found (grep-verified, see unit header).
- Observed issues:
  - `findOrCreateCategory`'s duplicate guard is a read-then-insert with no unique constraint handling in code (:15-21); concurrent callers with the same name would each pass the read and both insert.
  - `ilike("name", name)` is called with the literal category name containing no wildcards (:16), making it a case-insensitive exact match; callers pass `"01 COC"` / `"07 COC Evaluation Reports"` (assignPoolFile.ts:41).
  - `order_index` derivation parses the leading integer of every existing category name (:19), so a non-numeric-prefixed name contributes 0.
  - `coc_status` receives two different vocabularies: the typed `"Pass" | "Fail" | "Pending"` in `insertCocCertificateDoc` (:27) versus an untyped `string | null` verdict in `insertEvaluationReportDoc` (:63,69).
  - `validate` is exported to no one and used only by `uploadEvaluationReport` (:8,42); the pool ingestion path (poolUpload.ts) bypasses it (cross-file, see unit header).
- ASSUMED:
  - `subsection_documents` has no DB-side uniqueness on `(subsection_id, category_id, file_name)` — dedupe is done in caller code (assignPoolFile.ts:44-46); DDL not inspected.
  - `document_categories.is_system: true` has downstream meaning (e.g. deletion protection) enforced elsewhere; not verified here.
