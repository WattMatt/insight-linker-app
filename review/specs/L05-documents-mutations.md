# L05 — documents-mutations

- Unit id: L05
- Slug: documents-mutations
- Spec mode: full
- Date: 2026-07-29
- Files: 8 (4 source + 4 test, fully test-paired)

## Unit header

**Unit purpose.** `src/lib/documents/` implements document lifecycle mutations for the `documents` storage bucket and its two backing tables: rename/move/delete of site and subsection documents (`documentMutations.ts`), the pure path/string builders those mutations use (`paths.ts`), the canonical list of system report-category names (`reportCategories.ts`), and upload size/extension validation (`uploadConstraints.ts`). Storage relocation is implemented as download → upload → remove because the codebase uses no storage copy/move API (comment at documentMutations.ts:39-40, same pattern as src/lib/imageNaming.ts:97-133, unit L12).

**Module-level observations (cross-file facts).**
- Every source file has a same-named `.test.ts` sibling. All four test files match the vitest include glob `src/**/*.test.{ts,tsx}` (vitest.config.ts:22) and run in the `node` environment (vitest.config.ts:18).
- `paths.ts` is internal to the unit: its only importers are `documentMutations.ts:2` and `paths.test.ts:2` (grep-verified).
- `sanitizeSegment`'s regex `[^a-zA-Z0-9.-]` (paths.ts:18) is character-for-character identical to the inline upload sanitizer at src/views/SiteDetail.tsx:560; the comment at paths.ts:16 states this matching is intentional. The two are not shared code — the regex exists twice.
- `SYSTEM_REPORT_CATEGORIES` (reportCategories.ts:5-15) and `getReportCategoryName` (src/lib/pdfDocumentSaver.ts:198-210, unit L14) are coupled by convention only — neither file imports the other (grep-verified). As of this spec they are in lockstep: pdfDocumentSaver's 8 mapped names plus its `"Generated Reports"` fallback are exactly the 9 tuple entries.
- There is no barrel/index file in `src/lib/documents/`; consumers import each module directly.

**External contract.** The rest of the app gets: `renameDocument` / `moveDocuments` / `deleteDocuments` and the `DocRef` type — consumed only by V01 admin-entity-views (src/views/SiteDetail.tsx:35, call sites 586, 592, 599); `validateUploadFile` — consumed only by V01 (src/views/SiteDetail.tsx:36, 557); `isSystemReportCategory` — consumed only by C08 site-documents-reports (src/components/site/MoveDocumentsDialog.tsx:6, 55). `logDocumentActivity` is exported but has zero consumers outside its own file (grep-verified).

---

## src/lib/documents/documentMutations.ts

- Purpose: Supabase-backed rename, move, and delete mutations for site/subsection documents in the `documents` bucket, each followed by an `activity_logs` insert.
- Public surface:
  - `interface DocRef { id: string; source: DocSource; file_name: string; file_url: string; site_id?: string | null; subsection_id?: string | null; category_id: string | null; coc_number?: string | null }` (lines 6-15)
  - `interface TargetCategory { id: string; name: string }` (line 17)
  - `interface MutationResult { id: string; ok: boolean; error?: string }` (line 18)
  - `logDocumentActivity(action: string, details: Record<string, unknown>): Promise<void>` (line 29)
  - `renameDocument(doc: DocRef, newName: string, now: number = Date.now()): Promise<MutationResult>` (line 50)
  - `moveDocuments(docs: DocRef[], target: TargetCategory, now: number = Date.now()): Promise<MutationResult[]>` (line 116)
  - `deleteDocuments(docs: DocRef[]): Promise<MutationResult[]>` (line 139)
  - Module-private: `BUCKET = 'documents'` (line 4), `tableFor(source)` → `'site_documents' | 'subsection_documents'` (lines 20-22), `currentUser()` (lines 24-27), `relocateObject(oldPath, newPath)` (lines 41-48), `moveOne` (lines 84-114), `deleteOne` (lines 125-137).
- Inputs & outputs:
  - In: `DocRef` objects (row snapshots supplied by the caller), new name / target category / timestamp.
  - Out: per-document `MutationResult` (`renameDocument` single, the batch functions arrays; batches processed sequentially in `for` loops, lines 118-121, 141-144).
  - Stores: tables `site_documents`, `subsection_documents` (selected by `tableFor`, lines 20-22), `activity_logs` (line 31); storage bucket `documents` (line 4); `supabase.auth.getUser()` for user id/email (lines 25-26). No localStorage/IndexedDB/env vars.
- Dependencies: uses -> `@/integrations/supabase/client` (line 1, unit L19); `./paths` — `storagePathFromUrl`, `splitNameExt`, `buildRenamePath`, `buildMovePath`, `DocSource` (line 2, same unit L05). used by <- V01 admin-entity-views (src/views/SiteDetail.tsx:35 import; 586 rename, 592 delete, 599 move; `toDocRef` adapter at 578) — grep-verified sole consumer.
- Side effects: storage `download`/`upload` (`cacheControl: '3600'`, `upsert: false`, line 44)/`getPublicUrl`/`remove`; table `update` (lines 70, 101), `delete` (line 130), `insert` into `activity_logs` with `details: JSON.stringify(details)` (lines 31-36); actions logged: `document_renamed` (77), `document_moved` (108), `document_deleted` (132). No events, no subscriptions.
- Error handling:
  - Empty trimmed rename → `{ ok: false, error: 'Name cannot be empty.' }`, no I/O performed (lines 51-52).
  - `storagePathFromUrl` returns null → `{ ok: false, error: 'File is not in managed storage.' }` (lines 54-55, 85-86).
  - `relocateObject` throws `'Could not read the stored file.'` on download error (line 43) or `'Could not write the file to its new location.'` on upload error (line 45); rename/move catch and convert to `{ ok: false, error: message }` (lines 63-64, 93-95).
  - DB update error → rollback: new storage object removed via `.remove([newPath]).catch(() => {})`, then `{ ok: false, error: error.message }`; the old object is left in place (lines 71-74, 102-105).
  - Success path: old-object removal is best-effort `.catch(() => {})` and the resolved `{ error }` is never inspected (lines 76, 107, 128).
  - `deleteOne`: storage removal only when the path parses AND `file_url` contains `'supabase.co/storage'` (line 127); the row delete runs regardless; row-delete error → `{ ok: false, error: error.message }` and no activity log (lines 130-131).
  - `logDocumentActivity` never checks the insert result (lines 31-36).
  - `moveDocuments`/`deleteDocuments` wrap each item in try/catch, converting a throw into that item's `{ ok: false }` and continuing the batch (lines 119-120, 142-143).
- Tests: `src/lib/documents/documentMutations.test.ts` (see its section): rename happy path, empty-name rejection, DB-failure rollback, site move payload/path, delete removal+log — all with `source: 'site'`.
- Observed issues:
  - `DocRef.coc_number` is declared (line 14) but never read anywhere in the module.
  - `updated_by` and the legacy `category` text column are written only for `source === 'site'` (lines 68, 99; comment "site_documents only" line 68); subsection updates carry only `file_name`/`file_url`/`category_id`.
  - `moveDocuments` passes one `now` to every `moveOne` (lines 116-119), and `buildMovePath` output depends only on source/ids/category/fileName/timestamp (paths.ts:42-48) — two batch entries with the same `file_name` and target therefore produce the identical destination path, and the second upload runs with `upsert: false` (line 44).
  - The storage-origin guard differs by operation: delete requires `'supabase.co/storage'` in the URL (line 127); rename/move accept anything `storagePathFromUrl` parses, i.e. any URL containing `'/documents/'` (paths.ts:4).
  - On rename, a user-typed extension is stripped and the original file's extension is preserved: `newBase = splitNameExt(trimmed).base || trimmed`, `ext` from `doc.file_name` (lines 57-60).
- ASSUMED: column shapes of `site_documents`, `subsection_documents`, `activity_logs` (not verified against migrations, units D01-D03); that supabase-js query/storage builders resolve with `{ error }` rather than rejecting (the basis on which the `.catch(() => {})` calls are no-ops in practice).

## src/lib/documents/documentMutations.test.ts

- Purpose: Vitest suite for `renameDocument`, `moveDocuments`, `deleteDocuments` against a hoisted mutable-state mock of the Supabase client.
- Public surface: none (test file).
- Inputs & outputs: `vi.hoisted` shared `state` (lines 3-14) records `updatePayload`/`updateTable`/`removed`/`uploaded`/`activity` and injects `updateError`/`deleteError`/`uploadError`; `vi.mock('@/integrations/supabase/client')` (lines 16-33) fakes `auth.getUser` (fixed `user-1`/`a@b.com`, line 18), `from(table).update/insert/delete` (lines 20-22), and `storage.from().download/upload/getPublicUrl/remove` (lines 24-31); `getPublicUrl` fabricates `https://x/storage/v1/object/public/documents/${path}` (line 28). Fixture `siteDoc` has `source: 'site'`, `file_url` under `/documents/s1/02 Manuals/111-old.pdf` (lines 37-41); state reset in `beforeEach` (lines 43-46).
- Dependencies: uses -> `vitest`; `./documentMutations` (line 35, same unit). used by <- none found (grep-verified; test file).
- Side effects: none outside the vitest process.
- Error handling: n/a (assertions).
- Tests (what is asserted):
  - Rename happy path (lines 49-58): `ok`, table `site_documents`, `file_name` `'Brand New.pdf'`, `file_url` contains `s1/02 Manuals/1000-Brand_New.pdf`, `updated_by` `'user-1'`, old object removed first, activity action `document_renamed`.
  - Empty name (lines 60-64): `ok: false` and zero uploads.
  - DB-update failure (lines 66-72): `ok: false`, the freshly-uploaded `1000-Brand_New.pdf` is removed, the old path is NOT removed.
  - Site move (lines 76-83): `category_id` `'c2'`, `category` `'04 Metering'`, `file_url` contains `s1/04_Metering/2000-Old.pdf`, activity `document_moved`.
  - Delete (lines 87-92): fixture URL switched to include `supabase.co` (line 88) so the storage guard passes; asserts old path removed, `ok`, activity `document_deleted`.
- Observed issues: the mock defines and resets `state.uploadError` (lines 10, 27, 45) but no test ever sets it — the upload-failure branch is unexercised; every test uses `source: 'site'`, so the `subsection_documents` table path and the no-`updated_by` payload variant are untested; the mock's `storage.from()` ignores the bucket name (line 25).
- ASSUMED: none.

## src/lib/documents/paths.ts

- Purpose: Pure string helpers for storage paths — extract a bucket-relative path from a public URL, split filename/extension, sanitize path segments, and build rename/move destination paths.
- Public surface:
  - `type DocSource = 'site' | 'subsection'` (line 1)
  - `storagePathFromUrl(url: string): string | null` (lines 3-8)
  - `splitNameExt(fileName: string): { base: string; ext: string }` (lines 10-14)
  - `sanitizeSegment(s: string): string` (lines 17-19)
  - `buildRenamePath(oldPath: string, newBase: string, ext: string, timestamp: number): string` (lines 23-28)
  - `interface BuildMoveArgs { source: DocSource; siteId: string | null; subsectionId: string | null; targetCategoryId: string; targetCategoryName: string; fileName: string; timestamp: number }` (lines 30-38)
  - `buildMovePath(a: BuildMoveArgs): string` (lines 42-48)
- Inputs & outputs: strings in, strings out; no I/O, no stores, no env vars. Behavior: `storagePathFromUrl` requires substring `'/documents/'` (line 4), takes text after the first occurrence, strips everything from `'?'` (line 7), performs no URL-decoding; `splitNameExt` treats `dot <= 0` as no extension (line 12), so dotfiles (`.env`) get `ext: ''`; `sanitizeSegment` replaces `[^a-zA-Z0-9.-]` with `'_'` (line 18); `buildRenamePath` keeps the old directory verbatim and emits `${timestamp}-${sanitizeSegment(newBase)}${ext}` — `ext` is appended unsanitized (lines 24-27); `buildMovePath` emits `${siteId}/${sanitizeSegment(categoryName)}/${ts}-${sanitizeSegment(fileName)}` for site and `subsections/${subsectionId}/${targetCategoryId}/${ts}-${sanitizeSegment(fileName)}` for subsection (lines 44-47).
- Dependencies: uses -> nothing (zero imports). used by <- `src/lib/documents/documentMutations.ts:2` and `src/lib/documents/paths.test.ts:2`, both inside L05; no consumers outside the unit (grep-verified).
- Side effects: none (pure).
- Error handling: no throws; `storagePathFromUrl` returns `null` for empty input, missing `'/documents/'`, or empty remainder (lines 4-6); all other functions total.
- Tests: `src/lib/documents/paths.test.ts` (all five exports).
- Observed issues: the `'/documents/'` check is a substring match, so any URL containing that segment parses (not only Supabase storage URLs) — the non-match test fixture simply lacks the substring (paths.test.ts:10); site move paths embed the mutable category NAME while subsection paths embed the immutable category ID (comment lines 40-41 states this mirrors upload conventions); `buildMovePath` interpolates `siteId`/`subsectionId`/`targetCategoryId` unsanitized, and `siteId`/`subsectionId` are typed `string | null` with no guard, so a null becomes the literal `"null"` path segment (lines 45-47).
- ASSUMED: that the "existing upload convention" referenced in comments (lines 16, 41) is fully represented by src/views/SiteDetail.tsx:560 (that is the one upload sanitizer verified; other upload sites were not audited from this unit).

## src/lib/documents/paths.test.ts

- Purpose: Vitest suite for all five `paths.ts` exports using literal fixtures.
- Public surface: none (test file).
- Inputs & outputs: pure in-process assertions; no mocks.
- Dependencies: uses -> `vitest`; `./paths` (line 2, same unit). used by <- none found (grep-verified; test file).
- Side effects: none.
- Error handling: n/a.
- Tests (what is asserted): `storagePathFromUrl` extracts after `/documents/` and strips `?token=z`, preserving the `%20` percent-encoding in the result (lines 5-7); returns null for a non-documents URL (lines 9-11); `splitNameExt` splits `'Switchgear O&M Manual.pdf'` and handles `'README'` (lines 15-20); `sanitizeSegment('A B/C?.pdf')` → `'A_B_C_.pdf'` (line 25); `buildRenamePath` keeps a directory containing a literal space → `'site-1/02 Manuals/999-New_Name.pdf'` (lines 31-33); `buildMovePath` site → `'s1/04_Metering/5-a_b.pdf'` and subsection → `'subsections/ss1/c9/5-a_b.pdf'` (lines 37-44).
- Observed issues: the extraction fixture uses a percent-encoded directory (`02%20Manuals`, line 6) while the rename fixture uses a literal-space directory (`02 Manuals`, line 31) — both encodings pass through untouched, consistent with the source performing no decode; no fixture covers a dotfile or a URL with `/documents/` appearing twice.
- ASSUMED: none.

## src/lib/documents/reportCategories.ts

- Purpose: Single source of truth for the nine system report-category names that PDF generators find-or-create, plus an exact-match membership predicate.
- Public surface:
  - `SYSTEM_REPORT_CATEGORIES` — `as const` tuple of 9 strings: `'Site Summary Reports'`, `'Asset Verification Reports'`, `'Floor Plan Reports'`, `'Inspection Reports'`, `'COC Validation Reports'`, `'Site COC Reports'`, `'Site Drawing Reports'`, `'Marking Checklists'`, `'Generated Reports'` (lines 5-15)
  - `isSystemReportCategory(name: string): boolean` — case-sensitive `includes` over the tuple (lines 17-19)
- Inputs & outputs: constants only; no I/O, stores, or env vars.
- Dependencies: uses -> nothing (zero imports). used by <- C08 site-documents-reports (src/components/site/MoveDocumentsDialog.tsx:6 import; :55 `docs.some(d => isSystemReportCategory(d.category_name))`) — grep-verified sole consumer besides its own test.
- Side effects: none (pure).
- Error handling: none possible; total function.
- Tests: `src/lib/documents/reportCategories.test.ts`.
- Observed issues: the header comment (lines 1-4) instructs "Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts" (unit L14) — verified currently true: pdfDocumentSaver.ts:199-208 maps 8 report types to exactly the first 8 tuple names and line 209 falls back to `'Generated Reports'`, the 9th; the lockstep is enforced by nothing — neither file imports the other and no test cross-references them (grep-verified).
- ASSUMED: the comment's causal claim (lines 2-4) that a user renaming one of these categories would cause the next generated report to re-create the original name and drop the report from the Reports view — this describes pdfDocumentSaver/Reports-view behavior not verified from this unit.

## src/lib/documents/reportCategories.test.ts

- Purpose: Vitest suite for the category constant and predicate.
- Public surface: none (test file).
- Inputs & outputs: pure assertions; no mocks.
- Dependencies: uses -> `vitest`; `./reportCategories` (line 2, same unit). used by <- none found (grep-verified; test file).
- Side effects: none.
- Error handling: n/a.
- Tests (what is asserted): `SYSTEM_REPORT_CATEGORIES` contains `'Site Summary Reports'`, `'Marking Checklists'`, `'Generated Reports'` (lines 6-8); `isSystemReportCategory` returns true for `'Inspection Reports'`, false for lowercase `'inspection reports'` and for `'02 Manuals'` (lines 12-14).
- Observed issues: the first test's title claims "includes every getReportCategoryName output + the fallback" (line 5) but the body asserts only 3 of the 9 tuple members and never imports `getReportCategoryName` to compare (lines 5-9).
- ASSUMED: none.

## src/lib/documents/uploadConstraints.ts

- Purpose: Size-cap and extension allow-list validation for document uploads.
- Public surface:
  - `MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024` (52,428,800; line 1)
  - `ALLOWED_EXTENSIONS` — `as const` tuple of 11: `pdf, doc, docx, xls, xlsx, png, jpg, jpeg, gif, webp, svg` (lines 3-6)
  - `type UploadValidation = { ok: true } | { ok: false; reason: string }` (line 8)
  - `validateUploadFile(file: File): UploadValidation` (lines 10-20)
- Inputs & outputs: a DOM `File` in; validation result out. Extension derived as `file.name.split('.').pop()?.toLowerCase() ?? ''` (line 11); rejection reasons embed the filename: unsupported type (line 13), too large with the cap rendered in MB (lines 15-17). No I/O, stores, or env vars.
- Dependencies: uses -> nothing (zero imports). used by <- V01 admin-entity-views (src/views/SiteDetail.tsx:36 import; :557 called per file in the upload handler) — grep-verified sole consumer besides its own test; `MAX_FILE_SIZE_BYTES` and `ALLOWED_EXTENSIONS` have no consumers outside the unit (grep-verified).
- Side effects: none (pure).
- Error handling: never throws; returns discriminated-union failure values with human-readable `reason` strings (lines 13, 17).
- Tests: `src/lib/documents/uploadConstraints.test.ts`.
- Observed issues: validation is extension-only — `file.type` (MIME) is never read; for a dotless filename, `split('.').pop()` returns the entire name, so a file literally named `pdf` passes the extension check (lines 11-12); `svg` is on the allow-list (line 5); the size check is strict `>` so a file of exactly 52,428,800 bytes passes (line 15).
- ASSUMED: none.

## src/lib/documents/uploadConstraints.test.ts

- Purpose: Vitest suite for `validateUploadFile` using a fabricated `File` whose size is overridden.
- Public surface: none (test file; local helper `fakeFile(name, size, type = ''): File` defines a 1-byte `File` then overrides `size` via `Object.defineProperty`, lines 4-8).
- Inputs & outputs: pure assertions; no mocks of app modules.
- Dependencies: uses -> `vitest`; `./uploadConstraints` (line 2, same unit). used by <- none found (grep-verified; test file).
- Side effects: none.
- Error handling: n/a.
- Tests (what is asserted): allowed type under the cap → `{ ok: true }` (line 12); `.exe` rejected with reason matching `/type/i` (lines 16-18); `MAX_FILE_SIZE_BYTES + 1` rejected with reason matching `/large|size|MB/i` (lines 22-24); uppercase `.PDF` accepted (line 28).
- Observed issues: no fixture for a dotless filename or for the exact-cap boundary (`size === MAX_FILE_SIZE_BYTES`); the `type` argument passed to `fakeFile` is never consulted by the code under test.
- ASSUMED: this test file runs in the `node` vitest environment (vitest.config.ts:18) and therefore relies on `File` being available as a Node global; the suite was not executed during this review (READ-ONLY engagement), so pass/fail status is not asserted here.
