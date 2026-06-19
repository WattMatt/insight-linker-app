# Site COC — Centralised File Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users bulk-drop COC certificate files + evaluation reports on the Site COC tab; each is auto-routed by its filename COC number into the matched subsection's COC document store, pairing evals to their COC.

**Architecture:** A shared upload lib (extracted from the per-subsection code) does the storage+insert into `subsection_documents`; a pure routing planner classifies each file (COC vs eval) and matches it to a subsection via the imported `coc_certificates` map; an executor runs the plan and stamps link columns on `coc_certificates`. Single source of truth — routed files appear in the per-subsection COC tab and drive compliance.

**Tech Stack:** Next.js + React + TS, Supabase, Vitest, Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-central-file-loading-design.md`

---

## File Structure

- `src/lib/coc/uploadCocFiles.ts` (new) — `findOrCreateCategory`, `uploadCocCertificate`, `uploadEvaluationReport` (shared storage+insert).
- `src/lib/siteCoc/routeUpload.ts` (new) — pure `classifyCocFile`, `planRouting`.
- `src/lib/siteCoc/routeUpload.test.ts` (new) — unit tests.
- `supabase/migrations/20260619140000_coc_cert_document_links.sql` (new) — 2 link columns.
- `src/integrations/supabase/types.ts` (modify) — add the 2 columns to `coc_certificates`.
- `src/views/subsection-detail/useSubsectionDetail.ts` (modify) — `handleUploadEvaluationReport` delegates to the lib.
- `src/views/subsection-detail/CocMeteringTab.tsx` (modify) — COC upload delegates to the lib.
- `src/views/site-coc/useSiteCocLoad.ts` (new) — bulk executor hook.
- `src/views/site-coc/SiteCocLoadCard.tsx` (new) — dropzone + results panel.
- `src/views/site-coc/SiteCocTab.tsx` (modify) — mount the load card; pass refetch.
- `src/views/site-coc/useSiteCoc.ts` (modify) — fetch the 2 link columns into `CocCertRow`.
- `src/views/site-coc/CertificatesSubTab.tsx` (modify) — Attached column.

---

# PHASE 1 — schema + shared lib + routing

## Task 1: Shared upload lib

**Files:** Create `src/lib/coc/uploadCocFiles.ts`

- [ ] **Step 1: Implement** (mirrors the existing per-subsection upload/insert exactly)

```ts
import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber, extractEvalVerdict } from "@/lib/cocFilename";

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");
const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED_EXT = /\.(html?|pdf|docx?|jpe?g|png)$/i;

function validate(file: File) {
  if (file.size > MAX_BYTES) throw new Error(`File exceeds 50MB (${(file.size / 1048576).toFixed(2)}MB)`);
  if (!ALLOWED_EXT.test(file.name)) throw new Error("Invalid file type. Upload PDF, DOC, DOCX, JPG, PNG, or HTML.");
}

/** Find a subsection document category by name (case-insensitive), creating it if absent. */
export async function findOrCreateCategory(subsectionId: string, name: string): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabase
    .from("document_categories").select("id, name").eq("subsection_id", subsectionId).ilike("name", name).limit(1);
  if (existing && existing[0]) return existing[0];
  const { data: cats } = await supabase.from("document_categories").select("name").eq("subsection_id", subsectionId);
  const maxOrder = (cats ?? []).reduce((m, c) => Math.max(m, parseInt((c.name || "").split(" ")[0]) || 0), 0);
  const { data, error } = await supabase
    .from("document_categories").insert({ subsection_id: subsectionId, name, order_index: maxOrder + 1 }).select("id, name").single();
  if (error || !data) throw new Error(`Could not resolve category "${name}": ${error?.message}`);
  return data;
}

/** Upload a COC certificate into a subsection's COC category (per-COC folder, number extracted). */
export async function uploadCocCertificate(opts: { subsectionId: string; cocCategoryId: string; file: File }): Promise<{ id: string; cocNumber: string | null }> {
  const { subsectionId, cocCategoryId, file } = opts;
  validate(file);
  const cocNumber = extractCocNumber(file.name);
  const ts = Date.now();
  const folderKey = sanitize(cocNumber || `${ts}`);
  const path = `${subsectionId}/COC/${folderKey}/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(`Upload failed: ${upErr?.message ?? "no path"}`);
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error: insErr } = await supabase.from("subsection_documents").insert({
    subsection_id: subsectionId, category_id: cocCategoryId, file_name: file.name,
    file_url: urlData.publicUrl, file_size: file.size, uploaded_by: user.id,
    coc_number: cocNumber, coc_status: "Pending",
  }).select("id").single();
  if (insErr || !row) { await supabase.storage.from("documents").remove([up.path]); throw new Error(`Save failed: ${insErr?.message}`); }
  return { id: row.id, cocNumber };
}

/** Upload an evaluation report paired to a COC (same per-COC folder, verdict from filename prefix). */
export async function uploadEvaluationReport(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string; parentCocNumber: string | null; file: File }): Promise<{ id: string }> {
  const { subsectionId, evalCategoryId, parentCocId, parentCocNumber, file } = opts;
  validate(file);
  const ts = Date.now();
  const folderKey = sanitize(parentCocNumber || parentCocId);
  const path = `${subsectionId}/COC/${folderKey}/${ts}-${sanitize(file.name)}`;
  const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
  if (upErr || !up?.path) throw new Error(`Upload failed: ${upErr?.message ?? "no path"}`);
  const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error: insErr } = await supabase.from("subsection_documents").insert({
    subsection_id: subsectionId, category_id: evalCategoryId, parent_document_id: parentCocId,
    file_name: file.name, file_url: urlData.publicUrl, file_size: file.size, uploaded_by: user.id,
    coc_number: parentCocNumber || extractCocNumber(file.name),
    coc_status: extractEvalVerdict(file.name) ?? "Pending",
  }).select("id").single();
  if (insErr || !row) { await supabase.storage.from("documents").remove([up.path]); throw new Error(`Save failed: ${insErr?.message}`); }
  return { id: row.id };
}
```

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` (no new errors vs baseline).
- [ ] **Step 3: Commit** `git add src/lib/coc/uploadCocFiles.ts && git commit -m "feat(coc): shared COC/eval upload lib"`

## Task 2: Pure routing planner

**Files:** Create `src/lib/siteCoc/routeUpload.ts`; Test `src/lib/siteCoc/routeUpload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { classifyCocFile, planRouting } from "./routeUpload";

describe("classifyCocFile", () => {
  it("PASS-/FAIL- prefix => eval", () => {
    expect(classifyCocFile("PASS-B-1612744-X.html")).toBe("eval");
    expect(classifyCocFile("FAIL_B-1.pdf")).toBe("eval");
  });
  it(".html => eval", () => expect(classifyCocFile("B-1612744 report.html")).toBe("eval"));
  it("plain pdf => coc", () => expect(classifyCocFile("B-1612744_I.pdf")).toBe("coc"));
});

describe("planRouting", () => {
  const certs = [
    { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
    { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
    { id: "c3", cert_no_norm: "NM1850896", subsection_id: null },   // unmatched cert (no subsection)
    { id: "c4", cert_no_norm: "B1612744", subsection_id: "u9" },    // duplicate number => ambiguous
  ];
  it("routes a unique match, orders COCs before evals", () => {
    const plan = planRouting([{ name: "PASS-B-1612747-x.html" }, { name: "B-1612747_I.pdf" }], certs.slice(0, 2));
    expect(plan.map(p => p.kind)).toEqual(["coc", "eval"]);
    expect(plan[0]).toMatchObject({ status: "routed", subsectionId: "u2", certRowId: "c2" });
    expect(plan[1]).toMatchObject({ status: "routed", subsectionId: "u2" });
  });
  it("unmatched when no number match", () => {
    const plan = planRouting([{ name: "random.pdf" }], certs);
    expect(plan[0].status).toBe("unmatched");
  });
  it("unmatched when matched cert has no subsection", () => {
    const plan = planRouting([{ name: "NM-1850896.pdf" }], certs);
    expect(plan[0].status).toBe("unmatched");
  });
  it("ambiguous when number resolves to >1 subsection", () => {
    const plan = planRouting([{ name: "B-1612744_I.pdf" }], certs);
    expect(plan[0].status).toBe("ambiguous");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/lib/siteCoc/routeUpload.test.ts`

- [ ] **Step 3: Implement**

```ts
import { extractCocNumber } from "@/lib/cocFilename";
import { normCert } from "./normalize";

export type FileKind = "coc" | "eval";

export function classifyCocFile(fileName: string): FileKind {
  const base = fileName.replace(/^.*[\\/]/, "");
  if (/^(pass|fail)[-_\s]/i.test(base)) return "eval";
  if (/\.html?$/i.test(base)) return "eval";
  return "coc";
}

export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }
export interface RoutePlanItem {
  name: string; kind: FileKind; certNo: string | null;
  subsectionId: string | null; certRowId: string | null;
  status: "routed" | "unmatched" | "ambiguous";
}

export function planRouting(files: { name: string }[], certRows: CertRowLite[]): RoutePlanItem[] {
  const plan: RoutePlanItem[] = files.map(f => {
    const kind = classifyCocFile(f.name);
    const certNo = extractCocNumber(f.name);
    const key = certNo ? normCert(certNo) : "";
    const matches = key ? certRows.filter(r => r.cert_no_norm === key && r.subsection_id) : [];
    if (matches.length === 1) return { name: f.name, kind, certNo, subsectionId: matches[0].subsection_id, certRowId: matches[0].id, status: "routed" };
    if (matches.length === 0) return { name: f.name, kind, certNo, subsectionId: null, certRowId: null, status: "unmatched" };
    return { name: f.name, kind, certNo, subsectionId: null, certRowId: null, status: "ambiguous" };
  });
  return plan.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "coc" ? -1 : 1));
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/routeUpload.ts src/lib/siteCoc/routeUpload.test.ts && git commit -m "feat(site-coc): pure file classify + routing planner"`

## Task 3: Migration — link columns

**Files:** Create `supabase/migrations/20260619140000_coc_cert_document_links.sql`; Modify `src/integrations/supabase/types.ts`

- [ ] **Step 1: Migration**

```sql
-- Link an imported COC certificate row to the actual uploaded files (COC + evaluation report)
-- in the subsection's document store, so the Site COC tab can show attached status + preview.
alter table public.coc_certificates
  add column if not exists coc_document_id uuid references public.subsection_documents(id) on delete set null,
  add column if not exists eval_document_id uuid references public.subsection_documents(id) on delete set null;

notify pgrst, 'reload schema';
```

- [ ] **Step 2: types** — in `coc_certificates` Row/Insert/Update (the block added earlier), add `coc_document_id: string | null` and `eval_document_id: string | null` (optional in Insert/Update); add two Relationship entries to `subsection_documents`.

- [ ] **Step 3: Commit** `git add supabase/migrations/20260619140000_coc_cert_document_links.sql src/integrations/supabase/types.ts && git commit -m "feat(db): coc_certificates document link columns"`

## Task 4: Refactor per-subsection eval upload to the shared lib

**Files:** Modify `src/views/subsection-detail/useSubsectionDetail.ts` (`handleUploadEvaluationReport`, ~791-860)

- [ ] **Step 1:** Add import near the cocFilename import:

```ts
import { uploadEvaluationReport as libUploadEvaluationReport } from "@/lib/coc/uploadCocFiles";
```

- [ ] **Step 2:** Replace the body of `handleUploadEvaluationReport` (keep its signature, `setUploadingFile`, `ensureEvaluationCategory`, toasts) with a delegate:

```ts
  const handleUploadEvaluationReport = async (
    parentCoc: { id: string; coc_number: string | null },
    file: File,
  ): Promise<void> => {
    if (!subsectionId) return;
    try {
      setUploadingFile(true);
      toast.info("Uploading evaluation report...");
      const category = await ensureEvaluationCategory();
      if (!category) throw new Error("Could not resolve the evaluation reports category");
      await libUploadEvaluationReport({
        subsectionId, evalCategoryId: category.id,
        parentCocId: parentCoc.id, parentCocNumber: parentCoc.coc_number, file,
      });
      toast.success("Evaluation report uploaded!");
      fetchSupabaseDocuments();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Error uploading evaluation report:", e);
      toast.error(e?.message || "Failed to upload evaluation report", { duration: 5000 });
    } finally {
      setUploadingFile(false);
    }
  };
```

(The now-unused `extractCocNumber`/`extractEvalVerdict` imports in this file may remain if still used elsewhere; if tsc flags them unused, remove them.)

- [ ] **Step 2b:** Verify whether `extractCocNumber`/`extractEvalVerdict` are still referenced in `useSubsectionDetail.ts` (`grep -n "extractCocNumber\|extractEvalVerdict" src/views/subsection-detail/useSubsectionDetail.ts`). If only the import line remains, delete the import.

- [ ] **Step 3: Typecheck** `npx tsc --noEmit` (no new errors).
- [ ] **Step 4: Commit** `git add src/views/subsection-detail/useSubsectionDetail.ts && git commit -m "refactor(coc): per-subsection eval upload uses shared lib"`

## Task 5: Refactor per-subsection COC upload to the shared lib

**Files:** Modify `src/views/subsection-detail/CocMeteringTab.tsx` (COC upload `onChange`, ~121-209)

- [ ] **Step 1:** Replace the `import { extractCocNumber }` line with:

```ts
import { uploadCocCertificate } from "@/lib/coc/uploadCocFiles";
```

- [ ] **Step 2:** Replace the storage-path + storage-upload + getPublicUrl + getUser + insert block inside the COC `onChange` (from `const timestamp = Date.now();` through the `.select('id').single();` insert and its error check) with a single delegate call. The surrounding validation, `setUploadingFile`, toasts, and `e.target.value=''` reset stay:

```ts
                        setUploadingFile(true);
                        toast.info("Uploading COC document...");
                        await uploadCocCertificate({ subsectionId: subsectionId!, cocCategoryId: cocCategory.id, file });
                        toast.success("COC document uploaded successfully!");
                        setUploadCategoryId(null);
                        setUploadFile(null);
                        fetchSupabaseDocuments();
                        e.target.value = '';
```

(Remove the now-dead local `maxSize`/`allowedTypes` validation if it duplicates the lib's; the lib validates size + extension. Keep the toast UX.)

- [ ] **Step 3: Build** `npm run build` — Expected: success (confirms the per-subsection upload still compiles/behaves).
- [ ] **Step 4: Commit** `git add src/views/subsection-detail/CocMeteringTab.tsx && git commit -m "refactor(coc): per-subsection COC upload uses shared lib"`

---

# PHASE 2 — executor + UI

## Task 6: Bulk executor hook

**Files:** Create `src/views/site-coc/useSiteCocLoad.ts`

- [ ] **Step 1: Implement**

```ts
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { planRouting, type CertRowLite, type RoutePlanItem } from "@/lib/siteCoc/routeUpload";
import { normCert } from "@/lib/siteCoc/normalize";
import { findOrCreateCategory, uploadCocCertificate, uploadEvaluationReport } from "@/lib/coc/uploadCocFiles";

export interface LoadResult {
  routedCoc: number; routedEval: number;
  unmatched: string[]; ambiguous: string[]; needsCoc: string[]; failed: string[];
}

export function useSiteCocLoad(siteId: string | undefined, onDone: () => void) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoadResult | null>(null);

  const load = async (files: File[]) => {
    if (!siteId || !files.length) return;
    setLoading(true);
    setResult(null);
    const res: LoadResult = { routedCoc: 0, routedEval: 0, unmatched: [], ambiguous: [], needsCoc: [], failed: [] };
    try {
      const { data: certs } = await supabase
        .from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId);
      const certRows: CertRowLite[] = (certs ?? []) as CertRowLite[];
      const byName = new Map(files.map(f => [f.name, f]));
      const plan = planRouting(files.map(f => ({ name: f.name })), certRows);

      const cocDocByKey = new Map<string, string>(); // `${subsectionId}|${normCert}` -> cocDocId

      for (const item of plan) {
        const file = byName.get(item.name);
        if (!file) continue;
        if (item.status === "unmatched") { res.unmatched.push(item.name); continue; }
        if (item.status === "ambiguous") { res.ambiguous.push(item.name); continue; }
        const key = item.certNo ? normCert(item.certNo) : "";
        const mapKey = `${item.subsectionId}|${key}`;
        try {
          if (item.kind === "coc") {
            const cat = await findOrCreateCategory(item.subsectionId!, "01 COC");
            const { id } = await uploadCocCertificate({ subsectionId: item.subsectionId!, cocCategoryId: cat.id, file });
            cocDocByKey.set(mapKey, id);
            if (item.certRowId) await supabase.from("coc_certificates").update({ coc_document_id: id }).eq("id", item.certRowId);
            res.routedCoc++;
          } else {
            let parentId = cocDocByKey.get(mapKey);
            if (!parentId) {
              const { data: existing } = await supabase
                .from("subsection_documents").select("id")
                .eq("subsection_id", item.subsectionId!).eq("coc_number", item.certNo ?? "").is("parent_document_id", null).limit(1);
              parentId = existing?.[0]?.id;
            }
            if (!parentId) { res.needsCoc.push(item.name); continue; }
            const evalCat = await findOrCreateCategory(item.subsectionId!, "07 COC Evaluation Reports");
            const { id } = await uploadEvaluationReport({ subsectionId: item.subsectionId!, evalCategoryId: evalCat.id, parentCocId: parentId, parentCocNumber: item.certNo, file });
            if (item.certRowId) await supabase.from("coc_certificates").update({ eval_document_id: id }).eq("id", item.certRowId);
            res.routedEval++;
          }
        } catch (e: any) {
          if (process.env.NODE_ENV === "development") console.error("route failed", item.name, e);
          res.failed.push(item.name);
        }
      }
      setResult(res);
      toast.success(`Loaded ${res.routedCoc} COC + ${res.routedEval} eval files (${res.unmatched.length + res.ambiguous.length + res.needsCoc.length + res.failed.length} need attention).`);
      onDone();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("Site COC load failed:", e);
      toast.error(e?.message || "Load failed", { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, load, plan: planRouting };
}
```

(Note: `plan` is re-exported only for the assign-to-shop fallback in Task 7; remove if Task 7 doesn't need it.)

- [ ] **Step 2: Typecheck + Commit**

```bash
npx tsc --noEmit
git add src/views/site-coc/useSiteCocLoad.ts
git commit -m "feat(site-coc): bulk file-load executor"
```

## Task 7: Dropzone + results card

**Files:** Create `src/views/site-coc/SiteCocLoadCard.tsx`; Modify `src/views/site-coc/SiteCocTab.tsx`

- [ ] **Step 1: Implement the card**

```tsx
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { useSiteCocLoad } from "./useSiteCocLoad";

export function SiteCocLoadCard({ siteId, onDone }: { siteId: string | undefined; onDone: () => void }) {
  const { loading, result, load } = useSiteCocLoad(siteId, onDone);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handleFiles = (list: FileList | null) => { if (list && list.length) load(Array.from(list)); };

  return (
    <Card>
      <CardHeader><CardTitle>Load COC files & evaluation reports</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "bg-accent border-primary" : "bg-muted/20 hover:bg-muted/40"}`}
        >
          {loading
            ? <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Routing files…</span>
            : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /> Drop COC PDFs + evaluation reports, or click to select. Auto-routed by COC number to the right shop.</span>}
          <input ref={inputRef} type="file" multiple className="hidden"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm"
            onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {result && (
          <div className="space-y-2 text-sm">
            <p className="font-medium">Routed {result.routedCoc} COC + {result.routedEval} evaluation files.</p>
            {[["Unmatched (no cert no. match)", result.unmatched],
              ["Ambiguous (number maps to >1 shop)", result.ambiguous],
              ["Needs its COC first", result.needsCoc],
              ["Failed", result.failed]].map(([label, items]) => (items as string[]).length > 0 && (
              <div key={label as string}>
                <p className="text-xs font-medium text-amber-700">{label as string} ({(items as string[]).length})</p>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {(items as string[]).map(n => <li key={n} className="truncate">{n}</li>)}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Tip: unmatched files usually mean the shop isn't matched to a subsection yet (resolve on the Schedule tab) or the COC number isn't in the filename.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

> Scope note: the spec mentioned a per-file assign-to-shop control for leftovers. v1 lists leftovers with guidance (above). If you want inline assign-to-shop, add a subsection `Select` per leftover that calls a single-file variant of the executor — defer unless requested (logged here so it isn't silently dropped).

- [ ] **Step 2:** Mount it in `SiteCocTab.tsx` under the Import card:

```tsx
import { SiteCocLoadCard } from "./SiteCocLoadCard";
// ...inside the returned JSX, right after the closing </Card> of the import card:
      <SiteCocLoadCard siteId={siteId} onDone={refetch} />
```

- [ ] **Step 3: Build + Commit**

```bash
npm run build
git add src/views/site-coc/SiteCocLoadCard.tsx src/views/site-coc/SiteCocTab.tsx
git commit -m "feat(site-coc): bulk file-load dropzone + results"
```

## Task 8: Attached column on Certificates sub-tab

**Files:** Modify `src/views/site-coc/useSiteCoc.ts`, `src/views/site-coc/CertificatesSubTab.tsx`

- [ ] **Step 1:** In `useSiteCoc.ts`, add to `CocCertRow`: `coc_document_id: string | null; eval_document_id: string | null;` (the `select("*")` already returns them).

- [ ] **Step 2:** In `CertificatesSubTab.tsx`, add an **Attached** header and cell. Add to the header row (before "Source file"):

```tsx
            <TableHead>Attached</TableHead>
```

And the cell (before the source-file cell):

```tsx
                <TableCell className="whitespace-nowrap">
                  <span className="flex gap-1">
                    {r.coc_document_id ? <StatusPill tone="green" label="COC ✓" /> : <span className="text-xs text-muted-foreground/60">COC —</span>}
                    {r.eval_document_id ? <StatusPill tone="green" label="Eval ✓" /> : <span className="text-xs text-muted-foreground/60">Eval —</span>}
                  </span>
                </TableCell>
```

`StatusPill` is already imported in `CertificatesSubTab.tsx` from the legibility pass.

- [ ] **Step 3: Build + Commit**

```bash
npm run build
git add src/views/site-coc/useSiteCoc.ts src/views/site-coc/CertificatesSubTab.tsx
git commit -m "feat(site-coc): attached COC/eval status on certificates sub-tab"
```

## Task 9: Full verification

- [ ] `npx vitest run` — all pass (incl. new routeUpload tests).
- [ ] `npm run build` — succeeds.

---

# DEPLOY

## Task 10: Migrate + deploy

- [ ] **Step 1:** Apply `20260619140000_coc_cert_document_links.sql` to prod via Management API (PAT) — expect HTTP 201. Verify the two columns: `select column_name from information_schema.columns where table_name='coc_certificates' and column_name in ('coc_document_id','eval_document_id');` returns 2 rows.
- [ ] **Step 2:** PostgREST probe `GET /rest/v1/coc_certificates?select=id,coc_document_id&limit=1` → 200 (not 42703).
- [ ] **Step 3:** Merge to `main`, push (Vercel prod). Confirm Ready.
- [ ] **Step 4:** Runtime verify on a site with an imported schedule: drop the YARONA COC PDFs + eval reports → routed counts correct; files appear in the matched subsections' COC tabs; Attached column shows COC ✓ / Eval ✓; leftovers listed. (Auth — user-run or browser-driven.)

---

## Self-Review

**Spec coverage:**
- §4 flow (classify→extract→match→route→link→report) → Tasks 2 (classify/plan) + 6 (executor) + 7 (report). ✓
- §5 schema link columns → Task 3. ✓
- §6 shared lib + both callers → Tasks 1, 4, 5. ✓
- §7 routing engine (pure plan + impure executor) → Tasks 2, 6. ✓
- §8 dropzone + Attached column → Tasks 7, 8. ✓
- §8 assign-to-shop leftovers → Task 7 lists leftovers + scope note (deferred inline assign, logged not silently dropped). ✓
- §10 testing → Tasks 2, 9. ✓

**Placeholder scan:** none — concrete code/commands throughout. The deferred inline assign-to-shop is explicitly logged in Task 7 (not a silent omission).

**Type consistency:** `uploadCocCertificate`/`uploadEvaluationReport`/`findOrCreateCategory` signatures identical across Tasks 1, 4, 5, 6. `CertRowLite`/`RoutePlanItem`/`classifyCocFile`/`planRouting` consistent Tasks 2↔6. `coc_document_id`/`eval_document_id` consistent across Tasks 3, 6, 8. `LoadResult` fields consistent Tasks 6↔7.
