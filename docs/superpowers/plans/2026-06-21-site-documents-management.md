# Site Documents Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add document rename, recategorize (single + bulk), category rename/reorder/empty/delete, an audit trail, document metadata, and multi-file upload with validation to the Site Detail → Documents tab — Admin-gated, with storage kept in sync with the DB.

**Architecture:** A new pure-ish library `src/lib/documents/` owns every mutation (rename / move / delete) behind tested functions that route by source (`site_documents` vs `subsection_documents`), keep storage in sync via the repo's download→upload→remove pattern, keep `site_documents.category_id` + `category` text in sync, and write `activity_logs` rows. The existing `SiteDocuments.tsx` list gains selection checkboxes, a metadata line, per-row and per-category `⋮` menus, and inline rename. New dialogs (`MoveDocumentsDialog`, `DocumentHistoryDialog`) and an extended upload dialog drive the flows. `SiteDetail.tsx` keeps its current structure (no refactor) — it gains thin handlers that delegate to the library and an Admin gate via `useUserRole`.

**Tech Stack:** Next.js (App Router) · TypeScript · Supabase (`@supabase/supabase-js`, `documents` storage bucket) · shadcn/Radix UI · lucide-react icons · sonner `toast` · Vitest (`npm run test`).

**Spec:** `docs/superpowers/specs/2026-06-21-site-documents-management-design.md`

> **Status:** ✅ Executed & shipped 2026-06-21 — all 16 tasks complete, 395 tests green, build clean, on origin/main 65f71ad, prod migration applied, Vercel deployed. Only manual Admin/non-Admin runtime verification remains.

---

## Conventions used in this plan

- **Branch first.** All work happens on a dedicated branch (e.g. `feat/site-documents-management`), never `main`. Commits are per task as shown; the repo owner gates pushes.
- **Test command:** `npm run test` (single run). Type check: `npx tsc --noEmit`.
- **Supabase client:** `import { supabase } from "@/integrations/supabase/client";`
- **Toast in SiteDetail:** reuse the `toast` already imported there (sonner-style `toast.success/error/info`).
- **Storage path from a public URL:** `url.split('/documents/')[1]?.split('?')[0]`.
- **No `storage.copy`/`.move`** exists in this repo — use `download → upload → remove` (mirrors `src/lib/imageNaming.ts`).
- **Two category tables (do not conflate):** site docs → `site_document_categories` (per `site_id`); subsection docs → `document_categories` (per `subsection_id`).
- **Deployment of the migration:** apply via the Supabase **Management API `database/query`** (NOT `db push`) due to known prod/migration drift; every statement is idempotent (`IF NOT EXISTS`).

---

## File structure

**Create**
- `src/lib/documents/reportCategories.ts` — canonical system report-category names + `isSystemReportCategory`.
- `src/lib/documents/reportCategories.test.ts`
- `src/lib/documents/uploadConstraints.ts` — allowed types, max size, `validateUploadFile`.
- `src/lib/documents/uploadConstraints.test.ts`
- `src/lib/documents/paths.ts` — pure path helpers (`storagePathFromUrl`, `splitNameExt`, `sanitizeSegment`, `buildRenamePath`, `buildMovePath`).
- `src/lib/documents/paths.test.ts`
- `src/lib/documents/documentMutations.ts` — `renameDocument`, `moveDocuments`, `deleteDocuments`, `logDocumentActivity` + shared types.
- `src/lib/documents/documentMutations.test.ts`
- `src/components/site/MoveDocumentsDialog.tsx`
- `src/components/site/DocumentHistoryDialog.tsx`
- `supabase/migrations/20260621120000_site_documents_management.sql`

**Modify**
- `src/components/site/SiteDocuments.tsx` — selection, metadata line, row `⋮`, inline rename, category `⋮` + inline category rename, system lock badge, new props.
- `src/views/SiteDetail.tsx` — Admin gate, extended fetches, new handlers delegating to the library, wire bulk-delete-in-category, render the two new dialogs.
- `src/components/site/DocumentDialogs.tsx` — multi-file upload + validation.
- `src/lib/pdfDocumentSaver.ts` — set `is_system: true` on report find-or-create; import names from `reportCategories.ts`.
- `src/lib/coc/uploadCocFiles.ts` — set `is_system: true` on COC find-or-create.
- `src/integrations/supabase/types.ts` — add new columns to the four type blocks.

---

## Phase 0 — Migration & types

### Task 1: Database migration (metadata + `is_system` + seeding)

**Files:**
- Create: `supabase/migrations/20260621120000_site_documents_management.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Site Documents management: add document metadata to site_documents, add an is_system
-- flag to BOTH category tables (so report/COC categories can be locked from rename/move/
-- delete), and seed is_system for the known system categories. Idempotent; apply via the
-- Supabase Management API database/query endpoint (NOT db push) due to prod/migration drift.

-- 1) Metadata columns on site_documents (nullable; populated going forward, old rows null).
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS file_size  bigint;
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS mime_type  text;
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS uploaded_by uuid references auth.users(id);
ALTER TABLE public.site_documents ADD COLUMN IF NOT EXISTS updated_by  uuid references auth.users(id);

-- 2) is_system flag on both category tables.
ALTER TABLE public.site_document_categories ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.document_categories      ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- 3) Seed is_system for system report categories (both tables).
UPDATE public.site_document_categories SET is_system = true
WHERE name IN (
  'Site Summary Reports','Asset Verification Reports','Floor Plan Reports','Inspection Reports',
  'COC Validation Reports','Site COC Reports','Site Drawing Reports','Marking Checklists','Generated Reports'
) AND is_system = false;

-- Subsection categories: report categories PLUS auto-created COC categories ('COC', eval-report
-- categories). These are app-managed and must not be rename/move targets on the Documents tab.
UPDATE public.document_categories SET is_system = true
WHERE (
  name IN (
    'Site Summary Reports','Asset Verification Reports','Floor Plan Reports','Inspection Reports',
    'COC Validation Reports','Site COC Reports','Site Drawing Reports','Marking Checklists','Generated Reports'
  )
  OR name ILIKE '%coc%'
  OR name ILIKE '%evaluation report%'
) AND is_system = false;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Verify the SQL is idempotent and well-formed**

Re-read the file. Confirm every `ADD COLUMN` uses `IF NOT EXISTS`, every `UPDATE` is guarded by `AND is_system = false`, and the file ends with the `NOTIFY`. (It cannot be run against a DB from here; it is applied by the repo owner via the Management API. Running it twice must be a no-op.)

Expected: all checks pass on inspection.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260621120000_site_documents_management.sql
git commit -m "feat(site-documents): migration — metadata columns + is_system category flag + seeding"
```

---

### Task 2: Extend generated Supabase types

**Files:**
- Modify: `src/integrations/supabase/types.ts` (the `site_documents`, `site_document_categories`, `document_categories` blocks)

- [ ] **Step 1: Add the new columns to `site_documents` Row/Insert/Update**

In the `site_documents` block, add these keys (Row: required-with-null; Insert/Update: optional):

```ts
// site_documents.Row — add:
        file_size: number | null
        mime_type: string | null
        uploaded_by: string | null
        updated_by: string | null
// site_documents.Insert — add:
        file_size?: number | null
        mime_type?: string | null
        uploaded_by?: string | null
        updated_by?: string | null
// site_documents.Update — add:
        file_size?: number | null
        mime_type?: string | null
        uploaded_by?: string | null
        updated_by?: string | null
```

- [ ] **Step 2: Add `is_system` to both category type blocks**

```ts
// site_document_categories.Row — add:   is_system: boolean
// site_document_categories.Insert — add: is_system?: boolean
// site_document_categories.Update — add: is_system?: boolean
// document_categories.Row — add:   is_system: boolean
// document_categories.Insert — add: is_system?: boolean
// document_categories.Update — add: is_system?: boolean
```

> Note: `site_document_categories.Update.order_index` is currently typed `string` in the generated file — leave it; do not "fix" unrelated code.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors introduced by the new keys).

- [ ] **Step 4: Commit**

```bash
git add src/integrations/supabase/types.ts
git commit -m "feat(site-documents): extend supabase types for metadata + is_system"
```

---

## Phase 1 — Pure library foundations (TDD)

### Task 3: `reportCategories.ts` — system category names

**Files:**
- Create: `src/lib/documents/reportCategories.ts`
- Test: `src/lib/documents/reportCategories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { SYSTEM_REPORT_CATEGORIES, isSystemReportCategory } from './reportCategories';

describe('reportCategories', () => {
  it('includes every getReportCategoryName output + the fallback', () => {
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Site Summary Reports');
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Marking Checklists');
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Generated Reports');
  });

  it('matches exact names case-sensitively', () => {
    expect(isSystemReportCategory('Inspection Reports')).toBe(true);
    expect(isSystemReportCategory('inspection reports')).toBe(false);
    expect(isSystemReportCategory('02 Manuals')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- reportCategories`
Expected: FAIL — cannot find module `./reportCategories`.

- [ ] **Step 3: Write the implementation**

```ts
// Single source of truth for the report/system category NAMES that the app's PDF generators
// find-or-create. These must never be renamed/deleted by users (renaming would make the next
// generated report re-create the original-named category and drop the report from the Reports
// view). Keep in lockstep with getReportCategoryName() in src/lib/pdfDocumentSaver.ts.
export const SYSTEM_REPORT_CATEGORIES = [
  'Site Summary Reports',
  'Asset Verification Reports',
  'Floor Plan Reports',
  'Inspection Reports',
  'COC Validation Reports',
  'Site COC Reports',
  'Site Drawing Reports',
  'Marking Checklists',
  'Generated Reports',
] as const;

export function isSystemReportCategory(name: string): boolean {
  return (SYSTEM_REPORT_CATEGORIES as readonly string[]).includes(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- reportCategories`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/reportCategories.ts src/lib/documents/reportCategories.test.ts
git commit -m "feat(site-documents): system report-category constant"
```

---

### Task 4: `uploadConstraints.ts` — type/size validation

**Files:**
- Create: `src/lib/documents/uploadConstraints.ts`
- Test: `src/lib/documents/uploadConstraints.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { validateUploadFile, MAX_FILE_SIZE_BYTES } from './uploadConstraints';

function fakeFile(name: string, size: number, type = ''): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateUploadFile', () => {
  it('accepts an allowed type under the size cap', () => {
    expect(validateUploadFile(fakeFile('Manual.pdf', 1024, 'application/pdf'))).toEqual({ ok: true });
  });

  it('rejects a disallowed extension', () => {
    const r = validateUploadFile(fakeFile('malware.exe', 1024, ''));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/type/i);
  });

  it('rejects a file over the size cap', () => {
    const r = validateUploadFile(fakeFile('big.pdf', MAX_FILE_SIZE_BYTES + 1, 'application/pdf'));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/large|size|MB/i);
  });

  it('matches the extension case-insensitively', () => {
    expect(validateUploadFile(fakeFile('Scan.PDF', 1024, 'application/pdf')).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- uploadConstraints`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
] as const;

export type UploadValidation = { ok: true } | { ok: false; reason: string };

export function validateUploadFile(file: File): UploadValidation {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, reason: `"${file.name}" has an unsupported file type (.${ext || 'none'}).` };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
    return { ok: false, reason: `"${file.name}" is too large (max ${mb} MB).` };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- uploadConstraints`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/uploadConstraints.ts src/lib/documents/uploadConstraints.test.ts
git commit -m "feat(site-documents): upload type/size validation"
```

---

### Task 5: `paths.ts` — pure storage-path helpers

**Files:**
- Create: `src/lib/documents/paths.ts`
- Test: `src/lib/documents/paths.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { storagePathFromUrl, splitNameExt, sanitizeSegment, buildRenamePath, buildMovePath } from './paths';

describe('storagePathFromUrl', () => {
  it('extracts the path after /documents/ and strips query', () => {
    expect(storagePathFromUrl('https://x.supabase.co/storage/v1/object/public/documents/site-1/02%20Manuals/123-a.pdf?token=z'))
      .toBe('site-1/02%20Manuals/123-a.pdf');
  });
  it('returns null when not a documents-bucket URL', () => {
    expect(storagePathFromUrl('https://example.com/whatever.pdf')).toBeNull();
  });
});

describe('splitNameExt', () => {
  it('splits base and extension', () => {
    expect(splitNameExt('Switchgear O&M Manual.pdf')).toEqual({ base: 'Switchgear O&M Manual', ext: '.pdf' });
  });
  it('handles no extension', () => {
    expect(splitNameExt('README')).toEqual({ base: 'README', ext: '' });
  });
});

describe('sanitizeSegment', () => {
  it('replaces unsafe chars with underscores', () => {
    expect(sanitizeSegment('A B/C?.pdf')).toBe('A_B_C_.pdf');
  });
});

describe('buildRenamePath', () => {
  it('keeps the old directory, swaps in a fresh timestamped sanitized filename + preserved ext', () => {
    const p = buildRenamePath('site-1/02 Manuals/111-old.pdf', 'New Name', '.pdf', 999);
    expect(p).toBe('site-1/02 Manuals/999-New_Name.pdf');
  });
});

describe('buildMovePath', () => {
  it('site: {siteId}/{sanitized category}/{ts}-{sanitized file}', () => {
    expect(buildMovePath({ source: 'site', siteId: 's1', subsectionId: null, targetCategoryId: 'c2', targetCategoryName: '04 Metering', fileName: 'a b.pdf', timestamp: 5 }))
      .toBe('s1/04_Metering/5-a_b.pdf');
  });
  it('subsection: subsections/{subsectionId}/{categoryId}/{ts}-{sanitized file}', () => {
    expect(buildMovePath({ source: 'subsection', siteId: null, subsectionId: 'ss1', targetCategoryId: 'c9', targetCategoryName: 'x', fileName: 'a b.pdf', timestamp: 5 }))
      .toBe('subsections/ss1/c9/5-a_b.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- documents/paths`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
export type DocSource = 'site' | 'subsection';

export function storagePathFromUrl(url: string): string | null {
  if (!url || !url.includes('/documents/')) return null;
  const after = url.split('/documents/')[1];
  if (!after) return null;
  return after.split('?')[0];
}

export function splitNameExt(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return { base: fileName, ext: '' };
  return { base: fileName.slice(0, dot), ext: fileName.slice(dot) };
}

// Matches the existing upload sanitizer in SiteDetail.tsx handleUploadDocument.
export function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9.-]/g, '_');
}

// Rename keeps the file in its current folder; only the filename changes. The directory is
// taken verbatim from the old path so we never have to guess the per-source folder convention.
export function buildRenamePath(oldPath: string, newBase: string, ext: string, timestamp: number): string {
  const slash = oldPath.lastIndexOf('/');
  const dir = slash >= 0 ? oldPath.slice(0, slash) : '';
  const fileName = `${timestamp}-${sanitizeSegment(newBase)}${ext}`;
  return dir ? `${dir}/${fileName}` : fileName;
}

export interface BuildMoveArgs {
  source: DocSource;
  siteId: string | null;
  subsectionId: string | null;
  targetCategoryId: string;
  targetCategoryName: string;
  fileName: string;
  timestamp: number;
}

// Move builds a fresh canonical path per source: site docs fold the category NAME into the
// path (matching the existing upload convention); subsection docs use the immutable category ID.
export function buildMovePath(a: BuildMoveArgs): string {
  const file = `${a.timestamp}-${sanitizeSegment(a.fileName)}`;
  if (a.source === 'site') {
    return `${a.siteId}/${sanitizeSegment(a.targetCategoryName)}/${file}`;
  }
  return `subsections/${a.subsectionId}/${a.targetCategoryId}/${file}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- documents/paths`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/paths.ts src/lib/documents/paths.test.ts
git commit -m "feat(site-documents): pure storage-path helpers"
```

---

### Task 6: `documentMutations.ts` — types, audit, single rename + move (TDD)

**Files:**
- Create: `src/lib/documents/documentMutations.ts`
- Test: `src/lib/documents/documentMutations.test.ts`

- [ ] **Step 1: Write the failing test** (mocks the supabase client with the repo's `vi.hoisted` pattern)

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    updatePayload: undefined as any,
    updateTable: '' as string,
    updateError: null as null | { message: string },
    removed: [] as string[][],
    uploaded: [] as string[],
    uploadError: null as null | { message: string },
    activity: undefined as any,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1', email: 'a@b.com' } } }) },
    from: (table: string) => ({
      update: (payload: any) => { state.updateTable = table; state.updatePayload = payload; return { eq: () => Promise.resolve({ error: state.updateError }) }; },
      insert: (payload: any) => { if (table === 'activity_logs') state.activity = payload; return Promise.resolve({ error: null }); },
    }),
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: new Blob(['x']), error: null }),
        upload: (path: string) => { state.uploaded.push(path); return Promise.resolve({ data: { path }, error: state.uploadError }); },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x/storage/v1/object/public/documents/${path}` } }),
        remove: (paths: string[]) => { state.removed.push(paths); return Promise.resolve({ error: null }); },
      }),
    },
  },
}));

import { renameDocument, moveDocuments } from './documentMutations';

const siteDoc = {
  id: 'd1', source: 'site' as const, file_name: 'Old.pdf',
  file_url: 'https://x/storage/v1/object/public/documents/s1/02 Manuals/111-old.pdf',
  site_id: 's1', subsection_id: null, category_id: 'c1', coc_number: null,
};

beforeEach(() => {
  state.updatePayload = undefined; state.updateTable = ''; state.updateError = null;
  state.removed = []; state.uploaded = []; state.uploadError = null; state.activity = undefined;
});

describe('renameDocument', () => {
  it('uploads a new object, updates file_name + file_url, removes the old object, logs activity', async () => {
    const res = await renameDocument(siteDoc, 'Brand New', 1000);
    expect(res.ok).toBe(true);
    expect(state.updateTable).toBe('site_documents');
    expect(state.updatePayload.file_name).toBe('Brand New.pdf');
    expect(state.updatePayload.file_url).toContain('s1/02 Manuals/1000-Brand_New.pdf');
    expect(state.updatePayload.updated_by).toBe('user-1');
    expect(state.removed[0][0]).toBe('s1/02 Manuals/111-old.pdf');
    expect(state.activity.action).toBe('document_renamed');
  });

  it('rejects an empty name', async () => {
    const res = await renameDocument(siteDoc, '   ', 1000);
    expect(res.ok).toBe(false);
    expect(state.uploaded.length).toBe(0);
  });

  it('rolls back the copy when the DB update fails', async () => {
    state.updateError = { message: 'boom' };
    const res = await renameDocument(siteDoc, 'Brand New', 1000);
    expect(res.ok).toBe(false);
    // new object uploaded then removed; old object NOT removed
    expect(state.removed.some(r => r[0].includes('1000-Brand_New.pdf'))).toBe(true);
    expect(state.removed.some(r => r[0] === 's1/02 Manuals/111-old.pdf')).toBe(false);
  });
});

describe('moveDocuments (site)', () => {
  it('updates category_id + category text + file_url for a site doc', async () => {
    const results = await moveDocuments([siteDoc], { id: 'c2', name: '04 Metering' }, 2000);
    expect(results[0].ok).toBe(true);
    expect(state.updatePayload.category_id).toBe('c2');
    expect(state.updatePayload.category).toBe('04 Metering');
    expect(state.updatePayload.file_url).toContain('s1/04_Metering/2000-Old.pdf');
    expect(state.activity.action).toBe('document_moved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- documentMutations`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

```ts
import { supabase } from '@/integrations/supabase/client';
import { storagePathFromUrl, splitNameExt, buildRenamePath, buildMovePath, type DocSource } from './paths';

const BUCKET = 'documents';

export interface DocRef {
  id: string;
  source: DocSource;
  file_name: string;
  file_url: string;
  site_id?: string | null;        // site docs
  subsection_id?: string | null;  // subsection docs
  category_id: string | null;
  coc_number?: string | null;
}

export interface TargetCategory { id: string; name: string; }
export interface MutationResult { id: string; ok: boolean; error?: string }

function tableFor(source: DocSource): 'site_documents' | 'subsection_documents' {
  return source === 'subsection' ? 'subsection_documents' : 'site_documents';
}

async function currentUser(): Promise<{ id: string | null; email: string | null }> {
  const { data } = await supabase.auth.getUser();
  return { id: data?.user?.id ?? null, email: data?.user?.email ?? null };
}

export async function logDocumentActivity(action: string, details: Record<string, unknown>): Promise<void> {
  const user = await currentUser();
  await supabase.from('activity_logs').insert({
    action,
    user_email: user.email ?? 'unknown',
    user_id: user.id,
    details: JSON.stringify(details),
  });
}

// Relocate one storage object (download → upload → getPublicUrl). Returns the new public URL,
// or throws. Mirrors src/lib/imageNaming.ts (repo has no storage.copy/move).
async function relocateObject(oldPath: string, newPath: string): Promise<string> {
  const dl = await supabase.storage.from(BUCKET).download(oldPath);
  if (dl.error || !dl.data) throw new Error('Could not read the stored file.');
  const up = await supabase.storage.from(BUCKET).upload(newPath, dl.data, { cacheControl: '3600', upsert: false });
  if (up.error) throw new Error('Could not write the file to its new location.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath);
  return data.publicUrl;
}

export async function renameDocument(doc: DocRef, newName: string, now: number = Date.now()): Promise<MutationResult> {
  const trimmed = newName.trim();
  if (!trimmed) return { id: doc.id, ok: false, error: 'Name cannot be empty.' };

  const oldPath = storagePathFromUrl(doc.file_url);
  if (!oldPath) return { id: doc.id, ok: false, error: 'File is not in managed storage.' };

  const { ext } = splitNameExt(doc.file_name);
  const newBase = splitNameExt(trimmed).base || trimmed; // strip a typed-in extension if any
  const newPath = buildRenamePath(oldPath, newBase, ext, now);
  const newFileName = `${newBase}${ext}`;

  let newUrl: string;
  try { newUrl = await relocateObject(oldPath, newPath); }
  catch (e) { return { id: doc.id, ok: false, error: (e as Error).message }; }

  const user = await currentUser();
  const payload: Record<string, unknown> = { file_name: newFileName, file_url: newUrl };
  if (doc.source === 'site') payload.updated_by = user.id; // site_documents only

  const { error } = await supabase.from(tableFor(doc.source)).update(payload).eq('id', doc.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([newPath]).catch(() => {}); // roll back the copy
    return { id: doc.id, ok: false, error: error.message };
  }

  await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {}); // best-effort
  await logDocumentActivity('document_renamed', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, old_name: doc.file_name, new_name: newFileName,
  });
  return { id: doc.id, ok: true };
}

async function moveOne(doc: DocRef, target: TargetCategory, now: number): Promise<MutationResult> {
  const oldPath = storagePathFromUrl(doc.file_url);
  if (!oldPath) return { id: doc.id, ok: false, error: 'File is not in managed storage.' };

  const newPath = buildMovePath({
    source: doc.source, siteId: doc.site_id ?? null, subsectionId: doc.subsection_id ?? null,
    targetCategoryId: target.id, targetCategoryName: target.name, fileName: doc.file_name, timestamp: now,
  });

  let newUrl: string;
  try { newUrl = await relocateObject(oldPath, newPath); }
  catch (e) { return { id: doc.id, ok: false, error: (e as Error).message }; }

  const user = await currentUser();
  const payload: Record<string, unknown> = { category_id: target.id, file_url: newUrl };
  if (doc.source === 'site') { payload.category = target.name; payload.updated_by = user.id; }

  const { error } = await supabase.from(tableFor(doc.source)).update(payload).eq('id', doc.id);
  if (error) {
    await supabase.storage.from(BUCKET).remove([newPath]).catch(() => {});
    return { id: doc.id, ok: false, error: error.message };
  }

  await supabase.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  await logDocumentActivity('document_moved', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, from_category_id: doc.category_id,
    to_category_id: target.id, to_category_name: target.name,
  });
  return { id: doc.id, ok: true };
}

export async function moveDocuments(docs: DocRef[], target: TargetCategory, now: number = Date.now()): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const doc of docs) {
    try { results.push(await moveOne(doc, target, now)); }
    catch (e) { results.push({ id: doc.id, ok: false, error: (e as Error).message }); }
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- documentMutations`
Expected: PASS (4 assertions across rename + move).

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/documentMutations.ts src/lib/documents/documentMutations.test.ts
git commit -m "feat(site-documents): mutation lib — rename + move with storage sync + audit"
```

---

### Task 7: `deleteDocuments` (bulk) + partial-result behavior

**Files:**
- Modify: `src/lib/documents/documentMutations.ts`
- Modify: `src/lib/documents/documentMutations.test.ts`

- [ ] **Step 1: Add the failing test**

```ts
import { deleteDocuments } from './documentMutations';

describe('deleteDocuments', () => {
  it('removes the storage object, deletes the row, and logs per doc', async () => {
    // reuse beforeEach reset; add a delete spy path
    const results = await deleteDocuments([siteDoc]);
    expect(results[0].ok).toBe(true);
    expect(state.removed[0][0]).toBe('s1/02 Manuals/111-old.pdf');
  });
});
```

(Extend the hoisted mock's `from()` to also return a `delete: () => ({ eq: () => Promise.resolve({ error: null }) })` — add that key alongside `update`/`insert` in the existing `vi.mock` factory.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- documentMutations`
Expected: FAIL — `deleteDocuments` is not exported.

- [ ] **Step 3: Implement `deleteDocuments`**

```ts
async function deleteOne(doc: DocRef): Promise<MutationResult> {
  const path = storagePathFromUrl(doc.file_url);
  if (path && doc.file_url.includes('supabase.co/storage')) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {}); // best-effort
  }
  const { error } = await supabase.from(tableFor(doc.source)).delete().eq('id', doc.id);
  if (error) return { id: doc.id, ok: false, error: error.message };
  await logDocumentActivity('document_deleted', {
    source: doc.source, document_id: doc.id, site_id: doc.site_id ?? null,
    subsection_id: doc.subsection_id ?? null, file_name: doc.file_name,
  });
  return { id: doc.id, ok: true };
}

export async function deleteDocuments(docs: DocRef[]): Promise<MutationResult[]> {
  const results: MutationResult[] = [];
  for (const doc of docs) {
    try { results.push(await deleteOne(doc)); }
    catch (e) { results.push({ id: doc.id, ok: false, error: (e as Error).message }); }
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- documentMutations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/documents/documentMutations.ts src/lib/documents/documentMutations.test.ts
git commit -m "feat(site-documents): mutation lib — bulk delete with audit"
```

---

## Phase 2 — SiteDocuments list UI

> These tasks change a React component that the repo does not unit-test. Verification is `npx tsc --noEmit` plus a stated manual check. That is intentional, not a skipped test.

### Task 8: Extend types, props, and the metadata line

**Files:**
- Modify: `src/components/site/SiteDocuments.tsx`

- [ ] **Step 1: Extend the row types and props**

Replace the `UnifiedDocument` interface and `SiteDocumentsProps` interface with:

```ts
interface UnifiedDocument {
    id: string;
    file_name: string;
    file_url: string;
    category_name: string;
    category_id: string | null;
    subsection_name: string;
    subsection_id: string | null;
    site_id: string | null;
    file_size: number | null;
    uploaded_at: string | null;   // created_at (site) or uploaded_at (subsection)
    uploaded_by: string | null;
    coc_number: string | null;
    source: "site" | "subsection";
    original: SiteDocument | SubsectionDocument;
}

interface SiteDocumentsProps {
    documents: SiteDocument[];
    categories: SiteDocumentCategory[];           // now carry is_system + order_index
    subsectionDocuments?: SubsectionDocument[];
    subsections?: { id: string; name: string }[];
    canManage?: boolean;
    onDeleteDocument: (id: string, name: string, source: "site" | "subsection") => void;
    onPreview: (url: string, name: string) => void;
    onDownload: (url: string, name: string) => void;
    onUploadClick: (categoryId: string) => void;
    onCreateCategory: () => void;
    onDeleteCategory: (id: string, name: string) => void;
    onBulkDeleteCategories?: () => void;
    onBulkDeleteDocumentsInCategory?: (categoryId: string, categoryName: string) => void;
    onRenameDocument: (doc: UnifiedDocument, newName: string) => void;
    onMoveDocuments: (docs: UnifiedDocument[]) => void;       // opens the Move dialog in the parent
    onDeleteDocuments: (docs: UnifiedDocument[]) => void;     // bulk delete
    onViewHistory: (doc: UnifiedDocument) => void;
    onRenameCategory: (categoryId: string, newName: string) => void;
    onReorderCategory: (categoryId: string, direction: "up" | "down") => void;
}
```

> The `SiteDocument` / `SiteDocumentCategory` / `SubsectionDocument` aliases are already imported at the top of the file from `@/types/site` (or equivalent). If `SiteDocumentCategory` lacks `is_system`/`order_index`, widen it there or use `(category as any).is_system` only as a last resort — prefer fixing the alias.

- [ ] **Step 2: Build the unified rows with metadata** — update the `UnifiedDocument[]` construction (currently ~lines 78-110) so each mapped object includes the new fields:

```ts
// site documents
{
  id: d.id, file_name: d.file_name, file_url: d.file_url,
  category_name: categories.find(c => c.id === d.category_id)?.name ?? d.category ?? "Uncategorized",
  category_id: d.category_id ?? null,
  subsection_name: "Site-Level", subsection_id: null, site_id: d.site_id ?? null,
  file_size: (d as any).file_size ?? null, uploaded_at: (d as any).created_at ?? null,
  uploaded_by: (d as any).uploaded_by ?? null, coc_number: null,
  source: "site", original: d,
}
// subsection documents
{
  id: sd.id, file_name: sd.file_name, file_url: sd.file_url,
  category_name: (sd as any).category_name ?? "Uncategorized",
  category_id: (sd as any).category_id ?? null,
  subsection_name: subsections?.find(s => s.id === sd.subsection_id)?.name ?? "Subsection",
  subsection_id: sd.subsection_id ?? null, site_id: null,
  file_size: (sd as any).file_size ?? null, uploaded_at: (sd as any).uploaded_at ?? null,
  uploaded_by: (sd as any).uploaded_by ?? null, coc_number: (sd as any).coc_number ?? null,
  source: "subsection", original: sd,
}
```

- [ ] **Step 3: Add a metadata helper near the top of the file**

```ts
function formatMeta(doc: UnifiedDocument): string {
  const parts: string[] = [];
  if (doc.file_size != null) {
    const mb = doc.file_size / (1024 * 1024);
    parts.push(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(doc.file_size / 1024))} KB`);
  }
  if (doc.uploaded_at) parts.push(new Date(doc.uploaded_at).toLocaleDateString());
  parts.push(doc.uploaded_by ? doc.uploaded_by : "—");
  return parts.join(" · ");
}
```

- [ ] **Step 4: Render the metadata line in the row** — in the row block (currently lines 317-348), under the existing `file_name` span, replace the `subsection_name`/`category_name` subtitle span with:

```tsx
<span className="text-xs text-muted-foreground block">
    {groupBy === "category" ? doc.subsection_name : doc.category_name}
    {doc.source === "site" && groupBy === "category" && (
        <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">Site</Badge>
    )}
</span>
<span className="text-[11px] text-muted-foreground/80 block">{formatMeta(doc)}</span>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. (Parent will not yet pass the new required props — that is wired in Task 15; until then this file may report missing props at the call site. If `tsc` flags the SiteDetail call site, that is expected and resolved in Task 15; the component file itself must compile.)

- [ ] **Step 6: Commit**

```bash
git add src/components/site/SiteDocuments.tsx
git commit -m "feat(site-documents): unified rows carry metadata; render size/date/uploader"
```

---

### Task 9: Selection checkboxes + bulk action bar

**Files:**
- Modify: `src/components/site/SiteDocuments.tsx`

- [ ] **Step 1: Add imports**

Add to the existing import lines:

```ts
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { MoreVertical, Pencil, FolderInput, History, ArrowUp, ArrowDown, Lock } from "lucide-react";
```

- [ ] **Step 2: Add selection state** (top of the `SiteDocuments` component body):

```ts
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
});
const clearSelection = () => setSelectedIds(new Set());
const selectedDocs = useMemo(
    () => unifiedDocuments.filter(d => selectedIds.has(d.id)),
    [unifiedDocuments, selectedIds],
);
const selectionSources = new Set(selectedDocs.map(d => d.source));
const mixedSource = selectionSources.size > 1;
```

> `unifiedDocuments` is the array built in Task 8. If it has a different local name, use that.

- [ ] **Step 3: Render the bulk action bar** — directly above the documents list/accordion, gated on `canManage`:

```tsx
{canManage && selectedDocs.length > 0 && (
    <div className="flex items-center gap-3 rounded-md border bg-primary/5 px-3 py-2 mb-3">
        <span className="text-sm font-medium">{selectedDocs.length} selected</span>
        <Button size="sm" variant="outline" disabled={mixedSource}
            title={mixedSource ? "Site-level and subsection documents can't be moved together" : undefined}
            onClick={() => onMoveDocuments(selectedDocs)}>
            <FolderInput className="h-4 w-4 mr-1" /> Move to…
        </Button>
        <Button size="sm" variant="outline" className="text-destructive"
            onClick={() => { onDeleteDocuments(selectedDocs); clearSelection(); }}>
            Delete
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>Clear</Button>
    </div>
)}
```

- [ ] **Step 4: Add a per-row checkbox** — at the start of the row's left-hand `div`, before the `FileText` icon:

```tsx
{canManage && (
    <Checkbox checked={selectedIds.has(doc.id)} onCheckedChange={() => toggleSelect(doc.id)}
        onClick={(e) => e.stopPropagation()} className="mr-1" />
)}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (component compiles; SiteDetail call site wired in Task 15).

- [ ] **Step 6: Commit**

```bash
git add src/components/site/SiteDocuments.tsx
git commit -m "feat(site-documents): row selection + bulk action bar"
```

---

### Task 10: Per-row `⋮` menu + inline rename

**Files:**
- Modify: `src/components/site/SiteDocuments.tsx`

- [ ] **Step 1: Add inline-rename state** (component body):

```ts
const [editingDocId, setEditingDocId] = useState<string | null>(null);
const [editingDocValue, setEditingDocValue] = useState("");
const startRename = (doc: UnifiedDocument) => {
    const dot = doc.file_name.lastIndexOf(".");
    setEditingDocValue(dot > 0 ? doc.file_name.slice(0, dot) : doc.file_name);
    setEditingDocId(doc.id);
};
const commitRename = (doc: UnifiedDocument) => {
    const v = editingDocValue.trim();
    if (v) onRenameDocument(doc, v);
    setEditingDocId(null);
};
```

- [ ] **Step 2: Render the name as either text or an inline editor** — replace the `file_name` span with:

```tsx
{editingDocId === doc.id ? (
    <span className="flex items-center gap-1">
        <Input value={editingDocValue} autoFocus
            onChange={(e) => setEditingDocValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(doc); if (e.key === "Escape") setEditingDocId(null); }}
            className="h-7 text-sm" onClick={(e) => e.stopPropagation()} />
        <Button size="sm" variant="ghost" onClick={() => commitRename(doc)}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditingDocId(null)}>Cancel</Button>
    </span>
) : (
    <span className="text-sm font-medium truncate block">{doc.file_name}</span>
)}
```

- [ ] **Step 3: Replace the row action buttons with View + Download + `⋮`** — replace the action `div` (lines ~333-346) with:

```tsx
<div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
    <Button size="sm" variant="ghost" onClick={() => onPreview(doc.file_url, doc.file_name)}><Eye className="h-4 w-4" /></Button>
    <Button size="sm" variant="ghost" onClick={() => onDownload(doc.file_url, doc.file_name)}><Download className="h-4 w-4" /></Button>
    {canManage && (
        <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => startRename(doc)}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMoveDocuments([doc])}><FolderInput className="h-4 w-4 mr-2" /> Move to…</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onViewHistory(doc)}><History className="h-4 w-4 mr-2" /> History</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDeleteDocument(doc.id, doc.file_name, doc.source)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )}
</div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/site/SiteDocuments.tsx
git commit -m "feat(site-documents): per-row menu (rename/move/history/delete) + inline rename"
```

---

### Task 11: Category header `⋮`, inline category rename, reorder, system lock

**Files:**
- Modify: `src/components/site/SiteDocuments.tsx`

- [ ] **Step 1: Add category-edit state + a category lookup helper**

```ts
const [editingCatId, setEditingCatId] = useState<string | null>(null);
const [editingCatValue, setEditingCatValue] = useState("");
const categoryByName = useMemo(
    () => new Map(categories.map(c => [c.name, c])),
    [categories],
);
```

- [ ] **Step 2: In the group header (lines ~295-314), when grouping by category, render lock badge + inline rename + `⋮`.** After the `Badge` showing the file count, insert:

```tsx
{groupBy === "category" && (() => {
    const cat = categoryByName.get(groupName);
    const isSystem = !!cat?.is_system;
    if (isSystem) {
        return <Badge variant="outline" className="ml-1 text-[10px]"><Lock className="h-3 w-3 mr-1" /> system</Badge>;
    }
    if (!canManage || !cat) return null;
    return (
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {editingCatId === cat.id ? (
                <>
                    <Input value={editingCatValue} autoFocus className="h-7 w-40 text-sm"
                        onChange={(e) => setEditingCatValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { const v = editingCatValue.trim(); if (v) onRenameCategory(cat.id, v); setEditingCatId(null); }
                            if (e.key === "Escape") setEditingCatId(null);
                        }} />
                    <Button size="sm" variant="ghost" onClick={() => { const v = editingCatValue.trim(); if (v) onRenameCategory(cat.id, v); setEditingCatId(null); }}>Save</Button>
                </>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditingCatValue(cat.name); setEditingCatId(cat.id); }}><Pencil className="h-4 w-4 mr-2" /> Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onReorderCategory(cat.id, "up")}><ArrowUp className="h-4 w-4 mr-2" /> Move up</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onReorderCategory(cat.id, "down")}><ArrowDown className="h-4 w-4 mr-2" /> Move down</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onBulkDeleteDocumentsInCategory?.(cat.id, cat.name)}>Empty (delete all files)</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => onDeleteCategory(cat.id, cat.name)}>Delete category</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
})()}
```

> `is_system` only exists on site categories (`categoryByName` is built from the `categories` prop = site categories). Subsection group headers (when grouping by subsection) won't render the menu — correct, since subsection category management is out of scope here.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/SiteDocuments.tsx
git commit -m "feat(site-documents): category menu (rename/reorder/empty/delete) + system lock badge"
```

---

## Phase 3 — Dialogs

### Task 12: `MoveDocumentsDialog`

**Files:**
- Create: `src/components/site/MoveDocumentsDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { isSystemReportCategory } from "@/lib/documents/reportCategories";

export interface MoveDoc {
    id: string;
    file_name: string;
    file_url: string;             // needed to relocate the storage object
    source: "site" | "subsection";
    site_id: string | null;       // needed to build the new site-doc path
    subsection_id: string | null; // needed to build the new subsection-doc path
    category_id: string | null;
    category_name: string;
    coc_number: string | null;
}
interface Cat { id: string; name: string; is_system?: boolean }

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    docs: MoveDoc[];
    siteCategories: Cat[];
    onConfirm: (targetId: string, targetName: string) => void;
}

export function MoveDocumentsDialog({ open, onOpenChange, docs, siteCategories, onConfirm }: Props) {
    const [targetId, setTargetId] = useState<string>("");
    const [subCats, setSubCats] = useState<Cat[]>([]);

    const source = docs[0]?.source ?? "site";
    const mixedSource = new Set(docs.map(d => d.source)).size > 1;
    const subsectionIds = new Set(docs.filter(d => d.source === "subsection").map(d => d.subsection_id));
    const mixedSubsection = source === "subsection" && subsectionIds.size > 1;

    useEffect(() => {
        setTargetId("");
        if (open && source === "subsection" && subsectionIds.size === 1) {
            const ssId = [...subsectionIds][0];
            if (!ssId) return;
            supabase.from("document_categories").select("id, name, is_system").eq("subsection_id", ssId).order("order_index")
                .then(({ data }) => setSubCats((data as Cat[]) ?? []));
        }
    }, [open, source]); // eslint-disable-line react-hooks/exhaustive-deps

    const options = useMemo(() => {
        const list = source === "subsection" ? subCats : siteCategories;
        return list.filter(c => !c.is_system); // locked categories are never move targets
    }, [source, subCats, siteCategories]);

    const hasCoc = docs.some(d => d.coc_number || /coc/i.test(d.category_name));
    const hasReport = docs.some(d => isSystemReportCategory(d.category_name));
    const blocked = mixedSource || mixedSubsection;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Move {docs.length} document{docs.length === 1 ? "" : "s"}</DialogTitle>
                    <DialogDescription>From “{docs[0]?.category_name}”. Only your own categories are listed.</DialogDescription>
                </DialogHeader>

                {blocked ? (
                    <p className="text-sm text-destructive py-2">
                        {mixedSource
                            ? "Site-level and subsection documents can't be moved together. Select one kind at a time."
                            : "These subsection documents belong to different subsections. Move them one subsection at a time."}
                    </p>
                ) : (
                    <div className="space-y-3 py-2">
                        <Select value={targetId} onValueChange={setTargetId}>
                            <SelectTrigger><SelectValue placeholder="Move to…" /></SelectTrigger>
                            <SelectContent>
                                {options.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {hasCoc && <p className="text-xs rounded-md border border-amber-500/50 bg-amber-500/10 p-2">A COC document is in this selection — its COC number &amp; status are kept; no COC checks are re-run.</p>}
                        {hasReport && <p className="text-xs rounded-md border border-amber-500/50 bg-amber-500/10 p-2">A generated report is in this selection — moving it out of its category removes it from the Reports view.</p>}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button disabled={blocked || !targetId}
                        onClick={() => {
                            const t = options.find(o => o.id === targetId);
                            if (t) { onConfirm(t.id, t.name); onOpenChange(false); }
                        }}>Move</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/MoveDocumentsDialog.tsx
git commit -m "feat(site-documents): MoveDocumentsDialog (source-aware targets, COC/report warnings)"
```

---

### Task 13: `DocumentHistoryDialog`

**Files:**
- Create: `src/components/site/DocumentHistoryDialog.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    documentId: string | null;
    documentName: string;
}
interface LogRow { id: string; action: string; user_email: string; created_at: string | null; details: string | null }

const ACTION_LABEL: Record<string, string> = {
    document_renamed: "Renamed",
    document_moved: "Moved",
    document_deleted: "Deleted",
};

export function DocumentHistoryDialog({ open, onOpenChange, documentId, documentName }: Props) {
    const [rows, setRows] = useState<LogRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !documentId) return;
        setLoading(true);
        supabase.from("activity_logs")
            .select("id, action, user_email, created_at, details")
            .ilike("details", `%"document_id":"${documentId}"%`)
            .order("created_at", { ascending: false })
            .then(({ data }) => { setRows((data as LogRow[]) ?? []); setLoading(false); });
    }, [open, documentId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>History</DialogTitle>
                    <DialogDescription className="truncate">{documentName}</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-80 overflow-auto">
                    {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
                    {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No recorded changes.</p>}
                    {rows.map(r => (
                        <div key={r.id} className="text-sm border-b pb-2">
                            <span className="font-medium">{ACTION_LABEL[r.action] ?? r.action}</span>
                            <span className="text-muted-foreground"> · {r.user_email} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/site/DocumentHistoryDialog.tsx
git commit -m "feat(site-documents): DocumentHistoryDialog (per-document audit timeline)"
```

---

### Task 14: Multi-file upload + validation in `DocumentDialogs`

**Files:**
- Modify: `src/components/site/DocumentDialogs.tsx`
- Modify: `src/views/SiteDetail.tsx` (the `uploadFile` state + `handleUploadDocument` become multi-file — done in Task 15; here only the dialog changes its file input + validation messaging)

- [ ] **Step 1: Change the upload props to multi-file**

In `DocumentDialogsProps`, replace:

```ts
    uploadFile: File | null;
    setUploadFile: (file: File | null) => void;
```
with:
```ts
    uploadFiles: File[];
    setUploadFiles: (files: File[]) => void;
```
and update the destructure + the two usages of `uploadFile` in the function signature accordingly.

- [ ] **Step 2: Replace the Upload dialog body** with a multi-file input + inline validation:

```tsx
{/* Upload Document Dialog */}
<Dialog open={uploadCategoryId !== null} onOpenChange={(open) => { if (!open) { setUploadCategoryId(null); setUploadFiles([]); } }}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
            <DialogDescription>Upload one or more files to the selected category (max 50 MB each).</DialogDescription>
        </DialogHeader>
        <form onSubmit={onUploadDocument}>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="document-file">Document Files *</Label>
                    <Input id="document-file" type="file" multiple
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.svg"
                        onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                        required={uploadFiles.length === 0} />
                    {uploadFiles.length > 0 && (
                        <ul className="text-sm text-muted-foreground mt-2 list-disc pl-5">
                            {uploadFiles.map((f, i) => <li key={i}>{f.name}</li>)}
                        </ul>
                    )}
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setUploadCategoryId(null); setUploadFiles([]); }}>Cancel</Button>
                <Button type="submit" disabled={uploadFiles.length === 0}><Upload className="h-4 w-4 mr-2" /> Upload</Button>
            </DialogFooter>
        </form>
    </DialogContent>
</Dialog>
```

- [ ] **Step 3: Type-check** (will flag the SiteDetail call site until Task 15)

Run: `npx tsc --noEmit`
Expected: the `DocumentDialogs.tsx` file compiles; an error at the SiteDetail render site for `uploadFile`→`uploadFiles` is expected and resolved in Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/components/site/DocumentDialogs.tsx
git commit -m "feat(site-documents): multi-file upload input + accept filter"
```

---

## Phase 4 — Wire into SiteDetail

### Task 15: Admin gate, extended fetches, handlers, dialogs, props

**Files:**
- Modify: `src/views/SiteDetail.tsx`

- [ ] **Step 1: Add imports + Admin gate**

```ts
import { useUserRole } from "@/hooks/useUserRole";
import { renameDocument, moveDocuments, deleteDocuments, type DocRef } from "@/lib/documents/documentMutations";
import { validateUploadFile } from "@/lib/documents/uploadConstraints";
import { MoveDocumentsDialog, type MoveDoc } from "@/components/site/MoveDocumentsDialog";
import { DocumentHistoryDialog } from "@/components/site/DocumentHistoryDialog";
```

Inside the component:

```ts
const { data: userRole } = useUserRole();
const canManageDocuments = userRole === "Admin";
```

- [ ] **Step 2: Add new state**

```ts
const [uploadFiles, setUploadFiles] = useState<File[]>([]);
const [moveDialogDocs, setMoveDialogDocs] = useState<MoveDoc[] | null>(null);
const [historyDoc, setHistoryDoc] = useState<{ id: string; name: string } | null>(null);
```

(Remove the old `const [uploadFile, setUploadFile] = useState<File | null>(null);`.)

- [ ] **Step 3: Extend the fetch selects** so metadata + ids are available.

`fetchSiteDocuments` — change the select to:
```ts
.select('id, file_name, file_url, category, category_id, file_size, uploaded_by, created_at')
```
`fetchSubsectionDocuments` — change the inner select to include `category_id`, `file_size`, `uploaded_at`, `uploaded_by`, `coc_number`, and map them through:
```ts
.select(`id, file_name, file_url, subsection_id, category_id, file_size, uploaded_at, uploaded_by, coc_number, document_categories(name)`)
// ...map:
const enrichedDocs = (docs || []).map(doc => ({
  id: doc.id, file_name: doc.file_name, file_url: doc.file_url, subsection_id: doc.subsection_id,
  category_id: doc.category_id, file_size: doc.file_size, uploaded_at: doc.uploaded_at,
  uploaded_by: doc.uploaded_by, coc_number: doc.coc_number,
  category_name: doc.document_categories?.name || null,
}));
```
`fetchDocumentCategories` — change the select to `('id, name, order_index, is_system')` (both the existing-rows branch and the default-insert `.select`).

- [ ] **Step 4: Convert `handleUploadDocument` to multi-file + validation + metadata capture**

```ts
const handleUploadDocument = async (e: React.FormEvent) => {
  e.preventDefault();
  if (uploadFiles.length === 0 || !uploadCategoryId || !siteId) return;
  const category = documentCategories.find(c => c.id === uploadCategoryId);
  const { data: { user } } = await supabase.auth.getUser();
  let ok = 0, failed = 0;
  for (const file of uploadFiles) {
    const v = validateUploadFile(file);
    if (!v.ok) { toast.error(v.reason); failed++; continue; }
    try {
      const path = `${siteId}/${category?.name || 'misc'}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(data.path);
      const { error: insErr } = await supabase.from('site_documents').insert({
        site_id: siteId, category_id: uploadCategoryId, file_name: file.name, file_url: urlData.publicUrl,
        category: category?.name || 'Misc', file_size: file.size, mime_type: file.type || null, uploaded_by: user?.id ?? null,
      });
      if (insErr) throw insErr;
      ok++;
    } catch { failed++; }
  }
  if (ok) toast.success(`${ok} file${ok === 1 ? '' : 's'} uploaded`);
  if (failed) toast.error(`${failed} file${failed === 1 ? '' : 's'} failed`);
  setUploadFiles([]); setUploadCategoryId(null); setUploadDialogOpen(false);
  fetchSiteDocuments();
};
```

- [ ] **Step 5: Add the mutation handlers** (a `toUnifiedRef` adapter maps the list's `UnifiedDocument` to the library `DocRef`):

```ts
const toDocRef = (d: any): DocRef => ({
  id: d.id, source: d.source, file_name: d.file_name, file_url: d.file_url,
  site_id: d.site_id ?? siteId ?? null, subsection_id: d.subsection_id ?? null,
  category_id: d.category_id ?? null, coc_number: d.coc_number ?? null,
});
const refetch = () => { fetchSiteDocuments(); fetchSubsectionDocuments(); };

const handleRenameDocument = async (doc: any, newName: string) => {
  const r = await renameDocument(toDocRef(doc), newName);
  r.ok ? toast.success("Renamed") : toast.error(r.error || "Rename failed");
  refetch();
};
const handleDeleteDocuments = async (docs: any[]) => {
  if (!window.confirm(`Delete ${docs.length} document(s)? This cannot be undone.`)) return;
  const results = await deleteDocuments(docs.map(toDocRef));
  const ok = results.filter(r => r.ok).length;
  toast.success(`${ok} deleted${ok < results.length ? `, ${results.length - ok} failed` : ""}`);
  refetch();
};
const handleConfirmMove = async (targetId: string, targetName: string) => {
  if (!moveDialogDocs) return;
  const results = await moveDocuments(moveDialogDocs.map(toDocRef as any), { id: targetId, name: targetName });
  const ok = results.filter(r => r.ok).length;
  toast.success(`${ok} moved${ok < results.length ? `, ${results.length - ok} failed` : ""}`);
  setMoveDialogDocs(null);
  refetch();
};
const handleRenameCategory = async (categoryId: string, newName: string) => {
  const trimmed = newName.trim();
  if (!trimmed) return;
  // Spec §12: soft-warn if renaming away from a COC-detected name (future uploads won't auto-tag COC).
  const oldName = documentCategories.find(c => c.id === categoryId)?.name ?? "";
  if (/coc/i.test(oldName) && !/coc/i.test(trimmed) &&
      !window.confirm('This category auto-tags new uploads as COC. Renaming away from "COC" stops that for future uploads. Continue?')) {
    return;
  }
  const { error } = await supabase.from('site_document_categories').update({ name: trimmed }).eq('id', categoryId);
  error ? toast.error("Rename failed") : toast.success("Category renamed");
  fetchDocumentCategories();
};
const handleReorderCategory = async (categoryId: string, direction: "up" | "down") => {
  const sorted = [...documentCategories].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const i = sorted.findIndex(c => c.id === categoryId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= sorted.length) return;
  const a = sorted[i], b = sorted[j];
  await supabase.from('site_document_categories').update({ order_index: b.order_index ?? 0 }).eq('id', a.id);
  await supabase.from('site_document_categories').update({ order_index: a.order_index ?? 0 }).eq('id', b.id);
  fetchDocumentCategories();
};
```

- [ ] **Step 6: Pass the new props to `<SiteDocumentsComponent>`** — add to the existing render:

```tsx
canManage={canManageDocuments}
onRenameDocument={handleRenameDocument}
onMoveDocuments={(docs) => setMoveDialogDocs(docs as unknown as MoveDoc[])}
onDeleteDocuments={handleDeleteDocuments}
onViewHistory={(doc) => setHistoryDoc({ id: doc.id, name: doc.file_name })}
onRenameCategory={handleRenameCategory}
onReorderCategory={handleReorderCategory}
```

- [ ] **Step 7: Update the `<DocumentDialogs>` render** — replace `uploadFile={uploadFile} setUploadFile={setUploadFile}` with `uploadFiles={uploadFiles} setUploadFiles={setUploadFiles}`.

- [ ] **Step 8: Render the two new dialogs** (near the `<DocumentDialogs ... />` render):

```tsx
<MoveDocumentsDialog
    open={moveDialogDocs !== null}
    onOpenChange={(o) => { if (!o) setMoveDialogDocs(null); }}
    docs={moveDialogDocs ?? []}
    siteCategories={documentCategories}
    onConfirm={handleConfirmMove}
/>
<DocumentHistoryDialog
    open={historyDoc !== null}
    onOpenChange={(o) => { if (!o) setHistoryDoc(null); }}
    documentId={historyDoc?.id ?? null}
    documentName={historyDoc?.name ?? ""}
/>
```

- [ ] **Step 9: Type-check + test**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS (all prior lib tests green; SiteDetail + components compile).

- [ ] **Step 10: Commit**

```bash
git add src/views/SiteDetail.tsx src/components/site/DocumentDialogs.tsx
git commit -m "feat(site-documents): wire admin gate, mutations, dialogs, multi-file upload into SiteDetail"
```

---

### Task 16: Mark report/COC auto-created categories as `is_system`

**Files:**
- Modify: `src/lib/pdfDocumentSaver.ts`
- Modify: `src/lib/coc/uploadCocFiles.ts`

- [ ] **Step 1: In `pdfDocumentSaver.ts`, set `is_system: true` on report category creation.** In both `saveToSiteDocuments` and `saveToSubsectionDocuments`, change the `.insert({ ...name, order_index: 999 })` for the category to include `is_system: true`:

```ts
// site:
.insert({ site_id: siteId, name: categoryName, order_index: 999, is_system: true })
// subsection:
.insert({ subsection_id: subsectionId, name: categoryName, order_index: 999, is_system: true })
```

- [ ] **Step 2: In `uploadCocFiles.ts`, set `is_system: true` in `findOrCreateCategory`’s insert:**

```ts
.insert({ subsection_id: subsectionId, name, order_index: maxOrder + 1, is_system: true })
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdfDocumentSaver.ts src/lib/coc/uploadCocFiles.ts
git commit -m "feat(site-documents): auto-created report/COC categories marked is_system"
```

---

## Phase 5 — Verification

### Task 17: Full verification + manual checklist

- [ ] **Step 1: Type-check + unit tests**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS — including `reportCategories`, `uploadConstraints`, `paths`, `documentMutations`.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 3: Apply the migration to the target DB**

Apply `supabase/migrations/20260621120000_site_documents_management.sql` via the Supabase Management API `database/query` (NOT `db push`). Then confirm:
- `select column_name from information_schema.columns where table_name='site_documents' and column_name in ('file_size','mime_type','uploaded_by','updated_by');` → 4 rows.
- `select count(*) from site_document_categories where is_system;` → ≥ 0 (system report categories flagged where they exist).

- [ ] **Step 4: Manual runtime checklist** (Admin account, then a non-Admin account)

Admin:
1. Rename a site doc → name updates in list, file still previews/downloads, History shows a "Renamed" entry.
2. Move a single site doc to another category → it appears under the new category; preview still works.
3. Bulk-select two site docs → Move to… → both move; select one site + one subsection doc → Move is disabled.
4. Move a subsection COC doc → amber COC warning shows; after move, COC number/status unchanged.
5. Category `⋮` → Rename a non-system category; confirm a report category (e.g. "Inspection Reports") shows the 🔒 badge and no menu.
6. Category `⋮` → Empty, then Delete a now-empty non-system category.
7. Upload multiple files at once incl. one `.exe` and one >50 MB → valid files upload, the others are rejected with messages.
8. Reorder a category up/down → order persists after refresh.

Non-Admin:
9. Confirm read-only: no checkboxes, no `⋮` menus, no Upload / category management; View + Download still work.

Expected: every item passes. Any failure returns to design (per the investigation protocol) rather than a patch-on-patch.

- [ ] **Step 5: Final commit (if any checklist fixes were needed)**

```bash
git add -A
git commit -m "test(site-documents): verification fixes"
```

---

## Notes & known constraints carried from the spec

- **Category rename is DB-only** (approved): existing files keep their old category-name path prefix (cosmetic; never re-parsed). New uploads use the new name.
- **Report/eval moves are warn-and-allow** (approved): not blocked.
- **Storage bucket is public + permissive** (pre-existing): out of scope here; do not rely on storage RLS for per-site isolation.
- **Subsection category management** stays in Subsection Detail; this tab manages site categories only.
- **Inline rename** is implemented for both documents and categories (as in the approved mockup). Move/History are dialogs.
- **`updated_by`** is set on site docs only (`subsection_documents` has no such column).
```
