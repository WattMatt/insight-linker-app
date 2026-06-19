# Subsection COC Evaluation Reports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the subsection COC tab, pair each COC certificate with an uploadable evaluation/verification report (its own editable Pass/Fail verdict, stored as a standalone document), auto-extract the COC number from the filename, and group each COC + its evaluation report in a dedicated storage folder.

**Architecture:** Evaluation reports are normal `subsection_documents` rows in a new per-subsection category `07 COC Evaluation Reports` (the "report" in the name auto-excludes them from the compliance roll-up and the COC list), linked to their COC via a new `parent_document_id` FK. Only the COC verdict gates compliance — eval reports are supporting documentation. Files for one COC (certificate + eval reports) share a storage folder `{subsectionId}/COC/{coc-number}/`.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Supabase (Postgres + Storage), Vitest, Tailwind/shadcn UI, deployed on Vercel.

**Spec:** `docs/superpowers/specs/2026-06-19-subsection-coc-evaluation-reports-design.md`

---

## File Structure

- `src/lib/cocFilename.ts` (new) — pure helpers: `extractCocNumber`, `extractEvalVerdict`.
- `src/lib/cocFilename.test.ts` (new) — unit tests for the helpers.
- `src/lib/cocHierarchy.ts` (modify) — add `isCocCertificateCategory` predicate (shared exclusion logic).
- `src/lib/cocHierarchy.test.ts` (modify) — test the predicate.
- `supabase/migrations/<ts>_coc_evaluation_reports.sql` (new) — `parent_document_id` column + index.
- `src/views/subsection-detail/types.ts` (modify) — add `parent_document_id` to `SupabaseDocument`.
- `src/views/subsection-detail/useSubsectionDetail.ts` (modify) — fetch column, seed category, `ensureEvaluationCategory`, `getSupabaseEvaluationDocuments`, `handleUploadEvaluationReport`, cascade delete cleanup, refactor `getSupabaseCocDocuments`.
- `src/views/subsection-detail/CocMeteringTab.tsx` (modify) — COC upload: extract number + per-COC folder; pass eval props through.
- `src/components/coc/CocCertificateList.tsx` (modify) — evaluation-report sub-slot per COC row.

---

## Task 1: COC filename helpers

**Files:**
- Create: `src/lib/cocFilename.ts`
- Test: `src/lib/cocFilename.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cocFilename.test.ts
import { describe, it, expect } from "vitest";
import { extractCocNumber, extractEvalVerdict } from "./cocFilename";

describe("extractCocNumber", () => {
  it("extracts a hyphenated number from a COC filename", () => {
    expect(extractCocNumber("B-1612744_SHOP-002-SHOPRITE-LIQUOR-SH_I.pdf")).toBe("B-1612744");
  });
  it("strips a leading PASS- verdict token from an eval filename", () => {
    expect(extractCocNumber("PASS-B-1612744-SHOP-002-SHOPRITE-LIQUOR-SHOP.html")).toBe("B-1612744");
  });
  it("normalises a number with no hyphen", () => {
    expect(extractCocNumber("B1612744 - SHOP K4 MZANSI BILLS.pdf")).toBe("B-1612744");
  });
  it("is not hardcoded to the letter B", () => {
    expect(extractCocNumber("X-99001.pdf")).toBe("X-99001");
  });
  it("uppercases the prefix", () => {
    expect(extractCocNumber("b-1612744.pdf")).toBe("B-1612744");
  });
  it("returns null when there is no letter+digit token", () => {
    expect(extractCocNumber("certificate-of-compliance.pdf")).toBeNull();
  });
});

describe("extractEvalVerdict", () => {
  it("reads Pass from a PASS- prefix", () => {
    expect(extractEvalVerdict("PASS-B-1612744-SHOP.html")).toBe("Pass");
  });
  it("reads Fail from a FAIL_ prefix", () => {
    expect(extractEvalVerdict("FAIL_B-1612744.html")).toBe("Fail");
  });
  it("is case-insensitive", () => {
    expect(extractEvalVerdict("pass-b-1.html")).toBe("Pass");
  });
  it("returns null without a verdict prefix", () => {
    expect(extractEvalVerdict("B-1612744_I.pdf")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cocFilename.test.ts`
Expected: FAIL — cannot resolve `./cocFilename`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/cocFilename.ts

/**
 * Extract a COC number from a filename. The number is the letter prefix
 * immediately in front of a digit run (not hardcoded to "B"), normalised to
 * `PREFIX-DIGITS` (e.g. "B-1612744"). A leading PASS/FAIL verdict token is
 * ignored. Returns null when no letter+digit token is present.
 */
export function extractCocNumber(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const stripped = base.replace(/^(pass|fail)[-_\s]+/i, "");
  const m = stripped.match(/([A-Za-z]+)[-_\s]?(\d+)/);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

/**
 * Read a Pass/Fail verdict from a leading PASS-/FAIL- filename token.
 * Used only to pre-select the eval verdict; the value stays editable.
 */
export function extractEvalVerdict(fileName: string): "Pass" | "Fail" | null {
  const base = fileName.replace(/^.*[\\/]/, "");
  if (/^pass[-_\s]/i.test(base)) return "Pass";
  if (/^fail[-_\s]/i.test(base)) return "Fail";
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cocFilename.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cocFilename.ts src/lib/cocFilename.test.ts
git commit -m "feat(coc): filename helpers — extract COC number + eval verdict"
```

---

## Task 2: Shared COC-certificate category predicate

Extract the "is this a COC certificate category (not validation/report)" test into one tested
function, so the eval-report exclusion is guaranteed and DRY.

**Files:**
- Modify: `src/lib/cocHierarchy.ts`
- Test: `src/lib/cocHierarchy.test.ts`
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts:588-598`

- [ ] **Step 1: Write the failing test (append to existing file)**

```ts
// append to src/lib/cocHierarchy.test.ts
import { isCocCertificateCategory } from "./cocHierarchy";

describe("isCocCertificateCategory", () => {
  it("accepts the COC certificate category", () => {
    expect(isCocCertificateCategory("01 COC")).toBe(true);
  });
  it("rejects the evaluation-reports category (contains 'report')", () => {
    expect(isCocCertificateCategory("07 COC Evaluation Reports")).toBe(false);
  });
  it("rejects the old validation-reports category", () => {
    expect(isCocCertificateCategory("COC Validation Reports")).toBe(false);
  });
  it("rejects unrelated categories", () => {
    expect(isCocCertificateCategory("04 Metering")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cocHierarchy.test.ts`
Expected: FAIL — `isCocCertificateCategory` is not exported.

- [ ] **Step 3: Add the predicate**

```ts
// append to src/lib/cocHierarchy.ts

/**
 * True for COC *certificate* categories only. Mirrors the SQL roll-up filter
 * (`name ILIKE '%coc%' AND NOT ILIKE '%validation%' AND NOT ILIKE '%report%'`),
 * so evaluation reports (category "… Evaluation Reports") are excluded from both
 * the COC list and the compliance roll-up.
 */
export function isCocCertificateCategory(name: string): boolean {
  const n = (name ?? "").toLowerCase();
  return n.includes("coc") && !n.includes("validation") && !n.includes("report");
}
```

- [ ] **Step 4: Refactor `getSupabaseCocDocuments` to use it**

In `src/views/subsection-detail/useSubsectionDetail.ts`, add the import near the top with the other lib imports:

```ts
import { isCocCertificateCategory } from "@/lib/cocHierarchy";
```

Replace the body of `getSupabaseCocDocuments` (currently lines 588-598):

```ts
  const getSupabaseCocDocuments = () => {
    // COC certificate categories only — excludes validation/evaluation reports.
    const cocCatIds = documentCategories
      .filter(cat => isCocCertificateCategory(cat.name))
      .map(cat => cat.id);
    if (cocCatIds.length === 0) return [];
    return supabaseDocuments.filter(doc => cocCatIds.includes(doc.category_id));
  };
```

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run src/lib/cocHierarchy.test.ts && npx tsc --noEmit`
Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cocHierarchy.ts src/lib/cocHierarchy.test.ts src/views/subsection-detail/useSubsectionDetail.ts
git commit -m "refactor(coc): shared isCocCertificateCategory predicate"
```

---

## Task 3: Database migration — parent_document_id

**Files:**
- Create: `supabase/migrations/20260619120000_coc_evaluation_reports.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Evaluation reports: link a supporting evaluation/verification report document to
-- its COC certificate. Eval reports live in a "report"-named category (excluded from
-- the COC roll-up), so this never affects is_compliant.
ALTER TABLE public.subsection_documents
  ADD COLUMN IF NOT EXISTS parent_document_id uuid
  REFERENCES public.subsection_documents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subsection_documents_parent
  ON public.subsection_documents(parent_document_id);

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Commit (migration applied to prod in Task 10)**

```bash
git add supabase/migrations/20260619120000_coc_evaluation_reports.sql
git commit -m "feat(db): add subsection_documents.parent_document_id for eval reports"
```

> Note: this migration is **applied to prod via the Supabase Management API SQL endpoint** in Task 10 (not `db push`), per known prod-migration drift.

---

## Task 4: Type + fetch the new column

**Files:**
- Modify: `src/views/subsection-detail/types.ts:35-46`
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts:128-132`

- [ ] **Step 1: Add `parent_document_id` to `SupabaseDocument`**

In `types.ts`, inside `interface SupabaseDocument`, add after `coc_expiry_date`:

```ts
  parent_document_id?: string | null;
```

- [ ] **Step 2: Select the column when fetching documents**

In `useSubsectionDetail.ts`, update the `.select(...)` in `fetchSupabaseDocuments` (line ~130) to include `parent_document_id`:

```ts
        .select('id, file_name, file_url, category_id, uploaded_at, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status, parent_document_id')
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/subsection-detail/types.ts src/views/subsection-detail/useSubsectionDetail.ts
git commit -m "feat(coc): fetch parent_document_id on subsection documents"
```

---

## Task 5: Evaluation category — seed, ensure, and getter

**Files:**
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts` (seed list ~96-103; new helpers near `getSupabaseCocDocuments` ~588; export block ~1020-1108)

- [ ] **Step 1: Add the eval category to the default seed list**

In `fetchDocumentCategories`, extend `defaultCategories` (after `06 Other`):

```ts
          { name: '06 Other', order_index: 6 },
          { name: '07 COC Evaluation Reports', order_index: 7 }
```

- [ ] **Step 2: Add `ensureEvaluationCategory` + `getSupabaseEvaluationDocuments`**

Add near `getSupabaseCocDocuments` in `useSubsectionDetail.ts`:

```ts
  const EVAL_CATEGORY_NAME = '07 COC Evaluation Reports';

  const getEvaluationCategory = () =>
    documentCategories.find(cat => cat.name.toLowerCase() === EVAL_CATEGORY_NAME.toLowerCase());

  // Find-or-create the eval category (existing subsections were seeded before it existed).
  const ensureEvaluationCategory = async (): Promise<DocumentCategory | null> => {
    const existing = getEvaluationCategory();
    if (existing) return existing;
    if (!subsectionId) return null;
    const maxOrder = documentCategories.length > 0
      ? Math.max(...documentCategories.map(cat => parseInt(cat.name.split(' ')[0]) || 0))
      : 0;
    const { data, error } = await supabase
      .from('document_categories')
      .insert({ subsection_id: subsectionId, name: EVAL_CATEGORY_NAME, order_index: maxOrder + 1 })
      .select('id, name')
      .single();
    if (error || !data) {
      if (process.env.NODE_ENV === 'development') console.error("Error creating eval category:", error);
      return null;
    }
    await fetchDocumentCategories();
    return data;
  };

  const getSupabaseEvaluationDocuments = () => {
    const cat = getEvaluationCategory();
    if (!cat) return [];
    return supabaseDocuments.filter(doc => doc.category_id === cat.id);
  };
```

- [ ] **Step 3: Export the new getter from the hook**

In the hook's return object (~line 1024, alongside `getSupabaseCocDocuments`), add:

```ts
    getSupabaseEvaluationDocuments,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (the upload handler that uses `ensureEvaluationCategory` is added in Task 6; until then it is referenced only internally — keep it used by Task 6 before committing, or accept an unused-var lint warning that Task 6 resolves).

- [ ] **Step 5: Commit (after Task 6 to avoid an unused helper)**

This task is committed together with Task 6.

---

## Task 6: Evaluation-report upload + cascade delete cleanup

**Files:**
- Modify: `src/views/subsection-detail/useSubsectionDetail.ts` (new handler near `handleDocumentUpload` ~675; delete handler ~756-801; export block)

- [ ] **Step 1: Add the import for the filename helpers**

Near the top imports of `useSubsectionDetail.ts`:

```ts
import { extractCocNumber, extractEvalVerdict } from "@/lib/cocFilename";
```

- [ ] **Step 2: Add `handleUploadEvaluationReport`**

Add after `handleDocumentUpload` (mirrors its upload/insert/cleanup pattern; stores the eval file in the COC's per-COC folder):

```ts
  // Upload an evaluation/verification report for a specific COC. Stored as a
  // standalone document in the "07 COC Evaluation Reports" category, linked to
  // its COC via parent_document_id, and placed in the COC's per-COC folder.
  const handleUploadEvaluationReport = async (
    parentCoc: { id: string; coc_number: string | null },
    file: File,
  ): Promise<void> => {
    if (!subsectionId) return;
    try {
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error(`File size exceeds maximum limit of 50MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
        return;
      }
      const allowedTypes = [
        'text/html',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/jpg', 'image/png',
      ];
      // Some browsers report empty type for .html; allow by extension as a fallback.
      const okByExt = /\.(html?|pdf|docx?|jpe?g|png)$/i.test(file.name);
      if (file.type && !allowedTypes.includes(file.type) && !okByExt) {
        toast.error("Invalid file type. Upload HTML, PDF, DOC, DOCX, JPG, or PNG.");
        return;
      }

      setUploadingFile(true);
      toast.info("Uploading evaluation report...");

      const category = await ensureEvaluationCategory();
      if (!category) throw new Error("Could not resolve the evaluation reports category");

      // Per-COC folder: certificate + eval reports grouped together.
      const folderKey = (parentCoc.coc_number || parentCoc.id).replace(/[^a-zA-Z0-9.-]/g, '_');
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const path = `${subsectionId}/COC/${folderKey}/${timestamp}-${sanitizedFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(path, file);
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      if (!uploadData?.path) throw new Error("Upload succeeded but no path returned");

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(uploadData.path);
      if (!urlData?.publicUrl) throw new Error("Failed to generate public URL");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error: insertError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: category.id,
          parent_document_id: parentCoc.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_size: file.size,
          uploaded_by: user.id,
          coc_number: parentCoc.coc_number || extractCocNumber(file.name),
          coc_status: extractEvalVerdict(file.name) ?? 'Pending',
        });
      if (insertError) {
        await supabase.storage.from('documents').remove([uploadData.path]);
        throw new Error(`Failed to save evaluation report: ${insertError.message}`);
      }

      toast.success("Evaluation report uploaded!");
      fetchSupabaseDocuments();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error("Error uploading evaluation report:", error);
      toast.error(error?.message || "Failed to upload evaluation report", { duration: 5000 });
    } finally {
      setUploadingFile(false);
    }
  };
```

- [ ] **Step 3: Extend the delete handler to clean up child eval-report blobs**

In `handleDeleteDocument`, after the document's own storage blob is removed and before deleting the row (i.e. after line ~779), add child-blob cleanup. The FK `ON DELETE CASCADE` removes the child rows automatically; this removes their files so they are not orphaned:

```ts
      // Remove storage blobs for any child evaluation reports (rows cascade via FK).
      const { data: children } = await supabase
        .from('subsection_documents')
        .select('file_url')
        .eq('parent_document_id', documentId);
      const childPaths = (children || [])
        .map(c => {
          if (!c.file_url) return null;
          try {
            const u = new URL(c.file_url);
            const parts = u.pathname.split('/');
            return parts.slice(parts.indexOf('documents') + 1).join('/');
          } catch { return null; }
        })
        .filter((p): p is string => !!p);
      if (childPaths.length > 0) {
        await supabase.storage.from('documents').remove(childPaths);
      }
```

- [ ] **Step 4: Export `handleUploadEvaluationReport` from the hook**

In the return object, add:

```ts
    handleUploadEvaluationReport,
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit (Tasks 5 + 6 together)**

```bash
git add src/views/subsection-detail/useSubsectionDetail.ts
git commit -m "feat(coc): evaluation-report upload + per-COC folder + cascade blob cleanup"
```

---

## Task 7: COC upload — extract number + per-COC folder

**Files:**
- Modify: `src/views/subsection-detail/CocMeteringTab.tsx:121-208`

- [ ] **Step 1: Import the helper**

At the top of `CocMeteringTab.tsx`, add:

```ts
import { extractCocNumber } from "@/lib/cocFilename";
```

- [ ] **Step 2: Use the per-COC folder + store the extracted number**

In the COC upload `onChange` (the `01 COC` upload), replace the storage path + insert. Replace the `fileName` line (currently `const fileName = ${subsectionId}/${cocCategory.name}/${timestamp}-${sanitizedFileName};`) with:

```ts
                        const cocNumber = extractCocNumber(file.name);
                        const folderKey = (cocNumber || `${timestamp}`).replace(/[^a-zA-Z0-9.-]/g, '_');
                        const fileName = `${subsectionId}/COC/${folderKey}/${timestamp}-${sanitizedFileName}`;
```

And update the insert to seed the number + a Pending verdict (add the two fields to the existing `.insert({...})`):

```ts
                          .insert({
                            subsection_id: subsectionId,
                            category_id: cocCategory.id,
                            file_name: file.name,
                            file_url: urlData.publicUrl,
                            file_size: file.size,
                            uploaded_by: user.id,
                            coc_number: cocNumber,
                            coc_status: 'Pending',
                          })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/views/subsection-detail/CocMeteringTab.tsx
git commit -m "feat(coc): COC upload auto-extracts number + uses per-COC folder"
```

---

## Task 8: UI — evaluation-report sub-slot per COC row

**Files:**
- Modify: `src/components/coc/CocCertificateList.tsx`
- Modify: `src/views/subsection-detail/CocMeteringTab.tsx` (pass new props)

- [ ] **Step 1: Extend `CocCertificateList` props + thread eval data**

In `CocCertificateList.tsx`, extend the `Props` interface:

```ts
interface Props {
  cocDocuments: SupabaseDocument[];
  evaluationDocuments: SupabaseDocument[];
  deletingDocumentId: string | null;
  uploadingFile: boolean;
  onSaved: () => void; // call fetchSupabaseDocuments + refetchSubsection
  setPreviewDocument: (doc: { file_name: string; file_url: string } | null) => void;
  handleDownloadDocument: (url: string, fileName: string) => void;
  setDeleteDocumentId: (id: string | null) => void;
  onUploadEvaluationReport: (parentCoc: { id: string; coc_number: string | null }, file: File) => Promise<void>;
}
```

- [ ] **Step 2: Render the eval sub-slot inside `CocRow`**

In `CocCertificateList.tsx`, add the evaluation block inside `CocRow`, after the COC fields grid (after the `</div>` that closes the `grid grid-cols-2 md:grid-cols-5` block, before the Save row). Insert:

```tsx
      {/* Evaluation report (supporting documentation — does not gate compliance) */}
      {(() => {
        const evalDoc = p.evaluationDocuments.find(e => e.parent_document_id === raw.id);
        if (evalDoc) {
          return (
            <div className="rounded-md border bg-background px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">Evaluation report</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => p.setPreviewDocument({ file_name: evalDoc.file_name, file_url: evalDoc.file_url })} title="Preview evaluation report"><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => p.handleDownloadDocument(evalDoc.file_url, evalDoc.file_name)} title="Download evaluation report"><Download className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => p.setDeleteDocumentId(evalDoc.id)} disabled={p.deletingDocumentId === evalDoc.id}>
                    {p.deletingDocumentId === evalDoc.id ? <Loader2 className="h-4 w-4 animate-spin text-destructive" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm truncate">{evalDoc.file_name}</span>
                <EvalVerdict raw={evalDoc} onSaved={p.onSaved} />
              </div>
            </div>
          );
        }
        return (
          <div className="rounded-md border border-dashed bg-background px-3 py-2">
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-xs text-muted-foreground">No evaluation report yet</span>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Upload className="h-4 w-4" /> Upload evaluation report
              </span>
              <input
                type="file"
                className="hidden"
                accept=".html,.htm,.pdf,.doc,.docx,.jpg,.jpeg,.png"
                disabled={p.uploadingFile}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) { await p.onUploadEvaluationReport({ id: raw.id, coc_number: number.trim() || d.cocNumber || null }, f); }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        );
      })()}
```

Add `Upload` to the lucide import at the top of the file:

```ts
import { Eye, Download, Trash2, Check, Loader2, Upload } from "lucide-react";
```

- [ ] **Step 3: Add the `EvalVerdict` sub-component**

In `CocCertificateList.tsx`, add above `CocCertificateList`:

```tsx
function EvalVerdict({ raw, onSaved }: { raw: SupabaseDocument; onSaved: () => void }) {
  const initial = ((): "Pass" | "Fail" | "Pending" => {
    const s = (raw.coc_status ?? "").toLowerCase();
    if (s === "pass" || s === "approved" || s === "valid") return "Pass";
    if (s === "fail" || s === "failed" || s === "rejected") return "Fail";
    return "Pending";
  })();
  const [status, setStatus] = useState<"Pass" | "Fail" | "Pending">(initial);
  const [saving, setSaving] = useState(false);
  const changed = status !== initial;
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("subsection_documents").update({ coc_status: status }).eq("id", raw.id);
    setSaving(false);
    if (error) { toast.error(`Failed to save: ${error.message}`); return; }
    toast.success("Evaluation verdict saved");
    onSaved();
  };
  return (
    <div className="flex items-center gap-2">
      <Select value={status} onValueChange={(v) => setStatus(v as "Pass" | "Fail" | "Pending")}>
        <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Pending">Pending</SelectItem>
          <SelectItem value="Pass">Pass</SelectItem>
          <SelectItem value="Fail">Fail</SelectItem>
        </SelectContent>
      </Select>
      {changed ? (
        <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}</Button>
      ) : (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><Check className="h-4 w-4" /> Saved</span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pass eval props into both `CocRow` usages**

In `CocCertificateList` (the exported component), the `{...p}` spread already forwards the new props to each `CocRow`, since `CocRow` takes `Props`. No change needed beyond the interface. Verify `CocRow`'s destructure (`{ raw, isInitial, ...p }`) still compiles — `p` now carries the eval props.

- [ ] **Step 5: Wire props from `CocMeteringTab`**

In `CocMeteringTab.tsx`, the `CocCertificateList` usage (lines ~99-106) becomes:

```tsx
          <CocCertificateList
            cocDocuments={getSupabaseCocDocuments()}
            evaluationDocuments={getSupabaseEvaluationDocuments()}
            deletingDocumentId={deletingDocumentId}
            uploadingFile={uploadingFile}
            onSaved={() => { fetchSupabaseDocuments(); refetchSubsection(); }}
            setPreviewDocument={setPreviewDocument}
            handleDownloadDocument={handleDownloadDocument}
            setDeleteDocumentId={setDeleteDocumentId}
            onUploadEvaluationReport={onUploadEvaluationReport}
          />
```

Add `getSupabaseEvaluationDocuments` and `onUploadEvaluationReport` to `CocMeteringTabProps` and the destructured params:

```ts
  getSupabaseEvaluationDocuments: () => SupabaseDocument[];
  onUploadEvaluationReport: (parentCoc: { id: string; coc_number: string | null }, file: File) => Promise<void>;
```

- [ ] **Step 6: Pass the hook outputs to `CocMeteringTab` from its parent**

In `src/views/SubsectionDetail.tsx` (where `CocMeteringTab` is rendered ~line 220), pass the two new props from the hook:

```tsx
            getSupabaseEvaluationDocuments={getSupabaseEvaluationDocuments}
            onUploadEvaluationReport={handleUploadEvaluationReport}
```

(Confirm both are destructured from `useSubsectionDetail()` in that file; add them if missing.)

- [ ] **Step 7: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/coc/CocCertificateList.tsx src/views/subsection-detail/CocMeteringTab.tsx src/views/SubsectionDetail.tsx
git commit -m "feat(coc): evaluation-report sub-slot with editable verdict on each COC"
```

---

## Task 9: Build + full verification

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all tests pass (incl. new `cocFilename` + `cocHierarchy` tests).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual runtime verify (local `npm run dev` or preview)**

Confirm on a subsection's COC tab:
1. Upload `B-1612744_..._I.pdf` → row shows as Initial, COC number auto-fills `B-1612744`.
2. Click "Upload evaluation report", choose `PASS-B-1612744-...html` → nests under the COC; eval verdict pre-selects **Pass**, editable; "Saved" after save.
3. Open the Documents tab → eval report appears under **07 COC Evaluation Reports**.
4. In Storage, both files are under `…/COC/B-1612744/`.
5. Set COC verdict **Fail** + Save → subsection becomes non-compliant. Set eval verdict **Fail** → **no** compliance change.
6. Delete the COC → its eval report row and its storage file are gone too.

---

## Task 10: Deploy to production

- [ ] **Step 1: Apply the migration to prod (Management API SQL endpoint, not db push)**

Use the decoded keychain PAT + project ref to POST the migration SQL to
`/v1/projects/{ref}/database/query`. Verify the column exists:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='subsection_documents' and column_name='parent_document_id';
```
Expected: one row.

- [ ] **Step 2: Merge to `main` and push (triggers Vercel prod deploy)**

```bash
git checkout main
git merge --no-ff <feature-branch>
git push origin main
```

- [ ] **Step 3: Confirm the Vercel production deployment succeeds** (insight-linker-app project).

- [ ] **Step 4: Post-deploy runtime verify on production** — repeat the Task 9 manual checklist on a real subsection. Report results.

---

## Self-Review

**Spec coverage:**
- §2.1 two manual verdicts → Task 7 (COC verdict seeded) + Task 8 (`EvalVerdict`). ✓
- §2.2 only COC verdict gates → Task 2 predicate + eval category name excludes eval from roll-up; no engine change. ✓
- §2.3 eval = standalone doc → Task 5 category + Task 6 insert (own row); Documents tab is automatic. ✓
- §4 COC number extraction → Task 1 + Task 7. ✓
- §5 per-COC folder → Task 6 + Task 7 storage paths. ✓
- §4.2 FK link → Task 3 migration + Task 4 type/fetch + Task 6 insert. ✓
- §6 helpers → Task 1. ✓
- §7.1 eval sub-slot UI → Task 8. ✓ §7.2 eval upload accepts HTML → Task 6 allow-list + Task 8 `accept`. ✓
- §7.4 delete cascade cleanup → Task 6 Step 3. ✓
- §8 compliance unchanged → no change to rollup/recompute (verified). ✓

**Placeholder scan:** none — all steps carry real code/commands.

**Type consistency:** `handleUploadEvaluationReport(parentCoc: {id, coc_number}, file)` signature is identical in Tasks 6, 8 (props), and the parent wiring. `getSupabaseEvaluationDocuments(): SupabaseDocument[]` consistent across Tasks 5/8. `isCocCertificateCategory(name)` consistent Tasks 2. `parent_document_id` field name consistent across migration/type/fetch/insert/query.
