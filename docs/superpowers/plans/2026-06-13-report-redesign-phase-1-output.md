# Report Redesign — Phase 1: Fail-Closed Output Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report save/download fail-closed and leak-free: a failed save leaves no orphan blob and reports failure; a download only claims success when it actually happened; `generateReport` stops leaking an object URL.

**Architecture:** Three surgical changes to the output layer. `pdfDocumentSaver` rolls back the uploaded blob when the DB insert fails. `fileDownload.downloadBlob` runs a real fallback chain (File System Access → anchor → window.open) and toasts honestly. `pdfEngine.generateReport` no longer creates an object URL (callers own that lifecycle, as `SiteSummaryReport` already does).

**Tech Stack:** TypeScript, Supabase JS, pdfmake, vitest (node + jsdom-per-file), `vi.mock('@/integrations/supabase/client')` + `vi.mock('sonner')` conventions per existing tests.

**Spec:** `docs/superpowers/specs/2026-06-13-report-system-redesign-design.md`
**Defects:** #5 (orphan blob / false-save), #6 (false download success), #9 (object-URL leak).

---

## File Structure

- **Modify:** `src/lib/pdfDocumentSaver.ts` — add `removeUploadedBlob` helper; roll back on insert failure in both save functions (#5).
- **Create:** `src/lib/pdfDocumentSaver.test.ts` — vi.mock supabase; insert-failure → blob removed + `success:false`; success → no removal.
- **Modify:** `src/lib/fileDownload.ts:128-191` — real fallback chain + honest toasts (#6).
- **Create:** `src/lib/fileDownload.test.ts` — jsdom; picker-saved, popup-blocked→error, abort→silent.
- **Modify:** `src/lib/pdfEngine.ts:951,959` — remove `URL.createObjectURL` side-effect; keep interface field optional (#9).

**Out of scope (deleted in Phase 2):** the dead `pdfmakeInspectionReport.ts:1633` saver that returns `success:true` on insert failure — not worth fixing code we're about to delete.

---

## Task 1: Orphan-blob rollback in the saver (#5)

**Files:**
- Modify: `src/lib/pdfDocumentSaver.ts`
- Test: `src/lib/pdfDocumentSaver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdfDocumentSaver.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted spies so the vi.mock factory (also hoisted) can close over them.
const { removeSpy, insertResult } = vi.hoisted(() => ({
  removeSpy: vi.fn(() => Promise.resolve({ error: null })),
  insertResult: { error: null as null | { message: string } },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'site_document_categories') {
        // Existing category found → no category insert path.
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ id: 'cat-1' }] }) }) }) };
      }
      if (table === 'site_documents') {
        return { insert: () => Promise.resolve({ error: insertResult.error }) };
      }
      return {};
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'sites/site-1/cat/123-file.pdf' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/storage/file.pdf' } }),
        remove: removeSpy,
      }),
    },
  },
}));

import { savePDFToDocuments } from './pdfDocumentSaver';

const opts = () => ({
  blob: new Blob(['pdf'], { type: 'application/pdf' }),
  fileName: 'Report.pdf',
  siteId: 'site-1',
  categoryName: 'Site Summary Reports',
});

describe('savePDFToDocuments — fail-closed + no orphan blob (#5)', () => {
  beforeEach(() => {
    removeSpy.mockClear();
    insertResult.error = null;
  });

  it('removes the uploaded blob and reports failure when the DB insert fails', async () => {
    insertResult.error = { message: 'insert boom' };
    const result = await savePDFToDocuments(opts());
    expect(result.success).toBe(false);
    expect(result.error).toContain('insert boom');
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(['sites/site-1/cat/123-file.pdf']);
  });

  it('does NOT remove the blob on a successful save', async () => {
    insertResult.error = null;
    const result = await savePDFToDocuments(opts());
    expect(result.success).toBe(true);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/pdfDocumentSaver.test.ts`
Expected: FAIL — the failure case currently throws on insert and returns `success:false` (that part passes) but `removeSpy` is never called (no rollback yet), so the `toHaveBeenCalledTimes(1)` assertion fails.

- [ ] **Step 3: Implement the rollback**

In `src/lib/pdfDocumentSaver.ts`, add this helper just below the `SaveResult` interface (after line 15):

```ts
/** Best-effort delete of an uploaded blob after a later step fails, so a failed save leaves no orphan. */
async function removeUploadedBlob(path: string): Promise<void> {
  try {
    await supabase.storage.from("documents").remove([path]);
  } catch (e) {
    console.warn("Failed to remove orphaned blob after save failure:", path, e);
  }
}
```

In `saveToSiteDocuments`, replace the insert + check (lines 92-102) with:

```ts
  // Insert document record
  const { error: insertError } = await supabase
    .from("site_documents")
    .insert({
      site_id: siteId,
      category_id: categoryId,
      file_name: fileName,
      file_url: urlData.publicUrl,
      category: categoryName,
    });

  if (insertError) {
    await removeUploadedBlob(uploadData.path);
    throw insertError;
  }
```

In `saveToSubsectionDocuments`, replace the insert + check (lines 158-168) with:

```ts
  // Insert document record
  const { error: insertError } = await supabase
    .from("subsection_documents")
    .insert({
      subsection_id: subsectionId,
      category_id: categoryId,
      file_name: fileName,
      file_url: urlData.publicUrl,
      file_size: blob.size,
    });

  if (insertError) {
    await removeUploadedBlob(uploadData.path);
    throw insertError;
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/pdfDocumentSaver.test.ts`
Expected: PASS — both cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pdfDocumentSaver.ts src/lib/pdfDocumentSaver.test.ts
git commit -m "fix(reports): roll back orphaned blob on save-insert failure (#5)"
```

---

## Task 2: Real download fallback chain with honest toasts (#6)

**Files:**
- Modify: `src/lib/fileDownload.ts`
- Test: `src/lib/fileDownload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/fileDownload.test.ts`:

```ts
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { toastMock } = vi.hoisted(() => ({
  toastMock: { loading: vi.fn(() => 'tid'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
// downloadHandoff is imported by fileDownload; stub it so the module loads.
vi.mock('@/lib/downloadHandoff', () => ({ openDownloadHandoffWindow: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { storage: { from: () => ({ download: vi.fn() }) } } }));

import { downloadBlob } from './fileDownload';

const blob = () => new Blob(['x'], { type: 'application/pdf' });

describe('downloadBlob — honest success/failure (#6)', () => {
  beforeEach(() => {
    toastMock.loading.mockClear();
    toastMock.success.mockClear();
    toastMock.error.mockClear();
    toastMock.dismiss.mockClear();
    // Default: no File System Access API, not framed.
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    // Ensure not-in-iframe by default (jsdom: window.top === window.self).
  });

  it('uses the File System Access picker when available and toasts success', async () => {
    const writable = { write: vi.fn(() => Promise.resolve()), close: vi.fn(() => Promise.resolve()) };
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(() =>
      Promise.resolve({ createWritable: () => Promise.resolve(writable) }),
    );
    await downloadBlob(blob(), 'R.pdf');
    expect(writable.write).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('stays silent when the user cancels the save dialog (AbortError)', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn(() =>
      Promise.reject(new DOMException('cancelled', 'AbortError')),
    );
    await downloadBlob(blob(), 'R.pdf');
    expect(toastMock.dismiss).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('does NOT claim success when sandboxed and the popup is blocked', async () => {
    // Force the "in iframe" branch: window.top !== window.self.
    Object.defineProperty(window, 'top', { configurable: true, value: {} as Window });
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null); // popup blocked
    await downloadBlob(blob(), 'R.pdf');
    expect(openSpy).toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
    openSpy.mockRestore();
    Object.defineProperty(window, 'top', { configurable: true, value: window });
  });

  it('downloads via anchor and toasts success in a normal (non-framed) page', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await downloadBlob(blob(), 'R.pdf');
    expect(clickSpy).toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/fileDownload.test.ts`
Expected: FAIL — current `downloadBlob` always calls `window.open` then `toast.success`; the picker is never used (test 1 fails: `writable.write` not called), and the popup-blocked case still toasts success (test 3 fails: `toast.error` not called).

- [ ] **Step 3: Implement the fallback chain**

In `src/lib/fileDownload.ts`, replace `triggerBrowserDownload` (lines 128-138), `saveBlobWithPicker` (lines 150-164), and `downloadBlob` (lines 175-191) with:

```ts
/** True when running inside an iframe (where the <a download> attribute is often ignored). */
function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin frame access throws — we are definitely framed
  }
}

/** Standard anchor-download. Reliable in a normal top-level page. */
function triggerAnchorDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

/** Open the blob in a new tab. Returns false if the popup was blocked. */
function triggerWindowOpen(blob: Blob): boolean {
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  return win != null;
}

type PickerOutcome = 'saved' | 'cancelled' | 'unavailable';

/** File System Access API save. Real success/failure; falls through on anything but a confirmed save or user-cancel. */
async function trySaveWithPicker(fileName: string, blob: Blob): Promise<PickerOutcome> {
  const w = window as DownloadCapableWindow;
  if (!w.showSaveFilePicker) return 'unavailable';
  try {
    const fileHandle = await w.showSaveFilePicker(buildSavePickerOptions(fileName));
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'saved';
  } catch (error) {
    if (isAbortError(error)) return 'cancelled';
    console.warn('File System Access save failed, falling back:', error);
    return 'unavailable';
  }
}

/**
 * Download a Blob as a file. Honest about success:
 *  1. File System Access API (real save dialog) — when available.
 *  2. Anchor download — reliable in a normal top-level page.
 *  3. window.open — last resort inside sandboxed iframes; reports failure if the popup is blocked.
 */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  const toastId = toast.loading(`Preparing ${fileName}...`);

  try {
    const picker = await trySaveWithPicker(fileName, blob);
    if (picker === 'saved') {
      toast.success(`Saved ${fileName}`, { id: toastId });
      return;
    }
    if (picker === 'cancelled') {
      toast.dismiss(toastId);
      return;
    }

    if (!isInIframe()) {
      triggerAnchorDownload(blob, fileName);
      toast.success(`Downloaded ${fileName}`, { id: toastId });
      return;
    }

    if (triggerWindowOpen(blob)) {
      toast.success(`Opened ${fileName} in a new tab`, { id: toastId });
      return;
    }

    toast.error(`Couldn't download ${fileName} — allow pop-ups for this site and try again`, { id: toastId });
  } catch (error) {
    if (isAbortError(error)) {
      toast.dismiss(toastId);
      return;
    }
    console.error('Download failed:', error);
    toast.error(`Failed to save ${fileName}`, { id: toastId });
  }
}
```

(Leave `getDirectDownloadUrl`, `isAbortError`, `buildSavePickerOptions`, `getMimeType`, and `downloadFile` as they are.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/fileDownload.test.ts`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/fileDownload.ts src/lib/fileDownload.test.ts
git commit -m "fix(reports): real download fallback chain + honest toasts (#6)"
```

---

## Task 3: Remove the leaked object URL from generateReport (#9)

**Files:**
- Modify: `src/lib/pdfEngine.ts`

- [ ] **Step 1: Confirm there is no LIVE consumer**

Run: `grep -rn "\.previewUrl" src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'`
Expected: the only read of a `generateReport` result's `previewUrl` is `src/lib/pdfmakeInspectionReport.ts:1531` (dead path, deleted in Phase 2). `SiteSummaryReport.tsx` creates/revokes its own URL and never reads `result.previewUrl`. Other `previewUrl` hits are unrelated local component state.

- [ ] **Step 2: Remove the side-effect**

In `src/lib/pdfEngine.ts`, delete the object-URL creation at line 951:

```ts
  // Create preview URL
  const previewUrl = URL.createObjectURL(blob);
```

Replace the return statement (lines 955-960) with:

```ts
  // NOTE: we intentionally do NOT create an object URL here. The previous
  // implementation leaked one per call (callers never revoked it). Callers that
  // need a preview create and revoke their own URL (see SiteSummaryReport).
  return {
    blob,
    filename: generatedFilename,
    complianceChecks,
  };
```

Leave the `previewUrl?: string` field in the `GenerateReportResult` interface (line 102) so the dead `pdfmakeInspectionReport.ts:1531` still compiles (it will read `undefined` harmlessly until deleted in Phase 2).

- [ ] **Step 3: Verify the suite + types (no new unit test — generateReport renders a real PDF, not a pure seam)**

Run: `npm test`
Expected: PASS (no regressions).

Run: `npx tsc --noEmit 2>&1 | grep -E "pdfEngine|pdfmakeInspectionReport" || echo "no new type errors in touched files"`
Expected: no NEW errors at the touched lines (pre-existing pdfmake `any` warnings elsewhere are unrelated).

- [ ] **Step 4: Commit**

```bash
git add src/lib/pdfEngine.ts
git commit -m "fix(reports): stop leaking object URL in generateReport (#9)"
```

---

## Task 4: Phase 1 wrap-up — suite/lint/typecheck + PR

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: PASS — including the two new suites (`pdfDocumentSaver`, `fileDownload`).

- [ ] **Step 2: Lint touched files**

Run: `npx eslint src/lib/pdfDocumentSaver.ts src/lib/pdfDocumentSaver.test.ts src/lib/fileDownload.ts src/lib/fileDownload.test.ts src/lib/pdfEngine.ts`
Expected: 0 errors (warnings tolerated per repo baseline).

- [ ] **Step 3: Typecheck (no new errors)**

Run: `npx tsc --noEmit 2>&1 | grep -E "pdfDocumentSaver|fileDownload|pdfEngine" || echo "clean"`
Expected: `clean` (or only pre-existing unrelated warnings).

- [ ] **Step 4: Push + open PR**

```bash
git push
gh pr create --title "Report redesign Phase 1: fail-closed save/download" \
  --body "Phase 1 of the report-system redesign (spec: docs/superpowers/specs/2026-06-13-report-system-redesign-design.md). Fail-closed output layer: #5 orphan-blob rollback on save failure, #6 honest download success/failure (real FS-Access → anchor → window.open chain), #9 stop leaking an object URL per report. New tests: pdfDocumentSaver, fileDownload."
```

(If Phase 0's PR #28 is not yet merged, this PR stacks on the same branch's history — note that in the PR description or rebase onto main after #28 merges.)

---

## Self-Review

**Spec coverage (Phase 1 = #5, #6, #9):**
- #5 orphan blob / false-save → Task 1 (rollback + fail-closed), tested both branches. ✓
- #6 false download success → Task 2 (real chain + honest toasts), tested picker/abort/popup-blocked/anchor. ✓
- #9 object-URL leak → Task 3 (remove side-effect), verified by grep + suite + tsc. ✓

**Placeholder scan:** Every code step shows complete code; every run step has a command + expected result. No TBD/TODO. ✓

**Type consistency:** `removeUploadedBlob(path: string)` matches `uploadData.path` (string). `PickerOutcome` union used consistently in `trySaveWithPicker`/`downloadBlob`. `DownloadCapableWindow`, `isAbortError`, `buildSavePickerOptions` are pre-existing in `fileDownload.ts` and reused unchanged. `GenerateReportResult.previewUrl` stays optional. ✓

**Notes / risks for the implementer:**
- Task 1: the mock returns an *existing* category so the category-insert branch isn't exercised; that's intentional (keeps the mock minimal — the rollback is what we're testing). The subsection branch shares the same rollback shape; if you want belt-and-braces, add a `subsectionId` variant.
- Task 2: jsdom's `window.top === window.self`, so the anchor branch is the default; the popup-blocked test forces the iframe branch by redefining `window.top`. Restore it after (the test does).
- Task 2: stubbing `@/lib/downloadHandoff` and the supabase client is only to let the module import cleanly under jsdom — `downloadBlob` itself uses neither.
- Task 3 has no unit test by design: `generateReport` renders a real pdfmake document (not a pure seam). It's a deletion verified by grep (no live consumer) + green suite + tsc. The proper URL-lifecycle ownership is standardized in Phase 2 when the inspection path is rewired.
