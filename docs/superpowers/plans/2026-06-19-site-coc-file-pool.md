# Site COC File Pool + Assign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fragile drop-and-auto-route with: upload every file to a per-site pool (never rejected), auto-assign exact register matches, and let the user assign the rest from a visible pool — with the tables highlighting coverage.

**Architecture:** New `coc_file_pool` table holds uploaded-but-unassigned files. The shared upload lib is refactored so a `subsection_documents` row can be inserted from an existing `file_url` (reference-in-place). A pure planner picks exact auto-assigns; a hook does upload-to-pool, auto-assign, manual assign, and delete. The dropzone card becomes a pool panel.

**Tech Stack:** React + TS, Supabase, Vitest, shadcn.

**Spec:** `docs/superpowers/specs/2026-06-19-site-coc-file-pool-design.md`

---

## File Structure
- `supabase/migrations/20260619150000_coc_file_pool.sql` (new) — table + RLS.
- `src/integrations/supabase/types.ts` (modify) — `coc_file_pool`.
- `src/lib/coc/uploadCocFiles.ts` (modify) — extract `insertCocCertificateDoc` / `insertEvaluationReportDoc`.
- `src/lib/siteCoc/poolAssign.ts` (new) — pure `planPoolAutoAssign`.
- `src/lib/siteCoc/poolAssign.test.ts` (new) — tests.
- `src/views/site-coc/useSiteCocPool.ts` (new) — pool fetch + upload + auto-assign + assign + delete.
- `src/views/site-coc/SiteCocLoadCard.tsx` (rewrite) — dropzone→pool + pool panel.
- `src/views/site-coc/SiteCocTab.tsx` (modify) — pass subsections; refetch wiring.
- `src/views/site-coc/useSiteCocLoad.ts` (delete) — replaced.

---

## Task 1: Migration + types

**Files:** Create `supabase/migrations/20260619150000_coc_file_pool.sql`; Modify `src/integrations/supabase/types.ts`

- [ ] **Step 1: Migration**

```sql
create table if not exists public.coc_file_pool (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size int,
  detected_cert_no text,
  detected_kind text,
  status text not null default 'pending',
  assigned_subsection_id uuid references public.subsections(id) on delete set null,
  assigned_document_id uuid references public.subsection_documents(id) on delete set null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_coc_file_pool_site on public.coc_file_pool(site_id);
alter table public.coc_file_pool enable row level security;
create policy "auth read coc_file_pool"   on public.coc_file_pool for select to authenticated using (true);
create policy "auth insert coc_file_pool" on public.coc_file_pool for insert to authenticated with check (true);
create policy "auth update coc_file_pool" on public.coc_file_pool for update to authenticated using (true) with check (true);
create policy "auth delete coc_file_pool" on public.coc_file_pool for delete to authenticated using (true);
notify pgrst, 'reload schema';
```

- [ ] **Step 2: types** — add a `coc_file_pool` block to `public.Tables` in `types.ts` with Row/Insert/Update covering every column (uuid/text→string, int→number, status string), Insert requires `site_id, file_name, file_url`. (Relationships optional.)

- [ ] **Step 3: Commit** `git add supabase/migrations/20260619150000_coc_file_pool.sql src/integrations/supabase/types.ts && git commit -m "feat(db): coc_file_pool table"`

## Task 2: Lib — insert-from-existing-url

**Files:** Modify `src/lib/coc/uploadCocFiles.ts`

- [ ] **Step 1:** Add two insert helpers and refactor the upload functions to use them. Append the inserts and edit `uploadCocCertificate`/`uploadEvaluationReport` to delegate:

```ts
/** Insert a COC certificate document row from an already-stored file (no upload). */
export async function insertCocCertificateDoc(opts: { subsectionId: string; cocCategoryId: string; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null }): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error } = await supabase.from("subsection_documents").insert({
    subsection_id: opts.subsectionId, category_id: opts.cocCategoryId, file_name: opts.fileName,
    file_url: opts.fileUrl, file_size: opts.fileSize, uploaded_by: user.id,
    coc_number: opts.cocNumber, coc_status: "Pending",
  }).select("id").single();
  if (error || !row) throw new Error(`Save failed: ${error?.message}`);
  return { id: row.id };
}

/** Insert an evaluation-report document row from an already-stored file (no upload). */
export async function insertEvaluationReportDoc(opts: { subsectionId: string; evalCategoryId: string; parentCocId: string | null; fileName: string; fileUrl: string; fileSize: number | null; cocNumber: string | null; verdict: string | null }): Promise<{ id: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: row, error } = await supabase.from("subsection_documents").insert({
    subsection_id: opts.subsectionId, category_id: opts.evalCategoryId, parent_document_id: opts.parentCocId,
    file_name: opts.fileName, file_url: opts.fileUrl, file_size: opts.fileSize, uploaded_by: user.id,
    coc_number: opts.cocNumber, coc_status: opts.verdict ?? "Pending",
  }).select("id").single();
  if (error || !row) throw new Error(`Save failed: ${error?.message}`);
  return { id: row.id };
}
```

Then in `uploadCocCertificate`, replace the final insert block with `return insertCocCertificateDoc({ subsectionId, cocCategoryId, fileName: file.name, fileUrl: urlData.publicUrl, fileSize: file.size, cocNumber }).then(r => ({ id: r.id, cocNumber }))` (keep blob-cleanup on its throw via try/catch). And `uploadEvaluationReport` delegate to `insertEvaluationReportDoc({ ..., parentCocId, fileName: file.name, fileUrl: urlData.publicUrl, fileSize: file.size, cocNumber: parentCocNumber || extractCocNumber(file.name), verdict: extractEvalVerdict(file.name) })`. Preserve the existing remove-blob-on-insert-failure behavior by wrapping the insert call in try/catch that removes `up.path` then rethrows.

- [ ] **Step 2: Typecheck** `npx tsc --noEmit` (no new errors).
- [ ] **Step 3: Commit** `git add src/lib/coc/uploadCocFiles.ts && git commit -m "refactor(coc): separable insert-from-url helpers in upload lib"`

## Task 3: Pure pool auto-assign planner

**Files:** Create `src/lib/siteCoc/poolAssign.ts`; Test `src/lib/siteCoc/poolAssign.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { planPoolAutoAssign } from "./poolAssign";

const certs = [
  { id: "c1", cert_no_norm: "B1612744", subsection_id: "u1" },
  { id: "c2", cert_no_norm: "B1612747", subsection_id: "u2" },
  { id: "c3", cert_no_norm: "DUP", subsection_id: "u3" },
  { id: "c4", cert_no_norm: "DUP", subsection_id: "u4" },   // ambiguous
  { id: "c5", cert_no_norm: "NOSUB", subsection_id: null }, // no subsection
];

describe("planPoolAutoAssign", () => {
  it("auto-assigns exact unique matches with detected kind", () => {
    const out = planPoolAutoAssign([
      { id: "p1", detected_cert_no: "B-1612744", detected_kind: "coc" },
      { id: "p2", detected_cert_no: "B 1612747", detected_kind: "eval" },
    ], certs);
    expect(out).toEqual([
      { poolId: "p1", subsectionId: "u1", kind: "coc" },
      { poolId: "p2", subsectionId: "u2", kind: "eval" },
    ]);
  });
  it("skips ambiguous, no-subsection, and no-number files", () => {
    const out = planPoolAutoAssign([
      { id: "p3", detected_cert_no: "DUP", detected_kind: "coc" },
      { id: "p4", detected_cert_no: "NOSUB", detected_kind: "coc" },
      { id: "p5", detected_cert_no: null, detected_kind: "coc" },
    ], certs);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/lib/siteCoc/poolAssign.test.ts`

- [ ] **Step 3: Implement**

```ts
import { normCert } from "./normalize";

export interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null; }
export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }
export interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval"; }

export function planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[] {
  const out: AutoAssign[] = [];
  for (const f of files) {
    const key = f.detected_cert_no ? normCert(f.detected_cert_no) : "";
    if (!key) continue;
    const matches = certRows.filter(c => c.cert_no_norm === key && c.subsection_id);
    if (matches.length !== 1) continue;
    out.push({ poolId: f.id, subsectionId: matches[0].subsection_id as string, kind: f.detected_kind === "eval" ? "eval" : "coc" });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `git add src/lib/siteCoc/poolAssign.ts src/lib/siteCoc/poolAssign.test.ts && git commit -m "feat(site-coc): pure pool auto-assign planner"`

## Task 4: Pool hook

**Files:** Create `src/views/site-coc/useSiteCocPool.ts`

- [ ] **Step 1: Implement**

```ts
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractCocNumber, extractEvalVerdict } from "@/lib/cocFilename";
import { classifyCocFile } from "@/lib/siteCoc/routeUpload";
import { planPoolAutoAssign, type CertRowLite } from "@/lib/siteCoc/poolAssign";
import { findOrCreateCategory, insertCocCertificateDoc, insertEvaluationReportDoc } from "@/lib/coc/uploadCocFiles";

export interface PoolFile {
  id: string; file_name: string; file_url: string; file_size: number | null;
  detected_cert_no: string | null; detected_kind: string | null; status: string;
}
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9.-]/g, "_");

export function useSiteCocPool(siteId: string | undefined, onAssigned: () => void) {
  const [pending, setPending] = useState<PoolFile[]>([]);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async () => {
    if (!siteId) return;
    const { data } = await supabase.from("coc_file_pool").select("*").eq("site_id", siteId).eq("status", "pending").order("created_at");
    setPending((data ?? []) as unknown as PoolFile[]);
  }, [siteId]);

  useEffect(() => { refetch(); }, [refetch]);

  // Insert a subsection_documents row referencing an already-stored pool file, then mark assigned.
  const assign = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    if (!siteId) return;
    const certNo = file.detected_cert_no;
    let docId: string;
    if (kind === "coc") {
      const cat = await findOrCreateCategory(subsectionId, "01 COC");
      docId = (await insertCocCertificateDoc({ subsectionId, cocCategoryId: cat.id, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo })).id;
      if (certNo) await supabase.from("coc_certificates").update({ coc_document_id: docId }).eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certNo.toUpperCase().replace(/[\s-]+/g, ""));
    } else {
      const evalCat = await findOrCreateCategory(subsectionId, "07 COC Evaluation Reports");
      let parentId: string | null = null;
      if (certNo) {
        const { data: p } = await supabase.from("subsection_documents").select("id").eq("subsection_id", subsectionId).eq("coc_number", certNo).is("parent_document_id", null).limit(1);
        parentId = p?.[0]?.id ?? null;
      }
      docId = (await insertEvaluationReportDoc({ subsectionId, evalCategoryId: evalCat.id, parentCocId: parentId, fileName: file.file_name, fileUrl: file.file_url, fileSize: file.file_size, cocNumber: certNo, verdict: extractEvalVerdict(file.file_name) })).id;
      if (certNo) await supabase.from("coc_certificates").update({ eval_document_id: docId }).eq("site_id", siteId).eq("subsection_id", subsectionId).eq("cert_no_norm", certNo.toUpperCase().replace(/[\s-]+/g, ""));
    }
    await supabase.from("coc_file_pool").update({ status: "assigned", assigned_subsection_id: subsectionId, assigned_document_id: docId }).eq("id", file.id);
  }, [siteId]);

  const upload = useCallback(async (files: File[]) => {
    if (!siteId || !files.length) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const inserted: PoolFile[] = [];
      for (const file of files) {
        const ts = Date.now();
        const path = `${siteId}/_pool/${ts}-${sanitize(file.name)}`;
        const { data: up, error: upErr } = await supabase.storage.from("documents").upload(path, file);
        if (upErr || !up?.path) { toast.error(`Upload failed: ${file.name}`); continue; }
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(up.path);
        const { data: row, error } = await supabase.from("coc_file_pool").insert({
          site_id: siteId, file_name: file.name, file_url: urlData.publicUrl, file_size: file.size,
          detected_cert_no: extractCocNumber(file.name), detected_kind: classifyCocFile(file.name),
          uploaded_by: user?.id ?? null,
        }).select("*").single();
        if (!error && row) inserted.push(row as unknown as PoolFile);
      }
      // Auto-assign exact matches.
      const { data: certs } = await supabase.from("coc_certificates").select("id, cert_no_norm, subsection_id").eq("site_id", siteId);
      const plan = planPoolAutoAssign(inserted, (certs ?? []) as CertRowLite[]);
      const planById = new Map(inserted.map(f => [f.id, f]));
      let auto = 0;
      for (const a of plan) { const f = planById.get(a.poolId); if (f) { try { await assign(f, a.subsectionId, a.kind); auto++; } catch (e) { if (process.env.NODE_ENV === "development") console.error("auto-assign failed", f.file_name, e); } } }
      toast.success(`Uploaded ${inserted.length} file(s); auto-assigned ${auto}. ${inserted.length - auto} awaiting assignment.`);
      await refetch(); onAssigned();
    } catch (e: any) {
      if (process.env.NODE_ENV === "development") console.error("pool upload failed", e);
      toast.error(e?.message || "Upload failed", { duration: 6000 });
    } finally { setBusy(false); }
  }, [siteId, assign, refetch, onAssigned]);

  const assignManual = useCallback(async (file: PoolFile, subsectionId: string, kind: "coc" | "eval") => {
    setBusy(true);
    try { await assign(file, subsectionId, kind); toast.success(`Assigned ${file.file_name}`); await refetch(); onAssigned(); }
    catch (e: any) { toast.error(e?.message || "Assign failed"); }
    finally { setBusy(false); }
  }, [assign, refetch, onAssigned]);

  const remove = useCallback(async (file: PoolFile) => {
    try {
      const u = new URL(file.file_url); const parts = u.pathname.split("/");
      const p = parts.slice(parts.indexOf("documents") + 1).join("/");
      if (p) await supabase.storage.from("documents").remove([p]);
    } catch { /* ignore */ }
    await supabase.from("coc_file_pool").delete().eq("id", file.id);
    await refetch();
  }, [refetch]);

  return { pending, busy, upload, assignManual, remove, refetch };
}
```

- [ ] **Step 2: Typecheck + Commit** `npx tsc --noEmit && git add src/views/site-coc/useSiteCocPool.ts && git commit -m "feat(site-coc): pool hook (upload, auto-assign, assign, delete)"`

## Task 5: Pool card UI (replace the load card)

**Files:** Rewrite `src/views/site-coc/SiteCocLoadCard.tsx`; Delete `src/views/site-coc/useSiteCocLoad.ts`

- [ ] **Step 1: Rewrite the card** — dropzone uploads to pool; below it a pending-pool table with per-file COC/eval toggle, subsection dropdown, Assign, Delete.

```tsx
import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Trash2 } from "lucide-react";
import { useSiteCocPool, type PoolFile } from "./useSiteCocPool";
import type { SubsectionOption } from "./useSiteCoc";

function PoolRow({ file, subsections, onAssign, onDelete, busy }: { file: PoolFile; subsections: SubsectionOption[]; onAssign: (f: PoolFile, sub: string, kind: "coc" | "eval") => void; onDelete: (f: PoolFile) => void; busy: boolean; }) {
  const [kind, setKind] = useState<"coc" | "eval">(file.detected_kind === "eval" ? "eval" : "coc");
  const [sub, setSub] = useState<string>("");
  return (
    <tr className="border-b">
      <td className="p-2 text-xs max-w-[18rem] truncate" title={file.file_name}>{file.file_name}</td>
      <td className="p-2 font-mono text-xs">{file.detected_cert_no ?? "—"}</td>
      <td className="p-2">
        <Select value={kind} onValueChange={(v) => setKind(v as "coc" | "eval")}>
          <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="coc">COC</SelectItem><SelectItem value="eval">Eval</SelectItem></SelectContent>
        </Select>
      </td>
      <td className="p-2">
        <Select value={sub} onValueChange={setSub}>
          <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Choose subsection…" /></SelectTrigger>
          <SelectContent>
            {subsections.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.tenant_name && s.tenant_name !== s.name ? ` · ${s.tenant_name}` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <Button size="sm" disabled={!sub || busy} onClick={() => onAssign(file, sub, kind)}>Assign</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(file)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </td>
    </tr>
  );
}

export function SiteCocLoadCard({ siteId, subsections, onDone }: { siteId: string | undefined; subsections: SubsectionOption[]; onDone: () => void }) {
  const { pending, busy, upload, assignManual, remove } = useSiteCocPool(siteId, onDone);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const handleFiles = (l: FileList | null) => { if (l && l.length) upload(Array.from(l)); };

  return (
    <Card>
      <CardHeader><CardTitle>Load COC files & evaluation reports</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${drag ? "bg-accent border-primary" : "bg-muted/20 hover:bg-muted/40"}`}>
          {busy
            ? <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Working…</span>
            : <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Upload className="h-4 w-4" /> Drop all COC PDFs + evaluation reports. They upload to a pool; exact register matches auto-assign, the rest you assign below.</span>}
          <input ref={inputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.html,.htm"
            onChange={e => { handleFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }} />
        </div>

        {pending.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-medium text-amber-700">{pending.length} file(s) awaiting assignment</p>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left bg-muted/40">
                  {["File","Cert no","Type","Subsection",""].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {pending.map(f => <PoolRow key={f.id} file={f} subsections={subsections} onAssign={assignManual} onDelete={remove} busy={busy} />)}
                </tbody>
              </table>
            </div>
          </div>
        ) : <p className="text-xs text-muted-foreground">No files awaiting assignment.</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Delete** `src/views/site-coc/useSiteCocLoad.ts` (`git rm src/views/site-coc/useSiteCocLoad.ts`).

- [ ] **Step 3: Commit** `git add -A src/views/site-coc/SiteCocLoadCard.tsx && git commit -m "feat(site-coc): pool panel replaces auto-route load card"`

## Task 6: Wire SiteCocTab

**Files:** Modify `src/views/site-coc/SiteCocTab.tsx`

- [ ] **Step 1:** Pass `subsections` to the load card:

```tsx
      <SiteCocLoadCard siteId={siteId} subsections={subsections} onDone={refetch} />
```

(`subsections` is already destructured from `useSiteCoc`.)

- [ ] **Step 2: Build** `npm run build` — Expected: success.
- [ ] **Step 3: Commit** `git add src/views/site-coc/SiteCocTab.tsx && git commit -m "feat(site-coc): pass subsections to pool card"`

## Task 7: Verify

- [ ] `npx vitest run` — all pass (incl. poolAssign).
- [ ] `npm run build` — succeeds.

## Task 8: Deploy

- [ ] Apply `20260619150000_coc_file_pool.sql` to prod via Management API (PAT) — expect 201; verify table exists; PostgREST probe `GET /rest/v1/coc_file_pool?select=id&limit=1` → 200.
- [ ] Merge `feat/site-coc-file-pool` → `main`, push; confirm Vercel Ready.
- [ ] Runtime: drop the YARONA folder → all files appear (assigned or pending); exact matches auto-assign; assign the rest from the pool; Certificates Attached column fills.

---

## Self-Review
- Spec "upload to pool" → Task 4 `upload`. ✓
- "auto-assign exact" → Task 3 planner + Task 4 usage. ✓
- "assign (reference-in-place)" → Task 2 insert helpers + Task 4 `assign`. ✓
- "pool panel + delete" → Task 5. ✓
- "schema" → Task 1. ✓
- "Certificates Attached kept" → unchanged (already present). ✓
- Schedule attached indicators (spec UI) → NOT in this plan; the pool badge + Certificates Attached + the existing coverage rows cover visibility for v1. Logged as a deliberate deferral (avoids touching ScheduleSubTab again this cycle).
- Placeholders: none. Types: `PoolFile`/`PoolFileLite`/`CertRowLite`/`AutoAssign` consistent Tasks 3↔4; `insertCocCertificateDoc`/`insertEvaluationReportDoc` signatures consistent Tasks 2↔4; `SubsectionOption` reused Task 5/6.
